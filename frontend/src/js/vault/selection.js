var searchDebounceTimer = null;
searchInput.oninput = function () {
  clearTimeout(searchDebounceTimer);
  searchDebounceTimer = setTimeout(function () {
    vaultCurrentPage = 1;
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
    vaultCurrentPage = 1;
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
    vaultCurrentPage = 1;
    renderList();
  };
});

function setViewMode(mode) {
  if (mode === currentViewMode) return;
  currentViewMode = mode;
  localStorage.setItem("vault_view_mode", mode);
  var savedPageSize = parseInt(
    localStorage.getItem(mode === "grid" ? "vault_page_size_grid" : "vault_page_size_list"),
    10
  );
  var allowedPageSizes = mode === "grid" ? [24, 48] : [25, 50, 100, 200];
  vaultPageSize =
    allowedPageSizes.indexOf(savedPageSize) !== -1 ? savedPageSize : mode === "grid" ? 48 : 50;
  localStorage.setItem(
    mode === "grid" ? "vault_page_size_grid" : "vault_page_size_list",
    String(vaultPageSize)
  );
  if (mode === "list") localStorage.setItem("vault_page_size", String(vaultPageSize));
  vaultCurrentPage = 1;
  updateVaultPageSizeOptions();
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

function repositionSelectionDock() {
  if (!selectionDock) return;
  var isMobile = window.innerWidth < 768;
  if (audioDock && !audioDock.classList.contains("d-none")) {
    var audioRect = audioDock.getBoundingClientRect();
    var audioTopFromBottom =
      audioRect && audioRect.top > 0 ? window.innerHeight - audioRect.top : 0;
    var targetBottom = Math.max(audioTopFromBottom + 12, isMobile ? 150 : 135);
    selectionDock.style.bottom = targetBottom + "px";
  } else if (audioMiniPill && !audioMiniPill.classList.contains("d-none")) {
    var miniRect = audioMiniPill.getBoundingClientRect();
    var miniTopFromBottom = miniRect && miniRect.top > 0 ? window.innerHeight - miniRect.top : 0;
    var targetBottom = Math.max(miniTopFromBottom + 10, isMobile ? 65 : 65);
    selectionDock.style.bottom = targetBottom + "px";
  } else {
    selectionDock.style.bottom = isMobile ? "18px" : "25px";
  }
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
    if (isFileSelected(f.id)) {
      totalSizeBytes += Number(f.size_bytes || 0);
      selectedFileCount++;
    }
  });

  if (selectionDock) {
    if (totalSelected > 0) {
      document.body.classList.add("has-selection-dock");
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
      repositionSelectionDock();
      if (selectionDockInfo) {
        var infoText = totalSelected + (totalSelected === 1 ? " item selected" : " items selected");
        if (selectedFileCount > 0) {
          infoText += " · " + formatBytes(totalSizeBytes);
        }
        selectionDockInfo.textContent = infoText;
      }
    } else {
      document.body.classList.remove("has-selection-dock");
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
    var isSel = isFolderSelected(id);
    el.classList.toggle("file-row-selected", isSel);
    var chk = el.querySelector(".form-check-input");
    if (chk) chk.checked = isSel;
  });

  document.querySelectorAll("[data-file-id]").forEach(function (el) {
    var id = el.getAttribute("data-file-id");
    var isSel = isFileSelected(id);
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

if (batchSelectAllDockBtn) {
  batchSelectAllDockBtn.onclick = function () {
    allLoadedFiles.forEach(function (f) {
      selectFile(f.id);
    });
    allLoadedFolders.forEach(function (fo) {
      selectFolder(fo.id);
    });
    updateSelectionUI();
  };
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
      if (isChecked) selectFile(f.id);
      else deselectFile(f.id);
    });
    updateSelectionUI();
  };
}

var batchSelectAllBtn = document.getElementById("batch-select-all-btn");
if (batchSelectAllBtn) {
  batchSelectAllBtn.onclick = function () {
    allLoadedFiles.forEach(function (f) {
      selectFile(f.id);
    });
    allLoadedFolders.forEach(function (fo) {
      selectFolder(fo.id);
    });
    updateSelectionUI();
  };
}

var batchSelectFilesBtn = document.getElementById("batch-select-files-btn");
if (batchSelectFilesBtn) {
  batchSelectFilesBtn.onclick = function () {
    allLoadedFiles.forEach(function (f) {
      selectFile(f.id);
    });
    updateSelectionUI();
  };
}

var batchSelectFoldersBtn = document.getElementById("batch-select-folders-btn");
if (batchSelectFoldersBtn) {
  batchSelectFoldersBtn.onclick = function () {
    allLoadedFolders.forEach(function (fo) {
      selectFolder(fo.id);
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
        selectFile(f.id);
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
  var count = selectedFileIds.size + selectedFolderIds.size;
  pendingAction = {
    type: "batch",
    name: count + " item" + (count !== 1 ? "s" : ""),
    batchFileIds: Array.from(selectedFileIds),
    batchFolderIds: Array.from(selectedFolderIds),
  };
  document.getElementById("delete-file-name").textContent =
    "'" + count + " selected item" + (count !== 1 ? "s" : "") + "'";
  deleteModal.show();
};

document.getElementById("batch-move-btn").onclick = function () {
  openMoveModal("batch", null, selectedFileIds.size + selectedFolderIds.size + " items");
};

var batchShareBtn = document.getElementById("batch-share-btn");
if (batchShareBtn) {
  batchShareBtn.onclick = function () {
    if (selectedFileIds.size === 0 && selectedFolderIds.size === 0) return;
    openBatchShareModal(Array.from(selectedFileIds), Array.from(selectedFolderIds));
  };
}

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
