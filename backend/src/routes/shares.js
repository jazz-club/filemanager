const { Router } = require("express");
const { ZipArchive } = require("archiver");
const crypto = require("crypto");
const { pool } = require("../db");
const { decrypt } = require("../crypto");
const { getObject, copyObject } = require("../storage");
const { extractAudioCover } = require("../audioCover");
const logger = require("../logger");

const router = Router();

function requireAuth(req, res, next) {
  if (!req.session || !req.session.userId) {
    return res.status(401).json({ error: "Not authenticated", requiresAuth: true });
  }
  next();
}

async function resolveShare(shareToken, sessionUserId) {
  if (!shareToken || typeof shareToken !== "string") {
    return { error: "Invalid share token", status: 400 };
  }

  const result = await pool.query(
    `SELECT s.id AS share_id, s.file_id, s.owner_id, s.share_token, s.is_public, s.allow_download,
            s.access_type, s.max_views, s.max_downloads,
            s.is_batch, s.title, s.views_count, s.downloads_count, s.saves_count,
            s.created_at AS share_created_at, s.expires_at,
            f.original_name, f.mime_type, f.size_bytes, f.sha256, f.storage_key, f.metadata, f.uploaded_at
     FROM file_shares s
     LEFT JOIN files f ON s.file_id = f.id
     WHERE s.share_token = $1`,
    [shareToken]
  );

  if (result.rows.length === 0) {
    return { error: "Share link not found or has been revoked", status: 404 };
  }

  const share = result.rows[0];

  if (share.expires_at && new Date(share.expires_at) < new Date()) {
    return { error: "Share link has expired", status: 410 };
  }

  if (!share.is_public && !sessionUserId) {
    return {
      error: "Authentication required to access this private share",
      requiresAuth: true,
      status: 401,
    };
  }

  return { share };
}

async function recordShareDownload(share, sessionUserId) {
  if (sessionUserId && sessionUserId === share.owner_id) return true;
  const result = await pool.query(
    `UPDATE file_shares
     SET downloads_count = downloads_count + 1
     WHERE id = $1 AND (max_downloads IS NULL OR downloads_count < max_downloads)
     RETURNING downloads_count`,
    [share.share_id]
  );
  return result.rows.length > 0;
}

router.get("/mine/summary", requireAuth, async (req, res) => {
  try {
    const sharesQ = await pool.query(
      `SELECT s.id, s.file_id, s.share_token, s.is_public, s.allow_download, s.access_type, s.max_views, s.max_downloads, s.is_batch, s.title,
              s.views_count, s.downloads_count, s.saves_count, s.created_at, s.expires_at,
              f.original_name, f.size_bytes, f.mime_type,
              COALESCE((
                SELECT json_agg(json_build_object(
                  'fileName', COALESCE(i.display_name, sf.original_name),
                  'sizeBytes', sf.size_bytes,
                  'mimeType', sf.mime_type
                ) ORDER BY i.id)
                FROM file_share_items i
                JOIN files sf ON sf.id = i.file_id
                WHERE i.share_id = s.id
              ), '[]'::json) AS shared_files
       FROM file_shares s
       LEFT JOIN files f ON s.file_id = f.id
       WHERE s.owner_id = $1 AND (s.expires_at IS NULL OR s.expires_at > NOW())
       ORDER BY s.created_at DESC`,
      [req.session.userId]
    );

    let totalViews = 0;
    let totalDownloads = 0;
    let totalSaves = 0;

    sharesQ.rows.forEach((s) => {
      totalViews += parseInt(s.views_count, 10) || 0;
      totalDownloads += parseInt(s.downloads_count, 10) || 0;
      totalSaves += parseInt(s.saves_count, 10) || 0;
    });

    res.json({
      totalShares: sharesQ.rows.length,
      totalViews,
      totalDownloads,
      totalSaves,
      shares: sharesQ.rows,
    });
  } catch (err) {
    logger.error("Fetch user shares stats error", err);
    res.status(500).json({ error: "Failed to fetch link statistics" });
  }
});

