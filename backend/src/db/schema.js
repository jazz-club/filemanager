const crypto = require("crypto");
const { pool } = require("./connection");
const {
  encrypt,
  encryptText,
  decryptText,
  encryptJson,
  blindIndex,
  auditOwnerKey,
} = require("../crypto");

async function initDB() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      username VARCHAR(255) UNIQUE NOT NULL,
      password TEXT NOT NULL,
      username_hash VARCHAR(64) UNIQUE,
      encrypted_username TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS folders (
      id SERIAL PRIMARY KEY,
      owner_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      name VARCHAR(255) NOT NULL,
      name_hash VARCHAR(64),
      parent_id INTEGER REFERENCES folders(id) ON DELETE CASCADE,
      color VARCHAR(32) DEFAULT '#ffffff',
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS files (
      id SERIAL PRIMARY KEY,
      owner_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      folder_id INTEGER REFERENCES folders(id) ON DELETE SET NULL,
      original_name TEXT NOT NULL,
      storage_key TEXT NOT NULL,
      size_bytes BIGINT NOT NULL DEFAULT 0,
      mime_type TEXT NOT NULL DEFAULT 'application/octet-stream',
      sha256 TEXT,
      download_token VARCHAR(64) UNIQUE,
      metadata JSONB DEFAULT '{}',
      uploaded_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS session (
      sid VARCHAR NOT NULL PRIMARY KEY,
      sess JSON NOT NULL,
      expire TIMESTAMPTZ NOT NULL
    );

    CREATE TABLE IF NOT EXISTS system_settings (
      key VARCHAR(64) PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS login_attempts (
      identifier VARCHAR(255) PRIMARY KEY,
      failed_count INTEGER NOT NULL DEFAULT 0,
      first_failed_at TIMESTAMPTZ DEFAULT NOW(),
      last_failed_at TIMESTAMPTZ DEFAULT NOW(),
      locked_until TIMESTAMPTZ
    );

    CREATE TABLE IF NOT EXISTS file_shares (
      id SERIAL PRIMARY KEY,
      file_id INTEGER REFERENCES files(id) ON DELETE CASCADE,
      owner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      share_token VARCHAR(64) UNIQUE NOT NULL,
      is_public BOOLEAN NOT NULL DEFAULT true,
      allow_download BOOLEAN NOT NULL DEFAULT true,
      access_type VARCHAR(16) NOT NULL DEFAULT 'view',
      max_views INTEGER,
      max_downloads INTEGER,
      is_batch BOOLEAN NOT NULL DEFAULT false,
      title TEXT,
      views_count INTEGER NOT NULL DEFAULT 0,
      downloads_count INTEGER NOT NULL DEFAULT 0,
      saves_count INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      expires_at TIMESTAMPTZ
    );

    CREATE TABLE IF NOT EXISTS file_share_items (
      id SERIAL PRIMARY KEY,
      share_id INTEGER NOT NULL REFERENCES file_shares(id) ON DELETE CASCADE,
      file_id INTEGER NOT NULL REFERENCES files(id) ON DELETE CASCADE,
      display_name TEXT
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      username VARCHAR(255),
      event VARCHAR(64) NOT NULL,
      action TEXT NOT NULL,
      level VARCHAR(16) NOT NULL DEFAULT 'INFO',
      outcome VARCHAR(16) NOT NULL DEFAULT 'SUCCESS',
      status_code INTEGER DEFAULT 200,
      ip VARCHAR(64),
      method VARCHAR(16),
      path TEXT,
      item_type VARCHAR(32),
      item_id INTEGER,
      item_name TEXT,
      details JSONB DEFAULT '{}',
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    ALTER TABLE files ADD COLUMN IF NOT EXISTS sha256 TEXT;
    ALTER TABLE files ADD COLUMN IF NOT EXISTS folder_id INTEGER REFERENCES folders(id) ON DELETE SET NULL;
    ALTER TABLE files ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}';
    ALTER TABLE files ADD COLUMN IF NOT EXISTS download_token VARCHAR(64) UNIQUE;
    ALTER TABLE folders ADD COLUMN IF NOT EXISTS color VARCHAR(32) DEFAULT '#ffffff';
    ALTER TABLE folders ADD COLUMN IF NOT EXISTS name_hash VARCHAR(64);
    ALTER TABLE files DROP COLUMN IF EXISTS deleted_at;
    ALTER TABLE folders DROP COLUMN IF EXISTS deleted_at;
    DROP TABLE IF EXISTS file_share_recipients;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS username_hash VARCHAR(64) UNIQUE;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS encrypted_username TEXT;
    ALTER TABLE audit_logs DROP COLUMN IF EXISTS ip;
    ALTER TABLE audit_logs DROP CONSTRAINT IF EXISTS audit_logs_user_id_fkey;
    ALTER TABLE audit_logs ALTER COLUMN user_id TYPE VARCHAR(64) USING user_id::text;
    DELETE FROM login_attempts WHERE identifier NOT LIKE 'rl:v1:%';

    ALTER TABLE file_shares ALTER COLUMN file_id DROP NOT NULL;
    ALTER TABLE file_shares ADD COLUMN IF NOT EXISTS is_batch BOOLEAN NOT NULL DEFAULT false;
    ALTER TABLE file_shares ADD COLUMN IF NOT EXISTS access_type VARCHAR(16) NOT NULL DEFAULT 'view';
    ALTER TABLE file_shares ADD COLUMN IF NOT EXISTS max_views INTEGER;
    ALTER TABLE file_shares ADD COLUMN IF NOT EXISTS max_downloads INTEGER;
    UPDATE file_shares SET allow_download = true WHERE allow_download = false;
    ALTER TABLE file_shares ADD COLUMN IF NOT EXISTS title TEXT;
    ALTER TABLE file_shares ADD COLUMN IF NOT EXISTS views_count INTEGER NOT NULL DEFAULT 0;
    ALTER TABLE file_shares ADD COLUMN IF NOT EXISTS downloads_count INTEGER NOT NULL DEFAULT 0;
    ALTER TABLE file_shares ADD COLUMN IF NOT EXISTS saves_count INTEGER NOT NULL DEFAULT 0;
    ALTER TABLE file_shares ADD COLUMN IF NOT EXISTS password_hash TEXT;

    CREATE INDEX IF NOT EXISTS idx_files_owner_folder ON files (owner_id, folder_id);
    CREATE INDEX IF NOT EXISTS idx_files_download_token ON files (download_token);
    CREATE INDEX IF NOT EXISTS idx_folders_owner_parent ON folders (owner_id, parent_id);
    CREATE INDEX IF NOT EXISTS idx_session_expire ON session (expire);
    CREATE INDEX IF NOT EXISTS idx_login_attempts_locked ON login_attempts (locked_until);
    CREATE INDEX IF NOT EXISTS idx_file_shares_token ON file_shares (share_token);
    CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON audit_logs (user_id);
    CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs (created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_audit_logs_event ON audit_logs (event);
    CREATE INDEX IF NOT EXISTS idx_file_shares_file ON file_shares (file_id);
    CREATE INDEX IF NOT EXISTS idx_file_shares_owner ON file_shares (owner_id);
    CREATE INDEX IF NOT EXISTS idx_file_share_items_share ON file_share_items (share_id);
    CREATE INDEX IF NOT EXISTS idx_file_share_items_file ON file_share_items (file_id);
    INSERT INTO system_settings (key, value) VALUES ('allow_registration', 'true')
    ON CONFLICT (key) DO NOTHING;
  `);

  await migrateSensitiveMetadata();

  try {
    const unmigratedTokens = await pool.query("SELECT id FROM files WHERE download_token IS NULL");
    for (const f of unmigratedTokens.rows) {
      const token = crypto.randomBytes(16).toString("hex");
      await pool.query("UPDATE files SET download_token = $1 WHERE id = $2", [token, f.id]);
    }
  } catch (tokenErr) {
    console.error("Download token migration error:", tokenErr);
  }

  try {
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

async function migrateSensitiveMetadata() {
  const files = await pool.query(
    `SELECT id, original_name, storage_key, mime_type, sha256, metadata
     FROM files
     WHERE original_name NOT LIKE 'enc:v1:%'
        OR storage_key NOT LIKE 'enc:v1:%'
        OR mime_type NOT LIKE 'enc:v1:%'
        OR (sha256 IS NOT NULL AND sha256 NOT LIKE 'enc:v1:%')
        OR COALESCE(metadata->>'pke:v1', '') = ''`
  );
  for (const row of files.rows) {
    await pool.query(
      `UPDATE files SET original_name = $1, storage_key = $2, mime_type = $3, sha256 = $4, metadata = $5 WHERE id = $6`,
      [
        encryptText(row.original_name),
        encryptText(row.storage_key),
        encryptText(row.mime_type),
        row.sha256 === null ? null : encryptText(row.sha256),
        encryptJson(row.metadata || {}),
        row.id,
      ]
    );
  }

  const folders = await pool.query(
    "SELECT id, name, name_hash FROM folders WHERE name NOT LIKE 'enc:v1:%' OR name_hash IS NULL"
  );
  for (const row of folders.rows) {
    const name = decryptText(row.name);
    await pool.query("UPDATE folders SET name = $1, name_hash = $2 WHERE id = $3", [
      encryptText(name),
      blindIndex(name),
      row.id,
    ]);
  }

  const titles = await pool.query(
    "SELECT id, title FROM file_shares WHERE title IS NOT NULL AND title NOT LIKE 'enc:v1:%'"
  );
  for (const row of titles.rows) {
    await pool.query("UPDATE file_shares SET title = $1 WHERE id = $2", [
      encryptText(row.title),
      row.id,
    ]);
  }

  const displayNames = await pool.query(
    "SELECT id, display_name FROM file_share_items WHERE display_name IS NOT NULL AND display_name NOT LIKE 'enc:v1:%'"
  );
  for (const row of displayNames.rows) {
    await pool.query("UPDATE file_share_items SET display_name = $1 WHERE id = $2", [
      encryptText(row.display_name),
      row.id,
    ]);
  }

  const auditRows = await pool.query(
    `SELECT id, user_id, username, action, path, item_id, item_name, details FROM audit_logs
     WHERE (username IS NOT NULL AND username NOT LIKE 'enc:v1:%')
        OR action NOT LIKE 'enc:v1:%'
        OR (path IS NOT NULL AND path NOT LIKE 'enc:v1:%')
        OR (item_name IS NOT NULL AND item_name NOT LIKE 'enc:v1:%')
        OR (user_id IS NOT NULL AND user_id !~ '^[a-f0-9]{64}$')
        OR item_id IS NOT NULL
        OR COALESCE(details->>'pke:v1', '') = ''`
  );
  for (const row of auditRows.rows) {
    await pool.query(
      "UPDATE audit_logs SET username = $1, action = $2, path = $3, item_id = NULL, item_name = $4, details = $5, user_id = $6 WHERE id = $7",
      [
        row.username === null ? null : encryptText(row.username),
        encryptText(row.action),
        row.path && !String(row.path).startsWith("enc:v1:") ? encryptText(row.path) : row.path,
        row.item_name === null ? null : encryptText(row.item_name),
        encryptJson(row.details || {}),
        row.user_id && !/^[a-f0-9]{64}$/.test(String(row.user_id))
          ? auditOwnerKey(row.user_id)
          : row.user_id,
        row.id,
      ]
    );
  }
  await pool.query("UPDATE audit_logs SET item_id = NULL WHERE item_id IS NOT NULL");
}

module.exports = {
  initDB,
};
