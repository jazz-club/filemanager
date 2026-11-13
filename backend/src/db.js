const { Pool } = require("pg");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// TODO; uh, all of this, properly
async function initDB() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      username VARCHAR(255) UNIQUE NOT NULL,
      password TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS files (
      id SERIAL PRIMARY KEY,
      owner_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      original_name TEXT NOT NULL,
      storage_key TEXT NOT NULL,
      size_bytes BIGINT NOT NULL DEFAULT 0,
      mime_type TEXT NOT NULL DEFAULT 'application/octet-stream',
      sha256 TEXT,
      uploaded_at TIMESTAMPTZ DEFAULT NOW()
    );

    ALTER TABLE files ADD COLUMN IF NOT EXISTS sha256 TEXT;
    ALTER TABLE files ALTER COLUMN nonce DROP NOT NULL;

    CREATE TABLE IF NOT EXISTS folders (
      id SERIAL PRIMARY KEY,
      owner_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      name VARCHAR(255) NOT NULL,
      parent_id INTEGER REFERENCES folders(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    ALTER TABLE files ADD COLUMN IF NOT EXISTS folder_id INTEGER REFERENCES folders(id) ON DELETE SET NULL;
    ALTER TABLE folders ADD COLUMN IF NOT EXISTS color VARCHAR(32) DEFAULT '#ffffff';

    ALTER TABLE users ADD COLUMN IF NOT EXISTS username_hash VARCHAR(64) UNIQUE;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS encrypted_username TEXT;

    CREATE INDEX IF NOT EXISTS idx_files_owner_folder ON files (owner_id, folder_id);
    CREATE INDEX IF NOT EXISTS idx_folders_owner_parent ON folders (owner_id, parent_id);

    CREATE TABLE IF NOT EXISTS session (
      sid VARCHAR NOT NULL PRIMARY KEY,
      sess JSON NOT NULL,
      expire TIMESTAMPTZ NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_session_expire ON session (expire);

    CREATE TABLE IF NOT EXISTS system_settings (
      key VARCHAR(64) PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    INSERT INTO system_settings (key, value) VALUES ('allow_registration', 'true')
    ON CONFLICT (key) DO NOTHING;
  `);

  try {
    const crypto = require("crypto");
    const { encrypt } = require("./crypto");
    const unmigrated = await pool.query(
      "SELECT id, username FROM users WHERE username_hash IS NULL"
    );
    for (const u of unmigrated.rows) {
      const clean = (u.username || "").trim();
      if (!clean) continue;
      const salt = process.env.ENCRYPTION_SALT || "vault_salt";
      const uHash = crypto.createHmac("sha256", salt).update(clean.toLowerCase()).digest("hex");
      const enc = encrypt(Buffer.from(clean, "utf8")).ciphertext.toString("base64");
      const masked = "usr_" + uHash.slice(0, 10);
      await pool.query(
        "UPDATE users SET username_hash = $1, encrypted_username = $2, username = $3 WHERE id = $4",
        [uHash, enc, masked, u.id]
      );
    }
  } catch (migErr) {
    console.error("User privacy migration error:", migErr);
  }
}

module.exports = { pool, initDB };
