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

var activeShareTarget = null;

function openShareModal(file) {
  closeAllMenus();
  activeShareTarget = { type: "file", file: file };
  setupShareModalUI(
    file.original_name,
    formatBytes(file.size_bytes),
    getFileUnicodeIcon(file.mime_type, file.original_name)
  );
  loadActiveShares(file.id);
  shareModal.show();
}

function openShareModalForFolder(folder) {
  closeAllMenus();
  activeShareTarget = { type: "folder", folder: folder };
  setupShareModalUI(
    folder.name,
    "Folder",
    '<img src="/src/assets/icons/file-folder.png" alt="" width="22" height="22" style="object-fit: contain; vertical-align: middle;" />'
  );
  var listEl = document.getElementById("active-shares-list");
  if (listEl) {
    listEl.innerHTML =
      '<div class="text-muted small text-center py-2">Create a link below to share all files in this folder.</div>';
  }
  shareModal.show();
}

function openBatchShareModal(fileIds, folderIds) {
  closeAllMenus();
  var count = (fileIds || []).length + (folderIds || []).length;
  if (count === 0) return;

  var totalBytes = 0;
  allLoadedFiles.forEach(function (f) {
    if (fileIds && fileIds.indexOf(f.id) !== -1) {
      totalBytes += parseInt(f.size_bytes, 10) || 0;
    }
  });

  activeShareTarget = {
    type: "batch",
    fileIds: fileIds || [],
    folderIds: folderIds || [],
    count: count,
  };

  setupShareModalUI(
    count + " Selected Items",
    formatBytes(totalBytes) + (folderIds && folderIds.length > 0 ? " +" : ""),
    '<img src="/src/assets/icons/lib/SVG/regular/share.svg" width="22" height="22" style="object-fit: contain;" alt="" />'
  );
  var listEl = document.getElementById("active-shares-list");
  if (listEl) {
    listEl.innerHTML =
      '<div class="text-muted small text-center py-2">Create a link below to share these selected items together.</div>';
  }
  shareModal.show();
}

function setupShareModalUI(title, sizeText, iconHtml) {
  var passwordEnabledCheckbox = document.getElementById("share-password-enabled");
  var passwordWrap = document.getElementById("share-password-wrap");
  var passwordInput = document.getElementById("share-password");
  if (passwordEnabledCheckbox) passwordEnabledCheckbox.checked = false;
  if (passwordWrap) passwordWrap.classList.add("d-none");
  if (passwordInput) {
    passwordInput.value = "";
    passwordInput.required = false;
  }
  var filenameEl = document.getElementById("share-modal-filename");
  var filesizeEl = document.getElementById("share-modal-filesize");
  var iconEl = document.getElementById("share-file-icon");
  if (filenameEl) filenameEl.textContent = title;
  if (filesizeEl) filesizeEl.textContent = sizeText;
  if (iconEl) iconEl.innerHTML = iconHtml;

  var viewOnlyRadio = document.getElementById("sharePermViewOnly");
  if (viewOnlyRadio) viewOnlyRadio.checked = true;
  var editRadio = document.getElementById("sharePermEdit");
  if (editRadio) editRadio.checked = false;
  var limitAccessCheckbox = document.getElementById("share-limit-access");
  var limitAccessWrap = document.getElementById("share-limit-access-wrap");
  if (limitAccessCheckbox) limitAccessCheckbox.checked = false;
  if (limitAccessWrap) limitAccessWrap.classList.add("d-none");
  var maxViewsInput = document.getElementById("share-max-views");
  if (maxViewsInput) maxViewsInput.value = "100";
  var maxDownloadsInput = document.getElementById("share-max-downloads");
  if (maxDownloadsInput) maxDownloadsInput.value = "100";
  var publicRadio = document.getElementById("shareVisPublic");
  if (publicRadio) publicRadio.checked = true;

  document.querySelectorAll(".share-expiry-pill").forEach(function (p) {
    p.classList.remove("active");
  });
  var neverPill = document.querySelector(".share-expiry-pill[data-minutes='0']");
  if (neverPill) neverPill.classList.add("active");
  var customWrap = document.getElementById("share-expiry-custom-wrap");
  if (customWrap) customWrap.classList.add("d-none");
  var customInput = document.getElementById("share-expiry-custom-input");
  if (customInput) customInput.value = "";
}

