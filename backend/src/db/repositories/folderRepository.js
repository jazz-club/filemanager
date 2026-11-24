const { pool } = require("../connection");
const { encryptText, decryptText, blindIndex } = require("../../crypto");

function decryptFolder(folder) {
  if (folder && folder.name !== undefined) folder.name = decryptText(folder.name);
  return folder;
}

async function listFolders(ownerId, parentId, includeAll = false) {
  let query =
    "SELECT id, name, parent_id, color, created_at, updated_at FROM folders WHERE owner_id = $1";
  let params = [ownerId];
  if (!includeAll && parentId !== null && parentId !== undefined) {
    query += " AND parent_id = $2";
    params.push(parentId);
  } else if (!includeAll) {
    query += " AND parent_id IS NULL";
  }
  query += " ORDER BY id ASC";
  const result = await pool.query(query, params);
  return result.rows.map(decryptFolder).sort((a, b) => a.name.localeCompare(b.name));
}

async function getFolderById(folderId, ownerId) {
  const result = await pool.query("SELECT * FROM folders WHERE id = $1 AND owner_id = $2", [
    folderId,
    ownerId,
  ]);
  return decryptFolder(result.rows[0] || null);
}

async function getFolderBreadcrumbs(folderId, ownerId) {
  const breadcrumbs = [];
  let currentId = folderId;

  while (currentId !== null) {
    const q = await pool.query(
      "SELECT id, name, parent_id FROM folders WHERE id = $1 AND owner_id = $2",
      [currentId, ownerId]
    );
    if (q.rows.length === 0) break;
    const f = decryptFolder(q.rows[0]);
    breadcrumbs.unshift({ id: f.id, name: f.name });
    currentId = f.parent_id;
  }
  return breadcrumbs;
}

async function createFolder(ownerId, name, parentId = null, color = "#ffffff") {
  const result = await pool.query(
    `INSERT INTO folders (owner_id, name, name_hash, parent_id, color)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, name, parent_id, color, created_at, updated_at`,
    [ownerId, encryptText(name), blindIndex(name), parentId, color]
  );
  return decryptFolder(result.rows[0]);
}

async function updateFolderColor(folderId, ownerId, color) {
  const result = await pool.query(
    `UPDATE folders
     SET color = $1, updated_at = NOW()
     WHERE id = $2 AND owner_id = $3
     RETURNING id, name, parent_id, color, updated_at`,
    [color, folderId, ownerId]
  );
  return decryptFolder(result.rows[0] || null);
}

async function renameFolder(folderId, ownerId, name) {
  const result = await pool.query(
    `UPDATE folders
     SET name = $1, name_hash = $2, updated_at = NOW()
     WHERE id = $3 AND owner_id = $4
     RETURNING id, name, parent_id, updated_at`,
    [encryptText(name), blindIndex(name), folderId, ownerId]
  );
  return decryptFolder(result.rows[0] || null);
}

async function moveFolder(folderId, ownerId, targetParentId) {
  const result = await pool.query(
    `UPDATE folders
     SET parent_id = $1, updated_at = NOW()
     WHERE id = $2 AND owner_id = $3
     RETURNING id, name, parent_id, color`,
    [targetParentId, folderId, ownerId]
  );
  return decryptFolder(result.rows[0] || null);
}

async function getDescendantFolderIds(folderIds, ownerId) {
  let allFolderIds = Array.isArray(folderIds) ? [...folderIds] : [folderIds];
  let currentIds = [...allFolderIds];

  while (currentIds.length > 0) {
    const sub = await pool.query(
      "SELECT id FROM folders WHERE parent_id = ANY($1) AND owner_id = $2",
      [currentIds, ownerId]
    );
    const newIds = sub.rows.map((r) => r.id);
    if (newIds.length === 0) break;
    allFolderIds = allFolderIds.concat(newIds);
    currentIds = newIds;
  }
  return allFolderIds;
}

async function getFileStorageKeysByFolders(folderIds, ownerId) {
  const result = await pool.query(
    "SELECT storage_key FROM files WHERE folder_id = ANY($1) AND owner_id = $2",
    [folderIds, ownerId]
  );
  return result.rows.map((row) => decryptText(row.storage_key));
}

async function deleteFolderRows(folderIds, ownerId) {
  await pool.query("DELETE FROM files WHERE folder_id = ANY($1) AND owner_id = $2", [
    folderIds,
    ownerId,
  ]);
  await pool.query("DELETE FROM folders WHERE id = ANY($1) AND owner_id = $2", [
    folderIds,
    ownerId,
  ]);
}

async function getFolderCount() {
  const result = await pool.query("SELECT COUNT(*) AS count FROM folders");
  return parseInt(result.rows[0].count, 10);
}

module.exports = {
  listFolders,
  getFolderById,
  getFolderBreadcrumbs,
  createFolder,
  updateFolderColor,
  renameFolder,
  moveFolder,
  getDescendantFolderIds,
  getFileStorageKeysByFolders,
  deleteFolderRows,
  getFolderCount,
};
