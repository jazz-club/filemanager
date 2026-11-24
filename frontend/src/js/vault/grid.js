function renderGrid(filteredFolders, filteredFiles, query, accordion, existingNodes) {
  var gridContainer = document.createElement("div");
  gridContainer.className = "row g-2 p-2 w-100 m-0";

  filteredFolders.forEach(function (folder) {
    var key = "folder-" + folder.id;
    if (existingNodes && existingNodes.has(key)) {
      var existingCol = existingNodes.get(key);
      if (existingCol.classList.contains("grid-item-col")) {
        var existingCard = existingCol.querySelector(".grid-item-card");
        if (existingCard) {
          existingCard.classList.toggle("file-row-selected", isFolderSelected(folder.id));
        }
        var chk = existingCol.querySelector(".form-check-input");
        if (chk) chk.checked = isFolderSelected(folder.id);
        var nameEl = existingCol.querySelector(".fw-bold.small.text-truncate");
        if (nameEl) nameEl.innerHTML = highlightMatch(folder.name, query);
        gridContainer.appendChild(existingCol);
        return;
      }
    }

    var col = document.createElement("div");
    col.className = "col-6 col-sm-6 col-md-4 col-lg-3 col-xl-3 col-xxl-2 grid-item-col";
    col.setAttribute("data-item-key", "folder-" + folder.id);

    var card = document.createElement("div");
    card.className =
      "grid-item-card p-2 " + (isFolderSelected(folder.id) ? "file-row-selected" : "");
    card.setAttribute("data-folder-id", folder.id);
    card.setAttribute("data-folder-name", folder.name);
    if (folder.color && folder.color !== "#ffffff" && folder.color !== "#fff") {
      card.classList.add("has-custom-color");
      card.style.setProperty("--folder-custom-bg", folder.color);
      card.style.backgroundColor = folder.color;
    }
    card.onclick = function (e) {
      if (selectedFileIds.size > 0 || selectedFolderIds.size > 0) {
        if (
          e.target.closest("button") ||
          e.target.closest("a") ||
          e.target.closest(".dropdown-menu") ||
          e.target.closest("input")
        ) {
          return;
        }
        toggleFolderSelection(folder.id);
      }
    };

    var topBar = document.createElement("div");
    topBar.className = "d-flex justify-content-between align-items-center mb-1";

    var chk = document.createElement("input");
    chk.type = "checkbox";
    chk.className = "form-check-input mt-0";
    chk.checked = isFolderSelected(folder.id);
    chk.onclick = function (e) {
      e.stopPropagation();
      toggleFolderSelection(folder.id, chk.checked);
    };

    var actions = document.createElement("div");
    actions.className = "dropdown";
    actions.innerHTML =
      '<button class="btn btn-sm grid-card-action-btn folder-options-btn" data-bs-toggle="dropdown" aria-expanded="false" aria-label="Folder options" title="Folder options"><span class="folder-options-label">Options</span><span aria-hidden="true">▾</span></button>' +
      '<ul class="dropdown-menu dropdown-menu-end shadow-sm border-dark">' +
      '<li><a class="dropdown-item folder-info py-1" href="#">Folder Information</a></li>' +
      '<li><a class="dropdown-item share-folder py-1" href="#">Share folder</a></li>' +
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

    actions.querySelector(".share-folder").onclick = function (e) {
      e.preventDefault();
      closeAllMenus();
      openShareModalForFolder(folder);
    };

    actions.querySelector(".folder-info").onclick = function (e) {
      e.preventDefault();
      openFolderInfo(folder);
    };

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
      '<img src="/src/assets/icons/file-folder.png" class="grid-file-icon-img mb-1" alt="Folder" style="width: 48px; height: 48px; object-fit: contain;" />' +
      '<div class="fw-bold small text-truncate w-100 px-1" title="' +
      escapeHtml(folder.name) +
      '">' +
      highlightMatch(folder.name, query) +
      "</div>" +
      '<span class="text-muted" style="font-size: 0.7rem;">Folder</span>';

    centerBox.onclick = function () {
      if (selectedFileIds.size > 0 || selectedFolderIds.size > 0) {
        toggleFolderSelection(folder.id);
        return;
      }
      navigateToFolder(folder.id, folder.name);
    };

    card.appendChild(topBar);
    card.appendChild(centerBox);
    col.appendChild(card);
    gridContainer.appendChild(col);
  });

  filteredFiles.forEach(function (file) {
    var key = "file-" + file.id;
    if (existingNodes && existingNodes.has(key)) {
      var existingCol = existingNodes.get(key);
      if (existingCol.classList.contains("grid-item-col")) {
        var existingCard = existingCol.querySelector(".grid-item-card");
        if (existingCard) {
          existingCard.classList.toggle("file-row-selected", isFileSelected(file.id));
        }
        var chk = existingCol.querySelector(".form-check-input");
        if (chk) chk.checked = isFileSelected(file.id);
        var nameEl = existingCol.querySelector(".grid-item-name");
        if (nameEl) nameEl.innerHTML = highlightMatch(file.original_name, query);

        var topDetailsBtn = existingCol.querySelector(".grid-details-btn");
        if (topDetailsBtn) {
          topDetailsBtn.onclick = function (e) {
            e.stopPropagation();
            closeAllMenus();
            showFileDetails(file, filteredFiles);
          };
        }
        var shareBtn = existingCol.querySelector(".grid-share-btn");
        if (shareBtn) {
          shareBtn.onclick = function (e) {
            e.stopPropagation();
            closeAllMenus();
            openShareModal(file);
          };
        }
        var dlBtn = existingCol.querySelector(".grid-download-btn");
        if (dlBtn) {
          dlBtn.href = getFileDownloadUrl(file);
        }
        var thumbBox = existingCol.querySelector(".grid-thumb-box");
        if (thumbBox) {
          thumbBox.onclick = function (e) {
            if (selectedFileIds.size > 0 || selectedFolderIds.size > 0) {
              toggleFileSelection(file.id);
              return;
            }
            openPreview(file, filteredFiles);
          };
        }
        gridContainer.appendChild(existingCol);
        return;
      }
    }

    var col = document.createElement("div");
    col.className = "col-6 col-sm-6 col-md-4 col-lg-3 col-xl-3 col-xxl-2 grid-item-col";
    col.setAttribute("data-item-key", "file-" + file.id);

    var card = document.createElement("div");
    card.className = "grid-item-card p-2 " + (isFileSelected(file.id) ? "file-row-selected" : "");
    card.setAttribute("data-file-id", file.id);
    card.setAttribute("data-file-name", file.original_name);
    card.setAttribute("data-mime", file.mime_type || "");
    card.draggable = true;
    card.ondragstart = function (e) {
      if (
        e.target.closest(".grid-card-thumb-box") ||
        e.target.tagName === "IMG" ||
        e.target.tagName === "VIDEO"
      ) {
        e.preventDefault();
        return;
      }
      e.dataTransfer.setData(
        "application/json",
        JSON.stringify({ fileId: file.id, fileName: file.original_name })
      );
      e.dataTransfer.effectAllowed = "move";
    };
    card.onclick = function (e) {
      if (selectedFileIds.size > 0 || selectedFolderIds.size > 0) {
        if (
          e.target.closest("button") ||
          e.target.closest("a") ||
          e.target.closest(".dropdown-menu") ||
          e.target.closest("input")
        ) {
          return;
        }
        toggleFileSelection(file.id);
      }
    };
    card.addEventListener("contextmenu", function (e) {
      openContextMenu(e, "file", file);
    });

    var topBar = document.createElement("div");
    topBar.className = "d-flex justify-content-between align-items-center mb-1";

    var selectChk = document.createElement("input");
    selectChk.type = "checkbox";
    selectChk.className = "form-check-input mt-0";
    selectChk.checked = isFileSelected(file.id);
    selectChk.onclick = function (e) {
      e.stopPropagation();
      toggleFileSelection(file.id, selectChk.checked);
    };

    var topBarRight = document.createElement("div");
    topBarRight.className = "d-flex align-items-center gap-1";

    var topDetailsBtn = document.createElement("button");
    topDetailsBtn.type = "button";
    topDetailsBtn.className = "btn btn-sm grid-card-action-btn grid-details-btn py-0 px-1";
    topDetailsBtn.style.cssText =
      "font-size: 0.72rem; min-height: 22px; height: 22px; line-height: 1; padding: 1px 5px !important; font-weight: 800;";
    topDetailsBtn.title = "File Details";
    topDetailsBtn.innerHTML =
      '<svg width="13" height="13" viewBox="0 0 16 16" fill="currentColor" style="vertical-align: -1px;"><circle cx="8" cy="8" r="7" fill="none" stroke="currentColor" stroke-width="2.2"></circle><circle cx="8" cy="4.5" r="1.2" fill="currentColor"></circle><line x1="8" y1="7.2" x2="8" y2="12" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"></line></svg>';
    topDetailsBtn.onclick = function (e) {
      e.stopPropagation();
      closeAllMenus();
      showFileDetails(file, filteredFiles);
    };

    topBarRight.appendChild(topDetailsBtn);

    topBar.appendChild(selectChk);
    topBar.appendChild(topBarRight);

    var thumbBox = document.createElement("div");
    thumbBox.className = "grid-thumb-box rounded mb-1 position-relative";
    thumbBox.style.cursor = "pointer";
    thumbBox.style.height = "100px";

    var mime = (file.mime_type || "").toLowerCase();
    var nameLower = (file.original_name || "").toLowerCase();
    var isImage = mime.startsWith("image/");
    var isVideo = mime.startsWith("video/");
    var isAudio =
      mime.startsWith("audio/") ||
      nameLower.endsWith(".mp3") ||
      nameLower.endsWith(".m4a") ||
      nameLower.endsWith(".flac") ||
      nameLower.endsWith(".wav") ||
      nameLower.endsWith(".ogg");

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
          '<img src="/src/assets/icons/file-video.png" class="grid-file-icon-img opacity-50" style="width: 48px; height: 48px; image-rendering: pixelated; object-fit: contain;" alt="Video" />';
        thumbBox.appendChild(lazyThumbWrap);
        videoThumbObserver.observe(lazyThumbWrap);
      } else {
        thumbBox.innerHTML =
          '<video src="/api/files/' +
          file.id +
          '/preview#t=0.5" preload="metadata" muted playsinline style="max-height: 95px; max-width: 100%; object-fit: contain; pointer-events: none; background: transparent;"></video>';
      }
    } else if (showThumbnails && isAudio) {
      var coverWrap = document.createElement("div");
      coverWrap.className = "w-100 h-100 d-flex align-items-center justify-content-center p-1";
      var fallbackIcon = document.createElement("img");
      fallbackIcon.src = getFileIconUrl(file.mime_type, file.original_name);
      fallbackIcon.className = "grid-file-icon-img";
      fallbackIcon.alt = "Audio";
      fallbackIcon.style.cssText =
        "width: 48px; height: 48px; image-rendering: pixelated; object-fit: contain;";
      coverWrap.appendChild(fallbackIcon);
      thumbBox.appendChild(coverWrap);

      var coverImg = new Image();
      coverImg.onload = function () {
        coverImg.className = "rounded border border-dark shadow-sm audio-cover-thumb";
        coverImg.style.maxHeight = "90px";
        coverImg.style.maxWidth = "90px";
        coverImg.style.objectFit = "cover";
        coverImg.alt = "Audio Cover";
        coverWrap.innerHTML = "";
        coverWrap.appendChild(coverImg);
      };
      coverImg.onerror = function () {};
      coverImg.src = "/api/files/" + file.id + "/cover";
    } else {
      var iconUrl = getFileIconUrl(file.mime_type, file.original_name);
      thumbBox.innerHTML =
        '<div class="w-100 h-100 d-flex align-items-center justify-content-center">' +
        '<img src="' +
        iconUrl +
        '" class="grid-file-icon-img" alt="File" style="width: 48px; height: 48px; image-rendering: pixelated; object-fit: contain;" />' +
        "</div>";
    }

    thumbBox.onclick = function (e) {
      if (selectedFileIds.size > 0 || selectedFolderIds.size > 0) {
        toggleFileSelection(file.id);
        return;
      }
      openPreview(file, filteredFiles);
    };

    var nameDiv = document.createElement("div");
    nameDiv.className = "fw-bold small text-truncate w-100 text-center mb-1 grid-item-name";
    nameDiv.title = file.original_name;
    nameDiv.innerHTML = highlightMatch(file.original_name, query);
    nameDiv.style.cursor = "pointer";
    nameDiv.onclick = function () {
      if (selectedFileIds.size > 0 || selectedFolderIds.size > 0) {
        toggleFileSelection(file.id);
        return;
      }
      showFileDetails(file, filteredFiles);
    };

    var actionRow = document.createElement("div");
    actionRow.className = "d-flex align-items-center mt-auto gap-1 w-100 grid-action-row";
    actionRow.innerHTML =
      '<button class="btn btn-sm grid-card-action-btn grid-share-btn flex-fill text-center px-1" title="Share file" aria-label="Share file"><img src="/src/assets/icons/lib/SVG/regular/share.svg" width="15" height="15" alt="" /></button>' +
      '<a href="' +
      getFileDownloadUrl(file) +
      '" class="btn btn-sm grid-card-action-btn grid-download-btn flex-fill text-center px-1" title="Download" aria-label="Download file"><img src="/src/assets/icons/lib/SVG/regular/download.svg" width="15" height="15" alt="" /></a>';

    actionRow.querySelector(".grid-share-btn").onclick = function (e) {
      e.stopPropagation();
      closeAllMenus();
      openShareModal(file);
    };

    card.querySelectorAll(".grid-details-btn").forEach(function (btn) {
      btn.onclick = function (e) {
        e.stopPropagation();
        closeAllMenus();
        showFileDetails(file, filteredFiles);
      };
    });

    card.appendChild(topBar);
    card.appendChild(thumbBox);
    card.appendChild(nameDiv);
    card.appendChild(actionRow);
    col.appendChild(card);
    gridContainer.appendChild(col);
  });

  accordion.appendChild(gridContainer);
}

