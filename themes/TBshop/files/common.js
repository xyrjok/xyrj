// =============================================
// === themes/TBshop/files/common.js
// === (全局共享JS + 公共布局渲染 - 修复侧边栏文章接口)
// =============================================

// ============================================================
// === 1. 公共布局模版系统
// ============================================================

const TB_LAYOUT = {
    // 移动端头部
    mobileHeader: `
        <div class="mh-left" id="mobile-menu-btn" onclick="togglePanel('mobile-sidebar', 'mobile-overlay')">
            <i class="fa fa-bars"></i>
        </div>
        <div class="mh-center">
            <a href="/" class="d-flex align-items-center justify-content-center h-100">
                <img id="mobile-logo-img" class="d-none" alt="Logo" style="height: 32px;">
                <span id="mobile-site-name-wrap" class="d-none">
                    <i class="fa fa-shopping-bag"></i>
                    <span id="mobile-header-site-name">TB Shop</span>
                </span>
            </a>
        </div>
        <div class="mh-right" id="mobile-search-btn" onclick="toggleMobileSearch()">
            <i class="fa fa-search"></i>
        </div>
    `,

    // PC端头部
    pcHeader: (activePage) => `
        <div class="container header-inner">
            <a href="/" class="site-brand">
                <img id="site-logo" class="d-none" style="max-height: 45px; width: auto; margin-right: 10px;" alt="Logo">
                <span id="site-name-wrap" class="d-flex align-items-center d-none">
                    <i class="fa fa-shopping-bag"></i>
                    <span id="header-site-name">TB Shop</span>
                </span>
            </a>

            <nav class="main-nav d-none d-md-flex">
                <a href="/" class="nav-link-item ${activePage === 'home' ? 'active' : ''}" style="${activePage==='home'?'color:var(--tb-orange);':''}">首页</a>
                <a href="/articles.html" class="nav-link-item ${activePage === 'articles' ? 'active' : ''}" style="${activePage==='articles'?'color:var(--tb-orange);':''}">教程文章</a>
                <a href="/orders.html" class="nav-link-item ${activePage === 'orders' ? 'active' : ''}" style="${activePage==='orders'?'color:var(--tb-orange);font-weight:bold;':''}">查询订单</a>
            </nav>

            <div class="header-right">
                <div class="tb-search-group">
                    <input type="text" id="search-input" class="tb-search-input" placeholder="搜索商品...">
                    <button class="tb-search-btn" onclick="doSearch('pc')">搜索</button>
                </div>
                <a href="/admin/" class="btn-login">登录</a>
            </div>
        </div>
    `,

    // 移动端侧滑菜单
    mobileSidebar: (activePage) => `
        <div class="mobile-sidebar-header">
            <h5 class="mobile-sidebar-title">功能菜单</h5>
            <i class="fa fa-times mobile-sidebar-close" onclick="togglePanel('mobile-sidebar', 'mobile-overlay')"></i>
        </div>
        <div class="mobile-sidebar-content">
            <div id="mobile-category-list">
                <a href="/" class="${activePage === 'home' ? 'active' : ''}" style="${activePage === 'home' ? 'background:rgba(255,255,255,0.1);' : ''}">
                    <i class="fa fa-home"></i> 首页
                </a>
                <a href="/orders.html" class="${activePage === 'orders' ? 'active' : ''}" style="${activePage === 'orders' ? 'background:rgba(255,255,255,0.1);' : ''}">
                    <i class="fa fa-file-alt"></i> 订单查询
                </a>
                <a href="/articles.html" class="${activePage === 'articles' ? 'active' : ''}" style="${activePage === 'articles' ? 'background:rgba(255,255,255,0.1);' : ''}">
                    <i class="fa fa-book"></i> 教程文章
                </a>
                 <a href="/cart.html" class="${activePage === 'cart' ? 'active' : ''}" style="${activePage === 'cart' ? 'background:rgba(255,255,255,0.1);' : ''}">
                    <i class="fa fa-shopping-cart"></i> 购物车
                </a>
            </div>
        </div>
        <div class="mobile-sidebar-footer">
            <a href="/admin/" class="mobile-sidebar-login-link">
                <i class="fa fa-user-circle"></i> 管理员登录
            </a>
        </div>
    `,

    // 移动端底部导航
    mobileBottomNav: (activePage) => `
        <a href="/" class="mbn-item ${activePage === 'home' ? 'active' : ''}">
            <i class="fa fa-home"></i>
            <span>首页</span>
        </a>
        <a href="#" class="mbn-item" onclick="event.preventDefault(); togglePanel('mobile-sidebar', 'mobile-overlay');">
            <i class="fa fa-th-large"></i>
            <span>菜单</span>
        </a>
        <a href="/orders.html" class="mbn-item ${activePage === 'orders' ? 'active' : ''}">
            <i class="fa fa-file-alt"></i>
            <span>查单</span>
        </a>
        <a href="/cart.html" class="mbn-item ${activePage === 'cart' ? 'active' : ''}" style="position:relative;">
            <i class="fa fa-shopping-cart"></i>
            <span>购物车</span>
             <span id="cart-badge-mobile" class="badge bg-danger rounded-pill" 
                  style="position: absolute; top: 2px; right: 15px; font-size: 8px; padding: 2px 4px; display: none;">0</span>
        </a>
        <a href="#" class="mbn-item" onclick="event.preventDefault(); togglePanel('mobile-contact-sheet', 'mobile-contact-overlay');">
            <i class="fa fa-headset"></i>
            <span>客服</span>
        </a>
    `,

    // 页脚
    footer: `
        <div class="container">
            <div class="footer-links">
                <a href="/">首页</a>
                <a href="/articles.html">教程文章</a>
                <a href="/orders.html">查询订单</a>
                <a href="#" onclick="event.preventDefault(); togglePanel('mobile-contact-sheet', 'mobile-contact-overlay');">联系客服</a>
            </div>
            <div class="copyright">
                &copy; <span id="year">${new Date().getFullYear()}</span> <span id="footer-name">TB Shop</span>. All Rights Reserved.
            </div>
        </div>
    `,

    // PC右侧栏 (标准框架)
    pcSidebarStandard: `
        <div class="sidebar-inner">
            <div class="module-box" id="notice-module-box">
                <div class="module-title">店铺公告</div>
                <div class="notice-content" id="notice-box">
                    <i class="fa fa-spinner fa-spin"></i> 加载中...
                </div>
            </div>

            <div class="module-box" id="contact-module-box">
                <div class="module-title">联系客服</div>
                <div class="notice-content" id="contact-box">
                    暂无联系方式
                </div>
            </div>
            
            <div id="sidebar-extras">
                 <div class="module-box d-none" id="top-sales-box-container">
                    <div class="module-title">销量排行</div>
                    <div id="top-sales-list"></div>
                </div>
                <div class="module-box d-none" id="article-cat-box-container">
                     <div class="module-title">教程分类</div>
                     <div class="art-cat-list" id="article-cat-list"></div>
                </div>
                <div class="module-box d-none" id="tag-cloud-box-container">
                     <div class="module-title">热门标签</div>
                     <div class="tag-cloud" id="tag-cloud-list"></div>
                </div>
            </div>
        </div>
    `
};

