// =============================================
// === themes/TBshop/files/main-index.js
// === (首页专属业务逻辑 - 已优化：去除侧边栏冗余逻辑)
// =============================================

// 全局变量 (供搜索和筛选使用)
let allProducts = []; 
let allCategories = [];

/**
 * 首页初始化入口 (由 index.html 调用)
 */
async function initHomePage() {
    const prodListArea = document.getElementById('products-list-area');

    // 1. 加载分类数据
    try {
        const catRes = await fetch('/api/shop/categories');
        allCategories = await catRes.json();
        
        // 渲染分类导航条 (PC & Mobile)
        renderCategoryTabs();
    } catch(e) { 
        console.error('Categories load failed:', e); 
    }

    // 2. 加载商品数据
    try {
        const prodRes = await fetch('/api/shop/products');
        allProducts = await prodRes.json();

        // 渲染默认视图 (全部商品)
        renderCategorizedView('all');

        // [修改] 侧边栏填充逻辑已移至 common.js 全局处理，此处不再重复调用
        // 避免双重渲染导致页面抖动或资源浪费

    } catch (e) {
        console.error('Products load failed:', e);
        if (prodListArea) prodListArea.innerHTML = '<div class="text-center py-5 text-danger">商品加载失败，请刷新重试</div>';
    }

    // 3. 加载文章数据 (用于首页中间的教程推荐)
    try {
        const artRes = await fetch('/api/shop/articles/list');
        const articles = await artRes.json();

        // 填充首页特有的“热门教程”模块 (这个是首页独有的，必须保留)
        renderHotArticlesHome(articles);
        
        // [修改] 侧边栏分类填充已移至 common.js 全局处理，此处不再重复调用

    } catch (e) { console.warn('Articles load failed:', e); }
}


// =============================================
// === 数据渲染逻辑
// =============================================

/**
 * 渲染分类导航 (PC药丸 + 移动端侧滑菜单)
 */
function renderCategoryTabs() {
    const pcContainer = document.getElementById('category-container');
    const mobileContainer = document.getElementById('mobile-category-list');
    
    // 基础选项
    let pcHtml = '<div class="cat-pill active" onclick="filterCategory(\'all\', this)">全部商品</div>';
    // 移动端保留顶部的固定链接，只追加分类
    let mobileHtml = ''; 

    allCategories.forEach(c => {
        // 这里假设分类对象有 name 和 id，可能有 image_url
        const icon = c.image_url ? `<img src="${c.image_url}">` : '';
        
        pcHtml += `<div class="cat-pill" onclick="filterCategory(${c.id}, this)">${icon}${c.name}</div>`;
        
        mobileHtml += `
            <a href="#" onclick="event.preventDefault(); filterCategory(${c.id}); togglePanel('mobile-sidebar', 'mobile-overlay', false);">
                ${icon || '<i class="fa fa-angle-right"></i>'} ${c.name}
            </a>
        `;
    });

    if (pcContainer) pcContainer.innerHTML = pcHtml;
    // 移动端：追加到现有菜单后面 (现有菜单在 common.js 里已生成基础结构)
    if (mobileContainer) {
        // 在“教程文章”之前或之后插入分类，或者直接追加
        mobileContainer.insertAdjacentHTML('beforeend', '<div class="border-top my-2 pt-2 text-muted small px-2">商品分类</div>' + mobileHtml);
    }
}

/**
 * 渲染首页热门文章列表 (首页特有模块 - 中间部分)
 */
function renderHotArticlesHome(articles) {
    const listEl = document.getElementById('hot-articles-list');
    if (!listEl) return;

    if (articles.length === 0) {
        listEl.innerHTML = '<div class="text-muted small text-center">暂无文章</div>';
        return;
    }

    // 取前5篇
    listEl.innerHTML = articles.slice(0, 5).map((a, idx) => `
        <div class="d-flex justify-content-between align-items-center py-2 border-bottom border-light">
            <a href="/article.html?id=${a.id}" class="text-truncate text-dark" style="max-width: 85%;">
                <span class="badge bg-light text-dark border me-2">${idx + 1}</span>${a.title}
            </a>
            <small class="text-muted">${new Date(a.created_at * 1000).toLocaleDateString()}</small>
        </div>
    `).join('');
}

/**
 * 生成单个商品卡片 HTML
 */
