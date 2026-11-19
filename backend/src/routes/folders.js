const { Router } = require("express");
const path = require("path");
const { folderRepository, pool } = require("../db");
const { deleteObject } = require("../storage");
const logger = require("../logger");

const router = Router();

function requireAuth(req, res, next) {
  if (!req.session || !req.session.userId) {
    return res.status(401).json({ error: "Not authenticated" });
  }
  next();
}

router.get("/", requireAuth, async (req, res) => {
  try {
    const parentId = req.query.parentId ? parseInt(req.query.parentId, 10) : null;
    const folders = await folderRepository.listFolders(
      req.session.userId,
      parentId,
      req.query.all === "true"
    );
    res.json(folders);
  } catch (err) {
    console.error("List folders error:", err);
    res.status(500).json({ error: "Failed to list folders" });
  }
});

router.get("/:id/info", requireAuth, async (req, res) => {
  try {
    const folderId = parseInt(req.params.id, 10);
    if (!Number.isSafeInteger(folderId) || folderId <= 0) {
      return res.status(400).json({ error: "Invalid folder ID" });
    }

    const infoQ = await pool.query(
      `WITH RECURSIVE folder_tree AS (
         SELECT id, name, parent_id, created_at, updated_at
         FROM folders
         WHERE id = $1 AND owner_id = $2
         UNION ALL
         SELECT child.id, child.name, child.parent_id, child.created_at, child.updated_at
         FROM folders child
         JOIN folder_tree parent ON child.parent_id = parent.id
         WHERE child.owner_id = $2
       )
       SELECT
         (SELECT COUNT(*) FROM folder_tree) AS folder_count,
         (SELECT COUNT(*) FROM files WHERE folder_id IN (SELECT id FROM folder_tree)) AS file_count,
         COALESCE((SELECT SUM(size_bytes) FROM files WHERE folder_id IN (SELECT id FROM folder_tree)), 0) AS size_bytes,
         GREATEST(
           COALESCE((SELECT MAX(updated_at) FROM folder_tree), folder.created_at),
           COALESCE((SELECT MAX(uploaded_at) FROM files WHERE folder_id IN (SELECT id FROM folder_tree)), folder.created_at)
         ) AS last_modified,
         folder.created_at
       FROM folders folder
       WHERE folder.id = $1 AND folder.owner_id = $2`,
      [folderId, req.session.userId]
    );

    if (infoQ.rows.length === 0) return res.status(404).json({ error: "Folder not found" });
    const info = infoQ.rows[0];
    const breadcrumbs = await folderRepository.getFolderBreadcrumbs(folderId, req.session.userId);

    res.json({
      folderId,
      folderCount: Math.max(0, Number(info.folder_count) - 1),
      fileCount: Number(info.file_count) || 0,
      sizeBytes: Number(info.size_bytes) || 0,
      createdAt: info.created_at,
      lastModified: info.last_modified,
      path: "/" + breadcrumbs.map((item) => item.name).join("/"),
    });
  } catch (err) {
    logger.error("Folder information error", err);
    res.status(500).json({ error: "Failed to load folder information" });
  }
});

router.get("/:id/breadcrumbs", requireAuth, async (req, res) => {
  try {
    const folderId = parseInt(req.params.id, 10);
    const breadcrumbs = await folderRepository.getFolderBreadcrumbs(folderId, req.session.userId);
    res.json(breadcrumbs);
  } catch (err) {
    console.error("Breadcrumbs error:", err);
    res.status(500).json({ error: "Failed to fetch breadcrumbs" });
  }
});

