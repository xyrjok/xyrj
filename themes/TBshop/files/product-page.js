// =============================================
// === themes/TBshop/files/product-page.js
// === (商品详情页专属逻辑 - 已优化)
// =============================================

// 全局变量
let currentProduct = null;   // 当前商品数据
let currentVariant = null;   // 当前选中的 SKU
let quantity = 1;            // 购买数量
let buyMethod = null;        // [修改] 购买方式: null (未选) | 'random' | 'select'
let selfSelectPrice = 0.00;  // 自选加价
let paymentMethod = 'alipay'; // 默认支付方式

// 页面启动入口
async function initProductPage() {
    const urlParams = new URLSearchParams(window.location.search);
    const productId = urlParams.get('id');

    if (!productId) {
        showError('参数错误：未指定商品ID');
        return;
    }

    try {
        const res = await fetch(`/api/shop/product?id=${productId}`);
        const data = await res.json();

        if (data.error) {
            showError(data.error);
        } else {
            currentProduct = data;
            renderProductDetail(data);
            document.title = `${data.name} - TB Shop`;
            loadSidebarRecommendations();
        }
    } catch (e) {
        console.error(e);
        showError('商品加载失败，请检查网络');
    }
}

document.addEventListener('DOMContentLoaded', () => {
    if (!currentProduct) initProductPage();
});

// =============================================
// === 核心渲染逻辑
// =============================================

function renderProductDetail(p) {
    const container = document.getElementById('product-content');
    const loading = document.getElementById('product-loading');
    
    if (!container) return;

    // 优先选中第一个有库存的 SKU
    let selectedIdx = 0;
    if (p.variants && p.variants.length > 0) {
        const firstInStock = p.variants.findIndex(v => v.stock > 0);
        if (firstInStock !== -1) selectedIdx = firstInStock;
    }
    const mainVariant = p.variants && p.variants.length > 0 ? p.variants[selectedIdx] : {};
    currentVariant = mainVariant;

    // 构建 HTML
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
                        <h5 class="fw-bold mb-2" style="line-height:1.4;">${p.name}</h5>
                        
                        <div class="tb-tags-row mb-3" id="p-tags-container" style="min-height:20px;">
                            ${renderProductTags(p.tags)}
                        </div>

                        <div class="price-bar bg-light p-3 rounded mb-3">
                            <div class="d-flex justify-content-between align-items-start">
                                
                                <div class="d-flex align-items-baseline text-danger">
                                    <span class="fw-bold me-1" style="font-size: 18px;">¥</span>
                                    <span class="fs-1 fw-bold" id="p-display-price" style="line-height: 1;">${mainVariant.price}</span>
                                </div>

                                <div class="text-muted small d-flex flex-column align-items-end" style="font-size: 13px;">
                                    <div class="mb-1">
                                        <span>库存: <span id="p-stock">${mainVariant.stock}</span></span>
                                        <span class="mx-2">|</span>
                                        <span>销量: ${p.variants.reduce((a,b)=>a+(b.sales_count||0), 0)}</span>
                                    </div>
                                </div>
                            </div>

                            <div id="wholesale-info-display" style="display:none; margin-top:8px; padding-top:8px; border-top:1px dashed #ddd;">
                                </div>
                        </div>

                        <div class="sku-section mb-4">
                            <div class="mb-2 text-secondary small">选择规格：</div>
                            <div class="sku-list d-flex flex-wrap" id="sku-btn-list">
                                ${renderSkuButtons(p.variants, selectedIdx)}
                            </div>
                            <div id="spec-pagination-area" class="spec-pagination-container"></div>
                        </div>

                        <div class="mb-3 d-flex align-items-center flex-wrap">
                            <span class="text-secondary small me-3 text-nowrap">购买方式：</span>
                            <div class="d-flex align-items-center flex-wrap">
                                <button class="btn btn-sm btn-outline-secondary me-2 mb-1 method-btn" 
                                    id="btn-method-random"
                                    data-type="random" onclick="selectBuyMethod('random', this)">
                                    默认随机
                                </button>
                                <button class="btn btn-sm btn-outline-secondary mb-1 method-btn" 
                                    id="btn-method-select"
                                    data-type="select" onclick="selectBuyMethod('select', this)">
                                    自选卡密/号码 (加价<span id="self-select-price">${selfSelectPrice.toFixed(2)}</span>元)
                                </button>
                            </div>
                        </div>

                        <div class="mb-3 d-flex align-items-center">
                            <span class="text-secondary small me-3">数量：</span>
                            <div class="input-group" style="width: 120px;">
                                <button class="btn btn-outline-secondary btn-sm" type="button" onclick="changeQty(-1)">-</button>
                                <input type="text" class="form-control form-control-sm text-center" id="buy-qty" value="1" readonly>
                                <button class="btn btn-outline-secondary btn-sm" type="button" onclick="changeQty(1)">+</button>
                            </div>
                        </div>

                        <div class="mb-4 d-flex align-items-center flex-wrap">
                            <span class="text-secondary small me-3 text-nowrap">支付方式：</span>
                            <div class="d-flex align-items-center flex-wrap" id="payment-method-list">
                                <div class="payment-option active" onclick="selectPayment('alipay', this)">
                                    <i class="fab fa-alipay" style="color:#1678ff;"></i>
                                    <div class="payment-check-mark"><i class="fa fa-check"></i></div>
                                </div>
                                <div class="payment-option" onclick="selectPayment('wxpay', this)">
                                    <i class="fab fa-weixin" style="color:#09bb07;"></i>
                                    <div class="payment-check-mark"><i class="fa fa-check"></i></div>
                                </div>
                                <div class="payment-option" onclick="selectPayment('usdt', this)">
                                    <span style="font-size:12px; font-weight:bold; color:#26a17b;">USDT</span>
                                    <div class="payment-check-mark"><i class="fa fa-check"></i></div>
                                </div>
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

    container.innerHTML = html;
    if(loading) loading.style.display = 'none';
    container.style.display = 'block';

    if (typeof checkSidebarStatus === 'function') setTimeout(checkSidebarStatus, 200);
    
    setTimeout(() => {
         if (typeof initSpecPagination === 'function') {
             initSpecPagination('#sku-btn-list', '.sku-btn', 6);
         }
    }, 100);
}