var limitAccessCheckbox = document.getElementById("share-limit-access");
if (limitAccessCheckbox) {
  limitAccessCheckbox.addEventListener("change", function () {
    var limitAccessWrap = document.getElementById("share-limit-access-wrap");
    if (limitAccessWrap) limitAccessWrap.classList.toggle("d-none", !limitAccessCheckbox.checked);
  });
}

var passwordEnabledCheckbox = document.getElementById("share-password-enabled");
if (passwordEnabledCheckbox) {
  passwordEnabledCheckbox.addEventListener("change", function () {
    var passwordWrap = document.getElementById("share-password-wrap");
    var passwordInput = document.getElementById("share-password");
    if (passwordWrap) passwordWrap.classList.toggle("d-none", !passwordEnabledCheckbox.checked);
    if (passwordInput) passwordInput.required = passwordEnabledCheckbox.checked;
  });
}

function renderShareCard(s, onRevoke) {
  var item = document.createElement("div");
  item.className = "share-card-row";

  var shareUrl = window.location.origin + "/share/" + s.share_token;
  var labelTitle = s.title || s.original_name || (s.is_batch ? "Collection" : "File");

  var permBadge =
    '<span class="badge ' +
    (s.access_type === "edit" ? "bg-warning" : "bg-secondary") +
    '" style="font-size:0.65rem;">' +
    (s.access_type === "edit" ? "Edit" : "View/Download") +
    "</span>";
  var visBadge = s.is_public
    ? '<span class="badge bg-info border border-dark" style="font-size:0.65rem;">Public</span>'
    : '<span class="badge badge-private border border-dark" style="font-size:0.65rem;">Private</span>';
  var typeBadge = s.is_batch
    ? '<span class="badge bg-primary border border-dark" style="font-size:0.65rem;">Bundle</span>'
    : "";
  var securityBadges = s.has_password
    ? '<span class="badge bg-dark" style="font-size:0.65rem;">Password</span>'
    : "";

  var expiryHtml = s.expires_at
    ? '<span class="share-card-expiry" title="Expires">Expires: ' +
      escapeHtml(formatDate(s.expires_at)) +
      "</span>"
    : '<span class="share-card-expiry text-muted">No expiry</span>';

  item.innerHTML =
    '<div class="share-card-top">' +
    '<div class="share-card-badges">' +
    permBadge +
    visBadge +
    typeBadge +
    securityBadges +
    "</div>" +
    '<span class="share-card-title fw-bold" title="' +
    escapeHtml(labelTitle) +
    '">' +
    escapeHtml(labelTitle) +
    "</span>" +
    expiryHtml +
    '<button type="button" class="btn btn-sm py-0 px-1 revoke-share-btn flex-shrink-0" style="font-size:0.7rem;">Revoke</button>' +
    "</div>" +
    '<div class="d-flex gap-1 align-items-stretch mt-1">' +
    '<div class="share-url-copy-box flex-grow-1 position-relative" role="button" tabindex="0" title="Click to copy link to clipboard">' +
    '<span class="share-url-text font-monospace">' +
    escapeHtml(shareUrl) +
    "</span>" +
    '<div class="share-url-overlay"><span class="share-url-overlay-text fw-bold">Click to copy!</span></div>' +
    "</div>" +
    "</div>" +
    '<div class="share-card-stats">' +
    '<span class="share-stat-item"><span class="share-stat-num">' +
    (s.views_count || 0) +
    "</span> views</span>" +
    '<span class="share-stat-item"><span class="share-stat-num">' +
    (s.downloads_count || 0) +
    "</span> downloads</span>" +
    '<span class="share-stat-item"><span class="share-stat-num">' +
    (s.saves_count || 0) +
    "</span> saves</span>" +
    "</div>";

  var urlCopyBox = item.querySelector(".share-url-copy-box");
  var urlOverlayText = urlCopyBox ? urlCopyBox.querySelector(".share-url-overlay-text") : null;
  var urlCopyTimeout = null;
  if (urlCopyBox) {
    var doCopyLink = function () {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(shareUrl).catch(function () {});
      }
      clearTimeout(urlCopyTimeout);
      urlCopyBox.classList.add("share-url-copied");
      if (urlOverlayText) urlOverlayText.textContent = "Copied!";
      urlCopyTimeout = setTimeout(function () {
        urlCopyBox.classList.remove("share-url-copied");
        if (urlOverlayText) urlOverlayText.textContent = "Click to copy!";
      }, 1800);
      pushNotification("Link copied to clipboard!", "success");
    };
    urlCopyBox.onclick = doCopyLink;
    urlCopyBox.onkeydown = function (e) {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        doCopyLink();
      }
    };
  }

  item.querySelector(".revoke-share-btn").onclick = function () {
    showConfirm(
      "Are you sure you want to revoke this share link? It will stop working immediately.",
      function () {
        api("/files/shares/" + s.id, { method: "DELETE" })
          .then(function (r) {
            return r.json();
          })
          .then(function (res) {
            if (res.error) {
              showMsg(res.error, "error");
            } else {
              if (onRevoke) onRevoke();
              else item.remove();
            }
          })
          .catch(function (err) {
            console.error("Revoke share error:", err);
          });
      },
      { title: "Revoke Share Link", okLabel: "Revoke", danger: true }
    );
  };

  return item;
}

