// routes/userRoutes.js
// Customer accounts: register, login (with optional two step verification), logout, profile,
// forgot password and reset password.

const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const db = require('../config/db');
const shop = require('../config/shop');
const audit = require('../utils/audit');
const { sendMail } = require('../utils/mailer');
const { requireCustomer } = require('../middleware/auth');
const twofa = require('../utils/twofactor');
const {
  signToken, isEmail, strongPassword, PASSWORD_RULE, normalisePhone,
  createLoginGuard, randomToken, sha256
} = require('../utils/security');

const loginGuard = createLoginGuard(shop.MAX_FAILED_LOGINS, shop.LOCK_MINUTES);
const TOKEN_HOURS = 24 * 7; // customers stay logged in for a week

function publicUser(row) {
  return { id: row.id, full_name: row.full_name, email: row.email, phone: row.phone || '', role: row.role, twofa_enabled: !!row.twofa_enabled };
}

function customerToken(user) {
  return signToken({ type: 'customer', uid: user.id, email: user.email, name: user.full_name }, TOKEN_HOURS);
}

// POST /api/users/register
router.post('/register', async (req, res, next) => {
  try {
    const fullName = String(req.body.full_name || '').trim();
    const email = String(req.body.email || '').trim().toLowerCase();
    const password = String(req.body.password || '');
    const role = req.body.role === 'staff' ? 'staff' : 'student';
    const phone = req.body.phone ? normalisePhone(req.body.phone) : null;

    if (fullName.length < 3 || fullName.length > 100) {
      return res.status(400).json({ success: false, message: 'Please enter your full name (3 to 100 characters).' });
    }
    if (!isEmail(email)) {
      return res.status(400).json({ success: false, message: 'Please enter a valid email address.' });
    }
    if (req.body.phone && !phone) {
      return res.status(400).json({ success: false, message: 'Please enter a valid Kenyan phone number, for example 0712345678.' });
    }
    if (!strongPassword(password)) {
      return res.status(400).json({ success: false, message: PASSWORD_RULE });
    }

    const [existing] = await db.query('SELECT id FROM users WHERE email = ?', [email]);
    if (existing.length) {
      return res.status(409).json({ success: false, message: 'This email is already registered. Try logging in instead.' });
    }

    const hash = await bcrypt.hash(password, 10);
    const [result] = await db.query(
      'INSERT INTO users (full_name, email, phone, password, role) VALUES (?, ?, ?, ?, ?)',
      [fullName, email, phone, hash, role]);

    await audit(req, { actorType: 'customer', actorId: result.insertId, actorEmail: email, action: 'REGISTER', table: 'users', recordId: result.insertId });
    res.status(201).json({ success: true, message: 'Account created. You can now log in.', userId: result.insertId });
  } catch (err) {
    next(err);
  }
});

// POST /api/users/login
router.post('/login', async (req, res, next) => {
  try {
    const email = String(req.body.email || '').trim().toLowerCase();
    const password = String(req.body.password || '');
    if (!email || !password) {
      return res.status(400).json({ success: false, message: 'Please enter both your email and password.' });
    }

    const lockedFor = loginGuard.lockedFor(email);
    if (lockedFor) {
      return res.status(429).json({ success: false, message: `Too many failed attempts. Try again in ${lockedFor} minute(s).` });
    }

    const [rows] = await db.query('SELECT * FROM users WHERE email = ?', [email]);
    const user = rows[0];

    // Accounts created before passwords were hashed still hold plain text; they are upgraded below
    const stored = user ? String(user.password || '') : '';
    const ok = user && (stored.startsWith('$2') ? await bcrypt.compare(password, stored) : stored === password);

    if (!ok) {
      const result = loginGuard.fail(email);
      await audit(req, { actorType: 'customer', actorId: user ? user.id : null, actorEmail: email, action: 'LOGIN_FAILED', table: 'users' });
      return res.status(401).json({
        success: false,
        message: result.locked
          ? `Too many failed attempts. Your account is locked for ${shop.LOCK_MINUTES} minutes.`
          : `Wrong email or password. ${result.attemptsLeft} attempt(s) left.`
      });
    }
    if (!user.is_active) {
      return res.status(403).json({ success: false, message: 'This account has been deactivated. Please contact the shop.' });
    }

    loginGuard.clear(email);
    if (!stored.startsWith('$2')) {
      await db.query('UPDATE users SET password = ? WHERE id = ?', [await bcrypt.hash(password, 10), user.id]);
    }

    // Two step verification switched on: send a code before giving the login token
    if (user.twofa_enabled) {
      const step = await twofa.startChallenge({ type: 'customer', id: user.id, email: user.email, name: user.full_name });
      await audit(req, { actorType: 'customer', actorId: user.id, actorEmail: email, action: '2FA_CODE_SENT', table: 'users', recordId: user.id });
      return res.json({ success: true, ...step });
    }

    await audit(req, { actorType: 'customer', actorId: user.id, actorEmail: email, action: 'LOGIN', table: 'users', recordId: user.id });
    res.json({ success: true, message: 'Login successful!', token: customerToken(user), user: publicUser(user) });
  } catch (err) {
    next(err);
  }
});

