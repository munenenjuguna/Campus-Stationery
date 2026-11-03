// ==========================================
// CAMPUS STATIONERY - CHECKOUT
// ==========================================


// 1. GET CART FROM LOCAL STORAGE

let cart = JSON.parse(localStorage.getItem("cart")) || [];


// 2. GET HTML ELEMENTS

const checkoutItems = document.getElementById("checkoutItems");

const checkoutSubtotal = document.getElementById("checkoutSubtotal");
const checkoutTotal = document.getElementById("checkoutTotal");

const deliveryCostElement = document.getElementById("deliveryCost");

const checkoutForm = document.getElementById("checkoutForm");

const deliveryMethod = document.getElementById("deliveryMethod");

const locationGroup = document.getElementById("locationGroup");
const locationInput = document.getElementById("location");

const orderSuccess = document.getElementById("orderSuccess");


// 3. FORMAT PRICE

function formatPrice(price) {

    return `KSh ${price.toLocaleString("en-KE")}`;

}


// 4. CALCULATE SUBTOTAL

function calculateSubtotal() {

    return cart.reduce((total, item) => {

        return total + (item.price * item.quantity);

    }, 0);

}


// 5. GET DELIVERY COST

function getDeliveryCost() {

    if (deliveryMethod.value === "Campus Delivery") {

        return 100;

    }

    return 0;

}


// 6. DISPLAY ORDER SUMMARY

function displayCheckoutSummary() {

    checkoutItems.innerHTML = "";

    if (cart.length === 0) {

        checkoutItems.innerHTML = `
            <p>Your cart is empty.</p>

            <a href="products.html" class="btn btn-primary">
                Browse Products
            </a>
        `;

        checkoutForm.style.display = "none";

        checkoutSubtotal.textContent = formatPrice(0);
        checkoutTotal.textContent = formatPrice(0);
        deliveryCostElement.textContent = formatPrice(0);

        return;
    }


    // Display each product

    cart.forEach(item => {

        const product = document.createElement("div");

        product.className = "checkout-product";

        product.innerHTML = `

            <img src="${item.image}" alt="${item.name}">

            <div class="checkout-product-details">

                <h6>${item.name}</h6>

                <p>Quantity: ${item.quantity}</p>

            </div>

            <div class="checkout-product-price">

                ${formatPrice(item.price * item.quantity)}

            </div>

        `;

        checkoutItems.appendChild(product);

    });


    calculateCheckoutTotal();

}


// 7. CALCULATE CHECKOUT TOTAL

function calculateCheckoutTotal() {

    const subtotal = calculateSubtotal();

    const delivery = getDeliveryCost();

    const total = subtotal + delivery;

    checkoutSubtotal.textContent = formatPrice(subtotal);

    deliveryCostElement.textContent = formatPrice(delivery);

    checkoutTotal.textContent = formatPrice(total);

}


// 8. SHOW DELIVERY LOCATION FIELD

deliveryMethod.addEventListener("change", function() {

    if (deliveryMethod.value === "Campus Delivery") {

        locationGroup.style.display = "block";

        locationInput.required = true;

    } else {

        locationGroup.style.display = "none";

        locationInput.required = false;

        locationInput.value = "";

    }

    calculateCheckoutTotal();

});


// 9. HANDLE ORDER SUBMISSION

checkoutForm.addEventListener("submit", function(event) {

    event.preventDefault();


    // Prevent submitting an empty cart

    if (cart.length === 0) {

        alert("Your cart is empty.");

        return;

    }


    // Get customer details

    const fullName = document.getElementById("fullName").value.trim();

    const email = document.getElementById("email").value.trim();

    const phone = document.getElementById("phone").value.trim();


    // Get selected payment method

    const paymentMethod = document.querySelector(
        'input[name="paymentMethod"]:checked'
    );


    if (!paymentMethod) {

        alert("Please select a payment method.");

        return;

    }


    // Create order object

    const order = {

        orderId: "CS-" + Date.now(),

        customer: {

            fullName: fullName,

            email: email,

            phone: phone

        },

        delivery: {

            method: deliveryMethod.value,

            location: locationInput.value.trim()

        },

        paymentMethod: paymentMethod.value,

        items: [...cart],

        subtotal: calculateSubtotal(),

        deliveryCost: getDeliveryCost(),

        total: calculateSubtotal() + getDeliveryCost(),

        orderDate: new Date().toISOString(),

        status: "Pending"

    };


    // Retrieve existing orders

    let orders = JSON.parse(localStorage.getItem("orders")) || [];


    // Save new order

    orders.push(order);

    localStorage.setItem("orders", JSON.stringify(orders));


    // Clear shopping cart

    localStorage.removeItem("cart");

    cart = [];


    // Hide checkout form and summary

    checkoutForm.style.display = "none";


    // Display success message

    document.getElementById("orderReference").textContent = order.orderId;

    orderSuccess.style.display = "block";


    // Hide order summary

    document.querySelector(".checkout-summary").style.display = "none";

});


// 10. INITIAL DISPLAY

displayCheckoutSummary();