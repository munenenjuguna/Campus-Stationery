// routes/productRoutes.js
// Public product catalogue used by the shop pages. Read only:
// products are added, edited and deleted from the admin panel, which checks the admin login.

const express = require('express');
const router = express.Router();
const db = require('../config/db');

// Columns returned to the shop. "category" is the category slug used by the shop filters.
const PRODUCT_COLUMNS = `
  p.id, p.name, p.price, p.stock_quantity, p.image, p.description,
  c.slug AS category, c.name AS category_name`;

// GET /api/products?category=notebooks&search=pen
router.get('/', async (req, res, next) => {
  try {
    const where = ['p.is_active = 1'];
    const params = [];
    if (req.query.category) {
      where.push('c.slug = ?');
      params.push(String(req.query.category));
    }
    if (req.query.search) {
      where.push('(p.name LIKE ? OR p.description LIKE ?)');
      params.push(`%${req.query.search}%`, `%${req.query.search}%`);
    }
    const [rows] = await db.query(
      `SELECT ${PRODUCT_COLUMNS}
       FROM products p JOIN categories c ON c.id = p.category_id
       WHERE ${where.join(' AND ')}
       ORDER BY p.id`, params);
    res.json({ success: true, data: rows });
  } catch (err) {
    next(err);
  }
});

// GET /api/products/categories
router.get('/categories', async (req, res, next) => {
  try {
    const [rows] = await db.query(
      `SELECT c.id, c.name, c.slug, c.description, COUNT(p.id) AS product_count
       FROM categories c LEFT JOIN products p ON p.category_id = c.id AND p.is_active = 1
       GROUP BY c.id, c.name, c.slug, c.description ORDER BY c.name`);
    res.json({ success: true, data: rows });
  } catch (err) {
    next(err);
  }
});

// GET /api/products/:id
router.get('/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id < 1) {
      return res.status(400).json({ success: false, message: 'Invalid product id.' });
    }
    const [rows] = await db.query(
      `SELECT ${PRODUCT_COLUMNS}
       FROM products p JOIN categories c ON c.id = p.category_id
       WHERE p.id = ? AND p.is_active = 1`, [id]);
    if (!rows.length) return res.status(404).json({ success: false, message: 'Product not found.' });
    res.json({ success: true, data: rows[0] });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
