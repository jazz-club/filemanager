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
  var startedAt = performance.now();

  var opts = fetchOptions || { method: "GET" };
  opts.credentials = "include";
  opts.headers = opts.headers || {};
  var token = getCsrfToken();
  if (token && (opts.method || "GET").toUpperCase() === "POST") {
    if (!opts.headers["X-CSRF-Token"]) {
      opts.headers["X-CSRF-Token"] = token;
    }
  }

  fetch(url, opts)
    .then(function (res) {
      if (!res.ok) {
        throw new Error("Server responded with HTTP " + res.status);
      }
      var contentLength =
        +res.headers.get("content-length") || +res.headers.get("x-download-size") || 0;
      var estimatedLength = !res.headers.get("content-length") && contentLength > 0;
      var reader = res.body.getReader();
      var receivedBytes = 0;
      var chunks = [];

      function pump() {
        return reader.read().then(function (result) {
          if (result.done) {
            barEl.style.width = "100%";
            barEl.className = "progress-bar bg-success";
            statusEl.textContent =
              "✓ Ready · " +
              formatBytes(receivedBytes) +
              " · " +
              formatTransferDuration((performance.now() - startedAt) / 1000);
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
            var status = pct + "% (" + formatBytes(receivedBytes);
            if (estimatedLength) status += " / ~" + formatBytes(contentLength);
            status += ")";
            var elapsed = (performance.now() - startedAt) / 1000;
            if (contentLength >= 5 * 1024 * 1024 && elapsed >= 0.5 && receivedBytes > 0) {
              var speed = receivedBytes / elapsed;
              status +=
                " · " + formatTransferDuration((contentLength - receivedBytes) / speed) + " left";
            }
            statusEl.textContent = status;
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
  rootBtn.innerHTML =
    '<img src="/src/assets/icons/lib/SVG/regular/home.svg" width="14" height="14" style="vertical-align: -2px; margin-right: 4px;" alt="" />/root';
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

function getFileUnicodeIcon(mime, name) {
  return (
    '<img src="' +
    getFileIconUrl(mime, name) +
    '" class="file-icon-img" alt="" width="20" height="20" style="image-rendering: pixelated; object-fit: contain; vertical-align: middle; flex-shrink: 0;" />'
  );
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
            '<div class="w-100 h-100 d-flex align-items-center justify-content-center">' +
            '<img src="/src/assets/icons/file-video.png" class="grid-file-icon-img" alt="Video icon" style="width: 48px; height: 48px; image-rendering: pixelated; object-fit: contain;" />' +
            "</div>";
        });

        container.innerHTML = "";
        container.appendChild(vid);
      });
    },
    { rootMargin: "300px 0px" }
  );
}
