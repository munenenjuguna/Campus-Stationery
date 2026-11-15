// services/orderService.js
// The main business logic of the shop: placing orders, payments, cancelling and order status changes.
// Both the customer API (routes/orderRoutes.js) and the admin panel (routes/admin.js) use these
// functions, so the rules (stock checks, allowed status changes) live in one place.

const crypto = require('crypto');
const db = require('../config/db');
const shop = require('../config/shop');
const mpesa = require('../utils/mpesa');

// An error caused by the user's request (shown to them), not a bug in the server
class OrderError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

const toCents = value => Math.round(Number(value) * 100);
const fromCents = cents => Math.round(cents) / 100;

/* ---------------- reading orders ---------------- */

// Shared SELECT: one row per order with its totals and latest payment
const ORDER_SELECT = `
  SELECT o.id, o.order_ref, o.user_id, o.delivery_method, o.delivery_location, o.delivery_fee,
         o.contact_phone, o.status, o.created_at, o.updated_at,
         u.full_name AS customer_name, u.email AS customer_email,
         COALESCE(t.items, 0) AS item_count,
         COALESCE(t.subtotal, 0) AS subtotal,
         COALESCE(t.subtotal, 0) + o.delivery_fee AS total,
         p.id AS payment_id, p.method AS payment_method, p.status AS payment_status,
         p.mpesa_receipt, p.phone AS payment_phone, p.paid_at
  FROM orders o
  JOIN users u ON u.id = o.user_id
  LEFT JOIN (
    SELECT order_id, SUM(quantity) AS items, SUM(quantity * unit_price) AS subtotal
    FROM order_items GROUP BY order_id
  ) t ON t.order_id = o.id
  LEFT JOIN payments p ON p.id = (SELECT MAX(id) FROM payments WHERE order_id = o.id)`;

async function itemsFor(orderIds, conn = db) {
  if (!orderIds.length) return [];
  const [rows] = await conn.query(
    `SELECT oi.order_id, oi.product_id, oi.quantity, oi.unit_price, p.name, p.image
     FROM order_items oi JOIN products p ON p.id = oi.product_id
     WHERE oi.order_id IN (?) ORDER BY oi.id`, [orderIds]);
  return rows;
}

// Shape used by the customer's My Orders page
function toCustomerView(order, items) {
  return {
    orderId: order.order_ref,
    orderDate: String(order.created_at).replace(' ', 'T'),
    status: order.status,
    items: items.map(i => ({ id: i.product_id, name: i.name, image: i.image, quantity: i.quantity, price: Number(i.unit_price) })),
    subtotal: Number(order.subtotal),
    deliveryCost: Number(order.delivery_fee),
    total: Number(order.total),
    paymentMethod: order.payment_method,
    paymentStatus: order.payment_status,
    mpesaReceipt: order.mpesa_receipt,
    phone: order.contact_phone,
    delivery: { method: order.delivery_method, location: order.delivery_location || '' },
    canCancel: order.status === 'Pending' && order.payment_status !== 'Paid',
    canPay: order.payment_method === 'M-Pesa' && ['Pending', 'Failed'].includes(order.payment_status) && order.status !== 'Cancelled'
  };
}

async function listCustomerOrders(userId) {
  const [orders] = await db.query(`${ORDER_SELECT} WHERE o.user_id = ? ORDER BY o.created_at DESC, o.id DESC`, [userId]);
  const items = await itemsFor(orders.map(o => o.id));
  return orders.map(o => toCustomerView(o, items.filter(i => i.order_id === o.id)));
}

async function findOrder({ id, ref, userId }) {
  const where = [];
  const params = [];
  if (id) { where.push('o.id = ?'); params.push(id); }
  if (ref) { where.push('o.order_ref = ?'); params.push(ref); }
  if (userId) { where.push('o.user_id = ?'); params.push(userId); }
  const [rows] = await db.query(`${ORDER_SELECT} WHERE ${where.join(' AND ')} LIMIT 1`, params);
  if (!rows.length) throw new OrderError('Order not found.', 404);
  const order = rows[0];
  order.items = await itemsFor([order.id]);
  const [payments] = await db.query('SELECT * FROM payments WHERE order_id = ? ORDER BY id', [order.id]);
  order.payments = payments;
  return order;
}

/* ---------------- placing an order ---------------- */

