const { Router } = require("express");
const multer = require("multer");
const crypto = require("crypto");
const path = require("path");
const { ZipArchive } = require("archiver");
const { pool, fileRepository, folderRepository } = require("../db");
const {
  encrypt,
  decrypt,
  encryptText,
  decryptText,
  encryptJson,
  decryptJson,
} = require("../crypto");
const { putObject, getObject, deleteObject } = require("../storage");
const { extractAudioCover } = require("../audioCover");
const { extractMetadata } = require("../metadataExtractor");
const logger = require("../logger");

const router = Router();

function revealFileRow(row) {
  if (!row) return row;
  if (row.original_name !== undefined) row.original_name = decryptText(row.original_name);
  if (row.storage_key !== undefined) row.storage_key = decryptText(row.storage_key);
  if (row.mime_type !== undefined) row.mime_type = decryptText(row.mime_type);
  if (row.sha256 !== undefined) row.sha256 = decryptText(row.sha256);
  if (row.metadata !== undefined) row.metadata = decryptJson(row.metadata);
  return row;
}

function revealFolderRow(row) {
  if (row && row.name !== undefined) row.name = decryptText(row.name);
  return row;
}
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5120 * 1024 * 1024 },
});

// TODO decrpyt preview buffers
function normalizeShareLimit(value) {
  if (value === undefined || value === null || value === "") return null;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0 || parsed > 1000000000) return NaN;
  return parsed === 0 ? null : parsed;
}

const previewCache = new Map();
const coverCache = new Map();
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
  coverCache.delete(strId);
}

function getCachedCover(fileId) {
  return coverCache.get(String(fileId));
}

function setCachedCover(fileId, cover) {
  const strId = String(fileId);
  if (coverCache.size > 200) {
    const firstKey = coverCache.keys().next().value;
    coverCache.delete(firstKey);
  }
  coverCache.set(strId, cover);
}

function getCachedPreview(fileId) {
  const strId = String(fileId);
  const entry = previewCache.get(strId);
  if (entry) {
    entry.lastAccess = Date.now();
    clearTimeout(entry.timer);
    entry.timer = setTimeout(() => {
      invalidatePreviewCache(strId);
    }, 180000);
    return entry.buffer;
  }
  return null;
}

