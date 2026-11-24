var vaultCurrentPage = 1;
var vaultPageSize = parseInt(
  localStorage.getItem(
    currentViewMode === "grid" ? "vault_page_size_grid" : "vault_page_size_list"
  ),
  10
);
if (!vaultPageSize && currentViewMode !== "grid") {
  vaultPageSize = parseInt(localStorage.getItem("vault_page_size"), 10);
}
if (currentViewMode === "grid" && [24, 48].indexOf(vaultPageSize) === -1) vaultPageSize = 48;
if (currentViewMode !== "grid" && [25, 50, 100, 200].indexOf(vaultPageSize) === -1)
  vaultPageSize = 50;

function updateVaultPageSizeOptions() {
  document.querySelectorAll("[data-vault-page-size]").forEach(function (option) {
    var size = parseInt(option.getAttribute("data-vault-page-size"), 10);
    var visible =
      currentViewMode === "grid"
        ? size === 24 || size === 48
        : [25, 50, 100, 200].indexOf(size) !== -1;
    option.closest("li").classList.toggle("d-none", !visible);
  });
}

function updateVaultPagination(totalItems) {
  var totalPages = Math.max(1, Math.ceil(totalItems / vaultPageSize));
  vaultCurrentPage = Math.min(Math.max(1, vaultCurrentPage), totalPages);
  var start = totalItems === 0 ? 0 : (vaultCurrentPage - 1) * vaultPageSize + 1;
  var end = Math.min(vaultCurrentPage * vaultPageSize, totalItems);
  var info = document.getElementById("vault-pagination-info");
  var indicator = document.getElementById("vault-page-indicator");
  var previous = document.getElementById("vault-page-prev");
  var next = document.getElementById("vault-page-next");
  var sizeButton = document.getElementById("vault-page-size-btn");
  if (info)
    info.textContent = totalItems
      ? "Showing " + start + "–" + end + " of " + totalItems + " items"
      : "Showing 0 items";
  if (indicator) indicator.textContent = "Page " + vaultCurrentPage + " of " + totalPages;
  if (previous) previous.disabled = vaultCurrentPage <= 1;
  if (next) next.disabled = vaultCurrentPage >= totalPages;
  if (sizeButton) sizeButton.textContent = vaultPageSize + " per page";
}

var vaultPreviousPageBtn = document.getElementById("vault-page-prev");
var vaultNextPageBtn = document.getElementById("vault-page-next");
if (vaultPreviousPageBtn)
  vaultPreviousPageBtn.onclick = function () {
    if (vaultCurrentPage > 1) {
      vaultCurrentPage--;
      renderList();
    }
  };
if (vaultNextPageBtn)
  vaultNextPageBtn.onclick = function () {
    vaultCurrentPage++;
    renderList();
  };
document.querySelectorAll("[data-vault-page-size]").forEach(function (option) {
  option.onclick = function () {
    var selectedSize = parseInt(option.getAttribute("data-vault-page-size"), 10);
    var validSizes = currentViewMode === "grid" ? [24, 48] : [25, 50, 100, 200];
    if (validSizes.indexOf(selectedSize) === -1) return;
    vaultPageSize = selectedSize;
    vaultCurrentPage = 1;
    localStorage.setItem(
      currentViewMode === "grid" ? "vault_page_size_grid" : "vault_page_size_list",
      String(vaultPageSize)
    );
    if (currentViewMode !== "grid") localStorage.setItem("vault_page_size", String(vaultPageSize));
    renderList();
  };
});
updateVaultPageSizeOptions();

