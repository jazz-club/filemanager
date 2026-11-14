var currentFolderId = null;
var currentFolderName = "/root";
var allLoadedFiles = [];
var allLoadedFolders = [];
var selectedFileIds = new Set();
var selectedFolderIds = new Set();
var inspectedFile = null;

/*
	opsec level getelementbyid
*/

var settingsOffcanvas = new bootstrap.Offcanvas(document.getElementById("settingsOffcanvas"));
var newFolderModal = new bootstrap.Modal(document.getElementById("newFolderModal"));
var renameModal = new bootstrap.Modal(document.getElementById("renameModal"));
var moveModal = new bootstrap.Modal(document.getElementById("moveModal"));
var deleteModal = new bootstrap.Modal(document.getElementById("deleteModal"));
var changePasswordModal = new bootstrap.Modal(document.getElementById("changePasswordModal"));
var deleteAccountModal = new bootstrap.Modal(document.getElementById("deleteAccountModal"));
var videoModal = new bootstrap.Modal(document.getElementById("videoModal"));
var imageModal = new bootstrap.Modal(document.getElementById("imageModal"));
var docModal = new bootstrap.Modal(document.getElementById("docModal"));
var folderColorModal = new bootstrap.Modal(document.getElementById("folderColorModal"));

var pendingAction = null;

var whoamiEl = document.getElementById("whoami");
var logoutBtn = document.getElementById("logout-btn");
var exportAllBtn = document.getElementById("export-all-btn");
var openChangePwBtn = document.getElementById("open-change-pw-btn");
var openDeleteAccountBtn = document.getElementById("open-delete-account-btn");

var refreshBtn = document.getElementById("refresh-btn");
var searchInput = document.getElementById("search-input");
var typeFilter = document.getElementById("type-filter");
var sortSelect = document.getElementById("sort-select");
var currentSortVal = "date-desc";
var currentFilterVal = "all";
var newFolderBtn = document.getElementById("new-folder-btn");

var fileInput = document.getElementById("file-input");
var startUploadBtn = document.getElementById("start-upload-btn");
var uploadTray = document.getElementById("upload-tray");
var uploadTrayCount = document.getElementById("upload-tray-count");
var uploadTrayItems = document.getElementById("upload-tray-items");
var closeUploadTrayBtn = document.getElementById("close-upload-tray-btn");

var batchActionBar = document.getElementById("batch-action-bar");
var batchSelectedSizeEl = document.getElementById("batch-selected-size");
var selectAllFilesCheckbox = document.getElementById("select-all-files");

var selectionDock = document.getElementById("selection-dock");
var selectionDockInfo = document.getElementById("selection-dock-info");
var batchDeselectDockBtn = document.getElementById("batch-deselect-dock-btn");

var currentViewMode = localStorage.getItem("vault_view_mode") || "list";
var showThumbnails = localStorage.getItem("vault_show_thumbs") !== "false";

var filterDropdownBtn = document.getElementById("filter-dropdown-btn");
var sortDropdownBtn = document.getElementById("sort-dropdown-btn");
var viewModeListBtn = document.getElementById("view-mode-list-btn");
var viewModeGridBtn = document.getElementById("view-mode-grid-btn");
var viewToggleThumbsBtn = document.getElementById("view-toggle-thumbs-btn");
var viewCheckList = document.getElementById("view-check-list");
var viewCheckGrid = document.getElementById("view-check-grid");
var viewCheckThumbs = document.getElementById("view-check-thumbs");

var audioDock = document.getElementById("audio-dock-player");
var audioDockEl = document.getElementById("audio-dock-el");
var audioDockTitle = document.getElementById("audio-dock-title");
var audioDockClose = document.getElementById("audio-dock-close");
var audioTrackCounter = document.getElementById("audio-track-counter");
var audioPlayPauseBtn = document.getElementById("audio-play-pause-btn");
var audioPrevBtn = document.getElementById("audio-prev-btn");
var audioNextBtn = document.getElementById("audio-next-btn");
var audioRwdBtn = document.getElementById("audio-rwd-btn");
var audioFwdBtn = document.getElementById("audio-fwd-btn");
var audioProgressWrap = document.getElementById("audio-progress-wrap");
var audioProgressFill = document.getElementById("audio-progress-fill");
var audioCurrentTime = document.getElementById("audio-current-time");
var audioTotalTime = document.getElementById("audio-total-time");
var audioMuteBtn = document.getElementById("audio-mute-btn");
var audioVolumeSlider = document.getElementById("audio-volume-slider");
var currentAudioPlaylist = [];
var currentAudioIndex = 0;

var videoPlayerEl = document.getElementById("video-player-el");
var videoModalTitle = document.getElementById("video-modal-title");
var videoModalClose = document.getElementById("video-modal-close");
var videoCounterText = document.getElementById("video-counter-text");
var videoPrevBtn = document.getElementById("video-prev-btn");
var videoNextBtn = document.getElementById("video-next-btn");
var videoPlayPauseBtn = document.getElementById("video-play-pause-btn");
var videoRwdBtn = document.getElementById("video-rwd-btn");
var videoFwdBtn = document.getElementById("video-fwd-btn");
var videoMuteBtn = document.getElementById("video-mute-btn");
var videoVolumeSlider = document.getElementById("video-volume-slider");
var videoFullscreenBtn = document.getElementById("video-fullscreen-btn");
var videoProgressWrap = document.getElementById("video-progress-wrap");
var videoProgressFill = document.getElementById("video-progress-fill");
var videoCurrentTime = document.getElementById("video-current-time");
var videoTotalTime = document.getElementById("video-total-time");
var videoModalEl = document.getElementById("videoModal");
var currentVideoPlaylist = [];
var currentVideoIndex = 0;

var imageViewerEl = document.getElementById("image-viewer-el");
var imageModalTitle = document.getElementById("image-modal-title");
var imagePrevBtn = document.getElementById("image-prev-btn");
var imageNextBtn = document.getElementById("image-next-btn");
var imageCounterText = document.getElementById("image-counter-text");
var currentImageGallery = [];
var currentImageIndex = 0;

var dropOverlay = document.getElementById("drop-overlay");

api("/auth/me").then(function (r) {
  if (!r.ok) {
    window.location.href = "/login";
    return;
  }
  r.json().then(function (d) {
    whoamiEl.textContent = d.user;
    loadVault();
    updateStorageStats();
  });
});

logoutBtn.onclick = function () {
  api("/auth/logout", { method: "POST" }).then(function () {
    window.location.href = "/login";
  });
};

exportAllBtn.onclick = function () {
  window.location.href = "/api/files/export/all";
};

refreshBtn.onclick = function () {
  loadVault();
  updateStorageStats();
};

function updateStorageStats() {
  api("/files/stats/usage")
    .then(function (res) {
      if (!res.ok) return;
      return res.json();
    })
    .then(function (data) {
      if (!data) return;
      document.getElementById("storage-usage-text").textContent =
        formatBytes(data.totalBytes) + " used (" + data.fileCount + " files)";

      document.getElementById("size-img").textContent = formatBytes(data.categories.image);
      document.getElementById("size-video").textContent = formatBytes(data.categories.video);
      document.getElementById("size-audio").textContent = formatBytes(data.categories.audio);
      document.getElementById("size-doc").textContent = formatBytes(data.categories.document);
      document.getElementById("size-other").textContent = formatBytes(data.categories.other);

      var total = data.totalBytes || 1;
      document.getElementById("storage-bar-img").style.width =
        (data.categories.image / total) * 100 + "%";
      document.getElementById("storage-bar-video").style.width =
        (data.categories.video / total) * 100 + "%";
      document.getElementById("storage-bar-audio").style.width =
        (data.categories.audio / total) * 100 + "%";
      document.getElementById("storage-bar-doc").style.width =
        (data.categories.document / total) * 100 + "%";
      document.getElementById("storage-bar-other").style.width =
        (data.categories.other / total) * 100 + "%";
    });
}

function startZipDownloadTask(url, zipName, displayTitle, fetchOptions) {
  openUploadTray();

  var taskId = "zip-task-" + Date.now() + "-" + Math.floor(Math.random() * 1000);
  var row = document.createElement("div");
  row.id = taskId;
  row.className = "upload-tray-item mb-2 p-2 border border-dark rounded bg-white shadow-sm";
  row.innerHTML =
    '<div class="d-flex justify-content-between align-items-center mb-1 small">' +
    '<span class="fw-bold text-truncate" style="max-width: 190px;" title="' +
    escapeHtml(displayTitle) +
    '">' +
    "📦 " +
    escapeHtml(displayTitle) +
    "</span>" +
    '<span class="text-muted zip-status font-monospace" style="font-size: 0.72rem;">Preparing...</span>' +
    "</div>" +
    '<div class="progress" style="height: 8px; border: 1px solid #000; border-radius: 4px; overflow: hidden; background: #f0f0f0;">' +
    '<div class="progress-bar progress-bar-striped progress-bar-animated bg-primary" role="progressbar" style="width: 15%; transition: width 0.2s ease;"></div>' +
    "</div>";

  var trayItems = document.getElementById("upload-tray-items");
  if (trayItems) trayItems.prepend(row);
  updateTrayEmptyState();

  var statusEl = row.querySelector(".zip-status");
  var barEl = row.querySelector(".progress-bar");

  var opts = fetchOptions || { method: "GET" };

  fetch(url, opts)
    .then(function (res) {
      if (!res.ok) {
        throw new Error("Server responded with HTTP " + res.status);
      }
      var contentLength = +res.headers.get("content-length") || 0;
      var reader = res.body.getReader();
      var receivedBytes = 0;
      var chunks = [];

      function pump() {
        return reader.read().then(function (result) {
          if (result.done) {
            barEl.style.width = "100%";
            barEl.className = "progress-bar bg-success";
            statusEl.textContent = "✓ Ready! (" + formatBytes(receivedBytes) + ")";
            var blob = new Blob(chunks, { type: "application/zip" });
            var blobUrl = URL.createObjectURL(blob);
            var a = document.createElement("a");
            a.href = blobUrl;
            a.download = zipName;
            document.body.appendChild(a);
            a.click();
            setTimeout(function () {
              URL.revokeObjectURL(blobUrl);
              a.remove();
            }, 10000);
            pushNotification("Ready to download: " + zipName, "success");
            return;
          }
          chunks.push(result.value);
          receivedBytes += result.value.length;
          if (contentLength > 0) {
            var pct = Math.min(99, Math.round((receivedBytes / contentLength) * 100));
            barEl.style.width = pct + "%";
            statusEl.textContent = pct + "% (" + formatBytes(receivedBytes) + ")";
          } else {
            var simPct = Math.min(95, 15 + Math.round(Math.log10(receivedBytes + 10) * 15));
            barEl.style.width = simPct + "%";
            statusEl.textContent = formatBytes(receivedBytes);
          }
          return pump();
        });
      }
      return pump();
    })
    .catch(function (err) {
      console.error("ZIP download error:", err);
      if (barEl) {
        barEl.className = "progress-bar bg-danger";
        barEl.style.width = "100%";
      }
      if (statusEl) {
        statusEl.textContent = "Error";
      }
      showMsg("Failed to archive: " + (err.message || err), "error");
    });
}

function downloadFolderAsZip(folderId, folderName) {
  var safeName = (folderName || "folder").replace(/["\r\n/\\:]/g, "_") + ".zip";
  startZipDownloadTask(
    "/api/files/folder/" + folderId + "/download",
    safeName,
    "/" + (folderName || "Folder")
  );
}

function downloadSelectionAsZip(fileIds, folderIds) {
  var count = (fileIds ? fileIds.length : 0) + (folderIds ? folderIds.length : 0);
  var safeName = "pinkbox_selection_" + Date.now() + ".zip";
  startZipDownloadTask("/api/files/batch/download-zip", safeName, count + " selected items", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fileIds: fileIds || [], folderIds: folderIds || [] }),
  });
}

