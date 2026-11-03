// routes/admin.js
// Admin panel API for CampusStationery.
//
// Mount it in your server file (server.js / app.js):
//   const path = require('path');
//   app.use('/api/admin', require('./routes/admin'));
//   app.use('/admin', express.static(path.join(__dirname, 'admin')));
//
// What it does:
//   * Admin login with hashed passwords (scrypt), signed session tokens and lockout after 5 failed tries
//   * Two access levels: super_admin and admin
//   * Reads the live MySQL schema, so every table in the database can be browsed, searched,
//     sorted, added to, edited and deleted from, with foreign keys shown as dropdowns
//   * Every change is written to an audit trail (admin_audit_log)
//   * All values go through prepared statements; table and column names are checked
//     against INFORMATION_SCHEMA before use, which blocks SQL injection

const express = require('express');
const crypto = require('crypto');
const pool = require('../config/adminDb');

const router = express.Router();
router.use(express.json({ limit: '1mb' }));

const SECRET = process.env.ADMIN_SECRET || crypto.randomBytes(32).toString('hex');
const TOKEN_HOURS = 8;
const MAX_FAILED_LOGINS = 5;
const LOCK_MINUTES = 5;
const INTERNAL_TABLES = ['admins', 'admin_audit_log'];
const SENSITIVE_COLUMN = /pass(word)?|hash|salt|token|secret|otp/i;
const DEFAULT_ADMIN = { name: 'System Administrator', email: 'admin@campusstationery.com', password: 'Admin@123' };

// Customer passwords are hashed with bcrypt if the main app uses it
let bcrypt = null;
try { bcrypt = require('bcrypt'); } catch (e) { try { bcrypt = require('bcryptjs'); } catch (e2) { bcrypt = null; } }

/* ---------------- helpers ---------------- */

