// utils/twofactor.js
// Two factor authentication (2FA) shared by the admin panel and the shop.
//
// After the password is accepted, the person must also enter a 6 digit code:
//   * "app"   : a code from an authenticator app (Google Authenticator, Microsoft Authenticator,
//               Authy...). The codes follow the TOTP standard (RFC 6238): they change every
//               30 seconds and are worked out from a secret key shared once through a QR code.
//   * "email" : a one time code sent by email. Without email settings in .env the code is
//               printed in the server window, which is enough for a demonstration.
//
// Pending logins ("challenges") are kept in memory for 5 minutes. A restart simply means
// signing in again. Only a hash of each email code is kept, never the code itself.

const crypto = require('crypto');
const QRCode = require('qrcode');
const { sendMail, isConfigured } = require('./mailer');
const { encrypt, decrypt, sha256 } = require('./security');

const ISSUER = 'CampusStationery';
const CODE_MINUTES = 5;
const MAX_CODE_ATTEMPTS = 5;
const RESEND_SECONDS = 30;

/* ---------------- base32 (the format authenticator apps use for keys) ---------------- */

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function base32Encode(buffer) {
  let bits = 0, value = 0, output = '';
  for (const byte of buffer) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) output += ALPHABET[(value << (5 - bits)) & 31];
  return output;
}

function base32Decode(text) {
  const clean = String(text).toUpperCase().replace(/[\s=]/g, '');
  let bits = 0, value = 0;
  const bytes = [];
  for (const ch of clean) {
    const index = ALPHABET.indexOf(ch);
    if (index === -1) throw new Error('Invalid key');
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

/* ---------------- TOTP codes (RFC 6238) ---------------- */

function newSecret() {
  return base32Encode(crypto.randomBytes(20));
}

function hotp(key, counter, digits = 6) {
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(counter));
  const hmac = crypto.createHmac('sha1', key).update(msg).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const number = ((hmac[offset] & 0x7f) << 24) | (hmac[offset + 1] << 16) | (hmac[offset + 2] << 8) | hmac[offset + 3];
  return String(number % 10 ** digits).padStart(digits, '0');
}

function totp(secret, timeMs = Date.now(), step = 30, digits = 6) {
  return hotp(base32Decode(secret), Math.floor(timeMs / 1000 / step), digits);
}

// The last time step used by each account, so the same app code cannot be used twice
const usedSteps = new Map();

// Accepts the code for now, 30 seconds ago or 30 seconds ahead, to allow for a slow phone clock
function verifyTotp(secret, code, accountKey = '') {
  const clean = String(code || '').replace(/\s/g, '');
  if (!/^\d{6}$/.test(clean)) return false;
  let key;
  try { key = base32Decode(secret); } catch (e) { return false; }
  const now = Math.floor(Date.now() / 1000 / 30);
  for (let drift = -1; drift <= 1; drift++) {
    const step = now + drift;
    const expected = hotp(key, step);
    if (crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(clean))) {
      if (accountKey && usedSteps.get(accountKey) >= step) return false;
      if (accountKey) usedSteps.set(accountKey, step);
      return true;
    }
  }
  return false;
}

// Builds the QR code that an authenticator app scans to add the account
async function setupDetails(secret, accountEmail) {
  const label = encodeURIComponent(`${ISSUER}:${accountEmail}`);
  const url = `otpauth://totp/${label}?secret=${secret}&issuer=${encodeURIComponent(ISSUER)}&algorithm=SHA1&digits=6&period=30`;
  const qr = await QRCode.toDataURL(url, { margin: 1, width: 220, color: { dark: '#172b4d', light: '#ffffff' } });
  return { secret, otpauthUrl: url, qr, formattedSecret: secret.match(/.{1,4}/g).join(' ') };
}

/* ---------------- pending logins ---------------- */

const challenges = new Map();

function sweep() {
  const now = Date.now();
  for (const [id, c] of challenges) if (c.expires < now) challenges.delete(id);
}

function maskEmail(email) {
  const [name, domain] = String(email).split('@');
  if (!domain) return email;
  return `${name.slice(0, 2)}${'*'.repeat(Math.max(name.length - 2, 3))}@${domain}`;
}

function newEmailCode() {
  const code = String(crypto.randomInt(0, 1000000)).padStart(6, '0');
  return { code, hash: sha256(code) };
}

