// routes/admin.js
// Admin panel API for CampusStationery.
//
// What it does:
//   * Admin login with hashed passwords (scrypt), signed session tokens and lockout after 5 failed tries
//   * Two factor authentication on every admin login: a code from an authenticator app,
//     or a 6 digit code sent by email when no app is linked
//   * Two access levels: super_admin and admin
//   * Reads the live MySQL schema, so the main tables (products, categories, users) can be browsed,
//     searched, sorted, added to, edited and deleted from, with foreign keys shown as dropdowns
//   * Order management (the main transaction), sales, order and inventory reports
//   * Every change is written to the audit trail (audit_log)
//   * All values go through prepared statements; table and column names are checked
//     against INFORMATION_SCHEMA before use, which blocks SQL injection

const express = require('express');
const bcrypt = require('bcryptjs');
const pool = require('../config/db');
const shop = require('../config/shop');
const { DEFAULT_ADMIN } = require('../config/schema');
const writeAudit = require('../utils/audit');
const mpesa = require('../utils/mpesa');
const { dataError } = require('../utils/dbErrors');
const orders = require('../services/orderService');
const purchases = require('../services/purchaseService');
const twofa = require('../utils/twofactor');
const { requireAdmin, requireSuperAdmin } = require('../middleware/auth');
const {
  signToken, hashAdminPassword: hashPassword, verifyAdminPassword: verifyPassword,
  strongPassword, isEmail, createLoginGuard
} = require('../utils/security');

const router = express.Router();

const TOKEN_HOURS = 8;

// Tables with their own pages (or private data) are left out of the generic "Manage data" screens,
// so orders and payments can only change through the business rules in services/orderService.js
const INTERNAL_TABLES = ['admins', 'audit_log', 'orders', 'order_items', 'payments', 'password_resets', 'purchase_orders', 'purchase_order_items'];
const SENSITIVE_COLUMN = /pass(word)?|hash|salt|token|secret|otp/i;

/* ---------------- helpers ---------------- */

const wrap = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const q = name => '`' + String(name).replace(/`/g, '``') + '`';

function audit(req, action, tableName = null, recordId = null, details = null) {
  return writeAudit(req, {
    actorType: 'admin',
    actorId: req.admin ? req.admin.id : null,
    actorEmail: req.admin ? req.admin.email : (req.body && req.body.email) || null,
    action, table: tableName, recordId, details
  });
}

/* ---------------- auth ---------------- */

const loginGuard = createLoginGuard(shop.MAX_FAILED_LOGINS, shop.LOCK_MINUTES);

router.get('/status', wrap(async (req, res) => {
  const [[row]] = await pool.query('SELECT DATABASE() AS db');
  res.json({ ok: true, database: row.db });
}));

router.post('/login', wrap(async (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  const password = String(req.body.password || '');
  if (!email || !password) return res.status(400).json({ error: 'Enter both your email and password.' });
  if (!isEmail(email)) return res.status(400).json({ error: 'That email address does not look valid.' });

  const lockedFor = loginGuard.lockedFor(email);
  if (lockedFor) return res.status(429).json({ error: `Too many failed attempts. Try again in ${lockedFor} minute(s).` });

  const [rows] = await pool.query('SELECT * FROM admins WHERE email = ? LIMIT 1', [email]);
  const admin = rows[0];
  if (!admin || !verifyPassword(password, admin.password_hash)) {
    const result = loginGuard.fail(email);
    await audit(req, 'LOGIN_FAILED', 'admins', admin ? admin.id : null);
    return res.status(401).json({ error: result.locked ? `Account locked for ${shop.LOCK_MINUTES} minutes.` : `Wrong email or password. ${result.attemptsLeft} attempt(s) left.` });
  }
  if (!admin.is_active) return res.status(403).json({ error: 'This admin account has been deactivated.' });

  // Password is right. Now the second factor: an authenticator app code, or an emailed code.
  loginGuard.clear(email);
  const step = await twofa.startChallenge({
    type: 'admin', id: admin.id, email: admin.email, name: admin.full_name,
    appSecretEncrypted: admin.twofa_enabled ? admin.twofa_secret : null
  });
  await audit(req, step.method === 'app' ? '2FA_APP_CODE_ASKED' : '2FA_CODE_SENT', 'admins', admin.id);
  res.json(step);
}));

// Second step of the login: checks the 6 digit code and only then issues the session token
router.post('/login/verify', wrap(async (req, res) => {
  const result = twofa.verifyChallenge(req.body.challenge, req.body.code, 'admin');
  if (!result.ok) {
    if (result.challenge) {
      await writeAudit(req, { actorType: 'admin', actorId: result.challenge.accountId, actorEmail: result.challenge.email,
        action: '2FA_FAILED', table: 'admins', recordId: result.challenge.accountId });
    }
    return res.status(result.status).json({ error: result.error, restart: result.status === 410 || !!result.finished });
  }
  const [[admin]] = await pool.query('SELECT * FROM admins WHERE id = ?', [result.challenge.accountId]);
  if (!admin || !admin.is_active) return res.status(403).json({ error: 'This admin account has been deactivated.', restart: true });

  await pool.query('UPDATE admins SET last_login = NOW() WHERE id = ?', [admin.id]);
  req.admin = { id: admin.id, email: admin.email, name: admin.full_name, role: admin.role };
  await audit(req, 'LOGIN', 'admins', admin.id, { second_factor: result.challenge.method === 'app' ? 'authenticator app' : 'email code' });
  res.json({
    token: signToken({ type: 'admin', ...req.admin }, TOKEN_HOURS),
    admin: req.admin,
    usingDefaultPassword: verifyPassword(DEFAULT_ADMIN.password, admin.password_hash)
  });
}));

// Sends a new emailed code, or an emailed code instead of the app code (for example a lost phone)
router.post('/login/resend', wrap(async (req, res) => {
  const result = await twofa.resendChallenge(req.body.challenge, 'admin');
  if (!result.ok) return res.status(result.status).json({ error: result.error, restart: result.status === 410 });
  res.json(result);
}));

router.post('/logout', requireAdmin, wrap(async (req, res) => {
  await audit(req, 'LOGOUT', 'admins', req.admin.id);
  res.json({ ok: true });
}));

router.get('/me', requireAdmin, (req, res) => res.json({ admin: req.admin }));

router.post('/me/password', requireAdmin, wrap(async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  const [[admin]] = await pool.query('SELECT password_hash FROM admins WHERE id = ?', [req.admin.id]);
  if (!admin || !verifyPassword(String(currentPassword || ''), admin.password_hash)) return res.status(400).json({ error: 'Your current password is wrong.' });
  if (!strongPassword(newPassword)) return res.status(400).json({ error: 'New password needs at least 8 characters, with letters and numbers.' });
  await pool.query('UPDATE admins SET password_hash = ? WHERE id = ?', [hashPassword(newPassword), req.admin.id]);
  await audit(req, 'CHANGE_PASSWORD', 'admins', req.admin.id);
  res.json({ ok: true });
}));

