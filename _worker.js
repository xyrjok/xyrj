/**
 * Cloudflare Worker Faka Backend (最终绝对完整版 - 含全站SEO优化 & 文章系统 & 防乱单 & 卡密管理 & 导出功能)
 * 包含：文章系统(升级版)、自选号码、主图设置、手动发货、商品标签、数据库备份恢复、分类图片接口
 * [新增] 全站社交分享优化(OG标签)：支持首页(后台配置)、商品页、文章页、文章中心自动生成卡片
 * [新增] 限制未支付订单数量、删除未支付订单接口
 * [新增] 卡密管理支持分页、搜索（内容/商品/规格）、全量显示
 * [新增] 卡密导出功能：支持按商品/规格/状态导出并自动分类整理为TXT
 * [修复] 修复 D1 数据库不支持 BEGIN TRANSACTION/COMMIT 导致的 500 错误
 * [修复] 文章管理支持保存封面图、浏览量和显示状态
 * [新增] Outlook (Graph API) 原生发信支持
 * [新增] 客户订单发货通知
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

// [新增] 简单的邮箱格式校验
const isEmail = (contact) => {
    // 粗略校验，只要符合 x@y.z 的基本格式即可
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(contact);
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
            return handleApi(request, env, url, ctx);
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

        // ============================================================
        // === SEO 注入核心逻辑 (包含首页、商品、文章) ===
        // ============================================================
        
        // 规则 B: 根路径处理 (首页)
        if (path === '/' || path === '/index.html') {
             const newUrl = new URL(`/themes/${theme}/`, url.origin);
             const newRequest = new Request(newUrl, request);
             
             let response = await env.ASSETS.fetch(newRequest);
             
             // 首页 SEO 注入
             if (response.status === 200) {
                 try {
                     const db = env.MY_XYRJ;
                     const configRes = await db.prepare("SELECT * FROM site_config").all();
                     const config = {}; 
                     if (configRes && configRes.results) {
                         configRes.results.forEach(r => config[r.key] = r.value);
                     }

                     const siteName = (config.site_name || '夏雨店铺').replace(/"/g, '&quot;');
                     const siteDesc = (config.site_description || '自动发货，安全快捷').replace(/"/g, '&quot;');
                     let siteImage = config.site_logo || '/assets/noimage.jpg';
                     if (siteImage.startsWith('/')) siteImage = `${url.origin}${siteImage}`;

                     response = await injectMetaTags(response, {
                         url: request.url,
                         title: siteName,
                         desc: siteDesc,
                         image: siteImage
                     });
                 } catch (e) { console.error('Home SEO Error:', e); }
             }
             return response;
        }
        
        // 规则 C: 普通 HTML 页面 (商品详情、文章详情等)
        if ((!path.includes('.') || path.endsWith('.html')) && !path.startsWith('/api/') && !path.startsWith('/admin/') && !path.startsWith('/assets/') && !path.startsWith('/themes/')) {
            // 如果路径带 .html 则去掉，确保内部统一请求无后缀路径 (Cloudflare Pages 会自动匹配 .html)
            const cleanPath = path.endsWith('.html') ? path.replace(/\.html$/, '') : path;
            const newUrl = new URL(`/themes/${theme}${cleanPath}`, url.origin);
            const newRequest = new Request(newUrl, request);
            
            let response = await env.ASSETS.fetch(newRequest);
            // 如果找不到文件，回退去请求原始路径
            if (response.status === 404) {
                 response = await env.ASSETS.fetch(request);
            }

            // SEO 注入
            if (response.status === 200) {
                const db = env.MY_XYRJ;

                // --- 情况1：商品详情页 (product.html) ---
                if (path === '/product' || path === '/product.html') {
                    const id = url.searchParams.get('id');
                    if (id) {
                        try {
                            const item = await db.prepare("SELECT name, description, image_url FROM products WHERE id = ?").bind(id).first();
                            if (item) {
                                let desc = (item.description || '').replace(/<[^>]+>/g, '').substring(0, 150) + '...';
                                if(!desc || desc === '...') desc = '自动发货，安全快捷';
                                let image = item.image_url || '/assets/noimage.jpg';
                                if (image.startsWith('/')) image = `${url.origin}${image}`;
                                
                                response = await injectMetaTags(response, {
                                    url: request.url,
                                    title: item.name,
                                    desc: desc,
                                    image: image
                                });
                            }
                        } catch(e) {}
                    }
                }
                
                // --- 情况2：文章详情页 (article.html) ---
                else if (path === '/article' || path === '/article.html') {
                    const id = url.searchParams.get('id');
                    if (id) {
                        try {
                            const item = await db.prepare("SELECT title, content, cover_image FROM articles WHERE id = ?").bind(id).first();
                            if (item) {
                                // 提取纯文本摘要
                                let desc = (item.content || '').replace(/<[^>]+>/g, '').substring(0, 150) + '...';
                                // 优先用封面图，没有则尝试提取文章内第一张图
                                let image = item.cover_image;
                                if (!image && item.content) {
                                    const imgMatch = item.content.match(/<img[^>]+src="([^">]+)"/);
                                    if (imgMatch) image = imgMatch[1];
                                }
                                if (!image) image = '/assets/noimage.jpg';
                                if (image.startsWith('/')) image = `${url.origin}${image}`;

                                response = await injectMetaTags(response, {
                                    url: request.url,
                                    title: item.title,
                                    desc: desc,
                                    image: image
                                });
                            }
                        } catch(e) {}
                    }
                }

                // --- 情况3：文章中心 (articles.html) ---
                else if (path === '/articles' || path === '/articles.html') {
                    response = await injectMetaTags(response, {
                        url: request.url,
                        title: '资讯中心 - 教程与公告',
                        desc: '查看最新的店铺公告、使用教程和行业资讯。',
                        image: `${url.origin}/assets/noimage.jpg`
                    });
                }
            }

            return response;
        }
        // ====== [新增] GitHub 图片代理 (支持私有仓库) ======
        if (path.startsWith('/gh_image/')) {
            const filename = path.replace('/gh_image/', '');
            let conf = {};
            try {
                const db = env.MY_XYRJ;
                (await db.prepare("SELECT key, value FROM site_config WHERE key IN ('gh_user','gh_repo','gh_token')").all()).results.forEach(r => conf[r.key] = r.value);
            } catch(e) {}

            if (!conf.gh_user || !conf.gh_repo) return new Response('Config missing', { status: 404 });

            // 构造 GitHub Raw URL (私有仓库需 Token)
            const rawUrl = `https://raw.githubusercontent.com/${conf.gh_user}/${conf.gh_repo}/main/${filename}`;
            const headers = { 'User-Agent': 'Cloudflare-Worker' };
            if (conf.gh_token) headers['Authorization'] = `token ${conf.gh_token}`;

            const imgRes = await fetch(rawUrl, { headers });
            if (!imgRes.ok) return new Response('Image not found', { status: 404 });

            const newHeaders = new Headers(imgRes.headers);
            newHeaders.set('Access-Control-Allow-Origin', '*');
            newHeaders.set('Cache-Control', 'public, max-age=2592000'); // 缓存30天
            newHeaders.delete('Authorization'); // 移除敏感头

            return new Response(imgRes.body, { status: imgRes.status, headers: newHeaders });
        }
        // === 3. 默认回退 ===
        return env.ASSETS.fetch(request);
    }
};

// =============================================
// === 辅助函数：注入 Meta 标签 (用于SEO) ===
// =============================================
async function injectMetaTags(originalResponse, data) {
    const title = (data.title || '').replace(/"/g, '&quot;');
    const desc = (data.desc || '').replace(/"/g, '&quot;');
    // 这里决定图片显示模式：
    // 'summary_large_image' = 大图 (适合宽屏图)
    // 'summary'             = 小图 (适合正方形图，图片在文字旁)
    const cardType = 'summary'; 
     // 构造 Open Graph 和 Twitter Card 标签
    const tags = `
        <meta property="og:type" content="website">
        <meta property="og:url" content="${data.url}">
        <meta property="og:title" content="${title}">
        <meta property="og:description" content="${desc}">
        <meta property="og:image" content="${data.image}">
        <meta property="twitter:card" content="${cardType}">
        <meta property="twitter:title" content="${title}">
        <meta property="twitter:description" content="${desc}">
        <meta property="twitter:image" content="${data.image}">
    `;
    // 读取 HTML 内容并注入到 <head> 之后
    let html = await originalResponse.text();
    html = html.replace('<head>', `<head>${tags}`);
    // 返回新的 Response 对象
    return new Response(html, {
        headers: originalResponse.headers,
        status: originalResponse.status,
        statusText: originalResponse.statusText
    });
}

// =============================================
// === 完整的 API 处理逻辑 ===
// =============================================
async function handleApi(request, env, url, ctx) {
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
            
            // --- 仪表盘 (升级版：支持多时间维度) ---
            if (path === '/api/admin/dashboard') {
                const now = Math.floor(Date.now() / 1000);
                const today = new Date().setHours(0,0,0,0) / 1000;
                const week = now - 7 * 86400;   // 最近7天
                const month = now - 30 * 86400; // 最近30天
                const year = now - 365 * 86400; // 最近一年

                // 使用 Promise.all 并发查询，提高速度
                const [
                    r_o_today, r_o_week, r_o_month,
                    r_i_today, r_i_week, r_i_month, r_i_year,
                    r_cards, r_pending
                ] = await Promise.all([
                    // 订单数统计
                    db.prepare("SELECT COUNT(*) as c FROM orders WHERE created_at >= ?").bind(today).first(),
                    db.prepare("SELECT COUNT(*) as c FROM orders WHERE created_at >= ?").bind(week).first(),
                    db.prepare("SELECT COUNT(*) as c FROM orders WHERE created_at >= ?").bind(month).first(),
                    
                    // 收入统计
                    db.prepare("SELECT SUM(total_amount) as s FROM orders WHERE status >= 1 AND paid_at >= ?").bind(today).first(),
                    db.prepare("SELECT SUM(total_amount) as s FROM orders WHERE status >= 1 AND paid_at >= ?").bind(week).first(),
                    db.prepare("SELECT SUM(total_amount) as s FROM orders WHERE status >= 1 AND paid_at >= ?").bind(month).first(),
                    db.prepare("SELECT SUM(total_amount) as s FROM orders WHERE status >= 1 AND paid_at >= ?").bind(year).first(),
                    
                    // 其他
                    db.prepare("SELECT COUNT(*) as c FROM cards WHERE status = 0").first(),
                    db.prepare("SELECT COUNT(*) as c FROM orders WHERE status = 0").first()
                ]);

                const stats = {
                    orders: {
                        today: r_o_today.c,
                        week: r_o_week.c,
                        month: r_o_month.c
                    },
                    income: {
                        today: r_i_today.s || 0,
                        week: r_i_week.s || 0,
                        month: r_i_month.s || 0,
                        year: r_i_year.s || 0
                    },
                    cards_unsold: r_cards.c,
                    orders_pending: r_pending.c
                };
                
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
                    INSERT INTO variants (product_id, name, price, stock, color, image_url, wholesale_config, custom_markup, auto_delivery, sales_count, created_at, selection_label, sort, active) 
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                `);
                const updateStmt = db.prepare(`
                    UPDATE variants SET name=?, price=?, stock=?, color=?, image_url=?, wholesale_config=?, custom_markup=?, auto_delivery=?, sales_count=?, selection_label=?, sort=?, active=?
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
                                v.sort || 0, v.active,
                                variantId, productId
                            )
                        );
                    } else { // 插入
                        updateStmts.push(
                            insertStmt.bind(
                                productId, v.name, v.price, stock, v.color, v.image_url, wholesale_config_json,
                                v.custom_markup || 0, auto_delivery, v.sales_count || 0, now,
                                v.selection_label || null,
                                v.sort || 0, v.active
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


            // --- 卡密管理 API (升级版: 支持分页、多字段搜索、关联查询) ---
            if (path === '/api/admin/cards/list') {
                const variant_id = url.searchParams.get('variant_id');
                const kw = url.searchParams.get('kw'); // 搜索关键字
                const page = parseInt(url.searchParams.get('page') || 1); // 当前页码
                const limit = parseInt(url.searchParams.get('limit') || 10); // 每页条数
                const offset = (page - 1) * limit;

                // 构建查询条件
                let whereClauses = ["1=1"];
                let params = [];

                if (variant_id) {
                    whereClauses.push("c.variant_id = ?");
                    params.push(variant_id);
                }
                
                // [修改] 关键字同时搜索：卡密内容 OR 商品名称 OR 规格名称
                if (kw) {
                    whereClauses.push("(c.content LIKE ? OR p.name LIKE ? OR v.name LIKE ?)");
                    params.push(`%${kw}%`, `%${kw}%`, `%${kw}%`);
                }

                const whereSql = whereClauses.join(" AND ");
                
                // 定义 JOIN 子句 (统计和查询都需要用到)
                const joinSql = `
                    LEFT JOIN variants v ON c.variant_id = v.id
                    LEFT JOIN products p ON v.product_id = p.id
                `;

                // 1. 查询总数 ([注意] 必须包含 JOIN，否则无法根据商品名筛选)
                const countSql = `SELECT COUNT(*) as total FROM cards c ${joinSql} WHERE ${whereSql}`;
                const total = (await db.prepare(countSql).bind(...params).first()).total;

                // 2. 查询数据
                const dataSql = `
                    SELECT c.*, v.name as variant_name, p.name as product_name 
                    FROM cards c
                    ${joinSql}
                    WHERE ${whereSql} 
                    ORDER BY c.id DESC 
                    LIMIT ? OFFSET ?
                `;
                
                // 追加分页参数
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
                    // 更新库存
                    await db.prepare("UPDATE variants SET stock = (SELECT COUNT(*) FROM cards WHERE variant_id=? AND status=0) WHERE id = ?")
                        .bind(variant_id, variant_id).run();
                }
                return jsonRes({ imported: cards.length });
            }

            // [新增] 导出卡密接口
            if (path === '/api/admin/cards/export' && method === 'POST') {
                const { product_id, variant_id, export_unsold, export_sold } = await request.json();

                // 1. 构建查询条件
                let whereClauses = [];
                let params = [];

                if (product_id) {
                    whereClauses.push("p.id = ?");
                    params.push(product_id);
                }
                if (variant_id) {
                    whereClauses.push("v.id = ?");
                    params.push(variant_id);
                }

                // 状态筛选
                if (export_unsold && !export_sold) {
                    whereClauses.push("c.status = 0");
                } else if (!export_unsold && export_sold) {
                    whereClauses.push("c.status = 1");
                } else if (!export_unsold && !export_sold) {
                    return errRes('请至少选择一种导出状态（已售或未售）');
                }
                // 如果都选，则不加 status 限制

                const whereSql = whereClauses.length > 0 ? "WHERE " + whereClauses.join(" AND ") : "";

                // 2. 联表查询：卡密 -> 规格 -> 商品
                const sql = `
                    SELECT c.content, c.status, p.name as p_name, v.name as v_name 
                    FROM cards c 
                    JOIN variants v ON c.variant_id = v.id 
                    JOIN products p ON v.product_id = p.id 
                    ${whereSql}
                    ORDER BY p.id ASC, v.id ASC, c.id ASC
                `;

                const { results } = await db.prepare(sql).bind(...params).all();

                if (!results || results.length === 0) {
                    return errRes('没有找到符合条件的卡密');
                }

                // 3. 数据分组处理 (按 商品-规格 分类)
                const groups = {};
                for (const row of results) {
                    const key = `【商品：${row.p_name}】 - 【规格：${row.v_name}】`;
                    if (!groups[key]) groups[key] = [];
                    groups[key].push(row.content);
                }

                // 4. 生成文本内容
                let fileContent = "";
                for (const [groupName, cards] of Object.entries(groups)) {
                    fileContent += `${groupName}\n`;
                    fileContent += `--------------------------------------------------\n`;
                    fileContent += cards.join('\n');
                    fileContent += `\n\n==================================================\n\n`;
                }

                // 5. 返回文件下载响应
                return new Response(fileContent, {
                    headers: {
                        'Content-Type': 'text/plain; charset=utf-8',
                        'Content-Disposition': `attachment; filename="cards_export_${time()}.txt"`
                    }
                });
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
            // [修复] 文章保存逻辑：增加了 cover_image, active, view_count 字段
            if (path === '/api/admin/article/save' && method === 'POST') {
                const { id, title, content, is_notice, category_id, cover_image, active, view_count } = await request.json();
                const now = time();
                if (id) {
                    await db.prepare("UPDATE articles SET title=?, content=?, is_notice=?, category_id=?, updated_at=?, cover_image=?, active=?, view_count=? WHERE id=?")
                        .bind(title, content, is_notice, category_id, now, cover_image, active, view_count, id).run();
                } else {
                    await db.prepare("INSERT INTO articles (title, content, is_notice, category_id, created_at, updated_at, cover_image, active, view_count) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)")
                        .bind(title, content, is_notice, category_id, now, now, cover_image, active, view_count).run();
                }
                return jsonRes({ success: true });
            }
            if (path === '/api/admin/article/delete' && method === 'POST') {
                const { id } = await request.json();
                await db.prepare("DELETE FROM articles WHERE id=?").bind(id).run();
                return jsonRes({ success: true });
            }

            // ===========================
            // --- 图片管理 API (新增) ---
            // ===========================
            
            // 1. 获取图片分类
            if (path === '/api/admin/image/categories') {
                const { results } = await db.prepare("SELECT * FROM image_categories ORDER BY sort DESC, id ASC").all();
                return jsonRes(results);
            }
            // 2. 保存分类
            if (path === '/api/admin/image/category/save' && method === 'POST') {
                const { id, name, sort } = await request.json();
                if (id) {
                    await db.prepare("UPDATE image_categories SET name=?, sort=? WHERE id=?").bind(name, sort, id).run();
                } else {
                    await db.prepare("INSERT INTO image_categories (name, sort) VALUES (?, ?)").bind(name, sort).run();
                }
                return jsonRes({ success: true });
            }
            // 3. 删除分类
            if (path === '/api/admin/image/category/delete' && method === 'POST') {
                const { id } = await request.json();
                if (id == 1) return errRes('默认分类无法删除');
                // 将该分类下的图片移到默认分类
                await db.prepare("UPDATE images SET category_id = 1 WHERE category_id = ?").bind(id).run();
                await db.prepare("DELETE FROM image_categories WHERE id = ?").bind(id).run();
                return jsonRes({ success: true });
            }

            // 4. 图片列表
            if (path === '/api/admin/images/list') {
                const category_id = url.searchParams.get('category_id');
                const page = parseInt(url.searchParams.get('page') || 1);
                const limit = 20; // 每页20张
                const offset = (page - 1) * limit;

                let where = "1=1";
                let params = [];
                if (category_id && category_id !== 'all') {
                    where += " AND category_id = ?";
                    params.push(category_id);
                }

                const total = (await db.prepare(`SELECT COUNT(*) as c FROM images WHERE ${where}`).bind(...params).first()).c;
                const { results } = await db.prepare(`SELECT * FROM images WHERE ${where} ORDER BY id DESC LIMIT ? OFFSET ?`).bind(...params, limit, offset).all();

                return jsonRes({ data: results, total, page, limit });
            }

            // 5. 保存图片 (支持批量添加：urls 用换行分隔)
            if (path === '/api/admin/image/save' && method === 'POST') {
                const { urls, category_id } = await request.json();
                if (!urls) return errRes('链接不能为空');
                
                const urlList = urls.split('\n').map(u => u.trim()).filter(u => u);
                const now = Math.floor(Date.now() / 1000);
                
                // 批量插入
                const stmt = db.prepare("INSERT INTO images (category_id, url, name, created_at) VALUES (?, ?, ?, ?)");
                const batch = urlList.map(u => {
                    // 尝试从URL提取文件名作为名称
                    let name = u.substring(u.lastIndexOf('/') + 1);
                    if(name.length > 50) name = name.substring(0, 50);
                    return stmt.bind(category_id || 1, u, name, now);
                });
                
                if (batch.length > 0) await db.batch(batch);
                return jsonRes({ success: true, count: batch.length });
            }

            // 6. 批量删除图片
            if (path === '/api/admin/image/delete' && method === 'POST') {
                const { ids } = await request.json(); // ids 是数组 [1, 2, 3]
                if (!ids || ids.length === 0) return errRes('未选择图片');
                
                const placeholders = ids.map(() => '?').join(',');
                await db.prepare(`DELETE FROM images WHERE id IN (${placeholders})`).bind(...ids).run();
                return jsonRes({ success: true });
            }

            // 7. 修改图片信息（移动分类/重命名）
            if (path === '/api/admin/image/update' && method === 'POST') {
                const { id, name, category_id } = await request.json();
                await db.prepare("UPDATE images SET name=?, category_id=? WHERE id=?").bind(name, category_id, id).run();
                return jsonRes({ success: true });
            }

            // 8. [核心功能] 扫描全站图片并入库 (升级版：URL唯一 & 标题自动合并)
            if (path === '/api/admin/images/scan' && method === 'POST') {
                const now = Math.floor(Date.now() / 1000);
                
                // 使用 Map<URL, Set<Name>> 结构
                // Key: 图片URL (唯一)
                // Value: Set 集合 (存放该图片对应的所有名称，Set会自动去重)
                const scanMap = new Map();

                const add = (url, name) => {
                    if (!url) return;
                    url = url.trim(); // 去除首尾空格
                    
                    if (!scanMap.has(url)) {
                        scanMap.set(url, new Set());
                    }
                    
                    if (name) {
                        // 简单清洗名称（去掉可能的HTML标签），并添加到集合中
                        const cleanName = name.replace(/<[^>]+>/g, '').trim();
                        if(cleanName) scanMap.get(url).add(cleanName);
                    }
                };

                // 1. 扫描商品主图
                const products = await db.prepare("SELECT image_url, name FROM products WHERE image_url IS NOT NULL AND image_url != ''").all();
                products.results.forEach(p => add(p.image_url, p.name));

                // 2. 扫描商品规格图
                const variants = await db.prepare("SELECT image_url, name FROM variants WHERE image_url IS NOT NULL AND image_url != ''").all();
                variants.results.forEach(v => add(v.image_url, v.name));

                // 3. 扫描文章封面
                const articles = await db.prepare("SELECT cover_image, title FROM articles WHERE cover_image IS NOT NULL AND cover_image != ''").all();
                articles.results.forEach(a => add(a.cover_image, a.title));
                
                // 4. 扫描系统配置 (Logo/Favicon等)
                const config = await db.prepare("SELECT key, value FROM site_config").all();
                config.results.forEach(c => {
                    const val = c.value || '';
                    // 只要是图片链接就加进去
                    if(val.match(/^https?:\/\/.+\.(jpg|png|jpeg|gif|webp|ico|svg)$/i)) {
                        add(val, c.key);
                    }
                });

            // 5. (优化版) 直接构建插入语句，利用 SQL 判断是否存在，无需将所有 URL 加载到内存
                // 使用 WHERE NOT EXISTS 避免重复，这是防止内存溢出的最佳方案
                const stmt = db.prepare(`
                    INSERT INTO images (category_id, url, name, created_at) 
                    SELECT 1, ?1, ?2, ?3 
                    WHERE NOT EXISTS (SELECT 1 FROM images WHERE url = ?1)
                `);
                
                const batch = [];

                // 6. 遍历 Map 生成批量执行队列
                for (const [url, nameSet] of scanMap) {
                    // 拼接标题
                    let joinedName = Array.from(nameSet).join('/');
                    
                    // 截取长度防止溢出
                    if (joinedName.length > 100) {
                        joinedName = joinedName.substring(0, 97) + '...';
                    }
                    if (!joinedName) joinedName = '未命名图片';
                    
                    // 直接加入队列，无需在 JS 层判断是否存在
                    batch.push(stmt.bind(url, joinedName, now));
                }

                if (batch.length > 0) await db.batch(batch);
                return jsonRes({ success: true, count: batch.length });
            }

            // 8. [核心功能] 扫描全站图片并入库 (升级版：URL唯一 & 标题自动合并)
            if (path === '/api/admin/images/scan' && method === 'POST') {
                // ... (略去原有代码以节省篇幅，保持原有 scan 逻辑不变) ...
                // 找到原代码中 scan 逻辑结束的大括号
                return jsonRes({ success: true, count: batch.length });
            }

            // ====== [新增] GitHub 图床接口 (上传/列表/删除) ======
            if (path.startsWith('/api/admin/gh/')) {
                // 读取配置
                const conf = {};
                (await db.prepare("SELECT key, value FROM site_config WHERE key IN ('gh_token','gh_user','gh_repo')").all()).results.forEach(r => conf[r.key] = r.value);
                if (!conf.gh_token || !conf.gh_repo || !conf.gh_user) return errRes('请先在系统设置配置 gh_token, gh_user, gh_repo');

                // 1. 上传图片
                if (path === '/api/admin/gh/upload' && method === 'POST') {
                    const formData = await request.formData();
                    const file = formData.get('file');
                    if (!file) return errRes('未选择文件');
                    const filename = 'image/' + Date.now() + '_' + file.name.replace(/[^\w\.-]/g, '');
                    const u8 = new Uint8Array(await file.arrayBuffer());
                    let binary = '';
                    for (let i = 0; i < u8.length; i += 32768) {
                        binary += String.fromCharCode(...u8.subarray(i, i + 32768));
                    }
                    const contentBase64 = btoa(binary);
                    const ghRes = await fetch(`https://api.github.com/repos/${conf.gh_user}/${conf.gh_repo}/contents/${filename}`, {
                        method: 'PUT',
                        headers: { 'Authorization': `Bearer ${conf.gh_token}`, 'User-Agent': 'Cloudflare-Worker', 'Content-Type': 'application/json' },
                        body: JSON.stringify({ message: 'Upload via Admin', content: contentBase64 })
                    });
                    const ghData = await ghRes.json();
                    if (ghRes.status !== 201 && ghRes.status !== 200) return errRes(ghData.message || '上传失败');
                    const downloadUrl = `/gh_image/${filename}`;
                    // 顺便入库 image 表以便管理
                    try { await db.prepare("INSERT INTO images (category_id, url, name, created_at) VALUES (1, ?, ?, ?)").bind(downloadUrl, file.name, time()).run(); } catch(e){}
                    
                    return jsonRes({ location: downloadUrl });
                }

                // 2. 删除图片 (需要传入文件路径和SHA，这里简化为只从库删除或尝试API删除)
                // 为简化操作，此处建议只做数据库清理，GitHub物理删除比较复杂需要先获取SHA
            }
            
            // --- 系统设置 API (已修改: 支持 UPSERT) ---
            if (path === '/api/admin/settings/get') {
                const res = await db.prepare("SELECT * FROM site_config").all();
                const config = {}; res.results.forEach(r => config[r.key] = r.value);
                return jsonRes(config);
            }
            if (path === '/api/admin/settings/save' && method === 'POST') {
                const settings = await request.json();
                // 使用 UPSERT 语法：如果键不存在则插入，存在则更新
                const stmts = Object.keys(settings).map(key => 
                    db.prepare(`
                        INSERT INTO site_config (key, value) VALUES (?, ?) 
                        ON CONFLICT(key) DO UPDATE SET value = excluded.value
                    `).bind(key, settings[key])
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
            return jsonRes(config);
        }

        // [新增] 获取所有分类 (公开)
        if (path === '/api/shop/categories') {
            const { results } = await db.prepare("SELECT * FROM categories ORDER BY sort DESC, id DESC").all();
            return jsonRes(results);
        }

        // [修改] 首页商品接口性能优化 (批量查询)
        if (path === '/api/shop/products') {
            // 1. 获取所有上架商品
            const res = (await db.prepare("SELECT * FROM products WHERE active=1 ORDER BY sort DESC").all()).results;
            
            if (res.length > 0) {
                // 2. [性能优化] 批量获取所有相关规格，避免 N+1 循环查询导致的速度慢
                // 提取所有商品的 ID
                const ids = res.map(p => p.id).join(',');
                
                // 一次性查出所有涉及的规格
                const allVariants = (await db.prepare(`SELECT * FROM variants WHERE product_id IN (${ids})`).all()).results;
                
                // 在内存中将规格按 product_id 分组
                const variantsMap = {};
                allVariants.forEach(v => {
                    // 解析批发配置
                    if (v.wholesale_config) {
                         try { v.wholesale_config = JSON.parse(v.wholesale_config); } catch(e) { v.wholesale_config = null; }
                    }
                    
                    if (!variantsMap[v.product_id]) {
                        variantsMap[v.product_id] = [];
                    }
                    variantsMap[v.product_id].push(v);
                });

                // 3. 将规格挂载到对应商品对象上
                for(let p of res) {
                    p.variants = variantsMap[p.id] || [];
                }
            }
            
            return jsonRes(res);
        }
        
        // [修复] 获取单个商品详情 (修复 404 问题)
        if (path === '/api/shop/product') {
            const id = url.searchParams.get('id');
            if (!id) return errRes('参数错误：缺少商品ID');

            // 1. 获取商品主信息
            const product = await db.prepare("SELECT * FROM products WHERE id = ? AND active=1").bind(id).first();
            if (!product) return errRes('商品不存在或已下架', 404);

            // 2. 获取规格信息
            const variants = (await db.prepare("SELECT * FROM variants WHERE product_id = ? AND active = 1 ORDER BY sort DESC, id ASC").bind(id).all()).results;
            
            // 3. 解析批发配置和数字类型
            variants.forEach(v => {
                if (v.wholesale_config) {
                     try { v.wholesale_config = JSON.parse(v.wholesale_config); } catch(e) { v.wholesale_config = null; }
                }
                // 强制转换为数字，防止前端判断出错
                v.custom_markup = Number(v.custom_markup || 0);
                v.auto_delivery = Number(v.auto_delivery);
            });

            product.variants = variants;
            return jsonRes(product);
        }

        // =============================================
        // === [新增] 文章系统前端 API 升级 ===
        // =============================================

        // [新增] 获取文章分类 (公开)
        if (path === '/api/shop/article/categories') {
            const { results } = await db.prepare("SELECT * FROM article_categories ORDER BY sort DESC, id DESC").all();
            return jsonRes(results);
        }

        // [升级] 获取文章列表 (含摘要、首图、置顶、浏览量)
        if (path === '/api/shop/articles/list') {
            // 修改点：增加查询 a.cover_image 字段
            const { results } = await db.prepare(`
                SELECT a.id, a.title, a.content, a.created_at, a.is_notice, a.view_count, a.category_id, a.cover_image, ac.name as category_name
                FROM articles a
                LEFT JOIN article_categories ac ON a.category_id = ac.id
                ORDER BY a.is_notice DESC, a.view_count DESC, a.created_at DESC
            `).all();
            
            // 处理数据
            const processed = results.map(r => {
                const contentStr = r.content || '';
                // 1. 提取纯文本摘要 (去标签)
                const text = contentStr.replace(/<[^>]+>/g, '');
                // 2. 提取第一张图片 (作为备选)
                const imgMatch = contentStr.match(/<img[^>]+src="([^">]+)"/);
                
                return {
                    id: r.id,
                    title: r.title,
                    category_name: r.category_name || '默认分类',
                    category_id: r.category_id,
                    created_at: r.created_at,
                    is_notice: r.is_notice,
                    view_count: r.view_count || 0,
                    // 修改点：返回后台设置的封面图，如果没有设置，则自动使用文章内第一张图
                    cover_image: r.cover_image || (imgMatch ? imgMatch[1] : null),
                    // 修改点：返回后端处理好的摘要 snippet
                    snippet: text.substring(0, 100) + (text.length > 100 ? '...' : '')
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

        // ===========================
        // --- 定时任务 API (Cron) ---
        // ===========================
        // [新增] Outlook Token 保活接口
        if (path === '/api/cron/outlook') {
            // 1. 读取配置 (同时读取管理员和客户的 Outlook 配置)
            const keys = [
                'outlook_active', 'outlook_client_id', 'outlook_client_secret', 'outlook_refresh_token',
                'customer_outlook_active', 'customer_outlook_client_id', 'customer_outlook_client_secret', 'customer_outlook_refresh_token'
            ];
            // 动态构建占位符
            const placeholders = keys.map(() => '?').join(',');
            const confRes = await db.prepare(`SELECT key, value FROM site_config WHERE key IN (${placeholders})`).bind(...keys).all();
            
            const config = {};
            if (confRes && confRes.results) {
                confRes.results.forEach(r => config[r.key] = r.value);
            }

            const logs = [];

            // 定义刷新逻辑封装函数
            const refreshTokenLogic = async (prefix) => {
                const active = config[`${prefix}_active`];
                const clientId = config[`${prefix}_client_id`];
                const clientSecret = config[`${prefix}_client_secret`] || ''; // 部分应用可能无需 secret
                const refreshToken = config[`${prefix}_refresh_token`];

                // 如果未开启或缺少必要参数，直接跳过
                if (active !== '1' || !clientId || !refreshToken) {
                    logs.push(`[${prefix}] Skipped: Not active or missing config`);
                    return;
                }

                try {
                    const tokenUrl = 'https://login.microsoftonline.com/common/oauth2/v2.0/token';
                    const params = new URLSearchParams();
                    params.append('client_id', clientId);
                    if (clientSecret) params.append('client_secret', clientSecret);
                    params.append('refresh_token', refreshToken);
                    params.append('grant_type', 'refresh_token');
                    params.append('scope', 'Mail.Send offline_access');

                    const tokenRes = await fetch(tokenUrl, { method: 'POST', body: params });
                    const tokenData = await tokenRes.json();

                    if (tokenData.refresh_token) {
                        // 获取到新的 refresh_token，更新数据库
                        const dbKey = `${prefix}_refresh_token`;
                        await db.prepare(`
                            INSERT INTO site_config (key, value) VALUES (?, ?) 
                            ON CONFLICT(key) DO UPDATE SET value = excluded.value
                        `).bind(dbKey, tokenData.refresh_token).run();
                        
                        logs.push(`[${prefix}] Success: Token refreshed and saved.`);
                    } else if (tokenData.access_token) {
                        // 某些情况下微软可能只返回 access_token 而不返回新的 refresh_token (此时旧的仍有效，但也算成功)
                        logs.push(`[${prefix}] Success: Access Token retrieved (No new Refresh Token).`);
                    } else {
                        logs.push(`[${prefix}] Failed: ${tokenData.error_description || JSON.stringify(tokenData)}`);
                    }
                } catch (e) {
                    logs.push(`[${prefix}] Error: ${e.message}`);
                }
            };

            // 2. 并行执行刷新 (管理员 + 客户)
            await Promise.all([
                refreshTokenLogic('outlook'),
                refreshTokenLogic('customer_outlook')
            ]);

            return jsonRes({ status: 'finished', logs });
        }

        // --- 订单与支付 API (Shop) ---   
        // [新增] 联系方式查单接口 (配合 orders.html)
        if (path === '/api/shop/orders/query' && method === 'POST') {
            const { contact, query_password } = await request.json();
            if (!contact || !query_password) return errRes('参数不完整');
            
            // 查找匹配的订单
            const results = await db.prepare(`
                SELECT id, product_name, variant_name, total_amount, status, created_at, cards_sent 
                FROM orders 
                WHERE contact = ? AND query_password = ? 
                ORDER BY created_at DESC LIMIT 20
            `).bind(contact, query_password).all();
            
            // 格式化时间给前端
            const orders = results.results.map(o => {
                o.created_at_str = formatTime(o.created_at);
                return o;
            });

            return jsonRes(orders);
        }

        // =======================================================
        // [修改] 修复点 1： /api/shop/order/create
        // [修改] 增加未支付订单数量检查
        // =======================================================
        if (path === '/api/shop/order/create' && method === 'POST') {
            // 1. 接收 query_password
            const { variant_id, quantity, contact, payment_method, card_id, query_password } = await request.json();

            // --- 新增限制逻辑 START ---
            // 检查该联系人下的未支付订单数量
            const unpaidCount = (await db.prepare("SELECT COUNT(*) as c FROM orders WHERE contact=? AND status=0").bind(contact).first()).c;
            if (unpaidCount >= 2) {
                return errRes('您有过多未支付订单，请先支付或删除再下单', 400); 
            }
            // --- 新增限制逻辑 END ---

            const variant = await db.prepare("SELECT * FROM variants WHERE id=?").bind(variant_id).first();
            if (!variant) return errRes('规格不存在');
            if (variant.active === 0) return errRes('该规格已暂停销售');
            // [修改] 验证查单密码 (1位)
            if (!query_password || query_password.length < 1) {
                return errRes('请设置1位以上的查单密码');
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

        // =======================================================
        // [修改] 修复点 2： /api/shop/cart/checkout
        // [修改] 增加未支付订单数量检查
        // =======================================================
        if (path === '/api/shop/cart/checkout' && method === 'POST') {
            const { items, contact, query_password, payment_method } = await request.json();
            
            if (!items || items.length === 0) return errRes('购物车为空');
            // [修改] 验证查单密码 (1位)
            if (!query_password || query_password.length < 1) {
                return errRes('请设置1位以上的查单密码');
            }

            // --- 新增限制逻辑 START ---
            const unpaidCount = (await db.prepare("SELECT COUNT(*) as c FROM orders WHERE contact=? AND status=0").bind(contact).first()).c;
            if (unpaidCount >= 2) {
                return errRes('您有过多未支付订单，请先支付或删除再下单', 400);
            }
            // --- 新增限制逻辑 END ---

            let total_amount = 0;
            const validatedItems = []; // 存储后端验证过的商品信息

            for (const item of items) {
                // 假设前端传来的 ID 正确，查库验证
                // 注意：前端 cart-page.js 已修复为传 variantId
                const variant = await db.prepare("SELECT * FROM variants WHERE id=?").bind(item.variantId).first();
                if (!variant) throw new Error(`商品 ${item.variantName} 规格不存在`);

                let stock = 0;
                let finalPrice = variant.price; // 从数据库重新计算

                if (item.buyMode === 'select' && item.selectedCardId) {
                    // 1. 自选模式
                    if (variant.auto_delivery !== 1) throw new Error('手动发货商品不支持自选');
                    const targetCard = await db.prepare("SELECT id FROM cards WHERE id=? AND variant_id=? AND status=0")
                        .bind(item.selectedCardId, item.variantId).first();
                    if (!targetCard) throw new Error(`商品 ${item.variantName} 的自选号码已被抢走`);
                    stock = 1; // 足够
                    
                    // 重新计算自选价格
                    finalPrice = variant.price;
                    if (variant.custom_markup > 0) finalPrice += variant.custom_markup;
                    
                } else {
                    // 2. 随机/手动 模式
                    if (variant.auto_delivery === 1) {
                        stock = (await db.prepare("SELECT COUNT(*) as c FROM cards WHERE variant_id=? AND status=0").bind(item.variantId).first()).c;
                    } else {
                        stock = variant.stock;
                    }
                    if (stock < item.quantity) throw new Error(`商品 ${item.variantName} 库存不足 (仅剩 ${stock} 件)`);
                    
                    // 2b. 重新计算批发价 (仅随机模式)
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
                
                // 存储验证后的信息
                validatedItems.push({
                    variantId: variant.id,
                    productName: item.productName,
                    variantName: item.variantName,
                    quantity: item.quantity,
                    price: finalPrice, // 使用后端计算的单价
                    buyMode: item.buyMode,
                    selectedCardId: item.selectedCardId,
                    auto_delivery: variant.auto_delivery // 存储发货类型
                });
            }

            if (total_amount <= 0.01) return errRes('金额必须大于 0.01');

            const order_id = uuid();
            const now = time();

            // 创建一个“父订单”
            await db.prepare(`
                INSERT INTO orders (id, variant_id, product_name, variant_name, price, quantity, total_amount, contact, query_password, payment_method, created_at, status, cards_sent) 
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)
            `).bind(
                order_id, 
                0, // 0 表示这是一个合并订单
                "购物车合并订单",
                `共 ${items.length} 件商品`,
                total_amount, 
                1, 
                total_amount.toFixed(2),
                contact,
                query_password,
                payment_method,
                now,
                JSON.stringify(validatedItems) // 将验证过的购物车存入 cards_sent
            ).run();

            return jsonRes({ order_id, total_amount, payment_method });
        }

        // =======================================================
        // [新增] 用户删除未支付订单接口 (配合 orders.html)
        // =======================================================
        if (path === '/api/shop/order/delete' && method === 'POST') {
            const { id, contact, query_password } = await request.json();
            
            // 1. 验证订单归属 (必须匹配 ID, Contact, Password, 且 Status=0)
            const order = await db.prepare("SELECT id FROM orders WHERE id=? AND contact=? AND query_password=? AND status=0")
                .bind(id, contact, query_password).first();
                
            if (!order) {
                return errRes('删除失败：订单不存在、密码错误或订单已支付');
            }

            // 2. 执行删除
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
                         subject: `HLTX订单号：${order.id}` // 合并订单会显示 “购物车合并订单” 商品名称是：subject: `${order.product_name}`
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
            
            // 验签失败直接返回
            if (!signVerified) {
                console.error('Alipay Notify: Signature verification failed');
                return new Response('fail');
            }

            if (params.trade_status === 'TRADE_SUCCESS') {
                const out_trade_no = params.out_trade_no;
                const trade_no = params.trade_no;
                
                // 【修复点1】删除 BEGIN TRANSACTION，直接执行更新
                await db.prepare("UPDATE orders SET status=1, paid_at=?, trade_no=? WHERE id=? AND status=0")
                        .bind(time(), trade_no, out_trade_no).run();

                const order = await db.prepare("SELECT * FROM orders WHERE id=? AND status=1").bind(out_trade_no).first();
                
                if (order) {
                    
                    // --- 1. 读取配置 (新增客户通知配置) ---
                    const adminConfigKeys = [
                        'tg_active', 'tg_bot_token', 'tg_chat_id', 
                        'brevo_active', 'brevo_key', 'brevo_sender', 'mail_to',
                        'outlook_active', 'outlook_client_id', 'outlook_client_secret', 'outlook_refresh_token'
                    ];
                    // [新增] 客户通知的配置键
                    const customerConfigKeys = [
                        'customer_outlook_active', 'customer_outlook_client_id', 
                        'customer_outlook_client_secret', 'customer_outlook_refresh_token'
                    ];
                    const allConfigKeys = [...adminConfigKeys, ...customerConfigKeys];
                    const placeholders = allConfigKeys.map(() => '?').join(',');
                    
                    const systemConfig = {};
                    try {
                        const confRes = await db.prepare(`SELECT key, value FROM site_config WHERE key IN (${placeholders})`).bind(...allConfigKeys).all();
                        if (confRes && confRes.results) {
                            confRes.results.forEach(r => systemConfig[r.key] = r.value);
                        }
                    } catch(e) { console.error("Config read error:", e); }

                    // --- 2. 初始化发货数据结构 ---
                    let contentBody = ''; // for Admin notification
                    const allCardsContent = []; // Delivered cards (for order update and customer email)
                    const stmts = []; // DB statements for fulfillment
                    const autoVariantIdsToUpdate = new Set(); // Auto-delivery variants needing stock update
                    let newOrderStatus = 2; // Assume success/manual for now
                    const isCartOrder = order.variant_id === 0;
                    let singleVariant; // Store variant info for single order mode (only used if not cart order)


                    // --- 3. 核心发货逻辑 (填充 stmts, allCardsContent, contentBody) ---
                    try {
                        
                        if (isCartOrder) {
                            // === 情况A：购物车合并订单 ===
                            contentBody = '【购物车合并订单】\n----------------';
                            const cartItems = JSON.parse(order.cards_sent || '[]');
                            
                            for (const item of cartItems) {
                                let itemCardsContent = [];
                                const variant = await db.prepare("SELECT auto_delivery, stock FROM variants WHERE id=?").bind(item.variantId).first();
                                
                                if (!variant) continue; // Skip if variant no longer exists

                                if (variant.auto_delivery === 1) {
                                    // 自动发货
                                    let cards;
                                    if (item.buyMode === 'select' && item.selectedCardId) {
                                        cards = await db.prepare("SELECT id, content FROM cards WHERE id=? AND status=0").bind(item.selectedCardId).all();
                                    } else {
                                        cards = await db.prepare("SELECT id, content FROM cards WHERE variant_id=? AND status=0 LIMIT ?").bind(item.variantId, item.quantity).all();
                                    }
                                    
                                    if (cards.results.length >= item.quantity) {
                                        const cardIds = cards.results.map(c => c.id);
                                        itemCardsContent = cards.results.map(c => c.content);
                                        allCardsContent.push(...itemCardsContent);
                                        
                                        stmts.push(db.prepare(`UPDATE cards SET status=1, order_id=? WHERE id IN (${cardIds.join(',')})`).bind(out_trade_no));
                                        stmts.push(db.prepare("UPDATE variants SET sales_count = sales_count + ? WHERE id=?").bind(item.quantity, item.variantId));
                                        autoVariantIdsToUpdate.add(item.variantId);

                                        // Admin 通知内容补充
                                        let itemNote = ' (随机)';
                                        if (item.buyMode === 'select' && item.selectedCardId) {
                                            const card = await db.prepare("SELECT content FROM cards WHERE id=?").bind(item.selectedCardId).first();
                                            const match = card?.content.match(/#\[(.*?)\]/);
                                            itemNote = ` (自选: ${match ? match[1] : '指定卡密'})`;
                                        }
                                        // 库存显示
                                        const currentCardCount = (await db.prepare("SELECT COUNT(*) as c FROM cards WHERE variant_id=? AND status=0").bind(item.variantId).first()).c;
                                        const finalStock = Math.max(0, currentCardCount - item.quantity);
                                        contentBody += `\n• ${item.productName} - ${item.variantName}${itemNote} × ${item.quantity} (库存：${finalStock})`;
                                    } else {
                                        // 缺货，不发货，但订单状态保持已支付 (status=1)
                                        contentBody += `\n• ${item.productName} - ${item.variantName} × ${item.quantity} (缺货，需手动处理)`;
                                        newOrderStatus = 1; 
                                    }
                                } else {
                                    // 手动发货
                                    stmts.push(db.prepare("UPDATE variants SET stock = stock - ?, sales_count = sales_count + ? WHERE id=?").bind(item.quantity, item.quantity, item.variantId));
                                    const finalStock = Math.max(0, (variant.stock || 0) - item.quantity);
                                    contentBody += `\n• ${item.productName} - ${item.variantName} (手动发货) × ${item.quantity} (库存：${finalStock})`;
                                }
                            }
                            if (newOrderStatus !== 1 && allCardsContent.length === 0) {
                                // 纯手动发货的购物车订单，确保状态仍为 2
                                newOrderStatus = 2;
                            }
                        } else {
                            // === 情况B：单个商品直接下单 ===
                            singleVariant = await db.prepare("SELECT auto_delivery, name, price, stock FROM variants WHERE id=?").bind(order.variant_id).first();
                            if (!singleVariant) throw new Error("Variant not found for single order fulfillment.");
                            
                            let modeLine = '类型：默认随机';
                            
                            if (singleVariant.auto_delivery === 1) {
                                // 自动发货
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
                                    allCardsContent.push(...cards.results.map(c => c.content));
                                    
                                    stmts.push(db.prepare(`UPDATE cards SET status=1, order_id=? WHERE id IN (${cardIds.join(',')})`).bind(out_trade_no));
                                    stmts.push(db.prepare("UPDATE variants SET sales_count = sales_count + ? WHERE id=?").bind(order.quantity, order.variant_id));
                                    autoVariantIdsToUpdate.add(order.variant_id);
                                    
                                    if (targetCardId) {
                                        const match = cards.results[0]?.content.match(/#\[(.*?)\]/);
                                        modeLine = `类型：自选/加价 (${match ? match[1] : '指定卡密'})`;
                                    }
                                } else {
                                    console.error(`Notify Warning: Order ${out_trade_no} paid but insufficient stock.`);
                                    newOrderStatus = 1; // 缺货，保持已支付状态
                                }
                            } else {
                                // 手动发货
                                stmts.push(db.prepare("UPDATE variants SET stock = stock - ?, sales_count = sales_count + ? WHERE id=?").bind(order.quantity, order.quantity, order.variant_id));
                                modeLine = '类型：手动发货';
                            }

                            // Admin 通知内容
                            const currentCardCount = (await db.prepare("SELECT COUNT(*) as c FROM cards WHERE variant_id=? AND status=0").bind(order.variant_id).first()).c;
                            const stockValue = singleVariant.auto_delivery === 1 ? currentCardCount : singleVariant.stock;
                            // 如果成功发货，则从库存中减去购买数量
                            const finalStock = Math.max(0, stockValue - (newOrderStatus === 2 || singleVariant.auto_delivery === 0 ? order.quantity : 0));
                            
                            contentBody = `商品：${order.product_name}\n规格：${order.variant_name}\n${modeLine}\n数量：${order.quantity} (库存：${finalStock})`;
                        }

                    } catch (e) {
                        console.error('Fulfillment Error:', e);
                        newOrderStatus = 1; // 出现错误，状态保持已支付，留待人工处理
                        contentBody += '\n(发货系统错误，请人工核查!)';
                    }

                    // --- 4. 数据库最终更新 (订单状态和卡密内容) ---
                    if (newOrderStatus === 2) {
                        // 仅在成功发货或手动发货（不需要卡密）的情况下更新状态到 2
                        stmts.push(db.prepare("UPDATE orders SET status=2, cards_sent=? WHERE id=?").bind(JSON.stringify(allCardsContent), out_trade_no));
                    } 
                    // else: 如果是缺货(status=1)，则不更新 cards_sent，保持 status=1

                    if (stmts.length > 0) {
                        // 批量执行发货和销售计数更新
                        await db.batch(stmts);
                    }
                    
                    // 更新自动发货商品的库存 (单独批处理，避免在主事务中出错)
                    if (autoVariantIdsToUpdate.size > 0) {
                        const stockUpdateStmts = Array.from(autoVariantIdsToUpdate).map(vid => 
                            db.prepare("UPDATE variants SET stock = (SELECT COUNT(*) FROM cards WHERE variant_id=? AND status=0) WHERE id = ?").bind(vid, vid)
                        );
                        await db.batch(stockUpdateStmts);
                    }
                    
                    // --- 5. 发送通知 ---
                    const notifications = [];
                    const dateDate = new Date((order.paid_at || Date.now()/1000) * 1000 + 28800000); 
                    const dateStr = `${dateDate.getFullYear()}/${dateDate.getMonth() + 1}/${dateDate.getDate()}`;
                    
                    // A. 管理员通知
                    const msgText = `新订单通知！
完成订单：${dateStr}
${contentBody}
----------------
总金额：${order.total_amount}元
联系方式：${order.contact}
订单号：${order.id}`;

                    // Telegram/Outlook/Brevo 推送 (保持原有的)
                    if (systemConfig.tg_active === '1' && systemConfig.tg_bot_token && systemConfig.tg_chat_id) {
                        notifications.push(fetch(`https://api.telegram.org/bot${systemConfig.tg_bot_token}/sendMessage`, {
                            method: 'POST', headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ chat_id: systemConfig.tg_chat_id, text: msgText })
                        }));
                    }
                    if (systemConfig.outlook_active === '1' && systemConfig.outlook_client_id && systemConfig.outlook_refresh_token && systemConfig.mail_to) {
                        notifications.push(sendOutlookMail(db, systemConfig, 'outlook', `新订单通知：${order.id}`, msgText));
                    }
                    if (systemConfig.brevo_active === '1' && systemConfig.brevo_key && systemConfig.mail_to && systemConfig.brevo_sender) {
                        notifications.push(fetch("https://api.brevo.com/v3/smtp/email", {
                            method: "POST", headers: { "accept": "application/json", "api-key": systemConfig.brevo_key, "content-type": "application/json" },
                            body: JSON.stringify({
                                "sender": { "email": systemConfig.brevo_sender, "name": "夏雨店铺" },
                                "to": [{ "email": systemConfig.mail_to }],
                                "subject": `新订单通知：${order.id}`,
                                "htmlContent": msgText.replace(/\n/g, '<br>')
                            })
                        }));
                    }
                    
                    // B. [新增] 客户发货通知
                    const customerEmail = isEmail(order.contact) ? order.contact : null;
                    
                    if (newOrderStatus === 2 && customerEmail) {
                        let isManualOrder = false;
                        if (!isCartOrder) {
                             isManualOrder = singleVariant?.auto_delivery === 0;
                        } 
                        
                        const hasDeliveredCards = allCardsContent.length > 0;
                        
                        // 只有在成功发货（status=2）时，才发送邮件
                        if (isManualOrder || hasDeliveredCards || (isCartOrder && newOrderStatus === 2)) {
                            
                            // --- 构建客户邮件内容 ---
                            let cardContentForCustomer = '';
                            let customerEmailSubject = `发货通知：您的订单 ${order.id} 已完成`;
                            
                            if (hasDeliveredCards) {
                                const cleanCards = allCardsContent.map(card => card.replace(/#\[.*?\]/g, '').trim());
                                cardContentForCustomer = cleanCards.join('\n');
                            } else if (isManualOrder) {
                                cardContentForCustomer = '该商品为手动发货，系统已扣除库存。请联系客服获取商品或等待客服手动处理。';
                            } else if (isCartOrder) {
                                // 购物车中包含手动发货商品的情况
                                if (allCardsContent.length > 0) {
                                    const cleanCards = allCardsContent.map(card => card.replace(/#\[.*?\]/g, '').trim());
                                    cardContentForCustomer = '部分商品卡密已发送：\n' + cleanCards.join('\n') + '\n\n**注意**：订单中可能包含手动发货商品，请联系客服获取未发货商品。';
                                } else {
                                    cardContentForCustomer = '您的订单为手动发货订单（或包含手动发货商品），请联系客服获取商品。';
                                }
                            } else {
                                cardContentForCustomer = '系统已完成发货操作，但无卡密内容（可能为手动发货或无卡密商品）。请联系客服获取商品。';
                            }
                            
                            let productNameForCustomer = order.product_name;
                            if (!isCartOrder) {
                                productNameForCustomer = `${order.product_name} - ${order.variant_name}`;
                            } else {
                                productNameForCustomer = `购物车合并订单`;
                            }

                            const customerMailBody = `发货通知！
完成订单：${dateStr}
商品：${productNameForCustomer}
卡密：
${cardContentForCustomer}
----------------
总金额：${order.total_amount}元
订单号：${order.id}`;

                            // --- 客户 Outlook 推送 ---
                            const c_active = systemConfig.customer_outlook_active === '1';
                            const c_client_id = systemConfig.customer_outlook_client_id;
                            const c_secret = systemConfig.customer_outlook_client_secret;
                            const c_refresh = systemConfig.customer_outlook_refresh_token;

                            if (c_active && c_client_id && c_refresh) {
                                // [修改] 直接传入 systemConfig，并指定前缀为 'customer_outlook'，确保能自动更新对应的 Token
                                notifications.push(sendOutlookMail(db, systemConfig, 'customer_outlook', customerEmailSubject, customerMailBody));
                            }
                        }
                    } 


                    // 异步发送
                    if (notifications.length > 0 && ctx && ctx.waitUntil) {
                        ctx.waitUntil(Promise.all(notifications));
                    } else if (notifications.length > 0) {
                        Promise.all(notifications).catch(err => console.error('Notification Error:', err));
                    }
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

// === 辅助函数：Outlook Graph API 发信 (支持自动刷新管理员和客户令牌) ===
async function sendOutlookMail(db, config, keyPrefix, subject, content) {
    try {
        // 兼容处理：如果未传入 keyPrefix，默认尝试读取 outlook_ 前缀
        const p = keyPrefix || 'outlook';
        
        // 动态读取配置：根据前缀 (outlook 或 customer_outlook) 读取对应的 ID/Secret/Token
        const clientId = config[`${p}_client_id`] || config.outlook_client_id;
        const clientSecret = config[`${p}_client_secret`] || config.outlook_client_secret || '';
        const refreshToken = config[`${p}_refresh_token`] || config.outlook_refresh_token;

        // 1. 获取 Access Token
        const tokenUrl = 'https://login.microsoftonline.com/common/oauth2/v2.0/token';
        const params = new URLSearchParams();
        params.append('client_id', clientId);
        params.append('client_secret', clientSecret);
        params.append('refresh_token', refreshToken);
        params.append('grant_type', 'refresh_token');
        params.append('scope', 'Mail.Send offline_access');

        const tokenRes = await fetch(tokenUrl, { method: 'POST', body: params });
        const tokenData = await tokenRes.json();

        if (!tokenData.access_token) {
            console.error(`Outlook Auth Error (${p}):`, tokenData);
            return;
        }

        // 2. [核心] 自动更新 Refresh Token 到数据库
        // 只有当 db 存在，且返回了新的 refresh_token 时才执行
        if (tokenData.refresh_token && tokenData.refresh_token !== refreshToken && db) {
            try {
                // 构造数据库的键名 (例如 outlook_refresh_token 或 customer_outlook_refresh_token)
                const dbKey = `${p}_refresh_token`;
                
                await db.prepare(`
                    INSERT INTO site_config (key, value) VALUES (?, ?) 
                    ON CONFLICT(key) DO UPDATE SET value = excluded.value
                `).bind(dbKey, tokenData.refresh_token).run();
                
                console.log(`Refreshed token for ${dbKey} saved to DB.`);
            } catch (e) { 
                console.error('DB Update Error:', e); 
            }
        }

        // 3. 发送邮件
        const mailUrl = 'https://graph.microsoft.com/v1.0/me/sendMail';
        await fetch(mailUrl, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${tokenData.access_token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                message: {
                    subject: subject,
                    body: { contentType: "Html", content: content.replace(/\n/g, '<br>') },
                    toRecipients: [{ emailAddress: { address: config.mail_to } }]
                },
                saveToSentItems: "false"
            })
        });
        
    } catch (e) {
        console.error(`Outlook Send Error (${keyPrefix}):`, e);
    }
}
