// utils/dbErrors.js
// Turns raw MySQL error codes into messages a person can act on.

function connectionHint(err) {
  const text = String((err && err.message) || '');
  if (/insecure transport|requires? (a )?secure|SSL connection is required|ssl.*required/i.test(text)) {
    return 'This online database only accepts encrypted connections. Set DB_SSL=true in the settings, then restart.';
  }
  if (/certificate|self[- ]signed|unable to verify/i.test(text)) {
    return 'The database certificate could not be checked. Set DB_SSL_CA to the certificate from your database provider.';
  }
  switch (err && err.code) {
    case 'ETIMEDOUT':
      return 'The database did not answer in time. Check DB_HOST and DB_PORT (online databases often use port 4000 or 25060), and that the service is running.';
    case 'ECONNREFUSED':
      return 'MySQL is not running or is on a different port. Start MySQL in XAMPP and check DB_PORT in your .env file.';
    case 'ER_ACCESS_DENIED_ERROR':
      return 'MySQL rejected the user name or password. Check DB_USER, DB_PASSWORD and DB_PORT in your .env file.';
    case 'ER_DBACCESS_DENIED_ERROR':
      return 'This MySQL user is not allowed to use the database. Use the root user or grant access.';
    case 'ENOTFOUND':
      return 'The database host could not be found. Check DB_HOST in your .env file.';
    default:
      return null;
  }
}

// Friendly messages for errors caused by the data a user entered
function dataError(err) {
  switch (err && err.code) {
    case 'ER_DUP_ENTRY':
      return 'A record with that value already exists.';
    case 'ER_ROW_IS_REFERENCED':
    case 'ER_ROW_IS_REFERENCED_2':
      return 'This record is linked to other records (for example orders), so it cannot be deleted. Remove or update those first.';
    case 'ER_NO_REFERENCED_ROW':
    case 'ER_NO_REFERENCED_ROW_2':
      return 'One of the linked records you picked does not exist.';
    case 'ER_TRUNCATED_WRONG_VALUE':
    case 'ER_TRUNCATED_WRONG_VALUE_FOR_FIELD':
    case 'WARN_DATA_TRUNCATED':
      return 'One of the values has the wrong format.';
    case 'ER_BAD_NULL_ERROR':
      return 'A required field is empty.';
    case 'ER_DATA_TOO_LONG':
      return 'One of the values is too long.';
    case 'ER_CHECK_CONSTRAINT_VIOLATED':
    case 'ER_CONSTRAINT_FAILED':
      return 'One of the values is not allowed (for example a negative number).';
    case 'ER_WARN_DATA_OUT_OF_RANGE':
      return 'A number is out of the allowed range.';
    default:
      return null;
  }
}

module.exports = { connectionHint, dataError };
