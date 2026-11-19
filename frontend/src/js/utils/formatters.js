function formatBytes(bytes) {
  var b = parseInt(bytes, 10) || 0;
  if (b === 0) return "0B";
  if (b < 1024) return b + "B";
  if (b < 1024 * 1024) return (b / 1024).toFixed(1) + "KB";
  if (b < 1024 * 1024 * 1024) return (b / (1024 * 1024)).toFixed(2) + "MB";
  return (b / (1024 * 1024 * 1024)).toFixed(2) + "GB";
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
  var btn = e.target.closest(
    ".toggle-pw-btn, #toggle-pass-visibility, #toggle-admin-pass-visibility"
  );
  if (!btn) return;
  e.preventDefault();
  var targetId = btn.getAttribute("data-target");
  var input = targetId
    ? document.getElementById(targetId)
    : btn.previousElementSibling ||
      (btn.closest(".input-group") ? btn.closest(".input-group").querySelector("input") : null);
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

function formatMediaTime(secs) {
  if (isNaN(secs) || secs < 0) return "0:00";
  var m = Math.floor(secs / 60);
  var s = Math.floor(secs % 60);
  return m + ":" + (s < 10 ? "0" : "") + s;
}

function formatTransferDuration(seconds) {
  var value = Math.max(0, Math.ceil(Number(seconds) || 0));
  if (value < 60) return value + "s";
  var minutes = Math.floor(value / 60);
  var remainingSeconds = value % 60;
  if (minutes < 60) return minutes + "m " + remainingSeconds + "s";
  var hours = Math.floor(minutes / 60);
  return hours + "h " + (minutes % 60) + "m";
}
