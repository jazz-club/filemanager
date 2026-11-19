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
  var borderClass =
    type === "error"
      ? "text-danger border-danger"
      : type === "success"
        ? "text-success border-success"
        : "text-dark border-dark";
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
