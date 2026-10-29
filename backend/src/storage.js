const Minio = require("minio");

const minioClient = new Minio.Client({
  endPoint: process.env.MINIO_ENDPOINT || "minio",
  port: parseInt(process.env.MINIO_PORT || "9000", 10),
  useSSL: false,
  accessKey: process.env.MINIO_ACCESS_KEY || "minioadmin",
  secretKey: process.env.MINIO_SECRET_KEY || "minioadmin",
});

const BUCKET = process.env.MINIO_BUCKET || "encrypted-files";

async function initStorage() {
  const exists = await minioClient.bucketExists(BUCKET);
  if (!exists) {
    await minioClient.makeBucket(BUCKET);
  }
}

async function putObject(key, data) {
  await minioClient.putObject(BUCKET, key, data);
}

async function getObject(key) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    minioClient.getObject(BUCKET, key, (err, stream) => {
      if (err) return reject(err);
      stream.on("data", (chunk) => chunks.push(chunk));
      stream.on("end", () => resolve(Buffer.concat(chunks)));
      stream.on("error", reject);
    });
  });
}

async function deleteObject(key) {
  await minioClient.removeObject(BUCKET, key);
}

module.exports = { initStorage, putObject, getObject, deleteObject };
