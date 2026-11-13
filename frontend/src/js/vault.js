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
var downloadFolderBtn = document.getElementById("download-folder-btn");
var searchInput = document.getElementById("search-input");
var typeFilter = document.getElementById("type-filter");
var sortSelect = document.getElementById("sort-select");
var newFolderBtn = document.getElementById("new-folder-btn");
var fileInput = document.getElementById("file-input");
var startUploadBtn = document.getElementById("start-upload-btn");
var uploadTray = document.getElementById("upload-tray");
var uploadTrayCount = document.getElementById("upload-tray-count");
var uploadTrayItems = document.getElementById("upload-tray-items");
var closeUploadTrayBtn = document.getElementById("close-upload-tray-btn");
var batchActionBar = document.getElementById("batch-action-bar");
var batchCountEl = document.getElementById("batch-count");
var selectAllFilesCheckbox = document.getElementById("select-all-files");
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

function loadVault() {
  selectedFileIds.clear();
  selectedFolderIds.clear();
  updateBatchBar();
  loadBreadcrumbs();

  var folderQuery = currentFolderId ? "?parentId=" + currentFolderId : "";
  var fileQuery = currentFolderId ? "?folderId=" + currentFolderId : "";

  if (currentFolderId) {
    downloadFolderBtn.classList.remove("d-none");
    downloadFolderBtn.onclick = function () {
      window.location.href = "/api/files/folder/" + currentFolderId + "/download";
    };
  } else {
    downloadFolderBtn.classList.add("d-none");
  }

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
  var grid = document.getElementById("folders-grid");
  var container = document.getElementById("folders-container");
  grid.innerHTML = "";

  var query = (searchInput.value || "").trim().toLowerCase();
  var filteredFolders = allLoadedFolders.filter(function (f) {
    if (!query) return true;
    return f.name.toLowerCase().includes(query);
  });

  if (filteredFolders.length === 0) {
    container.classList.add("d-none");
    return;
  }
  container.classList.remove("d-none");

  filteredFolders.forEach(function (folder) {
    var col = document.createElement("div");
    col.className = "col-12 col-sm-6 col-md-4 col-lg-3";

    var card = document.createElement("div");
    card.className =
      "folder-card d-flex align-items-center justify-content-between " +
      (selectedFolderIds.has(folder.id) ? "file-row-selected" : "");
    if (folder.color) {
      card.style.backgroundColor = folder.color;
    }

    var left = document.createElement("div");
    left.className = "d-flex align-items-center gap-2 text-truncate";

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

    var prefixSpan = document.createElement("span");
    prefixSpan.className = "text-muted small me-1";
    prefixSpan.textContent = "/";

    var nameSpan = document.createElement("span");
    nameSpan.className = "fw-bold text-truncate";
    nameSpan.innerHTML = highlightMatch(folder.name, query);
    nameSpan.title = folder.name;

    left.appendChild(chk);
    left.appendChild(prefixSpan);
    left.appendChild(nameSpan);

    card.onclick = function () {
      navigateToFolder(folder.id, folder.name);
    };

    var actions = document.createElement("div");
    actions.className = "dropdown";
    actions.onclick = function (e) {
      e.stopPropagation();
    };

    actions.innerHTML =
      '<button class="btn btn-sm btn-link text-dark p-0 dropdown-toggle-btn" data-bs-toggle="dropdown" data-bs-display="static" aria-expanded="false">⋮</button>' +
      '<ul class="dropdown-menu dropdown-menu-end shadow-sm">' +
      '<li><a class="dropdown-item rename-folder" href="#">Rename</a></li>' +
      '<li><a class="dropdown-item color-folder" href="#">Change Folder Colour</a></li>' +
      '<li><a class="dropdown-item move-folder" href="#">Move</a></li>' +
      '<li><a class="dropdown-item download-folder" href="#">Download folder</a></li>' +
      '<li><hr class="dropdown-divider"></li>' +
      '<li><a class="dropdown-item text-danger delete-folder" href="#">Delete</a></li>' +
      "</ul>";

    actions.addEventListener("show.bs.dropdown", function () {
      card.classList.add("dropdown-open");
    });
    actions.addEventListener("hide.bs.dropdown", function () {
      card.classList.remove("dropdown-open");
    });

    actions.querySelector(".rename-folder").onclick = function (e) {
      e.preventDefault();
      openRenameModal("folder", folder.id, folder.name);
    };
    actions.querySelector(".color-folder").onclick = function (e) {
      e.preventDefault();
      openFolderColorModal(folder);
    };
    actions.querySelector(".move-folder").onclick = function (e) {
      e.preventDefault();
      openMoveModal("folder", folder.id, folder.name);
    };
    actions.querySelector(".download-folder").onclick = function (e) {
      e.preventDefault();
      window.location.href = "/api/files/folder/" + folder.id + "/download";
    };
    actions.querySelector(".delete-folder").onclick = function (e) {
      e.preventDefault();
      openDeleteModal("folder", folder.id, folder.name);
    };

    card.appendChild(left);
    card.appendChild(actions);
    col.appendChild(card);
    grid.appendChild(col);
  });
}

