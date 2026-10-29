var whoamiEl = document.getElementById("whoami");
var logoutBtn = document.getElementById("logout-btn");
var uploadForm = document.getElementById("upload-form");
var fileInput = document.getElementById("file-input");
var uploadBtn = document.getElementById("upload-btn");
var refreshBtn = document.getElementById("refresh-btn");
var fileCountEl = document.getElementById("file-count");
var filesAccordion = document.getElementById("filesAccordion");
var fileListEmpty = document.getElementById("file-list-empty");

var progressWrap = document.getElementById("upload-progress-wrap");
var progressBar = document.getElementById("upload-progress-bar");
var progressPct = document.getElementById("upload-progress-pct");
var progressLabel = document.getElementById("upload-progress-label");

var pendingDeleteId = null;
var pendingDeleteName = null;

/*
	opsec level getelementbyid
*/

api("/auth/me").then(function (r) {
  if (!r.ok) {
    window.location.href = "/login";
    return;
  }
  r.json().then(function (d) {
    whoamiEl.textContent = d.user;
    loadFiles();
  });
});

logoutBtn.onclick = function () {
  api("/auth/logout", { method: "POST" }).then(function () {
    window.location.href = "/login";
  });
};

refreshBtn.onclick = loadFiles;

uploadForm.onsubmit = function (e) {
  e.preventDefault();
  var file = fileInput.files[0];
  if (!file) {
    showMsg("Please select a file to upload.", "error");
    return;
  }

  var fd = new FormData();
  fd.append("file", file);

  /* 
	this fuckass font doesnt render ... properly and theres probably 5 other places in this codebase with
	user facing strings that i missed fml
	*/
  progressWrap.classList.remove("d-none");
  setProgress(0, "mmm yummy file...");
  if (uploadBtn) {
    uploadBtn.disabled = true;
    uploadBtn.textContent = "Uploading . . .";
  }

  var xhr = new XMLHttpRequest();
  xhr.open("POST", "/api/files", true);
  xhr.withCredentials = true;

  xhr.upload.onprogress = function (evt) {
    if (evt.lengthComputable) {
      var pct = Math.round((evt.loaded / evt.total) * 100);
      if (pct >= 100) {
        setProgress(100, "Eating file . . .");
      } else {
        setProgress(
          pct,
          "Uploading . . . " + formatBytes(evt.loaded) + " / " + formatBytes(evt.total)
        );
      }
    }
  };

  xhr.onload = function () {
    if (uploadBtn) {
      uploadBtn.disabled = false;
      uploadBtn.textContent = "Feed File To Server";
    }

    var data;
    try {
      data = JSON.parse(xhr.responseText);
    } catch (ex) {
      data = {};
    }

    if (xhr.status >= 200 && xhr.status < 300) {
      setProgress(100, "Upload Complete!");
      showMsg("Uploaded '" + (data.original_name || file.name) + "' successfully.", "success");
      uploadForm.reset();
      loadFiles();
      setTimeout(function () {
        progressWrap.classList.add("d-none");
      }, 2000);
    } else {
      setProgress(0, "Upload Failed");
      var errorMsg =
        data.error ||
        (xhr.status === 413 ? "File too large" : "Upload failed (" + xhr.status + ")");
      showMsg(errorMsg, "error");
      setTimeout(function () {
        progressWrap.classList.add("d-none");
      }, 4000);
    }
  };
  /*
 file limits need to implement partioning to prevent people from just wanting to do the discord file uploader thing here
 */
  xhr.onerror = function () {
    if (uploadBtn) {
      uploadBtn.disabled = false;
      uploadBtn.textContent = "Feed File To Server";
    }
    setProgress(0, "Network Error");
    showMsg("Upload error: network failure", "error");
    setTimeout(function () {
      progressWrap.classList.add("d-none");
    }, 3000);
  };

  xhr.send(fd);
};

function setProgress(pct, label) {
  if (progressBar) {
    progressBar.style.width = pct + "%";
    progressBar.setAttribute("aria-valuenow", pct);
  }
  if (progressPct) progressPct.textContent = pct + "%";
  if (progressLabel) progressLabel.textContent = label || "";
}

