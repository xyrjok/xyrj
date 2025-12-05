// themes/default/files/header.js

function renderHeader(siteName = '我的商店', siteLogo = '', showSiteName = true) {
    if ($('header').length > 0) return;
    
    const logoHtml = siteLogo ? `<img src="${siteLogo}" alt="Logo" class="site-logo">` : '';
    const shouldShowName = (showSiteName !== '0' && showSiteName !== 0 && showSiteName !== false && showSiteName !== 'false');
    let nameHtml = shouldShowName ? `<span>${siteName}</span>` : '';

    const styleHtml = `
        <style>
            /* ... (保留原有样式) ... */
            header.custom-header {
                height: 60px; 
                background-color: #ffffff;
                box-shadow: 0 2px 10px rgba(0,0,0,0.05);
                position: sticky;
                top: 0;
                z-index: 1030;
            }
            header.custom-header .navbar { height: 100%; padding: 0; }
            header.custom-header .navbar-brand {
                font-size: 19px !important;
                font-weight: 600 !important;
                color: #333 !important;
                display: flex; align-items: center; margin-right: 30px;
            }
            header.custom-header .site-logo { height: 47px; width: auto; margin-right: 10px; object-fit: contain; }
            header.custom-header .nav-link {
                font-size: 14px !important; color: #555 !important;
                display: flex; align-items: center; padding: 0 12px !important;
                height: 60px; transition: color 0.2s; position: relative;
            }
            header.custom-header .nav-link:hover, header.custom-header .nav-link.active {
                color: var(--bs-primary) !important; background-color: rgba(0,0,0,0.02);
            }
            header.custom-header .nav-link i { margin-right: 6px; font-size: 14px; width: 16px; text-align: center; }
            
            /* 搜索框样式 */
            .header-search-form { position: relative; margin-left: 15px; }
            .header-search-input {
                border-radius: 20px; font-size: 13px; padding: 5px 15px;
                border: 1px solid #eee; background-color: #f8f9fa; width: 200px;
                transition: all 0.3s; height: 34px;
            }
            .header-search-input:focus {
                background-color: #fff; border: 1px solid #555; box-shadow: none; width: 240px; outline: none;
            }
            .header-search-icon {
                position: absolute; right: 11px; top: 50%; transform: translateY(-50%);
                color: #aaa; font-size: 14px; pointer-events: none;
            }

            /* === 新增：购物车图标样式 === */
            .header-cart-wrapper {
                position: relative;
                margin-left: 15px;
                cursor: pointer;
                color: #999; /* 灰色图标 */
                font-size: 18px;
                display: flex;
                align-items: center;
                text-decoration: none;
                transition: color 0.2s;
            }
            .header-cart-wrapper:hover { color: #333; }
            .header-cart-badge {
                position: absolute;
                top: -6px;
                right: -8px;
                background-color: #dc3545; /* 红色背景 */
                color: #fff; /* 白字 */
                border-radius: 50%;
                padding: 1px 4px;
                min-width: 14px;
                height: 14px;
                font-size: 10px;
                line-height: 12px;
                text-align: center;
                display: none; /* 默认隐藏 */
                font-weight: bold;
                box-shadow: 0 0 0 1px #fff;
            }

            /* 下拉菜单样式 */
            header.custom-header .dropdown-menu {
                display: none; margin-top: 0; border: none;
                box-shadow: 0 4px 12px rgba(0,0,0,0.1); border-radius: 4px; padding: 5px 0; min-width: 160px;
            }
            header.custom-header .nav-item.dropdown:hover .dropdown-menu {
                display: block; animation: slideDown 0.2s ease forwards;
            }
            @keyframes slideDown { from { opacity: 0; transform: translateY(-10px); } to { opacity: 1; transform: translateY(0); } }
            header.custom-header .dropdown-item {
                font-size: 14px !important; padding: 8px 15px; color: #555; display: flex; align-items: center;
            }
            header.custom-header .dropdown-item:hover { background-color: #f8f9fa; color: var(--bs-primary); }
            header.custom-header .category-icon-sm { width: 14px; height: 14px; object-fit: cover; margin-right: 8px; border-radius: 2px; }

            @media (max-width: 991px) {
                header.custom-header { height: auto; min-height: 60px; }
                header.custom-header .navbar-collapse { background: #fff; padding-bottom: 15px; border-top: 1px solid #eee; }
                header.custom-header .nav-link { height: 40px; }
                .header-search-form { margin: 10px 15px; width: auto; }
                .header-search-input { width: 100%; }
                .header-cart-wrapper { margin: 10px 15px; width: fit-content; }
            }
        </style>
    `;

    // 导航栏 HTML
    const headerHtml = `
        ${styleHtml}
        <header class="custom-header">
            <nav class="navbar navbar-expand-lg navbar-light">
                <div class="container">
                    
                    <a class="navbar-brand" href="/">
                        ${logoHtml}
                        ${nameHtml}
                    </a>

                    <button class="navbar-toggler" type="button" data-bs-toggle="collapse" data-bs-target="#navbarNav">
                        <span class="navbar-toggler-icon"></span>
                    </button>

                    <div class="collapse navbar-collapse" id="navbarNav">
                        <ul class="navbar-nav me-auto mb-2 mb-lg-0">
                            <li class="nav-item"><a class="nav-link" href="/"><i class="fas fa-home"></i>首页</a></li>
                            <li class="nav-item dropdown">
                                <a class="nav-link dropdown-toggle" href="/#category-list" id="categoryDropdown" role="button">
                                    <i class="fas fa-list-ul"></i>商品分类
                                </a>
                                <ul class="dropdown-menu" id="header-category-menu">
                                    <li><span class="dropdown-item text-muted">加载中...</span></li>
                                </ul>
                            </li>
                            <li class="nav-item"><a class="nav-link" href="orders"><i class="fas fa-search"></i>订单查询</a></li>
                            <li class="nav-item"><a class="nav-link" href="articles"><i class="fas fa-book-open"></i>文章中心</a></li>
                            <li class="nav-item"><a class="nav-link" href="javascript:void(0);" onclick="alert('关于我们页面正在建设中...')"><i class="fas fa-info-circle"></i>关于我们</a></li>
                        </ul>

                        <div class="header-search-form">
                            <i class="far fa-search header-search-icon"></i>
                            <input type="text" class="header-search-input" id="top-search-input" placeholder="搜索商品...">
                        </div>

                        <a href="/cart" class="header-cart-wrapper" title="查看购物车">
                            <i class="fas fa-shopping-cart"></i>
                            <span class="header-cart-badge" id="header-cart-badge">0</span>
                        </a>

                    </div>
                </div>
            </nav>
        </header>
    `;
    
    $('body').prepend(headerHtml);
    
    // ... (保留原有的 currentPath 处理逻辑) ...
    const currentPath = window.location.pathname.split('/').pop() || '/';
    $('.nav-link').removeClass('active');
    if (currentPath === '' || currentPath === '/') { $('a[href="/"]').first().addClass('active'); } 
    else { $(`a[href="${currentPath}"]`).addClass('active'); }

    loadHeaderCategories();

    // 绑定搜索回车
    $('#top-search-input').on('keypress', function(e) {
        if (e.which == 13) {
            const kw = $(this).val().trim().toLowerCase();
            if (!kw) return;
            if (window.location.pathname.endsWith('/') || window.location.pathname === '/') {
                // ... (保留原有搜索逻辑) ...
                 let found = 0;
                $('.product-card-item').each(function() {
                    const text = $(this).text().toLowerCase();
                    if (text.includes(kw)) { $(this).show(); found++; } else { $(this).hide(); }
                });
                if (found === 0) { alert('未找到包含 "' + kw + '" 的商品'); $('.product-card-item').show(); } 
                else { $('html, body').animate({ scrollTop: $("#product-list").offset().top - 80 }, 500); }
            } else {
                window.location.href = '/';
            }
        }
    });

    // === 新增：定义全局更新角标函数并初始化 ===
    window.updateHeaderCartBadge = function() {
        try {
            const cart = JSON.parse(localStorage.getItem('tbShopCart') || '[]');
            const count = cart.length;
            const badge = $('#header-cart-badge');
            if (count > 0) {
                badge.text(count > 99 ? '99+' : count).show();
            } else {
                badge.hide();
            }
        } catch(e) { console.error('Cart badge update error', e); }
    };
    
    // 初始化调用
    window.updateHeaderCartBadge();
}