function loadAllSharesStats() {
  var listEl = document.getElementById("all-shares-list");
  if (!listEl) return;
  var paginationEl = document.getElementById("all-shares-pagination");
  if (paginationEl) paginationEl.classList.add("d-none");
  listEl.innerHTML = '<div class="text-muted small text-center py-4">Loading...</div>';

  api("/shares/mine/summary")
    .then(function (r) {
      return r.json().then(function (data) {
        return { ok: r.ok, data: data };
      });
    })
    .then(function (res) {
      if (!res.ok) {
        listEl.innerHTML =
          '<div class="text-danger small text-center py-4">Failed to load link statistics.</div>';
        return;
      }
      var d = res.data;
      var el = function (id) {
        return document.getElementById(id);
      };
      if (el("all-stats-total-links")) el("all-stats-total-links").textContent = d.totalShares || 0;
      if (el("all-stats-total-views")) el("all-stats-total-views").textContent = d.totalViews || 0;
      if (el("all-stats-total-downloads"))
        el("all-stats-total-downloads").textContent = d.totalDownloads || 0;
      if (el("all-stats-total-saves")) el("all-stats-total-saves").textContent = d.totalSaves || 0;

      if (!Array.isArray(d.shares) || d.shares.length === 0) {
        listEl.innerHTML =
          '<div class="text-muted small text-center py-5">' +
          '<img src="/src/assets/icons/lib/SVG/regular/globe.svg" width="32" height="32" style="opacity:0.5; object-fit: contain;" class="mb-2" alt="" /><br>' +
          "No active share links yet." +
          "</div>";
        return;
      }
      if (paginationEl) paginationEl.classList.remove("d-none");

      var tableHtml =
        '<table class="share-stats-table">' +
        "<thead><tr>" +
        "<th>File / Collection</th>" +
        "<th>Type</th>" +
        '<th class="text-center" data-col="views_count" style="cursor:pointer;" title="Sort by views">Views ⇅</th>' +
        '<th class="text-center" data-col="downloads_count" style="cursor:pointer;" title="Sort by downloads">Downloads ⇅</th>' +
        '<th class="text-center" data-col="saves_count" style="cursor:pointer;" title="Sort by saves">Saves ⇅</th>' +
        '<th data-col="expires_at" style="cursor:pointer;" title="Sort by expiry">Expires ⇅</th>' +
        "<th></th>" +
        "</tr></thead><tbody>";

      function bundleFilesDetails(s) {
        if (!s.is_batch) return "";
        var files = Array.isArray(s.shared_files) ? s.shared_files : [];
        var fileItems = files
          .map(function (file) {
            return (
              "<li>" +
              escapeHtml(file.fileName || "Unnamed file") +
              ' <span class="text-muted">(' +
              escapeHtml(formatBytes(file.sizeBytes || 0)) +
              ")</span></li>"
            );
          })
          .join("");
        return (
          '<details class="share-bundle-files"><summary>Show files (' +
          files.length +
          ")</summary><ul>" +
          fileItems +
          "</ul></details>"
        );
      }
      function usageCell(count, limit) {
        var content = '<span class="font-monospace fw-bold">' + (count || 0) + "</span>";
        if (limit) {
          content += '<small class="text-muted d-block">of ' + limit + "</small>";
        }
        return '<td class="text-center">' + content + "</td>";
      }

      d.shares.forEach(function (s) {
        var shareUrl = window.location.origin + "/share/" + s.share_token;
        var labelTitle = s.title || s.original_name || (s.is_batch ? "Collection" : "File");
        var permLabel = s.access_type === "edit" ? "Edit" : "View/Download";
        var permCls = s.access_type === "edit" ? "bg-warning" : "bg-secondary";
        var visCls = s.is_public ? "bg-info" : "badge-private";
        var expiryTxt = s.expires_at ? formatDate(s.expires_at) : "-";
        var expiryStyle = s.expires_at ? "" : ' style="color:#aaa;"';
        tableHtml +=
          '<tr class="share-stats-row" data-share-id="' +
          s.id +
          '">' +
          '<td class="share-stats-name" title="' +
          escapeHtml(labelTitle) +
          '">' +
          '<a href="' +
          escapeHtml(shareUrl) +
          '" target="_blank" rel="noopener" class="share-stats-link font-monospace">' +
          escapeHtml(labelTitle) +
          "</a>" +
          bundleFilesDetails(s) +
          "</td>" +
          '<td style="white-space:nowrap;"><span class="badge ' +
          permCls +
          '" style="font-size:0.6rem;">' +
          permLabel +
          '</span> <span class="badge ' +
          visCls +
          ' border border-dark" style="font-size:0.6rem;">' +
          (s.is_public ? "Pub" : "Priv") +
          "</span>" +
          (s.is_batch
            ? ' <span class="badge bg-primary border border-dark" style="font-size:0.6rem;">Bundle</span>'
            : "") +
          (s.has_password
            ? ' <span class="badge bg-dark" style="font-size:0.6rem;">Password</span>'
            : "") +
          "</td>" +
          usageCell(s.views_count, s.max_views) +
          usageCell(s.downloads_count, s.max_downloads) +
          '<td class="text-center font-monospace fw-bold">' +
          (s.saves_count || 0) +
          "</td>" +
          "<td" +
          expiryStyle +
          ' style="font-size:0.72rem;white-space:nowrap;">' +
          escapeHtml(expiryTxt) +
          "</td>" +
          '<td style="white-space:nowrap;">' +
          '<button class="btn btn-sm py-0 px-1 copy-stats-link-btn me-1" data-url="' +
          escapeHtml(shareUrl) +
          '" style="font-size:0.68rem;">Copy</button>' +
          '<button class="btn btn-sm py-0 px-1 revoke-stats-btn" data-id="' +
          s.id +
          '" style="font-size:0.68rem;">Revoke</button>' +
          "</td>" +
          "</tr>";
      });
      tableHtml += "</tbody></table>";
      listEl.innerHTML = tableHtml;

      listEl.querySelectorAll(".copy-stats-link-btn").forEach(function (btn) {
        btn.onclick = function () {
          var url = btn.getAttribute("data-url");
          navigator.clipboard.writeText(url).then(function () {
            btn.classList.add("copy-stats-flashed");
            setTimeout(function () {
              btn.classList.remove("copy-stats-flashed");
            }, 1400);
          });
        };
      });

      listEl.querySelectorAll(".revoke-stats-btn").forEach(function (btn) {
        btn.onclick = function () {
          showConfirm(
            "Are you sure you want to revoke this share link? It will stop working immediately.",
            function () {
              var shareId = btn.getAttribute("data-id");
              api("/files/shares/" + shareId, { method: "DELETE" })
                .then(function (r) {
                  return r.json();
                })
                .then(function (res) {
                  if (res.error) {
                    showMsg(res.error, "error");
                  } else {
                    loadAllSharesStats();
                    if (activeShareTarget && activeShareTarget.type === "file") {
                      loadActiveShares(activeShareTarget.file.id);
                    }
                  }
                })
                .catch(function (err) {
                  console.error("Revoke error:", err);
                });
            },
            { title: "Revoke Share Link", okLabel: "Revoke", danger: true }
          );
        };
      });

      var sortCol = null,
        sortAsc = true;
      var allShares = d.shares.slice();
      var allSharesStatsPageSize =
        parseInt(localStorage.getItem("all_shares_stats_page_size"), 10) || 25;
      var allSharesStatsPage = 1;
      function renderSortedRows() {
        var tbody = listEl.querySelector("tbody");
        if (!tbody) return;
        var sorted = allShares.slice();
        if (sortCol) {
          sorted.sort(function (a, b) {
            var av = a[sortCol],
              bv = b[sortCol];
            if (sortCol === "expires_at") {
              av = av ? new Date(av).getTime() : Infinity;
              bv = bv ? new Date(bv).getTime() : Infinity;
            } else {
              av = av || 0;
              bv = bv || 0;
            }
            return sortAsc ? av - bv : bv - av;
          });
        }

        var totalPages = Math.max(1, Math.ceil(sorted.length / allSharesStatsPageSize));
        allSharesStatsPage = Math.min(Math.max(1, allSharesStatsPage), totalPages);
        var pageStart = (allSharesStatsPage - 1) * allSharesStatsPageSize;
        var pageShares = sorted.slice(pageStart, pageStart + allSharesStatsPageSize);
        var info = document.getElementById("all-shares-pagination-info");
        var indicator = document.getElementById("all-shares-page-indicator");
        var previous = document.getElementById("all-shares-page-prev");
        var next = document.getElementById("all-shares-page-next");
        var sizeButton = document.getElementById("all-shares-page-size-btn");
        if (info) {
          info.textContent = sorted.length
            ? "Showing " +
              (pageStart + 1) +
              "–" +
              Math.min(pageStart + allSharesStatsPageSize, sorted.length) +
              " of " +
              sorted.length +
              " links"
            : "Showing 0 links";
        }
        if (indicator) indicator.textContent = "Page " + allSharesStatsPage + " of " + totalPages;
        if (previous) previous.disabled = allSharesStatsPage <= 1;
        if (next) next.disabled = allSharesStatsPage >= totalPages;
        if (sizeButton) sizeButton.textContent = allSharesStatsPageSize + " per page";

        tbody.innerHTML = pageShares
          .map(function (s) {
            var shareUrl = window.location.origin + "/share/" + s.share_token;
            var labelTitle = s.title || s.original_name || (s.is_batch ? "Collection" : "File");
            var permLabel = s.access_type === "edit" ? "Edit" : "View/Download";
            var mobilePermLabel = s.access_type === "edit" ? "Edit" : "View";
            var permCls = s.access_type === "edit" ? "bg-warning" : "bg-secondary";
            var visCls = s.is_public ? "bg-info" : "badge-private";
            var expiryTxt = s.expires_at ? formatDate(s.expires_at) : "\u2014";
            var expiryStyle = s.expires_at ? "" : ' style="color:#aaa;"';
            return (
              '<tr class="share-stats-row" data-share-id="' +
              s.id +
              '">' +
              '<td class="share-stats-name" title="' +
              escapeHtml(labelTitle) +
              '"><a href="' +
              escapeHtml(shareUrl) +
              '" target="_blank" rel="noopener" class="share-stats-link font-monospace">' +
              escapeHtml(labelTitle) +
              "</a>" +
              bundleFilesDetails(s) +
              "</td>" +
              '<td style="white-space:nowrap;"><span class="badge ' +
              permCls +
              '" style="font-size:0.6rem;">' +
              '<span class="share-stats-desktop-label">' +
              permLabel +
              "</span>" +
              '<span class="share-stats-mobile-label">' +
              mobilePermLabel +
              "</span>" +
              "</span> " +
              '<span class="badge ' +
              visCls +
              ' border border-dark" style="font-size:0.6rem;">' +
              (s.is_public ? "Pub" : "Priv") +
              "</span>" +
              (s.is_batch
                ? ' <span class="badge bg-primary border border-dark" style="font-size:0.6rem;"><span class="share-stats-desktop-label">Bundle</span><span class="share-stats-mobile-label">Bund</span></span>'
                : "") +
              "</td>" +
              usageCell(s.views_count, s.max_views) +
              usageCell(s.downloads_count, s.max_downloads) +
              '<td class="text-center font-monospace fw-bold">' +
              (s.saves_count || 0) +
              "</td>" +
              "<td" +
              expiryStyle +
              ' style="font-size:0.72rem;white-space:nowrap;">' +
              escapeHtml(expiryTxt) +
              "</td>" +
              '<td style="white-space:nowrap;"><button class="btn btn-sm py-0 px-1 copy-stats-link-btn me-1" data-url="' +
              escapeHtml(shareUrl) +
              '" style="font-size:0.68rem;">Copy</button>' +
              '<button class="btn btn-sm py-0 px-1 revoke-stats-btn" data-id="' +
              s.id +
              '" style="font-size:0.68rem;">Revoke</button></td>' +
              "</tr>"
            );
          })
          .join("");

        tbody.querySelectorAll(".copy-stats-link-btn").forEach(function (b) {
          b.onclick = function () {
            navigator.clipboard.writeText(b.getAttribute("data-url")).then(function () {
              b.classList.add("copy-stats-flashed");
              setTimeout(function () {
                b.classList.remove("copy-stats-flashed");
              }, 1400);
            });
          };
        });
        tbody.querySelectorAll(".revoke-stats-btn").forEach(function (b) {
          b.onclick = function () {
            showConfirm(
              "Are you sure you want to revoke this share link? It will stop working immediately.",
              function () {
                api("/files/shares/" + b.getAttribute("data-id"), { method: "DELETE" })
                  .then(function (r) {
                    return r.json();
                  })
                  .then(function (res) {
                    if (res.error) {
                      showMsg(res.error, "error");
                    } else {
                      loadAllSharesStats();
                    }
                  })
                  .catch(function (err) {
                    console.error("Revoke error:", err);
                  });
              },
              { title: "Revoke Share Link", okLabel: "Revoke", danger: true }
            );
          };
        });
      }
      listEl.querySelectorAll("th[data-col]").forEach(function (th) {
        th.onclick = function () {
          var col = th.getAttribute("data-col");
          if (sortCol === col) {
            sortAsc = !sortAsc;
          } else {
            sortCol = col;
            sortAsc = false;
          }
          allSharesStatsPage = 1;
          renderSortedRows();
        };
      });

      var previousPageBtn = document.getElementById("all-shares-page-prev");
      var nextPageBtn = document.getElementById("all-shares-page-next");
      if (previousPageBtn)
        previousPageBtn.onclick = function () {
          if (allSharesStatsPage > 1) {
            allSharesStatsPage--;
            renderSortedRows();
          }
        };
      if (nextPageBtn)
        nextPageBtn.onclick = function () {
          allSharesStatsPage++;
          renderSortedRows();
        };
      document.querySelectorAll("[data-shares-page-size]").forEach(function (option) {
        option.onclick = function () {
          allSharesStatsPageSize = parseInt(option.getAttribute("data-shares-page-size"), 10) || 25;
          allSharesStatsPage = 1;
          localStorage.setItem("all_shares_stats_page_size", String(allSharesStatsPageSize));
          renderSortedRows();
        };
      });
      renderSortedRows();
    })
    .catch(function (err) {
      console.error("Failed to load share summary stats:", err);
      listEl.innerHTML =
        '<div class="text-danger small text-center py-4">Failed to load link statistics.</div>';
    });
}

