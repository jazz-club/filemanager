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
        return { ok: r.ok, data: data };
      });
    })
    .then(function (res) {
      submitBtn.disabled = false;
      if (!res.ok) {
        showMsg(res.data.error || "auth failed", "error");
        return;
      }
      window.location.href = "/vault";
    })
    .catch(function (err) {
      submitBtn.disabled = false;
      showMsg("Error: " + err.message, "error");
    });
};
