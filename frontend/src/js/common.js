function api(path, opts) {
  opts = opts || {};
  opts.credentials = "include";
  opts.headers = opts.headers || {};
  if (opts.body && typeof opts.body === "string" && !opts.headers["Content-Type"]) {
    opts.headers["Content-Type"] = "application/json";
  }
  return fetch("/api" + path, opts);
}

function escapeHtml(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function showMsg(text, type) {
  var el = document.getElementById("msg");
  if (el) {
    if (!text) {
      el.className = "alert d-none";
      el.innerHTML = "";
    } else {
      var alertClass = "alert-info";
      if (type === "error") alertClass = "alert-danger";
      else if (type === "success") alertClass = "alert-success";
      el.className =
        "alert " +
        alertClass +
        " d-flex align-items-center justify-content-between mb-3";
      el.innerHTML =
        '<div class="d-flex align-items-center gap-2 flex-grow-1 text-break pe-2">' +
        '<span class="fw-bold" style="font-size: 0.9rem;">' +
        escapeHtml(text) +
        "</span>" +
        "</div>" +
        '<button type="button" class="btn-close-custom ms-2 flex-shrink-0" title="Dismiss">✕</button>';
      var closeBtn = el.querySelector(".btn-close-custom");
      if (closeBtn) {
        closeBtn.onclick = function () {
          el.classList.add("alert-closing");
          setTimeout(function () {
            el.className = "alert d-none";
            el.innerHTML = "";
          }, 190);
        };
      }
    }
  }

  if (text) {
    pushNotification(text, type);
  }
}

function pushNotification(text, type) {
  var tray = document.getElementById("upload-tray");
  var msgBox = document.getElementById("notification-tray-messages");
  var dot = document.getElementById("notification-unread-dot");
  var emptyPlaceholder = document.getElementById("tray-empty-placeholder");

  if (!msgBox) return;
  msgBox.classList.remove("d-none");
  if (emptyPlaceholder) emptyPlaceholder.classList.add("d-none");

  var item = document.createElement("div");
  var borderClass = type === "error" ? "text-danger border-danger" : (type === "success" ? "text-success border-success" : "text-dark border-dark");
  item.className = "small p-1 px-2 mb-1 border rounded bg-light " + borderClass;
  item.style.fontSize = "0.78rem";
  item.textContent = (type === "error" ? "× " : "• ") + text;

  msgBox.prepend(item);
  while (msgBox.children.length > 5) {
    msgBox.removeChild(msgBox.lastChild);
  }

  if (tray && tray.classList.contains("d-none") && dot) {
    dot.classList.remove("d-none");
  }
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

document.addEventListener("click", function (e) {
  var btn = e.target.closest(".toggle-pw-btn, #toggle-pass-visibility, #toggle-admin-pass-visibility");
  if (!btn) return;
  e.preventDefault();
  var targetId = btn.getAttribute("data-target");
  var input = targetId
    ? document.getElementById(targetId)
    : (btn.previousElementSibling || (btn.closest(".input-group") ? btn.closest(".input-group").querySelector("input") : null));
  if (!input) return;
  if (input.type === "password") {
    input.type = "text";
    btn.textContent = "○";
    btn.title = "Hide password";
  } else {
    input.type = "password";
    btn.textContent = "◉";
    btn.title = "Show password";
  }
});
