// =============================================
// === themes/TBshop/files/common.js
// === (全局共享JS)
// === [购物车-升级版]
// =============================================

// --- 1. UI交互逻辑：Sticky Sidebar ---
let sidebar = null;
const sidebarOptions = {
    topSpacing: 80,
    bottomSpacing: 20,
    // 匹配首页和商品页的侧边栏容器
    containerSelector: '#main-content-row, #main-content-row-pc', 
    innerWrapperSelector: '.sidebar-inner'
};

/**
 * 检查侧边栏高度并激活/销毁粘性滚动
 */
function checkSidebarStatus() {
    const sidebarWrapper = document.getElementById('sidebar-wrapper');
    const sidebarInner = sidebarWrapper ? sidebarWrapper.querySelector('.sidebar-inner') : null;
    // 匹配首页或商品页的主要内容区域
    const productArea = document.getElementById('products-list-area') || document.querySelector('.col-lg-9'); 
    
    if (!sidebarInner || !productArea) return;

    // 确保左侧有一个基础最小高度
    productArea.style.minHeight = '400px';

    const sbHeight = sidebarInner.offsetHeight;
    const contentHeight = productArea.offsetHeight;
    const isWideScreen = window.innerWidth >= 992;

    // 如果内容高度不足或屏幕太窄，则销毁
    if (contentHeight < sbHeight || !isWideScreen) {
        if (sidebar) {
            sidebar.destroy();
            sidebar = null;
        }
    } else { // 否则，激活
        if (!sidebar) {
            if (typeof StickySidebar !== 'undefined') {
                sidebar = new StickySidebar('#sidebar-wrapper', sidebarOptions);
            }
        } else {
            sidebar.updateSticky();
        }
    }
}

// 页面加载与窗口调整时检查状态
window.addEventListener('load', checkSidebarStatus);
window.addEventListener('resize', checkSidebarStatus);


// --- 2. UI交互逻辑：页脚年份 ---
try {
    const yearEl = document.getElementById('year');
    if (yearEl) yearEl.innerText = new Date().getFullYear();
} catch (e) {}


// --- 3. UI交互逻辑：共享的搜索 ---
/**
 * 执行搜索
 * @param {string} source 'pc' or 'mobile'
 */
function doSearch(source = 'pc') {
    const pcInput = document.getElementById('search-input');
    const mobileInput = document.getElementById('mobile-search-input');
    
    let keyword = '';
    if (source === 'mobile' && mobileInput) {
        keyword = mobileInput.value.toLowerCase().trim();
    } else if (pcInput) {
        keyword = pcInput.value.toLowerCase().trim();
    }
    
    // 检查是否在首页 (通过 allProducts 和 renderSingleGrid 是否存在来判断)
    if (typeof renderSingleGrid === 'function' && typeof allProducts !== 'undefined') {
        // 在首页：执行JS筛选
        if (!keyword) { 
            if (typeof renderCategorizedView === 'function') renderCategorizedView('all'); 
            return; 
        }
        const filtered = allProducts.filter(p => p.name.toLowerCase().includes(keyword) || (p.description && p.description.toLowerCase().includes(keyword)));
        renderSingleGrid(filtered, `"${keyword}" 的搜索结果`);

        if (source === 'mobile') {
            toggleMobileSearch(false); 
        }
    } else {
        // 不在首页：跳转到首页进行搜索
        if (!keyword) return;
        window.location.href = `/?search=${encodeURIComponent(keyword)}`;
    }
}

// 绑定全局搜索事件
document.addEventListener('DOMContentLoaded', () => {
    const pcSearchInput = document.getElementById('search-input');
    const mobileSearchInput = document.getElementById('mobile-search-input');
    const pcSearchBtn = document.querySelector('.tb-search-btn'); // 电脑端搜索按钮
    const mobileSearchExecBtn = document.getElementById('mobile-search-exec-btn'); // 移动端搜索按钮

    if (pcSearchInput) {
        pcSearchInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') doSearch('pc');
        });
    }
    if (pcSearchBtn) {
        // 注意：您 HTML 中的 pc 按钮 onclick="doSearch('pc')" 已经绑定，
        // 但使用 addEventListener 是更推荐的方式
        pcSearchBtn.onclick = () => doSearch('pc');
    }
    
    if (mobileSearchInput) {
        mobileSearchInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') doSearch('mobile');
        });
    }
    if (mobileSearchExecBtn) { // 假设移动端搜索栏旁有个按钮
         mobileSearchExecBtn.onclick = () => doSearch('mobile');
    }
});


