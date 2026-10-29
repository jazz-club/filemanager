function api(path, opts) {
  opts = opts || {};
  opts.credentials = "include";
  return fetch("/api" + path, opts);
}

function showMsg(text, type) {
  var el = document.getElementById("msg");
  if (!el) return;
  if (!text) {
    el.className = "alert d-none";
    el.textContent = "";
    return;
  }
  var alertClass = "alert-info";
  if (type === "error") alertClass = "alert-danger";
  else if (type === "success") alertClass = "alert-success";

  el.textContent = text;
  el.className = "alert " + alertClass;
}

function formatBytes(bytes) {
  var b = parseInt(bytes, 10) || 0;
  if (b === 0) return "0 B";
  if (b < 1024) return b + " B";
  if (b < 1024 * 1024) return (b / 1024).toFixed(1) + " KB";
  return (b / (1024 * 1024)).toFixed(2) + " MB";
}
