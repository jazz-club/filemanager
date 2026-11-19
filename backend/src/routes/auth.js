const { Router } = require("express");
const crypto = require("crypto");
const bcrypt = require("bcrypt");
const { userRepository, settingsRepository, fileRepository } = require("../db");
const { encrypt, decrypt } = require("../crypto");
const { deleteObject } = require("../storage");
const { getClientIp, checkCooldown, recordFailedAttempt, clearCooldown } = require("../ratelimit");
const logger = require("../logger");
const { generateCsrfToken } = require("../csrf");

const router = Router();

function hashUsername(username) {
  const salt = process.env.ENCRYPTION_SALT || "vault_salt";
  return crypto.createHmac("sha256", salt).update(username.trim().toLowerCase()).digest("hex");
}

function encryptUsername(username) {
  return encrypt(Buffer.from(username.trim(), "utf8")).ciphertext.toString("base64");
}

function decryptUsername(encBase64) {
  if (!encBase64) return "";
  try {
    return decrypt(Buffer.from(encBase64, "base64")).toString("utf8");
  } catch (e) {
    return "";
  }
}

function requireAuth(req, res, next) {
  if (!req.session || !req.session.userId) {
    logger.audit({
      event: "SECURITY_UNAUTHENTICATED_ACCESS",
      req,
      outcome: "REJECTED",
      level: "WARN",
      statusCode: 401,
      details: { path: req.originalUrl || req.url },
    });
    return res.status(401).json({ error: "Not authenticated" });
  }
  next();
}

router.get("/csrf", (req, res) => {
  if (!req.session) {
    return res.status(500).json({ error: "Session unavailable" });
  }
  if (!req.session.csrfToken) {
    req.session.csrfToken = generateCsrfToken();
  }
  res.cookie("XSRF-TOKEN", req.session.csrfToken, {
    sameSite: "strict",
    secure: true,
    httpOnly: false,
    path: "/",
  });
  res.json({ csrfToken: req.session.csrfToken });
});

router.get("/registration-status", async (req, res) => {
  try {
    const allowed = await settingsRepository.isRegistrationAllowed();
    res.json({ allowRegistration: allowed });
  } catch (err) {
    logger.error("Registration status check error", err);
    res.json({ allowRegistration: true });
  }
});

