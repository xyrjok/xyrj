// =============================================
// === themes/TBshop/files/product-page.js
// === (商品详情页专属逻辑 - 交互增强版)
// =============================================

// 全局变量
let currentProduct = null;   // 当前商品数据
let currentVariant = null;   // 当前选中的 SKU
let quantity = 1;            // 购买数量
let buyMethod = null;        // 购买方式: null (未选) | 'random' | 'select'
let paymentMethod = 'alipay'; // 默认支付方式
let selectedCardItem = null;  // [新增] 当前选中的具体卡密/号码信息

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

    // 1. 初始状态
    currentVariant = null; 
    buyMethod = null;
    selectedCardItem = null;
    
    // 计算价格范围
    let minPrice = 0, maxPrice = 0;
    let initialPriceDisplay = '0.00';
    let initialStock = 0;

    if (p.variants && p.variants.length > 0) {
        const prices = p.variants.map(v => parseFloat(v.price));
        minPrice = Math.min(...prices);
        maxPrice = Math.max(...prices);
        
        if (minPrice === maxPrice) {
            initialPriceDisplay = minPrice.toFixed(2);
        } else {
            initialPriceDisplay = `${minPrice.toFixed(2)}-${maxPrice.toFixed(2)}`;
        }
        initialStock = p.variants.reduce((acc, v) => acc + (v.stock || 0), 0);
    }

    const defaultImg = (p.variants && p.variants[0] && p.variants[0].image_url) ? p.variants[0].image_url : p.image_url;

    // 2. 构建 HTML 结构
    // [注意] 增加了 id="product-title-area" 用于定位标题
    // [注意] 增加了 id="card-select-module" 作为卡密选择模块的容器
    const html = `
        <div class="module-box product-showcase">
            <div class="row g-0">
                <div class="col-md-5">
                    <div class="p-3">
                        <div class="main-img-wrap border rounded mb-2" style="position:relative; padding-bottom:100%; overflow:hidden;">
                            <img id="p-main-img" src="${defaultImg}" class="position-absolute w-100 h-100" style="object-fit:contain; top:0; left:0;">
                        </div>
                    </div>
                </div>

                <div class="col-md-7">
                    <div class="p-3">
                        <h5 class="fw-bold mb-2" id="product-title-area" style="line-height:1.4;">${p.name}</h5>
                        
                        <div id="card-select-module" class="card-select-container mb-3" style="display:none; background:#f8f9fa; padding:10px; border:1px dashed #ccc; max-height: 200px; overflow-y: auto;">
                            <div class="text-muted small mb-2">请选择号码/卡密：</div>
                            <div id="card-select-list" class="d-flex flex-wrap gap-2"></div>
                        </div>

                        <div class="tb-tags-row mb-3" id="p-tags-container" style="min-height:20px;">
                            ${renderProductTags(p.tags)}
                        </div>

                        <div class="price-bar bg-light p-3 rounded mb-3">
                            <div class="d-flex justify-content-between align-items-start">
                                <div class="d-flex align-items-baseline text-danger">
                                    <span class="fw-bold me-1" style="font-size: 18px;">¥</span>
                                    <span class="fs-1 fw-bold" id="p-display-price" style="line-height: 1;">${initialPriceDisplay}</span>
                                </div>

                                <div class="text-muted small d-flex flex-column align-items-end" style="font-size: 13px;">
                                    <div class="mb-1">
                                        <span>库存: <span id="p-stock">${initialStock}</span></span>
                                        <span class="mx-2">|</span>
                                        <span>销量: ${p.variants.reduce((a,b)=>a+(b.sales_count||0), 0)}</span>
                                    </div>
                                </div>
                            </div>

                            <div id="dynamic-info-display" style="display:none; margin-top:8px; padding-top:8px; border-top:1px dashed #ddd;">
                                </div>
                        </div>

                        <div class="sku-section mb-4">
                            <div class="mb-2 text-secondary small" id="spec-label">选择规格 <span class="fw-normal text-muted" style="font-size: 0.9em;">(共${p.variants ? p.variants.length : 0}个)</span>：</div>
                            <div class="sku-list d-flex flex-wrap" id="sku-btn-list">
                                ${renderSkuButtons(p.variants, -1)}
                            </div>
                            <div id="spec-pagination-area" class="spec-pagination-container"></div>
                        </div>

                        <div class="mb-3 d-flex align-items-center flex-wrap">
                            <span class="text-secondary small me-3 text-nowrap">购买方式：</span>
                            <div class="d-flex align-items-center flex-wrap" id="buy-method-container">
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
    
    updateBuyMethodButtons(); 
    updateDynamicInfoDisplay();

    setTimeout(() => {
         if (typeof initSpecPagination === 'function') {
             initSpecPagination('#sku-btn-list', '.sku-btn', 6);
         }
    }, 100);
}

// =============================================
// === 交互逻辑
// =============================================

/**
 * [新增] 移动卡密选择模块的位置
 * direction: 'top' (移动到标题下), 'bottom' (移动回购买方式附近 - 暂时隐藏即可)
 */
function moveCardModule(direction) {
    const module = document.getElementById('card-select-module');
    const title = document.getElementById('product-title-area');
    
    if (!module || !title) return;

    if (direction === 'top') {
        // 将模块插入到标题元素之后
        title.insertAdjacentElement('afterend', module);
        module.style.display = 'block';
        module.classList.add('animate-fade-in'); // 可以配合CSS做动画
    } else {
        module.style.display = 'none';
    }
}

/**
 * [新增] 渲染具体卡密列表 (Mock数据或从product.cards获取)
 */
function renderCardSelectModule() {
    const listContainer = document.getElementById('card-select-list');
    if (!listContainer) return;
    
    // 这里需要根据实际数据来源调整
    // 假设 currentProduct.cards 包含所有卡密，我们需要过滤出属于 currentVariant 的卡密
    // 且只显示未售出的 (status=0 或 stock>0)
    
    let availableCards = [];
    if (currentProduct && currentProduct.cards) {
        // 简单过滤逻辑，请根据实际字段调整
        availableCards = currentProduct.cards.filter(c => 
            (!c.variant_id || c.variant_id == currentVariant.id) && 
            (!c.status || c.status == 0) // 假设0是未售出
        );
    } else {
        // 如果没有数据，为了演示UI效果，生成假数据 (请在生产环境移除)
        // availableCards = [
        //     {id:1, info:'预设号码 13800138000'},
        //     {id:2, info:'预设号码 13800138001'},
        //     {id:3, info:'预设号码 13800138002'}
        // ];
    }

    if (availableCards.length === 0) {
        listContainer.innerHTML = '<span class="text-muted">暂无可自选库存</span>';
        return;
    }

    listContainer.innerHTML = availableCards.map(card => `
        <button class="btn btn-outline-secondary btn-sm card-select-item" 
            onclick="onCardSelect(this, '${card.info || card.card_no || card.number}', '${card.id}')">
            ${card.info || card.card_no || card.number || '未知内容'}
        </button>
    `).join('');
}

/**
 * [新增] 点击具体卡密事件
 */
function onCardSelect(btn, info, id) {
    // 样式切换
    document.querySelectorAll('.card-select-item').forEach(b => {
        b.classList.remove('btn-danger', 'text-white');
        b.classList.add('btn-outline-secondary');
    });
    btn.classList.remove('btn-outline-secondary');
    btn.classList.add('btn-danger', 'text-white');

    // 记录选择
    selectedCardItem = { id: id, info: info };
    
    // 更新显示
    updateDynamicInfoDisplay();
}

function parseWholesaleInfo(config) {
    if (!config) return null;
    let rules = [];
    let data = config;

    if (typeof data === 'string') {
        data = data.trim();
        if (data.startsWith('[') || data.startsWith('{')) {
            try { data = JSON.parse(data); } 
            catch (e) { /* fallback */ }
        }
    }
    // 简单解析逻辑
    if (typeof data === 'string') {
         data.replace(/，/g, ',').split(',').forEach(item => {
            const [n, p] = item.split('=');
            if (n && p) rules.push(`${n}个起${p}元/1个`);
        });
        return rules.join('，');
    }
    if (typeof data === 'object' && data !== null) {
        if (Array.isArray(data)) {
            data.forEach(item => {
                const n = item.num || item.count || item.n;
                const p = item.price || item.money || item.p;
                if (n && p) rules.push(`${n}个起${p}元/1个`);
            });
        } else {
            Object.entries(data).forEach(([k, v]) => {
                if (!isNaN(k)) rules.push(`${k}个起${v}元/1个`);
            });
        }
    }
    return rules.join('，');
}

function updateBuyMethodButtons() {
    const container = document.getElementById('buy-method-container');
    if (!container) return;

    let targetVariant = currentVariant;
    if (!targetVariant && currentProduct && currentProduct.variants && currentProduct.variants.length > 0) {
        targetVariant = currentProduct.variants[0];
    }

    if (!targetVariant) { container.innerHTML = ''; return; }

    const markup = parseFloat(targetVariant.custom_markup || 0);
    const showSelect = markup > 0;
    let label = targetVariant.selection_label || '自选卡密/号码';

    if (buyMethod === 'select' && !showSelect) buyMethod = null;

    let html = '';
    const randomClass = buyMethod === 'random' ? 'btn-danger' : 'btn-outline-secondary';
    html += `<button class="btn btn-sm ${randomClass} me-2 mb-1 method-btn" data-type="random" onclick="selectBuyMethod('random', this)">默认随机</button>`;

    if (showSelect) {
        const selectClass = buyMethod === 'select' ? 'btn-danger' : 'btn-outline-secondary';
        html += `<button class="btn btn-sm ${selectClass} mb-1 method-btn" data-type="select" onclick="selectBuyMethod('select', this)">${label} (加价${markup.toFixed(2)}元)</button>`;
    }

    container.innerHTML = html;
}

function selectBuyMethod(type, btn) {
    if (!currentVariant) { alert('请先选择商品规格'); return; }

    if (buyMethod === type) {
        buyMethod = null; // 取消
        moveCardModule('bottom'); // 隐藏
        selectedCardItem = null;  // 重置具体选择
    } else {
        buyMethod = type;
        // [核心修改] 如果是自选，移动模块到标题下并渲染
        if (type === 'select') {
            renderCardSelectModule();
            moveCardModule('top');
        } else {
            moveCardModule('bottom');
            selectedCardItem = null;
        }
    }

    updateBuyMethodButtons(); 
    updateDynamicInfoDisplay(); 
    updateRealTimePrice();
}

function updateDynamicInfoDisplay() {
    const displayDiv = document.getElementById('dynamic-info-display');
    if (!displayDiv) return;

    if (buyMethod === null || !currentVariant) {
        displayDiv.style.display = 'none';
        return;
    }

    displayDiv.style.display = 'block';
    const variantName = currentVariant.name || currentVariant.specs || '';

    // --- 情况 A: 默认随机 ---
    // 显示：批发优惠 + 已选规格
    if (buyMethod === 'random') {
        const promoText = parseWholesaleInfo(currentVariant.wholesale_config);
        const promoHtml = (promoText && promoText !== '[]') 
            ? `批发优惠: ${promoText}` 
            : '暂无批发优惠';

        displayDiv.innerHTML = `
            <div style="font-size:13px;">
                <span style="color:#dc3545; font-weight:500; margin-right:8px;">
                    <i class="fa fa-tag me-1"></i>${promoHtml}
                </span>
                <span class="text-muted">已选: ${variantName}</span>
            </div>
        `;
    } 
    
    // --- 情况 B: 自选 ---
    // 显示：标签(加价) + 已选规格 + 卡密预设信息
    else if (buyMethod === 'select') {
        let label = currentVariant.selection_label || '自选卡密/号码';
        const markup = parseFloat(currentVariant.custom_markup || 0).toFixed(2);
        
        // 如果选中了具体的卡密，显示其信息
        const cardInfoHtml = selectedCardItem 
            ? `<span style="color:#198754; font-weight:bold; margin-left:8px;">[${selectedCardItem.info}]</span>` 
            : '';

        displayDiv.innerHTML = `
            <div style="font-size:13px;">
                <span style="color:#dc3545; font-weight:500; margin-right:5px;">
                    <i class="fa fa-check-circle me-1"></i>${label} (加价${markup}元)
                </span>
                <span class="text-muted">已选: ${variantName}</span>
                ${cardInfoHtml}
            </div>
        `;
    }
}

function selectSku(index, btn) {
    if (!currentProduct) return;
    
    const variant = currentProduct.variants[index];

    if (currentVariant && currentVariant.id === variant.id) {
        // 取消选中
        currentVariant = null;
        buyMethod = null;
        selectedCardItem = null;
        moveCardModule('bottom');
        
        document.querySelectorAll('.sku-btn').forEach(b => {
            b.classList.remove('btn-danger');
            b.classList.add('btn-outline-secondary');
        });
        const totalStock = currentProduct.variants.reduce((acc, v) => acc + (v.stock || 0), 0);
        document.getElementById('p-stock').innerText = totalStock;

        updateBuyMethodButtons();
        updateDynamicInfoDisplay();
        updateRealTimePrice(); 
        return;
    }

    currentVariant = variant;
    // 切换规格时重置购买方式和具体卡密选择
    buyMethod = null;
    selectedCardItem = null;
    moveCardModule('bottom');

    document.querySelectorAll('.sku-btn').forEach(b => {
        b.classList.remove('btn-danger');
        b.classList.add('btn-outline-secondary');
        b.classList.remove('active');
    });
    btn.classList.remove('btn-outline-secondary');
    btn.classList.add('btn-danger');

    updateRealTimePrice();
    document.getElementById('p-stock').innerText = variant.stock;
    if (variant.image_url) document.getElementById('p-main-img').src = variant.image_url;

    updateBuyMethodButtons();
    updateDynamicInfoDisplay();
}

function renderSkuButtons(variants, selectedIdx = -1) {
    if (!variants || variants.length === 0) return '<span class="text-muted">默认规格</span>';
    return variants.map((v, index) => {
        const isOOS = v.stock <= 0;
        const isSelected = index === selectedIdx; 
        let btnClass = isSelected ? 'btn-danger' : 'btn-outline-secondary';
        if (isOOS) btnClass += ' no-stock';
        const name = v.name || v.specs || `规格${index+1}`;
        return `<button class="btn btn-sm ${btnClass} me-2 mb-2 sku-btn" data-idx="${index}" onclick="${isOOS ? '' : `selectSku(${index}, this)`}" ${isOOS ? 'disabled' : ''}>${name}</button>`;
    }).join('');
}

function renderProductTags(tags) {
    if (!tags) return '';
    let tagList = typeof tags === 'string' ? tags.split(',') : tags;
    return tagList.map(t => `<span class="badge bg-danger me-1">${t}</span>`).join('');
}

async function loadSidebarRecommendations() { /* ... */ }
function selectPayment(type, el) {
    paymentMethod = type;
    document.querySelectorAll('.payment-option').forEach(o => o.classList.remove('active'));
    el.classList.add('active');
}

function changeQty(delta) {
    let newQty = quantity + delta;
    if (newQty < 1) newQty = 1;
    if (currentVariant && newQty > currentVariant.stock) newQty = currentVariant.stock;
    quantity = newQty;
    document.getElementById('buy-qty').value = quantity;
    updateRealTimePrice();
}

function addToCart() {
    if (!currentVariant) { alert('请选择商品规格'); return; }
    if (currentVariant.stock <= 0) { alert('该规格缺货'); return; }
    if (buyMethod === null) { alert('请选择购买方式'); return; }
    // 如果是自选模式，必须选具体卡密
    if (buyMethod === 'select' && !selectedCardItem) { alert('请选择具体的号码/卡密'); return; }

    // ... 购物车逻辑 ...
    // 这里省略了部分不影响UI的逻辑以保持简洁，完整逻辑请参考之前代码
    alert('已加入购物车');
}

function buyNow() {
    if (!currentVariant) { alert('请选择商品规格'); return; }
    if (buyMethod === null) { alert('请选择购买方式'); return; }
    if (buyMethod === 'select' && !selectedCardItem) { alert('请选择具体的号码/卡密'); return; }
    // ... 
    window.location.href = '/cart.html';
}

function updateRealTimePrice() {
    const priceEl = document.getElementById('p-display-price');
    if (!priceEl) return;

    if (!currentVariant) {
        if (!currentProduct || !currentProduct.variants) return;
        const prices = currentProduct.variants.map(v => parseFloat(v.price));
        const min = Math.min(...prices);
        const max = Math.max(...prices);
        priceEl.innerHTML = (min === max) ? min.toFixed(2) : `${min.toFixed(2)}-${max.toFixed(2)}`;
        return;
    }
    
    let finalPrice = parseFloat(currentVariant.price);
    let displayHTML = finalPrice.toFixed(2);

    if (buyMethod === 'random') {
        // 批发价计算逻辑 (省略，同之前)
        const rules = parseWholesaleDataForCalc(currentVariant.wholesale_config);
        if(rules.length > 0) {
             const rule = rules.find(r => quantity >= r.count);
             if(rule) { finalPrice = rule.price; displayHTML = parseFloat(finalPrice).toFixed(2); }
        }
    } else if (buyMethod === 'select') {
        const markup = parseFloat(currentVariant.custom_markup || 0);
        if (markup > 0) {
            const totalPrice = finalPrice + markup;
            displayHTML = `<span style="font-size:0.5em; color:#666; vertical-align: middle;">${finalPrice.toFixed(2)} + ${markup.toFixed(2)} = </span>${totalPrice.toFixed(2)}`;
        }
    }
    priceEl.innerHTML = displayHTML;
}

function parseWholesaleDataForCalc(config) {
    // ... (同之前的解析逻辑) ...
    let rules = [];
    try {
        if(typeof config === 'string') {
             config.split(/[,，]/).forEach(p => {
                const [k, v] = p.split('=');
                if(k && v) rules.push({ count: parseInt(k), price: parseFloat(v) });
            });
        }
    } catch(e){}
    return rules.sort((a,b) => b.count - a.count);
}

function showError(msg) { document.getElementById('product-loading').innerHTML = msg; }
function initSpecPagination() {} // 省略实现
