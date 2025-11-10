/**
 * Cloudflare Worker Faka Backend
 * 集成了支付宝当面付签名逻辑
 */

// === 工具函数 ===
const jsonRes = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } });
const errRes = (msg, status = 400) => jsonRes({ error: msg }, status);

// 生成简单的 UUID
const uuid = () => crypto.randomUUID().replace(/-/g, '');

// 获取时间戳 (秒)
const time = () => Math.floor(Date.now() / 1000);

// 支付宝当面付签名核心逻辑 (Web Crypto API)
async function signAlipay(params, privateKeyPem) {
    // 1. 筛选并排序参数
    const sortedParams = Object.keys(params)
        .filter(k => k !== 'sign' && params[k])
        .sort()
        .map(k => {
            let val = params[k];
            if (typeof val === 'object') val = JSON.stringify(val);
            return `${k}=${val}`;
        })
        .join('&');

    // 2. 处理私钥格式 (PKCS8 PEM -> ArrayBuffer)
    // 注意：用户输入的私钥通常是 PKCS1 或 PKCS8，这里假设是标准 PKCS8 (BEGIN PRIVATE KEY)
    // 如果是 PKCS1 (BEGIN RSA PRIVATE KEY)，需要转换，或者让用户直接提供 PKCS8。
    // 为了简化，这里假设用户能提供去头的 Base64 PKCS8 私钥。
    const pemHeader = "-----BEGIN PRIVATE KEY-----";
    const pemFooter = "-----END PRIVATE KEY-----";
    let pemContents = privateKeyPem.trim();
    if (pemContents.startsWith(pemHeader)) {
        pemContents = pemContents.substring(pemHeader.length, pemContents.length - pemFooter.length).replace(/\s+|\n/g, '');
    }

    const binaryDerString = atob(pemContents);
    const binaryDer = new Uint8Array(binaryDerString.length);
    for (let i = 0; i < binaryDerString.length; i++) {
        binaryDer[i] = binaryDerString.charCodeAt(i);
    }

    // 3. 导入私钥
    const key = await crypto.subtle.importKey(
        "pkcs8",
        binaryDer.buffer,
        { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
        false,
        ["sign"]
    );

    // 4. 签名
    const encoder = new TextEncoder();
    const data = encoder.encode(sortedParams);
    const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, data);

    // 5. 转 Base64
    return btoa(String.fromCharCode(...new Uint8Array(signature)));
}


