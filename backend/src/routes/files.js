const { Router } = require("express");
const multer = require("multer");
const crypto = require("crypto");
const { ZipArchive } = require("archiver");
const { pool } = require("../db");
const { encrypt, decrypt } = require("../crypto");
const { putObject, getObject, deleteObject } = require("../storage");

const router = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5120 * 1024 * 1024 },
});

// TODO decrpyt preview buffers
const previewCache = new Map();
const MAX_CACHE_BYTES = 256 * 1024 * 1024;
let currentCacheBytes = 0;

function invalidatePreviewCache(fileId) {
  const strId = String(fileId);
  const entry = previewCache.get(strId);
  if (entry) {
    clearTimeout(entry.timer);
    currentCacheBytes -= entry.buffer.length;
    previewCache.delete(strId);
  }
}

function getCachedPreview(fileId) {
  const strId = String(fileId);
  const entry = previewCache.get(strId);
  if (entry) {
    entry.lastAccess = Date.now();
    clearTimeout(entry.timer);
    entry.timer = setTimeout(() => {
      invalidatePreviewCache(strId);
    }, 180000); // 3 minutes TTL
    return entry.buffer;
  }
  return null;
}

function setCachedPreview(fileId, buffer) {
  const strId = String(fileId);
  if (buffer.length > 150 * 1024 * 1024) return; // marvel rivals videos gfn

  while (currentCacheBytes + buffer.length > MAX_CACHE_BYTES && previewCache.size > 0) {
    let oldestKey = null;
    let oldestTime = Infinity;
    for (const [k, v] of previewCache.entries()) {
      if (v.lastAccess < oldestTime) {
        oldestTime = v.lastAccess;
        oldestKey = k;
      }
    }
    if (oldestKey) {
      invalidatePreviewCache(oldestKey);
    } else {
      break;
    }
  }

  const entry = {
    buffer,
    lastAccess: Date.now(),
    timer: setTimeout(() => {
      invalidatePreviewCache(strId);
    }, 180000),
  };
  currentCacheBytes += buffer.length;
  previewCache.set(strId, entry);
}

function requireAuth(req, res, next) {
  if (!req.session.userId) return res.status(401).json({ error: "Not authenticated" });
  next();
}

router.get("/stats/usage", requireAuth, async (req, res) => {
  try {
    const result = await pool.query(`SELECT mime_type, size_bytes FROM files WHERE owner_id = $1`, [
      req.session.userId,
    ]);

    let totalBytes = 0;
    const categories = {
      image: 0,
      video: 0,
      audio: 0,
      document: 0,
      archive: 0,
      other: 0,
    };

    result.rows.forEach((r) => {
      const size = parseInt(r.size_bytes, 10) || 0;
      totalBytes += size;
      const mime = (r.mime_type || "").toLowerCase();

      if (mime.startsWith("image/")) {
        categories.image += size;
      } else if (mime.startsWith("video/")) {
        categories.video += size;
      } else if (mime.startsWith("audio/")) {
        categories.audio += size;
      } else if (
        mime.includes("pdf") ||
        mime.includes("document") ||
        mime.includes("text/") ||
        mime.includes("officedocument") ||
        mime.includes("msword")
      ) {
        categories.document += size;
      } else if (
        mime.includes("zip") ||
        mime.includes("tar") ||
        mime.includes("compressed") ||
        mime.includes("7z") ||
        mime.includes("rar")
      ) {
        categories.archive += size;
      } else {
        categories.other += size;
      }
    });

    res.json({
      totalBytes,
      fileCount: result.rows.length,
      categories,
    });
  } catch (err) {
    console.error("Stats error:", err);
    res.status(500).json({ error: "Failed to fetch storage stats" });
  }
});