// --- 4. UI交互逻辑：移动端面板 ---
/**
 * 通用面板开关
 * @param {string} panelId 
 * @param {string} overlayId 
 * @param {boolean} forceShow 
 */
function togglePanel(panelId, overlayId, forceShow = null) {
    const panel = document.getElementById(panelId);
    const overlay = document.getElementById(overlayId);
    if (!panel || !overlay) return;

    let shouldShow = (typeof forceShow === 'boolean') ? forceShow : !panel.classList.contains('show');

    if (shouldShow) {
        panel.classList.add('show');
        overlay.classList.add('show');
    } else {
        panel.classList.remove('show');
        overlay.classList.remove('show');
    }
}

/**
 * 移动端搜索栏开关
 * @param {boolean} forceShow 
 */
function toggleMobileSearch(forceShow = null) {
    const searchDropdown = document.querySelector('.mobile-search-dropdown');
    const searchOverlay = document.getElementById('mobile-search-overlay');
    if (!searchDropdown || !searchOverlay) return;
    
    let show = (forceShow === null) ? !searchDropdown.classList.contains('show') : forceShow;

    if (show) {
        searchDropdown.classList.add('show');
        searchOverlay.classList.add('show');
    } else {
        searchDropdown.classList.remove('show');
        searchOverlay.classList.remove('show');
    }
}

// 绑定所有移动端面板事件
document.addEventListener('DOMContentLoaded', () => {
    // 侧边栏菜单
    const mobileMenuBtn = document.getElementById('mobile-menu-btn');
    const mobileOverlay = document.getElementById('mobile-overlay');
    const mobileSidebarCloseBtn = document.getElementById('mobile-sidebar-close-btn');
    // 搜索
    const mobileSearchBtn = document.getElementById('mobile-search-btn');
    const mobileSearchOverlay = document.getElementById('mobile-search-overlay');
    // 联系方式 (假设首页有 mobile-contact-btn)
    const mobileContactBtn = document.getElementById('mobile-contact-btn'); 
    const mobileContactCloseBtn = document.getElementById('mobile-contact-close-btn');
    const mobileContactOverlay = document.getElementById('mobile-contact-overlay');

    if (mobileMenuBtn) mobileMenuBtn.addEventListener('click', () => togglePanel('mobile-sidebar', 'mobile-overlay'));
    if (mobileOverlay) mobileOverlay.addEventListener('click', () => togglePanel('mobile-sidebar', 'mobile-overlay', false));
    if (mobileSidebarCloseBtn) mobileSidebarCloseBtn.addEventListener('click', () => togglePanel('mobile-sidebar', 'mobile-overlay', false));

    if (mobileSearchBtn) mobileSearchBtn.addEventListener('click', () => toggleMobileSearch());
    if (mobileSearchOverlay) mobileSearchOverlay.addEventListener('click', () => toggleMobileSearch(false));

    if (mobileContactBtn) mobileContactBtn.addEventListener('click', () => togglePanel('mobile-contact-sheet', 'mobile-contact-overlay'));
    if (mobileContactCloseBtn) mobileContactCloseBtn.addEventListener('click', () => togglePanel('mobile-contact-sheet', 'mobile-contact-overlay', false));
    if (mobileContactOverlay) mobileContactOverlay.addEventListener('click', () => togglePanel('mobile-contact-sheet', 'mobile-contact-overlay', false));

    // 滚动时关闭弹窗
    window.addEventListener('scroll', () => {
        if (document.querySelector('.mobile-search-dropdown')?.classList.contains('show')) {
            toggleMobileSearch(false);
        }
        if (document.getElementById('mobile-contact-sheet')?.classList.contains('show')) {
            togglePanel('mobile-contact-sheet', 'mobile-contact-overlay', false);
        }
    }, { passive: true });
});


