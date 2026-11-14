api("/auth/me").then(function (r) {
  if (r.ok) {
    window.location.href = "/vault";
  }
});

var mode = "login";
var allowRegistration = true;

api("/auth/registration-status")
  .then(function (r) {
    return r.json();
  })
  .then(function (d) {
    allowRegistration = !!d.allowRegistration;
    if (!allowRegistration && mode === "register") {
      setMode("register");
    }
  })
  .catch(function (e) {
    console.error("Failed to fetch status.", e);
  });

var btnLoginTab = document.getElementById("tab-login");
var btnRegisterTab = document.getElementById("tab-register");
var formTitle = document.getElementById("form-title");
var authForm = document.getElementById("auth-form");
var userInput = document.getElementById("user-input");
var passInput = document.getElementById("pass-input");
var submitBtn = document.getElementById("submit-btn");
var helpText = document.getElementById("help-text");

btnLoginTab.onclick = function () {
  setMode("login");
};
btnRegisterTab.onclick = function () {
  setMode("register");
};

function setMode(newMode) {
  mode = newMode;
  showMsg("");
  if (mode === "login") {
    btnLoginTab.className = "btn btn-primary active";
    btnRegisterTab.className = "btn btn-secondary";
    formTitle.textContent = "Log In";
    submitBtn.textContent = "Log In";
    submitBtn.disabled = false;
    userInput.disabled = false;
    passInput.disabled = false;
    passInput.removeAttribute("minlength");
    helpText.className = "form-text text-muted d-none";
  } else {
    btnRegisterTab.className = "btn btn-primary active";
    btnLoginTab.className = "btn btn-secondary";
    formTitle.textContent = "Create Account";

    if (!allowRegistration) {
      submitBtn.textContent = "Registration Disabled";
      submitBtn.disabled = true;
      userInput.disabled = true;
      passInput.disabled = true;
      helpText.className = "form-text text-muted d-none";
      showMsg("Account creation is currently disabled.", "error");
    } else {
      submitBtn.textContent = "Create Account";
      submitBtn.disabled = false;
      userInput.disabled = false;
      passInput.disabled = false;
      passInput.setAttribute("minlength", "8");
      helpText.className = "form-text text-muted";
    }
  }
}

var cooldownTimer = null;
function startCooldown(seconds) {
  if (cooldownTimer) clearInterval(cooldownTimer);
  var remaining = parseInt(seconds, 10) || 30;
  submitBtn.disabled = true;
  userInput.disabled = true;
  passInput.disabled = true;

  function update() {
    if (remaining <= 0) {
      clearInterval(cooldownTimer);
      cooldownTimer = null;
      submitBtn.disabled = false;
      userInput.disabled = false;
      passInput.disabled = false;
      submitBtn.textContent = mode === "login" ? "Log In" : "Create Account";
      showMsg("Ratelimit refreshed.", "success");
      return;
    }
    submitBtn.textContent = "Cooldown (" + remaining + "s)";
    showMsg("Too many attempts. Try again in: " + remaining + "s remaining.", "error");
    remaining--;
  }

  update();
  cooldownTimer = setInterval(update, 1000);
}

authForm.onsubmit = function (e) {
  e.preventDefault();
  if (mode === "register" && !allowRegistration) {
    showMsg("Account creation is currently disabled.", "error");
    return;
  }

  var endpoint = mode === "login" ? "/auth/login" : "/auth/register";
  var payload = {
    username: userInput.value.trim(),
    password: passInput.value,
  };

  submitBtn.disabled = true;
  api(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  })
    .then(function (r) {
      return r.json().then(function (data) {
        return { ok: r.ok, status: r.status, data: data };
      });
    })
    .then(function (res) {
      if (!res.ok) {
        if (res.status === 429 || (res.data && res.data.retryAfter)) {
          startCooldown(res.data.retryAfter || 30);
          return;
        }
        submitBtn.disabled = false;
        showMsg(res.data.error || "auth failed", "error");
        return;
      }
      submitBtn.disabled = false;
      window.location.href = "/vault";
    })
    .catch(function (err) {
      submitBtn.disabled = false;
      showMsg("Error: " + err.message, "error");
    });
};
