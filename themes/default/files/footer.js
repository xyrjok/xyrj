/* themes/default/files/footer.js - 渲染页面底部 */

// 函数现在接受 siteName 作为参数
function renderFooter(siteName = '我的商店') {
    const currentYear = new Date().getFullYear();
    // 检查是否已渲染，防止重复
    if ($('footer').length > 0) return;
    
    // 使用传入的 siteName
    const footerHtml = `
        <footer class="text-center text-muted py-4">
            <div class="container" style="font-size: 12px;color: rgb(112 118 124 / 88%);">
                <p class="mb-0">&copy; ${currentYear} ${siteName}. All rights reserved.</p>
                <p class="mb-0">Powered by Luna. | <a href="admin/" class="text-muted">后台管理</a></p>
            </div>
        </footer>
    `;
    
    // 使用 jQuery 将底部内容添加到 body 的末尾
    $('body').append(footerHtml);
}

// 移除自动执行逻辑，等待 main-default-bs.js 调用
// $(document).ready(function() {
//     if ($('footer').length === 0) {
//         renderFooter();
//     }
// });
