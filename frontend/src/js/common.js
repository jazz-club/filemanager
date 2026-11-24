function getCookie(name) {
  var match = document.cookie.match(new RegExp("(^|;\\s*)(" + name + ")=([^;]*)"));
  return match ? decodeURIComponent(match[3]) : null;
}

var currentCsrfToken = null;

function getCsrfToken() {
  if (currentCsrfToken) return currentCsrfToken;
  var fromCookie = getCookie("XSRF-TOKEN");
  if (fromCookie) {
    currentCsrfToken = fromCookie;
    return currentCsrfToken;
  }
  return null;
}

function fetchCsrfToken() {
  return fetch("/api/auth/csrf", { credentials: "include" })
    .then(function (r) {
      return r.json();
    })
    .then(function (d) {
      if (d && d.csrfToken) {
        currentCsrfToken = d.csrfToken;
        document
          .querySelectorAll("input[name='csrfToken'], input[name='_csrf']")
          .forEach(function (inp) {
            inp.value = d.csrfToken;
          });
      }
      return currentCsrfToken;
    })
    .catch(function () {
      return null;
    });
}

if (typeof escapeHtml !== "function") {
  window.escapeHtml = function (str) {
    if (!str) return "";
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  };
}

if (typeof document !== "undefined") {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", fetchCsrfToken);
  } else {
    fetchCsrfToken();
  }
}

function api(path, opts) {
  opts = opts || {};
  opts.credentials = "include";
  opts.headers = opts.headers || {};
  var method = (opts.method || "GET").toUpperCase();
  if (opts.body && typeof opts.body === "string" && !opts.headers["Content-Type"]) {
    opts.headers["Content-Type"] = "application/json";
  }

  var token = getCsrfToken();
  if (token && ["POST", "PUT", "PATCH", "DELETE"].indexOf(method) !== -1) {
    if (!opts.headers["X-CSRF-Token"] && !opts.headers["x-csrf-token"]) {
      opts.headers["X-CSRF-Token"] = token;
    }
  }

  return fetch("/api" + path, opts);
}

function showMsg(text, type, pushToTray) {
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
        "alert " + alertClass + " d-flex align-items-center justify-content-between mb-3";
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

  var isClearMsg =
    text &&
    (text.toLowerCase().indexOf("clear") !== -1 || text.toLowerCase().indexOf("cleared") !== -1);
  if (text && pushToTray !== false && !isClearMsg) {
    pushNotification(text, type);
  }
}

function pushNotification(text, type, meta) {
  var tray = document.getElementById("upload-tray");
  var msgBox = document.getElementById("notification-tray-messages");
  var dot = document.getElementById("notification-unread-dot");
  var emptyPlaceholder = document.getElementById("tray-empty-placeholder");

  if (!msgBox) return;
  msgBox.classList.remove("d-none");
  if (emptyPlaceholder) emptyPlaceholder.classList.add("d-none");

  var item = document.createElement("div");
  var borderClass =
    type === "error"
      ? "text-danger border-danger"
      : type === "success"
        ? "text-success border-success"
        : "text-dark border-dark";
  item.className = "small p-2 mb-2 border rounded bg-white shadow-sm " + borderClass;
  item.style.fontSize = "0.78rem";
  item.style.cursor = "default";

  var dismiss = document.createElement("button");
  dismiss.type = "button";
  dismiss.className = "btn-close-custom flex-shrink-0 ms-2";
  dismiss.textContent = "×";
  dismiss.title = "Dismiss notification";
  dismiss.setAttribute("aria-label", "Dismiss notification");

  var iconSrc =
    type === "error"
      ? "/src/assets/icons/lib/SVG/regular/times-circle.svg"
      : "/src/assets/icons/lib/SVG/regular/check.svg";

  item.innerHTML =
    '<div class="d-flex justify-content-between align-items-center">' +
    '<div class="fw-bold text-truncate min-w-0 d-flex align-items-center gap-1">' +
    '<img src="' +
    iconSrc +
    '" width="13" height="13" style="object-fit: contain; flex-shrink: 0;" alt="" />' +
    '<span class="text-truncate">' +
    escapeHtml(text) +
    "</span>" +
    "</div>" +
    '<div class="d-flex align-items-center gap-1 ms-2 flex-shrink-0">' +
    '<span class="badge ' +
    (type === "error" ? "bg-danger" : "bg-success") +
    '" style="font-size: 0.6rem;">' +
    (type === "error" ? "ERR" : "OK") +
    "</span>" +
    "</div>" +
    "</div>";
  item.querySelector(".d-flex.justify-content-between").appendChild(dismiss);
  dismiss.onclick = function () {
    item.remove();
    if (!msgBox.children.length) msgBox.classList.add("d-none");
    if (typeof updateTrayEmptyState === "function") updateTrayEmptyState();
  };

  msgBox.prepend(item);
  while (msgBox.children.length > 8) {
    msgBox.removeChild(msgBox.lastChild);
  }

  if (tray && tray.classList.contains("d-none") && dot) {
    dot.classList.remove("d-none");
  }

  if (typeof window.loadTrayAuditLogs === "function") {
    window.loadTrayAuditLogs();
  }
}
