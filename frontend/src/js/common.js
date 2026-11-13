function api(path, opts) {
  opts = opts || {};
  opts.credentials = "include";
  opts.headers = opts.headers || {};
  if (opts.body && typeof opts.body === "string" && !opts.headers["Content-Type"]) {
    opts.headers["Content-Type"] = "application/json";
  }
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
  if (b < 1024 * 1024 * 1024) return (b / (1024 * 1024)).toFixed(2) + " MB";
  return (b / (1024 * 1024 * 1024)).toFixed(2) + " GB";
}

function formatDate(isoStr) {
  if (!isoStr) return "";
  try {
    var d = new Date(isoStr);
    if (isNaN(d.getTime())) return "";
    var y = d.getFullYear();
    var m = String(d.getMonth() + 1).padStart(2, "0");
    var day = String(d.getDate()).padStart(2, "0");
    var hr = String(d.getHours()).padStart(2, "0");
    var min = String(d.getMinutes()).padStart(2, "0");
    return y + "-" + m + "-" + day + " " + hr + ":" + min;
  } catch (e) {
    return "";
  }
}