function setCachedPreview(fileId, buffer) {
  const strId = String(fileId);
  if (buffer.length > 150 * 1024 * 1024) return;

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
    const rows = await fileRepository.getStorageStats(req.session.userId);

    let totalBytes = 0;
    const categories = {
      image: 0,
      video: 0,
      audio: 0,
      document: 0,
      archive: 0,
      other: 0,
    };

    rows.forEach((r) => {
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
      fileCount: rows.length,
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
          await deleteObject(decryptText(f.storage_key));
        } catch (e) {
          logger.error("Storage object delete failed", e);
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
          await deleteObject(decryptText(f.storage_key));
        } catch (e) {
          logger.error("Storage object delete failed", e);
        }
      }
      fileIds.forEach((id) => invalidatePreviewCache(id));
      await pool.query("DELETE FROM files WHERE id = ANY($1) AND owner_id = $2", [
        fileIds,
        req.session.userId,
      ]);
    }

    logger.audit({
      event: "BATCH_DELETE_SUCCESS",
      req,
      userId: req.session.userId,
      details: { fileIds, folderIds, count: fileIds.length + folderIds.length },
      outcome: "SUCCESS",
      statusCode: 200,
    });

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

    logger.audit({
      event: "BATCH_MOVE_SUCCESS",
      req,
      userId: req.session.userId,
      details: {
        fileIds,
        folderIds,
        targetFolderId: destId,
        count: fileIds.length + folderIds.length,
      },
      outcome: "SUCCESS",
      statusCode: 200,
    });

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

  const currentFolder = revealFolderRow(folderQ.rows[0]);
  const currentPath = basePath ? `${basePath}/${currentFolder.name}` : currentFolder.name;

  const filesQ = await pool.query(
    "SELECT id, original_name, storage_key, mime_type, size_bytes FROM files WHERE folder_id = $1 AND owner_id = $2",
    [rootFolderId, userId]
  );
  for (const f of filesQ.rows.map(revealFileRow)) {
    result.push({
      id: f.id,
      archivePath: `${currentPath}/${f.original_name}`,
      storageKey: f.storage_key,
      sizeBytes: Number(f.size_bytes) || 0,
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

    const folderName = revealFolderRow(folderQ.rows[0]).name;
    const fileItems = await collectFolderFiles(req.session.userId, folderId, "");
    const estimatedSize = fileItems.reduce((sum, item) => sum + item.sizeBytes, 0);

    const archive = new ZipArchive({ store: true });
    archive.on("error", (e) => console.error("Folder zip internal error:", e));
    const safeZipName = `${folderName.replace(/["\r\n/\\:]/g, "_")}.zip`;

    res.set("Content-Type", "application/zip");
    res.set("X-Download-Size", String(estimatedSize));
    res.set(
      "Content-Disposition",
      `attachment; filename="${safeZipName}"; filename*=UTF-8''${encodeURIComponent(safeZipName)}`
    );

    archive.pipe(res);

    logger.audit({
      event: "FOLDER_DOWNLOAD_ZIP",
      req,
      userId: req.session.userId,
      itemType: "folder",
      itemId: folderId,
      itemName: folderName,
      details: { fileCount: fileItems.length, estimatedSize },
      outcome: "SUCCESS",
      statusCode: 200,
    });

    for (const item of fileItems) {
      try {
        const encryptedBlob = await getObject(item.storageKey);
        const decrypted = decrypt(encryptedBlob);
        archive.append(decrypted, { name: item.archivePath });
      } catch (fileErr) {
        logger.error("Archive decrypt failed", fileErr);
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

    const zipName = `pinkbox_export_${Date.now()}.zip`;
    const archiveItems = [];

    if (fileIds.length > 0) {
      const filesQ = await pool.query(
        "SELECT id, original_name, storage_key, size_bytes FROM files WHERE id = ANY($1) AND owner_id = $2",
        [fileIds, req.session.userId]
      );
      for (const file of filesQ.rows.map(revealFileRow)) {
        archiveItems.push({
          originalName: file.original_name,
          storageKey: file.storage_key,
          archivePath: file.original_name,
          sizeBytes: Number(file.size_bytes) || 0,
        });
      }
    }

    for (const folderId of folderIds) {
      const items = await collectFolderFiles(req.session.userId, folderId, "");
      archiveItems.push(...items);
    }

    const estimatedSize = archiveItems.reduce((sum, item) => sum + item.sizeBytes, 0);
    const archive = new ZipArchive({ store: true });
    archive.on("error", (e) => console.error("Batch zip internal error:", e));

    res.set("Content-Type", "application/zip");
    res.set("X-Download-Size", String(estimatedSize));
    res.set(
      "Content-Disposition",
      `attachment; filename="${zipName}"; filename*=UTF-8''${encodeURIComponent(zipName)}`
    );

    archive.pipe(res);

    logger.audit({
      event: "FOLDER_DOWNLOAD_ZIP",
      req,
      userId: req.session.userId,
      itemType: "folder",
      itemId: folderId,
      itemName: folderName,
      details: { fileCount: fileItems.length, estimatedSize },
      outcome: "SUCCESS",
      statusCode: 200,
    });

    for (const item of archiveItems) {
      try {
        const encrypted = await getObject(item.storageKey);
        const decrypted = decrypt(encrypted);
        archive.append(decrypted, { name: item.archivePath });
      } catch (e) {
        logger.error("Archive file append failed", e);
      }
    }

    await archive.finalize();
  } catch (err) {
    console.error("Batch zip error:", err);
    if (!res.headersSent) res.status(500).json({ error: "Failed to create archive" });
  }
});

router.post("/batch/share", requireAuth, async (req, res) => {
  try {
    const {
      fileIds = [],
      folderIds = [],
      isPublic = true,
      accessType = "view",
      maxViews: requestedMaxViews,
      maxDownloads: requestedMaxDownloads,
      title,
      expiresInHours,
    } = req.body;
    const accessTypeValue = accessType === "edit" ? "edit" : "view";
    const maxViews = normalizeShareLimit(requestedMaxViews);
    const maxDownloads = normalizeShareLimit(requestedMaxDownloads);
    if (Number.isNaN(maxViews) || Number.isNaN(maxDownloads)) {
      return res
        .status(400)
        .json({ error: "Share limits must be whole numbers from 0 to 1000000000" });
    }
    const expiresInHoursInt = expiresInHours ? parseInt(expiresInHours, 10) : null;
    let expiresAt = null;
    if (expiresInHoursInt && expiresInHoursInt > 0) {
      expiresAt = new Date(Date.now() + expiresInHoursInt * 3600 * 1000);
    }
    if (fileIds.length === 0 && folderIds.length === 0) {
      return res.status(400).json({ error: "No files or folders selected to share" });
    }

    const allFileItems = [];
    const seenIds = new Set();

    if (fileIds.length > 0) {
      const filesQ = await pool.query(
        "SELECT id, original_name FROM files WHERE id = ANY($1) AND owner_id = $2",
        [fileIds, req.session.userId]
      );
      for (const f of filesQ.rows.map(revealFileRow)) {
        if (!seenIds.has(f.id)) {
          seenIds.add(f.id);
          allFileItems.push({ id: f.id, displayName: f.original_name });
        }
      }
    }

    if (folderIds.length > 0) {
      for (const fid of folderIds) {
        const folderFiles = await collectFolderFiles(req.session.userId, fid, "");
        for (const item of folderFiles) {
          if (!seenIds.has(item.id)) {
            seenIds.add(item.id);
            allFileItems.push({ id: item.id, displayName: item.archivePath });
          }
        }
      }
    }

    if (allFileItems.length === 0) {
      return res.status(400).json({ error: "No files found in selection" });
    }

    const shareToken = crypto.randomBytes(24).toString("hex");
    const shareTitle = title || `Collection (${allFileItems.length} items)`;

    const shareQ = await pool.query(
      `INSERT INTO file_shares (owner_id, share_token, is_public, allow_download, access_type, max_views, max_downloads, is_batch, title, file_id, expires_at)
       VALUES ($1, $2, $3, true, $4, $5, $6, true, $7, NULL, $8)
       RETURNING id, share_token, is_public, allow_download, access_type, max_views, max_downloads, is_batch, title, created_at, expires_at`,
      [
        req.session.userId,
        shareToken,
        isPublic !== false,
        accessTypeValue,
        maxViews,
        maxDownloads,
        encryptText(shareTitle),
        expiresAt,
      ]
    );

    const share = shareQ.rows[0];

    for (const item of allFileItems) {
      await pool.query(
        "INSERT INTO file_share_items (share_id, file_id, display_name) VALUES ($1, $2, $3)",
        [share.id, item.id, encryptText(item.displayName)]
      );
    }

    logger.audit({
      event: "FILE_BATCH_SHARE_CREATED",
      req,
      userId: req.session.userId,
      outcome: "SUCCESS",
      statusCode: 201,
      details: {
        shareId: share.id,
        fileCount: allFileItems.length,
        isPublic,
        accessType: accessTypeValue,
        maxViews,
        maxDownloads,
      },
    });

    res.status(201).json({
      ...share,
      title: decryptText(share.title),
      file_count: allFileItems.length,
    });
  } catch (err) {
    logger.error("Create batch share error", err);
    res.status(500).json({ error: "Failed to create batch share" });
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

    logger.audit({
      event: "FOLDER_DOWNLOAD_ZIP",
      req,
      userId: req.session.userId,
      itemType: "folder",
      itemId: folderId,
      itemName: folderName,
      details: { fileCount: fileItems.length, estimatedSize },
      outcome: "SUCCESS",
      statusCode: 200,
    });

    const rootFiles = await pool.query(
      "SELECT original_name, storage_key FROM files WHERE owner_id = $1 AND folder_id IS NULL",
      [req.session.userId]
    );
    for (const rf of rootFiles.rows.map(revealFileRow)) {
      try {
        const encrypted = await getObject(rf.storage_key);
        const decrypted = decrypt(encrypted);
        archive.append(decrypted, { name: rf.original_name });
      } catch (e) {
        logger.error("Root file export failed", e);
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
          logger.error("Folder file export failed", e);
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
          return res.status(413).json({ error: "File exceeds 5GB" });
        }
        return res.status(400).json({ error: err.message || "Upload error" });
      }
      next();
    });
  },
  async (req, res) => {
    try {
      if (!req.file) return res.status(400).json({ error: "No file provided" });

      const rawName = req.file.originalname || "unnamed_file";
      const baseName = path
        .basename(rawName)
        .replace(/[\x00-\x1F\x7F-\x9F]/g, "")
        .trim();
      const safeOriginalName = baseName.slice(0, 255) || "unnamed_file";

      const folderId = req.body.folderId ? parseInt(req.body.folderId, 10) : null;
      if (folderId) {
        const folder = await folderRepository.getFolderById(folderId, req.session.userId);
        if (!folder) {
          return res.status(400).json({ error: "Target folder not found" });
        }
      }

      const storageKey = req.session.userId + "/" + crypto.randomUUID();
      const sha256 = crypto.createHash("sha256").update(req.file.buffer).digest("hex");
      const { ciphertext } = encrypt(req.file.buffer);
      await putObject(storageKey, ciphertext);

      const metadata = extractMetadata(
        req.file.buffer,
        safeOriginalName,
        req.file.mimetype || "application/octet-stream",
        req.file.size
      );

      const downloadToken = crypto.randomBytes(16).toString("hex");

      const result = await pool.query(
        `INSERT INTO files (owner_id, original_name, storage_key, size_bytes, mime_type, sha256, folder_id, metadata, download_token)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING id, original_name, size_bytes, mime_type, sha256, folder_id, uploaded_at, metadata, download_token`,
        [
          req.session.userId,
          encryptText(safeOriginalName),
          encryptText(storageKey),
          req.file.size,
          encryptText(req.file.mimetype || "application/octet-stream"),
          encryptText(sha256),
          folderId,
          JSON.stringify(encryptJson(metadata)),
          downloadToken,
        ]
      );

      logger.audit({
        event: "FILE_UPLOAD_SUCCESS",
        req,
        userId: req.session.userId,
        outcome: "SUCCESS",
        statusCode: 201,
        details: {
          fileId: result.rows[0].id,
          fileName: safeOriginalName,
          sizeBytes: req.file.size,
          mimeType: req.file.mimetype,
          sha256,
        },
      });

      res.status(201).json(revealFileRow(result.rows[0]));
    } catch (err) {
      logger.error("Upload error", err);
      res.status(500).json({ error: "Upload failed" });
    }
  }
);

router.get("/", requireAuth, async (req, res) => {
  try {
    const folderId = req.query.folderId ? parseInt(req.query.folderId, 10) : null;
    const files = await fileRepository.listVaultFiles(
      req.session.userId,
      folderId,
      req.query.all === "true"
    );
    res.json(files);
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

    const file = await fileRepository.renameFile(fileId, req.session.userId, name.trim());

    if (!file) return res.status(404).json({ error: "File not found" });

    logger.audit({
      event: "FILE_RENAME_SUCCESS",
      req,
      userId: req.session.userId,
      itemType: "file",
      itemId: fileId,
      itemName: file.original_name,
      details: { newName: file.original_name },
      outcome: "SUCCESS",
      statusCode: 200,
    });

    res.json(file);
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
      const folder = await folderRepository.getFolderById(folderId, req.session.userId);
      if (!folder) {
        return res.status(400).json({ error: "Target folder not found" });
      }
    }

    const file = await fileRepository.moveSingleFile(fileId, req.session.userId, folderId);

    if (!file) return res.status(404).json({ error: "File not found" });

    logger.audit({
      event: "FILE_MOVE_SUCCESS",
      req,
      userId: req.session.userId,
      itemType: "file",
      itemId: fileId,
      itemName: file.original_name,
      details: { folderId },
      outcome: "SUCCESS",
      statusCode: 200,
    });

    res.json(file);
  } catch (err) {
    console.error("Move file error:", err);
    res.status(500).json({ error: "Failed to move file" });
  }
});