// POST /api/users/login/verify  (second step: the 6 digit code)
router.post('/login/verify', async (req, res, next) => {
  try {
    const result = twofa.verifyChallenge(req.body.challenge, req.body.code, 'customer');
    if (!result.ok) {
      if (result.challenge) {
        await audit(req, { actorType: 'customer', actorId: result.challenge.accountId, actorEmail: result.challenge.email, action: '2FA_FAILED', table: 'users', recordId: result.challenge.accountId });
      }
      return res.status(result.status).json({ success: false, message: result.error, restart: result.status === 410 || !!result.finished });
    }
    const [rows] = await db.query('SELECT * FROM users WHERE id = ? AND is_active = 1', [result.challenge.accountId]);
    if (!rows.length) return res.status(403).json({ success: false, message: 'This account has been deactivated. Please contact the shop.', restart: true });
    const user = rows[0];
    await audit(req, { actorType: 'customer', actorId: user.id, actorEmail: user.email, action: 'LOGIN', table: 'users', recordId: user.id, details: { second_factor: 'email code' } });
    res.json({ success: true, message: 'Login successful!', token: customerToken(user), user: publicUser(user) });
  } catch (err) {
    next(err);
  }
});

// POST /api/users/login/resend  (a new code)
router.post('/login/resend', async (req, res, next) => {
  try {
    const result = await twofa.resendChallenge(req.body.challenge, 'customer');
    if (!result.ok) return res.status(result.status).json({ success: false, message: result.error, restart: result.status === 410 });
    res.json({ success: true, ...result });
  } catch (err) {
    next(err);
  }
});

