// 全局变量，用于控制 Sticky 实例
let sidebar = null;

// 配置参数
const sidebarOptions = {
    topSpacing: 80,
    bottomSpacing: 20,
    containerSelector: '#main-content-row',
    innerWrapperSelector: '.sidebar-inner'
};

// 核心函数：智能判断高度，决定是开启还是销毁滑动
function checkSidebarStatus() {
    const sidebarInner = document.querySelector('.sidebar-inner');
    const productArea = document.getElementById('products-list-area');
    
    if (!sidebarInner || !productArea) return;

    // 1. 确保左侧有一个基础最小高度，避免测量误差
    productArea.style.minHeight = '400px';

    // 2. 获取实际高度
    const sbHeight = sidebarInner.offsetHeight;
    const contentHeight = productArea.offsetHeight;
    const isWideScreen = window.innerWidth >= 992;

    // 3. 如果左侧内容高度 < 右侧边栏高度，或者不是宽屏
    if (contentHeight < sbHeight || !isWideScreen) {
        // 销毁滑动实例（如果存在），让它变回普通静态布局
        if (sidebar) {
            sidebar.destroy();
            sidebar = null;
        }
    } else {
        // 左侧够长，可以开启滑动
        if (!sidebar) {
            sidebar = new StickySidebar('#sidebar-wrapper', sidebarOptions);
        } else {
            sidebar.updateSticky(); // 更新位置
        }
    }
}

// 页面加载与窗口调整时检查状态
window.addEventListener('load', checkSidebarStatus);
window.addEventListener('resize', checkSidebarStatus);

document.getElementById('year').innerText = new Date().getFullYear();

let allProducts = []; // 存储所有商品
let allCategories = []; // 存储所有分类

