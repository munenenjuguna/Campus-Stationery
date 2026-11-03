const express = require('express');
const cors = require('cors');
require('dotenv').config();

const productRoutes = require('./routes/productRoutes');

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// API Endpoints
app.use('/api/products', productRoutes);

// Health Check Route
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', message: 'Campus Stationery API Server is running!' });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});