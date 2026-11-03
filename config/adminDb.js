// config/adminDb.js
// MySQL connection pool used by the admin panel (routes/admin.js).
// It reads the same .env values as the rest of the backend.
// If your config/db.js uses different names, edit the fallbacks below so both point at the SAME database.

try { require('dotenv').config(); } catch (e) { /* dotenv not installed, env vars may already be set */ }

const mysql = require('mysql2');

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || process.env.DB_PASS || '',
  database: process.env.DB_NAME || process.env.DB_DATABASE || 'campus_stationery',
  waitForConnections: true,
  connectionLimit: 5,
  dateStrings: true // keep DATE/DATETIME as plain strings so dates never shift by timezone
});

module.exports = pool.promise();
