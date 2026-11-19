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

  if (pendingAction.type === "batch") {
    api("/files/batch/delete", {
      method: "POST",
      body: JSON.stringify({
        fileIds: pendingAction.batchFileIds || [],
        folderIds: pendingAction.batchFolderIds || [],
      }),
    })
      .then(function (r) {
        return r.json();
      })
      .then(function () {
        deleteModal.hide();
        showMsg("Deleted items.", "success");
        loadVault();
        updateStorageStats();
      });
    return;
  }

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
        pushNotification("Account and data deleted.", "success");
        setTimeout(function () {
          window.location.href = "/login";
        }, 800);
      }
    });
};
