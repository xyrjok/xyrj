/**
 * Cloudflare Worker Faka Backend (MPA 完全版)
 * 包含: 支付宝当面付(签名+验签), 商品/分类/订单/卡密/文章/支付/设置管理, MPA路由
 */

// === 工具函数 ===
const jsonRes = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } });
const errRes = (msg, status = 400) => jsonRes({ error: msg }, status);
const time = () => Math.floor(Date.now() / 1000);
const uuid = () => crypto.randomUUID().replace(/-/g, '');

// === 支付宝签名与验签 ===

/**
 * 导入 PKCS8 私钥 (用于签名)
 * @param {string} pem - PKCS8 PEM 格式的私钥字符串 (可包含头尾和换行)
 */
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

/**
 * 导入 X.509 公钥 (用于验签)
 * @param {string} pem - X.509 PEM 格式的公钥字符串 (可包含头尾和换行)
 */
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

/**
 * 对支付宝参数进行签名
 * @param {Object} params - 待签名的参数对象
 * @param {string} privateKeyPem - 你的应用私钥
 */
async function signAlipay(params, privateKeyPem) {
    const key = await importRsaPrivateKey(privateKeyPem);
    // 筛选、排序、拼接
    const sortedParams = Object.keys(params)
        .filter(k => k !== 'sign' && params[k] !== undefined && params[k] !== '')
        .sort()
        .map(k => `${k}=${params[k]}`) // 注意：biz_content 已经是字符串了
        .join('&');
    
    const signature = await crypto.subtle.sign(
        "RSASSA-PKCS1-v1_5",
        key,
        new TextEncoder().encode(sortedParams)
    );
    // 转换为 Base64
    return btoa(String.fromCharCode(...new Uint8Array(signature)));
}

/**
 * 验证支付宝回调签名
 * @param {Object} params - 支付宝回调的 Form Data 对象 (key-value)
 * @param {string} alipayPublicKeyPem - 你的支付宝公钥
 */
async function verifyAlipaySignature(params, alipayPublicKeyPem) {
    try {
        const key = await importRsaPublicKey(alipayPublicKeyPem);
        const sign = params.sign;
        const signType = params.sign_type;
        if (signType !== 'RSA2') return false;
        
        // 筛选、排序、拼接
        const sortedParams = Object.keys(params)
            .filter(k => k !== 'sign' && k !== 'sign_type' && params[k] !== undefined && params[k] !== '')
            .sort()
            .map(k => `${k}=${params[k]}`)
            .join('&');

        // 解码 Base64 签名
        const signature = Uint8Array.from(atob(sign), c => c.charCodeAt(0));
        
        return await crypto.subtle.verify(
            "RSASSA-PKCS1-v1_5",
            key,
            signature,
            new TextEncoder().encode(sortedParams)
        );
    } catch (e) {
        console.error("Alipay verify error:", e.message);
        return false;
    }
}

// === 主路由 ===
export default {
    async fetch(request, env, ctx) {
        const url = new URL(request.url);
        const path = url.pathname;

        try {
            // 1. API 路由
            if (path.startsWith('/api/')) {
                return handleApi(request, env, url);
            }

            // 2. 静态资源路由重写 (MPA 核心支持)
            const theme = 'default'; // 此处可从数据库读取, 暂时写死
            
            // 访问根目录 /
            if (path === '/') {
                return env.ASSETS.fetch(new Request(`${url.origin}/themes/${theme}/index.html`, request));
            }
            
            // 访问 /some-page.html
            if (path.endsWith('.html') && !path.startsWith('/admin/') && !path.startsWith('/themes/')) {
                 return env.ASSETS.fetch(new Request(`${url.origin}/themes/${theme}${path}`, request));
            }

            // 3. 默认静态资源处理 (admin/*, themes/*, config.js 等)
            return env.ASSETS.fetch(request);
            
        } catch (e) {
            return errRes(e.message, 500);
        }
    }
};

