-- database/campus_stationery.sql
-- Creates the CampusStationery database used by config/db.js and config/adminDb.js.
-- Run it once in phpMyAdmin (Import tab) or with:  mysql -u root -p < database/campus_stationery.sql
-- Safe to run again: it only creates what is missing and skips products that already exist.

CREATE DATABASE IF NOT EXISTS school_project_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE school_project_db;

-- Customers (students and staff) who shop on the website
CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  full_name VARCHAR(100) NOT NULL,
  email VARCHAR(150) NOT NULL UNIQUE,
  password VARCHAR(255) NOT NULL,               -- bcrypt hash
  role ENUM('student','staff') NOT NULL DEFAULT 'student',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- Stationery items sold in the shop
CREATE TABLE IF NOT EXISTS products (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(150) NOT NULL,
  category ENUM('notebooks','writing','calculators','paper','accessories') NOT NULL DEFAULT 'accessories',
  price DECIMAL(10,2) UNSIGNED NOT NULL,
  stock_quantity INT UNSIGNED NOT NULL DEFAULT 0,
  image VARCHAR(500) NULL,
  description TEXT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- Starting stock (same items the website showed before it was connected to the database)
INSERT IGNORE INTO products (id, name, category, price, stock_quantity, image, description) VALUES
(1, 'A5 Hardcover Notebook', 'notebooks', 350, 25, 'https://images.unsplash.com/photo-1531346878377-a5be20888e57?w=600', 'A durable hardcover notebook suitable for everyday lectures and note-taking.'),
(2, 'Premium Ballpoint Pens', 'writing', 150, 40, 'https://images.unsplash.com/photo-1583485088034-697b5bc54ccd?w=600', 'A set of smooth-writing ballpoint pens for school and office use.'),
(3, 'Scientific Calculator', 'calculators', 1200, 12, 'https://images.unsplash.com/photo-1587145820266-a5951ee6f620?w=600', 'A scientific calculator for mathematical and scientific calculations.'),
(4, 'A4 Printing Paper', 'paper', 650, 30, 'https://images.unsplash.com/photo-1586075010923-2dd4570fb338?w=600', 'Quality A4 paper suitable for printing, assignments and photocopying.'),
(5, 'Student Backpack', 'accessories', 1800, 8, 'https://images.unsplash.com/photo-1553062407-98eeb64c6a62?w=600', 'A practical backpack for carrying books, stationery and other essentials.'),
(6, 'Spiral Notebook', 'notebooks', 200, 0, 'https://images.unsplash.com/photo-1517842645767-c639042777db?w=600', 'A lightweight spiral notebook for everyday classroom notes.'),
(7, 'Pencil Set', 'writing', 100, 50, 'https://images.unsplash.com/photo-1513364776144-60967b0f800f?w=600', 'A useful pencil set for writing, drawing and sketching.'),
(8, 'Graphing Calculator', 'calculators', 1900, 5, 'https://images.unsplash.com/photo-1564473185935-58113cba1e80?w=600', 'A graphing calculator designed for advanced mathematical work.');

-- Admin tables (admins, admin_audit_log) are created automatically by routes/admin.js on first run.