async function init() {
    // 1. 加载配置与公告
    try {
        const configRes = await fetch('/api/shop/config');
        const config = await configRes.json();
        document.title = config.site_name || '商店首页';
        
        // --- PC端Logo/名称 ---
        const logoEl = document.getElementById('site-logo');
        const nameWrapEl = document.getElementById('site-name-wrap');
        const nameTextEl = document.getElementById('header-site-name');
        
        nameTextEl.innerText = config.site_name || 'TB Shop';
        document.getElementById('footer-name').innerText = config.site_name || 'TB Shop';

        const showName = config.show_site_name === '1';
        const showLogo = config.show_site_logo === '1';

        if (!showName && !showLogo) {
            nameWrapEl.classList.remove('d-none');
        } else {
            if (showLogo && config.site_logo) {
                logoEl.src = config.site_logo;
                logoEl.classList.remove('d-none');
            }
            if (showName) {
                nameWrapEl.classList.remove('d-none');
            }
        }

        // --- 移动端Logo/名称 ---
        const mobileLogoEl = document.getElementById('mobile-logo-img');
        const mobileNameWrapEl = document.getElementById('mobile-site-name-wrap');
        const mobileNameTextEl = document.getElementById('mobile-header-site-name');
        
        mobileNameTextEl.innerText = config.site_name || 'TB Shop';
        
        if (!showName && !showLogo) {
            mobileNameWrapEl.classList.remove('d-none');
        } else {
            if (showLogo && config.site_logo) {
                mobileLogoEl.src = config.site_logo;
                mobileLogoEl.classList.remove('d-none');
            }
            if (showName) {
                mobileNameWrapEl.classList.remove('d-none');
            }
        }

        
        // --- 公告 ---
        const notice = config.notice_content || config.announce;
        if (notice) {
            document.getElementById('notice-box').innerHTML = notice;
        }

        // --- [修改] 联系方式 ---
        const contactInfo = config.contact_info;
        const contactModulePC = document.getElementById('contact-module-box');
        const contactContentMobile = document.getElementById('mobile-contact-content');

        if (contactInfo) {
            // 填充PC端
            document.getElementById('contact-box').innerHTML = contactInfo;
            // 填充移动端
            contactContentMobile.innerHTML = contactInfo;
        } else {
            // 如果没有设置，就隐藏PC端的这个模块
            if(contactModulePC) contactModulePC.style.display = 'none';
            // 移动端显示提示
            contactContentMobile.innerHTML = '<p>暂无联系方式</p>';
        }

        // --- 移动端内容重排：移动公告到顶部 ---
        if (window.innerWidth < 992) {
            const noticeModule = document.getElementById('notice-module-box');
            const mainContent = document.querySelector('.col-lg-9');
            if (noticeModule && mainContent) {
                mainContent.prepend(noticeModule);
                noticeModule.classList.remove('d-none');
            }
        }

    } catch (e) { console.error(e); }

    // 2. 加载分类
    try {
        const catRes = await fetch('/api/shop/categories');
        allCategories = await catRes.json(); 
        
        const catContainer = document.getElementById('category-container');
        const mobileCatContainer = document.getElementById('mobile-category-list');
        
        let pc_html = '<div class="cat-pill active" onclick="filterCategory(\'all\', this)">全部商品</div>';
        let mobile_html = '<a href="#" onclick="filterCategoryMobile(\'all\')">全部商品</a>';
        
        allCategories.forEach(c => {
            const pcImgTag = c.image_url ? `<img src="${c.image_url}" alt="${c.name}">` : '';
            const mobileImgTag = c.image_url ? `<img src="${c.image_url}" alt="${c.name}">` : '';
            
            pc_html += `<div class="cat-pill" onclick="filterCategory(${c.id}, this)">${pcImgTag}${c.name}</div>`;
            mobile_html += `<a href="#" onclick="filterCategoryMobile(${c.id})">${mobileImgTag}${c.name}</a>`;
        });
        catContainer.innerHTML = pc_html;
        mobileCatContainer.innerHTML = mobile_html;

    } catch(e) { console.error('Failed to load categories:', e); }

    // 3. 加载商品数据
    try {
        const prodRes = await fetch('/api/shop/products');
        allProducts = await prodRes.json(); 

        // 渲染商品视图
        renderCategorizedView('all');

        // 渲染标签云
        renderTagCloud(allProducts);

        // 渲染销量排行
        const topProducts = [...allProducts].sort((a, b) => {
            const salesA = a.variants.reduce((s, v) => s + (v.sales_count||0), 0);
            const salesB = b.variants.reduce((s, v) => s + (v.sales_count||0), 0);
            return salesB - salesA;
        }).slice(0, 5);

        const topListEl = document.getElementById('top-sales-list');
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

    } catch (e) {
        console.error(e);
        document.getElementById('products-list-area').innerHTML = '加载失败';
    }

    // 4. 加载文章数据
    try {
        const artRes = await fetch('/api/shop/articles/list');
        const articles = await artRes.json();
        const hotListEl = document.getElementById('hot-articles-list');
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
        const artCats = [...new Set(articles.map(a => a.category_name))].filter(Boolean);
        const artCatListEl = document.getElementById('article-cat-list');
        if (artCats.length > 0) {
            artCatListEl.innerHTML = artCats.map(c => `<a href="#">${c}</a>`).join('');
        } else {
            artCatListEl.innerHTML = '<div class="text-muted small">暂无分类</div>';
        }
    } catch (e) {}

    // 数据全部加载完成后，再次检查高度状态
    setTimeout(checkSidebarStatus, 500);
}