router.post("/batch/delete", requireAuth, async (req, res) => {
  try {
    const { fileIds = [], folderIds = [] } = req.body;

    if (folderIds.length > 0) {
      const allFolderIds = [...folderIds];
      let toProcess = [...folderIds];
      while (toProcess.length > 0) {
        const parentList = toProcess;
        toProcess = [];
        const sub = await pool.query(
          "SELECT id FROM folders WHERE parent_id = ANY($1) AND owner_id = $2",
          [parentList, req.session.userId]
        );
        for (const row of sub.rows) {
          allFolderIds.push(row.id);
          toProcess.push(row.id);
        }
      }

      const folderFiles = await pool.query(
        "SELECT storage_key FROM files WHERE folder_id = ANY($1) AND owner_id = $2",
        [allFolderIds, req.session.userId]
      );
      for (const f of folderFiles.rows) {
        try {
          await deleteObject(f.storage_key);
        } catch (e) {
          console.error("Storage delete err:", f.storage_key, e);
        }
      }

      await pool.query("DELETE FROM files WHERE folder_id = ANY($1) AND owner_id = $2", [
        allFolderIds,
        req.session.userId,
      ]);
      await pool.query("DELETE FROM folders WHERE id = ANY($1) AND owner_id = $2", [
        allFolderIds,
        req.session.userId,
      ]);
    }

    if (fileIds.length > 0) {
      const filesQ = await pool.query(
        "SELECT storage_key FROM files WHERE id = ANY($1) AND owner_id = $2",
        [fileIds, req.session.userId]
      );
      for (const f of filesQ.rows) {
        try {
          await deleteObject(f.storage_key);
        } catch (e) {
          console.error("Storage delete err:", f.storage_key, e);
        }
      }
      fileIds.forEach((id) => invalidatePreviewCache(id));
      await pool.query("DELETE FROM files WHERE id = ANY($1) AND owner_id = $2", [
        fileIds,
        req.session.userId,
      ]);
    }

    res.json({ message: "Selected items deleted permanently" });
  } catch (err) {
    console.error("Batch delete error:", err);
    res.status(500).json({ error: "Failed to delete selected items" });
  }
});

router.post("/batch/move", requireAuth, async (req, res) => {
  try {
    const { fileIds = [], folderIds = [], targetFolderId = null } = req.body;
    const destId = targetFolderId ? parseInt(targetFolderId, 10) : null;

    if (destId) {
      const chk = await pool.query("SELECT id FROM folders WHERE id = $1 AND owner_id = $2", [
        destId,
        req.session.userId,
      ]);
      if (chk.rows.length === 0) {
        return res.status(400).json({ error: "Target folder does not exist" });
      }
    }

    if (fileIds.length > 0) {
      await pool.query("UPDATE files SET folder_id = $1 WHERE id = ANY($2) AND owner_id = $3", [
        destId,
        fileIds,
        req.session.userId,
      ]);
    }

    if (folderIds.length > 0) {
      const validFolderIds = folderIds.filter((id) => id !== destId);
      if (validFolderIds.length > 0) {
        await pool.query(
          "UPDATE folders SET parent_id = $1, updated_at = NOW() WHERE id = ANY($2) AND owner_id = $3",
          [destId, validFolderIds, req.session.userId]
        );
      }
    }

    res.json({ message: "Items moved successfully" });
  } catch (err) {
    console.error("Batch move error:", err);
    res.status(500).json({ error: "Failed to move items" });
  }
});

async function collectFolderFiles(userId, rootFolderId, basePath = "") {
  const result = [];
  const folderQ = await pool.query("SELECT id, name FROM folders WHERE id = $1 AND owner_id = $2", [
    rootFolderId,
    userId,
  ]);
  if (folderQ.rows.length === 0) return result;

  const currentFolder = folderQ.rows[0];
  const currentPath = basePath ? `${basePath}/${currentFolder.name}` : currentFolder.name;

  const filesQ = await pool.query(
    "SELECT id, original_name, storage_key, mime_type FROM files WHERE folder_id = $1 AND owner_id = $2",
    [rootFolderId, userId]
  );
  for (const f of filesQ.rows) {
    result.push({
      id: f.id,
      archivePath: `${currentPath}/${f.original_name}`,
      storageKey: f.storage_key,
    });
  }

  const subfoldersQ = await pool.query(
    "SELECT id FROM folders WHERE parent_id = $1 AND owner_id = $2",
    [rootFolderId, userId]
  );
  for (const sf of subfoldersQ.rows) {
    const subFiles = await collectFolderFiles(userId, sf.id, currentPath);
    result.push(...subFiles);
  }

  return result;
}

