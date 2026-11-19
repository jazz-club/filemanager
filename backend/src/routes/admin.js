const { Router } = require("express");
const { userRepository, fileRepository, folderRepository, settingsRepository } = require("../db");
const { deleteObject } = require("../storage");
const { getClientIp, checkCooldown, recordFailedAttempt, clearCooldown } = require("../ratelimit");
const logger = require("../logger");
const { generateCsrfToken } = require("../csrf");

const router = Router();

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
  const adminPass = process.env.ADMIN_PASSWORD || "adminsecretpassword";

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
    const [totalUsers, fileStats, totalFolders] = await Promise.all([
      userRepository.getUserCount(),
      fileRepository.getGlobalFileStats(),
      folderRepository.getFolderCount(),
    ]);

    res.json({
      totalUsers,
      totalFiles: fileStats.totalFiles,
      totalBytes: fileStats.totalBytes,
      totalFolders,
      status: "Healthy",
    });
  } catch (err) {
    console.error("Admin stats error:", err);
    res.status(500).json({ error: "Failed to fetch stats" });
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
    const rows = await userRepository.getAllUsersWithStats();

    const users = rows.map((row) => ({
      id: row.id,
      pseudonym: row.pseudonym || `user_${row.id}`,
      createdAt: row.created_at,
      fileCount: parseInt(row.file_count, 10),
      totalBytes: parseInt(row.total_bytes, 10),
      folderCount: parseInt(row.folder_count, 10),
    }));

    res.json(users);
  } catch (err) {
    console.error("Admin list users error:", err);
    res.status(500).json({ error: "Failed to load users" });
  }
});

router.delete("/users/:id", requireAdmin, async (req, res) => {
  try {
    const targetUserId = parseInt(req.params.id, 10);
    if (!targetUserId) return res.status(400).json({ error: "Invalid user ID" });

    const storageKeys = await fileRepository.getStorageKeysByOwner(targetUserId);
    for (const storageKey of storageKeys) {
      try {
        await deleteObject(storageKey);
      } catch (minioErr) {
        console.error("Error deleting MD minIO file:", storageKey, minioErr);
      }
    }

    const deleted = await userRepository.deleteUser(targetUserId);
    if (!deleted) {
      return res.status(404).json({ error: "User not found" });
    }

    res.json({ message: `User #${targetUserId} and all encrypted data permanently deleted.` });
  } catch (err) {
    console.error("Admin delete user error:", err);
    res.status(500).json({ error: "Failed to delete user" });
  }
});

module.exports = router;
