// ======================================
// PRODUCT DETAILS FUNCTIONALITY
// ======================================


// SAMPLE PRODUCT DATA

const products = [

    {
        id: 1,
        name: "A5 Hardcover Notebook",
        category: "Notebooks",
        price: 350,
        stock: 25,
        image: "https://images.unsplash.com/photo-1531346878377-a5be20888e57?w=600",
        description: "A premium A5 hardcover notebook designed for everyday academic use. Perfect for lecture notes, personal planning and assignments."
    },

    {
        id: 2,
        name: "Premium Ballpoint Pens",
        category: "Writing Materials",
        price: 150,
        stock: 40,
        image: "https://images.unsplash.com/photo-1583485088034-697b5bc54ccd?w=600",
        description: "A collection of smooth-writing ballpoint pens suitable for everyday writing, note-taking and examinations."
    },

    {
        id: 3,
        name: "Scientific Calculator",
        category: "Calculators",
        price: 1200,
        stock: 12,
        image: "https://images.unsplash.com/photo-1509228468518-180dd4864904?w=600",
        description: "A scientific calculator designed to support students with mathematical calculations and academic work."
    },

    {
        id: 4,
        name: "A4 Printing Paper",
        category: "Paper Products",
        price: 650,
        stock: 30,
        image: "https://images.unsplash.com/photo-1586075010923-2dd4570fb338?w=600",
        description: "Quality A4 printing paper suitable for assignments, printing, photocopying and everyday academic use."
    },

    {
        id: 5,
        name: "Student Backpack",
        category: "Accessories",
        price: 1800,
        stock: 8,
        image: "https://images.unsplash.com/photo-1553062407-98eeb64c6a62?w=600",
        description: "A spacious backpack designed to carry notebooks, stationery and other everyday academic essentials."
    },

    {
        id: 6,
        name: "Spiral Notebook",
        category: "Notebooks",
        price: 200,
        stock: 0,
        image: "https://images.unsplash.com/photo-1517842645767-c639042777db?w=600",
        description: "A lightweight spiral notebook ideal for lecture notes, quick reminders and everyday writing."
    },

    {
        id: 7,
        name: "Pencil Set",
        category: "Writing Materials",
        price: 100,
        stock: 50,
        image: "https://images.unsplash.com/photo-1513364776144-60967b0f800f?w=600",
        description: "A practical pencil set suitable for writing, sketching, drawing and other academic activities."
    },

    {
        id: 8,
        name: "Graphing Calculator",
        category: "Calculators",
        price: 1900,
        stock: 5,
        image: "https://images.unsplash.com/photo-1564473185935-58113cba1e80?w=600",
        description: "An advanced calculator designed to support students with graphing and mathematical operations."
    }

];


// GET PRODUCT ID FROM URL

const urlParams = new URLSearchParams(window.location.search);

const productId = Number(urlParams.get("id"));


// FIND SELECTED PRODUCT

const selectedProduct = products.find(
    product => product.id === productId
);


// HTML CONTAINER

const productDetails = document.getElementById("productDetails");


// DISPLAY PRODUCT