// --- 5. UI交互逻辑：高亮滚动 (用于SKU) ---
/**
 * 辅助函数 - 高亮并滚动
 * @param {string | HTMLElement} elementId 
 */
function highlightAndScroll(elementId) {
    const el = (typeof elementId === 'string') ? document.getElementById(elementId) : elementId;
    if (!el) return;
    
    const skuBody = el.closest('.sku-body');
    if (skuBody) {
        skuBody.scrollTo({
            top: el.offsetTop - skuBody.offsetTop - 15,
            behavior: 'smooth'
        });
    }
    
    const input = el.tagName === 'INPUT' ? el : el.querySelector('input');
    if (input) input.focus();

    el.style.transition = 'none';
    el.style.backgroundColor = '#fff5f7';
    setTimeout(() => {
        el.style.transition = 'background-color 0.5s ease';
        el.style.backgroundColor = 'transparent';
        setTimeout(() => el.style.transition = 'none', 500);
    }, 100);
}


// =============================================
// === 共享数据渲染逻辑
// =============================================

/**
 * 渲染PC和移动端的Logo和名称
 * [修改] 增加PC端购物车图标
 * @param {object} config 
 */
function renderGlobalHeaders(config) {
    if (document.title.includes("商品详情") == false) {
         document.title = config.site_name || '商店首页';
    }

    // --- PC端Logo/名称 ---
    const logoEl = document.getElementById('site-logo');
    const nameWrapEl = document.getElementById('site-name-wrap');
    const nameTextEl = document.getElementById('header-site-name');
    
    if (nameTextEl) nameTextEl.innerText = config.site_name || 'TB Shop';
    if (document.getElementById('footer-name')) {
        document.getElementById('footer-name').innerText = config.site_name || 'TB Shop';
    }

    const showName = config.show_site_name === '1';
    const showLogo = config.show_site_logo === '1';

    if (nameWrapEl) {
        if (!showName && !showLogo) {
            nameWrapEl.classList.remove('d-none');
        } else {
            if (showLogo && config.site_logo && logoEl) {
                logoEl.src = config.site_logo;
                logoEl.classList.remove('d-none');
            }
            if (showName) {
                nameWrapEl.classList.remove('d-none');
            }
        }
    }

    // --- 移动端Logo/名称 ---
    const mobileLogoEl = document.getElementById('mobile-logo-img');
    const mobileNameWrapEl = document.getElementById('mobile-site-name-wrap');
    const mobileNameTextEl = document.getElementById('mobile-header-site-name');
    
    if (mobileNameTextEl) mobileNameTextEl.innerText = config.site_name || 'TB Shop';
    
    if (mobileNameWrapEl) {
        if (!showName && !showLogo) {
            mobileNameWrapEl.classList.remove('d-none');
        } else {
            if (showLogo && config.site_logo && mobileLogoEl) {
                mobileLogoEl.src = config.site_logo;
                mobileLogoEl.classList.remove('d-none');
            }
            if (showName) {
                mobileNameWrapEl.classList.remove('d-none');
            }
        }
    }

    // --- [新增] 在PC端头部右侧添加购物车图标 ---
    const headerRight = document.querySelector('.tb-header .header-right');
    if (headerRight && !document.getElementById('cart-btn-pc')) { // 检查是否已存在
        const cartBtnHtml = `
        <a href="/cart.html" class="icon-btn-pc" id="cart-btn-pc" style="position: relative; margin-left: 0px; color: #ff0036; text-decoration: none;">
            <i class="far fa-shopping-cart" style="font-size: 20px;"></i>
            <span id="cart-badge-pc" class="badge bg-danger rounded-pill" style="position: absolute; top: -8px; right: -10px; font-size: 9px; padding: 2px 4px; display: none;">0</span>
        </a>`;
        
        // 插入到“登录”按钮之前
        const loginBtn = headerRight.querySelector('.btn-login');
        if (loginBtn) {
            loginBtn.insertAdjacentHTML('beforebegin', cartBtnHtml);
            loginBtn.style.marginLeft = "15px"; // 确保登录按钮也有间距
        } else {
            headerRight.innerHTML += cartBtnHtml; // 降级处理
        }
    }
    
    // [新增] 页面加载时立即更新一次角标
    loadCartBadge();
}

