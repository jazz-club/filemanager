const fs = require("fs");
const path = require("path");
const { encryptText, encryptJson, auditOwnerKey } = require("./crypto");

const LOGS_DIR = path.join(__dirname, "..", "logs");
if (!fs.existsSync(LOGS_DIR)) {
  try {
    fs.mkdirSync(LOGS_DIR, { recursive: true });
  } catch (err) {
    console.error("failed to create logs directory:", err.message);
  }
}

const AUDIT_LOG_FILE = path.join(LOGS_DIR, "audit.log");

function protectAuditRecord(entry) {
  return {
    timestamp: entry.timestamp,
    level: entry.level,
    event: entry.event,
    outcome: entry.outcome,
    statusCode: entry.statusCode,
    durationMs: entry.durationMs,
    method: entry.method,
    path: entry.path ? encryptText(entry.path) : undefined,
    userId: entry.userId ? encryptText(entry.userId) : undefined,
    username: entry.username ? encryptText(entry.username) : undefined,
    sessionId: entry.sessionId ? encryptText(entry.sessionId) : undefined,
    action: entry.action ? encryptText(entry.action) : undefined,
    itemType: entry.itemType,
    itemId: entry.itemId ? encryptText(entry.itemId) : undefined,
    itemName: entry.itemName ? encryptText(entry.itemName) : undefined,
    details: entry.details ? encryptJson(entry.details) : undefined,
    message: entry.message ? encryptText(entry.message) : undefined,
    error: entry.error ? encryptText(entry.error) : undefined,
    stack: entry.stack ? encryptText(entry.stack) : undefined,
  };
}

function writeAuditEntry(entry) {
  const line = JSON.stringify(protectAuditRecord(entry)) + "\n";
  try {
    fs.appendFileSync(AUDIT_LOG_FILE, line, "utf8");
  } catch (err) {}
  console.log(`[AUDIT] ${entry.level} ${entry.event} - ${entry.outcome} (${entry.method || "-"})`);
}

function formatActionDescription(event, action, itemName, itemType, details = {}) {
  if (action) return action;
  switch (event) {
    case "FILE_UPLOAD_SUCCESS":
      return `Uploaded ${itemName || "file"}`;
    case "FILE_DOWNLOAD":
      return `Downloaded ${itemName || "file"}`;
    case "FILE_PREVIEW":
      return `Previewed ${itemName || "file"}`;
    case "FILE_DELETE_SUCCESS":
      return `Deleted ${itemName || "file"}`;
    case "FILE_RENAME_SUCCESS":
      return `Renamed ${details.oldName || "file"} to ${itemName || "new name"}`;
    case "FILE_MOVE_SUCCESS":
      return `Moved ${itemName || "file"}`;
    case "FILE_SHARE_CREATED":
      return `Created share link for ${itemName || "file"}`;
    case "FILE_SHARE_REVOKED":
      return `Revoked share link`;
    case "FILE_SHARES_REVOKED_ALL":
      return `Revoked all share links for ${itemName || "file"}`;
    case "FILE_BATCH_SHARE_CREATED":
      return `Created batch share link (${details.count || ""} items)`;
    case "BATCH_MOVE_SUCCESS":
      return `Moved ${details.count || "batch"} items`;
    case "BATCH_DELETE_SUCCESS":
      return `Deleted ${details.count || "batch"} items`;
    case "FOLDER_CREATE_SUCCESS":
      return `Created folder ${itemName || ""}`;
    case "FOLDER_RENAME_SUCCESS":
      return `Renamed folder ${details.oldName || ""} to ${itemName || ""}`;
    case "FOLDER_MOVE_SUCCESS":
      return `Moved folder ${itemName || ""}`;
    case "FOLDER_COLOR_CHANGE":
      return `Changed colour of folder ${itemName || ""}`;
    case "FOLDER_DELETE_SUCCESS":
      return `Deleted folder ${itemName || ""}`;
    case "FOLDER_DOWNLOAD_ZIP":
      return `Downloaded folder zip (${itemName || ""})`;
    case "VAULT_EXPORT_ZIP":
      return `Exported full vault as zip`;
    case "FILE_SAVED_TO_VAULT":
      return `Saved shared collection to vault`;
    case "FILE_ITEM_SAVED_TO_VAULT":
      return `Saved shared file ${itemName || ""} to vault`;
    case "FILE_REMOVED_FROM_SHARE":
      return `Removed ${itemName || "file"} from share`;
    case "AUTH_LOGIN_SUCCESS":
      return `Logged in`;
    case "AUTH_LOGIN_FAILURE":
      return `Failed login attempt`;
    case "AUTH_LOGOUT":
      return `Logged out`;
    case "AUTH_REGISTER_SUCCESS":
      return `Registered new account`;
    case "AUTH_PASSWORD_CHANGE_SUCCESS":
      return `Changed account password`;
    case "AUTH_ACCOUNT_DELETE_SUCCESS":
      return `Deleted account`;
    default:
      return event.replace(/_/g, " ").toLowerCase();
  }
}

