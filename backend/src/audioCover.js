function parseAPICFrame(data) {
  if (!data || data.length < 16) return null;

  let imgStart = -1;
  let mime = "image/jpeg";

  for (let i = 0; i < Math.min(data.length - 8, 1024); i++) {
    if (data[i] === 0xff && data[i + 1] === 0xd8 && data[i + 2] === 0xff) {
      imgStart = i;
      mime = "image/jpeg";
      break;
    }

    if (data[i] === 0x89 && data[i + 1] === 0x50 && data[i + 2] === 0x4e && data[i + 3] === 0x47) {
      imgStart = i;
      mime = "image/png";
      break;
    }

    if (
      data[i] === 0x52 &&
      data[i + 1] === 0x49 &&
      data[i + 2] === 0x46 &&
      data[i + 3] === 0x46 &&
      i + 11 < data.length &&
      data[i + 8] === 0x57 &&
      data[i + 9] === 0x45 &&
      data[i + 10] === 0x42 &&
      data[i + 11] === 0x50
    ) {
      imgStart = i;
      mime = "image/webp";
      break;
    }

    if (data[i] === 0x47 && data[i + 1] === 0x49 && data[i + 2] === 0x46 && data[i + 3] === 0x38) {
      imgStart = i;
      mime = "image/gif";
      break;
    }
  }

  if (imgStart !== -1 && imgStart < data.length) {
    return {
      mime,
      data: data.slice(imgStart),
    };
  }

  return null;
}

function parseID3v2(buf) {
  if (buf.length < 10) return null;
  const version = buf[3];
  if (version < 2 || version > 4) return null;

  const tagSize =
    ((buf[6] & 0x7f) << 21) | ((buf[7] & 0x7f) << 14) | ((buf[8] & 0x7f) << 7) | (buf[9] & 0x7f);

  const totalLen = Math.min(buf.length, 10 + tagSize);
  let pos = 10;

  if (version >= 3 && buf[5] & 0x40) {
    if (pos + 4 <= totalLen) {
      const extSize =
        version === 4
          ? ((buf[pos] & 0x7f) << 21) |
            ((buf[pos + 1] & 0x7f) << 14) |
            ((buf[pos + 2] & 0x7f) << 7) |
            (buf[pos + 3] & 0x7f)
          : buf.readUInt32BE(pos);
      pos += extSize;
    }
  }

  while (pos < totalLen - 10) {
    let frameId;
    let frameSize;
    let headerSize;

    if (version === 2) {
      frameId = buf.slice(pos, pos + 3).toString("ascii");
      frameSize = (buf[pos + 3] << 16) | (buf[pos + 4] << 8) | buf[pos + 5];
      headerSize = 6;
      if (frameId[0] === "\0") break;
    } else {
      frameId = buf.slice(pos, pos + 4).toString("ascii");
      if (version === 4) {
        frameSize =
          ((buf[pos + 4] & 0x7f) << 21) |
          ((buf[pos + 5] & 0x7f) << 14) |
          ((buf[pos + 6] & 0x7f) << 7) |
          (buf[pos + 7] & 0x7f);
      } else {
        frameSize = buf.readUInt32BE(pos + 4);
      }
      headerSize = 10;
      if (frameId[0] === "\0") break;
    }

    if (frameSize <= 0 || pos + headerSize + frameSize > totalLen + 10) break;

    const frameData = buf.slice(pos + headerSize, pos + headerSize + frameSize);

    if (frameId === "APIC" || frameId === "PIC") {
      const res = parseAPICFrame(frameData);
      if (res) return res;
    }

    pos += headerSize + frameSize;
  }

  return null;
}

function parseFLACPictureBlock(pData) {
  if (!pData || pData.length < 32) return null;
  try {
    const mimeLen = pData.readUInt32BE(4);
    let mime = "image/jpeg";
    if (mimeLen > 0 && 8 + mimeLen <= pData.length) {
      mime = pData.slice(8, 8 + mimeLen).toString("ascii");
    }
    const descOffset = 8 + mimeLen;
    if (descOffset + 4 > pData.length) return null;
    const descLen = pData.readUInt32BE(descOffset);
    const infoOffset = descOffset + 4 + descLen;
    const imgLenOffset = infoOffset + 16;
    if (imgLenOffset + 4 > pData.length) return null;
    const imgLen = pData.readUInt32BE(imgLenOffset);
    const imgStart = imgLenOffset + 4;
    if (imgStart + imgLen <= pData.length) {
      return {
        mime: mime || "image/jpeg",
        data: pData.slice(imgStart, imgStart + imgLen),
      };
    }
  } catch (_) {}
  return null;
}

