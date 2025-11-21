// =============================================
// === themes/TBshop/files/product-page.js
// === (商品详情页专属逻辑 - 深度定制版 V3)
// =============================================

// 全局变量
let currentProduct = null;   // 当前商品数据
let currentVariant = null;   // 当前选中的 SKU (初始为 null)
let selectedCardItem = null; // [新增] 当前自选选中的具体卡密/号码
let quantity = 1;            // 购买数量
let buyMethod = null;        // 购买方式: null (未选) | 'random' | 'select'
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

    // 1. 初始状态重置
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
                        <h5 class="fw-bold mb-2" style="line-height:1.4;">${p.name}</h5>
                        
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

                        <div id="card-selection-container" class="mb-4" style="display:none;">
                            <div class="mb-2 text-secondary small">选择号码/卡密信息：</div>
                            <div id="card-list-content" class="card-selection-box" style="max-height: 200px; overflow-y: auto; border: 1px solid #eee; padding: 10px; border-radius: 4px;">
                                </div>
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
    
    // 3. 初始化购买方式按钮
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
 * [核心] 解析批发价数据 (用于显示文本)
 */
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
    // 标准化处理
    if (typeof data === 'string') {
         data.replace(/，/g, ',').split(',').forEach(item => {
             const [n, p] = item.split('=');
             if (n && p) rules.push(`${n}个起${p}元/1个`);
         });
    } else if (Array.isArray(data)) {
        data.forEach(item => {
            const n = item.num || item.count || item.n;
            const p = item.price || item.amount || item.p;
            if (n !== undefined && p !== undefined) rules.push(`${n}个起${p}元/1个`);
        });
    } else if (typeof data === 'object' && data !== null) {
        Object.entries(data).forEach(([k, v]) => {
            if (!isNaN(k)) rules.push(`${k}个起${v}元/1个`);
        });
    }
    return rules.length > 0 ? rules.join('，') : '';
}

/**
 * [核心逻辑] 更新购买方式按钮
 */
function updateBuyMethodButtons() {
    const container = document.getElementById('buy-method-container');
    if (!container) return;

    // 即使未选规格，也尝试用第一个规格渲染按钮外观
    let targetVariant = currentVariant;
    if (!targetVariant && currentProduct && currentProduct.variants && currentProduct.variants.length > 0) {
        targetVariant = currentProduct.variants[0];
    }

    if (!targetVariant) {
        container.innerHTML = '';
        return;
    }

    const markup = parseFloat(targetVariant.custom_markup || 0);
    const showSelect = markup > 0;

    let label = targetVariant.selection_label || '自选卡密/号码';
    
    if (buyMethod === 'select' && !showSelect) buyMethod = null;

    let html = '';

    // 按钮1: 默认随机
    const randomClass = buyMethod === 'random' ? 'btn-danger' : 'btn-outline-secondary';
    html += `
        <button class="btn btn-sm ${randomClass} me-2 mb-1 method-btn" 
            data-type="random" onclick="selectBuyMethod('random', this)">
            默认随机
        </button>
    `;

    // 按钮2: 自选 (有加价时显示)
    if (showSelect) {
        const selectClass = buyMethod === 'select' ? 'btn-danger' : 'btn-outline-secondary';
        html += `
            <button class="btn btn-sm ${selectClass} mb-1 method-btn" 
                data-type="select" onclick="selectBuyMethod('select', this)">
                ${label} (加价${markup.toFixed(2)}元)
            </button>
        `;
    }
    container.innerHTML = html;
}

/**
 * [核心] 切换购买方式
 */
function selectBuyMethod(type, btn) {
    if (!currentVariant) { alert('请先选择商品规格'); return; }

    // 点击已选中的则取消
    if (buyMethod === type) {
        buyMethod = null;
        selectedCardItem = null; // 清除已选卡密
    } else {
        buyMethod = type;
        selectedCardItem = null; // 切换方式时清除已选卡密
    }

    updateBuyMethodButtons(); 
    updateCardSelectionArea(); // 更新卡密列表显示状态
    updateDynamicInfoDisplay(); 
    updateRealTimePrice();
}

/**
 * [新增] 更新卡密/号码自选区域
 */
