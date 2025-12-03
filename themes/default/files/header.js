/* themes/default/files/header.js - 渲染页面头部（导航栏） */

function renderHeader() {
    // 尝试从页面标题获取站点名称，否则使用默认值
    const siteName = document.title.split(' - ')[0] || '我的商店'; 

    const headerHtml = `
        <header>
            <nav class="navbar navbar-expand-lg navbar-dark bg-primary">
                <div class="container">
                    <a class="navbar-brand" href="index.html">${siteName}</a>
                    <button class="navbar-toggler" type="button" data-bs-toggle="collapse" data-bs-target="#navbarNav" aria-controls="navbarNav" aria-expanded="false" aria-label="Toggle navigation">
                        <span class="navbar-toggler-icon"></span>
                    </button>
                    <div class="collapse navbar-collapse" id="navbarNav">
                        <ul class="navbar-nav me-auto mb-2 mb-lg-0">
                            <li class="nav-item">
                                <a class="nav-link" href="index.html">首页</a>
                            </li>
                            <li class="nav-item">
                                <a class="nav-link" href="orders.html">订单查询</a>
                            </li>
                            <li class="nav-item">
                                <a class="nav-link" href="articles.html">公告</a>
                            </li>
                        </ul>
                    </div>
                </div>
            </nav>
        </header>
    `;
    
    // 使用 jQuery 将头部内容添加到 body 的开头
    $('body').prepend(headerHtml);
    
    // 激活当前页面的导航链接
    const currentPath = window.location.pathname.split('/').pop() || 'index.html';
    $(`a[href="${currentPath}"]`).closest('li.nav-item').find('a').addClass('active').attr('aria-current', 'page');
    if (currentPath === 'index.html') {
        $('a[href="index.html"]').addClass('active').attr('aria-current', 'page');
    }
}

// 确保在 jQuery 加载后执行
$(document).ready(function() {
    // 只有当 DOM 中没有 <header> 元素时才渲染，以防重复调用。
    if ($('header').length === 0) {
        renderHeader();
    }
});