// =============================================
// === 交互逻辑 (修改部分)
// =============================================

/**
 * [修改] 切换购买方式 (支持取消选中)
 */
function selectBuyMethod(type, btn) {
    // 如果点击的是已选中的，则取消选中
    if (buyMethod === type) {
        buyMethod = null;
        btn.classList.remove('btn-danger');
        btn.classList.add('btn-outline-secondary');
        // 隐藏批发信息
        updateWholesaleDisplay();
        return;
    }

    // 否则选中新的
    buyMethod = type;
    
    // 重置所有按钮样式
    document.querySelectorAll('.method-btn').forEach(b => {
        b.classList.remove('btn-danger');
        b.classList.add('btn-outline-secondary');
    });
    // 高亮当前按钮
    btn.classList.remove('btn-outline-secondary');
    btn.classList.add('btn-danger');

    // 更新批发信息显示
    updateWholesaleDisplay();
}

/**
 * [新增] 更新批发优惠信息的显示状态和内容
 */
function updateWholesaleDisplay() {
    const displayDiv = document.getElementById('wholesale-info-display');
    if (!displayDiv) return;

    // 只有选中 "random" 时才显示批发信息
    if (buyMethod === 'random' && currentVariant) {
        displayDiv.style.display = 'block';
        
        // 检查是否有批发价 (假设 > 0 即为有设置)
        // 这里假设 wholesale_price 是单一价格，起购量默认为 X (如需精确需后端字段支持)
        // 如果您的 wholesale_price 字段本身包含文本规则，请直接显示
        if (currentVariant.wholesale_price && parseFloat(currentVariant.wholesale_price) > 0) {
            // 有批发价：显示红色优惠文本
            // 模拟格式：批发价 10个起 XX元/1个 (起购量如果是固定的可以写死，或者从后端获取)
            const price = currentVariant.wholesale_price;
            // 注意：如果后端没有 quantity 字段，这里暂时写 "多" 或留空
            displayDiv.innerHTML = `
                <span style="color:#dc3545; font-size:13px; font-weight:500;">
                    <i class="fa fa-tag me-1"></i>
                    批发价 10个起${price}元/1个
                </span>
            `;
        } else {
            // 无批发价：显示暂无优惠
            displayDiv.innerHTML = `
                <span style="color:#999; font-size:13px;">
                    <i class="fa fa-info-circle me-1"></i> 暂无批发优惠
                </span>
            `;
        }
    } else {
        // 其他情况隐藏
        displayDiv.style.display = 'none';
    }
}

