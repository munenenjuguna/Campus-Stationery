// ==========================================
// CAMPUS STATIONERY - MY ORDERS
// ==========================================


// 1. ORDERS (loaded from the database for the logged in customer, see section 11)

const loggedIn = CS.requireLogin();

let orders = [];


// 2. GET HTML ELEMENTS

const ordersContainer = document.getElementById("ordersContainer");

const emptyOrders = document.getElementById("emptyOrders");

const orderFilter = document.getElementById("orderFilter");

const totalOrders = document.getElementById("totalOrders");

const pendingOrders = document.getElementById("pendingOrders");

const completedOrders = document.getElementById("completedOrders");

const orderDetailsContent = document.getElementById("orderDetailsContent");


// 3. FORMAT PRICE

function formatPrice(price) {

    return `KSh ${Number(price).toLocaleString("en-KE")}`;

}


// 4. FORMAT DATE

function formatDate(date) {

    return new Date(date).toLocaleDateString("en-KE", {
        day: "numeric",
        month: "short",
        year: "numeric"
    });

}


// 5. GET STATUS CSS CLASS

function getStatusClass(status) {

    const statusClasses = {

        "Pending": "status-pending",

        "Processing": "status-processing",

        "Ready for Collection": "status-ready",

        "Completed": "status-completed",

        "Cancelled": "status-cancelled"

    };

    return statusClasses[status] || "status-pending";

}


// 6. UPDATE ORDER OVERVIEW

function updateOrderOverview() {

    totalOrders.textContent = orders.length;

    // "Open" orders are still being handled by the shop
    pendingOrders.textContent = orders.filter(order =>
        ["Pending", "Processing", "Ready for Collection"].includes(order.status)
    ).length;

    completedOrders.textContent = orders.filter(order =>
        order.status === "Completed"
    ).length;

}


// 7. DISPLAY ORDERS

function displayOrders() {

    ordersContainer.innerHTML = "";

    const selectedStatus = orderFilter.value;

    let filteredOrders = [...orders];

    // Apply status filter

    if (selectedStatus !== "all") {

        filteredOrders = filteredOrders.filter(order =>
            order.status === selectedStatus
        );

    }

    // Sort newest orders first

    filteredOrders.sort((a, b) =>
        new Date(b.orderDate) - new Date(a.orderDate)
    );


    // Display empty state if no orders

    if (filteredOrders.length === 0) {

        emptyOrders.style.display = "block";

        if (orders.length > 0) {

            emptyOrders.querySelector("h3").textContent = "No Matching Orders";

            emptyOrders.querySelector("p").textContent =
                "There are no orders with this status.";

        } else {

            emptyOrders.querySelector("h3").textContent = "No Orders Found";

            emptyOrders.querySelector("p").textContent =
                "You haven't placed any orders yet.";

        }

        return;

    }


    emptyOrders.style.display = "none";


    // Display each order

    filteredOrders.forEach(order => {

        const orderCard = document.createElement("div");

        orderCard.className = "order-card";


        // Display product images

        const productImages = order.items.map(item => `

            <img
                src="${CS.escapeHtml(item.image)}"
                alt="${CS.escapeHtml(item.name)}"
                class="order-product-image"
                title="${CS.escapeHtml(item.name)} &times; ${item.quantity}"
            >

        `).join("");


        orderCard.innerHTML = `

            <div class="order-card-header">

                <div>

                    <p class="order-reference">
                        Order #${order.orderId}
                    </p>

                    <p class="order-date">
                        Placed on ${formatDate(order.orderDate)}
                    </p>

                </div>

                <span class="order-status ${getStatusClass(order.status)}">

                    ${order.status}

                </span>

            </div>


            <div class="order-card-body">

                <div class="order-products">

                    ${productImages}

                </div>


                <div class="order-card-footer">

                    <div>

                        <p class="mb-1 text-muted">
                            ${order.items.length} product type(s) &middot;
                            ${CS.escapeHtml(order.paymentMethod || "")}
                            <span class="payment-pill payment-${String(order.paymentStatus || "").toLowerCase()}">
                                ${paymentLabel(order)}
                            </span>
                        </p>

                        <span class="order-total">
                            ${formatPrice(order.total)}
                        </span>

                    </div>


                    <div class="d-flex gap-2 flex-wrap justify-content-end">

                        ${order.canPay ? `
                        <button class="btn btn-success btn-sm pay-order-btn" data-id="${order.orderId}">
                            <i class="bi bi-phone"></i> Pay with M-Pesa
                        </button>` : ""}

                        ${order.canCancel ? `
                        <button class="btn btn-outline-danger btn-sm cancel-order-btn" data-id="${order.orderId}">
                            Cancel
                        </button>` : ""}

                        <button
                            class="view-order-btn"
                            data-id="${order.orderId}"
                        >
                            View Details
                            <i class="bi bi-arrow-right"></i>
                        </button>

                    </div>

                </div>

            </div>

        `;


        ordersContainer.appendChild(orderCard);

    });

}


