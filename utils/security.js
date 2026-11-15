// utils/security.js
// Security helpers shared by the shop API and the admin panel:
// password hashing, login tokens, input checks and login lockout.

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

/* ---------------- secret used to sign login tokens ---------------- */

// Uses APP_SECRET from .env when set. Otherwise a random secret is created once and
// saved in .app-secret (ignored by git), so users stay logged in after a server restart.
function loadSecret() {
  if (process.env.APP_SECRET) return process.env.APP_SECRET;
  const file = path.join(__dirname, '..', '.app-secret');
  try {
    const saved = fs.readFileSync(file, 'utf8').trim();
    if (saved.length >= 32) return saved;
  } catch (e) { /* no saved secret yet */ }
  const fresh = crypto.randomBytes(48).toString('hex');
  try { fs.writeFileSync(file, fresh); } catch (e) { /* read only folder: secret lasts until restart */ }
  return fresh;
}

const SECRET = loadSecret();

/* ---------------- login tokens ---------------- */

// A token is "<base64 payload>.<signature>". The signature proves the server issued it,
// so nobody can change their role or user id without the secret.
function signToken(payload, hours) {
  const body = Buffer.from(JSON.stringify({ ...payload, exp: Date.now() + hours * 3600 * 1000 })).toString('base64url');
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

function bearerToken(req) {
  return (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
}

/* ---------------- admin password hashing (scrypt) ---------------- */

function hashAdminPassword(plain) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(plain, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

function verifyAdminPassword(plain, stored) {
  const [salt, hash] = String(stored || '').split(':');
  if (!salt || !hash) return false;
  const test = crypto.scryptSync(String(plain), salt, 64);
  const known = Buffer.from(hash, 'hex');
  return known.length === test.length && crypto.timingSafeEqual(known, test);
}

/* ---------------- encryption of stored secrets (AES-256-GCM) ---------------- */

// Secrets that must be read back later (for example an admin's authenticator app key) are
// encrypted before they are saved, so a copy of the database alone does not reveal them.
const ENCRYPTION_KEY = crypto.createHash('sha256').update('campus-stationery-field-key:' + SECRET).digest();

function encrypt(plainText) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', ENCRYPTION_KEY, iv);
  const data = Buffer.concat([cipher.update(String(plainText), 'utf8'), cipher.final()]);
  return ['v1', iv.toString('base64url'), cipher.getAuthTag().toString('base64url'), data.toString('base64url')].join('.');
}

// Returns null when the value was changed or was encrypted with a different secret
function decrypt(stored) {
  try {
    const [version, iv, tag, data] = String(stored || '').split('.');
    if (version !== 'v1') return null;
    const decipher = crypto.createDecipheriv('aes-256-gcm', ENCRYPTION_KEY, Buffer.from(iv, 'base64url'));
    decipher.setAuthTag(Buffer.from(tag, 'base64url'));
    return Buffer.concat([decipher.update(Buffer.from(data, 'base64url')), decipher.final()]).toString('utf8');
  } catch (e) {
    return null;
  }
}

/* ---------------- one time tokens (password reset) ---------------- */

function randomToken() {
  return crypto.randomBytes(32).toString('hex');
}

// Only the hash of a reset token is stored, so a leaked database cannot be used to reset passwords
function sha256(text) {
  return crypto.createHash('sha256').update(String(text)).digest('hex');
}

/* ---------------- input checks ---------------- */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function isEmail(value) {
  return EMAIL_RE.test(String(value || '').trim());
}

function strongPassword(pw) {
  return typeof pw === 'string' && pw.length >= 8 && pw.length <= 100 && /[A-Za-z]/.test(pw) && /\d/.test(pw);
}

const PASSWORD_RULE = 'Password needs at least 8 characters, with letters and numbers.';

// Accepts 07XXXXXXXX, 01XXXXXXXX, 2547XXXXXXXX or +2547XXXXXXXX and returns 2547XXXXXXXX (or null)
function normalisePhone(value) {
  const digits = String(value || '').replace(/[\s-]/g, '');
  const match = /^(?:\+?254|0)([17]\d{8})$/.exec(digits);
  return match ? '254' + match[1] : null;
}

/* ---------------- login lockout ---------------- */

// Counts failed logins per email and blocks further tries for a few minutes after too many failures
function createLoginGuard(maxFailures, lockMinutes) {
  const failures = new Map();
  return {
    lockedFor(key) {
      const rec = failures.get(key);
      if (rec && rec.lockedUntil > Date.now()) return Math.ceil((rec.lockedUntil - Date.now()) / 60000);
      return 0;
    },
    fail(key) {
      const rec = failures.get(key);
      const count = (rec && rec.lockedUntil === 0 ? rec.count : 0) + 1;
      const lockedUntil = count >= maxFailures ? Date.now() + lockMinutes * 60000 : 0;
      failures.set(key, { count: lockedUntil ? 0 : count, lockedUntil });
      return { attemptsLeft: Math.max(maxFailures - count, 0), locked: !!lockedUntil };
    },
    clear(key) {
      failures.delete(key);
    }
  };
}

function clientIp(req) {
  return (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').toString().split(',')[0].trim();
}

module.exports = {
  signToken, readToken, bearerToken,
  hashAdminPassword, verifyAdminPassword,
  encrypt, decrypt,
  randomToken, sha256,
  isEmail, strongPassword, PASSWORD_RULE, normalisePhone,
  createLoginGuard, clientIp
};
