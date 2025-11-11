/**
 * Cloudflare Worker Faka Backend (MPA 完全版 - 修复规格字段 - 完整 API)
 */

// === 工具函数 ===
const jsonRes = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } });
const errRes = (msg, status = 400) => jsonRes({ error: msg }, status);
const time = () => Math.floor(Date.now() / 1000);
const uuid = () => crypto.randomUUID().replace(/-/g, '');

// --- 支付宝签名 (Web Crypto API) ---

// 导入 PKCS8 私钥
async function importRsaPrivateKey(pem) {
    const pemContents = pem.replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\s+|\n/g, '');
    const binaryDer = Uint8Array.from(atob(pemContents), c => c.charCodeAt(0));
    return crypto.subtle.importKey(
        "pkcs8",
        binaryDer.buffer,
        { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
        false,
        ["sign"]
    );
}

// 导入 X.509 公钥
async function importRsaPublicKey(pem) {
    const pemContents = pem.replace(/-----BEGIN PUBLIC KEY-----|-----END PUBLIC KEY-----|\s+|\n/g, '');
    const binaryDer = Uint8Array.from(atob(pemContents), c => c.charCodeAt(0));
    return crypto.subtle.importKey(
        "spki",
        binaryDer.buffer,
        { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
        false,
        ["verify"]
    );
}

// 支付宝签名
async function signAlipay(params, privateKeyPem) {
    const sortedParams = Object.keys(params)
        .filter(k => k !== 'sign' && params[k] !== undefined && params[k] !== null && params[k] !== '')
        .sort()
        .map(k => `${k}=${typeof params[k] === 'object' ? JSON.stringify(params[k]) : params[k]}`)
        .join('&');
    
    const key = await importRsaPrivateKey(privateKeyPem);
    const signature = await crypto.subtle.sign(
        "RSASSA-PKCS1-v1_5",
        key,
        new TextEncoder().encode(sortedParams)
    );
    return btoa(String.fromCharCode(...new Uint8Array(signature)));
}

// 支付宝验签
async function verifyAlipaySignature(params, alipayPublicKeyPem) {
    const sign = params.get('sign');
    const signType = params.get('sign_type');
    if (!sign || !signType || signType.toUpperCase() !== 'RSA2') return false;

    const sortedParams = Array.from(params.keys())
        .filter(k => k !== 'sign' && k !== 'sign_type' && params.get(k) !== '')
        .sort()
        .map(k => `${k}=${params.get(k)}`)
        .join('&');
    
    const key = await importRsaPublicKey(alipayPublicKeyPem);
    const binarySign = Uint8Array.from(atob(sign), c => c.charCodeAt(0));
    
    return crypto.subtle.verify(
        "RSASSA-PKCS1-v1_5",
        key,
        binarySign.buffer,
        new TextEncoder().encode(sortedParams)
    );
}


// === Worker 入口 ===
export default {
    async fetch(request, env, ctx) {
        const url = new URL(request.url);
        const path = url.pathname;

        // === 1. API 路由处理 ===
        if (path.startsWith('/api/')) {
            return handleApi(request, env, url);
        }

        // === 2. 静态资源路由重写 (MPA 核心支持) ===
        // 访问 / 时, 内部转发到 /themes/default/index.html
        if (path === '/') {
            const newUrl = new URL('/themes/default/index.html', request.url);
            return env.ASSETS.fetch(new Request(newUrl, request));
        }
        
        // 访问 /product.html 或 /article.html 时, 内部转发到 /themes/default/
        if ((path.endsWith('.html') || path.endsWith('.htm')) && !path.startsWith('/admin/') && !path.startsWith('/themes/')) {
             const newUrl = new URL(`/themes/default${path}`, request.url);
             return env.ASSETS.fetch(new Request(newUrl, request));
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
                    income_today: (await env.MY_XYRJ.prepare("SELECT SUM(total_amount) as s FROM orders WHERE status >= 1 AND paid_at >= ?").bind(today).first()).s || 0,
                    cards_unsold: (await env.MY_XYRJ.prepare("SELECT COUNT(*) as c FROM cards WHERE status = 0").first()).c,
                });
            }
            
            // [GET] 获取订单列表
            if (path === '/api/admin/orders/list') {
                const contact = url.searchParams.get('contact');
                let query, binder;
                if (contact) {
                    query = "SELECT * FROM orders WHERE contact LIKE ? ORDER BY created_at DESC LIMIT 50";
                    binder = env.MY_XYRJ.prepare(query).bind(`%${contact}%`);
                } else {
                    query = "SELECT * FROM orders ORDER BY created_at DESC LIMIT 50"; // 限制最近50条
                    binder = env.MY_XYRJ.prepare(query);
                }
                const { results } = await binder.all();
                return jsonRes(results);
            }

            if (path === '/api/admin/products/list') {
                const products = await env.MY_XYRJ.prepare("SELECT * FROM products ORDER BY sort DESC, id DESC").all();
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
                    await env.MY_XYRJ.prepare("UPDATE products SET name=?, description=?, sort=?, active=?, category_id=? WHERE id=?")
                        .bind(data.name, data.description, data.sort, data.active, data.category_id || 1, productId).run();
                } else {
                    const res = await env.MY_XYRJ.prepare("INSERT INTO products (name, description, sort, active, category_id, created_at) VALUES (?, ?, ?, ?, ?, ?)")
                        .bind(data.name, data.description, data.sort, data.active, data.category_id || 1, time()).run();
                    productId = res.meta.last_row_id;
                }
                
                // 处理变体 (更稳妥的 Diff 逻辑)
                if (data.variants) {
                    const oldVariants = await env.MY_XYRJ.prepare("SELECT id FROM variants WHERE product_id = ?").bind(productId).all();
                    const oldIds = oldVariants.results.map(v => v.id);
                    const newIds = [];
                    
                    const batchOps = [];
                    const insertStmt = env.MY_XYRJ.prepare(`
                        INSERT INTO variants 
                        (product_id, name, price, stock, color, image_url, wholesale_config, custom_markup, created_at) 
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                    `);
                    const updateStmt = env.MY_XYRJ.prepare(`
                        UPDATE variants SET
                        name = ?, price = ?, stock = ?, color = ?, image_url = ?, wholesale_config = ?, custom_markup = ?
                        WHERE id = ? AND product_id = ?
                    `);

                    for(const v of data.variants) {
                        const stock = v.stock || 0; // 库存由卡密导入更新，这里仅作记录
                        const wholesale_config = v.wholesale_config ? JSON.stringify(v.wholesale_config) : null;
                        
                        if (v.id) { // 更新
                            newIds.push(v.id);
                            batchOps.push(updateStmt.bind(
                                v.name, v.price, stock, v.color, v.image_url, wholesale_config, v.custom_markup,
                                v.id, productId
                            ));
                        } else { // 新增
                             batchOps.push(insertStmt.bind(
                                productId, v.name, v.price, stock, v.color, v.image_url, wholesale_config, v.custom_markup, time()
                            ));
                        }
                    }
                    
                    // 删除
                    const deleteIds = oldIds.filter(id => !newIds.includes(id));
                    if(deleteIds.length > 0) {
                        batchOps.push(env.MY_XYRJ.prepare(`DELETE FROM variants WHERE id IN (${deleteIds.join(',')}) AND product_id = ?`).bind(productId));
                    }
                    
                    await env.MY_XYRJ.batch(batchOps);
                }
                return jsonRes({ success: true });
            }

            if (path === '/api/admin/cards/import' && method === 'POST') {
                const { variant_id, content } = await request.json();
                const cards = content.split('\n').filter(c => c.trim()).map(c => c.trim());
                if (cards.length > 0) {
                    const stmt = env.MY_XYRJ.prepare("INSERT INTO cards (variant_id, content, status, created_at) VALUES (?, ?, 0, ?)");
                    await env.MY_XYRJ.batch(cards.map(c => stmt.bind(variant_id, c, time())));
                    // 重新计算库存
                    const stock = (await env.MY_XYRJ.prepare("SELECT COUNT(*) as c FROM cards WHERE variant_id = ? AND status = 0").bind(variant_id).first()).c;
                    await env.MY_XYRJ.prepare("UPDATE variants SET stock = ? WHERE id = ?").bind(stock, variant_id).run();
                }
                return jsonRes({ imported: cards.length });
            }

            // [GET] 获取卡密列表
            if (path === '/api/admin/cards/list') {
                const variant_id = url.searchParams.get('variant_id');
                if (!variant_id) return errRes('缺少 variant_id');

                const { results } = await env.MY_XYRJ.prepare("SELECT * FROM cards WHERE variant_id = ? ORDER BY id DESC LIMIT 100")
                    .bind(variant_id)
                    .all();
                return jsonRes(results);
            }

            // [POST] 删除卡密
            if (path === '/api/admin/card/delete' && method === 'POST') {
                const { id, variant_id } = await request.json();
                // 只能删除未售出的卡密
                const res = await env.MY_XYRJ.prepare("DELETE FROM cards WHERE id = ? AND status = 0").bind(id).run();
                if (res.meta.changes > 0) {
                    // 重新计算库存
                    const stock = (await env.MY_XYRJ.prepare("SELECT COUNT(*) as c FROM cards WHERE variant_id = ? AND status = 0").bind(variant_id).first()).c;
                    await env.MY_XYRJ.prepare("UPDATE variants SET stock = ? WHERE id = ?").bind(stock, variant_id).run();
                }
                return jsonRes({ success: res.meta.changes > 0 });
            }

            // [POST] 保存支付网关
            if (path === '/api/admin/gateways/save' && method === 'POST') {
                const { config } = await request.json();
                await env.MY_XYRJ.prepare("DELETE FROM pay_gateways WHERE type='alipay_f2f'").run();
                await env.MY_XYRJ.prepare("INSERT INTO pay_gateways (name, type, config, active) VALUES (?, ?, ?, ?)")
                    .bind('支付宝当面付', 'alipay_f2f', JSON.stringify(config), 1).run();
                return jsonRes({success: true});
            }
            
            // [GET] 获取当前支付配置
            if (path === '/api/admin/gateways/get') {
                const gateway = await env.MY_XYRJ.prepare("SELECT config FROM pay_gateways WHERE type='alipay_f2f'").first();
                return jsonRes(gateway ? JSON.parse(gateway.config) : {});
            }

            // --- 文章 API ---
            if (path === '/api/admin/articles/list') {
                const { results } = await env.MY_XYRJ.prepare("SELECT id, title, is_notice, created_at FROM articles ORDER BY id DESC").all();
                return jsonRes(results);
            }
            if (path === '/api/admin/article/get') {
                const id = url.searchParams.get('id');
                return jsonRes(await env.MY_XYRJ.prepare("SELECT * FROM articles WHERE id=?").bind(id).first());
            }
            if (path === '/api/admin/article/delete' && method === 'POST') {
                const { id } = await request.json();
                await env.MY_XYRJ.prepare("DELETE FROM articles WHERE id=?").bind(id).run();
                return jsonRes({ success: true });
            }
            if (path === '/api/admin/article/save' && method === 'POST') {
                const { id, title, content, is_notice } = await request.json();
                if (is_notice) { // 设为公告时，取消其他公告
                    await env.MY_XYRJ.prepare("UPDATE articles SET is_notice=0").run();
                }
                if (id) {
                    await env.MY_XYRJ.prepare("UPDATE articles SET title=?, content=?, is_notice=?, updated_at=? WHERE id=?")
                        .bind(title, content, is_notice, time(), id).run();
                } else {
                    await env.MY_XYRJ.prepare("INSERT INTO articles (title, content, is_notice, created_at, updated_at) VALUES (?,?,?,?,?)")
                        .bind(title, content, is_notice, time(), time()).run();
                }
                return jsonRes({ success: true });
            }
        }

        // ===========================
        // --- 公开 API (Shop) ---
        // ===========================

        if (path === '/api/shop/config') {
            const res = await env.MY_XYRJ.prepare("SELECT * FROM site_config").all();
            const config = {}; res.results.forEach(r => config[r.key] = r.value);
            // 查找最新的公告
            const notice = await env.MY_XYRJ.prepare("SELECT content FROM articles WHERE is_notice=1 ORDER BY id DESC LIMIT 1").first();
            if (notice) {
                config.notice_content = notice.content; // 使用文章公告覆盖
            }
            return jsonRes(config);
        }

        if (path === '/api/shop/products') {
            const res = await env.MY_XYRJ.prepare("SELECT * FROM products WHERE active=1 ORDER BY sort DESC, id DESC").all();
            for(let p of res.results) {
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
        
        // --- 文章 (Shop) ---
        if (path === '/api/shop/articles/list') {
            const { results } = await env.MY_XYRJ.prepare("SELECT id, title, created_at FROM articles WHERE is_notice=0 ORDER BY id DESC").all();
            return jsonRes(results);
        }
        if (path === '/api/shop/article/get') {
            const id = url.searchParams.get('id');
            const article = await env.MY_XYRJ.prepare("SELECT * FROM articles WHERE id=?").bind(id).first();
            if(article) {
                // 更新浏览量 (无需 await)
                ctx.waitUntil(env.MY_XYRJ.prepare("UPDATE articles SET view_count = view_count + 1 WHERE id=?").bind(id).run());
                return jsonRes(article);
            }
            return errRes('文章不存在', 404);
        }

        if (path === '/api/shop/order/create' && method === 'POST') {
            const { variant_id, quantity, contact, payment_method } = await request.json();
            const variant = await env.MY_XYRJ.prepare("SELECT * FROM variants WHERE id=?").bind(variant_id).first();
            if (!variant || variant.stock < quantity) return errRes('库存不足');

            const product = await env.MY_XYRJ.prepare("SELECT name FROM products WHERE id=?").bind(variant.product_id).first();
            const order_id = uuid();
            
            // TODO: 计算批发价和自选加价
            const total_amount = (variant.price * quantity).toFixed(2);

            await env.MY_XYRJ.prepare("INSERT INTO orders (id, variant_id, product_name, variant_name, price, quantity, total_amount, contact, payment_method, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
                .bind(order_id, variant_id, product.name, variant.name, variant.price, quantity, total_amount, contact, payment_method, time()).run();

            return jsonRes({ order_id, total_amount, payment_method });
        }

        if (path === '/api/shop/pay' && method === 'POST') {
            const { order_id } = await request.json();
            const order = await env.MY_XYRJ.prepare("SELECT * FROM orders WHERE id=?").bind(order_id).first();
            if (!order) return errRes('订单不存在');
            if (order.status >= 1) return jsonRes({ paid: true });

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
            if(order && order.status >= 2) { // 必须是 2 (已发货) 才返回
                return jsonRes({ status: order.status, cards: JSON.parse(order.cards_sent || '[]') });
            }
            return jsonRes({ status: order?.status || 0 });
        }

        // ===========================
        // --- 支付回调 (Notify) ---
        // ===========================
        if (path === '/api/notify/alipay' && method === 'POST') {
            const formData = await request.formData();
            
            // 1. 验签
            const gateway = await env.MY_XYRJ.prepare("SELECT config FROM pay_gateways WHERE type='alipay_f2f' AND active=1").first();
            if(!gateway) return new Response('FAIL: Gateway not configured', { status: 500 });
            const config = JSON.parse(gateway.config);
            
            const valid = await verifyAlipaySignature(formData, config.alipay_public_key);
            if (!valid) {
                return new Response('FAIL: Invalid Signature', { status: 400 });
            }
            
            // 2. 处理业务
            if (formData.get('trade_status') === 'TRADE_SUCCESS') {
                const out_trade_no = formData.get('out_trade_no');
                const trade_no = formData.get('trade_no');
                
                const order = await env.MY_XYRJ.prepare("SELECT * FROM orders WHERE id=? AND status=0").bind(out_trade_no).first();
                if (order) {
                    // 更新订单为“已支付”
                    await env.MY_XYRJ.prepare("UPDATE orders SET status=1, paid_at=?, trade_no=? WHERE id=?")
                        .bind(time(), trade_no, out_trade_no).run();
                    
                    // 提取卡密
                    const cards = await env.MY_XYRJ.prepare("SELECT id, content FROM cards WHERE variant_id=? AND status=0 LIMIT ?")
                        .bind(order.variant_id, order.quantity).all();
                    
                    if (cards.results.length >= order.quantity) {
                        const cardIds = cards.results.map(c => c.id);
                        const cardContents = cards.results.map(c => c.content);
                        
                        // 标记卡密为“已售”
                        await env.MY_XYRJ.prepare(`UPDATE cards SET status=1, order_id=? WHERE id IN (${cardIds.join(',')})`)
                            .bind(out_trade_no).run();
                        
                        // 更新订单为“已完成/已发货”
                        await env.MY_XYRJ.prepare("UPDATE orders SET status=2, cards_sent=? WHERE id=?")
                            .bind(JSON.stringify(cardContents), out_trade_no).run();
                        
                        // 更新库存 和 销量(sales_count)
                        const stock = (await env.MY_XYRJ.prepare("SELECT COUNT(*) as c FROM cards WHERE variant_id = ? AND status = 0").bind(order.variant_id).first()).c;
                        await env.MY_XYRJ.prepare("UPDATE variants SET stock = ?, sales_count = sales_count + ? WHERE id=?")
                            .bind(stock, order.quantity, order.variant_id).run();
                    } else {
                        // 库存不足，订单标记为“已支付”但未发货，等待人工处理
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