function loadVault() {
  selectedFileIds.clear();
  selectedFolderIds.clear();
  updateBatchBar();
  loadBreadcrumbs();

  var folderQuery = currentFolderId ? "?parentId=" + currentFolderId : "";
  var fileQuery = currentFolderId ? "?folderId=" + currentFolderId : "";

  Promise.all([
    api("/folders" + folderQuery).then(function (r) {
      return r.json();
    }),
    api("/files" + fileQuery).then(function (r) {
      return r.json();
    }),
  ])
    .then(function (results) {
      allLoadedFolders = results[0] || [];
      allLoadedFiles = results[1] || [];

      renderFolders();
      renderFiles();
      if (inspectedFile) {
        var stillExists = allLoadedFiles.find(function (f) {
          return f.id === inspectedFile.id;
        });
        if (stillExists) openInspector(stillExists);
        else closeInspector();
      }
    })
    .catch(function (err) {
      console.error("loadVault error:", err);
      showMsg("Failed to load contents: " + (err && err.message ? err.message : err), "error");
    });
}

function loadBreadcrumbs() {
  var bcList = document.getElementById("breadcrumb-list");
  if (!bcList) return;
  bcList.innerHTML = "";

  var rootBtn = document.createElement("button");
  rootBtn.type = "button";
  rootBtn.className = "btn btn-crumb" + (!currentFolderId ? " active" : "");
  rootBtn.textContent = "/root";
  rootBtn.title = "Navigate to /root";
  rootBtn.onclick = function (e) {
    e.preventDefault();
    navigateToFolder(null, "/root");
  };
  bcList.appendChild(rootBtn);

  if (!currentFolderId) return;

  api("/folders/" + currentFolderId + "/breadcrumbs")
    .then(function (res) {
      return res.json();
    })
    .then(function (crumbs) {
      crumbs.forEach(function (c, idx) {
        var isLast = idx === crumbs.length - 1;
        var folderBtn = document.createElement("button");
        folderBtn.type = "button";
        folderBtn.className = "btn btn-crumb" + (isLast ? " active" : "");
        folderBtn.textContent = "/" + c.name;
        folderBtn.title = "Navigate to /" + c.name;
        folderBtn.onclick = function (e) {
          e.preventDefault();
          navigateToFolder(c.id, c.name);
        };
        bcList.appendChild(folderBtn);
      });
    })
    .catch(function (err) {
      console.error("breadcrumbs load error:", err);
    });
}

function navigateToFolder(id, name) {
  currentFolderId = id;
  currentFolderName = name || (id ? "Folder" : "/root");
  loadVault();
}

function renderFolders() {
  renderList();
}

function renderFiles() {
  renderList();
}

function getFileUnicodeIcon(mime) {
  var m = (mime || "").toLowerCase();
  if (m.startsWith("audio/")) return "♫";
  if (m.startsWith("video/")) return "▶";
  if (m.startsWith("image/")) return "▣";
  if (
    m.includes("pdf") ||
    m.includes("document") ||
    m.includes("text/") ||
    m.includes("word") ||
    m.includes("officedocument")
  )
    return "🗎\uFE0E";
  if (
    m.includes("zip") ||
    m.includes("tar") ||
    m.includes("compressed") ||
    m.includes("7z") ||
    m.includes("rar")
  )
    return "🗃\uFE0E";
  return "🗎\uFE0E";
}

try {
  Object.keys(sessionStorage).forEach(function (k) {
    if (k.startsWith("vthumb_")) sessionStorage.removeItem(k);
  });
} catch (e) {}

var videoThumbObserver = null;
if (typeof window !== "undefined" && "IntersectionObserver" in window) {
  videoThumbObserver = new IntersectionObserver(
    function (entries, observer) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        var container = entry.target;
        observer.unobserve(container);

        var fileId = container.getAttribute("data-video-id");
        if (!fileId) return;

        var vid = document.createElement("video");
        vid.src = "/api/files/" + fileId + "/preview#t=0.5";
        vid.preload = "metadata";
        vid.muted = true;
        vid.playsInline = true;
        vid.style.cssText =
          "max-height: 95px; max-width: 100%; object-fit: contain; pointer-events: none; background: transparent;";

        vid.addEventListener("error", function () {
          container.innerHTML =
            "<span class=\"grid-icon-large text-secondary\" style=\"font-family: 'Segoe UI Symbol', 'Apple Symbols', sans-serif !important;\">▶</span>";
        });

        container.innerHTML = "";
        container.appendChild(vid);
      });
    },
    { rootMargin: "300px 0px" }
  );
}

function renderList() {
  var accordion = document.getElementById("filesAccordion");
  var emptyMsg = document.getElementById("file-list-empty");
  var fileCountBadge = document.getElementById("file-count");

  var query = (searchInput.value || "").trim().toLowerCase();
  var filterType = currentFilterVal || (typeFilter ? typeFilter.value : "all");
  var sortVal = currentSortVal || (sortSelect ? sortSelect.value : "date-desc");

  var filteredFolders = [];
  if (filterType === "all") {
    filteredFolders = allLoadedFolders.filter(function (f) {
      if (!query) return true;
      return (f.name || "").toLowerCase().includes(query);
    });

    filteredFolders.sort(function (a, b) {
      if (sortVal === "name-asc") return (a.name || "").localeCompare(b.name || "");
      if (sortVal === "name-desc") return (b.name || "").localeCompare(a.name || "");
      if (sortVal === "date-asc") return new Date(a.created_at) - new Date(b.created_at);
      if (sortVal === "date-desc") return new Date(b.created_at) - new Date(a.created_at);
      return (a.name || "").localeCompare(b.name || "");
    });
  }

  var filteredFiles = allLoadedFiles.filter(function (file) {
    if (query && !file.original_name.toLowerCase().includes(query)) return false;
    var mime = (file.mime_type || "").toLowerCase();
    if (filterType === "image" && !mime.startsWith("image/")) return false;
    if (filterType === "video" && !mime.startsWith("video/")) return false;
    if (filterType === "audio" && !mime.startsWith("audio/")) return false;
    if (filterType === "document") {
      var isDoc =
        mime.includes("pdf") ||
        mime.includes("document") ||
        mime.includes("text/") ||
        mime.includes("officedocument") ||
        mime.includes("msword");
      if (!isDoc) return false;
    }
    if (filterType === "archive") {
      var isArch =
        mime.includes("zip") ||
        mime.includes("tar") ||
        mime.includes("compressed") ||
        mime.includes("7z") ||
        mime.includes("rar");
      if (!isArch) return false;
    }
    return true;
  });

  filteredFiles.sort(function (a, b) {
    if (sortVal === "date-desc") return new Date(b.uploaded_at) - new Date(a.uploaded_at);
    if (sortVal === "date-asc") return new Date(a.uploaded_at) - new Date(b.uploaded_at);
    if (sortVal === "name-asc") return a.original_name.localeCompare(b.original_name);
    if (sortVal === "name-desc") return b.original_name.localeCompare(a.original_name);
    if (sortVal === "size-desc") return (b.size_bytes || 0) - (a.size_bytes || 0);
    if (sortVal === "size-asc") return (a.size_bytes || 0) - (b.size_bytes || 0);
    return 0;
  });

  /*
REMINDER DO NOT FUCK WITH ANIMATION STUFF
*/
  var totalItems = filteredFolders.length + filteredFiles.length;
  if (fileCountBadge) {
    fileCountBadge.textContent = totalItems + (totalItems === 1 ? " item" : " items");
  }

  var prevMap = new Map();
  var prevElements = accordion.querySelectorAll("[data-item-key]:not(.item-ghost-disappearing)");
  var newKeys = new Set();
  filteredFolders.forEach(function (f) {
    newKeys.add("folder-" + f.id);
  });
  filteredFiles.forEach(function (f) {
    newKeys.add("file-" + f.id);
  });

  var disappearingGhosts = [];
  var accordionRect = accordion.getBoundingClientRect();

  prevElements.forEach(function (el) {
    var key = el.getAttribute("data-item-key");
    if (!key) return;
    var rect = el.getBoundingClientRect();
    prevMap.set(key, rect);

    if (!newKeys.has(key)) {
      var ghost = el.cloneNode(true);
      ghost.classList.add("item-ghost-disappearing");
      ghost.style.position = "absolute";
      ghost.style.left = rect.left - accordionRect.left + "px";
      ghost.style.top = rect.top - accordionRect.top + "px";
      ghost.style.width = rect.width + "px";
      ghost.style.height = rect.height + "px";
      ghost.style.margin = "0";
      ghost.style.pointerEvents = "none";
      ghost.style.zIndex = "4";
      ghost.style.transformOrigin = "center center";
      disappearingGhosts.push(ghost);
    }
  });

  accordion.style.position = "relative";
  accordion.innerHTML = "";

  disappearingGhosts.forEach(function (g) {
    accordion.appendChild(g);
  });

  if (totalItems === 0) {
    if (emptyMsg) emptyMsg.classList.remove("d-none");
  } else {
    if (emptyMsg) emptyMsg.classList.add("d-none");
    if (currentViewMode === "grid") {
      renderGrid(filteredFolders, filteredFiles, query, accordion);
    } else {
      renderListView(filteredFolders, filteredFiles, query, accordion);
    }
  }

  if (disappearingGhosts.length > 0) {
    requestAnimationFrame(function () {
      disappearingGhosts.forEach(function (g) {
        g.style.transition = "transform 0.22s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.2s ease-in";
        g.style.transform = "scale(0.15) translateY(-8px)";
        g.style.opacity = "0";
      });
      setTimeout(function () {
        disappearingGhosts.forEach(function (g) {
          if (g.parentNode) g.parentNode.removeChild(g);
        });
      }, 230);
    });
  }

  var newElements = accordion.querySelectorAll("[data-item-key]:not(.item-ghost-disappearing)");
  if (prevMap.size > 0 && newElements.length > 0) {
    newElements.forEach(function (el) {
      var key = el.getAttribute("data-item-key");
      var firstRect = prevMap.get(key);
      if (firstRect) {
        var lastRect = el.getBoundingClientRect();
        var dx = firstRect.left - lastRect.left;
        var dy = firstRect.top - lastRect.top;
        if (Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5) {
          el.style.transform = "translate(" + dx + "px, " + dy + "px)";
          el.style.transition = "none";
        }
      } else {
        el.style.transformOrigin = "center center";
        el.style.transform = "scale(0.25)";
        el.style.opacity = "0";
        el.style.transition = "none";
      }
    });

    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        newElements.forEach(function (el) {
          el.style.transition =
            "transform 0.28s cubic-bezier(0.34, 1.25, 0.64, 1), opacity 0.22s ease-out";
          el.style.transform = "";
          el.style.opacity = "";
          var cleanup = function () {
            el.style.transition = "";
            el.removeEventListener("transitionend", cleanup);
          };
          el.addEventListener("transitionend", cleanup);
        });
      });
    });
  }
}

function handleFolderDrop(e, folder) {
  e.preventDefault();
  e.stopPropagation();
  document.querySelectorAll(".folder-drag-target").forEach(function (el) {
    el.classList.remove("folder-drag-target");
  });

  var internalData = e.dataTransfer.getData("application/json");
  if (internalData) {
    try {
      var parsed = JSON.parse(internalData);
      if (parsed && parsed.fileId) {
        api("/files/" + parsed.fileId + "/move", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ folderId: folder.id }),
        })
          .then(function (r) {
            if (!r.ok) throw new Error("Failed to move file");
            return r.json();
          })
          .then(function () {
            showMsg("Moved '" + parsed.fileName + "' into /" + folder.name, "success");
            loadVault();
          })
          .catch(function (err) {
            showMsg("Failed to move file: " + (err.message || err), "error");
          });
        return;
      }
    } catch (err) {}
  }

  if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
    enqueueFiles(Array.from(e.dataTransfer.files), folder.id);
  }
}

var contextMenu = document.getElementById("retro-context-menu");
var contextMenuItems = document.getElementById("context-menu-items");

