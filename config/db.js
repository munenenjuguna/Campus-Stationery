// config/db.js
// One shared MySQL connection pool for the whole backend (shop API and admin panel).
// Connection details come from the .env file (or the hosting provider's settings),
// so each computer or server can use its own database.
//
// Two ways to give the details:
//   1. DB_HOST, DB_PORT, DB_USER, DB_PASSWORD and DB_NAME (XAMPP on a laptop)
//   2. DATABASE_URL=mysql://user:password@host:port/database (most online database services)
// Online databases usually need an encrypted connection: set DB_SSL=true, and DB_SSL_CA
// to the provider's certificate if they give you one.

const fs = require('fs');
const mysql = require('mysql2');
require('dotenv').config({ quiet: true });

function fromUrl(text) {
  try {
    const url = new URL(text);
    if (!/^mysql/.test(url.protocol)) return null;
    return {
      host: url.hostname,
      port: Number(url.port) || 3306,
      user: decodeURIComponent(url.username),
      password: decodeURIComponent(url.password),
      database: decodeURIComponent(url.pathname.replace(/^\//, '')) || null,
      sslRequired: /ssl/i.test(url.search) && !/ssl[-_]?mode=disabled/i.test(url.search)
    };
  } catch (e) {
    return null;
  }
}

const url = process.env.DATABASE_URL ? fromUrl(process.env.DATABASE_URL) : null;

// A DATABASE_URL is a complete address, so its database name wins over DB_NAME
const DB_NAME = (url && url.database) || process.env.DB_NAME || 'school_project_db';

// Encrypted connection settings for online databases
function sslSettings() {
  const mode = String(process.env.DB_SSL || '').toLowerCase();
  const wanted = ['true', '1', 'required', 'yes'].includes(mode) || (url && url.sslRequired) || !!process.env.DB_SSL_CA || !!process.env.DB_SSL_CA_FILE;
  if (!wanted || mode === 'false') return undefined;
  const ssl = { minVersion: 'TLSv1.2', rejectUnauthorized: true };
  if (process.env.DB_SSL_CA) ssl.ca = process.env.DB_SSL_CA.replace(/\\n/g, '\n');
  else if (process.env.DB_SSL_CA_FILE) ssl.ca = fs.readFileSync(process.env.DB_SSL_CA_FILE, 'utf8');
  return ssl;
}

// Settings for a single connection (also used to create the database on first run)
const connectionSettings = {
  host: (url && url.host) || process.env.DB_HOST || 'localhost',
  port: (url && url.port) || Number(process.env.DB_PORT) || 3306,
  user: (url && url.user) || process.env.DB_USER || 'root',
  password: url ? url.password : (process.env.DB_PASSWORD || ''),
  ssl: sslSettings(),
  dateStrings: true // keep DATE and DATETIME values as plain text so they never shift by timezone
};

const pool = mysql.createPool({
  ...connectionSettings,
  database: DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  // Close idle connections after a minute. Online databases drop idle connections after a few
  // minutes, and an old dropped connection would make the next request fail.
  maxIdle: 2,
  idleTimeout: 60000,
  enableKeepAlive: true,
  connectTimeout: 20000
});

// Online database servers usually run on UTC. DB_TIMEZONE (for example +03:00 for Kenya)
// makes NOW() and "today" in reports match local time.
if (process.env.DB_TIMEZONE) {
  pool.on('connection', conn => conn.query('SET time_zone = ?', [process.env.DB_TIMEZONE]));
}

module.exports = pool.promise();

// Used by config/schema.js to create the database itself on first run
module.exports.connectionSettings = connectionSettings;
module.exports.settings = connectionSettings;
module.exports.DB_NAME = DB_NAME;