/* ---------------- my two factor settings ---------------- */

// Keys waiting to be confirmed with a first code from the app (10 minutes)
const pendingAppSetups = new Map();

router.get('/me/2fa', requireAdmin, wrap(async (req, res) => {
  const [[admin]] = await pool.query('SELECT twofa_enabled FROM admins WHERE id = ?', [req.admin.id]);
  res.json({ appEnabled: !!(admin && admin.twofa_enabled), email: req.admin.email });
}));

router.post('/me/2fa/setup', requireAdmin, wrap(async (req, res) => {
  const secret = twofa.newSecret();
  pendingAppSetups.set(req.admin.id, { secret, expires: Date.now() + 10 * 60000 });
  res.json(await twofa.setupDetails(secret, req.admin.email));
}));

router.post('/me/2fa/enable', requireAdmin, wrap(async (req, res) => {
  const pending = pendingAppSetups.get(req.admin.id);
  if (!pending || pending.expires < Date.now()) return res.status(400).json({ error: 'The setup timed out. Click "Set up authenticator app" to start again.' });
  if (!twofa.verifyTotp(pending.secret, req.body.code)) {
    return res.status(400).json({ error: 'That code is not correct. Check that the time on your phone is set automatically, then try the newest code.' });
  }
  await pool.query('UPDATE admins SET twofa_secret = ?, twofa_enabled = 1 WHERE id = ?', [twofa.encrypt(pending.secret), req.admin.id]);
  pendingAppSetups.delete(req.admin.id);
  await audit(req, '2FA_APP_LINKED', 'admins', req.admin.id);
  res.json({ ok: true, message: 'Authenticator app linked. From now on you will enter a code from the app when you sign in.' });
}));

router.post('/me/2fa/disable', requireAdmin, wrap(async (req, res) => {
  const [[admin]] = await pool.query('SELECT password_hash FROM admins WHERE id = ?', [req.admin.id]);
  if (!admin || !verifyPassword(String(req.body.password || ''), admin.password_hash)) return res.status(400).json({ error: 'Your password is wrong.' });
  await pool.query('UPDATE admins SET twofa_secret = NULL, twofa_enabled = 0 WHERE id = ?', [req.admin.id]);
  await audit(req, '2FA_APP_REMOVED', 'admins', req.admin.id);
  res.json({ ok: true, message: 'Authenticator app removed. You will now get sign in codes by email.' });
}));

/* ---------------- schema reading ---------------- */

async function listTables() {
  const [rows] = await pool.query(
    `SELECT TABLE_NAME AS name FROM INFORMATION_SCHEMA.TABLES
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_TYPE = 'BASE TABLE' ORDER BY TABLE_NAME`);
  return rows.map(r => r.name).filter(n => !INTERNAL_TABLES.includes(n));
}