function parseFLAC(buf) {
  let pos = 4;
  while (pos < buf.length - 4) {
    const header = buf[pos];
    const isLast = (header & 0x80) !== 0;
    const blockType = header & 0x7f;
    const blockLen = (buf[pos + 1] << 16) | (buf[pos + 2] << 8) | buf[pos + 3];

    if (blockType === 6) {
      const pData = buf.slice(pos + 4, pos + 4 + blockLen);
      const pic = parseFLACPictureBlock(pData);
      if (pic) return pic;
    }

    pos += 4 + blockLen;
    if (isLast) break;
  }
  return null;
}

function parseMP4(buf) {
  const covrMarker = Buffer.from("covr", "ascii");
  let covrIdx = buf.indexOf(covrMarker);
  while (covrIdx !== -1) {
    const searchSlice = buf.slice(covrIdx, Math.min(buf.length, covrIdx + 512));
    const dataIdx = searchSlice.indexOf(Buffer.from("data", "ascii"));
    if (dataIdx !== -1) {
      const absDataPos = covrIdx + dataIdx;
      if (absDataPos >= 4) {
        const atomSize = buf.readUInt32BE(absDataPos - 4);
        const typeIndicator = buf.readUInt32BE(absDataPos + 4);
        const imgStart = absDataPos + 12;
        const imgLen = atomSize - 16;
        if (imgStart + imgLen <= buf.length && imgLen > 0) {
          const mime =
            typeIndicator === 14 || (buf[imgStart] === 0x89 && buf[imgStart + 1] === 0x50)
              ? "image/png"
              : "image/jpeg";
          return {
            mime,
            data: buf.slice(imgStart, imgStart + imgLen),
          };
        }
      }
    }
    covrIdx = buf.indexOf(covrMarker, covrIdx + 4);
  }
  return null;
}

function parseOGG(buf) {
  const marker = Buffer.from("METADATA_BLOCK_PICTURE=", "ascii");
  const idx = buf.indexOf(marker);
  if (idx !== -1) {
    const valStart = idx + marker.length;
    let valEnd = valStart;
    while (valEnd < buf.length && valEnd < valStart + 10000000) {
      const b = buf[valEnd];
      if (
        (b >= 0x41 && b <= 0x5a) ||
        (b >= 0x61 && b <= 0x7a) ||
        (b >= 0x30 && b <= 0x39) ||
        b === 0x2b ||
        b === 0x2f ||
        b === 0x3d
      ) {
        valEnd++;
      } else {
        break;
      }
    }
    if (valEnd > valStart + 32) {
      const b64 = buf.slice(valStart, valEnd).toString("ascii");
      const picBuf = Buffer.from(b64, "base64");
      return parseFLACPictureBlock(picBuf);
    }
  }
  return null;
}

function extractAudioCover(buffer) {
  if (!buffer || buffer.length < 32) return null;

  try {
    if (buffer.length >= 10 && buffer[0] === 0x49 && buffer[1] === 0x44 && buffer[2] === 0x33) {
      const cover = parseID3v2(buffer);
      if (cover) return cover;
    }

    if (buffer.length >= 4 && buffer.slice(0, 4).toString("ascii") === "fLaC") {
      const cover = parseFLAC(buffer);
      if (cover) return cover;
    }

    const coverM4A = parseMP4(buffer);
    if (coverM4A) return coverM4A;

    if (buffer.length >= 4 && buffer.slice(0, 4).toString("ascii") === "OggS") {
      const coverOgg = parseOGG(buffer);
      if (coverOgg) return coverOgg;
    }

    const id3Idx = buffer.indexOf(Buffer.from([0x49, 0x44, 0x33]));
    if (id3Idx > 0 && id3Idx < 65536) {
      const cover = parseID3v2(buffer.slice(id3Idx));
      if (cover) return cover;
    }
  } catch (_) {}

  return null;
}

module.exports = { extractAudioCover };
