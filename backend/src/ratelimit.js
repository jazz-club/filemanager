const { loginAttemptRepository } = require("./db");
const crypto = require("crypto");

function protectIdentifier(identifier) {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("SESSION_SECRET not initialised");
  return "rl:v1:" + crypto.createHmac("sha256", secret).update(String(identifier)).digest("hex");
}

function getClientIp(req) {
  if (req.headers && req.headers["x-forwarded-for"]) {
    return req.headers["x-forwarded-for"].split(",")[0].trim();
  }
  return req.ip || req.socket.remoteAddress || "127.0.0.1";
}

async function checkCooldown(identifier) {
  try {
    const protectedIdentifier = protectIdentifier(identifier);
    const row = await loginAttemptRepository.findByIdentifier(protectedIdentifier);

    if (!row) {
      return { locked: false, failedCount: 0 };
    }

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

    const lastAttemptMs = new Date(row.last_failed_at).getTime();
    if (now - lastAttemptMs > 15 * 60 * 1000) {
      await loginAttemptRepository.deleteByIdentifier(protectedIdentifier);
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
    const protectedIdentifier = protectIdentifier(identifier);
    const row = await loginAttemptRepository.findByIdentifier(protectedIdentifier);

    let newCount = 1;
    if (row) {
      newCount = (row.failed_count || 0) + 1;
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

    await loginAttemptRepository.saveAttempt({
      identifier: protectIdentifier(identifier),
      failedCount: newCount,
      attemptedAt: now,
      lockedUntil,
    });

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
    await loginAttemptRepository.deleteByIdentifier(protectIdentifier(identifier));
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