async function describeTable(table) {
  const [cols] = await pool.query(
    `SELECT COLUMN_NAME AS name, DATA_TYPE AS type, COLUMN_TYPE AS columnType, IS_NULLABLE AS nullable,
            COLUMN_KEY AS keyType, COLUMN_DEFAULT AS def, EXTRA AS extra, CHARACTER_MAXIMUM_LENGTH AS maxLength
     FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? ORDER BY ORDINAL_POSITION`, [table]);
  const [fks] = await pool.query(
    `SELECT COLUMN_NAME AS col, REFERENCED_TABLE_NAME AS refTable, REFERENCED_COLUMN_NAME AS refColumn
     FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND REFERENCED_TABLE_NAME IS NOT NULL`, [table]);
  const fkMap = Object.fromEntries(fks.map(f => [f.col, { table: f.refTable, column: f.refColumn }]));

  const columns = cols.map(c => {
    const extra = String(c.extra || '');
    const enumMatch = /^(enum|set)\((.*)\)$/i.exec(c.columnType || '');
    return {
      name: c.name,
      type: String(c.type).toLowerCase(),
      columnType: c.columnType,
      nullable: c.nullable === 'YES',
      primary: c.keyType === 'PRI',
      unique: c.keyType === 'UNI',
      autoIncrement: /auto_increment/i.test(extra),
      hasDefault: c.def !== null || /DEFAULT_GENERATED|on update/i.test(extra),
      autoTimestamp: /DEFAULT_GENERATED|on update/i.test(extra) || /current_timestamp/i.test(String(c.def || '')),
      sensitive: SENSITIVE_COLUMN.test(c.name),
      maxLength: c.maxLength,
      options: enumMatch ? enumMatch[2].split(/,(?=')/).map(s => s.replace(/^'|'$/g, '').replace(/''/g, "'")) : null,
      foreignKey: fkMap[c.name] || null
    };
  });
  const pk = columns.find(c => c.primary);
  return { table, columns, primaryKey: pk ? pk.name : null };
}

async function resolveTable(name, res) {
  const tables = await listTables();
  if (!tables.includes(name)) {
    res.status(404).json({ error: `Table "${name}" was not found in the database.` });
    return null;
  }
  return describeTable(name);
}

function labelColumn(meta) {
  const visible = meta.columns.filter(c => !c.sensitive);
  const pick = visible.find(c => /^(name|title|full_?name|product_?name|category_?name|username)$/i.test(c.name))
    || visible.find(c => /name|title|email/i.test(c.name))
    || visible.find(c => ['varchar', 'char'].includes(c.type));
  return pick ? pick.name : meta.primaryKey;
}

/* ---------------- value cleaning ---------------- */

const NUMERIC = ['int', 'tinyint', 'smallint', 'mediumint', 'bigint', 'decimal', 'float', 'double'];

async function cleanValues(meta, input, isUpdate) {
  const values = {};
  const errors = [];
  for (const col of meta.columns) {
    if (col.autoIncrement || col.autoTimestamp) continue;
    if (!(col.name in input)) {
      if (!isUpdate && !col.nullable && !col.hasDefault && !col.sensitive) errors.push(`${col.name} is required.`);
      continue;
    }
    let v = input[col.name];
    if (typeof v === 'string') v = v.trim();

    if (col.sensitive) {
      if (v === '' || v == null) {
        if (!isUpdate && !col.nullable && !col.hasDefault) errors.push(`${col.name} is required.`);
        continue;
      }
      if (!/pass/i.test(col.name)) { values[col.name] = v; continue; }
      if (!strongPassword(v)) { errors.push('Password needs at least 8 characters, with letters and numbers.'); continue; }
      values[col.name] = await bcrypt.hash(v, 10);
      continue;
    }

    if (v === '' || v == null) {
      if (col.nullable) { values[col.name] = null; continue; }
      if (col.hasDefault) continue;
      errors.push(`${col.name} is required.`);
      continue;
    }
    if (NUMERIC.includes(col.type)) {
      if (v === true || v === false) v = v ? 1 : 0;
      if (!Number.isFinite(Number(v))) { errors.push(`${col.name} must be a number.`); continue; }
      v = Number(v);
      if (/unsigned/i.test(col.columnType) && v < 0) { errors.push(`${col.name} cannot be negative.`); continue; }
    } else if (col.type === 'datetime' || col.type === 'timestamp') {
      v = String(v).replace('T', ' ');
      if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(v)) v += ':00';
    } else if (col.options && col.type === 'enum' && !col.options.includes(v)) {
      errors.push(`${col.name} must be one of: ${col.options.join(', ')}.`); continue;
    } else if (col.maxLength && String(v).length > col.maxLength) {
      errors.push(`${col.name} is too long (max ${col.maxLength} characters).`); continue;
    }
    if (/email/i.test(col.name) && typeof v === 'string' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) {
      errors.push(`${col.name} must be a valid email address.`); continue;
    }
    values[col.name] = v;
  }
  return { values, errors };
}

function friendlyDbError(err) {
  const msg = dataError(err);
  if (!msg) return null;
  return err.code === 'ER_DUP_ENTRY' || err.code === 'ER_DATA_TOO_LONG' ? `${msg} ${err.sqlMessage || ''}`.trim() : msg;
}

/* ---------------- protected routes ---------------- */

router.use(requireAdmin);

/* ---------------- dashboard ---------------- */

router.get('/dashboard', wrap(async (req, res) => {
  const [[dbRow]] = await pool.query('SELECT DATABASE() AS db, VERSION() AS version');

  // Order totals come from order_items, so they always match what was sold
  const ORDER_TOTALS = `(SELECT o.id, o.status, o.created_at, o.delivery_fee + COALESCE(SUM(oi.quantity * oi.unit_price), 0) AS total
     FROM orders o LEFT JOIN order_items oi ON oi.order_id = o.id GROUP BY o.id, o.status, o.created_at, o.delivery_fee) t`;

  const [[sales]] = await pool.query(
    `SELECT COALESCE(SUM(t.total), 0) AS revenue,
            COALESCE(SUM(CASE WHEN t.created_at >= DATE_SUB(CURDATE(), INTERVAL 29 DAY) THEN t.total END), 0) AS revenue30,
            COUNT(*) AS orders
     FROM ${ORDER_TOTALS} WHERE t.status <> 'Cancelled'`);
  const [[counts]] = await pool.query(
    `SELECT (SELECT COUNT(*) FROM orders WHERE DATE(created_at) = CURDATE()) AS ordersToday,
            (SELECT COUNT(*) FROM orders WHERE status IN ('Pending','Processing','Ready for Collection')) AS openOrders,
            (SELECT COUNT(*) FROM orders WHERE status = 'Pending') AS pendingOrders,
            (SELECT COUNT(*) FROM users) AS customers,
            (SELECT COUNT(*) FROM products WHERE is_active = 1) AS products,
            (SELECT COUNT(*) FROM products WHERE is_active = 1 AND stock_quantity <= ?) AS lowStock`, [shop.LOW_STOCK_LEVEL]);

  const [daily] = await pool.query(
    `SELECT DATE(t.created_at) AS day, COUNT(*) AS orders, SUM(t.total) AS total
     FROM ${ORDER_TOTALS}
     WHERE t.status <> 'Cancelled' AND t.created_at >= DATE_SUB(CURDATE(), INTERVAL 6 DAY)
     GROUP BY DATE(t.created_at)`);
  // Fill in days with no sales so the chart always shows 7 days
  const sales7 = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86400000).toLocaleDateString('en-CA');
    const row = daily.find(r => r.day === d);
    sales7.push({ day: d, orders: row ? row.orders : 0, total: row ? Number(row.total) : 0 });
  }

  const [lowStock] = await pool.query(
    `SELECT id, name AS label, stock_quantity AS stock FROM products
     WHERE is_active = 1 AND stock_quantity <= ? ORDER BY stock_quantity, name LIMIT 8`, [shop.LOW_STOCK_LEVEL]);
  const [recentOrders] = await pool.query(`${orders.ORDER_SELECT} ORDER BY o.id DESC LIMIT 6`);
  const [recent] = await pool.query(
    'SELECT actor_type, actor_email, action, table_name, record_id, created_at FROM audit_log ORDER BY id DESC LIMIT 8');

  res.json({
    database: dbRow.db, version: dbRow.version, lowStockLevel: shop.LOW_STOCK_LEVEL, paymentMode: mpesa.mode(),
    kpis: { revenue: Number(sales.revenue), revenue30: Number(sales.revenue30), ...counts },
    sales7, lowStock, recentOrders, recent
  });
}));