export default {
    async fetch(request, env, ctx) {
        const url = new URL(request.url);
        const path = url.pathname;
        const method = request.method;

        // === 简单的 CORS 处理 ===
        if (method === 'OPTIONS') {
            return new Response(null, {
                headers: {
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
                    'Access-Control-Allow-Headers': 'Content-Type, Authorization'
                }
            });
        }

        // === API 路由 ===
        if (path.startsWith('/api/')) {
            try {
                // --- 管理员 API (需要 Token 验证) ---
                if (path.startsWith('/api/admin/')) {
                    const authHeader = request.headers.get('Authorization');
                    const expectedToken = env.ADMIN_TOKEN || 'secret'; // 建议在 env 设置
                    if (!authHeader || !authHeader.endsWith(expectedToken)) {
                        return errRes('Unauthorized', 401);
                    }

                    // 登录验证 (实际上由前端直接用 ADMIN_TOKEN 访问，这里只是验证个形式)
                    if (path === '/api/admin/login' && method === 'POST') {
                        const body = await request.json();
                        if (body.user === env.ADMIN_USER && body.pass === env.ADMIN_PASS) {
                            return jsonRes({ token: env.ADMIN_TOKEN });
                        }
                        return errRes('用户名或密码错误', 401);
                    }

                    // 仪表盘统计
                    if (path === '/api/admin/dashboard') {
                         const today = new Date().setHours(0,0,0,0) / 1000;
                         const stats = {
                             orders_today: (await env.MY_HLTX.prepare("SELECT COUNT(*) as c FROM orders WHERE created_at >= ?").bind(today).first()).c,
                             income_today: (await env.MY_HLTX.prepare("SELECT SUM(total_amount) as s FROM orders WHERE status = 1 AND paid_at >= ?").bind(today).first()).s || 0,
                             cards_unsold: (await env.MY_HLTX.prepare("SELECT COUNT(*) as c FROM cards WHERE status = 0").first()).c,
                         };
                         return jsonRes(stats);
                    }

                    // 商品管理 - 列表
                    if (path === '/api/admin/products' && method === 'GET') {
                        const products = await env.MY_HLTX.prepare("SELECT * FROM products ORDER BY sort DESC").all();
                        // 获取每个商品的变体
                        for (let p of products.results) {
                            p.variants = (await env.MY_HLTX.prepare("SELECT * FROM variants WHERE product_id = ?").bind(p.id).all()).results;
                        }
                        return jsonRes(products.results);
                    }

                    // 商品管理 - 创建/编辑 (简化版，只接收 JSON)
                    if (path === '/api/admin/product/save' && method === 'POST') {
                        const data = await request.json();
                        let productId = data.id;
                        if (productId) {
                            await env.MY_HLTX.prepare("UPDATE products SET name=?, description=?, sort=?, active=? WHERE id=?")
                                .bind(data.name, data.description, data.sort, data.active, productId).run();
                        } else {
                             const res = await env.MY_HLTX.prepare("INSERT INTO products (name, description, sort, active, created_at) VALUES (?, ?, ?, ?, ?)")
                                .bind(data.name, data.description, data.sort, data.active, time()).run();
                             // D1 的 lastRowId 在某些版本可能不稳定，这里暂且这样用
                             productId = res.meta.last_row_id;
                        }
                        // 处理变体 (简化：先删后加，实际生产尽量用 update)
                        if (data.variants) {
                             if(data.id) await env.MY_HLTX.prepare("DELETE FROM variants WHERE product_id=?").bind(productId).run();
                             const stmt = env.MY_HLTX.prepare("INSERT INTO variants (product_id, name, price, stock, created_at) VALUES (?, ?, ?, ?, ?)");
                             await env.MY_HLTX.batch(data.variants.map(v => stmt.bind(productId, v.name, v.price, v.stock, time())));
                        }
                        return jsonRes({ success: true });
                    }

                    // 卡密管理 - 导入
                    if (path === '/api/admin/cards/import' && method === 'POST') {
                        const { variant_id, content } = await request.json();
                        const cards = content.split('\n').filter(c => c.trim()).map(c => c.trim());
                        const stmt = env.MY_HLTX.prepare("INSERT INTO cards (variant_id, content, status, created_at) VALUES (?, ?, 0, ?)");
                        await env.MY_HLTX.batch(cards.map(c => stmt.bind(variant_id, c, time())));
                        // 更新库存
                        await env.MY_HLTX.prepare("UPDATE variants SET stock = stock + ? WHERE id = ?").bind(cards.length, variant_id).run();
                        return jsonRes({ imported: cards.length });
                    }

                    // 支付网关设置
                    if (path === '/api/admin/gateways/save' && method === 'POST') {
                         const data = await request.json();
                         // 简化：假设只有一个支付宝配置
                         await env.MY_HLTX.prepare("DELETE FROM pay_gateways WHERE type='alipay_f2f'").run();
                         await env.MY_HLTX.prepare("INSERT INTO pay_gateways (name, type, config, active) VALUES (?, ?, ?, ?)")
                            .bind('支付宝当面付', 'alipay_f2f', JSON.stringify(data.config), 1).run();
                         return jsonRes({success: true});
                    }
                }

                // --- 客户端 API (公开) ---

                // 首页数据
                if (path === '/api/shop/init') {
                    const site_config_raw = await env.MY_HLTX.prepare("SELECT * FROM site_config").all();
                    const config = {};
                    site_config_raw.results.forEach(item => config[item.key] = item.value);

                    const products = await env.MY_HLTX.prepare("SELECT * FROM products WHERE active=1 ORDER BY sort DESC").all();
                     for (let p of products.results) {
                        // 仅显示有库存或激活的变体
                        p.variants = (await env.MY_HLTX.prepare("SELECT id, name, price, stock FROM variants WHERE product_id = ?").bind(p.id).all()).results;
                    }
                    return jsonRes({ config, products: products.results });
                }

                // 创建订单
                if (path === '/api/shop/order/create' && method === 'POST') {
                    const { variant_id, quantity, contact, payment_method } = await request.json();
                    const variant = await env.MY_HLTX.prepare("SELECT * FROM variants WHERE id=?").bind(variant_id).first();
                    if (!variant || variant.stock < quantity) return errRes('库存不足');

                    const product = await env.MY_HLTX.prepare("SELECT name FROM products WHERE id=?").bind(variant.product_id).first();
                    const order_id = uuid(); // 商户订单号
                    const total_amount = (variant.price * quantity).toFixed(2);

                    await env.MY_HLTX.prepare("INSERT INTO orders (id, variant_id, product_name, variant_name, price, quantity, total_amount, contact, payment_method, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
                        .bind(order_id, variant_id, product.name, variant.name, variant.price, quantity, total_amount, contact, payment_method, time()).run();

                    return jsonRes({ order_id, total_amount, payment_method });
                }

                // 发起支付 (获取支付二维码/链接)
                if (path === '/api/shop/pay' && method === 'POST') {
                     const { order_id } = await request.json();
                     const order = await env.MY_HLTX.prepare("SELECT * FROM orders WHERE id=?").bind(order_id).first();
                     if (!order) return errRes('订单不存在');
                     if (order.status === 1) return jsonRes({ paid: true }); // 已支付

                     if (order.payment_method === 'alipay_f2f') {
                         const gateway = await env.MY_HLTX.prepare("SELECT config FROM pay_gateways WHERE type='alipay_f2f' AND active=1").first();
                         if(!gateway) return errRes('支付方式未配置');
                         const config = JSON.parse(gateway.config);

                         // 构造支付宝请求参数
                         const bizContent = {
                             out_trade_no: order.id,
                             total_amount: order.total_amount,
                             subject: `${order.product_name} - ${order.variant_name}`,
                             // notify_url: `https://${url.hostname}/api/notify/alipay` // 需要你配置真正的域名
                         };

                         const params = {
                             app_id: config.app_id,
                             method: 'alipay.trade.precreate',
                             format: 'JSON',
                             charset: 'utf-8',
                             sign_type: 'RSA2',
                             timestamp: new Date().toISOString().replace('T', ' ').split('.')[0],
                             version: '1.0',
                             notify_url: `https://${url.hostname}/api/notify/alipay`, // 重要：异步通知地址
                             biz_content: JSON.stringify(bizContent)
                         };

                         // 签名
                         params.sign = await signAlipay(params, config.private_key);

                         // 请求支付宝接口
                         const queryStr = Object.keys(params).map(k => `${k}=${encodeURIComponent(params[k])}`).join('&');
                         const aliRes = await fetch(`https://openapi.alipay.com/gateway.do?${queryStr}`);
                         const aliData = await aliRes.json();

                         if (aliData.alipay_trade_precreate_response && aliData.alipay_trade_precreate_response.code === '10000') {
                             return jsonRes({
                                 type: 'qrcode',
                                 qr_code: aliData.alipay_trade_precreate_response.qr_code,
                                 order_id: order.id,
                                 amount: order.total_amount
                             });
                         } else {
                             return errRes('支付宝接口错误: ' + JSON.stringify(aliData));
                         }
                     }
                     return errRes('未知的支付方式');
                }

                // 查询订单状态 (前端轮询用)
                if (path === '/api/shop/order/status') {
                    const order_id = url.searchParams.get('order_id');
                    const order = await env.MY_HLTX.prepare("SELECT status, cards_sent FROM orders WHERE id=?").bind(order_id).first();
                    if(order && order.status === 1) {
                        return jsonRes({ status: 1, cards: JSON.parse(order.cards_sent || '[]') });
                    }
                    return jsonRes({ status: 0 });
                }

                // --- 支付异步通知 (核心) ---
                if (path === '/api/notify/alipay' && method === 'POST') {
                    // 真正的生产环境需要验签 (verify signature)，这里为了简化省略了验签步骤，仅做演示。
                    // *一定要在生产环境中加上验签！*
                    const formData = await request.formData();
                    const trade_status = formData.get('trade_status');
                    const out_trade_no = formData.get('out_trade_no');
                    const trade_no = formData.get('trade_no'); // 支付宝流水号

                    if (trade_status === 'TRADE_SUCCESS') {
                        const order = await env.MY_HLTX.prepare("SELECT * FROM orders WHERE id=? AND status=0").bind(out_trade_no).first();
                        if (order) {
                            // 1. 标记订单已支付
                            await env.MY_HLTX.prepare("UPDATE orders SET status=1, paid_at=?, trade_no=? WHERE id=?")
                                .bind(time(), trade_no, out_trade_no).run();

                            // 2. 自动发货 (选出足够的卡密)
                            const cards = await env.MY_HLTX.prepare("SELECT id, content FROM cards WHERE variant_id=? AND status=0 LIMIT ?")
                                .bind(order.variant_id, order.quantity).all();

                            if (cards.results.length >= order.quantity) {
                                const cardContents = cards.results.map(c => c.content);
                                const cardIds = cards.results.map(c => c.id);
                                // 更新卡密状态
                                await env.MY_HLTX.prepare(`UPDATE cards SET status=1, order_id=? WHERE id IN (${cardIds.join(',')})`)
                                    .bind(out_trade_no).run();
                                // 更新订单发货信息
                                await env.MY_HLTX.prepare("UPDATE orders SET status=2, cards_sent=? WHERE id=?")
                                    .bind(JSON.stringify(cardContents), out_trade_no).run();
                                // 扣减库存
                                await env.MY_HLTX.prepare("UPDATE variants SET stock = stock - ? WHERE id=?")
                                    .bind(order.quantity, order.variant_id).run();
                            } else {
                                // 库存不足，需要人工补单
                                await env.MY_HLTX.prepare("UPDATE orders SET status=3 WHERE id=?") // 3: 缺货待补
                                   .bind(out_trade_no).run();
                            }
                        }
                    }
                    return new Response('success');
                }

            } catch (e) {
                return errRes('API Error: ' + e.message, 500);
            }
        }

        // 如果不是 API 请求，Cloudflare Pages 默认会继续尝试服务静态资源 (如果存在)
        // 在高级模式下，如果需要手动服务静态资源，可以使用 env.ASSETS.fetch(request)
        if (env.ASSETS) {
             return env.ASSETS.fetch(request);
        }

        return new Response('Not Found', { status: 404 });
    }
};
