const express = require("express");
const session = require("express-session");
const PgSession = require("connect-pg-simple")(session);
const helmet = require("helmet");

const { pool, initDB } = require("./db");
const { initStorage } = require("./storage");
const authRoutes = require("./routes/auth");
const fileRoutes = require("./routes/files");

const app = express();
const PORT = process.env.PORT || 3000;

app.set("trust proxy", 1);

app.use(helmet());
app.use(express.json());

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

app.use("/api/auth", authRoutes);
app.use("/api/files", fileRoutes);

app.get("/api/health", (req, res) => res.json({ status: "ok" }));

async function start() {
  console.log("init database...");
  await initDB();
  console.log("init storage...");
  await initStorage();
  app.listen(PORT, "0.0.0.0", () => {
    console.log("backend listening on port " + PORT);
  });
}

start().catch((err) => {
  console.error("fatal:", err);
  process.exit(1);
});
