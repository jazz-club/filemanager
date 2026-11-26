const crypto = require("crypto");
const { Transform } = require("stream");

const ALGO = "chacha20-poly1305";
const KEY_LEN = 32;
const IV_LEN = 12;
const TAG_LEN = 16;
const CHUNK_MAGIC = Buffer.from("PBX2");
const CHUNK_SIZE = 1024 * 1024;
const CHUNK_HEADER_LEN = 20;

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

function isChunkedCiphertext(blob) {
  return (
    Buffer.isBuffer(blob) &&
    blob.length >= CHUNK_MAGIC.length &&
    blob.subarray(0, 4).equals(CHUNK_MAGIC)
  );
}

function createChunkHeader() {
  const header = Buffer.concat([CHUNK_MAGIC, Buffer.alloc(4), crypto.randomBytes(IV_LEN)]);
  header.writeUInt32BE(CHUNK_SIZE, 4);
  return header;
}

function chunkNonce(baseNonce, index) {
  const nonce = Buffer.from(baseNonce);
  nonce.writeUInt32BE((nonce.readUInt32BE(8) ^ index) >>> 0, 8);
  return nonce;
}

function chunkAad(header, index, lengthWord) {
  const indexBytes = Buffer.alloc(4);
  indexBytes.writeUInt32BE(index);
  return Buffer.concat([header, indexBytes, lengthWord]);
}

function encodeChunkRecord(header, index, plaintext, isFinal, key = getKey()) {
  const lengthWord = Buffer.alloc(4);
  lengthWord.writeUInt32BE((plaintext.length | (isFinal ? 0x80000000 : 0)) >>> 0);
  const cipher = crypto.createCipheriv(ALGO, key, chunkNonce(header.subarray(8, 20), index), {
    authTagLength: TAG_LEN,
  });
  cipher.setAAD(chunkAad(header, index, lengthWord));
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return Buffer.concat([lengthWord, ciphertext, cipher.getAuthTag()]);
}

function encrypt(plaintext) {
  const input = Buffer.isBuffer(plaintext) ? plaintext : Buffer.from(plaintext);
  const header = createChunkHeader();
  const records = [header];
  const key = getKey();
  let offset = 0;
  let index = 0;
  while (input.length - offset > CHUNK_SIZE) {
    records.push(
      encodeChunkRecord(header, index, input.subarray(offset, offset + CHUNK_SIZE), false, key)
    );
    offset += CHUNK_SIZE;
    index += 1;
  }
  records.push(encodeChunkRecord(header, index, input.subarray(offset), true, key));
  return { ciphertext: Buffer.concat(records) };
}

function decrypt(blob) {
  if (!isChunkedCiphertext(blob)) throw new Error("Unsupported object format");
  return decryptChunkedBuffer(blob);
}

function decryptChunkRecord(header, index, lengthWord, ciphertext, tag) {
  const baseNonce = header.subarray(8, 20);
  const decipher = crypto.createDecipheriv(ALGO, getKey(), chunkNonce(baseNonce, index), {
    authTagLength: TAG_LEN,
  });
  decipher.setAAD(chunkAad(header, index, lengthWord));
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}

function decryptChunkedBuffer(blob) {
  if (blob.length < CHUNK_HEADER_LEN + 4 + TAG_LEN || !isChunkedCiphertext(blob)) {
    throw new Error("Invalid object");
  }
  const header = blob.subarray(0, CHUNK_HEADER_LEN);
  if (header.readUInt32BE(4) !== CHUNK_SIZE)
    throw new Error("Unsupported object chunk size");
  const chunks = [];
  let offset = CHUNK_HEADER_LEN;
  let index = 0;
  let finalSeen = false;

  while (offset < blob.length) {
    if (offset + 4 > blob.length) throw new Error("Invalid object record");
    const lengthWord = blob.subarray(offset, offset + 4);
    const flags = lengthWord.readUInt32BE(0);
    const isFinal = (flags & 0x80000000) !== 0;
    const length = flags & 0x7fffffff;
    if (length > CHUNK_SIZE || (isFinal && finalSeen))
      throw new Error("Invalid object record");
    offset += 4;
    if (offset + length + TAG_LEN > blob.length)
      throw new Error("Truncated object record");
    const ciphertext = blob.subarray(offset, offset + length);
    const tag = blob.subarray(offset + length, offset + length + TAG_LEN);
    chunks.push(decryptChunkRecord(header, index, lengthWord, ciphertext, tag));
    offset += length + TAG_LEN;
    index += 1;
    if (isFinal) {
      if (offset !== blob.length) throw new Error("Object has trailing data");
      finalSeen = true;
      break;
    }
    if (length !== CHUNK_SIZE) throw new Error("Invalid chunk size record");
  }

  if (!finalSeen) throw new Error("Object is corrupted");
  return Buffer.concat(chunks);
}

