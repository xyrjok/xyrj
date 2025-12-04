// ... existing code ...
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
                const siteLogo = config.site_logo || ''; // 获取Logo
                const showSiteName = config.show_site_name; // 获取显示开关
                
                // 1. 更新页面标题
                updatePageTitle(siteName);
                
                // 2. 渲染 Header 和 Footer，传入所有参数
                if (typeof renderHeader === 'function') {
                    // 传递 siteName, siteLogo, showSiteName
                    renderHeader(siteName, siteLogo, showSiteName);
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
// ... existing code ...