router.get('/tables', wrap(async (req, res) => {
  const tables = await listTables();
  res.json({ tables });
}));

router.get('/tables/:table/meta', wrap(async (req, res) => {
  const meta = await resolveTable(req.params.table, res);
  if (meta) res.json({ ...meta, labelColumn: labelColumn(meta), canHashPasswords: !!bcrypt });
}));

router.get('/tables/:table/options', wrap(async (req, res) => {
  const meta = await resolveTable(req.params.table, res);
  if (!meta) return;
  const valueCol = req.query.column && meta.columns.some(c => c.name === req.query.column) ? req.query.column : meta.primaryKey;
  if (!valueCol) return res.json({ options: [] });
  const label = labelColumn(meta);
  const [rows] = await pool.query(`SELECT ${q(valueCol)} AS value, ${q(label)} AS label FROM ${q(meta.table)} ORDER BY ${q(label)} LIMIT 1000`);
  res.json({ options: rows });
}));

router.get('/tables/:table/rows', wrap(async (req, res) => {
  const meta = await resolveTable(req.params.table, res);
  if (!meta) return;
  const visible = meta.columns.filter(c => !c.sensitive);
  const search = String(req.query.search || '').trim();
  const sortCol = visible.some(c => c.name === req.query.sort) ? req.query.sort : (meta.primaryKey || visible[0].name);
  const dir = String(req.query.dir).toLowerCase() === 'asc' ? 'ASC' : 'DESC';
  const exportAll = req.query.limit === 'all';
  const limit = exportAll ? 5000 : Math.min(Math.max(parseInt(req.query.limit, 10) || 10, 1), 100);
  const page = Math.max(parseInt(req.query.page, 10) || 1, 1);

  let where = '';
  const params = [];
  if (search) {
    where = 'WHERE ' + visible.map(c => `CAST(${q(c.name)} AS CHAR) LIKE ?`).join(' OR ');
    visible.forEach(() => params.push(`%${search}%`));
  }
  const [[{ total }]] = await pool.query(`SELECT COUNT(*) AS total FROM ${q(meta.table)} ${where}`, params);
  const [rows] = await pool.query(
    `SELECT ${visible.map(c => q(c.name)).join(', ')} FROM ${q(meta.table)} ${where}
     ORDER BY ${q(sortCol)} ${dir} LIMIT ? OFFSET ?`,
    [...params, limit, exportAll ? 0 : (page - 1) * limit]);
  res.json({ rows, total, page, limit, sort: sortCol, dir });
}));

router.get('/tables/:table/rows/:id', wrap(async (req, res) => {
  const meta = await resolveTable(req.params.table, res);
  if (!meta) return;
  if (!meta.primaryKey) return res.status(400).json({ error: 'This table has no primary key, so single records cannot be opened.' });
  const visible = meta.columns.filter(c => !c.sensitive);
  const [rows] = await pool.query(`SELECT ${visible.map(c => q(c.name)).join(', ')} FROM ${q(meta.table)} WHERE ${q(meta.primaryKey)} = ? LIMIT 1`, [req.params.id]);
  if (!rows[0]) return res.status(404).json({ error: 'Record not found. It may have been deleted.' });
  res.json({ row: rows[0] });
}));

