// =============================================
// === themes/TBshop/files/articles-page.js
// === (文章列表页逻辑)
// =============================================

let allArticles = [];
let allCategories = [];

document.addEventListener('DOMContentLoaded', () => {
    initArticlePage();
});

async function initArticlePage() {
    await loadCategories();
    await loadArticles();
    
    // 默认显示全部
    renderArticleList(allArticles);
    
    // 加载侧边栏推荐
    if (typeof renderSidebarTopSales === 'function') {
        fetch('/api/shop/products').then(r=>r.json()).then(data => renderSidebarTopSales(data));
    }
}

async function loadCategories() {
    try {
        const res = await fetch('/api/shop/article/categories');
        allCategories = await res.json();
        renderCategoryPills();
    } catch (e) { console.error(e); }
}

async function loadArticles() {
    try {
        const res = await fetch('/api/shop/articles/list');
        allArticles = await res.json();
    } catch (e) { console.error(e); }
}

function renderCategoryPills() {
    const container = document.getElementById('article-cat-container');
    if (!container) return;
    
    let html = '<div class="cat-pill active" onclick="filterArticles(\'all\', this)">全部文章</div>';
    allCategories.forEach(c => {
        html += `<div class="cat-pill" onclick="filterArticles(${c.id}, this)">${c.name}</div>`;
    });
    container.innerHTML = html;
}

function filterArticles(catId, el) {
    // 样式切换
    if (el) {
        document.querySelectorAll('.cat-pill').forEach(p => p.classList.remove('active'));
        el.classList.add('active');
    }
    
    // 数据筛选
    if (catId === 'all') {
        renderArticleList(allArticles);
    } else {
        const filtered = allArticles.filter(a => a.category_id == catId);
        renderArticleList(filtered);
    }
}

function renderArticleList(articles) {
    const container = document.getElementById('article-list-container');
    if (!container) return;
    
    if (!articles || articles.length === 0) {
        container.innerHTML = '<div class="text-center py-5 text-muted">暂无相关文章</div>';
        return;
    }

    const html = articles.map(a => {
        // 时间格式化
        const date = new Date(a.created_at * 1000);
        const dateStr = `${date.getFullYear()}-${(date.getMonth()+1).toString().padStart(2,'0')}-${date.getDate().toString().padStart(2,'0')}`;
        
        // 图片部分 (如果有图显示图，没图不显示占位，保持清爽)
        const imgHtml = a.image ? `
            <div class="art-item-img me-3">
                <a href="/article.html?id=${a.id}">
                    <img src="${a.image}" alt="cover">
                </a>
            </div>
        ` : '';

        // 置顶标记
        const pinnedHtml = a.is_notice ? '<span class="badge bg-danger me-2" style="font-weight:normal; font-size:12px;">置顶</span>' : '';

        return `
        <div class="article-item p-3 border-bottom d-flex align-items-start">
            ${imgHtml}
            <div class="art-item-content flex-grow-1">
                <h6 class="art-item-title mb-2">
                    ${pinnedHtml}
                    <a href="/article.html?id=${a.id}" class="text-dark text-decoration-none fw-bold">${a.title}</a>
                </h6>
                <div class="art-item-desc text-muted small mb-2">
                    ${a.snippet || '暂无摘要...'}
                </div>
                <div class="art-item-meta text-muted small d-flex align-items-center">
                    <span class="me-3"><i class="fa fa-folder-open me-1"></i>${a.category_name}</span>
                    <span class="me-3"><i class="fa fa-clock me-1"></i>${dateStr}</span>
                    <span><i class="fa fa-eye me-1"></i>${a.view_count}</span>
                </div>
            </div>
        </div>
        `;
    }).join('');
    
    container.innerHTML = html;
}
