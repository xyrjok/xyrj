/**
 * 渲染分类列表
 * @param {Array<Object>} categories 
 * @param {string | number | null} currentId 当前分类ID
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
 * 渲染商品列表，使用左图右文的列表样式 (新布局，已修复数据兼容性)
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
        // *** 关键修改：适配 /api/shop/ 返回的嵌套数据结构 (variants) ***
        const mainVariant = product.variants && product.variants.length > 0 ? product.variants[0] : {};
        
        // 计算总库存和总销量
        const totalSales = (product.variants || []).reduce((sum, v) => sum + (v.sales_count || 0), 0);
        const totalStock = (product.variants || []).reduce((sum, v) => sum + (v.stock || 0), 0);
        
        // 获取图片 URL (优先使用 product.image_url，然后是 variant.image_url)
        const productImg = product.image_url || mainVariant.image_url || '/assets/noimage.jpg'; 
        
        // 获取价格并格式化 (使用主要变体价格)
        const rawPrice = mainVariant.price || 0;
        const productPrice = parseFloat(rawPrice).toFixed(2);
        
        // ***************************************************************
        
        // *** 生成新的列表项 HTML 结构 (左图右文) ***
        const productHtml = `
            <a href="/product?id=${product.id}" class="product-card-item">
                <div class="product-img me-3">
                    <img src="${productImg}" alt="${product.name}" />
                </div>
                <div class="product-info">
                    <p class="mb-1 fw-bold text-truncate">${product.name}</p>
                    <small class="text-muted">库存: ${totalStock} | 销量: ${totalSales}</small>
                </div>
                <div class="product-price">
                     <span class="text-danger">¥ ${productPrice}</span>
                </div>
            </a>
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

    // ***** 修正 API 路径为 /api/shop/ *****
    const api = categoryId ? `/api/shop/products?category_id=${categoryId}` : '/api/shop/products';
    
    $.ajax({
        url: api,
        method: 'GET',
        success: function(response) {
            let products = [];
            let isSuccess = false;

            // 1. 尝试解析标准格式：{code: 0, data: {products: [...]}}
            if (response && response.code === 0 && response.data && Array.isArray(response.data.products)) {
                products = response.data.products;
                isSuccess = true;
            } 
            // 2. 尝试解析纯数组/对象格式 (兼容 /api/shop/ 返回格式)
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
        // ***** 修正 API 路径为 /api/shop/ *****
        url: '/api/shop/categories',
        method: 'GET',
        success: function(response) {
            let categories = [];
            let isSuccess = false;

            // 1. 尝试解析标准格式：{code: 0, data: {categories: [...]}}
            if (response && response.code === 0 && response.data && Array.isArray(response.data.categories)) {
                categories = response.data.categories;
                isSuccess = true;
            } 
            // 2. 尝试解析纯数组/对象格式 (兼容 /api/shop/ 返回格式)
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

// 页面加载完成后执行
$(document).ready(function() {
    loadCategories();
    loadProducts();
});
