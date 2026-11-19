function formatBytes(bytes) {
  if (!bytes || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return (bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 2) + " " + units[i];
}

function formatDuration(sec) {
  if (!sec || isNaN(sec) || sec <= 0) return null;
  const s = Math.round(sec);
  const hrs = Math.floor(s / 3600);
  const mins = Math.floor((s % 3600) / 60);
  const secs = s % 60;
  if (hrs > 0) {
    return `${hrs}:${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  }
  return `${mins}:${String(secs).padStart(2, "0")}`;
}

function gcd(a, b) {
  a = Math.round(Math.abs(a));
  b = Math.round(Math.abs(b));
  while (b) {
    const t = b;
    b = a % b;
    a = t;
  }
  return a || 1;
}

function calculateAspectRatio(w, h) {
  if (!w || !h || w <= 0 || h <= 0) return null;
  const divisor = gcd(w, h);
  const rw = Math.round(w / divisor);
  const rh = Math.round(h / divisor);
  const ratio = w / h;
  if (Math.abs(ratio - 16 / 9) < 0.05) return "16:9";
  if (Math.abs(ratio - 4 / 3) < 0.05) return "4:3";
  if (Math.abs(ratio - 1) < 0.02) return "1:1";
  if (Math.abs(ratio - 21 / 9) < 0.05) return "21:9";
  if (Math.abs(ratio - 9 / 16) < 0.05) return "9:16";
  if (Math.abs(ratio - 3 / 2) < 0.05) return "3:2";
  if (rw <= 25 && rh <= 25) return `${rw}:${rh}`;
  return `${ratio.toFixed(2)}:1`;
}

function getVideoQualityLabel(w, h) {
  if (!w || !h) return null;
  const minDim = Math.min(w, h);
  const maxDim = Math.max(w, h);
  if (maxDim >= 3800 || minDim >= 2100) return "4K UHD";
  if (maxDim >= 2500 || minDim >= 1400) return "1440p QHD";
  if (maxDim >= 1900 || minDim >= 1000) return "1080p FHD";
  if (maxDim >= 1200 || minDim >= 700) return "720p HD";
  if (minDim >= 460) return "480p SD";
  if (minDim >= 340) return "360p SD";
  return `${w}×${h}`;
}

function decodeTextFrame(encodingByte, buf) {
  if (!buf || buf.length === 0) return "";
  try {
    if (encodingByte === 0) {
      return buf.toString("latin1").replace(/\0.*$/, "").trim();
    } else if (encodingByte === 1) {
      let str = buf.toString("utf16le");
      if (buf[0] === 0xfe && buf[1] === 0xff) {
        const swap = Buffer.from(buf);
        swap.swap16();
        str = swap.toString("utf16le");
      }
      return str
        .replace(/^\uFEFF/, "")
        .replace(/\0.*$/, "")
        .trim();
    } else if (encodingByte === 2) {
      const swap = Buffer.from(buf);
      swap.swap16();
      return swap.toString("utf16le").replace(/\0.*$/, "").trim();
    } else if (encodingByte === 3) {
      return buf.toString("utf8").replace(/\0.*$/, "").trim();
    }
    return buf.toString("utf8").replace(/\0.*$/, "").trim();
  } catch (_) {
    return "";
  }
}

function parseID3v2(buf) {
  if (!buf || buf.length < 10) return null;
  if (buf[0] !== 0x49 || buf[1] !== 0x44 || buf[2] !== 0x33) return null;
  const version = buf[3];
  if (version < 2 || version > 4) return null;

  const tagSize =
    ((buf[6] & 0x7f) << 21) | ((buf[7] & 0x7f) << 14) | ((buf[8] & 0x7f) << 7) | (buf[9] & 0x7f);

  const totalLen = Math.min(buf.length, 10 + tagSize);
  let pos = 10;
  if (version >= 3 && buf[5] & 0x40 && pos + 4 <= totalLen) {
    const extSize =
      version === 4
        ? ((buf[pos] & 0x7f) << 21) |
          ((buf[pos + 1] & 0x7f) << 14) |
          ((buf[pos + 2] & 0x7f) << 7) |
          (buf[pos + 3] & 0x7f)
        : buf.readUInt32BE(pos);
    pos += extSize;
  }

  const result = { rawTags: {} };

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
      if (frameId[0] === "\0" || !/^[A-Z0-9]{4}$/.test(frameId)) break;
    }

    if (frameSize <= 0 || pos + headerSize + frameSize > totalLen + 10) break;
    const frameData = buf.slice(pos + headerSize, pos + headerSize + frameSize);

    if (frameId.startsWith("T") && frameId !== "TXXX" && frameData.length > 1) {
      const textVal = decodeTextFrame(frameData[0], frameData.slice(1));
      if (textVal) result.rawTags[frameId] = textVal;
    } else if (frameId === "COMM" && frameData.length > 4) {
      const enc = frameData[0];
      const descEnd = frameData.indexOf(0, 4);
      const textStart = descEnd !== -1 ? descEnd + 1 : 4;
      const commVal = decodeTextFrame(enc, frameData.slice(textStart));
      if (commVal) result.rawTags["COMM"] = commVal;
    }

    pos += headerSize + frameSize;
  }

  const tags = result.rawTags;
  return {
    title: tags.TIT2 || tags.TT2 || null,
    artist: tags.TPE1 || tags.TP1 || null,
    album: tags.TALB || tags.TAL || null,
    albumArtist: tags.TPE2 || tags.TP2 || null,
    genre: tags.TCON || tags.TCO || null,
    year: tags.TYER || tags.TYE || tags.TDRC || tags.TDRL || null,
    track: tags.TRCK || tags.TRK || null,
    disc: tags.TPOS || null,
    composer: tags.TCOM || tags.TCM || null,
    comment: tags.COMM || null,
    durationMs: tags.TLEN ? parseInt(tags.TLEN, 10) : null,
    id3TagSize: 10 + tagSize,
  };
}

function parseMPEGAudio(buf, startOffset) {
  const BITRATES = {
    1: [0, 32, 64, 96, 128, 160, 192, 224, 256, 288, 320, 352, 384, 416, 448],
    2: [0, 32, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 384],
    3: [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320],
  };
  const BITRATES_V2 = {
    1: [0, 32, 48, 56, 64, 80, 96, 112, 128, 144, 160, 176, 192, 224, 256],
    2: [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160],
    3: [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160],
  };
  const SAMPLERATES = {
    1: [44100, 48000, 32000],
    2: [22050, 24000, 16000],
    2.5: [11025, 12000, 8000],
  };

  const start = Math.max(0, startOffset || 0);
  const end = Math.min(buf.length - 4, start + 500000);

  for (let i = start; i < end; i++) {
    if (buf[i] === 0xff && (buf[i + 1] & 0xe0) === 0xe0) {
      const vBits = (buf[i + 1] >> 3) & 3;
      const lBits = (buf[i + 1] >> 1) & 3;
      const brIdx = (buf[i + 2] >> 4) & 0x0f;
      const srIdx = (buf[i + 2] >> 2) & 3;
      const chMode = (buf[i + 3] >> 6) & 3;

      const version = vBits === 3 ? "1" : vBits === 2 ? "2" : vBits === 0 ? "2.5" : null;
      const layer = lBits === 3 ? 1 : lBits === 2 ? 2 : lBits === 1 ? 3 : null;

      if (!version || !layer || brIdx === 0 || brIdx === 15 || srIdx === 3) continue;

      const brTable = version === "1" ? BITRATES[layer] : BITRATES_V2[layer];
      const bitrate = brTable ? brTable[brIdx] : 0;
      const sampleRate = SAMPLERATES[version] ? SAMPLERATES[version][srIdx] : 0;
      const channels = chMode === 3 ? "Mono" : "Stereo";
      const channelCount = chMode === 3 ? 1 : 2;

      return {
        codec: `MP3 (MPEG-${version} Layer ${layer})`,
        bitrateKbps: bitrate,
        sampleRateHz: sampleRate,
        channels,
        channelCount,
      };
    }
  }
  return null;
}

function parseWAV(buf) {
  if (!buf || buf.length < 44) return null;
  if (buf.slice(0, 4).toString("ascii") !== "RIFF") return null;
  if (buf.slice(8, 12).toString("ascii") !== "WAVE") return null;

  let pos = 12;
  const meta = { format: "WAV PCM" };

  while (pos < Math.min(buf.length - 8, 65536)) {
    const chunkId = buf.slice(pos, pos + 4).toString("ascii");
    const chunkSize = buf.readUInt32LE(pos + 4);
    if (pos + 8 + chunkSize > buf.length + 1) break;

    if (chunkId === "fmt ") {
      const audioFormat = buf.readUInt16LE(pos + 8);
      meta.channels =
        buf.readUInt16LE(pos + 10) === 1
          ? "Mono"
          : buf.readUInt16LE(pos + 10) === 2
            ? "Stereo"
            : `${buf.readUInt16LE(pos + 10)} ch`;
      meta.channelCount = buf.readUInt16LE(pos + 10);
      meta.sampleRateHz = buf.readUInt32LE(pos + 12);
      meta.byteRate = buf.readUInt32LE(pos + 16);
      meta.bitsPerSample = buf.readUInt16LE(pos + 22);
      meta.codec =
        audioFormat === 1
          ? "PCM Linear"
          : audioFormat === 3
            ? "IEEE Float"
            : `WAV Format ${audioFormat}`;
      if (meta.byteRate > 0) {
        meta.bitrateKbps = Math.round((meta.byteRate * 8) / 1000);
      }
    } else if (chunkId === "data") {
      meta.dataSize = chunkSize;
      if (meta.byteRate && meta.byteRate > 0) {
        meta.durationSec = chunkSize / meta.byteRate;
      }
    } else if (chunkId === "LIST" && chunkSize > 4) {
      const type = buf.slice(pos + 8, pos + 12).toString("ascii");
      if (type === "INFO") {
        let subPos = pos + 12;
        const listEnd = pos + 8 + chunkSize;
        while (subPos < listEnd - 8) {
          const subId = buf.slice(subPos, subPos + 4).toString("ascii");
          const subSize = buf.readUInt32LE(subPos + 4);
          if (subPos + 8 + subSize > listEnd) break;
          const strVal = buf
            .slice(subPos + 8, subPos + 8 + subSize)
            .toString("utf8")
            .replace(/\0.*$/, "")
            .trim();
          if (subId === "INAM") meta.title = strVal;
          if (subId === "IART") meta.artist = strVal;
          if (subId === "IPRD") meta.album = strVal;
          if (subId === "IGNR") meta.genre = strVal;
          if (subId === "ICRD") meta.year = strVal;
          if (subId === "ICMT") meta.comment = strVal;
          subPos += 8 + subSize + (subSize % 2);
        }
      }
    }

    pos += 8 + chunkSize + (chunkSize % 2);
  }

  return meta;
}

function parseFLAC(buf) {
  if (!buf || buf.length < 42) return null;
  if (buf.slice(0, 4).toString("ascii") !== "fLaC") return null;

  const meta = { codec: "FLAC (Free Lossless Audio Codec)" };
  let pos = 4;

  while (pos < buf.length - 4) {
    const header = buf[pos];
    const isLast = (header & 0x80) !== 0;
    const blockType = header & 0x7f;
    const blockLen = (buf[pos + 1] << 16) | (buf[pos + 2] << 8) | buf[pos + 3];

    if (pos + 4 + blockLen > buf.length) break;
    const blockData = buf.slice(pos + 4, pos + 4 + blockLen);

    if (blockType === 0 && blockLen >= 34) {
      const sr = (blockData[10] << 12) | (blockData[11] << 4) | (blockData[12] >> 4);
      const ch = ((blockData[12] >> 1) & 7) + 1;
      const bps = (((blockData[12] & 1) << 4) | (blockData[13] >> 4)) + 1;
      const totalSamples =
        (BigInt(blockData[13] & 0x0f) << 32n) |
        (BigInt(blockData[14]) << 24n) |
        (BigInt(blockData[15]) << 16n) |
        (BigInt(blockData[16]) << 8n) |
        BigInt(blockData[17]);

      meta.sampleRateHz = sr;
      meta.channelCount = ch;
      meta.channels = ch === 1 ? "Mono" : ch === 2 ? "Stereo" : `${ch} channels`;
      meta.bitsPerSample = bps;
      if (sr > 0 && totalSamples > 0n) {
        meta.durationSec = Number(totalSamples) / sr;
        meta.bitrateKbps = Math.round((buf.length * 8) / meta.durationSec / 1000);
      }
    } else if (blockType === 4 && blockLen > 8) {
      try {
        const vendorLen = blockData.readUInt32LE(0);
        let cPos = 4 + vendorLen;
        if (cPos + 4 <= blockData.length) {
          const userCommentCount = blockData.readUInt32LE(cPos);
          cPos += 4;
          for (let i = 0; i < userCommentCount && cPos + 4 <= blockData.length; i++) {
            const commentLen = blockData.readUInt32LE(cPos);
            cPos += 4;
            if (cPos + commentLen > blockData.length) break;
            const str = blockData.slice(cPos, cPos + commentLen).toString("utf8");
            cPos += commentLen;
            const eqIdx = str.indexOf("=");
            if (eqIdx !== -1) {
              const k = str.slice(0, eqIdx).toUpperCase();
              const v = str.slice(eqIdx + 1).trim();
              if (k === "TITLE" && !meta.title) meta.title = v;
              else if (k === "ARTIST" && !meta.artist) meta.artist = v;
              else if (k === "ALBUM" && !meta.album) meta.album = v;
              else if (k === "ALBUMARTIST" && !meta.albumArtist) meta.albumArtist = v;
              else if (k === "GENRE" && !meta.genre) meta.genre = v;
              else if ((k === "DATE" || k === "YEAR") && !meta.year) meta.year = v.slice(0, 4);
              else if (k === "TRACKNUMBER" && !meta.track) meta.track = v;
              else if (k === "DISCNUMBER" && !meta.disc) meta.disc = v;
              else if (k === "COMPOSER" && !meta.composer) meta.composer = v;
              else if (k === "COMMENT" && !meta.comment) meta.comment = v;
            }
          }
        }
      } catch (_) {}
    }

    pos += 4 + blockLen;
    if (isLast) break;
  }

  return meta;
}

function parseOGG(buf) {
  if (!buf || buf.length < 32) return null;
  if (buf.slice(0, 4).toString("ascii") !== "OggS") return null;

  const meta = { codec: "OGG Vorbis" };
  const strSearch = buf.slice(0, Math.min(buf.length, 65536)).toString("latin1");

  if (strSearch.includes("OpusHead")) {
    meta.codec = "Opus Audio";
    const opIdx = buf.indexOf(Buffer.from("OpusHead", "ascii"));
    if (opIdx !== -1 && opIdx + 12 < buf.length) {
      meta.channelCount = buf[opIdx + 9];
      meta.channels = meta.channelCount === 1 ? "Mono" : "Stereo";
      meta.sampleRateHz = buf.readUInt32LE(opIdx + 12);
    }
  }

  const commentMarkers = ["TITLE=", "ARTIST=", "ALBUM=", "GENRE=", "DATE="];
  for (const marker of commentMarkers) {
    const idx = strSearch.toUpperCase().indexOf(marker);
    if (idx !== -1) {
      const lineEnd = strSearch.indexOf("\0", idx);
      const val = strSearch
        .slice(idx + marker.length, lineEnd !== -1 ? lineEnd : idx + marker.length + 80)
        .trim();
      if (val) {
        const k = marker.slice(0, -1).toLowerCase();
        if (k === "title") meta.title = val;
        else if (k === "artist") meta.artist = val;
        else if (k === "album") meta.album = val;
        else if (k === "genre") meta.genre = val;
        else if (k === "date") meta.year = val.slice(0, 4);
      }
    }
  }

  return meta;
}

function parseMP4Atoms(buf) {
  if (!buf || buf.length < 16) return null;
  const meta = {};

  const moovIdx = buf.indexOf(Buffer.from("moov", "ascii"));
  if (moovIdx === -1) return null;

  const mvhdIdx = buf.indexOf(Buffer.from("mvhd", "ascii"), moovIdx);
  if (mvhdIdx !== -1 && mvhdIdx + 24 < buf.length) {
    const version = buf[mvhdIdx + 4];
    const offset = version === 1 ? mvhdIdx + 4 + 4 + 16 : mvhdIdx + 4 + 4 + 8;
    if (offset + 8 <= buf.length) {
      const timescale = buf.readUInt32BE(offset);
      const duration =
        version === 1 ? Number(buf.readBigUInt64BE(offset + 4)) : buf.readUInt32BE(offset + 4);
      if (timescale > 0 && duration > 0) {
        meta.durationSec = duration / timescale;
        meta.timescale = timescale;
        meta.bitrateKbps = Math.round((buf.length * 8) / meta.durationSec / 1000);
      }
    }
  }

  let tkhdIdx = buf.indexOf(Buffer.from("tkhd", "ascii"), moovIdx);
  while (tkhdIdx !== -1 && tkhdIdx < moovIdx + 300000 && tkhdIdx < buf.length - 16) {
    try {
      const atomSize = buf.readUInt32BE(tkhdIdx - 4);
      if (atomSize > 16 && tkhdIdx + atomSize - 4 <= buf.length) {
        const w = buf.readUInt32BE(tkhdIdx + atomSize - 12) >> 16;
        const h = buf.readUInt32BE(tkhdIdx + atomSize - 8) >> 16;
        if (w > 0 && h > 0 && (!meta.width || w > meta.width)) {
          meta.width = w;
          meta.height = h;
          meta.aspectRatio = calculateAspectRatio(w, h);
          meta.quality = getVideoQualityLabel(w, h);
        }
      }
    } catch (_) {}
    tkhdIdx = buf.indexOf(Buffer.from("tkhd", "ascii"), tkhdIdx + 4);
  }

  if (buf.indexOf(Buffer.from("avc1", "ascii"), moovIdx) !== -1) meta.videoCodec = "H.264 / AVC";
  else if (
    buf.indexOf(Buffer.from("hev1", "ascii"), moovIdx) !== -1 ||
    buf.indexOf(Buffer.from("hvc1", "ascii"), moovIdx) !== -1
  )
    meta.videoCodec = "H.265 / HEVC";
  else if (buf.indexOf(Buffer.from("vp09", "ascii"), moovIdx) !== -1) meta.videoCodec = "VP9";
  else if (buf.indexOf(Buffer.from("av01", "ascii"), moovIdx) !== -1) meta.videoCodec = "AV1";
  else if (buf.indexOf(Buffer.from("mp4v", "ascii"), moovIdx) !== -1)
    meta.videoCodec = "MPEG-4 Visual";

  if (buf.indexOf(Buffer.from("mp4a", "ascii"), moovIdx) !== -1) meta.audioCodec = "AAC";
  else if (buf.indexOf(Buffer.from("ac-3", "ascii"), moovIdx) !== -1)
    meta.audioCodec = "Dolby Digital (AC-3)";
  else if (buf.indexOf(Buffer.from("ec-3", "ascii"), moovIdx) !== -1)
    meta.audioCodec = "Dolby Digital Plus (E-AC-3)";

  const ilstIdx = buf.indexOf(Buffer.from("ilst", "ascii"), moovIdx);
  if (ilstIdx !== -1) {
    const ilstSize = buf.readUInt32BE(ilstIdx - 4);
    const ilstEnd = Math.min(buf.length, ilstIdx + ilstSize);
    let p = ilstIdx + 4;
    while (p < ilstEnd - 8) {
      const atomLen = buf.readUInt32BE(p);
      const atomName = buf.slice(p + 4, p + 8).toString("latin1");
      if (atomLen <= 8 || p + atomLen > ilstEnd) break;
      const dataIdx = buf.indexOf(Buffer.from("data", "ascii"), p);
      if (dataIdx !== -1 && dataIdx < p + atomLen) {
        const valStart = dataIdx + 12;
        const valEnd = p + atomLen;
        if (valStart < valEnd) {
          const valBuf = buf.slice(valStart, valEnd);
          if (atomName === "\xA9nam") meta.title = valBuf.toString("utf8").trim();
          else if (atomName === "\xA9ART") meta.artist = valBuf.toString("utf8").trim();
          else if (atomName === "\xA9alb") meta.album = valBuf.toString("utf8").trim();
          else if (atomName === "aART") meta.albumArtist = valBuf.toString("utf8").trim();
          else if (atomName === "\xA9gen") meta.genre = valBuf.toString("utf8").trim();
          else if (atomName === "\xA9day") meta.year = valBuf.toString("utf8").slice(0, 4).trim();
          else if (atomName === "\xA9wrt") meta.composer = valBuf.toString("utf8").trim();
          else if (atomName === "\xA9cmt") meta.comment = valBuf.toString("utf8").trim();
          else if (atomName === "trkn" && valBuf.length >= 4) {
            meta.track = `${valBuf.readUInt16BE(2)}/${valBuf.readUInt16BE(4) || ""}`.replace(
              /\/$/,
              ""
            );
          }
        }
      }
      p += atomLen;
    }
  }

  return meta;
}

function parseMatroskaWebM(buf) {
  if (!buf || buf.length < 32) return null;

  if (buf[0] !== 0x1a || buf[1] !== 0x45 || buf[2] !== 0xdf || buf[3] !== 0xa3) return null;

  const meta = {};
  const headerSlice = buf.slice(0, Math.min(buf.length, 65536)).toString("latin1");
  const isWebm = headerSlice.includes("webm");
  meta.format = isWebm ? "WebM Video" : "Matroska (MKV)";

  const trackIdx = buf.indexOf(Buffer.from([0x16, 0x54, 0xae, 0x6b]));
  if (trackIdx !== -1) {
    const slice = buf.slice(trackIdx, Math.min(buf.length, trackIdx + 30000));

    const vidIdx = slice.indexOf(Buffer.from([0xe0]));
    if (vidIdx !== -1) {
      const vSlice = slice.slice(vidIdx, Math.min(slice.length, vidIdx + 500));
      for (let i = 0; i < vSlice.length - 4; i++) {
        if (vSlice[i] === 0xb0) {
          const len = vSlice[i + 1] & 0x7f;
          if (len === 2) meta.width = vSlice.readUInt16BE(i + 2);
          else if (len === 1) meta.width = vSlice[i + 2];
        }
        if (vSlice[i] === 0xba) {
          const len = vSlice[i + 1] & 0x7f;
          if (len === 2) meta.height = vSlice.readUInt16BE(i + 2);
          else if (len === 1) meta.height = vSlice[i + 2];
        }
      }
    }
  }

  if (meta.width && meta.height) {
    meta.aspectRatio = calculateAspectRatio(meta.width, meta.height);
    meta.quality = getVideoQualityLabel(meta.width, meta.height);
  }

  return meta;
}

function parseJPEG(buf) {
  if (!buf || buf.length < 16) return null;
  if (buf[0] !== 0xff || buf[1] !== 0xd8) return null;

  const meta = { format: "JPEG" };
  let pos = 2;

  while (pos < buf.length - 8) {
    if (buf[pos] !== 0xff) break;
    const marker = buf[pos + 1];
    if (marker === 0xda) break;
    if (marker === 0xd9) break;

    const len = buf.readUInt16BE(pos + 2);
    if (pos + 2 + len > buf.length) break;

    if (
      (marker >= 0xc0 && marker <= 0xc3) ||
      (marker >= 0xc5 && marker <= 0xc7) ||
      (marker >= 0xc9 && marker <= 0xcb) ||
      (marker >= 0xcd && marker <= 0xcf)
    ) {
      meta.bitDepth = buf[pos + 4];
      meta.height = buf.readUInt16BE(pos + 5);
      meta.width = buf.readUInt16BE(pos + 7);
      const components = buf[pos + 9];
      meta.channels =
        components === 1
          ? "Grayscale"
          : components === 3
            ? "RGB (24-bit)"
            : components === 4
              ? "CMYK"
              : `${components} components`;
      meta.colorMode = components === 1 ? "Grayscale" : "Color";
      meta.megapixels = Number(((meta.width * meta.height) / 1000000).toFixed(2));
      meta.aspectRatio = calculateAspectRatio(meta.width, meta.height);
    }

    if (marker === 0xe1 && len > 14) {
      const header = buf.slice(pos + 4, pos + 10).toString("ascii");
      if (header.startsWith("Exif")) {
        try {
          const tiffStart = pos + 10;
          const isLE = buf.slice(tiffStart, tiffStart + 2).toString("ascii") === "II";
          const readU16 = (off) =>
            isLE ? buf.readUInt16LE(tiffStart + off) : buf.readUInt16BE(tiffStart + off);
          const readU32 = (off) =>
            isLE ? buf.readUInt32LE(tiffStart + off) : buf.readUInt32BE(tiffStart + off);

          const ifd0Offset = readU32(4);
          if (ifd0Offset > 0 && tiffStart + ifd0Offset + 2 <= buf.length) {
            const numEntries = readU16(ifd0Offset);
            let ePos = ifd0Offset + 2;
            let exifIFDOffset = 0;

            for (let i = 0; i < numEntries && tiffStart + ePos + 12 <= buf.length; i++) {
              const tag = readU16(ePos);
              const type = readU16(ePos + 2);
              const count = readU32(ePos + 4);
              const valOffset = readU32(ePos + 8);

              if (type === 2 && count > 0 && count < 100) {
                const strStart = count <= 4 ? tiffStart + ePos + 8 : tiffStart + valOffset;
                if (strStart + count <= buf.length) {
                  const str = buf
                    .slice(strStart, strStart + count)
                    .toString("ascii")
                    .replace(/\0.*$/, "")
                    .trim();
                  if (tag === 0x010f) meta.cameraMake = str;
                  if (tag === 0x0110) meta.cameraModel = str;
                  if (tag === 0x0132) meta.dateTaken = str;
                  if (tag === 0x0131) meta.software = str;
                }
              }
              if (tag === 0x8769) exifIFDOffset = valOffset;
              ePos += 12;
            }

            if (exifIFDOffset > 0 && tiffStart + exifIFDOffset + 2 <= buf.length) {
              const subEntries = readU16(exifIFDOffset);
              let sPos = exifIFDOffset + 2;
              for (let j = 0; j < subEntries && tiffStart + sPos + 12 <= buf.length; j++) {
                const sTag = readU16(sPos);
                const sType = readU16(sPos + 2);
                const sCount = readU32(sPos + 4);
                const sVal = readU32(sPos + 8);

                if (sTag === 0x8827) meta.iso = sVal;
                if (sTag === 0x829a && sType === 5) {
                  const num = readU32(sVal);
                  const den = readU32(sVal + 4);
                  if (num > 0 && den > 0)
                    meta.exposureTime = num === 1 ? `1/${den}s` : `${(num / den).toFixed(3)}s`;
                }
                if (sTag === 0x829d && sType === 5) {
                  const num = readU32(sVal);
                  const den = readU32(sVal + 4);
                  if (den > 0) meta.aperture = `f/${(num / den).toFixed(1)}`;
                }
                if (sTag === 0x920a && sType === 5) {
                  const num = readU32(sVal);
                  const den = readU32(sVal + 4);
                  if (den > 0) meta.focalLength = `${(num / den).toFixed(1)} mm`;
                }
                if (sTag === 0x9003 && sType === 2 && sCount < 100) {
                  const sStart = tiffStart + sVal;
                  meta.dateTaken = buf
                    .slice(sStart, sStart + sCount)
                    .toString("ascii")
                    .replace(/\0.*$/, "")
                    .trim();
                }
                sPos += 12;
              }
            }
          }
        } catch (_) {}
      }
    }

    pos += 2 + len;
  }

  return meta;
}

function parsePNG(buf) {
  if (!buf || buf.length < 24) return null;

  if (
    buf[0] !== 0x89 ||
    buf[1] !== 0x50 ||
    buf[2] !== 0x4e ||
    buf[3] !== 0x47 ||
    buf[4] !== 0x0d ||
    buf[5] !== 0x0a ||
    buf[6] !== 0x1a ||
    buf[7] !== 0x0a
  ) {
    return null;
  }

  const meta = { format: "PNG" };

  if (buf.slice(12, 16).toString("ascii") === "IHDR") {
    meta.width = buf.readUInt32BE(16);
    meta.height = buf.readUInt32BE(20);
    meta.bitDepth = buf[24];
    const colorType = buf[25];
    const colorTypes = {
      0: "Grayscale",
      2: "Truecolor RGB",
      3: "Indexed Color (Palette)",
      4: "Grayscale with Alpha",
      6: "RGBA with Alpha",
    };
    meta.channels = colorTypes[colorType] || `Type ${colorType}`;
    meta.hasAlpha = colorType === 4 || colorType === 6;
    meta.colorMode = colorType === 0 || colorType === 4 ? "Grayscale" : "Color";
    meta.megapixels = Number(((meta.width * meta.height) / 1000000).toFixed(2));
    meta.aspectRatio = calculateAspectRatio(meta.width, meta.height);
  }

  return meta;
}

function parseWebP(buf) {
  if (!buf || buf.length < 30) return null;
  if (buf.slice(0, 4).toString("ascii") !== "RIFF" || buf.slice(8, 12).toString("ascii") !== "WEBP")
    return null;

  const meta = { format: "WebP" };
  const chunkType = buf.slice(12, 16).toString("ascii");

  if (chunkType === "VP8 ") {
    if (buf[23] === 0x9d && buf[24] === 0x01 && buf[25] === 0x2a) {
      meta.width = buf.readUInt16LE(26) & 0x3fff;
      meta.height = buf.readUInt16LE(28) & 0x3fff;
    }
  } else if (chunkType === "VP8L") {
    const b1 = buf[21];
    const b2 = buf[22];
    const b3 = buf[23];
    const b4 = buf[24];
    meta.width = 1 + (((b2 & 0x3f) << 8) | b1);
    meta.height = 1 + (((b4 & 0x0f) << 10) | (b3 << 2) | ((b2 & 0xc0) >> 6));
    meta.hasAlpha = (b4 & 0x10) !== 0;
  } else if (chunkType === "VP8X") {
    const flags = buf[20];
    meta.hasAlpha = (flags & 0x10) !== 0;
    meta.isAnimated = (flags & 0x02) !== 0;
    meta.width = 1 + (buf[24] | (buf[25] << 8) | (buf[26] << 16));
    meta.height = 1 + (buf[27] | (buf[28] << 8) | (buf[29] << 16));
  }

  if (meta.width && meta.height) {
    meta.megapixels = Number(((meta.width * meta.height) / 1000000).toFixed(2));
    meta.aspectRatio = calculateAspectRatio(meta.width, meta.height);
  }

  return meta;
}

function parseGIF(buf) {
  if (!buf || buf.length < 13) return null;
  const sig = buf.slice(0, 6).toString("ascii");
  if (sig !== "GIF87a" && sig !== "GIF89a") return null;

  const meta = { format: `GIF (${sig})` };
  meta.width = buf.readUInt16LE(6);
  meta.height = buf.readUInt16LE(8);
  meta.megapixels = Number(((meta.width * meta.height) / 1000000).toFixed(2));
  meta.aspectRatio = calculateAspectRatio(meta.width, meta.height);

  let count = 0;
  for (let i = 13; i < Math.min(buf.length - 9, 300000); i++) {
    if (buf[i] === 0x2c) count++;
  }
  meta.isAnimated = count > 1;
  meta.frameCount = count > 1 ? count : 1;

  return meta;
}

function parseSVG(buf) {
  if (!buf || buf.length < 10) return null;
  const str = buf.slice(0, Math.min(buf.length, 16384)).toString("utf8");
  if (!str.includes("<svg")) return null;

  const meta = { format: "SVG (Scalable Vector Graphics)" };
  const vbMatch = str.match(/viewBox=["']([0-9\.\s,-]+)["']/i);
  if (vbMatch) {
    const parts = vbMatch[1].trim().split(/[\s,]+/);
    if (parts.length >= 4) {
      meta.width = Math.round(parseFloat(parts[2]));
      meta.height = Math.round(parseFloat(parts[3]));
    }
  }
  if (!meta.width) {
    const wMatch = str.match(/width=["']([0-9\.]+)(px)?["']/i);
    const hMatch = str.match(/height=["']([0-9\.]+)(px)?["']/i);
    if (wMatch) meta.width = Math.round(parseFloat(wMatch[1]));
    if (hMatch) meta.height = Math.round(parseFloat(hMatch[1]));
  }

  if (meta.width && meta.height) {
    meta.aspectRatio = calculateAspectRatio(meta.width, meta.height);
  }

  return meta;
}

function parsePDF(buf) {
  if (!buf || buf.length < 10) return null;
  if (buf.slice(0, 5).toString("ascii") !== "%PDF-") return null;

  const meta = { format: "PDF Document" };
  const strHead = buf.slice(0, 1024).toString("latin1");
  const verMatch = strHead.match(/%PDF-([0-9\.]+)/);
  if (verMatch) meta.pdfVersion = `PDF ${verMatch[1]}`;

  const fullStr = buf.toString("latin1");
  const countMatch = fullStr.match(/\/Count\s+(\d+)/);
  if (countMatch) {
    meta.pageCount = parseInt(countMatch[1], 10);
  } else {
    const pageMatches = fullStr.match(/\/Type\s*\/Page\b/g);
    if (pageMatches) meta.pageCount = pageMatches.length;
  }

  const titleM = fullStr.match(/\/Title\s*\(([^)]+)\)/);
  if (titleM) meta.title = titleM[1].trim();
  const authorM = fullStr.match(/\/Author\s*\(([^)]+)\)/);
  if (authorM) meta.author = authorM[1].trim();
  const creatorM = fullStr.match(/\/Creator\s*\(([^)]+)\)/);
  if (creatorM) meta.creator = creatorM[1].trim();
  const producerM = fullStr.match(/\/Producer\s*\(([^)]+)\)/);
  if (producerM) meta.producer = producerM[1].trim();

  return meta;
}

function parseText(buf, filename, mimeType) {
  if (!buf || buf.length === 0) return null;
  try {
    const text = buf.toString("utf8");
    const lines = text.split(/\r\n|\r|\n/);
    const nonEmptyLines = lines.filter((l) => l.trim().length > 0).length;
    const words = text.trim() ? text.trim().split(/\s+/).length : 0;
    const chars = text.length;

    const ext = (filename || "").split(".").pop().toLowerCase();
    const langMap = {
      js: "JavaScript",
      ts: "TypeScript",
      jsx: "React JSX",
      tsx: "React TSX",
      json: "JSON",
      py: "Python",
      html: "HTML",
      htm: "HTML",
      css: "CSS",
      scss: "SCSS",
      md: "Markdown",
      markdown: "Markdown",
      sql: "SQL",
      sh: "Shell Script",
      bash: "Bash",
      ps1: "PowerShell",
      c: "C",
      cpp: "C++",
      h: "C/C++ Header",
      rs: "Rust",
      go: "Go",
      java: "Java",
      rb: "Ruby",
      php: "PHP",
      yaml: "YAML",
      yml: "YAML",
      xml: "XML",
      csv: "CSV Spreadsheet",
      txt: "Plain Text",
      log: "Log File",
    };

    return {
      lineCount: lines.length,
      nonEmptyLines,
      wordCount: words,
      charCount: chars,
      syntax: langMap[ext] || "Plain Text",
      encoding: "UTF-8",
    };
  } catch (err) {
    return null;
  }
}

function parseZIP(buf) {
  if (!buf || buf.length < 22) return null;

  const maxSearch = Math.min(buf.length, 65557);
  const start = buf.length - maxSearch;
  let eocdOffset = -1;

  for (let i = buf.length - 22; i >= start; i--) {
    if (buf[i] === 0x50 && buf[i + 1] === 0x4b && buf[i + 2] === 0x05 && buf[i + 3] === 0x06) {
      eocdOffset = i;
      break;
    }
  }

  if (eocdOffset === -1) return null;

  const totalEntries = buf.readUInt16LE(eocdOffset + 10);
  const cdSize = buf.readUInt32LE(eocdOffset + 12);
  const cdOffset = buf.readUInt32LE(eocdOffset + 16);

  let uncompressedTotal = 0;
  let compressedTotal = 0;
  let pos = cdOffset;
  const sampleFiles = [];

  for (let i = 0; i < totalEntries && pos < cdOffset + cdSize && pos < buf.length - 46; i++) {
    if (
      buf[pos] === 0x50 &&
      buf[pos + 1] === 0x4b &&
      buf[pos + 2] === 0x01 &&
      buf[pos + 3] === 0x02
    ) {
      const cSize = buf.readUInt32LE(pos + 20);
      const uSize = buf.readUInt32LE(pos + 24);
      const nameLen = buf.readUInt16LE(pos + 28);
      const extraLen = buf.readUInt16LE(pos + 30);
      const commentLen = buf.readUInt16LE(pos + 32);

      compressedTotal += cSize;
      uncompressedTotal += uSize;

      if (sampleFiles.length < 5 && nameLen > 0 && pos + 46 + nameLen <= buf.length) {
        sampleFiles.push(buf.slice(pos + 46, pos + 46 + nameLen).toString("utf8"));
      }

      pos += 46 + nameLen + extraLen + commentLen;
    } else {
      break;
    }
  }

  const ratio =
    uncompressedTotal > 0
      ? `${Math.round(((uncompressedTotal - compressedTotal) / uncompressedTotal) * 100)}%`
      : null;

  return {
    format: "ZIP Archive",
    fileCount: totalEntries,
    uncompressedSizeBytes: uncompressedTotal,
    uncompressedSize: formatBytes(uncompressedTotal),
    compressionRatio: ratio,
    sampleFiles,
  };
}

function extractMetadata(buffer, filename, mimeType, sizeBytes) {
  const meta = {
    category: "other",
  };

  const mime = (mimeType || "").toLowerCase();
  const name = (filename || "").toLowerCase();
  const ext = name.split(".").pop();

  try {
    if (
      mime.startsWith("audio/") ||
      ["mp3", "wav", "flac", "m4a", "ogg", "opus", "aac", "wma", "aiff"].includes(ext)
    ) {
      meta.category = "audio";

      const id3 = parseID3v2(buffer);
      if (id3) {
        if (id3.title) meta.title = id3.title;
        if (id3.artist) meta.artist = id3.artist;
        if (id3.album) meta.album = id3.album;
        if (id3.albumArtist) meta.albumArtist = id3.albumArtist;
        if (id3.genre) meta.genre = id3.genre;
        if (id3.year) meta.year = id3.year;
        if (id3.track) meta.track = id3.track;
        if (id3.disc) meta.disc = id3.disc;
        if (id3.composer) meta.composer = id3.composer;
        if (id3.comment) meta.comment = id3.comment;
        if (id3.durationMs) {
          meta.durationSec = id3.durationMs / 1000;
          meta.duration = formatDuration(meta.durationSec);
        }
      }

      if (
        ext === "wav" ||
        mime.includes("wav") ||
        buffer.slice(0, 4).toString("ascii") === "RIFF"
      ) {
        const wav = parseWAV(buffer);
        if (wav) {
          meta.audioFormat = wav.codec;
          meta.channels = wav.channels;
          meta.channelCount = wav.channelCount;
          meta.sampleRateHz = wav.sampleRateHz;
          meta.sampleRate = wav.sampleRateHz ? `${(wav.sampleRateHz / 1000).toFixed(1)} kHz` : null;
          meta.bitsPerSample = wav.bitsPerSample ? `${wav.bitsPerSample}-bit` : null;
          meta.bitrateKbps = wav.bitrateKbps;
          meta.bitrate = wav.bitrateKbps ? `${wav.bitrateKbps} kbps` : null;
          if (wav.durationSec) {
            meta.durationSec = wav.durationSec;
            meta.duration = formatDuration(wav.durationSec);
          }
          if (wav.title && !meta.title) meta.title = wav.title;
          if (wav.artist && !meta.artist) meta.artist = wav.artist;
          if (wav.album && !meta.album) meta.album = wav.album;
        }
      } else if (
        ext === "flac" ||
        mime.includes("flac") ||
        buffer.slice(0, 4).toString("ascii") === "fLaC"
      ) {
        const flac = parseFLAC(buffer);
        if (flac) {
          meta.audioFormat = flac.codec;
          meta.channels = flac.channels;
          meta.channelCount = flac.channelCount;
          meta.sampleRateHz = flac.sampleRateHz;
          meta.sampleRate = flac.sampleRateHz
            ? `${(flac.sampleRateHz / 1000).toFixed(1)} kHz`
            : null;
          meta.bitsPerSample = flac.bitsPerSample ? `${flac.bitsPerSample}-bit` : null;
          meta.bitrateKbps = flac.bitrateKbps;
          meta.bitrate = flac.bitrateKbps ? `${flac.bitrateKbps} kbps` : null;
          if (flac.durationSec) {
            meta.durationSec = flac.durationSec;
            meta.duration = formatDuration(flac.durationSec);
          }
          if (flac.title && !meta.title) meta.title = flac.title;
          if (flac.artist && !meta.artist) meta.artist = flac.artist;
          if (flac.album && !meta.album) meta.album = flac.album;
          if (flac.albumArtist && !meta.albumArtist) meta.albumArtist = flac.albumArtist;
          if (flac.genre && !meta.genre) meta.genre = flac.genre;
          if (flac.year && !meta.year) meta.year = flac.year;
          if (flac.track && !meta.track) meta.track = flac.track;
        }
      } else if (ext === "m4a" || ext === "aac" || mime.includes("mp4") || mime.includes("aac")) {
        const m4a = parseMP4Atoms(buffer);
        if (m4a) {
          meta.audioFormat = m4a.audioCodec || "AAC";
          if (m4a.durationSec) {
            meta.durationSec = m4a.durationSec;
            meta.duration = formatDuration(m4a.durationSec);
          }
          if (m4a.bitrateKbps) {
            meta.bitrateKbps = m4a.bitrateKbps;
            meta.bitrate = `${m4a.bitrateKbps} kbps`;
          }
          if (m4a.title && !meta.title) meta.title = m4a.title;
          if (m4a.artist && !meta.artist) meta.artist = m4a.artist;
          if (m4a.album && !meta.album) meta.album = m4a.album;
          if (m4a.genre && !meta.genre) meta.genre = m4a.genre;
          if (m4a.year && !meta.year) meta.year = m4a.year;
          if (m4a.track && !meta.track) meta.track = m4a.track;
        }
      } else if (ext === "ogg" || ext === "opus" || mime.includes("ogg")) {
        const ogg = parseOGG(buffer);
        if (ogg) {
          meta.audioFormat = ogg.codec;
          if (ogg.channels) meta.channels = ogg.channels;
          if (ogg.sampleRateHz) meta.sampleRate = `${(ogg.sampleRateHz / 1000).toFixed(1)} kHz`;
          if (ogg.title && !meta.title) meta.title = ogg.title;
          if (ogg.artist && !meta.artist) meta.artist = ogg.artist;
          if (ogg.album && !meta.album) meta.album = ogg.album;
          if (ogg.genre && !meta.genre) meta.genre = ogg.genre;
          if (ogg.year && !meta.year) meta.year = ogg.year;
        }
      }

      const mpeg = parseMPEGAudio(buffer, id3 ? id3.id3TagSize : 0);
      if (mpeg) {
        if (!meta.audioFormat) meta.audioFormat = mpeg.codec;
        if (!meta.channels) meta.channels = mpeg.channels;
        if (!meta.channelCount) meta.channelCount = mpeg.channelCount;
        if (!meta.sampleRateHz) {
          meta.sampleRateHz = mpeg.sampleRateHz;
          meta.sampleRate = `${(mpeg.sampleRateHz / 1000).toFixed(1)} kHz`;
        }
        if (!meta.bitrateKbps) {
          meta.bitrateKbps = mpeg.bitrateKbps;
          meta.bitrate = `${mpeg.bitrateKbps} kbps`;
        }
        if (!meta.durationSec && meta.bitrateKbps > 0) {
          meta.durationSec = Math.round((buffer.length * 8) / (meta.bitrateKbps * 1000));
          meta.duration = formatDuration(meta.durationSec);
        }
      }
    } else if (
      mime.startsWith("video/") ||
      ["mp4", "mkv", "webm", "mov", "avi", "wmv", "m4v", "flv"].includes(ext)
    ) {
      meta.category = "video";

      if (ext === "webm" || ext === "mkv" || mime.includes("webm") || mime.includes("matroska")) {
        const mkv = parseMatroskaWebM(buffer);
        if (mkv) {
          meta.videoFormat = mkv.format;
          if (mkv.width) meta.width = mkv.width;
          if (mkv.height) meta.height = mkv.height;
          if (mkv.aspectRatio) meta.aspectRatio = mkv.aspectRatio;
          if (mkv.quality) meta.quality = mkv.quality;
          if (mkv.resolution) meta.resolution = `${mkv.width} × ${mkv.height}`;
        }
      } else {
        const mp4 = parseMP4Atoms(buffer);
        if (mp4) {
          meta.videoFormat = mp4.videoCodec || "MPEG-4 Video";
          if (mp4.audioCodec) meta.audioFormat = mp4.audioCodec;
          if (mp4.width) meta.width = mp4.width;
          if (mp4.height) meta.height = mp4.height;
          if (mp4.width && mp4.height) meta.resolution = `${mp4.width} × ${mp4.height}`;
          if (mp4.aspectRatio) meta.aspectRatio = mp4.aspectRatio;
          if (mp4.quality) meta.quality = mp4.quality;
          if (mp4.durationSec) {
            meta.durationSec = mp4.durationSec;
            meta.duration = formatDuration(mp4.durationSec);
          }
          if (mp4.bitrateKbps) {
            meta.bitrateKbps = mp4.bitrateKbps;
            meta.bitrate =
              mp4.bitrateKbps >= 1000
                ? `${(mp4.bitrateKbps / 1000).toFixed(2)} Mbps`
                : `${mp4.bitrateKbps} kbps`;
          }
          if (mp4.title) meta.title = mp4.title;
          if (mp4.artist) meta.artist = mp4.artist;
          if (mp4.year) meta.year = mp4.year;
        }
      }
    } else if (
      mime.startsWith("image/") ||
      ["jpg", "jpeg", "png", "webp", "gif", "svg", "bmp", "ico", "avif"].includes(ext)
    ) {
      meta.category = "image";

      let imgMeta = null;
      if (ext === "png" || mime === "image/png") imgMeta = parsePNG(buffer);
      else if (ext === "webp" || mime === "image/webp") imgMeta = parseWebP(buffer);
      else if (ext === "gif" || mime === "image/gif") imgMeta = parseGIF(buffer);
      else if (ext === "svg" || mime.includes("svg")) imgMeta = parseSVG(buffer);
      else imgMeta = parseJPEG(buffer);

      if (imgMeta) {
        Object.assign(meta, imgMeta);
        if (meta.width && meta.height) {
          meta.resolution = `${meta.width} × ${meta.height}`;
          if (!meta.megapixels) {
            meta.megapixels = Number(((meta.width * meta.height) / 1000000).toFixed(2));
          }
          if (!meta.aspectRatio) {
            meta.aspectRatio = calculateAspectRatio(meta.width, meta.height);
          }
        }
      }
    } else if (mime === "application/pdf" || ext === "pdf") {
      meta.category = "pdf";
      const pdf = parsePDF(buffer);
      if (pdf) Object.assign(meta, pdf);
    } else if (
      mime === "application/zip" ||
      mime === "application/x-zip-compressed" ||
      ["zip", "tar", "gz", "tgz", "7z", "rar"].includes(ext)
    ) {
      meta.category = "archive";
      if (ext === "zip" || mime.includes("zip")) {
        const zip = parseZIP(buffer);
        if (zip) Object.assign(meta, zip);
      } else {
        meta.format = `${ext.toUpperCase()} Archive`;
      }
    } else if (
      mime.startsWith("text/") ||
      mime.includes("json") ||
      mime.includes("javascript") ||
      mime.includes("xml") ||
      [
        "txt",
        "js",
        "ts",
        "jsx",
        "tsx",
        "py",
        "html",
        "htm",
        "css",
        "scss",
        "json",
        "md",
        "markdown",
        "sql",
        "sh",
        "bash",
        "ps1",
        "c",
        "cpp",
        "h",
        "rs",
        "go",
        "java",
        "rb",
        "php",
        "yaml",
        "yml",
        "xml",
        "csv",
        "log",
      ].includes(ext)
    ) {
      meta.category = "text";
      const textMeta = parseText(buffer, filename, mimeType);
      if (textMeta) Object.assign(meta, textMeta);
    }
  } catch (err) {
    console.error("Metadata extraction error:", err);
  }

  return meta;
}

module.exports = {
  extractMetadata,
  formatBytes,
  formatDuration,
  calculateAspectRatio,
  getVideoQualityLabel,
};