function getProductCardHtml(p) {
    const mainVariant = p.variants[0] || {};
    const totalSales = p.variants.reduce((sum, v) => sum + (v.sales_count || 0), 0);
    const totalStock = p.variants.reduce((sum, v) => sum + (v.stock || 0), 0);
    const imgUrl = p.image_url || mainVariant.image_url || '/themes/TBshop/assets/no-image.png'; // 默认图
    const price = mainVariant.price || '0.00';
    
    // 标签处理 (调用 common.js 的 parseTags，如果存在)
    // 注意：如果 common.js 没有 parseTags，这里会报错，建议做容错，或者确保 common.js 里有
    // 这里简单处理，直接返回空或手动解析
    const tagsHtml = (typeof parseTags === 'function') ? parseTags(p.tags) : renderTagsLocal(p.tags); 

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

// 本地简易标签渲染 (防止 common.js 没加载到 parseTags)
function renderTagsLocal(tags) {
    if (!tags) return '';
    const arr = typeof tags === 'string' ? tags.split(',') : tags;
    return arr.map(t => {
        const clean = t.split('#')[0].trim();
        if(!clean || clean.startsWith('b1') || clean.startsWith('b2')) return '';
        return `<span class="dynamic-tag" style="border:1px solid #ff5000;color:#ff5000;">${clean}</span>`;
    }).join('');
}

/**
 * 渲染分类视图 (按分类分组显示)
 * @param {string|number} filterId 'all' 或分类ID
 */
function renderCategorizedView(filterId) {
    const area = document.getElementById('products-list-area');
    if (!area) return;
    area.innerHTML = ''; 

    let catsToShow = (filterId === 'all') ? allCategories : allCategories.filter(c => c.id == filterId);
    let hasData = false;

    catsToShow.forEach(cat => {
        const products = allProducts.filter(p => p.category_id == cat.id);
        if (products.length > 0) {
            hasData = true;
            area.innerHTML += `
                <div class="module-box">
                    <div class="module-title">${cat.name}</div>
                    <div class="taobao-grid">
                        ${products.map(getProductCardHtml).join('')}
                    </div>
                </div>
            `;
        }
    });

    if (!hasData) {
        area.innerHTML = `<div class="module-box"><div class="text-center py-5 w-100 text-muted">该分类下暂无商品</div></div>`;
    }
}

/**
 * 渲染单个网格 (用于搜索结果或标签筛选)
 * 注意：此函数会被 common.js 中的 doSearch 调用
 */
function renderSingleGrid(products, title) {
    const area = document.getElementById('products-list-area');
    if (!area) return;
    
    if (products.length === 0) {
        area.innerHTML = `<div class="module-box"><div class="text-center py-5 w-100 text-muted">未找到 "${title}" 相关商品</div></div>`;
    } else {
        area.innerHTML = `
            <div class="module-box">
                <div class="module-title">${title} <small class="text-muted fw-normal ms-2" style="font-size:12px; cursor:pointer;" onclick="renderCategorizedView('all')">[清除筛选]</small></div>
                <div class="taobao-grid">
                    ${products.map(getProductCardHtml).join('')}
                </div>
            </div>
        `;
    }
}


// =============================================
// === 交互逻辑
// =============================================

/**
 * 切换分类 (PC端点击药丸)
 */
function filterCategory(id, el) {
    // 1. 样式切换
    if (el) {
        document.querySelectorAll('.cat-pill').forEach(e => e.classList.remove('active'));
        el.classList.add('active');
    } else {
        // 如果是通过移动端菜单触发，没有 el，则重置所有状态
        document.querySelectorAll('.cat-pill').forEach(e => e.classList.remove('active'));
    }
    
    // 2. 渲染内容
    renderCategorizedView(id);
    
    // 3. 滚动到顶部
    const mainRow = document.getElementById('main-content-row');
    if(mainRow) mainRow.scrollIntoView({ behavior: 'smooth' });
}

/**
 * 标签筛选 (点击侧边栏标签云)
 */
function filterByTag(tag) {
    // 高亮侧边栏标签
    document.querySelectorAll('.tag-cloud-item').forEach(el => {
        if(el.innerText === tag) el.classList.add('active');
        else el.classList.remove('active');
    });
    
    // 取消分类高亮
    document.querySelectorAll('.cat-pill').forEach(e => e.classList.remove('active'));
    
    // 筛选数据
    const filtered = allProducts.filter(p => p.tags && p.tags.includes(tag));
    renderSingleGrid(filtered, `标签: ${tag}`);
    
    // 滚动
    const mainRow = document.getElementById('main-content-row');
    if(mainRow) mainRow.scrollIntoView({ behavior: 'smooth' });
}