function getProductCardHtml(p) {
    const mainVariant = p.variants[0] || {};
    const totalSales = p.variants.reduce((sum, v) => sum + (v.sales_count || 0), 0);
    const totalStock = p.variants.reduce((sum, v) => sum + (v.stock || 0), 0);

    const imgUrl = p.image_url || mainVariant.image_url || 'https://via.placeholder.com/300x300/e0e0e0/999999?text=No+Image';
    const price = mainVariant.price || '0.00';
    const tagsHtml = parseTags(p.tags);
    return `
        <a href="/product.html?id=${p.id}" class="tb-card">
            <div class="tb-img-wrap">
                <img src="${imgUrl}" alt="${p.name}" class="tb-img" loading="lazy">
            </div>
            <div class="tb-info">
                <div class="tb-title">${p.name}</div>
                <div class="tb-tags-row">${tagsHtml}</div>
                <div class="tb-price-row">
                    <span class="tb-price"><small>¥</small>${price}</span>
                    <span class="tb-sales">库存${totalStock} | 已售${totalSales}</span>
                </div>
            </div>
        </a>
    `;
}

// 渲染分类视图
function renderCategorizedView(filterId) {
    const area = document.getElementById('products-list-area');
    area.innerHTML = ''; 

    let categoriesToShow = [];
    
    if (filterId === 'all') {
        categoriesToShow = allCategories;
    } else {
        const targetCat = allCategories.find(c => c.id == filterId);
        if (targetCat) categoriesToShow = [targetCat];
    }

    let hasAnyProduct = false;

    categoriesToShow.forEach(cat => {
        const catProducts = allProducts.filter(p => p.category_id == cat.id);
        
        if (catProducts.length > 0) {
            hasAnyProduct = true;
            const sectionHtml = `
                <div class="module-box">
                    <div class="module-title">${cat.name}</div>
                    <div class="taobao-grid">
                        ${catProducts.map(p => getProductCardHtml(p)).join('')}
                    </div>
                </div>
            `;
            area.innerHTML += sectionHtml;
        }
    });

    if (!hasAnyProduct) {
        area.innerHTML = `<div class="module-box"><div class="text-center py-5 w-100 text-muted">暂无商品</div></div>`;
    }

    setTimeout(checkSidebarStatus, 100);
}

// 渲染单一大网格
function renderSingleGrid(products, title) {
    const area = document.getElementById('products-list-area');
    if (products.length === 0) {
        area.innerHTML = `<div class="module-box"><div class="text-center py-5 w-100">未找到相关商品</div></div>`;
    } else {
        const gridHtml = `
            <div class="module-box">
                <div class="module-title">${title}</div>
                <div class="taobao-grid">
                    ${products.map(p => getProductCardHtml(p)).join('')}
                </div>
            </div>
        `;
        area.innerHTML = gridHtml;
    }
    setTimeout(checkSidebarStatus, 100);
}

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
        return `<span class="dynamic-tag" style="border-color:${borderColor}; background-color:${bgColor}; color:${textColor}">${text}</span>`;
    }).join('');
}

function renderTagCloud(products) {
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

    const listEl = document.getElementById('tag-cloud-list');
    if(tagSet.size === 0) {
        listEl.innerHTML = '<div class="text-muted small w-100 text-center">暂无标签</div>';
        return;
    }
    listEl.innerHTML = Array.from(tagSet).map(tag => 
        `<span class="tag-cloud-item" onclick="filterByTag('${tag}')">${tag}</span>`
    ).join('');
}

function filterByTag(tag) {
    document.querySelectorAll('.tag-cloud-item').forEach(el => {
        if(el.innerText === tag) el.classList.add('active');
        else el.classList.remove('active');
    });
    document.querySelectorAll('.cat-pill').forEach(el => el.classList.remove('active')); 
    
    const filtered = allProducts.filter(p => p.tags && p.tags.includes(tag));
    renderSingleGrid(filtered, `标签: ${tag}`);
}

function doSearch(source = 'pc') {
    const inputId = (source === 'mobile') ? 'mobile-search-input' : 'search-input';
    const keyword = document.getElementById(inputId).value.toLowerCase().trim();
    
    if (!keyword) { 
        renderCategorizedView('all'); 
        return; 
    }
    
    const filtered = allProducts.filter(p => p.name.toLowerCase().includes(keyword) || (p.description && p.description.toLowerCase().includes(keyword)));
    renderSingleGrid(filtered, `"${keyword}" 的搜索结果`);

    if (source === 'mobile') {
        toggleMobileSearch(false); 
    }
}