router.get("/:id/metadata", requireAuth, async (req, res) => {
  try {
    const file = await fileRepository.getFileMetadata(req.params.id, req.session.userId);
    if (!file) return res.status(404).json({ error: "File not found" });

    let meta = file.metadata;
    if (!meta || Object.keys(meta).length === 0) {
      try {
        const blob = await getObject(file.storage_key);
        const buf = decrypt(blob);
        meta = extractMetadata(buf, file.original_name, file.mime_type, file.size_bytes);
        await fileRepository.updateFileMetadata(file.id, req.session.userId, meta);
        file.metadata = meta;
      } catch (e) {
        console.error("On-demand metadata extraction failed:", e);
      }
    }

    const { storage_key, ...safeFile } = file;
    res.json(safeFile);
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

    const file = revealFileRow(result.rows[0]);
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
          "Content-Security-Policy": "default-src 'none'; sandbox",
          "X-Content-Type-Options": "nosniff",
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
        "Content-Security-Policy": "default-src 'none'; sandbox",
        "X-Content-Type-Options": "nosniff",
      });
      res.send(plaintext);
    }
  } catch (err) {
    logger.error("Preview/Stream error", err);
    res.status(500).json({ error: "Streaming preview failed" });
  }
});

router.get("/:id/cover", requireAuth, async (req, res) => {
  try {
    const fileId = req.params.id;
    const cached = getCachedCover(fileId);
    if (cached === null) {
      return res.status(404).send("No cover art");
    }
    if (cached) {
      res.set({
        "Content-Type": cached.mime,
        "Cache-Control": "private, max-age=86400, stale-while-revalidate=3600",
        ETag: `"${fileId}-cover"`,
      });
      return res.send(cached.buffer);
    }

    const result = await pool.query(
      "SELECT id, owner_id, original_name, mime_type, storage_key FROM files WHERE id = $1 AND owner_id = $2",
      [fileId, req.session.userId]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: "File not found" });

    const file = revealFileRow(result.rows[0]);
    const mime = (file.mime_type || "").toLowerCase();
    const name = (file.original_name || "").toLowerCase();
    const isAudio =
      mime.startsWith("audio/") ||
      mime.includes("ogg") ||
      name.endsWith(".mp3") ||
      name.endsWith(".m4a") ||
      name.endsWith(".flac") ||
      name.endsWith(".wav") ||
      name.endsWith(".ogg");

    if (!isAudio) {
      setCachedCover(file.id, null);
      return res.status(404).send("Not an audio file");
    }

    let plaintext = getCachedPreview(file.id);
    if (!plaintext) {
      const blob = await getObject(file.storage_key);
      plaintext = decrypt(blob);
      setCachedPreview(file.id, plaintext);
    }

    const cover = extractAudioCover(plaintext);
    if (!cover) {
      setCachedCover(file.id, null);
      return res.status(404).send("No cover art");
    }

    setCachedCover(file.id, { mime: cover.mime, buffer: cover.data });
    res.set({
      "Content-Type": cover.mime,
      "Cache-Control": "private, max-age=86400, stale-while-revalidate=3600",
      ETag: `"${file.id}-cover"`,
    });
    res.send(cover.data);
  } catch (err) {
    logger.error("Audio cover extraction error", err);
    res.status(500).json({ error: "Cover extraction failed" });
  }
});