function openContextMenu(e, type, item) {
  e.preventDefault();
  e.stopPropagation();
  if (!contextMenu || !contextMenuItems) return;
  contextMenuItems.innerHTML = "";

  if (type === "folder") {
    var opts = [
      {
        text: "Open Folder",
        action: function () {
          navigateToFolder(item.id, item.name);
        },
      },
      {
        text: "Rename",
        action: function () {
          openRenameModal("folder", item.id, item.name);
        },
      },
      {
        text: "Change Folder Colour",
        action: function () {
          openFolderColorModal(item);
        },
      },
      {
        text: "Move",
        action: function () {
          openMoveModal("folder", item.id, item.name);
        },
      },
      {
        text: "Download folder",
        action: function () {
          downloadFolderAsZip(item.id, item.name);
        },
      },
      { divider: true },
      {
        text: "Delete",
        danger: true,
        action: function () {
          openDeleteModal("folder", item.id, item.name);
        },
      },
    ];
    opts.forEach(function (opt) {
      if (opt.divider) {
        var d = document.createElement("div");
        d.className = "context-divider";
        contextMenuItems.appendChild(d);
        return;
      }
      var b = document.createElement("button");
      b.className = "context-menu-item" + (opt.danger ? " text-danger" : "");
      b.textContent = opt.text;
      b.onclick = function () {
        closeContextMenu();
        opt.action();
      };
      contextMenuItems.appendChild(b);
    });
  } else if (type === "file") {
    var opts = [];
    if (currentViewMode !== "grid") {
      opts.push({
        text: "Preview",
        action: function () {
          openPreview(item, allLoadedFiles);
        },
      });
      opts.push({
        text: "Download",
        action: function () {
          window.location.href = "/api/files/" + item.id + "/download";
        },
      });
      opts.push({
        text: "File Details ⓘ",
        action: function () {
          showFileDetails(item, allLoadedFiles);
        },
      });
      opts.push({ divider: true });
    }
    opts.push({
      text: "Rename",
      action: function () {
        openRenameModal("file", item.id, item.original_name);
      },
    });
    opts.push({
      text: "Move",
      action: function () {
        openMoveModal("file", item.id, item.original_name);
      },
    });
    opts.push({ divider: true });
    opts.push({
      text: "Delete",
      danger: true,
      action: function () {
        openDeleteModal("file", item.id, item.original_name);
      },
    });
    opts.forEach(function (opt) {
      if (opt.divider) {
        var d = document.createElement("div");
        d.className = "context-divider";
        contextMenuItems.appendChild(d);
        return;
      }
      var b = document.createElement("button");
      b.className = "context-menu-item" + (opt.danger ? " text-danger" : "");
      b.textContent = opt.text;
      b.onclick = function () {
        closeContextMenu();
        opt.action();
      };
      contextMenuItems.appendChild(b);
    });
  }

  contextMenu.style.display = "block";
  var x = e.clientX;
  var y = e.clientY;
  var w = contextMenu.offsetWidth || 180;
  var h = contextMenu.offsetHeight || 220;
  if (x + w > window.innerWidth) x = window.innerWidth - w - 10;
  if (y + h > window.innerHeight) y = window.innerHeight - h - 10;
  contextMenu.style.left = Math.max(10, x) + "px";
  contextMenu.style.top = Math.max(10, y) + "px";
}

function closeContextMenu() {
  if (contextMenu) contextMenu.style.display = "none";
}

function closeAllMenus() {
  closeContextMenu();
  document.querySelectorAll(".dropdown-menu.show").forEach(function (dm) {
    dm.classList.remove("show");
  });
  document.querySelectorAll(".dropdown-open").forEach(function (el) {
    el.classList.remove("dropdown-open");
  });
}

window.addEventListener("click", function (e) {
  closeContextMenu();
});
window.addEventListener("keydown", function (e) {
  if (e.key === "Escape") closeAllMenus();
});
document.addEventListener("show.bs.modal", closeAllMenus);

function attachShaCopyHandler(boxEl, shaText) {
  if (!boxEl || !shaText || shaText === "n/a") return;

  var overlayText = boxEl.querySelector(".sha-overlay-text");
  var clickCount = 0;
  var resetTimer = null;

  function doCopy() {
    clickCount++;

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(shaText).catch(function () {});
    }

    clearTimeout(resetTimer);

    boxEl.classList.remove("sha-pop", "sha-shake");
    void boxEl.offsetWidth;

    boxEl.classList.add("is-copied");

    if (clickCount >= 2) {
      boxEl.classList.add("gang-mode");
      boxEl.classList.add("sha-shake");
      if (overlayText) overlayText.textContent = "YOU GOT IT ALREADY GANG!!";
    } else {
      boxEl.classList.remove("gang-mode");
      boxEl.classList.add("sha-pop");
      if (overlayText) overlayText.textContent = "Copied!";
    }

    resetTimer = setTimeout(function () {
      boxEl.classList.remove("is-copied", "gang-mode", "sha-pop", "sha-shake");
      if (overlayText) overlayText.textContent = "Click to copy!";
      clickCount = 0;
    }, 1800);
  }

  boxEl.onclick = function (e) {
    e.stopPropagation();
    doCopy();
  };

  boxEl.onkeydown = function (e) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      e.stopPropagation();
      doCopy();
    }
  };
}

function showFileDetails(file, allFiles) {
  closeAllMenus();
  var modalEl = document.getElementById("fileDetailsModal");
  if (!modalEl) return;
  var titleEl = document.getElementById("file-details-title");
  var bodyEl = document.getElementById("file-details-body");
  var previewBtn = document.getElementById("file-details-preview-btn");
  var downloadBtn = document.getElementById("file-details-download-btn");

  titleEl.textContent = file.original_name;
  downloadBtn.href = "/api/files/" + file.id + "/download";
  previewBtn.onclick = function () {
    var modalInstance = bootstrap.Modal.getInstance(modalEl);
    if (modalInstance) modalInstance.hide();
    openPreview(file, allFiles || [file]);
  };

  var mime = (file.mime_type || "").toLowerCase();
  var isImg = mime.startsWith("image/");
  var isVid = mime.startsWith("video/");
  var thumbPreview = "";
  if (isImg) {
    thumbPreview =
      '<div class="text-center mb-3">' +
      '<img src="/api/files/' +
      file.id +
      '/preview" class="rounded border border-dark shadow-sm" style="max-height: 140px; max-width: 100%; object-fit: contain; background: #f8f9fa;" alt="Preview" loading="lazy" />' +
      "</div>";
  } else if (isVid) {
    thumbPreview =
      '<div class="text-center mb-3">' +
      '<video src="/api/files/' +
      file.id +
      '/preview#t=0.5" class="rounded border border-dark shadow-sm" style="max-height: 140px; max-width: 100%; object-fit: contain; background: #ffffff;" preload="metadata" muted playsinline></video>' +
      "</div>";
  }

  var shaStr = file.sha256 ? escapeHtml(file.sha256) : "n/a";

  bodyEl.innerHTML =
    thumbPreview +
    '<div class="row g-2 small">' +
    '<div class="col-12">' +
    '<span class="text-muted d-block small fw-bold">File Name</span>' +
    '<span class="fw-bold text-break">' +
    escapeHtml(file.original_name) +
    "</span>" +
    "</div>" +
    '<div class="col-6">' +
    '<span class="text-muted d-block small fw-bold">Size</span>' +
    '<span class="fw-bold font-monospace">' +
    formatBytes(file.size_bytes) +
    "</span>" +
    "</div>" +
    '<div class="col-6">' +
    '<span class="text-muted d-block small fw-bold">Type (MIME)</span>' +
    '<span class="fw-bold text-break">' +
    escapeHtml(file.mime_type || "Unknown") +
    "</span>" +
    "</div>" +
    '<div class="col-12">' +
    '<span class="text-muted d-block small fw-bold">Uploaded Date</span>' +
    "<span>" +
    (formatDate(file.uploaded_at) || "Unknown") +
    "</span>" +
    "</div>" +
    '<div class="col-12">' +
    '<span class="text-muted d-block small fw-bold mb-1">SHA-256 Checksum</span>' +
    (file.sha256
      ? '<div class="sha-copy-box position-relative" role="button" tabindex="0" title="Click to copy!">' +
        '<code class="sha-hash-text font-monospace small text-break p-2 rounded d-block" style="font-size: 0.72rem; word-break: break-all;">' +
        shaStr +
        "</code>" +
        '<div class="sha-overlay">' +
        '<span class="sha-overlay-text fw-bold">Click to copy!</span>' +
        "</div>" +
        "</div>"
      : '<code class="small text-break p-2 bg-light border border-dark rounded d-block text-muted" style="font-size: 0.72rem;">n/a</code>') +
    "</div>" +
    '<div class="col-12 pt-2 mt-2 border-top d-flex gap-2">' +
    '<button type="button" class="btn btn-sm btn-white border border-dark py-1 px-2 fw-bold" id="details-rename-btn">Rename</button>' +
    '<button type="button" class="btn btn-sm btn-white border border-dark py-1 px-2 fw-bold" id="details-move-btn">Move</button>' +
    '<button type="button" class="btn btn-sm btn-outline-danger py-1 px-2 fw-bold ms-auto" id="details-delete-btn">Delete</button>' +
    "</div>" +
    "</div>";

  attachShaCopyHandler(bodyEl.querySelector(".sha-copy-box"), file.sha256);

  bodyEl.querySelector("#details-rename-btn").onclick = function () {
    bootstrap.Modal.getInstance(modalEl).hide();
    openRenameModal("file", file.id, file.original_name);
  };
  bodyEl.querySelector("#details-move-btn").onclick = function () {
    bootstrap.Modal.getInstance(modalEl).hide();
    openMoveModal("file", file.id, file.original_name);
  };
  bodyEl.querySelector("#details-delete-btn").onclick = function () {
    bootstrap.Modal.getInstance(modalEl).hide();
    openDeleteModal("file", file.id, file.original_name);
  };

  new bootstrap.Modal(modalEl).show();
}