router.post('/tables/:table/rows', wrap(async (req, res) => {
  const meta = await resolveTable(req.params.table, res);
  if (!meta) return;
  const { values, errors } = await cleanValues(meta, req.body.data || {}, false);
  if (errors.length) return res.status(400).json({ error: errors.join(' ') });
  if (!Object.keys(values).length) return res.status(400).json({ error: 'Nothing to save.' });
  try {
    const cols = Object.keys(values);
    const [result] = await pool.query(
      `INSERT INTO ${q(meta.table)} (${cols.map(q).join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`,
      cols.map(c => values[c]));
    const id = result.insertId || (meta.primaryKey ? values[meta.primaryKey] : null);
    await audit(req, 'CREATE', meta.table, id, redact(meta, values));
    res.status(201).json({ ok: true, id });
  } catch (err) {
    const msg = friendlyDbError(err);
    if (msg) return res.status(400).json({ error: msg });
    throw err;
  }
}));

router.put('/tables/:table/rows/:id', wrap(async (req, res) => {
  const meta = await resolveTable(req.params.table, res);
  if (!meta) return;
  if (!meta.primaryKey) return res.status(400).json({ error: 'This table has no primary key, so records cannot be edited here.' });
  const { values, errors } = await cleanValues(meta, req.body.data || {}, true);
  delete values[meta.primaryKey];
  if (errors.length) return res.status(400).json({ error: errors.join(' ') });
  if (!Object.keys(values).length) return res.status(400).json({ error: 'No changes to save.' });
  try {
    const cols = Object.keys(values);
    const [result] = await pool.query(
      `UPDATE ${q(meta.table)} SET ${cols.map(c => `${q(c)} = ?`).join(', ')} WHERE ${q(meta.primaryKey)} = ?`,
      [...cols.map(c => values[c]), req.params.id]);
    if (!result.affectedRows) return res.status(404).json({ error: 'Record not found. It may have been deleted.' });
    await audit(req, 'UPDATE', meta.table, req.params.id, redact(meta, values));
    res.json({ ok: true });
  } catch (err) {
    const msg = friendlyDbError(err);
    if (msg) return res.status(400).json({ error: msg });
    throw err;
  }
}));

router.delete('/tables/:table/rows/:id', wrap(async (req, res) => {
  const meta = await resolveTable(req.params.table, res);
  if (!meta) return;
  if (!meta.primaryKey) return res.status(400).json({ error: 'This table has no primary key, so records cannot be deleted here.' });
  try {
    const [result] = await pool.query(`DELETE FROM ${q(meta.table)} WHERE ${q(meta.primaryKey)} = ?`, [req.params.id]);
    if (!result.affectedRows) return res.status(404).json({ error: 'Record not found. It may already be deleted.' });
    await audit(req, 'DELETE', meta.table, req.params.id);
    res.json({ ok: true });
  } catch (err) {
    const msg = friendlyDbError(err);
    if (msg) return res.status(400).json({ error: msg });
    throw err;
  }
}));

function redact(meta, values) {
  const out = {};
  for (const [k, v] of Object.entries(values)) {
    const col = meta.columns.find(c => c.name === k);
    out[k] = col && col.sensitive ? '[hidden]' : v;
  }
  return out;
}


/* ---------------- audit trail ---------------- */

router.get('/audit', wrap(async (req, res) => {
  const search = String(req.query.search || '').trim();
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 20, 1), 200);
  const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
  const where = [];
  const params = [];
  if (search) {
    where.push('(actor_email LIKE ? OR action LIKE ? OR table_name LIKE ? OR record_id LIKE ?)');
    params.push(...Array(4).fill(`%${search}%`));
  }
  if (['admin', 'customer', 'system'].includes(req.query.actor)) {
    where.push('actor_type = ?');
    params.push(req.query.actor);
  }
  const clause = where.length ? 'WHERE ' + where.join(' AND ') : '';
  const [[{ total }]] = await pool.query(`SELECT COUNT(*) AS total FROM audit_log ${clause}`, params);
  const [rows] = await pool.query(
    `SELECT id, actor_type, actor_email, action, table_name, record_id, details, ip_address, created_at
     FROM audit_log ${clause} ORDER BY id DESC LIMIT ? OFFSET ?`, [...params, limit, (page - 1) * limit]);
  res.json({ rows, total, page, limit });
}));

/* ---------------- orders (main transaction) ---------------- */

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const localDate = offsetDays => new Date(Date.now() + offsetDays * 86400000).toLocaleDateString('en-CA');

function dateRange(query, defaultDays = 30) {
  const from = ISO_DATE.test(query.from || '') ? query.from : localDate(-(defaultDays - 1));
  const to = ISO_DATE.test(query.to || '') ? query.to : localDate(0);
  if (from > to) {
    const err = new orders.OrderError('The "From" date must be before the "To" date.');
    throw err;
  }
  return { from, to };
}

const ORDER_STATUSES = Object.keys(shop.ORDER_FLOW);
const PAYMENT_STATUSES = ['Pending', 'Paid', 'Failed', 'Cancelled'];

// Builds the WHERE part shared by the orders list and the orders report
function orderFilters(query, { useDates }) {
  const where = [];
  const params = [];
  if (ORDER_STATUSES.includes(query.status)) { where.push('o.status = ?'); params.push(query.status); }
  if (PAYMENT_STATUSES.includes(query.payment)) { where.push('p.status = ?'); params.push(query.payment); }
  if (shop.PAYMENT_METHODS.includes(query.method)) { where.push('p.method = ?'); params.push(query.method); }
  if (query.search) {
    where.push('(o.order_ref LIKE ? OR u.full_name LIKE ? OR u.email LIKE ? OR o.contact_phone LIKE ?)');
    params.push(...Array(4).fill(`%${String(query.search).trim()}%`));
  }
  let range = null;
  if (useDates || query.from || query.to) {
    range = dateRange(query);
    where.push('DATE(o.created_at) BETWEEN ? AND ?');
    params.push(range.from, range.to);
  }
  return { clause: where.length ? 'WHERE ' + where.join(' AND ') : '', params, range };
}