async function serveDecryptedFile(file, req, res) {
  revealFileRow(file);
  const blob = await getObject(file.storage_key);
  const plaintext = decrypt(blob);

  logger.audit({
    event: "FILE_DOWNLOAD",
    req,
    userId: req.session.userId,
    outcome: "SUCCESS",
    statusCode: 200,
    details: { fileId: file.id, fileName: file.original_name, sizeBytes: file.size_bytes },
  });

  res.set("Content-Type", file.mime_type || "application/octet-stream");
  res.set("X-Content-Type-Options", "nosniff");
  const safeName = file.original_name.replace(/["\r\n]/g, "_");
  const encodedName = encodeURIComponent(file.original_name);
  res.set(
    "Content-Disposition",
    'attachment; filename="' + safeName + "\"; filename*=UTF-8''" + encodedName
  );
  res.send(plaintext);
}

router.get("/download/:token", requireAuth, async (req, res) => {
  try {
    const token = req.params.token;
    let result = await pool.query(
      "SELECT * FROM files WHERE download_token = $1 AND owner_id = $2",
      [token, req.session.userId]
    );

    if (result.rows.length === 0 && /^\d+$/.test(token)) {
      result = await pool.query("SELECT * FROM files WHERE id = $1 AND owner_id = $2", [
        parseInt(token, 10),
        req.session.userId,
      ]);
    }

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "File not found" });
    }

    await serveDecryptedFile(revealFileRow(result.rows[0]), req, res);
  } catch (err) {
    logger.error("Download error", err);
    res.status(500).json({ error: "Download failed" });
  }
});

