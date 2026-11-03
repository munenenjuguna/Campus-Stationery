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


        showMessage(
            message,
            "Your details have been validated. Account authentication will be connected to the backend.",
            "success"
        );

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

        showMessage(
            message,
            "Your information is valid. Account registration will be connected to the backend.",
            "success"
        );

    });

}