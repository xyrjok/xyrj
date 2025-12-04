/**
 * themes/default/files/main-default-bs.js
 * 默认主题的核心逻辑，负责商品加载、配置读取和页头渲染
 */

/**
 * 渲染分类列表 (页面中部的按钮栏)
 */
function renderCategoryList(categories, currentId) {
    const listContainer = $('#category-list');
    listContainer.empty();
    
    // [修改] 按钮基础样式：胶囊状(rounded-pill)，带边框(border)，内边距(px-3)
    const btnClass = "btn rounded-pill px-3 me-2 mb-2 border"; 

    // 添加 "全部" 按钮
    // 激活状态：蓝色背景+阴影；未激活：浅色背景+深色文字
    const allActive = !currentId ? 'btn-primary shadow-sm' : 'btn-light text-dark';
    const allBtn = $(`<button class="${btnClass} ${allActive}" data-id="all">全部</button>`);
    listContainer.append(allBtn);

    categories.forEach(category => {
        const isActive = (category.id == currentId);
        const activeClass = isActive ? 'btn-primary shadow-sm' : 'btn-light text-dark';
        const btn = $(`<button class="${btnClass} ${activeClass}" data-id="${category.id}">${category.name}</button>`);
        listContainer.append(btn);
    });

    // 绑定点击事件
    listContainer.find('button').on('click', function() {
        const id = $(this).data('id');
        const newCategoryId = (id === 'all') ? null : id;
        
        // 切换样式：先重置所有为浅色，再点亮当前点击的
        listContainer.find('button').removeClass('btn-primary shadow-sm').addClass('btn-light text-dark');
        $(this).removeClass('btn-light text-dark').addClass('btn-primary shadow-sm');

        // 重新加载商品列表
        loadProducts(newCategoryId);
    });
}

/**
 * 渲染商品列表
 */
function renderProductList(products, categoryId) {
    const listContainer = $('#product-list');
    listContainer.empty();

    if (!Array.isArray(products) || products.length === 0) {
        listContainer.append('<div class="col-12"><p class="text-center text-muted p-4 bg-white rounded border">当前分类下暂无商品</p></div>');
        return;
    }

    products.forEach(product => {
        const mainVariant = product.variants && product.variants.length > 0 ? product.variants[0] : {};
        
        const totalSales = (product.variants || []).reduce((sum, v) => sum + (v.sales_count || 0), 0);
        const totalStock = (product.variants || []).reduce((sum, v) => sum + (v.stock || 0), 0);
        
        const productImg = product.image_url || mainVariant.image_url || '/assets/noimage.jpg'; 
        const rawPrice = mainVariant.price || 0;
        const productPrice = parseFloat(rawPrice).toFixed(2);
        
        const isAvailable = totalStock > 0;

        const buttonClass = isAvailable ? 'btn-primary' : 'btn-secondary disabled';
        const buttonText = isAvailable ? '购买' : '缺货';
        const buttonAction = isAvailable ? `/product?id=${product.id}` : 'javascript:void(0)';
        
        // === [修改开始] 发货方式样式逻辑 ===
        let isManual = false;
        let deliveryLabel = "自动发货";
        
        // 判断是否为手动发货
        if (product.delivery_type == 1) {
            isManual = true;
            deliveryLabel = "手动发货";
        }
        
        // 设置颜色类和图标
        const badgeColorClass = isManual ? 'text-primary border-primary' : 'text-danger border-danger';
        const badgeIconClass = isManual ? 'fa-user-clock' : 'fa-bolt';
        
        // 生成徽章 HTML
        const deliveryHtml = `
            <span class="badge rounded-pill bg-transparent border ${badgeColorClass} d-flex align-items-center justify-content-center" style="font-weight: normal; padding: 4px 10px; min-width: 85px;">
                <i class="fas ${badgeIconClass} me-1"></i>${deliveryLabel}
            </span>
        `;
        // === [修改结束] ===
        
        // 解析标签 (格式: b1#色 b2#色 标签名#色)
        let tagsHtml = '';
        if (product.tags) {
            const tagsArr = product.tags.split(/[,，]+/).filter(t => t && t.trim());
            
            tagsArr.forEach(tagStr => {
                tagStr = tagStr.trim();
                let borderColor = null;
                let bgColor = null;
                let textColor = null;
                let labelText = tagStr;

                if (tagStr.includes(' ') && (tagStr.includes('b1#') || tagStr.includes('b2#'))) {
                    const parts = tagStr.split(/\s+/);
                    parts.forEach(part => {
                        if (part.startsWith('b1#')) {
                            borderColor = part.replace('b1#', '');
                        } else if (part.startsWith('b2#')) {
                            bgColor = part.replace('b2#', '');
                        } else {
                            if (part.includes('#')) {
                                const txtParts = part.split('#');
                                labelText = txtParts[0];
                                if (txtParts[1]) textColor = txtParts[1];
                            } else {
                                labelText = part;
                            }
                        }
                    });
                }

                if (borderColor || bgColor || textColor) {
                    let style = '';
                    if (borderColor) style += `border-color: #${borderColor.replace(/^#/, '')} !important;`;
                    if (bgColor) style += `background-color: #${bgColor.replace(/^#/, '')} !important;`;
                    if (textColor) {
                        style += `color: #${textColor.replace(/^#/, '')} !important;`;
                    } else if (bgColor) {
                        style += `color: #fff !important;`;
                    }
                    tagsHtml += `<span class="badge-tag" style="${style}">${labelText}</span>`;
                } else {
                    tagsHtml += `<span class="badge-tag">${labelText}</span>`;
                }
            });
        }
        
        // === [修改] HTML结构：表格化布局 ===
        // 顺序：发货方式 | 库存 | 价格 | 购买
        // 使用 min-width 和 text-end 来模拟表格列对齐
        // gap-3 增加列间距
        const productHtml = `
            <div class="col-12">
                <div class="product-card-item">
                    <div class="product-img">
                        <img src="${productImg}" alt="${product.name}" loading="lazy" />
                    </div>
                    
                    <div class="product-info">
                        <div class="product-title" title="${product.name}">
                            <a href="/product?id=${product.id}" class="text-dark text-decoration-none">${product.name}</a>
                        </div>
                        <div class="product-meta">
                            ${tagsHtml}
                        </div>
                    </div>

                    <div class="product-action-area d-flex align-items-center justify-content-end gap-3 flex-wrap flex-md-nowrap">
                        <div class="text-end" style="min-width: 90px;">
                            ${deliveryHtml}
                        </div>

                        <div class="text-muted text-end" style="min-width: 70px; font-size: 13px;">
                            库存: ${totalStock}
                        </div>

                        <div class="product-price text-end" style="min-width: 80px;">
                             ¥ ${productPrice}
                        </div>
                        
                        <div class="text-end" style="min-width: 70px;">
                            <a href="${buttonAction}" class="btn btn-sm ${buttonClass} rounded-pill px-3 w-100">
                                ${buttonText}
                            </a>
                        </div>
                    </div>
                </div>
            </div>
        `;
        
        listContainer.append(productHtml);
    });
}

