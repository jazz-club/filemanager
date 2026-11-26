const Minio = require("minio");
const { Writable } = require("stream");
const { pipeline } = require("stream/promises");

const MINIO_PART_SIZE = 8 * 1024 * 1024;
const MAX_BUFFERED_OBJECT_BYTES = 32 * 1024 * 1024;

const minioClient = new Minio.Client({
  endPoint: process.env.MINIO_ENDPOINT || "minio",
  port: parseInt(process.env.MINIO_PORT || "9000", 10),
  useSSL: false,
  accessKey: process.env.MINIO_ACCESS_KEY || "minioadmin",
  secretKey: process.env.MINIO_SECRET_KEY || "minioadmin",
  partSize: MINIO_PART_SIZE,
});

const BUCKET = process.env.MINIO_BUCKET || "encrypted-files";

async function initStorage() {
  const exists = await minioClient.bucketExists(BUCKET);
  if (!exists) {
    await minioClient.makeBucket(BUCKET);
  }
}

async function checkStorage() {
  await minioClient.bucketExists(BUCKET);
  return true;
}

async function putObject(key, data) {
  await minioClient.putObject(BUCKET, key, data);
}

class MultipartObjectWriter extends Writable {
  constructor(key) {
    super({ highWaterMark: 64 * 1024 });
    this.key = key;
    this.uploadId = null;
    this.parts = [];
    this.partNumber = 1;
    this.partBuffer = null;
    this.partOffset = 0;
  }

  _construct(callback) {
    minioClient
      .initiateNewMultipartUpload(BUCKET, this.key, { "Content-Type": "application/octet-stream" })
      .then((uploadId) => {
        this.uploadId = uploadId;
        callback();
      }, callback);
  }

  _write(chunk, encoding, callback) {
    this.writePartData(chunk).then(() => callback(), callback);
  }

  async writePartData(chunk) {
    let offset = 0;
    while (offset < chunk.length) {
      if (!this.partBuffer) this.partBuffer = Buffer.allocUnsafe(MINIO_PART_SIZE);
      const count = Math.min(MINIO_PART_SIZE - this.partOffset, chunk.length - offset);
      chunk.copy(this.partBuffer, this.partOffset, offset, offset + count);
      this.partOffset += count;
      offset += count;
      if (this.partOffset === MINIO_PART_SIZE) await this.flushPart(MINIO_PART_SIZE);
    }
  }

  async flushPart(length) {
    const part = await minioClient.uploadPart(
      {
        bucketName: BUCKET,
        objectName: this.key,
        uploadID: this.uploadId,
        partNumber: this.partNumber,
        headers: { "Content-Length": length },
      },
      this.partBuffer.subarray(0, length)
    );
    this.parts.push({ part: this.partNumber, etag: part.etag });
    this.partNumber += 1;
    this.partBuffer = null;
    this.partOffset = 0;
  }

  _final(callback) {
    const finish = async () => {
      if (this.partOffset > 0) await this.flushPart(this.partOffset);
      if (this.parts.length === 0) {
        const uploadId = this.uploadId;
        this.uploadId = null;
        await minioClient.abortMultipartUpload(BUCKET, this.key, uploadId);
        this.result = await minioClient.putObject(BUCKET, this.key, Buffer.alloc(0));
        return;
      }
      this.result = await minioClient.completeMultipartUpload(
        BUCKET,
        this.key,
        this.uploadId,
        this.parts
      );
      this.uploadId = null;
    };
    finish().then(() => callback(), callback);
  }

  _destroy(err, callback) {
    if (!this.uploadId) return callback(err);
    const uploadId = this.uploadId;
    this.uploadId = null;
    minioClient.abortMultipartUpload(BUCKET, this.key, uploadId).then(
      () => callback(err),
      (abortError) => callback(err || abortError)
    );
  }
}

function createObjectUploadStream(key) {
  return new MultipartObjectWriter(key);
}

async function putObjectStream(key, source) {
  const writer = createObjectUploadStream(key);
  await pipeline(source, writer);
  return writer.result;
}

async function getObjectStream(key) {
  return minioClient.getObject(BUCKET, key);
}

async function getObjectRange(key, offset, length) {
  return minioClient.getPartialObject(BUCKET, key, offset, length);
}

async function getObject(key) {
  const stream = await getObjectStream(key);
  const chunks = [];
  let total = 0;
  for await (const chunk of stream) {
    total += chunk.length;
    if (total > MAX_BUFFERED_OBJECT_BYTES) {
      stream.destroy();
      throw new Error("Object exceeds inmemory read limit");
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks, total);
}

async function deleteObject(key) {
  await minioClient.removeObject(BUCKET, key);
}

async function copyObject(sourceKey, targetKey) {
  const conds = new Minio.CopyConditions();
  return new Promise((resolve, reject) => {
    minioClient.copyObject(
      BUCKET,
      targetKey,
      `/${BUCKET}/${sourceKey}`,
      conds,
      async (err, data) => {
        if (err) {
          try {
            const stream = await getObjectStream(sourceKey);
            await putObjectStream(targetKey, stream);
            return resolve();
          } catch (copyErr) {
            return reject(copyErr);
          }
        }
        resolve(data);
      }
    );
  });
}

module.exports = {
  initStorage,
  checkStorage,
  putObject,
  putObjectStream,
  createObjectUploadStream,
  getObject,
  getObjectStream,
  getObjectRange,
  deleteObject,
  copyObject,
};
