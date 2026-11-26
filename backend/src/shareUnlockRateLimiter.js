const crypto = require("crypto");
const { pool } = require("./db/connection");

const MAX_ATTEMPTS = 8;
const WINDOW_MS = 15 * 60 * 1000;
const MAX_ACTIVE_KEYS = 20000;
const ADVISORY_LOCK_ID = 741258963;

function createPgStore() {
  return {
    async get(key) {
      const result = await pool.query(
        `SELECT failed_count, expires_at, EXTRACT(EPOCH FROM (expires_at - NOW())) AS remaining_seconds
         FROM share_unlock_attempts WHERE key_hash = $1 AND expires_at > NOW()`,
        [key]
      );
      if (!result.rows.length) return null;
      return {
        failedCount: result.rows[0].failed_count,
        expiresAt: new Date(result.rows[0].expires_at).getTime(),
        remainingSeconds: Math.max(1, Math.ceil(Number(result.rows[0].remaining_seconds))),
      };
    },

    async increment(key, windowMs, maxAttempts, maxActiveKeys) {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await client.query("SELECT pg_advisory_xact_lock($1)", [ADVISORY_LOCK_ID]);
        await client.query("DELETE FROM share_unlock_attempts WHERE expires_at <= NOW()");

        const current = await client.query(
          "SELECT failed_count, expires_at FROM share_unlock_attempts WHERE key_hash = $1 FOR UPDATE",
          [key]
        );
        let entry;
        if (current.rows.length) {
          const row = current.rows[0];
          const failedCount = Math.min(maxAttempts, Number(row.failed_count) + 1);
          const updated = await client.query(
            `UPDATE share_unlock_attempts SET failed_count = $2, updated_at = NOW()
             WHERE key_hash = $1 RETURNING failed_count, expires_at,
             EXTRACT(EPOCH FROM (expires_at - NOW())) AS remaining_seconds`,
            [key, failedCount]
          );
          entry = updated.rows[0];
        }

        if (!entry) {
          const count = await client.query(
            "SELECT COUNT(*)::int AS count FROM share_unlock_attempts WHERE expires_at > NOW()"
          );
          if (count.rows[0].count >= maxActiveKeys) {
            await client.query("COMMIT");
            return { capacityExceeded: true };
          }
          const inserted = await client.query(
            `INSERT INTO share_unlock_attempts (key_hash, failed_count, expires_at, updated_at)
             VALUES ($1, 1, NOW() + ($2 * INTERVAL '1 millisecond'), NOW())
             RETURNING failed_count, expires_at,
             EXTRACT(EPOCH FROM (expires_at - NOW())) AS remaining_seconds`,
            [key, windowMs]
          );
          entry = inserted.rows[0];
        }

        await client.query("COMMIT");
        return {
          failedCount: Number(entry.failed_count),
          expiresAt: new Date(entry.expires_at).getTime(),
          remainingSeconds: Math.max(1, Math.ceil(Number(entry.remaining_seconds))),
          limited: Number(entry.failed_count) >= maxAttempts,
        };
      } catch (err) {
        await client.query("ROLLBACK").catch(() => {});
        throw err;
      } finally {
        client.release();
      }
    },

    async clear(key) {
      await pool.query("DELETE FROM share_unlock_attempts WHERE key_hash = $1", [key]);
    },

    async pruneExpired() {
      await pool.query("DELETE FROM share_unlock_attempts WHERE expires_at <= NOW()");
    },
  };
}

function createShareUnlockRateLimiter(store, options = {}) {
  const maxAttempts = options.maxAttempts || MAX_ATTEMPTS;
  const windowMs = options.windowMs || WINDOW_MS;
  const maxActiveKeys = options.maxActiveKeys || MAX_ACTIVE_KEYS;
  const now = options.now || (() => Date.now());

  return {
    async check(key) {
      const entry = await store.get(key);
      const remainingMs =
        entry && entry.remainingSeconds !== undefined
          ? entry.remainingSeconds * 1000
          : entry
            ? entry.expiresAt - now()
            : 0;
      if (!entry || remainingMs <= 0 || entry.failedCount < maxAttempts) {
        return { limited: false, failedCount: entry ? entry.failedCount : 0 };
      }
      return {
        limited: true,
        failedCount: entry.failedCount,
        retryAfterSeconds: Math.max(1, Math.ceil(remainingMs / 1000)),
      };
    },

    async recordFailure(key) {
      const entry = await store.increment(key, windowMs, maxAttempts, maxActiveKeys);
      if (entry.capacityExceeded) return { capacityExceeded: true };
      return {
        limited: entry.limited,
        failedCount: entry.failedCount,
        retryAfterSeconds: Math.max(
          1,
          entry.remainingSeconds || Math.ceil((entry.expiresAt - now()) / 1000)
        ),
      };
    },

    clear(key) {
      return store.clear(key);
    },

    pruneExpired() {
      return store.pruneExpired();
    },
  };
}

function createShareUnlockKey(token, ip) {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("SESSION_SECRET not initialised");
  return crypto
    .createHmac("sha256", secret)
    .update("share-unlock:" + String(ip) + ":" + String(token))
    .digest("hex");
}

const shareUnlockRateLimiter = createShareUnlockRateLimiter(createPgStore());

module.exports = {
  MAX_ATTEMPTS,
  WINDOW_MS,
  MAX_ACTIVE_KEYS,
  createShareUnlockRateLimiter,
  createShareUnlockKey,
  shareUnlockRateLimiter,
};
