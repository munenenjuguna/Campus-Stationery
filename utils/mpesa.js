// utils/mpesa.js
// M-Pesa payments through the Safaricom Daraja API (Lipa na M-Pesa Online, also called STK Push).
//
// Two modes:
//  * LIVE SANDBOX: when MPESA_CONSUMER_KEY, MPESA_CONSUMER_SECRET and MPESA_PASSKEY are set in .env,
//    a real payment prompt is sent to the customer's phone through the Daraja sandbox.
//  * DEMO: when those settings are missing, payments are simulated so the system can be shown
//    without an internet connection. The prompt "succeeds" after a few seconds. A phone number
//    ending in 000 simulates a customer who cancels, to show the failure handling.
//
// Endpoints follow the Daraja documentation (developer.safaricom.co.ke). Check the portal for changes.

const crypto = require('crypto');

const BASE_URL = process.env.MPESA_ENV === 'production'
  ? 'https://api.safaricom.co.ke'
  : 'https://sandbox.safaricom.co.ke';

const SHORTCODE = process.env.MPESA_SHORTCODE || '174379'; // Daraja sandbox test paybill
const SIMULATED_DELAY_SECONDS = 6;

function isLive() {
  return !!(process.env.MPESA_CONSUMER_KEY && process.env.MPESA_CONSUMER_SECRET && process.env.MPESA_PASSKEY);
}

function mode() {
  return isLive() ? 'sandbox' : 'demo';
}

// Daraja wants the time as YYYYMMDDHHmmss in Kenyan time
function timestamp() {
  const now = new Date(Date.now() + 3 * 3600 * 1000); // UTC+3
  return now.toISOString().replace(/[-:TZ.]/g, '').slice(0, 14);
}

function password(ts) {
  return Buffer.from(SHORTCODE + process.env.MPESA_PASSKEY + ts).toString('base64');
}

async function accessToken() {
  const auth = Buffer.from(`${process.env.MPESA_CONSUMER_KEY}:${process.env.MPESA_CONSUMER_SECRET}`).toString('base64');
  const res = await fetch(`${BASE_URL}/oauth/v1/generate?grant_type=client_credentials`, {
    headers: { Authorization: `Basic ${auth}` }
  });
  if (!res.ok) throw new Error(`M-Pesa login failed (${res.status}). Check the consumer key and secret in .env.`);
  const data = await res.json();
  return data.access_token;
}

/**
 * Sends the "enter your M-Pesa PIN" prompt to the customer's phone.
 * @returns {Promise<{checkoutRequestId: string, message: string, mode: string}>}
 */
async function stkPush({ phone, amount, accountRef, description }) {
  if (!isLive()) {
    return {
      checkoutRequestId: 'DEMO-' + crypto.randomBytes(8).toString('hex'),
      message: 'Demo mode: payment request simulated.',
      mode: 'demo'
    };
  }
  const ts = timestamp();
  const token = await accessToken();
  const res = await fetch(`${BASE_URL}/mpesa/stkpush/v1/processrequest`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      BusinessShortCode: SHORTCODE,
      Password: password(ts),
      Timestamp: ts,
      TransactionType: 'CustomerPayBillOnline',
      Amount: Math.ceil(Number(amount)),
      PartyA: phone,
      PartyB: SHORTCODE,
      PhoneNumber: phone,
      CallBackURL: process.env.MPESA_CALLBACK_URL || 'https://example.com/api/payments/mpesa/callback',
      AccountReference: String(accountRef).slice(0, 12),
      TransactionDesc: String(description || 'Stationery order').slice(0, 13)
    })
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.ResponseCode !== '0') {
    throw new Error(data.errorMessage || data.ResponseDescription || `M-Pesa request failed (${res.status}).`);
  }
  return { checkoutRequestId: data.CheckoutRequestID, message: data.CustomerMessage || 'Check your phone to complete the payment.', mode: 'sandbox' };
}

/**
 * Asks M-Pesa whether the customer has paid.
 * @returns {Promise<{status: 'Pending'|'Paid'|'Failed', message: string, receipt: string|null}>}
 */
async function queryStatus({ checkoutRequestId, ageSeconds, phone }) {
  if (!isLive() || String(checkoutRequestId).startsWith('DEMO-')) {
    if (Number(ageSeconds) < SIMULATED_DELAY_SECONDS) return { status: 'Pending', message: 'Waiting for the customer to enter their PIN.', receipt: null };
    if (String(phone).endsWith('000')) return { status: 'Failed', message: 'Request cancelled by user (demo).', receipt: null };
    return { status: 'Paid', message: 'Payment received (demo).', receipt: 'DEMO' + crypto.randomBytes(3).toString('hex').toUpperCase() };
  }
  const ts = timestamp();
  const token = await accessToken();
  const res = await fetch(`${BASE_URL}/mpesa/stkpushquery/v1/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ BusinessShortCode: SHORTCODE, Password: password(ts), Timestamp: ts, CheckoutRequestID: checkoutRequestId })
  });
  const data = await res.json().catch(() => ({}));
  // While the customer has not answered yet, Daraja replies with an error code instead of a result
  if (data.ResultCode === undefined) return { status: 'Pending', message: 'Waiting for the customer to enter their PIN.', receipt: null };
  if (String(data.ResultCode) === '0') return { status: 'Paid', message: data.ResultDesc || 'Payment received.', receipt: null };
  return { status: 'Failed', message: data.ResultDesc || 'The payment was not completed.', receipt: null };
}

module.exports = { stkPush, queryStatus, isLive, mode };
