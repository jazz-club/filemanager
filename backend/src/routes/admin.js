const { Router } = require("express");
const { userRepository, fileRepository, settingsRepository } = require("../db");
const { deleteObject, checkStorage } = require("../storage");
const { getClientIp, checkCooldown, recordFailedAttempt, clearCooldown } = require("../ratelimit");
const logger = require("../logger");
const { generateCsrfToken } = require("../csrf");
const { pool } = require("../db/connection");
const crypto = require("crypto");
const { decryptJson, auditOwnerKey } = require("../crypto");

const router = Router();

function accountRefFromOwnerKey(ownerKey) {
  return crypto
    .createHmac("sha256", process.env.SESSION_SECRET)
    .update("admin-account:" + ownerKey)
    .digest("hex");
}

function accountRef(userId) {
  return accountRefFromOwnerKey(auditOwnerKey(userId));
}

function requireAdmin(req, res, next) {
  if (!req.session || !req.session.isAdmin) {
    logger.audit({
      event: "SECURITY_UNAUTHORIZED_ADMIN_ACCESS",
      req,
      outcome: "REJECTED",
      level: "WARN",
      statusCode: 401,
      details: { path: req.originalUrl || req.url },
    });
    return res.status(401).json({ error: "Admin authentication required" });
  }
  next();
}

router.post("/login", async (req, res) => {
  const { username, password } = req.body;
  const adminUser = process.env.ADMIN_USERNAME || "admin";
  const adminPass = process.env.ADMIN_PASSWORD;

  if (!username || !password) {
    return res.status(400).json({ error: "Username and password required" });
  }

  const clientIp = getClientIp(req);
  const attemptKey = `admin:${clientIp}`;

  const cooldown = await checkCooldown(attemptKey);
  if (cooldown.locked) {
    res.setHeader("Retry-After", cooldown.retryAfterSeconds);
    logger.audit({
      event: "ADMIN_LOCKOUT",
      req,
      outcome: "BLOCKED",
      level: "WARN",
      statusCode: 429,
      details: { retryAfterSeconds: cooldown.retryAfterSeconds },
    });
    return res.status(429).json({
      error: `Too many failed attempts. Cooldown active for ${cooldown.retryAfterSeconds}s.`,
      retryAfter: cooldown.retryAfterSeconds,
    });
  }

  if (username === adminUser && password === adminPass) {
    await clearCooldown(attemptKey);
    req.session.regenerate((err) => {
      if (err) return res.status(500).json({ error: "Session creation error" });
      req.session.isAdmin = true;
      req.session.adminUser = adminUser;
      req.session.csrfToken = generateCsrfToken();

      res.cookie("XSRF-TOKEN", req.session.csrfToken, {
        sameSite: "strict",
        secure: true,
        httpOnly: false,
        path: "/",
      });

      logger.audit({
        event: "ADMIN_LOGIN_SUCCESS",
        req,
        outcome: "SUCCESS",
        statusCode: 200,
        details: { admin: adminUser },
      });

      res.json({
        message: "Admin authenticated",
        admin: adminUser,
        csrfToken: req.session.csrfToken,
      });
    });
  } else {
    const lockStatus = await recordFailedAttempt(attemptKey);
    logger.audit({
      event: "ADMIN_LOGIN_FAILURE",
      req,
      outcome: "FAILURE",
      level: "WARN",
      statusCode: 401,
      details: { attemptedUser: username },
    });
    if (lockStatus.locked) {
      res.setHeader("Retry-After", lockStatus.retryAfterSeconds);
      return res.status(429).json({
        error: `Cooldown active for ${lockStatus.retryAfterSeconds}s.`,
        retryAfter: lockStatus.retryAfterSeconds,
      });
    }
    res.status(401).json({ error: "Invalid admin credentials" });
  }
});

router.get("/me", (req, res) => {
  if (req.session && req.session.isAdmin) {
    return res.json({ isAdmin: true, admin: req.session.adminUser || "admin" });
  }
  res.status(401).json({ isAdmin: false });
});