// 8. DISPLAY ORDER DETAILS

function viewOrderDetails(orderId) {

    const order = orders.find(item =>
        item.orderId === orderId
    );

    if (!order) {
        return;
    }


    // Display products in the order

    const productsHTML = order.items.map(item => `

        <div class="order-detail-product">

            <img src="${CS.escapeHtml(item.image)}" alt="${CS.escapeHtml(item.name)}">

            <div>

                <h6>${CS.escapeHtml(item.name)}</h6>

                <p>
                    ${item.quantity} × ${formatPrice(item.price)}
                </p>

            </div>

            <strong>
                ${formatPrice(item.price * item.quantity)}
            </strong>

        </div>

    `).join("");


    orderDetailsContent.innerHTML = `

        <div class="order-detail-row">

            <span>Order Reference</span>

            <strong>${order.orderId}</strong>

        </div>


        <div class="order-detail-row">

            <span>Order Date</span>

            <strong>${formatDate(order.orderDate)}</strong>

        </div>


        <div class="order-detail-row">

            <span>Order Status</span>

            <strong class="order-status ${getStatusClass(order.status)}">

                ${order.status}

            </strong>

        </div>


        <div class="order-detail-row">

            <span>Payment Method</span>

            <strong>${CS.escapeHtml(order.paymentMethod)}</strong>

        </div>


        <div class="order-detail-row">

            <span>Payment Status</span>

            <strong>${paymentLabel(order)}${order.mpesaReceipt ? ` (receipt ${CS.escapeHtml(order.mpesaReceipt)})` : ""}</strong>

        </div>


        <div class="order-detail-row">

            <span>Delivery Method</span>

            <strong>${order.delivery.method}</strong>

        </div>


        <div class="order-detail-row">

            <span>Delivery Location</span>

            <strong>${CS.escapeHtml(order.delivery.location || "Campus Pickup")}</strong>

        </div>


        <h6 class="mt-4 mb-3">Products Ordered</h6>


        ${productsHTML}


        <div class="order-detail-row mt-3">

            <span>Subtotal</span>

            <strong>${formatPrice(order.subtotal)}</strong>

        </div>


        <div class="order-detail-row">

            <span>Delivery Cost</span>

            <strong>${formatPrice(order.deliveryCost)}</strong>

        </div>


        <div class="order-detail-row">

            <strong>Total Amount</strong>

            <strong>${formatPrice(order.total)}</strong>

        </div>

        <div class="text-end mt-3">
            <button type="button" class="btn btn-outline-secondary btn-sm" id="printReceipt">
                <i class="bi bi-printer"></i> Print receipt
            </button>
        </div>

    `;

    document.getElementById("printReceipt").addEventListener("click", () => printReceipt(order));


    // Open Bootstrap modal

    const modalElement = document.getElementById("orderDetailsModal");

    const modal = bootstrap.Modal.getOrCreateInstance(modalElement);

    modal.show();

}


// 9. HANDLE VIEW DETAILS BUTTON

ordersContainer.addEventListener("click", function(event) {

    const button = event.target.closest(".view-order-btn");

    if (button) {

        const orderId = button.dataset.id;

        viewOrderDetails(orderId);

    }

    const cancelButton = event.target.closest(".cancel-order-btn");
    if (cancelButton) cancelOrder(cancelButton.dataset.id, cancelButton);

    const payButton = event.target.closest(".pay-order-btn");
    if (payButton) payOrder(payButton.dataset.id, payButton);

});


// 10. HANDLE ORDER FILTER

orderFilter.addEventListener("change", displayOrders);


// 11. PAYMENT LABEL, CANCEL, PAY AND PRINT

function paymentLabel(order) {
    const labels = { Paid: "Paid", Pending: order.paymentMethod === "M-Pesa" ? "Awaiting payment" : "Pay on collection", Failed: "Payment failed", Cancelled: "Cancelled" };
    return labels[order.paymentStatus] || order.paymentStatus || "";
}

async function cancelOrder(ref, button) {
    if (!confirm(`Cancel order ${ref}? The items will be returned to stock.`)) return;
    button.disabled = true;
    try {
        const result = await CS.request(`/api/orders/${encodeURIComponent(ref)}/cancel`, { method: "POST" });
        CS.toast(result.message, "success");
        await loadOrders();
    } catch (error) {
        CS.toast(error.message, "error");
        button.disabled = false;
    }
}

