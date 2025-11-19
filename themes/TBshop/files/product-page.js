// =============================================
// === themes/TBshop/files/product-page.js
// === (商品详情页专属逻辑 - 已优化)
// =============================================

// 全局变量
let currentProduct = null;   // 当前商品数据
let currentVariant = null;   // 当前选中的 SKU
let quantity = 1;            // 购买数量

// 页面启动入口 (由 product.html 的 DOMContentLoaded 事件触发)
async function initProductPage() {
    const urlParams = new URLSearchParams(window.location.search);
    const productId = urlParams.get('id');

    if (!productId) {
        showError('参数错误：未指定商品ID');
        return;
    }

    // 1. 加载商品详情
    try {
        const res = await fetch(`/api/shop/product?id=${productId}`);
        const data = await res.json();

        if (data.error) {
            showError(data.error);
        } else {
            currentProduct = data;
            renderProductDetail(data); // 渲染主内容
            
            // 更新页面标题
            document.title = `${data.name} - TB Shop`;
            
            // 加载侧边栏推荐数据 (复用 common.js 的渲染函数)
            loadSidebarRecommendations();
        }
    } catch (e) {
        console.error(e);
        showError('商品加载失败，请检查网络');
    }
}

// 自动启动 (如果 HTML 中没有显式调用 initProductPage，这里作为兜底)
document.addEventListener('DOMContentLoaded', () => {
    // 检查是否已经由 HTML 里的 script 触发过，避免重复
    // 这里直接运行即可，因为它是 defer 加载的
    if (!currentProduct) initProductPage();
});


// =============================================
// === 核心渲染逻辑
// =============================================

/**
 * 渲染商品详情主视图
 */
function renderProductDetail(p) {
    const container = document.getElementById('product-content');
    const loading = document.getElementById('product-loading');
    
    if (!container) return;

    // 默认选中第一个 SKU
    const mainVariant = p.variants && p.variants.length > 0 ? p.variants[0] : {};
    currentVariant = mainVariant;

    // 1. 构建 HTML 结构
    // [修改] 在 .sku-section 内增加 id="spec-pagination-area"
    const html = `
        <div class="module-box product-showcase">
            <div class="row g-0">
                <div class="col-md-5">
                    <div class="p-3">
                        <div class="main-img-wrap border rounded mb-2" style="position:relative; padding-bottom:100%; overflow:hidden;">
                            <img id="p-main-img" src="${p.image_url || mainVariant.image_url}" class="position-absolute w-100 h-100" style="object-fit:contain; top:0; left:0;">
                        </div>
                    </div>
                </div>

                <div class="col-md-7">
                    <div class="p-3">
                        <h4 class="fw-bold mb-2" style="line-height:1.4;">${p.name}</h4>
                        
                        <div class="price-bar bg-light p-3 rounded mb-3 mt-3">
                            <div class="d-flex align-items-end text-danger">
                                <span class="small me-1">¥</span>
                                <span class="fs-2 fw-bold" id="p-display-price">${mainVariant.price}</span>
                            </div>
                            <div class="text-muted small mt-1">
                                <span>库存: <span id="p-stock">${mainVariant.stock}</span></span>
                                <span class="mx-2">|</span>
                                <span>销量: ${p.variants.reduce((a,b)=>a+(b.sales_count||0), 0)}</span>
                            </div>
                        </div>

                        <div class="sku-section mb-4">
                            <div class="mb-2 text-secondary small">选择规格：</div>
                            <div class="sku-list d-flex flex-wrap" id="sku-btn-list">
                                ${renderSkuButtons(p.variants)}
                            </div>
                            <div id="spec-pagination-area" class="spec-pagination-container"></div>
                        </div>

                        <div class="mb-4 d-flex align-items-center">
                            <span class="text-secondary small me-3">数量：</span>
                            <div class="input-group" style="width: 120px;">
                                <button class="btn btn-outline-secondary btn-sm" type="button" onclick="changeQty(-1)">-</button>
                                <input type="text" class="form-control form-control-sm text-center" id="buy-qty" value="1" readonly>
                                <button class="btn btn-outline-secondary btn-sm" type="button" onclick="changeQty(1)">+</button>
                            </div>
                        </div>

                        <div class="action-btns d-flex gap-2 mt-4">
                            <button class="btn btn-warning flex-grow-1 text-white fw-bold py-2" onclick="addToCart()">
                                <i class="fa fa-cart-plus"></i> 加入购物车
                            </button>
                            <button class="btn btn-danger flex-grow-1 fw-bold py-2" onclick="buyNow()">
                                立即购买
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <div class="module-box mt-3">
            <div class="border-bottom pb-2 mb-3">
                <span class="fw-bold border-bottom border-3 border-danger pb-2 px-1">商品详情</span>
            </div>
            <div class="product-desc p-2" style="overflow-x:auto;">
                ${p.description || '<div class="text-center text-muted py-5">暂无详细介绍</div>'}
            </div>
        </div>
    `;

    // 2. 注入页面并切换显示
    container.innerHTML = html;
    if(loading) loading.style.display = 'none';
    container.style.display = 'block';

    // 3. 强制更新侧栏高度 (common.js 功能)
    if (typeof checkSidebarStatus === 'function') setTimeout(checkSidebarStatus, 200);

    // 4. [新增] 初始化规格分页
    // 延时确保DOM渲染完成，特别是图片和布局
    setTimeout(() => {
         if (typeof initSpecPagination === 'function') {
             // 容器ID: #sku-btn-list, 子项选择器: .sku-btn, 每页6行
             initSpecPagination('#sku-btn-list', '.sku-btn', 6);
         }
    }, 100);
}

