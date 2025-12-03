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
 * 渲染商品列表，使用左图右文的列表样式
 * @param {Array<Object>} products 
 * @param {string | number | null} categoryId 
 */
function renderProductList(products, categoryId) {
    const listContainer = $('#product-list');
    listContainer.empty();

    if (products.length === 0) {
        listContainer.append('<p class="text-center text-muted p-3">当前分类下暂无商品</p>');
        return;
    }

    products.forEach(product => {
        // 使用 product.img，如果不存在则使用 /assets/noimage.jpg 
        const productImg = product.img || '/assets/noimage.jpg'; 
        
        // 格式化价格，确保是两位小数
        const productPrice = parseFloat(product.price).toFixed(2);
        
        // *** 生成新的列表项 HTML 结构 (左图右文) ***
        const productHtml = `
            <a href="/product?id=${product.id}" class="product-card-item">
                <div class="product-img me-3">
                    <img src="${productImg}" alt="${product.name}" />
                </div>
                <div class="product-info">
                    <p class="mb-1 fw-bold text-truncate">${product.name}</p>
                    <small class="text-muted">库存: ${product.stock} | 销量: ${product.sales}</small>
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
 * 加载商品数据
 * @param {string | number | null} categoryId 
 */
function loadProducts(categoryId = null) {
    const listContainer = $('#product-list');
    listContainer.empty().append('<p class="text-center text-muted p-3">商品数据加载中...</p>');

    // ***** 修复 API 路径 *****
    const api = categoryId ? `/api/shop/products?category_id=${categoryId}` : '/api/shop/products';
    // ************************
    
    $.ajax({
        url: api,
        method: 'GET',
        success: function(response) {
            if (response.code === 0) {
                renderProductList(response.data.products || [], categoryId);
            } else {
                listContainer.empty().append(`<p class="text-center text-danger p-3">加载失败: ${response.message}</p>`);
            }
        },
        error: function() {
            listContainer.empty().append('<p class="text-center text-danger p-3">网络错误，无法加载商品数据</p>');
        }
    });
}

/**
 * 加载分类数据
 */
function loadCategories() {
    // ***** 修复 API 路径 *****
    $.ajax({
        url: '/api/shop/categories',
        // ************************
        method: 'GET',
        success: function(response) {
            if (response.code === 0) {
                renderCategoryList(response.data.categories || [], null);
            } else {
                $('#category-list').empty().append('<p class="text-muted p-2">分类加载失败</p>');
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