function renderGrid(filteredFolders, filteredFiles, query, accordion) {
  var gridContainer = document.createElement("div");
  gridContainer.className = "row g-2 p-2 w-100 m-0";

  filteredFolders.forEach(function (folder) {
    var col = document.createElement("div");
    col.className = "col-6 col-sm-6 col-md-4 col-lg-3 col-xl-3 col-xxl-2 grid-item-col";
    col.setAttribute("data-item-key", "folder-" + folder.id);

    var card = document.createElement("div");
    card.className =
      "grid-item-card p-2 " + (selectedFolderIds.has(folder.id) ? "file-row-selected" : "");
    card.setAttribute("data-folder-id", folder.id);
    card.setAttribute("data-folder-name", folder.name);
    if (folder.color && folder.color !== "#ffffff" && folder.color !== "#fff") {
      card.classList.add("has-custom-color");
      card.style.setProperty("--folder-custom-bg", folder.color);
      card.style.backgroundColor = folder.color;
    }

    var topBar = document.createElement("div");
    topBar.className = "d-flex justify-content-between align-items-center mb-1";

    var chk = document.createElement("input");
    chk.type = "checkbox";
    chk.className = "form-check-input mt-0";
    chk.checked = selectedFolderIds.has(folder.id);
    chk.onclick = function (e) {
      e.stopPropagation();
      if (chk.checked) selectedFolderIds.add(folder.id);
      else selectedFolderIds.delete(folder.id);
      updateBatchBar();
      card.classList.toggle("file-row-selected", chk.checked);
    };

    var actions = document.createElement("div");
    actions.className = "dropdown";
    actions.innerHTML =
      '<button class="btn btn-sm grid-card-action-btn" data-bs-toggle="dropdown" aria-expanded="false">Options ▾</button>' +
      '<ul class="dropdown-menu dropdown-menu-end shadow-sm border-dark">' +
      '<li><a class="dropdown-item rename-folder py-1" href="#">Rename</a></li>' +
      '<li><a class="dropdown-item color-folder py-1" href="#">Change Folder Colour</a></li>' +
      '<li><a class="dropdown-item move-folder py-1" href="#">Move</a></li>' +
      '<li><a class="dropdown-item download-folder py-1" href="#">Download folder</a></li>' +
      '<li><hr class="dropdown-divider my-1"></li>' +
      '<li><a class="dropdown-item text-danger delete-folder py-1" href="#">Delete</a></li>' +
      "</ul>";

    actions.addEventListener("show.bs.dropdown", function () {
      card.classList.add("dropdown-open");
    });
    actions.addEventListener("hide.bs.dropdown", function () {
      card.classList.remove("dropdown-open");
    });

    actions.querySelector(".rename-folder").onclick = function (e) {
      e.preventDefault();
      closeAllMenus();
      openRenameModal("folder", folder.id, folder.name);
    };
    actions.querySelector(".color-folder").onclick = function (e) {
      e.preventDefault();
      closeAllMenus();
      openFolderColorModal(folder);
    };
    actions.querySelector(".move-folder").onclick = function (e) {
      e.preventDefault();
      closeAllMenus();
      openMoveModal("folder", folder.id, folder.name);
    };
    actions.querySelector(".download-folder").onclick = function (e) {
      e.preventDefault();
      closeAllMenus();
      downloadFolderAsZip(folder.id, folder.name);
    };
    actions.querySelector(".delete-folder").onclick = function (e) {
      e.preventDefault();
      closeAllMenus();
      openDeleteModal("folder", folder.id, folder.name);
    };

    card.ondragover = function (e) {
      e.preventDefault();
      e.stopPropagation();
      card.classList.add("folder-drag-target");
    };
    card.ondragleave = function (e) {
      e.stopPropagation();
      card.classList.remove("folder-drag-target");
    };
    card.ondrop = function (e) {
      handleFolderDrop(e, folder);
    };
    card.addEventListener("contextmenu", function (e) {
      openContextMenu(e, "folder", folder);
    });

    topBar.appendChild(chk);
    topBar.appendChild(actions);

    var centerBox = document.createElement("div");
    centerBox.className =
      "text-center py-2 flex-grow-1 d-flex flex-column align-items-center justify-content-center";
    centerBox.style.cursor = "pointer";
    centerBox.innerHTML =
      "<span class=\"grid-icon-large mb-1\" style=\"font-family: 'Segoe UI Symbol', 'Apple Symbols', sans-serif !important; font-size: 2.2rem; color: #000000; line-height: 1;\">&#x1F4C1;&#xFE0E;</span>" +
      '<div class="fw-bold small text-truncate w-100 px-1" title="' +
      escapeHtml(folder.name) +
      '">' +
      highlightMatch(folder.name, query) +
      "</div>" +
      '<span class="text-muted" style="font-size: 0.7rem;">Folder</span>';

    centerBox.onclick = function () {
      navigateToFolder(folder.id, folder.name);
    };

    card.appendChild(topBar);
    card.appendChild(centerBox);
    col.appendChild(card);
    gridContainer.appendChild(col);
  });

  filteredFiles.forEach(function (file) {
    var col = document.createElement("div");
    col.className = "col-6 col-sm-6 col-md-4 col-lg-3 col-xl-3 col-xxl-2 grid-item-col";
    col.setAttribute("data-item-key", "file-" + file.id);

    var card = document.createElement("div");
    card.className =
      "grid-item-card p-2 " + (selectedFileIds.has(file.id) ? "file-row-selected" : "");
    card.setAttribute("data-file-id", file.id);
    card.setAttribute("data-file-name", file.original_name);
    card.setAttribute("data-mime", file.mime_type || "");
    card.draggable = true;
    card.ondragstart = function (e) {
      e.dataTransfer.setData(
        "application/json",
        JSON.stringify({ fileId: file.id, fileName: file.original_name })
      );
      e.dataTransfer.effectAllowed = "move";
    };
    card.addEventListener("contextmenu", function (e) {
      openContextMenu(e, "file", file);
    });

    var topBar = document.createElement("div");
    topBar.className = "d-flex justify-content-between align-items-center mb-1";

    var selectChk = document.createElement("input");
    selectChk.type = "checkbox";
    selectChk.className = "form-check-input mt-0";
    selectChk.checked = selectedFileIds.has(file.id);
    selectChk.onclick = function (e) {
      e.stopPropagation();
      if (selectChk.checked) selectedFileIds.add(file.id);
      else selectedFileIds.delete(file.id);
      updateBatchBar();
      card.classList.toggle("file-row-selected", selectChk.checked);
    };

    var topBarRight = document.createElement("div");
    topBarRight.className = "d-flex align-items-center gap-1";

    var sizeBadge = document.createElement("span");
    sizeBadge.className = "text-muted font-monospace";
    sizeBadge.style.fontSize = "0.7rem";
    sizeBadge.textContent = formatBytes(file.size_bytes);

    topBarRight.appendChild(sizeBadge);

    topBar.appendChild(selectChk);
    topBar.appendChild(topBarRight);

    var thumbBox = document.createElement("div");
    thumbBox.className = "grid-thumb-box rounded mb-1 position-relative";
    thumbBox.style.cursor = "pointer";
    thumbBox.style.height = "100px";

    var mime = (file.mime_type || "").toLowerCase();
    var isImage = mime.startsWith("image/");
    var isVideo = mime.startsWith("video/");

    if (showThumbnails && isImage) {
      thumbBox.innerHTML =
        '<img src="/api/files/' +
        file.id +
        '/preview" alt="Thumb" loading="lazy" style="max-height: 95px; max-width: 100%; object-fit: contain;">';
    } else if (showThumbnails && isVideo) {
      if (videoThumbObserver) {
        var lazyThumbWrap = document.createElement("div");
        lazyThumbWrap.className = "w-100 h-100 d-flex align-items-center justify-content-center";
        lazyThumbWrap.setAttribute("data-video-id", file.id);
        lazyThumbWrap.innerHTML =
          "<span class=\"grid-icon-large text-secondary opacity-50\" style=\"font-family: 'Segoe UI Symbol', 'Apple Symbols', sans-serif !important;\">▶</span>";
        thumbBox.appendChild(lazyThumbWrap);
        videoThumbObserver.observe(lazyThumbWrap);
      } else {
        thumbBox.innerHTML =
          '<video src="/api/files/' +
          file.id +
          '/preview#t=0.5" preload="metadata" muted playsinline style="max-height: 95px; max-width: 100%; object-fit: contain; pointer-events: none; background: transparent;"></video>';
      }
    } else {
      var icon = getFileUnicodeIcon(file.mime_type);
      thumbBox.innerHTML =
        "<span class=\"grid-icon-large text-secondary\" style=\"font-family: 'Segoe UI Symbol', 'Apple Symbols', sans-serif !important;\">" +
        icon +
        "</span>";
    }

    thumbBox.onclick = function () {
      openPreview(file, filteredFiles);
    };

    var nameDiv = document.createElement("div");
    nameDiv.className = "fw-bold small text-truncate w-100 text-center mb-1 grid-item-name";
    nameDiv.title = file.original_name;
    nameDiv.innerHTML = highlightMatch(file.original_name, query);
    nameDiv.style.cursor = "pointer";
    nameDiv.onclick = function () {
      showFileDetails(file, filteredFiles);
    };

    var actionRow = document.createElement("div");
    actionRow.className = "d-flex align-items-center mt-auto pt-2 border-top gap-1 w-100";
    actionRow.innerHTML =
      '<button class="btn btn-sm grid-card-action-btn grid-preview-btn flex-grow-1 text-truncate px-1" title="Preview">Preview</button>' +
      '<a href="/api/files/' +
      file.id +
      '/download" class="btn btn-sm grid-card-action-btn flex-grow-1 text-center text-truncate px-1" title="Download">Download</a>' +
      '<button class="btn btn-sm grid-card-action-btn grid-details-btn flex-shrink-0" title="File Details">ⓘ</button>';

    actionRow.querySelector(".grid-preview-btn").onclick = function (e) {
      e.stopPropagation();
      closeAllMenus();
      openPreview(file, filteredFiles);
    };

    var detailsBtn = actionRow.querySelector(".grid-details-btn");
    if (detailsBtn) {
      detailsBtn.onclick = function (e) {
        e.stopPropagation();
        closeAllMenus();
        showFileDetails(file, filteredFiles);
      };
    }

    card.appendChild(topBar);
    card.appendChild(thumbBox);
    card.appendChild(nameDiv);
    card.appendChild(actionRow);
    col.appendChild(card);
    gridContainer.appendChild(col);
  });

  accordion.appendChild(gridContainer);
}