/**
 * 加载商品数据
 */
function loadProducts(categoryId = null) {
    const listContainer = $('#product-list');
    listContainer.empty().append('<div class="col-12"><p class="text-center text-muted p-3">商品数据加载中...</p></div>');

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
                listContainer.empty().append(`<div class="col-12"><p class="text-center text-danger p-3">加载失败</p></div>`);
            }
        },
        error: function() {
            listContainer.empty().append('<div class="col-12"><p class="text-center text-danger p-3">网络错误，无法加载商品数据</p></div>');
        }
    });
}

/**
 * 加载分类数据 (用于页面中部的分类条)
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
            else if (response && response.results && Array.isArray(response.results)) {
                 categories = response.results;
                 isSuccess = true;
            }
            
            if (isSuccess) {
                renderCategoryList(categories, null);
            }
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
    }
    
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
            if (config && typeof config === 'object') {
                const siteName = config.site_name || '夏雨店铺'; 
                const siteLogo = config.site_logo || ''; 
                const showSiteName = config.show_site_name; 
                
                updatePageTitle(siteName);
                
                if (typeof renderHeader === 'function') {
                    renderHeader(siteName, siteLogo, showSiteName);
                }
                if (typeof renderFooter === 'function') {
                    renderFooter(siteName);
                }

                if (config.announce && $('#site-announcement').length > 0) {
                    const announceHtml = `
                        <div class="bg-white border rounded p-3" style="border-color: #dee2e6 !important; font-size: 14px; line-height: 1.6; color: #555;">
                            ${config.announce}
                        </div>
                    `;
                    $('#site-announcement').html(announceHtml);
                }
            }
        },
        error: function() {
            console.error('Failed to load site configuration.');
            const defaultName = '我的商店';
            if (typeof renderHeader === 'function') {
                renderHeader(defaultName);
            }
            if (typeof renderFooter === 'function') {
                renderFooter(defaultName);
            }
        }
    });
}

// 页面加载完成后执行
$(document).ready(function() {
    loadGlobalConfig();
    
    const currentPath = window.location.pathname.split('/').pop() || 'index.html';
    if (currentPath === 'index.html' || currentPath === '') {
        loadCategories();
        loadProducts();
    }
});