function renderFiles() {
  var accordion = document.getElementById("filesAccordion");
  var emptyMsg = document.getElementById("file-list-empty");
  var fileCountBadge = document.getElementById("file-count");

  accordion.innerHTML = "";
  var query = (searchInput.value || "").trim().toLowerCase();
  var filterType = typeFilter.value;
  var sortVal = sortSelect.value;

  var filtered = allLoadedFiles.filter(function (file) {
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

  filtered.sort(function (a, b) {
    if (sortVal === "date-desc") return new Date(b.uploaded_at) - new Date(a.uploaded_at);
    if (sortVal === "date-asc") return new Date(a.uploaded_at) - new Date(b.uploaded_at);
    if (sortVal === "name-asc") return a.original_name.localeCompare(b.original_name);
    if (sortVal === "name-desc") return b.original_name.localeCompare(a.original_name);
    if (sortVal === "size-desc") return (b.size_bytes || 0) - (a.size_bytes || 0);
    if (sortVal === "size-asc") return (a.size_bytes || 0) - (b.size_bytes || 0);
    return 0;
  });

  fileCountBadge.textContent = filtered.length;

  if (filtered.length === 0) {
    if (emptyMsg) emptyMsg.classList.remove("d-none");
    return;
  }
  if (emptyMsg) emptyMsg.classList.add("d-none");

  filtered.forEach(function (file) {
    var item = document.createElement("div");
    item.className =
      "accordion-item border-0 border-bottom " +
      (selectedFileIds.has(file.id) ? "file-row-selected" : "");

    var headerId = "heading-" + file.id;
    var collapseId = "collapse-" + file.id;

    var header = document.createElement("h2");
    header.className = "accordion-header d-flex align-items-center";
    header.id = headerId;

    var selectChk = document.createElement("input");
    selectChk.type = "checkbox";
    selectChk.className = "form-check-input ms-3 me-1 mt-0";
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

    btn.innerHTML =
      '<div class="d-flex align-items-center justify-content-between w-100 me-3 text-truncate">' +
      '<div class="d-flex align-items-center gap-2 text-truncate">' +
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
    var exactBytes = Number(file.size_bytes || 0).toLocaleString();
    var shaShort = file.sha256 ? escapeHtml(file.sha256) : "n/a";

    var thumbHtml = "";
    if (isImage) {
      thumbHtml =
        '<div class="col-12 col-md-auto text-center">' +
        '<img src="/api/files/' +
        file.id +
        '/preview" class="rounded border border-dark shadow-sm" style="max-height: 90px; max-width: 130px; object-fit: contain; background: #fff;" alt="Thumbnail" />' +
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
      ' <span class="text-muted fw-normal" style="font-size: 0.75rem;">(' +
      exactBytes +
      " B)</span></span>" +
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
      '<span class="text-muted d-block small">SHA-256 Checksum</span>' +
      '<code class="d-inline-block small text-break p-1 bg-white border rounded" style="font-size: 0.72rem; word-break: break-all;">' +
      shaShort +
      "</code>" +
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

    body.querySelector(".play-preview-btn").onclick = function () {
      openPreview(file, filtered);
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

searchInput.oninput = function () {
  renderFolders();
  renderFiles();
};
typeFilter.onchange = renderFiles;
sortSelect.onchange = renderFiles;

function updateBatchBar() {
  var totalSelected = selectedFileIds.size + selectedFolderIds.size;
  batchCountEl.textContent = totalSelected;
  if (totalSelected > 0) {
    if (batchActionBar.classList.contains("d-none")) {
      batchActionBar.classList.remove("d-none");
      batchActionBar.classList.remove("animate-pop-in");
      void batchActionBar.offsetWidth;
      batchActionBar.classList.add("animate-pop-in");
    }
  } else {
    batchActionBar.classList.add("d-none");
    batchActionBar.classList.remove("animate-pop-in");
  }
}

selectAllFilesCheckbox.onclick = function () {
  var isChecked = selectAllFilesCheckbox.checked;
  allLoadedFiles.forEach(function (f) {
    if (isChecked) selectedFileIds.add(f.id);
    else selectedFileIds.delete(f.id);
  });
  renderFiles();
  updateBatchBar();
};

var batchSelectAllBtn = document.getElementById("batch-select-all-btn");
if (batchSelectAllBtn) {
  batchSelectAllBtn.onclick = function () {
    allLoadedFiles.forEach(function (f) {
      selectedFileIds.add(f.id);
    });
    selectAllFilesCheckbox.checked = true;
    renderFiles();
    updateBatchBar();
  };
}

var batchSelectAllFoldersBtn = document.getElementById("batch-select-all-folders-btn");
if (batchSelectAllFoldersBtn) {
  batchSelectAllFoldersBtn.onclick = function () {
    allLoadedFolders.forEach(function (fo) {
      selectedFolderIds.add(fo.id);
    });
    renderFolders();
    updateBatchBar();
  };
}

document.querySelectorAll("[data-select-type]").forEach(function (btn) {
  btn.onclick = function () {
    var type = btn.getAttribute("data-select-type");
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
      }
    });
    renderFiles();
    updateBatchBar();
  };
});

document.getElementById("batch-cancel-btn").onclick = function () {
  selectedFileIds.clear();
  selectedFolderIds.clear();
  selectAllFilesCheckbox.checked = false;
  renderFolders();
  renderFiles();
  updateBatchBar();
};

document.getElementById("batch-download-btn").onclick = function () {
  if (selectedFileIds.size === 0 && selectedFolderIds.size === 0) return;
  fetch("/api/files/batch/download-zip", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      fileIds: Array.from(selectedFileIds),
      folderIds: Array.from(selectedFolderIds),
    }),
  })
    .then(function (res) {
      if (!res.ok) throw new Error("Download error");
      return res.blob();
    })
    .then(function (blob) {
      var url = window.URL.createObjectURL(blob);
      var a = document.createElement("a");
      a.href = url;
      a.download = "pinkbox_selection_" + Date.now() + ".zip";
      document.body.appendChild(a);
      a.click();
      a.remove();
    })
    .catch(function (err) {
      console.error(err);
      showMsg("Failed to download selected items as archive", "error");
    });
};

document.getElementById("batch-delete-btn").onclick = function () {
  if (selectedFileIds.size === 0 && selectedFolderIds.size === 0) return;
  if (
    !confirm(
      "fuck em all? southern style lemon peppers style?"
    )
  )
    return;

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
      api("/folders/" + folder.id + "/color", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ color: c.hex }),
      })
        .then(function (r) {
          return r.json();
        })
        .then(function () {
          folderColorModal.hide();
          folder.color = c.hex;
          loadVault();
        })
        .catch(function (err) {
          folderColorModal.hide();
          showMsg("Failed to update folder colour: " + (err.message || err), "error");
        });
    };

    container.appendChild(btn);
  });

  folderColorModal.show();
}