async function payOrder(ref, button) {
    button.disabled = true;
    button.innerHTML = `<span class="spinner-border spinner-border-sm"></span> Check your phone...`;
    try {
        const start = await CS.request(`/api/orders/${encodeURIComponent(ref)}/pay`, { method: "POST", body: {} });
        if (start.status === "Failed") throw new Error(start.message);
        CS.toast(start.mode === "demo" ? "Demo mode: payment request simulated. It confirms in a few seconds." : "M-Pesa request sent. Enter your PIN on your phone.", "info");

        // Ask the server every 3 seconds for up to 90 seconds
        for (let i = 0; i < 30; i++) {
            await new Promise(resolve => setTimeout(resolve, 3000));
            const result = await CS.request(`/api/orders/${encodeURIComponent(ref)}/payment`);
            if (result.status === "Paid") {
                CS.toast(`Payment received${result.receipt ? ". Receipt " + result.receipt : ""}.`, "success");
                break;
            }
            if (result.status === "Failed" || result.status === "Cancelled") throw new Error(result.message || "The payment was not completed.");
        }
    } catch (error) {
        CS.toast(error.message, "error");
    }
    await loadOrders();
}

function printReceipt(order) {
    const win = window.open("", "_blank");
    if (!win) {
        CS.toast("Allow pop ups for this site to print the receipt.", "error");
        return;
    }
    const rows = order.items.map(item => `
        <tr><td>${CS.escapeHtml(item.name)}</td><td>${item.quantity}</td>
        <td>${formatPrice(item.price)}</td><td>${formatPrice(item.price * item.quantity)}</td></tr>`).join("");
    win.document.write(`<!DOCTYPE html><html><head><title>Receipt ${CS.escapeHtml(order.orderId)}</title>
        <style>
            body{font-family:Arial,sans-serif;color:#263238;margin:32px;max-width:720px}
            .head{display:flex;align-items:center;gap:14px;border-bottom:3px solid #e58b45;padding-bottom:12px}
            .logo{width:46px;height:46px;border-radius:50%;background:#172b4d;color:#e58b45;display:grid;place-items:center;font:700 19px Georgia,serif}
            h1{margin:0;font:700 22px Georgia,serif;color:#172b4d} table{width:100%;border-collapse:collapse;margin-top:16px;font-size:14px}
            th{background:#172b4d;color:#fff;text-align:left;padding:8px} td{padding:7px 8px;border-bottom:1px solid #eee}
            .meta{font-size:13px;color:#555;margin-top:12px;line-height:1.7} .tot td{font-weight:700}
            @media print{button{display:none}}
        </style></head><body>
        <div class="head"><div class="logo">CS</div><div><h1>CampusStationery</h1><div>Official receipt</div></div>
        <button style="margin-left:auto;padding:8px 14px" onclick="window.print()">Print</button></div>
        <div class="meta">Order: <strong>${CS.escapeHtml(order.orderId)}</strong><br>Date: ${formatDate(order.orderDate)}<br>
        Customer: ${CS.escapeHtml((CS.getUser() || {}).full_name || "")}<br>Status: ${CS.escapeHtml(order.status)}<br>
        Payment: ${CS.escapeHtml(order.paymentMethod)}, ${paymentLabel(order)}${order.mpesaReceipt ? ` (M-Pesa receipt ${CS.escapeHtml(order.mpesaReceipt)})` : ""}<br>
        Delivery: ${CS.escapeHtml(order.delivery.method)}${order.delivery.location ? ", " + CS.escapeHtml(order.delivery.location) : ""}</div>
        <table><thead><tr><th>Item</th><th>Qty</th><th>Unit price</th><th>Amount</th></tr></thead><tbody>${rows}
        <tr><td colspan="3">Subtotal</td><td>${formatPrice(order.subtotal)}</td></tr>
        <tr><td colspan="3">Delivery</td><td>${formatPrice(order.deliveryCost)}</td></tr>
        <tr class="tot"><td colspan="3">Total</td><td>${formatPrice(order.total)}</td></tr></tbody></table>
        <p class="meta">Printed ${new Date().toLocaleString("en-KE")}. Thank you for shopping with CampusStationery.</p>
        </body></html>`);
    win.document.close();
}


// 12. LOAD ORDERS FROM THE DATABASE

async function loadOrders() {
    try {
        const result = await CS.request("/api/orders/mine");
        orders = result.data;
        updateOrderOverview();
        displayOrders();
    } catch (error) {
        ordersContainer.innerHTML = `
            <div class="empty-orders">
                <i class="bi bi-wifi-off"></i>
                <h3>Orders could not be loaded</h3>
                <p>${CS.escapeHtml(error.message)}</p>
            </div>`;
    }
}

if (loggedIn) {
    ordersContainer.innerHTML = `<div class="text-center py-5 text-muted"><div class="spinner-border spinner-border-sm me-2"></div>Loading your orders...</div>`;
    loadOrders();
}