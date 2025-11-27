// =============================================
// === themes/TBshop/files/articles-page.js
// === (修复版：适配 xyrj 主题列表样式 + 对接 D1 数据)
// =============================================

let allArticles = [];
let currentCat = 'all';

// 初始化
async function initArticlesPage() {
    const urlParams = new URLSearchParams(window.location.search);
    const catParam = urlParams.get('cat');
    
    await loadArticles();
    
    if (catParam) {
        // 如果 URL 带分类参数，尝试自动选中
        const decodedCat = decodeURIComponent(catParam);
        // 延迟一点执行，确保分类栏已渲染（虽然 common.js 会处理侧边栏，但这里处理顶部药丸）
        setTimeout(() => {
            const pills = document.querySelectorAll('.cat-pill');
            let found = false;
            pills.forEach(p => {
                if (p.textContent.trim() === decodedCat) {
                    filterArticles(decodedCat, p);
                    found = true;
                }
            });
            // 如果没找到对应 pill，手动触发筛选
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
        // 注意：如果后端没返回 active 字段，默认显示
        allArticles = data.filter(a => a.active !== 0);
        
        // 渲染顶部分类栏
        renderCategoryBar();
        
        // 初次渲染列表
        renderArticles();

    } catch (e) {
        console.error(e);
        container.innerHTML = '<div class="text-center py-5 text-muted">加载失败，请检查网络</div>';
    }
}

// 渲染分类药丸 (Pills)
function renderCategoryBar() {
    const catContainer = document.getElementById('article-cat-container');
    if (!catContainer) return;

    // 提取所有分类并去重
    const cats = ['all', ...new Set(allArticles.map(a => a.category_name || '默认分类'))];
    
    let html = '';
    cats.forEach(c => {
        const label = c === 'all' ? '全部文章' : c;
        const activeClass = (c === 'all') ? 'active' : '';
        // 注意：onclick 调用 filterArticles
        html += `<div class="cat-pill ${activeClass}" onclick="filterArticles('${c}', this)">${label}</div>`;
    });
    
    catContainer.innerHTML = html;
}

// 筛选逻辑
function filterArticles(catName, el) {
    currentCat = catName;
    
    // 更新样式
    if (el) {
        document.querySelectorAll('.cat-pill').forEach(p => p.classList.remove('active'));
        el.classList.add('active');
    }
    
    renderArticles();
}

// [核心] 渲染文章列表 (仿 xyrj 样式)
function renderArticles() {
    const container = document.getElementById('article-list-container');
    if (!container) return;

    // 1. 筛选
    let list = allArticles;
    if (currentCat !== 'all') {
        list = list.filter(a => (a.category_name || '默认分类') === currentCat);
    }

    // 2. 排序：置顶优先 (is_notice=1)，其次按时间倒序
    list.sort((a, b) => {
        const noticeA = a.is_notice || 0;
        const noticeB = b.is_notice || 0;
        if (noticeA !== noticeB) return noticeB - noticeA; // 置顶大的在前
        return (b.created_at || 0) - (a.created_at || 0);  // 新的在前
    });

    if (list.length === 0) {
        container.innerHTML = '<div class="text-center py-5 text-muted">暂无相关文章</div>';
        return;
    }

    // 3. 生成 HTML
    const html = list.map(article => {
        const date = new Date((article.created_at || 0) * 1000).toLocaleDateString();
        const cat = article.category_name || '默认';
        // 处理摘要：去除 HTML 标签，截取前80字
        const rawContent = (article.content || '').replace(/<[^>]+>/g, ''); 
        const summary = rawContent.substring(0, 80) + (rawContent.length > 80 ? '...' : '');
        
        // 封面图逻辑：如果有 cover_image 则使用，否则使用默认图或首图
        // 这里我们使用一个简单的占位逻辑，如果您有默认图可以替换
        const hasImage = !!article.cover_image;
        const imgUrl = article.cover_image || '/assets/noimage.jpg'; // 假设您上传了默认图，或者使用空图片逻辑

        // 置顶标签 HTML
        const pinnedHtml = article.is_notice ? '<span class="label-pinned">置顶</span>' : '';

        // 只有当有图片时才渲染左侧图片区域 (或者始终渲染占位图，这里为了美观始终渲染)
        // 您可以根据需求决定：如果没有图片是否隐藏左侧
        const imageSection = `
            <div class="article-item-image">
                <div class="image-category">${cat}</div>
                <a href="/article.html?id=${article.id}">
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
                    <a href="/article.html?id=${article.id}">${article.title}</a>
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
