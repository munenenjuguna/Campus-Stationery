// routes/paymentRoutes.js
// Safaricom posts the final M-Pesa result here. This only works when the system is hosted
// online with MPESA_CALLBACK_URL pointing to it. On a laptop the shop checks the result
// itself instead (see refreshPayment in services/orderService.js).

const express = require('express');
const router = express.Router();
const audit = require('../utils/audit');
const { handleMpesaCallback } = require('../services/orderService');

router.post('/mpesa/callback', async (req, res) => {
  try {
    const saved = await handleMpesaCallback(req.body);
    if (saved) await audit(req, { actorType: 'system', actorEmail: 'M-Pesa', action: 'MPESA_CALLBACK', table: 'payments', details: { result: req.body.Body.stkCallback.ResultDesc } });
  } catch (err) {
    console.error('M-Pesa callback error:', err.message);
  }
  // Safaricom only needs to know the message arrived
  res.json({ ResultCode: 0, ResultDesc: 'Accepted' });
});

module.exports = router;
