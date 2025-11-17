// =============================================
// === themes/TBshop/files/main-index.js
// === (首页专属JS - 已精简)
// === [购物车-升级版]
// =============================================

let allProducts = []; // 存储所有商品 (仅首页使用)
let allCategories = []; // 存储所有分类

/**
 * 首页加载总入口
 */
async function init() {
    // 1. 加载配置与公告
    try {
        const configRes = await fetch('/api/shop/config');
        const config = await configRes.json();
        
        // 调用 common.js 中的函数
        if (typeof renderGlobalHeaders === 'function') {
            renderGlobalHeaders(config);
        }
        if (typeof renderSidebarNoticeContact === 'function') {
            renderSidebarNoticeContact(config);
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
        if (catContainer) catContainer.innerHTML = pc_html;
        if (mobileCatContainer) mobileCatContainer.innerHTML = mobile_html;

    } catch(e) { console.error('Failed to load categories:', e); }

    // 3. 加载商品数据
    try {
        const prodRes = await fetch('/api/shop/products');
        allProducts = await prodRes.json(); // 将数据存储在首页的 allProducts 变量中

        // 渲染首页商品视图
        renderCategorizedView('all');

        // 调用 common.js 中的函数来渲染侧边栏
        if (typeof renderSidebarTagCloud === 'function') {
            renderSidebarTagCloud(allProducts);
        }
        if (typeof renderSidebarTopSales === 'function') {
            renderSidebarTopSales(allProducts);
        }

    } catch (e) {
        console.error(e);
        const prodListArea = document.getElementById('products-list-area');
        if (prodListArea) prodListArea.innerHTML = '加载失败';
    }

    // 4. 加载文章数据
    try {
        const artRes = await fetch('/api/shop/articles/list');
        const articles = await artRes.json();

        // 调用 common.js 中的函数来渲染侧边栏
        if (typeof renderSidebarArticleCats === 'function') {
            renderSidebarArticleCats(articles);
        }
    } catch (e) {}

    // 5. 数据全部加载完成后，再次检查高度状态
    if (typeof checkSidebarStatus === 'function') {
        setTimeout(checkSidebarStatus, 500);
    }

    // --- [新增] 首页加载时也更新购物车角标 ---
    if (typeof loadCartBadge === 'function') {
        loadCartBadge();
    }
}

/**
 * (首页专属) 获取商品卡片HTML
 * @param {object} p 
 */
function getProductCardHtml(p) {
    const mainVariant = p.variants[0] || {};
    const totalSales = p.variants.reduce((sum, v) => sum + (v.sales_count || 0), 0);
    const totalStock = p.variants.reduce((sum, v) => sum + (v.stock || 0), 0);

    const imgUrl = p.image_url || mainVariant.image_url || 'https://via.placeholder.com/300x300/e0e0e0/999999?text=No+Image';
    const price = mainVariant.price || '0.00';
    
    // 调用 common.js 中的 parseTags
    const tagsHtml = (typeof parseTags === 'function') ? parseTags(p.tags) : ''; 
    
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

/**
 * (首页专属) 渲染分类视图
 * @param {string | number} filterId 
 */
function renderCategorizedView(filterId) {
    const area = document.getElementById('products-list-area');
    if (!area) return;
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

    if (typeof checkSidebarStatus === 'function') setTimeout(checkSidebarStatus, 100);
}

/**
 * (首页专属) 渲染单个大网格 (用于搜索或标签)
 * @param {Array} products 
 * @param {string} title 
 */
function renderSingleGrid(products, title) {
    const area = document.getElementById('products-list-area');
    if (!area) return;
    
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
    if (typeof checkSidebarStatus === 'function') setTimeout(checkSidebarStatus, 100);
}

/**
 * (首页专属) 按标签筛选
 * @param {string} tag 
 */
function filterByTag(tag) {
    document.querySelectorAll('.tag-cloud-item').forEach(el => {
        if(el.innerText === tag) el.classList.add('active');
        else el.classList.remove('active');
    });
    document.querySelectorAll('.cat-pill').forEach(el => el.classList.remove('active')); 
    
    const filtered = allProducts.filter(p => p.tags && p.tags.includes(tag));
    renderSingleGrid(filtered, `标签: ${tag}`);
}

/**
 * (首页专属) 按分类筛选 (PC)
 * @param {string | number} id 
 * @param {HTMLElement} el 
 */
function filterCategory(id, el) {
    document.querySelectorAll('.cat-pill').forEach(e => e.classList.remove('active'));
    if(el) el.classList.add('active');

    document.querySelectorAll('.tag-cloud-item').forEach(e => e.classList.remove('active'));
    
    renderCategorizedView(id);
}

/**
 * (首页专属) 按分类筛选 (Mobile)
 * @param {string | number} id 
 */
function filterCategoryMobile(id) {
    const pills = document.querySelectorAll('.cat-pill');
    let targetPill = null;
    
    let targetOnclick = (id === 'all') ? `filterCategory('all', this)` : `filterCategory(${id}, this)`;
    
    for (let pill of pills) {
        // 修正属性检查
        if (pill.getAttribute('onclick') === targetOnclick) {
            targetPill = pill;
            break;
        }
    }
    
    filterCategory(id, targetPill); 
    // 调用 common.js 的函数关闭面板
    if (typeof togglePanel === 'function') {
        togglePanel('mobile-sidebar', 'mobile-overlay', false); 
    }
}

// 启动首页加载
init();
