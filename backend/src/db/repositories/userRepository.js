const { pool } = require("../connection");

async function findById(id) {
  const result = await pool.query("SELECT * FROM users WHERE id = $1", [id]);
  return result.rows[0] || null;
}

async function findByUsernameHash(uHash) {
  const result = await pool.query("SELECT * FROM users WHERE username_hash = $1", [uHash]);
  return result.rows[0] || null;
}

async function checkUsernameExists(cleanUser, uHash) {
  const result = await pool.query(
    "SELECT id FROM users WHERE username_hash = $1 OR username = $2",
    [uHash, cleanUser]
  );
  return result.rows.length > 0;
}

async function createUser({ maskedName, passHash, uHash, encUser }) {
  const result = await pool.query(
    "INSERT INTO users (username, password, username_hash, encrypted_username) VALUES ($1, $2, $3, $4) RETURNING id",
    [maskedName, passHash, uHash, encUser]
  );
  return result.rows[0];
}

async function updatePassword(userId, passwordHash) {
  await pool.query("UPDATE users SET password = $1 WHERE id = $2", [passwordHash, userId]);
}

async function updatePrivacyInfo(userId, { uHash, encUser, maskedName }) {
  await pool.query(
    "UPDATE users SET username_hash = $1, encrypted_username = $2, username = $3 WHERE id = $4",
    [uHash, encUser, maskedName, userId]
  );
}

async function deleteUser(userId) {
  const result = await pool.query("DELETE FROM users WHERE id = $1 RETURNING id", [userId]);
  return result.rows.length > 0;
}

async function getAllUsersWithStats() {
  const result = await pool.query(`
    SELECT
      u.id,
      COALESCE((SELECT SUM(f.size_bytes) FROM files f WHERE f.owner_id = u.id), 0) AS total_bytes
    FROM users u
    ORDER BY u.id ASC
  `);
  return result.rows;
}

async function getUserCount() {
  const result = await pool.query("SELECT COUNT(*) AS count FROM users");
  return parseInt(result.rows[0].count, 10);
}

module.exports = {
  findById,
  findByUsernameHash,
  checkUsernameExists,
  createUser,
  updatePassword,
  updatePrivacyInfo,
  deleteUser,
  getAllUsersWithStats,
  getUserCount,
};