function loadFiles() {
  api("/files")
    .then(function (r) {
      return r.json();
    })
    .then(function (files) {
      var items = filesAccordion.querySelectorAll(".accordion-item");
      for (var j = 0; j < items.length; j++) {
        items[j].remove();
      }

      var count = files ? files.length : 0;
      if (fileCountEl) fileCountEl.textContent = count;

      if (!files || files.length === 0) {
        fileListEmpty.classList.remove("d-none");
        return;
      }

      fileListEmpty.classList.add("d-none");

      for (var i = 0; i < files.length; i++) {
        var f = files[i];
        var itemId = "file-" + f.id;
        var collapseId = "collapse-" + f.id;
        var size = formatBytes(f.size_bytes);
        var dateStr = new Date(f.uploaded_at).toLocaleString();
        var escapedName = escapeHtml(f.original_name);
        var safeJsName = escapedName.replace(/'/g, "\\'");

        var item = document.createElement("div");
        item.className = "accordion-item";
        item.id = itemId;

        // man i really wish there was a better way to do this
        item.innerHTML =
          '<div class="file-item-header">' +
          '<div class="file-item-info">' +
          '<span class="file-item-name" title="' +
          escapedName +
          '">' +
          escapedName +
          "</span>" +
          '<span class="badge badge-copy text-nowrap" title="Click to copy size" onclick="copyMetaValue(this, \'' +
          size +
          "')\">" +
          size +
          "</span>" +
          "</div>" +
          '<div class="file-item-actions">' +
          '<a href="/api/files/' +
          f.id +
          '" class="btn btn-sm btn-primary">Download</a>' +
          '<button type="button" class="btn btn-sm btn-secondary metadata-toggle collapsed" data-bs-toggle="collapse" data-bs-target="#' +
          collapseId +
          '" aria-expanded="false" aria-controls="' +
          collapseId +
          '">' +
          'Metadata<span class="metadata-arrow">▲</span>' +
          "</button>" +
          '<button type="button" class="btn btn-sm btn-danger" onclick="confirmDelete(' +
          f.id +
          ", '" +
          safeJsName +
          "')\">Delete</button>" +
          "</div>" +
          "</div>" +
          '<div id="' +
          collapseId +
          '" class="accordion-collapse collapse" data-bs-parent="#filesAccordion">' +
          '<div class="accordion-body">' +
          '<div class="row g-2 small" id="meta-' +
          f.id +
          '">' +
          '<div class="col-sm-3 text-muted fw-semibold">File Size:</div>' +
          '<div class="col-sm-9"><span class="badge badge-copy font-monospace" title="Click to copy size" onclick="copyMetaValue(this, \'' +
          size +
          " (" +
          f.size_bytes +
          " bytes)')\">" +
          size +
          " (" +
          f.size_bytes +
          " bytes)</span></div>" +
          '<div class="col-sm-3 text-muted fw-semibold">Upload Date:</div>' +
          '<div class="col-sm-9"><span class="badge badge-copy font-monospace" title="Click to copy upload date" onclick="copyMetaValue(this, \'' +
          dateStr +
          "')\">" +
          dateStr +
          "</span></div>" +
          '<div class="col-sm-3 text-muted fw-semibold">MIME Type:</div>' +
          '<div class="col-sm-9"><span class="badge badge-copy" title="Click to copy" onclick="copyMetaValue(this, \'' +
          escapeHtml(f.mime_type || "-") +
          "')\">" +
          escapeHtml(f.mime_type || "-") +
          "</span></div>" +
          '<div class="col-sm-3 text-muted fw-semibold">SHA-256:</div>' +
          '<div class="col-sm-9"><span class="badge badge-copy font-monospace" title="Click to copy" onclick="copyMetaValue(this, \'' +
          escapeHtml(f.sha256 || "N/A") +
          "')\">" +
          escapeHtml(f.sha256 || "N/A") +
          "</span></div>" +
          '<div class="col-sm-3 text-muted fw-semibold">Storage Key:</div>' +
          '<div class="col-sm-9"><span class="badge badge-copy font-monospace">Loading...</span></div>' +
          '<div class="col-sm-3 text-muted fw-semibold">Nonce (IV):</div>' +
          '<div class="col-sm-9"><span class="badge badge-copy font-monospace">Loading...</span></div>' +
          "</div>" +
          "</div>" +
          "</div>";

        filesAccordion.appendChild(item);

        (function (fileId, colId, itemEl) {
          var colEl = document.getElementById(colId);
          if (colEl) {
            colEl.addEventListener("show.bs.collapse", function handler() {
              loadMetadataInto(fileId);
              var btn = itemEl.querySelector(".metadata-toggle");
              if (btn) {
                btn.classList.remove("collapsed");
                btn.setAttribute("aria-expanded", "true");
              }
              colEl.removeEventListener("show.bs.collapse", handler);
            });
            colEl.addEventListener("show.bs.collapse", function () {
              var btn = itemEl.querySelector(".metadata-toggle");
              if (btn) {
                btn.classList.remove("collapsed");
                btn.setAttribute("aria-expanded", "true");
              }
            });
            colEl.addEventListener("hide.bs.collapse", function () {
              var btn = itemEl.querySelector(".metadata-toggle");
              if (btn) {
                btn.classList.add("collapsed");
                btn.setAttribute("aria-expanded", "false");
              }
            });
          }
        })(f.id, collapseId, item);
      }
    })
    .catch(function (err) {
      showMsg("Failed to list files: " + err.message, "error");
    });
}

function loadMetadataInto(id) {
  api("/files/" + id + "/metadata")
    .then(function (r) {
      return r.json();
    })
    .then(function (data) {
      var container = document.getElementById("meta-" + id);
      if (!container) return;

      var mime = escapeHtml(data.mime_type || "application/octet-stream");
      var sha = escapeHtml(data.sha256 || "N/A");
      var storageKey = escapeHtml(data.storage_key || "-");
      var nonce = escapeHtml(data.nonce || "-");
      var size = formatBytes(data.size_bytes);
      var sizeText = size + " (" + data.size_bytes + " bytes)";
      var dateStr = new Date(data.uploaded_at).toLocaleString();
      var isoDate = new Date(data.uploaded_at).toISOString();
      // maaaaaaan i really wish there was a better way to do this
      container.innerHTML =
        '<div class="col-sm-3 text-muted fw-semibold">File Size:</div>' +
        '<div class="col-sm-9"><span class="badge badge-copy font-monospace" title="Click to copy size" onclick="copyMetaValue(this, \'' +
        sizeText +
        "')\">" +
        sizeText +
        "</span></div>" +
        '<div class="col-sm-3 text-muted fw-semibold">Upload Date:</div>' +
        '<div class="col-sm-9"><span class="badge badge-copy font-monospace" title="Click to copy local time (' +
        isoDate +
        ")" +
        '" onclick="copyMetaValue(this, \'' +
        dateStr +
        "')\">" +
        dateStr +
        "</span></div>" +
        '<div class="col-sm-3 text-muted fw-semibold">MIME Type:</div>' +
        '<div class="col-sm-9"><span class="badge badge-copy" title="Click to copy" onclick="copyMetaValue(this, \'' +
        mime +
        "')\">" +
        mime +
        "</span></div>" +
        '<div class="col-sm-3 text-muted fw-semibold">SHA-256:</div>' +
        '<div class="col-sm-9"><span class="badge badge-copy font-monospace" title="Click to copy" onclick="copyMetaValue(this, \'' +
        sha +
        "')\">" +
        sha +
        "</span></div>" +
        '<div class="col-sm-3 text-muted fw-semibold">Storage Key:</div>' +
        '<div class="col-sm-9"><span class="badge badge-copy font-monospace" title="Click to copy" onclick="copyMetaValue(this, \'' +
        storageKey +
        "')\">" +
        storageKey +
        "</span></div>" +
        '<div class="col-sm-3 text-muted fw-semibold">Nonce (IV):</div>' +
        '<div class="col-sm-9"><span class="badge badge-copy font-monospace" title="Click to copy" onclick="copyMetaValue(this, \'' +
        nonce +
        "')\">" +
        nonce +
        "</span></div>";
    })
    .catch(function (err) {
      showMsg("Failed to load metadata: " + err.message, "error");
    });
}

function copyMetaValue(badgeEl, text) {
  if (!text || text === "-" || text === "N/A" || text === "Loading...") return;

  function onSuccess() {
    var origText = badgeEl.getAttribute("data-original-text") || badgeEl.textContent;
    if (!badgeEl.getAttribute("data-original-text")) {
      badgeEl.setAttribute("data-original-text", origText);
    }
    badgeEl.textContent = "✓ Copied!";
    badgeEl.classList.add("badge-copied");

    setTimeout(function () {
      badgeEl.textContent = origText;
      badgeEl.classList.remove("badge-copied");
    }, 1500);
  }

  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard
      .writeText(text)
      .then(onSuccess)
      .catch(function () {
        fallbackCopy(text, onSuccess);
      });
  } else {
    fallbackCopy(text, onSuccess);
  }
}

