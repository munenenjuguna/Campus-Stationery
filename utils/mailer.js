// utils/mailer.js
// Sends emails (password reset links) through any SMTP account, for example Gmail.
// Set SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS and MAIL_FROM in .env to switch it on.
// Without those settings the email is printed in the server window instead, which is
// enough for testing on a laptop.

let nodemailer = null;
try { nodemailer = require('nodemailer'); } catch (e) { nodemailer = null; }

function isConfigured() {
  return !!(nodemailer && process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
}

let transporter = null;
function getTransporter() {
  if (!transporter) {
    const port = Number(process.env.SMTP_PORT) || 587;
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port,
      secure: port === 465,
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
    });
  }
  return transporter;
}

async function sendMail({ to, subject, text, html }) {
  if (!isConfigured()) {
    console.log('\n================ EMAIL (not sent: SMTP not set up in .env) ================');
    console.log(`To: ${to}\nSubject: ${subject}\n\n${text}`);
    console.log('============================================================================\n');
    return { delivered: false };
  }
  await getTransporter().sendMail({
    from: process.env.MAIL_FROM || process.env.SMTP_USER,
    to, subject, text, html
  });
  return { delivered: true };
}

module.exports = { sendMail, isConfigured };
