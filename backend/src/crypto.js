const crypto = require("crypto");

const ALGO = "chacha20-poly1305";
const KEY_LEN = 32;
const IV_LEN = 12;
const TAG_LEN = 16;

function getKey() {
  const secret = process.env.SESSION_SECRET;
  const salt = process.env.ENCRYPTION_SALT;
  if (!secret || !salt) {
    throw new Error("SESSION_SECRET and ENCRYPTION_SALT not initialised");
  }
  return crypto.scryptSync(secret, salt, KEY_LEN);
}

function encrypt(plaintext) {
  const key = getKey();
  const iv = crypto.randomBytes(IV_LEN);
  const cipher = crypto.createCipheriv(ALGO, key, iv, { authTagLength: TAG_LEN });
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  const ciphertext = Buffer.concat([iv, tag, encrypted]);
  return { ciphertext, nonce: iv.toString("hex") };
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

module.exports = { encrypt, decrypt };
