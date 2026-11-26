const express = require("express");
const session = require("express-session");
const PgSession = require("connect-pg-simple")(session);
const helmet = require("helmet");
const fs = require("fs");
const path = require("path");

const { pool, initDB } = require("./db");
const { initStorage } = require("./storage");
const logger = require("./logger");
const { csrfProtection } = require("./csrf");
const { decryptText } = require("./crypto");
const { shareUnlockRateLimiter } = require("./shareUnlockRateLimiter");

const authRoutes = require("./routes/auth");
const fileRoutes = require("./routes/files");
const folderRoutes = require("./routes/folders");
const adminRoutes = require("./routes/admin");
const shareRoutes = require("./routes/shares");
const auditRoutes = require("./routes/audit");

const app = express();
const PORT = process.env.PORT || 3000;

app.set("trust proxy", 1);

app.use(
  helmet({
    contentSecurityPolicy: {
      reportOnly: true,
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'"],
        imgSrc: ["'self'", "data:", "blob:"],
        fontSrc: ["'self'", "data:"],
        connectSrc: ["'self'"],
        mediaSrc: ["'self'", "blob:"],
        frameSrc: ["'self'", "blob:"],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        frameAncestors: ["'none'"],
        formAction: ["'self'"],
        reportUri: ["/api/security/csp-report"],
      },
    },
    crossOriginEmbedderPolicy: false,
  })
);

app.use(
  express.json({
    limit: "1mb",
    type: ["application/json", "application/csp-report", "application/reports+json"],
  })
);
app.use(express.urlencoded({ extended: false, limit: "1mb" }));

if (!process.env.SESSION_SECRET) {
  console.error("SESSION_SECRET where is");
  process.exit(1);
}

app.use(
  session({
    store: new PgSession({ pool, tableName: "session", createTableIfMissing: false }),
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: true,
      httpOnly: true,
      sameSite: "strict",
      maxAge: 1000 * 60 * 60 * 2,
    },
  })
);

app.use((req, res, next) => {
  const start = Date.now();
  res.on("finish", () => {
    const durationMs = Date.now() - start;
    if (req.path === "/api/health") return;

    logger.info(
      `HTTP ${req.method} ${req.originalUrl || req.url} ${res.statusCode} in ${durationMs}ms`,
      {
        method: req.method,
        path: req.originalUrl || req.url,
        statusCode: res.statusCode,
        durationMs,
      }
    );
  });
  next();
});

app.post("/api/security/csp-report", (req, res) => {
  const body = req.body || {};
  const report = body["csp-report"] || (Array.isArray(body) ? body[0]?.body || body[0] : body);
  if (report && typeof report === "object") {
    const getOrigin = (value) => {
      try {
        return new URL(String(value)).origin;
      } catch (err) {
        return String(value || "").slice(0, 32);
      }
    };
    logger.info("[CSRP] ", {
      documentOrigin: getOrigin(report["document-uri"] || report.documentURL),
      directive: String(report["violated-directive"] || report.effectiveDirective || "").slice(
        0,
        128
      ),
      blockedOrigin: getOrigin(report["blocked-uri"] || report.blockedURL),
      sourceOrigin: getOrigin(report["source-file"] || report.sourceFile),
    });
  }
  res.status(204).end();
});

app.use(csrfProtection);