function fallbackCopy(text, cb) {
  var ta = document.createElement("textarea");
  ta.value = text;
  ta.style.position = "fixed";
  ta.style.opacity = "0";
  document.body.appendChild(ta);
  ta.select();
  try {
    document.execCommand("copy");
    if (cb) cb();
  } catch (err) {
    showMsg("Failed to copy", "error");
  }
  document.body.removeChild(ta);
}

function confirmDelete(id, name) {
  pendingDeleteId = id;
  pendingDeleteName = name;

  var nameEl = document.getElementById("delete-file-name");
  if (nameEl) nameEl.textContent = name;

  var modalEl = document.getElementById("deleteModal");
  if (modalEl && window.bootstrap && window.bootstrap.Modal) {
    var modal = bootstrap.Modal.getOrCreateInstance(modalEl);
    modal.show();
  }
}

var confirmBtn = document.getElementById("confirm-delete-btn");
if (confirmBtn) {
  confirmBtn.onclick = function () {
    if (!pendingDeleteId) return;

    var deleteId = pendingDeleteId;
    pendingDeleteId = null;
    pendingDeleteName = null;

    var modalEl = document.getElementById("deleteModal");
    if (modalEl && window.bootstrap && window.bootstrap.Modal) {
      bootstrap.Modal.getInstance(modalEl).hide();
    }

    api("/files/" + deleteId, { method: "DELETE" })
      .then(function (r) {
        return r.json();
      })
      .then(function (d) {
        loadFiles();
        var abyssEl = document.getElementById("abyssModal");
        if (abyssEl && window.bootstrap && window.bootstrap.Modal) {
          var abyssModal = bootstrap.Modal.getOrCreateInstance(abyssEl);
          abyssModal.show();
        }
      })
      .catch(function (err) {
        showMsg("Delete failed: " + err.message, "error");
      });
  };
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// 500 cigarettes