function updateCardSelectionArea() {
    const area = document.getElementById('card-selection-container');
    const listContent = document.getElementById('card-list-content');
    if (!area || !listContent) return;

    // 只有在选择“自选”模式且有规格时才显示
    if (buyMethod === 'select' && currentVariant) {
        area.style.display = 'block';
        
        // 渲染列表
        // 注意：此处假设 variants 中包含 cards 数组，或者 cards 数据在 product.cards 中
        // 如果数据结构不同，请根据实际情况调整 cardsSource
        let cardsSource = currentVariant.cards || []; 
        // 如果 variant 没带 cards，尝试从 product.cards 过滤 (假设有 variant_id 关联)
        if ((!cardsSource || cardsSource.length === 0) && currentProduct.cards) {
             cardsSource = currentProduct.cards.filter(c => c.variant_id == currentVariant.id);
        }

        if (!cardsSource || cardsSource.length === 0) {
            listContent.innerHTML = '<div class="text-muted small p-2">该规格暂无可选号码/卡密</div>';
        } else {
            listContent.innerHTML = cardsSource.map((card, idx) => {
                // 获取预设信息 (优先找 info, yushe, desc 等字段)
                const infoText = card.info || card.yushe || card.note || card.desc || `号码${idx+1}`;
                const isSelected = selectedCardItem && selectedCardItem.id === card.id;
                
                return `
                    <div class="d-flex align-items-center p-2 border-bottom card-select-item ${isSelected ? 'bg-light' : ''}" 
                         style="cursor:pointer;" 
                         onclick="selectCardItem(${idx}, this)">
                        <input type="radio" name="card_select_radio" ${isSelected ? 'checked' : ''} class="me-2">
                        <span class="small text-secondary">${infoText}</span>
                    </div>
                `;
            }).join('');
            
            // 将 cardsSource 暂存以便点击时获取
            window._currentCards = cardsSource;
        }
    } else {
        area.style.display = 'none';
        listContent.innerHTML = '';
    }
}

// [新增] 选择具体的卡密项
function selectCardItem(index, el) {
    const cards = window._currentCards || [];
    if (cards[index]) {
        selectedCardItem = cards[index];
        
        // 更新 UI 高亮
        document.querySelectorAll('.card-select-item').forEach(d => d.classList.remove('bg-light'));
        el.classList.add('bg-light');
        const radio = el.querySelector('input[type="radio"]');
        if(radio) radio.checked = true;

        // 更新显示信息
        updateDynamicInfoDisplay();
    }
}

/**
 * [核心] 更新价格下方的动态信息栏 (严格按需求定制)
 */
