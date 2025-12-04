/* themes/default/files/header.js - 渲染页面头部（导航栏） */

/**
 * 渲染页头
 * @param {string} siteName - 网站名称
 * @param {string} siteLogo - 网站Logo地址 (可选)
 */
function renderHeader(siteName = '我的商店', siteLogo = '') {
    // 检查是否已渲染，防止重复
    if ($('header').length > 0) return;
    
    // 构建 Logo 的 HTML
    // 要求：Logo高度47px
    const logoHtml = siteLogo 
        ? `<img src="${siteLogo}" alt="Logo" class="site-logo">` 
        : '';

    // 注入自定义 CSS 样式
    const styleHtml = `
        <style>
            /* 1. 页头容器样式 */
            header.custom-header {
                height: 60px; /* 要求：页头高度60px */
                background-color: #ffffff; /* 要求：页头颜色白色 */
                box-shadow: 0 2px 10px rgba(0,0,0,0.05); /* 添加轻微阴影以区分背景 */
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
                color: #333 !important; /* 深色字体 */
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
                width: 16px; /* 固定宽度对齐 */
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
                padding: 5px 15px 5px 35px;
                border: 1px solid #eee;
                background-color: #f8f9fa;
                width: 200px;
                transition: all 0.3s;
                height: 34px;
            }
            .header-search-input:focus {
                background-color: #fff;
                border-color: var(--bs-primary);
                box-shadow: 0 0 0 0.2rem rgba(13, 110, 253, 0.15);
                width: 240px; /* 聚焦时稍微变宽 */
            }
            .header-search-icon {
                position: absolute;
                left: 12px;
                top: 50%;
                transform: translateY(-50%);
                color: #aaa;
                font-size: 12px;
                pointer-events: none;
            }

            /* 移动端适配调整 */
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
                .header-search-input:focus { width: 100%; }
            }
        </style>
    `;

    // 导航栏 HTML 结构
    const headerHtml = `
        ${styleHtml}
        <header class="custom-header">
            <!-- 使用 navbar-light 因为背景是白色的 -->
            <nav class="navbar navbar-expand-lg navbar-light">
                <div class="container">
                    
                    <!-- Logo + 店铺名称 -->
                    <a class="navbar-brand" href="index.html">
                        ${logoHtml}
                        <span>${siteName}</span>
                    </a>

                    <!-- 移动端折叠按钮 -->
                    <button class="navbar-toggler" type="button" data-bs-toggle="collapse" data-bs-target="#navbarNav" aria-controls="navbarNav" aria-expanded="false" aria-label="Toggle navigation">
                        <span class="navbar-toggler-icon"></span>
                    </button>

                    <div class="collapse navbar-collapse" id="navbarNav">
                        
                        <!-- 左侧菜单：包含所有主要导航项 -->
                        <ul class="navbar-nav me-auto mb-2 mb-lg-0">
                            <!-- 1. 首页 -->
                            <li class="nav-item">
                                <a class="nav-link" href="index.html">
                                    <i class="fas fa-home"></i>首页
                                </a>
                            </li>
                            <!-- 2. 所有商品 -->
                            <li class="nav-item">
                                <a class="nav-link" href="index.html#product-list">
                                    <i class="fas fa-list-ul"></i>所有商品
                                </a>
                            </li>
                            <!-- 3. 商品分类 -->
                            <li class="nav-item">
                                <a class="nav-link" href="index.html#category-list">
                                    <i class="fas fa-th-large"></i>商品分类
                                </a>
                            </li>
                            <!-- 4. 订单查询 (移到左边) -->
                            <li class="nav-item">
                                <a class="nav-link" href="orders.html">
                                    <i class="fas fa-search"></i>订单查询
                                </a>
                            </li>
                            <!-- 5. 文章中心 (移到左边) -->
                            <li class="nav-item">
                                <a class="nav-link" href="articles.html">
                                    <i class="fas fa-book-open"></i>文章中心
                                </a>
                            </li>
                            <!-- 6. 关于我们 (新增) -->
                            <li class="nav-item">
                                <a class="nav-link" href="javascript:void(0);" onclick="alert('关于我们页面正在建设中...')">
                                    <i class="fas fa-info-circle"></i>关于我们
                                </a>
                            </li>
                        </ul>

                        <!-- 最右侧：商品搜索框 -->
                        <div class="header-search-form">
                            <i class="fas fa-search header-search-icon"></i>
                            <input type="text" class="header-search-input" id="top-search-input" placeholder="搜索商品...">
                        </div>

                    </div>
                </div>
            </nav>
        </header>
    `;
    
    // 渲染到页面
    $('body').prepend(headerHtml);
    
    // 激活当前菜单高亮
    const currentPath = window.location.pathname.split('/').pop() || 'index.html';
    $('.nav-link').removeClass('active');
    
    // 简单的路由匹配
    if (currentPath === '' || currentPath === 'index.html') {
        $('a[href="index.html"]').first().addClass('active');
    } else {
        $(`a[href="${currentPath}"]`).addClass('active');
    }

    // 绑定搜索功能 (简易前端搜索)
    $('#top-search-input').on('keypress', function(e) {
        if (e.which == 13) { // 回车键
            const kw = $(this).val().trim().toLowerCase();
            if (!kw) return;

            if (window.location.pathname.endsWith('index.html') || window.location.pathname === '/') {
                // 如果在首页，直接筛选显示的商品
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
                    $('.product-card-item').show(); // 恢复显示
                } else {
                    // 滚动到商品列表
                    $('html, body').animate({
                        scrollTop: $("#product-list").offset().top - 80
                    }, 500);
                }
            } else {
                // 如果不在首页，跳转回首页 (实际项目中可带参数跳转)
                window.location.href = 'index.html';
            }
        }
    });
}
