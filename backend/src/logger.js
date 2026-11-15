const fs = require("fs");
const path = require("path");

const LOGS_DIR = path.join(__dirname, "..", "logs");
if (!fs.existsSync(LOGS_DIR)) {
  try {
    fs.mkdirSync(LOGS_DIR, { recursive: true });
  } catch (err) {
    console.error("failed to create logs directory:", err.message);
  }
}

const AUDIT_LOG_FILE = path.join(LOGS_DIR, "audit.log");

function writeAuditEntry(entry) {
  const line = JSON.stringify(entry) + "\n";
  try {
    fs.appendFileSync(AUDIT_LOG_FILE, line, "utf8");
  } catch (err) {}
  console.log(
    `[AUDIT] ${entry.level} ${entry.event} - ${entry.outcome} (${entry.method || "-"} ${entry.path || "-"}) user:${entry.userId || "anonymous"} ip:${entry.ip || "-"}`
  );
}

function audit({
  event,
  req = null,
  userId = null,
  sessionId = null,
  ip = null,
  method = null,
  path = null,
  statusCode = null,
  durationMs = null,
  outcome = "SUCCESS",
  level = "INFO",
  details = {},
}) {
  let resolvedIp = ip;
  let resolvedMethod = method;
  let resolvedPath = path;
  let resolvedUserId = userId;
  let resolvedSessionId = sessionId;

  if (req) {
    resolvedIp =
      resolvedIp ||
      (req.headers && req.headers["x-forwarded-for"]
        ? req.headers["x-forwarded-for"].split(",")[0].trim()
        : req.ip || req.socket?.remoteAddress || "127.0.0.1");
    resolvedMethod = resolvedMethod || req.method;
    resolvedPath = resolvedPath || req.originalUrl || req.url;
    if (!resolvedUserId && req.session && req.session.userId) {
      resolvedUserId = req.session.userId;
    }
    if (!resolvedSessionId && req.sessionID) {
      resolvedSessionId = req.sessionID.slice(0, 12) + "...";
    }
  }

  const entry = {
    timestamp: new Date().toISOString(),
    level,
    event,
    userId: resolvedUserId || "anonymous",
    sessionId: resolvedSessionId || null,
    ip: resolvedIp || "127.0.0.1",
    method: resolvedMethod || "INTERNAL",
    path: resolvedPath || "/",
    statusCode: statusCode || (outcome === "SUCCESS" ? 200 : 400),
    durationMs: durationMs !== null ? durationMs : undefined,
    outcome,
    details,
  };

  writeAuditEntry(entry);
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