/**
 * 生成 SKU 按钮 HTML
 */
function renderSkuButtons(variants) {
    if (!variants || variants.length === 0) return '<span class="text-muted">默认规格</span>';
    
    return variants.map((v, index) => {
        // 默认选中第一个
        const activeClass = index === 0 ? 'btn-danger' : 'btn-outline-secondary';
        // 构造名称
        const name = v.name || v.specs || `规格${index+1}`;
        
        return `
            <button class="btn btn-sm ${activeClass} me-2 mb-2 sku-btn" 
                data-idx="${index}" 
                onclick="selectSku(${index}, this)">
                ${name}
            </button>
        `;
    }).join('');
}

/**
 * 加载侧边栏推荐 (调用 common.js 的 renderSidebarTopSales)
 */
async function loadSidebarRecommendations() {
    try {
        // 我们需要获取所有商品来计算销量排行
        // 如果有专门的 recommend API 更好，这里复用 products 列表
        const res = await fetch('/api/shop/products');
        const allProducts = await res.json();
        
        // 调用 common.js 里的公共渲染函数
        if (typeof renderSidebarTopSales === 'function') {
            renderSidebarTopSales(allProducts);
        }
        // 再次检查侧栏高度
        if (typeof checkSidebarStatus === 'function') checkSidebarStatus();

    } catch(e) { console.warn('Sidebar data load failed', e); }
}


// =============================================
// === 交互逻辑
// =============================================

/**
 * 切换 SKU
 */
function selectSku(index, btn) {
    if (!currentProduct) return;
    
    // 1. 样式切换
    document.querySelectorAll('.sku-btn').forEach(b => {
        b.classList.remove('btn-danger');
        b.classList.add('btn-outline-secondary');
    });
    btn.classList.remove('btn-outline-secondary');
    btn.classList.add('btn-danger');

    // 2. 数据更新
    const variant = currentProduct.variants[index];
    currentVariant = variant;

    // 3. UI 更新 (价格、库存、图片)
    animateValue('p-display-price', variant.price);
    document.getElementById('p-stock').innerText = variant.stock;
    
    if (variant.image_url && variant.image_url !== '') {
        document.getElementById('p-main-img').src = variant.image_url;
    }
}

/**
 * 修改数量
 */
function changeQty(delta) {
    let newQty = quantity + delta;
    if (newQty < 1) newQty = 1;
    // 如果有库存限制
    if (currentVariant && newQty > currentVariant.stock) {
        alert('库存不足');
        newQty = currentVariant.stock;
    }
    quantity = newQty;
    document.getElementById('buy-qty').value = quantity;
}

/**
 * 加入购物车
 */
function addToCart() {
    if (!currentVariant) return;
    if (currentVariant.stock <= 0) { alert('该规格缺货'); return; }

    // 读取现有购物车
    let cart = JSON.parse(localStorage.getItem('tbShopCart') || '[]');
    
    // 检查是否已存在相同 SKU
    const existingItem = cart.find(item => item.variant_id === currentVariant.id);
    
    if (existingItem) {
        existingItem.quantity += quantity;
    } else {
        cart.push({
            product_id: currentProduct.id,
            variant_id: currentVariant.id,
            name: currentProduct.name,
            variant_name: currentVariant.name || currentVariant.specs,
            price: currentVariant.price,
            image: currentVariant.image_url || currentProduct.image_url,
            quantity: quantity
        });
    }

    // 保存并更新角标 (common.js 中的 updateCartBadge)
    localStorage.setItem('tbShopCart', JSON.stringify(cart));
    if (typeof updateCartBadge === 'function') updateCartBadge(cart.length);
    
    // 简单提示效果
    const btn = event.target;
    const originalText = btn.innerHTML;
    btn.innerHTML = '<i class="fa fa-check"></i> 已加入';
    btn.classList.add('btn-success');
    setTimeout(() => {
        btn.innerHTML = originalText;
        btn.classList.remove('btn-success');
    }, 1500);
}

