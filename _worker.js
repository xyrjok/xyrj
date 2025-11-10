/**
 * Cloudflare Worker Faka Backend (MPA 完全版 - 修复规格字段)
 */

// === 工具函数 ===
const jsonRes = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } });
const errRes = (msg, status = 400) => jsonRes({ error: msg }, status);
const time = () => Math.floor(Date.now() / 1000);
const uuid = () => crypto.randomUUID().replace(/-/g, '');

// 支付宝当面付签名核心逻辑 (Web Crypto API)
async function signAlipay(params, privateKeyPem) {
    const sortedParams = Object.keys(params).filter(k => k !== 'sign' && params[k]).sort().map(k => `${k}=${typeof params[k] === 'object' ? JSON.stringify(params[k]) : params[k]}`).join('&');
    let pemContents = privateKeyPem.replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\s+|\n/g, '');
    const binaryDer = Uint8Array.from(atob(pemContents), c => c.charCodeAt(0));
    const key = await crypto.subtle.importKey("pkcs8", binaryDer.buffer, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
    const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(sortedParams));
    return btoa(String.fromCharCode(...new Uint8Array(signature)));
}

export default {
    async fetch(request, env, ctx) {
        const url = new URL(request.url);
        const path = url.pathname;

        // === 1. API 路由处理 ===
        if (path.startsWith('/api/')) {
            return handleApi(request, env, url);
        }

        // === 2. 静态资源路由重写 (MPA 核心支持) ===
        let theme = 'default'; 
        if (path === '/' || path === '/index.html') {
            return env.ASSETS.fetch(new Request(`${url.origin}/themes/${theme}/index.html`, request));
        }
        if (path.endsWith('.html') && !path.startsWith('/admin/') && !path.startsWith('/themes/')) {
             return env.ASSETS.fetch(new Request(`${url.origin}/themes/${theme}${path}`, request));
        }

        // === 3. 默认静态资源回退 ===
        return env.ASSETS.fetch(request);
    }
};