/**
 * 核心函数：渲染页面公共布局
 */
function renderCommonLayout(activePage) {
    // 1. 注入 HTML
    const els = {
        'global-pc-header': TB_LAYOUT.pcHeader(activePage),
        'global-mobile-header': TB_LAYOUT.mobileHeader,
        'mobile-sidebar': TB_LAYOUT.mobileSidebar(activePage),
        'global-mobile-nav': TB_LAYOUT.mobileBottomNav(activePage),
        'global-footer': TB_LAYOUT.footer,
        'global-sidebar-right': TB_LAYOUT.pcSidebarStandard
    };

    for (const [id, html] of Object.entries(els)) {
        const el = document.getElementById(id);
        if (el) el.innerHTML = html;
    }

    // 2. 右侧栏特殊处理 (显示隐藏的模块)
    if (document.getElementById('global-sidebar-right')) {
        const extras = ['top-sales-box-container', 'tag-cloud-box-container', 'article-cat-box-container'];
        const showExtras = ['home', 'product', 'article', 'articles', 'orders', 'pay'].includes(activePage);
        if(showExtras) {
             extras.forEach(id => {
                 const el = document.getElementById(id);
                 if(el) el.classList.remove('d-none');
             });
             // 自动加载侧边栏数据
             loadGlobalSidebarData();
        }
    }

    // 3. 注入购物车角标 (PC端)
    const headerRight = document.querySelector('.tb-header .header-right');
    if (headerRight && !document.getElementById('cart-btn-pc')) {
        const cartBtnHtml = `
        <a href="/cart.html" class="icon-btn-pc" id="cart-btn-pc" style="position: relative; margin-left: 0px; color: #ff0036; text-decoration: none;">
            <i class="far fa-shopping-cart" style="font-size: 20px;"></i>
            <span id="cart-badge-pc" class="badge bg-danger rounded-pill" style="position: absolute; top: -8px; right: -10px; font-size: 9px; padding: 2px 4px; display: none;">0</span>
        </a>`;
        const loginBtn = headerRight.querySelector('.btn-login');
        if (loginBtn) {
            loginBtn.insertAdjacentHTML('beforebegin', cartBtnHtml);
            loginBtn.style.marginLeft = "15px"; 
        }
    }

    // 4. 加载配置 & 更新角标
    loadGlobalConfig();
    loadCartBadge();
}