document.getElementById('search-input').addEventListener('keypress', function (e) {
    if (e.key === 'Enter') doSearch('pc');
});

document.getElementById('mobile-search-input').addEventListener('keypress', function (e) {
    if (e.key === 'Enter') doSearch('mobile');
});


function filterCategory(id, el) {
    document.querySelectorAll('.cat-pill').forEach(e => e.classList.remove('active'));
    if(el) el.classList.add('active');

    document.querySelectorAll('.tag-cloud-item').forEach(e => e.classList.remove('active'));
    
    renderCategorizedView(id);
}

// --- [新增] 通用面板开关函数 ---
function togglePanel(panelId, overlayId, forceShow = null) {
    const panel = document.getElementById(panelId);
    const overlay = document.getElementById(overlayId);

    if (!panel || !overlay) {
        console.error("Toggle Error: 找不到元素", panelId, overlayId);
        return;
    }

    let shouldShow;
    if (typeof forceShow === 'boolean') {
        shouldShow = forceShow;
    } else {
        // 否则，反转当前状态
        shouldShow = !panel.classList.contains('show');
    }

    if (shouldShow) {
        panel.classList.add('show');
        overlay.classList.add('show');
    } else {
        panel.classList.remove('show');
        overlay.classList.remove('show');
    }
}


// --- 移动端交互函数 ---

function toggleMobileSearch(forceShow = null) {
    const searchDropdown = document.querySelector('.mobile-search-dropdown');
    const searchOverlay = document.getElementById('mobile-search-overlay');
    
    let show;
    if (forceShow === null) {
        show = !searchDropdown.classList.contains('show');
    } else {
        show = forceShow;
    }

    if (show) {
        searchDropdown.classList.add('show');
        searchOverlay.classList.add('show');
    } else {
        searchDropdown.classList.remove('show');
        searchOverlay.classList.remove('show');
    }
}

function filterCategoryMobile(id) {
    const pills = document.querySelectorAll('.cat-pill');
    let targetPill = null;
    
    let targetOnclick = (id === 'all') ? `filterCategory('all', this)` : `filterCategory(${id}, this)`;
    
    for (let pill of pills) {
        if (pill.getAttribute('onclick') === targetOncheck) {
            targetPill = pill;
            break;
        }
    }
    
    filterCategory(id, targetPill); 
    togglePanel('mobile-sidebar', 'mobile-overlay', false); 
}

document.getElementById('mobile-menu-btn').addEventListener('click', () => togglePanel('mobile-sidebar', 'mobile-overlay'));
document.getElementById('mobile-overlay').addEventListener('click', () => togglePanel('mobile-sidebar', 'mobile-overlay', false));
document.getElementById('mobile-sidebar-close-btn').addEventListener('click', () => togglePanel('mobile-sidebar', 'mobile-overlay', false));

document.getElementById('mobile-search-btn').addEventListener('click', () => toggleMobileSearch());
document.getElementById('mobile-search-overlay').addEventListener('click', () => toggleMobileSearch(false));

// [新增] 联系方式面板事件
document.getElementById('mobile-contact-close-btn').addEventListener('click', () => togglePanel('mobile-contact-sheet', 'mobile-contact-overlay', false));
document.getElementById('mobile-contact-overlay').addEventListener('click', () => togglePanel('mobile-contact-sheet', 'mobile-contact-overlay', false));


window.addEventListener('scroll', () => {
    if (document.querySelector('.mobile-search-dropdown').classList.contains('show')) {
        toggleMobileSearch(false);
    }
    // [修改] 滚动时关闭联系方式面板
    if (document.getElementById('mobile-contact-sheet').classList.contains('show')) {
        togglePanel('mobile-contact-sheet', 'mobile-contact-overlay', false);
    }
}, { passive: true });


init();
