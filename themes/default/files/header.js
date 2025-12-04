/* themes/default/files/header.js - 渲染页面头部（导航栏） */

/**
 * 渲染页头
 * @param {string} siteName - 网站名称
 * @param {string} siteLogo - 网站Logo地址 (可选)
 * @param {boolean|string} showSiteName - 是否显示网站名称 (true/'1' 显示, false/'0' 隐藏)
 */
function renderHeader(siteName = '我的商店', siteLogo = '', showSiteName = true) {
    // 检查是否已渲染，防止重复
    if ($('header').length > 0) return;
    
    // 1. 构建 Logo 的 HTML
    // 要求：Logo高度47px
    const logoHtml = siteLogo 
        ? `<img src="${siteLogo}" alt="Logo" class="site-logo">` 
        : '';

    // 2. 构建店铺名称 HTML
    // 逻辑：默认显示，只有当明确设置为 '0' 或 false 时才隐藏
    const shouldShowName = (showSiteName !== '0' && showSiteName !== 0 && showSiteName !== false && showSiteName !== 'false');
    
    let nameHtml = '';
    if (shouldShowName) {
        nameHtml = `<span>${siteName}</span>`;
    }

    // 注入自定义 CSS 样式
    const styleHtml = `
        <style>
            /* 1. 页头容器样式 */
            header.custom-header {
                height: 60px; /* 要求：页头高度60px */
                background-color: #ffffff; /* 要求：页头颜色白色 */
                box-shadow: 0 2px 10px rgba(0,0,0,0.05);
                position: sticky;
                top: 0;
                z-index: 1030;
            }

            /* 2. Navbar 调整 */
            header.custom-header .navbar {
                height: 100%;
                padding: 0;
            }
            
            /* 3. 店铺名称样式 */
            header.custom-header .navbar-brand {
                font-size: 19px !important; /* 要求：字体 19px */
                font-weight: 600 !important; /* 要求：字重 600 */
                color: #333 !important;
                display: flex;
                align-items: center;
                margin-right: 30px;
            }
            header.custom-header .site-logo {
                height: 47px; /* 要求：Logo高度 47px */
                width: auto;
                margin-right: 10px;
                object-fit: contain;
            }

            /* 4. 菜单项样式 */
            header.custom-header .nav-link {
                font-size: 14px !important; /* 要求：其他字体 14px */
                color: #555 !important;
                display: flex;
                align-items: center;
                padding-left: 12px !important;
                padding-right: 12px !important;
                height: 60px; /* 垂直居中 */
                transition: color 0.2s;
                position: relative;
            }
            header.custom-header .nav-link:hover,
            header.custom-header .nav-link.active {
                color: var(--bs-primary) !important;
                background-color: rgba(0,0,0,0.02);
            }
            
            /* 5. 图标样式 */
            header.custom-header .nav-link i {
                margin-right: 6px;
                font-size: 14px;
                width: 16px;
                text-align: center;
            }

            /* 6. 搜索框样式 */
            .header-search-form {
                position: relative;
                margin-left: 15px;
            }
            .header-search-input {
                border-radius: 20px;
                font-size: 13px;
                padding: 5px 15px 5px 15px;
                border: 1px solid #eee;
                background-color: #f8f9fa;
                width: 200px;
                transition: all 0.3s;
                height: 34px;
            }
            .header-search-input:focus {
                background-color: #fff;
                border: 1px solid #555; /* 强制 1px 边框 */
                box-shadow: none;  /* 去掉浅蓝色光晕/外边框 */
                width: 240px;
                outline: none; /* 去掉浏览器默认的高亮轮廓 */
            }
            .header-search-icon {
                position: absolute;
                right: 11px;
                top: 50%;
                transform: translateY(-50%);
                color: #aaa;
                font-size: 14px;
                pointer-events: none;
            }

            /* 7. 下拉菜单样式 (鼠标移入向下滑出) */
            header.custom-header .dropdown-menu {
                display: none; /* 默认隐藏 */
                margin-top: 0;
                border: none;
                box-shadow: 0 4px 12px rgba(0,0,0,0.1);
                border-radius: 4px;
                padding: 5px 0;
                min-width: 160px;
            }
            /* 关键：Hover 时显示并执行 slideDown 动画 */
            header.custom-header .nav-item.dropdown:hover .dropdown-menu {
                display: block;
                animation: slideDown 0.2s ease forwards;
            }
            @keyframes slideDown {
                from { opacity: 0; transform: translateY(-10px); }
                to { opacity: 1; transform: translateY(0); }
            }
            
            header.custom-header .dropdown-item {
                font-size: 14px !important; /* 要求：下拉菜单字体 14px */
                padding: 8px 15px;
                color: #555;
                display: flex;
                align-items: center;
            }
            header.custom-header .dropdown-item:hover {
                background-color: #f8f9fa;
                color: var(--bs-primary);
            }
            header.custom-header .category-icon-sm {
                width: 14px;  /* 要求：图标大小 14px */
                height: 14px; /* 要求：图标大小 14px */
                object-fit: cover;
                margin-right: 8px;
                border-radius: 2px;
            }

            /* 移动端适配 */
            @media (max-width: 991px) {
                header.custom-header { height: auto; min-height: 60px; }
                header.custom-header .navbar-collapse {
                    background: #fff;
                    padding-bottom: 15px;
                    border-top: 1px solid #eee;
                }
                header.custom-header .nav-link { height: 40px; }
                .header-search-form { margin: 10px 15px; width: auto; }
                .header-search-input { width: 100%; }
                header.custom-header .dropdown-menu {
                    box-shadow: none;
                    border: none;
                    padding-left: 20px;
                    display: none; 
                }
                 header.custom-header .nav-item.dropdown:hover .dropdown-menu {
                    display: block;
                }
            }
        </style>
    `;

    // 导航栏 HTML
    const headerHtml = `
        ${styleHtml}
        <header class="custom-header">
            <nav class="navbar navbar-expand-lg navbar-light">
                <div class="container">
                    
                    <a class="navbar-brand" href="index.html">
                        ${logoHtml}
                        ${nameHtml}
                    </a>

                    <button class="navbar-toggler" type="button" data-bs-toggle="collapse" data-bs-target="#navbarNav" aria-controls="navbarNav" aria-expanded="false" aria-label="Toggle navigation">
                        <span class="navbar-toggler-icon"></span>
                    </button>

                    <div class="collapse navbar-collapse" id="navbarNav">
                        
                        <ul class="navbar-nav me-auto mb-2 mb-lg-0">
                            <li class="nav-item">
                                <a class="nav-link" href="index.html">
                                    <i class="fas fa-home"></i>首页
                                </a>
                            </li>
                            <li class="nav-item">
                                <a class="nav-link" href="index.html#product-list">
                                    <i class="fas fa-list-ul"></i>所有商品
                                </a>
                            </li>
                            
                            <!-- 下拉菜单分类 -->
                            <li class="nav-item dropdown">
                                <a class="nav-link dropdown-toggle" href="index.html#category-list" id="categoryDropdown" role="button" aria-expanded="false">
                                    <i class="fas fa-th-large"></i>商品分类
                                </a>
                                <ul class="dropdown-menu" aria-labelledby="categoryDropdown" id="header-category-menu">
                                    <li><span class="dropdown-item text-muted">加载中...</span></li>
                                </ul>
                            </li>

                            <li class="nav-item">
                                <a class="nav-link" href="orders.html">
                                    <i class="fas fa-search"></i>订单查询
                                </a>
                            </li>
                            <li class="nav-item">
                                <a class="nav-link" href="articles.html">
                                    <i class="fas fa-book-open"></i>文章中心
                                </a>
                            </li>
                            <li class="nav-item">
                                <a class="nav-link" href="javascript:void(0);" onclick="alert('关于我们页面正在建设中...')">
                                    <i class="fas fa-info-circle"></i>关于我们
                                </a>
                            </li>
                        </ul>

                        <div class="header-search-form">
                            <i class="far fa-search header-search-icon"></i>
                            <input type="text" class="header-search-input" id="top-search-input" placeholder="搜索商品...">
                        </div>

                    </div>
                </div>
            </nav>
        </header>
    `;
    
    $('body').prepend(headerHtml);
    
    const currentPath = window.location.pathname.split('/').pop() || 'index.html';
    $('.nav-link').removeClass('active');
    
    if (currentPath === '' || currentPath === 'index.html') {
        $('a[href="index.html"]').first().addClass('active');
    } else {
        $(`a[href="${currentPath}"]`).addClass('active');
    }

    loadHeaderCategories();

    $('#top-search-input').on('keypress', function(e) {
        if (e.which == 13) {
            const kw = $(this).val().trim().toLowerCase();
            if (!kw) return;

            if (window.location.pathname.endsWith('index.html') || window.location.pathname === '/') {
                let found = 0;
                $('.product-card-item').each(function() {
                    const text = $(this).text().toLowerCase();
                    if (text.includes(kw)) {
                        $(this).show();
                        found++;
                    } else {
                        $(this).hide();
                    }
                });
                if (found === 0) {
                    alert('未找到包含 "' + kw + '" 的商品');
                    $('.product-card-item').show();
                } else {
                    $('html, body').animate({
                        scrollTop: $("#product-list").offset().top - 80
                    }, 500);
                }
            } else {
                window.location.href = 'index.html';
            }
        }
    });
}

