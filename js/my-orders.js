// ==========================================
// CAMPUS STATIONERY - MY ORDERS
// ==========================================


// 1. GET ORDERS FROM LOCAL STORAGE

let orders = JSON.parse(localStorage.getItem("orders")) || [];


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

    pendingOrders.textContent = orders.filter(order =>
        order.status === "Pending"
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
                src="${item.image}"
                alt="${item.name}"
                class="order-product-image"
                title="${item.name}"
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
                            ${order.items.length} product type(s)
                        </p>

                        <span class="order-total">
                            ${formatPrice(order.total)}
                        </span>

                    </div>


                    <button
                        class="view-order-btn"
                        data-id="${order.orderId}"
                    >

                        View Details
                        <i class="bi bi-arrow-right"></i>

                    </button>

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

            <img src="${item.image}" alt="${item.name}">

            <div>

                <h6>${item.name}</h6>

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

            <strong>${order.paymentMethod}</strong>

        </div>


        <div class="order-detail-row">

            <span>Delivery Method</span>

            <strong>${order.delivery.method}</strong>

        </div>


        <div class="order-detail-row">

            <span>Delivery Location</span>

            <strong>${order.delivery.location || "Campus Pickup"}</strong>

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

    `;


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

});


// 10. HANDLE ORDER FILTER

orderFilter.addEventListener("change", displayOrders);


// 11. INITIAL DISPLAY

updateOrderOverview();

displayOrders();