/**
 * 渲染公告和联系方式 (PC侧边栏 + 移动端)
 * @param {object} config 
 */
function renderSidebarNoticeContact(config) {
    // --- 公告 ---
    const notice = config.notice_content || config.announce;
    const noticeBox = document.getElementById('notice-box');
    if (noticeBox && notice) {
        noticeBox.innerHTML = notice;
    }

    // --- 联系方式 ---
    const contactInfo = config.contact_info;
    const contactModulePC = document.getElementById('contact-module-box');
    const contactBoxPC = document.getElementById('contact-box');
    const contactContentMobile = document.getElementById('mobile-contact-content');

    if (contactInfo) {
        if (contactBoxPC) contactBoxPC.innerHTML = contactInfo;
        if (contactContentMobile) contactContentMobile.innerHTML = contactInfo;
    } else {
        if (contactModulePC) contactModulePC.style.display = 'none';
        if (contactContentMobile) contactContentMobile.innerHTML = '<p>暂无联系方式</p>';
    }

    // --- 移动端内容重排：移动公告到顶部 (仅在首页模板中) ---
    if (window.innerWidth < 992 && document.getElementById('products-list-area')) {
        const noticeModule = document.getElementById('notice-module-box');
        const mainContent = document.querySelector('.col-lg-9');
        if (noticeModule && mainContent) {
            mainContent.prepend(noticeModule);
            noticeModule.classList.remove('d-none');
        }
    }
}

/**
 * 渲染侧边栏 - 销量排行
 * @param {Array} allProducts 
 */
function renderSidebarTopSales(allProducts) {
    const topListEl = document.getElementById('top-sales-list');
    if (!topListEl) return;

    const topProducts = [...allProducts].sort((a, b) => {
        const salesA = a.variants.reduce((s, v) => s + (v.sales_count||0), 0);
        const salesB = b.variants.reduce((s, v) => s + (v.sales_count||0), 0);
        return salesB - salesA;
    }).slice(0, 5);

    if (topProducts.length > 0) {
        topListEl.innerHTML = topProducts.map(p => {
            const mainImg = p.image_url || (p.variants[0] && p.variants[0].image_url) || 'https://via.placeholder.com/50';
            const price = p.variants[0] ? p.variants[0].price : 0;
            return `
                <a href="/product.html?id=${p.id}" class="top-item">
                    <img src="${mainImg}" class="top-img">
                    <div class="top-info">
                        <div class="top-title">${p.name}</div>
                        <div class="top-price">¥${price}</div>
                    </div>
                </a>
            `;
        }).join('');
    } else {
        topListEl.innerHTML = '<div class="text-muted small text-center">暂无数据</div>';
    }
}

/**
 * 辅助函数 - 解析Tags (被 main-index 和 common 调用)
 * @param {string} tagStr 
 */
function parseTags(tagStr) {
    if (!tagStr) return '';
    const tags = tagStr.split(',').map(t => t.trim()).filter(t => t);
    return tags.map(t => {
        const parts = t.split(/\s+/); 
        let borderColor = 'transparent';
        let bgColor = '#f5f5f5';
        let text = '';
        let textColor = '#333';
        parts.forEach(part => {
            if (part.startsWith('b1')) borderColor = part.split('#')[1] ? '#' + part.split('#')[1] : borderColor;
            else if (part.startsWith('b2')) bgColor = part.split('#')[1] ? '#' + part.split('#')[1] : bgColor;
            else if (part.includes('#')) {
                const txtParts = part.split('#');
                text = txtParts[0];
                textColor = '#' + txtParts[1];
            } else {
                text = part; 
            }
        });
        if (!text) return '';
        const style = `border-color:${borderColor}; background-color:${bgColor}; color:${textColor}`;
        return `<span class="dynamic-tag" style="${style}">${text}</span>`;
    }).join('');
}

