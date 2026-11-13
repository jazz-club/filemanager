const { Router } = require("express");
const { pool } = require("../db");
const { deleteObject } = require("../storage");

const router = Router();

function requireAdmin(req, res, next) {
  if (!req.session || !req.session.isAdmin) {
    return res.status(401).json({ error: "Admin authentication required" });
  }
  next();
}

router.post("/login", (req, res) => {
  const { username, password } = req.body;
  const adminUser = process.env.ADMIN_USERNAME || "admin";
  const adminPass = process.env.ADMIN_PASSWORD || "adminsecretpassword";

  if (!username || !password) {
    return res.status(400).json({ error: "backend creds required" });
  }

  if (username === adminUser && password === adminPass) {
    req.session.regenerate((err) => {
      if (err) return res.status(500).json({ error: "Session creation error" });
      req.session.isAdmin = true;
      req.session.adminUser = adminUser;
      res.json({ message: "Admin authenticated", admin: adminUser });
    });
  } else {
    res.status(401).json({ error: "Invalid admin creds, hmm..." });
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
    const userCount = await pool.query("SELECT COUNT(*) AS count FROM users");
    const fileStats = await pool.query(
      "SELECT COUNT(*) AS count, COALESCE(SUM(size_bytes), 0) AS total_bytes FROM files"
    );
    const folderCount = await pool.query("SELECT COUNT(*) AS count FROM folders");

    res.json({
      totalUsers: parseInt(userCount.rows[0].count, 10),
      totalFiles: parseInt(fileStats.rows[0].count, 10),
      totalBytes: parseInt(fileStats.rows[0].total_bytes, 10),
      totalFolders: parseInt(folderCount.rows[0].count, 10),
      status: "Healthy",
    });
  } catch (err) {
    console.error("Admin stats error:", err);
    res.status(500).json({ error: "Failed to fetch stats" });
  }
});

router.get("/settings", requireAdmin, async (req, res) => {
  try {
    const q = await pool.query(
      "SELECT key, value FROM system_settings WHERE key = 'allow_registration'"
    );
    const allowReg = q.rows.length === 0 || q.rows[0].value === "true";
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

    const strVal = allowRegistration ? "true" : "false";
    await pool.query(
      `INSERT INTO system_settings (key, value, updated_at) 
       VALUES ('allow_registration', $1, NOW()) 
       ON CONFLICT (key) DO UPDATE SET value = $1, updated_at = NOW()`,
      [strVal]
    );

    res.json({
      message: `New account registrations are now ${allowRegistration ? "ENABLED" : "DISABLED"}.`,
      allowRegistration,
    });
  } catch (err) {
    console.error("Admin update settings error:", err);
    res.status(500).json({ error: "Failed to update settings" });
  }
});

router.get("/settings", requireAdmin, async (req, res) => {
  try {
    const q = await pool.query(
      "SELECT key, value FROM system_settings WHERE key = 'allow_registration'"
    );
    const allowReg = q.rows.length === 0 || q.rows[0].value === "true";
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

    const strVal = allowRegistration ? "true" : "false";
    await pool.query(
      `INSERT INTO system_settings (key, value, updated_at) 
       VALUES ('allow_registration', $1, NOW()) 
       ON CONFLICT (key) DO UPDATE SET value = $1, updated_at = NOW()`,
      [strVal]
    );

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
    const q = await pool.query(`
      SELECT 
        u.id,
        u.username AS pseudonym,
        u.created_at,
        COUNT(f.id) AS file_count,
        COALESCE(SUM(f.size_bytes), 0) AS total_bytes,
        (SELECT COUNT(*) FROM folders fo WHERE fo.owner_id = u.id) AS folder_count
      FROM users u
      LEFT JOIN files f ON f.owner_id = u.id
      GROUP BY u.id, u.username, u.created_at
      ORDER BY u.id ASC
    `);

    const users = q.rows.map((row) => ({
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

    const filesQ = await pool.query("SELECT storage_key FROM files WHERE owner_id = $1", [
      targetUserId,
    ]);
    for (const f of filesQ.rows) {
      try {
        await deleteObject(f.storage_key);
      } catch (minioErr) {
        console.error("Error purging MinIO file:", f.storage_key, minioErr);
      }
    }

    const delResult = await pool.query("DELETE FROM users WHERE id = $1 RETURNING id", [
      targetUserId,
    ]);
    if (delResult.rows.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }

    res.json({ message: `User #${targetUserId} and all encrypted data permanently deleted.` });
  } catch (err) {
    console.error("Admin delete user error:", err);
    res.status(500).json({ error: "Failed to delete user" });
  }
});

module.exports = router;
