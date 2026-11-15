-- ==============================================================
-- database/campus_stationery.sql
-- CampusStationery database (MySQL / MariaDB), normalised to third normal form.
--
-- You do NOT have to import this file: the server creates the database and all tables
-- automatically the first time it starts (config/schema.js). It is provided as the
-- database design document and for anyone who prefers to set up the database by hand
-- (phpMyAdmin > Import, or: mysql -u root -p < database/campus_stationery.sql).
--
-- Relationships (cardinality):
--   categories 1 ---- * products        a category has many products, a product has one category
--   users      1 ---- * orders          a customer places many orders
--   orders     1 ---- * order_items     an order has one or more lines
--   products   1 ---- * order_items     a product appears on many order lines
--   orders     1 ---- * payments        an order can have several payment attempts
--   users      1 ---- * password_resets
--   admins and audit_log stand alone (audit_log stores who did what, for both admins and customers)
-- ==============================================================

CREATE DATABASE IF NOT EXISTS school_project_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE school_project_db;

-- Product categories (each category name stored once)
CREATE TABLE IF NOT EXISTS categories (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(60) NOT NULL UNIQUE,
  slug VARCHAR(40) NOT NULL UNIQUE,              -- short name used in web addresses, e.g. "notebooks"
  description VARCHAR(255) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- Customers (students and staff) who shop on the website
CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  full_name VARCHAR(100) NOT NULL,
  email VARCHAR(150) NOT NULL UNIQUE,
  phone VARCHAR(15) NULL,                          -- stored as 2547XXXXXXXX
  password VARCHAR(255) NOT NULL,                  -- bcrypt hash, never plain text
  role ENUM('student','staff') NOT NULL DEFAULT 'student',
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  twofa_enabled TINYINT(1) NOT NULL DEFAULT 0,          -- 1 = asks for an emailed code at login
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- Stationery items for sale
CREATE TABLE IF NOT EXISTS products (
  id INT AUTO_INCREMENT PRIMARY KEY,
  category_id INT NOT NULL,
  name VARCHAR(150) NOT NULL,
  price DECIMAL(10,2) UNSIGNED NOT NULL,
  stock_quantity INT UNSIGNED NOT NULL DEFAULT 0,
  image VARCHAR(500) NULL,
  description TEXT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,         -- 0 hides the product from the shop without deleting it
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_products_category FOREIGN KEY (category_id) REFERENCES categories(id)
    ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB;

-- Orders (the main transaction). Totals are not stored: they are calculated from order_items
-- plus delivery_fee, so they can never disagree with the items.
CREATE TABLE IF NOT EXISTS orders (
  id INT AUTO_INCREMENT PRIMARY KEY,
  order_ref VARCHAR(20) NOT NULL UNIQUE,           -- e.g. CS-261114-AB12, shown to customers
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
) ENGINE=InnoDB;

-- Lines of each order. unit_price keeps the price paid even if the product price changes later.
CREATE TABLE IF NOT EXISTS order_items (
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
) ENGINE=InnoDB;

-- Payments (M-Pesa or cash). One order can have several attempts, for example a failed M-Pesa
-- prompt followed by a successful one.
CREATE TABLE IF NOT EXISTS payments (
  id INT AUTO_INCREMENT PRIMARY KEY,
  order_id INT NOT NULL,
  method ENUM('M-Pesa','Cash on Collection') NOT NULL,
  amount DECIMAL(10,2) UNSIGNED NOT NULL,
  phone VARCHAR(15) NULL,
  status ENUM('Pending','Paid','Failed','Cancelled') NOT NULL DEFAULT 'Pending',
  mpesa_receipt VARCHAR(30) NULL UNIQUE,
  checkout_request_id VARCHAR(100) NULL,           -- Daraja STK push reference
  result_message VARCHAR(255) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  paid_at DATETIME NULL,
  INDEX idx_payments_checkout (checkout_request_id),
  CONSTRAINT fk_payments_order FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- Forgot password links. Only a SHA-256 hash of the token is stored.
CREATE TABLE IF NOT EXISTS password_resets (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  token_hash CHAR(64) NOT NULL UNIQUE,
  expires_at DATETIME NOT NULL,
  used_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_resets_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- Admin panel accounts (two access levels)
CREATE TABLE IF NOT EXISTS admins (
  id INT AUTO_INCREMENT PRIMARY KEY,
  full_name VARCHAR(100) NOT NULL,
  email VARCHAR(150) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,             -- scrypt hash (salt:hash)
  role ENUM('super_admin','admin') NOT NULL DEFAULT 'admin',
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  twofa_secret VARCHAR(255) NULL,                  -- authenticator app key, AES-256-GCM encrypted
  twofa_enabled TINYINT(1) NOT NULL DEFAULT 0,     -- 1 = codes from an authenticator app, 0 = emailed codes
  last_login DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- Audit trail: who did what and when (admins, customers and the system)
CREATE TABLE IF NOT EXISTS audit_log (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  actor_type ENUM('admin','customer','system') NOT NULL DEFAULT 'system',
  actor_id INT NULL,
  actor_email VARCHAR(150) NULL,
  action VARCHAR(50) NOT NULL,                     -- LOGIN, ORDER_PLACED, PAYMENT_RECEIVED, UPDATE ...
  table_name VARCHAR(64) NULL,
  record_id VARCHAR(64) NULL,
  details TEXT NULL,                               -- JSON of what changed (passwords hidden)
  ip_address VARCHAR(64) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_audit_created (created_at)
) ENGINE=InnoDB;

-- Starting data
INSERT IGNORE INTO categories (name, slug, description) VALUES
('Notebooks', 'notebooks', 'Hardcover, spiral and exercise books'),
('Writing Materials', 'writing', 'Pens, pencils, markers and highlighters'),
('Calculators', 'calculators', 'Scientific and graphing calculators'),
('Paper Products', 'paper', 'Printing paper, foolscaps and envelopes'),
('Accessories', 'accessories', 'Bags, rulers, files and desk items');

-- Products are added by the server on first start if the table is empty, and the first
-- super admin (admin@campusstationery.com / Admin@123) is created the same way.