router.get("/:id/download", requireAuth, async (req, res) => {
  try {
    const param = req.params.id;
    let result;
    if (/^\d+$/.test(param)) {
      result = await pool.query("SELECT * FROM files WHERE id = $1 AND owner_id = $2", [
        parseInt(param, 10),
        req.session.userId,
      ]);
    } else {
      result = await pool.query("SELECT * FROM files WHERE download_token = $1 AND owner_id = $2", [
        param,
        req.session.userId,
      ]);
    }

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "File not found" });
    }

    await serveDecryptedFile(revealFileRow(result.rows[0]), req, res);
  } catch (err) {
    logger.error("Download error", err);
    res.status(500).json({ error: "Download failed" });
  }
});

router.post("/:id/share", requireAuth, async (req, res) => {
  try {
    const fileId = parseInt(req.params.id, 10);
    if (isNaN(fileId)) return res.status(400).json({ error: "Invalid file ID" });

    const fileQ = await pool.query(
      "SELECT id, original_name FROM files WHERE id = $1 AND owner_id = $2",
      [fileId, req.session.userId]
    );
    if (fileQ.rows.length === 0) return res.status(404).json({ error: "File not found" });
    revealFileRow(fileQ.rows[0]);

    const isPublic = req.body.isPublic !== false;
    const accessType = req.body.accessType === "edit" ? "edit" : "view";
    const maxViews = normalizeShareLimit(req.body.maxViews);
    const maxDownloads = normalizeShareLimit(req.body.maxDownloads);
    if (Number.isNaN(maxViews) || Number.isNaN(maxDownloads)) {
      return res
        .status(400)
        .json({ error: "Share limits must be whole numbers from 0 to 1000000000" });
    }
    const expiresInHours = req.body.expiresInHours ? parseInt(req.body.expiresInHours, 10) : null;
    let expiresAt = null;
    if (expiresInHours && expiresInHours > 0) {
      expiresAt = new Date(Date.now() + expiresInHours * 3600 * 1000);
    }

    const shareToken = crypto.randomBytes(24).toString("hex");

    const shareQ = await pool.query(
      `INSERT INTO file_shares (file_id, owner_id, share_token, is_public, allow_download, access_type, max_views, max_downloads, expires_at)
       VALUES ($1, $2, $3, $4, true, $5, $6, $7, $8)
       RETURNING id, file_id, share_token, is_public, allow_download, access_type, max_views, max_downloads, created_at, expires_at`,
      [
        fileId,
        req.session.userId,
        shareToken,
        isPublic,
        accessType,
        maxViews,
        maxDownloads,
        expiresAt,
      ]
    );

    logger.audit({
      event: "FILE_SHARE_CREATED",
      req,
      userId: req.session.userId,
      outcome: "SUCCESS",
      statusCode: 201,
      details: {
        fileId,
        shareId: shareQ.rows[0].id,
        isPublic,
        accessType,
        maxViews,
        maxDownloads,
        expiresAt,
      },
    });

    res.status(201).json(shareQ.rows[0]);
  } catch (err) {
    logger.error("Create share error", err);
    res.status(500).json({ error: "Failed to create share link" });
  }
});