function selectSku(index, btn) {
    if (!currentProduct) return;
    document.querySelectorAll('.sku-btn').forEach(b => {
        b.classList.remove('btn-danger');
        b.classList.add('btn-outline-secondary');
        b.classList.remove('active');
    });
    btn.classList.remove('btn-outline-secondary');
    btn.classList.add('btn-danger');

    const variant = currentProduct.variants[index];
    currentVariant = variant;
    animateValue('p-display-price', variant.price);
    document.getElementById('p-stock').innerText = variant.stock;
    if (variant.image_url) document.getElementById('p-main-img').src = variant.image_url;

    // [修改] 切换规格时，如果当前选中的是“默认随机”，需要实时刷新批发价显示
    updateWholesaleDisplay();
}

// --- 以下函数保持不变，为了完整性一并提供 ---

function renderSkuButtons(variants, selectedIdx = 0) {
    if (!variants || variants.length === 0) return '<span class="text-muted">默认规格</span>';
    
    return variants.map((v, index) => {
        const isOOS = v.stock <= 0;
        const isSelected = index === selectedIdx; 

        let btnClass = isSelected ? 'btn-danger' : 'btn-outline-secondary';
        if (isOOS) btnClass += ' no-stock';
        
        const name = v.name || v.specs || `规格${index+1}`;
        const badgeHtml = isOOS ? '<span class="sku-oos-badge">缺货</span>' : '';
        
        return `
            <button class="btn btn-sm ${btnClass} me-2 mb-2 sku-btn" 
                data-idx="${index}" 
                onclick="${isOOS ? '' : `selectSku(${index}, this)`}" 
                ${isOOS ? 'disabled' : ''}>
                ${name}
                ${badgeHtml}
            </button>
        `;
    }).join('');
}

