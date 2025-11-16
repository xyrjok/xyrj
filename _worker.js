/**
 * Cloudflare Worker Faka Backend (最终绝对完整版 - 修复版)
 * 包含：文章系统、自选号码、主图设置、手动发货、商品标签、数据库备份恢复、分类图片接口
 * [已合并] 增加查单密码、订单管理、规格自选标签
 */

// === 工具函数 ===
const jsonRes = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } });
const errRes = (msg, status = 400) => jsonRes({ error: msg }, status);
const time = () => Math.floor(Date.now() / 1000);
const uuid = () => crypto.randomUUID().replace(/-/g, '');

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
 * [验签] 验证支付宝异步通知
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
                
                // --- [已修改] ---
                // 增加 selection_label 字段
                const insertStmt = db.prepare(`
                    INSERT INTO variants (product_id, name, price, stock, color, image_url, wholesale_config, custom_markup, auto_delivery, sales_count, created_at, selection_label) 
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                `);
                // 增加 selection_label 字段
                const updateStmt = db.prepare(`
                    UPDATE variants SET name=?, price=?, stock=?, color=?, image_url=?, wholesale_config=?, custom_markup=?, auto_delivery=?, sales_count=?, selection_label=?
                    WHERE id=? AND product_id=?
                `);
                // --- [修改结束] ---

                for (const v of data.variants) {
                    const wholesale_config_json = v.wholesale_config ? JSON.stringify(v.wholesale_config) : null;
                    const auto_delivery = v.auto_delivery !== undefined ? v.auto_delivery : 1;
                    const stock = v.stock !== undefined ? v.stock : 0;
                    const variantId = v.id ? parseInt(v.id) : null;

                    if (variantId) { // 更新
                        newVariantIds.push(variantId);
                        // --- [已修改] ---
                        // 增加 v.selection_label
                        updateStmts.push(
                            updateStmt.bind(
                                v.name, v.price, stock, v.color, v.image_url, wholesale_config_json, 
                                v.custom_markup || 0, auto_delivery, v.sales_count || 0,
                                v.selection_label || null, // <--- 增加
                                variantId, productId
                            )
                        );
                        // --- [修改结束] ---
                    } else { // 插入
                        // --- [已修改] ---
                        // 增加 v.selection_label
                        updateStmts.push(
                            insertStmt.bind(
                                productId, v.name, v.price, stock, v.color, v.image_url, wholesale_config_json,
                                v.custom_markup || 0, auto_delivery, v.sales_count || 0, now,
                                v.selection_label || null // <--- 增加
                            )
                        );
                        // --- [修改结束] ---
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
                
                // 构建 IN 查询
                const placeholders = ids.map(() => '?').join(',');
                await db.prepare(`DELETE FROM orders WHERE id IN (${placeholders})`).bind(...ids).run();
                
                return jsonRes({ success: true, deletedCount: ids.length });
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
            
            // --- 系统设置 API (已修改: 支持 UPSERT) ---
            if (path === '/api/admin/settings/get') {
                const res = await db.prepare("SELECT * FROM site_config").all();
                const config = {}; res.results.forEach(r => config[r.key] = r.value);
                return jsonRes(config);
            }
            if (path === '/api/admin/settings/save' && method === 'POST') {
                const settings = await request.json();
                // [关键修改] 使用 UPSERT 语法：如果键不存在则插入，存在则更新
                const stmts = Object.keys(settings).map(key => 
                    db.prepare(`
                        INSERT INTO site_config (key, value) VALUES (?, ?) 
                        ON CONFLICT(key) DO UPDATE SET value = excluded.value
                    `).bind(key, settings[key])
                );
                await db.batch(stmts);
                return jsonRes({ success: true });
            }

            // ===========================
            // --- [新增] 数据库管理 API ---
            // ===========================
            
            // 导出数据库 (Dump) - [修复] 排除 _cf_ 开头的系统表
            if (path === '/api/admin/db/export') {
                // 1. 获取所有表名 (排除 sqlite_ 和 _cf_ 系统表)
                const tables = await db.prepare("SELECT name, sql FROM sqlite_schema WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%'").all();
                
                let sqlDump = "-- Cloudflare D1 Dump\n";
                sqlDump += `-- Date: ${new Date().toISOString()}\n\n`;
                sqlDump += "PRAGMA foreign_keys = OFF;\n\n"; // 暂时关闭外键检查

                for (const table of tables.results) {
                    // 导出表结构 (先删除旧表)
                    sqlDump += `DROP TABLE IF EXISTS "${table.name}";\n`;
                    sqlDump += `${table.sql};\n`;
                    
                    // 导出表数据
                    const rows = await db.prepare(`SELECT * FROM "${table.name}"`).all();
                    if (rows.results.length > 0) {
                        sqlDump += `\n-- Data for ${table.name}\n`;
                        for (const row of rows.results) {
                            const keys = Object.keys(row).map(k => `"${k}"`).join(',');
                            const values = Object.values(row).map(v => {
                                if (v === null) return 'NULL';
                                if (typeof v === 'number') return v;
                                // 转义单引号
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

            // 导入数据库 (Import)
            if (path === '/api/admin/db/import' && method === 'POST') {
                const sqlContent = await request.text();
                if (!sqlContent || !sqlContent.trim()) return errRes('SQL 文件内容为空');

                try {
                    // 使用 db.exec() 执行多条 SQL 语句 (D1 原生支持)
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

        // [新增] 获取所有分类 (公开)
        if (path === '/api/shop/categories') {
            const { results } = await db.prepare("SELECT * FROM categories ORDER BY sort DESC, id DESC").all();
            return jsonRes(results);
        }

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

        // [新增] 获取自选卡密列表 (提取 #[] 内容)
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

        // --- 订单与支付 API (Shop) ---

        // 创建订单 (支持自选卡密 card_id 和 查单密码 query_password)
        if (path === '/api/shop/order/create' && method === 'POST') {
            // 1. 接收 query_password
            const { variant_id, quantity, contact, payment_method, card_id, query_password } = await request.json();
            const variant = await db.prepare("SELECT * FROM variants WHERE id=?").bind(variant_id).first();
            if (!variant) return errRes('规格不存在');

            // [新增] 验证查单密码
            if (!query_password || query_password.length < 6) {
                return errRes('请设置6位以上的查单密码');
            }

            // === 库存检查 ===
            let stock = 0;
            if (variant.auto_delivery === 1) {
                // 自动发货：查卡密表
                stock = (await db.prepare("SELECT COUNT(*) as c FROM cards WHERE variant_id=? AND status=0").bind(variant_id).first()).c;
            } else {
                // 手动发货：查 variants 表的 stock 字段
                stock = variant.stock;
            }

            let finalQuantity = quantity;
            // 如果指定了 card_id (自选模式)，强制数量为 1
            if (card_id) {
                if (variant.auto_delivery !== 1) return errRes('手动发货商品不支持自选');
                finalQuantity = 1; 
                // 检查该卡密是否可用
                const targetCard = await db.prepare("SELECT id FROM cards WHERE id=? AND variant_id=? AND status=0").bind(card_id, variant_id).first();
                if (!targetCard) return errRes('该号码已被抢走或不存在，请重新选择');
            } else {
                if (stock < finalQuantity) return errRes('库存不足');
            }

            const product = await db.prepare("SELECT name FROM products WHERE id=?").bind(variant.product_id).first();
            const order_id = uuid();
            
            // === 价格计算 ===
            let finalPrice = variant.price;
            
            if (card_id) {
                // 1. 自选模式：基础价 + 加价 (忽略批发价)
                if (variant.custom_markup > 0) finalPrice += variant.custom_markup;
            } else {
                // 2. 随机模式：应用批发价
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

            // 如果指定了卡密，暂存在 cards_sent 字段中
            let cardsSentPlaceholder = null;
            if (card_id) cardsSentPlaceholder = JSON.stringify({ target_id: card_id });

            // 2. 插入 query_password 到数据库
            await db.prepare("INSERT INTO orders (id, variant_id, product_name, variant_name, price, quantity, total_amount, contact, query_password, payment_method, created_at, status, cards_sent) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)")
                .bind(order_id, variant_id, product.name, variant.name, finalPrice, finalQuantity, total_amount, contact, query_password, payment_method, time(), cardsSentPlaceholder).run();

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

        // ===========================
        // --- 支付回调 (Notify) ---
        // ===========================
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
                    const variant = await db.prepare("SELECT auto_delivery FROM variants WHERE id=?").bind(order.variant_id).first();

                    if (variant && variant.auto_delivery === 1) {
                        // === 自动发货逻辑 ===
                        
                        // 1. 检查是否是自选订单
                        let targetCardId = null;
                        try {
                            const placeholder = JSON.parse(order.cards_sent);
                            if (placeholder && placeholder.target_id) targetCardId = placeholder.target_id;
                        } catch(e) {}

                        let cards;
                        if (targetCardId) {
                            // 自选：只取指定的卡
                            cards = await db.prepare("SELECT id, content FROM cards WHERE id=? AND status=0").bind(targetCardId).all();
                        } else {
                            // 随机：取N张卡
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
                            console.error(`Notify Error: Insufficient stock for order ${out_trade_no}`);
                        }
                    } else {
                        // === 手动发货逻辑 ===
                        await db.batch([
                            db.prepare("UPDATE variants SET stock = stock - ?, sales_count = sales_count + ? WHERE id=?").bind(order.quantity, order.quantity, order.variant_id),
                            db.prepare("COMMIT")
                        ]);
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
