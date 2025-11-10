DROP TABLE IF EXISTS products;
CREATE TABLE products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT,
    category TEXT DEFAULT 'default',
    sort INTEGER DEFAULT 0,
    active INTEGER DEFAULT 1,
    created_at INTEGER
);

DROP TABLE IF EXISTS variants;
CREATE TABLE variants (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    price REAL NOT NULL,
    stock INTEGER DEFAULT 0,
    auto_delivery INTEGER DEFAULT 1, -- 1为自动发卡
    created_at INTEGER,
    FOREIGN KEY(product_id) REFERENCES products(id) ON DELETE CASCADE
);

DROP TABLE IF EXISTS cards;
CREATE TABLE cards (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    variant_id INTEGER NOT NULL,
    content TEXT NOT NULL,
    status INTEGER DEFAULT 0, -- 0: 未售, 1: 已售, 2: 锁定
    order_id TEXT,
    created_at INTEGER,
    FOREIGN KEY(variant_id) REFERENCES variants(id) ON DELETE CASCADE
);

DROP TABLE IF EXISTS orders;
CREATE TABLE orders (
    id TEXT PRIMARY KEY, -- 商户订单号
    trade_no TEXT, -- 支付平台订单号
    variant_id INTEGER NOT NULL,
    product_name TEXT,
    variant_name TEXT,
    price REAL,
    quantity INTEGER DEFAULT 1,
    total_amount REAL,
    contact TEXT,
    payment_method TEXT,
    status INTEGER DEFAULT 0, -- 0: 待支付, 1: 已支付, 2: 已发货/完成, -1: 过期/关闭
    cards_sent TEXT, -- 已发送的卡密(JSON array)
    created_at INTEGER,
    paid_at INTEGER
);

DROP TABLE IF EXISTS pay_gateways;
CREATE TABLE pay_gateways (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    type TEXT NOT NULL, -- e.g., 'alipay_f2f'
    config TEXT NOT NULL, -- JSON 格式的配置 (appid, private_key 等)
    active INTEGER DEFAULT 1
);

DROP TABLE IF EXISTS site_config;
CREATE TABLE site_config (
    key TEXT PRIMARY KEY,
    value TEXT
);

INSERT OR IGNORE INTO site_config (key, value) VALUES ('site_name', 'Cloudflare Faka Demo');
INSERT OR IGNORE INTO site_config (key, value) VALUES ('announce', '<p>欢迎光临本小店</p>');
