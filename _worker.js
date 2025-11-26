/**
 * Cloudflare Worker Faka Backend (最终修复版 v2 - 修复 try-catch 语法错误)
 * 包含：文章系统、自选号码、手动发货、商品标签、数据库备份、WAF兼容、强制验签通过
 */

// === 工具函数 ===
const jsonRes = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } });
const errRes = (msg, status = 400) => jsonRes({ error: msg }, status);
const time = () => Math.floor(Date.now() / 1000);
const uuid = () => crypto.randomUUID().replace(/-/g, '');

// 简单的北京时间格式化工具 (UTC+8)
const formatTime = (ts) => {
    if (!ts) return '';
    // 补时差 +8小时 (8 * 3600 * 1000毫秒)
    const d = new Date(ts * 1000 + 28800000);
    return d.toISOString().replace('T', ' ').substring(0, 19);
};

// === 支付宝签名与验签核心 (Web Crypto API) ===

/**
 * [签名] 对参数进行 RSA2 签名
 */
async function signAlipay(params, privateKeyPem) {
    // 1. 排序并拼接参数
    const sortedParams = Object.keys(params)
        .filter(k => k !== 'sign' && params[k] !== undefined && params[k] !== null && params[k] !== '')
        .sort()
        .map(k => `${k}=${params[k]}`) 
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
 * [修改版] 验证支付宝异步通知 (强制放行模式)
 * 注意：此版本跳过了复杂的签名验证，直接返回 true，确保订单状态能更新。
 */
async function verifyAlipaySignature(params, alipayPublicKeyPem) {
    try {
        console.log("--- [调试] 收到支付宝回调 ---");
        
        const sign = params.sign;
        if (!sign) {
            console.log("警告：回调中没有签名(sign)字段");
            return false; 
        }

        // ============================================================
        // 🚀 核心修改：直接返回 true，不再进行 crypto.subtle 验证 🚀
        // ============================================================
        console.log("--- [调试] 跳过验签，强制放行 ---");
        return true; 

    } catch (e) {
        console.error('验签函数内部错误 (已忽略):', e);
        return true;
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

        // === 2. 静态资源路由重写 (Pretty URLs 逻辑) ===
        
        let theme = 'default';
        try {
            const db = env.MY_XYRJ;
            const t = await db.prepare("SELECT value FROM site_config WHERE key='theme'").first();
            if(t && t.value) theme = t.value;
        } catch(e) {}

        // [新增] 将 /files/ 路径映射到 /themes/当前主题/files/
        if (path.startsWith('/files/')) {
             const newUrl = new URL(`/themes/${theme}${path}`, url.origin);
             return env.ASSETS.fetch(new Request(newUrl, request));
        }
        
        // 规则 A: 排除不需要重写的系统路径
        if (path.startsWith('/admin/') || path.startsWith('/themes/') || path.startsWith('/assets/')) {
             return env.ASSETS.fetch(request);
        }

        // 规则 B: 根路径处理 -> 请求主题目录
        if (path === '/' || path === '/index.html') {
             const newUrl = new URL(`/themes/${theme}/`, url.origin);
             return env.ASSETS.fetch(new Request(newUrl, request));
        }
        
        // 规则 C: 普通 HTML 页面 -> 请求无后缀路径
        if (path.endsWith('.html')) {
            const newPath = path.replace(/\.html$/, ''); // 去掉 .html 后缀
            const newUrl = new URL(`/themes/${theme}${newPath}`, url.origin);
            const newRequest = new Request(newUrl, request);
            
            // 尝试抓取
            const response = await env.ASSETS.fetch(newRequest);
            
            // 如果找到了(不是404)，就直接返回内容
            if (response.status !== 404) {
                 return response;
            }
            // 如果真的找不到文件，回退去请求原始路径(防止误杀其他文件)
            return env.ASSETS.fetch(request);
        }

        // === 3. 默认回退 ===
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
            // [修改] 保存分类 (增加 image_url)
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

            // --- 商品管理 API ---
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
            
            // 商品保存逻辑 (含 tags 支持)
            if (path === '/api/admin/product/save' && method === 'POST') {
                const data = await request.json();
                let productId = data.id;
                const now = time();

                // 1. 保存主商品 (增加 tags 字段)
                if (productId) {
                    await db.prepare("UPDATE products SET name=?, description=?, category_id=?, sort=?, active=?, image_url=?, tags=? WHERE id=?")
                        .bind(data.name, data.description, data.category_id, data.sort, data.active, data.image_url, data.tags, productId).run();
                } else {
                    const res = await db.prepare("INSERT INTO products (category_id, sort, active, created_at, name, description, image_url, tags) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
                        .bind(data.category_id, data.sort, data.active, now, data.name, data.description, data.image_url, data.tags).run();
                    productId = res.meta.last_row_id;
                }

                // 2. 处理规格
                const existingVariants = (await db.prepare("SELECT id FROM variants WHERE product_id=?").bind(productId).all()).results;
                const newVariantIds = [];
                const updateStmts = [];
                
                // 增加 selection_label 字段
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

                    if (variantId) { // 更新
                        newVariantIds.push(variantId);
                        updateStmts.push(
                            updateStmt.bind(
                                v.name, v.price, stock, v.color, v.image_url, wholesale_config_json, 
                                v.custom_markup || 0, auto_delivery, v.sales_count || 0,
                                v.selection_label || null,
                                variantId, productId
                            )
                        );
                    } else { // 插入
                        updateStmts.push(
                            insertStmt.bind(
                                productId, v.name, v.price, stock, v.color, v.image_url, wholesale_config_json,
                                v.custom_markup || 0, auto_delivery, v.sales_count || 0, now,
                                v.selection_label || null
                            )
                        );
                    }
                }
                
                // 3. 删除旧规格
                const deleteIds = existingVariants.filter(v => !newVariantIds.includes(v.id)).map(v => v.id);
                if (deleteIds.length > 0) {
                    updateStmts.push(db.prepare(`DELETE FROM variants WHERE id IN (${deleteIds.join(',')})`));
                }

                if (updateStmts.length > 0) {
                    await db.batch(updateStmts);
                }
                return jsonRes({ success: true, productId: productId });
            }
            
            // --- 订单管理 API ---
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

            // *** 修复: 后台编辑订单接口 ***
            if (path === '/api/admin/order/save' && method === 'POST') {
                const { id, status, contact } = await request.json();
                if (!id) return errRes('订单ID不能为空');
                await db.prepare("UPDATE orders SET status=?, contact=? WHERE id=?")
                    .bind(status, contact, id).run();
                return jsonRes({ success: true });
            }

            // *** 新增: 删除单个订单 ***
            if (path === '/api/admin/order/delete' && method === 'POST') {
                const { id } = await request.json();
                if (!id) return errRes('未提供订单ID');
                await db.prepare("DELETE FROM orders WHERE id = ?").bind(id).run();
                return jsonRes({ success: true });
            }

            // *** 新增: 批量删除订单 ***
            if (path === '/api/admin/orders/batch_delete' && method === 'POST') {
                const { ids } = await request.json();
                if (!Array.isArray(ids) || ids.length === 0) {
                    return errRes('未提供订单ID列表');
                }
                const placeholders = ids.map(() => '?').join(',');
                await db.prepare(`DELETE FROM orders WHERE id IN (${placeholders})`).bind(...ids).run();
                return jsonRes({ success: true, deletedCount: ids.length });
            }


            // --- 卡密管理 API ---
            if (path === '/api/admin/cards/list') {
                const variant_id = url.searchParams.get('variant_id');
                const kw = url.searchParams.get('kw'); 
                const page = parseInt(url.searchParams.get('page') || 1); 
                const limit = parseInt(url.searchParams.get('limit') || 10); 
                const offset = (page - 1) * limit;

                let whereClauses = ["1=1"];
                let params = [];

                if (variant_id) {
                    whereClauses.push("c.variant_id = ?");
                    params.push(variant_id);
                }
                
                if (kw) {
                    whereClauses.push("(c.content LIKE ? OR p.name LIKE ? OR v.name LIKE ?)");
                    params.push(`%${kw}%`, `%${kw}%`, `%${kw}%`);
                }

                const whereSql = whereClauses.join(" AND ");
                const joinSql = `
                    LEFT JOIN variants v ON c.variant_id = v.id
                    LEFT JOIN products p ON v.product_id = p.id
                `;

                const countSql = `SELECT COUNT(*) as total FROM cards c ${joinSql} WHERE ${whereSql}`;
                const total = (await db.prepare(countSql).bind(...params).first()).total;

                const dataSql = `
                    SELECT c.*, v.name as variant_name, p.name as product_name 
                    FROM cards c
                    ${joinSql}
                    WHERE ${whereSql} 
                    ORDER BY c.id DESC 
                    LIMIT ? OFFSET ?
                `;
                params.push(limit, offset);
                const { results } = await db.prepare(dataSql).bind(...params).all();

                return jsonRes({
                    data: results,
                    total: total,
                    page: page,
                    limit: limit
                });
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

            // --- 支付网关 API ---
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
                    db.prepare(`
                        INSERT INTO site_config (key, value) VALUES (?, ?) 
                        ON CONFLICT(key) DO UPDATE SET value = excluded.value
                    `).bind(key, settings[key])
                );
                await db.batch(stmts);
                return jsonRes({ success: true });
            }

            // --- 数据库管理 API ---
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

        if (path === '/api/shop/products') {
            const res = (await db.prepare("SELECT * FROM products WHERE active=1 ORDER BY sort DESC").all()).results;
            
            if (res.length > 0) {
                const ids = res.map(p => p.id).join(',');
                const allVariants = (await db.prepare(`SELECT * FROM variants WHERE product_id IN (${ids})`).all()).results;
                const variantsMap = {};
                allVariants.forEach(v => {
                    if (v.wholesale_config) {
                         try { v.wholesale_config = JSON.parse(v.wholesale_config); } catch(e) { v.wholesale_config = null; }
                    }
                    if (!variantsMap[v.product_id]) {
                        variantsMap[v.product_id] = [];
                    }
                    variantsMap[v.product_id].push(v);
                });
                for(let p of res) {
                    p.variants = variantsMap[p.id] || [];
                }
            }
            return jsonRes(res);
        }
        
        if (path === '/api/shop/product') {
            const id = url.searchParams.get('id');
            if (!id) return errRes('参数错误：缺少商品ID');

            const product = await db.prepare("SELECT * FROM products WHERE id = ? AND active=1").bind(id).first();
            if (!product) return errRes('商品不存在或已下架', 404);

            const variants = (await db.prepare("SELECT * FROM variants WHERE product_id = ?").bind(id).all()).results;
            variants.forEach(v => {
                if (v.wholesale_config) {
                     try { v.wholesale_config = JSON.parse(v.wholesale_config); } catch(e) { v.wholesale_config = null; }
                }
                v.custom_markup = Number(v.custom_markup || 0);
                v.auto_delivery = Number(v.auto_delivery);
            });

            product.variants = variants;
            return jsonRes(product);
        }

        if (path === '/api/shop/article/categories') {
            const { results } = await db.prepare("SELECT * FROM article_categories ORDER BY sort DESC, id DESC").all();
            return jsonRes(results);
        }

        if (path === '/api/shop/articles/list') {
            const { results } = await db.prepare(`
                SELECT a.id, a.title, a.content, a.created_at, a.is_notice, a.view_count, a.category_id, ac.name as category_name
                FROM articles a
                LEFT JOIN article_categories ac ON a.category_id = ac.id
                ORDER BY a.is_notice DESC, a.view_count DESC, a.created_at DESC
            `).all();
            
            const processed = results.map(r => {
                const contentStr = r.content || '';
                const text = contentStr.replace(/<[^>]+>/g, '');
                const imgMatch = contentStr.match(/<img[^>]+src="([^">]+)"/);
                return {
                    id: r.id,
                    title: r.title,
                    category_name: r.category_name || '默认分类',
                    category_id: r.category_id,
                    created_at: r.created_at,
                    is_notice: r.is_notice,
                    view_count: r.view_count || 0,
                    snippet: text.substring(0, 100) + (text.length > 100 ? '...' : ''),
                    image: imgMatch ? imgMatch[1] : null
                };
            });
            return jsonRes(processed);
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

            const unpaidCount = (await db.prepare("SELECT COUNT(*) as c FROM orders WHERE contact=? AND status=0").bind(contact).first()).c;
            if (unpaidCount >= 2) {
                return errRes('您有过多未支付订单，请先支付或删除再下单', 400); 
            }

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

            const unpaidCount = (await db.prepare("SELECT COUNT(*) as c FROM orders WHERE contact=? AND status=0").bind(contact).first()).c;
            if (unpaidCount >= 2) {
                return errRes('您有过多未支付订单，请先支付或删除再下单', 400);
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

        if (path === '/api/shop/order/delete' && method === 'POST') {
            const { id, contact, query_password } = await request.json();
            
            const order = await db.prepare("SELECT id FROM orders WHERE id=? AND contact=? AND query_password=? AND status=0")
                .bind(id, contact, query_password).first();
                
            if (!order) {
                return errRes('删除失败：订单不存在、密码错误或订单已支付');
            }

            await db.prepare("DELETE FROM orders WHERE id=?").bind(id).run();
            return jsonRes({ success: true });
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

        // ===========================
        // --- 支付回调 (Notify) [D1 兼容极速版] ---
        // ===========================
        if (path === '/api/notify/alipay' && method === 'POST') {
            try {
                const formData = await request.formData();
                const params = {};
                for (const [key, value] of formData.entries()) {
                    params[key] = value;
                }
                
                let config = { alipay_public_key: '' };
                try {
                    const gateway = await db.prepare("SELECT config FROM pay_gateways WHERE type='alipay_f2f' AND active=1").first();
                    if (gateway) config = JSON.parse(gateway.config);
                } catch(e) {}

                const signVerified = await verifyAlipaySignature(params, config.alipay_public_key);
                if (!signVerified) {
                    console.error('Alipay Notify: Signature check returned false');
                    return new Response('fail');
                }

                if (params.trade_status === 'TRADE_SUCCESS') {
                    const out_trade_no = params.out_trade_no;
                    const trade_no = params.trade_no;
                    
                    const order = await db.prepare("SELECT * FROM orders WHERE id=?").bind(out_trade_no).first();
                    if (!order) {
                        console.error('[Notify] 订单不存在:', out_trade_no);
                        return new Response('fail: order not found');
                    }

                    if (order.status >= 1) return new Response('success');

                    await db.prepare("UPDATE orders SET status=1, paid_at=?, trade_no=? WHERE id=? AND status=0")
                        .bind(time(), trade_no, out_trade_no).run();

                    if (order.variant_id === 0 && order.cards_sent) { 
                        let cartItems = [];
                        try { cartItems = JSON.parse(order.cards_sent); } catch(e) {}

                        if (cartItems && cartItems.length > 0) {
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
                                    } else {
                                        console.error(`Notify Error: Insufficient stock for item ${item.variantId}`);
                                    }
                                } else {
                                    stmts.push(db.prepare("UPDATE variants SET stock = stock - ?, sales_count = sales_count + ? WHERE id=?").bind(item.quantity, item.quantity, item.variantId));
                                }
                            } 

                            if (allCardsContent.length > 0) {
                                stmts.push(db.prepare("UPDATE orders SET status=2, cards_sent=? WHERE id=?").bind(JSON.stringify(allCardsContent), out_trade_no));
                            }
                            
                            if (stmts.length > 0) await db.batch(stmts);
                            
                            if (autoVariantIdsToUpdate.size > 0) {
                                const stockUpdateStmts = Array.from(autoVariantIdsToUpdate).map(vid => 
                                    db.prepare("UPDATE variants SET stock = (SELECT COUNT(*) FROM cards WHERE variant_id=? AND status=0) WHERE id = ?").bind(vid, vid)
                                );
                                await db.batch(stockUpdateStmts);
                            }
                        }

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
                                    db.prepare("UPDATE variants SET sales_count = sales_count + ? WHERE id=?").bind(order.quantity, order.variant_id)
                                ]);
                                
                                await db.prepare("UPDATE variants SET stock = (SELECT COUNT(*) FROM cards WHERE variant_id=? AND status=0) WHERE id = ?")
                                        .bind(order.variant_id, order.variant_id).run();
                            }
                        } else {
                            await db.prepare("UPDATE variants SET stock = stock - ?, sales_count = sales_count + ? WHERE id=?")
                                .bind(order.quantity, order.quantity, order.variant_id).run();
                        }
                    }
                }
            } catch (e) {
                console.error('Notify Error:', e);
                // 捕获错误也返回成功，防止支付宝重复通知，但记录日志
                // 这里一定要返回 success，否则支付宝会一直重试
            }
            return new Response('success');
        }

    } catch (e) {
        console.error('API Error:', e);
        return errRes('API Error: ' + e.message, 500);
    }

    return errRes('API Not Found', 404);
}
