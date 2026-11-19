const { pool } = require("../connection");

async function getFilesByFolder(ownerId, folderId) {
  let query;
  let params;
  if (folderId !== null && folderId !== undefined) {
    query = `
      SELECT id, owner_id, folder_id, original_name, size_bytes, mime_type, sha256, download_token, uploaded_at, metadata
      FROM files
      WHERE owner_id = $1 AND folder_id = $2
      ORDER BY uploaded_at DESC
    `;
    params = [ownerId, folderId];
  } else {
    query = `
      SELECT id, owner_id, folder_id, original_name, size_bytes, mime_type, sha256, download_token, uploaded_at, metadata
      FROM files
      WHERE owner_id = $1 AND folder_id IS NULL
      ORDER BY uploaded_at DESC
    `;
    params = [ownerId];
  }
  const result = await pool.query(query, params);
  return result.rows;
}

async function listVaultFiles(ownerId, folderId, includeAll = false) {
  let query =
    "SELECT id, original_name, size_bytes, mime_type, sha256, folder_id, uploaded_at, metadata, download_token FROM files WHERE owner_id = $1";
  const params = [ownerId];
  if (!includeAll && folderId !== null && folderId !== undefined) {
    query += " AND folder_id = $2";
    params.push(folderId);
  } else if (!includeAll) {
    query += " AND folder_id IS NULL";
  }
  query += " ORDER BY uploaded_at DESC";
  const result = await pool.query(query, params);
  return result.rows;
}

async function getFileMetadata(fileId, ownerId) {
  const result = await pool.query(
    "SELECT id, original_name, size_bytes, mime_type, sha256, folder_id, uploaded_at, metadata, storage_key FROM files WHERE id = $1 AND owner_id = $2",
    [fileId, ownerId]
  );
  return result.rows[0] || null;
}

async function getFileById(fileId, ownerId) {
  const result = await pool.query("SELECT * FROM files WHERE id = $1 AND owner_id = $2", [
    fileId,
    ownerId,
  ]);
  return result.rows[0] || null;
}

async function getFileByTokenOrId(tokenOrId, ownerId) {
  let result;
  const numId = parseInt(tokenOrId, 10);
  if (!isNaN(numId) && String(numId) === String(tokenOrId)) {
    result = await pool.query("SELECT * FROM files WHERE id = $1 AND owner_id = $2", [
      numId,
      ownerId,
    ]);
  } else {
    result = await pool.query("SELECT * FROM files WHERE download_token = $1 AND owner_id = $2", [
      tokenOrId,
      ownerId,
    ]);
  }
  return result.rows[0] || null;
}

async function insertFile({
  ownerId,
  folderId,
  originalName,
  storageKey,
  sizeBytes,
  mimeType,
  sha256,
  downloadToken,
  metadata = {},
}) {
  const result = await pool.query(
    `INSERT INTO files (owner_id, folder_id, original_name, storage_key, size_bytes, mime_type, sha256, download_token, metadata)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING id, original_name, size_bytes, mime_type, sha256, download_token, uploaded_at`,
    [
      ownerId,
      folderId,
      originalName,
      storageKey,
      sizeBytes,
      mimeType,
      sha256,
      downloadToken,
      JSON.stringify(metadata),
    ]
  );
  return result.rows[0];
}

async function updateFileMetadata(fileId, ownerId, metadata) {
  await pool.query("UPDATE files SET metadata = $1 WHERE id = $2 AND owner_id = $3", [
    JSON.stringify(metadata),
    fileId,
    ownerId,
  ]);
}

async function renameFile(fileId, ownerId, newName) {
  const result = await pool.query(
    "UPDATE files SET original_name = $1 WHERE id = $2 AND owner_id = $3 RETURNING id, original_name, folder_id, size_bytes, mime_type, uploaded_at",
    [newName, fileId, ownerId]
  );
  return result.rows[0] || null;
}

async function moveFilesBatch(fileIds, ownerId, destFolderId) {
  const result = await pool.query(
    "UPDATE files SET folder_id = $1 WHERE id = ANY($2) AND owner_id = $3 RETURNING id",
    [destFolderId, fileIds, ownerId]
  );
  return result.rows;
}

async function moveSingleFile(fileId, ownerId, destFolderId) {
  const result = await pool.query(
    "UPDATE files SET folder_id = $1 WHERE id = $2 AND owner_id = $3 RETURNING id, original_name, folder_id",
    [destFolderId, fileId, ownerId]
  );
  return result.rows[0] || null;
}

async function deleteFilesBatch(fileIds, ownerId) {
  const filesQ = await pool.query(
    "SELECT storage_key FROM files WHERE id = ANY($1) AND owner_id = $2",
    [fileIds, ownerId]
  );
  await pool.query("DELETE FROM files WHERE id = ANY($1) AND owner_id = $2", [fileIds, ownerId]);
  return filesQ.rows.map((f) => f.storage_key);
}

async function deleteSingleFile(fileId, ownerId) {
  const result = await pool.query("SELECT storage_key FROM files WHERE id = $1 AND owner_id = $2", [
    fileId,
    ownerId,
  ]);
  if (result.rows.length === 0) return null;
  await pool.query("DELETE FROM files WHERE id = $1 AND owner_id = $2", [fileId, ownerId]);
  return result.rows[0].storage_key;
}

async function getStorageStats(ownerId) {
  const result = await pool.query("SELECT mime_type, size_bytes FROM files WHERE owner_id = $1", [
    ownerId,
  ]);
  return result.rows;
}

async function getStorageKeysByOwner(ownerId) {
  const result = await pool.query("SELECT storage_key FROM files WHERE owner_id = $1", [ownerId]);
  return result.rows.map((row) => row.storage_key);
}

async function getGlobalFileStats() {
  const result = await pool.query(
    "SELECT COUNT(*) AS count, COALESCE(SUM(size_bytes), 0) AS total_bytes FROM files"
  );
  return {
    totalFiles: parseInt(result.rows[0].count, 10),
    totalBytes: parseInt(result.rows[0].total_bytes, 10),
  };
}

module.exports = {
  getFilesByFolder,
  listVaultFiles,
  getFileMetadata,
  getFileById,
  getFileByTokenOrId,
  insertFile,
  updateFileMetadata,
  renameFile,
  moveFilesBatch,
  moveSingleFile,
  deleteFilesBatch,
  deleteSingleFile,
  getStorageStats,
  getGlobalFileStats,
  getStorageKeysByOwner,
};