function loadActiveShares(fileId) {
  var listEl = document.getElementById("active-shares-list");
  if (!listEl) return;
  listEl.innerHTML = '<div class="text-muted small text-center py-2">Loading shares...</div>';

  api("/files/" + fileId + "/shares")
    .then(function (r) {
      return r.json();
    })
    .then(function (shares) {
      if (!Array.isArray(shares) || shares.length === 0) {
        listEl.innerHTML =
          '<div class="text-muted small text-center py-2">No active share links for this file.</div>';
        return;
      }
      listEl.innerHTML = "";
      shares.forEach(function (s) {
        listEl.appendChild(
          renderShareCard(s, function () {
            loadActiveShares(fileId);
          })
        );
      });
    })
    .catch(function (err) {
      console.error("Failed to load shares:", err);
      listEl.innerHTML =
        '<div class="text-danger small text-center py-2">Failed to load active share links.</div>';
    });
}

(function () {
  var pillsContainer = document.getElementById("share-expiry-pills");
  var customWrap = document.getElementById("share-expiry-custom-wrap");
  if (!pillsContainer) return;

  var daysInput = document.getElementById("share-expiry-days");
  var hoursInput = document.getElementById("share-expiry-hours");
  var minsInput = document.getElementById("share-expiry-minutes");
  var preview = document.getElementById("share-expiry-preview");

  var MAX_MINS = 365 * 24 * 60;

  function totalMins() {
    var d = Math.max(0, parseInt(daysInput.value, 10) || 0);
    var h = Math.max(0, parseInt(hoursInput.value, 10) || 0);
    var m = Math.max(0, parseInt(minsInput.value, 10) || 0);
    return d * 1440 + h * 60 + m;
  }

  function minsToFields(total) {
    total = Math.min(MAX_MINS, Math.max(1, total));
    var d = Math.floor(total / 1440);
    var h = Math.floor((total % 1440) / 60);
    var m = total % 60;
    daysInput.value = d;
    hoursInput.value = h;
    minsInput.value = m;
  }

  function formatPreview(total) {
    if (total <= 0) return "No expiry set";
    var d = Math.floor(total / 1440);
    var h = Math.floor((total % 1440) / 60);
    var m = total % 60;
    var parts = [];
    if (d > 0) parts.push(d + (d === 1 ? " day" : " days"));
    if (h > 0) parts.push(h + (h === 1 ? " hr" : " hrs"));
    if (m > 0) parts.push(m + " min");
    return "Expires in " + (parts.join(" ") || "< 1 min");
  }

  function updatePreview() {
    var t = Math.min(MAX_MINS, totalMins());
    preview.textContent = formatPreview(t);

    if (t > MAX_MINS) {
      minsToFields(MAX_MINS);
    }
  }

  if (daysInput) daysInput.addEventListener("input", updatePreview);
  if (hoursInput) hoursInput.addEventListener("input", updatePreview);
  if (minsInput) minsInput.addEventListener("input", updatePreview);

  pillsContainer.addEventListener("click", function (e) {
    var pill = e.target.closest(".share-expiry-pill");
    if (!pill) return;
    pillsContainer.querySelectorAll(".share-expiry-pill").forEach(function (p) {
      p.classList.remove("active");
    });
    pill.classList.add("active");
    if (pill.getAttribute("data-minutes") === "custom") {
      customWrap.classList.remove("d-none");

      if (totalMins() <= 0) {
        minsToFields(1440);
        preview.textContent = formatPreview(1440);
      }
    } else {
      customWrap.classList.add("d-none");
    }
  });
})();