// ... (保留 loadHeaderCategories 和 handleCategoryClick 函数不变) ...
function loadHeaderCategories() {
    // ... (原代码) ...
    $.ajax({
        url: '/api/shop/categories',
        method: 'GET',
        success: function(response) {
            // ... (原代码逻辑) ...
            let categories = [];
            if (response && response.code === 0 && response.data && Array.isArray(response.data.categories)) {
                categories = response.data.categories;
            } else if (response && (Array.isArray(response) || Array.isArray(response.categories))) {
                categories = Array.isArray(response) ? response : response.categories;
            } else if (response && response.results && Array.isArray(response.results)) {
                 categories = response.results;
            }
            const menuContainer = $('#header-category-menu');
            menuContainer.empty();
            if (categories.length === 0) {
                menuContainer.append('<li><span class="dropdown-item text-muted">暂无分类</span></li>'); return;
            }
            menuContainer.append(`<li><a class="dropdown-item" href="/#category-list" onclick="if(typeof loadProducts === 'function') loadProducts(null);">全部商品</a></li>`);
            categories.forEach(cat => {
                const imgHtml = (cat.image_url && cat.image_url !== '') ? `<img src="${cat.image_url}" class="category-icon-sm" alt="icon">` : '';
                const itemHtml = `<li><a class="dropdown-item" href="javascript:void(0);" onclick="handleCategoryClick(${cat.id})">${imgHtml}${cat.name}</a></li>`;
                menuContainer.append(itemHtml);
            });
        },
        error: function() { $('#header-category-menu').html('<li><span class="dropdown-item text-danger">加载失败</span></li>'); }
    });
}

window.handleCategoryClick = function(catId) {
    // ... (原代码) ...
    if (typeof loadProducts === 'function') {
        loadProducts(catId);
        if ($('#category-list').length > 0) {
             $('#category-list button').removeClass('btn-primary').addClass('btn-outline-primary');
             $(`#category-list button[data-id="${catId}"]`).removeClass('btn-outline-primary').addClass('btn-primary');
        }
        $('html, body').animate({ scrollTop: $("#product-list").offset().top - 100 }, 300);
    } else {
        window.location.href = '/'; 
    }
};
