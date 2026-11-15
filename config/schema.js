// config/schema.js
// Creates the database and every table on first run, and upgrades older installs.
// It runs automatically when the server handles its first request.
// Safe to run any number of times: it only adds what is missing and never deletes data.

const mysql = require('mysql2');
const db = require('./db');
const { hashAdminPassword } = require('../utils/security');

const DEFAULT_ADMIN = { name: 'System Administrator', email: 'admin@campusstationery.com', password: 'Admin@123' };

// Category list. Products point to these by id (foreign key), so each category name is stored once.
const CATEGORIES = [
  ['Notebooks', 'notebooks', 'Hardcover, spiral and exercise books'],
  ['Writing Materials', 'writing', 'Pens, pencils, markers and highlighters'],
  ['Calculators', 'calculators', 'Scientific and graphing calculators'],
  ['Paper Products', 'paper', 'Printing paper, foolscaps and envelopes'],
  ['Accessories', 'accessories', 'Bags, rulers, files and desk items']
];

// Starting stock for a brand new install: [category slug, name, price, stock, image, description]
const STARTER_PRODUCTS = [
  ['notebooks', 'A5 Hardcover Notebook', 350, 25, 'https://images.unsplash.com/photo-1531346878377-a5be20888e57?w=600', 'A durable hardcover notebook suitable for everyday lectures and note-taking.'],
  ['writing', 'Premium Ballpoint Pens', 150, 40, 'https://images.unsplash.com/photo-1583485088034-697b5bc54ccd?w=600', 'A set of smooth-writing ballpoint pens for school and office use.'],
  ['calculators', 'Scientific Calculator', 1200, 12, 'https://images.unsplash.com/photo-1587145820266-a5951ee6f620?w=600', 'A scientific calculator for mathematical and scientific calculations.'],
  ['paper', 'A4 Printing Paper', 650, 30, 'https://images.unsplash.com/photo-1586075010923-2dd4570fb338?w=600', 'Quality A4 paper suitable for printing, assignments and photocopying.'],
  ['accessories', 'Student Backpack', 1800, 8, 'https://images.unsplash.com/photo-1553062407-98eeb64c6a62?w=600', 'A practical backpack for carrying books, stationery and other essentials.'],
  ['notebooks', 'Spiral Notebook', 200, 0, 'https://images.unsplash.com/photo-1517842645767-c639042777db?w=600', 'A lightweight spiral notebook for everyday classroom notes.'],
  ['writing', 'Pencil Set', 100, 50, 'https://images.unsplash.com/photo-1513364776144-60967b0f800f?w=600', 'A useful pencil set for writing, drawing and sketching.'],
  ['calculators', 'Graphing Calculator', 1900, 5, 'https://images.unsplash.com/photo-1564473185935-58113cba1e80?w=600', 'A graphing calculator designed for advanced mathematical work.']
];

/* ---------------- small helpers ---------------- */

async function tableExists(name) {
  const [rows] = await db.query(
    'SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?', [name]);
  return rows.length > 0;
}

async function columnExists(table, column) {
  const [rows] = await db.query(
    'SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?',
    [table, column]);
  return rows.length > 0;
}

async function constraintExists(table, name) {
  const [rows] = await db.query(
    'SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ?',
    [table, name]);
  return rows.length > 0;
}

async function addColumnIfMissing(table, column, definition) {
  if (!(await columnExists(table, column))) {
    await db.query(`ALTER TABLE \`${table}\` ADD COLUMN \`${column}\` ${definition}`);
  }
}

