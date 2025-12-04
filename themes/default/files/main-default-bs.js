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

/**
 * 动态更新页面标题
 */
function updatePageTitle(siteName) {
    const currentPath = window.location.pathname.split('/').pop() || 'index.html';
    let title = siteName;
    
    if (currentPath === 'index.html' || currentPath === '') {
        title += ' - 首页';
    } else if (currentPath === 'orders.html') {
        title = '订单查询 - ' + siteName;
    } else if (currentPath === 'articles.html') {
        title = '文章列表 - ' + siteName;
    } else if (currentPath === 'pay.html') { // Assuming there is a pay.html
        title = '支付中心 - ' + siteName;
    }
    // product.html 和 article.html 的标题由各自页面脚本处理
    
    document.title = title;
}

/**
 * 加载网站配置 (使用 /api/shop/config 接口)
 */
function loadGlobalConfig() {
    $.ajax({
        url: '/api/shop/config',
        method: 'GET',
        success: function(config) {
            // 确保配置数据是对象
            if (config && typeof config === 'object') {
                const siteName = config.site_name || '夏雨店铺'; // 使用默认值
                
                // 1. 更新页面标题
                updatePageTitle(siteName);
                
                // 2. 渲染 Header 和 Footer，传入 siteName
                if (typeof renderHeader === 'function') {
                    // 从 config 中获取 site_logo，如果没设置则为空
                    const siteLogo = config.site_logo || ''; 
                    // 传入两个参数
                    renderHeader(siteName, siteLogo);
                }
                if (typeof renderFooter === 'function') {
                    renderFooter(siteName);
                }
            } else {
                 console.warn('Config API returned invalid data.');
            }
        },
        error: function() {
            console.error('Failed to load site configuration. Rendering with default name.');
            const defaultName = '我的商店';
            // 即使加载失败，也尝试渲染默认名称的 Header/Footer
            if (typeof renderHeader === 'function') {
                renderHeader(defaultName);
            }
            if (typeof renderFooter === 'function') {
                renderFooter(defaultName);
            }
        }
    });
}

$(document).ready(function() {
    loadGlobalConfig(); // 新增：加载配置并渲染 Header/Footer
    
    // 只有首页才需要加载分类和商品
    const currentPath = window.location.pathname.split('/').pop() || 'index.html';
    if (currentPath === 'index.html' || currentPath === '') {
        loadCategories();
        loadProducts();
    }
});