function renderList() {
  var accordion = document.getElementById("filesAccordion");
  var emptyMsg = document.getElementById("file-list-empty");

  var query = (searchInput.value || "").trim().toLowerCase();
  var filterType = currentFilterVal || (typeFilter ? typeFilter.value : "all");
  var sortVal = currentSortVal || (sortSelect ? sortSelect.value : "date-desc");
  var renderConfigurationChanged =
    renderList._lastShowThumbnails !== showThumbnails ||
    renderList._lastViewMode !== currentViewMode;

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

  var revealIds = window.vaultRevealUploadedFileIds || [];
  if (revealIds.length) {
    var revealedIndex = filteredFiles.findIndex(function (file) {
      return revealIds.indexOf(file.id) !== -1;
    });
    if (revealedIndex !== -1) {
      vaultCurrentPage = Math.floor((filteredFolders.length + revealedIndex) / vaultPageSize) + 1;
      window.vaultRevealUploadedFileIds = [];
    }
  }

  var totalItems = filteredFolders.length + filteredFiles.length;
  updateVaultPagination(totalItems);
  var pageStart = (vaultCurrentPage - 1) * vaultPageSize;
  var pageItems = filteredFolders
    .map(function (item) {
      return { kind: "folder", value: item };
    })
    .concat(
      filteredFiles.map(function (item) {
        return { kind: "file", value: item };
      })
    )
    .slice(pageStart, pageStart + vaultPageSize);
  var visibleFolders = pageItems
    .filter(function (item) {
      return item.kind === "folder";
    })
    .map(function (item) {
      return item.value;
    });
  var visibleFiles = pageItems
    .filter(function (item) {
      return item.kind === "file";
    })
    .map(function (item) {
      return item.value;
    });

  var prevMap = new Map();
  var prevElements = accordion.querySelectorAll("[data-item-key]:not(.item-ghost-disappearing)");
  var newKeys = new Set();
  visibleFolders.forEach(function (f) {
    newKeys.add("folder-" + f.id);
  });
  visibleFiles.forEach(function (f) {
    newKeys.add("file-" + f.id);
  });

  var disappearingGhosts = [];
  var accordionRect = accordion.getBoundingClientRect();
  var existingNodes = new Map();

  prevElements.forEach(function (el) {
    var key = el.getAttribute("data-item-key");
    if (!key) return;
    var rect = el.getBoundingClientRect();
    prevMap.set(key, rect);
    if (!renderConfigurationChanged) {
      existingNodes.set(key, el);
    }

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
      renderGrid(visibleFolders, visibleFiles, query, accordion, existingNodes);
    } else {
      renderListView(visibleFolders, visibleFiles, query, accordion, existingNodes);
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

  renderList._lastShowThumbnails = showThumbnails;
  renderList._lastViewMode = currentViewMode;

  var newElements = accordion.querySelectorAll("[data-item-key]:not(.item-ghost-disappearing)");
  if (prevMap.size > 0 && newElements.length > 0) {
    newElements.forEach(function (el) {
      var key = el.getAttribute("data-item-key");
      var firstRect = prevMap.get(key);
      if (firstRect) {
        var lastRect = el.getBoundingClientRect();
        var dx = firstRect.left - lastRect.left;
        var dy = firstRect.top - lastRect.top;
        if (Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5 || renderConfigurationChanged) {
          el.style.transform = "translate(" + dx + "px, " + dy + "px)";
          if (renderConfigurationChanged) {
            el.style.opacity = "0.4";
          }
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
            el.style.opacity = "";
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

  if (typeof handleDropDataTransfer === "function") {
    handleDropDataTransfer(e.dataTransfer, folder.id);
  } else if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
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
      b.className =
        "context-menu-item" + (opt.danger ? " text-danger" : opt.share ? " text-share" : "");
      b.textContent = opt.text;
      b.onclick = function () {
        closeContextMenu();
        opt.action();
      };
      contextMenuItems.appendChild(b);
    });
  } else if (type === "file") {
    var opts = [];
    opts.push({
      text: "Share",
      share: true,
      action: function () {
        openShareModal(item);
      },
    });
    opts.push({
      text: "Download",
      action: function () {
        window.location.href = getFileDownloadUrl(item);
      },
    });
    opts.push({
      text: "File Details ⓘ",
      action: function () {
        showFileDetails(item, allLoadedFiles);
      },
    });
    opts.push({ divider: true });
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
      b.className =
        "context-menu-item" + (opt.danger ? " text-danger" : opt.share ? " text-share" : "");
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

window.handleModalCoverError = function (img) {
  if (!img) return;
  img.onerror = null;
  var mime = img.getAttribute("data-mime") || "";
  var name = img.getAttribute("data-name") || "";
  var iconUrl =
    typeof getFileIconUrl === "function"
      ? getFileIconUrl(mime, name)
      : "/src/assets/icons/file-audio.png";
  var parent = img.parentElement;
  if (parent) {
    parent.innerHTML =
      '<div class="d-inline-flex align-items-center justify-content-center rounded border border-dark shadow-sm p-3" style="background: #f8f9fa; min-width: 90px; min-height: 90px;">' +
      '<img src="' +
      iconUrl +
      '" class="file-icon-img" style="width: 48px; height: 48px; image-rendering: pixelated; object-fit: contain;" alt="" />' +
      "</div>";
  }
};

document.addEventListener("click", function (e) {
  var target = e.target.closest(".meta-copyable");
  if (!target) return;
  var textToCopy = target.getAttribute("data-copy-val");
  if (!textToCopy) return;

  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(textToCopy).catch(function () {});
  }

  var existingToast = target.querySelector(".meta-copy-toast");
  if (!existingToast) {
    existingToast = document.createElement("span");
    existingToast.className = "meta-copy-toast";
    existingToast.textContent = "Copied!";
    target.appendChild(existingToast);
  }
  existingToast.classList.remove("show-toast");
  void existingToast.offsetWidth;
  existingToast.classList.add("show-toast");
  setTimeout(function () {
    existingToast.classList.remove("show-toast");
  }, 1200);

  if (typeof showToast === "function") {
    showToast(
      "Copied: " + (textToCopy.length > 25 ? textToCopy.slice(0, 25) + "..." : textToCopy),
      "info"
    );
  }
});

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

function buildFileMetadataHtml(file, options) {
  var meta = file.metadata || {};
  var mime = (file.mime_type || "").toLowerCase();
  var nameLower = (file.original_name || "").toLowerCase();

  var badges = [];

  if (meta.audioFormat) badges.push({ text: meta.audioFormat, cls: "meta-badge-pink" });
  if (meta.duration) badges.push({ text: meta.duration, cls: "meta-badge-yellow" });
  if (meta.bitrate) badges.push({ text: meta.bitrate, cls: "meta-badge-cyan" });
  if (meta.sampleRate) badges.push({ text: meta.sampleRate, cls: "meta-badge-green" });
  if (meta.channels) badges.push({ text: meta.channels, cls: "meta-badge-purple" });
  if (meta.bitsPerSample) badges.push({ text: meta.bitsPerSample, cls: "meta-badge-cyan" });

  if (meta.quality) badges.push({ text: meta.quality, cls: "meta-badge-pink" });
  if (meta.resolution && !meta.quality)
    badges.push({ text: meta.resolution, cls: "meta-badge-pink" });
  if (meta.aspectRatio) badges.push({ text: meta.aspectRatio, cls: "meta-badge-yellow" });
  if (meta.videoFormat) badges.push({ text: meta.videoFormat, cls: "meta-badge-cyan" });

  if (meta.format && (mime.startsWith("image/") || meta.category === "image")) {
    badges.push({ text: meta.format, cls: "meta-badge-pink" });
  }
  if (meta.megapixels) badges.push({ text: meta.megapixels + " MP", cls: "meta-badge-green" });
  if (meta.resolution && (mime.startsWith("image/") || meta.category === "image")) {
    badges.push({ text: meta.resolution, cls: "meta-badge-yellow" });
  }

  if (meta.pdfVersion) badges.push({ text: meta.pdfVersion, cls: "meta-badge-pink" });
  if (meta.pageCount)
    badges.push({
      text: meta.pageCount + (meta.pageCount === 1 ? " page" : " pages"),
      cls: "meta-badge-yellow",
    });
  if (meta.syntax) badges.push({ text: meta.syntax, cls: "meta-badge-cyan" });
  if (meta.lineCount) badges.push({ text: meta.lineCount + " lines", cls: "meta-badge-green" });
  if (meta.wordCount) badges.push({ text: meta.wordCount + " words", cls: "meta-badge-yellow" });

  if (meta.fileCount) badges.push({ text: meta.fileCount + " files", cls: "meta-badge-cyan" });
  if (meta.compressionRatio)
    badges.push({ text: "-" + meta.compressionRatio, cls: "meta-badge-green" });

  var badgesHtml = "";
  if (badges.length > 0) {
    badgesHtml =
      '<div class="meta-badges-row mb-2">' +
      badges
        .map(function (b) {
          return (
            '<span class="meta-badge ' +
            b.cls +
            ' meta-copyable" data-copy-val="' +
            escapeHtml(b.text) +
            '" title="Click to copy: ' +
            escapeHtml(b.text) +
            '" role="button" tabindex="0">' +
            escapeHtml(b.text) +
            "</span>"
          );
        })
        .join("") +
      "</div>";
  }

  function buildMetaItem(label, val, mono, fullWidth) {
    if (!val) return "";
    var displayVal = String(val);
    var copyVal = String(val);
    return (
      '<div class="metadata-item meta-copyable' +
      (fullWidth ? ' style="grid-column: 1 / -1;"' : "") +
      '" data-copy-val="' +
      escapeHtml(copyVal) +
      '" title="Click to copy: ' +
      escapeHtml(copyVal) +
      '" role="button" tabindex="0">' +
      '<span class="metadata-item-label">' +
      escapeHtml(label) +
      "</span>" +
      '<span class="metadata-item-value' +
      (mono ? " font-mono" : "") +
      '">' +
      escapeHtml(displayVal) +
      "</span>" +
      "</div>"
    );
  }

  var musicItemsHtml = "";
  var hasMusicTags =
    meta.title ||
    meta.artist ||
    meta.album ||
    meta.genre ||
    meta.year ||
    meta.track ||
    meta.composer;
  if (hasMusicTags) {
    musicItemsHtml =
      '<div class="metadata-sub-header" style="color: #d63384; border-color: #ffb6c1;">' +
      '<img src="/src/assets/icons/file-audio.png" width="13" height="13" style="image-rendering: pixelated; object-fit: contain;" alt="" />' +
      "<span>Embedded Metadata</span>" +
      "</div>" +
      '<div class="metadata-grid mb-2">' +
      buildMetaItem("Track Title", meta.title) +
      buildMetaItem("Artist", meta.artist) +
      buildMetaItem("Album", meta.album) +
      (meta.albumArtist && meta.albumArtist !== meta.artist
        ? buildMetaItem("Album Artist", meta.albumArtist)
        : "") +
      buildMetaItem("Genre", meta.genre) +
      buildMetaItem("Release Year", meta.year, true) +
      buildMetaItem("Track #", meta.track, true) +
      buildMetaItem("Composer", meta.composer) +
      (meta.comment ? buildMetaItem("Comment", meta.comment, false, true) : "") +
      "</div>";
  }

  var nonBadgeTechHtml = "";
  var techItems = [];

  if (meta.cameraMake || meta.cameraModel) {
    techItems.push({
      label: "Camera",
      value: [meta.cameraMake, meta.cameraModel].filter(Boolean).join(" "),
    });
  }
  if (meta.lens || meta.focalLength)
    techItems.push({ label: "Focal Length", value: meta.focalLength || meta.lens });
  if (meta.aperture) techItems.push({ label: "Aperture", value: meta.aperture, mono: true });
  if (meta.exposureTime)
    techItems.push({ label: "Shutter Speed", value: meta.exposureTime, mono: true });
  if (meta.iso) techItems.push({ label: "ISO", value: "ISO " + meta.iso, mono: true });
  if (meta.dateTaken) techItems.push({ label: "Date Taken", value: meta.dateTaken });

  if (meta.author) techItems.push({ label: "Document Author", value: meta.author });
  if (meta.nonEmptyLines)
    techItems.push({
      label: "Non-Empty Lines",
      value: meta.nonEmptyLines.toLocaleString(),
      mono: true,
    });
  if (meta.charCount)
    techItems.push({
      label: "Character Count",
      value: meta.charCount.toLocaleString() + " chars",
      mono: true,
    });
  if (meta.encoding) techItems.push({ label: "Encoding", value: meta.encoding, mono: true });

  if (meta.uncompressedSize) {
    techItems.push({
      label: "Uncompressed Size",
      value:
        meta.uncompressedSize +
        (meta.compressionRatio ? " (saved " + meta.compressionRatio + ")" : ""),
    });
  }

  if (techItems.length > 0) {
    nonBadgeTechHtml =
      '<div class="metadata-grid mb-2">' +
      techItems
        .map(function (item) {
          return buildMetaItem(item.label, item.value, item.mono);
        })
        .join("") +
      "</div>";
  }

  var techSpecsHtml = "";
  if (nonBadgeTechHtml) {
    techSpecsHtml =
      '<div class="metadata-sub-header">' +
      '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line></svg>' +
      "<span>File Specifications</span>" +
      "</div>" +
      nonBadgeTechHtml;
  }

  var storageDetailsHtml =
    '<div class="metadata-sub-header">' +
    '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><ellipse cx="12" cy="5" rx="9" ry="3"></ellipse><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"></path><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"></path></svg>' +
    "<span>File Details</span>" +
    "</div>" +
    '<div class="metadata-grid">' +
    buildMetaItem("File Name", file.original_name) +
    buildMetaItem("File Size", formatBytes(file.size_bytes), true) +
    buildMetaItem("MIME Type", file.mime_type || "Unknown", true) +
    buildMetaItem("Uploaded Date", formatDate(file.uploaded_at) || "Unknown") +
    '<div class="metadata-item" style="grid-column: 1 / -1;">' +
    '<span class="metadata-item-label mb-1">SHA-256 Checksum</span>' +
    (file.sha256
      ? '<div class="sha-copy-box position-relative" role="button" tabindex="0" title="Click to copy!">' +
        '<code class="sha-hash-text font-monospace small text-break p-2 rounded d-block" style="font-size: 0.72rem; word-break: break-all;">' +
        escapeHtml(file.sha256) +
        "</code>" +
        '<div class="sha-overlay">' +
        '<span class="sha-overlay-text fw-bold">Click to copy!</span>' +
        "</div>" +
        "</div>"
      : '<code class="small text-break p-2 bg-light border border-dark rounded d-block text-muted" style="font-size: 0.72rem;">n/a</code>') +
    "</div>" +
    "</div>";

  return (
    '<div class="metadata-container">' +
    '<div class="metadata-card mb-2">' +
    '<div class="metadata-card-header">' +
    '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line></svg>' +
    "<span>Item Information</span>" +
    "</div>" +
    badgesHtml +
    musicItemsHtml +
    techSpecsHtml +
    storageDetailsHtml +
    "</div>" +
    "</div>"
  );
}

function showFileDetails(file, allFiles) {
  closeAllMenus();
  var modalEl = document.getElementById("fileDetailsModal");
  if (!modalEl) return;
  var titleEl = document.getElementById("file-details-title");
  var bodyEl = document.getElementById("file-details-body");

  titleEl.textContent = file.original_name;

  var mime = (file.mime_type || "").toLowerCase();
  var nameLower = (file.original_name || "").toLowerCase();
  var isImg = mime.startsWith("image/");
  var isVid = mime.startsWith("video/");
  var isAudio =
    mime.startsWith("audio/") ||
    nameLower.endsWith(".mp3") ||
    nameLower.endsWith(".m4a") ||
    nameLower.endsWith(".flac") ||
    nameLower.endsWith(".wav") ||
    nameLower.endsWith(".ogg");
  var thumbPreview = "";
  if (isImg) {
    thumbPreview =
      '<div class="text-center mb-3">' +
      '<div class="d-inline-block details-preview-clickable" style="cursor: pointer;" title="Click to open preview">' +
      '<img src="/api/files/' +
      file.id +
      '/preview" class="rounded border border-dark shadow-sm" style="max-height: 160px; max-width: 100%; object-fit: contain; background: #f8f9fa;" alt="" loading="lazy" />' +
      "</div>" +
      "</div>";
  } else if (isVid) {
    thumbPreview =
      '<div class="text-center mb-3">' +
      '<div class="d-inline-block details-preview-clickable" style="cursor: pointer;" title="Click to open preview">' +
      '<video src="/api/files/' +
      file.id +
      '/preview#t=0.5" class="rounded border border-dark shadow-sm" style="max-height: 160px; max-width: 100%; object-fit: contain; background: #ffffff; pointer-events: none;" preload="metadata" muted playsinline></video>' +
      "</div>" +
      "</div>";
  } else if (isAudio) {
    thumbPreview =
      '<div class="text-center mb-3">' +
      '<div class="d-inline-block details-preview-clickable" style="cursor: pointer;" title="Click to open preview">' +
      '<img src="/api/files/' +
      file.id +
      '/cover" class="rounded border border-dark shadow-sm" style="max-height: 140px; max-width: 140px; object-fit: cover; background: #f8f9fa;" alt=""' +
      ' data-mime="' +
      escapeHtml(file.mime_type || "") +
      '"' +
      ' data-name="' +
      escapeHtml(file.original_name || "") +
      '"' +
      ' onerror="window.handleModalCoverError(this)" />' +
      "</div>" +
      "</div>";
  } else {
    thumbPreview =
      '<div class="text-center mb-3">' +
      '<div class="d-inline-flex align-items-center justify-content-center rounded border border-dark shadow-sm p-3 details-preview-clickable" style="background: #f8f9fa; min-width: 90px; min-height: 90px; cursor: pointer;" title="Click to open preview">' +
      '<img src="' +
      getFileIconUrl(file.mime_type, file.original_name) +
      '" class="file-icon-img" style="width: 48px; height: 48px; image-rendering: pixelated; object-fit: contain;" alt="" />' +
      "</div>" +
      "</div>";
  }

  bodyEl.innerHTML =
    thumbPreview +
    '<div id="details-meta-mount">' +
    buildFileMetadataHtml(file) +
    "</div>" +
    '<div class="pt-3 mt-2 border-top d-flex flex-wrap gap-2 align-items-center">' +
    '<button type="button" class="btn btn-sm btn-white border border-dark py-1 px-2 fw-bold" id="details-rename-btn">Rename</button>' +
    '<button type="button" class="btn btn-sm btn-white border border-dark py-1 px-2 fw-bold" id="details-move-btn">Move</button>' +
    '<button type="button" class="btn btn-sm btn-white border border-dark py-1 px-2 fw-bold" id="details-share-inline-btn">Share</button>' +
    '<button type="button" class="btn btn-sm btn-primary py-1 px-2 fw-bold" id="details-preview-inline-btn">Preview</button>' +
    '<a href="#" class="btn btn-sm btn-white border border-dark py-1 px-2 fw-bold" id="details-download-inline-btn">Download</a>' +
    '<button type="button" class="btn btn-sm btn-outline-danger py-1 px-2 fw-bold ms-auto" id="details-delete-btn">Delete</button>' +
    "</div>";

  bodyEl.querySelectorAll(".details-preview-clickable").forEach(function (el) {
    el.onclick = function () {
      var modalInstance = bootstrap.Modal.getInstance(modalEl);
      if (modalInstance) modalInstance.hide();
      openPreview(file, allFiles || [file]);
    };
  });

  attachShaCopyHandler(bodyEl.querySelector(".sha-copy-box"), file.sha256);

  if (!file.metadata || Object.keys(file.metadata).length === 0) {
    fetch("/api/files/" + file.id + "/metadata")
      .then(function (r) {
        return r.json();
      })
      .then(function (data) {
        if (data && data.metadata) {
          file.metadata = data.metadata;
          var mount = bodyEl.querySelector("#details-meta-mount");
          if (mount) {
            mount.innerHTML = buildFileMetadataHtml(file);
            attachShaCopyHandler(mount.querySelector(".sha-copy-box"), file.sha256);
          }
        }
      })
      .catch(function () {});
  }

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
  var shareInlineBtn = bodyEl.querySelector("#details-share-inline-btn");
  if (shareInlineBtn) {
    shareInlineBtn.onclick = function () {
      bootstrap.Modal.getInstance(modalEl).hide();
      openShareModal(file);
    };
  }
  var previewInlineBtn = bodyEl.querySelector("#details-preview-inline-btn");
  if (previewInlineBtn) {
    previewInlineBtn.onclick = function () {
      bootstrap.Modal.getInstance(modalEl).hide();
      openPreview(file, allFiles || [file]);
    };
  }
  var downloadInlineBtn = bodyEl.querySelector("#details-download-inline-btn");
  if (downloadInlineBtn) {
    downloadInlineBtn.href = getFileDownloadUrl(file);
  }

  bootstrap.Modal.getOrCreateInstance(modalEl).show();
}