/**
 * [新增] 全局加载侧边栏数据
 * 用于在商品页、文章页、订单页等自动填充 销量排行/热门标签/教程分类
 */
async function loadGlobalSidebarData() {
    // 1. 如果有销量排行或标签云容器，加载商品数据
    const needProducts = document.getElementById('top-sales-list') || document.getElementById('tag-cloud-list');
    if (needProducts) {
        try {
            const res = await fetch('/api/shop/products');
            const products = await res.json();
            if (!products.error) {
                renderSidebarTopSales(products);
                renderSidebarTagCloud(products);
            }
        } catch(e) { console.error('Sidebar products load error:', e); }
    }

    // 2. 如果有文章分类容器，加载文章数据
    const needArticles = document.getElementById('article-cat-list');
    if (needArticles) {
        try {
            // [修正] 这里的接口必须是 /api/shop/articles/list，而不是 /api/shop/articles (后者可能需要管理员权限)
            const res = await fetch('/api/shop/articles/list');
            const articles = await res.json();
            if (!articles.error) {
                renderSidebarArticleCats(articles);
            }
        } catch(e) { console.error('Sidebar articles load error:', e); }
    }
}

/**
 * 加载配置
 */
function loadGlobalConfig() {
    fetch('/api/shop/config')
        .then(res => res.json())
        .then(config => {
            renderGlobalHeaders(config);
            renderSidebarNoticeContact(config);
        })
        .catch(e => console.warn('Config load failed:', e));
}

// =============================================
// === 2. UI交互逻辑：Sticky Sidebar (全自动版)
// =============================================
let sidebar = null;
const sidebarOptions = {
    topSpacing: 80,
    bottomSpacing: 20,
    containerSelector: '#main-content-row', 
    innerWrapperSelector: '.sidebar-inner'
};

