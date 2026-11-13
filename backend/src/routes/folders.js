const { Router } = require("express");
const { pool } = require("../db");
const { deleteObject } = require("../storage");

const router = Router();

function requireAuth(req, res, next) {
  if (!req.session.userId) return res.status(401).json({ error: "Not authenticated" });
  next();
}

router.get("/", requireAuth, async (req, res) => {
  try {
    const parentId = req.query.parentId ? parseInt(req.query.parentId, 10) : null;
    let query, params;

    if (req.query.all === "true") {
      query = `SELECT id, name, parent_id, color, created_at, updated_at 
               FROM folders 
               WHERE owner_id = $1 
               ORDER BY LOWER(name) ASC`;
      params = [req.session.userId];
    } else if (parentId) {
      query = `SELECT id, name, parent_id, color, created_at, updated_at 
               FROM folders 
               WHERE owner_id = $1 AND parent_id = $2 
               ORDER BY LOWER(name) ASC`;
      params = [req.session.userId, parentId];
    } else {
      query = `SELECT id, name, parent_id, color, created_at, updated_at 
               FROM folders 
               WHERE owner_id = $1 AND parent_id IS NULL 
               ORDER BY LOWER(name) ASC`;
      params = [req.session.userId];
    }

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    console.error("List folders error:", err);
    res.status(500).json({ error: "Failed to list folders" });
  }
});

router.get("/:id/breadcrumbs", requireAuth, async (req, res) => {
  try {
    const folderId = parseInt(req.params.id, 10);
    const breadcrumbs = [];
    let currentId = folderId;

    while (currentId) {
      const q = await pool.query(
        "SELECT id, name, parent_id FROM folders WHERE id = $1 AND owner_id = $2",
        [currentId, req.session.userId]
      );
      if (q.rows.length === 0) break;
      const f = q.rows[0];
      breadcrumbs.unshift({ id: f.id, name: f.name });
      currentId = f.parent_id;
    }

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

    const cleanName = name.trim().slice(0, 255);
    const targetParentId = parentId ? parseInt(parentId, 10) : null;

    if (targetParentId) {
      const check = await pool.query("SELECT id FROM folders WHERE id = $1 AND owner_id = $2", [
        targetParentId,
        req.session.userId,
      ]);
      if (check.rows.length === 0) {
        return res.status(400).json({ error: "Parent folder not found" });
      }
    }

    const result = await pool.query(
      `INSERT INTO folders (owner_id, name, parent_id, color)
       VALUES ($1, $2, $3, $4)
       RETURNING id, name, parent_id, color, created_at, updated_at`,
      [req.session.userId, cleanName, targetParentId, "#ffffff"]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error("Create folder error:", err);
    res.status(500).json({ error: "Failed to create folder" });
  }
});

router.patch("/:id/color", requireAuth, async (req, res) => {
  try {
    const folderId = parseInt(req.params.id, 10);
    const { color } = req.body;
    const cleanColor = (color || "#ffffff").slice(0, 32);

    const result = await pool.query(
      `UPDATE folders 
       SET color = $1, updated_at = NOW() 
       WHERE id = $2 AND owner_id = $3 
       RETURNING id, name, parent_id, color, updated_at`,
      [cleanColor, folderId, req.session.userId]
    );

    if (result.rows.length === 0) return res.status(404).json({ error: "Folder not found" });
    res.json(result.rows[0]);
  } catch (err) {
    console.error("Change folder color error:", err);
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

    const result = await pool.query(
      `UPDATE folders 
       SET name = $1, updated_at = NOW() 
       WHERE id = $2 AND owner_id = $3 
       RETURNING id, name, parent_id, updated_at`,
      [name.trim().slice(0, 255), folderId, req.session.userId]
    );

    if (result.rows.length === 0) return res.status(404).json({ error: "Folder not found" });
    res.json(result.rows[0]);
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

	  // cheeky
    if (targetParentId) {
      let cur = targetParentId;
      while (cur) {
        const chk = await pool.query(
          "SELECT parent_id FROM folders WHERE id = $1 AND owner_id = $2",
          [cur, req.session.userId]
        );
        if (chk.rows.length === 0) break;
        if (chk.rows[0].parent_id === folderId) {
          return res.status(400).json({ error: "Cannot move folder into its own subfolder" });
        }
        cur = chk.rows[0].parent_id;
      }
    }

    const result = await pool.query(
      `UPDATE folders 
       SET parent_id = $1, updated_at = NOW() 
       WHERE id = $2 AND owner_id = $3 
       RETURNING id, name, parent_id`,
      [targetParentId, folderId, req.session.userId]
    );

    if (result.rows.length === 0) return res.status(404).json({ error: "Folder not found" });
    res.json(result.rows[0]);
  } catch (err) {
    console.error("Move folder error:", err);
    res.status(500).json({ error: "Failed to move folder" });
  }
});

router.delete("/:id", requireAuth, async (req, res) => {
  try {
    const folderId = parseInt(req.params.id, 10);

    const allFolderIds = [folderId];
    let toProcess = [folderId];

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

    const files = await pool.query(
      "SELECT storage_key FROM files WHERE folder_id = ANY($1) AND owner_id = $2",
      [allFolderIds, req.session.userId]
    );
    for (const f of files.rows) {
      try {
        await deleteObject(f.storage_key);
      } catch (e) {
        console.error("Failed to delete MinIO object:", f.storage_key, e);
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

    res.json({ message: "Folder and all its contents permanently deleted" });
  } catch (err) {
    console.error("Delete folder error:", err);
    res.status(500).json({ error: "Failed to delete folder" });
  }
});

module.exports = router;
