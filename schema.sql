DROP TABLE IF EXISTS site_config;
CREATE TABLE site_config (
    key TEXT PRIMARY KEY,
    value TEXT
);
INSERT OR IGNORE INTO site_config (key, value) 
VALUES 
('site_name', 'CF Faka Demo'), 
('announce', '<p>欢迎光临</p>'), 
('theme', 'default');

DROP TABLE IF EXISTS pay_gateways;
CREATE TABLE pay_gateways (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    type TEXT NOT NULL,
    config TEXT NOT NULL,
    active INTEGER DEFAULT 1
);

DROP TABLE IF EXISTS categories;
CREATE TABLE categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    sort INTEGER DEFAULT 0,
    image_url TEXT
);
INSERT INTO categories (name, sort) VALUES ('默认分类', 0);

DROP TABLE IF EXISTS products;
CREATE TABLE products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    category_id INTEGER DEFAULT 1,
    name TEXT NOT NULL,
    description TEXT,
    sort INTEGER DEFAULT 0,
    active INTEGER DEFAULT 1,
    created_at INTEGER,
    image_url TEXT,
    tags TEXT
);

DROP TABLE IF EXISTS variants;
CREATE TABLE variants (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    price REAL NOT NULL,
    stock INTEGER DEFAULT 0,
    color TEXT,
    image_url TEXT,
    wholesale_config TEXT,
    custom_markup REAL DEFAULT 0,
    sales_count INTEGER DEFAULT 0,
    auto_delivery INTEGER DEFAULT 1,
    created_at INTEGER,
    selection_label TEXT,
    sort INTEGER DEFAULT 0,
    active INTEGER DEFAULT 1,
    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
);

DROP TABLE IF EXISTS cards;
CREATE TABLE cards (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    variant_id INTEGER NOT NULL,
    content TEXT NOT NULL,
    status INTEGER DEFAULT 0,
    order_id TEXT,
    created_at INTEGER,
    FOREIGN KEY (variant_id) REFERENCES variants(id) ON DELETE CASCADE
);

DROP TABLE IF EXISTS orders;
CREATE TABLE orders (
    id TEXT PRIMARY KEY,
    trade_no TEXT,
    variant_id INTEGER NOT NULL,
    product_name TEXT,
    variant_name TEXT,
    price REAL,
    quantity INTEGER DEFAULT 1,
    total_amount REAL,
    contact TEXT,
    payment_method TEXT,
    status INTEGER DEFAULT 0,
    cards_sent TEXT,
    created_at INTEGER,
    paid_at INTEGER,
    query_password TEXT
);

DROP TABLE IF EXISTS article_categories;
CREATE TABLE article_categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    sort INTEGER DEFAULT 0
);
INSERT INTO article_categories (name, sort) VALUES ('默认分类', 0);

DROP TABLE IF EXISTS articles;
CREATE TABLE articles (
    id INTEGER PRIMARY KEY AUTOINCREMENT, 
    category_id INTEGER DEFAULT 1, 
    title TEXT NOT NULL, 
    content TEXT, 
    is_notice INTEGER DEFAULT 0, 
    view_count INTEGER DEFAULT 0, 
    created_at INTEGER, 
    updated_at INTEGER, 
    cover_image TEXT, 
    active INTEGER DEFAULT 1, 
    FOREIGN KEY (category_id) REFERENCES article_categories(id) ON DELETE SET DEFAULT
);


