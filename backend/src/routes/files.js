const { Router } = require("express");
const multer = require("multer");
const crypto = require("crypto");
const { pool } = require("../db");
const { encrypt, decrypt } = require("../crypto");
const { putObject, getObject, deleteObject } = require("../storage");

const router = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2048 * 1024 * 1024 },
});

function requireAuth(req, res, next) {
  if (!req.session.userId) return res.status(401).json({ error: "Not authenticated" });
  next();
}

router.post(
  "/",
  requireAuth,
  (req, res, next) => {
    upload.single("file")(req, res, (err) => {
      if (err) {
        if (err.code === "LIMIT_FILE_SIZE") {
          return res.status(413).json({ error: "File exceeds maximum size limit (2GB)" });
        }
        return res.status(400).json({ error: err.message || "Upload error" });
      }
      next();
    });
  },
  async (req, res) => {
    try {
      if (!req.file) return res.status(400).json({ error: "No file provided" });

      const storageKey = req.session.userId + "/" + crypto.randomUUID();
      const sha256 = crypto.createHash("sha256").update(req.file.buffer).digest("hex");
      const { ciphertext, nonce } = encrypt(req.file.buffer);
      await putObject(storageKey, ciphertext);

      // im sorry
      const result = await pool.query(
        `INSERT INTO files (owner_id, original_name, storage_key, nonce, size_bytes, mime_type, sha256)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, original_name, size_bytes, mime_type, sha256, uploaded_at`,
        [
          req.session.userId,
          req.file.originalname,
          storageKey,
          nonce,
          req.file.size,
          req.file.mimetype,
          sha256,
        ]
      );
      res.status(201).json(result.rows[0]);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Upload failed" });
    }
  }
);

// TODO; move to seperate table later
router.get("/", requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT id, original_name, size_bytes, mime_type, sha256, uploaded_at FROM files WHERE owner_id = $1 ORDER BY uploaded_at DESC",
      [req.session.userId]
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not list files" });
  }
});

router.get("/:id/metadata", requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT id, original_name, size_bytes, mime_type, sha256, nonce, storage_key, uploaded_at FROM files WHERE id = $1 AND owner_id = $2",
      [req.params.id, req.session.userId]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: "File not found" });

    const row = result.rows[0];
    res.json({
      ...row,
      algorithm: "ChaCha20-Poly1305 (AEAD)",
      storage_system: "MinIO S3",
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not fetch metadata" });
  }
});

router.get("/:id", requireAuth, async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM files WHERE id = $1 AND owner_id = $2", [
      req.params.id,
      req.session.userId,
    ]);
    if (result.rows.length === 0) return res.status(404).json({ error: "File not found" });

    const file = result.rows[0];
    const blob = await getObject(file.storage_key);
    const plaintext = decrypt(blob);

    res.set("Content-Type", file.mime_type);
    const safeName = file.original_name.replace(/["\r\n]/g, "_");
    const encodedName = encodeURIComponent(file.original_name);
    res.set(
      "Content-Disposition",
      'attachment; filename="' + safeName + "\"; filename*=UTF-8''" + encodedName
    );
    res.send(plaintext);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Download failed" });
  }
});

router.delete("/:id", requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT storage_key FROM files WHERE id = $1 AND owner_id = $2",
      [req.params.id, req.session.userId]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: "File not found" });

    await deleteObject(result.rows[0].storage_key);
    await pool.query("DELETE FROM files WHERE id = $1", [req.params.id]);
    res.json({ message: "File deleted" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Delete failed" });
  }
});

module.exports = router;