app.use("/api/auth", authRoutes);
app.use("/api/files", fileRoutes);
app.use("/api/folders", folderRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/shares", shareRoutes);
app.use("/api/audit-logs", auditRoutes);

function escapeHtmlAttribute(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function formatShareSize(bytes) {
  const size = Number(bytes) || 0;
  if (size < 1024) return size + " B";
  const units = ["KB", "MB", "GB", "TB"];
  let value = size / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  return value.toFixed(1) + " " + units[unit];
}

app.get("/share/:token", async (req, res) => {
  try {
    const pagePath =
      process.env.SHARE_PAGE_PATH || path.resolve(__dirname, "../../frontend/src/html/share.html");
    let html = fs.readFileSync(pagePath, "utf8");
    const shareQ = await pool.query(
      `SELECT s.is_public AS "isPublic", s.is_batch AS "isBatch", s.password_hash AS "passwordHash",
              s.title, s.expires_at AS "expiresAt", f.original_name AS "originalName",
              f.mime_type AS "mimeType", f.size_bytes AS "sizeBytes",
              (SELECT COUNT(*)::int FROM file_share_items i WHERE i.share_id = s.id) AS "fileCount",
              s.owner_id AS "ownerId"
       FROM file_shares s
       LEFT JOIN files f ON f.id = s.file_id
       WHERE s.share_token = $1 AND (s.expires_at IS NULL OR s.expires_at > NOW())`,
      [req.params.token]
    );

    let title = "Shared file | PinkBox";
    let description = "A file has been shared with you on PinkBox.";
    let imageUrl = "/src/assets/icons/heart.png";
    const share = shareQ.rows[0];
    const canViewMetadata =
      share &&
      !share.passwordHash &&
      (share.isPublic || Number(share.ownerId) === Number(req.session?.userId));
    if (canViewMetadata) {
      const name = share.isBatch ? decryptText(share.title) : decryptText(share.originalName);
      title = name || (share.isBatch ? "Shared collection" : "Shared file");
      description = share.isBatch
        ? "Shared collection · " + share.fileCount + " items"
        : [decryptText(share.mimeType), formatShareSize(share.sizeBytes)]
            .filter(Boolean)
            .join(" · ");
      if (!share.isBatch) {
        imageUrl = "/api/shares/" + encodeURIComponent(req.params.token) + "/cover";
      }
    }

    const origin = req.protocol + "://" + req.get("host");
    const image = new URL(imageUrl, origin).href;
    const tags = {
      "og:title": title,
      "og:description": description,
      "og:type": "website",
      "og:url": origin + req.originalUrl,
      "og:image": image,
      "twitter:title": title,
      "twitter:description": description,
      "twitter:image": image,
    };
    for (const [property, content] of Object.entries(tags)) {
      const escaped = escapeHtmlAttribute(content);
      const attribute = property.startsWith("twitter:") ? "name" : "property";
      const expression = new RegExp(`<meta\\s+(?:property|name)=["']${property}["'][^>]*>`, "i");
      const replacement = `<meta ${attribute}="${property}" content="${escaped}" />`;
      if (expression.test(html)) html = html.replace(expression, replacement);
      else html = html.replace("</head>", `  ${replacement}\n  </head>`);
    }
    html = html.replace(/<title>[^<]*<\/title>/i, `<title>${escapeHtmlAttribute(title)}</title>`);
    res.type("html").send(html);
  } catch (err) {
    logger.error("Share page rendering failed", err);
    res.status(500).send("Unable to load share");
  }
});

app.get("/api/health", (req, res) => res.json({ status: "ok" }));

app.use("/api/*", (req, res) => {
  res.status(404).json({ error: "endpoint not found" });
});

app.use((err, req, res, next) => {
  logger.error("unhandled exception hai call me", err, {
    method: req.method,
    path: req.originalUrl || req.url,
  });

  if (res.headersSent) {
    return next(err);
  }

  const statusCode = err.status || err.statusCode || 500;
  const safeMessage =
    statusCode === 400 || statusCode === 413 ? err.message || "Invalid request" : "Server Errpr";

  res.status(statusCode).json({ error: safeMessage });
});

async function start() {
  logger.info("Init PostgreSQL schema");
  await initDB();
  await shareUnlockRateLimiter.pruneExpired();
  const rateLimitCleanup = setInterval(() => {
    shareUnlockRateLimiter
      .pruneExpired()
      .catch((err) => logger.error("Share unlock rate reset failed", err));
  }, 60 * 1000);
  rateLimitCleanup.unref();
  logger.info("Init MinIO object storage");
  await initStorage();
  const server = app.listen(PORT, "0.0.0.0", () => {
    logger.info("backend listening on port " + PORT);
  });
  server.requestTimeout = 30 * 60 * 1000;
  server.headersTimeout = 60 * 1000;
}

start().catch((err) => {
  logger.error("Fatal startup error", err);
  process.exit(1);
});
