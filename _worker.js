/**
 * Cloudflare Worker Faka Backend (最终修复版 - Fix 404)
 * [修复] 添加 /api/shop/product 单个商品详情接口
 */

// === 工具函数 ===
const jsonRes = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } });
const errRes = (msg, status = 400) => jsonRes({ error: msg }, status);
const time = () => Math.floor(Date.now() / 1000);
const uuid = () => crypto.randomUUID().replace(/-/g, '');

// 简单的北京时间格式化工具 (UTC+8)
const formatTime = (ts) => {
    if (!ts) return '';
    const d = new Date(ts * 1000 + 28800000);
    return d.toISOString().replace('T', ' ').substring(0, 19);
};

// === 支付宝签名与验签核心 (Web Crypto API) ===
async function signAlipay(params, privateKeyPem) {
    const sortedParams = Object.keys(params)
        .filter(k => k !== 'sign' && params[k] !== undefined && params[k] !== null && params[k] !== '')
        .sort()
        .map(k => `${k}=${params[k]}`) 
        .join('&');

    let pemContents = privateKeyPem.replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\s+|\n/g, '');
    let binaryDer = Uint8Array.from(atob(pemContents), c => c.charCodeAt(0));
    const key = await crypto.subtle.importKey(
        "pkcs8",
        binaryDer.buffer,
        { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
        false,
        ["sign"]
    );

    const signature = await crypto.subtle.sign(
        "RSASSA-PKCS1-v1_5",
        key,
        new TextEncoder().encode(sortedParams)
    );

    return btoa(String.fromCharCode(...new Uint8Array(signature)));
}

