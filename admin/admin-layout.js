(function() {
    // 1. 定义侧边栏 HTML 模板
    const sidebarHTML = `
        <div class="sidebar-header"><a href="/admin/dashboard.html">XYRJ Faka</a></div>
        <div class="sidebar-menu-container">
            <ul>
                <li><a href="/admin/dashboard.html"><i class="fas fa-tachometer-alt"></i> 仪表盘</a></li>
                <li><a href="/admin/categories.html"><i class="fas fa-folder"></i> 商品分类</a></li>
                <li><a href="/admin/products.html"><i class="fas fa-box"></i> 商品管理</a></li>
                <li><a href="/admin/orders.html"><i class="fas fa-shopping-cart"></i> 订单管理</a></li>
                <li><a href="/admin/cards.html"><i class="fas fa-ticket-alt"></i> 卡密管理</a></li>
                <li><a href="/admin/payments.html"><i class="fas fa-credit-card"></i> 支付设置</a></li>
                <li><a href="/admin/article_categories.html"><i class="fas fa-tags"></i> 文章分类</a></li>
                <li><a href="/admin/articles.html"><i class="fas fa-newspaper"></i> 文章管理</a></li>
                <li><a href="/admin/settings.html"><i class="fas fa-cog"></i> 系统设置</a></li>
                <li><a href="javascript:void(0)" class="logout-btn" id="logout-link"><i class="fas fa-sign-out-alt"></i> 退出登录</a></li>
            </ul>
        </div>
        <div class="sidebar-footer">夏雨店铺系统 Version <span id="app-version">...</span></div>
    `;

    // 2. 渲染侧边栏到页面
    const sidebarElement = document.getElementById('sidebar');
    if (sidebarElement) {
        sidebarElement.innerHTML = sidebarHTML;
    }

    // 3. 自动高亮当前菜单
    const currentPath = window.location.pathname;
    const links = document.querySelectorAll('.admin-sidebar ul li a');
    links.forEach(link => {
        // 获取链接的 href 属性
        const href = link.getAttribute('href');
        // 简单的匹配逻辑：如果当前 URL 包含该链接的 href
        if (href && currentPath.includes(href) && href !== '#') {
            link.classList.add('active');
        }
    });

    // 4. 设置版本号
    if (window.SITE_CONFIG && window.SITE_CONFIG.version) {
        const verEl = document.getElementById('app-version');
        if(verEl) verEl.innerText = window.SITE_CONFIG.version;
    } else {
        const verEl = document.getElementById('app-version');
        if(verEl) verEl.innerText = '1.0.0';
    }

    // 5. 绑定退出登录逻辑
    const logoutLink = document.getElementById('logout-link');
    if (logoutLink) {
        logoutLink.addEventListener('click', function() {
            if(confirm('确定要退出登录吗？')) { 
                localStorage.removeItem('ADMIN_TOKEN'); 
                window.location.href = '/admin/index.html'; 
            }
        });
    }

    // 6. 移动端菜单逻辑
    const mobileBtn = document.getElementById('mobile-menu-toggle');
    const overlay = document.querySelector('.admin-overlay');
    
    function toggleMenu() {
        if (sidebarElement) sidebarElement.classList.toggle('is-visible');
        if (overlay) overlay.classList.toggle('is-visible');
        
        if(mobileBtn) {
            const icon = mobileBtn.querySelector('i');
            if(icon) {
                if (icon.classList.contains('fa-bars')) {
                    icon.classList.remove('fa-bars'); icon.classList.add('fa-times');
                } else {
                    icon.classList.remove('fa-times'); icon.classList.add('fa-bars');
                }
            }
        }
    }

    if(mobileBtn) mobileBtn.addEventListener('click', (e) => { e.stopPropagation(); toggleMenu(); });
    if(overlay) overlay.addEventListener('click', toggleMenu);

    // 移动端点击菜单项自动关闭
    links.forEach(link => {
        link.addEventListener('click', () => {
            if (window.innerWidth <= 800 && sidebarElement.classList.contains('is-visible')) {
                toggleMenu();
            }
        });
    });

})();
