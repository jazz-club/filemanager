const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const envPath = path.join(__dirname, ".env");

if (fs.existsSync(envPath) && !process.argv.includes("--force")) {
  console.log("init secrets already exist, --force to overwrite");
  process.exit(0);
}

function randHex(bytes) {
  return crypto.randomBytes(bytes).toString("hex");
}

function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

const sessionSecret = randHex(32);
const encSalt = randHex(16);
const pgPass = randHex(16);
const minioKey = "pinkbox_admin";
const minioSecret = randHex(16);
const hostPort = randInt(20000, 35000);
const minioConsolePort = randInt(35001, 50000);

const envContent =
  [
    "NODE_ENV=production",
    "HOST_PORT=" + hostPort,
    "MINIO_CONSOLE_PORT=" + minioConsolePort,
    "SESSION_SECRET=" + sessionSecret,
    "ENCRYPTION_SALT=" + encSalt,
    "POSTGRES_USER=vault",
    "POSTGRES_PASSWORD=" + pgPass,
    "POSTGRES_DB=vault",
    "DATABASE_URL=postgres://vault:" + pgPass + "@postgres:5432/vault",
    "MINIO_ENDPOINT=minio",
    "MINIO_PORT=9000",
    "MINIO_ACCESS_KEY=" + minioKey,
    "MINIO_SECRET_KEY=" + minioSecret,
    "MINIO_BUCKET=encrypted-files",
  ].join("\n") + "\n";

fs.writeFileSync(envPath, envContent, "utf8");
console.log("secrets initd");
