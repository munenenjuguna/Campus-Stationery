// utils/audit.js
// Writes one line to the audit_log table for every important action:
// logins, registrations, orders, payments and every admin change.

const db = require('../config/db');
const { clientIp } = require('./security');

async function audit(req, { actorType = 'system', actorId = null, actorEmail = null, action, table = null, recordId = null, details = null }) {
  try {
    await db.query(
      `INSERT INTO audit_log (actor_type, actor_id, actor_email, action, table_name, record_id, details, ip_address)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [actorType, actorId, actorEmail, action, table, recordId == null ? null : String(recordId),
        details ? JSON.stringify(details).slice(0, 4000) : null, req ? clientIp(req) : null]
    );
  } catch (err) {
    // The audit trail must never stop the real action from working
    console.error('Audit log write failed:', err.message);
  }
}

module.exports = audit;
