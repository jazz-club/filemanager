const argon2 = require("argon2");

const ARGON2_OPTIONS = {
  type: argon2.argon2id,
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
};
const MAX_PASSWORD_BYTES = 64 * 1024;

function isPasswordLengthAllowed(password) {
  return typeof password === "string" && Buffer.byteLength(password, "utf8") <= MAX_PASSWORD_BYTES;
}

async function hashPassword(password) {
  if (!isPasswordLengthAllowed(password)) throw new RangeError("Password exceeds hash limit");
  return argon2.hash(password, ARGON2_OPTIONS);
}

async function verifyPassword(password, encodedHash) {
  if (!isPasswordLengthAllowed(password) || typeof encodedHash !== "string") return false;
  try {
    if (encodedHash.startsWith("$argon2id$")) return await argon2.verify(encodedHash, password);
    return false;
  } catch (err) {
    return false;
  }
}

module.exports = {
  MAX_PASSWORD_BYTES,
  hashPassword,
  isPasswordLengthAllowed,
  verifyPassword,
};