router.post("/register", async (req, res) => {
  try {
    if (!(await settingsRepository.isRegistrationAllowed())) {
      logger.audit({
        event: "AUTH_REGISTER_DISABLED",
        req,
        outcome: "REJECTED",
        level: "WARN",
        statusCode: 403,
      });
      return res.status(403).json({
        error: "Account creation is currently disabled.",
      });
    }

    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: "Username and password required" });
    }
    if (password.length < 8) {
      return res.status(400).json({ error: "Password must be at least 8 characters" });
    }

    const cleanUser = username.trim();
    const uHash = hashUsername(cleanUser);
    const encUser = encryptUsername(cleanUser);
    const maskedName = "usr_" + uHash.slice(0, 10);

    const usernameExists = await userRepository.checkUsernameExists(cleanUser, uHash);
    if (usernameExists) {
      logger.audit({
        event: "AUTH_REGISTER_CONFLICT",
        req,
        outcome: "REJECTED",
        level: "INFO",
        statusCode: 409,
        details: { maskedUser: maskedName },
      });
      return res.status(409).json({ error: "Username already taken" });
    }

    const passHash = await bcrypt.hash(password, 12);
    const createdUser = await userRepository.createUser({ maskedName, passHash, uHash, encUser });

    const newUserId = createdUser.id;

    req.session.regenerate((err) => {
      if (err) {
        logger.error("Session regeneration error during registration", err);
        return res.status(500).json({ error: "Session creation error" });
      }

      req.session.userId = newUserId;
      req.session.username = cleanUser;
      req.session.csrfToken = generateCsrfToken();

      res.cookie("XSRF-TOKEN", req.session.csrfToken, {
        sameSite: "strict",
        secure: true,
        httpOnly: false,
        path: "/",
      });

      logger.audit({
        event: "AUTH_REGISTER_SUCCESS",
        req,
        userId: newUserId,
        outcome: "SUCCESS",
        statusCode: 201,
        details: { maskedUser: maskedName },
      });

      res.status(201).json({
        message: "Account created",
        user: cleanUser,
        csrfToken: req.session.csrfToken,
      });
    });
  } catch (err) {
    logger.error("Register error", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/login", async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: "Username or password missing" });
    }

    const cleanUser = username.trim();
    const uHash = hashUsername(cleanUser);
    const clientIp = getClientIp(req);
    const attemptKey = `user:${clientIp}:${uHash}`;

    const cooldown = await checkCooldown(attemptKey);
    if (cooldown.locked) {
      res.setHeader("Retry-After", cooldown.retryAfterSeconds);
      logger.audit({
        event: "AUTH_LOCKOUT",
        req,
        outcome: "BLOCKED",
        level: "WARN",
        statusCode: 429,
        details: { retryAfterSeconds: cooldown.retryAfterSeconds },
      });
      return res.status(429).json({
        error: `Too many failed attempts. Try again in ${cooldown.retryAfterSeconds}s.`,
        retryAfter: cooldown.retryAfterSeconds,
      });
    }

    const user = await userRepository.findByUsernameOrHash(cleanUser, uHash);

    if (!user) {
      const lockStatus = await recordFailedAttempt(attemptKey);
      logger.audit({
        event: "AUTH_LOGIN_FAILURE",
        req,
        outcome: "FAILURE",
        level: "WARN",
        statusCode: 401,
        details: { reason: "user_not_found" },
      });
      if (lockStatus.locked) {
        res.setHeader("Retry-After", lockStatus.retryAfterSeconds);
        return res.status(429).json({
          error: `Too many failed attempts. Try again in ${lockStatus.retryAfterSeconds}s.`,
          retryAfter: lockStatus.retryAfterSeconds,
        });
      }
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) {
      const lockStatus = await recordFailedAttempt(attemptKey);
      logger.audit({
        event: "AUTH_LOGIN_FAILURE",
        req,
        outcome: "FAILURE",
        level: "WARN",
        statusCode: 401,
        details: { reason: "password_mismatch" },
      });
      if (lockStatus.locked) {
        res.setHeader("Retry-After", lockStatus.retryAfterSeconds);
        return res.status(429).json({
          error: `Too many failed attempts. Try again in ${lockStatus.retryAfterSeconds}s.`,
          retryAfter: lockStatus.retryAfterSeconds,
        });
      }
      return res.status(401).json({ error: "Invalid credentials" });
    }

    await clearCooldown(attemptKey);

    let displayUsername = cleanUser;
    if (user.encrypted_username) {
      displayUsername = decryptUsername(user.encrypted_username) || cleanUser;
    }

    if (!user.username_hash) {
      await userRepository.updatePrivacyInfo(user.id, {
        uHash,
        encUser: encryptUsername(cleanUser),
        maskedName: "usr_" + uHash.slice(0, 10),
      });
    }

    req.session.regenerate((err) => {
      if (err) {
        logger.error("Session regenerate error on login", err);
        return res.status(500).json({ error: "Session error" });
      }
      req.session.userId = user.id;
      req.session.username = displayUsername;
      req.session.csrfToken = generateCsrfToken();

      res.cookie("XSRF-TOKEN", req.session.csrfToken, {
        sameSite: "strict",
        secure: true,
        httpOnly: false,
        path: "/",
      });

      logger.audit({
        event: "AUTH_LOGIN_SUCCESS",
        req,
        userId: user.id,
        outcome: "SUCCESS",
        statusCode: 200,
        details: { user: displayUsername },
      });

      res.json({
        message: "Logged in",
        user: displayUsername,
        csrfToken: req.session.csrfToken,
      });
    });
  } catch (err) {
    logger.error("Login error", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/logout", (req, res) => {
  const userId = req.session ? req.session.userId : null;
  req.session.destroy((err) => {
    if (err) {
      logger.error("Logout session destroy error", err);
      return res.status(500).json({ error: "Could not logout" });
    }
    res.clearCookie("connect.sid");
    res.clearCookie("XSRF-TOKEN");
    logger.audit({
      event: "AUTH_LOGOUT",
      userId,
      outcome: "SUCCESS",
      statusCode: 200,
    });
    res.json({ message: "Logged out" });
  });
});

router.get("/me", (req, res) => {
  if (!req.session || !req.session.userId) {
    return res.status(401).json({ error: "Not authenticated" });
  }
  res.json({ user: req.session.username });
});