router.post("/logout", (req, res) => {
  if (req.session) {
    req.session.destroy(() => {
      res.clearCookie("connect.sid");
      res.json({ message: "Admin signed off" });
    });
  } else {
    res.json({ message: "Logged out" });
  }
});

router.get("/stats", requireAdmin, async (req, res) => {
  try {
    const [fileStats, accountCountQ, activeSharesQ, securityQ, objectStorageOk] = await Promise.all(
      [
        fileRepository.getGlobalFileStats(),
        pool.query("SELECT COUNT(*)::int AS total FROM users"),
        pool.query(
          "SELECT COUNT(*)::int AS total FROM file_shares WHERE expires_at IS NULL OR expires_at > NOW()"
        ),
        pool.query(
          `SELECT
           COUNT(*) FILTER (WHERE event IN ('AUTH_LOGIN_FAILURE', 'ADMIN_LOGIN_FAILURE'))::int AS "failedSignIns24h",
           COUNT(*) FILTER (WHERE event IN ('AUTH_LOCKOUT', 'ADMIN_LOCKOUT'))::int AS "lockouts24h"
         FROM audit_logs
         WHERE created_at >= NOW() - INTERVAL '24 hours'`
        ),
        checkStorage()
          .then(() => true)
          .catch(() => false),
      ]
    );

    res.json({
      totalBytes: fileStats.totalBytes,
      accounts: accountCountQ.rows[0].total,
      activeShares: activeSharesQ.rows[0].total,
      failedSignIns24h: securityQ.rows[0].failedSignIns24h,
      lockouts24h: securityQ.rows[0].lockouts24h,
      objectStorageStatus: objectStorageOk ? "Healthy" : "Unavailable",
      status: objectStorageOk ? "Healthy" : "Degraded",
    });
  } catch (err) {
    console.error("Admin stats error:", err);
    res.status(500).json({ error: "Failed to fetch stats" });
  }
});

router.get("/audit-logs", requireAdmin, async (req, res) => {
  try {
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), 200);
    const offset = Math.max(parseInt(req.query.offset, 10) || 0, 0);
    const category = String(req.query.category || "all").toLowerCase();
    const outcome = String(req.query.outcome || "all").toUpperCase();
    const search = String(req.query.search || "").trim();
    const conditions = [];
    const values = [];
    let p = 1;
    const categoryPatterns = {
      security:
        "(event ILIKE 'AUTH_%' OR event ILIKE 'ADMIN_LOGIN_%' OR event ILIKE '%LOCKOUT%' OR event ILIKE 'SECURITY_%')",
      accounts:
        "(event ILIKE 'ADMIN_ACCOUNT_%' OR event ILIKE 'ADMIN_REGISTRATION_%' OR event ILIKE 'AUTH_REGISTER_%')",
      files: "(event ILIKE 'FILE_%' OR event ILIKE 'FOLDER_%')",
      shares: "event ILIKE '%SHARE%'",
    };
    if (categoryPatterns[category]) conditions.push(categoryPatterns[category]);
    if (outcome !== "ALL") {
      conditions.push(`outcome = $${p++}`);
      values.push(outcome);
    }
    if (search) {
      conditions.push(`event ILIKE $${p++}`);
      values.push("%" + search.replace(/[\\%_]/g, "\\$&") + "%");
    }
    const where = conditions.length ? "WHERE " + conditions.join(" AND ") : "";
    const countQ = await pool.query(
      `SELECT COUNT(*)::int AS total FROM audit_logs ${where}`,
      values
    );
    const total = countQ.rows[0].total;
    const safeOffset = total ? Math.min(offset, Math.floor((total - 1) / limit) * limit) : 0;
    const result = await pool.query(
      `SELECT user_id AS "ownerKey", event, level, outcome, details, created_at AS "createdAt"
       FROM audit_logs ${where}
       ORDER BY created_at DESC, id DESC LIMIT $${p} OFFSET $${p + 1}`,
      [...values, limit, safeOffset]
    );
    const logs = result.rows.map((row) => {
      const details = decryptJson(row.details) || {};
      const targetRef =
        row.event === "ADMIN_ACCOUNT_DELETED" && details.accountRef
          ? "acct_" + String(details.accountRef).slice(0, 10)
          : null;
      return {
        event: row.event,
        level: row.level,
        outcome: row.outcome,
        createdAt: row.createdAt,
        actorRef: row.ownerKey ? "acct_" + accountRefFromOwnerKey(row.ownerKey).slice(0, 10) : null,
        targetRef,
      };
    });
    res.json({ logs, total, limit, offset: safeOffset });
  } catch (err) {
    console.error("Admin audit logs error:", err);
    res.status(500).json({ error: "Failed to load global audit logs" });
  }
});