function createEncryptStream() {
  const header = createChunkHeader();
  const key = getKey();
  let buffer = Buffer.alloc(0);
  let index = 0;
  let headerSent = false;

  function encodeChunk(plain, final) {
    const record = encodeChunkRecord(header, index, plain, final, key);
    index += 1;
    return record;
  }

  return new Transform({
    readableHighWaterMark: 64 * 1024,
    writableHighWaterMark: 64 * 1024,
    transform(chunk, encoding, callback) {
      try {
        if (!headerSent) {
          this.push(header);
          headerSent = true;
        }
        buffer = buffer.length ? Buffer.concat([buffer, chunk]) : chunk;
        while (buffer.length > CHUNK_SIZE) {
          this.push(encodeChunk(buffer.subarray(0, CHUNK_SIZE), false));
          buffer = buffer.subarray(CHUNK_SIZE);
        }
        callback();
      } catch (err) {
        callback(err);
      }
    },
    flush(callback) {
      try {
        if (!headerSent) this.push(header);
        this.push(encodeChunk(buffer, true));
        callback();
      } catch (err) {
        callback(err);
      }
    },
  });
}

class DecryptStream extends Transform {
  constructor(options = {}) {
    super({ readableHighWaterMark: 64 * 1024, writableHighWaterMark: 64 * 1024 });
    this.buffer = Buffer.alloc(0);
    this.mode = options.header ? "chunked" : null;
    this.header = options.header || null;
    this.nextIndex = options.firstChunkIndex || 0;
    this.expectedChunks = options.expectedChunks || null;
    this.totalPlainSize = options.totalPlainSize;
    this.chunksSeen = 0;
    this.finalSeen = false;
    if (this.header && this.header.readUInt32BE(4) !== CHUNK_SIZE) {
      throw new Error("Unsupported chunk size");
    }
  }

  _transform(chunk, encoding, callback) {
    try {
      if (this.finalSeen && chunk.length) throw new Error("Object has trailing bytes");
      this.buffer = this.buffer.length ? Buffer.concat([this.buffer, chunk]) : chunk;
      this.processBuffer();
      callback();
    } catch (err) {
      callback(err);
    }
  }

  processBuffer() {
    if (!this.mode) {
      if (this.buffer.length < 4) return;
      if (!this.buffer.subarray(0, 4).equals(CHUNK_MAGIC)) {
        throw new Error("Unsupported encryption format");
      }
      if (this.buffer.length < CHUNK_HEADER_LEN) return;
      this.header = this.buffer.subarray(0, CHUNK_HEADER_LEN);
      if (this.header.readUInt32BE(4) !== CHUNK_SIZE)
        throw new Error("Unsupported object chunk size");
      this.mode = "chunked";
      this.buffer = this.buffer.subarray(CHUNK_HEADER_LEN);
    }

    while (this.buffer.length >= 4) {
      const lengthWord = this.buffer.subarray(0, 4);
      const flags = lengthWord.readUInt32BE(0);
      const isFinal = (flags & 0x80000000) !== 0;
      const length = flags & 0x7fffffff;
      if (length > CHUNK_SIZE) throw new Error("Invalid object record");
      const recordLength = 4 + length + TAG_LEN;
      if (this.buffer.length < recordLength) return;
      if (this.finalSeen) throw new Error("Object has trailing data");

      const index = this.nextIndex;
      if (this.totalPlainSize !== undefined) {
        const totalChunks = Math.max(1, Math.ceil(this.totalPlainSize / CHUNK_SIZE));
        const expectedFinal = index === totalChunks - 1;
        const expectedLength = expectedFinal
          ? this.totalPlainSize - index * CHUNK_SIZE
          : CHUNK_SIZE;
        if (isFinal !== expectedFinal || length !== expectedLength) {
          throw new Error("File does not match stored file size");
        }
      } else if ((!isFinal && length !== CHUNK_SIZE) || (isFinal && length === 0 && index !== 0)) {
        throw new Error("Invalid object record");
      }

      const ciphertext = this.buffer.subarray(4, 4 + length);
      const tag = this.buffer.subarray(4 + length, recordLength);
      this.push(decryptChunkRecord(this.header, index, lengthWord, ciphertext, tag));
      this.buffer = this.buffer.subarray(recordLength);
      this.nextIndex += 1;
      this.chunksSeen += 1;
      if (isFinal) this.finalSeen = true;
    }
  }

  _flush(callback) {
    try {
      if (!this.mode) throw new Error("object is truncated");
      this.processBuffer();
      if (this.buffer.length) throw new Error("Object record is truncated");
      if (this.expectedChunks !== null) {
        if (this.chunksSeen !== this.expectedChunks)
          throw new Error("Encryption range is incomplete");
      } else if (!this.finalSeen) {
        throw new Error("Object is incomplete");
      }
      callback();
    } catch (err) {
      callback(err);
    }
  }
}

function createDecryptStream(source) {
  const decryptor = new DecryptStream();
  source.on("error", (err) => decryptor.destroy(err));
  decryptor.on("error", () => source.destroy());
  source.pipe(decryptor);
  return decryptor;
}

function createChunkedRangeDecryptStream(
  source,
  header,
  firstChunkIndex,
  expectedChunks,
  totalPlainSize
) {
  const decryptor = new DecryptStream({ header, firstChunkIndex, expectedChunks, totalPlainSize });
  source.on("error", (err) => decryptor.destroy(err));
  decryptor.on("error", () => source.destroy());
  source.pipe(decryptor);
  return decryptor;
}

const TEXT_PREFIX = "enc:v2:";
const JSON_MARKER = "pke:v2";

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
  createEncryptStream,
  createDecryptStream,
  createChunkedRangeDecryptStream,
  isChunkedCiphertext,
  CHUNK_SIZE,
  CHUNK_HEADER_LEN,
  encryptText,
  decryptText,
  encryptJson,
  decryptJson,
  blindIndex,
  auditOwnerKey,
};
