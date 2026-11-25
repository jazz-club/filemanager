var uploadQueue = [];
var activeUploadsCount = 0;
var MAX_CONCURRENT_UPLOADS = 3;
var uploadUniqueId = 0;
var trayAuditDismissedAt = 0;
try {
  trayAuditDismissedAt = Number(localStorage.getItem("pinkbox-tray-audit-dismissed-at") || 0);
} catch (e) {}

startUploadBtn.onclick = function () {
  if (!fileInput.files || fileInput.files.length === 0) {
    showMsg("Please select one or more files to upload.", "error");
    return;
  }
  enqueueFiles(Array.from(fileInput.files), currentFolderId);
  fileInput.value = "";
};

function openUploadTray() {
  loadTrayAuditLogs();

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
  document.body.classList.add("has-activity-tray");
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
    document.body.classList.remove("has-activity-tray");
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
    var activeList = document.getElementById("upload-tray-active-list");
    var auditList = document.getElementById("upload-tray-audit-list");
    var auditSection = document.getElementById("upload-tray-audit-section");
    trayAuditDismissedAt = Date.now();
    try {
      localStorage.setItem("pinkbox-tray-audit-dismissed-at", String(trayAuditDismissedAt));
    } catch (e) {}
    if (auditList) auditList.innerHTML = "";
    if (auditSection) auditSection.classList.add("d-none");
    var itemsBox = document.getElementById("upload-tray-items");
    var targetList = activeList || itemsBox;
    if (targetList) {
      var completedRows = targetList.querySelectorAll(".upload-item-finished, .upload-item-error");
      completedRows.forEach(function (r) {
        if (r.parentNode) r.parentNode.removeChild(r);
      });
      if (activeUploadsCount === 0) {
        targetList.innerHTML = "";
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

function enqueueSingleFile(file, targetFolderId, displayName) {
  openUploadTray();
  var item = {
    id: ++uploadUniqueId,
    file: file,
    displayName: displayName || file.name,
    targetFolderId: targetFolderId,
    status: "queued",
    pct: 0,
    xhr: null,
  };
  uploadQueue.push(item);
  renderTrayItem(item);
  updateTrayHeader();
  processUploadQueue();
}

function enqueueFiles(files, targetFolderId) {
  if (!files || files.length === 0) return;
  openUploadTray();

  files.forEach(function (file) {
    if (file.webkitRelativePath && file.webkitRelativePath.includes("/")) {
      var parts = file.webkitRelativePath.split("/");
      parts.pop();
      ensureFolderPath(parts, targetFolderId).then(function (finalFolderId) {
        enqueueSingleFile(file, finalFolderId, file.webkitRelativePath);
      });
    } else {
      enqueueSingleFile(file, targetFolderId, file.name);
    }
  });
}

function ensureFolderPath(segments, parentFolderId) {
  if (!segments || segments.length === 0) return Promise.resolve(parentFolderId);
  var currentParent = parentFolderId;
  return segments.reduce(function (chain, segment) {
    return chain.then(function (parentId) {
      return api("/folders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: segment, parentId: parentId }),
      })
        .then(function (r) {
          return r.json();
        })
        .then(function (data) {
          return data.id;
        });
    });
  }, Promise.resolve(currentParent));
}

function readAllDirectoryEntries(dirEntry) {
  return new Promise(function (resolve) {
    var dirReader = dirEntry.createReader();
    var allEntries = [];

    function readBatch() {
      dirReader.readEntries(
        function (entries) {
          if (!entries || entries.length === 0) {
            resolve(allEntries);
          } else {
            allEntries = allEntries.concat(Array.prototype.slice.call(entries));
            readBatch();
          }
        },
        function (err) {
          console.error("Error reading directory entries:", err);
          resolve(allEntries);
        }
      );
    }

    readBatch();
  });
}

function processDroppedDirectory(dirEntry, parentFolderId, displayPath) {
  var folderItem = {
    id: ++uploadUniqueId,
    name: dirEntry.name,
    displayName: displayPath,
    isFolder: true,
    status: "creating",
    pct: 0,
  };
  uploadQueue.push(folderItem);
  renderTrayItem(folderItem);
  updateTrayHeader();

  api("/folders", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: dirEntry.name, parentId: parentFolderId }),
  })
    .then(function (r) {
      return r.json();
    })
    .then(function (folder) {
      if (folder.error) {
        throw new Error(folder.error);
      }
      folderItem.status = "done";
      var itemRow = document.getElementById("upload-item-" + folderItem.id);
      if (itemRow) {
        itemRow.classList.add("upload-item-finished");
        var statusSpan = itemRow.querySelector(".upload-item-status");
        var progressBar = itemRow.querySelector(".progress-bar");
        if (statusSpan) {
          statusSpan.textContent = "Folder ready";
          statusSpan.className = "text-success fw-bold";
        }
        if (progressBar) {
          progressBar.style.width = "100%";
          progressBar.classList.remove("progress-bar-animated");
        }
      }
      updateTrayHeader();
      loadVault();
      if (typeof loadTrayAuditLogs === "function") loadTrayAuditLogs();

      return readAllDirectoryEntries(dirEntry).then(function (children) {
        if (!children || children.length === 0) return;
        children.forEach(function (child) {
          if (child.isFile) {
            child.file(
              function (file) {
                var childPath = displayPath + "/" + child.name;
                enqueueSingleFile(file, folder.id, childPath);
              },
              function (err) {
                console.error("Failed to read file in directory:", child.name, err);
              }
            );
          } else if (child.isDirectory) {
            processDroppedDirectory(child, folder.id, displayPath + "/" + child.name);
          }
        });
      });
    })
    .catch(function (err) {
      folderItem.status = "error";
      var itemRow = document.getElementById("upload-item-" + folderItem.id);
      if (itemRow) {
        itemRow.classList.add("upload-item-error");
        var statusSpan = itemRow.querySelector(".upload-item-status");
        var progressBar = itemRow.querySelector(".progress-bar");
        if (statusSpan) {
          statusSpan.textContent = "Failed";
          statusSpan.className = "text-danger fw-bold";
        }
        if (progressBar) {
          progressBar.style.width = "100%";
          progressBar.classList.add("bg-danger");
          progressBar.classList.remove("progress-bar-animated");
        }
      }
      updateTrayHeader();
      showMsg("Failed to create folder '" + dirEntry.name + "': " + (err.message || err), "error");
    });
}

