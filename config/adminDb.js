// config/adminDb.js
// Kept so older code that requires this file still works.
// The admin panel now shares the single connection pool defined in config/db.js.

module.exports = require('./db');