function renderListView(filteredFolders, filteredFiles, query, accordion) {
  filteredFolders.forEach(function (folder) {
    var folderItem = document.createElement("div");
    folderItem.className =
      "accordion-item border-0 border-bottom folder-row-item " +
      (selectedFolderIds.has(folder.id) ? "file-row-selected" : "");
    folderItem.setAttribute("data-folder-id", folder.id);
    folderItem.setAttribute("data-folder-name", folder.name);
    folderItem.setAttribute("data-item-key", "folder-" + folder.id);
    if (folder.color && folder.color !== "#ffffff" && folder.color !== "#fff") {
      folderItem.classList.add("has-custom-color");
      folderItem.style.setProperty("--folder-custom-bg", folder.color);
      folderItem.style.backgroundColor = folder.color;
    }

    folderItem.ondragover = function (e) {
      e.preventDefault();
      e.stopPropagation();
      folderItem.classList.add("folder-drag-target");
    };
    folderItem.ondragleave = function (e) {
      e.stopPropagation();
      folderItem.classList.remove("folder-drag-target");
    };
    folderItem.ondrop = function (e) {
      handleFolderDrop(e, folder);
    };
    folderItem.addEventListener("contextmenu", function (e) {
      openContextMenu(e, "folder", folder);
    });

    var row = document.createElement("div");
    row.className = "d-flex align-items-center justify-content-between py-2 px-3";

    var left = document.createElement("div");
    left.className = "d-flex align-items-center gap-2 text-truncate flex-grow-1";
    left.style.cursor = "pointer";

    var chk = document.createElement("input");
    chk.type = "checkbox";
    chk.className = "form-check-input mt-0 me-2 ms-0";
    chk.checked = selectedFolderIds.has(folder.id);
    chk.onclick = function (e) {
      e.stopPropagation();
      if (chk.checked) selectedFolderIds.add(folder.id);
      else selectedFolderIds.delete(folder.id);
      updateBatchBar();
      folderItem.classList.toggle("file-row-selected", chk.checked);
    };

    var folderIconSpan = document.createElement("span");
    folderIconSpan.style.cssText =
      "font-family: 'Segoe UI Symbol', 'Apple Symbols', sans-serif !important; font-size: 1.35rem; color: #000000; line-height: 1; display: inline-flex; align-items: center; margin-right: 0.25rem;";
    folderIconSpan.innerHTML = "&#x1F4C1;&#xFE0E;";

    var nameSpan = document.createElement("span");
    nameSpan.className = "fw-bold text-truncate";
    nameSpan.innerHTML = highlightMatch(folder.name, query);
    nameSpan.title = folder.name;

    var badgeSpan = document.createElement("span");
    badgeSpan.className = "badge bg-secondary ms-2 small";
    badgeSpan.textContent = "Folder";

    left.appendChild(chk);
    left.appendChild(folderIconSpan);
    left.appendChild(nameSpan);
    left.appendChild(badgeSpan);

    left.onclick = function () {
      navigateToFolder(folder.id, folder.name);
    };

    var right = document.createElement("div");
    right.className = "d-flex align-items-center gap-3 flex-shrink-0 ms-2";

    var dateSpan = document.createElement("span");
    dateSpan.className = "small text-muted d-none d-md-inline";
    dateSpan.textContent = formatDate(folder.created_at);

    var actions = document.createElement("div");
    actions.className = "dropdown";
    actions.innerHTML =
      '<button class="btn btn-sm btn-white border border-dark py-0 px-2 fw-bold" data-bs-toggle="dropdown" data-bs-display="static" aria-expanded="false" title="Folder Options">Options ▾</button>' +
      '<ul class="dropdown-menu dropdown-menu-end shadow-sm border-dark">' +
      '<li><a class="dropdown-item rename-folder" href="#">Rename</a></li>' +
      '<li><a class="dropdown-item color-folder" href="#">Change Folder Colour</a></li>' +
      '<li><a class="dropdown-item move-folder" href="#">Move</a></li>' +
      '<li><a class="dropdown-item download-folder" href="#">Download folder</a></li>' +
      '<li><hr class="dropdown-divider"></li>' +
      '<li><a class="dropdown-item text-danger delete-folder" href="#">Delete</a></li>' +
      "</ul>";

    actions.addEventListener("show.bs.dropdown", function () {
      folderItem.classList.add("dropdown-open");
    });
    actions.addEventListener("hide.bs.dropdown", function () {
      folderItem.classList.remove("dropdown-open");
    });

    actions.querySelector(".rename-folder").onclick = function (e) {
      e.preventDefault();
      closeAllMenus();
      openRenameModal("folder", folder.id, folder.name);
    };
    actions.querySelector(".color-folder").onclick = function (e) {
      e.preventDefault();
      closeAllMenus();
      openFolderColorModal(folder);
    };
    actions.querySelector(".move-folder").onclick = function (e) {
      e.preventDefault();
      closeAllMenus();
      openMoveModal("folder", folder.id, folder.name);
    };
    actions.querySelector(".download-folder").onclick = function (e) {
      e.preventDefault();
      closeAllMenus();
      downloadFolderAsZip(folder.id, folder.name);
    };
    actions.querySelector(".delete-folder").onclick = function (e) {
      e.preventDefault();
      closeAllMenus();
      openDeleteModal("folder", folder.id, folder.name);
    };

    right.appendChild(dateSpan);
    right.appendChild(actions);

    row.appendChild(left);
    row.appendChild(right);
    folderItem.appendChild(row);
    accordion.appendChild(folderItem);
  });

  filteredFiles.forEach(function (file) {
    var item = document.createElement("div");
    item.className =
      "accordion-item border-0 border-bottom " +
      (selectedFileIds.has(file.id) ? "file-row-selected" : "");
    item.setAttribute("data-file-id", file.id);
    item.setAttribute("data-file-name", file.original_name);
    item.setAttribute("data-mime", file.mime_type || "");
    item.setAttribute("data-item-key", "file-" + file.id);
    item.draggable = true;
    item.ondragstart = function (e) {
      e.dataTransfer.setData(
        "application/json",
        JSON.stringify({ fileId: file.id, fileName: file.original_name })
      );
      e.dataTransfer.effectAllowed = "move";
    };
    item.addEventListener("contextmenu", function (e) {
      openContextMenu(e, "file", file);
    });

    var headerId = "heading-" + file.id;
    var collapseId = "collapse-" + file.id;

    var header = document.createElement("h2");
    header.className = "accordion-header d-flex align-items-center";
    header.id = headerId;

    var selectChk = document.createElement("input");
    selectChk.type = "checkbox";
    selectChk.className = "form-check-input ms-3 me-2 mt-0";
    selectChk.checked = selectedFileIds.has(file.id);
    selectChk.onclick = function (e) {
      e.stopPropagation();
      if (selectChk.checked) selectedFileIds.add(file.id);
      else selectedFileIds.delete(file.id);
      updateBatchBar();
      item.classList.toggle("file-row-selected", selectChk.checked);
    };

    var btn = document.createElement("button");
    btn.className = "accordion-button collapsed py-2 px-3";
    btn.type = "button";
    btn.setAttribute("data-bs-toggle", "collapse");
    btn.setAttribute("data-bs-target", "#" + collapseId);
    btn.setAttribute("aria-expanded", "false");
    btn.setAttribute("aria-controls", collapseId);

    var formattedDate = formatDate(file.uploaded_at);
    var fileGlyph = getFileUnicodeIcon(file.mime_type);

    btn.innerHTML =
      '<div class="d-flex align-items-center justify-content-between w-100 me-3 text-truncate">' +
      '<div class="d-flex align-items-center gap-2 text-truncate">' +
      "<span class=\"text-muted me-1\" style=\"font-family: 'Segoe UI Symbol', 'Apple Symbols', sans-serif !important; font-size: 1.15rem; line-height: 1;\">" +
      fileGlyph +
      "</span>" +
      '<span class="fw-bold text-truncate" title="' +
      escapeHtml(file.original_name) +
      '">' +
      highlightMatch(file.original_name, query) +
      "</span>" +
      "</div>" +
      '<div class="d-flex align-items-center gap-3 small text-muted flex-shrink-0 ms-2">' +
      "<span>" +
      formatBytes(file.size_bytes) +
      "</span>" +
      '<span class="d-none d-md-inline">' +
      formattedDate +
      "</span>" +
      "</div>" +
      "</div>";

    header.appendChild(selectChk);
    header.appendChild(btn);

    var collapse = document.createElement("div");
    collapse.id = collapseId;
    collapse.className = "accordion-collapse collapse";
    collapse.setAttribute("aria-labelledby", headerId);
    collapse.setAttribute("data-bs-parent", "#filesAccordion");

    var mime = (file.mime_type || "").toLowerCase();
    var isImage = mime.startsWith("image/");
    var formattedDate = formatDate(file.uploaded_at);
    var shaShort = file.sha256 ? escapeHtml(file.sha256) : "n/a";

    var thumbHtml = "";
    if (isImage && showThumbnails) {
      thumbHtml =
        '<div class="col-12 col-md-auto text-center">' +
        '<img src="/api/files/' +
        file.id +
        '/preview" loading="lazy" class="rounded border border-dark shadow-sm" style="max-height: 90px; max-width: 130px; object-fit: contain; background: #fff;" alt="Thumbnail" />' +
        "</div>";
    }

    var body = document.createElement("div");
    body.className = "accordion-body p-3";
    body.innerHTML =
      '<div class="row g-3 align-items-center">' +
      '<div class="col-12 col-md">' +
      '<div class="row g-2 small">' +
      '<div class="col-12 col-sm-6">' +
      '<span class="text-muted d-block small">File Name</span>' +
      '<span class="fw-bold text-break">' +
      escapeHtml(file.original_name) +
      "</span>" +
      "</div>" +
      '<div class="col-6 col-sm-3">' +
      '<span class="text-muted d-block small">File Size</span>' +
      '<span class="fw-bold">' +
      formatBytes(file.size_bytes) +
      "</span>" +
      "</div>" +
      '<div class="col-6 col-sm-3">' +
      '<span class="text-muted d-block small">Type</span>' +
      '<span class="fw-bold text-break">' +
      escapeHtml(file.mime_type || "Unknown") +
      "</span>" +
      "</div>" +
      '<div class="col-12 col-sm-6">' +
      '<span class="text-muted d-block small">Uploaded At</span>' +
      "<span>" +
      (formattedDate || "Unknown") +
      "</span>" +
      "</div>" +
      '<div class="col-12 col-sm-6">' +
      '<span class="text-muted d-block small mb-1">SHA-256 Checksum</span>' +
      (file.sha256
        ? '<div class="sha-copy-box position-relative" role="button" tabindex="0" title="Click to copy!">' +
          '<code class="sha-hash-text font-monospace small text-break p-2 rounded d-block" style="font-size: 0.72rem; word-break: break-all;">' +
          shaShort +
          "</code>" +
          '<div class="sha-overlay">' +
          '<span class="sha-overlay-text fw-bold">Click to copy!</span>' +
          "</div>" +
          "</div>"
        : '<code class="small text-break p-2 bg-light border border-dark rounded d-block text-muted" style="font-size: 0.72rem;">n/a</code>') +
      "</div>" +
      "</div>" +
      "</div>" +
      thumbHtml +
      '<div class="col-12 pt-2 border-top d-flex gap-2 flex-wrap align-items-center">' +
      '<button class="btn btn-sm btn-primary play-preview-btn">Preview</button>' +
      '<a href="/api/files/' +
      file.id +
      '" class="btn btn-sm btn-success">Download</a>' +
      '<button class="btn btn-sm btn-white rename-file-btn">Rename</button>' +
      '<button class="btn btn-sm btn-white move-file-btn">Move</button>' +
      '<button class="btn btn-sm btn-outline-danger delete-file-btn">Delete</button>' +
      "</div>" +
      "</div>";

    attachShaCopyHandler(body.querySelector(".sha-copy-box"), file.sha256);

    body.querySelector(".play-preview-btn").onclick = function () {
      openPreview(file, filteredFiles);
    };
    body.querySelector(".rename-file-btn").onclick = function () {
      openRenameModal("file", file.id, file.original_name);
    };
    body.querySelector(".move-file-btn").onclick = function () {
      openMoveModal("file", file.id, file.original_name);
    };
    body.querySelector(".delete-file-btn").onclick = function () {
      openDeleteModal("file", file.id, file.original_name);
    };

    collapse.appendChild(body);
    item.appendChild(header);
    item.appendChild(collapse);
    accordion.appendChild(item);
  });
}

function getFileIcon(mime, name) {
  return "";
}

function highlightMatch(text, query) {
  if (!query) return escapeHtml(text);
  var escaped = escapeHtml(text);
  var idx = escaped.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return escaped;
  var before = escaped.slice(0, idx);
  var match = escaped.slice(idx, idx + query.length);
  var after = escaped.slice(idx + query.length);
  return before + '<span class="highlight-match">' + match + "</span>" + after;
}

function applyFilterToDOM() {
  renderList();
}

var searchDebounceTimer = null;
searchInput.oninput = function () {
  clearTimeout(searchDebounceTimer);
  searchDebounceTimer = setTimeout(function () {
    renderList();
  }, 100);
};

document.querySelectorAll(".filter-opt").forEach(function (btn) {
  btn.onclick = function () {
    var val = btn.getAttribute("data-filter");
    currentFilterVal = val;
    if (typeFilter) typeFilter.value = val;
    document.querySelectorAll(".filter-opt").forEach(function (b) {
      b.classList.remove("active", "fw-bold");
    });
    btn.classList.add("active", "fw-bold");
    if (filterDropdownBtn) {
      var label = val === "all" ? "All" : btn.textContent.trim();
      filterDropdownBtn.textContent = "Filter: " + label;
    }
    closeAllMenus();
    renderList();
  };
});

document.querySelectorAll(".sort-opt").forEach(function (btn) {
  btn.onclick = function () {
    var val = btn.getAttribute("data-sort");
    currentSortVal = val;
    if (sortSelect) sortSelect.value = val;
    document.querySelectorAll(".sort-opt").forEach(function (b) {
      b.classList.remove("active", "fw-bold");
    });
    btn.classList.add("active", "fw-bold");
    if (sortDropdownBtn) {
      sortDropdownBtn.textContent = "Sort: " + btn.textContent.trim().replace(" First", "");
    }
    renderList();
  };
});

function setViewMode(mode) {
  currentViewMode = mode;
  localStorage.setItem("vault_view_mode", mode);
  if (viewCheckList && viewCheckGrid) {
    if (mode === "grid") {
      viewCheckList.classList.add("d-none");
      viewCheckGrid.classList.remove("d-none");
    } else {
      viewCheckList.classList.remove("d-none");
      viewCheckGrid.classList.add("d-none");
    }
  }
  renderList();
}

if (viewModeListBtn) {
  viewModeListBtn.onclick = function () {
    setViewMode("list");
  };
}

if (viewModeGridBtn) {
  viewModeGridBtn.onclick = function () {
    setViewMode("grid");
  };
}

if (viewToggleThumbsBtn) {
  viewToggleThumbsBtn.onclick = function () {
    showThumbnails = !showThumbnails;
    localStorage.setItem("vault_show_thumbs", showThumbnails ? "true" : "false");
    if (viewCheckThumbs) {
      viewCheckThumbs.classList.toggle("d-none", !showThumbnails);
    }
    renderList();
  };
}

if (viewCheckList && viewCheckGrid) {
  if (currentViewMode === "grid") {
    viewCheckList.classList.add("d-none");
    viewCheckGrid.classList.remove("d-none");
  } else {
    viewCheckList.classList.remove("d-none");
    viewCheckGrid.classList.add("d-none");
  }
}

if (viewCheckThumbs) {
  viewCheckThumbs.classList.toggle("d-none", !showThumbnails);
}