router.get("/:id/shares", requireAuth, async (req, res) => {
  try {
    const fileId = parseInt(req.params.id, 10);
    if (isNaN(fileId)) return res.status(400).json({ error: "Invalid file ID" });

    const chk = await pool.query("SELECT id FROM files WHERE id = $1 AND owner_id = $2", [
      fileId,
      req.session.userId,
    ]);
    if (chk.rows.length === 0) return res.status(404).json({ error: "File not found" });

    const sharesQ = await pool.query(
      `SELECT id, file_id, share_token, is_public, allow_download, access_type, max_views, max_downloads, is_batch, title, views_count, downloads_count, saves_count, created_at, expires_at
       FROM file_shares
       WHERE file_id = $1 AND owner_id = $2 AND (expires_at IS NULL OR expires_at > NOW())
       ORDER BY created_at DESC`,
      [fileId, req.session.userId]
    );

    res.json(sharesQ.rows);
  } catch (err) {
    logger.error("List shares error", err);
    res.status(500).json({ error: "Failed to fetch file shares" });
  }
});

router.delete("/shares/:shareId", requireAuth, async (req, res) => {
  try {
    const shareId = parseInt(req.params.shareId, 10);
    if (isNaN(shareId)) return res.status(400).json({ error: "Invalid share ID" });

    const delQ = await pool.query(
      "DELETE FROM file_shares WHERE id = $1 AND owner_id = $2 RETURNING id, file_id",
      [shareId, req.session.userId]
    );

    if (delQ.rows.length === 0) return res.status(404).json({ error: "Share not found" });

    logger.audit({
      event: "FILE_SHARE_REVOKED",
      req,
      userId: req.session.userId,
      outcome: "SUCCESS",
      statusCode: 200,
      details: { shareId, fileId: delQ.rows[0].file_id },
    });

    res.json({ message: "Share link revoked successfully" });
  } catch (err) {
    logger.error("Delete share error", err);
    res.status(500).json({ error: "Failed to revoke share link" });
  }
});

