// routes/orderRoutes.js
// Customer side of the main transaction: place an order, pay with M-Pesa, view and cancel orders.

const express = require('express');
const router = express.Router();
const audit = require('../utils/audit');
const mpesa = require('../utils/mpesa');
const { normalisePhone } = require('../utils/security');
const { requireCustomer } = require('../middleware/auth');
const orders = require('../services/orderService');

router.use(requireCustomer);

function actor(req) {
  return { actorType: 'customer', actorId: req.customer.uid, actorEmail: req.customer.email };
}

// POST /api/orders  (place an order from the cart)
router.post('/', async (req, res, next) => {
  try {
    const input = orders.validateOrderInput(req.body || {}, normalisePhone);
    const placed = await orders.placeOrder(req.customer.uid, input);
    await audit(req, { ...actor(req), action: 'ORDER_PLACED', table: 'orders', recordId: placed.ref,
      details: { total: placed.total, payment: input.paymentMethod, items: input.quantities.size } });

    let payment = { status: 'Pending', method: input.paymentMethod };
    if (input.paymentMethod === 'M-Pesa') {
      payment = { method: 'M-Pesa', ...(await orders.startMpesaPayment(placed.orderId)) };
    }
    res.status(201).json({ success: true, message: 'Order placed successfully.', order: { ref: placed.ref, total: placed.total }, payment });
  } catch (err) {
    next(err);
  }
});

// GET /api/orders/mine
router.get('/mine', async (req, res, next) => {
  try {
    res.json({ success: true, data: await orders.listCustomerOrders(req.customer.uid), paymentMode: mpesa.mode() });
  } catch (err) {
    next(err);
  }
});

// GET /api/orders/:ref
router.get('/:ref', async (req, res, next) => {
  try {
    const order = await orders.findOrder({ ref: req.params.ref, userId: req.customer.uid });
    res.json({ success: true, data: orders.toCustomerView(order, order.items) });
  } catch (err) {
    next(err);
  }
});

// GET /api/orders/:ref/payment  (the checkout page asks this every few seconds while waiting for M-Pesa)
router.get('/:ref/payment', async (req, res, next) => {
  try {
    const order = await orders.findOrder({ ref: req.params.ref, userId: req.customer.uid });
    const result = await orders.refreshPayment(order.id);
    if (result.status === 'Paid' && order.payment_status !== 'Paid') {
      await audit(req, { ...actor(req), action: 'PAYMENT_RECEIVED', table: 'payments', recordId: order.order_ref, details: { receipt: result.receipt } });
    }
    res.json({ success: true, ...result });
  } catch (err) {
    next(err);
  }
});

// POST /api/orders/:ref/pay  (send the M-Pesa prompt again, optionally to another number)
router.post('/:ref/pay', async (req, res, next) => {
  try {
    const order = await orders.findOrder({ ref: req.params.ref, userId: req.customer.uid });
    let phone = null;
    if (req.body && req.body.phone) {
      phone = normalisePhone(req.body.phone);
      if (!phone) return res.status(400).json({ success: false, message: 'Please enter a valid Kenyan phone number, for example 0712345678.' });
    }
    const result = await orders.startMpesaPayment(order.id, phone);
    await audit(req, { ...actor(req), action: 'PAYMENT_REQUESTED', table: 'payments', recordId: order.order_ref });
    res.json({ success: true, ...result });
  } catch (err) {
    next(err);
  }
});

// POST /api/orders/:ref/cancel
router.post('/:ref/cancel', async (req, res, next) => {
  try {
    const order = await orders.findOrder({ ref: req.params.ref, userId: req.customer.uid });
    await orders.cancelOrder(order.id, { byCustomer: true });
    await audit(req, { ...actor(req), action: 'ORDER_CANCELLED', table: 'orders', recordId: order.order_ref });
    res.json({ success: true, message: 'Your order has been cancelled and the items returned to stock.' });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