function updateBatchBar() {
  var totalSelected = selectedFileIds.size + selectedFolderIds.size;
  var selectBtn = document.getElementById("select-dropdown-btn");
  if (selectBtn) {
    selectBtn.textContent = totalSelected > 0 ? "Select (" + totalSelected + ")" : "Select";
  }

  var totalSizeBytes = 0;
  var selectedFileCount = 0;
  allLoadedFiles.forEach(function (f) {
    if (selectedFileIds.has(f.id)) {
      totalSizeBytes += Number(f.size_bytes || 0);
      selectedFileCount++;
    }
  });

  if (selectionDock) {
    if (totalSelected > 0) {
      if (
        selectionDock.classList.contains("d-none") ||
        selectionDock.classList.contains("dock-closing")
      ) {
        selectionDock.classList.remove("d-none", "dock-closing");
        selectionDock.classList.add("dock-opening");
        setTimeout(function () {
          selectionDock.classList.remove("dock-opening");
        }, 240);
      }
      if (audioDock && !audioDock.classList.contains("d-none")) {
        selectionDock.style.bottom = "110px";
      } else {
        selectionDock.style.bottom = "25px";
      }
      if (selectionDockInfo) {
        var infoText = totalSelected + (totalSelected === 1 ? " item selected" : " items selected");
        if (selectedFileCount > 0) {
          infoText += " · " + formatBytes(totalSizeBytes);
        }
        selectionDockInfo.textContent = infoText;
      }
    } else {
      if (
        !selectionDock.classList.contains("d-none") &&
        !selectionDock.classList.contains("dock-closing")
      ) {
        selectionDock.classList.remove("dock-opening");
        selectionDock.classList.add("dock-closing");
        setTimeout(function () {
          if (selectedFileIds.size + selectedFolderIds.size === 0) {
            selectionDock.classList.add("d-none");
            selectionDock.classList.remove("dock-closing");
          }
        }, 180);
      }
    }
  }
}

function updateSelectionUI() {
  document.querySelectorAll("[data-folder-id]").forEach(function (el) {
    var id = el.getAttribute("data-folder-id");
    var isSel = selectedFolderIds.has(id);
    el.classList.toggle("file-row-selected", isSel);
    var chk = el.querySelector(".form-check-input");
    if (chk) chk.checked = isSel;
  });

  document.querySelectorAll("[data-file-id]").forEach(function (el) {
    var id = el.getAttribute("data-file-id");
    var isSel = selectedFileIds.has(id);
    el.classList.toggle("file-row-selected", isSel);
    var chk = el.querySelector(".form-check-input");
    if (chk) chk.checked = isSel;
  });

  if (selectAllFilesCheckbox) {
    var totalFiles = allLoadedFiles.length;
    selectAllFilesCheckbox.checked = totalFiles > 0 && selectedFileIds.size === totalFiles;
  }

  updateBatchBar();
}

if (batchDeselectDockBtn) {
  batchDeselectDockBtn.onclick = function () {
    selectedFileIds.clear();
    selectedFolderIds.clear();
    updateSelectionUI();
  };
}

if (selectAllFilesCheckbox) {
  selectAllFilesCheckbox.onclick = function () {
    var isChecked = selectAllFilesCheckbox.checked;
    allLoadedFiles.forEach(function (f) {
      if (isChecked) selectedFileIds.add(f.id);
      else selectedFileIds.delete(f.id);
    });
    updateSelectionUI();
  };
}

var batchSelectAllBtn = document.getElementById("batch-select-all-btn");
if (batchSelectAllBtn) {
  batchSelectAllBtn.onclick = function () {
    allLoadedFiles.forEach(function (f) {
      selectedFileIds.add(f.id);
    });
    allLoadedFolders.forEach(function (fo) {
      selectedFolderIds.add(fo.id);
    });
    updateSelectionUI();
  };
}

var batchSelectFilesBtn = document.getElementById("batch-select-files-btn");
if (batchSelectFilesBtn) {
  batchSelectFilesBtn.onclick = function () {
    allLoadedFiles.forEach(function (f) {
      selectedFileIds.add(f.id);
    });
    updateSelectionUI();
  };
}

var batchSelectFoldersBtn = document.getElementById("batch-select-folders-btn");
if (batchSelectFoldersBtn) {
  batchSelectFoldersBtn.onclick = function () {
    allLoadedFolders.forEach(function (fo) {
      selectedFolderIds.add(fo.id);
    });
    updateSelectionUI();
  };
}

var batchDeselectBtn = document.getElementById("batch-deselect-btn");
if (batchDeselectBtn) {
  batchDeselectBtn.onclick = function () {
    selectedFileIds.clear();
    selectedFolderIds.clear();
    if (selectAllFilesCheckbox) selectAllFilesCheckbox.checked = false;
    updateSelectionUI();
  };
}

var batchCancelBtn = document.getElementById("batch-cancel-btn");
if (batchCancelBtn) {
  batchCancelBtn.onclick = function () {
    selectedFileIds.clear();
    selectedFolderIds.clear();
    if (selectAllFilesCheckbox) selectAllFilesCheckbox.checked = false;
    updateSelectionUI();
  };
}

document.querySelectorAll("[data-select-type]").forEach(function (btn) {
  btn.onclick = function () {
    var type = btn.getAttribute("data-select-type");
    var matchedCount = 0;
    allLoadedFiles.forEach(function (f) {
      var mime = (f.mime_type || "").toLowerCase();
      var match = false;
      if (type === "audio" && mime.startsWith("audio/")) match = true;
      else if (type === "image" && mime.startsWith("image/")) match = true;
      else if (type === "video" && mime.startsWith("video/")) match = true;
      else if (
        type === "document" &&
        (mime.includes("pdf") ||
          mime.includes("document") ||
          mime.includes("text/") ||
          mime.includes("officedocument") ||
          mime.includes("msword"))
      )
        match = true;
      else if (
        type === "archive" &&
        (mime.includes("zip") ||
          mime.includes("tar") ||
          mime.includes("compressed") ||
          mime.includes("7z") ||
          mime.includes("rar"))
      )
        match = true;

      if (match) {
        selectedFileIds.add(f.id);
        matchedCount++;
      }
    });

    if (matchedCount === 0) {
      showMsg("No " + type + " files found in current view.", "error");
    }
    updateSelectionUI();
  };
});

document.getElementById("batch-download-btn").onclick = function () {
  if (selectedFileIds.size === 0 && selectedFolderIds.size === 0) return;
  downloadSelectionAsZip(Array.from(selectedFileIds), Array.from(selectedFolderIds));
};

document.getElementById("batch-delete-btn").onclick = function () {
  if (selectedFileIds.size === 0 && selectedFolderIds.size === 0) return;
  if (!confirm("fuck em all? southern style lemon peppers style?")) return;

  api("/files/batch/delete", {
    method: "POST",
    body: JSON.stringify({
      fileIds: Array.from(selectedFileIds),
      folderIds: Array.from(selectedFolderIds),
    }),
  })
    .then(function (r) {
      return r.json();
    })
    .then(function () {
      showMsg("Deleted items.", "success");
      loadVault();
      updateStorageStats();
    });
};

document.getElementById("batch-move-btn").onclick = function () {
  openMoveModal("batch", null, selectedFileIds.size + selectedFolderIds.size + " items");
};

var newFolderNameInput = document.getElementById("new-folder-name");

newFolderBtn.onclick = function () {
  newFolderNameInput.value = "";
  newFolderModal.show();
};

document.getElementById("newFolderModal").addEventListener("shown.bs.modal", function () {
  newFolderNameInput.focus();
});

newFolderNameInput.addEventListener("keydown", function (e) {
  if (e.key === "Enter") {
    e.preventDefault();
    document.getElementById("create-folder-confirm-btn").click();
  }
});

document.getElementById("create-folder-confirm-btn").onclick = function () {
  var name = newFolderNameInput.value.trim();
  if (!name) {
    showMsg("Folder name is required.", "error");
    newFolderNameInput.focus();
    return;
  }

  api("/folders", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: name, parentId: currentFolderId }),
  })
    .then(function (r) {
      return r.json();
    })
    .then(function (data) {
      newFolderModal.hide();
      if (data.error) {
        showMsg(data.error, "error");
      } else {
        showMsg("Folder '" + data.name + "' created.", "success");
        loadVault();
      }
    })
    .catch(function (err) {
      newFolderModal.hide();
      showMsg("Failed to create folder: " + (err.message || err), "error");
    });
};

var FOLDER_PALETTE = [
  { name: "Default White", hex: "#ffffff" },
  { name: "Pastel Pink", hex: "#ffe4f1" },
  { name: "Mint Green", hex: "#e6f9ed" },
  { name: "Sky Blue", hex: "#e0f2fe" },
  { name: "Sunflower Yellow", hex: "#fef9c3" },
  { name: "Lavender", hex: "#f3e8ff" },
  { name: "Warm Peach", hex: "#ffedd5" },
  { name: "Soft Coral", hex: "#fee2e2" },
];

function openFolderColorModal(folder) {
  closeAllMenus();
  document.getElementById("color-folder-name").textContent = folder.name;
  var container = document.getElementById("folder-color-palette");
  container.innerHTML = "";

  FOLDER_PALETTE.forEach(function (c) {
    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "color-swatch";
    btn.style.backgroundColor = c.hex;
    btn.title = c.name;
    if ((folder.color || "#ffffff").toLowerCase() === c.hex.toLowerCase()) {
      btn.style.outline = "3px solid #ff69b4";
      btn.style.outlineOffset = "2px";
    }

    btn.onclick = function () {
      var newHex = c.hex;
      folder.color = newHex;
      var found = allLoadedFolders.find(function (f) {
        return f.id === folder.id;
      });
      if (found) found.color = newHex;

      renderList();

      folderColorModal.hide();

      api("/folders/" + folder.id + "/color", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ color: newHex }),
      })
        .then(function (r) {
          if (!r.ok) throw new Error("Failed to save color");
          return r.json();
        })
        .then(function (updated) {
          if (updated && updated.color) {
            folder.color = updated.color;
            if (found) found.color = updated.color;
            renderList();
          }
        })
        .catch(function (err) {
          showMsg("Failed to update folder colour: " + (err.message || err), "error");
          loadVault();
        });
    };

    container.appendChild(btn);
  });

  folderColorModal.show();
}

var renameInput = document.getElementById("rename-input");

function openRenameModal(type, id, name) {
  closeAllMenus();
  pendingAction = { type: type, id: id, name: name };
  document.getElementById("rename-modal-title").textContent =
    "Rename " + (type === "folder" ? "Folder" : "File");
  renameInput.value = name;
  renameModal.show();
}

document.getElementById("renameModal").addEventListener("shown.bs.modal", function () {
  renameInput.focus();
  renameInput.select();
});

renameInput.addEventListener("keydown", function (e) {
  if (e.key === "Enter") {
    e.preventDefault();
    document.getElementById("confirm-rename-btn").click();
  }
});

document.getElementById("confirm-rename-btn").onclick = function () {
  if (!pendingAction) return;
  var newName = renameInput.value.trim();
  if (!newName) {
    showMsg("Name cant be empty.", "error");
    renameInput.focus();
    return;
  }

  var endpoint =
    pendingAction.type === "folder"
      ? "/folders/" + pendingAction.id + "/rename"
      : "/files/" + pendingAction.id + "/rename";

  api(endpoint, {
    method: "PATCH",
    body: JSON.stringify({ name: newName }),
  })
    .then(function (r) {
      return r.json();
    })
    .then(function (data) {
      renameModal.hide();
      if (data.error) showMsg(data.error, "error");
      else {
        showMsg("Renamed successfully.", "success");
        loadVault();
      }
    });
};

function openMoveModal(type, id, name) {
  closeAllMenus();
  pendingAction = { type: type, id: id, name: name };
  var select = document.getElementById("move-dest-folder-select");
  select.innerHTML = '<option value="">/root</option>';

  api("/folders?all=true")
    .then(function (r) {
      return r.json();
    })
    .then(function (folders) {
      folders.forEach(function (f) {
        if (type === "folder" && f.id === id) return;
        var opt = document.createElement("option");
        opt.value = f.id;
        opt.textContent = "/" + f.name;
        select.appendChild(opt);
      });
      moveModal.show();
    });
}

document.getElementById("confirm-move-btn").onclick = function () {
  if (!pendingAction) return;
  var targetFolderId = document.getElementById("move-dest-folder-select").value || null;

  if (pendingAction.type === "batch") {
    api("/files/batch/move", {
      method: "POST",
      body: JSON.stringify({
        fileIds: Array.from(selectedFileIds),
        folderIds: Array.from(selectedFolderIds),
        targetFolderId: targetFolderId,
      }),
    }).then(function () {
      moveModal.hide();
      showMsg("Items moved.", "success");
      loadVault();
    });
  } else if (pendingAction.type === "folder") {
    api("/folders/" + pendingAction.id + "/move", {
      method: "PATCH",
      body: JSON.stringify({ parentId: targetFolderId }),
    }).then(function () {
      moveModal.hide();
      showMsg("Folder moved.", "success");
      loadVault();
    });
  } else {
    api("/files/" + pendingAction.id + "/move", {
      method: "PATCH",
      body: JSON.stringify({ folderId: targetFolderId }),
    }).then(function () {
      moveModal.hide();
      showMsg("File moved.", "success");
      loadVault();
    });
  }
};

