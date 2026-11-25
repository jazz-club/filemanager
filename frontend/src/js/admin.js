var deleteUserModal = new bootstrap.Modal(document.getElementById("deleteUserModal"));
var pendingDeleteAccountRef = null;

var loginSection = document.getElementById("admin-login-section");
var dashboardSection = document.getElementById("admin-dashboard-section");
var logoutBtn = document.getElementById("admin-logout-btn");
var loginForm = document.getElementById("admin-login-form");
var userInput = document.getElementById("admin-user-input");
var passInput = document.getElementById("admin-pass-input");
var msgEl = document.getElementById("admin-msg");
var adminAuditState = { limit: 25, offset: 0, category: "all", outcome: "all", search: "" };
var adminAccountState = { limit: 25, offset: 0, filter: "all", search: "" };
var adminAuditSearchTimer = null;
var adminAccountSearchTimer = null;

function showAdminMsg(text, type) {
  if (!text) {
    msgEl.className = "alert d-none";
    msgEl.textContent = "";
    return;
  }
  var alertClass = type === "error" ? "alert-danger" : "alert-success";
  msgEl.className = "alert " + alertClass;
  msgEl.textContent = text;
}

function checkAdminAuth() {
  api("/admin/me")
    .then(function (r) {
      if (r.ok) return r.json();
      throw new Error("Not logged in");
    })
    .then(function () {
      loginSection.classList.add("d-none");
      dashboardSection.classList.remove("d-none");
      logoutBtn.classList.remove("d-none");
      loadAdminData();
    })
    .catch(function () {
      loginSection.classList.remove("d-none");
      dashboardSection.classList.add("d-none");
      logoutBtn.classList.add("d-none");
    });
}

var adminCooldownTimer = null;
function startAdminCooldown(seconds) {
  if (adminCooldownTimer) clearInterval(adminCooldownTimer);
  var remaining = parseInt(seconds, 10) || 30;
  var adminSubmitBtn = loginForm.querySelector("button[type='submit']");
  if (adminSubmitBtn) adminSubmitBtn.disabled = true;
  userInput.disabled = true;
  passInput.disabled = true;

  function update() {
    if (remaining <= 0) {
      clearInterval(adminCooldownTimer);
      adminCooldownTimer = null;
      if (adminSubmitBtn) {
        adminSubmitBtn.disabled = false;
        adminSubmitBtn.textContent = "Log In as Admin";
      }
      userInput.disabled = false;
      passInput.disabled = false;
      showAdminMsg("Ratelimit reset.", "success");
      return;
    }
    if (adminSubmitBtn) {
      adminSubmitBtn.textContent = "Cooldown (" + remaining + "s)";
    }
    showAdminMsg("Too many failed attempts. Try again in: " + remaining + "s", "error");
    remaining--;
  }

  update();
  adminCooldownTimer = setInterval(update, 1000);
}

loginForm.onsubmit = function (e) {
  e.preventDefault();
  var u = userInput.value.trim();
  var p = passInput.value;
  if (!u || !p) return;

  api("/admin/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: u, password: p }),
  })
    .then(function (r) {
      return r.json().then(function (data) {
        if (!r.ok) {
          var err = new Error(data.error || "Login failed");
          err.retryAfter = data.retryAfter;
          err.status = r.status;
          throw err;
        }
        return data;
      });
    })
    .then(function () {
      showAdminMsg("", "");
      checkAdminAuth();
    })
    .catch(function (err) {
      if (err.status === 429 || err.retryAfter) {
        startAdminCooldown(err.retryAfter || 30);
      } else {
        showAdminMsg(err.message, "error");
      }
    });
};

logoutBtn.onclick = function () {
  api("/admin/logout", { method: "POST" }).then(function () {
    window.location.reload();
  });
};

var currentAllowRegistration = true;
var regStatusBadge = document.getElementById("reg-status-badge");
var regToggleBtn = document.getElementById("admin-toggle-reg-btn");

function updateRegistrationUI(allowed) {
  currentAllowRegistration = allowed;
  if (!regStatusBadge || !regToggleBtn) return;
  if (allowed) {
    regStatusBadge.className = "badge bg-success";
    regStatusBadge.textContent = "Active";
    regToggleBtn.className = "btn btn-sm btn-outline-danger";
    regToggleBtn.textContent = "Disable Registrations";
  } else {
    regStatusBadge.className = "badge bg-danger";
    regStatusBadge.textContent = "Inactive";
    regToggleBtn.className = "btn btn-sm btn-outline-success";
    regToggleBtn.textContent = "Enable Registrations";
  }
}