router.get("/:token", async (req, res) => {
  try {
    const sessionUserId = req.session ? req.session.userId : null;
    const { share, error, requiresAuth, status } = await resolveShare(
      req.params.token,
      sessionUserId
    );

    if (error) {
      return res.status(status || 404).json({ error, requiresAuth: !!requiresAuth });
    }

    if (!sessionUserId || sessionUserId !== share.owner_id) {
      const viewResult = await pool.query(
        `UPDATE file_shares
         SET views_count = views_count + 1
         WHERE id = $1 AND (max_views IS NULL OR views_count < max_views)
         RETURNING views_count`,
        [share.share_id]
      );
      if (viewResult.rows.length === 0) {
        return res.status(410).json({ error: "This share link has reached its view limit" });
      }
      share.views_count = viewResult.rows[0].views_count;
    }

    if (share.is_batch) {
      const itemsQ = await pool.query(
        `SELECT f.id, f.original_name, f.mime_type, f.size_bytes, f.sha256, f.uploaded_at, f.metadata, i.display_name
         FROM file_share_items i
         JOIN files f ON i.file_id = f.id
         WHERE i.share_id = $1
         ORDER BY f.uploaded_at DESC`,
        [share.share_id]
      );

      let totalBytes = 0;
      const files = itemsQ.rows.map((r) => {
        const sz = parseInt(r.size_bytes, 10) || 0;
        totalBytes += sz;
        return {
          id: r.id,
          fileName: r.display_name || r.original_name,
          mimeType: r.mime_type,
          sizeBytes: sz,
          sha256: r.sha256,
          uploadedAt: r.uploaded_at,
          metadata: r.metadata || {},
        };
      });

      return res.json({
        shareToken: share.share_token,
        isBatch: true,
        title: share.title || `Shared Collection (${files.length} items)`,
        isPublic: share.is_public,
        allowDownload: true,
        accessType: share.access_type || "view",
        maxViews: share.max_views,
        maxDownloads: share.max_downloads,
        fileCount: files.length,
        totalBytes,
        files,
        viewsCount: share.views_count || 0,
        downloadsCount: share.downloads_count || 0,
        savesCount: share.saves_count || 0,
        isOwner: sessionUserId === share.owner_id,
        userLoggedIn: !!sessionUserId,
        uploadedAt: share.share_created_at,
        expiresAt: share.expires_at,
      });
    }

    res.json({
      shareToken: share.share_token,
      isBatch: false,
      isPublic: share.is_public,
      allowDownload: true,
      accessType: share.access_type || "view",
      maxViews: share.max_views,
      maxDownloads: share.max_downloads,
      fileId: share.file_id,
      fileName: share.original_name,
      mimeType: share.mime_type,
      sizeBytes: share.size_bytes,
      sha256: share.sha256,
      metadata: share.metadata || {},
      viewsCount: share.views_count || 0,
      downloadsCount: share.downloads_count || 0,
      savesCount: share.saves_count || 0,
      isOwner: sessionUserId === share.owner_id,
      userLoggedIn: !!sessionUserId,
      uploadedAt: share.uploaded_at,
      expiresAt: share.expires_at,
    });
  } catch (err) {
    logger.error("Public share info error", err);
    res.status(500).json({ error: "Failed to retrieve share information" });
  }
});

router.delete("/:token/files/:fileId", async (req, res) => {
  try {
    const sessionUserId = req.session ? req.session.userId : null;
    const { share, error, requiresAuth, status } = await resolveShare(
      req.params.token,
      sessionUserId
    );

    if (error) {
      return res.status(status || 404).json({ error, requiresAuth: !!requiresAuth });
    }
    if (share.access_type !== "edit") {
      return res.status(403).json({ error: "Removing items requires Edit access" });
    }

    const fileId = Number(req.params.fileId);
    if (!Number.isSafeInteger(fileId) || fileId <= 0) {
      return res.status(400).json({ error: "Invalid file ID" });
    }

    if (share.is_batch) {
      const result = await pool.query(
        "DELETE FROM file_share_items WHERE share_id = $1 AND file_id = $2 RETURNING file_id",
        [share.share_id, fileId]
      );
      if (result.rows.length === 0) {
        return res.status(404).json({ error: "File not found in this share" });
      }
    } else {
      if (Number(share.file_id) !== fileId) {
        return res.status(404).json({ error: "File not found in this share" });
      }
      await pool.query("DELETE FROM file_shares WHERE id = $1", [share.share_id]);
    }

    logger.audit({
      event: "FILE_REMOVED_FROM_SHARE",
      req,
      userId: sessionUserId,
      outcome: "SUCCESS",
      statusCode: 200,
      details: { shareId: share.share_id, fileId, isBatch: share.is_batch },
    });

    res.json({ success: true, message: "File removed from this share" });
  } catch (err) {
    logger.error("Remove file from share error", err);
    res.status(500).json({ error: "Failed to remove file from share" });
  }
});