/**
 * 渲染侧边栏 - 标签云
 * @param {Array} products 
 */
function renderSidebarTagCloud(products) {
    const listEl = document.getElementById('tag-cloud-list');
    if (!listEl) return;

    const tagSet = new Set();
    products.forEach(p => {
        if(p.tags) {
            p.tags.split(',').forEach(tStr => {
                const parts = tStr.trim().split(/\s+/);
                let text = '';
                parts.forEach(part => {
                   if(!part.startsWith('b1') && !part.startsWith('b2')) {
                       text = part.split('#')[0]; 
                   }
                });
                if(text) tagSet.add(text);
            });
        }
    });

    if(tagSet.size === 0) {
        listEl.innerHTML = '<div class="text-muted small w-100 text-center">暂无标签</div>';
        return;
    }
    
    listEl.innerHTML = Array.from(tagSet).map(tag => {
        let clickHandler = '';
        // 仅在 index 页面 (存在 filterByTag 函数) 时添加点击事件
        if (typeof filterByTag === 'function') {
             clickHandler = `onclick="filterByTag('${tag}')"`;
        }
        return `<span class="tag-cloud-item" ${clickHandler}>${tag}</span>`;
    }).join('');
}


/**
 * 渲染侧边栏 - 教程分类和热门文章
 * @param {Array} articles 
 */
function renderSidebarArticleCats(articles) {
    // 热门文章 (仅首页有)
    const hotListEl = document.getElementById('hot-articles-list');
    if (hotListEl) {
        if (articles.length > 0) {
            hotListEl.innerHTML = articles.slice(0, 8).map((a, index) => `
                <div class="hot-article-item">
                    <a href="/article.html?id=${a.id}" class="text-truncate" style="flex:1">
                        <span class="hot-rank ${index < 3 ? 'top-3' : ''}">${index + 1}</span>
                        ${a.title}
                    </a>
                    <small class="text-muted ms-2">${new Date(a.created_at * 1000).toLocaleDateString()}</small>
                </div>
            `).join('');
        }
    }

    // 教程分类 (首页和商品页共享)
    const artCatListEl = document.getElementById('article-cat-list');
    if (artCatListEl) {
        const artCats = [...new Set(articles.map(a => a.category_name))].filter(Boolean);
        if (artCats.length > 0) {
            artCatListEl.innerHTML = artCats.map(c => `<a href="#">${c}</a>`).join('');
        } else {
            artCatListEl.innerHTML = '<div class="text-muted small">暂无分类</div>';
        }
    }
}


// =============================================
// === [新增] 全局购物车角标函数 ===
// =============================================

/**
 * [新增] 从 localStorage 读取购物车信息并更新角标
 */
function loadCartBadge() {
    try {
        let cart = JSON.parse(localStorage.getItem('tbShopCart') || '[]');
        updateCartBadge(cart.length);
    } catch (e) {
        console.error("Failed to load cart badge", e);
    }
}

/**
 * [更新] 更新所有购物车角标（移动端、PC头部、PC商品页）
 */
function updateCartBadge(count) {
    const badgeMobile = document.getElementById('cart-badge-mobile'); // 移动端底部
    const badgePC = document.getElementById('cart-badge-pc'); // PC 顶部导航
    const badgePCProduct = document.getElementById('cart-badge-pc-product'); // [新增] PC 商品详情页
    
    const badges = [badgeMobile, badgePC, badgePCProduct];
    
    badges.forEach(badge => {
        if (badge) {
            if (count > 0) {
                badge.innerText = count > 99 ? '99+' : count;
                badge.style.display = 'block'; // Bootstrap badge 默认是 inline-block，这里强制显示
            } else {
                badge.style.display = 'none';
            }
        }
    });
}