function getSelectedExpiryHours() {
  var activePill = document.querySelector(".share-expiry-pill.active");
  if (!activePill) return null;
  var minutes = activePill.getAttribute("data-minutes");
  if (minutes === "custom") {
    var d = Math.max(
      0,
      parseInt((document.getElementById("share-expiry-days") || {}).value, 10) || 0
    );
    var h = Math.max(
      0,
      parseInt((document.getElementById("share-expiry-hours") || {}).value, 10) || 0
    );
    var m = Math.max(
      0,
      parseInt((document.getElementById("share-expiry-minutes") || {}).value, 10) || 0
    );
    var total = d * 1440 + h * 60 + m;
    if (total <= 0) return null;
    return total / 60;
  }
  var mp = parseInt(minutes, 10);
  if (!mp || mp <= 0) return null;
  return mp / 60;
}

var createShareBtn = document.getElementById("create-share-link-btn");
if (createShareBtn) {
  createShareBtn.onclick = function () {
    if (!activeShareTarget) return;

    var editRadio = document.getElementById("sharePermEdit");
    var accessType = editRadio && editRadio.checked ? "edit" : "view";
    var limitAccessCheckbox = document.getElementById("share-limit-access");
    var limitAccess = !!(limitAccessCheckbox && limitAccessCheckbox.checked);
    var maxViewsInput = document.getElementById("share-max-views");
    var maxDownloadsInput = document.getElementById("share-max-downloads");
    if (limitAccess && (!maxViewsInput.checkValidity() || !maxDownloadsInput.checkValidity())) {
      if (!maxViewsInput.checkValidity()) maxViewsInput.reportValidity();
      else maxDownloadsInput.reportValidity();
      return;
    }
    var privateRadio = document.getElementById("shareVisPrivate");
    var isPublic = privateRadio ? !privateRadio.checked : true;
    var passwordEnabled = !!(passwordEnabledCheckbox && passwordEnabledCheckbox.checked);
    var passwordInput = document.getElementById("share-password");
    var sharePassword = passwordEnabled && passwordInput ? passwordInput.value : "";
    if (passwordEnabled && !sharePassword) {
      passwordInput.focus();
      showMsg("Enter a password.", "error");
      return;
    }
    var expiresInHours = getSelectedExpiryHours();

    createShareBtn.disabled = true;
    createShareBtn.innerHTML = "Creating...";

    var body = {
      isPublic: isPublic,
      accessType: accessType,
      maxViews: limitAccess && maxViewsInput ? Number(maxViewsInput.value) : 0,
      maxDownloads: limitAccess && maxDownloadsInput ? Number(maxDownloadsInput.value) : 0,
    };
    if (sharePassword) body.password = sharePassword;
    if (expiresInHours) body.expiresInHours = expiresInHours;

    var promise;
    if (activeShareTarget.type === "file") {
      promise = api("/files/" + activeShareTarget.file.id + "/share", {
        method: "POST",
        body: JSON.stringify(body),
      });
    } else if (activeShareTarget.type === "folder") {
      promise = api("/files/batch/share", {
        method: "POST",
        body: JSON.stringify(
          Object.assign(
            {
              folderIds: [activeShareTarget.folder.id],
              fileIds: [],
              title: activeShareTarget.folder.name,
            },
            body
          )
        ),
      });
    } else if (activeShareTarget.type === "batch") {
      promise = api("/files/batch/share", {
        method: "POST",
        body: JSON.stringify(
          Object.assign(
            {
              fileIds: activeShareTarget.fileIds,
              folderIds: activeShareTarget.folderIds,
              title: activeShareTarget.count + " Shared Items",
            },
            body
          )
        ),
      });
    }

    promise
      .then(function (r) {
        return r.json();
      })
      .then(function (res) {
        createShareBtn.disabled = false;
        createShareBtn.innerHTML =
          '<img src="/src/assets/icons/lib/SVG/regular/plus.svg" width="14" height="14" alt="" style="object-fit: contain;" /><span>Create Share Link</span>';
        if (res.error) {
          showMsg(res.error, "error");
          return;
        }
        var shareUrl = window.location.origin + "/share/" + res.share_token;
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(shareUrl).catch(function () {});
        }
        pushNotification("Share link created and copied to clipboard!", "success");
        var listEl = document.getElementById("active-shares-list");
        if (listEl) {
          if (activeShareTarget.type === "file") {
            loadActiveShares(activeShareTarget.file.id);
          } else {
            listEl.innerHTML = "";
            listEl.appendChild(renderShareCard(res, null));
          }
        }
      })
      .catch(function (err) {
        createShareBtn.disabled = false;
        createShareBtn.innerHTML =
          '<img src="/src/assets/icons/lib/SVG/regular/plus.svg" width="14" height="14" alt="" style="object-fit: contain;" /><span>Create Share Link</span>';
        console.error("Create share error:", err);
        showMsg("Failed to create share link", "error");
      });
  };
}

