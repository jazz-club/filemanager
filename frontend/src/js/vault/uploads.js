var uploadQueue = [];
var activeUploadsCount = 0;
var MAX_CONCURRENT_UPLOADS = 3;
var uploadUniqueId = 0;

startUploadBtn.onclick = function () {
  if (!fileInput.files || fileInput.files.length === 0) {
    showMsg("Please select one or more files to upload.", "error");
    return;
  }
  enqueueFiles(Array.from(fileInput.files), currentFolderId);
  fileInput.value = "";
};

function openUploadTray() {
  if (!uploadTray.classList.contains("d-none") && !uploadTray.classList.contains("tray-closing"))
    return;

  var toggleBtn = document.getElementById("notification-tray-toggle-btn");
  if (toggleBtn) {
    toggleBtn.classList.remove("btn-morph-in");
    toggleBtn.classList.add("btn-morph-out");
    setTimeout(function () {
      if (!uploadTray.classList.contains("d-none")) {
        toggleBtn.classList.add("d-none");
      }
      toggleBtn.classList.remove("btn-morph-out");
    }, 180);
  }

  uploadTray.classList.remove("tray-closing");
  uploadTray.classList.remove("d-none");
  uploadTray.classList.add("tray-opening");
  setTimeout(function () {
    uploadTray.classList.remove("tray-opening");
  }, 260);

  var dot = document.getElementById("notification-unread-dot");
  if (dot) dot.classList.add("d-none");
}

function closeUploadTrayWithAnimation() {
  if (uploadTray.classList.contains("d-none") || uploadTray.classList.contains("tray-closing"))
    return;

  var mascots = [":3", "<3", "xD"];
  var chosenMascot = mascots[Math.floor(Math.random() * mascots.length)];
  var byeMascot = document.createElement("div");
  byeMascot.className = "tray-mascot-bye";
  byeMascot.textContent = chosenMascot;
  document.body.appendChild(byeMascot);
  setTimeout(function () {
    if (byeMascot.parentNode) byeMascot.parentNode.removeChild(byeMascot);
  }, 480);

  var toggleBtn = document.getElementById("notification-tray-toggle-btn");
  if (toggleBtn) {
    toggleBtn.classList.remove("btn-morph-out");
    toggleBtn.classList.remove("d-none");
    toggleBtn.classList.add("btn-morph-in");
    setTimeout(function () {
      toggleBtn.classList.remove("btn-morph-in");
    }, 260);
  }

  uploadTray.classList.remove("tray-opening");
  uploadTray.classList.add("tray-closing");
  setTimeout(function () {
    uploadTray.classList.remove("tray-closing");
    uploadTray.classList.add("d-none");
  }, 220);
}

if (closeUploadTrayBtn) {
  closeUploadTrayBtn.onclick = function () {
    closeUploadTrayWithAnimation();
  };
}

if (clearActivityBtn) {
  clearActivityBtn.onclick = function () {
    var msgBox = document.getElementById("notification-tray-messages");
    if (msgBox) {
      msgBox.innerHTML = "";
      msgBox.classList.add("d-none");
    }
    var itemsBox = document.getElementById("upload-tray-items");
    if (itemsBox) {
      var completedRows = itemsBox.querySelectorAll(".upload-item-finished, .upload-item-error");
      completedRows.forEach(function (r) {
        if (r.parentNode) r.parentNode.removeChild(r);
      });
      if (activeUploadsCount === 0) {
        itemsBox.innerHTML = "";
        uploadQueue = [];
      }
    }
    var dot = document.getElementById("notification-unread-dot");
    if (dot) dot.classList.add("d-none");
    updateTrayHeader();
    updateTrayEmptyState();
  };
}

var notifToggleBtn = document.getElementById("notification-tray-toggle-btn");
if (notifToggleBtn) {
  notifToggleBtn.onclick = function () {
    var isHidden =
      uploadTray.classList.contains("d-none") || uploadTray.classList.contains("tray-closing");
    if (isHidden) {
      openUploadTray();
    } else {
      closeUploadTrayWithAnimation();
    }
  };
}

function enqueueFiles(files, targetFolderId) {
  if (!files || files.length === 0) return;
  openUploadTray();

  files.forEach(function (file) {
    var item = {
      id: ++uploadUniqueId,
      file: file,
      targetFolderId: targetFolderId,
      status: "queued",
      pct: 0,
      xhr: null,
    };
    uploadQueue.push(item);
    renderTrayItem(item);
  });

  updateTrayHeader();
  processUploadQueue();
}

function updateTrayHeader() {
  var remaining = uploadQueue.filter(function (i) {
    return i.status === "queued" || i.status === "uploading";
  }).length;
  if (!uploadTrayCount) {
    uploadTrayCount = document.getElementById("upload-tray-count");
  }
  if (uploadTrayCount) {
    uploadTrayCount.textContent = remaining;
    if (remaining > 0) {
      uploadTrayCount.classList.remove("d-none");
    } else {
      uploadTrayCount.classList.add("d-none");
    }
  }
}

function renderTrayItem(item) {
  if (!uploadTrayItems) uploadTrayItems = document.getElementById("upload-tray-items");
  if (!uploadTrayItems) return;
  var row = document.createElement("div");
  row.id = "upload-item-" + item.id;
  row.className = "upload-tray-item";
  var iconUrl = getFileIconUrl(item.file.type, item.file.name);
  row.innerHTML =
    '<div class="d-flex justify-content-between align-items-center mb-1 small">' +
    '<span class="fw-bold text-truncate d-flex align-items-center gap-1" style="max-width: 220px;" title="' +
    escapeHtml(item.file.name) +
    '">' +
    '<img src="' +
    iconUrl +
    '" width="16" height="16" style="image-rendering: pixelated; object-fit: contain; flex-shrink: 0;" alt="" />' +
    '<span class="text-truncate">' +
    escapeHtml(item.file.name) +
    "</span>" +
    "</span>" +
    '<span class="text-muted upload-item-status" style="font-size: 0.75rem;">Waiting...</span>' +
    "</div>" +
    '<div class="progress" style="height: 6px;">' +
    '<div class="progress-bar progress-bar-striped progress-bar-animated" role="progressbar" style="width: 0%"></div>' +
    "</div>";
  uploadTrayItems.prepend(row);
  updateTrayEmptyState();
}

