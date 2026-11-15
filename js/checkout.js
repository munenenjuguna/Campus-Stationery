// ==========================================
// CAMPUS STATIONERY - CHECKOUT (MAIN TRANSACTION)
// Sends the order to the server, which checks stock, saves it in the database
// and starts the M-Pesa payment. The cart is only cleared once the order is saved.
// ==========================================


// 1. CUSTOMERS MUST BE LOGGED IN TO ORDER

const loggedIn = CS.requireLogin();


// 2. GET CART AND HTML ELEMENTS

let cart = CS.getCart();

const DELIVERY_FEE = 100; // shown to the customer; the server applies the same rule from config/shop.js

const checkoutItems = document.getElementById("checkoutItems");
const checkoutSubtotal = document.getElementById("checkoutSubtotal");
const checkoutTotal = document.getElementById("checkoutTotal");
const deliveryCostElement = document.getElementById("deliveryCost");
const checkoutForm = document.getElementById("checkoutForm");
const deliveryMethod = document.getElementById("deliveryMethod");
const locationGroup = document.getElementById("locationGroup");
const locationInput = document.getElementById("location");
const phoneInput = document.getElementById("phone");
const orderSuccess = document.getElementById("orderSuccess");
const checkoutAlert = document.getElementById("checkoutAlert");
const placeOrderBtn = document.getElementById("placeOrderBtn");

const paymentModalElement = document.getElementById("paymentModal");
const paymentModal = new bootstrap.Modal(paymentModalElement, { backdrop: "static", keyboard: false });

let currentOrder = null;
let pollTimer = null;


// 3. TOTALS

function calculateSubtotal() {
    return cart.reduce((total, item) => total + item.price * item.quantity, 0);
}

function getDeliveryCost() {
    return deliveryMethod.value === "Campus Delivery" ? DELIVERY_FEE : 0;
}

function calculateCheckoutTotal() {
    const subtotal = calculateSubtotal();
    const delivery = getDeliveryCost();
    checkoutSubtotal.textContent = CS.formatPrice(subtotal);
    deliveryCostElement.textContent = CS.formatPrice(delivery);
    checkoutTotal.textContent = CS.formatPrice(subtotal + delivery);
}


// 4. ORDER SUMMARY

function displayCheckoutSummary() {

    checkoutItems.innerHTML = "";

    if (cart.length === 0) {
        checkoutItems.innerHTML = `
            <p>Your cart is empty.</p>
            <a href="products.html" class="btn btn-primary">Browse Products</a>`;
        checkoutForm.style.display = "none";
        calculateCheckoutTotal();
        return;
    }

    cart.forEach(item => {
        const product = document.createElement("div");
        product.className = "checkout-product";
        product.innerHTML = `
            <img src="${CS.escapeHtml(item.image)}" alt="${CS.escapeHtml(item.name)}">
            <div class="checkout-product-details">
                <h6>${CS.escapeHtml(item.name)}</h6>
                <p>Quantity: ${item.quantity} &times; ${CS.formatPrice(item.price)}</p>
            </div>
            <div class="checkout-product-price">${CS.formatPrice(item.price * item.quantity)}</div>`;
        checkoutItems.appendChild(product);
    });

    calculateCheckoutTotal();
}


// 5. FILL IN THE CUSTOMER'S DETAILS FROM THEIR ACCOUNT

function prefillCustomer() {
    const user = CS.getUser();
    if (!user) return;
    document.getElementById("fullName").value = user.full_name || "";
    document.getElementById("email").value = user.email || "";
    if (user.phone) phoneInput.value = CS.displayPhone(user.phone);
}


// 6. DELIVERY LOCATION FIELD

deliveryMethod.addEventListener("change", function () {
    const delivery = deliveryMethod.value === "Campus Delivery";
    locationGroup.style.display = delivery ? "block" : "none";
    locationInput.required = delivery;
    if (!delivery) locationInput.value = "";
    calculateCheckoutTotal();
});


// 7. ERROR MESSAGES

function showError(message) {
    checkoutAlert.innerHTML = `<i class="bi bi-exclamation-circle me-2"></i>${CS.escapeHtml(message)}`;
    checkoutAlert.classList.remove("d-none");
    checkoutAlert.scrollIntoView({ behavior: "smooth", block: "center" });
}

function clearError() {
    checkoutAlert.classList.add("d-none");
}


// 8. PLACE THE ORDER

