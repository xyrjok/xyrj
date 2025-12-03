/* themes/default/files/footer.js - 渲染页面底部 */

function renderFooter() {
    const currentYear = new Date().getFullYear();
    // 尝试从页面标题获取站点名称，否则使用默认值
    const siteName = document.title.split(' - ')[0] || '我的商店'; 

    const footerHtml = `
        <footer class="text-center text-muted py-3">
            <div class="container">
                <p class="mb-0">&copy; ${currentYear} ${siteName}. All rights reserved.</p>
                <p class="mb-0">Powered by Luna. | <a href="admin/" class="text-muted">后台管理</a></p>
            </div>
        </footer>
    `;
    
    // 使用 jQuery 将底部内容添加到 body 的末尾
    $('body').append(footerHtml);
}

// 确保在 jQuery 加载后执行
$(document).ready(function() {
    // 只有当 DOM 中没有 <footer> 元素时才渲染，以防重复调用。
    if ($('footer').length === 0) {
        renderFooter();
    }
});
