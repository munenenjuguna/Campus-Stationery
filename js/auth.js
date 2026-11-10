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


// BACKEND ADDRESS FOR ACCOUNT REQUESTS

const AUTH_API = "http://localhost:5000/api/users";


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

        fetch(`${AUTH_API}/login`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                email: email.value.trim(),
                password: password.value
            })
        })
            .then(response => response.json())
            .then(result => {

                if (!result.success) {
                    showMessage(message, result.message || "Invalid email or password.", "error");
                    return;
                }

                // Remember who is logged in for the rest of the site
                localStorage.setItem("currentUser", JSON.stringify(result.user));

                showMessage(message, `Welcome back, ${result.user.full_name}! Taking you to the shop...`, "success");

                setTimeout(() => {
                    window.location.href = "products.html";
                }, 1200);
            })
            .catch(() => {
                showMessage(message, "Cannot reach the server. Make sure the backend is running (npm start).", "error");
            })
            .finally(() => {
                if (submitButton) submitButton.disabled = false;
            });

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


        // Validate password length

        if (password.value.length < 8) {

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

        fetch(`${AUTH_API}/register`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                full_name: fullName.value.trim(),
                email: email.value.trim(),
                password: password.value
            })
        })
            .then(response => response.json())
            .then(result => {

                if (!result.success) {
                    showMessage(message, result.message || "Registration failed. Please try again.", "error");
                    return;
                }

                showMessage(message, "Account created! Taking you to the login page...", "success");

                registerForm.reset();

                setTimeout(() => {
                    window.location.href = "login.html";
                }, 1500);
            })
            .catch(() => {
                showMessage(message, "Cannot reach the server. Make sure the backend is running (npm start).", "error");
            })
            .finally(() => {
                if (submitButton) submitButton.disabled = false;
            });

    });

}