router.delete("/shares", requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      "DELETE FROM file_shares WHERE owner_id = $1 RETURNING id, file_id",
      [req.session.userId]
    );

    logger.audit({
      event: "FILE_SHARES_REVOKED_ALL",
      req,
      userId: req.session.userId,
      outcome: "SUCCESS",
      statusCode: 200,
      details: { revokedCount: result.rowCount },
    });

    res.json({ message: "All share links revoked successfully", revokedCount: result.rowCount });
  } catch (err) {
    logger.error("Revoke all shares error", err);
    res.status(500).json({ error: "Failed to revoke all share links" });
  }
});

router.get("/:id", requireAuth, async (req, res) => {
  try {
    const param = req.params.id;
    let result;
    if (/^\d+$/.test(param)) {
      result = await pool.query("SELECT * FROM files WHERE id = $1 AND owner_id = $2", [
        parseInt(param, 10),
        req.session.userId,
      ]);
    } else {
      result = await pool.query("SELECT * FROM files WHERE download_token = $1 AND owner_id = $2", [
        param,
        req.session.userId,
      ]);
    }

    if (result.rows.length === 0) {
      try {
        if (/^\d+$/.test(param)) {
          const otherCheck = await pool.query("SELECT id FROM files WHERE id = $1", [param]);
          if (otherCheck.rows.length > 0) {
            logger.audit({
              event: "SECURITY_ACCESS_DENIED",
              req,
              userId: req.session.userId,
              outcome: "BLOCKED",
              level: "WARN",
              statusCode: 403,
              details: { attemptedFileId: param, operation: "download" },
            });
          }
        }
      } catch (_) {}
      return res.status(404).json({ error: "File not found" });
    }

    await serveDecryptedFile(result.rows[0], req, res);
  } catch (err) {
    logger.error("Download error", err);
    res.status(500).json({ error: "Download failed" });
  }
});

router.delete("/:id", requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT storage_key FROM files WHERE id = $1 AND owner_id = $2",
      [req.params.id, req.session.userId]
    );
    if (result.rows.length === 0) {
      try {
        const otherCheck = await pool.query("SELECT id FROM files WHERE id = $1", [req.params.id]);
        if (otherCheck.rows.length > 0) {
          logger.audit({
            event: "SECURITY_ACCESS_DENIED",
            req,
            userId: req.session.userId,
            outcome: "BLOCKED",
            level: "WARN",
            statusCode: 403,
            details: { attemptedFileId: req.params.id, operation: "delete" },
          });
        }
      } catch (_) {}
      return res.status(404).json({ error: "File not found" });
    }

    invalidatePreviewCache(req.params.id);
    await deleteObject(decryptText(result.rows[0].storage_key));
    await pool.query("DELETE FROM files WHERE id = $1 AND owner_id = $2", [
      req.params.id,
      req.session.userId,
    ]);

    logger.audit({
      event: "FILE_DELETE_SUCCESS",
      req,
      userId: req.session.userId,
      outcome: "SUCCESS",
      statusCode: 200,
      details: { fileId: req.params.id },
    });

    res.json({ message: "File permanently deleted" });
  } catch (err) {
    logger.error("Delete file error", err);
    res.status(500).json({ error: "Delete failed" });
  }
});

module.exports = router;