function checkSidebarStatus() {
    const sidebarWrapper = document.getElementById('sidebar-wrapper');
    const sidebarInner = sidebarWrapper ? sidebarWrapper.querySelector('.sidebar-inner') : null;
    const productArea = document.querySelector('.col-lg-9'); 
    
    if (!sidebarInner || !productArea) return;

    // 1. 设置最小高度，防止加载中塌陷
    productArea.style.minHeight = '400px';

    const sbHeight = sidebarInner.offsetHeight;
    const contentHeight = productArea.offsetHeight;
    const isWideScreen = window.innerWidth >= 992;

    // 2. 判断是否激活
    if (contentHeight < sbHeight || !isWideScreen) {
        if (sidebar) {
            sidebar.destroy();
            sidebar = null;
        }
    } else {
        if (!sidebar) {
            if (typeof StickySidebar !== 'undefined') {
                sidebar = new StickySidebar('#sidebar-wrapper', sidebarOptions);
            }
        } else {
            sidebar.updateSticky();
        }
    }
}

// 自动监听
document.addEventListener('DOMContentLoaded', () => {
    setTimeout(checkSidebarStatus, 100);
    const contentEl = document.querySelector('.col-lg-9');
    const sidebarInner = document.querySelector('.sidebar-inner');
    
    if (typeof ResizeObserver !== 'undefined') {
        if(contentEl) new ResizeObserver(() => checkSidebarStatus()).observe(contentEl);
        if(sidebarInner) new ResizeObserver(() => checkSidebarStatus()).observe(sidebarInner);
    }
});
window.addEventListener('resize', checkSidebarStatus);


// =============================================
// === 3. 共享逻辑 (搜索、侧栏、角标等)
// =============================================

// UI: Search
function doSearch(source = 'pc') {
    const inputId = source === 'mobile' ? 'mobile-search-input' : 'search-input';
    const val = document.getElementById(inputId)?.value.trim();
    if (typeof renderSingleGrid === 'function' && typeof allProducts !== 'undefined') {
        // 首页模式：本地筛选
        if (!val) renderCategorizedView('all');
        else {
            const filtered = allProducts.filter(p => p.name.toLowerCase().includes(val.toLowerCase()));
            renderSingleGrid(filtered, `"${val}" 的搜索结果`);
        }
        if (source === 'mobile') toggleMobileSearch(false);
    } else {
        // 其他页面：跳转搜索
        if (val) window.location.href = `/?q=${encodeURIComponent(val)}`;
    }
}
document.addEventListener('keypress', (e) => {
    if((e.target.id === 'search-input' || e.target.id === 'mobile-search-input') && e.key === 'Enter') {
        doSearch(e.target.id === 'mobile-search-input' ? 'mobile' : 'pc');
    }
});

// UI: Panels
function togglePanel(panelId, overlayId, forceShow = null) {
    const panel = document.getElementById(panelId);
    const overlay = document.getElementById(overlayId);
    if(!panel || !overlay) return;
    const show = (forceShow === null) ? !panel.classList.contains('show') : forceShow;
    panel.classList.toggle('show', show);
    overlay.classList.toggle('show', show);
}
function toggleMobileSearch(forceShow = null) {
    const d = document.querySelector('.mobile-search-dropdown');
    const o = document.getElementById('mobile-search-overlay');
    if(!d || !o) return;
    const show = (forceShow === null) ? !d.classList.contains('show') : forceShow;
    d.classList.toggle('show', show);
    o.classList.toggle('show', show);
}
window.addEventListener('scroll', () => {
    if(document.querySelector('.mobile-search-dropdown.show')) toggleMobileSearch(false);
}, { passive: true });

// Data: Config Render
function renderGlobalHeaders(config) {
    if (!document.title.includes("商品详情")) document.title = config.site_name || '商店首页';
    
    const setText = (id, txt) => { const el = document.getElementById(id); if(el) el.innerText = txt; };
    setText('header-site-name', config.site_name);
    setText('mobile-header-site-name', config.site_name);
    setText('footer-name', config.site_name);

    const showName = config.show_site_name === '1';
    const showLogo = config.show_site_logo === '1';
    
    ['site-logo', 'mobile-logo-img'].forEach(id => {
        const el = document.getElementById(id);
        if(el && showLogo && config.site_logo) { el.src = config.site_logo; el.classList.remove('d-none'); }
    });
    ['site-name-wrap', 'mobile-site-name-wrap'].forEach(id => {
        const el = document.getElementById(id);
        if(el && (showName || (!showName && !showLogo))) el.classList.remove('d-none');
    });
}