function openDeleteModal(type, id, name) {
  closeAllMenus();
  pendingAction = { type: type, id: id, name: name };
  document.getElementById("delete-file-name").textContent = "'" + name + "'";
  deleteModal.show();
}

document.getElementById("confirm-delete-btn").onclick = function () {
  if (!pendingAction) return;
  var endpoint =
    pendingAction.type === "folder" ? "/folders/" + pendingAction.id : "/files/" + pendingAction.id;

  api(endpoint, { method: "DELETE" })
    .then(function (r) {
      return r.json();
    })
    .then(function () {
      deleteModal.hide();
      showMsg("Item deleted permanently.", "success");
      loadVault();
      updateStorageStats();
    });
};

openChangePwBtn.onclick = function () {
  settingsOffcanvas.hide();
  document.getElementById("pw-current").value = "";
  document.getElementById("pw-new").value = "";
  document.getElementById("pw-confirm").value = "";
  changePasswordModal.show();
};

document.getElementById("confirm-change-pw-btn").onclick = function () {
  var currentPassword = document.getElementById("pw-current").value;
  var newPassword = document.getElementById("pw-new").value;
  var confirmPassword = document.getElementById("pw-confirm").value;

  if (!currentPassword || !newPassword) {
    showMsg("Enter in current and new password.", "error");
    showMsg("Please fill in current and new password.", "error");
    return;
  }
  if (newPassword !== confirmPassword) {
    showMsg("New passwords do not match.", "error");
    return;
  }
  if (newPassword.length < 8) {
    showMsg("New password must be at least 8 characters.", "error");
    return;
  }

  api("/auth/change-password", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ currentPassword: currentPassword, newPassword: newPassword }),
  })
    .then(function (r) {
      return r.json();
    })
    .then(function (data) {
      if (data.error) {
        showMsg(data.error, "error");
      } else {
        changePasswordModal.hide();
        showMsg("Password updated successfully.", "success");
      }
    });
};

openDeleteAccountBtn.onclick = function () {
  settingsOffcanvas.hide();
  document.getElementById("delete-account-password").value = "";
  deleteAccountModal.show();
};

document.getElementById("confirm-delete-account-btn").onclick = function () {
  var password = document.getElementById("delete-account-password").value;
  if (!password) {
    showMsg("Password required to delete account.", "error");
    return;
  }

  api("/auth/account", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password: password }),
  })
    .then(function (r) {
      return r.json();
    })
    .then(function (data) {
      if (data.error) {
        showMsg(data.error, "error");
      } else {
        deleteAccountModal.hide();
        alert("Account and data deleted.");
        window.location.href = "/login";
      }
    });
};

function formatMediaTime(secs) {
  if (isNaN(secs) || secs < 0) return "0:00";
  var m = Math.floor(secs / 60);
  var s = Math.floor(secs % 60);
  return m + ":" + (s < 10 ? "0" : "") + s;
}

function loadAudioTrack(idx) {
  if (currentAudioPlaylist.length === 0) return;
  if (idx < 0) idx = 0;
  if (idx >= currentAudioPlaylist.length) idx = currentAudioPlaylist.length - 1;
  currentAudioIndex = idx;

  var track = currentAudioPlaylist[currentAudioIndex];
  audioDock.classList.remove("d-none");
  audioDockTitle.textContent = track.original_name;
  audioTrackCounter.textContent = currentAudioIndex + 1 + " / " + currentAudioPlaylist.length;

  audioDockEl.src = "/api/files/" + track.id + "/preview";
  audioDockEl.play().catch(function () {});
  audioPlayPauseBtn.textContent = "Pause";

  audioPrevBtn.disabled = currentAudioIndex <= 0;
  audioNextBtn.disabled = currentAudioIndex >= currentAudioPlaylist.length - 1;
}

audioPlayPauseBtn.onclick = function () {
  if (audioDockEl.paused) {
    audioDockEl.play();
  } else {
    audioDockEl.pause();
  }
};

audioDockEl.onplay = function () {
  audioPlayPauseBtn.textContent = "Pause";
};

audioDockEl.onpause = function () {
  audioPlayPauseBtn.textContent = "Play";
};

audioDockEl.ontimeupdate = function () {
  if (!audioDockEl.duration) return;
  var pct = (audioDockEl.currentTime / audioDockEl.duration) * 100;
  audioProgressFill.style.width = pct + "%";
  audioCurrentTime.textContent = formatMediaTime(audioDockEl.currentTime);
};

audioDockEl.onloadedmetadata = function () {
  audioTotalTime.textContent = formatMediaTime(audioDockEl.duration);
};

audioDockEl.onended = function () {
  if (currentAudioIndex < currentAudioPlaylist.length - 1) {
    loadAudioTrack(currentAudioIndex + 1);
  } else {
    audioPlayPauseBtn.textContent = "Play";
  }
};

audioPrevBtn.onclick = function () {
  if (currentAudioIndex > 0) {
    loadAudioTrack(currentAudioIndex - 1);
  }
};

audioNextBtn.onclick = function () {
  if (currentAudioIndex < currentAudioPlaylist.length - 1) {
    loadAudioTrack(currentAudioIndex + 1);
  }
};

audioRwdBtn.onclick = function () {
  audioDockEl.currentTime = Math.max(0, audioDockEl.currentTime - 10);
};

audioFwdBtn.onclick = function () {
  if (audioDockEl.duration) {
    audioDockEl.currentTime = Math.min(audioDockEl.duration, audioDockEl.currentTime + 10);
  }
};

audioProgressWrap.onclick = function (e) {
  if (!audioDockEl.duration) return;
  var rect = audioProgressWrap.getBoundingClientRect();
  var clickX = e.clientX - rect.left;
  var ratio = Math.max(0, Math.min(1, clickX / rect.width));
  audioDockEl.currentTime = ratio * audioDockEl.duration;
};

audioMuteBtn.onclick = function () {
  audioDockEl.muted = !audioDockEl.muted;
  audioMuteBtn.textContent = audioDockEl.muted ? "Unmute" : "Mute";
};

audioVolumeSlider.oninput = function () {
  audioDockEl.volume = parseFloat(this.value);
  if (audioDockEl.muted && audioDockEl.volume > 0) {
    audioDockEl.muted = false;
    audioMuteBtn.textContent = "Mute";
  }
};

function loadVideoTrack(idx) {
  if (currentVideoPlaylist.length === 0) return;
  if (idx < 0) idx = 0;
  if (idx >= currentVideoPlaylist.length) idx = currentVideoPlaylist.length - 1;
  currentVideoIndex = idx;

  var item = currentVideoPlaylist[currentVideoIndex];
  videoModalTitle.textContent = item.original_name;
  videoCounterText.textContent = currentVideoIndex + 1 + " / " + currentVideoPlaylist.length;

  if (videoProgressFill) videoProgressFill.style.width = "0%";
  if (videoCurrentTime) videoCurrentTime.textContent = "0:00";
  if (videoTotalTime) videoTotalTime.textContent = "0:00";
  if (videoPlayPauseBtn) videoPlayPauseBtn.textContent = "Play";

  videoPlayerEl.src = "/api/files/" + item.id + "/preview";
  videoPlayerEl
    .play()
    .then(function () {
      if (videoPlayPauseBtn) videoPlayPauseBtn.textContent = "Pause";
    })
    .catch(function () {});

  videoPrevBtn.disabled = currentVideoIndex <= 0;
  videoNextBtn.disabled = currentVideoIndex >= currentVideoPlaylist.length - 1;
}

if (videoPlayPauseBtn && videoPlayerEl) {
  videoPlayPauseBtn.onclick = function () {
    if (videoPlayerEl.paused) {
      videoPlayerEl.play().catch(function () {});
    } else {
      videoPlayerEl.pause();
    }
  };

  videoPlayerEl.onclick = function () {
    if (videoPlayerEl.paused) {
      videoPlayerEl.play().catch(function () {});
    } else {
      videoPlayerEl.pause();
    }
  };

  videoPlayerEl.onplay = function () {
    if (videoPlayPauseBtn) videoPlayPauseBtn.textContent = "Pause";
  };

  videoPlayerEl.onpause = function () {
    if (videoPlayPauseBtn) videoPlayPauseBtn.textContent = "Play";
  };

  videoPlayerEl.ontimeupdate = function () {
    if (!videoPlayerEl.duration) return;
    var pct = (videoPlayerEl.currentTime / videoPlayerEl.duration) * 100;
    if (videoProgressFill) videoProgressFill.style.width = pct + "%";
    if (videoCurrentTime) videoCurrentTime.textContent = formatMediaTime(videoPlayerEl.currentTime);
  };

  videoPlayerEl.onloadedmetadata = function () {
    if (videoTotalTime) videoTotalTime.textContent = formatMediaTime(videoPlayerEl.duration);
  };

  videoPlayerEl.onended = function () {
    if (currentVideoIndex < currentVideoPlaylist.length - 1) {
      loadVideoTrack(currentVideoIndex + 1);
    } else {
      if (videoPlayPauseBtn) videoPlayPauseBtn.textContent = "Play";
    }
  };

  if (videoRwdBtn) {
    videoRwdBtn.onclick = function () {
      videoPlayerEl.currentTime = Math.max(0, videoPlayerEl.currentTime - 10);
    };
  }

  if (videoFwdBtn) {
    videoFwdBtn.onclick = function () {
      if (videoPlayerEl.duration) {
        videoPlayerEl.currentTime = Math.min(
          videoPlayerEl.duration,
          videoPlayerEl.currentTime + 10
        );
      }
    };
  }

  if (videoProgressWrap) {
    videoProgressWrap.onclick = function (e) {
      if (!videoPlayerEl.duration) return;
      var rect = videoProgressWrap.getBoundingClientRect();
      var clickX = e.clientX - rect.left;
      var ratio = Math.max(0, Math.min(1, clickX / rect.width));
      videoPlayerEl.currentTime = ratio * videoPlayerEl.duration;
    };
  }

  if (videoMuteBtn) {
    videoMuteBtn.onclick = function () {
      videoPlayerEl.muted = !videoPlayerEl.muted;
      videoMuteBtn.textContent = videoPlayerEl.muted ? "Unmute" : "Mute";
    };
  }

  if (videoVolumeSlider) {
    videoVolumeSlider.oninput = function () {
      videoPlayerEl.volume = parseFloat(this.value);
      if (videoPlayerEl.muted && videoPlayerEl.volume > 0) {
        videoPlayerEl.muted = false;
        if (videoMuteBtn) videoMuteBtn.textContent = "Mute";
      }
    };
  }

  if (videoFullscreenBtn) {
    videoFullscreenBtn.onclick = function () {
      var modalEl = document.getElementById("videoModal");
      var target = (modalEl && modalEl.querySelector(".modal-content")) || videoPlayerEl;
      if (!document.fullscreenElement) {
        if (target.requestFullscreen) {
          target.requestFullscreen();
        } else if (target.webkitRequestFullscreen) {
          target.webkitRequestFullscreen();
        }
      } else {
        if (document.exitFullscreen) {
          document.exitFullscreen();
        }
      }
    };
  }

  if (videoModalEl) {
    videoModalEl.addEventListener("hidden.bs.modal", function () {
      if (!isVideoMinimized) {
        videoPlayerEl.pause();
        videoPlayerEl.removeAttribute("src");
      }
    });
  }
}

videoPrevBtn.onclick = function () {
  if (currentVideoIndex > 0) {
    loadVideoTrack(currentVideoIndex - 1);
  }
};

videoNextBtn.onclick = function () {
  if (currentVideoIndex < currentVideoPlaylist.length - 1) {
    loadVideoTrack(currentVideoIndex + 1);
  }
};

