// ==========================================
// CAMPUS STATIONERY - PRODUCT CATALOG
// ==========================================

// 1. PRODUCT DATA
const products = [
    {
        id: 1,
        name: "A5 Hardcover Notebook",
        category: "notebooks",
        price: 350,
        stock: 25,
        image: "https://images.unsplash.com/photo-1531346878377-a5be20888e57?w=600",
        description: "A durable hardcover notebook suitable for everyday lectures and note-taking."
    },
    {
        id: 2,
        name: "Premium Ballpoint Pens",
        category: "writing",
        price: 150,
        stock: 40,
        image: "https://images.unsplash.com/photo-1583485088034-697b5bc54ccd?w=600",
        description: "A set of smooth-writing ballpoint pens for school and office use."
    },
    {
        id: 3,
        name: "Scientific Calculator",
        category: "calculators",
        price: 1200,
        stock: 12,
        image: "https://images.unsplash.com/photo-1587145820266-a5951ee6f620?w=600",
        description: "A scientific calculator for mathematical and scientific calculations."
    },
    {
        id: 4,
        name: "A4 Printing Paper",
        category: "paper",
        price: 650,
        stock: 30,
        image: "https://images.unsplash.com/photo-1586075010923-2dd4570fb338?w=600",
        description: "Quality A4 paper suitable for printing, assignments and photocopying."
    },
    {
        id: 5,
        name: "Student Backpack",
        category: "accessories",
        price: 1800,
        stock: 8,
        image: "https://images.unsplash.com/photo-1553062407-98eeb64c6a62?w=600",
        description: "A practical backpack for carrying books, stationery and other essentials."
    },
    {
        id: 6,
        name: "Spiral Notebook",
        category: "notebooks",
        price: 200,
        stock: 0,
        image: "https://images.unsplash.com/photo-1517842645767-c639042777db?w=600",
        description: "A lightweight spiral notebook for everyday classroom notes."
    },
    {
        id: 7,
        name: "Pencil Set",
        category: "writing",
        price: 100,
        stock: 50,
        image: "https://images.unsplash.com/photo-1513364776144-60967b0f800f?w=600",
        description: "A useful pencil set for writing, drawing and sketching."
    },
    {
        id: 8,
        name: "Graphing Calculator",
        category: "calculators",
        price: 1900,
        stock: 5,
        image: "https://images.unsplash.com/photo-1564473185935-58113cba1e80?w=600",
        description: "A graphing calculator designed for advanced mathematical work."
    }
];


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
        const categoryNames = {
            notebooks: "Notebooks",
            writing: "Writing Materials",
            calculators: "Calculators",
            paper: "Paper Products",
            accessories: "Accessories"
        };

        // Card uses the catalog styles in css/style.css so it matches the rest of the site
        productCard.innerHTML = `
            <div class="catalog-product">

                <a href="product-details.html?id=${product.id}" class="catalog-product-image d-block">
                    <img src="${product.image}" alt="${product.name}" loading="lazy">
                    <span class="stock-badge ${inStock ? "in-stock" : "out-of-stock"}">
                        ${inStock ? `${product.stock} in stock` : "Out of stock"}
                    </span>
                </a>

                <div class="catalog-product-info">

                    <small>${categoryNames[product.category] || product.category}</small>

                    <h5>
                        <a href="product-details.html?id=${product.id}" class="text-reset text-decoration-none">
                            ${product.name}
                        </a>
                    </h5>

                    <p class="description mb-0">${product.description}</p>

                    <div class="catalog-product-bottom">
                        <strong class="text-nowrap">KSh ${product.price.toLocaleString("en-KE")}</strong>

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
            product.category.toLowerCase().includes(searchValue)
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
function addToCart(productId) {

    const product = products.find(p => p.id === productId);

    if (!product || product.stock === 0) {
        return;
    }

    let cart = JSON.parse(localStorage.getItem("cart")) || [];

    const existingProduct = cart.find(item => item.id === productId);

    if (existingProduct) {

        if (existingProduct.quantity >= product.stock) {
            alert("You cannot add more than the available stock.");
            return;
        }

        existingProduct.quantity++;

    } else {

        cart.push({
            id: product.id,
            name: product.name,
            price: product.price,
            image: product.image,
            quantity: 1
        });
    }

    localStorage.setItem("cart", JSON.stringify(cart));

    alert(`${product.name} added to cart!`);

    updateCartCount();
}


// 6. UPDATE CART COUNT
function updateCartCount() {

    const cartCount = document.getElementById("cartCount");

    if (!cartCount) {
        return;
    }

    const cart = JSON.parse(localStorage.getItem("cart")) || [];

    const totalItems = cart.reduce((total, item) => {
        return total + item.quantity;
    }, 0);

    cartCount.textContent = totalItems;
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
filterProducts();

updateCartCount();


// 11. LOAD LIVE PRODUCTS FROM THE DATABASE
// The list at the top is only a fallback. When the backend is running,
// products come from MySQL through GET /api/products, so changes made in
// the admin panel (new products, prices, stock) show here after a refresh.
const API_BASE = "http://localhost:5000";

function mapDatabaseProduct(row) {
    const sample = products.find(p => p.id === Number(row.id)) || {};
    return {
        id: Number(row.id),
        name: row.name,
        category: String(row.category || "accessories").toLowerCase(),
        price: Number(row.price),
        stock: Number(row.stock_quantity ?? row.stock ?? 0),
        image: row.image || sample.image || "https://images.unsplash.com/photo-1452860606245-08befc0ff44b?w=600",
        description: row.description || sample.description || ""
    };
}

fetch(API_BASE + "/api/products")
    .then(response => response.json())
    .then(result => {
        if (!result.success || !Array.isArray(result.data)) return;
        const liveProducts = result.data.map(mapDatabaseProduct);
        products.length = 0;
        products.push(...liveProducts);
        filterProducts();
    })
    .catch(() => {
        console.warn("Backend not reachable, showing sample products instead.");
    });