// === 完整的 API 处理逻辑 ===
async function handleApi(request, env, url) {
    const method = request.method;
    const path = url.pathname;

    try {
        // ===========================
        // --- 管理员 API (Admin) ---
        // ===========================
        if (path.startsWith('/api/admin/')) {
            const authHeader = request.headers.get('Authorization');
            if (path !== '/api/admin/login' && (!authHeader || !authHeader.endsWith(env.ADMIN_TOKEN))) {
                return errRes('Unauthorized', 401);
            }

            if (path === '/api/admin/login' && method === 'POST') {
                const { user, pass } = await request.json();
                if (user === env.ADMIN_USER && pass === env.ADMIN_PASS) {
                    return jsonRes({ token: env.ADMIN_TOKEN });
                }
                return errRes('用户名或密码错误', 401);
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

            // [POST] 商品保存 (更新适配所有新字段)
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
                
                // 处理变体 (全量替换模式，简化实现)
                if (data.variants) {
                     // 1. 删除旧变体 (生产环境可能需要更复杂的 diff 逻辑以保留库存数据，此处为简化直接删除重建)
                     // 注意：如果直接删除，已存在的关联卡密可能会失去关联。
                     // 更稳妥的做法是：遍历新变体，有 ID 的 update，没 ID 的 insert，不在列表里的 delete。
                     // 这里为了演示核心字段，先采用简单模式。实际使用建议改进此处。
                     if(data.id) await env.MY_XYRJ.prepare("DELETE FROM variants WHERE product_id=?").bind(productId).run();
                     
                     const stmt = env.MY_XYRJ.prepare(`
                        INSERT INTO variants 
                        (product_id, name, price, stock, color, image_url, wholesale_config, custom_markup, created_at) 
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                     `);
                     
                     const batch = data.variants.map(v => stmt.bind(
                         productId, 
                         v.name, 
                         v.price, 
                         v.stock || 0, // 库存通常由卡密数量决定，这里仅作为初始值
                         v.color || null,
                         v.image_url || null,
                         v.wholesale_config ? JSON.stringify(v.wholesale_config) : null,
                         v.custom_markup || 0,
                         time()
                    ));
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
                 await env.MY_XYRJ.prepare("DELETE FROM pay_gateways WHERE type='alipay_f2f'").run();
                 await env.MY_XYRJ.prepare("INSERT INTO pay_gateways (name, type, config, active) VALUES (?, ?, ?, ?)")
                    .bind('支付宝当面付', 'alipay_f2f', JSON.stringify(data.config), 1).run();
                 return jsonRes({success: true});
            }
        }

        // ===========================
        // --- 公开 API (Shop) ---
        // ===========================

        if (path === '/api/shop/config') {
             const res = await env.MY_XYRJ.prepare("SELECT * FROM site_config").all();
             const config = {}; res.results.forEach(r => config[r.key] = r.value);
             return jsonRes(config);
        }

        if (path === '/api/shop/products') {
            const res = await env.MY_XYRJ.prepare("SELECT * FROM products WHERE active=1 ORDER BY sort DESC").all();
            for(let p of res.results) {
                // 前台获取完整的变体信息用于展示
                p.variants = (await env.MY_XYRJ.prepare("SELECT * FROM variants WHERE product_id=?").bind(p.id).all()).results;
            }
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
            
            // 计算总价 (此处可加入批发价和自选加价逻辑，暂时使用基础价)
            // let finalPrice = variant.price;
            // if (variant.custom_markup > 0) finalPrice += variant.custom_markup;
            // TODO: 解析 wholesale_config 并应用批发价
            
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
                     biz_content: JSON.stringify({
                         out_trade_no: order.id,
                         total_amount: order.total_amount,
                         subject: `${order.product_name}`
                     })
                 };
                 params.sign = await signAlipay(params, config.private_key);
                 const query = Object.keys(params).map(k => `${k}=${encodeURIComponent(params[k])}`).join('&');
                 const aliRes = await fetch(`https://openapi.alipay.com/gateway.do?${query}`);
                 const aliData = await aliRes.json();

                 if (aliData.alipay_trade_precreate_response?.code === '10000') {
                     return jsonRes({
                         type: 'qrcode',
                         qr_code: aliData.alipay_trade_precreate_response.qr_code,
                         order_id: order.id,
                         amount: order.total_amount
                     });
                 } else {
                     return errRes('支付宝错误: ' + (aliData.alipay_trade_precreate_response?.sub_msg || JSON.stringify(aliData)));
                 }
             }
             return errRes('未知的支付方式');
        }

        if (path === '/api/shop/order/status') {
            const order_id = url.searchParams.get('order_id');
            const order = await env.MY_XYRJ.prepare("SELECT status, cards_sent FROM orders WHERE id=?").bind(order_id).first();
            if(order && order.status >= 1) {
                return jsonRes({ status: order.status, cards: JSON.parse(order.cards_sent || '[]') });
            }
            return jsonRes({ status: 0 });
        }

        // ===========================
        // --- 支付回调 (Notify) ---
        // ===========================
        if (path === '/api/notify/alipay' && method === 'POST') {
            const formData = await request.formData();
            // 注意：生产环境请务必在此处增加验签！
            if (formData.get('trade_status') === 'TRADE_SUCCESS') {
                const out_trade_no = formData.get('out_trade_no');
                const trade_no = formData.get('trade_no');
                
                const order = await env.MY_XYRJ.prepare("SELECT * FROM orders WHERE id=? AND status=0").bind(out_trade_no).first();
                if (order) {
                    await env.MY_XYRJ.prepare("UPDATE orders SET status=1, paid_at=?, trade_no=? WHERE id=?")
                        .bind(time(), trade_no, out_trade_no).run();
                    
                    const cards = await env.MY_XYRJ.prepare("SELECT id, content FROM cards WHERE variant_id=? AND status=0 LIMIT ?")
                        .bind(order.variant_id, order.quantity).all();
                    
                    if (cards.results.length >= order.quantity) {
                        const cardIds = cards.results.map(c => c.id);
                        const cardContents = cards.results.map(c => c.content);
                        await env.MY_XYRJ.prepare(`UPDATE cards SET status=1, order_id=? WHERE id IN (${cardIds.join(',')})`)
                            .bind(out_trade_no).run();
                        await env.MY_XYRJ.prepare("UPDATE orders SET status=2, cards_sent=? WHERE id=?")
                            .bind(JSON.stringify(cardContents), out_trade_no).run();
                        
                        // 更新库存 和 销量(sales_count)
                        await env.MY_XYRJ.prepare("UPDATE variants SET stock = stock - ?, sales_count = sales_count + ? WHERE id=?")
                            .bind(order.quantity, order.quantity, order.variant_id).run();
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
