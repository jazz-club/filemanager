var deleteUserModal = new bootstrap.Modal(document.getElementById("deleteUserModal"));
var pendingDeleteUserId = null;

var loginSection = document.getElementById("admin-login-section");
var dashboardSection = document.getElementById("admin-dashboard-section");
var logoutBtn = document.getElementById("admin-logout-btn");
var loginForm = document.getElementById("admin-login-form");
var userInput = document.getElementById("admin-user-input");
var passInput = document.getElementById("admin-pass-input");
var msgEl = document.getElementById("admin-msg");

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
        if (!r.ok) throw new Error(data.error || "Login failed");
        return data;
      });
    })
    .then(function () {
      showAdminMsg("", "");
      checkAdminAuth();
    })
    .catch(function (err) {
      showAdminMsg(err.message, "error");
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
}

function loadAdminStats() {
  api("/admin/stats")
    .then(function (r) {
      return r.json();
    })
    .then(function (stats) {
      document.getElementById("stat-users").textContent = stats.totalUsers || 0;
      document.getElementById("stat-files").textContent = stats.totalFiles || 0;
      document.getElementById("stat-storage").textContent = formatBytes(stats.totalBytes || 0);
      document.getElementById("stat-status").textContent = stats.status || "Healthy";
    })
    .catch(function (e) {
      console.error("Stats load err:", e);
    });
}

function loadAdminUsers() {
  var tbody = document.getElementById("admin-users-table-body");
  tbody.innerHTML =
    '<tr><td colspan="6" class="text-center text-muted py-3">Loading users...</td></tr>';

  api("/admin/users")
    .then(function (r) {
      return r.json();
    })
    .then(function (users) {
      tbody.innerHTML = "";
      if (!users || users.length === 0) {
        tbody.innerHTML =
          '<tr><td colspan="6" class="text-center text-muted py-3">No user accounts found</td></tr>';
        return;
      }

      users.forEach(function (u) {
        var tr = document.createElement("tr");

        var tdId = document.createElement("td");
        tdId.className = "fw-bold font-monospace";
        tdId.textContent = "#" + u.id;

        var tdPseudo = document.createElement("td");
        tdPseudo.className = "font-monospace small";
        tdPseudo.textContent = u.pseudonym;

        var tdDate = document.createElement("td");
        tdDate.className = "small text-muted";
        tdDate.textContent = formatDate(u.createdAt);

        var tdFiles = document.createElement("td");
        tdFiles.textContent = u.fileCount;

        var tdSize = document.createElement("td");
        tdSize.className = "fw-semibold";
        tdSize.textContent = formatBytes(u.totalBytes);

        var tdActions = document.createElement("td");
        tdActions.className = "text-end";

        var delBtn = document.createElement("button");
        delBtn.className = "btn btn-sm btn-outline-danger";
        delBtn.textContent = "Delete Account";
        delBtn.onclick = function () {
          pendingDeleteUserId = u.id;
          document.getElementById("delete-target-id").textContent = u.id;
          document.getElementById("delete-target-pseudonym").textContent = u.pseudonym;
          deleteUserModal.show();
        };

        tdActions.appendChild(delBtn);

        tr.appendChild(tdId);
        tr.appendChild(tdPseudo);
        tr.appendChild(tdDate);
        tr.appendChild(tdFiles);
        tr.appendChild(tdSize);
        tr.appendChild(tdActions);

        tbody.appendChild(tr);
      });
    })
    .catch(function (e) {
      tbody.innerHTML =
        '<tr><td colspan="6" class="text-center text-danger py-3">Failed to load users</td></tr>';
      console.error(e);
    });
}

document.getElementById("admin-refresh-users-btn").onclick = function () {
  loadAdminData();
};

document.getElementById("confirm-admin-delete-btn").onclick = function () {
  if (!pendingDeleteUserId) return;
  var targetId = pendingDeleteUserId;

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
