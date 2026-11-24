const crypto = require("crypto");

const ALGO = "chacha20-poly1305";
const KEY_LEN = 32;
const IV_LEN = 12;
const TAG_LEN = 16;

let cachedKey = null;

function getKey() {
  if (cachedKey) return cachedKey;
  const secret = process.env.SESSION_SECRET;
  const salt = process.env.ENCRYPTION_SALT;
  if (!secret || !salt) {
    throw new Error("SESSION_SECRET and ENCRYPTION_SALT not initialised");
  }
  cachedKey = crypto.scryptSync(secret, salt, KEY_LEN);
  return cachedKey;
}

function encrypt(plaintext) {
  const key = getKey();
  const iv = crypto.randomBytes(IV_LEN);
  const cipher = crypto.createCipheriv(ALGO, key, iv, { authTagLength: TAG_LEN });
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  const ciphertext = Buffer.concat([iv, tag, encrypted]);
  return { ciphertext };
}

function decrypt(blob) {
  const key = getKey();
  const iv = blob.subarray(0, IV_LEN);
  const tag = blob.subarray(IV_LEN, IV_LEN + TAG_LEN);
  const data = blob.subarray(IV_LEN + TAG_LEN);
  const decipher = crypto.createDecipheriv(ALGO, key, iv, { authTagLength: TAG_LEN });
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]);
}

const TEXT_PREFIX = "enc:v1:";
const JSON_MARKER = "pke:v1";

function encryptText(value) {
  if (value === null || value === undefined) return value;
  const text = String(value);
  if (text.startsWith(TEXT_PREFIX)) return text;
  return TEXT_PREFIX + encrypt(Buffer.from(text, "utf8")).ciphertext.toString("base64");
}

function decryptText(value) {
  if (value === null || value === undefined) return value;
  const text = String(value);
  if (!text.startsWith(TEXT_PREFIX)) return text;
  return decrypt(Buffer.from(text.slice(TEXT_PREFIX.length), "base64")).toString("utf8");
}

function encryptJson(value) {
  if (value && typeof value === "object" && value[JSON_MARKER]) return value;
  const raw = JSON.stringify(value === undefined ? null : value);
  return { [JSON_MARKER]: encrypt(Buffer.from(raw, "utf8")).ciphertext.toString("base64") };
}

function decryptJson(value) {
  if (!value || typeof value !== "object" || !value[JSON_MARKER]) return value;
  const raw = decrypt(Buffer.from(value[JSON_MARKER], "base64")).toString("utf8");
  return JSON.parse(raw);
}

function blindIndex(value) {
  const salt = process.env.ENCRYPTION_SALT;
  if (!salt) throw new Error("ENCRYPTION_SALT not initialised");
  return crypto.createHmac("sha256", salt).update(String(value).trim().toLowerCase()).digest("hex");
}

function auditOwnerKey(userId) {
  const salt = process.env.ENCRYPTION_SALT;
  if (!salt) throw new Error("ENCRYPTION_SALT not initialised");
  return crypto
    .createHmac("sha256", salt)
    .update("audit-owner:" + userId)
    .digest("hex");
}

module.exports = {
  encrypt,
  decrypt,
  encryptText,
  decryptText,
  encryptJson,
  decryptJson,
  blindIndex,
  auditOwnerKey,
};
