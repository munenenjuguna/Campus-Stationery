// ======================================
// PRODUCT DETAILS FUNCTIONALITY
// ======================================


// PRODUCT DATA
// The product is loaded from the database (see the bottom of this file).

// GET PRODUCT ID FROM URL

const urlParams = new URLSearchParams(window.location.search);

const productId = Number(urlParams.get("id"));


// SELECTED PRODUCT (filled in after loading)

let selectedProduct = null;


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
                        src="${CS.escapeHtml(selectedProduct.image)}"
                        alt="${CS.escapeHtml(selectedProduct.name)}"
                    >

                </div>

            </div>


            <!-- PRODUCT INFORMATION -->

            <div class="col-lg-6">

                <div class="details-info">

                    <span class="details-category">

                        ${CS.escapeHtml(selectedProduct.categoryName.toUpperCase())}

                    </span>


                    <h1>${CS.escapeHtml(selectedProduct.name)}</h1>


                    <div class="details-price">

                        ${CS.formatPrice(selectedProduct.price)}

                    </div>


                    <p class="details-description">

                        ${CS.escapeHtml(selectedProduct.description)}

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

        if (!Number.isInteger(quantity) || quantity < 1 || quantity > selectedProduct.stock) {
            CS.toast(`Please enter a quantity between 1 and ${selectedProduct.stock}.`, "error");
            quantityInput.focus();
            return;
        }

        // Shared cart helper: checks stock against what is already in the cart
        CS.addToCart(selectedProduct, quantity);

    });

}


// LOAD THIS PRODUCT FROM THE DATABASE

productDetails.innerHTML = `
    <div class="text-center py-5 text-muted">
        <div class="spinner-border spinner-border-sm me-2"></div> Loading product...
    </div>`;

if (!Number.isInteger(productId) || productId < 1) {
    displayProductDetails();
} else {
    CS.request(`/api/products/${productId}`)
        .then(result => {
            const row = result.data;
            selectedProduct = {
                id: Number(row.id),
                name: row.name,
                category: row.category,
                categoryName: row.category_name || row.category,
                price: Number(row.price),
                stock: Number(row.stock_quantity || 0),
                image: row.image || "https://images.unsplash.com/photo-1452860606245-08befc0ff44b?w=600",
                description: row.description || ""
            };
            document.title = `${selectedProduct.name} | CampusStationery`;
            displayProductDetails();
        })
        .catch(() => displayProductDetails());
}
