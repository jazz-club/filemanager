const { pool } = require("../connection");

async function findByIdentifier(identifier) {
  const result = await pool.query(
    "SELECT failed_count, last_failed_at, locked_until FROM login_attempts WHERE identifier = $1",
    [identifier]
  );
  return result.rows[0] || null;
}

async function deleteByIdentifier(identifier) {
  await pool.query("DELETE FROM login_attempts WHERE identifier = $1", [identifier]);
}

async function saveAttempt({ identifier, failedCount, attemptedAt, lockedUntil }) {
  await pool.query(
    `INSERT INTO login_attempts (identifier, failed_count, first_failed_at, last_failed_at, locked_until)
     VALUES ($1, $2, $3, $3, $4)
     ON CONFLICT (identifier) DO UPDATE
     SET failed_count = $2,
         last_failed_at = $3,
         locked_until = $4`,
    [identifier, failedCount, attemptedAt, lockedUntil]
  );
}

module.exports = { findByIdentifier, deleteByIdentifier, saveAttempt };
