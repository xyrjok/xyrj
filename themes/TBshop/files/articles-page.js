// =============================================
// === themes/TBshop/files/articles-page.js
// === (修复版：修复封面图不显示 & PC端摘要空白问题)
// =============================================

let allArticles = [];
let currentCat = 'all';

// 初始化
async function initArticlesPage() {
    const urlParams = new URLSearchParams(window.location.search);
    const catParam = urlParams.get('cat');
    
    await loadArticles();
    
    if (catParam) {
        const decodedCat = decodeURIComponent(catParam);
        setTimeout(() => {
            const pills = document.querySelectorAll('.cat-pill');
            let found = false;
            pills.forEach(p => {
                if (p.textContent.trim() === decodedCat) {
                    filterArticles(decodedCat, p);
                    found = true;
                }
            });
            if (!found) {
                currentCat = decodedCat;
                renderArticles();
            }
        }, 500);
    }
}

document.addEventListener('DOMContentLoaded', initArticlesPage);

// 加载文章数据
async function loadArticles() {
    const container = document.getElementById('article-list-container');
    try {
        const res = await fetch('/api/shop/articles/list');
        const data = await res.json();
        
        if (data.error) {
            container.innerHTML = `<div class="text-center py-5 text-danger">${data.error}</div>`;
            return;
        }

        // 过滤掉下架的文章 (active == 0)
        allArticles = data.filter(a => a.active !== 0);
        
        renderCategoryBar();
        renderArticles();

    } catch (e) {
        console.error(e);
        container.innerHTML = '<div class="text-center py-5 text-muted">加载失败，请检查网络</div>';
    }
}

// 渲染分类药丸
function renderCategoryBar() {
    const catContainer = document.getElementById('article-cat-container');
    if (!catContainer) return;

    const cats = ['all', ...new Set(allArticles.map(a => a.category_name || '默认分类'))];
    
    let html = '';
    cats.forEach(c => {
        const label = c === 'all' ? '全部文章' : c;
        const activeClass = (c === 'all') ? 'active' : '';
        html += `<div class="cat-pill ${activeClass}" onclick="filterArticles('${c}', this)">${label}</div>`;
    });
    
    catContainer.innerHTML = html;
}

// 筛选逻辑
function filterArticles(catName, el) {
    currentCat = catName;
    if (el) {
        document.querySelectorAll('.cat-pill').forEach(p => p.classList.remove('active'));
        el.classList.add('active');
    }
    renderArticles();
}

// [核心] 渲染文章列表
function renderArticles() {
    const container = document.getElementById('article-list-container');
    if (!container) return;

    // 1. 筛选
    let list = allArticles;
    if (currentCat !== 'all') {
        list = list.filter(a => (a.category_name || '默认分类') === currentCat);
    }

    // 2. 排序：置顶优先，其次按时间
    list.sort((a, b) => {
        const noticeA = a.is_notice || 0;
        const noticeB = b.is_notice || 0;
        if (noticeA !== noticeB) return noticeB - noticeA;
        return (b.created_at || 0) - (a.created_at || 0);
    });

    if (list.length === 0) {
        container.innerHTML = '<div class="text-center py-5 text-muted">暂无相关文章</div>';
        return;
    }

    // 3. 生成 HTML
    const html = list.map(article => {
        const date = new Date((article.created_at || 0) * 1000).toLocaleDateString();
        const cat = article.category_name || '默认';
        
        // 【修复点1】直接使用后端返回的 snippet 作为摘要
        // 因为后端 API 不返回完整的 content，所以之前自己截取的逻辑会失效变为空白
        const summary = article.snippet || '暂无介绍';
        
        // 【修复点2】直接使用后端返回的 cover_image
        // 后端逻辑已经处理过：如果后台设置了封面图就用后台的，否则用文章首图，再没有就返回 null
        const imgUrl = article.cover_image || '/assets/noimage.jpg';

        const pinnedHtml = article.is_notice ? '<span class="label-pinned">置顶</span>' : '';

        const imageSection = `
            <div class="article-item-image">
                <div class="image-category">${cat}</div>
                <a href="/article?id=${article.id}">
                    <img src="${imgUrl}" alt="${article.title}" onerror="this.src='/assets/noimage.jpg'">
                </a>
            </div>
        `;

        return `
        <div class="article-item-box">
            ${imageSection}
            
            <div class="article-item-content">
                <h3>
                    ${pinnedHtml}
                    <a href="/article?id=${article.id}">${article.title}</a>
                </h3>
                <p>${summary}</p>
                <div class="article-meta">
                    <span><i class="fa fa-calendar-alt"></i> ${date}</span>
                    <span class="d-none d-md-flex"><i class="fa fa-folder"></i> ${cat}</span>
                    <span class="views"><i class="fa fa-eye"></i> ${article.view_count || 0}</span>
                </div>
            </div>
        </div>
        `;
    }).join('');

    container.innerHTML = html;
}
