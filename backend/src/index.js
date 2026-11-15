const express = require("express");
const session = require("express-session");
const PgSession = require("connect-pg-simple")(session);
const helmet = require("helmet");

const { pool, initDB } = require("./db");
const { initStorage } = require("./storage");
const logger = require("./logger");
const { csrfProtection } = require("./csrf");

const authRoutes = require("./routes/auth");
const fileRoutes = require("./routes/files");
const folderRoutes = require("./routes/folders");
const adminRoutes = require("./routes/admin");

const app = express();
const PORT = process.env.PORT || 3000;

app.set("trust proxy", 1);

app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
  })
);

app.use(express.json({ limit: "25mb" }));
app.use(express.urlencoded({ extended: false, limit: "25mb" }));

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

    logger.audit({
      event: "HTTP_REQUEST",
      req,
      userId: req.session ? req.session.userId : null,
      statusCode: res.statusCode,
      durationMs,
      outcome: res.statusCode < 400 ? "SUCCESS" : res.statusCode < 500 ? "REJECTED" : "FAILURE",
      level: res.statusCode >= 500 ? "ERROR" : res.statusCode >= 400 ? "WARN" : "INFO",
      details: {
        method: req.method,
        path: req.originalUrl || req.url,
        statusCode: res.statusCode,
      },
    });
  });
  next();
});

app.use(csrfProtection);

app.use("/api/auth", authRoutes);
app.use("/api/files", fileRoutes);
app.use("/api/folders", folderRoutes);
app.use("/api/admin", adminRoutes);

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
    statusCode === 400 || statusCode === 413
      ? err.message || "Invalid request"
      : "Server Errpr";

  res.status(statusCode).json({ error: safeMessage });
});

async function start() {
  logger.info("Init PostgreSQL schema");
  await initDB();
  logger.info("Init MinIO object storage");
  await initStorage();
  app.listen(PORT, "0.0.0.0", () => {
    logger.info("backend listening on port " + PORT);
  });
}

start().catch((err) => {
  logger.error("Fatal startup error", err);
  process.exit(1);
});