async function streamDecryptedFile(file, req, res) {
  const encryptedBlob = await getObject(file.storage_key);
  const plaintext = decrypt(encryptedBlob);

  const totalSize = plaintext.length;
  const etag = `"${file.id || file.file_id}-${totalSize}-shared"`;

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
}

router.get("/:token/preview", async (req, res) => {
  try {
    const { share, error, requiresAuth, status } = await resolveShare(
      req.params.token,
      req.session ? req.session.userId : null
    );

    if (error) {
      return res.status(status || 404).json({ error, requiresAuth: !!requiresAuth });
    }

    if (share.is_batch) {
      return res.status(400).json({ error: "Batch share preview requires a specific file ID" });
    }

    await streamDecryptedFile(share, req, res);
  } catch (err) {
    logger.error("Public share preview error", err);
    res.status(500).json({ error: "Failed to load preview" });
  }
});

router.get("/:token/files/:fileId/preview", async (req, res) => {
  try {
    const { share, error, requiresAuth, status } = await resolveShare(
      req.params.token,
      req.session ? req.session.userId : null
    );

    if (error) {
      return res.status(status || 404).json({ error, requiresAuth: !!requiresAuth });
    }

    const fileId = parseInt(req.params.fileId, 10);
    const itemQ = await pool.query(
      `SELECT f.* FROM files f
       JOIN file_share_items i ON i.file_id = f.id
       WHERE i.share_id = $1 AND f.id = $2`,
      [share.share_id, fileId]
    );

    if (itemQ.rows.length === 0) {
      return res.status(404).json({ error: "File not found in this share" });
    }

    await streamDecryptedFile(itemQ.rows[0], req, res);
  } catch (err) {
    logger.error("Public batch file preview error", err);
    res.status(500).json({ error: "Failed to load preview" });
  }
});

router.get("/:token/files/:fileId/cover", async (req, res) => {
  try {
    const { share, error, status } = await resolveShare(
      req.params.token,
      req.session ? req.session.userId : null
    );

    if (error) {
      return res.status(status || 404).send(error);
    }

    const fileId = parseInt(req.params.fileId, 10);
    const itemQ = await pool.query(
      `SELECT f.* FROM files f
       JOIN file_share_items i ON i.file_id = f.id
       WHERE i.share_id = $1 AND f.id = $2`,
      [share.share_id, fileId]
    );

    if (itemQ.rows.length === 0) return res.status(404).send("File not found");
    const file = itemQ.rows[0];

    const blob = await getObject(file.storage_key);
    const plaintext = decrypt(blob);
    const cover = extractAudioCover(plaintext);

    if (!cover) return res.status(404).send("No cover art");

    res.set({
      "Content-Type": cover.mime,
      "Cache-Control": "private, max-age=86400, stale-while-revalidate=3600",
      ETag: `"${file.id}-share-cover"`,
    });
    res.send(cover.data);
  } catch (err) {
    logger.error("Batch file cover error", err);
    res.status(500).send("Cover extraction failed");
  }
});

