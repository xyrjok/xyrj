// =============================================
// === themes/TBshop/files/product-page.js
// === (最终修改版 - 支持自选号码弹窗 & 布局调整)
// =============================================

// 全局变量
let currentProduct = null;   // 当前商品数据
let currentVariant = null;   // 当前选中的 SKU
let quantity = 1;            // 购买数量
let buyMethod = null;        // 购买方式: null | 'random' | 'select'
let paymentMethod = 'alipay'; // 默认支付方式

// 自选号码相关全局变量
let selectedSpecificCardId = null;   // 选中的具体卡密ID
let selectedSpecificCardInfo = '';   // 选中的卡密预设信息 (#[...]的内容)

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
// === 核心渲染逻辑 (HTML 结构调整)
// =============================================

function renderProductDetail(p) {
    const container = document.getElementById('product-content');
    const loading = document.getElementById('product-loading');
    
    if (!container) return;

    // 1. 初始不选中规格，计算价格区间
    currentVariant = null; 
    let priceDisplay = '0.00';
    let totalStock = 0;

    if (p.variants && p.variants.length > 0) {
        totalStock = p.variants.reduce((sum, v) => sum + (parseInt(v.stock) || 0), 0);
        const prices = p.variants.map(v => parseFloat(v.price));
        const minPrice = Math.min(...prices);
        const maxPrice = Math.max(...prices);
        priceDisplay = minPrice !== maxPrice ? `${minPrice.toFixed(2)}-${maxPrice.toFixed(2)}` : minPrice.toFixed(2);
    }

    // 2. 构建 HTML 结构
    // [注意] col-md-7 增加了 style="position:relative;" 用于弹窗绝对定位
    const html = `
        <div class="module-box product-showcase">
            <div class="row g-0">
                <div class="col-md-5">
                    <div class="p-3">
                        <div class="main-img-wrap border rounded mb-2" style="position:relative; padding-bottom:100%; overflow:hidden;">
                            <img id="p-main-img" src="${p.image_url}" class="position-absolute w-100 h-100" style="object-fit:contain; top:0; left:0;">
                        </div>
                    </div>
                </div>

                <div class="col-md-7" style="position:relative;">
                    <div class="p-3">
                        <h5 class="fw-bold mb-2" style="line-height:1.4;" id="product-title-el">${p.name}</h5>
                        
                        <div class="tb-tags-row mb-2" id="p-tags-container">
                            ${renderProductTags(p.tags)}
                        </div>

                        <div class="stock-sales-row">
                            <span class="me-3">库存: <span id="p-stock">${totalStock}</span></span>
                            <span>销量: ${p.variants.reduce((a,b)=>a+(b.sales_count||0), 0)}</span>
                        </div>

                        <div id="number-selector-modal" class="number-selector-overlay">
                            <div class="ns-header">
                                <span>请选择号码</span>
                                <span class="ns-close" onclick="closeNumberSelector()">×</span>
                            </div>
                            <div class="ns-body">
                                <div id="ns-list-container" class="ns-grid">
                                    <div class="text-center w-100 mt-3 text-muted">请先选择规格</div>
                                </div>
                            </div>
                        </div>

                        <div class="price-bar bg-light p-3 rounded mb-3">
                            <div class="d-flex justify-content-between align-items-start">
                                <div class="d-flex align-items-baseline text-danger">
                                    <span class="fw-bold me-1" style="font-size: 18px;">¥</span>
                                    <span class="fs-1 fw-bold" id="p-display-price" style="line-height: 1;">${priceDisplay}</span>
                                </div>
                            </div>

                            <div id="dynamic-info-display" style="display:none; margin-top:8px; padding-top:8px; border-top:1px dashed #ddd;">
                            </div>
                        </div>

                        <div class="sku-section mb-4">
                            <div class="mb-2 text-secondary small">选择规格 <span class="fw-normal text-muted" style="font-size: 0.9em;">(共${p.variants ? p.variants.length : 0}个)</span>：</div>
                            <div class="sku-list d-flex flex-wrap" id="sku-btn-list">
                                ${renderSkuButtons(p.variants, -1)} 
                            </div>
                            <div id="spec-pagination-area" class="spec-pagination-container"></div>
                        </div>

                        <div class="mb-3 d-flex align-items-center flex-wrap" id="buy-method-wrapper">
                            <span class="text-secondary small me-3 text-nowrap">购买方式：</span>
                            <div class="d-flex align-items-center flex-wrap" id="buy-method-container">
                                <span class="text-muted small" style="padding: 5px 0;">请先选择规格</span>
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

    // 3. 初始化后续逻辑
    updateBuyMethodButtons(); 
    updateDynamicInfoDisplay();
    
    // 侧边栏推荐
    if (typeof checkSidebarStatus === 'function') setTimeout(checkSidebarStatus, 200);
    
    // 规格分页初始化
    setTimeout(() => {
         if (typeof initSpecPagination === 'function') {
             initSpecPagination('#sku-btn-list', '.sku-btn', 6);
         }
    }, 100);
}

// =============================================
// === 交互逻辑 (含弹窗和号码选择)
// =============================================

// 辅助：解析批发配置
function parseWholesaleInfo(config) {
    if (!config) return null;
    let rules = [];
    let data = config;
    // (...保持原有解析逻辑...)
    if (typeof data === 'string') {
        data = data.trim();
        if (data.startsWith('[') || data.startsWith('{')) {
            try { data = JSON.parse(data); } catch (e) { /* fallback */ }
        }
    }
    if (Array.isArray(data)) {
        data.forEach(item => {
            const n = item.num || item.number || item.count || item.qty || item.n;
            const p = item.price || item.money || item.amount || item.p;
            if (n && p) rules.push(`${n}个起${p}元/1个`);
        });
    } else if (typeof data === 'object' && data !== null) {
        Object.entries(data).forEach(([k, v]) => { if(!isNaN(k)) rules.push(`${k}个起${v}元/1个`); });
    }
    return rules.length > 0 ? rules.join('，') : '';
}

function updateBuyMethodButtons() {
    const container = document.getElementById('buy-method-container');
    if (!container) return;

    if (!currentVariant) {
        container.innerHTML = '<span class="text-muted small" style="padding: 5px 0;">请先选择规格</span>';
        buyMethod = null;
        return;
    }

    const markup = parseFloat(currentVariant.custom_markup || 0);
    const showSelect = markup > 0;
    let label = currentVariant.selection_label || '自选卡密/号码';

    if (buyMethod === 'select' && !showSelect) buyMethod = null;

    let html = '';
    // 按钮1：默认随机
    const randomClass = buyMethod === 'random' ? 'btn-danger' : 'btn-outline-secondary';
    html += `<button class="btn btn-sm ${randomClass} me-2 mb-1 method-btn" data-type="random" onclick="selectBuyMethod('random', this)">默认随机</button>`;

    // 按钮2：自选
    if (showSelect) {
        const selectClass = buyMethod === 'select' ? 'btn-danger' : 'btn-outline-secondary';
        html += `<button class="btn btn-sm ${selectClass} mb-1 method-btn" data-type="select" onclick="selectBuyMethod('select', this)">${label}</button>`;
    }
    container.innerHTML = html;
}

// [修改] 购买方式点击事件
function selectBuyMethod(type, btn) {
    if (buyMethod === type) {
        buyMethod = null; // 取消选中
        closeNumberSelector();
    } else {
        buyMethod = type;
        if (type === 'select') {
            openNumberSelector(); // 打开弹窗
        } else {
            // 随机模式：清空已选自选信息，关闭弹窗
            selectedSpecificCardId = null;
            selectedSpecificCardInfo = '';
            closeNumberSelector();
        }
    }
    
    updateBuyMethodButtons(); 
    updateDynamicInfoDisplay(); 
    updateRealTimePrice();
}

// [新增] 打开号码选择器
async function openNumberSelector() {
    const modal = document.getElementById('number-selector-modal');
    const listContainer = document.getElementById('ns-list-container');
    const titleEl = document.getElementById('product-title-el');
    
    if (!modal || !currentVariant) return;

    // 动态定位 top (放在标题下面一点)
    if (titleEl) {
        modal.style.top = (titleEl.offsetTop + titleEl.offsetHeight + 15) + 'px';
    }

    modal.classList.add('active');
    listContainer.innerHTML = '<div class="text-center w-100 mt-3"><i class="fa fa-spinner fa-spin"></i> 加载中...</div>';

    try {
        const res = await fetch(`/api/shop/cards/notes?variant_id=${currentVariant.id}`);
        const data = await res.json();

        if (Array.isArray(data) && data.length > 0) {
            let html = '';
            data.forEach(item => {
                const isSelected = selectedSpecificCardId === item.id ? 'selected' : '';
                html += `<div class="ns-item ${isSelected}" onclick="selectNumberItem(${item.id}, '${item.note}')">${item.note}</div>`;
            });
            listContainer.innerHTML = html;
        } else {
            listContainer.innerHTML = '<div class="text-center w-100 mt-3 text-muted">暂无可自选号码</div>';
        }
    } catch (e) {
        listContainer.innerHTML = '<div class="text-center w-100 mt-3 text-danger">加载失败</div>';
    }
}

// [新增] 关闭号码选择器
function closeNumberSelector() {
    const modal = document.getElementById('number-selector-modal');
    if (modal) modal.classList.remove('active');
}

// [新增] 选中某个号码
function selectNumberItem(id, note) {
    selectedSpecificCardId = id;
    selectedSpecificCardInfo = note;
    
    // 高亮
    const items = document.querySelectorAll('.ns-item');
    items.forEach(el => el.classList.remove('selected'));
    event.target.classList.add('selected');
    
    // 更新显示
    updateDynamicInfoDisplay();
    updateRealTimePrice();
    
    // 关闭弹窗
    setTimeout(closeNumberSelector, 200);
}

// [修改] 动态更新价格下方的文字 (核心需求)
function updateDynamicInfoDisplay() {
    const displayDiv = document.getElementById('dynamic-info-display');
    if (!displayDiv) return;

    if (buyMethod === null || !currentVariant) {
        displayDiv.style.display = 'none';
        return;
    }

    displayDiv.style.display = 'block';
    const specName = currentVariant.name || currentVariant.specs || '默认规格';

    if (buyMethod === 'random') {
        // 显示：批发优惠...  后面显示：已选规格
        const promoText = parseWholesaleInfo(currentVariant.wholesale_config);
        let html = '';
        if (promoText) {
            html += `<span style="color:#dc3545;">批发优惠: ${promoText}</span>`;
        }
        // 只有随机模式下显示“已选：xxx”，且没有号码信息
        html += `<span style="float:right; color:#666; font-size:12px; margin-top:2px;">已选: ${specName}</span>`;
        html += `<div style="clear:both;"></div>`; // 清除浮动
        displayDiv.innerHTML = html;

    } else if (buyMethod === 'select') {
        // 显示：加价x.xx元   后面显示：已选规格+预设信息
        const markup = parseFloat(currentVariant.custom_markup || 0).toFixed(2);
        let html = `<span style="color:#dc3545;">加价 ${markup}元</span>`;
        
        let infoText = specName;
        if (selectedSpecificCardInfo) {
            infoText += ` + ${selectedSpecificCardInfo}`;
        }
        
        html += `<span style="float:right; color:#333; font-weight:500; font-size:12px; margin-top:2px;">已选: ${infoText}</span>`;
        html += `<div style="clear:both;"></div>`;
        displayDiv.innerHTML = html;
    }
}

function selectSku(index, btn) {
    if (!currentProduct) return;

    // 取消选中逻辑
    if (currentVariant && currentVariant.id === currentProduct.variants[index].id) {
        currentVariant = null;
        buyMethod = null;
        selectedSpecificCardId = null;
        selectedSpecificCardInfo = '';
        closeNumberSelector();

        document.querySelectorAll('.sku-btn').forEach(b => {
            b.classList.remove('btn-danger', 'active');
            b.classList.add('btn-outline-secondary');
        });
        
        document.getElementById('p-main-img').src = currentProduct.image_url;
        const totalStock = currentProduct.variants.reduce((sum, v) => sum + (parseInt(v.stock) || 0), 0);
        document.getElementById('p-stock').innerText = totalStock;

        updateBuyMethodButtons();
        updateDynamicInfoDisplay();
        updateRealTimePrice();
        return;
    }
    
    // 选中逻辑
    document.querySelectorAll('.sku-btn').forEach(b => {
        b.classList.remove('btn-danger', 'active');
        b.classList.add('btn-outline-secondary');
    });
    btn.classList.remove('btn-outline-secondary');
    btn.classList.add('btn-danger');

    const variant = currentProduct.variants[index];
    currentVariant = variant;
    
    const imgUrl = variant.image_url || currentProduct.image_url;
    document.getElementById('p-main-img').src = imgUrl;
    document.getElementById('p-stock').innerText = variant.stock;

    // 切换规格重置购买方式
    buyMethod = null;
    selectedSpecificCardId = null;
    selectedSpecificCardInfo = '';
    closeNumberSelector();

    updateBuyMethodButtons();
    updateDynamicInfoDisplay();
    updateRealTimePrice();
}

function renderSkuButtons(variants, selectedIdx = -1) {
    if (!variants || variants.length === 0) return '<span class="text-muted">默认规格</span>';
    return variants.map((v, index) => {
        const isOOS = v.stock <= 0;
        const isSelected = (selectedIdx !== -1) && (index === selectedIdx);
        let btnClass = isSelected ? 'btn-danger' : 'btn-outline-secondary';
        if (isOOS) btnClass += ' no-stock';
        
        const name = v.name || v.specs || `规格${index+1}`;
        const badgeHtml = isOOS ? '<span class="sku-oos-badge">缺货</span>' : '';
        
        return `<button class="btn btn-sm ${btnClass} me-2 mb-2 sku-btn" data-idx="${index}" onclick="${isOOS ? '' : `selectSku(${index}, this)`}" ${isOOS ? 'disabled' : ''}>${name}${badgeHtml}</button>`;
    }).join('');
}

function renderProductTags(tags) {
    if (!tags) return '';
    let tagList = typeof tags === 'string' ? tags.split(',') : tags;
    if (!Array.isArray(tagList) || tagList.length === 0) return '';
    
    return tagList.map(tagStr => {
        let borderColor = '#dc3545', bgColor = '#dc3545', textColor = '#ffffff';
        let text = tagStr.trim();
        if(!text) return '';
        
        const b1 = text.match(/b1#([0-9a-fA-F]{3,6})/);
        if(b1) { borderColor='#'+b1[1]; text=text.replace(b1[0],'').trim(); }
        const b2 = text.match(/b2#([0-9a-fA-F]{3,6})/);
        if(b2) { bgColor='#'+b2[1]; text=text.replace(b2[0],'').trim(); }
        const c = text.match(/#([0-9a-fA-F]{3,6})$/);
        if(c) { textColor='#'+c[1]; text=text.substring(0,c.index).trim(); }

        return `<span class="dynamic-tag" style="display:inline-block;margin-right:6px;margin-bottom:4px;padding:1px 5px;border:1px solid ${borderColor};background:${bgColor};color:${textColor};border-radius:3px;font-size:11px;">${text}</span>`;
    }).join('');
}

function selectPayment(type, el) {
    paymentMethod = type;
    document.querySelectorAll('.payment-option').forEach(opt => opt.classList.remove('active'));
    el.classList.add('active');
}

function changeQty(delta) {
    let newQty = quantity + delta;
    if (newQty < 1) newQty = 1;
    
    // 自选模式限购1个
    if (buyMethod === 'select') {
        newQty = 1;
    } else {
        if (currentVariant && newQty > currentVariant.stock) {
            alert('库存不足');
            newQty = currentVariant.stock;
        }
    }
    
    quantity = newQty;
    document.getElementById('buy-qty').value = quantity;
    updateRealTimePrice();
}

// [修改] 加入购物车逻辑
function addToCart() {
    if (!currentVariant) { alert('请先选择规格'); return; }
    if (currentVariant.stock <= 0) { alert('该规格缺货'); return; }
    if (buyMethod === null) { alert('请选择购买方式'); return; }

    // 自选模式校验
    if (buyMethod === 'select') {
        if (!selectedSpecificCardId) {
            alert('请选择一个号码/卡密');
            openNumberSelector(); // 自动打开弹窗
            return;
        }
    }

    let cart = JSON.parse(localStorage.getItem('tbShopCart') || '[]');
    
    // 检查是否已存在 (对于自选卡密，不能简单的合并数量，通常视为独立项或不允许重复)
    // 这里简化逻辑：如果是自选卡密，视为唯一商品，不与普通规格合并
    
    let existingItem = null;
    if (buyMethod === 'random') {
        existingItem = cart.find(item => item.variant_id === currentVariant.id && item.buyMode === 'random');
    } 
    // 自选模式下，如果不允许重复购买同一个卡密，可以检查 selectedCardId

    if (existingItem) {
        existingItem.quantity += quantity;
    } else {
        cart.push({
            product_id: currentProduct.id,
            variant_id: currentVariant.id,
            name: currentProduct.name,
            variant_name: currentVariant.name || currentVariant.specs,
            price: currentVariant.price, // 基础价格，结算时会重新计算
            image: currentVariant.image_url || currentProduct.image_url,
            quantity: quantity,
            
            // [关键] 传入购买方式和选中的卡密ID
            buyMode: buyMethod,
            selectedCardId: selectedSpecificCardId,
            selectedCardInfo: selectedSpecificCardInfo // 仅供前端展示用
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
    if (!currentVariant) { alert('请先选择规格'); return; }
    if (buyMethod === null) { alert('请选择购买方式'); return; }
    
    addToCart();
    // 稍微延迟跳转，让用户看到“已加入”反馈
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

// 分页逻辑 (保持不变)
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
            row.forEach(item => { item.style.display = shouldShow ? '' : 'none'; });
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
    window.addEventListener('resize', () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(calculatePages, 300); });
}

async function loadSidebarRecommendations() {
    try {
        const res = await fetch('/api/shop/products');
        const allProducts = await res.json();
        if (typeof renderSidebarTopSales === 'function') renderSidebarTopSales(allProducts);
        if (typeof checkSidebarStatus === 'function') checkSidebarStatus();
    } catch(e) {}
}

// =============================================
// === 实时价格计算
// =============================================

function updateRealTimePrice() {
    const priceEl = document.getElementById('p-display-price');
    if (!priceEl) return;

    if (!currentVariant) {
        if (currentProduct && currentProduct.variants && currentProduct.variants.length > 0) {
            const prices = currentProduct.variants.map(v => parseFloat(v.price));
            const minPrice = Math.min(...prices);
            const maxPrice = Math.max(...prices);
            priceEl.innerText = minPrice !== maxPrice ? `${minPrice.toFixed(2)}-${maxPrice.toFixed(2)}` : minPrice.toFixed(2);
        } else {
            priceEl.innerText = '0.00';
        }
        return;
    }

    let finalPrice = parseFloat(currentVariant.price);
    let displayHTML = finalPrice.toFixed(2);

    // 逻辑 A: 默认随机 -> 检查批发价
    if (buyMethod === 'random') {
        const rules = parseWholesaleDataForCalc(currentVariant.wholesale_config);
        if (rules.length > 0) {
            const rule = rules.find(r => quantity >= r.count);
            if (rule) {
                finalPrice = parseFloat(rule.price);
                displayHTML = finalPrice.toFixed(2);
            }
        }
    }
    // 逻辑 B: 自选规格 -> 显示加价公式
    else if (buyMethod === 'select') {
        const markup = parseFloat(currentVariant.custom_markup || 0);
        if (markup > 0) {
            // 基础价
            const basePrice = finalPrice; 
            // 总价 (含加价)
            const totalPrice = basePrice + markup;
            // 显示为: 基础价 + 加价 = 总价
            displayHTML = `<span style="font-size:0.5em; color:#666; vertical-align: middle;">${basePrice.toFixed(2)} + ${markup.toFixed(2)} = </span>${totalPrice.toFixed(2)}`;
        }
        
        // 如果数量 > 1，强制设为 1 (已在 changeQty 中处理，这里仅防卫)
        if (quantity > 1) {
             quantity = 1;
             document.getElementById('buy-qty').value = 1;
        }
    }

    priceEl.innerHTML = displayHTML;
}

function parseWholesaleDataForCalc(config) {
    let rules = [];
    if (!config) return rules;
    let data = config;
    if (typeof data === 'string') {
        try { 
            if (data.startsWith('[') || data.startsWith('{')) { data = JSON.parse(data); } 
            else {
                data.split(/[,，]/).forEach(p => {
                    const [k, v] = p.split('=');
                    if(k && v) rules.push({ count: parseInt(k), price: parseFloat(v) });
                });
                return rules.sort((a,b) => b.count - a.count);
            }
        } catch(e) { return []; }
    }
    if (Array.isArray(data)) {
         data.forEach(item => {
             const c = item.count || item.num || item.qty || item.n;
             const p = item.price || item.amount || item.p;
             if(c && p) rules.push({ count: parseInt(c), price: parseFloat(p) });
         });
    } else if (typeof data === 'object') {
        Object.entries(data).forEach(([k,v]) => { rules.push({ count: parseInt(k), price: parseFloat(v) }); });
    }
    return rules.sort((a,b) => b.count - a.count);
}