async function verifyAlipaySignature(params, alipayPublicKeyPem) {
    try {
        const sign = params.sign;
        if (!sign) return false;

        const sortedParams = Object.keys(params)
            .filter(k => k !== 'sign' && k !== 'sign_type' && params[k] !== undefined && params[k] !== null && params[k] !== '')
            .sort()
            .map(k => `${k}=${params[k]}`)
            .join('&');
        
        let pemContents = alipayPublicKeyPem.replace(/-----BEGIN PUBLIC KEY-----|-----END PUBLIC KEY-----|\s+|\n/g, '');
        let binaryDer = Uint8Array.from(atob(pemContents), c => c.charCodeAt(0));
        const key = await crypto.subtle.importKey(
            "spki",
            binaryDer.buffer,
            { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
            false,
            ["verify"]
        );

        const signatureBin = Uint8Array.from(atob(sign), c => c.charCodeAt(0));

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

        // 1. API 路由处理
        if (path.startsWith('/api/')) {
            return handleApi(request, env, url);
        }

        // 2. 静态资源路由重写
        let theme = 'default';
        try {
            const db = env.MY_XYRJ;
            const t = await db.prepare("SELECT value FROM site_config WHERE key='theme'").first();
            if(t && t.value) theme = t.value;
        } catch(e) {}

        if (path.startsWith('/files/')) {
             const newUrl = new URL(`/themes/${theme}${path}`, url.origin);
             return env.ASSETS.fetch(new Request(newUrl, request));
        }
        
        if (path.startsWith('/admin/') || path.startsWith('/themes/') || path.startsWith('/assets/')) {
             return env.ASSETS.fetch(request);
        }

        if (path === '/' || path === '/index.html') {
             const newUrl = new URL(`/themes/${theme}/`, url.origin);
             return env.ASSETS.fetch(new Request(newUrl, request));
        }
        
        if (path.endsWith('.html')) {
            const newPath = path.replace(/\.html$/, '');
            const newUrl = new URL(`/themes/${theme}${newPath}`, url.origin);
            const newRequest = new Request(newUrl, request);
            const response = await env.ASSETS.fetch(newRequest);
            if (response.status !== 404) {
                 return response;
            }
            return env.ASSETS.fetch(request);
        }

        return env.ASSETS.fetch(request);
    }
};

// === API 处理逻辑 ===
async function handleApi(request, env, url) {
    const method = request.method;
    const path = url.pathname;
    const db = env.MY_XYRJ;

    try {
        // --- 管理员 API ---
        if (path.startsWith('/api/admin/')) {
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

            const authHeader = request.headers.get('Authorization');
            if (!authHeader || authHeader !== `Bearer ${env.ADMIN_TOKEN}`) {
                return errRes('Unauthorized', 401);
            }

            if (path === '/api/admin/dashboard') {
                const today = new Date().setHours(0,0,0,0) / 1000;
                const stats = {};
                stats.orders_today = (await db.prepare("SELECT COUNT(*) as c FROM orders WHERE created_at >= ?").bind(today).first()).c;
                stats.income_today = (await db.prepare("SELECT SUM(total_amount) as s FROM orders WHERE status >= 1 AND paid_at >= ?").bind(today).first()).s || 0;
                stats.cards_unsold = (await db.prepare("SELECT COUNT(*) as c FROM cards WHERE status = 0").first()).c;
                stats.orders_pending = (await db.prepare("SELECT COUNT(*) as c FROM orders WHERE status = 0").first()).c;
                return jsonRes(stats);
            }

            if (path === '/api/admin/categories/list') {
                const { results } = await db.prepare("SELECT * FROM categories ORDER BY sort DESC, id DESC").all();
                return jsonRes(results);
            }
            if (path === '/api/admin/category/save' && method === 'POST') {
                const { id, name, sort, image_url } = await request.json();
                if (id) {
                    await db.prepare("UPDATE categories SET name=?, sort=?, image_url=? WHERE id=?").bind(name, sort, image_url, id).run();
                } else {
                    await db.prepare("INSERT INTO categories (name, sort, image_url) VALUES (?, ?, ?)").bind(name, sort, image_url).run();
                }
                return jsonRes({ success: true });
            }
            if (path === '/api/admin/category/delete' && method === 'POST') {
                const { id } = await request.json();
                if (id === 1) return errRes('默认分类不能删除');
                await db.prepare("UPDATE products SET category_id = 1 WHERE category_id = ?").bind(id).run();
                await db.prepare("DELETE FROM categories WHERE id = ?").bind(id).run();
                return jsonRes({ success: true });
            }

            if (path === '/api/admin/products/list') {
                const products = (await db.prepare("SELECT * FROM products ORDER BY sort DESC, id DESC").all()).results;
                for (let p of products) {
                    p.variants = (await db.prepare("SELECT * FROM variants WHERE product_id = ?").bind(p.id).all()).results;
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
                const now = time();

                if (productId) {
                    await db.prepare("UPDATE products SET name=?, description=?, category_id=?, sort=?, active=?, image_url=?, tags=? WHERE id=?")
                        .bind(data.name, data.description, data.category_id, data.sort, data.active, data.image_url, data.tags, productId).run();
                } else {
                    const res = await db.prepare("INSERT INTO products (category_id, sort, active, created_at, name, description, image_url, tags) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
                        .bind(data.category_id, data.sort, data.active, now, data.name, data.description, data.image_url, data.tags).run();
                    productId = res.meta.last_row_id;
                }

                const existingVariants = (await db.prepare("SELECT id FROM variants WHERE product_id=?").bind(productId).all()).results;
                const newVariantIds = [];
                const updateStmts = [];
                
                const insertStmt = db.prepare(`
                    INSERT INTO variants (product_id, name, price, stock, color, image_url, wholesale_config, custom_markup, auto_delivery, sales_count, created_at, selection_label) 
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                `);
                const updateStmt = db.prepare(`
                    UPDATE variants SET name=?, price=?, stock=?, color=?, image_url=?, wholesale_config=?, custom_markup=?, auto_delivery=?, sales_count=?, selection_label=?
                    WHERE id=? AND product_id=?
                `);

                for (const v of data.variants) {
                    const wholesale_config_json = v.wholesale_config ? JSON.stringify(v.wholesale_config) : null;
                    const auto_delivery = v.auto_delivery !== undefined ? v.auto_delivery : 1;
                    const stock = v.stock !== undefined ? v.stock : 0;
                    const variantId = v.id ? parseInt(v.id) : null;

                    if (variantId) {
                        newVariantIds.push(variantId);
                        updateStmts.push(
                            updateStmt.bind(
                                v.name, v.price, stock, v.color, v.image_url, wholesale_config_json, 
                                v.custom_markup || 0, auto_delivery, v.sales_count || 0,
                                v.selection_label || null,
                                variantId, productId
                            )
                        );
                    } else {
                        updateStmts.push(
                            insertStmt.bind(
                                productId, v.name, v.price, stock, v.color, v.image_url, wholesale_config_json,
                                v.custom_markup || 0, auto_delivery, v.sales_count || 0, now,
                                v.selection_label || null
                            )
                        );
                    }
                }
                
                const deleteIds = existingVariants.filter(v => !newVariantIds.includes(v.id)).map(v => v.id);
                if (deleteIds.length > 0) {
                    updateStmts.push(db.prepare(`DELETE FROM variants WHERE id IN (${deleteIds.join(',')})`));
                }

                if (updateStmts.length > 0) {
                    await db.batch(updateStmts);
                }
                return jsonRes({ success: true, productId: productId });
            }
            
            if (path === '/api/admin/orders/list') {
                const contact = url.searchParams.get('contact');
                let query;
                let params = [];
                if (contact) {
                    query = "SELECT * FROM orders WHERE contact LIKE ? ORDER BY created_at DESC LIMIT 100";
                    params = [`%${contact}%`];
                } else {
                    query = "SELECT * FROM orders ORDER BY created_at DESC LIMIT 100";
                }
                const { results } = await db.prepare(query).bind(...params).all();
                return jsonRes(results);
            }

            if (path === '/api/admin/order/delete' && method === 'POST') {
                const { id } = await request.json();
                if (!id) return errRes('未提供订单ID');
                await db.prepare("DELETE FROM orders WHERE id = ?").bind(id).run();
                return jsonRes({ success: true });
            }

            if (path === '/api/admin/orders/batch_delete' && method === 'POST') {
                const { ids } = await request.json();
                if (!Array.isArray(ids) || ids.length === 0) return errRes('未提供订单ID列表');
                const placeholders = ids.map(() => '?').join(',');
                await db.prepare(`DELETE FROM orders WHERE id IN (${placeholders})`).bind(...ids).run();
                return jsonRes({ success: true, deletedCount: ids.length });
            }

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
                await db.prepare("UPDATE variants SET stock = (SELECT COUNT(*) FROM cards WHERE variant_id=? AND status=0) WHERE id = ?")
                        .bind(card.variant_id, card.variant_id).run();
                return jsonRes({ success: true });
            }

            if (path === '/api/admin/gateways/list') {
                 let { results } = await db.prepare("SELECT * FROM pay_gateways").all();
                 if (results.length === 0) {
                     const emptyConfig = { app_id: "", private_key: "", alipay_public_key: "" };
                     await db.prepare("INSERT INTO pay_gateways (name, type, config, active) VALUES (?, ?, ?, ?)")
                         .bind('支付宝当面付', 'alipay_f2f', JSON.stringify(emptyConfig), 0).run();
                     results = (await db.prepare("SELECT * FROM pay_gateways").all()).results;
                 }
                 results.forEach(g => g.config = JSON.parse(g.config));
                 return jsonRes(results);
            }
            if (path === '/api/admin/gateway/save' && method === 'POST') {
                const { id, name, type, config, active } = await request.json();
                await db.prepare("UPDATE pay_gateways SET name=?, type=?, config=?, active=? WHERE id=?")
                   .bind(name, type, JSON.stringify(config), active, id).run();
                return jsonRes({success: true});
            }

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
            
            if (path === '/api/admin/settings/get') {
                const res = await db.prepare("SELECT * FROM site_config").all();
                const config = {}; res.results.forEach(r => config[r.key] = r.value);
                return jsonRes(config);
            }
            if (path === '/api/admin/settings/save' && method === 'POST') {
                const settings = await request.json();
                const stmts = Object.keys(settings).map(key => 
                    db.prepare(`
                        INSERT INTO site_config (key, value) VALUES (?, ?) 
                        ON CONFLICT(key) DO UPDATE SET value = excluded.value
                    `).bind(key, settings[key])
                );
                await db.batch(stmts);
                return jsonRes({ success: true });
            }

            if (path === '/api/admin/db/export') {
                const tables = await db.prepare("SELECT name, sql FROM sqlite_schema WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%'").all();
                let sqlDump = "-- Cloudflare D1 Dump\n";
                sqlDump += `-- Date: ${new Date().toISOString()}\n\n`;
                sqlDump += "PRAGMA foreign_keys = OFF;\n\n"; 

                for (const table of tables.results) {
                    sqlDump += `DROP TABLE IF EXISTS "${table.name}";\n`;
                    sqlDump += `${table.sql};\n`;
                    const rows = await db.prepare(`SELECT * FROM "${table.name}"`).all();
                    if (rows.results.length > 0) {
                        sqlDump += `\n-- Data for ${table.name}\n`;
                        for (const row of rows.results) {
                            const keys = Object.keys(row).map(k => `"${k}"`).join(',');
                            const values = Object.values(row).map(v => {
                                if (v === null) return 'NULL';
                                if (typeof v === 'number') return v;
                                return `'${String(v).replace(/'/g, "''")}'`;
                            }).join(',');
                            sqlDump += `INSERT INTO "${table.name}" (${keys}) VALUES (${values});\n`;
                        }
                    }
                    sqlDump += "\n";
                }
                sqlDump += "PRAGMA foreign_keys = ON;\n";
                return new Response(sqlDump, {
                    headers: {
                        'Content-Type': 'application/sql',
                        'Content-Disposition': `attachment; filename="backup_${new Date().toISOString().split('T')[0]}.sql"`
                    }
                });
            }

            if (path === '/api/admin/db/import' && method === 'POST') {
                const sqlContent = await request.text();
                if (!sqlContent || !sqlContent.trim()) return errRes('SQL 文件内容为空');
                try {
                    await db.exec(sqlContent);
                    return jsonRes({ success: true });
                } catch (e) {
                    return errRes('导入失败: ' + e.message);
                }
            }
        }

        // ===========================
        // --- 公开 API (Shop) ---
        // ===========================

        if (path === '/api/shop/config') {
            const res = await db.prepare("SELECT * FROM site_config").all();
            const config = {}; res.results.forEach(r => config[r.key] = r.value);
            const notice = await db.prepare("SELECT content FROM articles WHERE is_notice=1 ORDER BY created_at DESC LIMIT 1").first();
            if(notice) config.notice_content = notice.content;
            return jsonRes(config);
        }

        if (path === '/api/shop/categories') {
            const { results } = await db.prepare("SELECT * FROM categories ORDER BY sort DESC, id DESC").all();
            return jsonRes(results);
        }

        // 获取所有商品列表
        if (path === '/api/shop/products') {
            const res = (await db.prepare("SELECT * FROM products WHERE active=1 ORDER BY sort DESC").all()).results;
            for(let p of res) {
                p.variants = (await db.prepare("SELECT * FROM variants WHERE product_id=?").bind(p.id).all()).results;
                p.variants.forEach(v => {
                    if (v.wholesale_config) {
                         try { v.wholesale_config = JSON.parse(v.wholesale_config); } catch(e) { v.wholesale_config = null; }
                    }
                });
            }
            return jsonRes(res);
        }

        // =======================================================
        // [新增] 修复点：获取单个商品详情 (修复 404 问题)
        // =======================================================
        if (path === '/api/shop/product') {
            const id = url.searchParams.get('id');
            if (!id) return errRes('参数错误：缺少商品ID');

            // 1. 获取商品主信息
            const product = await db.prepare("SELECT * FROM products WHERE id = ? AND active=1").bind(id).first();
            if (!product) return errRes('商品不存在或已下架', 404);

            // 2. 获取规格信息
            const variants = (await db.prepare("SELECT * FROM variants WHERE product_id = ?").bind(id).all()).results;
            
            // 3. 处理批发价配置
            variants.forEach(v => {
                if (v.wholesale_config) {
                     try { v.wholesale_config = JSON.parse(v.wholesale_config); } catch(e) { v.wholesale_config = null; }
                }
            });

            product.variants = variants;
            return jsonRes(product);
        }
        // =======================================================

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

        if (path === '/api/shop/cards/notes') {
            const variant_id = url.searchParams.get('variant_id');
            const cards = await db.prepare("SELECT id, content FROM cards WHERE variant_id=? AND status=0 LIMIT 100").bind(variant_id).all();
            const notes = cards.results.map(c => {
                const match = c.content.match(/#\[(.*?)\]/);
                if (match) {
                    return { id: c.id, note: match[1] };
                }
                return null;
            }).filter(n => n !== null);
            
            return jsonRes(notes);
        }

        if (path === '/api/shop/orders/query' && method === 'POST') {
            const { contact, query_password } = await request.json();
            if (!contact || !query_password) return errRes('参数不完整');
            
            const results = await db.prepare(`
                SELECT id, product_name, variant_name, total_amount, status, created_at, cards_sent 
                FROM orders 
                WHERE contact = ? AND query_password = ? 
                ORDER BY created_at DESC LIMIT 20
            `).bind(contact, query_password).all();
            
            const orders = results.results.map(o => {
                o.created_at_str = formatTime(o.created_at);
                return o;
            });
            return jsonRes(orders);
        }

        if (path === '/api/shop/order/create' && method === 'POST') {
            const { variant_id, quantity, contact, payment_method, card_id, query_password } = await request.json();
            const variant = await db.prepare("SELECT * FROM variants WHERE id=?").bind(variant_id).first();
            if (!variant) return errRes('规格不存在');

            if (!query_password || query_password.length < 1) {
                return errRes('请设置1位以上的查单密码');
            }

            let stock = 0;
            if (variant.auto_delivery === 1) {
                stock = (await db.prepare("SELECT COUNT(*) as c FROM cards WHERE variant_id=? AND status=0").bind(variant_id).first()).c;
            } else {
                stock = variant.stock;
            }

            let finalQuantity = quantity;
            if (card_id) {
                if (variant.auto_delivery !== 1) return errRes('手动发货商品不支持自选');
                finalQuantity = 1; 
                const targetCard = await db.prepare("SELECT id FROM cards WHERE id=? AND variant_id=? AND status=0").bind(card_id, variant_id).first();
                if (!targetCard) return errRes('该号码已被抢走或不存在，请重新选择');
            } else {
                if (stock < finalQuantity) return errRes('库存不足');
            }

            const product = await db.prepare("SELECT name FROM products WHERE id=?").bind(variant.product_id).first();
            const order_id = uuid();
            
            let finalPrice = variant.price;
            
            if (card_id) {
                if (variant.custom_markup > 0) finalPrice += variant.custom_markup;
            } else {
                if (variant.wholesale_config) {
                    try {
                        const wholesaleConfig = JSON.parse(variant.wholesale_config);
                        wholesaleConfig.sort((a, b) => b.qty - a.qty);
                        for (const rule of wholesaleConfig) {
                            if (finalQuantity >= rule.qty) {
                                finalPrice = rule.price; 
                                break;
                            }
                        }
                    } catch(e) {}
                }
            }
            
            const total_amount = (finalPrice * finalQuantity).toFixed(2);
            if (total_amount <= 0) return errRes('金额必须大于 0');

            let cardsSentPlaceholder = null;
            if (card_id) cardsSentPlaceholder = JSON.stringify({ target_id: card_id });

            await db.prepare("INSERT INTO orders (id, variant_id, product_name, variant_name, price, quantity, total_amount, contact, query_password, payment_method, created_at, status, cards_sent) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)")
                .bind(order_id, variant_id, product.name, variant.name, finalPrice, finalQuantity, total_amount, contact, query_password, payment_method, time(), cardsSentPlaceholder).run();

            return jsonRes({ order_id, total_amount, payment_method });
        }

        if (path === '/api/shop/cart/checkout' && method === 'POST') {
            const { items, contact, query_password, payment_method } = await request.json();
            
            if (!items || items.length === 0) return errRes('购物车为空');
            if (!query_password || query_password.length < 1) {
                return errRes('请设置1位以上的查单密码');
            }

            let total_amount = 0;
            const validatedItems = [];

            for (const item of items) {
                const variant = await db.prepare("SELECT * FROM variants WHERE id=?").bind(item.variantId).first();
                if (!variant) throw new Error(`商品 ${item.variantName} 规格不存在`);

                let stock = 0;
                let finalPrice = variant.price;

                if (item.buyMode === 'select' && item.selectedCardId) {
                    if (variant.auto_delivery !== 1) throw new Error('手动发货商品不支持自选');
                    const targetCard = await db.prepare("SELECT id FROM cards WHERE id=? AND variant_id=? AND status=0")
                        .bind(item.selectedCardId, item.variantId).first();
                    if (!targetCard) throw new Error(`商品 ${item.variantName} 的自选号码已被抢走`);
                    stock = 1; 
                    finalPrice = variant.price;
                    if (variant.custom_markup > 0) finalPrice += variant.custom_markup;
                } else {
                    if (variant.auto_delivery === 1) {
                        stock = (await db.prepare("SELECT COUNT(*) as c FROM cards WHERE variant_id=? AND status=0").bind(item.variantId).first()).c;
                    } else {
                        stock = variant.stock;
                    }
                    if (stock < item.quantity) throw new Error(`商品 ${item.variantName} 库存不足 (仅剩 ${stock} 件)`);
                    finalPrice = variant.price;
                    if (variant.wholesale_config) {
                        try {
                            const wholesaleConfig = JSON.parse(variant.wholesale_config);
                            wholesaleConfig.sort((a, b) => b.qty - a.qty);
                            for (const rule of wholesaleConfig) {
                                if (item.quantity >= rule.qty) {
                                    finalPrice = rule.price; 
                                    break;
                                }
                            }
                        } catch(e) {}
                    }
                }
                
                total_amount += (finalPrice * item.quantity);
                validatedItems.push({
                    variantId: variant.id,
                    productName: item.productName,
                    variantName: item.variantName,
                    quantity: item.quantity,
                    price: finalPrice,
                    buyMode: item.buyMode,
                    selectedCardId: item.selectedCardId,
                    auto_delivery: variant.auto_delivery
                });
            }

            if (total_amount <= 0.01) return errRes('金额必须大于 0.01');

            const order_id = uuid();
            const now = time();

            await db.prepare(`
                INSERT INTO orders (id, variant_id, product_name, variant_name, price, quantity, total_amount, contact, query_password, payment_method, created_at, status, cards_sent) 
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)
            `).bind(
                order_id, 
                0, 
                "购物车合并订单",
                `共 ${items.length} 件商品`,
                total_amount,
                1,
                total_amount.toFixed(2),
                contact,
                query_password,
                payment_method,
                now,
                JSON.stringify(validatedItems)
            ).run();

            return jsonRes({ order_id, total_amount, payment_method });
        }


        if (path === '/api/shop/pay' && method === 'POST') {
             const { order_id } = await request.json();
             const order = await db.prepare("SELECT * FROM orders WHERE id=?").bind(order_id).first();
             if (!order) return errRes('订单不存在');
             if (order.status >= 1) return jsonRes({ paid: true });

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
            if(order && order.status >= 1) {
                return jsonRes({ status: order.status, cards: JSON.parse(order.cards_sent || '[]') });
            }
            return jsonRes({ status: 0 });
        }

        // --- 支付回调 (Notify) ---
        if (path === '/api/notify/alipay' && method === 'POST') {
            const formData = await request.formData();
            const params = {};
            for (const [key, value] of formData.entries()) {
                params[key] = value;
            }
            
            const gateway = await db.prepare("SELECT config FROM pay_gateways WHERE type='alipay_f2f' AND active=1").first();
            if (!gateway) { console.error('Alipay Notify: Gateway not found'); return new Response('fail'); }
            const config = JSON.parse(gateway.config);

            const signVerified = await verifyAlipaySignature(params, config.alipay_public_key);
            if (!signVerified) {
                console.error('Alipay Notify: Signature verification failed');
                return new Response('fail');
            }

            if (params.trade_status === 'TRADE_SUCCESS') {
                const out_trade_no = params.out_trade_no;
                const trade_no = params.trade_no;
                
                await db.batch([
                    db.prepare("BEGIN TRANSACTION"),
                    db.prepare("UPDATE orders SET status=1, paid_at=?, trade_no=? WHERE id=? AND status=0")
                        .bind(time(), trade_no, out_trade_no)
                ]);

                const order = await db.prepare("SELECT * FROM orders WHERE id=? AND status=1").bind(out_trade_no).first();
                
                if (order) {
                    if (order.variant_id === 0 && order.cards_sent) { // 合并订单
                        let cartItems;
                        try { cartItems = JSON.parse(order.cards_sent); } catch(e) {}

                        if (!cartItems || cartItems.length === 0) {
                            await db.prepare("ROLLBACK").run();
                            console.error(`Notify Error: Merged order ${out_trade_no} has no items in cards_sent.`);
                            return new Response('success');
                        }
                        
                        const stmts = [];
                        const allCardsContent = [];
                        const autoVariantIdsToUpdate = new Set();

                        for (const item of cartItems) {
                            if (item.auto_delivery === 1) {
                                let cards;
                                if (item.buyMode === 'select' && item.selectedCardId) {
                                    cards = await db.prepare("SELECT id, content FROM cards WHERE id=? AND status=0").bind(item.selectedCardId).all();
                                } else {
                                    cards = await db.prepare("SELECT id, content FROM cards WHERE variant_id=? AND status=0 LIMIT ?").bind(item.variantId, item.quantity).all();
                                }
                                
                                if (cards.results.length >= item.quantity) {
                                    const cardIds = cards.results.map(c => c.id);
                                    const cardContents = cards.results.map(c => c.content);
                                    allCardsContent.push(...cardContents);
                                    
                                    stmts.push(db.prepare(`UPDATE cards SET status=1, order_id=? WHERE id IN (${cardIds.join(',')})`).bind(out_trade_no));
                                    stmts.push(db.prepare("UPDATE variants SET sales_count = sales_count + ? WHERE id=?").bind(item.quantity, item.variantId));
                                    autoVariantIdsToUpdate.add(item.variantId);
                                }
                            } else {
                                stmts.push(db.prepare("UPDATE variants SET stock = stock - ?, sales_count = sales_count + ? WHERE id=?").bind(item.quantity, item.quantity, item.variantId));
                            }
                        }

                        stmts.push(db.prepare("UPDATE orders SET status=2, cards_sent=? WHERE id=?").bind(JSON.stringify(allCardsContent), out_trade_no));
                        await db.batch(stmts);
                        
                        if (autoVariantIdsToUpdate.size > 0) {
                            const stockUpdateStmts = Array.from(autoVariantIdsToUpdate).map(vid => 
                                db.prepare("UPDATE variants SET stock = (SELECT COUNT(*) FROM cards WHERE variant_id=? AND status=0) WHERE id = ?").bind(vid, vid)
                            );
                            await db.batch(stockUpdateStmts);
                        }
                        await db.prepare("COMMIT").run();

                    } else {
                        const variant = await db.prepare("SELECT auto_delivery FROM variants WHERE id=?").bind(order.variant_id).first();
                        if (variant && variant.auto_delivery === 1) {
                            let targetCardId = null;
                            try {
                                const placeholder = JSON.parse(order.cards_sent);
                                if (placeholder && placeholder.target_id) targetCardId = placeholder.target_id;
                            } catch(e) {}

                            let cards;
                            if (targetCardId) {
                                cards = await db.prepare("SELECT id, content FROM cards WHERE id=? AND status=0").bind(targetCardId).all();
                            } else {
                                cards = await db.prepare("SELECT id, content FROM cards WHERE variant_id=? AND status=0 LIMIT ?")
                                    .bind(order.variant_id, order.quantity).all();
                            }
                            
                            if (cards.results.length >= order.quantity) {
                                const cardIds = cards.results.map(c => c.id);
                                const cardContents = cards.results.map(c => c.content);
                                
                                await db.batch([
                                    db.prepare(`UPDATE cards SET status=1, order_id=? WHERE id IN (${cardIds.join(',')})`).bind(out_trade_no),
                                    db.prepare("UPDATE orders SET status=2, cards_sent=? WHERE id=?").bind(JSON.stringify(cardContents), out_trade_no),
                                    db.prepare("UPDATE variants SET sales_count = sales_count + ? WHERE id=?").bind(order.quantity, order.variant_id),
                                    db.prepare("COMMIT")
                                ]);
                                await db.prepare("UPDATE variants SET stock = (SELECT COUNT(*) FROM cards WHERE variant_id=? AND status=0) WHERE id = ?")
                                        .bind(order.variant_id, order.variant_id).run();
                            } else {
                                await db.prepare("ROLLBACK").run();
                            }
                        } else {
                            await db.batch([
                                db.prepare("UPDATE variants SET stock = stock - ?, sales_count = sales_count + ? WHERE id=?").bind(order.quantity, order.quantity, order.variant_id),
                                db.prepare("COMMIT")
                            ]);
                        }
                    }
                } else {
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
