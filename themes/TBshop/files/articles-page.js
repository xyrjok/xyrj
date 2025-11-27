// =============================================
// === themes/TBshop/files/articles-page.js
// === (适配 myblog 样式的列表渲染)
// =============================================

let allArticles = [];
let currentCategory = 'all';
let searchQuery = '';
let currentPage = 1;
const pageSize = 10;

async function initArticlesPage() {
    await loadCategories();
    await loadArticles();
}

document.addEventListener('DOMContentLoaded', () => {
    initArticlesPage();
});

// 加载分类
async function loadCategories() {
    try {
        const res = await fetch('/api/shop/article/categories');
        const data = await res.json();
        const container = document.getElementById('category-tabs');
        if (!container) return;

        let html = `<button class="btn btn-sm btn-primary active" onclick="filterCategory('all', this)">全部</button>`;
        if (Array.isArray(data)) {
            data.forEach(cat => {
                html += `<button class="btn btn-sm btn-outline-secondary" onclick="filterCategory(${cat.id}, this)">${cat.name}</button>`;
            });
        }
        container.innerHTML = html;
    } catch (e) { console.error(e); }
}

// 加载文章数据
async function loadArticles() {
    try {
        const res = await fetch('/api/shop/articles');
        const data = await res.json();
        if (Array.isArray(data)) {
            // 过滤未显示的文章 (如果后端没过滤)
            allArticles = data.filter(a => a.active !== 0);
            renderList();
        } else {
            document.getElementById('articles-container').innerHTML = '<div class="text-center py-5">暂无文章数据</div>';
        }
    } catch (e) {
        document.getElementById('articles-container').innerHTML = '<div class="text-center py-5 text-danger">加载失败</div>';
    }
}

function filterCategory(catId, btn) {
    currentCategory = catId;
    currentPage = 1;
    
    // 按钮样式切换
    const btns = document.querySelectorAll('#category-tabs button');
    btns.forEach(b => {
        b.classList.remove('btn-primary', 'active');
        b.classList.add('btn-outline-secondary');
    });
    btn.classList.remove('btn-outline-secondary');
    btn.classList.add('btn-primary', 'active');
    
    renderList();
}

function searchArticlesPage() {
    searchQuery = document.getElementById('page-search-input').value.trim().toLowerCase();
    currentPage = 1;
    renderList();
}

// 渲染列表 (核心修改部分)
function renderList() {
    const container = document.getElementById('articles-container');
    if (!container) return;

    // 1. 筛选
    let filtered = allArticles.filter(a => {
        // 分类筛选
        if (currentCategory !== 'all' && a.category_id != currentCategory) return false;
        // 搜索筛选
        if (searchQuery && !a.title.toLowerCase().includes(searchQuery)) return false;
        return true;
    });

    // 2. 排序 (置顶优先，然后按ID倒序)
    filtered.sort((a, b) => {
        if ((b.is_notice || 0) !== (a.is_notice || 0)) {
            return (b.is_notice || 0) - (a.is_notice || 0);
        }
        return b.id - a.id;
    });

    // 3. 分页
    const total = filtered.length;
    const totalPages = Math.ceil(total / pageSize);
    if (currentPage > totalPages) currentPage = totalPages || 1;
    
    const start = (currentPage - 1) * pageSize;
    const pageData = filtered.slice(start, start + pageSize);

    // 4. 生成 HTML (仿 myblog 风格)
    if (pageData.length === 0) {
        container.innerHTML = '<div class="text-center py-5 text-muted">没有找到相关文章</div>';
        document.getElementById('pagination-container').innerHTML = '';
        return;
    }

    let html = '';
    pageData.forEach(a => {
        const dateStr = new Date(a.created_at * 1000).toLocaleDateString();
        const catName = a.category_name || '默认分类';
        const views = a.view_count || 0;
        
        // 提取摘要：去除 HTML 标签，截取前 100 字
        let summary = a.content || '';
        summary = summary.replace(/<[^>]+>/g, "").substring(0, 100) + '...';
        
        // 置顶徽章
        const badge = a.is_notice ? '<span class="badge bg-danger article-badge">置顶</span>' : '';
        
        // 封面图处理 (如果 content 里有图片且没有封面图，也可以尝试提取，这里优先用 cover_image)
        let coverHtml = '';
        if (a.cover_image) {
            coverHtml = `
                <div class="article-cover">
                    <a href="/article.html?id=${a.id}">
                        <img src="${a.cover_image}" alt="${a.title}" loading="lazy">
                    </a>
                </div>
            `;
        }

        html += `
        <div class="article-item">
            <div class="article-body">
                <h3 class="article-title">
                    ${badge}
                    <a href="/article.html?id=${a.id}">${a.title}</a>
                </h3>
                
                <div class="article-summary">
                    ${summary}
                </div>
                
                <div class="article-meta">
                    <span><i class="fa fa-clock"></i> ${dateStr}</span>
                    <span><i class="fa fa-folder"></i> ${catName}</span>
                    <span><i class="fa fa-eye"></i> ${views}</span>
                </div>
            </div>
            ${coverHtml}
        </div>
        `;
    });

    container.innerHTML = html;
    renderPagination(totalPages);
}

function renderPagination(totalPages) {
    const container = document.getElementById('pagination-container');
    if (totalPages <= 1) {
        container.innerHTML = '';
        return;
    }

    let html = '<nav><ul class="pagination">';
    
    // 上一页
    html += `<li class="page-item ${currentPage === 1 ? 'disabled' : ''}">
                <button class="page-link" onclick="changePage(${currentPage - 1})">上一页</button>
             </li>`;

    // 页码 (简单显示前5页)
    for (let i = 1; i <= totalPages; i++) {
        if (i > 5 && i !== totalPages) continue; // 简单省略
        const active = i === currentPage ? 'active' : '';
        html += `<li class="page-item ${active}">
                    <button class="page-link" onclick="changePage(${i})">${i}</button>
                 </li>`;
    }

    // 下一页
    html += `<li class="page-item ${currentPage === totalPages ? 'disabled' : ''}">
                <button class="page-link" onclick="changePage(${currentPage + 1})">下一页</button>
             </li>`;
    
    html += '</ul></nav>';
    container.innerHTML = html;
}

function changePage(page) {
    if (page < 1) return;
    currentPage = page;
    renderList();
    window.scrollTo({ top: 0, behavior: 'smooth' });
}