/**
 * 立即购买
 */
function buyNow() {
    // 先加入购物车逻辑，然后跳转
    addToCart();
    setTimeout(() => {
        window.location.href = '/cart.html';
    }, 200);
}

// 辅助：简单的数字动画
function animateValue(id, end) {
    const el = document.getElementById(id);
    if(el) el.innerText = end; 
    // 如需更复杂的滚动动画可在此扩展
}

// 辅助：显示错误
function showError(msg) {
    const container = document.getElementById('product-loading');
    if (container) container.innerHTML = `<div class="text-danger py-5"><i class="fa fa-exclamation-triangle"></i> ${msg}</div>`;
}

/**
 * [新增] 规格分页功能 - 6行为一页 (含首页/尾页)
 * @param {string} containerSelector 规格父容器的选择器
 * @param {string} itemSelector 每一个规格项的选择器
 * @param {number} rowsPerPage 每页显示的行数
 */
function initSpecPagination(containerSelector, itemSelector, rowsPerPage = 6) {
    const container = document.querySelector(containerSelector);
    const paginationArea = document.getElementById('spec-pagination-area');
    
    if (!container || !paginationArea) return;

    // 获取所有可见的规格项
    let items = Array.from(container.querySelectorAll(itemSelector));
    if (items.length === 0) return;

    let currentPage = 1;
    let totalPages = 1;
    
    // 核心逻辑：根据 offsetTop 计算视觉上的“行”
    function calculatePages() {
        // 重置显示以便重新计算布局
        items.forEach(item => item.style.display = '');
        
        let rows = [];
        let lastTop = -1;
        let currentRow = [];

        items.forEach(item => {
            let currentTop = item.offsetTop;
            // 允许 5px 误差，处理可能的对齐微差
            if (lastTop !== -1 && Math.abs(currentTop - lastTop) > 5) {
                rows.push(currentRow); // 结束上一行
                currentRow = [];       // 开始新的一行
            }
            currentRow.push(item);
            lastTop = currentTop;
        });
        // 添加最后一行
        if (currentRow.length > 0) rows.push(currentRow);

        totalPages = Math.ceil(rows.length / rowsPerPage);

        // 如果只有1页，隐藏控件，确保内容全部显示
        if (totalPages <= 1) {
            paginationArea.style.display = 'none';
            items.forEach(item => item.style.display = ''); 
            return;
        }

        paginationArea.style.display = 'block';
        renderPage(rows);
        renderControls(rows);
    }

    // 渲染指定页面的内容（显示当前页行，隐藏其他行）
    function renderPage(rows) {
        const startRow = (currentPage - 1) * rowsPerPage;
        const endRow = startRow + rowsPerPage;

        rows.forEach((row, index) => {
            const shouldShow = index >= startRow && index < endRow;
            row.forEach(item => {
                item.style.display = shouldShow ? '' : 'none';
            });
        });
    }

    // 渲染分页控制按钮
    function renderControls(rows) {
        let html = '';
        
        // 首页
        html += `<span class="spec-pagination-btn ${currentPage === 1 ? 'disabled' : ''}" onclick="goToSpecPage(1)">首页</span>`;

        // 上一页
        html += `<span class="spec-pagination-btn ${currentPage === 1 ? 'disabled' : ''}" onclick="goToSpecPage(${currentPage - 1})">上一页</span>`;
        
        // 页码显示
        html += `<span style="margin:0 8px; color:#666; font-size:14px;">${currentPage} / ${totalPages}</span>`;
        
        // 下一页
        html += `<span class="spec-pagination-btn ${currentPage === totalPages ? 'disabled' : ''}" onclick="goToSpecPage(${currentPage + 1})">下一页</span>`;

        // 尾页
        html += `<span class="spec-pagination-btn ${currentPage === totalPages ? 'disabled' : ''}" onclick="goToSpecPage(${totalPages})">尾页</span>`;
        
        paginationArea.innerHTML = html;

        // 绑定全局跳转函数 (挂载到window以便onclick调用)
        window.goToSpecPage = function(page) {
            if (page >= 1 && page <= totalPages) {
                currentPage = page;
                renderPage(rows);
                renderControls(rows);
            }
        };
    }

    // 初始化执行
    calculatePages();

    // 监听窗口调整，防止屏幕旋转或缩放导致行数变化
    let resizeTimer;
    window.addEventListener('resize', () => {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(calculatePages, 300);
    });
}