router.get("/folder/:id/download", requireAuth, async (req, res) => {
  try {
    const folderId = parseInt(req.params.id, 10);
    const folderQ = await pool.query("SELECT name FROM folders WHERE id = $1 AND owner_id = $2", [
      folderId,
      req.session.userId,
    ]);
    if (folderQ.rows.length === 0) return res.status(404).json({ error: "Folder not found" });

    const folderName = folderQ.rows[0].name;
    const fileItems = await collectFolderFiles(req.session.userId, folderId, "");

    const archive = new ZipArchive({ store: true });
    archive.on("error", (e) => console.error("Folder zip internal error:", e));
    const safeZipName = `${folderName.replace(/["\r\n/\\:]/g, "_")}.zip`;

    res.set("Content-Type", "application/zip");
    res.set(
      "Content-Disposition",
      `attachment; filename="${safeZipName}"; filename*=UTF-8''${encodeURIComponent(safeZipName)}`
    );

    archive.pipe(res);

    for (const item of fileItems) {
      try {
        const encryptedBlob = await getObject(item.storageKey);
        const decrypted = decrypt(encryptedBlob);
        archive.append(decrypted, { name: item.archivePath });
      } catch (fileErr) {
        console.error("Archive decrypt error for file:", item.archivePath, fileErr);
      }
    }

    await archive.finalize();
  } catch (err) {
    console.error("Folder zip error:", err);
    if (!res.headersSent) res.status(500).json({ error: "Failed to download folder as archive" });
  }
});

router.post("/batch/download-zip", requireAuth, async (req, res) => {
  try {
    const { fileIds = [], folderIds = [] } = req.body;
    if (fileIds.length === 0 && folderIds.length === 0) {
      return res.status(400).json({ error: "No files or folders selected" });
    }

    const archive = new ZipArchive({ store: true });
    archive.on("error", (e) => console.error("Batch zip internal error:", e));
    const zipName = `pinkbox_export_${Date.now()}.zip`;

    res.set("Content-Type", "application/zip");
    res.set(
      "Content-Disposition",
      `attachment; filename="${zipName}"; filename*=UTF-8''${encodeURIComponent(zipName)}`
    );

    archive.pipe(res);

    if (fileIds.length > 0) {
      const filesQ = await pool.query(
        "SELECT id, original_name, storage_key FROM files WHERE id = ANY($1) AND owner_id = $2",
        [fileIds, req.session.userId]
      );
      for (const f of filesQ.rows) {
        try {
          const encrypted = await getObject(f.storage_key);
          const decrypted = decrypt(encrypted);
          archive.append(decrypted, { name: f.original_name });
        } catch (e) {
          console.error("Failed to add file to archive:", f.original_name, e);
        }
      }
    }

    if (folderIds.length > 0) {
      for (const fid of folderIds) {
        const items = await collectFolderFiles(req.session.userId, fid, "");
        for (const item of items) {
          try {
            const encrypted = await getObject(item.storageKey);
            const decrypted = decrypt(encrypted);
            archive.append(decrypted, { name: item.archivePath });
          } catch (e) {
            console.error("Failed to add folder file to archive:", item.archivePath, e);
          }
        }
      }
    }

    await archive.finalize();
  } catch (err) {
    console.error("Batch zip error:", err);
    if (!res.headersSent) res.status(500).json({ error: "Failed to create archive" });
  }
});