function updateDynamicInfoDisplay() {
    const displayDiv = document.getElementById('dynamic-info-display');
    if (!displayDiv) return;

    if (buyMethod === null || !currentVariant) {
        displayDiv.style.display = 'none';
        return;
    }

    displayDiv.style.display = 'block';
    const variantName = currentVariant.name || currentVariant.specs || '默认规格';

    // --- 情况 A: 默认随机 ---
    if (buyMethod === 'random') {
        const promoText = parseWholesaleInfo(currentVariant.wholesale_config) || '暂无批发优惠';
        
        // 需求：显示批发优惠 + 已选规格 (不显示卡密信息)
        displayDiv.innerHTML = `
            <div class="d-flex flex-wrap align-items-center gap-2">
                <span style="color:#dc3545; font-size:13px; font-weight:500;">
                    <i class="fa fa-tag me-1"></i> 批发优惠: ${promoText}
                </span>
                <span class="text-muted ms-1" style="font-size:13px;">
                    (已选: ${variantName})
                </span>
            </div>
        `;
    } 
    
    // --- 情况 B: 自选 (加价) ---
    else if (buyMethod === 'select') {
        const label = currentVariant.selection_label || '自选卡密/号码';
        const markup = parseFloat(currentVariant.custom_markup || 0).toFixed(2);
        
        // 获取已选的卡密预设信息
        let cardInfoStr = '';
        if (selectedCardItem) {
            cardInfoStr = ' - ' + (selectedCardItem.info || selectedCardItem.yushe || selectedCardItem.note || '已选号码');
        }

        // 需求：显示加价标签 + 已选规格 + 卡密预设信息
        displayDiv.innerHTML = `
            <div class="d-flex flex-wrap align-items-center gap-2">
                <span style="color:#dc3545; font-size:13px; font-weight:500;">
                    <i class="fa fa-check-circle me-1"></i> ${label} (加价 ${markup}元)
                </span>
                <span class="text-muted ms-1" style="font-size:13px;">
                    (已选: ${variantName}${cardInfoStr})
                </span>
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
        
        document.querySelectorAll('.sku-btn').forEach(b => {
            b.classList.remove('btn-danger');
            b.classList.add('btn-outline-secondary');
        });

        const totalStock = currentProduct.variants.reduce((acc, v) => acc + (v.stock || 0), 0);
        document.getElementById('p-stock').innerText = totalStock;

        updateBuyMethodButtons();
        updateCardSelectionArea();
        updateDynamicInfoDisplay();
        updateRealTimePrice();
        return;
    }

    // 正常选中
    currentVariant = variant;
    selectedCardItem = null; // 换规格需重选卡密
    
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
    updateCardSelectionArea();
    updateDynamicInfoDisplay();
}

// --- 辅助函数 ---

function renderSkuButtons(variants, selectedIdx = -1) {
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
    
    updateRealTimePrice();
}

function addToCart() {
    if (!currentVariant) { alert('请选择商品规格'); return; }
    if (currentVariant.stock <= 0) { alert('该规格缺货'); return; }
    if (buyMethod === null) { alert('请选择购买方式'); return; }
    // 如果是自选模式，必须选一个卡密
    if (buyMethod === 'select' && !selectedCardItem) {
        alert('请选择具体的号码/卡密信息');
        return;
    }

    let cart = JSON.parse(localStorage.getItem('tbShopCart') || '[]');
    const existingItem = cart.find(item => item.variant_id === currentVariant.id);
    
    // 构建购物车数据
    const itemData = {
        product_id: currentProduct.id,
        variant_id: currentVariant.id,
        name: currentProduct.name,
        variant_name: currentVariant.name || currentVariant.specs,
        price: currentVariant.price,
        image: currentVariant.image_url || currentProduct.image_url,
        quantity: quantity,
        // 增加购买方式和选中的卡密ID
        buy_method: buyMethod,
        selected_card_id: selectedCardItem ? selectedCardItem.id : null,
        selected_card_info: selectedCardItem ? (selectedCardItem.info || selectedCardItem.yushe) : null
    };

    if (existingItem) {
        existingItem.quantity += quantity;
        // 简单的合并逻辑，如果需要区分不同卡密则不能合并，此处暂按原逻辑
    } else {
        cart.push(itemData);
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
    if (!currentVariant) { alert('请选择商品规格'); return; }
    if (buyMethod === null) { alert('请选择购买方式'); return; }
    addToCart();
    setTimeout(() => {
        window.location.href = '/cart.html';
    }, 200);
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

function updateRealTimePrice() {
    const priceEl = document.getElementById('p-display-price');
    if (!priceEl) return;

    if (!currentVariant) {
        if (!currentProduct || !currentProduct.variants) return;
        const prices = currentProduct.variants.map(v => parseFloat(v.price));
        const min = Math.min(...prices);
        const max = Math.max(...prices);
        if (min === max) {
            priceEl.innerHTML = min.toFixed(2);
        } else {
            priceEl.innerHTML = `${min.toFixed(2)}-${max.toFixed(2)}`;
        }
        return;
    }
    
    let finalPrice = parseFloat(currentVariant.price);
    let displayHTML = finalPrice.toFixed(2);

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
    else if (buyMethod === 'select') {
        const markup = parseFloat(currentVariant.custom_markup || 0);
        if (markup > 0) {
            const totalPrice = finalPrice + markup;
            displayHTML = `<span style="font-size:0.5em; color:#666; vertical-align: middle;">${finalPrice.toFixed(2)} + ${markup.toFixed(2)} = </span>${totalPrice.toFixed(2)}`;
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
            if (data.startsWith('[') || data.startsWith('{')) {
                data = JSON.parse(data); 
            } else {
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
             const c = item.count || item.num || item.n;
             const p = item.price || item.amount || item.p;
             if(c && p) rules.push({ count: parseInt(c), price: parseFloat(p) });
         });
    } else if (typeof data === 'object') {
        Object.entries(data).forEach(([k,v]) => {
             rules.push({ count: parseInt(k), price: parseFloat(v) });
        });
    }
    return rules.sort((a,b) => b.count - a.count);
}
