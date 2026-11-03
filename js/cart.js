// ==========================================
// CAMPUS STATIONERY - SHOPPING CART
// ==========================================


// 1. GET CART FROM LOCAL STORAGE

let cart = JSON.parse(localStorage.getItem("cart")) || [];


// 2. GET HTML ELEMENTS

const cartItemsContainer = document.getElementById("cartItems");
const emptyCart = document.getElementById("emptyCart");

const cartSubtotal = document.getElementById("cartSubtotal");
const cartTotal = document.getElementById("cartTotal");

const itemsCount = document.getElementById("itemsCount");
const cartCount = document.getElementById("cartCount");

const checkoutBtn = document.getElementById("checkoutBtn");


// 3. SAVE CART TO LOCAL STORAGE

function saveCart() {

    localStorage.setItem("cart", JSON.stringify(cart));

}


// 4. FORMAT PRICE

function formatPrice(price) {

    return `KSh ${price.toLocaleString("en-KE")}`;

}


// 5. UPDATE CART COUNT

function updateCartCount() {

    const totalItems = cart.reduce((total, item) => {

        return total + item.quantity;

    }, 0);

    if (cartCount) {
        cartCount.textContent = totalItems;
    }

    if (itemsCount) {
        itemsCount.textContent =
            `${totalItems} ${totalItems === 1 ? "item" : "items"}`;
    }

}


// 6. DISPLAY CART ITEMS

function displayCart() {

    cartItemsContainer.innerHTML = "";

    // Check if cart is empty

    if (cart.length === 0) {

        emptyCart.style.display = "block";

        cartSubtotal.textContent = formatPrice(0);
        cartTotal.textContent = formatPrice(0);

        checkoutBtn.style.pointerEvents = "none";
        checkoutBtn.style.opacity = "0.5";

        updateCartCount();

        return;
    }

    emptyCart.style.display = "none";

    checkoutBtn.style.pointerEvents = "auto";
    checkoutBtn.style.opacity = "1";


    // Display each cart item

    cart.forEach(item => {

        const itemSubtotal = item.price * item.quantity;

        const cartItem = document.createElement("div");

        cartItem.className = "cart-item";

        cartItem.innerHTML = `

            <img 
                src="${item.image}" 
                alt="${item.name}"
                class="cart-item-image"
            >

            <div class="cart-item-details">

                <h5>${item.name}</h5>

                <p>${formatPrice(item.price)} each</p>

                <div class="cart-quantity">

                    <button 
                        class="quantity-btn"
                        data-id="${item.id}"
                        data-action="decrease"
                        aria-label="Decrease quantity"
                    >
                        -
                    </button>

                    <span>${item.quantity}</span>

                    <button 
                        class="quantity-btn"
                        data-id="${item.id}"
                        data-action="increase"
                        aria-label="Increase quantity"
                    >
                        +
                    </button>

                </div>

                <button 
                    class="remove-item"
                    data-id="${item.id}"
                >
                    <i class="bi bi-trash"></i>
                    Remove
                </button>

            </div>

            <div class="cart-item-subtotal">

                ${formatPrice(itemSubtotal)}

            </div>

        `;

        cartItemsContainer.appendChild(cartItem);

    });


    // Calculate total

    calculateTotal();

    updateCartCount();

}


// 7. CALCULATE TOTAL

function calculateTotal() {

    const subtotal = cart.reduce((total, item) => {

        return total + (item.price * item.quantity);

    }, 0);

    cartSubtotal.textContent = formatPrice(subtotal);

    // Delivery is not included yet
    cartTotal.textContent = formatPrice(subtotal);

}


// 8. CHANGE PRODUCT QUANTITY

function changeQuantity(productId, action) {

    const item = cart.find(product => product.id === productId);

    if (!item) {
        return;
    }

    if (action === "increase") {

        item.quantity++;

    } else if (action === "decrease") {

        item.quantity--;

        // Remove item if quantity reaches zero

        if (item.quantity <= 0) {

            cart = cart.filter(product => product.id !== productId);

        }

    }

    saveCart();

    displayCart();

}


// 9. REMOVE PRODUCT FROM CART

function removeItem(productId) {

    cart = cart.filter(item => item.id !== productId);

    saveCart();

    displayCart();

}


// 10. HANDLE BUTTON CLICKS

cartItemsContainer.addEventListener("click", function(event) {

    // Quantity buttons

    const quantityButton = event.target.closest(".quantity-btn");

    if (quantityButton) {

        const productId = Number(quantityButton.dataset.id);

        const action = quantityButton.dataset.action;

        changeQuantity(productId, action);

        return;
    }


    // Remove buttons

    const removeButton = event.target.closest(".remove-item");

    if (removeButton) {

        const productId = Number(removeButton.dataset.id);

        removeItem(productId);

    }

});


// 11. INITIAL DISPLAY

displayCart();