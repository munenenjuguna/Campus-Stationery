// ==========================================
// CAMPUS STATIONERY - AUTHENTICATION
// ==========================================


// 1. SHOW OR HIDE PASSWORD

document.querySelectorAll(".password-toggle").forEach(button => {

    button.addEventListener("click", function() {

        const inputId = this.dataset.target;

        const passwordInput = document.getElementById(inputId);

        const icon = this.querySelector("i");

        if (passwordInput.type === "password") {

            passwordInput.type = "text";

            icon.classList.remove("bi-eye");

            icon.classList.add("bi-eye-slash");

            this.setAttribute("aria-label", "Hide password");

        } else {

            passwordInput.type = "password";

            icon.classList.remove("bi-eye-slash");

            icon.classList.add("bi-eye");

            this.setAttribute("aria-label", "Show password");

        }

    });

});


// Where to go after logging in (for example back to checkout)
function nextPage() {
    const next = new URLSearchParams(location.search).get("next");
    // Only allow pages inside this site
    return next && /^[a-z0-9-]+\.html(\?[^\s]*)?$/i.test(next) ? next : "products.html";
}

// Already logged in? Skip the login and register pages
if (CS.isLoggedIn() && (document.getElementById("loginForm") || document.getElementById("registerForm"))) {
    location.replace(nextPage());
}


// 2. DISPLAY MESSAGES

function showMessage(element, message, type) {

    element.textContent = message;

    element.className = `auth-message ${type}`;

}


// 3. LOGIN FORM

const loginForm = document.getElementById("loginForm");

if (loginForm) {

    loginForm.addEventListener("submit", function(event) {

        event.preventDefault();

        const email = document.getElementById("loginEmail");

        const password = document.getElementById("loginPassword");

        const message = document.getElementById("loginMessage");


        // Check email

        email.classList.toggle("is-invalid", !email.validity.valid);

        // Check password

        password.classList.toggle("is-invalid", !password.value.trim());


        if (!email.validity.valid || !password.value.trim()) {

            showMessage(
                message,
                "Please enter a valid email address and password.",
                "error"
            );

            return;

        }


        // Check the account against the database through the backend API
        const submitButton = loginForm.querySelector('button[type="submit"]');

        if (submitButton) submitButton.disabled = true;

        showMessage(message, "Signing you in...", "success");

        CS.request("/api/users/login", {
            method: "POST",
            body: { email: email.value.trim(), password: password.value }
        })
            .then(result => {
                // Two step verification is on for this account: ask for the code first
                if (result.twoFactor) {
                    message.textContent = "";
                    message.className = "auth-message";
                    startCodeStep(result);
                    return;
                }
                finishLogin(result, message);
            })
            .catch(error => {
                showMessage(message, error.message, "error");
                password.value = "";
                password.focus();
            })
            .finally(() => {
                if (submitButton) submitButton.disabled = false;
            });

    });

}


// Saves the login and moves on to the page the customer wanted
function finishLogin(result, message) {
    // Remember who is logged in for the rest of the site
    CS.saveSession(result.token, result.user);

    showMessage(message, `Welcome back, ${result.user.full_name}! Taking you on...`, "success");

    setTimeout(() => {
        window.location.href = nextPage();
    }, 900);
}


// 3B. TWO STEP VERIFICATION (second step of the login)

const codeForm = document.getElementById("codeForm");
let loginChallenge = null;

function startCodeStep(result) {
    loginChallenge = result.challenge;
    document.getElementById("codeHint").textContent = result.message;
    loginForm.classList.add("d-none");
    codeForm.classList.remove("d-none");
    const box = document.getElementById("loginCode");
    box.value = "";
    box.focus();
}

function backToLogin(text) {
    loginChallenge = null;
    codeForm.classList.add("d-none");
    loginForm.classList.remove("d-none");
    const password = document.getElementById("loginPassword");
    password.value = "";
    password.focus();
    if (text) showMessage(document.getElementById("loginMessage"), text, "error");
}

