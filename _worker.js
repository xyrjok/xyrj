/**
 * Cloudflare Worker Faka Backend (MPA 完全版 - 包含所有功能)
 */

// === 工具函数 ===
const jsonRes = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } });
const errRes = (msg, status = 400) => jsonRes({ error: msg }, status);
const time = () => Math.floor(Date.now() / 1000);
const uuid = () => crypto.randomUUID().replace(/-/g, '');

// === 支付宝签名与验签核心 (Web Crypto API) ===

/**
 * [签名] 对参数进行 RSA2 签名
 * @param {object} params - 待签名参数
 * @param {string} privateKeyPem - PKCS8 PEM 格式私钥
 */
async function signAlipay(params, privateKeyPem) {
    // 1. 排序并拼接参数
    const sortedParams = Object.keys(params)
        .filter(k => k !== 'sign' && params[k] !== undefined && params[k] !== null && params[k] !== '')
        .sort()
        .map(k => `${k}=${params[k]}`) // 注意：支付宝文档说 biz_content 整体作为值，但实测对象也需转JSON
        .join('&');

    // 2. 导入私钥
    let pemContents = privateKeyPem.replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\s+|\n/g, '');
    let binaryDer = Uint8Array.from(atob(pemContents), c => c.charCodeAt(0));
    const key = await crypto.subtle.importKey(
        "pkcs8",
        binaryDer.buffer,
        { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
        false,
        ["sign"]
    );

    // 3. 签名
    const signature = await crypto.subtle.sign(
        "RSASSA-PKCS1-v1_5",
        key,
        new TextEncoder().encode(sortedParams)
    );

    // 4. Base64 编码
    return btoa(String.fromCharCode(...new Uint8Array(signature)));
}

/**
 * [验签] 验证支付宝异步通知
 * @param {object} params - 支付宝 POST 过来的所有参数
 * @param {string} alipayPublicKeyPem - 支付宝公钥
 */
