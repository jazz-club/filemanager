function openFolderInfo(folder) {
  var modalEl = document.getElementById("folder-info-modal");
  if (!modalEl) return;

  closeAllMenus();
  document.getElementById("folder-info-title").textContent = folder.name + " Information";
  document.getElementById("folder-info-details").classList.add("d-none");
  document.getElementById("folder-info-error").classList.add("d-none");
  document.getElementById("folder-info-loading").classList.remove("d-none");
  bootstrap.Modal.getOrCreateInstance(modalEl).show();

  api("/folders/" + folder.id + "/info")
    .then(function (response) {
      return response.json().then(function (data) {
        return { ok: response.ok, data: data };
      });
    })
    .then(function (result) {
      document.getElementById("folder-info-loading").classList.add("d-none");
      if (!result.ok) {
        var errorEl = document.getElementById("folder-info-error");
        errorEl.textContent = result.data.error || "Failed to load folder information";
        errorEl.classList.remove("d-none");
        return;
      }

      var info = result.data;
      document.getElementById("folder-info-path").textContent = info.path;
      document.getElementById("folder-info-files").textContent = info.fileCount;
      document.getElementById("folder-info-subfolders").textContent = info.folderCount;
      document.getElementById("folder-info-size").textContent = formatBytes(info.sizeBytes);
      document.getElementById("folder-info-created").textContent = formatDate(info.createdAt);
      document.getElementById("folder-info-modified").textContent = formatDate(info.lastModified);
      document.getElementById("folder-info-details").classList.remove("d-none");
    })
    .catch(function () {
      document.getElementById("folder-info-loading").classList.add("d-none");
      var errorEl = document.getElementById("folder-info-error");
      errorEl.textContent = "Failed to load folder information";
      errorEl.classList.remove("d-none");
    });
}