function renderSidebarNoticeContact(config) {
    const setHtml = (id, html) => { const el = document.getElementById(id); if(el) el.innerHTML = html; };
    setHtml('notice-box', config.notice_content || config.announce || '暂无公告');
    
    const contact = config.contact_info || '<p>暂无联系方式</p>';
    setHtml('contact-box', contact);
    setHtml('mobile-contact-content', contact);

    if (window.innerWidth < 992 && document.getElementById('products-list-area')) {
        const noticeModule = document.getElementById('notice-module-box');
        const mainContent = document.querySelector('.col-lg-9');
        if (noticeModule && mainContent) {
            mainContent.prepend(noticeModule);
            noticeModule.classList.remove('d-none');
        }
    }
}

// Data: Helpers
function renderSidebarTopSales(allProducts) { 
    const el = document.getElementById('top-sales-list');
    if(!el || !allProducts) return;
    const list = [...allProducts].sort((a,b) => (b.variants[0]?.sales_count||0) - (a.variants[0]?.sales_count||0)).slice(0,5);
    el.innerHTML = list.length ? list.map(p => `
        <a href="/product.html?id=${p.id}" class="top-item">
            <img src="${p.image_url}" class="top-img">
            <div class="top-info"><div class="top-title">${p.name}</div><div class="top-price">¥${p.variants[0]?.price}</div></div>
        </a>`).join('') : '<div class="text-muted small text-center">暂无数据</div>';
}
function renderSidebarTagCloud(products) {
    const el = document.getElementById('tag-cloud-list');
    if(!el) return;
    const tags = new Set();
    products.forEach(p => (p.tags||'').split(',').forEach(t => {
        const clean = t.trim().split('#')[0].split(/\s+/)[0];
        if(clean && !clean.startsWith('b1') && !clean.startsWith('b2')) tags.add(clean);
    }));
    el.innerHTML = tags.size ? Array.from(tags).map(t => 
        `<span class="tag-cloud-item" ${typeof filterByTag === 'function' ? `onclick="filterByTag('${t}')"` : ''}>${t}</span>`
    ).join('') : '<div class="text-muted small text-center">暂无标签</div>';
}
function renderSidebarArticleCats(articles) {
    const el = document.getElementById('article-cat-list');
    if(el && articles?.length) {
        const cats = [...new Set(articles.map(a=>a.category_name).filter(Boolean))];
        el.innerHTML = cats.length ? cats.map(c=>`<a href="/articles.html?cat=${encodeURIComponent(c)}">${c}</a>`).join('') : '<div class="text-muted small">暂无分类</div>';
    }
}

// Cart & Top
function loadCartBadge() {
    try { updateCartBadge(JSON.parse(localStorage.getItem('tbShopCart') || '[]').length); } catch(e){}
}
function updateCartBadge(n) {
    ['cart-badge-mobile', 'cart-badge-pc', 'cart-badge-pc-product'].forEach(id => {
        const el = document.getElementById(id);
        if(el) { el.innerText = n > 99 ? '99+' : n; el.style.display = n > 0 ? 'block' : 'none'; }
    });
}
// Back to Top
document.addEventListener('DOMContentLoaded', () => {
    if(document.getElementById('back-to-top-btn')) return;
    const btn = document.createElement('div');
    btn.id = 'back-to-top-btn'; btn.className = 'back-to-top-btn'; btn.innerHTML = '<i class="fa fa-arrow-up"></i>';
    document.body.appendChild(btn);
    btn.onclick = () => window.scrollTo({top:0, behavior:'smooth'});
    window.onscroll = () => btn.classList.toggle('show', window.scrollY > 300);
});