function renderProductTags(tags) {
    if (!tags) return '';
    let tagList = [];
    if (typeof tags === 'string') {
        tagList = tags.split(',').filter(t => t.trim() !== '');
    } else if (Array.isArray(tags)) {
        tagList = tags;
    }
    if (tagList.length === 0) return '';
    return tagList.map(tagStr => {
        let borderColor = '#dc3545'; 
        let bgColor = '#dc3545';     
        let textColor = '#ffffff';   
        let text = tagStr.trim();
        const b1Match = text.match(/b1#([0-9a-fA-F]{3,6})/);
        if (b1Match) {
            borderColor = '#' + b1Match[1];
            text = text.replace(b1Match[0], '').trim();
        }
        const b2Match = text.match(/b2#([0-9a-fA-F]{3,6})/);
        if (b2Match) {
            bgColor = '#' + b2Match[1];
            text = text.replace(b2Match[0], '').trim();
        }
        const colorMatch = text.match(/#([0-9a-fA-F]{3,6})$/);
        if (colorMatch) {
            textColor = '#' + colorMatch[1];
            text = text.substring(0, colorMatch.index).trim();
        }
        if (!text) return '';
        return `<span class="dynamic-tag" style="display: inline-block; margin-right: 6px; margin-bottom: 4px; padding: 1px 5px; border: 1px solid ${borderColor}; background-color: ${bgColor}; color: ${textColor}; border-radius: 3px; font-size: 11px; line-height: normal;">${text}</span>`;
    }).join('');
}

async function loadSidebarRecommendations() {
    try {
        const res = await fetch('/api/shop/products');
        const allProducts = await res.json();
        if (typeof renderSidebarTopSales === 'function') renderSidebarTopSales(allProducts);
        if (typeof checkSidebarStatus === 'function') checkSidebarStatus();
    } catch(e) { console.warn('Sidebar load failed', e); }
}

function selectPayment(type, el) {
    paymentMethod = type;
    const list = document.getElementById('payment-method-list');
    list.querySelectorAll('.payment-option').forEach(opt => {
        opt.classList.remove('active');
    });
    el.classList.add('active');
}

function changeQty(delta) {
    let newQty = quantity + delta;
    if (newQty < 1) newQty = 1;
    if (currentVariant && newQty > currentVariant.stock) {
        alert('库存不足');
        newQty = currentVariant.stock;
    }
    quantity = newQty;
    document.getElementById('buy-qty').value = quantity;
}

function addToCart() {
    if (!currentVariant) return;
    if (currentVariant.stock <= 0) { alert('该规格缺货'); return; }
    if (buyMethod === null) { alert('请选择购买方式'); return; } // [新增] 校验

    let cart = JSON.parse(localStorage.getItem('tbShopCart') || '[]');
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

    localStorage.setItem('tbShopCart', JSON.stringify(cart));
    if (typeof updateCartBadge === 'function') updateCartBadge(cart.length);
    
    const btn = event.target;
    const originalText = btn.innerHTML;
    btn.innerHTML = '<i class="fa fa-check"></i> 已加入';
    btn.classList.add('btn-success');
    setTimeout(() => {
        btn.innerHTML = originalText;
        btn.classList.remove('btn-success');
    }, 1500);
}

function buyNow() {
    if (buyMethod === null) { alert('请选择购买方式'); return; } // [新增] 校验
    addToCart();
    setTimeout(() => {
        window.location.href = '/cart.html';
    }, 200);
}

function animateValue(id, end) {
    const el = document.getElementById(id);
    if(el) el.innerText = end; 
}

function showError(msg) {
    const container = document.getElementById('product-loading');
    if (container) container.innerHTML = `<div class="text-danger py-5"><i class="fa fa-exclamation-triangle"></i> ${msg}</div>`;
}

function initSpecPagination(containerSelector, itemSelector, rowsPerPage = 6) {
    const container = document.querySelector(containerSelector);
    const paginationArea = document.getElementById('spec-pagination-area');
    if (!container || !paginationArea) return;

    let items = Array.from(container.querySelectorAll(itemSelector));
    if (items.length === 0) return;
    let currentPage = 1;
    let totalPages = 1;
    
    function calculatePages() {
        items.forEach(item => item.style.display = '');
        let rows = [];
        let lastTop = -1;
        let currentRow = [];
        items.forEach(item => {
            let currentTop = item.offsetTop;
            if (lastTop !== -1 && Math.abs(currentTop - lastTop) > 5) {
                rows.push(currentRow);
                currentRow = [];
            }
            currentRow.push(item);
            lastTop = currentTop;
        });
        if (currentRow.length > 0) rows.push(currentRow);
        totalPages = Math.ceil(rows.length / rowsPerPage);
        if (totalPages <= 1) {
            paginationArea.style.display = 'none';
            items.forEach(item => item.style.display = ''); 
            return;
        }
        paginationArea.style.display = 'block';
        renderPage(rows);
        renderControls(rows);
    }
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
    function renderControls(rows) {
        let html = '';
        html += `<span class="spec-pagination-btn ${currentPage === 1 ? 'disabled' : ''}" onclick="goToSpecPage(1)">首页</span>`;
        html += `<span class="spec-pagination-btn ${currentPage === 1 ? 'disabled' : ''}" onclick="goToSpecPage(${currentPage - 1})">上一页</span>`;
        html += `<span style="margin:0 8px; color:#666; font-size:14px;">${currentPage} / ${totalPages}</span>`;
        html += `<span class="spec-pagination-btn ${currentPage === totalPages ? 'disabled' : ''}" onclick="goToSpecPage(${currentPage + 1})">下一页</span>`;
        html += `<span class="spec-pagination-btn ${currentPage === totalPages ? 'disabled' : ''}" onclick="goToSpecPage(${totalPages})">尾页</span>`;
        paginationArea.innerHTML = html;
        window.goToSpecPage = function(page) {
            if (page >= 1 && page <= totalPages) {
                currentPage = page;
                renderPage(rows);
                renderControls(rows);
            }
        };
    }
    calculatePages();
    let resizeTimer;
    window.addEventListener('resize', () => {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(calculatePages, 300);
    });
}