const ORDER_SORTS = { date: 'o.created_at', ref: 'o.order_ref', customer: 'u.full_name', status: 'o.status', total: 'total', payment: 'p.status' };

router.get('/orders', wrap(async (req, res) => {
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 10, 1), 100);
  const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
  const { clause, params } = orderFilters(req.query, { useDates: false });
  const sort = ORDER_SORTS[req.query.sort] || 'o.created_at';
  const dir = String(req.query.dir).toLowerCase() === 'asc' ? 'ASC' : 'DESC';

  const [[{ total }]] = await pool.query(
    `SELECT COUNT(*) AS total FROM orders o JOIN users u ON u.id = o.user_id
     LEFT JOIN payments p ON p.id = (SELECT MAX(id) FROM payments WHERE order_id = o.id) ${clause}`, params);
  const [rows] = await pool.query(`${orders.ORDER_SELECT} ${clause} ORDER BY ${sort} ${dir}, o.id DESC LIMIT ? OFFSET ?`,
    [...params, limit, (page - 1) * limit]);
  const [statusCounts] = await pool.query('SELECT status, COUNT(*) AS n FROM orders GROUP BY status');
  res.json({ rows, total, page, limit, statusCounts, flow: shop.ORDER_FLOW });
}));

router.get('/orders/:id', wrap(async (req, res) => {
  const order = await orders.findOrder({ id: Number(req.params.id) });
  res.json({ order, next: shop.ORDER_FLOW[order.status] || [], paymentMode: mpesa.mode() });
}));

router.put('/orders/:id/status', wrap(async (req, res) => {
  const id = Number(req.params.id);
  const before = await orders.findOrder({ id });
  const result = await orders.changeStatus(id, String(req.body.status || ''));
  await audit(req, 'ORDER_STATUS', 'orders', before.order_ref, { from: before.status, to: req.body.status });
  res.json({ ok: true, refundDue: !!(result && result.refundDue) });
}));

router.post('/orders/:id/payment/paid', wrap(async (req, res) => {
  const id = Number(req.params.id);
  const receipt = String(req.body.receipt || '').trim().toUpperCase().slice(0, 30) || null;
  if (receipt && !/^[A-Z0-9]{6,30}$/.test(receipt)) return res.status(400).json({ error: 'The receipt number should only contain letters and numbers.' });
  const order = await orders.findOrder({ id });
  await orders.markPaymentPaid(id, receipt);
  await audit(req, 'PAYMENT_CONFIRMED', 'payments', order.order_ref, { receipt });
  res.json({ ok: true });
}));

router.post('/orders/:id/payment/check', wrap(async (req, res) => {
  const result = await orders.refreshPayment(Number(req.params.id));
  res.json({ ok: true, ...result });
}));

/* ---------------- reports ---------------- */

const num = v => Number(v || 0);

router.get('/reports/sales', wrap(async (req, res) => {
  const { from, to } = dateRange(req.query);
  const group = ['day', 'product', 'category', 'method'].includes(req.query.group) ? req.query.group : 'day';
  const paidOnly = req.query.paid === '1';
  const where = `o.status <> 'Cancelled' AND DATE(o.created_at) BETWEEN ? AND ?` +
    (paidOnly ? ` AND EXISTS (SELECT 1 FROM payments px WHERE px.order_id = o.id AND px.status = 'Paid')` : '');
  const params = [from, to];
  let sql;
  if (group === 'day' || group === 'method') {
    const key = group === 'day' ? 'DATE(o.created_at)' : 'p.method';
    sql = `SELECT ${key} AS label, COUNT(*) AS orders, SUM(t.items) AS items, SUM(t.subtotal) AS goods,
                  SUM(o.delivery_fee) AS delivery, SUM(t.subtotal + o.delivery_fee) AS total
           FROM orders o
           JOIN (SELECT order_id, SUM(quantity) AS items, SUM(quantity * unit_price) AS subtotal FROM order_items GROUP BY order_id) t ON t.order_id = o.id
           LEFT JOIN payments p ON p.id = (SELECT MAX(id) FROM payments WHERE order_id = o.id)
           WHERE ${where} GROUP BY ${key}`;
  } else {
    const key = group === 'product' ? 'pr.id, pr.name, c.name' : 'c.id, c.name';
    sql = `SELECT ${group === 'product' ? 'pr.name' : 'c.name'} AS label, ${group === 'product' ? 'c.name AS category,' : ''}
                  COUNT(DISTINCT o.id) AS orders, SUM(oi.quantity) AS items, SUM(oi.quantity * oi.unit_price) AS total
           FROM order_items oi
           JOIN orders o ON o.id = oi.order_id
           JOIN products pr ON pr.id = oi.product_id
           JOIN categories c ON c.id = pr.category_id
           WHERE ${where} GROUP BY ${key}`;
  }
  const sortKeys = { label: 'label', orders: 'orders', items: 'items', total: 'total' };
  const sort = sortKeys[req.query.sort] || (group === 'day' ? 'label' : 'total');
  const dir = String(req.query.dir || (group === 'day' ? 'asc' : 'desc')).toLowerCase() === 'asc' ? 'ASC' : 'DESC';
  const [rows] = await pool.query(`${sql} ORDER BY ${sort} ${dir}`, params);
  const summary = {
    orders: group === 'day' || group === 'method' ? rows.reduce((s, r) => s + num(r.orders), 0) : null,
    items: rows.reduce((s, r) => s + num(r.items), 0),
    total: rows.reduce((s, r) => s + num(r.total), 0)
  };
  res.json({ rows, summary, filters: { from, to, group, paidOnly, sort, dir } });
}));