async function uniqueOrderRef(conn) {
  const d = new Date();
  const datePart = `${String(d.getFullYear()).slice(2)}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  for (let i = 0; i < 5; i++) {
    const ref = `CS-${datePart}-${crypto.randomBytes(2).toString('hex').toUpperCase()}`;
    const [rows] = await conn.query('SELECT id FROM orders WHERE order_ref = ?', [ref]);
    if (!rows.length) return ref;
  }
  throw new Error('Could not create a unique order reference.');
}

// Checks the order form and returns clean values, or throws an OrderError with a clear message
function validateOrderInput(body, normalisePhone) {
  const raw = Array.isArray(body.items) ? body.items : [];
  if (!raw.length) throw new OrderError('Your cart is empty.');
  if (raw.length > shop.MAX_ITEMS_PER_ORDER) throw new OrderError(`An order can have at most ${shop.MAX_ITEMS_PER_ORDER} different products.`);

  // Merge repeated products and check quantities
  const quantities = new Map();
  for (const item of raw) {
    const productId = Number(item.product_id ?? item.id);
    const qty = Number(item.quantity);
    if (!Number.isInteger(productId) || productId < 1) throw new OrderError('One of the products in your cart is not valid. Please remove it and try again.');
    if (!Number.isInteger(qty) || qty < 1 || qty > shop.MAX_QUANTITY_PER_ITEM) {
      throw new OrderError(`Quantities must be whole numbers between 1 and ${shop.MAX_QUANTITY_PER_ITEM}.`);
    }
    quantities.set(productId, (quantities.get(productId) || 0) + qty);
  }

  const deliveryMethod = String(body.delivery_method || '');
  if (!shop.DELIVERY_METHODS.includes(deliveryMethod)) throw new OrderError('Please choose Campus Pickup or Campus Delivery.');
  const location = String(body.delivery_location || '').trim();
  if (deliveryMethod === 'Campus Delivery' && (location.length < 3 || location.length > 150)) {
    throw new OrderError('Please enter your delivery location on campus (for example: Hostel B, Room 12).');
  }

  const phone = normalisePhone(body.phone);
  if (!phone) throw new OrderError('Please enter a valid Kenyan phone number, for example 0712345678.');

  const paymentMethod = String(body.payment_method || '');
  if (!shop.PAYMENT_METHODS.includes(paymentMethod)) throw new OrderError('Please choose M-Pesa or Cash on Collection.');

  return { quantities, deliveryMethod, location: deliveryMethod === 'Campus Delivery' ? location : null, phone, paymentMethod };
}

/**
 * Places an order inside one database transaction:
 * locks the products, checks stock, saves the order and its items,
 * reduces stock and records the payment. If anything fails, nothing is saved.
 */
async function placeOrder(userId, input) {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    const [users] = await conn.query('SELECT id, is_active FROM users WHERE id = ?', [userId]);
    if (!users.length || !users[0].is_active) throw new OrderError('Your account is not active. Please contact the shop.', 403);

    const ids = [...input.quantities.keys()];
    const [products] = await conn.query(
      'SELECT id, name, price, stock_quantity, is_active FROM products WHERE id IN (?) FOR UPDATE', [ids]);

    let subtotalCents = 0;
    for (const id of ids) {
      const product = products.find(p => p.id === id);
      const qty = input.quantities.get(id);
      if (!product || !product.is_active) throw new OrderError('One of the products in your cart is no longer available. Please remove it and try again.', 409);
      if (product.stock_quantity < qty) {
        throw new OrderError(product.stock_quantity === 0
          ? `Sorry, ${product.name} is out of stock. Please remove it from your cart.`
          : `Sorry, only ${product.stock_quantity} of ${product.name} left in stock. Please reduce the quantity.`, 409);
      }
      subtotalCents += toCents(product.price) * qty;
    }

    const feeCents = input.deliveryMethod === 'Campus Delivery' ? toCents(shop.DELIVERY_FEE) : 0;
    const totalCents = subtotalCents + feeCents;
    const ref = await uniqueOrderRef(conn);

    const [orderResult] = await conn.query(
      `INSERT INTO orders (order_ref, user_id, delivery_method, delivery_location, delivery_fee, contact_phone)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [ref, userId, input.deliveryMethod, input.location, fromCents(feeCents), input.phone]);
    const orderId = orderResult.insertId;

    // Prices are always taken from the database, never from the customer's browser
    await conn.query('INSERT INTO order_items (order_id, product_id, quantity, unit_price) VALUES ?',
      [ids.map(id => [orderId, id, input.quantities.get(id), products.find(p => p.id === id).price])]);

    for (const id of ids) {
      const [r] = await conn.query(
        'UPDATE products SET stock_quantity = stock_quantity - ? WHERE id = ? AND stock_quantity >= ?',
        [input.quantities.get(id), id, input.quantities.get(id)]);
      if (r.affectedRows !== 1) throw new OrderError('Stock changed while you were checking out. Please try again.', 409);
    }

    await conn.query('INSERT INTO payments (order_id, method, amount, phone) VALUES (?, ?, ?, ?)',
      [orderId, input.paymentMethod, fromCents(totalCents), input.phone]);

    await conn.commit();
    return { orderId, ref, total: fromCents(totalCents) };
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

