(function () {
  var escapeHtml =
    typeof window !== "undefined" && window.escapeHtml
      ? window.escapeHtml
      : function (str) {
          if (!str) return "";
          return String(str)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
        };

  var currentLogs = [];
  var currentTotal = 0;
  var currentOffset = 0;
  var searchTimeout = null;

  function getCategory() {
    return document.getElementById("audit-category-filter").value;
  }
  function getOutcome() {
    return document.getElementById("audit-outcome-filter").value;
  }
  function getSearch() {
    return document.getElementById("audit-search-input").value.trim();
  }
  function getLimit() {
    return parseInt(document.getElementById("audit-limit-select").value, 10) || 50;
  }

  function getEventIcon(event, itemType) {
    var ev = (event || "").toUpperCase();
    if (ev.indexOf("UPLOAD") !== -1) {
      return '<img src="/src/assets/icons/lib/SVG/regular/plus.svg" width="16" height="16" alt="Upload" style="object-fit: contain;" />';
    }
    if (ev.indexOf("DOWNLOAD") !== -1) {
      return '<img src="/src/assets/icons/lib/SVG/regular/download.svg" width="16" height="16" alt="Download" style="object-fit: contain;" />';
    }
    if (ev.indexOf("PREVIEW") !== -1 || ev.indexOf("VIEW") !== -1) {
      return '<img src="/src/assets/icons/lib/SVG/regular/eye.svg" width="16" height="16" alt="Preview" style="object-fit: contain;" />';
    }
    if (ev.indexOf("DELETE") !== -1) {
      return '<img src="/src/assets/icons/lib/SVG/regular/trash.svg" width="16" height="16" alt="Delete" style="object-fit: contain;" />';
    }
    if (ev.indexOf("SHARE") !== -1) {
      return '<img src="/src/assets/icons/lib/SVG/regular/globe.svg" width="16" height="16" alt="Share" style="object-fit: contain;" />';
    }
    if (ev.indexOf("FOLDER") !== -1 || itemType === "folder") {
      return '<img src="/src/assets/icons/file-folder.png" width="16" height="16" alt="Folder" style="object-fit: contain;" />';
    }
    if (ev.indexOf("AUTH") !== -1 || ev.indexOf("LOGIN") !== -1 || ev.indexOf("PASSWORD") !== -1) {
      return '<img src="/src/assets/icons/lib/SVG/regular/lock.svg" width="16" height="16" alt="Auth" style="object-fit: contain;" />';
    }
    return '<img src="/src/assets/icons/file-fallback.png" width="16" height="16" alt="" style="object-fit: contain;" />';
  }

  function getEventLabel(event) {
    var ev = String(event || "").toUpperCase();
    if (ev.indexOf("UPLOAD") !== -1) return "Upload";
    if (ev.indexOf("DOWNLOAD") !== -1) return "Download";
    if (ev.indexOf("PREVIEW") !== -1 || ev.indexOf("VIEW") !== -1) return "Preview";
    if (ev.indexOf("SHARE") !== -1) return "Share";
    if (ev.indexOf("DELETE") !== -1) return "Delete";
    if (ev.indexOf("FOLDER") !== -1) return "Folder";
    if (ev.indexOf("AUTH") !== -1 || ev.indexOf("LOGIN") !== -1 || ev.indexOf("PASSWORD") !== -1)
      return "Security";
    return "Activity";
  }

  function formatRelativeTime(isoStr) {
    if (!isoStr) return "";
    var date = new Date(isoStr);
    var now = new Date();
    var diffMs = now - date;
    var diffSec = Math.floor(diffMs / 1000);
    if (diffSec < 10) return "Just now";
    if (diffSec < 60) return diffSec + "s ago";
    var diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return diffMin + "m ago";
    var diffHr = Math.floor(diffMin / 60);
    if (diffHr < 24) return diffHr + "h ago";
    var diffDays = Math.floor(diffHr / 24);
    if (diffDays < 7) return diffDays + "d ago";
    return date.toLocaleDateString();
  }

  function formatDateTimeString(isoStr) {
    if (!isoStr) return "";
    var d = new Date(isoStr);
    return (
      d.getFullYear() +
      "-" +
      String(d.getMonth() + 1).padStart(2, "0") +
      "-" +
      String(d.getDate()).padStart(2, "0") +
      " " +
      String(d.getHours()).padStart(2, "0") +
      ":" +
      String(d.getMinutes()).padStart(2, "0") +
      ":" +
      String(d.getSeconds()).padStart(2, "0")
    );
  }

  function updateStats(stats) {
    if (!stats) return;
    document.getElementById("stat-total").textContent = stats.total || 0;
    document.getElementById("stat-uploads").textContent = stats.uploads || 0;
    document.getElementById("stat-downloads").textContent = stats.downloads || 0;
    document.getElementById("stat-shares").textContent = stats.shares || 0;
    document.getElementById("stat-deletes").textContent = stats.deletes || 0;
  }

  function loadAuditLogs() {
    var limit = getLimit();
    var category = getCategory();
    var outcome = getOutcome();
    var search = getSearch();

    var tbody = document.getElementById("audit-table-body");
    tbody.innerHTML =
      '<tr><td colspan="5" class="text-center py-5 text-muted"><div class="spinner-border spinner-border-sm me-2" role="status"></div>Loading audit logs...</td></tr>';

    var params = new URLSearchParams();
    params.set("limit", limit);
    params.set("offset", currentOffset);
    if (category !== "all") params.set("category", category);
    if (outcome !== "all") params.set("outcome", outcome);
    if (search) params.set("search", search);

    api("/audit-logs?" + params.toString())
      .then(function (r) {
        if (!r.ok) {
          if (r.status === 401) {
            window.location.href = "/login?redirect=/audit";
            return;
          }
          throw new Error("Failed to load audit logs");
        }
        return r.json();
      })
      .then(function (data) {
        currentLogs = data.logs || [];
        currentTotal = data.total || 0;
        updateStats(data.stats);
        renderAuditTable(currentLogs);
        updatePagination(currentTotal, limit, currentOffset);
      })
      .catch(function (err) {
        console.error("Load audit error:", err);
        tbody.innerHTML =
          '<tr><td colspan="5" class="text-center py-4 text-danger">Failed to load audit logs: ' +
          escapeHtml(err.message || err) +
          "</td></tr>";
      });
  }

  function renderAuditTable(logs) {
    var tbody = document.getElementById("audit-table-body");
    tbody.innerHTML = "";

    if (!logs || logs.length === 0) {
      tbody.innerHTML =
        '<tr><td colspan="5" class="text-center py-5 text-muted"><span class="d-block mb-1 font-monospace fw-bold fs-3 text-secondary">:3</span>No audit log entries matching criteria.</td></tr>';
      return;
    }

    logs.forEach(function (log) {
      var summaryRow = document.createElement("tr");
      summaryRow.className = "audit-summary-row";
      summaryRow.style.cursor = "pointer";

      var detailRow = document.createElement("tr");
      detailRow.className = "audit-detail-row d-none bg-light";

      var iconHtml = getEventIcon(log.event, log.itemType);
      var outcomeClass =
        log.outcome === "SUCCESS"
          ? "bg-success"
          : log.outcome === "BLOCKED"
            ? "bg-warning text-dark"
            : "bg-danger";

      var relativeTime = formatRelativeTime(log.createdAt);
      var fullTime = formatDateTimeString(log.createdAt);

      var itemIcon =
        log.itemType === "folder"
          ? '<img src="/src/assets/icons/file-folder.png" width="16" height="16" style="vertical-align: -2px; margin-right: 4px;" alt="" />'
          : log.itemType === "file" && log.itemName
            ? '<img src="' +
              getFileIconUrl("", log.itemName) +
              '" width="16" height="16" style="vertical-align: -2px; margin-right: 4px;" alt="" />'
            : "";

      var targetDisplay = log.itemName
        ? itemIcon + '<span class="fw-bold font-monospace">' + escapeHtml(log.itemName) + "</span>"
        : '<span class="text-muted">-</span>';

      summaryRow.innerHTML =
        '<td class="text-center">' +
        iconHtml +
        "</td>" +
        '<td class="small font-monospace" title="' +
        fullTime +
        '">' +
        fullTime +
        '<br><span class="text-muted" style="font-size: 0.72rem;">(' +
        relativeTime +
        ")</span></td>" +
        '<td><span class="badge bg-secondary font-monospace" style="font-size: 0.68rem;">' +
        escapeHtml(getEventLabel(log.event)) +
        "</span></td>" +
        '<td><div class="fw-bold text-truncate" style="max-width: 320px;">' +
        escapeHtml(log.action || log.event) +
        "</div>" +
        '<div class="small text-truncate text-muted">' +
        targetDisplay +
        "</div></td>" +
        '<td class="text-end pe-3"><button type="button" class="btn btn-sm btn-white border border-dark py-0 px-2 fw-bold audit-toggle-btn" aria-expanded="false" title="Expand audit entry">▾</button></td>';

      var detailsObj = log.details || {};
      if (typeof detailsObj === "string") {
        try {
          detailsObj = JSON.parse(detailsObj);
        } catch (e) {
          detailsObj = {};
        }
      }
      var sizeInfo = detailsObj.sizeBytes ? formatBytes(detailsObj.sizeBytes) : "";
      var mimeInfo = detailsObj.mimeType || "";
      var countInfo = detailsObj.fileCount || detailsObj.count || detailsObj.savedCount || 0;

      detailRow.innerHTML =
        '<td colspan="5" class="p-3">' +
        '<div class="audit-detail-box shadow-sm">' +
        '<div class="row g-3">' +
        '<div class="col-12 col-lg-7">' +
        '<div class="small fw-bold text-muted text-uppercase mb-1 d-flex align-items-center gap-1">' +
        '<img src="/src/assets/icons/lib/SVG/regular/bullet-list.svg" width="13" height="13" alt="" style="object-fit: contain;" />' +
        "<span>Details</span>" +
        "</div>" +
        '<div class="p-2 border rounded bg-white small">' +
        "<div><strong>Item:</strong> " +
        escapeHtml(log.itemName || log.itemType || "-") +
        "</div>" +
        (sizeInfo ? "<div><strong>Size:</strong> " + sizeInfo + "</div>" : "") +
        (mimeInfo ? "<div><strong>MIME:</strong> " + escapeHtml(mimeInfo) + "</div>" : "") +
        (countInfo ? "<div><strong>Items:</strong> " + escapeHtml(countInfo) + "</div>" : "") +
        "</div>" +
        "</div>" +
        '<div class="col-12 col-lg-5">' +
        '<div class="small fw-bold text-muted text-uppercase mb-1 d-flex align-items-center gap-1">' +
        '<img src="/src/assets/icons/lib/SVG/regular/check.svg" width="13" height="13" alt="" style="object-fit: contain;" />' +
        "<span>Result</span>" +
        "</div>" +
        '<div class="p-2 border rounded bg-white small">' +
        '<div><strong>Status Code:</strong> <span class="font-monospace">HTTP ' +
        (log.statusCode || 200) +
        "</span></div>" +
        '<div><strong>Outcome:</strong> <span class="badge ' +
        outcomeClass +
        '">' +
        escapeHtml(log.outcome || "SUCCESS") +
        "</span></div>" +
        "</div>" +
        "</div>" +
        "</div>" +
        "</div>" +
        "</td>";

      function toggleDetails() {
        var isHidden = detailRow.classList.contains("d-none");
        var btn = summaryRow.querySelector(".audit-toggle-btn");
        if (isHidden) {
          detailRow.classList.remove("d-none");
          summaryRow.classList.add("audit-row-expanded");
          if (btn) {
            btn.textContent = "▴";
            btn.setAttribute("aria-expanded", "true");
          }
        } else {
          detailRow.classList.add("d-none");
          summaryRow.classList.remove("audit-row-expanded");
          if (btn) {
            btn.textContent = "▾";
            btn.setAttribute("aria-expanded", "false");
          }
        }
      }

      summaryRow.onclick = function (e) {
        toggleDetails();
      };

      tbody.appendChild(summaryRow);
      tbody.appendChild(detailRow);
    });
  }

  function updatePagination(total, limit, offset) {
    var prevBtn = document.getElementById("audit-prev-btn");
    var nextBtn = document.getElementById("audit-next-btn");
    var info = document.getElementById("audit-pagination-info");
    var pageIndicator = document.getElementById("audit-page-indicator");

    var from = total === 0 ? 0 : offset + 1;
    var to = Math.min(offset + limit, total);
    var currentPage = Math.floor(offset / limit) + 1;
    var totalPages = Math.max(1, Math.ceil(total / limit));

    info.textContent = "Showing " + from + "-" + to + " of " + total + " entries";
    pageIndicator.textContent = "Page " + currentPage + " of " + totalPages;

    prevBtn.disabled = offset === 0;
    nextBtn.disabled = offset + limit >= total;

    prevBtn.onclick = function () {
      if (currentOffset >= limit) {
        currentOffset -= limit;
        loadAuditLogs();
      }
    };

    nextBtn.onclick = function () {
      if (currentOffset + limit < currentTotal) {
        currentOffset += limit;
        loadAuditLogs();
      }
    };
  }

  function curatedExportEntry(log) {
    var details = log.details || {};
    if (typeof details === "string") {
      try {
        details = JSON.parse(details);
      } catch (_) {
        details = {};
      }
    }
    var safeDetails = {};
    ["sizeBytes", "fileCount", "count", "savedCount", "mimeType"].forEach(function (key) {
      if (details[key] !== undefined && details[key] !== null) safeDetails[key] = details[key];
    });
    return {
      timestamp: log.createdAt,
      activity: getEventLabel(log.event),
      action: log.action || getEventLabel(log.event),
      itemType: log.itemType || null,
      item: log.itemName || null,
      outcome: log.outcome || "SUCCESS",
      statusCode: log.statusCode || 200,
      details: safeDetails,
    };
  }

  function exportAsJson() {
    if (currentLogs.length === 0) return alert("No logs to export");
    var entries = currentLogs.map(curatedExportEntry);
    var blob = new Blob([JSON.stringify(entries, null, 2)], {
      type: "application/json",
    });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = "pinkbox_audit_logs_" + new Date().toISOString().slice(0, 10) + ".json";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function exportAsCsv() {
    if (currentLogs.length === 0) return alert("No logs to export");
    var headers = [
      "Timestamp",
      "Activity",
      "Action",
      "Item Type",
      "Item",
      "Size Bytes",
      "Outcome",
      "Status Code",
    ];
    var csvRows = [headers.join(",")];

    currentLogs.forEach(function (log) {
      var entry = curatedExportEntry(log);
      var csvCell = function (value) {
        return '"' + String(value == null ? "" : value).replace(/"/g, '""') + '"';
      };
      var row = [
        entry.timestamp,
        entry.activity,
        entry.action,
        entry.itemType,
        entry.item,
        entry.details.sizeBytes || "",
        entry.outcome,
        entry.statusCode,
      ].map(csvCell);
      csvRows.push(row.join(","));
    });

    var blob = new Blob([csvRows.join("\n")], { type: "text/csv;charset=utf-8;" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = "pinkbox_audit_logs_" + new Date().toISOString().slice(0, 10) + ".csv";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  document.addEventListener("DOMContentLoaded", function () {
    api("/auth/me")
      .then(function (r) {
        if (!r.ok) {
          window.location.href = "/login?redirect=/audit";
          return null;
        }
        return r.json();
      })
      .then(function (user) {
        if (user && user.user) {
          var whoami = document.getElementById("audit-whoami");
          if (whoami) whoami.textContent = user.user;
        }
      })
      .catch(function () {});

    document.getElementById("audit-category-filter").onchange = function () {
      currentOffset = 0;
      loadAuditLogs();
    };

    document.getElementById("audit-outcome-filter").onchange = function () {
      currentOffset = 0;
      loadAuditLogs();
    };

    document.getElementById("audit-limit-select").onchange = function () {
      currentOffset = 0;
      loadAuditLogs();
    };

    document.querySelectorAll("[data-audit-select]").forEach(function (option) {
      option.addEventListener("click", function () {
        var select = document.getElementById(option.getAttribute("data-audit-select"));
        if (!select) return;
        select.value = option.getAttribute("data-value");
        var dropdown = option.closest(".audit-filter-dropdown");
        var button = dropdown && dropdown.querySelector(".dropdown-toggle");
        if (button) button.firstChild.textContent = option.textContent.trim() + " ";
        select.dispatchEvent(new Event("change", { bubbles: true }));
      });
    });

    document.getElementById("audit-search-input").oninput = function () {
      clearTimeout(searchTimeout);
      searchTimeout = setTimeout(function () {
        currentOffset = 0;
        loadAuditLogs();
      }, 300);
    };

    document.getElementById("audit-refresh-btn").onclick = function () {
      loadAuditLogs();
    };

    document.getElementById("audit-export-json-btn").onclick = exportAsJson;
    document.getElementById("audit-export-csv-btn").onclick = exportAsCsv;

    var auditClearModalEl = document.getElementById("audit-clear-confirm-modal");
    var auditClearModal = new bootstrap.Modal(auditClearModalEl);
    var auditClearConfirmBtn = document.getElementById("audit-clear-confirm-btn");

    document.getElementById("audit-clear-btn").onclick = function () {
      auditClearModal.show();
    };

    auditClearConfirmBtn.onclick = function () {
      auditClearModal.hide();
      auditClearConfirmBtn.disabled = true;
      api("/audit-logs/clear", { method: "POST" })
        .then(function (r) {
          return r.json();
        })
        .then(function () {
          currentOffset = 0;
          loadAuditLogs();
        })
        .catch(function (err) {
          alert("Failed to clear audit history: " + (err.message || err));
        })
        .finally(function () {
          auditClearConfirmBtn.disabled = false;
        });
    };

    loadAuditLogs();
  });
})();
