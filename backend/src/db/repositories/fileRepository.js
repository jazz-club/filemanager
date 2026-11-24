const { pool } = require("../connection");
const { encryptText, decryptText, encryptJson, decryptJson } = require("../../crypto");

function decryptFile(file) {
  if (!file) return file;
  if (file.original_name !== undefined) file.original_name = decryptText(file.original_name);
  if (file.storage_key !== undefined) file.storage_key = decryptText(file.storage_key);
  if (file.mime_type !== undefined) file.mime_type = decryptText(file.mime_type);
  if (file.sha256 !== undefined) file.sha256 = decryptText(file.sha256);
  if (file.metadata !== undefined) file.metadata = decryptJson(file.metadata);
  return file;
}

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
  return result.rows.map(decryptFile);
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
  return result.rows.map(decryptFile);
}

async function getFileMetadata(fileId, ownerId) {
  const result = await pool.query(
    "SELECT id, original_name, size_bytes, mime_type, sha256, folder_id, uploaded_at, metadata, storage_key FROM files WHERE id = $1 AND owner_id = $2",
    [fileId, ownerId]
  );
  return decryptFile(result.rows[0] || null);
}

async function getFileById(fileId, ownerId) {
  const result = await pool.query("SELECT * FROM files WHERE id = $1 AND owner_id = $2", [
    fileId,
    ownerId,
  ]);
  return decryptFile(result.rows[0] || null);
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
  return decryptFile(result.rows[0] || null);
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
      encryptText(originalName),
      encryptText(storageKey),
      sizeBytes,
      encryptText(mimeType),
      sha256 === null || sha256 === undefined ? null : encryptText(sha256),
      downloadToken,
      JSON.stringify(encryptJson(metadata)),
    ]
  );
  return decryptFile(result.rows[0]);
}

async function updateFileMetadata(fileId, ownerId, metadata) {
  await pool.query("UPDATE files SET metadata = $1 WHERE id = $2 AND owner_id = $3", [
    JSON.stringify(encryptJson(metadata)),
    fileId,
    ownerId,
  ]);
}

async function renameFile(fileId, ownerId, newName) {
  const result = await pool.query(
    "UPDATE files SET original_name = $1 WHERE id = $2 AND owner_id = $3 RETURNING id, original_name, folder_id, size_bytes, mime_type, uploaded_at",
    [encryptText(newName), fileId, ownerId]
  );
  return decryptFile(result.rows[0] || null);
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
  return decryptFile(result.rows[0] || null);
}

async function deleteFilesBatch(fileIds, ownerId) {
  const filesQ = await pool.query(
    "SELECT storage_key FROM files WHERE id = ANY($1) AND owner_id = $2",
    [fileIds, ownerId]
  );
  await pool.query("DELETE FROM files WHERE id = ANY($1) AND owner_id = $2", [fileIds, ownerId]);
  return filesQ.rows.map((f) => decryptText(f.storage_key));
}

async function deleteSingleFile(fileId, ownerId) {
  const result = await pool.query("SELECT storage_key FROM files WHERE id = $1 AND owner_id = $2", [
    fileId,
    ownerId,
  ]);
  if (result.rows.length === 0) return null;
  await pool.query("DELETE FROM files WHERE id = $1 AND owner_id = $2", [fileId, ownerId]);
  return decryptText(result.rows[0].storage_key);
}

async function getStorageStats(ownerId) {
  const result = await pool.query("SELECT mime_type, size_bytes FROM files WHERE owner_id = $1", [
    ownerId,
  ]);
  return result.rows.map((row) => ({ ...row, mime_type: decryptText(row.mime_type) }));
}

async function getStorageKeysByOwner(ownerId) {
  const result = await pool.query("SELECT storage_key FROM files WHERE owner_id = $1", [ownerId]);
  return result.rows.map((row) => decryptText(row.storage_key));
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