/* ---------------- payments ---------------- */

// Sends the M-Pesa prompt for an order. Creates a fresh payment row when the last one failed.
async function startMpesaPayment(orderId, phoneOverride) {
  const order = await findOrder({ id: orderId });
  if (order.status === 'Cancelled') throw new OrderError('This order was cancelled.', 409);
  if (order.payments.some(p => p.status === 'Paid')) throw new OrderError('This order is already paid.', 409);

  const phone = phoneOverride || order.contact_phone;
  let payment = order.payments[order.payments.length - 1];
  if (!payment || payment.method !== 'M-Pesa' || payment.status !== 'Pending' || payment.checkout_request_id) {
    const [r] = await db.query('INSERT INTO payments (order_id, method, amount, phone) VALUES (?, ?, ?, ?)',
      [order.id, 'M-Pesa', order.total, phone]);
    if (payment && payment.status === 'Pending') {
      await db.query("UPDATE payments SET status = 'Cancelled', result_message = 'Replaced by a new payment request' WHERE id = ?", [payment.id]);
    }
    payment = { id: r.insertId };
  }

  try {
    const push = await mpesa.stkPush({ phone, amount: order.total, accountRef: order.order_ref, description: 'Stationery' });
    await db.query('UPDATE payments SET checkout_request_id = ?, phone = ?, created_at = NOW(), result_message = ? WHERE id = ?',
      [push.checkoutRequestId, phone, push.message, payment.id]);
    return { status: 'Pending', mode: push.mode, message: push.message };
  } catch (err) {
    await db.query("UPDATE payments SET status = 'Failed', result_message = ? WHERE id = ?", [String(err.message).slice(0, 250), payment.id]);
    return { status: 'Failed', mode: mpesa.mode(), message: 'We could not reach M-Pesa: ' + err.message };
  }
}

// Checks M-Pesa for the latest payment of an order and saves the result
async function refreshPayment(orderId) {
  const [rows] = await db.query(
    `SELECT *, TIMESTAMPDIFF(SECOND, created_at, NOW()) AS age_seconds
     FROM payments WHERE order_id = ? ORDER BY id DESC LIMIT 1`, [orderId]);
  const payment = rows[0];
  if (!payment) throw new OrderError('No payment found for this order.', 404);
  if (payment.method !== 'M-Pesa' || payment.status !== 'Pending' || !payment.checkout_request_id) {
    return { status: payment.status, receipt: payment.mpesa_receipt, message: payment.result_message, mode: mpesa.mode() };
  }
  let result;
  try {
    result = await mpesa.queryStatus({ checkoutRequestId: payment.checkout_request_id, ageSeconds: payment.age_seconds, phone: payment.phone });
  } catch (err) {
    return { status: 'Pending', message: 'Still checking with M-Pesa...', mode: mpesa.mode() };
  }
  if (result.status === 'Paid') {
    await db.query("UPDATE payments SET status = 'Paid', paid_at = NOW(), mpesa_receipt = COALESCE(?, mpesa_receipt), result_message = ? WHERE id = ? AND status = 'Pending'",
      [result.receipt, result.message, payment.id]);
  } else if (result.status === 'Failed') {
    await db.query("UPDATE payments SET status = 'Failed', result_message = ? WHERE id = ? AND status = 'Pending'", [result.message, payment.id]);
  }
  return { status: result.status, receipt: result.receipt, message: result.message, mode: mpesa.mode() };
}

// Saves the result Safaricom posts to the callback URL (only reachable when the system is hosted online)
async function handleMpesaCallback(body) {
  const cb = body && body.Body && body.Body.stkCallback;
  if (!cb || !cb.CheckoutRequestID) return false;
  if (String(cb.ResultCode) === '0') {
    const items = (cb.CallbackMetadata && cb.CallbackMetadata.Item) || [];
    const receipt = (items.find(i => i.Name === 'MpesaReceiptNumber') || {}).Value || null;
    await db.query("UPDATE payments SET status = 'Paid', paid_at = NOW(), mpesa_receipt = ?, result_message = ? WHERE checkout_request_id = ?",
      [receipt, cb.ResultDesc || 'Paid', cb.CheckoutRequestID]);
  } else {
    await db.query("UPDATE payments SET status = 'Failed', result_message = ? WHERE checkout_request_id = ? AND status = 'Pending'",
      [cb.ResultDesc || 'Not paid', cb.CheckoutRequestID]);
  }
  return true;
}

