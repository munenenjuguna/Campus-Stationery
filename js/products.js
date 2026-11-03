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
    productCount.textContent = `${productList.length} products found`;

    // Show empty state if no products match
    if (productList.length === 0) {
        emptyState.style.display = "block";
        return;
    }

    emptyState.style.display = "none";

    productList.forEach(product => {

        const productCard = document.createElement("div");

        productCard.className = "col-md-6 col-lg-4 col-xl-3 mb-4";

        productCard.innerHTML = `
            <div class="product-card h-100">

                <a href="product-details.html?id=${product.id}">
                    <img 
                        src="${product.image}" 
                        alt="${product.name}"
                        class="product-image"
                    >
                </a>

                <div class="product-card-body">

                    <p class="product-category">
                        ${product.category}
                    </p>

                    <h5>
                        <a 
                            href="product-details.html?id=${product.id}"
                            class="product-title-link"
                        >
                            ${product.name}
                        </a>
                    </h5>

                    <p class="product-description">
                        ${product.description}
                    </p>

                    <h5 class="product-price">
                        KSh ${product.price.toLocaleString("en-KE")}
                    </h5>

                    <p class="${product.stock > 0 ? "text-success" : "text-danger"}">
                        ${
                            product.stock > 0
                            ? `${product.stock} available`
                            : "Out of stock"
                        }
                    </p>

                    <button 
                        class="btn btn-primary w-100 add-to-cart-btn"
                        data-id="${product.id}"
                        ${product.stock === 0 ? "disabled" : ""}
                    >
                        ${
                            product.stock > 0
                            ? "Add to Cart"
                            : "Out of Stock"
                        }
                    </button>

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