var menuShareStatsBtn = document.getElementById("menu-share-stats-btn");
if (menuShareStatsBtn) {
  menuShareStatsBtn.onclick = function () {
    var offcanvasEl = document.getElementById("settingsOffcanvas");
    if (offcanvasEl) {
      var bsOffcanvas = bootstrap.Offcanvas.getInstance(offcanvasEl);
      if (bsOffcanvas) bsOffcanvas.hide();
    }
    if (allSharesStatsModal) {
      allSharesStatsModal.show();
      loadAllSharesStats();
    }
  };
}

var reloadAllStatsBtn = document.getElementById("reload-all-stats-btn");
if (reloadAllStatsBtn) {
  reloadAllStatsBtn.onclick = function () {
    loadAllSharesStats();
  };
}

var revokeAllSharesBtn = document.getElementById("revoke-all-shares-btn");
if (revokeAllSharesBtn) {
  revokeAllSharesBtn.onclick = function () {
    showConfirm(
      "Are you sure you want to revoke all share links? Every shared link will stop working immediately.",
      function () {
        revokeAllSharesBtn.disabled = true;
        api("/files/shares", { method: "DELETE" })
          .then(function (response) {
            return response.json().then(function (data) {
              return { ok: response.ok, data: data };
            });
          })
          .then(function (result) {
            if (!result.ok)
              throw new Error(result.data.error || "Failed to revoke all share links");
            showMsg(result.data.message || "All share links revoked successfully", "success");
            loadAllSharesStats();
            if (activeShareTarget && activeShareTarget.type === "file") {
              loadActiveShares(activeShareTarget.file.id);
            }
          })
          .catch(function (err) {
            showMsg(err.message || "Failed to revoke all share links", "error");
          })
          .finally(function () {
            revokeAllSharesBtn.disabled = false;
          });
      },
      { title: "Revoke All Share Links", okLabel: "Revoke All", danger: true }
    );
  };
}

var refreshActiveSharesBtn = document.getElementById("refresh-active-shares-btn");
if (refreshActiveSharesBtn) {
  refreshActiveSharesBtn.onclick = function () {
    if (activeShareTarget && activeShareTarget.type === "file") {
      loadActiveShares(activeShareTarget.file.id);
    } else {
      loadAllSharesStats();
    }
  };
}