router.get("/settings", requireAdmin, async (req, res) => {
  try {
    const allowReg = await settingsRepository.isRegistrationAllowed();
    res.json({ allowRegistration: allowReg });
  } catch (err) {
    console.error("Admin get settings error:", err);
    res.status(500).json({ error: "Failed to fetch settings" });
  }
});

router.patch("/settings", requireAdmin, async (req, res) => {
  try {
    const { allowRegistration } = req.body;
    if (typeof allowRegistration !== "boolean") {
      return res.status(400).json({ error: "allowRegistration boolean required" });
    }

    await settingsRepository.setRegistrationAllowed(allowRegistration);
    logger.audit({
      event: "ADMIN_REGISTRATION_SETTING_CHANGED",
      req,
      outcome: "SUCCESS",
      statusCode: 200,
      details: { allowRegistration },
    });

    res.json({
      message: `New account registrations are now ${allowRegistration ? "ENABLED" : "DISABLED"}.`,
      allowRegistration,
    });
  } catch (err) {
    console.error("Admin update settings error:", err);
    res.status(500).json({ error: "Failed to update settings" });
  }
});

router.get("/users", requireAdmin, async (req, res) => {
  try {
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 25, 1), 200);
    const offset = Math.max(parseInt(req.query.offset, 10) || 0, 0);
    const filter = String(req.query.filter || "all").toLowerCase();
    const search = String(req.query.search || "")
      .trim()
      .toLowerCase();
    const rows = await userRepository.getAllUsersWithStats();

    const matched = rows
      .map((row) => ({
        accountRef: accountRef(row.id),
        totalBytes: parseInt(row.total_bytes, 10),
      }))
      .filter((row) => {
        if (filter === "stored" && row.totalBytes <= 0) return false;
        if (filter === "empty" && row.totalBytes > 0) return false;
        return !search || row.accountRef.toLowerCase().startsWith(search.replace(/^acct_/, ""));
      });
    const total = matched.length;
    const safeOffset = total ? Math.min(offset, Math.floor((total - 1) / limit) * limit) : 0;
    const users = matched.slice(safeOffset, safeOffset + limit);

    res.json({ users, total, limit, offset: safeOffset, filter });
  } catch (err) {
    console.error("Admin list users error:", err);
    res.status(500).json({ error: "Failed to load users" });
  }
});

router.delete("/users/:id", requireAdmin, async (req, res) => {
  try {
    const ref = req.params.id;
    const users = await userRepository.getAllUsersWithStats();
    const target = users.find((row) => {
      const expected = accountRef(row.id);
      const a = Buffer.from(expected);
      const b = Buffer.from(ref);
      return a.length === b.length && crypto.timingSafeEqual(a, b);
    });
    const targetUserId = target && target.id;
    if (!targetUserId) return res.status(404).json({ error: "Account not found" });

    const storageKeys = await fileRepository.getStorageKeysByOwner(targetUserId);
    for (const storageKey of storageKeys) {
      try {
        await deleteObject(storageKey);
      } catch (minioErr) {
        logger.error("Account storage cleanup failed", minioErr);
      }
    }

    const deleted = await userRepository.deleteUser(targetUserId);
    if (!deleted) {
      return res.status(404).json({ error: "User not found" });
    }

    logger.audit({
      event: "ADMIN_ACCOUNT_DELETED",
      req,
      outcome: "SUCCESS",
      statusCode: 200,
      details: { accountRef: ref },
    });

    res.json({ message: "Account and its stored data were permanently deleted." });
  } catch (err) {
    console.error("Admin delete user error:", err);
    res.status(500).json({ error: "Failed to delete user" });
  }
});

module.exports = router;
