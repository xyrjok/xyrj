/**
 * 渲染分类列表
 * (保持不变)
 */
function renderCategoryList(categories, currentId) {
    const listContainer = $('#category-list');
    listContainer.empty();
    
    // 添加 "全部" 按钮
    const allBtn = $(`<button class="btn ${!currentId ? 'btn-primary' : 'btn-outline-primary'} me-2 mb-2" data-id="all">全部</button>`);
    listContainer.append(allBtn);

    categories.forEach(category => {
        const isActive = (category.id == currentId);
        const btn = $(`<button class="btn ${isActive ? 'btn-primary' : 'btn-outline-primary'} me-2 mb-2" data-id="${category.id}">${category.name}</button>`);
        listContainer.append(btn);
    });

    // 绑定点击事件
    listContainer.find('button').on('click', function() {
        const id = $(this).data('id');
        const newCategoryId = (id === 'all') ? null : id;
        
        // 切换激活状态
        listContainer.find('button').removeClass('btn-primary').addClass('btn-outline-primary');
        $(this).removeClass('btn-outline-primary').addClass('btn-primary');

        // 重新加载商品列表
        loadProducts(newCategoryId);
    });
}

/**
 * 渲染商品列表，使用左图右文的列表样式 (新布局和逻辑)
 * @param {Array<Object>} products 
 * @param {string | number | null} categoryId 
 */
function renderProductList(products, categoryId) {
    const listContainer = $('#product-list');
    listContainer.empty();

    if (!Array.isArray(products) || products.length === 0) {
        listContainer.append('<p class="text-center text-muted p-3">当前分类下暂无商品</p>');
        return;
    }

    products.forEach(product => {
        // *** 数据提取和计算 (适配 /api/shop/ 的嵌套结构) ***
        const mainVariant = product.variants && product.variants.length > 0 ? product.variants[0] : {};
        
        const totalSales = (product.variants || []).reduce((sum, v) => sum + (v.sales_count || 0), 0);
        const totalStock = (product.variants || []).reduce((sum, v) => sum + (v.stock || 0), 0);
        
        const productImg = product.image_url || mainVariant.image_url || '/assets/noimage.jpg'; 
        const rawPrice = mainVariant.price || 0;
        const productPrice = parseFloat(rawPrice).toFixed(2);
        
        // *** 逻辑：发货方式和按钮状态 ***
        const deliveryType = product.delivery_type || "自动发货"; 
        const isAvailable = totalStock > 0;

        const buttonClass = isAvailable ? 'btn-primary' : 'btn-secondary disabled';
        const buttonText = isAvailable ? '购买' : '缺货';
        const buttonAction = isAvailable ? `/product?id=${product.id}` : 'javascript:void(0)';
        
        // ***************************************************************
        
        // *** 关键：生成新的列表项 HTML 结构 (适配价格+按钮) ***
        const productHtml = `
            <div class="product-card-item">
                <div class="product-img me-3">
                    <img src="${productImg}" alt="${product.name}" />
                </div>
                
                <div class="product-info">
                    <a href="/product?id=${product.id}" class="text-dark d-block mb-1">
                        <p class="mb-0 text-truncate">${product.name}</p>
                    </a>
                    
                    <small class="d-block text-primary">发货方式: ${deliveryType}</small>
                    
                    <small class="d-block text-muted">库存: ${totalStock} | 销量: ${totalSales}</small>
                </div>

                <div class="ms-auto text-end d-flex flex-column justify-content-center align-items-end product-action-area">
                    <div class="product-price mb-2">
                         <span class="text-danger">¥ ${productPrice}</span>
                    </div>
                    
                    <a href="${buttonAction}" class="btn btn-sm ${buttonClass}">
                        ${buttonText}
                    </a>
                </div>
            </div>
        `;
        
        listContainer.append(productHtml);
    });
}

/**
 * 加载商品数据 (使用 /api/shop/products 接口)
 * @param {string | number | null} categoryId 
 */
function loadProducts(categoryId = null) {
    const listContainer = $('#product-list');
    listContainer.empty().append('<p class="text-center text-muted p-3">商品数据加载中...</p>');

    const api = categoryId ? `/api/shop/products?category_id=${categoryId}` : '/api/shop/products';
    
    $.ajax({
        url: api,
        method: 'GET',
        success: function(response) {
            let products = [];
            let isSuccess = false;

            if (response && response.code === 0 && response.data && Array.isArray(response.data.products)) {
                products = response.data.products;
                isSuccess = true;
            } 
            else if (response && (Array.isArray(response) || Array.isArray(response.products))) {
                products = Array.isArray(response) ? response : response.products;
                isSuccess = true;
            }
            
            if (isSuccess) {
                renderProductList(products, categoryId);
            } else {
                const errorMsg = (response && response.message) 
                    ? response.message 
                    : 'API返回数据格式错误或后端未提供具体错误信息。';

                listContainer.empty().append(`<p class="text-center text-danger p-3">加载失败: ${errorMsg}</p>`);
            }
        },
        error: function() {
            listContainer.empty().append('<p class="text-center text-danger p-3">网络错误，无法加载商品数据</p>');
        }
    });
}

/**
 * 加载分类数据 (使用 /api/shop/categories 接口)
 */
function loadCategories() {
    $.ajax({
        url: '/api/shop/categories',
        method: 'GET',
        success: function(response) {
            let categories = [];
            let isSuccess = false;

            if (response && response.code === 0 && response.data && Array.isArray(response.data.categories)) {
                categories = response.data.categories;
                isSuccess = true;
            } 
            else if (response && (Array.isArray(response) || Array.isArray(response.categories))) {
                categories = Array.isArray(response) ? response : response.categories;
                isSuccess = true;
            }
            
            if (isSuccess) {
                renderCategoryList(categories, null);
            } else {
                const errorMsg = (response && response.message) 
                    ? response.message 
                    : 'API返回数据格式错误或后端未提供具体错误信息。';
                
                $('#category-list').empty().append(`<p class="text-muted p-2">分类加载失败: ${errorMsg}</p>`);
            }
        },
        error: function() {
            $('#category-list').empty().append('<p class="text-muted p-2">网络错误，无法加载分类数据</p>');
        }
    });
}

$(document).ready(function() {
    loadCategories();
    loadProducts();
});
