// services/purchaseService.js
// Restocking: purchase orders that the shop sends to its suppliers.
//
//   Ordered   -> the order has been sent to the supplier; stock is not changed yet
//   Received  -> the goods arrived; every line is added to the product's stock in ONE
//                database transaction, so stock can never be half updated
//   Cancelled -> the supplier order was called off; stock is not changed
//
// Like customer orders, the totals are worked out from the lines and never stored.

const crypto = require('crypto');
const db = require('../config/db');
const shop = require('../config/shop');
const { OrderError } = require('./orderService');

const MAX_LINES = 100;
const MAX_QUANTITY = 10000;

// One row per purchase order, with the supplier, the people involved and the totals
const PO_SELECT = `
  SELECT po.id, po.po_ref, po.status, po.expected_date, po.notes, po.created_at, po.received_at,
         s.id AS supplier_id, s.name AS supplier_name, s.contact_person, s.phone AS supplier_phone, s.email AS supplier_email,
         ca.full_name AS created_by_name, ra.full_name AS received_by_name,
         COALESCE(t.item_lines, 0) AS line_count, COALESCE(t.units, 0) AS units, COALESCE(t.total_cost, 0) AS total_cost
  FROM purchase_orders po
  JOIN suppliers s ON s.id = po.supplier_id
  LEFT JOIN admins ca ON ca.id = po.created_by
  LEFT JOIN admins ra ON ra.id = po.received_by
  LEFT JOIN (
    SELECT purchase_order_id, COUNT(*) AS item_lines, SUM(quantity) AS units, SUM(quantity * unit_cost) AS total_cost
    FROM purchase_order_items GROUP BY purchase_order_id
  ) t ON t.purchase_order_id = po.id`;