/**
 * 加载分类并渲染到下拉菜单
 */
function loadHeaderCategories() {
    $.ajax({
        url: '/api/shop/categories',
        method: 'GET',
        success: function(response) {
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
                menuContainer.append('<li><span class="dropdown-item text-muted">暂无分类</span></li>');
                return;
            }

            menuContainer.append(`
                <li>
                    <a class="dropdown-item" href="index.html#category-list" onclick="if(typeof loadProducts === 'function') loadProducts(null);">
                        全部商品
                    </a>
                </li>
            `);

            categories.forEach(cat => {
                const imgHtml = (cat.image_url && cat.image_url !== '') 
                    ? `<img src="${cat.image_url}" class="category-icon-sm" alt="icon">` 
                    : '';
                
                const itemHtml = `
                    <li>
                        <a class="dropdown-item" href="javascript:void(0);" onclick="handleCategoryClick(${cat.id})">
                            ${imgHtml}${cat.name}
                        </a>
                    </li>
                `;
                menuContainer.append(itemHtml);
            });
        },
        error: function() {
            $('#header-category-menu').html('<li><span class="dropdown-item text-danger">加载失败</span></li>');
        }
    });
}

// 全局分类点击处理
window.handleCategoryClick = function(catId) {
    if (typeof loadProducts === 'function') {
        loadProducts(catId);
        if ($('#category-list').length > 0) {
             $('#category-list button').removeClass('btn-primary').addClass('btn-outline-primary');
             $(`#category-list button[data-id="${catId}"]`).removeClass('btn-outline-primary').addClass('btn-primary');
        }
        $('html, body').animate({ scrollTop: $("#product-list").offset().top - 100 }, 300);
    } else {
        window.location.href = 'index.html'; 
    }
};