async function verifyAlipaySignature(params, alipayPublicKeyPem) {
    try {
        const sign = params.sign;
        if (!sign) return false;

        // 1. 排序并拼接参数 (不包含 sign 和 sign_type)
        const sortedParams = Object.keys(params)
            .filter(k => k !== 'sign' && k !== 'sign_type' && params[k] !== undefined && params[k] !== null && params[k] !== '')
            .sort()
            .map(k => `${k}=${params[k]}`)
            .join('&');
        
        // 2. 导入支付宝公钥
        let pemContents = alipayPublicKeyPem.replace(/-----BEGIN PUBLIC KEY-----|-----END PUBLIC KEY-----|\s+|\n/g, '');
        let binaryDer = Uint8Array.from(atob(pemContents), c => c.charCodeAt(0));
        const key = await crypto.subtle.importKey(
            "spki",
            binaryDer.buffer,
            { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
            false,
            ["verify"]
        );

        // 3. 解码签名 (Base64)
        const signatureBin = Uint8Array.from(atob(sign), c => c.charCodeAt(0));

        // 4. 验证
        return await crypto.subtle.verify(
            "RSASSA-PKCS1-v1_5",
            key,
            signatureBin.buffer,
            new TextEncoder().encode(sortedParams)
        );
    } catch (e) {
        console.error('Alipay verify error:', e);
        return false;
    }
}


// === 主入口 ===
export default {
    async fetch(request, env, ctx) {
        const url = new URL(request.url);
        const path = url.pathname;

        // === 1. API 路由处理 ===
        if (path.startsWith('/api/')) {
            return handleApi(request, env, url);
        }

        // === 2. 静态资源路由重写 (MPA 核心支持) ===
        // 目标：访问 / => 显示 /themes/default/index.html
        // 访问 /product.html => 显示 /themes/default/product.html

        let theme = 'default'; // 暂时硬编码，未来可从 D1 读取
        
        // 规则 1: 根路径
        if (path === '/' || path === '/index.html') {
             // 使用内部抓取 (fetch) 来重写，而不是重定向
            const newUrl = new URL(`/themes/${theme}/index.html`, url.origin);
            return env.ASSETS.fetch(new Request(newUrl, request));
        }
        
        // 规则 2: /admin/ 路径下的静态文件
        if (path.startsWith('/admin/')) {
             return env.ASSETS.fetch(request);
        }

        // 规则 3: /themes/ 路径下的静态文件 (如 /themes/default/assets/css/style.css)
        if (path.startsWith('/themes/')) {
            return env.ASSETS.fetch(request);
        }
        
        // 规则 4: 根目录的其他 .html 文件 (如 /product.html, /pay.html)
        if (path.endsWith('.html')) {
            const newUrl = new URL(`/themes/${theme}${path}`, url.origin);
            const newRequest = new Request(newUrl, request);
            
            // 尝试抓取主题文件，如果 404，则回退到原始请求（以防万一）
            const response = await env.ASSETS.fetch(newRequest);
            if (response.status === 404) {
                return env.ASSETS.fetch(request);
            }
            return response;
        }

        // === 3. 默认静态资源回退 ===
        // 处理 /config.js, /assets/img/logo.png 等其他根目录资源
        return env.ASSETS.fetch(request);
    }
};

// === 完整的 API 处理逻辑 ===
async function handleApi(request, env, url) {
    const method = request.method;
    const path = url.pathname;
    const db = env.MY_XYRJ; // 数据库绑定

    try {
        // ===========================
        // --- 管理员 API (Admin) ---
        // ===========================
        if (path.startsWith('/api/admin/')) {
            
            // 登录接口豁免
            if (path === '/api/admin/login') {
                if (method === 'POST') {
                    const { user, pass } = await request.json();
                    if (user === env.ADMIN_USER && pass === env.ADMIN_PASS) {
                        return jsonRes({ token: env.ADMIN_TOKEN });
                    }
                    return errRes('用户名或密码错误', 401);
                }
                return errRes('Method Not Allowed', 405);
            }

            // 非登录接口的鉴权
            const authHeader = request.headers.get('Authorization');
            if (!authHeader || authHeader !== `Bearer ${env.ADMIN_TOKEN}`) {
                return errRes('Unauthorized', 401);
            }

            // --- 仪表盘 ---
            if (path === '/api/admin/dashboard') {
                const today = new Date().setHours(0,0,0,0) / 1000;
                const stats = {};
                stats.orders_today = (await db.prepare("SELECT COUNT(*) as c FROM orders WHERE created_at >= ?").bind(today).first()).c;
                stats.income_today = (await db.prepare("SELECT SUM(total_amount) as s FROM orders WHERE status >= 1 AND paid_at >= ?").bind(today).first()).s || 0;
                stats.cards_unsold = (await db.prepare("SELECT COUNT(*) as c FROM cards WHERE status = 0").first()).c;
                stats.orders_pending = (await db.prepare("SELECT COUNT(*) as c FROM orders WHERE status = 0").first()).c;
                return jsonRes(stats);
            }

            // --- 商品分类 API ---
            if (path === '/api/admin/categories/list') {
                const { results } = await db.prepare("SELECT * FROM categories ORDER BY sort DESC, id DESC").all();
                return jsonRes(results);
            }
            if (path === '/api/admin/category/save' && method === 'POST') {
                const { id, name, sort } = await request.json();
                if (id) {
                    await db.prepare("UPDATE categories SET name=?, sort=? WHERE id=?").bind(name, sort, id).run();
                } else {
                    await db.prepare("INSERT INTO categories (name, sort) VALUES (?, ?)").bind(name, sort).run();
                }
                return jsonRes({ success: true });
            }
            if (path === '/api/admin/category/delete' && method === 'POST') {
                const { id } = await request.json();
                if (id === 1) return errRes('默认分类不能删除');
                // 将该分类下的商品移至默认分类
                await db.prepare("UPDATE products SET category_id = 1 WHERE category_id = ?").bind(id).run();
                await db.prepare("DELETE FROM categories WHERE id = ?").bind(id).run();
                return jsonRes({ success: true });
            }

            // --- 商品管理 API ---
            if (path === '/api/admin/products/list') {
                const products = (await db.prepare("SELECT * FROM products ORDER BY sort DESC, id DESC").all()).results;
                for (let p of products) {
                    p.variants = (await db.prepare("SELECT * FROM variants WHERE product_id = ?").bind(p.id).all()).results;
                    // 修复：将 wholesale_config 转回对象，方便后台编辑
                    p.variants.forEach(v => {
                        if (v.wholesale_config) {
                             try { v.wholesale_config = JSON.parse(v.wholesale_config); } catch(e) { v.wholesale_config = null; }
                        }
                    });
                }
                return jsonRes(products);
            }
            
            if (path === '/api/admin/product/save' && method === 'POST') {
                const data = await request.json();
                let productId = data.id;

                // 1. 保存主商品
                if (productId) {
                    await db.prepare("UPDATE products SET name=?, description=?, category_id=?, sort=?, active=? WHERE id=?")
                        .bind(data.name, data.description, data.category_id, data.sort, data.active, productId).run();
                } else {
                    const res = await db.prepare("INSERT INTO products (name, description, category_id=?, sort=?, active=?, created_at=?) VALUES (?, ?, ?, ?, ?, ?)")
                        .bind(data.category_id, data.sort, data.active, time(), data.name, data.description).run();
                    productId = res.meta.last_row_id;
                }

                // 2. 处理规格 (采用 Diff 策略：更新/插入/删除)
                const existingVariants = (await db.prepare("SELECT id FROM variants WHERE product_id=?").bind(productId).all()).results;
                const newVariantIds = [];
                const updateStmts = [];
                const insertStmt = db.prepare(`
                    INSERT INTO variants (product_id, name, price, stock, color, image_url, wholesale_config, custom_markup, auto_delivery, sales_count, created_at) 
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                `);
                const updateStmt = db.prepare(`
                    UPDATE variants SET name=?, price=?, stock=?, color=?, image_url=?, wholesale_config=?, custom_markup=?, auto_delivery=?, sales_count=?
                    WHERE id=? AND product_id=?
                `);

                for (const v of data.variants) {
                    // 修正：保存时将 wholesale_config 转回 JSON 字符串
                    const wholesale_config_json = v.wholesale_config ? JSON.stringify(v.wholesale_config) : null;
                    
                    if (v.id) { // 更新
                        newVariantIds.push(v.id);
                        updateStmts.push(
                            updateStmt.bind(
                                v.name, v.price, v.stock || 0, v.color, v.image_url, wholesale_config_json, 
                                v.custom_markup || 0, v.auto_delivery, v.sales_count || 0, v.id, productId
                            )
                        );
                    } else { // 插入
                        updateStmts.push(
                            insertStmt.bind(
                                productId, v.name, v.price, v.stock || 0, v.color, v.image_url, wholesale_config_json,
                                v.custom_markup || 0, v.auto_delivery, v.sales_count || 0, time()
                            )
                        );
                    }
                }
                
                // 3. 删除旧规格
                const deleteIds = existingVariants.filter(v => !newVariantIds.includes(v.id)).map(v => v.id);
                if (deleteIds.length > 0) {
                    // 注意：删除规格会级联删除关联的卡密，请确保前端已提示
                    updateStmts.push(db.prepare(`DELETE FROM variants WHERE id IN (${deleteIds.join(',')})`));
                }

                if (updateStmts.length > 0) {
                    await db.batch(updateStmts);
                }
                return jsonRes({ success: true, productId: productId });
            }
            
            // --- 订单管理 API ---
            if (path === '/api/admin/orders/list') {
                const { results } = await db.prepare("SELECT * FROM orders ORDER BY created_at DESC LIMIT 100").all();
                return jsonRes(results);
            }

            // --- 卡密管理 API ---
            if (path === '/api/admin/cards/list') {
                const variant_id = url.searchParams.get('variant_id');
                const { results } = await db.prepare("SELECT * FROM cards WHERE variant_id = ? ORDER BY id DESC").bind(variant_id).all();
                return jsonRes(results);
            }
            if (path === '/api/admin/cards/import' && method === 'POST') {
                const { variant_id, content } = await request.json();
                const cards = content.split('\n').filter(c => c.trim()).map(c => c.trim());
                if (cards.length > 0) {
                    const stmt = db.prepare("INSERT INTO cards (variant_id, content, status, created_at) VALUES (?, ?, 0, ?)");
                    await db.batch(cards.map(c => stmt.bind(variant_id, c, time())));
                    // 更新库存
                    await db.prepare("UPDATE variants SET stock = (SELECT COUNT(*) FROM cards WHERE variant_id=? AND status=0) WHERE id = ?")
                        .bind(variant_id, variant_id).run();
                }
                return jsonRes({ imported: cards.length });
            }
             if (path === '/api/admin/card/delete' && method === 'POST') {
                const { id } = await request.json();
                const card = await db.prepare("SELECT variant_id, status FROM cards WHERE id=?").bind(id).first();
                if (!card) return errRes('卡密不存在');
                if (card.status !== 0) return errRes('只能删除未售出的卡密');
                
                await db.prepare("DELETE FROM cards WHERE id=?").bind(id).run();
                // 更新库存
                await db.prepare("UPDATE variants SET stock = (SELECT COUNT(*) FROM cards WHERE variant_id=? AND status=0) WHERE id = ?")
                        .bind(card.variant_id, card.variant_id).run();
                return jsonRes({ success: true });
            }

            // --- 支付网关 API ---
            if (path === '/api/admin/gateways/list') {
                 let { results } = await db.prepare("SELECT * FROM pay_gateways").all();
                 // 如果列表为空，自动初始化一个
                 if (results.length === 0) {
                     const emptyConfig = { app_id: "", private_key: "", alipay_public_key: "" };
                     await db.prepare("INSERT INTO pay_gateways (name, type, config, active) VALUES (?, ?, ?, ?)")
                        .bind('支付宝当面付', 'alipay_f2f', JSON.stringify(emptyConfig), 0).run();
                     results = (await db.prepare("SELECT * FROM pay_gateways").all()).results;
                 }
                 // 解析 config
                 results.forEach(g => g.config = JSON.parse(g.config));
                 return jsonRes(results);
            }
            if (path === '/api/admin/gateway/save' && method === 'POST') {
                const { id, name, type, config, active } = await request.json();
                await db.prepare("UPDATE pay_gateways SET name=?, type=?, config=?, active=? WHERE id=?")
                   .bind(name, type, JSON.stringify(config), active, id).run();
                return jsonRes({success: true});
            }

            // --- 文章分类 API ---
            if (path === '/api/admin/article_categories/list') {
                const { results } = await db.prepare("SELECT * FROM article_categories ORDER BY sort DESC, id DESC").all();
                return jsonRes(results);
            }
            if (path === '/api/admin/article_category/save' && method === 'POST') {
                const { id, name, sort } = await request.json();
                if (id) {
                    await db.prepare("UPDATE article_categories SET name=?, sort=? WHERE id=?").bind(name, sort, id).run();
                } else {
                    await db.prepare("INSERT INTO article_categories (name, sort) VALUES (?, ?)").bind(name, sort).run();
                }
                return jsonRes({ success: true });
            }
            if (path === '/api/admin/article_category/delete' && method === 'POST') {
                const { id } = await request.json();
                if (id === 1) return errRes('默认分类不能删除');
                await db.prepare("UPDATE articles SET category_id = 1 WHERE category_id = ?").bind(id).run();
                await db.prepare("DELETE FROM article_categories WHERE id = ?").bind(id).run();
                return jsonRes({ success: true });
            }

            // --- 文章管理 API ---
            if (path === '/api/admin/articles/list') {
                const { results } = await db.prepare(`
                    SELECT a.*, ac.name as category_name 
                    FROM articles a 
                    LEFT JOIN article_categories ac ON a.category_id = ac.id
                    ORDER BY a.created_at DESC
                `).all();
                return jsonRes(results);
            }
            if (path === '/api/admin/article/save' && method === 'POST') {
                const { id, title, content, is_notice, category_id } = await request.json();
                const now = time();
                if (id) {
                    await db.prepare("UPDATE articles SET title=?, content=?, is_notice=?, category_id=?, updated_at=? WHERE id=?")
                        .bind(title, content, is_notice, category_id, now, id).run();
                } else {
                    await db.prepare("INSERT INTO articles (title, content, is_notice, category_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)")
                        .bind(title, content, is_notice, category_id, now, now).run();
                }
                return jsonRes({ success: true });
            }
            if (path === '/api/admin/article/delete' && method === 'POST') {
                const { id } = await request.json();
                await db.prepare("DELETE FROM articles WHERE id=?").bind(id).run();
                return jsonRes({ success: true });
            }
            
            // --- 系统设置 API ---
            if (path === '/api/admin/settings/get') {
                const res = await db.prepare("SELECT * FROM site_config").all();
                const config = {}; res.results.forEach(r => config[r.key] = r.value);
                return jsonRes(config);
            }
            if (path === '/api/admin/settings/save' && method === 'POST') {
                const settings = await request.json();
                const stmts = Object.keys(settings).map(key => 
                    db.prepare("UPDATE site_config SET value = ? WHERE key = ?").bind(settings[key], key)
                );
                await db.batch(stmts);
                return jsonRes({ success: true });
            }
        }

        // ===========================
        // --- 公开 API (Shop) ---
        // ===========================

        if (path === '/api/shop/config') {
            const res = await db.prepare("SELECT * FROM site_config").all();
            const config = {}; res.results.forEach(r => config[r.key] = r.value);
            // 额外获取置顶公告
            const notice = await db.prepare("SELECT content FROM articles WHERE is_notice=1 ORDER BY created_at DESC LIMIT 1").first();
            if(notice) config.notice_content = notice.content;
            
            return jsonRes(config);
        }

        if (path === '/api/shop/products') {
            const res = (await db.prepare("SELECT * FROM products WHERE active=1 ORDER BY sort DESC").all()).results;
            for(let p of res) {
                p.variants = (await db.prepare("SELECT * FROM variants WHERE product_id=?").bind(p.id).all()).results;
                // 解析批发价
                p.variants.forEach(v => {
                    if (v.wholesale_config) {
                         try { v.wholesale_config = JSON.parse(v.wholesale_config); } catch(e) { v.wholesale_config = null; }
                    }
                });
            }
            return jsonRes(res);
        }

        if (path === '/api/shop/product/detail') {
            // (MPA 架构下，此接口暂时可以不用，改为在 product.html 中调用 /api/shop/products)
        }
        
        // --- 文章 API (Shop) ---
        if (path === '/api/shop/articles/list') {
            const { results } = await db.prepare(`
                SELECT a.id, a.title, a.created_at, ac.name as category_name
                FROM articles a
                LEFT JOIN article_categories ac ON a.category_id = ac.id
                ORDER BY a.created_at DESC
            `).all();
            return jsonRes(results);
        }
        if (path === '/api/shop/article/get') {
            const id = url.searchParams.get('id');
            await db.prepare("UPDATE articles SET view_count = view_count + 1 WHERE id = ?").bind(id).run();
            const article = await db.prepare(`
                SELECT a.*, ac.name as category_name
                FROM articles a
                LEFT JOIN article_categories ac ON a.category_id = ac.id
                WHERE a.id = ?
            `).bind(id).first();
            return jsonRes(article || { error: 'Not Found' });
        }


        // --- 订单与支付 API (Shop) ---

        if (path === '/api/shop/order/create' && method === 'POST') {
            const { variant_id, quantity, contact, payment_method } = await request.json();
            const variant = await db.prepare("SELECT * FROM variants WHERE id=?").bind(variant_id).first();
            if (!variant) return errRes('规格不存在');

            // 检查库存
            const stock = (await db.prepare("SELECT COUNT(*) as c FROM cards WHERE variant_id=? AND status=0").bind(variant_id).first()).c;
            if (stock < quantity) return errRes('库存不足');

            const product = await db.prepare("SELECT name FROM products WHERE id=?").bind(variant.product_id).first();
            const order_id = uuid();
            
            // 计算总价 (此处可加入批发价和自选加价逻辑)
            let finalPrice = variant.price;
            // 1. 自选加价
            if (variant.custom_markup > 0) finalPrice += variant.custom_markup;
            // 2. 批发价
            if (variant.wholesale_config) {
                try {
                    const wholesaleConfig = JSON.parse(variant.wholesale_config);
                    // 倒序排列，优先匹配最高的数量
                    wholesaleConfig.sort((a, b) => b.qty - a.qty);
                    for (const rule of wholesaleConfig) {
                        if (quantity >= rule.qty) {
                            finalPrice = rule.price; // 应用批发价
                            break;
                        }
                    }
                } catch(e) {}
            }
            
            const total_amount = (finalPrice * quantity).toFixed(2);
            if (total_amount <= 0) return errRes('金额必须大于 0');

            await db.prepare("INSERT INTO orders (id, variant_id, product_name, variant_name, price, quantity, total_amount, contact, payment_method, created_at, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)")
                .bind(order_id, variant_id, product.name, variant.name, finalPrice, quantity, total_amount, contact, payment_method, time()).run();

            return jsonRes({ order_id, total_amount, payment_method });
        }

        if (path === '/api/shop/pay' && method === 'POST') {
              const { order_id } = await request.json();
              const order = await db.prepare("SELECT * FROM orders WHERE id=?").bind(order_id).first();
              if (!order) return errRes('订单不存在');
              if (order.status >= 1) return jsonRes({ paid: true }); // 已支付

              if (order.payment_method === 'alipay_f2f') {
                  const gateway = await db.prepare("SELECT config FROM pay_gateways WHERE type='alipay_f2f' AND active=1").first();
                  if(!gateway) return errRes('支付方式未配置');
                  const config = JSON.parse(gateway.config);
                  if (!config.app_id || !config.private_key || !config.alipay_public_key) {
                      return errRes('支付配置不完整');
                  }

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
            const order = await db.prepare("SELECT status, cards_sent FROM orders WHERE id=?").bind(order_id).first();
            if(order && order.status >= 1) { // 1:已支付, 2:已发货
                return jsonRes({ status: order.status, cards: JSON.parse(order.cards_sent || '[]') });
            }
            return jsonRes({ status: 0 });
        }

        // ===========================
        // --- 支付回调 (Notify) ---
        // ===========================
        if (path === '/api/notify/alipay' && method === 'POST') {
            const formData = await request.formData();
            const params = {};
            for (const [key, value] of formData.entries()) {
                params[key] = value;
            }
            
            // 1. 获取配置
            const gateway = await db.prepare("SELECT config FROM pay_gateways WHERE type='alipay_f2f' AND active=1").first();
            if (!gateway) { console.error('Alipay Notify: Gateway not found'); return new Response('fail'); }
            const config = JSON.parse(gateway.config);

            // 2. 验签
            const signVerified = await verifyAlipaySignature(params, config.alipay_public_key);
            if (!signVerified) {
                console.error('Alipay Notify: Signature verification failed');
                return new Response('fail');
            }

            // 3. 处理业务
            if (params.trade_status === 'TRADE_SUCCESS') {
                const out_trade_no = params.out_trade_no;
                const trade_no = params.trade_no;
                
                // 使用事务保证原子性
                await db.batch([
                    db.prepare("BEGIN TRANSACTION"),
                    db.prepare("UPDATE orders SET status=1, paid_at=?, trade_no=? WHERE id=? AND status=0")
                        .bind(time(), trade_no, out_trade_no)
                ]);

                const order = await db.prepare("SELECT * FROM orders WHERE id=? AND status=1").bind(out_trade_no).first(); // status=1: 刚支付成功，尚未发货
                
                if (order) {
                    // 锁定卡密
                    const cards = await db.prepare("SELECT id, content FROM cards WHERE variant_id=? AND status=0 LIMIT ?")
                        .bind(order.variant_id, order.quantity).all();
                    
                    if (cards.results.length >= order.quantity) {
                        const cardIds = cards.results.map(c => c.id);
                        const cardContents = cards.results.map(c => c.content);
                        
                        await db.batch([
                            db.prepare(`UPDATE cards SET status=1, order_id=? WHERE id IN (${cardIds.join(',')})`).bind(out_trade_no),
                            db.prepare("UPDATE orders SET status=2, cards_sent=? WHERE id=?").bind(JSON.stringify(cardContents), out_trade_no),
                            // 更新销量
                            db.prepare("UPDATE variants SET sales_count = sales_count + ? WHERE id=?").bind(order.quantity, order.variant_id),
                            db.prepare("COMMIT")
                        ]);
                        
                        // 提交后更新最终库存
                        await db.prepare("UPDATE variants SET stock = (SELECT COUNT(*) FROM cards WHERE variant_id=? AND status=0) WHERE id = ?")
                                .bind(order.variant_id, order.variant_id).run();
                                
                    } else {
                        // 库存不足，回滚
                        await db.prepare("ROLLBACK").run();
                        console.error(`Notify Error: Insufficient stock for order ${out_trade_no}`);
                    }
                } else {
                     // 订单不存在或已处理
                    await db.prepare("COMMIT").run();
                }
            }
            return new Response('success');
        }

    } catch (e) {
        console.error('API Error:', e);
        return errRes('API Error: ' + e.message, 500);
    }

    return errRes('API Not Found', 404);
}