function audit({
  event,
  action = null,
  req = null,
  userId = null,
  username = null,
  sessionId = null,
  method = null,
  path = null,
  statusCode = null,
  durationMs = null,
  outcome = "SUCCESS",
  level = "INFO",
  itemType = null,
  itemId = null,
  itemName = null,
  details = {},
}) {
  let resolvedMethod = method;
  let resolvedPath = path;
  let resolvedUserId = userId;
  let resolvedUsername = username;
  let resolvedSessionId = sessionId;

  if (req) {
    resolvedMethod = resolvedMethod || req.method;
    resolvedPath = resolvedPath || req.originalUrl || req.url;
    if (!resolvedUserId && req.session && req.session.userId) {
      resolvedUserId = req.session.userId;
    }
    if (!resolvedUsername && req.session) {
      resolvedUsername = req.session.username || req.session.adminUser || null;
    }
    if (!resolvedSessionId && req.sessionID) {
      resolvedSessionId = req.sessionID.slice(0, 12) + "...";
    }
  }

  const resolvedItemName =
    itemName || (details ? details.fileName || details.folderName || details.name : null) || null;
  const resolvedItemType =
    itemType ||
    (details && details.fileName ? "file" : details && details.folderName ? "folder" : null) ||
    null;

  const resolvedAction = formatActionDescription(
    event,
    action,
    resolvedItemName,
    resolvedItemType,
    details
  );

  const entry = {
    timestamp: new Date().toISOString(),
    level,
    event,
    action: resolvedAction,
    userId: resolvedUserId || "anonymous",
    username: resolvedUsername || null,
    sessionId: resolvedSessionId || null,
    method: resolvedMethod || "INTERNAL",
    path: resolvedPath || "/",
    statusCode: statusCode || (outcome === "SUCCESS" ? 200 : 400),
    durationMs: durationMs !== null ? durationMs : undefined,
    outcome,
    itemType: resolvedItemType,
    itemId,
    itemName: resolvedItemName,
    details,
  };

  writeAuditEntry(entry);

  {
    try {
      const { pool } = require("./db/connection");
      if (pool) {
        const numUserId = parseInt(resolvedUserId, 10);
        if (!resolvedUserId || resolvedUserId === "anonymous" || !isNaN(numUserId)) {
          pool
            .query(
              `INSERT INTO audit_logs (user_id, username, event, action, level, outcome, status_code, method, path, item_type, item_id, item_name, details, created_at)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, NOW())`,
              [
                !resolvedUserId || resolvedUserId === "anonymous" ? null : auditOwnerKey(numUserId),
                resolvedUsername ? encryptText(resolvedUsername) : null,
                event,
                encryptText(resolvedAction),
                level,
                outcome,
                statusCode || (outcome === "SUCCESS" ? 200 : 400),
                resolvedMethod || "INTERNAL",
                encryptText(resolvedPath || "/"),
                resolvedItemType || null,
                null,
                resolvedItemName ? encryptText(resolvedItemName) : null,
                JSON.stringify(encryptJson(details || {})),
              ]
            )
            .catch(() => {});
        }
      }
    } catch (e) {}
  }

  return entry;
}

function info(message, meta = {}) {
  const entry = {
    timestamp: new Date().toISOString(),
    level: "INFO",
    event: "SYSTEM_INFO",
    outcome: "INFO",
    message,
    details: meta,
  };
  writeAuditEntry(entry);
}

function warn(message, meta = {}) {
  const entry = {
    timestamp: new Date().toISOString(),
    level: "WARN",
    event: "SYSTEM_WARN",
    outcome: "WARN",
    message,
    details: meta,
  };
  writeAuditEntry(entry);
}

function error(message, err = null, meta = {}) {
  const entry = {
    timestamp: new Date().toISOString(),
    level: "ERROR",
    event: "SYSTEM_ERROR",
    outcome: "FAILURE",
    message,
    error: err ? err.message : undefined,
    stack: process.env.NODE_ENV === "development" && err ? err.stack : undefined,
    details: meta,
  };
  writeAuditEntry(entry);
}

module.exports = {
  audit,
  info,
  warn,
  error,
};
