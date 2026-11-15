// scripts/reset-admin.js
// Recovery tool for when every super admin is locked out (forgotten password or lost phone).
// Run on the server computer, in the project folder:
//   npm run reset-admin                                   resets admin@campusstationery.com to Admin@123
//   npm run reset-admin -- someone@example.com NewPass123  resets (or creates) that super admin

require('dotenv').config({ quiet: true });
const db = require('../config/db');
const { ensureSchema, DEFAULT_ADMIN } = require('../config/schema');
const { hashAdminPassword, strongPassword, isEmail } = require('../utils/security');
const audit = require('../utils/audit');

(async () => {
  const email = (process.argv[2] || DEFAULT_ADMIN.email).toLowerCase();
  const password = process.argv[3] || DEFAULT_ADMIN.password;
  if (!isEmail(email)) throw new Error('That email address is not valid.');
  if (!strongPassword(password)) throw new Error('Password needs at least 8 characters, with letters and numbers.');

  await ensureSchema();
  const [rows] = await db.query('SELECT id FROM admins WHERE email = ?', [email]);
  if (rows.length) {
    // Also removes a linked authenticator app, in case the phone was lost. Sign in codes then come by email.
    await db.query("UPDATE admins SET password_hash = ?, role = 'super_admin', is_active = 1, twofa_secret = NULL, twofa_enabled = 0 WHERE id = ?", [hashAdminPassword(password), rows[0].id]);
  } else {
    await db.query("INSERT INTO admins (full_name, email, password_hash, role) VALUES (?, ?, ?, 'super_admin')", ['Recovered Administrator', email, hashAdminPassword(password)]);
  }
  await audit(null, { actorType: 'system', actorEmail: 'reset-admin script', action: 'RESET_ADMIN_PASSWORD', table: 'admins', recordId: email });
  console.log(`Done. Log in to the admin panel as ${email} with password ${password}, then change it under "Security".`);
  console.log('Sign in codes for two factor authentication will come by email (or appear in the server window).');
  process.exit(0);
})().catch(err => {
  console.error('Could not reset the admin: ' + err.message);
  process.exit(1);
});