const wrap = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const q = name => '`' + String(name).replace(/`/g, '``') + '`';

function hashPassword(plain) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(plain, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(plain, stored) {
  const [salt, hash] = String(stored || '').split(':');
  if (!salt || !hash) return false;
  const test = crypto.scryptSync(plain, salt, 64);
  const known = Buffer.from(hash, 'hex');
  return known.length === test.length && crypto.timingSafeEqual(known, test);
}

function strongPassword(pw) {
  return typeof pw === 'string' && pw.length >= 8 && /[A-Za-z]/.test(pw) && /\d/.test(pw);
}

function signToken(payload) {
  const body = Buffer.from(JSON.stringify({ ...payload, exp: Date.now() + TOKEN_HOURS * 3600 * 1000 })).toString('base64url');
  const sig = crypto.createHmac('sha256', SECRET).update(body).digest('base64url');
  return `${body}.${sig}`;
}

function readToken(token) {
  try {
    const [body, sig] = String(token || '').split('.');
    if (!body || !sig) return null;
    const expected = crypto.createHmac('sha256', SECRET).update(body).digest('base64url');
    if (sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
    const data = JSON.parse(Buffer.from(body, 'base64url').toString());
    return data.exp > Date.now() ? data : null;
  } catch (e) {
    return null;
  }
}

function clientIp(req) {
  return (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').toString().split(',')[0].trim();
}

async function audit(req, action, tableName = null, recordId = null, details = null) {
  try {
    await pool.query(
      'INSERT INTO admin_audit_log (admin_id, admin_email, action, table_name, record_id, details, ip_address) VALUES (?,?,?,?,?,?,?)',
      [req.admin ? req.admin.id : null, req.admin ? req.admin.email : (req.body && req.body.email) || null,
        action, tableName, recordId == null ? null : String(recordId),
        details ? JSON.stringify(details).slice(0, 4000) : null, clientIp(req)]
    );
  } catch (e) {
    console.error('Audit log write failed:', e.message);
  }
}

/* ---------------- first run setup ---------------- */

let setupPromise = null;
function ensureSetup() {
  if (!setupPromise) {
    setupPromise = (async () => {
      await pool.query(`CREATE TABLE IF NOT EXISTS admins (
        id INT AUTO_INCREMENT PRIMARY KEY,
        full_name VARCHAR(100) NOT NULL,
        email VARCHAR(150) NOT NULL UNIQUE,
        password_hash VARCHAR(255) NOT NULL,
        role ENUM('super_admin','admin') NOT NULL DEFAULT 'admin',
        is_active TINYINT(1) NOT NULL DEFAULT 1,
        last_login DATETIME NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB`);
      await pool.query(`CREATE TABLE IF NOT EXISTS admin_audit_log (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        admin_id INT NULL,
        admin_email VARCHAR(150) NULL,
        action VARCHAR(50) NOT NULL,
        table_name VARCHAR(64) NULL,
        record_id VARCHAR(64) NULL,
        details TEXT NULL,
        ip_address VARCHAR(64) NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_audit_created (created_at)
      ) ENGINE=InnoDB`);
      const [[{ n }]] = await pool.query('SELECT COUNT(*) AS n FROM admins');
      if (n === 0) {
        await pool.query('INSERT INTO admins (full_name, email, password_hash, role) VALUES (?,?,?,?)',
          [DEFAULT_ADMIN.name, DEFAULT_ADMIN.email, hashPassword(DEFAULT_ADMIN.password), 'super_admin']);
        console.log(`[admin] Default super admin created: ${DEFAULT_ADMIN.email} / ${DEFAULT_ADMIN.password} (change it after first login)`);
      }
    })().catch(err => { setupPromise = null; throw err; });
  }
  return setupPromise;
}

router.use(wrap(async (req, res, next) => {
  try {
    await ensureSetup();
  } catch (err) {
    return res.status(503).json({ error: 'Cannot reach the database. Check config/adminDb.js and that MySQL is running. (' + err.message + ')' });
  }
  next();
}));

/* ---------------- auth ---------------- */

function requireAdmin(req, res, next) {
  const data = readToken((req.headers.authorization || '').replace(/^Bearer\s+/i, ''));
  if (!data) return res.status(401).json({ error: 'Your session has expired. Please log in again.' });
  req.admin = data;
  next();
}

function requireSuperAdmin(req, res, next) {
  if (req.admin.role !== 'super_admin') return res.status(403).json({ error: 'Only a super admin can do this.' });
  next();
}

const failedLogins = new Map();

router.get('/status', wrap(async (req, res) => {
  const [[row]] = await pool.query('SELECT DATABASE() AS db');
  res.json({ ok: true, database: row.db });
}));

router.post('/login', wrap(async (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  const password = String(req.body.password || '');
  if (!email || !password) return res.status(400).json({ error: 'Enter both your email and password.' });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: 'That email address does not look valid.' });

  const record = failedLogins.get(email);
  if (record && record.lockedUntil > Date.now()) {
    const mins = Math.ceil((record.lockedUntil - Date.now()) / 60000);
    return res.status(429).json({ error: `Too many failed attempts. Try again in ${mins} minute(s).` });
  }

  const [rows] = await pool.query('SELECT * FROM admins WHERE email = ? LIMIT 1', [email]);
  const admin = rows[0];
  if (!admin || !verifyPassword(password, admin.password_hash)) {
    const count = (record && record.lockedUntil <= Date.now() && record.count >= MAX_FAILED_LOGINS ? 0 : (record ? record.count : 0)) + 1;
    failedLogins.set(email, { count, lockedUntil: count >= MAX_FAILED_LOGINS ? Date.now() + LOCK_MINUTES * 60000 : 0 });
    await audit(req, 'LOGIN_FAILED', 'admins', admin ? admin.id : null, { attempts: count });
    const left = MAX_FAILED_LOGINS - count;
    return res.status(401).json({ error: left > 0 ? `Wrong email or password. ${left} attempt(s) left.` : `Account locked for ${LOCK_MINUTES} minutes.` });
  }
  if (!admin.is_active) return res.status(403).json({ error: 'This admin account has been deactivated.' });

  failedLogins.delete(email);
  await pool.query('UPDATE admins SET last_login = NOW() WHERE id = ?', [admin.id]);
  req.admin = { id: admin.id, email: admin.email, name: admin.full_name, role: admin.role };
  await audit(req, 'LOGIN', 'admins', admin.id);
  res.json({ token: signToken(req.admin), admin: req.admin, usingDefaultPassword: verifyPassword(DEFAULT_ADMIN.password, admin.password_hash) });
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
      if (!bcrypt) { errors.push('Install bcrypt or bcryptjs (npm install bcryptjs) so customer passwords can be hashed.'); continue; }
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
  switch (err.code) {
    case 'ER_DUP_ENTRY': return 'A record with that value already exists. ' + (err.sqlMessage || '');
    case 'ER_ROW_IS_REFERENCED_2':
    case 'ER_ROW_IS_REFERENCED': return 'This record is linked to other records (for example orders), so it cannot be deleted. Remove or update those first.';
    case 'ER_NO_REFERENCED_ROW_2':
    case 'ER_NO_REFERENCED_ROW': return 'One of the linked records you picked does not exist.';
    case 'ER_TRUNCATED_WRONG_VALUE':
    case 'ER_TRUNCATED_WRONG_VALUE_FOR_FIELD': return 'One of the values has the wrong format. ' + (err.sqlMessage || '');
    case 'ER_BAD_NULL_ERROR': return 'A required field is empty. ' + (err.sqlMessage || '');
    case 'ER_DATA_TOO_LONG': return 'One of the values is too long. ' + (err.sqlMessage || '');
    default: return null;
  }
}

/* ---------------- protected routes ---------------- */

router.use(requireAdmin);

router.get('/dashboard', wrap(async (req, res) => {
  const tables = await listTables();
  const counts = [];
  for (const t of tables) {
    const [[{ n }]] = await pool.query(`SELECT COUNT(*) AS n FROM ${q(t)}`);
    counts.push({ table: t, count: n });
  }

  // Low stock: find a product table that has a stock or quantity column
  let lowStock = null;
  const productTable = tables.find(t => /product|item|stock|inventory/i.test(t));
  if (productTable) {
    const meta = await describeTable(productTable);
    const stockCol = meta.columns.find(c => /stock|quantity|qty/i.test(c.name) && NUMERIC.includes(c.type));
    if (stockCol) {
      const label = labelColumn(meta);
      const [rows] = await pool.query(
        `SELECT ${q(meta.primaryKey || label)} AS id, ${q(label)} AS label, ${q(stockCol.name)} AS stock
         FROM ${q(productTable)} WHERE ${q(stockCol.name)} <= 10 ORDER BY ${q(stockCol.name)} ASC LIMIT 8`);
      lowStock = { table: productTable, column: stockCol.name, rows };
    }
  }

  // Sales total: find an orders table with a total or amount column
  let sales = null;
  const orderTable = tables.find(t => /^orders?$/i.test(t)) || tables.find(t => /order|sale|payment/i.test(t) && !/item|detail|line/i.test(t));
  if (orderTable) {
    const meta = await describeTable(orderTable);
    const amountCol = meta.columns.find(c => /total|amount|grand/i.test(c.name) && NUMERIC.includes(c.type));
    if (amountCol) {
      const [[row]] = await pool.query(`SELECT COALESCE(SUM(${q(amountCol.name)}),0) AS total, COUNT(*) AS orders FROM ${q(orderTable)}`);
      sales = { table: orderTable, column: amountCol.name, total: Number(row.total), orders: row.orders };
    }
  }

  const [recent] = await pool.query('SELECT admin_email, action, table_name, record_id, created_at FROM admin_audit_log ORDER BY id DESC LIMIT 8');
  const [[dbRow]] = await pool.query('SELECT DATABASE() AS db, VERSION() AS version');
  res.json({ database: dbRow.db, version: dbRow.version, counts, lowStock, sales, recent });
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
  const where = search ? 'WHERE admin_email LIKE ? OR action LIKE ? OR table_name LIKE ? OR record_id LIKE ?' : '';
  const params = search ? Array(4).fill(`%${search}%`) : [];
  const [[{ total }]] = await pool.query(`SELECT COUNT(*) AS total FROM admin_audit_log ${where}`, params);
  const [rows] = await pool.query(
    `SELECT id, admin_email, action, table_name, record_id, details, ip_address, created_at
     FROM admin_audit_log ${where} ORDER BY id DESC LIMIT ? OFFSET ?`, [...params, limit, (page - 1) * limit]);
  res.json({ rows, total, page, limit });
}));

/* ---------------- admin accounts (super admin only) ---------------- */

router.get('/admins', requireSuperAdmin, wrap(async (req, res) => {
  const [rows] = await pool.query('SELECT id, full_name, email, role, is_active, last_login, created_at FROM admins ORDER BY id');
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

router.delete('/admins/:id', requireSuperAdmin, wrap(async (req, res) => {
  if (Number(req.params.id) === req.admin.id) return res.status(400).json({ error: 'You cannot delete your own account.' });
  const [r] = await pool.query('DELETE FROM admins WHERE id = ?', [req.params.id]);
  if (!r.affectedRows) return res.status(404).json({ error: 'Admin not found.' });
  await audit(req, 'DELETE_ADMIN', 'admins', req.params.id);
  res.json({ ok: true });
}));

/* ---------------- errors ---------------- */

router.use((err, req, res, next) => {
  console.error('[admin]', err);
  res.status(500).json({ error: 'Something went wrong on the server. ' + (err.sqlMessage || err.message || '') });
});

module.exports = router;