router.get('/reports/orders', wrap(async (req, res) => {
  const { clause, params, range } = orderFilters(req.query, { useDates: true });
  const sort = ORDER_SORTS[req.query.sort] || 'o.created_at';
  const dir = String(req.query.dir).toLowerCase() === 'asc' ? 'ASC' : 'DESC';
  const [rows] = await pool.query(`${orders.ORDER_SELECT} ${clause} ORDER BY ${sort} ${dir}, o.id DESC LIMIT 2000`, params);
  const active = rows.filter(r => r.status !== 'Cancelled');
  const summary = {
    orders: rows.length,
    cancelled: rows.length - active.length,
    total: active.reduce((s, r) => s + num(r.total), 0),
    paid: active.filter(r => r.payment_status === 'Paid').reduce((s, r) => s + num(r.total), 0)
  };
  res.json({ rows, summary, filters: { ...range, status: req.query.status || '', payment: req.query.payment || '', method: req.query.method || '', sort: req.query.sort || 'date', dir } });
}));

router.get('/reports/inventory', wrap(async (req, res) => {
  const where = ['1 = 1'];
  const params = [];
  if (req.query.category) { where.push('c.slug = ?'); params.push(String(req.query.category)); }
  if (req.query.stock === 'low') { where.push('p.stock_quantity <= ? AND p.stock_quantity > 0'); params.push(shop.LOW_STOCK_LEVEL); }
  if (req.query.stock === 'out') where.push('p.stock_quantity = 0');
  if (req.query.active !== 'all') where.push('p.is_active = 1');
  const sorts = { name: 'p.name', category: 'c.name', price: 'p.price', stock: 'p.stock_quantity', value: 'stock_value', sold: 'sold' };
  const sort = sorts[req.query.sort] || 'p.name';
  const dir = String(req.query.dir).toLowerCase() === 'desc' ? 'DESC' : 'ASC';
  const [rows] = await pool.query(
    `SELECT p.id, p.name, c.name AS category, p.price, p.stock_quantity, p.price * p.stock_quantity AS stock_value,
            COALESCE(s.sold, 0) AS sold,
            CASE WHEN p.stock_quantity = 0 THEN 'Out of stock' WHEN p.stock_quantity <= ? THEN 'Low stock' ELSE 'In stock' END AS stock_status
     FROM products p JOIN categories c ON c.id = p.category_id
     LEFT JOIN (SELECT oi.product_id, SUM(oi.quantity) AS sold FROM order_items oi JOIN orders o ON o.id = oi.order_id
                WHERE o.status <> 'Cancelled' GROUP BY oi.product_id) s ON s.product_id = p.id
     WHERE ${where.join(' AND ')} ORDER BY ${sort} ${dir}`, [shop.LOW_STOCK_LEVEL, ...params]);
  const summary = {
    products: rows.length,
    units: rows.reduce((s, r) => s + num(r.stock_quantity), 0),
    value: rows.reduce((s, r) => s + num(r.stock_value), 0),
    low: rows.filter(r => r.stock_status === 'Low stock').length,
    out: rows.filter(r => r.stock_status === 'Out of stock').length
  };
  res.json({ rows, summary, lowStockLevel: shop.LOW_STOCK_LEVEL, filters: { category: req.query.category || '', stock: req.query.stock || 'all', sort: req.query.sort || 'name', dir } });
}));

router.get('/categories', wrap(async (req, res) => {
  const [rows] = await pool.query('SELECT id, name, slug FROM categories ORDER BY name');
  res.json({ rows });
}));


/* ---------------- admin accounts (super admin only) ---------------- */

router.get('/admins', requireSuperAdmin, wrap(async (req, res) => {
  const [rows] = await pool.query('SELECT id, full_name, email, role, is_active, twofa_enabled, last_login, created_at FROM admins ORDER BY id');
  res.json({ rows });
}));

router.post('/admins', requireSuperAdmin, wrap(async (req, res) => {
  const name = String(req.body.full_name || '').trim();
  const email = String(req.body.email || '').trim().toLowerCase();
  const role = req.body.role === 'super_admin' ? 'super_admin' : 'admin';
  const password = String(req.body.password || '');
  if (!name) return res.status(400).json({ error: 'Full name is required.' });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: 'Enter a valid email address.' });
  if (!strongPassword(password)) return res.status(400).json({ error: 'Password needs at least 8 characters, with letters and numbers.' });
  try {
    const [r] = await pool.query('INSERT INTO admins (full_name, email, password_hash, role) VALUES (?,?,?,?)', [name, email, hashPassword(password), role]);
    await audit(req, 'CREATE_ADMIN', 'admins', r.insertId, { email, role });
    res.status(201).json({ ok: true, id: r.insertId });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') return res.status(400).json({ error: 'An admin with that email already exists.' });
    throw err;
  }
}));

