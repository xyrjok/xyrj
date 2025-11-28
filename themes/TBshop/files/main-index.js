// =============================================
// === themes/TBshop/files/main-index.js
// === (首页专属业务逻辑 - 完整修复版)
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
        
        // 渲染分类导航条 (仅 PC 端药丸，移动端侧栏现由 common.js 接管)
        renderCategoryTabs();
    } catch(e) { 
        console.error('Categories load failed:', e); 
    }

    // 2. 加载商品数据
    try {
        const prodRes = await fetch('/api/shop/products');
        allProducts = await prodRes.json();

        // [新增] 检查 URL 是否带有分类参数 (从移动端侧边栏跳转过来)
        const urlParams = new URLSearchParams(window.location.search);
        const catId = urlParams.get('cat');

        if (catId) {
            // 如果有 cat 参数，直接筛选该分类
            renderCategorizedView(catId);
            // (可选) 清除 URL 参数，避免刷新或点击返回时卡死在该分类
            if (window.history && window.history.replaceState) {
                window.history.replaceState({}, '', window.location.pathname);
            }
        } else {
            // 默认视图 (全部商品)
            renderCategorizedView('all');
        }

    } catch (e) {
        console.error('Products load failed:', e);
        if (prodListArea) prodListArea.innerHTML = '<div class="text-center py-5 text-danger">商品加载失败，请刷新重试</div>';
    }

    // 3. 加载文章数据 (用于首页中间的教程推荐)
    try {
        const artRes = await fetch('/api/shop/articles/list');
        const articles = await artRes.json();

        // 填充首页特有的“热门教程”模块
        renderHotArticlesHome(articles);
        
    } catch (e) { console.warn('Articles load failed:', e); }
}


// =============================================
// === 数据渲染逻辑
// =============================================

/**
 * 渲染分类导航 (PC药丸)
 * [修改说明] 移除了移动端侧边栏的渲染代码，避免与 common.js 冲突
 */
function renderCategoryTabs() {
    const pcContainer = document.getElementById('category-container');
    
    // 基础选项
    let pcHtml = '<div class="cat-pill active" onclick="filterCategory(\'all\', this)">全部商品</div>';

    allCategories.forEach(c => {
        const icon = c.image_url ? `<img src="${c.image_url}">` : '';
        pcHtml += `<div class="cat-pill" onclick="filterCategory(${c.id}, this)">${icon}${c.name}</div>`;
    });

    if (pcContainer) pcContainer.innerHTML = pcHtml;
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
    
    // [修改] 使用本地增强版的 renderTagsLocal，确保颜色正确解析
    const tagsHtml = renderTagsLocal(p.tags); 

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
 * [重点修改] 本地标签渲染 - 支持颜色解析 (b1, b2, #hex)
 * 逻辑与 product-page.js 保持一致
 */
function renderTagsLocal(tags) {
    if (!tags) return '';
    const arr = typeof tags === 'string' ? tags.split(',') : tags;
    if (!Array.isArray(arr) || arr.length === 0) return '';

    return arr.map(tagStr => {
        // 默认样式：红色边框，红色背景，白色文字 (如果没有指定)
        let borderColor = '#dc3545', bgColor = '#dc3545', textColor = '#ffffff';
        let text = tagStr.trim();
        if(!text) return '';
        
        // 1. 解析边框颜色 b1#xxxxxx
        const b1 = text.match(/b1#([0-9a-fA-F]{3,6})/);
        if(b1) { borderColor='#'+b1[1]; text=text.replace(b1[0],'').trim(); }
        
        // 2. 解析背景颜色 b2#xxxxxx
        const b2 = text.match(/b2#([0-9a-fA-F]{3,6})/);
        if(b2) { bgColor='#'+b2[1]; text=text.replace(b2[0],'').trim(); }
        
        // 3. 解析文字颜色 #xxxxxx (放在最后)
        const c = text.match(/#([0-9a-fA-F]{3,6})$/);
        if(c) { textColor='#'+c[1]; text=text.substring(0,c.index).trim(); }

        // 生成 HTML
        // return `<span class="dynamic-tag" style="display:inline-block;margin-right:6px;margin-bottom:4px;padding:1px 5px;border:1px solid ${borderColor};background:${bgColor};color:${textColor};border-radius:3px;font-size:11px;">${text}</span>`;
        return `<span class="dynamic-tag" style="display:inline-block;margin-bottom:2px;margin-right:3px;padding:0px 2px;border:1px solid ${borderColor};background:${bgColor};color:${textColor};border-radius:3px;font-size:11px;">${text}</span>`;
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

    // filterId 有可能是字符串 'all' 或数字ID，统一处理
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
        // 优化提示文案
        const msg = (filterId === 'all') ? '暂无商品' : '该分类下暂无商品';
        area.innerHTML = `<div class="module-box"><div class="text-center py-5 w-100 text-muted">${msg}</div></div>`;
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
        // 如果是通过移动端菜单触发或代码触发，没有 el，则重置所有状态
        document.querySelectorAll('.cat-pill').forEach(e => {
            if (id === 'all' && e.innerText.includes('全部商品')) e.classList.add('active');
            else if (id !== 'all') e.classList.remove('active'); // 简单处理，PC端不一定能高亮对应ID的pill，除非遍历查找
        });
    }
    
    // 2. 渲染内容
    renderCategorizedView(id);
    
    // 3. 滚动到顶部 (仅当不是初始化加载时体验更好，这里保留)
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
