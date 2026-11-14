const { pool } = require("./db");

function getClientIp(req) {
  if (req.headers && req.headers["x-forwarded-for"]) {
    return req.headers["x-forwarded-for"].split(",")[0].trim();
  }
  return req.ip || req.socket.remoteAddress || "127.0.0.1";
}

async function checkCooldown(identifier) {
  try {
    const q = await pool.query(
      "SELECT failed_count, last_failed_at, locked_until FROM login_attempts WHERE identifier = $1",
      [identifier]
    );

    if (q.rows.length === 0) {
      return { locked: false, failedCount: 0 };
    }

    const row = q.rows[0];
    const now = Date.now();

    if (row.locked_until) {
      const lockUntilMs = new Date(row.locked_until).getTime();
      if (lockUntilMs > now) {
        const retryAfterSeconds = Math.ceil((lockUntilMs - now) / 1000);
        return {
          locked: true,
          retryAfterSeconds: Math.max(1, retryAfterSeconds),
          failedCount: row.failed_count,
        };
      }
    }

    // eh
    const lastAttemptMs = new Date(row.last_failed_at).getTime();
    if (now - lastAttemptMs > 15 * 60 * 1000) {
      await pool.query("DELETE FROM login_attempts WHERE identifier = $1", [identifier]);
      return { locked: false, failedCount: 0 };
    }

    return { locked: false, failedCount: row.failed_count };
  } catch (err) {
    console.error("Rate limit check error:", err);
    return { locked: false, failedCount: 0 };
  }
}

async function recordFailedAttempt(identifier) {
  try {
    const now = new Date();
    const q = await pool.query(
      "SELECT failed_count, locked_until FROM login_attempts WHERE identifier = $1",
      [identifier]
    );

    let newCount = 1;
    if (q.rows.length > 0) {
      newCount = (q.rows[0].failed_count || 0) + 1;
    }

    let lockSeconds = 0;
    if (newCount >= 15) {
      lockSeconds = 15 * 60;
    } else if (newCount >= 10) {
      lockSeconds = 5 * 60;
    } else if (newCount >= 5) {
      lockSeconds = 30;
    }

    let lockedUntil = null;
    if (lockSeconds > 0) {
      lockedUntil = new Date(now.getTime() + lockSeconds * 1000);
    }

    await pool.query(
      `INSERT INTO login_attempts (identifier, failed_count, first_failed_at, last_failed_at, locked_until)
       VALUES ($1, $2, $3, $3, $4)
       ON CONFLICT (identifier) DO UPDATE
       SET failed_count = $2,
           last_failed_at = $3,
           locked_until = $4`,
      [identifier, newCount, now, lockedUntil]
    );

    return {
      locked: lockSeconds > 0,
      retryAfterSeconds: lockSeconds,
      failedCount: newCount,
    };
  } catch (err) {
    console.error("Ratelimit record error:", err);
    return { locked: false, retryAfterSeconds: 0, failedCount: 0 };
  }
}

async function clearCooldown(identifier) {
  try {
    await pool.query("DELETE FROM login_attempts WHERE identifier = $1", [identifier]);
  } catch (err) {
    console.error("Ratelimit clear error:", err);
  }
}

module.exports = {
  getClientIp,
  checkCooldown,
  recordFailedAttempt,
  clearCooldown,
};