router.get("/export/all", requireAuth, async (req, res) => {
  try {
    const archive = new ZipArchive({ store: true });
    archive.on("error", (e) => console.error("Vault zip internal error:", e));
    const zipName = `pinkbox_vault_backup_${Date.now()}.zip`;

    res.set("Content-Type", "application/zip");
    res.set(
      "Content-Disposition",
      `attachment; filename="${zipName}"; filename*=UTF-8''${encodeURIComponent(zipName)}`
    );

    archive.pipe(res);

    const rootFiles = await pool.query(
      "SELECT original_name, storage_key FROM files WHERE owner_id = $1 AND folder_id IS NULL",
      [req.session.userId]
    );
    for (const rf of rootFiles.rows) {
      try {
        const encrypted = await getObject(rf.storage_key);
        const decrypted = decrypt(encrypted);
        archive.append(decrypted, { name: rf.original_name });
      } catch (e) {
        console.error("Root file export err:", rf.original_name, e);
      }
    }

    const topFolders = await pool.query(
      "SELECT id FROM folders WHERE owner_id = $1 AND parent_id IS NULL",
      [req.session.userId]
    );
    for (const tf of topFolders.rows) {
      const items = await collectFolderFiles(req.session.userId, tf.id, "");
      for (const item of items) {
        try {
          const encrypted = await getObject(item.storageKey);
          const decrypted = decrypt(encrypted);
          archive.append(decrypted, { name: item.archivePath });
        } catch (e) {
          console.error("Folder file export err:", item.archivePath, e);
        }
      }
    }

    await archive.finalize();
  } catch (err) {
    console.error("Full drive export error:", err);
    if (!res.headersSent) res.status(500).json({ error: "Failed to export vault" });
  }
});

router.post(
  "/",
  requireAuth,
  (req, res, next) => {
    upload.single("file")(req, res, (err) => {
      if (err) {
        if (err.code === "LIMIT_FILE_SIZE") {
          return res.status(413).json({ error: "File exceeds maximum size limit (5GB)" });
        }
        return res.status(400).json({ error: err.message || "Upload error" });
      }
      next();
    });
  },
  async (req, res) => {
    try {
      if (!req.file) return res.status(400).json({ error: "No file provided" });

      const folderId = req.body.folderId ? parseInt(req.body.folderId, 10) : null;
      if (folderId) {
        const chk = await pool.query("SELECT id FROM folders WHERE id = $1 AND owner_id = $2", [
          folderId,
          req.session.userId,
        ]);
        if (chk.rows.length === 0) {
          return res.status(400).json({ error: "Target folder not found" });
        }
      }

      const storageKey = req.session.userId + "/" + crypto.randomUUID();
      const sha256 = crypto.createHash("sha256").update(req.file.buffer).digest("hex");
      const { ciphertext } = encrypt(req.file.buffer);
      await putObject(storageKey, ciphertext);

      const result = await pool.query(
        `INSERT INTO files (owner_id, original_name, storage_key, size_bytes, mime_type, sha256, folder_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, original_name, size_bytes, mime_type, sha256, folder_id, uploaded_at`,
        [
          req.session.userId,
          req.file.originalname,
          storageKey,
          req.file.size,
          req.file.mimetype,
          sha256,
          folderId,
        ]
      );
      res.status(201).json(result.rows[0]);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Upload failed" });
    }
  }
);

router.get("/", requireAuth, async (req, res) => {
  try {
    const folderId = req.query.folderId ? parseInt(req.query.folderId, 10) : null;
    let query, params;

    if (req.query.all === "true") {
      query = `SELECT id, original_name, size_bytes, mime_type, sha256, folder_id, uploaded_at 
               FROM files 
               WHERE owner_id = $1 
               ORDER BY uploaded_at DESC`;
      params = [req.session.userId];
    } else if (folderId) {
      query = `SELECT id, original_name, size_bytes, mime_type, sha256, folder_id, uploaded_at 
               FROM files 
               WHERE owner_id = $1 AND folder_id = $2 
               ORDER BY uploaded_at DESC`;
      params = [req.session.userId, folderId];
    } else {
      query = `SELECT id, original_name, size_bytes, mime_type, sha256, folder_id, uploaded_at 
               FROM files 
               WHERE owner_id = $1 AND folder_id IS NULL 
               ORDER BY uploaded_at DESC`;
      params = [req.session.userId];
    }

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not list files" });
  }
});

router.patch("/:id/rename", requireAuth, async (req, res) => {
  try {
    const fileId = parseInt(req.params.id, 10);
    const { name } = req.body;
    if (!name || typeof name !== "string" || !name.trim()) {
      return res.status(400).json({ error: "File name is required" });
    }

    const result = await pool.query(
      `UPDATE files 
       SET original_name = $1 
       WHERE id = $2 AND owner_id = $3 
       RETURNING id, original_name, folder_id, size_bytes, mime_type, uploaded_at`,
      [name.trim(), fileId, req.session.userId]
    );

    if (result.rows.length === 0) return res.status(404).json({ error: "File not found" });
    res.json(result.rows[0]);
  } catch (err) {
    console.error("Rename file error:", err);
    res.status(500).json({ error: "Failed to rename file" });
  }
});

