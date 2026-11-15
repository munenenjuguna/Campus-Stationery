// ==========================================
// CAMPUS STATIONERY - PASSWORDS AND ACCOUNT
// Used by forgot-password.html, reset-password.html and account.html
// ==========================================


// 1. HELPERS

function showMessage(element, message, type) {
    element.textContent = message;
    element.className = `auth-message ${type}`;
}

function strongPassword(value) {
    return value.length >= 8 && /[A-Za-z]/.test(value) && /\d/.test(value);
}

// Checks the "new password" and "confirm" boxes and shows the problem under each one
function checkNewPassword() {
    const password = document.getElementById("newPassword");
    const confirm = document.getElementById("confirmNewPassword");
    const passwordError = document.getElementById("newPasswordError");
    const confirmError = document.getElementById("confirmNewPasswordError");
    let ok = true;

    passwordError.textContent = "";
    confirmError.textContent = "";
    password.classList.remove("is-invalid");
    confirm.classList.remove("is-invalid");

    if (!strongPassword(password.value)) {
        passwordError.textContent = "Use at least 8 characters, with letters and numbers.";
        password.classList.add("is-invalid");
        ok = false;
    }
    if (!confirm.value || confirm.value !== password.value) {
        confirmError.textContent = "The two passwords do not match.";
        confirm.classList.add("is-invalid");
        ok = false;
    }
    return ok;
}

// Show or hide password buttons
document.querySelectorAll(".password-toggle").forEach(button => {
    button.addEventListener("click", function () {
        const input = document.getElementById(this.dataset.target);
        const icon = this.querySelector("i");
        const show = input.type === "password";
        input.type = show ? "text" : "password";
        icon.classList.toggle("bi-eye", !show);
        icon.classList.toggle("bi-eye-slash", show);
        this.setAttribute("aria-label", show ? "Hide password" : "Show password");
    });
});

// Disables a button while a request runs, so it cannot be sent twice
async function withButton(form, action) {
    const button = form.querySelector('button[type="submit"]');
    button.disabled = true;
    try {
        await action();
    } finally {
        button.disabled = false;
    }
}


// 2. FORGOT PASSWORD

const forgotForm = document.getElementById("forgotForm");

if (forgotForm) {
    forgotForm.addEventListener("submit", event => {
        event.preventDefault();
        const email = document.getElementById("forgotEmail");
        const message = document.getElementById("forgotMessage");

        email.classList.toggle("is-invalid", !email.validity.valid || !email.value.trim());
        if (!email.validity.valid || !email.value.trim()) return;

        withButton(forgotForm, async () => {
            try {
                const result = await CS.request("/api/users/forgot-password", {
                    method: "POST",
                    body: { email: email.value.trim() }
                });
                showMessage(message, result.message, "success");
                forgotForm.reset();
            } catch (error) {
                showMessage(message, error.message, "error");
            }
        });
    });
}


// 3. RESET PASSWORD (from the emailed link)

const resetForm = document.getElementById("resetForm");

if (resetForm) {
    const token = new URLSearchParams(location.search).get("token") || "";
    const message = document.getElementById("resetMessage");

    if (!/^[a-f0-9]{64}$/.test(token)) {
        showMessage(message, "This reset link is not complete. Please open the link from your email again, or request a new one.", "error");
    }

    resetForm.addEventListener("submit", event => {
        event.preventDefault();
        if (!checkNewPassword()) return;

        withButton(resetForm, async () => {
            try {
                const result = await CS.request("/api/users/reset-password", {
                    method: "POST",
                    body: { token, password: document.getElementById("newPassword").value }
                });
                showMessage(message, result.message + " Taking you to the login page...", "success");
                resetForm.reset();
                setTimeout(() => { location.href = "login.html"; }, 2000);
            } catch (error) {
                showMessage(message, error.message, "error");
            }
        });
    });
}


// 4. MY ACCOUNT

const profileForm = document.getElementById("profileForm");

if (profileForm && CS.requireLogin()) {

    const nameInput = document.getElementById("profileName");
    const phoneInput = document.getElementById("profilePhone");
    const profileMessage = document.getElementById("profileMessage");

    // Load the latest details from the server
    CS.request("/api/users/me")
        .then(result => {
            nameInput.value = result.user.full_name;
            document.getElementById("profileEmail").value = result.user.email;
            phoneInput.value = CS.displayPhone(result.user.phone);
            showTwoStep(result.user.twofa_enabled);
        })
        .catch(error => showMessage(profileMessage, error.message, "error"));

    profileForm.addEventListener("submit", event => {
        event.preventDefault();
        profileForm.classList.add("was-validated");
        if (!profileForm.checkValidity()) return;

        withButton(profileForm, async () => {
            try {
                const result = await CS.request("/api/users/me", {
                    method: "PUT",
                    body: { full_name: nameInput.value.trim(), phone: phoneInput.value.trim() }
                });
                CS.saveSession(CS.getToken(), result.user);
                showMessage(profileMessage, result.message, "success");
            } catch (error) {
                showMessage(profileMessage, error.message, "error");
            }
        });
    });

    // Two step verification switch
    const twofaForm = document.getElementById("twofaForm");
    const twofaSwitch = document.getElementById("twofaSwitch");
    const twofaMessage = document.getElementById("twofaMessage");

    function showTwoStep(enabled) {
        twofaSwitch.checked = !!enabled;
        document.getElementById("twofaLabel").textContent = enabled ? "On: a code is needed at every login" : "Off";
    }
    twofaSwitch.addEventListener("change", () => {
        document.getElementById("twofaLabel").textContent = twofaSwitch.checked ? "On (click Save to confirm)" : "Off (click Save to confirm)";
    });

    twofaForm.addEventListener("submit", event => {
        event.preventDefault();
        const password = document.getElementById("twofaPassword");
        if (!password.value) {
            showMessage(twofaMessage, "Please enter your password to confirm this change.", "error");
            password.focus();
            return;
        }
        withButton(twofaForm, async () => {
            try {
                const result = await CS.request("/api/users/me/2fa", {
                    method: "PUT",
                    body: { enabled: twofaSwitch.checked, password: password.value }
                });
                CS.saveSession(CS.getToken(), result.user);
                showTwoStep(result.user.twofa_enabled);
                showMessage(twofaMessage, result.message, "success");
                password.value = "";
            } catch (error) {
                showMessage(twofaMessage, error.message, "error");
            }
        });
    });

    const passwordForm = document.getElementById("passwordForm");
    const passwordMessage = document.getElementById("passwordMessage");

    passwordForm.addEventListener("submit", event => {
        event.preventDefault();
        const current = document.getElementById("currentPassword");
        const currentError = document.getElementById("currentPasswordError");
        currentError.textContent = current.value ? "" : "Please enter your current password.";
        current.classList.toggle("is-invalid", !current.value);
        const newOk = checkNewPassword();
        if (!current.value || !newOk) return;

        withButton(passwordForm, async () => {
            try {
                const result = await CS.request("/api/users/change-password", {
                    method: "POST",
                    body: { current_password: current.value, new_password: document.getElementById("newPassword").value }
                });
                showMessage(passwordMessage, result.message, "success");
                passwordForm.reset();
            } catch (error) {
                showMessage(passwordMessage, error.message, "error");
            }
        });
    });
}
