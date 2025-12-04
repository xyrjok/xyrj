/* themes/default/files/header.js - 渲染页面头部（导航栏） */

/**
 * 渲染页头
 * @param {string} siteName - 网站名称
 * @param {string} siteLogo - 网站Logo地址 (可选)
 */
function renderHeader(siteName = '我的商店', siteLogo = '') {
    // 检查是否已渲染，防止重复
    if ($('header').length > 0) return;
    
    // 构建 Logo 的 HTML (如果有 logo 则显示图片，否则不显示)
    const logoHtml = siteLogo 
        ? `<img src="${siteLogo}" alt="Logo" style="height: 30px; margin-right: 10px; border-radius: 4px;">` 
        : '';

    // 使用 Bootstrap Flexbox 工具类来控制布局
    // me-auto: margin-end: auto (将右边的元素推到最右侧)
    // ms-auto: margin-start: auto (将自己推到最右侧)
    
    const headerHtml = `
        <header>
            <nav class="navbar navbar-expand-lg navbar-dark bg-primary">
                <div class="container">
                    
                    <a class="navbar-brand d-flex align-items-center" href="index.html">
                        ${logoHtml}
                        <span>${siteName}</span>
                    </a>

                    <button class="navbar-toggler" type="button" data-bs-toggle="collapse" data-bs-target="#navbarNav" aria-controls="navbarNav" aria-expanded="false" aria-label="Toggle navigation">
                        <span class="navbar-toggler-icon"></span>
                    </button>

                    <div class="collapse navbar-collapse" id="navbarNav">
                        
                        <ul class="navbar-nav me-auto mb-2 mb-lg-0">
                            <li class="nav-item">
                                <a class="nav-link" href="index.html">首页</a>
                            </li>
                            <li class="nav-item">
                                <a class="nav-link" href="index.html#product-list">所有商品</a>
                            </li>
                            <li class="nav-item">
                                <a class="nav-link" href="index.html#category-list">商品分类</a>
                            </li>
                        </ul>

                        <ul class="navbar-nav ms-auto mb-2 mb-lg-0">
                            <li class="nav-item">
                                <a class="nav-link" href="orders.html">
                                    <i class="fas fa-search me-1"></i>订单查询
                                </a>
                            </li>
                            <li class="nav-item">
                                <a class="nav-link" href="articles.html">
                                    <i class="fas fa-newspaper me-1"></i>文章中心
                                </a>
                            </li>
                        </ul>

                    </div>
                </div>
            </nav>
        </header>
    `;
    
    // 将头部添加到 body 开头
    $('body').prepend(headerHtml);
    
    // 激活当前页面的高亮状态
    const currentPath = window.location.pathname.split('/').pop() || 'index.html';
    $('.nav-link').removeClass('active').removeAttr('aria-current');
    
    // 简单的激活逻辑
    if (currentPath === '' || currentPath === 'index.html') {
        $('a[href="index.html"]').first().addClass('active');
    } else {
        $(`a[href="${currentPath}"]`).addClass('active');
    }
}