router.post("/change-password", requireAuth, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: "Current and new password are required" });
    }
    if (newPassword.length < 8) {
      return res.status(400).json({ error: "New password must be at least 8 characters" });
    }

    const attemptKey = `pwchange:${req.session.userId}`;
    const cooldown = await checkCooldown(attemptKey);
    if (cooldown.locked) {
      res.setHeader("Retry-After", cooldown.retryAfterSeconds);
      logger.audit({
        event: "AUTH_LOCKOUT",
        req,
        userId: req.session.userId,
        outcome: "BLOCKED",
        level: "WARN",
        statusCode: 429,
        details: { retryAfterSeconds: cooldown.retryAfterSeconds },
      });
      return res.status(429).json({
        error: `Too many failed attempts. Try again in ${cooldown.retryAfterSeconds}s.`,
        retryAfter: cooldown.retryAfterSeconds,
      });
    }

    const user = await userRepository.findById(req.session.userId);
    if (!user) return res.status(404).json({ error: "User not found" });

    const valid = await bcrypt.compare(currentPassword, user.password);
    if (!valid) {
      const lockStatus = await recordFailedAttempt(attemptKey);
      logger.audit({
        event: "AUTH_PASSWORD_CHANGE_FAILURE",
        req,
        userId: req.session.userId,
        outcome: "FAILURE",
        level: "WARN",
        statusCode: 401,
      });
      if (lockStatus.locked) {
        res.setHeader("Retry-After", lockStatus.retryAfterSeconds);
        return res.status(429).json({
          error: `Too many failed attempts. Cooldown active for ${lockStatus.retryAfterSeconds}s.`,
          retryAfter: lockStatus.retryAfterSeconds,
        });
      }
      return res.status(401).json({ error: "Current password is incorrect" });
    }

    await clearCooldown(attemptKey);

    const hash = await bcrypt.hash(newPassword, 12);
    await userRepository.updatePassword(req.session.userId, hash);

    logger.audit({
      event: "AUTH_PASSWORD_CHANGE_SUCCESS",
      req,
      userId: req.session.userId,
      outcome: "SUCCESS",
      statusCode: 200,
    });

    res.json({ message: "Password updated successfully" });
  } catch (err) {
    logger.error("Change password error", err);
    res.status(500).json({ error: "Failed to update password" });
  }
});

router.delete("/account", requireAuth, async (req, res) => {
  try {
    const { password } = req.body;
    if (!password) {
      return res.status(400).json({ error: "Password confirmation required to delete account" });
    }

    const attemptKey = `pwdelete:${req.session.userId}`;
    const cooldown = await checkCooldown(attemptKey);
    if (cooldown.locked) {
      res.setHeader("Retry-After", cooldown.retryAfterSeconds);
      return res.status(429).json({
        error: `Too many failed attempts. Cooldown active. Please wait ${cooldown.retryAfterSeconds}s.`,
        retryAfter: cooldown.retryAfterSeconds,
      });
    }

    const user = await userRepository.findById(req.session.userId);
    if (!user) return res.status(404).json({ error: "User not found" });

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) {
      const lockStatus = await recordFailedAttempt(attemptKey);
      logger.audit({
        event: "AUTH_ACCOUNT_DELETE_FAILURE",
        req,
        userId: req.session.userId,
        outcome: "FAILURE",
        level: "WARN",
        statusCode: 401,
      });
      if (lockStatus.locked) {
        res.setHeader("Retry-After", lockStatus.retryAfterSeconds);
        return res.status(429).json({
          error: `Too many failed attempts. Cooldown active for ${lockStatus.retryAfterSeconds}s.`,
          retryAfter: lockStatus.retryAfterSeconds,
        });
      }
      return res.status(401).json({ error: "Password is incorrect" });
    }

    await clearCooldown(attemptKey);
    const userIdToDelete = req.session.userId;

    const storageKeys = await fileRepository.getStorageKeysByOwner(userIdToDelete);
    for (const storageKey of storageKeys) {
      try {
        await deleteObject(storageKey);
      } catch (e) {
        logger.error("Storage delete error for key: " + storageKey, e);
      }
    }

    await userRepository.deleteUser(userIdToDelete);

    logger.audit({
      event: "AUTH_ACCOUNT_DELETE_SUCCESS",
      userId: userIdToDelete,
      outcome: "SUCCESS",
      statusCode: 200,
    });

    req.session.destroy(() => {
      res.clearCookie("connect.sid");
      res.clearCookie("XSRF-TOKEN");
      res.json({ message: "Account and all associated files deleted permanently" });
    });
  } catch (err) {
    logger.error("Delete account error", err);
    res.status(500).json({ error: "Failed to delete account" });
  }
});

module.exports = router;