function updateTrayEmptyState() {
  var placeholder = document.getElementById("tray-empty-placeholder");
  var msgBox = document.getElementById("notification-tray-messages");
  var itemsBox = document.getElementById("upload-tray-items");
  if (!placeholder) return;
  var hasMsgs = msgBox && msgBox.children.length > 0 && !msgBox.classList.contains("d-none");
  var hasUploads = itemsBox && itemsBox.children.length > 0;
  if (!hasMsgs && !hasUploads) {
    placeholder.classList.remove("d-none");
  } else {
    placeholder.classList.add("d-none");
  }
}

function processUploadQueue() {
  if (activeUploadsCount >= MAX_CONCURRENT_UPLOADS) return;
  var nextItem = uploadQueue.find(function (i) {
    return i.status === "queued";
  });
  if (!nextItem) return;

  activeUploadsCount++;
  nextItem.status = "uploading";
  nextItem.transferStartedAt = performance.now();
  updateTrayHeader();

  var itemRow = document.getElementById("upload-item-" + nextItem.id);
  var statusSpan = itemRow ? itemRow.querySelector(".upload-item-status") : null;
  var progressBar = itemRow ? itemRow.querySelector(".progress-bar") : null;
  if (statusSpan) statusSpan.textContent = "Uploading (0%)...";

  var fd = new FormData();
  fd.append("file", nextItem.file);
  if (nextItem.targetFolderId) {
    fd.append("folderId", nextItem.targetFolderId);
  }
  var uploadCsrfToken = getCsrfToken();
  if (uploadCsrfToken) {
    fd.append("csrfToken", uploadCsrfToken);
  }

  var xhr = new XMLHttpRequest();
  nextItem.xhr = xhr;
  xhr.open("POST", "/api/files", true);
  xhr.withCredentials = true;
  if (uploadCsrfToken) {
    xhr.setRequestHeader("X-CSRF-Token", uploadCsrfToken);
  }

  xhr.upload.onprogress = function (evt) {
    if (evt.lengthComputable) {
      var pct = Math.round((evt.loaded / evt.total) * 100);
      nextItem.pct = pct;
      if (progressBar) progressBar.style.width = pct + "%";
      if (statusSpan) {
        var status = pct + "% (" + formatBytes(evt.loaded) + ")";
        var elapsed = (performance.now() - nextItem.transferStartedAt) / 1000;
        if (evt.total >= 5 * 1024 * 1024 && elapsed >= 0.5 && evt.loaded > 0) {
          var speed = evt.loaded / elapsed;
          status += " · " + formatTransferDuration((evt.total - evt.loaded) / speed) + " left";
        }
        statusSpan.textContent = status;
      }
    }
  };

  xhr.onload = function () {
    activeUploadsCount--;
    if (xhr.status >= 200 && xhr.status < 300) {
      nextItem.status = "done";
      if (statusSpan) {
        statusSpan.textContent =
          "Done · " +
          formatTransferDuration((performance.now() - nextItem.transferStartedAt) / 1000);
        statusSpan.className = "text-success fw-bold";
      }
      if (progressBar) {
        progressBar.style.width = "100%";
        progressBar.classList.remove("progress-bar-animated");
      }
    } else {
      nextItem.status = "error";
      if (statusSpan) {
        statusSpan.textContent = "Failed";
        statusSpan.className = "text-danger fw-bold";
      }
    }
    updateTrayHeader();
    loadVault();
    updateStorageStats();
    processUploadQueue();
  };

  xhr.onerror = function () {
    activeUploadsCount--;
    nextItem.status = "error";
    if (statusSpan) {
      statusSpan.textContent = "Network error";
      statusSpan.className = "text-danger fw-bold";
    }
    updateTrayHeader();
    processUploadQueue();
  };

  xhr.send(fd);
  processUploadQueue();
}

var dragCounter = 0;

function isFileDrag(e) {
  var transfer = e.dataTransfer;
  if (!transfer) return false;
  var types = Array.from(transfer.types || []);
  return (
    types.includes("Files") ||
    Array.from(transfer.items || []).some(function (item) {
      return item.kind === "file";
    })
  );
}

window.addEventListener("dragenter", function (e) {
  if (!isFileDrag(e)) return;
  e.preventDefault();
  dragCounter++;
  dropOverlay.classList.remove("d-none");
});

window.addEventListener("dragleave", function (e) {
  if (!isFileDrag(e)) return;
  e.preventDefault();
  dragCounter--;
  if (dragCounter <= 0) {
    dragCounter = 0;
    dropOverlay.classList.add("d-none");
  }
});

window.addEventListener("dragover", function (e) {
  if (!isFileDrag(e)) return;
  e.preventDefault();
});

window.addEventListener("drop", function (e) {
  if (!isFileDrag(e)) return;
  e.preventDefault();
  dragCounter = 0;
  dropOverlay.classList.add("d-none");

  if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
    enqueueFiles(Array.from(e.dataTransfer.files), currentFolderId);
  }
});

window.addEventListener("resize", function () {
  updateBatchBar();
});

updateTrayEmptyState();