if (regToggleBtn) {
  regToggleBtn.onclick = function () {
    var nextState = !currentAllowRegistration;
    regToggleBtn.disabled = true;
    api("/admin/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ allowRegistration: nextState }),
    })
      .then(function (r) {
        return r.json().then(function (d) {
          if (!r.ok) throw new Error(d.error || "Failed to update settings");
          return d;
        });
      })
      .then(function (res) {
        regToggleBtn.disabled = false;
        updateRegistrationUI(res.allowRegistration);
        showAdminMsg(res.message, "success");
      })
      .catch(function (err) {
        regToggleBtn.disabled = false;
        showAdminMsg("Error: " + err.message, "error");
      });
  };
}

function loadAdminSettings() {
  api("/admin/settings")
    .then(function (r) {
      return r.json();
    })
    .then(function (s) {
      updateRegistrationUI(!!s.allowRegistration);
    })
    .catch(function (e) {
      console.error("Settings load err:", e);
    });
}

function loadAdminData() {
  loadAdminStats();
  loadAdminSettings();
  loadAdminUsers();
  loadAdminAudit();
}

function loadAdminAudit() {
  var tbody = document.getElementById("admin-audit-table-body");
  if (!tbody) return;
  var params = new URLSearchParams({
    limit: adminAuditState.limit,
    offset: adminAuditState.offset,
    category: adminAuditState.category,
    outcome: adminAuditState.outcome,
    search: adminAuditState.search,
  });
  tbody.innerHTML =
    '<tr><td colspan="5" class="text-muted text-center py-3">Loading activity...</td></tr>';
  api("/admin/audit-logs?" + params.toString())
    .then(function (r) {
      if (!r.ok) throw new Error("Failed to load global audit log");
      return r.json();
    })
    .then(function (data) {
      adminAuditState.offset = data.offset || 0;
      tbody.innerHTML = "";
      (data.logs || []).forEach(function (log) {
        var tr = document.createElement("tr");
        [
          ["Time", new Date(log.createdAt).toLocaleString()],
          ["Activity", adminEventLabel(log.event)],
          ["Account Ref", log.actorRef || log.targetRef || "-"],
          ["Severity", log.level],
          ["Outcome", log.outcome],
        ].forEach(function (field) {
          var td = document.createElement("td");
          td.setAttribute("data-label", field[0]);
          td.textContent = field[1] || "-";
          tr.appendChild(td);
        });
        tbody.appendChild(tr);
      });
      if (!tbody.children.length)
        tbody.innerHTML =
          '<tr><td colspan="5" class="text-muted text-center py-3">No audit entries</td></tr>';
      updateAdminPager(
        "admin-audit",
        data.total || 0,
        data.limit || adminAuditState.limit,
        adminAuditState.offset
      );
    })
    .catch(function (err) {
      tbody.innerHTML =
        '<tr><td colspan="5" class="text-danger text-center py-3">' + err.message + "</td></tr>";
    });
}

function updateAdminPager(prefix, total, limit, offset) {
  var info = document.getElementById(prefix + "-pagination-info");
  var indicator = document.getElementById(prefix + "-page-indicator");
  var previous = document.getElementById(prefix + "-prev");
  var next = document.getElementById(prefix + "-next");
  var totalPages = Math.max(1, Math.ceil(total / limit));
  var page = Math.floor(offset / limit) + 1;
  var end = Math.min(offset + limit, total);
  if (info)
    info.textContent = total
      ? "Showing " +
        (offset + 1) +
        "–" +
        end +
        (prefix === "admin-audit" ? " entries" : " accounts")
      : prefix === "admin-audit"
        ? "Showing 0 entries"
        : "Showing 0 accounts";
  if (indicator) indicator.textContent = "Page " + page + " of " + totalPages;
  if (previous) previous.disabled = offset <= 0;
  if (next) next.disabled = offset + limit >= total;
}

