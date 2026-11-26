const { pool } = require("./connection");

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

    CREATE TABLE IF NOT EXISTS share_unlock_attempts (
      key_hash VARCHAR(64) PRIMARY KEY,
      failed_count INTEGER NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
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
      password_hash TEXT,
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
      user_id VARCHAR(64),
      username VARCHAR(255),
      event VARCHAR(64) NOT NULL,
      action TEXT NOT NULL,
      level VARCHAR(16) NOT NULL DEFAULT 'INFO',
      outcome VARCHAR(16) NOT NULL DEFAULT 'SUCCESS',
      status_code INTEGER DEFAULT 200,
      method VARCHAR(16),
      path TEXT,
      item_type VARCHAR(32),
      item_id INTEGER,
      item_name TEXT,
      details JSONB DEFAULT '{}',
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_files_owner_folder ON files (owner_id, folder_id);
    CREATE INDEX IF NOT EXISTS idx_files_download_token ON files (download_token);
    CREATE INDEX IF NOT EXISTS idx_folders_owner_parent ON folders (owner_id, parent_id);
    CREATE INDEX IF NOT EXISTS idx_session_expire ON session (expire);
    CREATE INDEX IF NOT EXISTS idx_login_attempts_locked ON login_attempts (locked_until);
    CREATE INDEX IF NOT EXISTS idx_share_unlock_attempts_expires ON share_unlock_attempts (expires_at);
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
}

module.exports = {
  initDB,
};