checkoutForm.addEventListener("submit", async function (event) {

    event.preventDefault();
    clearError();

    checkoutForm.classList.add("was-validated");
    if (!checkoutForm.checkValidity()) {
        const firstInvalid = checkoutForm.querySelector(":invalid");
        if (firstInvalid) firstInvalid.focus();
        showError("Please complete the highlighted fields.");
        return;
    }

    const paymentMethod = document.querySelector('input[name="paymentMethod"]:checked');
    if (!paymentMethod) {
        showError("Please select a payment method.");
        return;
    }

    if (cart.length === 0) {
        showError("Your cart is empty.");
        return;
    }

    // Prevent double orders from double clicks
    placeOrderBtn.disabled = true;
    placeOrderBtn.innerHTML = `<span class="spinner-border spinner-border-sm me-2"></span>Placing your order...`;

    try {
        const result = await CS.request("/api/orders", {
            method: "POST",
            body: {
                items: cart.map(item => ({ product_id: item.id, quantity: item.quantity })),
                delivery_method: deliveryMethod.value,
                delivery_location: locationInput.value.trim(),
                phone: phoneInput.value.trim(),
                payment_method: paymentMethod.value
            }
        });

        // The order is saved, so the cart can be emptied
        currentOrder = { ref: result.order.ref, total: result.order.total, method: paymentMethod.value, phone: phoneInput.value.trim() };
        CS.saveCart([]);
        cart = [];

        if (paymentMethod.value === "M-Pesa") {
            startPaymentWatch(result.payment);
        } else {
            showSuccess("Pay in cash when you collect your order.");
        }

    } catch (error) {
        showError(error.message);
    } finally {
        placeOrderBtn.disabled = false;
        placeOrderBtn.innerHTML = `Place Order <i class="bi bi-arrow-right"></i>`;
    }
});


// 9. M-PESA PAYMENT

function setPaymentView(state, message) {
    const views = {
        waiting: `
            <div class="spinner-border text-success mb-3" role="status"></div>
            <h5>Check your phone</h5>
            <p>We sent an M-Pesa request to <strong>${CS.escapeHtml(currentOrder.phone)}</strong>.<br>
               Enter your M-Pesa PIN to pay <strong>${CS.formatPrice(currentOrder.total)}</strong>.</p>`,
        paid: `
            <i class="bi bi-check-circle-fill text-success display-5"></i>
            <h5 class="mt-3">Payment received</h5>
            <p>${CS.escapeHtml(message || "Thank you!")}</p>`,
        failed: `
            <i class="bi bi-x-circle-fill text-danger display-5"></i>
            <h5 class="mt-3">Payment not completed</h5>
            <p>${CS.escapeHtml(message || "The payment was cancelled or timed out.")}</p>
            <div class="d-flex gap-2 justify-content-center flex-wrap">
                <button type="button" class="btn btn-success" id="retryPayment"><i class="bi bi-arrow-repeat me-1"></i>Try again</button>
                <button type="button" class="btn btn-outline-secondary" id="payLater">Pay later from My Orders</button>
            </div>`
    };
    document.getElementById("paymentBody").innerHTML = views[state];

    const retry = document.getElementById("retryPayment");
    if (retry) retry.addEventListener("click", retryPayment);
    const later = document.getElementById("payLater");
    if (later) later.addEventListener("click", () => {
        paymentModal.hide();
        showSuccess("Your order is saved. You can pay with M-Pesa from My Orders.");
    });
}

function startPaymentWatch(payment) {
    document.getElementById("paymentDemoNote").classList.toggle("d-none", payment.mode !== "demo");
    paymentModal.show();

    if (payment.status === "Failed") {
        setPaymentView("failed", payment.message);
        return;
    }

    setPaymentView("waiting");
    const startedAt = Date.now();

    clearInterval(pollTimer);
    pollTimer = setInterval(async () => {
        try {
            const result = await CS.request(`/api/orders/${encodeURIComponent(currentOrder.ref)}/payment`);
            if (result.status === "Paid") {
                clearInterval(pollTimer);
                setPaymentView("paid", result.receipt ? `M-Pesa receipt: ${result.receipt}` : "");
                setTimeout(() => {
                    paymentModal.hide();
                    showSuccess(result.receipt ? `Paid with M-Pesa. Receipt: ${result.receipt}` : "Paid with M-Pesa.");
                }, 1800);
            } else if (result.status === "Failed" || result.status === "Cancelled") {
                clearInterval(pollTimer);
                setPaymentView("failed", result.message);
            } else if (Date.now() - startedAt > 90000) {
                clearInterval(pollTimer);
                setPaymentView("failed", "We have not received a confirmation yet. If you paid, it will show in My Orders shortly.");
            }
        } catch (error) {
            // A short network problem: keep waiting
        }
    }, 3000);
}

async function retryPayment() {
    setPaymentView("waiting");
    try {
        const result = await CS.request(`/api/orders/${encodeURIComponent(currentOrder.ref)}/pay`, { method: "POST", body: {} });
        startPaymentWatch(result);
    } catch (error) {
        setPaymentView("failed", error.message);
    }
}


// 10. ORDER CONFIRMATION

function showSuccess(paymentText) {
    checkoutForm.closest(".row").style.display = "none";
    document.getElementById("orderReference").textContent = currentOrder.ref;
    document.getElementById("orderTotal").textContent = CS.formatPrice(currentOrder.total);
    document.getElementById("orderPaymentNote").textContent = paymentText;
    orderSuccess.style.display = "block";
    orderSuccess.scrollIntoView({ behavior: "smooth" });
}


// 11. START

if (loggedIn) {
    prefillCustomer();
    displayCheckoutSummary();
}