router.post("/", requireAuth, async (req, res) => {
  try {
    const { name, parentId } = req.body;
    if (!name || typeof name !== "string" || !name.trim()) {
      return res.status(400).json({ error: "Folder name is required" });
    }

    const rawName = name.trim();
    const cleanName =
      path
        .basename(rawName)
        .replace(/[\x00-\x1F\x7F-\x9F]/g, "")
        .slice(0, 255) || "unnamed_folder";
    const targetParentId = parentId ? parseInt(parentId, 10) : null;

    if (targetParentId) {
      const parent = await folderRepository.getFolderById(targetParentId, req.session.userId);
      if (!parent) return res.status(400).json({ error: "Parent folder not found" });
    }

    const folder = await folderRepository.createFolder(
      req.session.userId,
      cleanName,
      targetParentId,
      "#ffffff"
    );

    logger.audit({
      event: "FOLDER_CREATE_SUCCESS",
      req,
      userId: req.session.userId,
      outcome: "SUCCESS",
      statusCode: 201,
      details: { folderId: folder.id, folderName: cleanName },
    });

    res.status(201).json(folder);
  } catch (err) {
    logger.error("Create folder error", err);
    res.status(500).json({ error: "Failed to create folder" });
  }
});

router.patch("/:id/color", requireAuth, async (req, res) => {
  try {
    const folderId = parseInt(req.params.id, 10);
    const { color } = req.body;
    if (color && !/^#[0-9a-fA-F]{3,8}$/.test(color)) {
      return res.status(400).json({ error: "Invalid hex color format" });
    }
    const cleanColor = (color || "#ffffff").slice(0, 32);
    const folder = await folderRepository.updateFolderColor(
      folderId,
      req.session.userId,
      cleanColor
    );
    if (!folder) return res.status(404).json({ error: "Folder not found" });
    res.json(folder);
  } catch (err) {
    logger.error("Change folder color error", err);
    res.status(500).json({ error: "Failed to change folder color" });
  }
});

router.patch("/:id/rename", requireAuth, async (req, res) => {
  try {
    const folderId = parseInt(req.params.id, 10);
    const { name } = req.body;
    if (!name || typeof name !== "string" || !name.trim()) {
      return res.status(400).json({ error: "New name is required" });
    }
    const folder = await folderRepository.renameFolder(
      folderId,
      req.session.userId,
      name.trim().slice(0, 255)
    );
    if (!folder) return res.status(404).json({ error: "Folder not found" });
    res.json(folder);
  } catch (err) {
    console.error("Rename folder error:", err);
    res.status(500).json({ error: "Failed to rename folder" });
  }
});

router.patch("/:id/move", requireAuth, async (req, res) => {
  try {
    const folderId = parseInt(req.params.id, 10);
    const targetParentId = req.body.parentId ? parseInt(req.body.parentId, 10) : null;
    if (folderId === targetParentId) {
      return res.status(400).json({ error: "Cannot move folder into itself" });
    }

    if (targetParentId) {
      let currentId = targetParentId;
      while (currentId) {
        const currentFolder = await folderRepository.getFolderById(currentId, req.session.userId);
        if (!currentFolder) break;
        if (currentFolder.parent_id === folderId) {
          return res.status(400).json({ error: "Cannot move folder into its own subfolder" });
        }
        currentId = currentFolder.parent_id;
      }
    }

    const folder = await folderRepository.moveFolder(folderId, req.session.userId, targetParentId);
    if (!folder) return res.status(404).json({ error: "Folder not found" });
    res.json({ id: folder.id, name: folder.name, parent_id: folder.parent_id });
  } catch (err) {
    console.error("Move folder error:", err);
    res.status(500).json({ error: "Failed to move folder" });
  }
});

router.delete("/:id", requireAuth, async (req, res) => {
  try {
    const folderId = parseInt(req.params.id, 10);
    const folderIds = await folderRepository.getDescendantFolderIds(folderId, req.session.userId);
    const storageKeys = await folderRepository.getFileStorageKeysByFolders(
      folderIds,
      req.session.userId
    );
    for (const storageKey of storageKeys) {
      try {
        await deleteObject(storageKey);
      } catch (err) {
        console.error("Failed to delete MinIO object:", storageKey, err);
      }
    }
    await folderRepository.deleteFolderRows(folderIds, req.session.userId);
    res.json({ message: "Folder and all its contents permanently deleted" });
  } catch (err) {
    console.error("Delete folder error:", err);
    res.status(500).json({ error: "Failed to delete folder" });
  }
});

module.exports = router;
