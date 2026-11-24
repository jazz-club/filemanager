const { pool } = require("../connection");
const { encryptText, decryptText, decryptJson } = require("../../crypto");

function revealFile(row) {
  if (!row) return row;
  if (row.original_name !== undefined) row.original_name = decryptText(row.original_name);
  if (row.storage_key !== undefined) row.storage_key = decryptText(row.storage_key);
  if (row.mime_type !== undefined) row.mime_type = decryptText(row.mime_type);
  if (row.sha256 !== undefined) row.sha256 = decryptText(row.sha256);
  if (row.metadata !== undefined) row.metadata = decryptJson(row.metadata);
  if (row.display_name !== undefined) row.display_name = decryptText(row.display_name);
  if (row.title !== undefined) row.title = decryptText(row.title);
  return row;
}

async function createSingleShare({
  fileId,
  ownerId,
  shareToken,
  isPublic,
  allowDownload,
  expiresAt,
}) {
  const result = await pool.query(
    `INSERT INTO file_shares (file_id, owner_id, share_token, is_public, allow_download, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id, file_id, share_token, is_public, allow_download, expires_at, created_at`,
    [fileId, ownerId, shareToken, isPublic, allowDownload, expiresAt]
  );
  return result.rows[0];
}

async function createBatchShare({
  ownerId,
  shareToken,
  isPublic,
  allowDownload,
  title,
  expiresAt,
  items,
}) {
  const shareQ = await pool.query(
    `INSERT INTO file_shares (owner_id, share_token, is_public, allow_download, is_batch, title, file_id, expires_at)
     VALUES ($1, $2, $3, $4, true, $5, NULL, $6)
     RETURNING id, share_token, is_public, allow_download, is_batch, title, expires_at, created_at`,
    [ownerId, shareToken, isPublic, allowDownload, encryptText(title), expiresAt]
  );
  const share = shareQ.rows[0];

  for (const item of items) {
    await pool.query(
      "INSERT INTO file_share_items (share_id, file_id, display_name) VALUES ($1, $2, $3)",
      [share.id, item.id, encryptText(item.displayName)]
    );
  }
  return revealFile(share);
}

async function getShareByToken(token) {
  const result = await pool.query(
    `SELECT s.id AS share_id, s.file_id, s.owner_id, s.share_token, s.is_public, s.allow_download,
            s.is_batch, s.title, s.views_count, s.downloads_count, s.saves_count,
            s.created_at, s.expires_at,
            f.original_name, f.mime_type, f.size_bytes, f.sha256, f.uploaded_at, f.metadata, f.storage_key
     FROM file_shares s
     LEFT JOIN files f ON f.id = s.file_id
     WHERE s.share_token = $1`,
    [token]
  );
  return revealFile(result.rows[0] || null);
}

async function getSharesByFileId(fileId, ownerId) {
  const result = await pool.query(
    `SELECT id, file_id, share_token, is_public, allow_download, is_batch, title, views_count, downloads_count, saves_count, created_at, expires_at
     FROM file_shares
     WHERE file_id = $1 AND owner_id = $2
     ORDER BY created_at DESC`,
    [fileId, ownerId]
  );
  return result.rows.map(revealFile);
}

async function getAllSharesByOwner(ownerId) {
  const result = await pool.query(
    `SELECT s.id, s.file_id, s.share_token, s.is_public, s.allow_download, s.is_batch, s.title,
            s.views_count, s.downloads_count, s.saves_count, s.created_at, s.expires_at,
            f.original_name, f.size_bytes, f.mime_type,
            (SELECT COUNT(*) FROM file_share_items i WHERE i.share_id = s.id) AS batch_count
     FROM file_shares s
     LEFT JOIN files f ON f.id = s.file_id
     WHERE s.owner_id = $1
     ORDER BY s.created_at DESC`,
    [ownerId]
  );
  return result.rows.map(revealFile);
}

async function revokeShare(shareId, ownerId) {
  const result = await pool.query(
    "DELETE FROM file_shares WHERE id = $1 AND owner_id = $2 RETURNING id, file_id",
    [shareId, ownerId]
  );
  return result.rows[0] || null;
}

async function getBatchShareItems(shareId) {
  const result = await pool.query(
    `SELECT f.id, f.original_name, f.mime_type, f.size_bytes, f.sha256, f.uploaded_at, f.metadata, f.storage_key, i.display_name
     FROM file_share_items i
     JOIN files f ON f.id = i.file_id
     WHERE i.share_id = $1
     ORDER BY i.id ASC`,
    [shareId]
  );
  return result.rows.map(revealFile);
}

async function incrementViews(shareId) {
  await pool.query("UPDATE file_shares SET views_count = views_count + 1 WHERE id = $1", [shareId]);
}

async function incrementDownloads(shareId) {
  await pool.query("UPDATE file_shares SET downloads_count = downloads_count + 1 WHERE id = $1", [
    shareId,
  ]);
}

async function incrementSaves(shareId) {
  await pool.query("UPDATE file_shares SET saves_count = saves_count + 1 WHERE id = $1", [shareId]);
}

module.exports = {
  createSingleShare,
  createBatchShare,
  getShareByToken,
  getSharesByFileId,
  getAllSharesByOwner,
  revokeShare,
  getBatchShareItems,
  incrementViews,
  incrementDownloads,
  incrementSaves,
};
