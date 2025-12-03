/* Luna-Bootstrap Main JS (main-luna-bs.js) */

const appState = {
    products: [],
    categories: [],
    currentVariant: null,
    tipsMsg: {
        least_one: "购买数量不能小于 1",
        exceeds: "库存不足",
        exceeds_limit: "已超过限购数量"
    }
};

// --- Utility Functions ---

const getUrlParam = (name) => new URLSearchParams(window.location.search).get(name);

// Get SVG/Icon for Pay Methods (Simplified)
const getPayIcon = (type) => {
    // Using Font Awesome classes as they are available via all.min.css
    const iconMap = {
        alipay_f2f: '<i class="fab fa-alipay text-primary"></i>',
        wxpay: '<i class="fab fa-weixin text-success"></i>',
        // Add more if needed, e.g., 'qqpay': '<i class="fab fa-qq"></i>'
    };
    return iconMap[type] || '<i class="fas fa-money-bill-wave text-secondary"></i>';
};

// --- Index Page Logic ---
const initIndexPage = () => {
    if (!document.getElementById('category-list')) return;

    // 1. Fetch data
    $.when(
        $.get("/api/shop/products"),
        $.get("/api/shop/categories")
    ).done((productsRes, categoriesRes) => {
        const rawProducts = productsRes[0];
        const categories = categoriesRes[0];
        
        // Data Transformation: Calculate minPrice and totalStock for display
        appState.products = rawProducts.map(p => {
            const minPrice = p.variants.length > 0 ? Math.min(...p.variants.map(v => parseFloat(v.price))) : 0;
            const totalStock = p.variants.reduce((sum, v) => sum + (v.auto_delivery === 1 ? parseInt(v.stock) : (v.auto_delivery === 0 ? parseInt(v.stock) : 0)), 0);
            return {
                ...p,
                min_price: minPrice.toFixed(2),
                total_stock: totalStock
            };
        });
        
        appState.categories = categories.map(c => {
            const products = appState.products.filter(p => p.category_id === c.id);
            return {
                ...c,
                products: products,
                product_count: products.length
            };
        });

        renderCategories();
        renderProducts(appState.products); 

    }).fail(() => {
        $('#category-list, #product-list').html('<p class="text-danger p-3">商品或分类加载失败。</p>');
    });


    // 2. Render Functions
    const renderCategories = () => {
        const container = $('#category-list');
        container.empty();
        
        const allCategory = { id: 0, name: '全部商品', product_count: appState.products.length };
        
        const allHtml = $(`<div class="cate-box active" data-id="0">
            <p>${allCategory.name}</p>
            <div>商品数量：${allCategory.product_count}</div>
        </div>`);
        container.append(allHtml);

        appState.categories.forEach(c => {
            const itemHtml = $(`<div class="cate-box" data-id="${c.id}">
                <p>${c.name}</p>
                <div>商品数量：${c.product_count}</div>
            </div>`);
            container.append(itemHtml);
        });

        // Event listener for category clicks
        $('.cate-box').on('click', function() {
            $('.cate-box').removeClass('active');
            $(this).addClass('active');
            const categoryId = $(this).data('id');
            
            const filteredProducts = categoryId === 0
                ? appState.products
                : appState.categories.find(c => c.id === categoryId)?.products || [];
            
            renderProducts(filteredProducts);
        });
    };

    const renderProducts = (products) => {
        const container = $('#product-list');
        container.empty();

        if (products.length === 0) {
            container.html('<div class="col-12"><p class="text-muted p-3">该分类下没有商品。</p></div>');
            return;
        }

        products.forEach(p => {
            const html = `
                <div class="col-6 col-md-4 col-lg-3">
                    <a href="product.html?id=${p.id}" class="goods-box">
                        <div class="picture">
                            <img src="${p.image_url || '/assets/noimage.jpg'}" onerror="this.src='/assets/noimage.jpg'" alt="${p.name}">
                        </div>
                        <div class="msg">
                            <div class="goods-name" title="${p.name}">${p.name}</div>
                            <div class="goods-price">￥${p.min_price}</div>
                            <div class="goods-num">库存：${p.total_stock}件</div>
                        </div>
                    </a>
                </div>
            `;
            container.append(html);
        });
    };
};

