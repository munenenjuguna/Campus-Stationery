// ==========================================
// CAMPUS STATIONERY - HOME PAGE
// Shows four featured products from the database (in stock items first).
// ==========================================

const featuredContainer = document.getElementById("featuredProducts");
let featuredProducts = [];

function featuredCard(product) {
    const name = CS.escapeHtml(product.name);
    const inStock = product.stock > 0;
    return `
        <div class="col-6 col-lg-3">
            <div class="product-card">
                <a href="pages/product-details.html?id=${product.id}" class="product-image d-block">
                    <img src="${CS.escapeHtml(product.image)}" alt="${name}" loading="lazy">
                    ${inStock && product.stock <= 10 ? `<span class="product-tag">Only ${product.stock} left</span>` : ""}
                    ${!inStock ? `<span class="product-tag bg-secondary">Sold out</span>` : ""}
                </a>
                <div class="product-info">
                    <small>${CS.escapeHtml(product.categoryName)}</small>
                    <h5><a href="pages/product-details.html?id=${product.id}" class="text-reset">${name}</a></h5>
                    <div class="product-bottom">
                        <strong>${CS.formatPrice(product.price)}</strong>
                        <button class="add-cart-btn" data-id="${product.id}" aria-label="Add ${name} to cart" ${inStock ? "" : "disabled"}>
                            <i class="bi bi-plus-lg"></i>
                        </button>
                    </div>
                </div>
            </div>
        </div>`;
}

CS.request("/api/products")
    .then(result => {
        featuredProducts = result.data.map(row => ({
            id: Number(row.id),
            name: row.name,
            categoryName: row.category_name,
            price: Number(row.price),
            stock: Number(row.stock_quantity || 0),
            image: row.image || "https://images.unsplash.com/photo-1452860606245-08befc0ff44b?w=600"
        }));
        const pick = [...featuredProducts].sort((a, b) => (b.stock > 0) - (a.stock > 0)).slice(0, 4);
        featuredContainer.innerHTML = pick.map(featuredCard).join("") ||
            `<div class="col-12 text-center text-muted">New stock is on its way. Check back soon.</div>`;
    })
    .catch(error => {
        featuredContainer.innerHTML = `<div class="col-12 text-center text-muted py-4">${CS.escapeHtml(error.message)}</div>`;
    });

featuredContainer.addEventListener("click", event => {
    const button = event.target.closest(".add-cart-btn");
    if (!button) return;
    const product = featuredProducts.find(p => p.id === Number(button.dataset.id));
    CS.addToCart(product, 1);
});
