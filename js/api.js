// ==========================================
// CAMPUS STATIONERY - API AND SESSION HELPERS
// Shared by every shop page. Load it before the other page scripts.
// ==========================================

const CS = (function () {

    // 1. SERVER ADDRESS
    // When the page is opened through the Node server (http://localhost:5000) the API is on the same
    // address. When it is opened with VS Code Live Server or by double clicking, use port 5000.
    const usingNodeServer = location.protocol.startsWith("http") && !["5500", "5501"].includes(location.port);
    const API_BASE = usingNodeServer ? "" : "http://localhost:5000";

    // Path to the site root from the current page ("" on index.html, "../" inside /pages)
    const ROOT = location.pathname.includes("/pages/") ? "../" : "";


    // 2. LOGIN SESSION (stored in the browser)

    function getToken() {
        return localStorage.getItem("csToken");
    }

    function getUser() {
        try {
            return JSON.parse(localStorage.getItem("currentUser"));
        } catch (error) {
            return null;
        }
    }

    function saveSession(token, user) {
        localStorage.setItem("csToken", token);
        localStorage.setItem("currentUser", JSON.stringify(user));
    }

    function clearSession() {
        localStorage.removeItem("csToken");
        localStorage.removeItem("currentUser");
    }

    function isLoggedIn() {
        return !!getToken() && !!getUser();
    }

    // Sends visitors to the login page and brings them back here afterwards
    function requireLogin() {
        if (isLoggedIn()) return true;
        const here = location.pathname.split("/").pop() + location.search;
        location.href = `${ROOT}pages/login.html?next=${encodeURIComponent(here)}`;
        return false;
    }

    async function logout() {
        try {
            await request("/api/users/logout", { method: "POST" });
        } catch (error) {
            // Log out locally even if the server cannot be reached
        }
        clearSession();
        location.href = ROOT + "index.html";
    }


    // 3. TALKING TO THE SERVER

    async function request(path, { method = "GET", body } = {}) {
        const headers = { "Content-Type": "application/json" };
        const token = getToken();
        if (token) headers.Authorization = "Bearer " + token;

        let response;
        try {
            response = await fetch(API_BASE + path, {
                method,
                headers,
                body: body ? JSON.stringify(body) : undefined
            });
        } catch (error) {
            throw new Error("Cannot reach the server. Make sure it is running (npm start) and try again.");
        }

        let data = {};
        try {
            data = await response.json();
        } catch (error) {
            data = {};
        }

        if (response.status === 401 && token) {
            // The login has expired: clear it and ask the person to log in again
            clearSession();
            requireLogin();
            throw new Error(data.message || "Please log in again.");
        }

        if (!response.ok || data.success === false) {
            const error = new Error(data.message || data.error || `Request failed (${response.status}).`);
            error.status = response.status;
            error.data = data;
            throw error;
        }

        return data;
    }


    // KEY TRAPPING: lets a box accept digits only (codes, quantities, phone numbers).
    // Typed letters are blocked, and pasted text is cleaned. extra lets one more character through, e.g. "+".
    function digitsOnly(input, { max = 0, extra = "" } = {}) {
        if (!input) return;
        const allowedKeys = ["Backspace", "Delete", "Tab", "ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End", "Enter", "Escape"];
        input.addEventListener("keydown", event => {
            if (event.ctrlKey || event.metaKey || event.altKey || allowedKeys.includes(event.key)) return;
            if (/^[0-9]$/.test(event.key) || (extra && extra.includes(event.key))) return;
            event.preventDefault();
        });
        input.addEventListener("input", () => {
            const pattern = new RegExp(`[^0-9${extra.replace(/[\]\\^-]/g, "\\$&")}]`, "g");
            let clean = input.value.replace(pattern, "");
            if (max) clean = clean.slice(0, max);
            if (clean !== input.value) input.value = clean;
        });
    }


    // 4. SHOPPING CART (kept in the browser until the order is placed)

    function getCart() {
        try {
            return JSON.parse(localStorage.getItem("cart")) || [];
        } catch (error) {
            return [];
        }
    }

    function saveCart(cart) {
        localStorage.setItem("cart", JSON.stringify(cart));
        updateCartCount();
    }

    function cartCount() {
        return getCart().reduce((total, item) => total + Number(item.quantity || 0), 0);
    }

    function updateCartCount() {
        document.querySelectorAll("#cartCount, [data-cart-count]").forEach(element => {
            element.textContent = cartCount();
        });
    }

    // Adds a product to the cart without going over the stock available
    function addToCart(product, quantity = 1) {
        if (!product || product.stock <= 0) {
            toast("Sorry, this item is out of stock.", "error");
            return false;
        }
        const cart = getCart();
        const existing = cart.find(item => item.id === product.id);
        const already = existing ? existing.quantity : 0;

        if (already + quantity > product.stock) {
            toast(`Only ${product.stock} of ${product.name} available. You already have ${already} in your cart.`, "error");
            return false;
        }

        if (existing) {
            existing.quantity += quantity;
            existing.price = product.price;
            existing.stock = product.stock;
        } else {
            cart.push({ id: product.id, name: product.name, price: product.price, image: product.image, stock: product.stock, quantity });
        }
        saveCart(cart);
        toast(`${product.name} added to your cart.`, "success", { label: "View cart", href: ROOT + "pages/cart.html" });
        return true;
    }


    // 5. SMALL HELPERS

    function formatPrice(amount) {
        return "KSh " + Number(amount || 0).toLocaleString("en-KE", { maximumFractionDigits: 2 });
    }

    // 254712345678 -> 0712345678
    function displayPhone(phone) {
        const text = String(phone || "");
        return /^254\d{9}$/.test(text) ? "0" + text.slice(3) : text;
    }

    function escapeHtml(value) {
        return String(value == null ? "" : value).replace(/[&<>"']/g, character => ({
            "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
        }[character]));
    }

    // Small pop up message in the corner (replaces browser alert boxes)
    function toast(message, type = "info", action) {
        let holder = document.getElementById("csToasts");
        if (!holder) {
            holder = document.createElement("div");
            holder.id = "csToasts";
            holder.className = "cs-toasts";
            holder.setAttribute("aria-live", "polite");
            document.body.appendChild(holder);
        }
        const icons = { success: "bi-check-circle-fill", error: "bi-exclamation-circle-fill", info: "bi-info-circle-fill" };
        const box = document.createElement("div");
        box.className = `cs-toast cs-toast-${type}`;
        box.innerHTML = `
            <i class="bi ${icons[type] || icons.info}"></i>
            <span>${escapeHtml(message)}</span>
            ${action ? `<a href="${action.href}">${escapeHtml(action.label)}</a>` : ""}
            <button type="button" aria-label="Close">&times;</button>`;
        box.querySelector("button").addEventListener("click", () => box.remove());
        holder.appendChild(box);
        setTimeout(() => box.remove(), type === "error" ? 7000 : 4000);
    }

    return {
        API_BASE, ROOT,
        getToken, getUser, saveSession, clearSession, isLoggedIn, requireLogin, logout,
        request, digitsOnly,
        getCart, saveCart, cartCount, updateCartCount, addToCart,
        formatPrice, displayPhone, escapeHtml, toast
    };

})();