async function uniqueRef(conn) {
  const d = new Date();
  const datePart = `${String(d.getFullYear()).slice(2)}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  for (let i = 0; i < 5; i++) {
    const ref = `PO-${datePart}-${crypto.randomBytes(2).toString('hex').toUpperCase()}`;
    const [rows] = await conn.query('SELECT id FROM purchase_orders WHERE po_ref = ?', [ref]);
    if (!rows.length) return ref;
  }
  throw new Error('Could not create a unique purchase order number.');
}

/* ---------------- reading ---------------- */

async function list({ status, search } = {}) {
  const where = [];
  const params = [];
  if (['Ordered', 'Received', 'Cancelled'].includes(status)) { where.push('po.status = ?'); params.push(status); }
  if (search) {
    where.push('(po.po_ref LIKE ? OR s.name LIKE ?)');
    params.push(`%${search}%`, `%${search}%`);
  }
  const [rows] = await db.query(`${PO_SELECT} ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY po.created_at DESC, po.id DESC LIMIT 500`, params);
  const [counts] = await db.query('SELECT status, COUNT(*) AS n FROM purchase_orders GROUP BY status');
  const statusCounts = { Ordered: 0, Received: 0, Cancelled: 0 };
  counts.forEach(c => { statusCounts[c.status] = Number(c.n); });
  return { rows: rows.map(clean), statusCounts };
}

async function find(id) {
  const [rows] = await db.query(`${PO_SELECT} WHERE po.id = ?`, [id]);
  if (!rows.length) throw new OrderError('Purchase order not found.', 404);
  const [items] = await db.query(
    `SELECT poi.product_id, p.name AS product_name, c.name AS category_name, poi.quantity, poi.unit_cost,
            poi.quantity * poi.unit_cost AS line_total, p.stock_quantity AS current_stock
     FROM purchase_order_items poi
     JOIN products p ON p.id = poi.product_id
     JOIN categories c ON c.id = p.category_id
     WHERE poi.purchase_order_id = ? ORDER BY p.name`, [id]);
  return { ...clean(rows[0]), items: items.map(i => ({ ...i, unit_cost: Number(i.unit_cost), line_total: Number(i.line_total) })) };
}

function clean(row) {
  return { ...row, line_count: Number(row.line_count), units: Number(row.units), total_cost: Number(row.total_cost) };
}

// Products that need restocking: out of stock first, then low stock, with a suggested quantity
// that brings each one back up to three times the low stock level.
async function suggestions() {
  const target = shop.LOW_STOCK_LEVEL * 3;
  const [rows] = await db.query(
    `SELECT p.id AS product_id, p.name AS product_name, c.name AS category_name, p.stock_quantity, p.price,
            (SELECT COALESCE(SUM(oi.quantity), 0) FROM order_items oi JOIN orders o ON o.id = oi.order_id
              WHERE oi.product_id = p.id AND o.status <> 'Cancelled' AND o.created_at >= NOW() - INTERVAL 30 DAY) AS sold_30_days
     FROM products p JOIN categories c ON c.id = p.category_id
     WHERE p.is_active = 1 AND p.stock_quantity <= ?
     ORDER BY p.stock_quantity, p.name`, [shop.LOW_STOCK_LEVEL]);
  return rows.map(r => ({
    ...r,
    price: Number(r.price),
    sold_30_days: Number(r.sold_30_days),
    suggested_quantity: Math.max(target - r.stock_quantity, 10)
  }));
}

/* ---------------- creating ---------------- */

// Checks the form and returns clean values, or throws an OrderError with a clear message
function validate(body) {
  const supplierId = Number(body.supplier_id);
  if (!Number.isInteger(supplierId) || supplierId <= 0) throw new OrderError('Please choose a supplier.');

  let expected = null;
  if (body.expected_date) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(body.expected_date))) throw new OrderError('The expected delivery date is not valid.');
    expected = String(body.expected_date);
  }
  const notes = String(body.notes || '').trim().slice(0, 500) || null;

  const raw = Array.isArray(body.items) ? body.items : [];
  if (!raw.length) throw new OrderError('Add at least one product to the purchase order.');
  if (raw.length > MAX_LINES) throw new OrderError(`A purchase order can have at most ${MAX_LINES} products.`);

  // Two lines for the same product are merged into one
  const lines = new Map();
  for (const item of raw) {
    const productId = Number(item.product_id);
    const quantity = Number(item.quantity);
    const unitCost = item.unit_cost === '' || item.unit_cost === undefined || item.unit_cost === null ? 0 : Number(item.unit_cost);
    if (!Number.isInteger(productId) || productId <= 0) throw new OrderError('Choose a product on every line.');
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > MAX_QUANTITY) throw new OrderError(`Each quantity must be a whole number from 1 to ${MAX_QUANTITY}.`);
    if (!Number.isFinite(unitCost) || unitCost < 0 || unitCost > 1000000) throw new OrderError('Each unit cost must be a number from 0 upwards.');
    const line = lines.get(productId) || { productId, quantity: 0, unitCost };
    line.quantity += quantity;
    line.unitCost = unitCost;
    if (line.quantity > MAX_QUANTITY) throw new OrderError(`Each quantity must be a whole number from 1 to ${MAX_QUANTITY}.`);
    lines.set(productId, line);
  }
  return { supplierId, expected, notes, lines: [...lines.values()] };
}

async function create(body, adminId) {
  const input = validate(body);
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const [suppliers] = await conn.query('SELECT id, name, is_active FROM suppliers WHERE id = ?', [input.supplierId]);
    if (!suppliers.length) throw new OrderError('That supplier no longer exists.');
    if (!suppliers[0].is_active) throw new OrderError(`${suppliers[0].name} is marked as inactive. Choose another supplier or make it active again.`);

    const ids = input.lines.map(l => l.productId);
    const [products] = await conn.query('SELECT id FROM products WHERE id IN (?)', [ids]);
    if (products.length !== ids.length) throw new OrderError('One of the products no longer exists. Please refresh and try again.');

    const ref = await uniqueRef(conn);
    const [r] = await conn.query(
      'INSERT INTO purchase_orders (po_ref, supplier_id, status, expected_date, notes, created_by) VALUES (?, ?, ?, ?, ?, ?)',
      [ref, input.supplierId, 'Ordered', input.expected, input.notes, adminId]);
    await conn.query(
      'INSERT INTO purchase_order_items (purchase_order_id, product_id, quantity, unit_cost) VALUES ?',
      [input.lines.map(l => [r.insertId, l.productId, l.quantity, l.unitCost])]);
    await conn.commit();
    return { id: r.insertId, po_ref: ref };
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

/* ---------------- receiving and cancelling ---------------- */

// The goods arrived: add every line to stock. The purchase order row is locked first,
// so two people clicking "Received" at the same moment cannot add the stock twice.
async function receive(id, adminId) {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const [rows] = await conn.query('SELECT id, po_ref, status FROM purchase_orders WHERE id = ? FOR UPDATE', [id]);
    if (!rows.length) throw new OrderError('Purchase order not found.', 404);
    if (rows[0].status !== 'Ordered') throw new OrderError(`This purchase order is already ${rows[0].status.toLowerCase()}, so it cannot be received again.`, 409);

    const [items] = await conn.query('SELECT product_id, quantity FROM purchase_order_items WHERE purchase_order_id = ?', [id]);
    const added = [];
    for (const item of items) {
      await conn.query('UPDATE products SET stock_quantity = stock_quantity + ? WHERE id = ?', [item.quantity, item.product_id]);
      added.push({ product_id: item.product_id, added: item.quantity });
    }
    await conn.query("UPDATE purchase_orders SET status = 'Received', received_at = NOW(), received_by = ? WHERE id = ?", [adminId, id]);
    await conn.commit();
    return { po_ref: rows[0].po_ref, added };
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

async function cancel(id) {
  const [rows] = await db.query('SELECT po_ref, status FROM purchase_orders WHERE id = ?', [id]);
  if (!rows.length) throw new OrderError('Purchase order not found.', 404);
  if (rows[0].status !== 'Ordered') throw new OrderError(`Only an order that has not arrived can be cancelled. This one is ${rows[0].status.toLowerCase()}.`, 409);
  await db.query("UPDATE purchase_orders SET status = 'Cancelled' WHERE id = ? AND status = 'Ordered'", [id]);
  return { po_ref: rows[0].po_ref };
}

module.exports = { list, find, suggestions, create, receive, cancel };