router.put('/admins/:id', requireSuperAdmin, wrap(async (req, res) => {
  const id = Number(req.params.id);
  const updates = {};
  if (req.body.full_name !== undefined) updates.full_name = String(req.body.full_name).trim();
  if (req.body.role !== undefined) updates.role = req.body.role === 'super_admin' ? 'super_admin' : 'admin';
  if (req.body.is_active !== undefined) updates.is_active = req.body.is_active ? 1 : 0;
  if (id === req.admin.id && (updates.is_active === 0 || updates.role === 'admin')) {
    return res.status(400).json({ error: 'You cannot deactivate or demote your own account.' });
  }
  if (!Object.keys(updates).length) return res.status(400).json({ error: 'No changes to save.' });
  const cols = Object.keys(updates);
  await pool.query(`UPDATE admins SET ${cols.map(c => `${q(c)} = ?`).join(', ')} WHERE id = ?`, [...cols.map(c => updates[c]), id]);
  await audit(req, 'UPDATE_ADMIN', 'admins', id, updates);
  res.json({ ok: true });
}));

router.post('/admins/:id/reset-password', requireSuperAdmin, wrap(async (req, res) => {
  const password = String(req.body.password || '');
  if (!strongPassword(password)) return res.status(400).json({ error: 'Password needs at least 8 characters, with letters and numbers.' });
  const [r] = await pool.query('UPDATE admins SET password_hash = ? WHERE id = ?', [hashPassword(password), req.params.id]);
  if (!r.affectedRows) return res.status(404).json({ error: 'Admin not found.' });
  await audit(req, 'RESET_ADMIN_PASSWORD', 'admins', req.params.id);
  res.json({ ok: true });
}));

// For an admin who lost the phone with their authenticator app: they go back to emailed codes
router.post('/admins/:id/reset-2fa', requireSuperAdmin, wrap(async (req, res) => {
  const [r] = await pool.query('UPDATE admins SET twofa_secret = NULL, twofa_enabled = 0 WHERE id = ?', [req.params.id]);
  if (!r.affectedRows) return res.status(404).json({ error: 'Admin not found.' });
  await audit(req, 'RESET_ADMIN_2FA', 'admins', req.params.id);
  res.json({ ok: true });
}));

router.delete('/admins/:id', requireSuperAdmin, wrap(async (req, res) => {
  if (Number(req.params.id) === req.admin.id) return res.status(400).json({ error: 'You cannot delete your own account.' });
  const [r] = await pool.query('DELETE FROM admins WHERE id = ?', [req.params.id]);
  if (!r.affectedRows) return res.status(404).json({ error: 'Admin not found.' });
  await audit(req, 'DELETE_ADMIN', 'admins', req.params.id);
  res.json({ ok: true });
}));


/* ---------------- errors ---------------- */

/* ---------------- restocking: purchase orders to suppliers ---------------- */

router.get('/purchase-orders', wrap(async (req, res) => {
  res.json(await purchases.list({ status: req.query.status, search: String(req.query.search || '').trim() }));
}));

// Products at or below the low stock level, with a suggested quantity to order
router.get('/purchase-orders/suggestions', wrap(async (req, res) => {
  res.json({ rows: await purchases.suggestions(), lowStockLevel: shop.LOW_STOCK_LEVEL });
}));

// What the "new purchase order" form needs: active suppliers and every product
router.get('/purchase-orders/options', wrap(async (req, res) => {
  const [suppliers] = await pool.query('SELECT id, name, contact_person, phone, email FROM suppliers WHERE is_active = 1 ORDER BY name');
  const [products] = await pool.query(
    `SELECT p.id, p.name, c.name AS category_name, p.stock_quantity, p.price, p.is_active
     FROM products p JOIN categories c ON c.id = p.category_id ORDER BY p.name`);
  res.json({ suppliers, products: products.map(p => ({ ...p, price: Number(p.price) })) });
}));

router.get('/purchase-orders/:id', wrap(async (req, res) => {
  res.json(await purchases.find(req.params.id));
}));

router.post('/purchase-orders', wrap(async (req, res) => {
  const result = await purchases.create(req.body || {}, req.admin.id);
  await audit(req, 'PURCHASE_ORDER_CREATED', 'purchase_orders', result.id, { po_ref: result.po_ref, supplier_id: req.body.supplier_id, lines: (req.body.items || []).length });
  res.status(201).json({ ok: true, ...result, message: `Purchase order ${result.po_ref} saved. Mark it as received when the goods arrive.` });
}));

router.post('/purchase-orders/:id/receive', wrap(async (req, res) => {
  const result = await purchases.receive(req.params.id, req.admin.id);
  await audit(req, 'PURCHASE_ORDER_RECEIVED', 'purchase_orders', req.params.id, { po_ref: result.po_ref, stock_added: result.added });
  const units = result.added.reduce((t, a) => t + a.added, 0);
  res.json({ ok: true, message: `${result.po_ref} received. ${units} units were added to stock.` });
}));

router.post('/purchase-orders/:id/cancel', wrap(async (req, res) => {
  const result = await purchases.cancel(req.params.id);
  await audit(req, 'PURCHASE_ORDER_CANCELLED', 'purchase_orders', req.params.id, { po_ref: result.po_ref });
  res.json({ ok: true, message: `${result.po_ref} cancelled. Stock was not changed.` });
}));

router.use((err, req, res, next) => {
  if (err instanceof orders.OrderError) return res.status(err.status).json({ error: err.message });
  const friendly = friendlyDbError(err);
  if (friendly) return res.status(400).json({ error: friendly });
  console.error('[admin]', err);
  res.status(500).json({ error: 'Something went wrong on the server. Please try again.' });
});

module.exports = router;