// Creates the database itself when it does not exist yet (first run on a new computer)
async function createDatabase() {
  const conn = mysql.createConnection(db.connectionSettings).promise();
  try {
    await conn.query(`CREATE DATABASE IF NOT EXISTS \`${db.DB_NAME}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  } catch (err) {
    // Online database services often create the database for you and do not allow
    // CREATE DATABASE. If the database can already be used, carry on.
    try {
      await db.query('SELECT 1');
    } catch (e) {
      throw err;
    }
  } finally {
    await conn.end().catch(() => {});
  }
}

/* ---------------- tables ---------------- */

const TABLES = [
  `CREATE TABLE IF NOT EXISTS categories (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(60) NOT NULL UNIQUE,
    slug VARCHAR(40) NOT NULL UNIQUE,
    description VARCHAR(255) NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  ) ENGINE=InnoDB`,

  `CREATE TABLE IF NOT EXISTS users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    full_name VARCHAR(100) NOT NULL,
    email VARCHAR(150) NOT NULL UNIQUE,
    phone VARCHAR(15) NULL,
    password VARCHAR(255) NOT NULL,
    role ENUM('student','staff') NOT NULL DEFAULT 'student',
    is_active TINYINT(1) NOT NULL DEFAULT 1,
    twofa_enabled TINYINT(1) NOT NULL DEFAULT 0,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  ) ENGINE=InnoDB`,

  `CREATE TABLE IF NOT EXISTS products (
    id INT AUTO_INCREMENT PRIMARY KEY,
    category_id INT NOT NULL,
    name VARCHAR(150) NOT NULL,
    price DECIMAL(10,2) UNSIGNED NOT NULL,
    stock_quantity INT UNSIGNED NOT NULL DEFAULT 0,
    image VARCHAR(500) NULL,
    description TEXT NULL,
    is_active TINYINT(1) NOT NULL DEFAULT 1,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_products_category FOREIGN KEY (category_id) REFERENCES categories(id)
      ON UPDATE CASCADE ON DELETE RESTRICT
  ) ENGINE=InnoDB`,

  `CREATE TABLE IF NOT EXISTS orders (
    id INT AUTO_INCREMENT PRIMARY KEY,
    order_ref VARCHAR(20) NOT NULL UNIQUE,
    user_id INT NOT NULL,
    delivery_method ENUM('Campus Pickup','Campus Delivery') NOT NULL DEFAULT 'Campus Pickup',
    delivery_location VARCHAR(150) NULL,
    delivery_fee DECIMAL(10,2) UNSIGNED NOT NULL DEFAULT 0,
    contact_phone VARCHAR(15) NOT NULL,
    status ENUM('Pending','Processing','Ready for Collection','Completed','Cancelled') NOT NULL DEFAULT 'Pending',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_orders_status (status),
    INDEX idx_orders_created (created_at),
    CONSTRAINT fk_orders_user FOREIGN KEY (user_id) REFERENCES users(id)
      ON UPDATE CASCADE ON DELETE RESTRICT
  ) ENGINE=InnoDB`,

  `CREATE TABLE IF NOT EXISTS order_items (
    id INT AUTO_INCREMENT PRIMARY KEY,
    order_id INT NOT NULL,
    product_id INT NOT NULL,
    quantity INT UNSIGNED NOT NULL,
    unit_price DECIMAL(10,2) UNSIGNED NOT NULL,
    UNIQUE KEY uq_order_product (order_id, product_id),
    CONSTRAINT chk_item_quantity CHECK (quantity > 0),
    CONSTRAINT fk_items_order FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
    CONSTRAINT fk_items_product FOREIGN KEY (product_id) REFERENCES products(id)
      ON UPDATE CASCADE ON DELETE RESTRICT
  ) ENGINE=InnoDB`,

  `CREATE TABLE IF NOT EXISTS payments (
    id INT AUTO_INCREMENT PRIMARY KEY,
    order_id INT NOT NULL,
    method ENUM('M-Pesa','Cash on Collection') NOT NULL,
    amount DECIMAL(10,2) UNSIGNED NOT NULL,
    phone VARCHAR(15) NULL,
    status ENUM('Pending','Paid','Failed','Cancelled') NOT NULL DEFAULT 'Pending',
    mpesa_receipt VARCHAR(30) NULL UNIQUE,
    checkout_request_id VARCHAR(100) NULL,
    result_message VARCHAR(255) NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    paid_at DATETIME NULL,
    INDEX idx_payments_checkout (checkout_request_id),
    CONSTRAINT fk_payments_order FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
  ) ENGINE=InnoDB`,

  `CREATE TABLE IF NOT EXISTS password_resets (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    token_hash CHAR(64) NOT NULL UNIQUE,
    expires_at DATETIME NOT NULL,
    used_at DATETIME NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_resets_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  ) ENGINE=InnoDB`,

  `CREATE TABLE IF NOT EXISTS admins (
    id INT AUTO_INCREMENT PRIMARY KEY,
    full_name VARCHAR(100) NOT NULL,
    email VARCHAR(150) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    role ENUM('super_admin','admin') NOT NULL DEFAULT 'admin',
    is_active TINYINT(1) NOT NULL DEFAULT 1,
    twofa_secret VARCHAR(255) NULL,
    twofa_enabled TINYINT(1) NOT NULL DEFAULT 0,
    last_login DATETIME NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  ) ENGINE=InnoDB`,

  // Restocking: suppliers, and purchase orders the shop sends them.
  // Like customer orders, purchase order totals are worked out from the lines, not stored.
  `CREATE TABLE IF NOT EXISTS suppliers (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(120) NOT NULL UNIQUE,
    contact_person VARCHAR(100) NULL,
    phone VARCHAR(20) NULL,
    email VARCHAR(150) NULL,
    is_active TINYINT(1) NOT NULL DEFAULT 1,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  ) ENGINE=InnoDB`,

  `CREATE TABLE IF NOT EXISTS purchase_orders (
    id INT AUTO_INCREMENT PRIMARY KEY,
    po_ref VARCHAR(20) NOT NULL UNIQUE,
    supplier_id INT NOT NULL,
    status ENUM('Ordered','Received','Cancelled') NOT NULL DEFAULT 'Ordered',
    expected_date DATE NULL,
    notes VARCHAR(500) NULL,
    created_by INT NULL,
    received_by INT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    received_at DATETIME NULL,
    INDEX idx_po_status (status),
    INDEX idx_po_created (created_at),
    CONSTRAINT fk_po_supplier FOREIGN KEY (supplier_id) REFERENCES suppliers(id) ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT fk_po_created_by FOREIGN KEY (created_by) REFERENCES admins(id) ON UPDATE CASCADE ON DELETE SET NULL,
    CONSTRAINT fk_po_received_by FOREIGN KEY (received_by) REFERENCES admins(id) ON UPDATE CASCADE ON DELETE SET NULL
  ) ENGINE=InnoDB`,

  `CREATE TABLE IF NOT EXISTS purchase_order_items (
    id INT AUTO_INCREMENT PRIMARY KEY,
    purchase_order_id INT NOT NULL,
    product_id INT NOT NULL,
    quantity INT NOT NULL,
    unit_cost DECIMAL(10,2) NOT NULL DEFAULT 0,
    UNIQUE KEY uq_po_product (purchase_order_id, product_id),
    CONSTRAINT fk_poi_order FOREIGN KEY (purchase_order_id) REFERENCES purchase_orders(id) ON UPDATE CASCADE ON DELETE CASCADE,
    CONSTRAINT fk_poi_product FOREIGN KEY (product_id) REFERENCES products(id) ON UPDATE CASCADE ON DELETE RESTRICT
  ) ENGINE=InnoDB`
];

const AUDIT_TABLE = `CREATE TABLE IF NOT EXISTS audit_log (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    actor_type ENUM('admin','customer','system') NOT NULL DEFAULT 'system',
    actor_id INT NULL,
    actor_email VARCHAR(150) NULL,
    action VARCHAR(50) NOT NULL,
    table_name VARCHAR(64) NULL,
    record_id VARCHAR(64) NULL,
    details TEXT NULL,
    ip_address VARCHAR(64) NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_audit_created (created_at)
  ) ENGINE=InnoDB`;

/* ---------------- upgrades for databases created by earlier versions ---------------- */

async function upgradeOlderTables() {
  // users: phone number and an active flag were added later
  await addColumnIfMissing('users', 'phone', 'VARCHAR(15) NULL AFTER email');
  await addColumnIfMissing('users', 'is_active', 'TINYINT(1) NOT NULL DEFAULT 1');

  // Two factor authentication: customers can switch on email codes; admins can link an
  // authenticator app (the key is stored encrypted). Admins without an app get email codes.
  await addColumnIfMissing('users', 'twofa_enabled', 'TINYINT(1) NOT NULL DEFAULT 0 AFTER is_active');
  if (await tableExists('admins')) {
    await addColumnIfMissing('admins', 'twofa_secret', 'VARCHAR(255) NULL AFTER is_active');
    await addColumnIfMissing('admins', 'twofa_enabled', 'TINYINT(1) NOT NULL DEFAULT 0 AFTER twofa_secret');
  }

  // products: the first version stored the category name as text in every product row.
  // It now points to the categories table instead (normalised), so names are stored once.
  await addColumnIfMissing('products', 'image', 'VARCHAR(500) NULL');
  await addColumnIfMissing('products', 'description', 'TEXT NULL');
  await addColumnIfMissing('products', 'is_active', 'TINYINT(1) NOT NULL DEFAULT 1');

  if (!(await columnExists('products', 'category_id'))) {
    await db.query('ALTER TABLE products ADD COLUMN category_id INT NULL AFTER id');
    if (await columnExists('products', 'category')) {
      await db.query(
        `UPDATE products p JOIN categories c
           ON LOWER(TRIM(p.category)) IN (c.slug, LOWER(c.name))
         SET p.category_id = c.id`);
    }
    await db.query(
      `UPDATE products SET category_id = (SELECT id FROM categories WHERE slug = 'accessories')
       WHERE category_id IS NULL`);
    await db.query('ALTER TABLE products MODIFY category_id INT NOT NULL');
  }
  if (!(await constraintExists('products', 'fk_products_category'))) {
    await db.query(
      `ALTER TABLE products ADD CONSTRAINT fk_products_category FOREIGN KEY (category_id)
       REFERENCES categories(id) ON UPDATE CASCADE ON DELETE RESTRICT`);
  }
  if (await columnExists('products', 'category')) {
    await db.query('ALTER TABLE products DROP COLUMN category');
  }

  // Audit trail: the first version only logged admins (admin_audit_log).
  // It is renamed to audit_log and now records customers as well.
  if ((await tableExists('admin_audit_log')) && !(await tableExists('audit_log'))) {
    await db.query('RENAME TABLE admin_audit_log TO audit_log');
    await db.query('ALTER TABLE audit_log CHANGE admin_id actor_id INT NULL');
    await db.query('ALTER TABLE audit_log CHANGE admin_email actor_email VARCHAR(150) NULL');
    await db.query(`ALTER TABLE audit_log ADD COLUMN actor_type ENUM('admin','customer','system') NOT NULL DEFAULT 'admin' AFTER id`);
  }
}

/* ---------------- starting data ---------------- */

async function seed() {
  const [[{ n: productCount }]] = await db.query('SELECT COUNT(*) AS n FROM products');
  if (productCount === 0) {
    for (const [slug, name, price, stock, image, description] of STARTER_PRODUCTS) {
      await db.query(
        `INSERT INTO products (category_id, name, price, stock_quantity, image, description)
         SELECT id, ?, ?, ?, ?, ? FROM categories WHERE slug = ?`,
        [name, price, stock, image, description, slug]);
    }
  }

  const [[{ n: adminCount }]] = await db.query('SELECT COUNT(*) AS n FROM admins');
  if (adminCount === 0) {
    await db.query('INSERT INTO admins (full_name, email, password_hash, role) VALUES (?, ?, ?, ?)',
      [DEFAULT_ADMIN.name, DEFAULT_ADMIN.email, hashAdminPassword(DEFAULT_ADMIN.password), 'super_admin']);
    console.log(`Default super admin created: ${DEFAULT_ADMIN.email} / ${DEFAULT_ADMIN.password} (change it after first login)`);
  }
}

/* ---------------- run once, retry after a failure ---------------- */

let ready = null;

function ensureSchema() {
  if (!ready) {
    ready = (async () => {
      await createDatabase();
      await db.query(TABLES[0]); // categories first, products depend on it
      await db.query('INSERT IGNORE INTO categories (name, slug, description) VALUES ?', [CATEGORIES]);
      await db.query(TABLES[1]); // users
      if (await tableExists('products')) await upgradeOlderTables();
      for (const sql of TABLES.slice(2)) await db.query(sql);
      await upgradeOlderTables(); // also covers brand new installs (does nothing there)
      await db.query(AUDIT_TABLE);
      await seed();
    })().catch(err => {
      ready = null; // try again on the next request, for example after MySQL is started
      throw err;
    });
  }
  return ready;
}

module.exports = { ensureSchema, DEFAULT_ADMIN };
