-- database/admin_tables.sql
-- Tables used by the CampusStationery admin panel.
-- You do NOT have to run this by hand: routes/admin.js creates these tables
-- automatically the first time the admin API is called. It is included for the
-- database schema deliverable and for anyone setting up the database manually.

CREATE TABLE IF NOT EXISTS admins (
  id INT AUTO_INCREMENT PRIMARY KEY,
  full_name VARCHAR(100) NOT NULL,
  email VARCHAR(150) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,          -- scrypt hash in the form salt:hash, never plain text
  role ENUM('super_admin','admin') NOT NULL DEFAULT 'admin',
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  last_login DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS admin_audit_log (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  admin_id INT NULL,
  admin_email VARCHAR(150) NULL,
  action VARCHAR(50) NOT NULL,                  -- LOGIN, LOGIN_FAILED, CREATE, UPDATE, DELETE, RESET_ADMIN_PASSWORD ...
  table_name VARCHAR(64) NULL,
  record_id VARCHAR(64) NULL,
  details TEXT NULL,                            -- JSON of the values that changed (passwords hidden)
  ip_address VARCHAR(64) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_audit_created (created_at)
) ENGINE=InnoDB;

-- The first super admin is seeded automatically by the API:
--   email:    admin@campusstationery.com
--   password: Admin@123   (change it from "My password" after the first login)