var renameInput = document.getElementById("rename-input");

function openRenameModal(type, id, name) {
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

  videoPlayerEl.src = "/api/files/" + item.id + "/preview";
  videoPlayerEl.play().catch(function () {});

  videoPrevBtn.disabled = currentVideoIndex <= 0;
  videoNextBtn.disabled = currentVideoIndex >= currentVideoPlaylist.length - 1;
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

videoModalClose.onclick = function () {
  videoPlayerEl.pause();
  videoPlayerEl.removeAttribute("src");
};
document.getElementById("videoModal").addEventListener("hidden.bs.modal", function () {
  videoPlayerEl.pause();
  videoPlayerEl.removeAttribute("src");
});

audioDockClose.onclick = function () {
  audioDockEl.pause();
  audioDockEl.removeAttribute("src");
  audioDock.classList.add("d-none");
};

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

closeUploadTrayBtn.onclick = function () {
  uploadTray.classList.add("d-none");
};

function enqueueFiles(files, targetFolderId) {
  if (!files || files.length === 0) return;
  uploadTray.classList.remove("d-none");

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
  uploadTrayCount.textContent = remaining;
}

function renderTrayItem(item) {
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


  /* TODO 500 ciggies
	this fuckass font doesnt render ... properly and theres probably 5 other places in this codebase with
	user facing strings that i missed fml
	*/