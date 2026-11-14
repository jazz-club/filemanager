const { Router } = require("express");
const crypto = require("crypto");
const bcrypt = require("bcrypt");
const { pool } = require("../db");
const { encrypt, decrypt } = require("../crypto");
const { deleteObject } = require("../storage");
const { getClientIp, checkCooldown, recordFailedAttempt, clearCooldown } = require("../ratelimit");

const router = Router();

/* 
	not too particularly sure about email-less auth but i am not dealing with mail servers
	i guess no forgot password flows? kinda would be cool to run a blacbox service where data just goes to the abyss and cant be recovered if you dont want it to
	maybe even no admin pages, idk
*/

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
  if (!req.session.userId) return res.status(401).json({ error: "Not authenticated" });
  next();
}

router.get("/registration-status", async (req, res) => {
  try {
    const q = await pool.query(
      "SELECT value FROM system_settings WHERE key = 'allow_registration'"
    );
    const allowed = q.rows.length === 0 || q.rows[0].value === "true";
    res.json({ allowRegistration: allowed });
  } catch (err) {
    console.error("Registration status check error:", err);
    res.json({ allowRegistration: true });
  }
});

router.post("/register", async (req, res) => {
  try {
    const regCheck = await pool.query(
      "SELECT value FROM system_settings WHERE key = 'allow_registration'"
    );
    if (regCheck.rows.length > 0 && regCheck.rows[0].value !== "true") {
      return res.status(403).json({
        error: "Account creation is currently disabled.",
      });
    }

    const { username, password } = req.body;
    if (!username || !password)
      return res.status(400).json({ error: "Username and password required" });
    if (password.length < 8)
      return res.status(400).json({ error: "Password must be at least 8 characters" });

    const cleanUser = username.trim();
    const uHash = hashUsername(cleanUser);
    const encUser = encryptUsername(cleanUser);
    const maskedName = "usr_" + uHash.slice(0, 10);

    const existing = await pool.query(
      "SELECT id FROM users WHERE username_hash = $1 OR username = $2",
      [uHash, cleanUser]
    );
    if (existing.rows.length > 0) return res.status(409).json({ error: "Username already taken" });

    const passHash = await bcrypt.hash(password, 12);
    const result = await pool.query(
      "INSERT INTO users (username, password, username_hash, encrypted_username) VALUES ($1, $2, $3, $4) RETURNING id",
      [maskedName, passHash, uHash, encUser]
    );

    req.session.userId = result.rows[0].id;
    req.session.username = cleanUser;
    res.status(201).json({ message: "Account created", user: cleanUser });
  } catch (err) {
    console.error("Register error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/login", async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password)
      return res.status(400).json({ error: "Username or password missing" });

    const cleanUser = username.trim();
    const uHash = hashUsername(cleanUser);
    const clientIp = getClientIp(req);
    const attemptKey = `user:${clientIp}:${uHash}`;

    const cooldown = await checkCooldown(attemptKey);
    if (cooldown.locked) {
      res.setHeader("Retry-After", cooldown.retryAfterSeconds);
      return res.status(429).json({
        error: `Too many failed attempts. Try again in ${cooldown.retryAfterSeconds}s.`,
        retryAfter: cooldown.retryAfterSeconds,
      });
    }

    let result = await pool.query("SELECT * FROM users WHERE username_hash = $1", [uHash]);
    if (result.rows.length === 0) {
      result = await pool.query("SELECT * FROM users WHERE username = $1", [cleanUser]);
    }
    if (result.rows.length === 0) {
      const lockStatus = await recordFailedAttempt(attemptKey);
      if (lockStatus.locked) {
        res.setHeader("Retry-After", lockStatus.retryAfterSeconds);
        return res.status(429).json({
          error: `Too many failed attempts. Try again in ${lockStatus.retryAfterSeconds}s.`,
          retryAfter: lockStatus.retryAfterSeconds,
        });
      }
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const user = result.rows[0];
    const valid = await bcrypt.compare(password, user.password);
    if (!valid) {
      const lockStatus = await recordFailedAttempt(attemptKey);
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
      await pool.query(
        "UPDATE users SET username_hash = $1, encrypted_username = $2, username = $3 WHERE id = $4",
        [uHash, encryptUsername(cleanUser), "usr_" + uHash.slice(0, 10), user.id]
      );
    }

    req.session.regenerate((err) => {
      if (err) return res.status(500).json({ error: "Session error" });
      req.session.userId = user.id;
      req.session.username = displayUsername;
      res.json({ message: "Logged in", user: displayUsername });
    });
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/logout", (req, res) => {
  req.session.destroy((err) => {
    if (err) return res.status(500).json({ error: "Could not logout" });
    res.clearCookie("connect.sid");
    res.json({ message: "Logged out" });
  });
});


// i know for a fact this isnt sufficient but i cant remember why
router.get("/me", (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: "Not authenticated" });
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
      return res.status(429).json({
        error: `Too many failed attempts. Try again in ${cooldown.retryAfterSeconds}s.`,
        retryAfter: cooldown.retryAfterSeconds,
      });
    }

    const userQ = await pool.query("SELECT password FROM users WHERE id = $1", [
      req.session.userId,
    ]);
    if (userQ.rows.length === 0) return res.status(404).json({ error: "User not found" });

    const valid = await bcrypt.compare(currentPassword, userQ.rows[0].password);
    if (!valid) {
      const lockStatus = await recordFailedAttempt(attemptKey);
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
    await pool.query("UPDATE users SET password = $1 WHERE id = $2", [hash, req.session.userId]);

    res.json({ message: "Password updated successfully" });
  } catch (err) {
    console.error("Change password error:", err);
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

    const userQ = await pool.query("SELECT password FROM users WHERE id = $1", [
      req.session.userId,
    ]);
    if (userQ.rows.length === 0) return res.status(404).json({ error: "User not found" });

    const valid = await bcrypt.compare(password, userQ.rows[0].password);
    if (!valid) {
      const lockStatus = await recordFailedAttempt(attemptKey);
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

    const filesQ = await pool.query("SELECT storage_key FROM files WHERE owner_id = $1", [
      req.session.userId,
    ]);
    for (const f of filesQ.rows) {
      try {
        await deleteObject(f.storage_key);
      } catch (e) {
        console.error("Storage delete error for key:", f.storage_key, e);
      }
    }

    await pool.query("DELETE FROM users WHERE id = $1", [req.session.userId]);

    req.session.destroy(() => {
      res.clearCookie("connect.sid");
      res.json({ message: "Account and all associated files deleted permanently" });
    });
  } catch (err) {
    console.error("Delete account error:", err);
    res.status(500).json({ error: "Failed to delete account" });
  }
});

module.exports = router;