function openPreview(file, allFiles) {
  closeAllMenus();
  var mime = (file.mime_type || "").toLowerCase();
  var streamUrl = "/api/files/" + file.id + "/preview";

  if (mime.startsWith("audio/")) {
    currentAudioPlaylist = (allFiles || []).filter(function (f) {
      return (f.mime_type || "").toLowerCase().startsWith("audio/");
    });
    currentAudioIndex = currentAudioPlaylist.findIndex(function (a) {
      return a.id === file.id;
    });
    if (currentAudioIndex === -1) currentAudioIndex = 0;
    loadAudioTrack(currentAudioIndex);
    return;
  }

  if (mime.startsWith("video/")) {
    currentVideoPlaylist = (allFiles || []).filter(function (f) {
      return (f.mime_type || "").toLowerCase().startsWith("video/");
    });
    currentVideoIndex = currentVideoPlaylist.findIndex(function (v) {
      return v.id === file.id;
    });
    if (currentVideoIndex === -1) currentVideoIndex = 0;
    videoModal.show();
    loadVideoTrack(currentVideoIndex);
    return;
  }

  if (mime.startsWith("image/")) {
    currentImageGallery = (allFiles || []).filter(function (f) {
      return (f.mime_type || "").toLowerCase().startsWith("image/");
    });
    currentImageIndex = currentImageGallery.findIndex(function (img) {
      return img.id === file.id;
    });
    if (currentImageIndex === -1) currentImageIndex = 0;
    updateLightbox();
    imageModal.show();
    return;
  }

  var isPdf = mime.includes("pdf");
  var isText =
    mime.includes("text/") ||
    mime.includes("json") ||
    mime.includes("javascript") ||
    file.original_name.endsWith(".txt") ||
    file.original_name.endsWith(".md") ||
    file.original_name.endsWith(".py") ||
    file.original_name.endsWith(".js") ||
    file.original_name.endsWith(".json");

  if (isPdf || isText) {
    document.getElementById("doc-modal-title").textContent = file.original_name;
    var pdfBox = document.getElementById("doc-pdf-container");
    var textBox = document.getElementById("doc-text-container");
    var iframe = document.getElementById("doc-pdf-iframe");

    if (isPdf) {
      pdfBox.classList.remove("d-none");
      textBox.classList.add("d-none");
      iframe.src = streamUrl;
    } else {
      pdfBox.classList.add("d-none");
      textBox.classList.remove("d-none");
      textBox.textContent = "Loading preview...";
      fetch(streamUrl)
        .then(function (r) {
          return r.text();
        })
        .then(function (t) {
          textBox.textContent = t;
        })
        .catch(function () {
          textBox.textContent = "Could not load preview.";
        });
    }
    docModal.show();
    return;
  }

  window.location.href = "/api/files/" + file.id;
}

function updateLightbox() {
  if (currentImageGallery.length === 0) return;
  var item = currentImageGallery[currentImageIndex];
  imageModalTitle.textContent = item.original_name;
  imageViewerEl.src = "/api/files/" + item.id + "/preview";
  imageCounterText.textContent = currentImageIndex + 1 + " / " + currentImageGallery.length;

  imagePrevBtn.disabled = currentImageIndex <= 0;
  imageNextBtn.disabled = currentImageIndex >= currentImageGallery.length - 1;
}

imagePrevBtn.onclick = function () {
  if (currentImageIndex > 0) {
    currentImageIndex--;
    updateLightbox();
  }
};

imageNextBtn.onclick = function () {
  if (currentImageIndex < currentImageGallery.length - 1) {
    currentImageIndex++;
    updateLightbox();
  }
};

var isVideoMinimized = false;
var videoModalMinimizeBtn = document.getElementById("video-modal-minimize");
var floatingVideoMini = document.getElementById("floating-video-mini");
var videoMiniViewport = document.getElementById("video-mini-viewport");
var videoMiniTitle = document.getElementById("video-mini-title");
var videoMiniExpandBtn = document.getElementById("video-mini-expand-btn");
var videoMiniCloseBtn = document.getElementById("video-mini-close-btn");
var videoMiniPlayBtn = document.getElementById("video-mini-play-btn");
var videoMiniTime = document.getElementById("video-mini-time");
var videoModalBody = document.querySelector("#videoModal .modal-body");

if (videoModalMinimizeBtn) {
  videoModalMinimizeBtn.onclick = function () {
    isVideoMinimized = true;
    videoModal.hide();
    if (floatingVideoMini && videoMiniViewport && videoPlayerEl) {
      floatingVideoMini.classList.remove("d-none");
      videoMiniViewport.appendChild(videoPlayerEl);
      if (videoMiniTitle) videoMiniTitle.textContent = videoModalTitle.textContent;
      if (videoMiniPlayBtn) videoMiniPlayBtn.textContent = videoPlayerEl.paused ? "Play" : "Pause";
    }
  };
}

if (videoMiniExpandBtn) {
  videoMiniExpandBtn.onclick = function () {
    isVideoMinimized = false;
    if (floatingVideoMini) floatingVideoMini.classList.add("d-none");
    if (videoModalBody && videoPlayerEl) {
      videoModalBody.appendChild(videoPlayerEl);
    }
    videoModal.show();
  };
}

if (videoMiniCloseBtn) {
  videoMiniCloseBtn.onclick = function () {
    isVideoMinimized = false;
    if (videoPlayerEl) {
      videoPlayerEl.pause();
      videoPlayerEl.removeAttribute("src");
    }
    if (floatingVideoMini) floatingVideoMini.classList.add("d-none");
    if (videoModalBody && videoPlayerEl) {
      videoModalBody.appendChild(videoPlayerEl);
    }
  };
}

if (videoMiniPlayBtn) {
  videoMiniPlayBtn.onclick = function () {
    if (!videoPlayerEl) return;
    if (videoPlayerEl.paused) {
      videoPlayerEl.play().catch(function () {});
    } else {
      videoPlayerEl.pause();
    }
  };
}

if (videoModalClose) {
  videoModalClose.onclick = function () {
    isVideoMinimized = false;
    videoPlayerEl.pause();
    videoPlayerEl.removeAttribute("src");
    if (floatingVideoMini) floatingVideoMini.classList.add("d-none");
  };
}

document.getElementById("videoModal").addEventListener("hidden.bs.modal", function () {
  if (!isVideoMinimized) {
    videoPlayerEl.pause();
    videoPlayerEl.removeAttribute("src");
    if (floatingVideoMini) floatingVideoMini.classList.add("d-none");
  }
});

videoPlayerEl.addEventListener("play", function () {
  if (videoPlayPauseBtn) videoPlayPauseBtn.textContent = "Pause";
  if (videoMiniPlayBtn) videoMiniPlayBtn.textContent = "Pause";
});
videoPlayerEl.addEventListener("pause", function () {
  if (videoPlayPauseBtn) videoPlayPauseBtn.textContent = "Play";
  if (videoMiniPlayBtn) videoMiniPlayBtn.textContent = "Play";
});
videoPlayerEl.addEventListener("timeupdate", function () {
  if (videoMiniTime && videoPlayerEl.duration) {
    videoMiniTime.textContent =
      formatDuration(videoPlayerEl.currentTime) + " / " + formatDuration(videoPlayerEl.duration);
  }
});

// Audio Mini-Pill Controls
var audioDockMinimizeBtn = document.getElementById("audio-dock-minimize");
var audioMiniPill = document.getElementById("audio-mini-pill");
var audioMiniTitle = document.getElementById("audio-mini-title");
var audioMiniPlayBtn = document.getElementById("audio-mini-play-btn");
var audioMiniExpandBtn = document.getElementById("audio-mini-expand-btn");
var audioMiniCloseBtn = document.getElementById("audio-mini-close-btn");

if (audioDockMinimizeBtn) {
  audioDockMinimizeBtn.onclick = function () {
    audioDock.classList.add("d-none");
    if (audioMiniPill) {
      audioMiniPill.classList.remove("d-none");
      if (audioMiniTitle) audioMiniTitle.textContent = audioDockTitle.textContent;
      if (audioMiniPlayBtn) audioMiniPlayBtn.textContent = audioDockEl.paused ? "Play" : "Pause";
    }
  };
}

if (audioMiniExpandBtn) {
  audioMiniExpandBtn.onclick = function () {
    if (audioMiniPill) audioMiniPill.classList.add("d-none");
    if (audioDock) audioDock.classList.remove("d-none");
  };
}

if (audioMiniCloseBtn) {
  audioMiniCloseBtn.onclick = function () {
    if (audioDockEl) {
      audioDockEl.pause();
      audioDockEl.removeAttribute("src");
    }
    if (audioMiniPill) audioMiniPill.classList.add("d-none");
  };
}

if (audioMiniPlayBtn) {
  audioMiniPlayBtn.onclick = function () {
    if (!audioDockEl) return;
    if (audioDockEl.paused) {
      audioDockEl.play().catch(function () {});
    } else {
      audioDockEl.pause();
    }
  };
}

audioDockClose.onclick = function () {
  audioDockEl.pause();
  audioDockEl.removeAttribute("src");
  audioDock.classList.add("d-none");
  if (audioMiniPill) audioMiniPill.classList.add("d-none");
};

audioDockEl.addEventListener("play", function () {
  if (audioPlayPauseBtn) audioPlayPauseBtn.textContent = "Pause";
  if (audioMiniPlayBtn) audioMiniPlayBtn.textContent = "Pause";
});
audioDockEl.addEventListener("pause", function () {
  if (audioPlayPauseBtn) audioPlayPauseBtn.textContent = "Play";
  if (audioMiniPlayBtn) audioMiniPlayBtn.textContent = "Play";
});

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
  if (!uploadTray.classList.contains("d-none")) return;
  uploadTray.classList.remove("tray-closing");
  uploadTray.classList.remove("d-none");
  uploadTray.classList.add("tray-opening");
  setTimeout(function () {
    uploadTray.classList.remove("tray-opening");
  }, 230);
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

  uploadTray.classList.remove("tray-opening");
  uploadTray.classList.add("tray-closing");
  setTimeout(function () {
    uploadTray.classList.remove("tray-closing");
    uploadTray.classList.add("d-none");
  }, 240);
}

if (closeUploadTrayBtn) {
  closeUploadTrayBtn.onclick = function () {
    closeUploadTrayWithAnimation();
  };
}

var notifToggleBtn = document.getElementById("notification-tray-toggle-btn");
if (notifToggleBtn) {
  notifToggleBtn.onclick = function () {
    var isHidden = uploadTray.classList.contains("d-none");
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
  row.innerHTML =
    '<div class="d-flex justify-content-between align-items-center mb-1 small">' +
    '<span class="fw-bold text-truncate" style="max-width: 220px;" title="' +
    escapeHtml(item.file.name) +
    '">' +
    escapeHtml(item.file.name) +
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

  var xhr = new XMLHttpRequest();
  nextItem.xhr = xhr;
  xhr.open("POST", "/api/files", true);
  xhr.withCredentials = true;

  xhr.upload.onprogress = function (evt) {
    if (evt.lengthComputable) {
      var pct = Math.round((evt.loaded / evt.total) * 100);
      nextItem.pct = pct;
      if (progressBar) progressBar.style.width = pct + "%";
      if (statusSpan) statusSpan.textContent = pct + "% (" + formatBytes(evt.loaded) + ")";
    }
  };

  xhr.onload = function () {
    activeUploadsCount--;
    if (xhr.status >= 200 && xhr.status < 300) {
      nextItem.status = "done";
      if (statusSpan) {
        statusSpan.textContent = "Done";
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

window.addEventListener("dragenter", function (e) {
  e.preventDefault();
  dragCounter++;
  dropOverlay.classList.remove("d-none");
});

window.addEventListener("dragleave", function (e) {
  e.preventDefault();
  dragCounter--;
  if (dragCounter <= 0) {
    dragCounter = 0;
    dropOverlay.classList.add("d-none");
  }
});

window.addEventListener("dragover", function (e) {
  e.preventDefault();
});

window.addEventListener("drop", function (e) {
  e.preventDefault();
  dragCounter = 0;
  dropOverlay.classList.add("d-none");

  if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
    enqueueFiles(Array.from(e.dataTransfer.files), currentFolderId);
  }
});

function escapeHtml(str) {
  if (!str) return "";
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

updateTrayEmptyState();

/* 
	TODO 500 ciggies
	this fuckass font doesnt render ... properly and theres probably 5 other places in this codebase with
	user facing strings that i missed fml
*/