router.get("/:token/files/:fileId/download", async (req, res) => {
  try {
    const { share, error, requiresAuth, status } = await resolveShare(
      req.params.token,
      req.session ? req.session.userId : null
    );

    if (error) {
      return res.status(status || 404).json({ error, requiresAuth: !!requiresAuth });
    }

    const fileId = parseInt(req.params.fileId, 10);
    const itemQ = await pool.query(
      `SELECT f.*, i.display_name FROM files f
       JOIN file_share_items i ON i.file_id = f.id
       WHERE i.share_id = $1 AND f.id = $2`,
      [share.share_id, fileId]
    );

    if (itemQ.rows.length === 0) {
      return res.status(404).json({ error: "File not found in this share" });
    }

    const file = itemQ.rows[0];
    const sessionUserId = req.session ? req.session.userId : null;
    if (!(await recordShareDownload(share, sessionUserId))) {
      return res.status(410).json({ error: "This share link has reached its download limit" });
    }

    const blob = await getObject(file.storage_key);
    const plaintext = decrypt(blob);

    logger.audit({
      event: "FILE_SHARE_DOWNLOAD",
      req,
      userId: req.session ? req.session.userId : null,
      outcome: "SUCCESS",
      statusCode: 200,
      details: {
        fileId: file.id,
        shareToken: share.share_token,
        fileName: file.original_name,
        sizeBytes: file.size_bytes,
      },
    });

    const safeName = (file.display_name || file.original_name).replace(/["\r\n]/g, "_");
    const encodedName = encodeURIComponent(file.display_name || file.original_name);
    res.set("Content-Type", file.mime_type || "application/octet-stream");
    res.set("X-Content-Type-Options", "nosniff");
    res.set(
      "Content-Disposition",
      'attachment; filename="' + safeName + "\"; filename*=UTF-8''" + encodedName
    );
    res.send(plaintext);
  } catch (err) {
    logger.error("Batch file download error", err);
    res.status(500).json({ error: "Download failed" });
  }
});

router.get("/:token/cover", async (req, res) => {
  try {
    const { share, error, status } = await resolveShare(
      req.params.token,
      req.session ? req.session.userId : null
    );

    if (error) {
      return res.status(status || 404).send(error);
    }

    if (share.is_batch) {
      return res.status(400).send("Batch share cover requires a specific file ID");
    }

    const mime = (share.mime_type || "").toLowerCase();
    const name = (share.original_name || "").toLowerCase();
    const isAudio =
      mime.startsWith("audio/") ||
      mime.includes("ogg") ||
      name.endsWith(".mp3") ||
      name.endsWith(".m4a") ||
      name.endsWith(".flac") ||
      name.endsWith(".wav") ||
      name.endsWith(".ogg");

    if (!isAudio) {
      return res.status(404).send("Not an audio file");
    }

    const blob = await getObject(share.storage_key);
    const plaintext = decrypt(blob);
    const cover = extractAudioCover(plaintext);

    if (!cover) {
      return res.status(404).send("No cover art");
    }

    res.set({
      "Content-Type": cover.mime,
      "Cache-Control": "private, max-age=86400, stale-while-revalidate=3600",
      ETag: `"${share.file_id}-share-cover"`,
    });
    res.send(cover.data);
  } catch (err) {
    logger.error("Public share audio cover error", err);
    res.status(500).send("Cover extraction failed");
  }
});

router.get("/:token/download", async (req, res) => {
  try {
    const { share, error, requiresAuth, status } = await resolveShare(
      req.params.token,
      req.session ? req.session.userId : null
    );

    if (error) {
      return res.status(status || 404).json({ error, requiresAuth: !!requiresAuth });
    }

    if (share.is_batch) {
      const itemsQ = await pool.query(
        `SELECT f.id, f.original_name, f.storage_key, i.display_name
         FROM file_share_items i
         JOIN files f ON i.file_id = f.id
         WHERE i.share_id = $1`,
        [share.share_id]
      );
      const sessionUserId = req.session ? req.session.userId : null;
      if (!(await recordShareDownload(share, sessionUserId))) {
        return res.status(410).json({ error: "This share link has reached its download limit" });
      }

      const safeZipName = `${(share.title || "shared_collection").replace(/["\r\n/\\:]/g, "_")}.zip`;
      res.set("Content-Type", "application/zip");
      res.set(
        "Content-Disposition",
        `attachment; filename="${safeZipName}"; filename*=UTF-8''${encodeURIComponent(safeZipName)}`
      );

      const archive = new ZipArchive({ store: true });
      archive.on("error", (e) => console.error("Batch share zip error:", e));
      archive.pipe(res);

      for (const item of itemsQ.rows) {
        try {
          const blob = await getObject(item.storage_key);
          const plaintext = decrypt(blob);
          archive.append(plaintext, { name: item.display_name || item.original_name });
        } catch (e) {
          console.error("Failed to add file to batch share zip:", item.original_name, e);
        }
      }

      logger.audit({
        event: "FILE_BATCH_SHARE_DOWNLOAD",
        req,
        userId: req.session ? req.session.userId : null,
        outcome: "SUCCESS",
        statusCode: 200,
        details: {
          shareToken: share.share_token,
          itemCount: itemsQ.rows.length,
        },
      });

      await archive.finalize();
      return;
    }

    const sessionUserId = req.session ? req.session.userId : null;
    if (!(await recordShareDownload(share, sessionUserId))) {
      return res.status(410).json({ error: "This share link has reached its download limit" });
    }

    const blob = await getObject(share.storage_key);
    const plaintext = decrypt(blob);

    logger.audit({
      event: "FILE_SHARE_DOWNLOAD",
      req,
      userId: req.session ? req.session.userId : null,
      outcome: "SUCCESS",
      statusCode: 200,
      details: {
        fileId: share.file_id,
        shareToken: share.share_token,
        fileName: share.original_name,
        sizeBytes: share.size_bytes,
      },
    });

    res.set("Content-Type", share.mime_type || "application/octet-stream");
    res.set("X-Content-Type-Options", "nosniff");
    const safeName = share.original_name.replace(/["\r\n]/g, "_");
    const encodedName = encodeURIComponent(share.original_name);
    res.set(
      "Content-Disposition",
      'attachment; filename="' + safeName + "\"; filename*=UTF-8''" + encodedName
    );

    res.send(plaintext);
  } catch (err) {
    logger.error("Public share download error", err);
    res.status(500).json({ error: "Download failed" });
  }
});

router.post("/:token/save-to-vault", requireAuth, async (req, res) => {
  try {
    const savingUserId = req.session.userId;
    const { share, error, requiresAuth, status } = await resolveShare(
      req.params.token,
      savingUserId
    );

    if (error) {
      return res.status(status || 404).json({ error, requiresAuth: !!requiresAuth });
    }

    const isOwn = savingUserId === share.owner_id;
    let savedCount = 0;
    let targetFolderId = null;

    if (share.is_batch) {
      const itemsQ = await pool.query(
        `SELECT f.id, f.original_name, f.mime_type, f.size_bytes, f.sha256, f.storage_key, f.metadata, i.display_name
         FROM file_share_items i
         JOIN files f ON i.file_id = f.id
         WHERE i.share_id = $1`,
        [share.share_id]
      );

      if (itemsQ.rows.length === 0) {
        return res.status(400).json({ error: "No files found in this collection" });
      }

      const folderTitle =
        (isOwn ? "(Copy) " : "") +
        (share.title || `Shared Collection (${itemsQ.rows.length} files)`);
      const folderRes = await pool.query(
        "INSERT INTO folders (owner_id, name) VALUES ($1, $2) RETURNING id",
        [savingUserId, folderTitle]
      );
      targetFolderId = folderRes.rows[0].id;

      for (const item of itemsQ.rows) {
        const newStorageKey = savingUserId + "/" + crypto.randomUUID();
        await copyObject(item.storage_key, newStorageKey);
        const newDownloadToken = crypto.randomBytes(16).toString("hex");
        const itemName = isOwn
          ? `(Copy) ${item.display_name || item.original_name}`
          : item.display_name || item.original_name;

        await pool.query(
          `INSERT INTO files (owner_id, original_name, storage_key, size_bytes, mime_type, sha256, folder_id, metadata, download_token)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
          [
            savingUserId,
            itemName,
            newStorageKey,
            item.size_bytes,
            item.mime_type,
            item.sha256,
            targetFolderId,
            item.metadata || {},
            newDownloadToken,
          ]
        );
        savedCount++;
      }
    } else {
      const newStorageKey = savingUserId + "/" + crypto.randomUUID();
      await copyObject(share.storage_key, newStorageKey);
      const newDownloadToken = crypto.randomBytes(16).toString("hex");
      const savedName = isOwn ? `(Copy) ${share.original_name}` : share.original_name;

      await pool.query(
        `INSERT INTO files (owner_id, original_name, storage_key, size_bytes, mime_type, sha256, folder_id, metadata, download_token)
         VALUES ($1, $2, $3, $4, $5, $6, NULL, $7, $8)`,
        [
          savingUserId,
          savedName,
          newStorageKey,
          share.size_bytes,
          share.mime_type,
          share.sha256,
          share.metadata || {},
          newDownloadToken,
        ]
      );
      savedCount = 1;
    }

    await pool.query("UPDATE file_shares SET saves_count = saves_count + 1 WHERE id = $1", [
      share.share_id,
    ]);

    logger.audit({
      event: "FILE_SAVED_TO_VAULT",
      req,
      userId: savingUserId,
      outcome: "SUCCESS",
      statusCode: 200,
      details: {
        shareId: share.share_id,
        isBatch: share.is_batch,
        savedCount,
        folderId: targetFolderId,
      },
    });

    res.json({
      success: true,
      message:
        savedCount === 1
          ? "File successfully added to your vault!"
          : `${savedCount} files added to your vault!`,
      savedCount,
      folderId: targetFolderId,
    });
  } catch (err) {
    logger.error("Save to vault error", err);
    res.status(500).json({ error: "Failed to add items to your vault" });
  }
});

router.post("/:token/files/:fileId/save-to-vault", requireAuth, async (req, res) => {
  try {
    const savingUserId = req.session.userId;
    const { share, error, requiresAuth, status } = await resolveShare(
      req.params.token,
      savingUserId
    );

    if (error) {
      return res.status(status || 404).json({ error, requiresAuth: !!requiresAuth });
    }

    const isOwn = savingUserId === share.owner_id;
    const fileId = parseInt(req.params.fileId, 10);
    const itemQ = await pool.query(
      `SELECT f.id, f.original_name, f.mime_type, f.size_bytes, f.sha256, f.storage_key, f.metadata, i.display_name
       FROM file_share_items i
       JOIN files f ON i.file_id = f.id
       WHERE i.share_id = $1 AND f.id = $2`,
      [share.share_id, fileId]
    );

    if (itemQ.rows.length === 0) {
      return res.status(404).json({ error: "File not found in this collection" });
    }

    const item = itemQ.rows[0];
    const newStorageKey = savingUserId + "/" + crypto.randomUUID();
    await copyObject(item.storage_key, newStorageKey);
    const newDownloadToken = crypto.randomBytes(16).toString("hex");
    const itemName = isOwn
      ? `(Copy) ${item.display_name || item.original_name}`
      : item.display_name || item.original_name;

    await pool.query(
      `INSERT INTO files (owner_id, original_name, storage_key, size_bytes, mime_type, sha256, folder_id, metadata, download_token)
       VALUES ($1, $2, $3, $4, $5, $6, NULL, $7, $8)`,
      [
        savingUserId,
        itemName,
        newStorageKey,
        item.size_bytes,
        item.mime_type,
        item.sha256,
        item.metadata || {},
        newDownloadToken,
      ]
    );

    await pool.query("UPDATE file_shares SET saves_count = saves_count + 1 WHERE id = $1", [
      share.share_id,
    ]);

    logger.audit({
      event: "FILE_ITEM_SAVED_TO_VAULT",
      req,
      userId: savingUserId,
      outcome: "SUCCESS",
      statusCode: 200,
      details: {
        shareId: share.share_id,
        fileId: item.id,
      },
    });

    res.json({
      success: true,
      message: `"${item.display_name || item.original_name}" added to your vault!`,
    });
  } catch (err) {
    logger.error("Save individual file to vault error", err);
    res.status(500).json({ error: "Failed to add file to your vault" });
  }
});

module.exports = router;
