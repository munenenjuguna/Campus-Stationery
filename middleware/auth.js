// middleware/auth.js
// Checks the login token sent with each request and decides who may continue.
// Customer tokens and admin tokens are kept apart, so a customer can never open admin routes.

const { readToken, bearerToken } = require('../utils/security');

function requireCustomer(req, res, next) {
  const data = readToken(bearerToken(req));
  if (!data || data.type !== 'customer') {
    return res.status(401).json({ success: false, message: 'Please log in to continue.' });
  }
  req.customer = data;
  next();
}

function requireAdmin(req, res, next) {
  const data = readToken(bearerToken(req));
  if (!data || data.type !== 'admin') {
    return res.status(401).json({ error: 'Your session has expired. Please log in again.' });
  }
  req.admin = data;
  next();
}

function requireSuperAdmin(req, res, next) {
  if (!req.admin || req.admin.role !== 'super_admin') {
    return res.status(403).json({ error: 'Only a super admin can do this.' });
  }
  next();
}

module.exports = { requireCustomer, requireAdmin, requireSuperAdmin };
