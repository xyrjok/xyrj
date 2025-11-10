/**
 * Cloudflare Worker Faka Backend (MPA 最终完整版 - 含支付宝验签)
 */

// === 工具函数 ===
const jsonRes = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } });
const errRes = (msg, status = 400) => jsonRes({ error: msg }, status);
const time = () => Math.floor(Date.now() / 1000);
const uuid = () => crypto.randomUUID().replace(/-/g, '');

// === 支付宝签名核心逻辑 (Web Crypto API) ===
async function signAlipay(params, privateKeyPem) {
    const sortedParams = Object.keys(params).filter(k => k !== 'sign' && params[k]).sort().map(k => `${k}=${typeof params[k] === 'object' ? JSON.stringify(params[k]) : params[k]}`).join('&');
    let pemContents = privateKeyPem.replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\s+|\n/g, '');
    const binaryDer = Uint8Array.from(atob(pemContents), c => c.charCodeAt(0));
    const key = await crypto.subtle.importKey("pkcs8", binaryDer.buffer, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
    const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(sortedParams));
    return btoa(String.fromCharCode(...new Uint8Array(signature)));
}

// === 支付宝验签核心逻辑 (新增) ===
async function verifyAlipaySignature(params, alipayPublicKeyPem) {
    const sign = params.get('sign');
    if (!sign) return false;
    
    // 1. 构建待签名字符串 (剔除 sign 和 sign_type)
    const sortedKeys = Array.from(params.keys()).filter(k => k !== 'sign' && k !== 'sign_type').sort();
    const preSignStr = sortedKeys.map(k => {
        let value = params.get(k);
        // 对特定字段进行解码，防止验签失败 (支付宝返回有时会带编码)
        if (k === 'fund_bill_list' || k === 'voucher_detail_list') {
             value = value.replace(/&quot;/g, '"');
        }
        return `${k}=${decodeURIComponent(value)}`; 
    }).join('&');

    // 2. 导入支付宝公钥
    let pemContents = alipayPublicKeyPem.replace(/-----BEGIN PUBLIC KEY-----|-----END PUBLIC KEY-----|\s+|\n/g, '');
    const binaryDer = Uint8Array.from(atob(pemContents), c => c.charCodeAt(0));
    const key = await crypto.subtle.importKey("spki", binaryDer.buffer, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);

    // 3. 验证签名
    const signature = Uint8Array.from(atob(sign), c => c.charCodeAt(0));
    return await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, signature, new TextEncoder().encode(preSignStr));
}

export default {
    async fetch(request, env, ctx) {
        const url = new URL(request.url);
        const path = url.pathname;

        // === 1. API 路由处理 (最高优先级) ===
        if (path.startsWith('/api/')) {
            return handleApi(request, env, url);
        }

        // === 2. 强制接管根路由 (MPA 核心) ===
        if (path === '/') {
            return env.ASSETS.fetch(new Request(new URL(`${url.origin}/themes/default/index.html`), request));
        }

        // === 3. HTML 页面内部重写 ===
        if (path.endsWith('.html') && !path.startsWith('/admin/') && !path.startsWith('/themes/')) {
             return env.ASSETS.fetch(new Request(new URL(`${url.origin}/themes/default${path}`), request));
        }

        // === 4. 默认回退 ===
        return env.ASSETS.fetch(request);
    }
};

