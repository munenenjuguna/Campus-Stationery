// routes/userRoutes.js
const express = require('express');
const router = express.Router();
const db = require('../config/db');

// POST /api/users/register - Register a new user
router.post('/register', async (req, res) => {
  const { full_name, email, password, role } = req.body;

  if (!full_name || !email || !password) {
    return res.status(400).json({ success: false, message: 'Full name, email, and password are required.' });
  }

  try {
    // Check for existing user
    const [existing] = await db.query('SELECT id FROM users WHERE email = ?', [email]);
    if (existing.length > 0) {
      return res.status(400).json({ success: false, message: 'Email is already registered.' });
    }

    // Insert new user
    const [result] = await db.query(
      'INSERT INTO users (full_name, email, password, role) VALUES (?, ?, ?, ?)',
      [full_name, email, password, role || 'student']
    );

    res.status(201).json({
      success: true,
      message: 'User registered successfully!',
      userId: result.insertId
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// POST /api/users/login - User Login
router.post('/login', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ success: false, message: 'Please provide both email and password.' });
  }

  try {
    const [users] = await db.query('SELECT id, full_name, email, role, password FROM users WHERE email = ?', [email]);
    
    if (users.length === 0 || users[0].password !== password) {
      return res.status(401).json({ success: false, message: 'Invalid credentials.' });
    }

    const user = users[0];
    delete user.password; // Omit password from the response payload

    res.json({
      success: true,
      message: 'Login successful!',
      user
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// GET /api/users - Retrieve all users (Admin check)
router.get('/', async (req, res) => {
  try {
    const [rows] = await db.query('SELECT id, full_name, email, role, created_at FROM users');
    res.json({ success: true, data: rows });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;