function enqueueFileSystemEntries(entries, targetFolderId) {
  if (!entries || entries.length === 0) return;
  openUploadTray();

  entries.forEach(function (entry) {
    if (entry.isFile) {
      entry.file(
        function (file) {
          enqueueSingleFile(file, targetFolderId, file.name);
        },
        function (err) {
          console.error("Failed to read file entry:", entry.name, err);
          showMsg("Failed to read file: " + entry.name, "error");
        }
      );
    } else if (entry.isDirectory) {
      processDroppedDirectory(entry, targetFolderId, entry.name);
    }
  });
}

function handleDropDataTransfer(dataTransfer, targetFolderId) {
  if (!dataTransfer) return;

  var items = dataTransfer.items;
  var entries = [];
  var hasDirectoryEntry = false;

  if (items && items.length > 0) {
    for (var i = 0; i < items.length; i++) {
      var it = items[i];
      if (it.webkitGetAsEntry) {
        var entry = null;
        try {
          entry = it.webkitGetAsEntry();
        } catch (e) {}
        if (entry) {
          entries.push(entry);
          if (entry.isDirectory) hasDirectoryEntry = true;
        }
      }
    }
  }

  var files = Array.from(dataTransfer.files || []);
  if (hasDirectoryEntry && entries.length > 0) {
    enqueueFileSystemEntries(entries, targetFolderId);
    return;
  }
  if (files.length > 0) {
    enqueueFiles(files, targetFolderId);
    return;
  }
  if (entries.length > 0) {
    enqueueFileSystemEntries(entries, targetFolderId);
    return;
  }

  showMsg("Couldn't read the dropped files. Try the file picker instead.", "error");
}