// Admin records money received in person (cash on collection, or M-Pesa confirmed by SMS)
async function markPaymentPaid(orderId, receipt) {
  const order = await findOrder({ id: orderId });
  if (order.status === 'Cancelled') throw new OrderError('This order was cancelled, so it cannot be paid.', 409);
  if (order.payments.some(p => p.status === 'Paid')) throw new OrderError('This order is already marked as paid.', 409);
  const last = order.payments[order.payments.length - 1];
  if (last && last.status === 'Pending') {
    await db.query("UPDATE payments SET status = 'Paid', paid_at = NOW(), mpesa_receipt = ?, result_message = 'Confirmed by admin' WHERE id = ?",
      [receipt || null, last.id]);
  } else {
    await db.query("INSERT INTO payments (order_id, method, amount, phone, status, paid_at, mpesa_receipt, result_message) VALUES (?, ?, ?, ?, 'Paid', NOW(), ?, 'Confirmed by admin')",
      [order.id, last ? last.method : 'Cash on Collection', order.total, order.contact_phone, receipt || null]);
  }
}

/* ---------------- cancelling and status changes ---------------- */

// Cancels an order and puts its items back into stock, in one transaction
async function cancelOrder(orderId, { byCustomer = false } = {}) {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const [rows] = await conn.query('SELECT id, status FROM orders WHERE id = ? FOR UPDATE', [orderId]);
    if (!rows.length) throw new OrderError('Order not found.', 404);
    const order = rows[0];
    if (order.status === 'Cancelled') throw new OrderError('This order is already cancelled.', 409);
    if (byCustomer && order.status !== 'Pending') {
      throw new OrderError('This order is already being prepared, so it can no longer be cancelled online. Please contact the shop.', 409);
    }
    if (!shop.ORDER_FLOW[order.status].includes('Cancelled')) throw new OrderError(`A ${order.status} order cannot be cancelled.`, 409);
    const [paid] = await conn.query("SELECT id FROM payments WHERE order_id = ? AND status = 'Paid'", [orderId]);
    if (paid.length && byCustomer) {
      throw new OrderError('This order is already paid. Please contact the shop to cancel it and arrange a refund.', 409);
    }

    await conn.query(
      `UPDATE products p JOIN order_items oi ON oi.product_id = p.id
       SET p.stock_quantity = p.stock_quantity + oi.quantity WHERE oi.order_id = ?`, [orderId]);
    await conn.query("UPDATE orders SET status = 'Cancelled' WHERE id = ?", [orderId]);
    await conn.query("UPDATE payments SET status = 'Cancelled', result_message = 'Order cancelled' WHERE order_id = ? AND status = 'Pending'", [orderId]);
    await conn.commit();
    return { refundDue: paid.length > 0 };
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

// Moves an order to its next status, following the rules in config/shop.js
async function changeStatus(orderId, newStatus) {
  const order = await findOrder({ id: orderId });
  const allowed = shop.ORDER_FLOW[order.status] || [];
  if (!allowed.includes(newStatus)) {
    throw new OrderError(`A ${order.status} order cannot be changed to ${newStatus}.`, 409);
  }
  if (newStatus === 'Cancelled') return cancelOrder(orderId);

  if (newStatus === 'Completed') {
    const paid = order.payments.some(p => p.status === 'Paid');
    if (!paid) {
      if (order.payment_method === 'Cash on Collection') {
        // Handing over a cash order means the cash was collected
        await markPaymentPaid(orderId, null);
      } else {
        throw new OrderError('The M-Pesa payment for this order has not been received yet. Confirm the payment first.', 409);
      }
    }
  }
  await db.query('UPDATE orders SET status = ? WHERE id = ?', [newStatus, orderId]);
  return {};
}

module.exports = {
  OrderError, ORDER_SELECT, itemsFor,
  validateOrderInput, placeOrder, listCustomerOrders, findOrder, toCustomerView,
  startMpesaPayment, refreshPayment, handleMpesaCallback, markPaymentPaid,
  cancelOrder, changeStatus
};
