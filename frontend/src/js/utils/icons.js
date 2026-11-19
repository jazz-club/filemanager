function getFileIconUrl(mime, name) {
  var m = (mime || "").toLowerCase().trim();
  var n = (name || "").toLowerCase().trim();

  if (m.startsWith("audio/")) return "/src/assets/icons/file-audio.png";
  if (m.startsWith("video/")) return "/src/assets/icons/file-video.png";
  if (m.startsWith("image/")) return "/src/assets/icons/file-image.png";
  if (m.startsWith("text/")) return "/src/assets/icons/file-text.png";
  if (m.startsWith("font/")) return "/src/assets/icons/file-font.png";
  if (m.startsWith("model/")) return "/src/assets/icons/file-model.png";
  if (m.startsWith("message/")) return "/src/assets/icons/file-message.png";
  if (m.startsWith("multipart/")) return "/src/assets/icons/file-multipart.png";

  if (m.startsWith("application/")) {
    if (
      m.includes("font") ||
      m.includes("opentype") ||
      m.includes("truetype") ||
      m.includes("woff")
    ) {
      return "/src/assets/icons/file-font.png";
    }
    if (
      m.includes("json") ||
      m.includes("xml") ||
      m.includes("javascript") ||
      m.includes("ecmascript") ||
      m.includes("typescript")
    ) {
      return "/src/assets/icons/file-text.png";
    }
    return "/src/assets/icons/file-application.png";
  }

  if (n) {
    var ext = n.substring(n.lastIndexOf(".") + 1);
    if (["mp3", "wav", "ogg", "flac", "aac", "m4a", "wma", "mid", "midi"].indexOf(ext) !== -1) {
      return "/src/assets/icons/file-audio.png";
    }
    if (["mp4", "mkv", "webm", "avi", "mov", "wmv", "flv", "m4v"].indexOf(ext) !== -1) {
      return "/src/assets/icons/file-video.png";
    }
    if (
      ["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp", "ico", "tiff", "avif"].indexOf(ext) !== -1
    ) {
      return "/src/assets/icons/file-image.png";
    }
    if (
      [
        "txt",
        "md",
        "csv",
        "log",
        "js",
        "ts",
        "json",
        "html",
        "css",
        "py",
        "c",
        "cpp",
        "h",
        "java",
        "sh",
        "bat",
        "xml",
        "yml",
        "yaml",
        "sql",
        "php",
        "rs",
        "go",
        "rb",
      ].indexOf(ext) !== -1
    ) {
      return "/src/assets/icons/file-text.png";
    }
    if (["ttf", "otf", "woff", "woff2", "eot"].indexOf(ext) !== -1) {
      return "/src/assets/icons/file-font.png";
    }
    if (["obj", "gltf", "glb", "fbx", "stl", "dae", "3ds", "blend"].indexOf(ext) !== -1) {
      return "/src/assets/icons/file-model.png";
    }
    if (["eml", "msg"].indexOf(ext) !== -1) {
      return "/src/assets/icons/file-message.png";
    }
    if (
      [
        "zip",
        "tar",
        "gz",
        "7z",
        "rar",
        "pdf",
        "exe",
        "dmg",
        "pkg",
        "deb",
        "rpm",
        "iso",
        "doc",
        "docx",
        "xls",
        "xlsx",
        "ppt",
        "pptx",
      ].indexOf(ext) !== -1
    ) {
      return "/src/assets/icons/file-application.png";
    }
  }

  return "/src/assets/icons/file-fallback.png";
}
