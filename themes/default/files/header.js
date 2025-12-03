/* themes/default/files/header.js - 渲染页面头部（导航栏） */

// 函数现在接受 siteName 作为参数
function renderHeader(siteName = '我的商店') {
    // 检查是否已渲染，防止重复
    if ($('header').length > 0) return;
    
    // 使用传入的 siteName
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
    // 移除之前的 active 状态
    $('.nav-link').removeClass('active').removeAttr('aria-current');
    // 激活当前页面的链接
    $(`a[href="${currentPath}"]`).addClass('active').attr('aria-current', 'page');
    // 特殊处理根路径
    if (currentPath === '' || currentPath === 'index.html') {
         $('a[href="index.html"]').addClass('active').attr('aria-current', 'page');
    }
}

// 移除自动执行逻辑，等待 main-default-bs.js 调用
// $(document).ready(function() {
//     if ($('header').length === 0) {
//         renderHeader();
//     }
// });