// === API 路由处理器 ===
async function handleApi(request, env, url) {
    const method = request.method;
    const path = url.pathname;

    try {
        // ===========================
        // --- 管理员 API (Admin) ---
        // ===========================
        if (path.startsWith('/api/admin/')) {
            if (path === '/api/admin/login') {
                if (method !== 'POST') return errRes('Method Not Allowed', 405);
                const { user, pass } = await request.json();
                if (user === env.ADMIN_USER && pass === env.ADMIN_PASS) {
                    return jsonRes({ token: env.ADMIN_TOKEN });
                }
                return errRes('用户名或密码错误', 401);
            }
            
            // 鉴权中间件
            const authHeader = request.headers.get('Authorization');
            if (!authHeader || !authHeader.endsWith(env.ADMIN_TOKEN)) {
                return errRes('Unauthorized', 401);
            }
            
            // --- 登录后才能访问的 Admin API ---

            if (path === '/api/admin/dashboard') {
                const today = new Date().setHours(0,0,0,0) / 1000;
                return jsonRes({
                    orders_today: (await env.MY_XYRJ.prepare("SELECT COUNT(*) as c FROM orders WHERE created_at >= ?").bind(today).first()).c,
                    income_today: (await env.MY_XYRJ.prepare("SELECT SUM(total_amount) as s FROM orders WHERE status >= 1 AND paid_at >= ?").bind(today).first()).s || 0,
                    cards_unsold: (await env.MY_XYRJ.prepare("SELECT COUNT(*) as c FROM cards WHERE status = 0").first()).c,
                });
            }
            
            // -- 商品管理 (Products) --
            if (path === '/api/admin/products/list') {
                const products = await env.MY_XYRJ.prepare("SELECT * FROM products ORDER BY sort DESC").all();
                for (let p of products.results) {
                    const variants = (await env.MY_XYRJ.prepare("SELECT * FROM variants WHERE product_id = ?").bind(p.id).all()).results;
                    // 修复：解析 wholesale_config
                    p.variants = variants.map(v => ({
                        ...v,
                        wholesale_config: v.wholesale_config ? JSON.parse(v.wholesale_config) : null
                    }));
                }
                return jsonRes(products.results);
            }

            if (path === '/api/admin/product/save' && method === 'POST') {
                const data = await request.json();
                let productId = data.id;

                if (productId) {
                    await env.MY_XYRJ.prepare("UPDATE products SET name=?, description=?, sort=?, active=?, category_id=? WHERE id=?")
                        .bind(data.name, data.description, data.sort, data.active, data.category_id, productId).run();
                } else {
                    const res = await env.MY_XYRJ.prepare("INSERT INTO products (name, description, sort, active, category_id, created_at) VALUES (?, ?, ?, ?, ?, ?)")
                        .bind(data.name, data.description, data.sort, data.active, data.category_id, time()).run();
                    productId = res.meta.last_row_id;
                }
                
                // 处理规格 (Variants) - 采用有 ID 更新、无 ID 插入、多余删除的逻辑
                const existingVariants = (await env.MY_XYRJ.prepare("SELECT id FROM variants WHERE product_id = ?").bind(productId).all()).results;
                const newVariantIds = new Set();
                const updateStmts = [];
                const insertStmt = env.MY_XYRJ.prepare(
                    `INSERT INTO variants (product_id, name, price, color, image_url, wholesale_config, custom_markup, created_at) 
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
                );
                const updateStmt = env.MY_XYRJ.prepare(
                    `UPDATE variants SET name=?, price=?, color=?, image_url=?, wholesale_config=?, custom_markup=? 
                     WHERE id=? AND product_id=?`
                );

                for (const v of data.variants) {
                    const wholesaleConfig = v.wholesale_config ? JSON.stringify(v.wholesale_config) : null;
                    if (v.id) {
                        // 更新
                        newVariantIds.add(v.id);
                        updateStmts.push(updateStmt.bind(
                            v.name, v.price, v.color, v.image_url, wholesaleConfig, v.custom_markup,
                            v.id, productId
                        ));
                    } else {
                        // 插入
                        updateStmts.push(insertStmt.bind(
                            productId, v.name, v.price, v.color, v.image_url, wholesaleConfig, v.custom_markup, time()
                        ));
                    }
                }
                
                // 删除
                const deleteStmt = env.MY_XYRJ.prepare("DELETE FROM variants WHERE id = ?");
                for (const ev of existingVariants) {
                    if (!newVariantIds.has(ev.id)) {
                        updateStmts.push(deleteStmt.bind(ev.id));
                    }
                }

                if (updateStmts.length > 0) await env.MY_XYRJ.batch(updateStmts);
                return jsonRes({ success: true, id: productId });
            }
            
            // -- 分类管理 (Categories) --
            if (path === '/api/admin/categories/list') {
                return jsonRes((await env.MY_XYRJ.prepare("SELECT * FROM categories ORDER BY sort DESC").all()).results);
            }
            if (path === '/api/admin/category/save' && method === 'POST') {
                const data = await request.json();
                if(data.id) {
                    await env.MY_XYRJ.prepare("UPDATE categories SET name=?, sort=? WHERE id=?").bind(data.name, data.sort, data.id).run();
                } else {
                    await env.MY_XYRJ.prepare("INSERT INTO categories (name, sort) VALUES (?, ?)").bind(data.name, data.sort).run();
                }
                return jsonRes({ success: true });
            }
            if (path === '/api/admin/category/delete' && method === 'POST') {
                const { id } = await request.json();
                if(id === 1) return errRes('默认分类不能删除');
                await env.MY_XYRJ.batch([
                    env.MY_XYRJ.prepare("DELETE FROM categories WHERE id = ?").bind(id),
                    env.MY_XYRJ.prepare("UPDATE products SET category_id = 1 WHERE category_id = ?").bind(id) // 商品移至默认分类
                ]);
                return jsonRes({ success: true });
            }

            // -- 卡密管理 (Cards) --
            if (path === '/api/admin/cards/import' && method === 'POST') {
                const { variant_id, content } = await request.json();
                const cards = content.split('\n').filter(c => c.trim()).map(c => c.trim());
                if (cards.length > 0) {
                    const stmt = env.MY_XYRJ.prepare("INSERT INTO cards (variant_id, content, status, created_at) VALUES (?, ?, 0, ?)");
                    await env.MY_XYRJ.batch(cards.map(c => stmt.bind(variant_id, c, time())));
                    await env.MY_XYRJ.prepare("UPDATE variants SET stock = (SELECT COUNT(*) FROM cards WHERE variant_id=? AND status=0) WHERE id = ?")
                        .bind(variant_id, variant_id).run();
                }
                return jsonRes({ imported: cards.length });
            }
            if (path === '/api/admin/cards/list') {
                const vid = url.searchParams.get('variant_id');
                const cards = await env.MY_XYRJ.prepare("SELECT * FROM cards WHERE variant_id=? ORDER BY id DESC").bind(vid).all();
                return jsonRes(cards.results);
            }
            if (path === '/api/admin/card/delete' && method === 'POST') {
                const { id } = await request.json();
                const card = await env.MY_XYRJ.prepare("SELECT * FROM cards WHERE id=?").bind(id).first();
                if(card.status !== 0) return errRes('已售出的卡密不能删除');
                
                await env.MY_XYRJ.prepare("DELETE FROM cards WHERE id=?").bind(id).run();
                // 重新计算库存
                await env.MY_XYRJ.prepare("UPDATE variants SET stock = (SELECT COUNT(*) FROM cards WHERE variant_id=? AND status=0) WHERE id = ?")
                        .bind(card.variant_id, card.variant_id).run();
                return jsonRes({ success: true });
            }

            // -- 订单管理 (Orders) --
            if (path === '/api/admin/orders/list') {
                const orders = await env.MY_XYRJ.prepare("SELECT * FROM orders ORDER BY created_at DESC").all();
                return jsonRes(orders.results);
            }
            
            // -- 文章管理 (Articles) --
            if (path === '/api/admin/articles/list') {
                return jsonRes((await env.MY_XYRJ.prepare("SELECT id, title, is_notice, created_at FROM articles ORDER BY created_at DESC").all()).results);
            }
            if (path === '/api/admin/article/get') {
                return jsonRes(await env.MY_XYRJ.prepare("SELECT * FROM articles WHERE id=?").bind(url.searchParams.get('id')).first());
            }
            if (path === '/api/admin/article/save' && method === 'POST') {
                const data = await request.json();
                const now = time();
                if(data.id) {
                    await env.MY_XYRJ.prepare("UPDATE articles SET title=?, content=?, is_notice=?, updated_at=? WHERE id=?")
                        .bind(data.title, data.content, data.is_notice, now, data.id).run();
                } else {
                    await env.MY_XYRJ.prepare("INSERT INTO articles (title, content, is_notice, created_at, updated_at) VALUES (?, ?, ?, ?, ?)")
                        .bind(data.title, data.content, data.is_notice, now, now).run();
                }
                return jsonRes({ success: true });
            }
            if (path === '/api/admin/article/delete' && method === 'POST') {
                await env.MY_XYRJ.prepare("DELETE FROM articles WHERE id=?").bind((await request.json()).id).run();
                return jsonRes({ success: true });
            }

            // -- 支付管理 (Gateways) --
            if (path === '/api/admin/gateways/list') {
                return jsonRes((await env.MY_XYRJ.prepare("SELECT * FROM pay_gateways").all()).results);
            }
            if (path === '/api/admin/gateway/save' && method === 'POST') {
                const data = await request.json();
                const configStr = JSON.stringify(data.config || {});
                if(data.id) {
                     await env.MY_XYRJ.prepare("UPDATE pay_gateways SET name=?, type=?, config=?, active=? WHERE id=?")
                        .bind(data.name, data.type, configStr, data.active, data.id).run();
                } else {
                    await env.MY_XYRJ.prepare("INSERT INTO pay_gateways (name, type, config, active) VALUES (?, ?, ?, ?)")
                        .bind(data.name, data.type, configStr, data.active).run();
                }
                return jsonRes({success: true});
            }

            // -- 系统设置 (Settings) --
            if (path === '/api/admin/settings/save' && method === 'POST') {
                const { site_name, announce } = await request.json();
                await env.MY_XYRJ.batch([
                    env.MY_XYRJ.prepare("UPDATE site_config SET value = ? WHERE key = 'site_name'").bind(site_name),
                    env.MY_XYRJ.prepare("UPDATE site_config SET value = ? WHERE key = 'announce'").bind(announce)
                ]);
                return jsonRes({success: true});
            }
        }

        // ===========================
        // --- 公开 API (Shop) ---
        // ===========================

        if (path === '/api/shop/config') {
            const res = await env.MY_XYRJ.prepare("SELECT * FROM site_config").all();
            const config = {}; res.results.forEach(r => config[r.key] = r.value);
            
            // 检查是否有公告
            const notice = await env.MY_XYRJ.prepare("SELECT content FROM articles WHERE is_notice = 1 ORDER BY created_at DESC LIMIT 1").first();
            if(notice) config.notice_content = notice.content; // 使用文章公告覆盖默认公告
            
            return jsonRes(config);
        }

        if (path === '/api/shop/products') {
            const res = await env.MY_XYRJ.prepare("SELECT * FROM products WHERE active=1 ORDER BY sort DESC").all();
            for (let p of res.results) {
                // 前台获取完整的变体信息用于展示 (解析 wholesale_config)
                const variants = (await env.MY_XYRJ.prepare("SELECT * FROM variants WHERE product_id=?").bind(p.id).all()).results;
                p.variants = variants.map(v => ({
                    ...v,
                    wholesale_config: v.wholesale_config ? JSON.parse(v.wholesale_config) : null
                }));
            }
            return jsonRes(res.results);
        }

        if (path === '/api/shop/product/detail') {
            // (此路由在 MPA 架构中暂未使用，但保留)
            const id = url.searchParams.get('id');
            const p = await env.MY_XYRJ.prepare("SELECT * FROM products WHERE id=? AND active=1").bind(id).first();
            if(!p) return errRes('商品不存在', 404);
            const variants = (await env.MY_XYRJ.prepare("SELECT * FROM variants WHERE product_id=?").bind(id).all()).results;
            p.variants = variants.map(v => ({
                ...v,
                wholesale_config: v.wholesale_config ? JSON.parse(v.wholesale_config) : null
            }));
            return jsonRes(p);
        }
        
        // -- 文章 API --
        if (path === '/api/shop/articles/list') {
            return jsonRes((await env.MY_XYRJ.prepare("SELECT id, title, created_at FROM articles WHERE is_notice=0 ORDER BY created_at DESC").all()).results);
        }
        if (path === '/api/shop/article/get') {
            const id = url.searchParams.get('id');
            return jsonRes(await env.MY_XYRJ.prepare("SELECT title, content, created_at FROM articles WHERE id=?").bind(id).first());
        }

        if (path === '/api/shop/order/create' && method === 'POST') {
            const { variant_id, quantity, contact } = await request.json();
            const variant = await env.MY_XYRJ.prepare("SELECT * FROM variants WHERE id=?").bind(variant_id).first();
            if (!variant) return errRes('规格不存在');
            
            // TODO: 此处应实现一个库存锁定机制，防止超卖
            if (variant.stock < quantity) return errRes('库存不足');

            const product = await env.MY_XYRJ.prepare("SELECT name FROM products WHERE id=?").bind(variant.product_id).first();
            const order_id = uuid();
            
            // === 价格计算 ===
            let finalPrice = variant.price;
            // 1. 检查批发价
            if (variant.wholesale_config) {
                const config = JSON.parse(variant.wholesale_config);
                let matchedPrice = null;
                // 倒序查找匹配的最大数量
                config.sort((a, b) => b.qty - a.qty).forEach(tier => {
                    if (quantity >= tier.qty && matchedPrice === null) {
                        matchedPrice = tier.price;
                    }
                });
                if (matchedPrice !== null) finalPrice = matchedPrice;
            }
            // 2. 应用自选加价
            finalPrice += (variant.custom_markup || 0);
            
            const total_amount = (finalPrice * quantity).toFixed(2);

            await env.MY_XYRJ.prepare(
                "INSERT INTO orders (id, variant_id, product_name, variant_name, price, quantity, total_amount, contact, payment_method, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)"
            ).bind(order_id, variant_id, product.name, variant.name, finalPrice, quantity, total_amount, contact, 'alipay_f2f', time()).run();

            return jsonRes({ order_id, total_amount, payment_method: 'alipay_f2f' });
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
                
                const bizContent = {
                    out_trade_no: order.id,
                    total_amount: order.total_amount,
                    subject: `${order.product_name} - ${order.variant_name}`
                };

                const params = {
                    app_id: config.app_id,
                    method: 'alipay.trade.precreate',
                    format: 'JSON', charset: 'utf-8', sign_type: 'RSA2', version: '1.0',
                    timestamp: new Date().toISOString().replace('T', ' ').split('.')[0],
                    notify_url: `${url.origin}/api/notify/alipay`,
                    biz_content: JSON.stringify(bizContent)
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
            if (order && order.status >= 1) { // 1=已支付, 2=已发货
                return jsonRes({ status: order.status, cards: JSON.parse(order.cards_sent || '[]') });
            }
            return jsonRes({ status: 0 }); // 0=待支付
        }

        // ===========================
        // --- 支付回调 (Notify) ---
        // ===========================
        if (path === '/api/notify/alipay' && method === 'POST') {
            const formData = await request.formData();
            const params = Object.fromEntries(formData.entries());

            // 1. 获取支付配置
            const gateway = await env.MY_XYRJ.prepare("SELECT config FROM pay_gateways WHERE type='alipay_f2f' AND active=1").first();
            if(!gateway) { console.error('Alipay Notify: Gateway not found'); return new Response('fail'); }
            const config = JSON.parse(gateway.config);

            // 2. 验签
            const verified = await verifyAlipaySignature(params, config.alipay_public_key);
            if (!verified) {
                console.error('Alipay Notify: Signature verification failed');
                return new Response('fail');
            }

            // 3. 处理业务
            if (params.trade_status === 'TRADE_SUCCESS') {
                const out_trade_no = params.out_trade_no;
                const trade_no = params.trade_no;
                
                // 4. 检查订单状态，防止重复处理
                const order = await env.MY_XYRJ.prepare("SELECT * FROM orders WHERE id=? AND status=0").bind(out_trade_no).first();
                
                if (order) {
                    // 更新订单为“已支付”
                    await env.MY_XYRJ.prepare("UPDATE orders SET status=1, paid_at=?, trade_no=? WHERE id=?")
                        .bind(time(), trade_no, out_trade_no).run();
                    
                    // 5. 提取卡密
                    const cards = await env.MY_XYRJ.prepare("SELECT id, content FROM cards WHERE variant_id=? AND status=0 LIMIT ?")
                        .bind(order.variant_id, order.quantity).all();
                    
                    if (cards.results.length >= order.quantity) {
                        const cardIds = cards.results.map(c => c.id);
                        const cardContents = cards.results.map(c => c.content);
                        
                        // 标记卡密为“已售出”并更新订单
                        await env.MY_XYRJ.batch([
                            env.MY_XYRJ.prepare(`UPDATE cards SET status=1, order_id=? WHERE id IN (${cardIds.map(_=>'?').join(',')})`)
                                .bind(out_trade_no, ...cardIds),
                            
                            env.MY_XYRJ.prepare("UPDATE orders SET status=2, cards_sent=? WHERE id=?") // 2=已发货
                                .bind(JSON.stringify(cardContents), out_trade_no),
                            
                            // 更新库存 和 销量(sales_count)
                            env.MY_XYRJ.prepare("UPDATE variants SET stock = stock - ?, sales_count = sales_count + ? WHERE id=?")
                                .bind(order.quantity, order.quantity, order.variant_id)
                        ]);
                    } else {
                        // 库存不足，订单标记为异常（需要人工处理）
                        console.error(`Order ${out_trade_no} paid but insufficient cards!`);
                        await env.MY_XYRJ.prepare("UPDATE orders SET status=-1 WHERE id=?").bind(out_trade_no).run(); // -1 = 异常
                    }
                }
            }
            return new Response('success');
        }

    } catch (e) {
        console.error("API Error", e.stack);
        return errRes('API Error: ' + e.message, 500);
    }

    return errRes('API Not Found', 404);
}