// PUT /api/users/me/2fa  (switch two step verification on or off; needs the password)
router.put('/me/2fa', requireCustomer, async (req, res, next) => {
  try {
    const [rows] = await db.query('SELECT password FROM users WHERE id = ?', [req.customer.uid]);
    const stored = rows.length ? String(rows[0].password) : '';
    const password = String(req.body.password || '');
    const ok = stored.startsWith('$2') ? await bcrypt.compare(password, stored) : stored === password;
    if (!ok) return res.status(400).json({ success: false, message: 'Your password is wrong.' });
    const enabled = req.body.enabled ? 1 : 0;
    await db.query('UPDATE users SET twofa_enabled = ? WHERE id = ?', [enabled, req.customer.uid]);
    await audit(req, { actorType: 'customer', actorId: req.customer.uid, actorEmail: req.customer.email, action: enabled ? '2FA_ON' : '2FA_OFF', table: 'users', recordId: req.customer.uid });
    const [fresh] = await db.query('SELECT * FROM users WHERE id = ?', [req.customer.uid]);
    res.json({
      success: true,
      message: enabled ? 'Two step verification is on. Next time you log in we will ask for a code sent to your email.' : 'Two step verification is off.',
      user: publicUser(fresh[0])
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/users/logout
router.post('/logout', requireCustomer, async (req, res) => {
  await audit(req, { actorType: 'customer', actorId: req.customer.uid, actorEmail: req.customer.email, action: 'LOGOUT', table: 'users', recordId: req.customer.uid });
  res.json({ success: true });
});

// GET /api/users/me
router.get('/me', requireCustomer, async (req, res, next) => {
  try {
    const [rows] = await db.query('SELECT * FROM users WHERE id = ? AND is_active = 1', [req.customer.uid]);
    if (!rows.length) return res.status(401).json({ success: false, message: 'Please log in again.' });
    res.json({ success: true, user: publicUser(rows[0]) });
  } catch (err) {
    next(err);
  }
});

// PUT /api/users/me  (update name and phone)
router.put('/me', requireCustomer, async (req, res, next) => {
  try {
    const fullName = String(req.body.full_name || '').trim();
    const phone = req.body.phone ? normalisePhone(req.body.phone) : null;
    if (fullName.length < 3 || fullName.length > 100) {
      return res.status(400).json({ success: false, message: 'Please enter your full name (3 to 100 characters).' });
    }
    if (req.body.phone && !phone) {
      return res.status(400).json({ success: false, message: 'Please enter a valid Kenyan phone number, for example 0712345678.' });
    }
    await db.query('UPDATE users SET full_name = ?, phone = ? WHERE id = ?', [fullName, phone, req.customer.uid]);
    await audit(req, { actorType: 'customer', actorId: req.customer.uid, actorEmail: req.customer.email, action: 'UPDATE_PROFILE', table: 'users', recordId: req.customer.uid });
    const [rows] = await db.query('SELECT * FROM users WHERE id = ?', [req.customer.uid]);
    res.json({ success: true, message: 'Profile updated.', user: publicUser(rows[0]) });
  } catch (err) {
    next(err);
  }
});

// POST /api/users/change-password
router.post('/change-password', requireCustomer, async (req, res, next) => {
  try {
    const [rows] = await db.query('SELECT password FROM users WHERE id = ?', [req.customer.uid]);
    const stored = rows.length ? String(rows[0].password) : '';
    const current = String(req.body.current_password || '');
    const ok = stored.startsWith('$2') ? await bcrypt.compare(current, stored) : stored === current;
    if (!ok) return res.status(400).json({ success: false, message: 'Your current password is wrong.' });
    if (!strongPassword(req.body.new_password)) return res.status(400).json({ success: false, message: PASSWORD_RULE });
    await db.query('UPDATE users SET password = ? WHERE id = ?', [await bcrypt.hash(req.body.new_password, 10), req.customer.uid]);
    await audit(req, { actorType: 'customer', actorId: req.customer.uid, actorEmail: req.customer.email, action: 'CHANGE_PASSWORD', table: 'users', recordId: req.customer.uid });
    res.json({ success: true, message: 'Password changed.' });
  } catch (err) {
    next(err);
  }
});

// POST /api/users/forgot-password
// Always answers the same way, so nobody can use this form to find out which emails are registered.
router.post('/forgot-password', async (req, res, next) => {
  try {
    const email = String(req.body.email || '').trim().toLowerCase();
    if (!isEmail(email)) {
      return res.status(400).json({ success: false, message: 'Please enter a valid email address.' });
    }
    const reply = { success: true, message: 'If that email is registered, a password reset link has been sent to it. The link works for 30 minutes.' };

    const [rows] = await db.query('SELECT id, full_name FROM users WHERE email = ? AND is_active = 1', [email]);
    if (!rows.length) return res.json(reply);

    const user = rows[0];
    const token = randomToken();
    await db.query('UPDATE password_resets SET used_at = NOW() WHERE user_id = ? AND used_at IS NULL', [user.id]);
    await db.query(
      'INSERT INTO password_resets (user_id, token_hash, expires_at) VALUES (?, ?, DATE_ADD(NOW(), INTERVAL ? MINUTE))',
      [user.id, sha256(token), shop.RESET_LINK_MINUTES]);

    const link = `${req.protocol}://${req.get('host')}/pages/reset-password.html?token=${token}`;
    await sendMail({
      to: email,
      subject: `${shop.SHOP_NAME}: reset your password`,
      text: `Hello ${user.full_name},\n\nWe received a request to reset your ${shop.SHOP_NAME} password.\nOpen this link within ${shop.RESET_LINK_MINUTES} minutes to choose a new password:\n\n${link}\n\nIf you did not ask for this, you can ignore this email.`,
      html: `<p>Hello ${user.full_name.replace(/[<>&"]/g, '')},</p><p>We received a request to reset your ${shop.SHOP_NAME} password.</p>
             <p><a href="${link}">Choose a new password</a> (the link works for ${shop.RESET_LINK_MINUTES} minutes).</p>
             <p>If you did not ask for this, you can ignore this email.</p>`
    });
    await audit(req, { actorType: 'customer', actorId: user.id, actorEmail: email, action: 'PASSWORD_RESET_REQUEST', table: 'users', recordId: user.id });
    res.json(reply);
  } catch (err) {
    next(err);
  }
});

// POST /api/users/reset-password
router.post('/reset-password', async (req, res, next) => {
  try {
    const token = String(req.body.token || '');
    if (!/^[a-f0-9]{64}$/.test(token)) {
      return res.status(400).json({ success: false, message: 'This reset link is not valid. Please request a new one.' });
    }
    if (!strongPassword(req.body.password)) {
      return res.status(400).json({ success: false, message: PASSWORD_RULE });
    }
    const [rows] = await db.query(
      `SELECT r.id, r.user_id, u.email FROM password_resets r JOIN users u ON u.id = r.user_id
       WHERE r.token_hash = ? AND r.used_at IS NULL AND r.expires_at > NOW()`, [sha256(token)]);
    if (!rows.length) {
      return res.status(400).json({ success: false, message: 'This reset link has expired or was already used. Please request a new one.' });
    }
    const reset = rows[0];
    await db.query('UPDATE users SET password = ? WHERE id = ?', [await bcrypt.hash(req.body.password, 10), reset.user_id]);
    await db.query('UPDATE password_resets SET used_at = NOW() WHERE id = ?', [reset.id]);
    loginGuard.clear(reset.email);
    await audit(req, { actorType: 'customer', actorId: reset.user_id, actorEmail: reset.email, action: 'PASSWORD_RESET', table: 'users', recordId: reset.user_id });
    res.json({ success: true, message: 'Your password has been changed. You can now log in.' });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
