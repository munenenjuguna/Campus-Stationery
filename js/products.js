// ==========================================
// CAMPUS STATIONERY - PRODUCT CATALOG
// ==========================================

// 1. PRODUCT DATA
// Filled from the database through GET /api/products (see section 8 at the bottom).
const products = [];
let productsLoaded = false;

// 2. GET HTML ELEMENTS
const productContainer = document.getElementById("productContainer");
const productSearch = document.getElementById("productSearch");
const priceFilter = document.getElementById("priceFilter");
const sortProducts = document.getElementById("sortProducts");
const productCount = document.getElementById("productCount");
const emptyState = document.getElementById("emptyState");
const resetFilters = document.getElementById("resetFilters");


// 3. DISPLAY PRODUCTS
function displayProducts(productList) {

    productContainer.innerHTML = "";

    // Update number of products displayed
    productCount.textContent = productList.length;

    // Show empty state if no products match
    if (productList.length === 0) {
        emptyState.style.display = "block";
        return;
    }

    emptyState.style.display = "none";

    productList.forEach(product => {

        const productCard = document.createElement("div");

        productCard.className = "col-sm-6 col-xl-4 mb-4";

        const inStock = product.stock > 0;
        const lowStock = inStock && product.stock <= 10;
        const name = CS.escapeHtml(product.name);

        // Card uses the catalog styles in css/style.css so it matches the rest of the site
        productCard.innerHTML = `
            <div class="catalog-product">

                <a href="product-details.html?id=${product.id}" class="catalog-product-image d-block">
                    <img src="${CS.escapeHtml(product.image)}" alt="${name}" loading="lazy">
                    <span class="stock-badge ${inStock ? (lowStock ? "low-stock" : "in-stock") : "out-of-stock"}">
                        ${inStock ? (lowStock ? `Only ${product.stock} left` : `${product.stock} in stock`) : "Out of stock"}
                    </span>
                </a>

                <div class="catalog-product-info">

                    <small>${CS.escapeHtml(product.categoryName)}</small>

                    <h5>
                        <a href="product-details.html?id=${product.id}" class="text-reset text-decoration-none">
                            ${name}
                        </a>
                    </h5>

                    <p class="description mb-0">${CS.escapeHtml(product.description)}</p>

                    <div class="catalog-product-bottom">
                        <strong class="text-nowrap">${CS.formatPrice(product.price)}</strong>

                        <button
                            class="catalog-add-btn add-to-cart-btn text-nowrap"
                            data-id="${product.id}"
                            ${inStock ? "" : "disabled"}
                        >
                            <i class="bi ${inStock ? "bi-bag-plus" : "bi-x-circle"}"></i>
                            ${inStock ? "Add to Cart" : "Sold Out"}
                        </button>
                    </div>

                </div>
            </div>
        `;

        productContainer.appendChild(productCard);
    });
}


// 4. FILTER AND SORT PRODUCTS
function filterProducts() {

    let filteredProducts = [...products];

    // SEARCH FILTER
    const searchValue = productSearch.value.toLowerCase().trim();

    if (searchValue !== "") {

        filteredProducts = filteredProducts.filter(product =>
            product.name.toLowerCase().includes(searchValue) ||
            product.categoryName.toLowerCase().includes(searchValue) ||
            product.description.toLowerCase().includes(searchValue)
        );
    }


    // CATEGORY FILTER
    const selectedCategory =
        document.querySelector('input[name="category"]:checked');

    if (selectedCategory && selectedCategory.value !== "all") {

        filteredProducts = filteredProducts.filter(product =>
            product.category === selectedCategory.value
        );
    }


    // PRICE FILTER
    const selectedPrice = priceFilter.value;

    if (selectedPrice === "under500") {

        filteredProducts = filteredProducts.filter(product =>
            product.price < 500
        );

    } else if (selectedPrice === "500-1000") {

        filteredProducts = filteredProducts.filter(product =>
            product.price >= 500 && product.price <= 1000
        );

    } else if (selectedPrice === "1000-2000") {

        filteredProducts = filteredProducts.filter(product =>
            product.price > 1000 && product.price <= 2000
        );

    } else if (selectedPrice === "above2000") {

        filteredProducts = filteredProducts.filter(product =>
            product.price > 2000
        );
    }


    // SORT PRODUCTS
    const sortValue = sortProducts.value;

    if (sortValue === "low-high") {

        filteredProducts.sort((a, b) => a.price - b.price);

    } else if (sortValue === "high-low") {

        filteredProducts.sort((a, b) => b.price - a.price);

    } else if (sortValue === "name") {

        filteredProducts.sort((a, b) =>
            a.name.localeCompare(b.name)
        );
    }

    displayProducts(filteredProducts);
}


