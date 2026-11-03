// routes/productRoutes.js
const express = require('express');
const router = express.Router();
const db = require('../config/db');

// GET all products (For shop display & admin inventory)
router.get('/', async (req, res) => {
  try {
    const [rows] = await db.query('SELECT * FROM products');
    res.json({ success: true, data: rows });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// POST add new inventory item (Admin panel)
router.post('/', async (req, res) => {
  const { name, category, price, stock_quantity } = req.body;
  
  if (!name || !price) {
    return res.status(400).json({ success: false, message: 'Name and price are required' });
  }

  try {
    const [result] = await db.query(
      'INSERT INTO products (name, category, price, stock_quantity) VALUES (?, ?, ?, ?)',
      [name, category || 'General', price, stock_quantity || 0]
    );
    res.status(201).json({ success: true, productId: result.insertId, message: 'Product added successfully' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;