// --- Product Page Logic ---
const initProductPage = () => {
    const productId = getUrlParam('id');
    const orderNumberInput = $('#orderNumber');
    const finalPriceSpan = $('#final-price');
    const variantSelector = $('#variant-selector');

    let currentPrice = 0;
    let currentStock = 0;
    let currentWholesaleConfig = null;

    if (!document.getElementById('product-detail-box')) return;

    // 1. Fetch Product Detail
    if (productId) {
        $.get(`/api/shop/product?id=${productId}`)
            .done(renderProductDetail)
            .fail(() => {
                $('#product-name').text('商品加载失败');
                $('#product-detail-box').html('<p class="alert alert-danger">商品加载失败或已下架。</p>');
            });
    }

    // 2. Render Product Detail
    const renderProductDetail = (data) => {
        appState.products = data; 
        
        $('#product-name').html(data.name);
        $('#product-description').html(data.description);
        $('#product-image').attr('src', data.image_url || '/assets/noimage.jpg').attr('data-original', data.image_url || '/assets/noimage.jpg');
        
        // 渲染规格选择器
        if (data.variants && data.variants.length > 0) {
            $('#variant-selection-area').show();
            let optionsHtml = '';
            data.variants.forEach(v => {
                const stockDisplay = v.auto_delivery == 1 ? ` (库存: ${v.stock})` : ' (手动发货)';
                optionsHtml += `<option value="${v.id}" data-autodelivery="${v.auto_delivery}" data-stock="${v.stock}">${v.name} (¥${v.price})${stockDisplay}</option>`;
            });
            variantSelector.html(optionsHtml);
            
            if (data.variants[0]) {
                const firstVariant = data.variants[0];
                $('#variant-id-input').val(firstVariant.id);
                updatePriceAndStock(firstVariant);
            }
        }
        
        // 渲染支付方式
        const payways = [
            { id: 'alipay_f2f', name: '支付宝支付', type: 'alipay_f2f' },
            { id: 'wxpay', name: '微信支付', type: 'wxpay' }
        ];
        let payHtml = '';
        payways.forEach((way, index) => {
            const icon = getPayIcon(way.type);
            const selectClass = index === 0 ? 'pay-select' : '';
            payHtml += `
                <div class="pay-type ${selectClass}" data-id="${way.id}" data-type="${way.type}">
                    ${icon} <span>${way.name}</span>
                </div>
            `;
        });
        $('#payway-container').html(payHtml);
        $('#payway-input').val(payways[0]?.id || '');

        // Attach Payway click handler
        $('#payway-container').on('click', '.pay-type', function() {
            $('#payway-container .pay-type').removeClass('pay-select');
            $(this).addClass('pay-select');
            $('#payway-input').val($(this).data('id'));
        });

        // Attach Variant Change handler
        variantSelector.on('change', function() {
            const selectedId = $(this).val();
            const variant = appState.products.variants.find(v => v.id == selectedId);
            if (variant) {
                updatePriceAndStock(variant);
            }
        });
    };


    // 3. Update Price and Stock (Core Logic)
    const updatePriceAndStock = (variant) => {
        appState.currentVariant = variant;
        currentStock = parseInt(variant.stock) || 0;
        currentPrice = parseFloat(variant.price);
        currentWholesaleConfig = variant.wholesale_config;
        const currentAutoDelivery = parseInt(variant.auto_delivery);

        // Update badges
        const stockText = currentAutoDelivery === 1 ? `库存: ${currentStock}` : '手动发货';
        const typeText = currentAutoDelivery === 1 ? '自动发货' : '手动发货';
        $('#delivery-type').removeClass().addClass('badge ms-2 ' + (currentAutoDelivery === 1 ? 'bg-success' : 'bg-warning')).text(typeText);
        $('#stock-info').removeClass().addClass('badge ms-2 ' + (currentStock > 0 ? 'bg-info' : 'bg-danger')).text(stockText);

        // Reset quantity if necessary
        let currentQuantity = parseInt(orderNumberInput.val()) || 1;
        if (currentQuantity > currentStock && currentStock > 0) {
            currentQuantity = 1;
            orderNumberInput.val(1);
        } else if (currentStock === 0 && currentAutoDelivery === 1) {
            orderNumberInput.val(0);
        } else if (currentQuantity === 0) {
            orderNumberInput.val(1);
        }

        applyPriceCalculation(currentQuantity);
    };

    const applyPriceCalculation = (quantity) => {
        let price = currentPrice;
        let discountText = '';
        
        // 1. Check Wholesale Price
        if (currentWholesaleConfig) {
            const config = JSON.parse(currentWholesaleConfig);
            config.sort((a, b) => b.qty - a.qty);
            for (const rule of config) {
                if (quantity >= rule.qty) {
                    price = parseFloat(rule.price);
                    discountText = `(单价: ¥${price.toFixed(2)})`;
                    break;
                }
            }
        } 
        
        finalPriceSpan.text((price * quantity).toFixed(2));
        $('#wholesale-text').text(discountText);
    };


    // 4. Quantity Stepper Logic
    const changeQuantity = (delta) => {
        let quantity = parseInt(orderNumberInput.val()) || 1;
        quantity += delta;
        
        if (quantity < 1) {
            quantity = 1;
            alert(appState.tipsMsg.least_one);
        }
        
        if (quantity > currentStock && currentStock > 0) {
            quantity -= delta; 
            alert(appState.tipsMsg.exceeds);
        } else if (currentStock === 0 && appState.currentVariant?.auto_delivery == 1) {
             alert(appState.tipsMsg.exceeds);
             quantity = 0;
        }

        orderNumberInput.val(quantity);
        applyPriceCalculation(quantity);
    };

    $('#num-sub').on('click', () => changeQuantity(-1));
    $('#num-add').on('click', () => changeQuantity(1));
    orderNumberInput.on('change', function() {
        let val = parseInt($(this).val()) || 1;
        if (val < 1) val = 1;
        if (val > currentStock && currentStock > 0) {
            val = currentStock;
            alert(appState.tipsMsg.exceeds);
        } else if (currentStock === 0 && appState.currentVariant?.auto_delivery == 1) {
            val = 0;
        }
        $(this).val(val);
        applyPriceCalculation(val);
    });
    
    // 5. Form Submission 
    $('#buy-form').on('submit', function(e) {
        e.preventDefault();
        
        const formData = new FormData(this);
        const payload = {
            variant_id: $('#variant-selector').val(),
            quantity: parseInt(formData.get('quantity')),
            contact: formData.get('contact'),
            query_password: formData.get('query_password'),
            payment_method: $('#payway-input').val(),
            card_id: null 
        };

        if (payload.quantity <= 0) return alert(appState.tipsMsg.least_one);
        if (!payload.payment_method) return alert("请选择支付方式");

        const submitBtn = $('#submit-button span');
        submitBtn.text('订单创建中...');

        $.ajax({
            url: '/api/shop/order/create',
            type: 'POST',
            contentType: 'application/json',
            data: JSON.stringify(payload),
            success: function (res) {
                localStorage.setItem('userContact', payload.contact);
                localStorage.setItem('userPassword', payload.query_password);
                
                window.location.href = `pay.html?order_id=${res.order_id}&method=${res.payment_method}`;
            },
            error: function(xhr) {
                const errorMsg = xhr.responseJSON?.error || '订单创建失败，请稍后再试。';
                alert(errorMsg);
                $('#submit-button').attr('disabled', false);
                submitBtn.text('立即购买');
            }
        });
    });
};

// --- Initialization ---
$(document).ready(() => {
    initIndexPage(); 
    initProductPage(); 
    // The functions check for their respective DOM elements and execute their logic.
});