router.patch("/:id/move", requireAuth, async (req, res) => {
  try {
    const fileId = parseInt(req.params.id, 10);
    const folderId = req.body.folderId ? parseInt(req.body.folderId, 10) : null;

    if (folderId) {
      const chk = await pool.query("SELECT id FROM folders WHERE id = $1 AND owner_id = $2", [
        folderId,
        req.session.userId,
      ]);
      if (chk.rows.length === 0) {
        return res.status(400).json({ error: "Target folder not found" });
      }
    }

    const result = await pool.query(
      `UPDATE files 
       SET folder_id = $1 
       WHERE id = $2 AND owner_id = $3 
       RETURNING id, original_name, folder_id`,
      [folderId, fileId, req.session.userId]
    );

    if (result.rows.length === 0) return res.status(404).json({ error: "File not found" });
    res.json(result.rows[0]);
  } catch (err) {
    console.error("Move file error:", err);
    res.status(500).json({ error: "Failed to move file" });
  }
});

router.get("/:id/metadata", requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT id, original_name, size_bytes, mime_type, sha256, folder_id, uploaded_at FROM files WHERE id = $1 AND owner_id = $2",
      [req.params.id, req.session.userId]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: "File not found" });

    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not fetch metadata" });
  }
});

router.get("/:id/preview", requireAuth, async (req, res) => {
  try {
    const fileId = req.params.id;
    const result = await pool.query(
      "SELECT id, owner_id, original_name, mime_type, size_bytes, storage_key FROM files WHERE id = $1 AND owner_id = $2",
      [fileId, req.session.userId]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: "File not found" });

    const file = result.rows[0];
    let plaintext = getCachedPreview(file.id);

    if (!plaintext) {
      const blob = await getObject(file.storage_key);
      plaintext = decrypt(blob);
      setCachedPreview(file.id, plaintext);
    }

    const totalSize = plaintext.length;
    const etag = `"${file.id}-${totalSize}"`;

    res.set({
      ETag: etag,
      "Cache-Control": "private, max-age=86400, stale-while-revalidate=3600",
      "Accept-Ranges": "bytes",
    });

    const range = req.headers.range;
    if (range) {
      const match = range.match(/bytes=(\d*)-(\d*)/);
      if (match) {
        let start;
        let end;

        if (match[1] === "" && match[2] !== "") {
          const suffix = parseInt(match[2], 10);
          start = Math.max(0, totalSize - suffix);
          end = totalSize - 1;
        } else {
          start = parseInt(match[1], 10);
          end = match[2] ? parseInt(match[2], 10) : totalSize - 1;
        }

        if (isNaN(start) || isNaN(end) || start >= totalSize || end >= totalSize || start > end) {
          res.status(416).set("Content-Range", `bytes */${totalSize}`).end();
          return;
        }

        const chunk = plaintext.subarray(start, end + 1);
        res.status(206);
        res.set({
          "Content-Range": `bytes ${start}-${end}/${totalSize}`,
          "Content-Length": chunk.length,
          "Content-Type": file.mime_type || "application/octet-stream",
        });
        res.send(chunk);
        return;
      }
    } else {
      if (req.headers["if-none-match"] === etag) {
        return res.status(304).end();
      }
      res.set({
        "Content-Type": file.mime_type || "application/octet-stream",
        "Content-Length": totalSize,
        "Content-Disposition": `inline; filename="${file.original_name.replace(/["\r\n]/g, "_")}"`,
      });
      res.send(plaintext);
    }
  } catch (err) {
    console.error("Preview/Stream error:", err);
    res.status(500).json({ error: "Streaming preview failed" });
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

    invalidatePreviewCache(req.params.id);
    await deleteObject(result.rows[0].storage_key);
    await pool.query("DELETE FROM files WHERE id = $1", [req.params.id]);
    res.json({ message: "File permanently deleted" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Delete failed" });
  }
});

module.exports = router;
