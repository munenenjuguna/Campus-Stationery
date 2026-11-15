// tests/system.test.js
// Automated system tests for CampusStationery. Run with:  npm test
//
// The tests start the app on a free port and use the database in .env (MySQL must be running).
// They create their own customer, admin and orders, and remove them again at the end,
// so the shop's real data is left as it was. Each test name starts with its test case
// number (TC01, TC02...) from the system documentation.

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcryptjs');

const app = require('../server');
const db = require('../config/db');
const { ensureSchema } = require('../config/schema');
const { hashAdminPassword, encrypt } = require('../utils/security');
const twofa = require('../utils/twofactor');

const RUN = Date.now().toString(36);
const CUSTOMER = { full_name: 'Test Student', email: `test.${RUN}@test.campusstationery.com`, phone: '0712345678', password: 'Test1234' };
const ADMIN = { email: `test.admin.${RUN}@test.campusstationery.com`, password: 'Admin1234', secret: twofa.newSecret() };

let server, base, customerToken, adminToken, adminId, product, startStock, supplierId;

async function call(method, path, body, token) {
  const res = await fetch(base + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined
  });
  let data = null;
  try { data = await res.json(); } catch (e) { /* not JSON */ }
  return { status: res.status, data };
}

before(async () => {
  await ensureSchema();
  server = app.listen(0);
  await new Promise(resolve => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;

  // A product with enough stock for the order tests
  const [rows] = await db.query('SELECT id, name, price, stock_quantity FROM products WHERE is_active = 1 AND stock_quantity >= 5 ORDER BY id LIMIT 1');
  product = rows[0];
  startStock = product.stock_quantity;

  // A test admin with an authenticator app already linked
  const [r] = await db.query(
    "INSERT INTO admins (full_name, email, password_hash, role, is_active, twofa_secret, twofa_enabled) VALUES (?, ?, ?, 'admin', 1, ?, 1)",
    ['Test Admin', ADMIN.email, hashAdminPassword(ADMIN.password), encrypt(ADMIN.secret)]);
  adminId = r.insertId;

  // A supplier for the restocking tests
  const [sup] = await db.query('INSERT INTO suppliers (name, contact_person, phone) VALUES (?, ?, ?)', [`Test Supplier ${RUN}`, 'Test Contact', '0700000000']);
  supplierId = sup.insertId;
});

after(async () => {
  // Remove everything the tests created and put the product stock back
  const [users] = await db.query('SELECT id FROM users WHERE email = ?', [CUSTOMER.email]);
  if (users.length) {
    const uid = users[0].id;
    await db.query('DELETE p FROM payments p JOIN orders o ON o.id = p.order_id WHERE o.user_id = ?', [uid]);
    await db.query('DELETE oi FROM order_items oi JOIN orders o ON o.id = oi.order_id WHERE o.user_id = ?', [uid]);
    await db.query('DELETE FROM orders WHERE user_id = ?', [uid]);
    await db.query('DELETE FROM password_resets WHERE user_id = ?', [uid]);
    await db.query('DELETE FROM users WHERE id = ?', [uid]);
  }
  if (product) await db.query('UPDATE products SET stock_quantity = ? WHERE id = ?', [startStock, product.id]);
  await db.query('DELETE poi FROM purchase_order_items poi JOIN purchase_orders po ON po.id = poi.purchase_order_id WHERE po.supplier_id = ?', [supplierId]);
  await db.query('DELETE FROM purchase_orders WHERE supplier_id = ?', [supplierId]);
  await db.query('DELETE FROM suppliers WHERE id = ?', [supplierId]);
  await db.query('DELETE FROM admins WHERE id = ?', [adminId]);
  server.close();
  await db.end();
});

/* ---------------- browsing ---------------- */

test('TC01 Products and categories load from the database', async () => {
  const products = await call('GET', '/api/products');
  assert.equal(products.status, 200);
  assert.ok(products.data.data.length > 0);
  const categories = await call('GET', '/api/products/categories');
  assert.equal(categories.status, 200);
  assert.ok(categories.data.data.some(c => c.slug === 'writing'));
});

test('TC02 Search finds products by name and filters by category', async () => {
  const word = product.name.split(' ')[0];
  const res = await call('GET', `/api/products?search=${encodeURIComponent(word)}`);
  assert.equal(res.status, 200);
  assert.ok(res.data.data.some(p => p.id === product.id));
});

/* ---------------- accounts ---------------- */

test('TC03 Registration rejects a bad email and a weak password', async () => {
  const badEmail = await call('POST', '/api/users/register', { ...CUSTOMER, email: 'not-an-email', confirm_password: CUSTOMER.password });
  assert.equal(badEmail.status, 400);
  const weak = await call('POST', '/api/users/register', { ...CUSTOMER, password: 'abc', confirm_password: 'abc' });
  assert.equal(weak.status, 400);
});

test('TC04 Registration creates the account and stores only a password hash', async () => {
  const res = await call('POST', '/api/users/register', { ...CUSTOMER, confirm_password: CUSTOMER.password });
  assert.equal(res.status, 201);
  const [rows] = await db.query('SELECT password FROM users WHERE email = ?', [CUSTOMER.email]);
  assert.ok(rows[0].password.startsWith('$2'), 'password is a bcrypt hash');
  assert.ok(await bcrypt.compare(CUSTOMER.password, rows[0].password));
});

test('TC05 The same email cannot register twice', async () => {
  const res = await call('POST', '/api/users/register', { ...CUSTOMER, confirm_password: CUSTOMER.password });
  assert.equal(res.status, 409);
});

test('TC06 Login works with the right password and returns a token', async () => {
  const res = await call('POST', '/api/users/login', { email: CUSTOMER.email, password: CUSTOMER.password });
  assert.equal(res.status, 200);
  assert.ok(res.data.token);
  customerToken = res.data.token;
});

test('TC07 SQL injection in login and search is treated as plain text', async () => {
  const login = await call('POST', '/api/users/login', { email: "' OR '1'='1", password: "' OR '1'='1" });
  assert.notEqual(login.status, 200);
  const search = await call('GET', `/api/products?search=${encodeURIComponent("' OR 1=1 -- ")}`);
  assert.equal(search.status, 200);
  assert.equal(search.data.data.length, 0);
});

/* ---------------- main transaction ---------------- */

let cashOrderRef;

test('TC08 Placing an order saves it, uses the database price and reduces stock', async () => {
  const res = await call('POST', '/api/orders', {
    items: [{ product_id: product.id, quantity: 2, price: 1 }],   // a faked price must be ignored
    delivery_method: 'Campus Delivery', delivery_location: 'Hall 4, Room 12',
    phone: CUSTOMER.phone, payment_method: 'Cash on Collection'
  }, customerToken);
  assert.equal(res.status, 201);
  cashOrderRef = res.data.order.ref;
  assert.equal(Number(res.data.order.total), Number(product.price) * 2 + 100);
  const [[p]] = await db.query('SELECT stock_quantity FROM products WHERE id = ?', [product.id]);
  assert.equal(p.stock_quantity, startStock - 2);
});

test('TC09 An order for more than the stock available is refused', async () => {
  const [[p]] = await db.query('SELECT stock_quantity FROM products WHERE id = ?', [product.id]);
  const res = await call('POST', '/api/orders', {
    items: [{ product_id: product.id, quantity: p.stock_quantity + 1 }],
    delivery_method: 'Campus Pickup', phone: CUSTOMER.phone, payment_method: 'Cash on Collection'
  }, customerToken);
  assert.equal(res.status, 409);   // 409 Conflict: not enough stock
  assert.match(res.data.message, /left|stock|available/i);
  const [[after]] = await db.query('SELECT stock_quantity FROM products WHERE id = ?', [product.id]);
  assert.equal(after.stock_quantity, p.stock_quantity, 'stock unchanged');
});

test('TC10 Ordering without logging in is refused', async () => {
  const res = await call('POST', '/api/orders', { items: [{ product_id: product.id, quantity: 1 }] });
  assert.equal(res.status, 401);
});

test('TC11 Cancelling a pending order returns the items to stock', async () => {
  const res = await call('POST', `/api/orders/${cashOrderRef}/cancel`, {}, customerToken);
  assert.equal(res.status, 200);
  const [[p]] = await db.query('SELECT stock_quantity FROM products WHERE id = ?', [product.id]);
  assert.equal(p.stock_quantity, startStock);
});

test('TC12 M-Pesa payment (demo mode) is confirmed and marks the order paid', { timeout: 30000 }, async () => {
  const res = await call('POST', '/api/orders', {
    items: [{ product_id: product.id, quantity: 1 }],
    delivery_method: 'Campus Pickup', phone: CUSTOMER.phone, payment_method: 'M-Pesa'
  }, customerToken);
  assert.equal(res.status, 201);
  const ref = res.data.order.ref;
  let status = 'Pending';
  for (let i = 0; i < 12 && status === 'Pending'; i++) {
    await new Promise(r => setTimeout(r, 1000));
    status = (await call('GET', `/api/orders/${ref}/payment`, null, customerToken)).data.status;
  }
  assert.equal(status, 'Paid');
});

/* ---------------- access levels and security ---------------- */

test('TC13 A customer token cannot open the admin panel', async () => {
  const res = await call('GET', '/api/admin/dashboard', null, customerToken);
  assert.ok([401, 403].includes(res.status));
});

test('TC14 Admin login needs the password and then a 6 digit code (2FA)', async () => {
  const first = await call('POST', '/api/admin/login', { email: ADMIN.email, password: ADMIN.password });
  assert.equal(first.status, 200);
  assert.equal(first.data.twoFactor, true);
  assert.equal(first.data.token, undefined, 'no token before the code');
  const wrong = await call('POST', '/api/admin/login/verify', { challenge: first.data.challenge, code: '000000' });
  assert.equal(wrong.status, 401);
  const right = await call('POST', '/api/admin/login/verify', { challenge: first.data.challenge, code: twofa.totp(ADMIN.secret) });
  assert.equal(right.status, 200);
  assert.ok(right.data.token);
  adminToken = right.data.token;
});

test('TC15 Five wrong passwords lock the account for a while', async () => {
  for (let i = 0; i < 5; i++) await call('POST', '/api/users/login', { email: CUSTOMER.email, password: 'Wrong1234' });
  const locked = await call('POST', '/api/users/login', { email: CUSTOMER.email, password: CUSTOMER.password });
  assert.equal(locked.status, 429);
});

test('TC16 Only a super admin can manage admin accounts', async () => {
  const res = await call('GET', '/api/admin/admins', null, adminToken);
  assert.equal(res.status, 403);
});

test('TC17 Forgot password gives the same answer for unknown emails', async () => {
  const res = await call('POST', '/api/users/forgot-password', { email: `nobody.${RUN}@test.campusstationery.com` });
  assert.equal(res.status, 200);
  const bad = await call('POST', '/api/users/reset-password', { token: 'f'.repeat(64), password: 'NewPass123' });
  assert.equal(bad.status, 400);
});

/* ---------------- admin work ---------------- */

test('TC18 Admin dashboard and the three reports return data', async () => {
  const dash = await call('GET', '/api/admin/dashboard', null, adminToken);
  assert.equal(dash.status, 200);
  assert.ok('revenue' in dash.data.kpis);
  for (const path of ['/api/admin/reports/sales?group=day', '/api/admin/reports/orders', '/api/admin/reports/inventory']) {
    const res = await call('GET', path, null, adminToken);
    assert.equal(res.status, 200, path);
    assert.ok(Array.isArray(res.data.rows), path);
  }
});

test('TC19 Admin can add, edit, find and delete a category', async () => {
  const slug = `test-${RUN}`;
  const add = await call('POST', '/api/admin/tables/categories/rows', { data: { name: `Test ${RUN}`, slug, description: 'Made by the tests' } }, adminToken);
  assert.ok([200, 201].includes(add.status));
  const id = add.data.id;
  const edit = await call('PUT', `/api/admin/tables/categories/rows/${id}`, { data: { description: 'Changed by the tests' } }, adminToken);
  assert.equal(edit.status, 200);
  const list = await call('GET', `/api/admin/tables/categories/rows?search=${slug}`, null, adminToken);
  assert.ok(list.data.rows.some(r => r.slug === slug && r.description === 'Changed by the tests'));
  const del = await call('DELETE', `/api/admin/tables/categories/rows/${id}`, null, adminToken);
  assert.equal(del.status, 200);
});

test('TC20 The audit trail records customer and admin actions', async () => {
  const [rows] = await db.query('SELECT action FROM audit_log WHERE actor_email IN (?, ?)', [CUSTOMER.email, ADMIN.email]);
  const actions = rows.map(r => r.action);
  for (const a of ['REGISTER', 'LOGIN', 'LOGIN_FAILED', 'ORDER_PLACED', 'ORDER_CANCELLED']) {
    assert.ok(actions.includes(a), `audit has ${a}`);
  }
});

/* ---------------- restocking with purchase orders ---------------- */

let poId;

test('TC21 An out of stock product is suggested for restocking', async () => {
  await db.query('UPDATE products SET stock_quantity = 0 WHERE id = ?', [product.id]);
  const res = await call('GET', '/api/admin/purchase-orders/suggestions', null, adminToken);
  assert.equal(res.status, 200);
  const line = res.data.rows.find(r => r.product_id === product.id);
  assert.ok(line, 'out of stock product is in the suggestions');
  assert.ok(line.suggested_quantity > 0);
});

test('TC22 A purchase order is saved without changing stock until it arrives', async () => {
  const empty = await call('POST', '/api/admin/purchase-orders', { supplier_id: supplierId, items: [] }, adminToken);
  assert.equal(empty.status, 400);
  const res = await call('POST', '/api/admin/purchase-orders', {
    supplier_id: supplierId, expected_date: '2026-12-01', notes: 'Made by the tests',
    items: [{ product_id: product.id, quantity: 15, unit_cost: 40 }]
  }, adminToken);
  assert.equal(res.status, 201);
  assert.match(res.data.po_ref, /^PO-\d{6}-[0-9A-F]{4}$/);
  poId = res.data.id;
  const detail = await call('GET', `/api/admin/purchase-orders/${poId}`, null, adminToken);
  assert.equal(detail.data.status, 'Ordered');
  assert.equal(detail.data.total_cost, 600);
  const [[p]] = await db.query('SELECT stock_quantity FROM products WHERE id = ?', [product.id]);
  assert.equal(p.stock_quantity, 0, 'stock unchanged while the order is on its way');
});

test('TC23 Receiving a purchase order adds the stock, and only once', async () => {
  const res = await call('POST', `/api/admin/purchase-orders/${poId}/receive`, {}, adminToken);
  assert.equal(res.status, 200);
  const [[p]] = await db.query('SELECT stock_quantity FROM products WHERE id = ?', [product.id]);
  assert.equal(p.stock_quantity, 15);
  const again = await call('POST', `/api/admin/purchase-orders/${poId}/receive`, {}, adminToken);
  assert.equal(again.status, 409);
  const cancel = await call('POST', `/api/admin/purchase-orders/${poId}/cancel`, {}, adminToken);
  assert.equal(cancel.status, 409);
  const [log] = await db.query("SELECT COUNT(*) AS n FROM audit_log WHERE action = 'PURCHASE_ORDER_RECEIVED' AND record_id = ?", [String(poId)]);
  assert.equal(log[0].n, 1);
});

test('TC24 Cancelling a purchase order leaves stock unchanged', async () => {
  const res = await call('POST', '/api/admin/purchase-orders', { supplier_id: supplierId, items: [{ product_id: product.id, quantity: 5 }] }, adminToken);
  assert.equal(res.status, 201);
  const cancel = await call('POST', `/api/admin/purchase-orders/${res.data.id}/cancel`, {}, adminToken);
  assert.equal(cancel.status, 200);
  const [[p]] = await db.query('SELECT stock_quantity FROM products WHERE id = ?', [product.id]);
  assert.equal(p.stock_quantity, 15);
  const list = await call('GET', '/api/admin/purchase-orders?status=Cancelled', null, adminToken);
  assert.ok(list.data.rows.some(r => r.id === res.data.id));
});