function adminEventLabel(event) {
  var labels = {
    ADMIN_ACCOUNT_DELETED: "Pseudonymous account deleted",
    ADMIN_REGISTRATION_SETTING_CHANGED: "Registration setting changed",
    ADMIN_LOGIN_SUCCESS: "Admin sign-in succeeded",
    ADMIN_LOGIN_FAILURE: "Admin sign-in failed",
    ADMIN_LOCKOUT: "Admin sign-in locked out",
    AUTH_LOGIN_SUCCESS: "User sign-in succeeded",
    AUTH_LOGIN_FAILURE: "User sign-in failed",
    AUTH_LOCKOUT: "User sign-in locked out",
    FILE_UPLOAD_SUCCESS: "File uploaded",
    FILE_DOWNLOAD: "File downloaded",
    FILE_DELETE_SUCCESS: "File deleted",
    FILE_SHARE_CREATED: "Share link created",
    FILE_SHARE_REVOKED: "Share link revoked",
    FILE_BATCH_SHARE_CREATED: "Collection link created",
    AUTH_REGISTER_SUCCESS: "Account registered",
    AUTH_PASSWORD_CHANGE_SUCCESS: "Password changed",
  };
  if (labels[event]) return labels[event];
  return String(event || "System event")
    .replace(/_/g, " ")
    .toLowerCase()
    .replace(/\b\w/g, function (letter) {
      return letter.toUpperCase();
    });
}

function loadAdminStats() {
  api("/admin/stats")
    .then(function (r) {
      return r.json();
    })
    .then(function (stats) {
      document.getElementById("stat-storage").textContent = formatBytes(stats.totalBytes || 0);
      var status = document.getElementById("stat-status");
      status.textContent = stats.status || "Unknown";
      status.className =
        "fw-bold mb-0 mt-1 " + (stats.status === "Healthy" ? "text-success" : "text-warning");
      document.getElementById("stat-accounts").textContent = stats.accounts || 0;
      document.getElementById("stat-active-shares").textContent = stats.activeShares || 0;
      document.getElementById("stat-failed-signins").textContent = stats.failedSignIns24h || 0;
      document.getElementById("stat-lockouts").textContent = stats.lockouts24h || 0;
    })
    .catch(function (e) {
      console.error("Stats load err:", e);
    });
}

function loadAdminUsers() {
  var tbody = document.getElementById("admin-users-table-body");
  tbody.innerHTML =
    '<tr><td colspan="3" class="text-center text-muted py-3">Loading accounts...</td></tr>';
  var params = new URLSearchParams({
    limit: adminAccountState.limit,
    offset: adminAccountState.offset,
    filter: adminAccountState.filter,
    search: adminAccountState.search,
  });

  api("/admin/users?" + params.toString())
    .then(function (r) {
      if (!r.ok) throw new Error("Failed to load accounts");
      return r.json();
    })
    .then(function (data) {
      adminAccountState.offset = data.offset || 0;
      tbody.innerHTML = "";
      var users = data.users || [];
      if (!users || users.length === 0) {
        tbody.innerHTML =
          '<tr><td colspan="3" class="text-center text-muted py-3">No accounts found</td></tr>';
        updateAdminPager(
          "admin-account",
          data.total || 0,
          data.limit || adminAccountState.limit,
          adminAccountState.offset
        );
        return;
      }

      users.forEach(function (u) {
        var tr = document.createElement("tr");

        var tdRef = document.createElement("td");
        tdRef.className = "font-monospace small";
        tdRef.setAttribute("data-label", "Account Reference");
        tdRef.textContent = "acct_" + String(u.accountRef || "").slice(0, 10);
        tdRef.title = "Stable pseudonymous account reference";

        var tdSize = document.createElement("td");
        tdSize.className = "fw-semibold";
        tdSize.setAttribute("data-label", "Storage Used");
        tdSize.textContent = formatBytes(u.totalBytes);

        var tdActions = document.createElement("td");
        tdActions.className = "text-end";
        tdActions.setAttribute("data-label", "Actions");

        var delBtn = document.createElement("button");
        delBtn.className = "btn btn-sm btn-outline-danger";
        delBtn.textContent = "Delete Account";
        delBtn.title = "Delete " + tdRef.textContent;
        delBtn.onclick = function () {
          pendingDeleteAccountRef = u.accountRef;
          deleteUserModal.show();
        };

        tdActions.appendChild(delBtn);

        tr.appendChild(tdRef);
        tr.appendChild(tdSize);
        tr.appendChild(tdActions);

        tbody.appendChild(tr);
      });
      updateAdminPager(
        "admin-account",
        data.total || 0,
        data.limit || adminAccountState.limit,
        adminAccountState.offset
      );
    })
    .catch(function (e) {
      tbody.innerHTML =
        '<tr><td colspan="3" class="text-center text-danger py-3">Failed to load accounts</td></tr>';
      console.error(e);
    });
}

