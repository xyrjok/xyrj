import { Router } from 'itty-router';
import { v4 as uuidv4 } from 'uuid';
import { createClient } from '@supabase/supabase-js';

const router = Router();

// --- 中间件：管理员身份验证 ---
const authMiddleware = async (request, env) => {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return new Response(JSON.stringify({ error: '未授权' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
    }
    const token = authHeader.split(' ')[1];
    
    // 从KV获取存储的Token
    const storedToken = await env.KV.get('adminToken');
    
    if (token !== storedToken) {
        return new Response(JSON.stringify({ error: '无效的Token' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
    }
    
    // 验证通过，继续请求
    // 可以在 request 对象上附加用户信息（如果需要）
    // request.user = { id: 'admin' }; 
};

// --- API 路由 (公开) ---

// 获取公共配置 (站点标题、描述、主题等)
router.get('/api/shop/config', async (request, env) => {
    try {
        const keys = [
            'site_title', 'site_description', 'site_keywords', 
            'site_logo_url', 'site_footer_text', 'theme',
            'site_announcement', 'payment_alipay_f2f_enabled' // 示例：添加更多可能需要的配置
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
        // 1. 获取所有可见分类
        const { results: categories } = await env.DB.prepare("SELECT * FROM categories WHERE status = 1 ORDER BY sort_order ASC").all();
        
        // 2. 获取所有可见商品
        const { results: products } = await env.DB.prepare("SELECT * FROM products WHERE status = 1 ORDER BY sort_order ASC").all();

        // 3. 获取所有可见规格
        const { results: variants } = await env.DB.prepare("SELECT * FROM variants WHERE status = 1 ORDER BY sort_order ASC").all();
        
        // 4. 获取所有规格的库存 (未售出卡密) 和总销量 (已售出卡密)
        // 注意: COUNT(CASE...) 是一种高效的方式，一次查询获取多个状态
        const { results: variantMeta } = await env.DB.prepare(
            `SELECT 
                variant_id, 
                COUNT(CASE WHEN status = 0 THEN 1 END) as stock, 
                COUNT(CASE WHEN status = 1 THEN 1 END) as sales_count
             FROM cards 
             GROUP BY variant_id`
        ).all();
        
        // 5. 将库存和销量数据转换为 Map 方便快速查找
        const variantMetaMap = variantMeta.reduce((acc, item) => {
            acc[item.variant_id] = { stock: item.stock || 0, sales_count: item.sales_count || 0 };
            return acc;
        }, {});

        // 6. 组合数据：将规格附加到商品
        products.forEach(p => {
            p.variants = variants
                .filter(v => v.product_id === p.id)
                .map(v => ({
                    ...v,
                    stock: variantMetaMap[v.id]?.stock || 0,
                    sales_count: variantMetaMap[v.id]?.sales_count || 0
                }));
        });

        // 7. 组合数据：将商品附加到分类
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
        // 限制最多 50 条
        const { results } = await env.DB.prepare(
            "SELECT id, note FROM cards WHERE variant_id = ? AND status = 0 AND note IS NOT NULL LIMIT 50"
        ).bind(variantId).all();
        return new Response(JSON.stringify(results), { headers: { 'Content-Type': 'application/json' } });
    } catch (e) {
        return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    }
});

// *** 1. 修改点：创建订单 (公开) - 增加 query_password ***
router.post('/api/shop/order/create', async (request, env) => {
    try {
        // 1.1 读取 query_password
        const { variant_id, quantity, contact, payment_method, card_id, query_password } = await request.json();

        if (!variant_id || !quantity || !contact || !payment_method) {
            return new Response(JSON.stringify({ error: '缺少必要参数' }), { status: 400 });
        }
        
        // 1. 获取规格信息
        const variant = await env.DB.prepare("SELECT * FROM variants WHERE id = ?").bind(variant_id).first();
        if (!variant) return new Response(JSON.stringify({ error: '规格不存在' }), { status: 404 });

        const product = await env.DB.prepare("SELECT name FROM products WHERE id = ?").bind(variant.product_id).first();

        let price = variant.price;
        let cardToLock = null;

        // 2. 处理价格和库存
        if (card_id) { // 自选
            if (quantity > 1) return new Response(JSON.stringify({ error: '自选商品一次只能购买一个' }), { status: 400 });
            price += variant.custom_markup;
            cardToLock = await env.DB.prepare("SELECT * FROM cards WHERE id = ? AND variant_id = ? AND status = 0").bind(card_id, variant_id).first();
            if (!cardToLock) return new Response(JSON.stringify({ error: '选择的号码不存在或已被购买' }), { status: 400 });
        } else { // 随机或批发
            const stockCheck = await env.DB.prepare("SELECT COUNT(id) as stock FROM cards WHERE variant_id = ? AND status = 0").bind(variant_id).first();
            if (stockCheck.stock < quantity) return new Response(JSON.stringify({ error: '库存不足' }), { status: 400 });
            
            // 计算批发价
            if (variant.wholesale_config) {
                try {
                    let ws = JSON.parse(variant.wholesale_config);
                    ws.sort((a,b) => b.qty - a.qty); // 从高到低排序
                    for(let rule of ws) { if(quantity >= rule.qty) { price = rule.price; break; } }
                } catch(e) { /* 解析失败, 使用原价 */ }
            }
        }

        const totalAmount = (price * quantity).toFixed(2);
        const orderId = uuidv4();
        
        // 3. 创建订单
        // *** 1.2 修改 INSERT 语句 ***
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
            query_password || null // *** 1.3 绑定新字段 ***
        );

        if (cardToLock) {
            // 事务：创建订单 + 锁定(status=2)自选卡密
            const cardUpdate = env.DB.prepare("UPDATE cards SET status = 2, order_id = ? WHERE id = ?").bind(orderId, cardToLock.id);
            await env.DB.batch([orderInsert, cardUpdate]);
        } else {
            // 仅创建订单
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
    // ... (此部分代码保持不变)
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
    
    // 模拟支付回调 (在实际场景中, 这是由支付网关异步调用的)
    // 为了演示, 我们在一段时间后自动更新订单状态
    const waitUntil = new Date(Date.now() + 10 * 1000); // 10秒后
    env.CTX.waitUntil(
        (async () => {
            await new Promise(resolve => setTimeout(resolve, 10000)); // 等待10秒
            
            // 1. 检查订单是否还是待支付
            const currentOrder = await env.DB.prepare("SELECT * FROM orders WHERE id = ?").bind(order_id).first();
            if (currentOrder && currentOrder.status === 0) {
                
                // 2. 检查是自选还是随机
                let cardsToUpdate;
                const lockedCard = await env.DB.prepare("SELECT * FROM cards WHERE order_id = ? AND status = 2").bind(order_id).first();
                
                if (lockedCard) {
                    // 自选
                    cardsToUpdate = [lockedCard];
                } else {
                    // 随机
                    const { results } = await env.DB.prepare(
                        "SELECT * FROM cards WHERE variant_id = ? AND status = 0 LIMIT ?"
                    ).bind(currentOrder.variant_id, currentOrder.quantity).all();
                    cardsToUpdate = results;
                }

                // 3. 检查卡密是否足够
                if (cardsToUpdate.length < currentOrder.quantity) {
                    // 库存不足，支付失败 (实际应退款)
                    await env.DB.prepare("UPDATE orders SET status = 3 WHERE id = ?").bind(order_id).run(); // 3 = 已退款
                } else {
                    // 4. 事务：更新订单状态 + 绑定卡密
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
    // ... (此部分代码保持不变)
    const { query } = request;
    const orderId = query.order_id;
    if (!orderId) return new Response(JSON.stringify({ error: '缺少 order_id' }), { status: 400 });

    const order = await env.DB.prepare("SELECT status FROM orders WHERE id = ?").bind(orderId).first();
    if (!order) return new Response(JSON.stringify({ error: '订单不存在' }), { status: 404 });

    return new Response(JSON.stringify({ status: order.status }));
});

// 获取文章列表 (公开)
router.get('/api/shop/articles', async (request, env) => {
    // ... (此部分代码保持不变)
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
    // ... (此部分代码保持不变)
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
    // ... (此部分代码保持不变)
    try {
        const { results } = await env.DB.prepare("SELECT * FROM article_categories ORDER BY sort_order ASC").all();
        return new Response(JSON.stringify(results));
    } catch (e) {
        return new Response(JSON.stringify({ error: e.message }), { status: 500 });
    }
});


// --- 管理员路由 (需要鉴权) ---

// 登录
router.post('/api/admin/login', async (request, env) => {
    // ... (此部分代码保持不变)
    const { password } = await request.json();
    const adminPass = await env.KV.get('adminPassword');
    
    if (adminPass && password === adminPass) {
        const token = uuidv4();
        await env.KV.put('adminToken', token, { expirationTtl: 3600 * 24 }); // 24小时过期
        return new Response(JSON.stringify({ token }));
    } else if (!adminPass && password === '123456') {
        // 初始密码
        const token = uuidv4();
        await env.KV.put('adminToken', token, { expirationTtl: 3600 * 24 });
        await env.KV.put('adminPassword', '123456'); // 保存初始密码
        return new Response(JSON.stringify({ token }));
    } else {
        return new Response(JSON.stringify({ error: '密码错误' }), { status: 401 });
    }
});

// 仪表盘统计
router.get('/api/admin/dashboard/stats', authMiddleware, async (request, env) => {
    // ... (此部分代码保持不变)
    try {
        const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
        
        // 1. 今日销售额
        const { result: todaySales } = await env.DB.prepare(
            "SELECT SUM(total_amount) as total FROM orders WHERE status >= 1 AND date(paid_at) = ?"
        ).bind(today).first();

        // 2. 今日订单
        const { result: todayOrders } = await env.DB.prepare(
            "SELECT COUNT(id) as count FROM orders WHERE date(created_at) = ?"
        ).bind(today).first();
        
        // 3. 总销售额
        const { result: totalSales } = await env.DB.prepare(
            "SELECT SUM(total_amount) as total FROM orders WHERE status >= 1"
        ).first();

        // 4. 总订单数
        const { result: totalOrders } = await env.DB.prepare(
            "SELECT COUNT(id) as count FROM orders"
        ).first();

        // 5. 总商品数
        const { result: totalProducts } = await env.DB.prepare(
            "SELECT COUNT(id) as count FROM products"
        ).first();

        // 6. 总卡密数
        const { result: totalCards } = await env.DB.prepare(
            "SELECT COUNT(id) as count FROM cards"
        ).first();
        
        // 7. 待发货 (已支付但未完成) - 假设自动发货失败
        const { result: pendingOrders } = await env.DB.prepare(
            "SELECT COUNT(id) as count FROM orders WHERE status = 1"
        ).first();

        // 8. 库存预警 (库存 < 10)
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
    // ... (此部分代码保持不变)
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
    // ... (此部分代码保持不变)
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
    // ... (此部分代码保持不变)
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
    // ... (此部分代码保持不变)
    try {
        const { id } = request.params;
        // 事务：删除商品、规格、卡密
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
    // ... (此部分代码保持不变)
    try {
        const { results } = await env.DB.prepare("SELECT * FROM categories ORDER BY sort_order ASC").all();
        return new Response(JSON.stringify(results));
    } catch (e) {
        return new Response(JSON.stringify({ error: e.message }), { status: 500 });
    }
});

router.post('/api/admin/categories', authMiddleware, async (request, env) => {
    // ... (此部分代码保持不变)
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
    // ... (此部分代码保持不变)
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
    // ... (此部分代码保持不变)
    try {
        const { id } = request.params;
        // 检查是否有商品关联
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
    // ... (此部分代码保持不变)
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
    // ... (此部分代码保持不变)
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
    // ... (此部分代码保持不变)
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
    // ... (此部分代码保持不变)
    try {
        const { id } = request.params;
        // 事务：删除规格和关联卡密
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
    // ... (此部分代码保持不变)
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
    // ... (此部分代码保持不变)
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
    // ... (此部分代码保持不变)
    try {
        const { ids } = await request.json(); // 接收 ID 数组
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
    // ... (此部分代码保持不变)
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
        await env.R2.delete(file_key); // 用后即焚

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
    // ... (此部分代码保持不变)
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

        // 生成一个临时的预签名下载链接 (有效期 60 秒)
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
    // ... (此部分代码保持不变)
    try {
        const { results } = await env.DB.prepare(
            "SELECT * FROM orders ORDER BY created_at DESC"
        ).all();
        return new Response(JSON.stringify(results));
    } catch (e) {
        return new Response(JSON.stringify({ error: e.message }), { status: 500 });
    }
});

// *** 2. 新增：修改单个订单状态 (受保护) ***
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

// *** 2. 新增：删除单个订单 (受保护) ***
router.delete('/api/admin/orders/:id', authMiddleware, async (request, env) => {
    const { id } = request.params;
    try {
        // 使用事务删除订单和关联的卡密 (如果卡密已售出或锁定)
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

// *** 3. 新增：批量修改订单状态 (受保护) ***
router.put('/api/admin/orders', authMiddleware, async (request, env) => {
    const { ids, status } = await request.json();

    if (!ids || !Array.isArray(ids) || ids.length === 0 || status === undefined || status < 0 || status > 3) {
        return new Response(JSON.stringify({ error: '无效的参数' }), { status: 400 });
    }

    try {
        // 构建 IN 查询
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

// *** 3. 新增：批量删除订单 (受保护) ***
router.delete('/api/admin/orders', authMiddleware, async (request, env) => {
    const { ids } = await request.json();
    
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
        return new Response(JSON.stringify({ error: '无效的参数' }), { status: 400 });
    }

    try {
        // 构建 IN 查询
        const placeholders = ids.map(() => '?').join(',');
        
        const deleteCardsQuery = `DELETE FROM cards WHERE order_id IN (${placeholders})`;
        const deleteOrdersQuery = `DELETE FROM orders WHERE id IN (${placeholders})`;
        
        // 使用事务删除
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
    // ... (此部分代码保持不变)
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
    // ... (此部分代码保持不变)
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
    // ... (此部分代码保持不变)
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
    // ... (此部分代码保持不变)
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
    // ... (此部分代码保持不变)
    try {
        const { results } = await env.DB.prepare("SELECT * FROM article_categories ORDER BY sort_order ASC").all();
        return new Response(JSON.stringify(results));
    } catch (e) {
        return new Response(JSON.stringify({ error: e.message }), { status: 500 });
    }
});

router.post('/api/admin/article_categories', authMiddleware, async (request, env) => {
    // ... (此部分代码保持不变)
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
    // ... (此部分代码保持不变)
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
    // ... (此部分代码保持不变)
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
    // ... (此部分代码保持不变)
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
    // ... (此部分代码保持不变)
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
    // ... (此部分代码保持不变)
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
    // ... (此部分代码保持不变)
    try {
        const settings = await request.json();
        const statements = Object.entries(settings).map(([key, value]) => {
            return env.DB.prepare(
                "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value"
            ).bind(key, value);
        });
        
        // 单独处理管理员密码
        if (settings.admin_password && settings.admin_password.trim() !== '') {
            await env.KV.put('adminPassword', settings.admin_password.trim());
        }

        await env.DB.batch(statements);
        return new Response(JSON.stringify({ success: true }));
    } catch (e) {
        return new Response(JSON.stringify({ error: e.message }), { status: 500 });
    }
});

// --- 文件上传 (R2) ---
router.post('/api/admin/upload', authMiddleware, async (request, env) => {
    // ... (此部分代码保持不变)
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

        // 假设 R2 绑定了公开访问域名
        const publicUrl = `${env.R2_PUBLIC_URL}/${fileKey}`;

        return new Response(JSON.stringify({ url: publicUrl, key: fileKey }));
    } catch (e) {
        return new Response(JSON.stringify({ error: e.message }), { status: 500 });
    }
});

// --- 主题管理 (KV) ---
router.get('/api/admin/themes', authMiddleware, async (request, env) => {
    // ... (此部分代码保持不变)
    try {
        // 假设主题文件信息存储在 KV 中
        const themeList = await env.KV.get('theme_list', 'json');
        if (!themeList) {
            return new Response(JSON.stringify([])); // 返回空列表
        }
        return new Response(JSON.stringify(themeList));
    } catch (e) {
        return new Response(JSON.stringify({ error: e.message }), { status: 500 });
    }
});

// 404
router.all('*', () => new Response('Not Found.', { status: 404 }));

export default {
    async fetch(request, env, ctx) {
        // 存储 CTX 用于 waitUntil (模拟支付回调)
        env.CTX = ctx;
        return router.handle(request, env);
    },
};