function renderListView(filteredFolders, filteredFiles, query, accordion, existingNodes) {
  filteredFolders.forEach(function (folder) {
    var key = "folder-" + folder.id;
    if (existingNodes && existingNodes.has(key)) {
      var existingItem = existingNodes.get(key);
      if (existingItem.classList.contains("folder-row-item")) {
        existingItem.classList.toggle("file-row-selected", isFolderSelected(folder.id));
        var chk = existingItem.querySelector(".form-check-input");
        if (chk) chk.checked = isFolderSelected(folder.id);
        var nameSpan = existingItem.querySelector(".fw-bold.text-truncate");
        if (nameSpan) nameSpan.innerHTML = highlightMatch(folder.name, query);
        accordion.appendChild(existingItem);
        return;
      }
    }

    var folderItem = document.createElement("div");
    folderItem.className =
      "accordion-item border-0 border-bottom folder-row-item " +
      (isFolderSelected(folder.id) ? "file-row-selected" : "");
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

    var folderHeader = document.createElement("div");
    folderHeader.className = "accordion-header list-file-header d-flex align-items-center";

    var chk = document.createElement("input");
    chk.type = "checkbox";
    chk.className = "form-check-input ms-3 me-2 mt-0";
    chk.checked = isFolderSelected(folder.id);
    chk.onclick = function (e) {
      e.stopPropagation();
      toggleFolderSelection(folder.id, chk.checked);
    };

    var btn = document.createElement("button");
    btn.className = "accordion-button collapsed py-2 px-2 list-file-toggle";
    btn.type = "button";
    btn.style.boxShadow = "none";
    btn.onclick = function (e) {
      if (e.target.closest(".list-file-icon-click")) {
        e.preventDefault();
        e.stopPropagation();
        toggleFolderSelection(folder.id);
        return;
      }
      if (
        (selectedFileIds.size > 0 || selectedFolderIds.size > 0) &&
        !(window.matchMedia && window.matchMedia("(max-width: 767.98px)").matches)
      ) {
        e.preventDefault();
        e.stopPropagation();
        toggleFolderSelection(folder.id);
        return;
      }
      navigateToFolder(folder.id, folder.name);
    };

    btn.innerHTML =
      '<div class="d-flex align-items-center gap-2 w-100 text-truncate min-w-0">' +
      '<span class="me-1 d-inline-flex align-items-center flex-shrink-0 list-file-icon-click" style="cursor: pointer;" title="Select ' +
      escapeHtml(folder.name) +
      '">' +
      '<img src="/src/assets/icons/file-folder.png" class="file-icon-img" alt="" width="20" height="20" style="image-rendering: pixelated; object-fit: contain; vertical-align: middle; flex-shrink: 0;" />' +
      "</span>" +
      '<span class="fw-bold text-truncate" title="' +
      escapeHtml(folder.name) +
      '">' +
      highlightMatch(folder.name, query) +
      "</span>" +
      '<span class="badge bg-secondary ms-2 small flex-shrink-0">Folder</span>' +
      "</div>";

    var rowActions = document.createElement("div");
    rowActions.className = "list-row-actions d-flex align-items-center gap-2 flex-shrink-0";

    var actions = document.createElement("div");
    actions.className = "dropdown";
    actions.innerHTML =
      '<button class="btn btn-sm btn-white border border-dark py-0 px-2 fw-bold folder-options-btn" data-bs-toggle="dropdown" data-bs-display="static" aria-expanded="false" aria-label="Folder options" title="Folder options"><span class="folder-options-label">Options</span><span aria-hidden="true">▾</span></button>' +
      '<ul class="dropdown-menu dropdown-menu-end shadow-sm border-dark">' +
      '<li><a class="dropdown-item folder-info" href="#">Folder Information</a></li>' +
      '<li><a class="dropdown-item share-folder" href="#">Share folder</a></li>' +
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

    actions.querySelector(".share-folder").onclick = function (e) {
      e.preventDefault();
      closeAllMenus();
      openShareModalForFolder(folder);
    };

    actions.querySelector(".folder-info").onclick = function (e) {
      e.preventDefault();
      openFolderInfo(folder);
    };

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

    rowActions.appendChild(actions);

    folderHeader.appendChild(chk);
    folderHeader.appendChild(btn);
    folderHeader.appendChild(rowActions);
    folderItem.appendChild(folderHeader);
    accordion.appendChild(folderItem);
  });

  filteredFiles.forEach(function (file) {
    var key = "file-" + file.id;
    if (existingNodes && existingNodes.has(key)) {
      var existingItem = existingNodes.get(key);
      if (
        existingItem.classList.contains("accordion-item") &&
        !existingItem.classList.contains("folder-row-item")
      ) {
        existingItem.classList.toggle("file-row-selected", isFileSelected(file.id));
        var chk = existingItem.querySelector(".form-check-input");
        if (chk) chk.checked = isFileSelected(file.id);
        var nameSpan = existingItem.querySelector(".fw-bold.text-truncate");
        if (nameSpan) nameSpan.innerHTML = highlightMatch(file.original_name, query);
        var headerPreviewBtn = existingItem.querySelector(".list-header-preview-btn");
        if (headerPreviewBtn) {
          headerPreviewBtn.onclick = function (e) {
            e.preventDefault();
            e.stopPropagation();
            openPreview(file, filteredFiles);
          };
        }
        var headerDlBtn = existingItem.querySelector(".list-header-dl-btn");
        if (headerDlBtn) {
          headerDlBtn.onclick = function (e) {
            e.preventDefault();
            e.stopPropagation();
            window.location.href = getFileDownloadUrl(file);
          };
        }
        var headerShareBtn = existingItem.querySelector(".list-header-share-btn");
        if (headerShareBtn) {
          headerShareBtn.onclick = function (e) {
            e.preventDefault();
            e.stopPropagation();
            openShareModal(file);
          };
        }
        accordion.appendChild(existingItem);
        return;
      }
    }

    var item = document.createElement("div");
    item.className =
      "accordion-item border-0 border-bottom " +
      (isFileSelected(file.id) ? "file-row-selected" : "");
    item.setAttribute("data-file-id", file.id);
    item.setAttribute("data-file-name", file.original_name);
    item.setAttribute("data-mime", file.mime_type || "");
    item.setAttribute("data-item-key", "file-" + file.id);
    item.draggable = true;
    item.ondragstart = function (e) {
      if (e.target.tagName === "IMG" || e.target.tagName === "VIDEO") {
        e.preventDefault();
        return;
      }
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

    var header = document.createElement("div");
    header.className = "accordion-header list-file-header d-flex align-items-center";
    header.id = headerId;

    var selectChk = document.createElement("input");
    selectChk.type = "checkbox";
    selectChk.className = "form-check-input ms-3 me-2 mt-0";
    selectChk.checked = isFileSelected(file.id);
    selectChk.onclick = function (e) {
      e.stopPropagation();
      toggleFileSelection(file.id, selectChk.checked);
    };

    var btn = document.createElement("button");
    btn.className = "accordion-button collapsed py-2 px-2 list-file-toggle";
    btn.type = "button";
    btn.setAttribute("data-bs-toggle", "collapse");
    btn.setAttribute("data-bs-target", "#" + collapseId);
    btn.setAttribute("aria-expanded", "false");
    btn.setAttribute("aria-controls", collapseId);
    btn.onclick = function (e) {
      if (e.target.closest(".list-file-icon-click")) {
        e.preventDefault();
        e.stopPropagation();
        toggleFileSelection(file.id);
        return;
      }
      if (
        (selectedFileIds.size > 0 || selectedFolderIds.size > 0) &&
        !(window.matchMedia && window.matchMedia("(max-width: 767.98px)").matches)
      ) {
        e.preventDefault();
        e.stopPropagation();
        toggleFileSelection(file.id);
        return;
      }
    };

    var fileGlyph = getFileUnicodeIcon(file.mime_type, file.original_name);

    btn.innerHTML =
      '<div class="d-flex align-items-center gap-2 w-100 text-truncate min-w-0">' +
      '<span class="me-1 d-inline-flex align-items-center flex-shrink-0 list-file-icon-click" style="cursor: pointer;" title="Select ' +
      escapeHtml(file.original_name) +
      '">' +
      fileGlyph +
      "</span>" +
      '<span class="fw-bold text-truncate" title="' +
      escapeHtml(file.original_name) +
      '">' +
      highlightMatch(file.original_name, query) +
      "</span>" +
      "</div>";

    var rowActions = document.createElement("div");
    rowActions.className = "list-row-actions d-flex align-items-center gap-2 flex-shrink-0";
    rowActions.innerHTML =
      '<button type="button" class="btn btn-sm py-0 px-2 list-header-preview-btn d-inline-flex align-items-center justify-content-center" style="height: 26px; width: 28px;" title="Preview file">' +
      '<img src="/src/assets/icons/lib/SVG/regular/eye.svg" width="14" height="14" style="object-fit: contain;" alt="Preview" />' +
      "</button>" +
      '<button type="button" class="btn btn-sm btn-success py-0 px-2 list-header-dl-btn d-inline-flex align-items-center justify-content-center" style="height: 26px; width: 28px;" title="Download file">' +
      '<img src="/src/assets/icons/lib/SVG/regular/download.svg" width="14" height="14" style="object-fit: contain;" alt="Download" />' +
      "</button>" +
      '<button type="button" class="btn btn-sm btn-primary py-0 px-2 list-header-share-btn d-inline-flex align-items-center justify-content-center" style="height: 26px; width: 28px;" title="Share file">' +
      '<img src="/src/assets/icons/lib/SVG/regular/share.svg" width="14" height="14" style="object-fit: contain;" alt="Share" />' +
      "</button>";

    header.appendChild(selectChk);
    header.appendChild(btn);
    header.appendChild(rowActions);

    rowActions.querySelector(".list-header-preview-btn").onclick = function (e) {
      e.preventDefault();
      e.stopPropagation();
      openPreview(file, filteredFiles);
    };
    rowActions.querySelector(".list-header-dl-btn").onclick = function (e) {
      e.preventDefault();
      e.stopPropagation();
      window.location.href = getFileDownloadUrl(file);
    };
    rowActions.querySelector(".list-header-share-btn").onclick = function (e) {
      e.preventDefault();
      e.stopPropagation();
      openShareModal(file);
    };

    var collapse = document.createElement("div");
    collapse.id = collapseId;
    collapse.className = "accordion-collapse collapse";
    collapse.setAttribute("aria-labelledby", headerId);
    collapse.setAttribute("data-bs-parent", "#filesAccordion");

    var body = document.createElement("div");
    body.className = "accordion-body p-3";
    var _metaHtml = buildFileMetadataHtml(file);
    body.innerHTML =
      '<div class="row g-3 align-items-start">' +
      '<div class="col-12 col-lg">' +
      '<div class="accordion-meta-mount" data-file-id="' +
      file.id +
      '">' +
      _metaHtml +
      "</div>" +
      "</div>" +
      '<div class="col-12 d-flex gap-2 flex-wrap align-items-center">' +
      '<button class="btn btn-sm btn-white rename-file-btn">Rename</button>' +
      '<button class="btn btn-sm btn-white move-file-btn">Move</button>' +
      '<button class="btn btn-sm btn-outline-danger delete-file-btn">Delete</button>' +
      "</div>" +
      "</div>";

    attachShaCopyHandler(body.querySelector(".sha-copy-box"), file.sha256);

    if (!file.metadata || Object.keys(file.metadata).length === 0) {
      fetch("/api/files/" + file.id + "/metadata")
        .then(function (r) {
          return r.json();
        })
        .then(function (data) {
          if (data && data.metadata) {
            file.metadata = data.metadata;
            var mount = body.querySelector('.accordion-meta-mount[data-file-id="' + file.id + '"]');
            if (mount) {
              mount.innerHTML = buildFileMetadataHtml(file);
              attachShaCopyHandler(mount.querySelector(".sha-copy-box"), file.sha256);
            }
          }
        })
        .catch(function () {});
    }

    var shareFileBtn = body.querySelector(".share-file-btn");
    if (shareFileBtn) {
      shareFileBtn.onclick = function () {
        openShareModal(file);
      };
    }
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

    collapse.addEventListener("show.bs.collapse", function () {
      var badges = body.querySelectorAll(".meta-badges-row .meta-badge");
      badges.forEach(function (badge) {
        badge.style.animation = "none";

        void badge.offsetWidth;
        badge.style.animation = "";
      });
    });
  });
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