document.getElementById("admin-refresh-users-btn").onclick = function () {
  loadAdminUsers();
};
var adminAuditRefresh = document.getElementById("admin-refresh-audit-btn");
if (adminAuditRefresh) adminAuditRefresh.onclick = loadAdminAudit;

var adminAuditPrev = document.getElementById("admin-audit-prev");
var adminAuditNext = document.getElementById("admin-audit-next");
if (adminAuditPrev)
  adminAuditPrev.onclick = function () {
    adminAuditState.offset = Math.max(0, adminAuditState.offset - adminAuditState.limit);
    loadAdminAudit();
  };
if (adminAuditNext)
  adminAuditNext.onclick = function () {
    adminAuditState.offset += adminAuditState.limit;
    loadAdminAudit();
  };
document.querySelectorAll("[data-admin-audit-category]").forEach(function (button) {
  button.onclick = function () {
    adminAuditState.category = button.getAttribute("data-admin-audit-category");
    adminAuditState.offset = 0;
    document.getElementById("admin-audit-category-btn").textContent = button.textContent.trim();
    loadAdminAudit();
  };
});
document.querySelectorAll("[data-admin-audit-outcome]").forEach(function (button) {
  button.onclick = function () {
    adminAuditState.outcome = button.getAttribute("data-admin-audit-outcome");
    adminAuditState.offset = 0;
    document.getElementById("admin-audit-outcome-btn").textContent = button.textContent.trim();
    loadAdminAudit();
  };
});
document.querySelectorAll("[data-admin-audit-limit]").forEach(function (button) {
  button.onclick = function () {
    adminAuditState.limit = parseInt(button.getAttribute("data-admin-audit-limit"), 10) || 25;
    adminAuditState.offset = 0;
    document.getElementById("admin-audit-limit-btn").textContent =
      adminAuditState.limit + " per page";
    loadAdminAudit();
  };
});
var adminAuditSearch = document.getElementById("admin-audit-search");
if (adminAuditSearch)
  adminAuditSearch.oninput = function () {
    clearTimeout(adminAuditSearchTimer);
    adminAuditSearchTimer = setTimeout(function () {
      adminAuditState.search = adminAuditSearch.value.trim();
      adminAuditState.offset = 0;
      loadAdminAudit();
    }, 180);
  };

var adminAccountPrev = document.getElementById("admin-account-prev");
var adminAccountNext = document.getElementById("admin-account-next");
if (adminAccountPrev)
  adminAccountPrev.onclick = function () {
    adminAccountState.offset = Math.max(0, adminAccountState.offset - adminAccountState.limit);
    loadAdminUsers();
  };
if (adminAccountNext)
  adminAccountNext.onclick = function () {
    adminAccountState.offset += adminAccountState.limit;
    loadAdminUsers();
  };
document.querySelectorAll("[data-admin-account-filter]").forEach(function (button) {
  button.onclick = function () {
    adminAccountState.filter = button.getAttribute("data-admin-account-filter");
    adminAccountState.offset = 0;
    document.getElementById("admin-account-filter-btn").textContent = button.textContent.trim();
    loadAdminUsers();
  };
});
document.querySelectorAll("[data-admin-account-limit]").forEach(function (button) {
  button.onclick = function () {
    adminAccountState.limit = parseInt(button.getAttribute("data-admin-account-limit"), 10) || 25;
    adminAccountState.offset = 0;
    document.getElementById("admin-account-limit-btn").textContent =
      adminAccountState.limit + " per page";
    loadAdminUsers();
  };
});
var adminAccountSearch = document.getElementById("admin-account-search");
if (adminAccountSearch)
  adminAccountSearch.oninput = function () {
    clearTimeout(adminAccountSearchTimer);
    adminAccountSearchTimer = setTimeout(function () {
      adminAccountState.search = adminAccountSearch.value.trim();
      adminAccountState.offset = 0;
      loadAdminUsers();
    }, 180);
  };

document.getElementById("confirm-admin-delete-btn").onclick = function () {
  if (!pendingDeleteAccountRef) return;
  var targetId = pendingDeleteAccountRef;

  api("/admin/users/" + targetId, { method: "DELETE" })
    .then(function (r) {
      return r.json().then(function (d) {
        if (!r.ok) throw new Error(d.error || "Delete failed");
        return d;
      });
    })
    .then(function (res) {
      deleteUserModal.hide();
      showAdminMsg(res.message || "User exiled successfully.", "success");
      loadAdminData();
    })
    .catch(function (err) {
      deleteUserModal.hide();
      showAdminMsg("Error: " + err.message, "error");
    });
};

checkAdminAuth();
