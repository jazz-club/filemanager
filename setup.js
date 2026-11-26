const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { spawnSync } = require("child_process");

const envPath = path.join(__dirname, ".env");
function existingEnvValue(name) {
  if (!fs.existsSync(envPath)) return "";
  const line = fs
    .readFileSync(envPath, "utf8")
    .split(/\r?\n/)
    .find((entry) => entry.startsWith(name + "="));
  return line ? line.slice(name.length + 1).replace(/^['"]|['"]$/g, "") : "";
}

const configuredCertDir =
  process.env.TLS_CERT_DIR || existingEnvValue("TLS_CERT_DIR") || "./nginx/certs";
const certDir = path.resolve(__dirname, configuredCertDir);
const certPath = path.join(certDir, "server.crt");
const keyPath = path.join(certDir, "server.key");
const force = process.argv.includes("--force");
const productionSetup = process.argv.includes("--production");

function ensureLocalCertificates() {
  if (fs.existsSync(certPath) && fs.existsSync(keyPath)) return;
  if (productionSetup) {
    throw new Error("missing certs");
  }

  const script =
    process.platform === "win32"
      ? path.join(__dirname, "nginx", "generate-certs.ps1")
      : path.join(__dirname, "nginx", "generate-certs.sh");
  const result =
    process.platform === "win32"
      ? spawnSync(
          "powershell.exe",
          ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", script, "-CertDir", certDir],
          { stdio: "inherit" }
        )
      : spawnSync("sh", [script, certDir], { stdio: "inherit" });

  if (result.error) throw result.error;
  if (result.status !== 0 || !fs.existsSync(certPath) || !fs.existsSync(keyPath)) {
    throw new Error("Missing OpenSSL or could not generate certs");
  }
  console.log("Signed TLS certs");
}

ensureLocalCertificates();

if (fs.existsSync(envPath) && !force) {
  console.log("Setup and secrets already init; use --force to overwrite");
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
const adminPassword = randHex(24);
const hostPort = randInt(20000, 35000);
const minioConsolePort = randInt(35001, 50000);

const envContent =
  [
    "NODE_ENV=production",
    "TLS_CERT_DIR=" + configuredCertDir,
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
    "ADMIN_USERNAME=admin",
    "ADMIN_PASSWORD=" + adminPassword,
  ].join("\n") + "\n";

fs.writeFileSync(envPath, envContent, "utf8");
console.log("Secrets initialized");
