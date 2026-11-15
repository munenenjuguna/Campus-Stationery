// ==========================================
// CAMPUS STATIONERY - SHARED HEADER AND FOOTER
// Every page has <div id="siteHeader"></div> and <div id="siteFooter"></div>.
// This script fills them in, so all pages look and behave the same.
// ==========================================

(function () {

    const R = CS.ROOT;
    const page = location.pathname.split("/").pop() || "index.html";
    const user = CS.getUser();


    // 1. HEADER

    function navLink(href, label, files) {
        const active = files.includes(page) ? " active" : "";
        return `<li class="nav-item"><a class="nav-link${active}" href="${href}">${label}</a></li>`;
    }

    const accountArea = CS.isLoggedIn()
        ? `
            <div class="dropdown">
                <a href="#" class="login-link dropdown-toggle" data-bs-toggle="dropdown" aria-expanded="false">
                    <i class="bi bi-person-circle"></i>
                    Hi, ${CS.escapeHtml(String(user.full_name || "").split(" ")[0])}
                </a>
                <ul class="dropdown-menu dropdown-menu-end shadow-sm">
                    <li><a class="dropdown-item" href="${R}pages/my-orders.html"><i class="bi bi-bag-check me-2"></i>My Orders</a></li>
                    <li><a class="dropdown-item" href="${R}pages/account.html"><i class="bi bi-person-gear me-2"></i>My Account</a></li>
                    <li><hr class="dropdown-divider"></li>
                    <li><button type="button" class="dropdown-item text-danger" id="logoutBtn"><i class="bi bi-box-arrow-right me-2"></i>Logout</button></li>
                </ul>
            </div>`
        : `
            <a href="${R}pages/login.html" class="login-link">Login</a>
            <a href="${R}pages/register.html" class="login-link d-none d-xl-inline">Register</a>`;

    const header = document.getElementById("siteHeader");
    if (header) {
        header.innerHTML = `
        <nav class="navbar navbar-expand-lg navbar-light bg-white sticky-top">
            <div class="container">
                <a class="navbar-brand" href="${R}index.html">Campus<span>Stationery.</span></a>

                <button class="navbar-toggler" type="button" data-bs-toggle="collapse"
                    data-bs-target="#mainNavbar" aria-label="Open menu">
                    <span class="navbar-toggler-icon"></span>
                </button>

                <div class="collapse navbar-collapse" id="mainNavbar">
                    <ul class="navbar-nav mx-auto">
                        ${navLink(R + "index.html", "Home", ["index.html", ""])}
                        ${navLink(R + "pages/products.html", "Shop", ["products.html", "product-details.html"])}
                        ${navLink(R + "index.html#categories", "Categories", [])}
                        ${navLink(R + "pages/my-orders.html", "My Orders", ["my-orders.html"])}
                        ${navLink(R + "pages/help.html", "Help", ["help.html"])}
                    </ul>

                    <div class="nav-actions">
                        ${accountArea}
                        <a href="${R}pages/cart.html" class="cart-link">
                            <i class="bi bi-bag"></i>
                            <span>Cart</span>
                            <span class="cart-badge" id="cartCount">0</span>
                        </a>
                    </div>
                </div>
            </div>
        </nav>`;
    }


    // 2. FOOTER

    const footer = document.getElementById("siteFooter");
    if (footer) {
        footer.innerHTML = `
        <footer class="footer">
            <div class="container">
                <div class="row g-4">
                    <div class="col-lg-5">
                        <a href="${R}index.html" class="footer-brand">Campus<span>Stationery.</span></a>
                        <p>Your reliable campus bookstore for all your academic essentials.
                           Order online, pay with M-Pesa and collect on campus.</p>
                    </div>

                    <div class="col-6 col-lg-3">
                        <h6>Shop</h6>
                        <a href="${R}index.html">Home</a>
                        <a href="${R}pages/products.html">All Products</a>
                        <a href="${R}index.html#categories">Categories</a>
                        <a href="${R}pages/help.html">Help and FAQs</a>
                    </div>

                    <div class="col-6 col-lg-4">
                        <h6>Account</h6>
                        ${CS.isLoggedIn()
                            ? `<a href="${R}pages/account.html">My Account</a>`
                            : `<a href="${R}pages/login.html">Login</a><a href="${R}pages/register.html">Create Account</a>`}
                        <a href="${R}pages/my-orders.html">My Orders</a>
                        <a href="${R}pages/cart.html">Shopping Cart</a>
                    </div>
                </div>

                <hr>

                <div class="footer-bottom">
                    <p>&copy; ${new Date().getFullYear()} CampusStationery. All rights reserved.</p>
                    <p>Need help? Press <kbd>F1</kbd> or visit <a href="${R}pages/help.html" class="d-inline">Help</a>.</p>
                </div>
            </div>
        </footer>`;
    }


    // 3. BEHAVIOUR

    CS.updateCartCount();

    const logoutButton = document.getElementById("logoutBtn");
    if (logoutButton) logoutButton.addEventListener("click", CS.logout);

    // Keep the cart count right when another tab changes the cart
    window.addEventListener("storage", event => {
        if (event.key === "cart") CS.updateCartCount();
    });

    // Key trapping: phone boxes take digits, "+" and spaces only
    document.querySelectorAll('input[type="tel"]').forEach(input => {
        CS.digitsOnly(input, { max: 16, extra: "+ " });
    });

    // Number boxes (quantities): block "e", "+", "-" and ".", and keep the value inside its limits
    document.addEventListener("keydown", event => {
        const t = event.target;
        if (t instanceof HTMLInputElement && t.type === "number" && ["e", "E", "+", "-", "."].includes(event.key)) {
            event.preventDefault();
        }
    });
    document.addEventListener("change", event => {
        const t = event.target;
        if (!(t instanceof HTMLInputElement) || t.type !== "number" || t.value === "") return;
        const value = Math.round(Number(t.value));
        const min = t.min !== "" ? Number(t.min) : -Infinity;
        const max = t.max !== "" ? Number(t.max) : Infinity;
        const fixed = Math.min(Math.max(value, min), max);
        if (fixed !== Number(t.value)) {
            t.value = fixed;
            if (value > max) CS.toast(`Only ${max} available.`, "info");
        }
    });

    // Recovery when the internet drops: the cart and typed details stay where they are
    window.addEventListener("offline", () => CS.toast("You are offline. Your cart is saved, so nothing is lost. Carry on once the connection is back.", "error"));
    window.addEventListener("online", () => CS.toast("You are back online.", "success"));

    // Keyboard shortcuts: F1 opens help, "/" jumps to the search box
    document.addEventListener("keydown", event => {
        const typing = /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName);
        if (event.key === "F1") {
            event.preventDefault();
            location.href = R + "pages/help.html";
        } else if (event.key === "/" && !typing) {
            const search = document.querySelector("input[type=search], #searchInput, #productSearch");
            if (search) {
                event.preventDefault();
                search.focus();
            }
        }
    });

})();
