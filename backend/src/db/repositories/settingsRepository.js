const { pool } = require("../connection");

async function getSetting(key) {
  const result = await pool.query("SELECT value FROM system_settings WHERE key = $1", [key]);
  return result.rows[0]?.value ?? null;
}

async function setSetting(key, value) {
  await pool.query(
    `INSERT INTO system_settings (key, value, updated_at)
     VALUES ($1, $2, NOW())
     ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = NOW()`,
    [key, String(value)]
  );
}

async function isRegistrationAllowed() {
  const val = await getSetting("allow_registration");
  return val === null || val === "true";
}

async function setRegistrationAllowed(allowed) {
  await setSetting("allow_registration", allowed ? "true" : "false");
}

module.exports = {
  getSetting,
  setSetting,
  isRegistrationAllowed,
  setRegistrationAllowed,
};
