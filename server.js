// server.js
// Starts the CampusStationery web server: the shop pages, the admin panel and the API.

require('dotenv').config({ quiet: true });

const path = require('path');
const express = require('express');
const cors = require('cors');

const { ensureSchema } = require('./config/schema');
const { connectionHint, dataError } = require('./utils/dbErrors');
const { OrderError } = require('./services/orderService');
const mpesa = require('./utils/mpesa');
const mailer = require('./utils/mailer');

const app = express();
app.disable('x-powered-by');

/* ---------------- middleware ---------------- */

app.use(cors());
app.use(express.json({ limit: '1mb' }));

// Basic security headers
app.use((req, res, next) => {
  res.set('X-Content-Type-Options', 'nosniff');
  res.set('X-Frame-Options', 'SAMEORIGIN');
  res.set('Referrer-Policy', 'same-origin');
  // When hosted online behind HTTPS, tell browsers to always use the encrypted address
  if (req.headers['x-forwarded-proto'] === 'https') {
    res.set('Strict-Transport-Security', 'max-age=15552000');
  }
  next();
});

// Make sure the database and tables exist before any API request runs.
// If MySQL is off, the API answers with a clear message instead of crashing.
app.use('/api', async (req, res, next) => {
  if (req.path === '/health') return next();
  try {
    await ensureSchema();
    next();
  } catch (err) {
    res.status(503).json({
      success: false,
      error: 'Cannot reach the database. ' + (connectionHint(err) || err.message),
      message: 'Cannot reach the database. ' + (connectionHint(err) || err.message)
    });
  }
});

/* ---------------- API ---------------- */

app.use('/api/products', require('./routes/productRoutes'));
app.use('/api/users', require('./routes/userRoutes'));
app.use('/api/orders', require('./routes/orderRoutes'));
app.use('/api/payments', require('./routes/paymentRoutes'));
app.use('/api/admin', require('./routes/admin'));

app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', message: 'Campus Stationery API Server is running!', payments: mpesa.mode(), email: mailer.isConfigured() ? 'smtp' : 'console' });
});

app.use('/api', (req, res) => {
  res.status(404).json({ success: false, message: 'Unknown API address.' });
});

/* ---------------- web pages ---------------- */

// Only these public folders are served, so config files and .env can never be downloaded
['admin', 'assets', 'css', 'js', 'pages'].forEach(folder => {
  app.use('/' + folder, express.static(path.join(__dirname, folder)));
});
app.get(['/', '/index.html'], (req, res) => res.sendFile(path.join(__dirname, 'index.html')));

app.use((req, res) => {
  res.status(404).sendFile(path.join(__dirname, 'pages', '404.html'));
});

/* ---------------- error handling ---------------- */

app.use((err, req, res, next) => {
  if (err instanceof OrderError) {
    return res.status(err.status).json({ success: false, message: err.message, error: err.message });
  }
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ success: false, message: 'The request was not valid JSON.' });
  }
  const friendly = dataError(err) || connectionHint(err);
  if (friendly) {
    return res.status(connectionHint(err) ? 503 : 400).json({ success: false, message: friendly, error: friendly });
  }
  console.error('[server error]', err);
  res.status(500).json({ success: false, message: 'Something went wrong on the server. Please try again.', error: 'Something went wrong on the server.' });
});

/* ---------------- start ---------------- */

const PORT = Number(process.env.PORT) || 5000;

// "npm test" loads this file without starting the server, so only listen when run directly
if (require.main === module) app.listen(PORT, async () => {
  // Online hosts such as Render give the public address in RENDER_EXTERNAL_URL (or set PUBLIC_URL yourself)
  const base = (process.env.PUBLIC_URL || process.env.RENDER_EXTERNAL_URL || `http://localhost:${PORT}`).replace(/\/$/, '');
  console.log(`Server running on ${base}`);
  console.log(`  Shop:        ${base}`);
  console.log(`  Admin panel: ${base}/admin/login.html`);
  if (process.env.RENDER && !process.env.APP_SECRET) {
    console.warn('  Warning:     APP_SECRET is not set. Logins and linked authenticator apps stop working after each restart.');
  }
  console.log(`  M-Pesa:      ${mpesa.mode() === 'demo' ? 'demo mode (simulated payments)' : 'Daraja sandbox'}`);
  try {
    await ensureSchema();
    console.log('  Database:    connected and ready');
  } catch (err) {
    console.error('  Database:    NOT connected. ' + (connectionHint(err) || err.message));
  }
});

module.exports = app;