async function sendEmailCode(challenge) {
  const { code, hash } = newEmailCode();
  challenge.codeHash = hash;
  challenge.sentAt = Date.now();
  challenge.expires = Date.now() + CODE_MINUTES * 60000;
  await sendMail({
    to: challenge.email,
    subject: `Your ${ISSUER} sign in code: ${code}`,
    text: `Hello ${challenge.name || ''},\n\nYour ${ISSUER} sign in code is ${code}\n\n` +
      `It expires in ${CODE_MINUTES} minutes. If you did not try to sign in, change your password straight away.\n`
  });
}

// What the browser is told about where the code is
function describe(id, challenge) {
  const viaApp = challenge.method === 'app';
  return {
    twoFactor: true,
    challenge: id,
    method: challenge.method,
    sentTo: viaApp ? null : maskEmail(challenge.email),
    message: viaApp
      ? 'Open your authenticator app and enter the 6 digit code for CampusStationery.'
      : isConfigured()
        ? `We sent a 6 digit code to ${maskEmail(challenge.email)}. It expires in ${CODE_MINUTES} minutes.`
        : `Email is not set up on this server, so the 6 digit code is shown in the server window. It expires in ${CODE_MINUTES} minutes.`,
    canUseEmail: viaApp
  };
}

// Starts the second step after a correct password.
// account: { type: 'admin' | 'customer', id, email, name, appSecretEncrypted }
async function startChallenge(account) {
  sweep();
  const secret = account.appSecretEncrypted ? decrypt(account.appSecretEncrypted) : null;
  const challenge = {
    type: account.type,
    accountId: account.id,
    email: account.email,
    name: account.name,
    method: secret ? 'app' : 'email',
    secret,
    attempts: 0,
    expires: Date.now() + CODE_MINUTES * 60000
  };
  if (challenge.method === 'email') await sendEmailCode(challenge);
  const id = crypto.randomBytes(24).toString('hex');
  challenges.set(id, challenge);
  return describe(id, challenge);
}

// Checks the 6 digit code. Returns { ok, challenge } or { ok: false, status, error }
function verifyChallenge(id, code, type) {
  const challenge = challenges.get(String(id || ''));
  if (!challenge || challenge.type !== type || challenge.expires < Date.now()) {
    challenges.delete(String(id || ''));
    return { ok: false, status: 410, error: 'This sign in has expired. Please enter your email and password again.' };
  }
  const clean = String(code || '').replace(/\s/g, '');
  if (!/^\d{6}$/.test(clean)) return { ok: false, status: 400, error: 'Enter the 6 digit code.' };

  const good = challenge.method === 'app'
    ? verifyTotp(challenge.secret, clean, `${type}:${challenge.accountId}`)
    : crypto.timingSafeEqual(Buffer.from(sha256(clean)), Buffer.from(challenge.codeHash));

  if (good) {
    challenges.delete(id);
    return { ok: true, challenge };
  }
  challenge.attempts++;
  const left = MAX_CODE_ATTEMPTS - challenge.attempts;
  if (left <= 0) {
    challenges.delete(id);
    return { ok: false, status: 429, error: 'Too many wrong codes. Please sign in again.', challenge, finished: true };
  }
  return { ok: false, status: 401, error: `That code is not correct. ${left} attempt(s) left.`, challenge };
}

// Sends a new email code, or switches an app login to an email code (for a lost phone)
async function resendChallenge(id, type) {
  const challenge = challenges.get(String(id || ''));
  if (!challenge || challenge.type !== type || challenge.expires < Date.now()) {
    return { ok: false, status: 410, error: 'This sign in has expired. Please enter your email and password again.' };
  }
  if (challenge.method === 'email' && challenge.sentAt && Date.now() - challenge.sentAt < RESEND_SECONDS * 1000) {
    const wait = Math.ceil((RESEND_SECONDS * 1000 - (Date.now() - challenge.sentAt)) / 1000);
    return { ok: false, status: 429, error: `Please wait ${wait} seconds before asking for another code.` };
  }
  challenge.method = 'email';
  challenge.attempts = 0;
  await sendEmailCode(challenge);
  return { ok: true, ...describe(id, challenge) };
}

module.exports = {
  newSecret, totp, verifyTotp, setupDetails,
  startChallenge, verifyChallenge, resendChallenge,
  encrypt, decrypt, maskEmail,
  CODE_MINUTES
};
