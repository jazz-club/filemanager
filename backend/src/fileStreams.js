const { Readable, PassThrough } = require("stream");
const { pipeline } = require("stream/promises");
const {
  createDecryptStream,
  createChunkedRangeDecryptStream,
  CHUNK_SIZE,
  CHUNK_HEADER_LEN,
} = require("./crypto");
const { getObjectStream, getObjectRange } = require("./storage");

async function readStreamPrefix(readable, maxBytes) {
  const chunks = [];
  let total = 0;
  for await (const chunk of readable) {
    const count = Math.min(chunk.length, maxBytes - total);
    if (count > 0) {
      chunks.push(chunk.subarray(0, count));
      total += count;
    }
    if (total >= maxBytes) {
      readable.destroy();
      break;
    }
  }
  return Buffer.concat(chunks, total);
}

async function readSmallObjectRange(storageKey, offset, length) {
  const readable = await getObjectRange(storageKey, offset, length);
  const chunks = [];
  let total = 0;
  for await (const chunk of readable) {
    total += chunk.length;
    if (total > length) throw new Error("Range exceeded requested length");
    chunks.push(chunk);
  }
  if (total !== length) throw new Error("Range was truncated");
  return Buffer.concat(chunks, total);
}

function slicePlaintextStream(readable, offset, length, drainToEnd = false) {
  return Readable.from(
    (async function* () {
      let skipped = 0;
      let remaining = length;
      for await (const chunk of readable) {
        if (skipped + chunk.length <= offset) {
          skipped += chunk.length;
          continue;
        }
        const start = Math.max(0, offset - skipped);
        const count = Math.min(chunk.length - start, remaining);
        if (count > 0) yield chunk.subarray(start, start + count);
        skipped += chunk.length;
        remaining -= count;
        if (remaining === 0 && !drainToEnd) {
          readable.destroy();
          break;
        }
      }
      if (remaining !== 0) throw new Error("Range shorter than requested length");
    })()
  );
}

async function getDecryptedRangeStream(storageKey, totalSize, start, end) {
  const magic = await readSmallObjectRange(storageKey, 0, 4);
  if (!magic.equals(Buffer.from("PBX2"))) {
    throw new Error("Unsupported encryption format");
  }

  const header = await readSmallObjectRange(storageKey, 0, CHUNK_HEADER_LEN);
  if (header.readUInt32BE(4) !== CHUNK_SIZE)
    throw new Error("Invalid chunk size");
  const firstChunk = Math.floor(start / CHUNK_SIZE);
  const lastChunk = Math.floor(end / CHUNK_SIZE);
  const totalChunks = Math.max(1, Math.ceil(totalSize / CHUNK_SIZE));
  const lastChunkLength =
    lastChunk === totalChunks - 1 ? totalSize - lastChunk * CHUNK_SIZE : CHUNK_SIZE;
  const selectedPlainBytes = lastChunkLength + (lastChunk - firstChunk) * CHUNK_SIZE;
  const encryptedOffset = CHUNK_HEADER_LEN + firstChunk * (CHUNK_SIZE + 4 + 16);
  const encryptedLength = selectedPlainBytes + (lastChunk - firstChunk + 1) * (4 + 16);
  const encryptedRange = await getObjectRange(storageKey, encryptedOffset, encryptedLength);
  const decrypted = createChunkedRangeDecryptStream(
    encryptedRange,
    header,
    firstChunk,
    lastChunk - firstChunk + 1,
    totalSize
  );
  return slicePlaintextStream(decrypted, start - firstChunk * CHUNK_SIZE, end - start + 1);
}

function parseByteRange(header, totalSize) {
  const match = /^bytes=(\d*)-(\d*)$/.exec(header || "");
  if (!match || totalSize <= 0 || (!match[1] && !match[2])) return null;
  let start;
  let end;
  if (!match[1]) {
    const suffixLength = Number(match[2]);
    if (!Number.isSafeInteger(suffixLength) || suffixLength <= 0) return null;
    start = Math.max(0, totalSize - suffixLength);
    end = totalSize - 1;
  } else {
    start = Number(match[1]);
    end = match[2] ? Number(match[2]) : totalSize - 1;
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end)) return null;
    end = Math.min(end, totalSize - 1);
  }
  if (start < 0 || start >= totalSize || start > end) return null;
  return { start, end };
}

async function appendDecryptedObject(archive, storageKey, archivePath) {
  const output = new PassThrough({ highWaterMark: 64 * 1024 });
  archive.append(output, { name: archivePath });
  const encrypted = await getObjectStream(storageKey);
  await pipeline(createDecryptStream(encrypted), output);
}

async function readDecryptedPrefix(storageKey, maxBytes) {
  return readStreamPrefix(createDecryptStream(await getObjectStream(storageKey)), maxBytes);
}

module.exports = {
  readStreamPrefix,
  readDecryptedPrefix,
  getDecryptedRangeStream,
  parseByteRange,
  appendDecryptedObject,
};