function updateTrayHeader() {
  var remaining = uploadQueue.filter(function (i) {
    return i.status === "queued" || i.status === "uploading" || i.status === "creating";
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

function revealNewUploadInVault() {
  if (searchInput) {
    searchInput.value = "";
    if (typeof searchDebounceTimer !== "undefined") clearTimeout(searchDebounceTimer);
  }

  currentFilterVal = "all";
  if (typeFilter) typeFilter.value = "all";
  document.querySelectorAll(".filter-opt").forEach(function (option) {
    var isAll = option.getAttribute("data-filter") === "all";
    option.classList.toggle("active", isAll);
    option.classList.toggle("fw-bold", isAll);
  });
  if (filterDropdownBtn) filterDropdownBtn.textContent = "Filter: All";

  currentSortVal = "date-desc";
  if (sortSelect) sortSelect.value = "date-desc";
  document.querySelectorAll(".sort-opt").forEach(function (option) {
    var isNewest = option.getAttribute("data-sort") === "date-desc";
    option.classList.toggle("active", isNewest);
    option.classList.toggle("fw-bold", isNewest);
  });
  if (sortDropdownBtn) sortDropdownBtn.textContent = "Sort: Newest";
  if (typeof vaultCurrentPage !== "undefined") vaultCurrentPage = 1;
}

function renderTrayItem(item) {
  var activeList = document.getElementById("upload-tray-active-list");
  if (!uploadTrayItems) uploadTrayItems = document.getElementById("upload-tray-items");
  var target = activeList || uploadTrayItems;
  if (!target) return;
  var row = document.createElement("div");
  row.id = "upload-item-" + item.id;
  row.className = "upload-tray-item";
  var iconUrl = item.isFolder
    ? "/src/assets/icons/file-folder.png"
    : getFileIconUrl(
        item.file ? item.file.type : "",
        item.file ? item.file.name : item.name || "",
        false
      );
  var displayName = item.displayName || (item.file ? item.file.name : item.name || "Item");
  var initialStatus = item.isFolder ? "Creating folder..." : "Waiting...";
  row.innerHTML =
    '<div class="upload-tray-item-header d-flex justify-content-between align-items-center mb-1 small">' +
    '<span class="upload-item-name fw-bold text-truncate d-flex align-items-center gap-1" style="max-width: 220px;" title="' +
    escapeHtml(displayName) +
    '">' +
    '<img src="' +
    iconUrl +
    '" width="16" height="16" style="image-rendering: pixelated; object-fit: contain; flex-shrink: 0;" onerror="this.src=\'/src/assets/icons/file-fallback.png\'" alt="" />' +
    '<span class="text-truncate">' +
    escapeHtml(displayName) +
    "</span>" +
    "</span>" +
    '<span class="text-muted upload-item-status" style="font-size: 0.75rem;">' +
    escapeHtml(initialStatus) +
    "</span>" +
    "</div>" +
    '<div class="progress" style="height: 6px;">' +
    '<div class="progress-bar progress-bar-striped progress-bar-animated" role="progressbar" style="width: ' +
    (item.isFolder ? "60%" : "0%") +
    '"></div>' +
    "</div>";
  if (!item.isFolder) {
    var cancelBtn = document.createElement("button");
    cancelBtn.type = "button";
    cancelBtn.className = "btn btn-sm btn-outline-danger upload-cancel-btn py-0 px-1";
    cancelBtn.textContent = "×";
    cancelBtn.title = "Cancel transfer";
    cancelBtn.setAttribute("aria-label", "Cancel transfer");
    cancelBtn.onclick = function () {
      showConfirm(
        "Cancel this transfer?",
        function () {
          if (item.status === "queued") {
            item.status = "cancelled";
            cancelBtn.classList.add("d-none");
            var status = row.querySelector(".upload-item-status");
            if (status) status.textContent = "Cancelled";
            row.classList.add("upload-item-error");
            updateTrayHeader();
            processUploadQueue();
          } else if (item.status === "uploading" && item.xhr) {
            item.status = "cancelled";
            cancelBtn.classList.add("d-none");
            item.xhr.abort();
          }
        },
        { title: "Cancel transfer", okLabel: "Cancel transfer", danger: true }
      );
    };
    var headerRow = row.querySelector(".upload-tray-item-header");
    if (headerRow) headerRow.appendChild(cancelBtn);
    else row.appendChild(cancelBtn);
  }
  target.prepend(row);
  updateTrayEmptyState();
}

function updateTrayEmptyState() {
  var placeholder = document.getElementById("tray-empty-placeholder");
  var msgBox = document.getElementById("notification-tray-messages");
  var activeList = document.getElementById("upload-tray-active-list");
  var auditList = document.getElementById("upload-tray-audit-list");
  var itemsBox = document.getElementById("upload-tray-items");
  if (!placeholder) return;
  var hasMsgs = msgBox && msgBox.children.length > 0 && !msgBox.classList.contains("d-none");
  var hasActive = activeList && activeList.children.length > 0;
  var hasAudit = auditList && auditList.children.length > 0;
  var hasItems =
    itemsBox && itemsBox.querySelectorAll(".upload-tray-item, .audit-tray-entry").length > 0;
  if (!hasMsgs && !hasActive && !hasAudit && !hasItems) {
    placeholder.classList.remove("d-none");
  } else {
    placeholder.classList.add("d-none");
  }
}

function processUploadQueue() {
  if (activeUploadsCount >= MAX_CONCURRENT_UPLOADS) return;
  var nextItem = uploadQueue.find(function (i) {
    return i.status === "queued" && !i.isFolder;
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
    var cancelButton = itemRow ? itemRow.querySelector("button") : null;
    if (cancelButton) cancelButton.classList.add("d-none");
    var uploadedFileId = null;
    if (xhr.status >= 200 && xhr.status < 300) {
      nextItem.status = "done";
      try {
        uploadedFileId = JSON.parse(xhr.responseText).id || null;
      } catch (e) {}
      if (itemRow) itemRow.classList.add("upload-item-finished");
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
      revealNewUploadInVault();
      loadVault(uploadedFileId ? { revealFileIds: [uploadedFileId] } : undefined);
      updateStorageStats();
      if (typeof loadTrayAuditLogs === "function") loadTrayAuditLogs();
    } else {
      nextItem.status = "error";
      if (itemRow) itemRow.classList.add("upload-item-error");
      if (statusSpan) {
        statusSpan.textContent = "Failed";
        statusSpan.className = "text-danger fw-bold";
      }
    }
    updateTrayHeader();
    processUploadQueue();
  };

  xhr.onerror = function () {
    activeUploadsCount--;
    nextItem.status = "error";
    var cancelButton = itemRow ? itemRow.querySelector("button") : null;
    if (cancelButton) cancelButton.classList.add("d-none");
    if (itemRow) itemRow.classList.add("upload-item-error");
    if (statusSpan) {
      statusSpan.textContent = "Network error";
      statusSpan.className = "text-danger fw-bold";
    }
    updateTrayHeader();
    if (typeof loadTrayAuditLogs === "function") loadTrayAuditLogs();
    processUploadQueue();
  };

  xhr.onabort = function () {
    if (nextItem.status !== "cancelled") return;
    activeUploadsCount = Math.max(0, activeUploadsCount - 1);
    var cancelButton = itemRow ? itemRow.querySelector("button") : null;
    if (cancelButton) cancelButton.classList.add("d-none");
    if (itemRow) itemRow.classList.add("upload-item-error");
    if (statusSpan) {
      statusSpan.textContent = "Cancelled";
      statusSpan.className = "text-muted fw-bold";
    }
    updateTrayHeader();
    processUploadQueue();
  };

  xhr.send(fd);
  processUploadQueue();
}

var dragCounter = 0;
document.addEventListener(
  "drop",
  function () {
    dragCounter = 0;
    if (dropOverlay) dropOverlay.classList.add("d-none");
  },
  true
);

function isFileDrag(e) {
  var transfer = e.dataTransfer;
  if (!transfer) return false;
  var types = Array.from(transfer.types || []);
  return (
    types.includes("Files") ||
    !!(transfer.files && transfer.files.length > 0) ||
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

  handleDropDataTransfer(e.dataTransfer, currentFolderId);
});

window.addEventListener("resize", function () {
  updateBatchBar();
});

function getTrayEventIcon(event, itemType) {
  var ev = (event || "").toUpperCase();
  if (ev.indexOf("UPLOAD") !== -1) {
    return '<img src="/src/assets/icons/lib/SVG/regular/plus.svg" width="14" height="14" alt="Upload" style="object-fit: contain;" />';
  }
  if (ev.indexOf("DOWNLOAD") !== -1) {
    return '<img src="/src/assets/icons/lib/SVG/regular/download.svg" width="14" height="14" alt="Download" style="object-fit: contain;" />';
  }
  if (ev.indexOf("PREVIEW") !== -1 || ev.indexOf("VIEW") !== -1) {
    return '<img src="/src/assets/icons/lib/SVG/regular/eye.svg" width="14" height="14" alt="Preview" style="object-fit: contain;" />';
  }
  if (ev.indexOf("DELETE") !== -1) {
    return '<img src="/src/assets/icons/lib/SVG/regular/trash.svg" width="14" height="14" alt="Delete" style="object-fit: contain;" />';
  }
  if (ev.indexOf("SHARE") !== -1) {
    return '<img src="/src/assets/icons/lib/SVG/regular/globe.svg" width="14" height="14" alt="Share" style="object-fit: contain;" />';
  }
  if (ev.indexOf("FOLDER") !== -1 || itemType === "folder") {
    return '<img src="/src/assets/icons/file-folder.png" width="14" height="14" alt="Folder" style="object-fit: contain;" />';
  }
  if (ev.indexOf("AUTH") !== -1 || ev.indexOf("LOGIN") !== -1 || ev.indexOf("PASSWORD") !== -1) {
    return '<img src="/src/assets/icons/lib/SVG/regular/lock.svg" width="14" height="14" alt="Auth" style="object-fit: contain;" />';
  }
  return '<img src="/src/assets/icons/file-fallback.png" width="14" height="14" alt="" style="object-fit: contain;" />';
}

function formatTrayRelativeTime(isoStr) {
  if (!isoStr) return "";
  var date = new Date(isoStr);
  var now = new Date();
  var diffSec = Math.floor((now - date) / 1000);
  if (diffSec < 10) return "just now";
  if (diffSec < 60) return diffSec + "s ago";
  var diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return diffMin + "m ago";
  var diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return diffHr + "h ago";
  var diffDays = Math.floor(diffHr / 24);
  if (diffDays < 7) return diffDays + "d ago";
  return date.toLocaleDateString();
}

function renderTrayAuditLogs(logs) {
  var auditList = document.getElementById("upload-tray-audit-list");
  var auditSection = document.getElementById("upload-tray-audit-section");
  if (!auditList || !auditSection) return;

  logs = (logs || []).filter(function (log) {
    return new Date(log.createdAt).getTime() > trayAuditDismissedAt;
  });
  if (logs.length === 0) {
    auditList.innerHTML = "";
    auditSection.classList.add("d-none");
    updateTrayEmptyState();
    return;
  }

  auditSection.classList.remove("d-none");
  auditList.innerHTML = "";

  logs.forEach(function (log) {
    var item = document.createElement("div");
    item.className = "audit-tray-entry border rounded mb-2 bg-white shadow-sm";
    item.style.fontSize = "0.78rem";

    var iconHtml = getTrayEventIcon(log.event, log.itemType);
    var relTime = formatTrayRelativeTime(log.createdAt);
    var fullTime = log.createdAt ? new Date(log.createdAt).toLocaleString() : "";
    var isSuccess = log.outcome === "SUCCESS";
    var isBlocked = log.outcome === "BLOCKED";
    var outcomeClass = isSuccess ? "bg-success" : isBlocked ? "bg-warning text-dark" : "bg-danger";
    var outcomeText = isSuccess ? "OK" : isBlocked ? "BLOCKED" : "ERR";

    var targetDisplay = log.itemName
      ? escapeHtml(log.itemName)
      : log.itemType
        ? escapeHtml(log.itemType)
        : "";

    var summaryTitle = escapeHtml(log.action || log.event || "Action");

    item.innerHTML =
      '<div class="d-flex align-items-center justify-content-between p-2">' +
      '<div class="d-flex align-items-center gap-2 min-w-0 flex-grow-1 pe-1">' +
      '<span class="flex-shrink-0">' +
      iconHtml +
      "</span>" +
      '<div class="min-w-0 flex-grow-1">' +
      '<div class="fw-bold text-truncate" title="' +
      summaryTitle +
      '">' +
      summaryTitle +
      "</div>" +
      (targetDisplay
        ? '<div class="text-muted text-truncate font-monospace" style="font-size: 0.70rem;">' +
          targetDisplay +
          "</div>"
        : "") +
      "</div>" +
      "</div>" +
      '<div class="d-flex align-items-center gap-1 ms-2 flex-shrink-0">' +
      '<span class="text-muted font-monospace" style="font-size: 0.66rem;">' +
      relTime +
      "</span>" +
      '<span class="badge ' +
      outcomeClass +
      '" style="font-size: 0.58rem;">' +
      outcomeText +
      "</span>" +
      "</div>" +
      "</div>";

    auditList.appendChild(item);
  });

  updateTrayEmptyState();
}

function loadTrayAuditLogs() {
  api("/audit-logs?limit=20")
    .then(function (r) {
      if (!r.ok) return null;
      return r.json();
    })
    .then(function (data) {
      if (data && data.logs) {
        renderTrayAuditLogs(data.logs);
      }
    })
    .catch(function (err) {
      console.warn("Could not load tray audit logs:", err);
    });
}

window.loadTrayAuditLogs = loadTrayAuditLogs;

updateTrayEmptyState();
loadTrayAuditLogs();