async function handleApi(request, env, url) {
    const method = request.method;
    const path = url.pathname;

    try {
        // --- 管理员 API ---
        if (path.startsWith('/api/admin/')) {
            const authHeader = request.headers.get('Authorization');
            if (path !== '/api/admin/login' && (!authHeader || !authHeader.endsWith(env.ADMIN_TOKEN))) {
                return errRes('Unauthorized', 401);
            }

            if (path === '/api/admin/login' && method === 'POST') {
                const { user, pass } = await request.json();
                if (user === env.ADMIN_USER && pass === env.ADMIN_PASS) return jsonRes({ token: env.ADMIN_TOKEN });
                return errRes('登录失败', 401);
            }

            if (path === '/api/admin/dashboard') {
                 const today = new Date().setHours(0,0,0,0) / 1000;
                 return jsonRes({
                     orders_today: (await env.MY_XYRJ.prepare("SELECT COUNT(*) as c FROM orders WHERE created_at >= ?").bind(today).first()).c,
                     income_today: (await env.MY_XYRJ.prepare("SELECT SUM(total_amount) as s FROM orders WHERE status = 1 AND paid_at >= ?").bind(today).first()).s || 0,
                     cards_unsold: (await env.MY_XYRJ.prepare("SELECT COUNT(*) as c FROM cards WHERE status = 0").first()).c,
                 });
            }

            if (path === '/api/admin/products/list') {
                const products = await env.MY_XYRJ.prepare("SELECT * FROM products ORDER BY sort DESC").all();
                for (let p of products.results) {
                    p.variants = (await env.MY_XYRJ.prepare("SELECT * FROM variants WHERE product_id = ?").bind(p.id).all()).results;
                }
                return jsonRes(products.results);
            }

            if (path === '/api/admin/product/save' && method === 'POST') {
                const data = await request.json();
                let productId = data.id;
                if (productId) {
                    await env.MY_XYRJ.prepare("UPDATE products SET name=?, description=?, sort=?, active=? WHERE id=?")
                        .bind(data.name, data.description, data.sort, data.active, productId).run();
                } else {
                     const res = await env.MY_XYRJ.prepare("INSERT INTO products (name, description, sort, active, created_at) VALUES (?, ?, ?, ?, ?)")
                        .bind(data.name, data.description, data.sort, data.active, time()).run();
                     productId = res.meta.last_row_id;
                }
                if (data.variants) {
                     if(data.id) await env.MY_XYRJ.prepare("DELETE FROM variants WHERE product_id=?").bind(productId).run();
                     const stmt = env.MY_XYRJ.prepare(`INSERT INTO variants (product_id, name, price, stock, color, image_url, wholesale_config, custom_markup, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`);
                     const batch = data.variants.map(v => stmt.bind(productId, v.name, v.price, v.stock || 0, v.color || null, v.image_url || null, v.wholesale_config ? JSON.stringify(v.wholesale_config) : null, v.custom_markup || 0, time()));
                     await env.MY_XYRJ.batch(batch);
                }
                return jsonRes({ success: true });
            }

            if (path === '/api/admin/cards/import' && method === 'POST') {
                const { variant_id, content } = await request.json();
                const cards = content.split('\n').filter(c => c.trim()).map(c => c.trim());
                if (cards.length > 0) {
                    const stmt = env.MY_XYRJ.prepare("INSERT INTO cards (variant_id, content, status, created_at) VALUES (?, ?, 0, ?)");
                    await env.MY_XYRJ.batch(cards.map(c => stmt.bind(variant_id, c, time())));
                    await env.MY_XYRJ.prepare("UPDATE variants SET stock = stock + ? WHERE id = ?").bind(cards.length, variant_id).run();
                }
                return jsonRes({ imported: cards.length });
            }

            if (path === '/api/admin/gateways/save' && method === 'POST') {
                 const data = await request.json();
                 // 确保 config 中包含 app_id, private_key, alipay_public_key
                 await env.MY_XYRJ.prepare("DELETE FROM pay_gateways WHERE type='alipay_f2f'").run();
                 await env.MY_XYRJ.prepare("INSERT INTO pay_gateways (name, type, config, active) VALUES (?, ?, ?, ?)")
                    .bind('支付宝当面付', 'alipay_f2f', JSON.stringify(data.config), 1).run();
                 return jsonRes({success: true});
            }

            // 获取当前支付配置 (用于回显)
            if (path === '/api/admin/gateways/get') {
                const gateway = await env.MY_XYRJ.prepare("SELECT config FROM pay_gateways WHERE type='alipay_f2f'").first();
                return jsonRes(gateway ? JSON.parse(gateway.config) : {});
            }
        }

        // --- 公开 API ---
        if (path === '/api/shop/config') {
             const res = await env.MY_XYRJ.prepare("SELECT * FROM site_config").all();
             const config = {}; res.results.forEach(r => config[r.key] = r.value);
             return jsonRes(config);
        }

        if (path === '/api/shop/products') {
            const res = await env.MY_XYRJ.prepare("SELECT * FROM products WHERE active=1 ORDER BY sort DESC").all();
            for(let p of res.results) p.variants = (await env.MY_XYRJ.prepare("SELECT * FROM variants WHERE product_id=?").bind(p.id).all()).results;
            return jsonRes(res.results);
        }

        if (path === '/api/shop/product/detail') {
            const id = url.searchParams.get('id');
            const p = await env.MY_XYRJ.prepare("SELECT * FROM products WHERE id=? AND active=1").bind(id).first();
            if(!p) return errRes('商品不存在', 404);
            p.variants = (await env.MY_XYRJ.prepare("SELECT * FROM variants WHERE product_id=?").bind(id).all()).results;
            return jsonRes(p);
        }

        if (path === '/api/shop/order/create' && method === 'POST') {
            const { variant_id, quantity, contact, payment_method } = await request.json();
            const variant = await env.MY_XYRJ.prepare("SELECT * FROM variants WHERE id=?").bind(variant_id).first();
            if (!variant || variant.stock < quantity) return errRes('库存不足');
            const product = await env.MY_XYRJ.prepare("SELECT name FROM products WHERE id=?").bind(variant.product_id).first();
            const order_id = uuid();
            const total_amount = (variant.price * quantity).toFixed(2);
            await env.MY_XYRJ.prepare("INSERT INTO orders (id, variant_id, product_name, variant_name, price, quantity, total_amount, contact, payment_method, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
                .bind(order_id, variant_id, product.name, variant.name, variant.price, quantity, total_amount, contact, payment_method, time()).run();
            return jsonRes({ order_id, total_amount, payment_method });
        }

        if (path === '/api/shop/pay' && method === 'POST') {
             const { order_id } = await request.json();
             const order = await env.MY_XYRJ.prepare("SELECT * FROM orders WHERE id=?").bind(order_id).first();
             if (!order) return errRes('订单不存在');
             if (order.status === 1) return jsonRes({ paid: true });

             if (order.payment_method === 'alipay_f2f') {
                 const gateway = await env.MY_XYRJ.prepare("SELECT config FROM pay_gateways WHERE type='alipay_f2f' AND active=1").first();
                 if(!gateway) return errRes('支付方式未配置');
                 const config = JSON.parse(gateway.config);

                 const params = {
                     app_id: config.app_id,
                     method: 'alipay.trade.precreate',
                     format: 'JSON', charset: 'utf-8', sign_type: 'RSA2', version: '1.0',
                     timestamp: new Date().toISOString().replace('T', ' ').split('.')[0],
                     notify_url: `${url.origin}/api/notify/alipay`,
                     biz_content: JSON.stringify({ out_trade_no: order.id, total_amount: order.total_amount, subject: `${order.product_name}` })
                 };
                 params.sign = await signAlipay(params, config.private_key);
                 const query = Object.keys(params).map(k => `${k}=${encodeURIComponent(params[k])}`).join('&');
                 const aliRes = await fetch(`https://openapi.alipay.com/gateway.do?${query}`);
                 const aliData = await aliRes.json();

                 if (aliData.alipay_trade_precreate_response?.code === '10000') {
                     return jsonRes({ type: 'qrcode', qr_code: aliData.alipay_trade_precreate_response.qr_code, order_id: order.id, amount: order.total_amount });
                 } else {
                     return errRes('支付宝错误: ' + (aliData.alipay_trade_precreate_response?.sub_msg || JSON.stringify(aliData)));
                 }
             }
             return errRes('未知的支付方式');
        }

        if (path === '/api/shop/order/status') {
            const order_id = url.searchParams.get('order_id');
            const order = await env.MY_XYRJ.prepare("SELECT status, cards_sent FROM orders WHERE id=?").bind(order_id).first();
            if(order && order.status >= 1) return jsonRes({ status: order.status, cards: JSON.parse(order.cards_sent || '[]') });
            return jsonRes({ status: 0 });
        }

        // === 支付回调 (Notify) - 含验签 ===
        if (path === '/api/notify/alipay' && method === 'POST') {
            const formData = await request.formData(); // 使用 formData 方便处理

            // 1. 获取支付配置用于验签
            const gateway = await env.MY_XYRJ.prepare("SELECT config FROM pay_gateways WHERE type='alipay_f2f' AND active=1").first();
            if (!gateway) return new Response('fail', {status: 500});
            const config = JSON.parse(gateway.config);

            // 2. 验证签名 (如果配置了公钥)
            if (config.alipay_public_key) {
                const isValid = await verifyAlipaySignature(formData, config.alipay_public_key);
                if (!isValid) {
                    console.error('支付宝回调验签失败');
                    return new Response('fail (sign error)'); // 返回 fail 给支付宝，让它重试（或不返回 success）
                }
            }

            // 3. 处理业务逻辑
            if (formData.get('trade_status') === 'TRADE_SUCCESS') {
                const out_trade_no = formData.get('out_trade_no');
                const trade_no = formData.get('trade_no');
                const order = await env.MY_XYRJ.prepare("SELECT * FROM orders WHERE id=? AND status=0").bind(out_trade_no).first();
                
                if (order) {
                    // 检查金额是否一致 (防止篡改)
                    if (parseFloat(formData.get('total_amount')) < order.total_amount) {
                         console.error('回调金额异常', out_trade_no);
                         return new Response('fail (amount mismatch)');
                    }

                    await env.MY_XYRJ.prepare("UPDATE orders SET status=1, paid_at=?, trade_no=? WHERE id=?").bind(time(), trade_no, out_trade_no).run();
                    const cards = await env.MY_XYRJ.prepare("SELECT id, content FROM cards WHERE variant_id=? AND status=0 LIMIT ?").bind(order.variant_id, order.quantity).all();
                    
                    if (cards.results.length >= order.quantity) {
                        const cardIds = cards.results.map(c => c.id);
                        const cardContents = cards.results.map(c => c.content);
                        await env.MY_XYRJ.prepare(`UPDATE cards SET status=1, order_id=? WHERE id IN (${cardIds.join(',')})`).bind(out_trade_no).run();
                        await env.MY_XYRJ.prepare("UPDATE orders SET status=2, cards_sent=? WHERE id=?").bind(JSON.stringify(cardContents), out_trade_no).run();
                        await env.MY_XYRJ.prepare("UPDATE variants SET stock = stock - ?, sales_count = sales_count + ? WHERE id=?").bind(order.quantity, order.quantity, order.variant_id).run();
                    }
                }
            }
            return new Response('success');
        }

    } catch (e) {
        return errRes('API Error: ' + e.message, 500);
    }

    return new Response('API Not Found', { status: 404 });
}
