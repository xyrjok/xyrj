import { Router } from 'itty-router';
import { v4 as uuidv4 } from 'uuid';
import { createClient } from '@supabase/supabase-js';

const router = Router();

// --- 中间件：管理员身份验证 (已修正为使用环境变量) ---
const authMiddleware = async (request, env) => {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return new Response(JSON.stringify({ error: '未授权' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
    }
    const token = authHeader.split(' ')[1];
    
    // 从环境变量获取存储的Token
    const storedToken = env.ADMIN_TOKEN;
    
    if (!storedToken || token !== storedToken) {
        return new Response(JSON.stringify({ error: '无效的Token' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
    }
};

// --- API 路由 (公开) ---

// 获取公共配置 (站点标题、描述、主题等)
router.get('/api/shop/config', async (request, env) => {
    try {
        const keys = [
            'site_title', 'site_description', 'site_keywords', 
            'site_logo_url', 'site_footer_text', 'theme',
            'site_announcement', 'payment_alipay_f2f_enabled'
        ];
        const placeholders = keys.map(() => '?').join(',');
        
        const { data, error } = await env.DB.prepare(
            `SELECT key, value FROM settings WHERE key IN (${placeholders})`
        ).bind(...keys).all();

        if (error) throw error;

        const config = data.reduce((acc, item) => {
            acc[item.key] = item.value;
            return acc;
        }, {});

        return new Response(JSON.stringify(config), {
            headers: { 'Content-Type': 'application/json' }
        });
    } catch (e) {
        return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    }
});

// 获取所有商品和分类 (公开)
router.get('/api/shop/products', async (request, env) => {
    try {
        const { results: categories } = await env.DB.prepare("SELECT * FROM categories WHERE status = 1 ORDER BY sort_order ASC").all();
        const { results: products } = await env.DB.prepare("SELECT * FROM products WHERE status = 1 ORDER BY sort_order ASC").all();
        const { results: variants } = await env.DB.prepare("SELECT * FROM variants WHERE status = 1 ORDER BY sort_order ASC").all();
        
        const { results: variantMeta } = await env.DB.prepare(
            `SELECT 
                variant_id, 
                COUNT(CASE WHEN status = 0 THEN 1 END) as stock, 
                COUNT(CASE WHEN status = 1 THEN 1 END) as sales_count
             FROM cards 
             GROUP BY variant_id`
        ).all();
        
        const variantMetaMap = variantMeta.reduce((acc, item) => {
            acc[item.variant_id] = { stock: item.stock || 0, sales_count: item.sales_count || 0 };
            return acc;
        }, {});

        products.forEach(p => {
            p.variants = variants
                .filter(v => v.product_id === p.id)
                .map(v => ({
                    ...v,
                    stock: variantMetaMap[v.id]?.stock || 0,
                    sales_count: variantMetaMap[v.id]?.sales_count || 0
                }));
        });

        categories.forEach(c => {
            c.products = products.filter(p => p.category_id === c.id);
        });

        return new Response(JSON.stringify(categories), {
            headers: { 'Content-Type': 'application/json' }
        });
    } catch (e) {
        return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    }
});

// 获取可自选卡密 (公开)
router.get('/api/shop/cards/notes', async (request, env) => {
    const { query } = request;
    const variantId = query.variant_id;
    if (!variantId) {
        return new Response(JSON.stringify({ error: '缺少 variant_id' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }
    try {
        const { results } = await env.DB.prepare(
            "SELECT id, note FROM cards WHERE variant_id = ? AND status = 0 AND note IS NOT NULL LIMIT 50"
        ).bind(variantId).all();
        return new Response(JSON.stringify(results), { headers: { 'Content-Type': 'application/json' } });
    } catch (e) {
        return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    }
});

// 创建订单 (公开) - 已增加 query_password
router.post('/api/shop/order/create', async (request, env) => {
    try {
        const { variant_id, quantity, contact, payment_method, card_id, query_password } = await request.json();

        if (!variant_id || !quantity || !contact || !payment_method) {
            return new Response(JSON.stringify({ error: '缺少必要参数' }), { status: 400 });
        }
        
        const variant = await env.DB.prepare("SELECT * FROM variants WHERE id = ?").bind(variant_id).first();
        if (!variant) return new Response(JSON.stringify({ error: '规格不存在' }), { status: 404 });

        const product = await env.DB.prepare("SELECT name FROM products WHERE id = ?").bind(variant.product_id).first();

        let price = variant.price;
        let cardToLock = null;

        if (card_id) { 
            if (quantity > 1) return new Response(JSON.stringify({ error: '自选商品一次只能购买一个' }), { status: 400 });
            price += variant.custom_markup;
            cardToLock = await env.DB.prepare("SELECT * FROM cards WHERE id = ? AND variant_id = ? AND status = 0").bind(card_id, variant_id).first();
            if (!cardToLock) return new Response(JSON.stringify({ error: '选择的号码不存在或已被购买' }), { status: 400 });
        } else {
            const stockCheck = await env.DB.prepare("SELECT COUNT(id) as stock FROM cards WHERE variant_id = ? AND status = 0").bind(variant_id).first();
            if (stockCheck.stock < quantity) return new Response(JSON.stringify({ error: '库存不足' }), { status: 400 });
            
            if (variant.wholesale_config) {
                try {
                    let ws = JSON.parse(variant.wholesale_config);
                    ws.sort((a,b) => b.qty - a.qty);
                    for(let rule of ws) { if(quantity >= rule.qty) { price = rule.price; break; } }
                } catch(e) {}
            }
        }

        const totalAmount = (price * quantity).toFixed(2);
        const orderId = uuidv4();
        
        const orderInsert = env.DB.prepare(
            `INSERT INTO orders (id, product_id, variant_id, product_name, variant_name, quantity, total_amount, status, contact, payment_method, query_password) 
             VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?)`
        ).bind(
            orderId, 
            variant.product_id, 
            variant_id, 
            product.name, 
            variant.name, 
            quantity, 
            totalAmount, 
            contact, 
            payment_method,
            query_password || null
        );

        if (cardToLock) {
            const cardUpdate = env.DB.prepare("UPDATE cards SET status = 2, order_id = ? WHERE id = ?").bind(orderId, cardToLock.id);
            await env.DB.batch([orderInsert, cardUpdate]);
        } else {
            await orderInsert.run();
        }

        return new Response(JSON.stringify({ order_id: orderId, total_amount: totalAmount }), { status: 201 });
    } catch (e) {
        console.error('Create order error:', e);
        return new Response(JSON.stringify({ error: e.message }), { status: 500 });
    }
});

// 支付 (公开)
router.post('/api/shop/pay', async (request, env) => {
    const { order_id } = await request.json();
    if (!order_id) return new Response(JSON.stringify({ error: '缺少 order_id' }), { status: 400 });

    const order = await env.DB.prepare("SELECT * FROM orders WHERE id = ?").bind(order_id).first();
    if (!order) return new Response(JSON.stringify({ error: '订单不存在' }), { status: 404 });
    if (order.status !== 0) return new Response(JSON.stringify({ error: '订单状态异常' }), { status: 400 });

    // 模拟支付
    const payData = {
        type: 'qrcode',
        qr_code: `https://example.com/pay?order_id=${order_id}&amount=${order.total_amount}`,
        order_id: order_id
    };
    
    // 模拟支付回调
    env.CTX.waitUntil(
        (async () => {
            await new Promise(resolve => setTimeout(resolve, 10000));
            
            const currentOrder = await env.DB.prepare("SELECT * FROM orders WHERE id = ?").bind(order_id).first();
            if (currentOrder && currentOrder.status === 0) {
                
                let cardsToUpdate;
                const lockedCard = await env.DB.prepare("SELECT * FROM cards WHERE order_id = ? AND status = 2").bind(order_id).first();
                
                if (lockedCard) {
                    cardsToUpdate = [lockedCard];
                } else {
                    const { results } = await env.DB.prepare(
                        "SELECT * FROM cards WHERE variant_id = ? AND status = 0 LIMIT ?"
                    ).bind(currentOrder.variant_id, currentOrder.quantity).all();
                    cardsToUpdate = results;
                }

                if (cardsToUpdate.length < currentOrder.quantity) {
                    await env.DB.prepare("UPDATE orders SET status = 3 WHERE id = ?").bind(order_id).run();
                } else {
                    const statements = [
                        env.DB.prepare("UPDATE orders SET status = 1, paid_at = CURRENT_TIMESTAMP WHERE id = ?").bind(order_id)
                    ];
                    cardsToUpdate.forEach(card => {
                        statements.push(
                            env.DB.prepare("UPDATE cards SET status = 1, order_id = ? WHERE id = ?").bind(order_id, card.id)
                        );
                    });
                    await env.DB.batch(statements);
                }
            }
        })()
    );

    return new Response(JSON.stringify(payData));
});

// 查询订单状态 (公开)
router.get('/api/shop/order/status', async (request, env) => {
    const { query } = request;
    const orderId = query.order_id;
    if (!orderId) return new Response(JSON.stringify({ error: '缺少 order_id' }), { status: 400 });

    const order = await env.DB.prepare("SELECT status FROM orders WHERE id = ?").bind(orderId).first();
    if (!order) return new Response(JSON.stringify({ error: '订单不存在' }), { status: 404 });

    return new Response(JSON.stringify({ status: order.status }));
});

// 获取文章列表 (公开)
router.get('/api/shop/articles', async (request, env) => {
    try {
        const { results } = await env.DB.prepare(
            `SELECT a.id, a.title, a.summary, a.created_at, c.name as category_name 
             FROM articles a
             LEFT JOIN article_categories c ON a.category_id = c.id
             WHERE a.status = 1
             ORDER BY a.created_at DESC`
        ).all();
        return new Response(JSON.stringify(results));
    } catch (e) {
        return new Response(JSON.stringify({ error: e.message }), { status: 500 });
    }
});

// 获取文章详情 (公开)
router.get('/api/shop/article/detail', async (request, env) => {
    const { query } = request;
    const id = query.id;
    if (!id) return new Response(JSON.stringify({ error: '缺少 id' }), { status: 400 });

    try {
        const article = await env.DB.prepare(
            `SELECT a.*, c.name as category_name
             FROM articles a
             LEFT JOIN article_categories c ON a.category_id = c.id
             WHERE a.id = ? AND a.status = 1`
        ).bind(id).first();
        
        if (!article) return new Response(JSON.stringify({ error: '文章不存在或未发布' }), { status: 404 });
        
        return new Response(JSON.stringify(article));
    } catch (e) {
        return new Response(JSON.stringify({ error: e.message }), { status: 500 });
    }
});

// 获取文章分类 (公开)
router.get('/api/shop/article/categories', async (request, env) => {
    try {
        const { results } = await env.DB.prepare("SELECT * FROM article_categories ORDER BY sort_order ASC").all();
        return new Response(JSON.stringify(results));
    } catch (e) {
        return new Response(JSON.stringify({ error: e.message }), { status: 500 });
    }
});


// --- 管理员路由 (需要鉴权) ---

// 登录 (已修正为使用环境变量)
router.post('/api/admin/login', async (request, env) => {
    const { password } = await request.json();
    
    // 1. 从环境变量读取密码 (您在机密中设置的)
    const adminPass = env.ADMIN_PASS; 
    // 2. 从环境变量读取 Token (您在机密中设置的)
    const adminToken = env.ADMIN_TOKEN;

    if (!adminPass || !adminToken) {
         return new Response(JSON.stringify({ error: '服务器未配置 ADMIN_PASS 或 ADMIN_TOKEN' }), { status: 500 });
    }

    // 3. 检查密码是否匹配
    if (password === adminPass) {
        // 4. 如果匹配，返回您预设的 ADMIN_TOKEN
        return new Response(JSON.stringify({ token: adminToken }));
    } else {
        return new Response(JSON.stringify({ error: '密码错误' }), { status: 401 });
    }
});

// 仪表盘统计
router.get('/api/admin/dashboard/stats', authMiddleware, async (request, env) => {
    try {
        const today = new Date().toISOString().split('T')[0];
        
        const { result: todaySales } = await env.DB.prepare(
            "SELECT SUM(total_amount) as total FROM orders WHERE status >= 1 AND date(paid_at) = ?"
        ).bind(today).first();

        const { result: todayOrders } = await env.DB.prepare(
            "SELECT COUNT(id) as count FROM orders WHERE date(created_at) = ?"
        ).bind(today).first();
        
        const { result: totalSales } = await env.DB.prepare(
            "SELECT SUM(total_amount) as total FROM orders WHERE status >= 1"
        ).first();

        const { result: totalOrders } = await env.DB.prepare(
            "SELECT COUNT(id) as count FROM orders"
        ).first();

        const { result: totalProducts } = await env.DB.prepare(
            "SELECT COUNT(id) as count FROM products"
        ).first();

        const { result: totalCards } = await env.DB.prepare(
            "SELECT COUNT(id) as count FROM cards"
        ).first();
        
        const { result: pendingOrders } = await env.DB.prepare(
            "SELECT COUNT(id) as count FROM orders WHERE status = 1"
        ).first();

        const { results: lowStock } = await env.DB.prepare(
            `SELECT v.name, COUNT(c.id) as stock
             FROM variants v
             LEFT JOIN cards c ON v.id = c.variant_id AND c.status = 0
             GROUP BY v.id
             HAVING stock < 10
             ORDER BY stock ASC`
        ).all();

        return new Response(JSON.stringify({
            todaySales: todaySales?.total || 0,
            todayOrders: todayOrders?.count || 0,
            totalSales: totalSales?.total || 0,
            totalOrders: totalOrders?.count || 0,
            totalProducts: totalProducts?.count || 0,
            totalCards: totalCards?.count || 0,
            pendingOrders: pendingOrders?.count || 0,
            lowStockCount: lowStock.length,
        }));

    } catch (e) {
        return new Response(JSON.stringify({ error: e.message }), { status: 500 });
    }
});

// --- 商品管理 ---
router.get('/api/admin/products', authMiddleware, async (request, env) => {
    try {
        const { results } = await env.DB.prepare(
            `SELECT p.*, c.name as category_name 
             FROM products p
             LEFT JOIN categories c ON p.category_id = c.id
             ORDER BY p.sort_order ASC`
        ).all();
        return new Response(JSON.stringify(results));
    } catch (e) {
        return new Response(JSON.stringify({ error: e.message }), { status: 500 });
    }
});

router.post('/api/admin/products', authMiddleware, async (request, env) => {
    try {
        const { name, description, category_id, status, sort_order, image_url } = await request.json();
        const id = uuidv4();
        await env.DB.prepare(
            "INSERT INTO products (id, name, description, category_id, status, sort_order, image_url) VALUES (?, ?, ?, ?, ?, ?, ?)"
        ).bind(id, name, description, category_id, status, sort_order || 0, image_url).run();
        return new Response(JSON.stringify({ id }), { status: 201 });
    } catch (e) {
        return new Response(JSON.stringify({ error: e.message }), { status: 500 });
    }
});

router.put('/api/admin/products/:id', authMiddleware, async (request, env) => {
    try {
        const { id } = request.params;
        const { name, description, category_id, status, sort_order, image_url } = await request.json();
        await env.DB.prepare(
            "UPDATE products SET name = ?, description = ?, category_id = ?, status = ?, sort_order = ?, image_url = ? WHERE id = ?"
        ).bind(name, description, category_id, status, sort_order, image_url, id).run();
        return new Response(JSON.stringify({ success: true }));
    } catch (e) {
        return new Response(JSON.stringify({ error: e.message }), { status: 500 });
    }
});

router.delete('/api/admin/products/:id', authMiddleware, async (request, env) => {
    try {
        const { id } = request.params;
        const variants = await env.DB.prepare("SELECT id FROM variants WHERE product_id = ?").bind(id).all();
        const variantIds = variants.results.map(v => v.id);
        
        const statements = [
            env.DB.prepare("DELETE FROM products WHERE id = ?").bind(id)
        ];
        if (variantIds.length > 0) {
            const placeholders = variantIds.map(() => '?').join(',');
            statements.push(env.DB.prepare(`DELETE FROM cards WHERE variant_id IN (${placeholders})`).bind(...variantIds));
            statements.push(env.DB.prepare(`DELETE FROM variants WHERE product_id = ?`).bind(id));
        }
        
        await env.DB.batch(statements);
        return new Response(JSON.stringify({ success: true }));
    } catch (e) {
        return new Response(JSON.stringify({ error: e.message }), { status: 500 });
    }
});

// --- 分类管理 ---
router.get('/api/admin/categories', authMiddleware, async (request, env) => {
    try {
        const { results } = await env.DB.prepare("SELECT * FROM categories ORDER BY sort_order ASC").all();
        return new Response(JSON.stringify(results));
    } catch (e) {
        return new Response(JSON.stringify({ error: e.message }), { status: 500 });
    }
});

router.post('/api/admin/categories', authMiddleware, async (request, env) => {
    try {
        const { name, status, sort_order } = await request.json();
        const id = uuidv4();
        await env.DB.prepare(
            "INSERT INTO categories (id, name, status, sort_order) VALUES (?, ?, ?, ?)"
        ).bind(id, name, status, sort_order || 0).run();
        return new Response(JSON.stringify({ id }), { status: 201 });
    } catch (e) {
        return new Response(JSON.stringify({ error: e.message }), { status: 500 });
    }
});

router.put('/api/admin/categories/:id', authMiddleware, async (request, env) => {
    try {
        const { id } = request.params;
        const { name, status, sort_order } = await request.json();
        await env.DB.prepare(
            "UPDATE categories SET name = ?, status = ?, sort_order = ? WHERE id = ?"
        ).bind(name, status, sort_order, id).run();
        return new Response(JSON.stringify({ success: true }));
    } catch (e) {
        return new Response(JSON.stringify({ error: e.message }), { status: 500 });
    }
});

router.delete('/api/admin/categories/:id', authMiddleware, async (request, env) => {
    try {
        const { id } = request.params;
        const product = await env.DB.prepare("SELECT id FROM products WHERE category_id = ? LIMIT 1").bind(id).first();
        if (product) {
            return new Response(JSON.stringify({ error: '分类下尚有商品，无法删除' }), { status: 400 });
        }
        await env.DB.prepare("DELETE FROM categories WHERE id = ?").bind(id).run();
        return new Response(JSON.stringify({ success: true }));
    } catch (e) {
        return new Response(JSON.stringify({ error: e.message }), { status: 500 });
    }
});

// --- 规格管理 ---
router.get('/api/admin/variants', authMiddleware, async (request, env) => {
    try {
        const { query } = request;
        const productId = query.product_id;
        if (!productId) return new Response(JSON.stringify({ error: '缺少 product_id' }), { status: 400 });
        
        const { results } = await env.DB.prepare("SELECT * FROM variants WHERE product_id = ? ORDER BY sort_order ASC").bind(productId).all();
        return new Response(JSON.stringify(results));
    } catch (e) {
        return new Response(JSON.stringify({ error: e.message }), { status: 500 });
    }
});

router.post('/api/admin/variants', authMiddleware, async (request, env) => {
    try {
        const { product_id, name, price, status, sort_order, custom_markup, wholesale_config, image_url, color, auto_delivery } = await request.json();
        const id = uuidv4();
        await env.DB.prepare(
            `INSERT INTO variants (id, product_id, name, price, status, sort_order, custom_markup, wholesale_config, image_url, color, auto_delivery) 
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).bind(id, product_id, name, price, status, sort_order || 0, custom_markup || 0, wholesale_config || null, image_url || null, color || null, auto_delivery || 0).run();
        return new Response(JSON.stringify({ id }), { status: 201 });
    } catch (e) {
        return new Response(JSON.stringify({ error: e.message }), { status: 500 });
    }
});

router.put('/api/admin/variants/:id', authMiddleware, async (request, env) => {
    try {
        const { id } = request.params;
        const { name, price, status, sort_order, custom_markup, wholesale_config, image_url, color, auto_delivery } = await request.json();
        await env.DB.prepare(
            `UPDATE variants 
             SET name = ?, price = ?, status = ?, sort_order = ?, custom_markup = ?, wholesale_config = ?, image_url = ?, color = ?, auto_delivery = ?
             WHERE id = ?`
        ).bind(name, price, status, sort_order, custom_markup, wholesale_config, image_url, color, auto_delivery, id).run();
        return new Response(JSON.stringify({ success: true }));
    } catch (e) {
        return new Response(JSON.stringify({ error: e.message }), { status: 500 });
    }
});

router.delete('/api/admin/variants/:id', authMiddleware, async (request, env) => {
    try {
        const { id } = request.params;
        await env.DB.batch([
            env.DB.prepare("DELETE FROM cards WHERE variant_id = ?").bind(id),
            env.DB.prepare("DELETE FROM variants WHERE id = ?").bind(id)
        ]);
        return new Response(JSON.stringify({ success: true }));
    } catch (e) {
        return new Response(JSON.stringify({ error: e.message }), { status: 500 });
    }
});

// --- 卡密管理 ---
router.post('/api/admin/cards', authMiddleware, async (request, env) => {
    try {
        const { variant_id, content, note } = await request.json();
        if (!variant_id || !content) {
            return new Response(JSON.stringify({ error: '缺少 variant_id 或 content' }), { status: 400 });
        }
        
        const cards = content.split(/[\n\r]+/).filter(line => line.trim() !== '');
        if (cards.length === 0) {
            return new Response(JSON.stringify({ error: '卡密内容不能为空' }), { status: 400 });
        }

        const statements = cards.map(cardContent => {
            const id = uuidv4();
            return env.DB.prepare(
                "INSERT INTO cards (id, variant_id, content, note, status, order_id) VALUES (?, ?, ?, ?, 0, NULL)"
            ).bind(id, variant_id, cardContent, note || null);
        });

        await env.DB.batch(statements);
        return new Response(JSON.stringify({ success: true, count: cards.length }), { status: 201 });
    } catch (e) {
        return new Response(JSON.stringify({ error: e.message }), { status: 500 });
    }
});

router.get('/api/admin/cards', authMiddleware, async (request, env) => {
    try {
        const { query } = request;
        const variantId = query.variant_id;
        if (!variantId) return new Response(JSON.stringify({ error: '缺少 variant_id' }), { status: 400 });

        const { results } = await env.DB.prepare(
            "SELECT * FROM cards WHERE variant_id = ? ORDER BY created_at DESC"
        ).bind(variantId).all();
        return new Response(JSON.stringify(results));
    } catch (e) {
        return new Response(JSON.stringify({ error: e.message }), { status: 500 });
    }
});

router.delete('/api/admin/cards', authMiddleware, async (request, env) => {
    try {
        const { ids } = await request.json();
        if (!ids || !Array.isArray(ids) || ids.length === 0) {
            return new Response(JSON.stringify({ error: '无效的卡密ID' }), { status: 400 });
        }
        
        const placeholders = ids.map(() => '?').join(',');
        await env.DB.prepare(
            `DELETE FROM cards WHERE id IN (${placeholders})`
        ).bind(...ids).run();
        
        return new Response(JSON.stringify({ success: true }));
    } catch (e) {
        return new Response(JSON.stringify({ error: e.message }), { status: 500 });
    }
});

// 卡密导入 (R2)
router.post('/api/admin/cards/import', authMiddleware, async (request, env) => {
    try {
        const { variant_id, file_key, note } = await request.json();
        if (!variant_id || !file_key) {
            return new Response(JSON.stringify({ error: '缺少 variant_id 或 file_key' }), { status: 400 });
        }

        const object = await env.R2.get(file_key);
        if (object === null) {
            return new Response(JSON.stringify({ error: '文件不存在' }), { status: 404 });
        }

        const content = await object.text();
        await env.R2.delete(file_key);

        const cards = content.split(/[\n\r]+/).filter(line => line.trim() !== '');
        if (cards.length === 0) {
            return new Response(JSON.stringify({ error: '文件内容为空' }), { status: 400 });
        }

        const statements = cards.map(cardContent => {
            const id = uuidv4();
            return env.DB.prepare(
                "INSERT INTO cards (id, variant_id, content, note, status, order_id) VALUES (?, ?, ?, ?, 0, NULL)"
            ).bind(id, variant_id, cardContent, note || null);
        });

        await env.DB.batch(statements);
        return new Response(JSON.stringify({ success: true, count: cards.length }), { status: 201 });
    } catch (e) {
        return new Response(JSON.stringify({ error: e.message }), { status: 500 });
    }
});

// 卡密导出 (R2)
router.get('/api/admin/cards/export', authMiddleware, async (request, env) => {
    try {
        const { query } = request;
        const variantId = query.variant_id;
        if (!variantId) return new Response(JSON.stringify({ error: '缺少 variant_id' }), { status: 400 });

        const { results } = await env.DB.prepare(
            "SELECT content FROM cards WHERE variant_id = ? AND status = 0"
        ).bind(variantId).all();

        if (results.length === 0) {
            return new Response(JSON.stringify({ error: '没有可导出的卡密' }), { status: 404 });
        }

        const content = results.map(r => r.content).join('\n');
        const fileKey = `export_${variantId}_${Date.now()}.txt`;
        
        await env.R2.put(fileKey, content, {
            httpMetadata: { contentType: 'text/plain' },
        });

        const supabase = createClient(env.R2_URL, env.R2_ANON_KEY);
        const { data, error } = await supabase
            .storage
            .from(env.R2_BUCKET_NAME)
            .createSignedUrl(fileKey, 60);

        if (error) throw error;

        return new Response(JSON.stringify({ download_url: data.signedUrl }));
    } catch (e) {
        return new Response(JSON.stringify({ error: e.message }), { status: 500 });
    }
});


// --- 订单管理 ---
router.get('/api/admin/orders', authMiddleware, async (request, env) => {
    try {
        const { results } = await env.DB.prepare(
            "SELECT * FROM orders ORDER BY created_at DESC"
        ).all();
        return new Response(JSON.stringify(results));
    } catch (e) {
        return new Response(JSON.stringify({ error: e.message }), { status: 500 });
    }
});

// *** 新增：修改单个订单状态 ***
router.put('/api/admin/orders/:id', authMiddleware, async (request, env) => {
    const { id } = request.params;
    const { status } = await request.json();
    
    if (status === undefined || status < 0 || status > 3) {
        return new Response(JSON.stringify({ error: '无效的状态' }), { status: 400 });
    }
    
    try {
        await env.DB.prepare("UPDATE orders SET status = ? WHERE id = ?")
            .bind(status, id)
            .run();
        return new Response(JSON.stringify({ success: true }));
    } catch (e) {
        return new Response(JSON.stringify({ error: e.message }), { status: 500 });
    }
});

// *** 新增：删除单个订单 ***
router.delete('/api/admin/orders/:id', authMiddleware, async (request, env) => {
    const { id } = request.params;
    try {
        const statements = [
            env.DB.prepare("DELETE FROM cards WHERE order_id = ?").bind(id),
            env.DB.prepare("DELETE FROM orders WHERE id = ?").bind(id)
        ];
        await env.DB.batch(statements);
        return new Response(JSON.stringify({ success: true }));
    } catch (e) {
        return new Response(JSON.stringify({ error: e.message }), { status: 500 });
    }
});

// *** 新增：批量修改订单状态 ***
router.put('/api/admin/orders', authMiddleware, async (request, env) => {
    const { ids, status } = await request.json();

    if (!ids || !Array.isArray(ids) || ids.length === 0 || status === undefined || status < 0 || status > 3) {
        return new Response(JSON.stringify({ error: '无效的参数' }), { status: 400 });
    }

    try {
        const placeholders = ids.map(() => '?').join(',');
        const query = `UPDATE orders SET status = ? WHERE id IN (${placeholders})`;
        
        await env.DB.prepare(query)
            .bind(status, ...ids)
            .run();
        
        return new Response(JSON.stringify({ success: true }));
    } catch (e) {
        return new Response(JSON.stringify({ error: e.message }), { status: 500 });
    }
});

// *** 新增：批量删除订单 ***
router.delete('/api/admin/orders', authMiddleware, async (request, env) => {
    const { ids } = await request.json();
    
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
        return new Response(JSON.stringify({ error: '无效的参数' }), { status: 400 });
    }

    try {
        const placeholders = ids.map(() => '?').join(',');
        
        const deleteCardsQuery = `DELETE FROM cards WHERE order_id IN (${placeholders})`;
        const deleteOrdersQuery = `DELETE FROM orders WHERE id IN (${placeholders})`;
        
        const statements = [
            env.DB.prepare(deleteCardsQuery).bind(...ids),
            env.DB.prepare(deleteOrdersQuery).bind(...ids)
        ];
        await env.DB.batch(statements);

        return new Response(JSON.stringify({ success: true }));
    } catch (e) {
        return new Response(JSON.stringify({ error: e.message }), { status: 500 });
    }
});


// --- 文章管理 ---
router.get('/api/admin/articles', authMiddleware, async (request, env) => {
    try {
        const { results } = await env.DB.prepare(
            `SELECT a.*, c.name as category_name
             FROM articles a
             LEFT JOIN article_categories c ON a.category_id = c.id
             ORDER BY a.created_at DESC`
        ).all();
        return new Response(JSON.stringify(results));
    } catch (e) {
        return new Response(JSON.stringify({ error: e.message }), { status: 500 });
    }
});

router.post('/api/admin/articles', authMiddleware, async (request, env) => {
    try {
        const { title, content, summary, category_id, status } = await request.json();
        const id = uuidv4();
        await env.DB.prepare(
            "INSERT INTO articles (id, title, content, summary, category_id, status) VALUES (?, ?, ?, ?, ?, ?)"
        ).bind(id, title, content, summary, category_id, status).run();
        return new Response(JSON.stringify({ id }), { status: 201 });
    } catch (e) {
        return new Response(JSON.stringify({ error: e.message }), { status: 500 });
    }
});

router.put('/api/admin/articles/:id', authMiddleware, async (request, env) => {
    try {
        const { id } = request.params;
        const { title, content, summary, category_id, status } = await request.json();
        await env.DB.prepare(
            "UPDATE articles SET title = ?, content = ?, summary = ?, category_id = ?, status = ? WHERE id = ?"
        ).bind(title, content, summary, category_id, status, id).run();
        return new Response(JSON.stringify({ success: true }));
    } catch (e) {
        return new Response(JSON.stringify({ error: e.message }), { status: 500 });
    }
});

router.delete('/api/admin/articles/:id', authMiddleware, async (request, env) => {
    try {
        const { id } = request.params;
        await env.DB.prepare("DELETE FROM articles WHERE id = ?").bind(id).run();
        return new Response(JSON.stringify({ success: true }));
    } catch (e) {
        return new Response(JSON.stringify({ error: e.message }), { status: 500 });
    }
});

// --- 文章分类管理 ---
router.get('/api/admin/article_categories', authMiddleware, async (request, env) => {
    try {
        const { results } = await env.DB.prepare("SELECT * FROM article_categories ORDER BY sort_order ASC").all();
        return new Response(JSON.stringify(results));
    } catch (e) {
        return new Response(JSON.stringify({ error: e.message }), { status: 500 });
    }
});

router.post('/api/admin/article_categories', authMiddleware, async (request, env) => {
    try {
        const { name, sort_order } = await request.json();
        const id = uuidv4();
        await env.DB.prepare(
            "INSERT INTO article_categories (id, name, sort_order) VALUES (?, ?, ?)"
        ).bind(id, name, sort_order || 0).run();
        return new Response(JSON.stringify({ id }), { status: 201 });
    } catch (e) {
        return new Response(JSON.stringify({ error: e.message }), { status: 500 });
    }
});

router.put('/api/admin/article_categories/:id', authMiddleware, async (request, env) => {
    try {
        const { id } = request.params;
        const { name, sort_order } = await request.json();
        await env.DB.prepare(
            "UPDATE article_categories SET name = ?, sort_order = ? WHERE id = ?"
        ).bind(name, sort_order, id).run();
        return new Response(JSON.stringify({ success: true }));
    } catch (e) {
        return new Response(JSON.stringify({ error: e.message }), { status: 500 });
    }
});

router.delete('/api/admin/article_categories/:id', authMiddleware, async (request, env) => {
    try {
        const { id } = request.params;
        const article = await env.DB.prepare("SELECT id FROM articles WHERE category_id = ? LIMIT 1").bind(id).first();
        if (article) {
            return new Response(JSON.stringify({ error: '分类下尚有文章，无法删除' }), { status: 400 });
        }
        await env.DB.prepare("DELETE FROM article_categories WHERE id = ?").bind(id).run();
        return new Response(JSON.stringify({ success: true }));
    } catch (e) {
        return new Response(JSON.stringify({ error: e.message }), { status: 500 });
    }
});


// --- 支付设置 ---
router.get('/api/admin/payments', authMiddleware, async (request, env) => {
    try {
        const keys = ['payment_alipay_f2f_enabled', 'payment_alipay_f2f_appid', 'payment_alipay_f2f_private_key', 'payment_alipay_f2f_public_key'];
        const placeholders = keys.map(() => '?').join(',');
        const { data } = await env.DB.prepare(
            `SELECT key, value FROM settings WHERE key IN (${placeholders})`
        ).bind(...keys).all();
        
        const settings = data.reduce((acc, item) => {
            acc[item.key] = item.value;
            return acc;
        }, {});

        return new Response(JSON.stringify(settings));
    } catch (e) {
        return new Response(JSON.stringify({ error: e.message }), { status: 500 });
    }
});

router.post('/api/admin/payments', authMiddleware, async (request, env) => {
    try {
        const settings = await request.json();
        const statements = Object.entries(settings).map(([key, value]) => {
            return env.DB.prepare(
                "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value"
            ).bind(key, value);
        });
        await env.DB.batch(statements);
        return new Response(JSON.stringify({ success: true }));
    } catch (e) {
        return new Response(JSON.stringify({ error: e.message }), { status: 500 });
    }
});

// --- 系统设置 ---
router.get('/api/admin/settings', authMiddleware, async (request, env) => {
    try {
        const keys = ['site_title', 'site_description', 'site_keywords', 'site_logo_url', 'site_footer_text', 'site_announcement', 'theme'];
        const placeholders = keys.map(() => '?').join(',');
        const { data } = await env.DB.prepare(
            `SELECT key, value FROM settings WHERE key IN (${placeholders})`
        ).bind(...keys).all();
        
        const settings = data.reduce((acc, item) => {
            acc[item.key] = item.value;
            return acc;
        }, {});

        return new Response(JSON.stringify(settings));
    } catch (e) {
        return new Response(JSON.stringify({ error: e.message }), { status: 500 });
    }
});

router.post('/api/admin/settings', authMiddleware, async (request, env) => {
    try {
        const settings = await request.json();
        
        // 分离密码和 D1 设置
        let adminPassword = null;
        const dbSettings = {};
        for (const [key, value] of Object.entries(settings)) {
            if (key === 'admin_password') {
                if (value && value.trim() !== '') {
                    adminPassword = value.trim();
                }
            } else {
                dbSettings[key] = value;
            }
        }

        // 1. 更新 D1 中的设置
        const statements = Object.entries(dbSettings).map(([key, value]) => {
            return env.DB.prepare(
                "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value"
            ).bind(key, value);
        });
        
        if (statements.length > 0) {
            await env.DB.batch(statements);
        }

        // 2. 更新环境变量中的密码 (注意：Worker 无法修改环境变量，这里是警告)
        if (adminPassword) {
            // 在 worker 中无法直接修改 env.ADMIN_PASS。
            // 真正安全的做法是让用户去 Cloudflare Dashboard 手动修改 ADMIN_PASS 环境变量。
            // 这里的逻辑是一个“陷阱”，它无法按预期工作。
            // 我们将跳过修改密码的逻辑，因为 worker 无法修改自己的环境变量。
            // adminPass = adminPassword; // 这只是一个局部变量，不会生效
        }

        return new Response(JSON.stringify({ success: true, message: "设置已保存。注意：管理员密码请在 Cloudflare 仪表盘 的“环境变量”中修改。" }));
    } catch (e) {
        return new Response(JSON.stringify({ error: e.message }), { status: 500 });
    }
});

// --- 文件上传 (R2) ---
router.post('/api/admin/upload', authMiddleware, async (request, env) => {
    try {
        const formData = await request.formData();
        const file = formData.get('file');
        
        if (!file) {
            return new Response(JSON.stringify({ error: '没有文件' }), { status: 400 });
        }

        const fileKey = `uploads/${uuidv4()}-${file.name}`;
        await env.R2.put(fileKey, file.stream(), {
            httpMetadata: { contentType: file.type },
        });

        const publicUrl = `${env.R2_PUBLIC_URL}/${fileKey}`;

        return new Response(JSON.stringify({ url: publicUrl, key: fileKey }));
    } catch (e) {
        return new Response(JSON.stringify({ error: e.message }), { status: 500 });
    }
});

// --- (已删除 “主题管理 (KV)” 路由) ---

// 404
router.all('*', () => new Response('Not Found.', { status: 404 }));

export default {
    async fetch(request, env, ctx) {
        // 存储 CTX 用于 waitUntil (模拟支付回调)
        env.CTX = ctx;
        return router.handle(request, env);
    },
};