function displayProductDetails() {

    if (!selectedProduct) {

        productDetails.innerHTML = `
            <div class="empty-state">
                <i class="bi bi-exclamation-circle"></i>

                <h4>Product Not Found</h4>

                <p>The product you're looking for does not exist.</p>

                <a href="products.html" class="details-back-link">
                    Return to Shop
                </a>
            </div>
        `;

        return;

    }


    const available = selectedProduct.stock > 0;


    productDetails.innerHTML = `

        <div class="row g-5 align-items-center">

            <!-- PRODUCT IMAGE -->

            <div class="col-lg-6">

                <div class="details-image-container">

                    <img
                        src="${selectedProduct.image}"
                        alt="${selectedProduct.name}"
                    >

                </div>

            </div>


            <!-- PRODUCT INFORMATION -->

            <div class="col-lg-6">

                <div class="details-info">

                    <span class="details-category">

                        ${selectedProduct.category.toUpperCase()}

                    </span>


                    <h1>${selectedProduct.name}</h1>


                    <div class="details-price">

                        KSh ${selectedProduct.price.toLocaleString("en-KE")}

                    </div>


                    <p class="details-description">

                        ${selectedProduct.description}

                    </p>


                    <div class="details-stock ${available ? 'available' : 'unavailable'}">

                        <i class="bi ${available ? 'bi-check-circle-fill' : 'bi-x-circle-fill'}"></i>

                        ${available
                            ? `${selectedProduct.stock} items available`
                            : 'Currently out of stock'
                        }

                    </div>


                    <!-- QUANTITY -->

                    <div class="quantity-section">

                        <label>Quantity</label>

                        <div class="quantity-control">

                            <button id="decreaseQuantity" aria-label="Decrease quantity">
                                <i class="bi bi-dash"></i>
                            </button>

                            <input
                                type="number"
                                id="quantity"
                                value="1"
                                min="1"
                                max="${selectedProduct.stock}"
                                ${!available ? 'disabled' : ''}
                            >

                            <button id="increaseQuantity" aria-label="Increase quantity">
                                <i class="bi bi-plus"></i>
                            </button>

                        </div>

                    </div>


                    <!-- ADD TO CART -->

                    <button
                        class="details-add-btn"
                        id="addToCart"
                        ${!available ? 'disabled' : ''}
                    >

                        <i class="bi bi-bag-plus"></i>

                        ${available ? 'Add to Cart' : 'Out of Stock'}

                    </button>


                    <div class="product-extra-info">

                        <p>
                            <i class="bi bi-check-circle"></i>
                            Quality academic essentials
                        </p>

                        <p>
                            <i class="bi bi-shield-check"></i>
                            Secure ordering experience
                        </p>

                    </div>


                    <a href="products.html" class="details-back-link">

                        <i class="bi bi-arrow-left"></i>
                        Back to Products

                    </a>

                </div>

            </div>

        </div>

    `;


    setupQuantityControls();

}


// QUANTITY CONTROLS

function setupQuantityControls() {

    const quantityInput = document.getElementById("quantity");

    const decreaseButton = document.getElementById("decreaseQuantity");

    const increaseButton = document.getElementById("increaseQuantity");


    decreaseButton.addEventListener("click", () => {

        let quantity = Number(quantityInput.value);

        if (quantity > 1) {

            quantityInput.value = quantity - 1;

        }

    });


    increaseButton.addEventListener("click", () => {

        let quantity = Number(quantityInput.value);

        if (quantity < selectedProduct.stock) {

            quantityInput.value = quantity + 1;

        }

    });


    quantityInput.addEventListener("change", () => {

        let quantity = Number(quantityInput.value);

        if (!Number.isInteger(quantity) || quantity < 1) {

            quantityInput.value = 1;

        } else if (quantity > selectedProduct.stock) {

            quantityInput.value = selectedProduct.stock;

        }

    });


    document.getElementById("addToCart").addEventListener("click", () => {

        const quantity = Number(quantityInput.value);

        if (
            !Number.isInteger(quantity) ||
            quantity < 1 ||
            quantity > selectedProduct.stock
        ) {

            alert("Please enter a valid quantity.");

            return;

        }


        // GET EXISTING CART

        let cart = JSON.parse(localStorage.getItem("cart")) || [];


        // CHECK IF PRODUCT ALREADY EXISTS

        const existingProduct = cart.find(
            item => item.id === selectedProduct.id
        );


        if (existingProduct) {

            if (existingProduct.quantity + quantity > selectedProduct.stock) {

                alert("You cannot add more than the available stock.");

                return;

            }

            existingProduct.quantity += quantity;

        } else {

            cart.push({

                id: selectedProduct.id,

                name: selectedProduct.name,

                price: selectedProduct.price,

                image: selectedProduct.image,

                quantity: quantity

            });

        }


        // SAVE CART

        localStorage.setItem("cart", JSON.stringify(cart));


        alert(`${selectedProduct.name} added to your cart!`);

    });

}


// INITIALISE PAGE

displayProductDetails();