if (codeForm) {

    const codeBox = document.getElementById("loginCode");
    const codeMessage = document.getElementById("codeMessage");

    // Key trapping: digits only, and a complete code is sent straight away
    CS.digitsOnly(codeBox, { max: 6 });
    codeBox.addEventListener("input", () => {
        if (codeBox.value.length === 6) codeForm.requestSubmit();
    });

    codeForm.addEventListener("submit", event => {
        event.preventDefault();
        if (!/^\d{6}$/.test(codeBox.value)) {
            showMessage(codeMessage, "Please enter all 6 digits of the code.", "error");
            return;
        }
        const button = codeForm.querySelector('button[type="submit"]');
        button.disabled = true;
        showMessage(codeMessage, "Checking your code...", "success");

        CS.request("/api/users/login/verify", { method: "POST", body: { challenge: loginChallenge, code: codeBox.value } })
            .then(result => finishLogin(result, codeMessage))
            .catch(error => {
                if (error.data && error.data.restart) return backToLogin(error.message);
                showMessage(codeMessage, error.message, "error");
                codeBox.select();
            })
            .finally(() => { button.disabled = false; });
    });

    document.getElementById("codeResend").addEventListener("click", event => {
        event.preventDefault();
        CS.request("/api/users/login/resend", { method: "POST", body: { challenge: loginChallenge } })
            .then(result => {
                document.getElementById("codeHint").textContent = result.message;
                showMessage(codeMessage, "A new code is on its way.", "success");
            })
            .catch(error => {
                if (error.data && error.data.restart) return backToLogin(error.message);
                showMessage(codeMessage, error.message, "error");
            });
    });

    document.getElementById("codeBack").addEventListener("click", event => {
        event.preventDefault();
        backToLogin();
    });
}


// 4. REGISTRATION FORM

const registerForm = document.getElementById("registerForm");

if (registerForm) {

    registerForm.addEventListener("submit", function(event) {

        event.preventDefault();


        const fullName = document.getElementById("fullName");

        const email = document.getElementById("registerEmail");

        const phone = document.getElementById("phone");

        const password = document.getElementById("registerPassword");

        const confirmPassword = document.getElementById("confirmPassword");

        const agreeTerms = document.getElementById("agreeTerms");

        const message = document.getElementById("registerMessage");


        // Reset previous validation styles

        const fields = [
            fullName,
            email,
            phone,
            password,
            confirmPassword,
            agreeTerms
        ];

        fields.forEach(field => {

            field.classList.remove("is-invalid");

        });


        let isValid = true;


        // Validate full name

        if (fullName.value.trim().length < 3) {

            fullName.classList.add("is-invalid");

            isValid = false;

        }


        // Validate email

        if (!email.validity.valid) {

            email.classList.add("is-invalid");

            isValid = false;

        }


        // Validate phone number

        if (!phone.validity.valid) {

            phone.classList.add("is-invalid");

            isValid = false;

        }


        // Validate password strength (same rule as the server: 8+ characters with letters and numbers)

        if (password.value.length < 8 || !/[A-Za-z]/.test(password.value) || !/\d/.test(password.value)) {

            password.classList.add("is-invalid");

            isValid = false;

        }


        // Validate matching passwords

        if (
            password.value !== confirmPassword.value ||
            confirmPassword.value === ""
        ) {

            confirmPassword.classList.add("is-invalid");

            isValid = false;

        }


        // Validate terms and conditions

        if (!agreeTerms.checked) {

            agreeTerms.classList.add("is-invalid");

            isValid = false;

        }


        // Stop if validation fails

        if (!isValid) {

            showMessage(
                message,
                "Please correct the highlighted fields before continuing.",
                "error"
            );

            return;

        }


        // Display successful frontend validation

        // Save the new account in the database through the backend API
        const submitButton = registerForm.querySelector('button[type="submit"]');

        if (submitButton) submitButton.disabled = true;

        showMessage(message, "Creating your account...", "success");

        CS.request("/api/users/register", {
            method: "POST",
            body: {
                full_name: fullName.value.trim(),
                email: email.value.trim(),
                phone: phone.value.trim(),
                password: password.value
            }
        })
            .then(() => {
                showMessage(message, "Account created! Taking you to the login page...", "success");

                const registeredEmail = email.value.trim();
                registerForm.reset();

                setTimeout(() => {
                    window.location.href = `login.html?email=${encodeURIComponent(registeredEmail)}${location.search.includes("next=") ? "&" + location.search.slice(1) : ""}`;
                }, 1300);
            })
            .catch(error => {
                showMessage(message, error.message, "error");
            })
            .finally(() => {
                if (submitButton) submitButton.disabled = false;
            });

    });

}


// 5. PREFILL THE EMAIL AFTER REGISTERING

const prefillEmail = new URLSearchParams(location.search).get("email");
if (prefillEmail && document.getElementById("loginEmail")) {
    document.getElementById("loginEmail").value = prefillEmail;
    document.getElementById("loginPassword").focus();
}
