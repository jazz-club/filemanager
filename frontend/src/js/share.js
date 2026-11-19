(function () {
  function showShareError(msg) {
    var el = document.createElement("div");
    el.style.cssText =
      "position:fixed;bottom:20px;left:50%;transform:translateX(-50%);background:#000;color:#fff;padding:8px 16px;border-radius:6px;font-size:0.85rem;font-weight:700;z-index:9999;border:2px solid #ff69b4;box-shadow:3px 3px 0 0 #ff69b4;";
    el.textContent = msg;
    document.body.appendChild(el);
    setTimeout(function () {
      el.remove();
    }, 3500);
  }

  function showShareConfirm(fileName, onConfirm) {
    var modalEl = document.getElementById("confirmModal");
    var bodyEl = document.getElementById("confirm-modal-body");
    var titleEl = document.getElementById("confirm-modal-title");
    var confirmBtn = document.getElementById("confirm-modal-ok");
    if (!modalEl || !bodyEl || !titleEl || !confirmBtn) {
      showShareError("The confirmation dialog could not be opened");
      return;
    }

    titleEl.textContent = "Remove from Share";
    bodyEl.textContent =
      'Remove "' +
      fileName +
      '" from this share?\n(This only modifies the share not the original copy)';
    bodyEl.style.whiteSpace = "pre-line";
    confirmBtn.textContent = "Remove";
    confirmBtn.className = "btn btn-sm btn-danger fw-bold";

    var modal = bootstrap.Modal.getOrCreateInstance(modalEl);
    var cleanup = function () {
      confirmBtn.removeEventListener("click", confirmRemoval);
      modalEl.removeEventListener("hidden.bs.modal", cleanup);
    };
    var confirmRemoval = function () {
      cleanup();
      modal.hide();
      onConfirm();
    };

    confirmBtn.addEventListener("click", confirmRemoval);
    modalEl.addEventListener("hidden.bs.modal", cleanup);
    modal.show();
  }

  function hasReachedDownloadLimit(share) {
    return (
      !share.isOwner &&
      Number(share.maxDownloads) > 0 &&
      Number(share.downloadsCount) >= Number(share.maxDownloads)
    );
  }

  function disableDownloadLink(link) {
    if (!link) return;
    link.href = "#";
    link.classList.add("disabled");
    link.setAttribute("aria-disabled", "true");
    link.title = "This share link has reached its download limit";
    link.onclick = function (event) {
      event.preventDefault();
      showShareError("This share link has reached its download limit");
    };
  }

  function getShareToken() {
    var path = window.location.pathname;
    var match = path.match(/\/share\/([a-zA-Z0-9_-]+)/);
    if (match && match[1]) return match[1];

    var params = new URLSearchParams(window.location.search);
    if (params.get("token")) return params.get("token");

    var hash = window.location.hash.replace("#", "");
    if (hash) return hash;

    return null;
  }

  var token = getShareToken();

  var loadingEl = document.getElementById("share-loading");
  var errorEl = document.getElementById("share-error");
  var contentEl = document.getElementById("share-content");

  var errorTitle = document.getElementById("share-error-title");
  var errorMsg = document.getElementById("share-error-msg");
  var errorLoginBtn = document.getElementById("share-error-login-btn");

  if (!token) {
    loadingEl.classList.add("d-none");
    errorEl.classList.remove("d-none");
    errorTitle.textContent = "Invalid Share Link";
    errorMsg.textContent = "No share token was provided in the URL.";
    return;
  }

  var batchModalEl = document.getElementById("batchPreviewModal");
  var batchModal = batchModalEl ? new bootstrap.Modal(batchModalEl) : null;

  api("/shares/" + token)
    .then(function (r) {
      return r.json().then(function (data) {
        return { status: r.status, ok: r.ok, data: data };
      });
    })
    .then(function (res) {
      loadingEl.classList.add("d-none");

      if (!res.ok) {
        errorEl.classList.remove("d-none");
        if (res.status === 401 || (res.data && res.data.requiresAuth)) {
          errorTitle.textContent = "Private Share";
          errorMsg.textContent =
            "This share link is private and requires you to log in or create an account to view and access.";
          if (errorLoginBtn) {
            errorLoginBtn.classList.remove("d-none");
            errorLoginBtn.href =
              "/login?redirect=" +
              encodeURIComponent(window.location.pathname + window.location.search);
          }
          var errorRegBtn = document.getElementById("share-error-register-btn");
          if (errorRegBtn) {
            errorRegBtn.classList.remove("d-none");
            errorRegBtn.href =
              "/login?mode=register&redirect=" +
              encodeURIComponent(window.location.pathname + window.location.search);
          }
        } else if (res.status === 410) {
          errorTitle.textContent = "Share Link Unavailable";
          errorMsg.textContent =
            (res.data && res.data.error) ||
            "This share link has expired or reached its view limit.";
        } else {
          errorTitle.textContent = "Link Unavailable";
          errorMsg.textContent =
            (res.data && res.data.error) ||
            "This item does not exist, has expired, or the link was revoked.";
        }
        return;
      }

      var share = res.data;
      contentEl.classList.remove("d-none");

      var visBadge = document.getElementById("share-badge-visibility");
      if (visBadge) {
        visBadge.textContent = share.isPublic ? "Public Share" : "Private Share";
        visBadge.className =
          "badge font-monospace " + (share.isPublic ? "bg-info" : "badge-private");
        if (!share.isPublic) {
          visBadge.style.backgroundColor = "#c4b5fd";
          visBadge.style.color = "#000000";
        } else {
          visBadge.style.backgroundColor = "";
          visBadge.style.color = "";
        }
      }

      var permBadge = document.getElementById("share-badge-permission");
      if (permBadge) {
        permBadge.textContent = share.accessType === "edit" ? "Edit" : "View/Download";
        permBadge.className =
          "badge font-monospace " + (share.accessType === "edit" ? "bg-warning" : "bg-secondary");
      }

      var statsEl = document.getElementById("share-stats-summary");
      if (statsEl) {
        statsEl.textContent =
          (share.viewsCount || 0) +
          (share.maxViews ? "/" + share.maxViews : "") +
          " views • " +
          (share.downloadsCount || 0) +
          (share.maxDownloads ? "/" + share.maxDownloads : "") +
          " downloads • " +
          (share.savesCount || 0) +
          " saves";
      }

      var uploadDateEl = document.getElementById("share-upload-date");
      if (uploadDateEl) {
        uploadDateEl.textContent = "Shared: " + formatDate(share.uploadedAt);
      }

      var countdownEl = document.getElementById("share-expiry-countdown");
      if (countdownEl && share.expiresAt) {
        countdownEl.classList.remove("d-none");
        function updateCountdown() {
          var now = Date.now();
          var exp = new Date(share.expiresAt).getTime();
          var diff = exp - now;
          if (diff <= 0) {
            countdownEl.textContent = "⏱ Expired";
            countdownEl.style.color = "#f56565";
            return;
          }
          var totalSec = Math.floor(diff / 1000);
          var days = Math.floor(totalSec / 86400);
          var hrs = Math.floor((totalSec % 86400) / 3600);
          var mins = Math.floor((totalSec % 3600) / 60);
          var secs = totalSec % 60;
          var parts = [];
          if (days > 0) parts.push(days + "d");
          if (hrs > 0 || days > 0) parts.push(hrs + "h");
          if (mins > 0 || hrs > 0 || days > 0) parts.push(mins + "m");
          parts.push(secs + "s");
          countdownEl.textContent = "⏱ Expires in " + parts.join(" ");
          countdownEl.style.color = diff < 3600000 ? "#f56565" : "";
          setTimeout(updateCountdown, 1000);
        }
        updateCountdown();
      }

      if (share.isBatch) {
        renderBatchView(share, token);
      } else {
        renderSingleView(share, token);
      }
    })
    .catch(function (err) {
      console.error("Share fetch error:", err);
      loadingEl.classList.add("d-none");
      errorEl.classList.remove("d-none");
      errorTitle.textContent = "Connection Error";
      errorMsg.textContent = "Failed to communicate with the vault server.";
    });

  function renderSingleView(file, shareToken) {
    document.getElementById("share-single-view").classList.remove("d-none");
    document.getElementById("share-batch-view").classList.add("d-none");

    var nameEl = document.getElementById("share-filename");
    nameEl.textContent = file.fileName;
    document.title = "PinkBox <3 | " + file.fileName;

    var sizeEl = document.getElementById("share-filesize");
    sizeEl.textContent = formatBytes(file.sizeBytes);

    var iconEl = document.getElementById("share-file-type-icon");
    iconEl.innerHTML =
      '<img src="' +
      getFileIconUrl(file.mimeType, file.fileName) +
      '" width="36" height="36" style="image-rendering: pixelated; object-fit: contain;" alt="" />';

    var dlBox = document.getElementById("share-download-action-box");
    var dlBtn = document.getElementById("share-download-btn");
    var viewOnlyBanner = document.getElementById("share-viewonly-banner");

    if (file.allowDownload) {
      dlBox.classList.remove("d-none");
      dlBtn.href = "/api/shares/" + shareToken + "/download";
      if (hasReachedDownloadLimit(file)) disableDownloadLink(dlBtn);
      viewOnlyBanner.classList.add("d-none");
    } else {
      dlBox.classList.add("d-none");
      viewOnlyBanner.classList.remove("d-none");
    }

    var removeBtn = document.getElementById("share-remove-from-link-btn");
    if (removeBtn) {
      if (file.accessType === "edit") {
        removeBtn.classList.remove("d-none");
        removeBtn.onclick = function () {
          removeSharedFile(shareToken, file.fileId, file.fileName, function () {
            contentEl.classList.add("d-none");
            errorTitle.textContent = "File removed from share";
            errorMsg.textContent = "(This only modifies the share not the original copy)";
            errorLoginBtn.classList.add("d-none");
            errorEl.classList.remove("d-none");
          });
        };
      } else {
        removeBtn.classList.add("d-none");
      }
    }

    document.getElementById("share-mimetype").textContent =
      file.mimeType || "application/octet-stream";
    document.getElementById("share-sha256").textContent = file.sha256 || "n/a";

    var copyShaBtn = document.getElementById("share-copy-sha-btn");
    if (copyShaBtn && file.sha256) {
      copyShaBtn.onclick = function () {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(file.sha256).then(function () {
            copyShaBtn.textContent = "Copied!";
            setTimeout(function () {
              copyShaBtn.textContent = "Copy";
            }, 1800);
          });
        }
      };
    }

    var metaDetailsEl = document.getElementById("share-meta-details");
    var metaDetails = [];
    if (file.metadata) {
      if (file.metadata.width && file.metadata.height) {
        metaDetails.push("Dimensions: " + file.metadata.width + " × " + file.metadata.height);
      }
      if (file.metadata.duration) {
        var dur = file.metadata.duration;
        var durStr;
        if (typeof dur === "string" && dur.indexOf(":") !== -1) {
          durStr = dur;
        } else {
          var sec = Math.round(Number(dur));
          if (!isNaN(sec) && isFinite(sec) && sec > 0) {
            var m = Math.floor(sec / 60);
            var s = sec % 60;
            durStr = m + ":" + (s < 10 ? "0" : "") + s;
          }
        }
        if (durStr) metaDetails.push("Duration: " + durStr);
      }
      if (file.metadata.artist) metaDetails.push("Artist: " + file.metadata.artist);
      if (file.metadata.title) metaDetails.push("Title: " + file.metadata.title);
      if (file.metadata.album) metaDetails.push("Album: " + file.metadata.album);
    }
    if (metaDetails.length > 0) {
      metaDetailsEl.textContent = metaDetails.join(" • ");
    } else {
      metaDetailsEl.textContent = "Standard file stream";
    }

    var previewMount = document.getElementById("share-preview-mount");
    mountPreviewToContainer(
      file,
      "/api/shares/" + shareToken + "/preview",
      "/api/shares/" + shareToken + "/cover",
      previewMount,
      file.allowDownload
    );

    var saveBtn = document.getElementById("share-save-vault-btn");
    var registerBanner = document.getElementById("share-public-register-banner");
    var loggedInBanner = document.getElementById("share-logged-in-banner");

    if (file.userLoggedIn) {
      if (registerBanner) registerBanner.classList.add("d-none");
      if (file.allowDownload || !file.isPublic) {
        if (saveBtn) {
          saveBtn.classList.remove("d-none");
          saveBtn.onclick = function () {
            saveSingleToVault(shareToken);
          };
        }
        if (loggedInBanner) loggedInBanner.classList.remove("d-none");
        if (new URLSearchParams(window.location.search).get("action") === "add_to_vault") {
          saveSingleToVault(shareToken);
        }
      }
    } else {
      if (saveBtn) saveBtn.classList.add("d-none");
      if (loggedInBanner) loggedInBanner.classList.add("d-none");
      if (file.allowDownload && registerBanner) {
        registerBanner.classList.remove("d-none");
        var regBtn = document.getElementById("share-banner-register-btn");
        var loginBtn = document.getElementById("share-banner-login-btn");
        if (regBtn) {
          regBtn.href =
            "/login?mode=register&redirect=" +
            encodeURIComponent(window.location.pathname + "?action=add_to_vault");
        }
        if (loginBtn) {
          loginBtn.href =
            "/login?redirect=" +
            encodeURIComponent(window.location.pathname + "?action=add_to_vault");
        }
      }
    }
  }

  function saveSingleToVault(shareToken) {
    var btn = document.getElementById("share-save-vault-btn");
    if (!btn) return;
    btn.disabled = true;
    btn.innerHTML =
      '<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> Saving...';

    api("/shares/" + shareToken + "/save-to-vault", { method: "POST" })
      .then(function (r) {
        return r.json().then(function (d) {
          return { ok: r.ok, status: r.status, data: d };
        });
      })
      .then(function (res) {
        if (!res.ok) {
          btn.disabled = false;
          btn.innerHTML =
            '<img src="/src/assets/icons/lib/SVG/regular/home.svg" width="16" height="16" alt="" style="image-rendering: pixelated;" /><span>Add to Vault</span>';
          if (res.status === 401 || (res.data && res.data.requiresAuth)) {
            window.location.href =
              "/login?redirect=" +
              encodeURIComponent(window.location.pathname + "?action=add_to_vault");
            return;
          }
          showShareError((res.data && res.data.error) || "Failed to add to vault");
          return;
        }
        btn.disabled = true;
        btn.className =
          "btn btn-white border border-dark fw-bold d-flex align-items-center gap-2 px-3 py-2";
        btn.innerHTML =
          '<img src="/src/assets/icons/lib/SVG/regular/check.svg" width="14" height="14" alt="" style="image-rendering: pixelated;" /><span>Saved to Vault</span>';
        var alertEl = document.getElementById("share-saved-alert");
        var msgEl = document.getElementById("share-saved-msg");
        if (alertEl && msgEl) {
          msgEl.textContent = res.data.message || "File successfully added to your vault!";
          alertEl.classList.remove("d-none");
        }
      })
      .catch(function (err) {
        btn.disabled = false;
        btn.innerHTML =
          '<img src="/src/assets/icons/lib/SVG/regular/home.svg" width="16" height="16" alt="" style="image-rendering: pixelated;" /><span>Add to Vault</span>';
        console.error("Save to vault error:", err);
        showShareError("Error adding to vault");
      });
  }

  function saveBatchToVault(shareToken) {
    var btn = document.getElementById("batch-save-vault-btn");
    if (!btn) return;
    btn.disabled = true;
    btn.innerHTML =
      '<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> Saving...';

    api("/shares/" + shareToken + "/save-to-vault", { method: "POST" })
      .then(function (r) {
        return r.json().then(function (d) {
          return { ok: r.ok, status: r.status, data: d };
        });
      })
      .then(function (res) {
        if (!res.ok) {
          btn.disabled = false;
          btn.innerHTML =
            '<img src="/src/assets/icons/lib/SVG/regular/home.svg" width="16" height="16" alt="" style="image-rendering: pixelated;" /><span>Add All to Vault</span>';
          if (res.status === 401 || (res.data && res.data.requiresAuth)) {
            window.location.href =
              "/login?redirect=" +
              encodeURIComponent(window.location.pathname + "?action=add_to_vault");
            return;
          }
          showShareError((res.data && res.data.error) || "Failed to add collection to vault");
          return;
        }
        btn.disabled = true;
        btn.className =
          "btn btn-white border border-dark fw-bold d-flex align-items-center gap-2 px-3 py-2";
        btn.innerHTML =
          '<img src="/src/assets/icons/lib/SVG/regular/check.svg" width="14" height="14" alt="" style="image-rendering: pixelated;" /><span>Saved to Vault</span>';
        var alertEl = document.getElementById("batch-saved-alert");
        var msgEl = document.getElementById("batch-saved-msg");
        if (alertEl && msgEl) {
          msgEl.textContent = res.data.message || "Collection successfully added to your vault!";
          alertEl.classList.remove("d-none");
        }
      })
      .catch(function (err) {
        btn.disabled = false;
        btn.innerHTML =
          '<img src="/src/assets/icons/lib/SVG/regular/home.svg" width="16" height="16" alt="" style="image-rendering: pixelated;" /><span>Add All to Vault</span>';
        console.error("Save batch to vault error:", err);
        showShareError("Error adding collection to vault");
      });
  }

  function renderBatchView(batch, shareToken) {
    document.getElementById("share-single-view").classList.add("d-none");
    document.getElementById("share-batch-view").classList.remove("d-none");

    document.title = "PinkBox <3 | " + (batch.title || "Shared Collection");
    document.getElementById("batch-collection-title").textContent =
      batch.title || "Shared Collection";
    document.getElementById("batch-collection-subtitle").textContent =
      batch.fileCount +
      (batch.fileCount === 1 ? " file" : " files") +
      " • " +
      formatBytes(batch.totalBytes);

    var zipBox = document.getElementById("batch-download-action-box");
    var zipBtn = document.getElementById("batch-download-zip-btn");
    var viewOnlyBanner = document.getElementById("batch-viewonly-banner");

    if (batch.allowDownload) {
      zipBox.classList.remove("d-none");
      zipBtn.href = "/api/shares/" + shareToken + "/download";
      if (hasReachedDownloadLimit(batch)) disableDownloadLink(zipBtn);
      viewOnlyBanner.classList.add("d-none");
    } else {
      zipBox.classList.add("d-none");
      viewOnlyBanner.classList.remove("d-none");
    }

    var batchSaveBtn = document.getElementById("batch-save-vault-btn");
    var batchRegisterBanner = document.getElementById("batch-public-register-banner");
    var batchLoggedInBanner = document.getElementById("batch-logged-in-banner");

    if (batch.userLoggedIn) {
      if (batchRegisterBanner) batchRegisterBanner.classList.add("d-none");
      if (batch.allowDownload || !batch.isPublic) {
        if (batchSaveBtn) {
          batchSaveBtn.classList.remove("d-none");
          batchSaveBtn.onclick = function () {
            saveBatchToVault(shareToken);
          };
        }
        if (batchLoggedInBanner) batchLoggedInBanner.classList.remove("d-none");
        if (new URLSearchParams(window.location.search).get("action") === "add_to_vault") {
          saveBatchToVault(shareToken);
        }
      }
    } else {
      if (batchSaveBtn) batchSaveBtn.classList.add("d-none");
      if (batchLoggedInBanner) batchLoggedInBanner.classList.add("d-none");
      if (batch.allowDownload && batchRegisterBanner) {
        batchRegisterBanner.classList.remove("d-none");
        var regBtn = document.getElementById("batch-banner-register-btn");
        var loginBtn = document.getElementById("batch-banner-login-btn");
        if (regBtn) {
          regBtn.href =
            "/login?mode=register&redirect=" +
            encodeURIComponent(window.location.pathname + "?action=add_to_vault");
        }
        if (loginBtn) {
          loginBtn.href =
            "/login?redirect=" +
            encodeURIComponent(window.location.pathname + "?action=add_to_vault");
        }
      }
    }

    var tbody = document.getElementById("batch-files-tbody");
    tbody.innerHTML = "";

    (batch.files || []).forEach(function (f) {
      var tr = document.createElement("tr");

      var iconTd = document.createElement("td");
      iconTd.className = "text-center";
      iconTd.innerHTML =
        '<img src="' +
        getFileIconUrl(f.mimeType, f.fileName) +
        '" width="22" height="22" style="image-rendering: pixelated; object-fit: contain;" alt="" />';

      var nameTd = document.createElement("td");
      nameTd.className = "fw-bold text-truncate";
      nameTd.style.maxWidth = "280px";
      nameTd.textContent = f.fileName;
      nameTd.title = f.fileName;

      var sizeTd = document.createElement("td");
      sizeTd.className = "text-muted font-monospace small d-none d-sm-table-cell";
      sizeTd.textContent = formatBytes(f.sizeBytes);

      var actionTd = document.createElement("td");
      actionTd.className = "text-end pe-3";

      var actionsDiv = document.createElement("div");
      actionsDiv.className = "d-inline-flex gap-1 align-items-center";

      var prevBtn = document.createElement("button");
      prevBtn.type = "button";
      prevBtn.className = "btn btn-sm btn-outline-dark fw-bold py-0 px-2";
      prevBtn.style.fontSize = "0.78rem";
      prevBtn.textContent = "Preview";
      prevBtn.onclick = function () {
        openBatchPreview(f, shareToken, batch);
      };
      actionsDiv.appendChild(prevBtn);

      if (batch.userLoggedIn && (batch.allowDownload || !batch.isPublic)) {
        var addRowBtn = document.createElement("button");
        addRowBtn.type = "button";
        addRowBtn.className = "btn btn-sm btn-white border border-dark fw-bold py-0 px-2";
        addRowBtn.style.fontSize = "0.78rem";
        addRowBtn.textContent = "+ Vault";
        addRowBtn.title = "Add this item to your vault";
        addRowBtn.onclick = function () {
          addRowBtn.disabled = true;
          addRowBtn.textContent = "Adding...";
          api("/shares/" + shareToken + "/files/" + f.id + "/save-to-vault", { method: "POST" })
            .then(function (r) {
              return r.json();
            })
            .then(function (d) {
              if (d.error) {
                addRowBtn.disabled = false;
                addRowBtn.textContent = "+ Vault";
                showShareError(d.error);
              } else {
                addRowBtn.textContent = "Added";
                addRowBtn.classList.add("text-success");
              }
            })
            .catch(function () {
              addRowBtn.disabled = false;
              addRowBtn.textContent = "+ Vault";
            });
        };
        actionsDiv.appendChild(addRowBtn);
      }

      if (batch.allowDownload) {
        var dlBtn = document.createElement("a");
        dlBtn.href = "/api/shares/" + shareToken + "/files/" + f.id + "/download";
        dlBtn.className = "btn btn-sm btn-success fw-bold py-0 px-2";
        dlBtn.style.fontSize = "0.78rem";
        dlBtn.textContent = "Download";
        if (hasReachedDownloadLimit(batch)) disableDownloadLink(dlBtn);
        actionsDiv.appendChild(dlBtn);
      }

      if (batch.accessType === "edit") {
        var removeBtn = document.createElement("button");
        removeBtn.type = "button";
        removeBtn.className = "btn btn-sm btn-danger fw-bold py-0 px-2";
        removeBtn.style.fontSize = "0.78rem";
        removeBtn.textContent = "Remove";
        removeBtn.onclick = function () {
          removeSharedFile(shareToken, f.id, f.fileName, function () {
            tr.remove();
            batch.files = batch.files.filter(function (item) {
              return item.id !== f.id;
            });
            batch.fileCount = batch.files.length;
            batch.totalBytes = batch.files.reduce(function (sum, item) {
              return sum + (Number(item.sizeBytes) || 0);
            }, 0);
            document.getElementById("batch-collection-subtitle").textContent =
              batch.fileCount +
              (batch.fileCount === 1 ? " file" : " files") +
              " • " +
              formatBytes(batch.totalBytes);
            if (batch.fileCount === 0) {
              tbody.innerHTML =
                '<tr><td colspan="4" class="text-center text-muted py-4">This collection is empty.</td></tr>';
            }
          });
        };
        actionsDiv.appendChild(removeBtn);
      }

      actionTd.appendChild(actionsDiv);

      tr.appendChild(iconTd);
      tr.appendChild(nameTd);
      tr.appendChild(sizeTd);
      tr.appendChild(actionTd);
      tbody.appendChild(tr);
    });
  }

  function removeSharedFile(shareToken, fileId, fileName, onSuccess) {
    showShareConfirm(fileName, function () {
      api("/shares/" + shareToken + "/files/" + fileId, { method: "DELETE" })
        .then(function (response) {
          return response.json().then(function (data) {
            return { ok: response.ok, data: data };
          });
        })
        .then(function (result) {
          if (!result.ok || result.data.error) {
            showShareError(result.data.error || "Failed to remove file from share");
            return;
          }
          showShareError("File removed from share");
          onSuccess();
        })
        .catch(function () {
          showShareError("Failed to remove file from share");
        });
    });
  }

  function openBatchPreview(file, shareToken, batch) {
    if (!batchModal) return;
    var allowDownload = batch.allowDownload && !hasReachedDownloadLimit(batch);
    document.getElementById("batch-modal-filename").textContent = file.fileName;
    document.getElementById("batch-modal-filesize").textContent = formatBytes(file.sizeBytes);

    var dlBtn = document.getElementById("batch-modal-download-btn");
    if (allowDownload) {
      dlBtn.classList.remove("d-none");
      dlBtn.href = "/api/shares/" + shareToken + "/files/" + file.id + "/download";
    } else {
      dlBtn.classList.add("d-none");
    }

    var mount = document.getElementById("batch-modal-mount");
    mountPreviewToContainer(
      file,
      "/api/shares/" + shareToken + "/files/" + file.id + "/preview",
      "/api/shares/" + shareToken + "/files/" + file.id + "/cover",
      mount,
      allowDownload
    );

    batchModal.show();
  }

  function mountPreviewToContainer(file, previewUrl, coverUrl, mount, allowDownload) {
    if (!mount) return;
    mount.innerHTML = "";

    var mime = (file.mimeType || "").toLowerCase();
    var nameLower = (file.fileName || "").toLowerCase();

    var isImg = mime.startsWith("image/");
    var isVid = mime.startsWith("video/");
    var isAudio =
      mime.startsWith("audio/") ||
      nameLower.endsWith(".mp3") ||
      nameLower.endsWith(".m4a") ||
      nameLower.endsWith(".flac") ||
      nameLower.endsWith(".wav") ||
      nameLower.endsWith(".ogg");
    var isPdf = mime.includes("pdf") || nameLower.endsWith(".pdf");
    var isText =
      mime.startsWith("text/") ||
      [
        ".txt",
        ".md",
        ".json",
        ".js",
        ".ts",
        ".html",
        ".css",
        ".py",
        ".c",
        ".cpp",
        ".sh",
        ".sql",
        ".xml",
        ".yml",
        ".yaml",
      ].some(function (ext) {
        return nameLower.endsWith(ext);
      });

    if (isImg) {
      var img = document.createElement("img");
      img.src = previewUrl;
      img.alt = file.fileName;
      img.className = "img-fluid rounded border border-dark shadow-sm";
      img.style.maxHeight = "500px";
      img.style.objectFit = "contain";
      img.style.background = "#fff";
      mount.appendChild(img);
    } else if (isVid) {
      var videoWrap = document.createElement("div");
      videoWrap.className = "w-100 rounded border border-dark shadow-sm overflow-hidden bg-white";
      videoWrap.style.maxWidth = "800px";
      videoWrap.style.margin = "0 auto";

      var videoEl = document.createElement("video");
      videoEl.src = previewUrl;
      videoEl.playsInline = true;
      videoEl.preload = "metadata";
      videoEl.style.maxHeight = "500px";
      videoEl.style.width = "100%";
      videoEl.style.background = "#000000";
      videoEl.style.cursor = "pointer";
      videoEl.style.display = "block";
      if (!allowDownload) {
        videoEl.oncontextmenu = function (e) {
          e.preventDefault();
        };
      }

      var controlsEl = document.createElement("div");
      controlsEl.className = "p-3 border-top border-dark bg-white text-dark";
      controlsEl.innerHTML =
        '<div class="video-progress-wrap my-1 position-relative" style="cursor: pointer; height: 10px; background: #f1f5f9; border-radius: 5px; border: 2px solid #000000;">' +
        '<div class="video-progress-fill" style="height: 100%; width: 0%; background: #ff69b4; border-radius: 3px; position: relative;">' +
        '<div class="video-progress-handle" style="position: absolute; right: -10px; top: 50%; transform: translateY(-50%); width: 20px; height: 20px; background-color: #ffffff; border: 2px solid #000000; border-radius: 50%; box-shadow: 2px 2px 0 0 #000000; pointer-events: none;"></div>' +
        "</div>" +
        "</div>" +
        '<div class="d-flex justify-content-between small text-muted font-monospace mb-2" style="font-size: 0.75rem;">' +
        '<span class="video-current-time">0:00</span>' +
        '<span class="video-total-time">0:00</span>' +
        "</div>" +
        '<div class="d-flex align-items-center justify-content-between flex-wrap gap-2">' +
        '<div class="d-flex align-items-center gap-1">' +
        '<button type="button" class="btn btn-sm btn-white border border-dark py-1 px-2 video-rwd-btn" title="Rewind 10s">-10s</button>' +
        '<button type="button" class="btn btn-sm btn-primary py-1 px-3 fw-bold video-play-pause-btn" style="min-width: 75px;">Play</button>' +
        '<button type="button" class="btn btn-sm btn-white border border-dark py-1 px-2 video-fwd-btn" title="Forward 10s">+10s</button>' +
        "</div>" +
        '<div class="d-flex align-items-center gap-2 ms-auto">' +
        '<button type="button" class="btn btn-sm btn-white border border-dark py-0 px-2 video-mute-btn">' +
        '<img src="/src/assets/icons/lib/PNG/for-light-mode/16px/regular/sound-on.png" width="14" height="14" style="image-rendering: pixelated; vertical-align: -2px; margin-right: 4px;" alt="" />Mute' +
        "</button>" +
        '<input type="range" class="form-range video-volume-slider" min="0" max="1" step="0.05" value="1" style="width: 75px;" />' +
        '<button type="button" class="btn btn-sm btn-white border border-dark py-0 px-2 video-fullscreen-btn" title="Toggle Fullscreen">Fullscreen</button>' +
        "</div>" +
        "</div>";

      videoWrap.appendChild(videoEl);
      videoWrap.appendChild(controlsEl);
      mount.appendChild(videoWrap);

      var playPauseBtn = controlsEl.querySelector(".video-play-pause-btn");
      var rwdBtn = controlsEl.querySelector(".video-rwd-btn");
      var fwdBtn = controlsEl.querySelector(".video-fwd-btn");
      var muteBtn = controlsEl.querySelector(".video-mute-btn");
      var volumeSlider = controlsEl.querySelector(".video-volume-slider");
      var fullscreenBtn = controlsEl.querySelector(".video-fullscreen-btn");
      var progressWrap = controlsEl.querySelector(".video-progress-wrap");
      var progressFill = controlsEl.querySelector(".video-progress-fill");
      var currentTimeEl = controlsEl.querySelector(".video-current-time");
      var totalTimeEl = controlsEl.querySelector(".video-total-time");

      function toggleVideoPlay() {
        if (videoEl.paused) {
          videoEl.play().catch(function () {});
        } else {
          videoEl.pause();
        }
      }

      playPauseBtn.onclick = toggleVideoPlay;
      videoEl.onclick = toggleVideoPlay;

      videoEl.onplay = function () {
        playPauseBtn.textContent = "Pause";
      };
      videoEl.onpause = function () {
        playPauseBtn.textContent = "Play";
      };
      videoEl.onended = function () {
        playPauseBtn.textContent = "Play";
      };

      videoEl.ontimeupdate = function () {
        if (!videoEl.duration) return;
        var pct = (videoEl.currentTime / videoEl.duration) * 100;
        progressFill.style.width = pct + "%";
        currentTimeEl.textContent = formatMediaTime(videoEl.currentTime);
      };

      videoEl.onloadedmetadata = function () {
        totalTimeEl.textContent = formatMediaTime(videoEl.duration);
      };

      rwdBtn.onclick = function () {
        videoEl.currentTime = Math.max(0, videoEl.currentTime - 10);
      };

      fwdBtn.onclick = function () {
        if (videoEl.duration) {
          videoEl.currentTime = Math.min(videoEl.duration, videoEl.currentTime + 10);
        }
      };

      progressWrap.onclick = function (e) {
        if (!videoEl.duration) return;
        var rect = progressWrap.getBoundingClientRect();
        var ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
        videoEl.currentTime = ratio * videoEl.duration;
      };

      function updateVideoMuteState() {
        var isMuted = videoEl.muted || videoEl.volume === 0;
        var icon = isMuted
          ? "/src/assets/icons/lib/PNG/for-light-mode/16px/regular/sound-mute.png"
          : "/src/assets/icons/lib/PNG/for-light-mode/16px/regular/sound-on.png";
        muteBtn.innerHTML =
          '<img src="' +
          icon +
          '" width="14" height="14" style="image-rendering: pixelated; vertical-align: -2px; margin-right: 4px;" alt="" />' +
          (isMuted ? "Unmute" : "Mute");
      }

      muteBtn.onclick = function () {
        videoEl.muted = !videoEl.muted;
        updateVideoMuteState();
      };

      volumeSlider.oninput = function () {
        videoEl.volume = parseFloat(this.value);
        if (videoEl.muted && videoEl.volume > 0) {
          videoEl.muted = false;
        }
        updateVideoMuteState();
      };

      fullscreenBtn.onclick = function () {
        var target = videoWrap;
        if (!document.fullscreenElement) {
          if (target.requestFullscreen) target.requestFullscreen();
          else if (target.webkitRequestFullscreen) target.webkitRequestFullscreen();
        } else {
          if (document.exitFullscreen) document.exitFullscreen();
          else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
        }
      };
    } else if (isAudio) {
      var audioCard = document.createElement("div");
      audioCard.className =
        "p-4 border border-dark rounded bg-white text-dark shadow-sm d-flex flex-column align-items-center justify-content-center";
      audioCard.style.maxWidth = "520px";
      audioCard.style.margin = "0 auto";

      var cover = document.createElement("img");
      cover.src = coverUrl;
      cover.className = "rounded border border-dark shadow-sm mb-3";
      cover.style.width = "180px";
      cover.style.height = "180px";
      cover.style.objectFit = "cover";
      cover.style.display = "none";
      cover.onload = function () {
        cover.style.display = "";
      };
      cover.onerror = function () {
        cover.style.display = "none";
      };

      var titleText = file.metadata && file.metadata.title ? file.metadata.title : file.fileName;
      var artistText = file.metadata && file.metadata.artist ? file.metadata.artist : "Audio Track";

      var infoBox = document.createElement("div");
      infoBox.className = "text-center w-100 mb-3";
      infoBox.innerHTML =
        '<div class="fw-bold fs-6 text-truncate w-100" title="' +
        escapeHtml(titleText) +
        '">' +
        escapeHtml(titleText) +
        "</div>" +
        '<div class="text-muted small text-truncate w-100 font-monospace">' +
        escapeHtml(artistText) +
        "</div>";

      var audioEl = document.createElement("audio");
      audioEl.src = previewUrl;
      audioEl.preload = "metadata";
      audioEl.style.display = "none";
      if (!allowDownload) {
        audioEl.oncontextmenu = function (e) {
          e.preventDefault();
        };
      }

      var scrubberBox = document.createElement("div");
      scrubberBox.className = "w-100 px-2 mb-2";
      scrubberBox.innerHTML =
        '<div class="audio-progress-wrap my-1 position-relative" style="cursor: pointer; height: 10px; background: #f1f5f9; border-radius: 5px; border: 2px solid #000000;">' +
        '<div class="audio-progress-fill" style="height: 100%; width: 0%; background: #ff69b4; border-radius: 3px; position: relative;">' +
        '<div class="audio-progress-handle" style="position: absolute; right: -10px; top: 50%; transform: translateY(-50%); width: 20px; height: 20px; background-color: #ffffff; border: 2px solid #000000; border-radius: 50%; box-shadow: 2px 2px 0 0 #000000; pointer-events: none;"></div>' +
        "</div>" +
        "</div>" +
        '<div class="d-flex justify-content-between small text-muted font-monospace" style="font-size: 0.75rem;">' +
        '<span class="audio-current-time">0:00</span>' +
        '<span class="audio-total-time">0:00</span>' +
        "</div>";

      var controlsBar = document.createElement("div");
      controlsBar.className =
        "d-flex align-items-center justify-content-between w-100 px-2 flex-wrap gap-2";
      controlsBar.innerHTML =
        '<div class="d-flex align-items-center gap-1">' +
        '<button type="button" class="btn btn-sm btn-white border border-dark py-1 px-2 audio-rwd-btn" title="Rewind 10s">-10s</button>' +
        '<button type="button" class="btn btn-sm btn-primary py-1 px-3 fw-bold audio-play-pause-btn" style="min-width: 75px;">Play</button>' +
        '<button type="button" class="btn btn-sm btn-white border border-dark py-1 px-2 audio-fwd-btn" title="Forward 10s">+10s</button>' +
        "</div>" +
        '<div class="d-flex align-items-center gap-2 ms-auto">' +
        '<button type="button" class="btn btn-sm btn-white border border-dark py-0 px-2 audio-mute-btn">' +
        '<img src="/src/assets/icons/lib/PNG/for-light-mode/16px/regular/sound-on.png" width="14" height="14" style="image-rendering: pixelated; vertical-align: -2px; margin-right: 4px;" alt="" />Mute' +
        "</button>" +
        '<input type="range" class="form-range audio-volume-slider" min="0" max="1" step="0.05" value="1" style="width: 75px;" />' +
        "</div>";

      audioCard.appendChild(cover);
      audioCard.appendChild(infoBox);
      audioCard.appendChild(audioEl);
      audioCard.appendChild(scrubberBox);
      audioCard.appendChild(controlsBar);
      mount.appendChild(audioCard);

      var aPlayPauseBtn = controlsBar.querySelector(".audio-play-pause-btn");
      var aRwdBtn = controlsBar.querySelector(".audio-rwd-btn");
      var aFwdBtn = controlsBar.querySelector(".audio-fwd-btn");
      var aMuteBtn = controlsBar.querySelector(".audio-mute-btn");
      var aVolumeSlider = controlsBar.querySelector(".audio-volume-slider");
      var aProgressWrap = scrubberBox.querySelector(".audio-progress-wrap");
      var aProgressFill = scrubberBox.querySelector(".audio-progress-fill");
      var aCurrentTimeEl = scrubberBox.querySelector(".audio-current-time");
      var aTotalTimeEl = scrubberBox.querySelector(".audio-total-time");

      function toggleAudioPlay() {
        if (audioEl.paused) {
          audioEl.play().catch(function () {});
        } else {
          audioEl.pause();
        }
      }

      aPlayPauseBtn.onclick = toggleAudioPlay;

      audioEl.onplay = function () {
        aPlayPauseBtn.textContent = "Pause";
      };
      audioEl.onpause = function () {
        aPlayPauseBtn.textContent = "Play";
      };
      audioEl.onended = function () {
        aPlayPauseBtn.textContent = "Play";
      };

      audioEl.ontimeupdate = function () {
        if (!audioEl.duration) return;
        var pct = (audioEl.currentTime / audioEl.duration) * 100;
        aProgressFill.style.width = pct + "%";
        aCurrentTimeEl.textContent = formatMediaTime(audioEl.currentTime);
      };

      audioEl.onloadedmetadata = function () {
        aTotalTimeEl.textContent = formatMediaTime(audioEl.duration);
      };

      aRwdBtn.onclick = function () {
        audioEl.currentTime = Math.max(0, audioEl.currentTime - 10);
      };

      aFwdBtn.onclick = function () {
        if (audioEl.duration) {
          audioEl.currentTime = Math.min(audioEl.duration, audioEl.currentTime + 10);
        }
      };

      aProgressWrap.onclick = function (e) {
        if (!audioEl.duration) return;
        var rect = aProgressWrap.getBoundingClientRect();
        var ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
        audioEl.currentTime = ratio * audioEl.duration;
      };

      function updateAudioMuteState() {
        var isMuted = audioEl.muted || audioEl.volume === 0;
        var icon = isMuted
          ? "/src/assets/icons/lib/PNG/for-light-mode/16px/regular/sound-mute.png"
          : "/src/assets/icons/lib/PNG/for-light-mode/16px/regular/sound-on.png";
        aMuteBtn.innerHTML =
          '<img src="' +
          icon +
          '" width="14" height="14" style="image-rendering: pixelated; vertical-align: -2px; margin-right: 4px;" alt="" />' +
          (isMuted ? "Unmute" : "Mute");
      }

      aMuteBtn.onclick = function () {
        audioEl.muted = !audioEl.muted;
        updateAudioMuteState();
      };

      aVolumeSlider.oninput = function () {
        audioEl.volume = parseFloat(this.value);
        if (audioEl.muted && audioEl.volume > 0) {
          audioEl.muted = false;
        }
        updateAudioMuteState();
      };
    } else if (isPdf) {
      var pdfFrame = document.createElement("iframe");
      pdfFrame.src = previewUrl;
      pdfFrame.className = "w-100 rounded border border-dark shadow-sm";
      pdfFrame.style.height = "500px";
      pdfFrame.title = "PDF Viewer";
      mount.appendChild(pdfFrame);
    } else if (isText && file.sizeBytes < 2 * 1024 * 1024) {
      var codeContainer = document.createElement("div");
      codeContainer.className = "code-preview-scroll-box text-start rounded border border-dark";
      codeContainer.style.maxHeight = "450px";
      codeContainer.style.overflow = "auto";
      codeContainer.textContent = "Loading preview...";
      mount.appendChild(codeContainer);

      fetch(previewUrl)
        .then(function (res) {
          if (!res.ok) throw new Error("Failed to load text preview");
          return res.text();
        })
        .then(function (txt) {
          if (window.PinkBoxCodePreview) {
            var highlighted = window.PinkBoxCodePreview.highlightCode(
              txt,
              file.fileName,
              file.mimeType
            );
            codeContainer.innerHTML = highlighted.html;
          } else {
            codeContainer.textContent = txt;
          }
        })
        .catch(function () {
          codeContainer.textContent = "Failed to load text preview.";
        });
    } else {
      var genericBox = document.createElement("div");
      genericBox.className = "py-5 d-flex flex-column align-items-center justify-content-center";
      var icon = document.createElement("img");
      icon.src = getFileIconUrl(file.mimeType, file.fileName);
      icon.style.width = "64px";
      icon.style.height = "64px";
      icon.style.imageRendering = "pixelated";
      icon.style.objectFit = "contain";
      icon.className = "mb-3";
      var note = document.createElement("div");
      note.className = "text-muted small";
      note.textContent = allowDownload
        ? "Preview not available for this file type. Click Download to retrieve the file."
        : "Preview not available for this file type.";

      genericBox.appendChild(icon);
      genericBox.appendChild(note);
      mount.appendChild(genericBox);
    }
  }
})();