// 5. ADD PRODUCTS TO CART
// Uses the shared cart in js/api.js, which never lets the quantity go over the stock available.
function addToCart(productId) {
    const product = products.find(p => p.id === productId);
    CS.addToCart(product, 1);
}


// 7. HANDLE ADD TO CART BUTTON CLICKS
productContainer.addEventListener("click", function(event) {

    const button = event.target.closest(".add-to-cart-btn");

    if (button) {

        const productId = Number(button.dataset.id);

        addToCart(productId);
    }
});


// 8. EVENT LISTENERS

productSearch.addEventListener("input", filterProducts);

priceFilter.addEventListener("change", filterProducts);

sortProducts.addEventListener("change", filterProducts);


// Category filter listeners
document.querySelectorAll('input[name="category"]').forEach(radio => {

    radio.addEventListener("change", filterProducts);

});


// Reset all filters
resetFilters.addEventListener("click", function() {

    productSearch.value = "";

    priceFilter.value = "all";

    sortProducts.value = "featured";

    document.querySelector('input[name="category"][value="all"]').checked = true;

    filterProducts();
});


// 9. READ CATEGORY FROM URL
const urlParams = new URLSearchParams(window.location.search);

const categoryFromURL = urlParams.get("category");

const validCategories = [
    "notebooks",
    "writing",
    "calculators",
    "paper",
    "accessories"
];

if (categoryFromURL && validCategories.includes(categoryFromURL)) {

    const categoryRadio = document.querySelector(
        `input[name="category"][value="${categoryFromURL}"]`
    );

    if (categoryRadio) {
        categoryRadio.checked = true;
    }
}


// 10. INITIAL DISPLAY
// 8. LOAD PRODUCTS FROM THE DATABASE
// Changes made in the admin panel (new products, prices, stock) show here after a refresh.
function mapDatabaseProduct(row) {
    return {
        id: Number(row.id),
        name: row.name,
        category: row.category,
        categoryName: row.category_name || row.category,
        price: Number(row.price),
        stock: Number(row.stock_quantity || 0),
        image: row.image || "https://images.unsplash.com/photo-1452860606245-08befc0ff44b?w=600",
        description: row.description || ""
    };
}

// Opening products.html?category=notebooks (from the home page) pre-selects that category
const startCategory = new URLSearchParams(location.search).get("category");
if (startCategory) {
    const radio = document.querySelector(`input[name="category"][value="${CSS.escape(startCategory)}"]`);
    if (radio) radio.checked = true;
}

productContainer.innerHTML = `
    <div class="col-12 text-center py-5 text-muted">
        <div class="spinner-border spinner-border-sm me-2"></div> Loading products...
    </div>`;

CS.request("/api/products")
    .then(result => {
        products.push(...result.data.map(mapDatabaseProduct));
        productsLoaded = true;
        filterProducts();
    })
    .catch(error => {
        productCount.textContent = 0;
        productContainer.innerHTML = `
            <div class="col-12">
                <div class="empty-state">
                    <i class="bi bi-wifi-off"></i>
                    <h4>Products could not be loaded</h4>
                    <p>${CS.escapeHtml(error.message)}</p>
                    <button class="btn-primary-custom border-0" onclick="location.reload()">Try again</button>
                </div>
            </div>`;
    });
