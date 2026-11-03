const express = require('express');
const cors = require('cors');
require('dotenv').config();

const productRoutes = require('./routes/productRoutes');
const userRoutes = require('./routes/userRoutes');

const app = express();
const path = require('path');
app.use('/api/admin', require('./routes/admin'));
app.use('/admin', express.static(path.join(__dirname, 'admin')));
// Middleware
app.use(cors());
app.use(express.json());

// API Endpoints
app.use('/api/products', productRoutes);
app.use('/api/users', userRoutes);

// Health Check Route
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', message: 'Campus Stationery API Server is running!' });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
