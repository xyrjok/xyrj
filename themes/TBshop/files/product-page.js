// =============================================
// === themes/TBshop/files/product-page.js
// === (商品详情页专属JS - 最终修复版)
// =============================================

let currentProduct = null;
let selectedVariant = null;
let selectedCardId = null;
let selectedCardNote = null; 
let buyMode = null; // 'random' 或 'select'
let currentAction = 'buy'; // 'buy' (立即购买) 或 'cart' (加入购物车)

const skuSheetEl = document.getElementById('skuSheet');
let skuSheet = null;

// SKU 面板分页
let specPages = []; 
let specCurrentPage = 1;
const specListMaxRows = 6;
let hasCalculatedPages = false;

// PC端页内规格分页
let pcSpecPages = [];
let pcSpecCurrentPage = 1;
let pcHasCalculatedPages = false;


// =============================================
// === 初始化与页面加载 ===
// =============================================

// 确保 bootstrap 实例加载
document.addEventListener('DOMContentLoaded', () => {
    if(skuSheetEl && typeof bootstrap !== 'undefined') {
        skuSheet = new bootstrap.Offcanvas(skuSheetEl);
        
        // 监听SKU面板打开事件
        skuSheetEl.addEventListener('show.bs.offcanvas', onSkuSheetShow);
    }
    
    // 启动页面加载
    init();
});

// SKU 面板打开时的逻辑
function onSkuSheetShow() {
    // 1. 计算规格分页 (Lazy Load)
    if (!hasCalculatedPages && currentProduct) {
        calculateSpecPages();
        hasCalculatedPages = true;
    }

    // 2. 更新按钮状态
    const confirmBtn = skuSheetEl.querySelector('.btn-confirm');
    if (confirmBtn) {
        if (currentAction === 'cart') {
            confirmBtn.innerText = '加入购物车';
            confirmBtn.onclick = submitAddToCart; 
        } else {
            confirmBtn.innerText = '确定支付';
            confirmBtn.onclick = submitOrder; 
        }
    }

    // 3. 同步PC端状态
    if (selectedVariant) {
        // 同步购买模式
        const modeContainer = document.getElementById('buy-mode-container');
        if (modeContainer && !modeContainer.classList.contains('d-none')) {
            const randomRadio = document.getElementById('mode_random');
            const selectRadio = document.getElementById('mode_select');
            
            if (buyMode === 'random') {
                if(randomRadio) randomRadio.checked = true;
            } else if (buyMode === 'select') {
                if(selectRadio) selectRadio.checked = true;
            } else {
                if(randomRadio) randomRadio.checked = false;
                if(selectRadio) selectRadio.checked = false;
            }
            toggleBuyMode(); // 更新UI显示
            
            if (buyMode === 'select') {
                document.getElementById('card-selector').classList.remove('d-none');
                loadCardNotes('card-list'); 
            }
        }

        // 同步数量
        const pcQtyInput = document.getElementById('buy-qty-pc');
        const skuQtyInput = document.getElementById('buy-qty');
        if (pcQtyInput && skuQtyInput) {
            skuQtyInput.value = pcQtyInput.value;
        }

        updatePrice();
    }
}

/**
 * 页面加载总入口
 */
async function init() {
    // 1. 更新购物车角标 (调用 common.js)
    if (typeof loadCartBadge === 'function') loadCartBadge();
    
    const urlParams = new URLSearchParams(window.location.search);
    const id = urlParams.get('id');
    if(!id) return alert('未指定商品ID');

    // 2. 加载公共配置
    try {
        const configRes = await fetch('/api/shop/config');
        const siteConfig = await configRes.json();
        if (typeof renderGlobalHeaders === 'function') renderGlobalHeaders(siteConfig);
        if (typeof renderSidebarNoticeContact === 'function') renderSidebarNoticeContact(siteConfig);
    } catch (e) { console.error('Config load failed', e); }

    // 3. 加载商品数据 (使用新接口 /api/shop/product)
    try {
        const res = await fetch(`/api/shop/product?id=${id}`);
        const data = await res.json();
        
        if(data.error) {
            alert(data.error);
            return;
        }
        
        currentProduct = data;
        renderPage(); // 渲染页面核心

        // 加载侧栏推荐 (需要获取列表)
        loadSidebarData();

    } catch (e) { console.error(e); alert('商品加载失败，请检查网络'); }

    // 4. 加载文章分类 (侧栏)
    try {
        const artRes = await fetch('/api/shop/articles/list');
        const articles = await artRes.json();
        if (typeof renderSidebarArticleCats === 'function') renderSidebarArticleCats(articles);
    } catch(e) {}
    
    // 5. 调整侧边栏高度
    if (typeof checkSidebarStatus === 'function') setTimeout(checkSidebarStatus, 500);
}

async function loadSidebarData() {
    try {
        const res = await fetch('/api/shop/products');
        const allProducts = await res.json();
        if (typeof renderSidebarTopSales === 'function') renderSidebarTopSales(allProducts);
        if (typeof renderSidebarTagCloud === 'function') renderSidebarTagCloud(allProducts);
    } catch(e){}
}


// =============================================
// === 页面渲染逻辑 ===
// =============================================

function renderPage() {
    const p = currentProduct;
    
    // 1. 计算价格区间
    const prices = p.variants.map(v => v.price);
    const minPrice = Math.min(...prices);
    const maxPrice = Math.max(...prices);
    const priceDisplay = (minPrice === maxPrice) ? minPrice : `${minPrice} - ${maxPrice}`;
    
    // 2. 填充基础信息
    document.title = `${p.name} - TB Shop`;
    
    const setText = (id, txt) => { const el = document.getElementById(id); if(el) el.innerText = txt; };
    const setSrc = (id, src) => { const el = document.getElementById(id); if(el) el.src = src; };
    
    setText('p-title', p.name);
    setText('sku-title', p.name);
    setText('p-desc', p.description || '暂无详细介绍');
    setText('p-price', priceDisplay);
    setText('sku-price-text', priceDisplay);
    
    const totalSales = p.variants.reduce((s,v) => s + (v.sales_count||0), 0);
    const totalStock = p.variants.reduce((s,v) => s + (v.stock||0), 0);
    setText('p-sales', `已售: ${totalSales}`);
    setText('p-stock', `库存: ${totalStock}`);
    
    const defV = p.variants[0];
    const mainImg = p.image_url || (defV && defV.image_url ? defV.image_url : '/themes/TBshop/assets/no-image.png');
    setSrc('p-img', mainImg);
    setSrc('sku-img', mainImg);
    
    // 3. 重置状态
    buyMode = null;
    selectedVariant = null;
    selectedCardId = null;
    
    // SKU 面板重置
    hasCalculatedPages = false;
    specPages = [];
    document.getElementById('variant-list').innerHTML = '<div class="text-muted small">规格加载中...</div>';
    document.getElementById('sku-spec-title-container').innerHTML = `规格 <span style="font-size: 12px; color: #999;">（共${p.variants.length}个）</span>`;
    
    // PC 面板重置
    pcHasCalculatedPages = false;
    pcSpecPages = [];
    document.getElementById('buy-mode-container-pc').classList.add('d-none');
    document.getElementById('quantity-container-pc').classList.add('d-none');
    document.getElementById('buy-qty-pc').value = 1;
    selectPcBuyMode(null);
    
    // 更新 PC 端元素
    updatePcElements(p, null, priceDisplay);
    
    // 4. 渲染 PC 端规格列表 (立即执行)
    const pcTitleContainer = document.getElementById('sku-spec-title-container-pc');
    if (pcTitleContainer) pcTitleContainer.innerHTML = `规格 <span style="font-size: 12px; color: #999;">（共${p.variants.length}个）</span>`;
    calculatePCSpecPages();
    pcHasCalculatedPages = true;

    // 移动端规格预览文字
    let tagsHtml = p.variants.slice(0, 10).map(v => `<span class="sku-preview-tag">${v.name}</span>`).join('');
    if (p.variants.length > 10) tagsHtml += ` <span class="text-danger small">更多...</span>`;
    document.getElementById('p-select-text').innerHTML = tagsHtml;
}

function updatePcElements(product, variant, priceStr) {
    const p = product || currentProduct;
    const v = variant || null;
    if (!p) return;
    
    // 更新图片、标题、价格
    const defV = p.variants[0];
    const targetImg = v ? (v.image_url || p.image_url || defV.image_url) : (p.image_url || defV.image_url);
    const pImgPc = document.getElementById('p-img-pc');
    if (pImgPc) pImgPc.src = targetImg || '/themes/TBshop/assets/no-image.png';
    
    const pTitlePc = document.getElementById('p-title-pc');
    if (pTitlePc) pTitlePc.innerText = p.name;
    
    const pPricePc = document.getElementById('p-price-pc');
    if (pPricePc && !selectedVariant) pPricePc.innerText = priceStr;

    const pStockPc = document.getElementById('p-stock-pc');
    const pSalesPc = document.getElementById('p-sales-pc');
    if (pStockPc) pStockPc.innerText = `库存: ${v ? v.stock : p.variants.reduce((s,i)=>s+(i.stock||0),0)}`;
    if (pSalesPc) pSalesPc.innerText = `已售: ${v ? v.sales_count : p.variants.reduce((s,i)=>s+(i.sales_count||0),0)}`;
    
    const pDescPc = document.getElementById('p-desc-pc');
    if (pDescPc) pDescPc.innerText = p.description || '暂无详细介绍';
    
    // 更新额外的标签信息
    const pExtraInfoPc = document.getElementById('p-extra-info-pc');
    if(pExtraInfoPc) {
        let html = '';
        // 显示自选加价标签
        const showMarkup = v ? (v.custom_markup > 0) : p.variants.some(i => i.custom_markup > 0);
        if (showMarkup) html += `<span class="extra-tag-solid">自选加价</span> `;
        
        // 显示批发价标签
        let wsText = '';
        if (v && v.wholesale_config) {
            try {
                let ws = v.wholesale_config;
                if (typeof ws === 'string') ws = JSON.parse(ws);
                if (Array.isArray(ws) && ws.length > 0) {
                    ws.sort((a, b) => a.qty - b.qty);
                    wsText = `批发价：${ws.map(w => `${w.qty}起${w.price}元`).join('，')}`;
                }
            } catch(e){}
        } else if (!v && p.variants.some(i => i.wholesale_config)) {
            wsText = `批发价：请选择规格`;
        }
        
        if (wsText) html += `<span style="padding-top: 2px;vertical-align: middle;">${wsText}</span>`;
        
        pExtraInfoPc.innerHTML = html;
        pExtraInfoPc.classList.toggle('d-none', !html);
    }
}


// =============================================
// === 规格选择逻辑 (核心) ===
// =============================================

function selectVariant(vid) {
    selectedVariant = currentProduct.variants.find(v => v.id == vid);
    
    // 1. 更新列表高亮 (PC & Mobile)
    renderSpecListPage(specCurrentPage);
    if (pcHasCalculatedPages) renderPCSpecListPage(pcSpecCurrentPage);
    
    // 2. 更新基础信息 (Mobile)
    document.getElementById('sku-stock-text').innerText = selectedVariant.stock;
    document.getElementById('sku-selected-text').innerText = selectedVariant.name;
    document.getElementById('p-price').innerText = selectedVariant.price;
    const labelText = selectedVariant.selection_label || '自选卡密/号码';
    document.getElementById('selection-label-text').innerText = labelText;
    
    document.getElementById('p-select-text').innerHTML = `<div style="padding-right: 10px;">已选: ${selectedVariant.name}</div>`;
    
    const targetImg = selectedVariant.image_url || currentProduct.image_url || '/themes/TBshop/assets/no-image.png';
    document.getElementById('sku-img').src = targetImg;
    document.getElementById('p-img').src = targetImg;
    
    renderExtraInfo(selectedVariant); // 更新移动端额外标签
    
    // 3. 更新批发价描述
    const wsDesc = getWholesaleDesc(selectedVariant);
    document.getElementById('random-mode-desc').innerText = wsDesc || '暂无批发价';
    document.getElementById('random-mode-desc-pc').innerText = wsDesc || '暂无批发价';

    // 4. [关键修复] 控制购买方式面板显示
    // 只要是自动发货 (auto_delivery === 1)，就显示自选面板，不管有没有加价
    const showBuyMode = (selectedVariant.auto_delivery === 1);
    
    // SKU 面板控制
    const modeContainer = document.getElementById('buy-mode-container');
    if (showBuyMode) {
        modeContainer.classList.remove('d-none');
        document.getElementById('markup-amount').innerText = selectedVariant.custom_markup || '0.00';
    } else {
        modeContainer.classList.add('d-none');
    }

    // PC 面板控制
    const modeContainerPc = document.getElementById('buy-mode-container-pc');
    const qtyContainerPc = document.getElementById('quantity-container-pc');
    if (showBuyMode) {
        modeContainerPc.classList.remove('d-none');
        qtyContainerPc.classList.remove('d-none');
        document.getElementById('markup-amount-pc').innerText = selectedVariant.custom_markup || '0.00';
        document.getElementById('selection-label-text-pc').innerText = labelText;
        
        // 重置 PC 选择
        selectPcBuyMode(null);
        document.getElementById('buy-qty-pc').value = 1;
        selectedCardId = null;
        selectedCardNote = null;
    } else {
        modeContainerPc.classList.add('d-none'); // 隐藏购买方式选择
        qtyContainerPc.classList.remove('d-none'); // 但显示数量选择
        
        // 重置
        selectPcBuyMode(null);
        document.getElementById('buy-qty-pc').value = 1;
    }
    
    // 5. 重置全局状态
    buyMode = null; 
    selectedCardId = null; 
    selectedCardNote = null;
    document.getElementsByName('buy_mode').forEach(r => r.checked = false);
    document.getElementById('card-selector').classList.add('d-none');
    
    // 6. 更新最终价格 & PC端UI
    updatePrice();
    updatePcElements(currentProduct, selectedVariant, selectedVariant.price);
    updatePcSelectionText();
}

function getWholesaleDesc(v) {
    if (v && v.wholesale_config) {
        try {
            let ws = v.wholesale_config;
            if (typeof ws === 'string') ws = JSON.parse(ws);
            if (Array.isArray(ws) && ws.length > 0) {
                ws.sort((a, b) => a.qty - b.qty);
                return `批发价：${ws.map(w => `${w.qty}起${w.price}元`).join('，')}`;
            }
        } catch(e) {}
    }
    return null;
}

// =============================================
// === 购买方式 & 卡密选择逻辑 ===
// =============================================

// 移动端切换购买方式
function toggleBuyMode() {
    const radios = document.getElementsByName('buy_mode');
    let currentSkuBuyMode = null;
    for(let r of radios) if(r.checked) currentSkuBuyMode = r.value;
    
    buyMode = currentSkuBuyMode;
    
    const cardSelector = document.getElementById('card-selector');
    if (currentSkuBuyMode === 'select') {
        cardSelector.classList.remove('d-none');
        document.getElementById('buy-qty').value = 1;
        loadCardNotes('card-list'); 
        selectPcBuyMode('select'); // 同步PC
    } else {
        cardSelector.classList.add('d-none');
        if (currentSkuBuyMode === 'random') {
            selectedCardId = null;
            selectedCardNote = null;
            selectPcBuyMode('random'); // 同步PC
        }
    }
    updatePrice();
}

// PC端切换购买方式
function selectPcBuyMode(mode) {
    buyMode = mode;
    const randomBtn = document.getElementById('mode_random_pc');
    const selectBtn = document.getElementById('mode_select_pc');
    
    if(randomBtn) randomBtn.classList.remove('active');
    if(selectBtn) selectBtn.classList.remove('active');
    
    const qtyInput = document.getElementById('buy-qty-pc');
    const stepper = document.querySelector('#quantity-container-pc .stepper-pc');

    if (mode === 'random') {
        if(randomBtn) randomBtn.classList.add('active');
        selectedCardId = null;
        selectedCardNote = null;
        if(qtyInput) qtyInput.disabled = false;
        if(stepper) stepper.style.opacity = '1';
        validateQty(qtyInput); 
    } else if (mode === 'select') {
        if(selectBtn) selectBtn.classList.add('active');
        if(qtyInput) {
            qtyInput.value = 1;
            qtyInput.disabled = true;
        }
        if(stepper) stepper.style.opacity = '0.5';
    } else {
        selectedCardId = null;
        selectedCardNote = null;
        if(qtyInput) qtyInput.disabled = false;
        if(stepper) stepper.style.opacity = '1';
    }
    updatePcSelectionText();
    updatePrice();
}

// PC端点击处理
function handlePcBuyModeClick(mode) {
    if (buyMode === mode) {
        selectPcBuyMode(null); // 取消
        if (mode === 'select') togglePcCardPanel(false);
    } else {
        selectPcBuyMode(mode);
        if (mode === 'select') {
            loadCardNotes('card-list-pc');
            togglePcCardPanel(true);
        } else {
            togglePcCardPanel(false);
        }
    }
}

// 移动端点击处理
function handleMobileBuyModeClick(event, mode) {
    const radio = document.getElementById(mode === 'select' ? 'mode_select' : 'mode_random');
    if (radio.checked) {
        event.preventDefault();
        radio.checked = false;
        buyMode = null;
        toggleBuyMode();
    }
}

// 加载卡密列表
async function loadCardNotes(targetListId) {
    if (!selectedVariant) return;
    const listEl = document.getElementById(targetListId);
    if (!listEl) return;
    
    listEl.innerHTML = '<div class="text-center text-muted w-100" style="grid-column: 1/-1;">加载中...</div>';
    try {
        const res = await fetch(`/api/shop/cards/notes?variant_id=${selectedVariant.id}`);
        const notes = await res.json();
        if (notes.length === 0) { 
            listEl.innerHTML = '<div class="text-center text-muted w-100" style="grid-column: 1/-1;">暂无可自选号码</div>'; 
            return; 
        }
        
        listEl.innerHTML = notes.map(n => 
            `<div class="card-option" onclick="selectCard(this, ${n.id})">${n.note}</div>`
        ).join('');

        // 高亮已选
        if (selectedCardId) {
            const options = listEl.querySelectorAll('.card-option');
            for (let opt of options) {
                if (opt.getAttribute('onclick').includes(`selectCard(this, ${selectedCardId})`)) {
                    opt.classList.add('active');
                    break;
                }
            }
        }
    } catch(e) { 
        listEl.innerHTML = '<div class="text-danger">加载失败</div>'; 
    }
}

// 选择卡密
function selectCard(el, id) {
    const parentList = el.closest('.card-select-list, .card-select-list-pc');
    if (parentList) {
        parentList.querySelectorAll('.card-option').forEach(opt => opt.classList.remove('active'));
    }
    el.classList.add('active');
    selectedCardId = id;
    selectedCardNote = el.innerText;
}

// PC 卡密面板开关
function togglePcCardPanel(show) {
    const panel = document.getElementById('pc-card-selector-panel');
    const container = document.querySelector('#main-content-row-pc .col-lg-9 .col-md-7');
    const buyModeContainer = document.getElementById('buy-mode-container-pc');
    const titleElement = document.getElementById('p-title-pc'); 
    const divider = buyModeContainer ? buyModeContainer.previousElementSibling : null;

    if (show) {
        if (container && divider && titleElement) {
            const bottomPos = container.offsetHeight - divider.offsetTop;
            panel.style.bottom = bottomPos + 'px';
            const titleBottom = titleElement.offsetTop + titleElement.offsetHeight;
            const availableHeight = divider.offsetTop - titleBottom - 15;
            panel.style.maxHeight = availableHeight + 'px';
        }
        panel.classList.add('show');
    } else {
        panel.classList.remove('show');
        panel.style.maxHeight = '0px';
        if (buyMode === 'select' && !selectedCardId) selectPcBuyMode(null);
        else {
            updatePcSelectionText();
            updatePrice();
        }
    }
}

function confirmPcCardSelection() {
    togglePcCardPanel(false);
    updatePcSelectionText();
    updatePrice();
}


// =============================================
// === 价格与数量计算 ===
// =============================================

function updatePrice() {
    if (!selectedVariant) return;
    
    let price = selectedVariant.price;
    const qtyInput = document.getElementById('buy-qty');
    const qty = qtyInput ? parseInt(qtyInput.value) : 1;
    
    const basePrice = selectedVariant.price; 
    let markup = 0; 

    if (buyMode === 'select') {
        markup = selectedVariant.custom_markup || 0;
        price += markup; 
    } else if (buyMode === 'random') {
        if (selectedVariant.wholesale_config) {
            try {
                let ws = typeof selectedVariant.wholesale_config === 'string' ? JSON.parse(selectedVariant.wholesale_config) : selectedVariant.wholesale_config;
                if (Array.isArray(ws)) {
                    ws.sort((a,b) => b.qty - a.qty);
                    for(let rule of ws) { 
                        if(qty >= rule.qty) { price = rule.price; break; } 
                    }
                }
            } catch(e) {}
        }
    }
    
    const finalUnitPriceStr = price.toFixed(2);
    document.getElementById('sku-price-text').innerText = finalUnitPriceStr;

    // PC 端显示
    const pPricePc = document.getElementById('p-price-pc');
    if (pPricePc) {
        if (buyMode === 'select' && markup > 0) {
            pPricePc.innerHTML = `<span style="font-size: 16px; font-weight: normal; color: #555;">${basePrice.toFixed(2)} (规格价) + ${markup.toFixed(2)} (自选) = </span>${(basePrice + markup).toFixed(2)}`;
        } else {
            pPricePc.innerText = finalUnitPriceStr; 
        }
    }
    window.currentCalculatedPrice = price; 
}

function validateQty(input) {
    let currentBuyMode = buyMode;
    // 如果在SKU面板操作
    if (input.id === 'buy-qty') {
        const radios = document.getElementsByName('buy_mode');
        for(let r of radios) if(r.checked) currentBuyMode = r.value;
    }

    if (currentBuyMode === 'select') {
        input.value = 1;
        document.getElementById('buy-qty-pc').value = 1;
        document.getElementById('buy-qty').value = 1;
        return;
    }
    
    let val = parseInt(input.value);
    if (isNaN(val) || val < 1) val = 1;
    if (selectedVariant && val > selectedVariant.stock) val = selectedVariant.stock;
    input.value = val;
    
    // 同步
    if (input.id === 'buy-qty-pc') document.getElementById('buy-qty').value = val;
    else if (input.id === 'buy-qty') document.getElementById('buy-qty-pc').value = val;
    
    updatePrice();
}

function changeQty(delta, inputId) {
    const input = document.getElementById(inputId);
    if (!input) return;
    if (buyMode === 'select') return; 

    let val = parseInt(input.value) + delta;
    input.value = val;
    validateQty(input);
}


// =============================================
// === 提交逻辑 (Action) ===
// =============================================

function handleBuyNow() { currentAction = 'buy'; if(skuSheet) skuSheet.show(); }
function handleAddToCart() { currentAction = 'cart'; if(skuSheet) skuSheet.show(); }
function openSkuSheet() { handleBuyNow(); }

// PC端提交订单
async function submitOrderPc() {
    if (!validateSubmit()) return;

    const contact = document.getElementById('contact-info-pc').value;
    const password = document.getElementById('query-password-pc').value;
    const paymentMethod = document.querySelector('input[name="payment-pc"]:checked').value;
    const quantity = parseInt(document.getElementById('buy-qty-pc').value);
    
    const btn = document.getElementById('btn-buy-pc');
    const oldText = btn.innerText;
    btn.disabled = true; btn.innerText = '正在创建...';
    
    try {
        const payload = { 
            variant_id: selectedVariant.id, quantity, contact, 
            query_password: password, payment_method: paymentMethod
        };
        if (buyMode === 'select' && selectedCardId) payload.card_id = selectedCardId;
        
        const res = await fetch('/api/shop/order/create', { 
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) 
        });
        const order = await res.json();
        if(order.error) throw new Error(order.error);
        window.location.href = `pay.html?order_id=${order.order_id}`;
    } catch (e) { alert(e.message); } 
    finally { btn.disabled = false; btn.innerText = oldText; }
}

// SKU面板提交订单
async function submitOrder() {
    if (!selectedVariant) return alert('请选择规格');
    
    const contact = document.getElementById('contact-info').value;
    if(!contact) return alert('请填写联系方式');
    
    const password = document.getElementById('query-password').value;
    if(!password) return alert('请设置查单密码');
    
    const paymentMethod = document.querySelector('input[name="payment"]:checked');
    if(!paymentMethod) return alert('请选择支付方式');
    
    const btn = skuSheetEl.querySelector('.btn-confirm');
    const oldText = btn.innerText;
    btn.disabled = true; btn.innerText = '正在创建...';
    
    try {
        const payload = { 
            variant_id: selectedVariant.id, 
            quantity: parseInt(document.getElementById('buy-qty').value), 
            contact, query_password: password, 
            payment_method: paymentMethod.value
        };
        if (buyMode === 'select' && selectedCardId) payload.card_id = selectedCardId;
        
        const res = await fetch('/api/shop/order/create', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
        const order = await res.json();
        if(order.error) throw new Error(order.error);
        
        skuSheet.hide();
        window.location.href = `pay.html?order_id=${order.order_id}`;
    } catch (e) { alert(e.message); } 
    finally { btn.disabled = false; btn.innerText = oldText; }
}

// 通用加入购物车 (PC)
function handlePcAddToCart() {
    if (!selectedVariant) {
        alert('请选择规格');
        try{ document.getElementById('variant-list-pc').style.border = '1px solid red'; setTimeout(()=>document.getElementById('variant-list-pc').style.border='', 2000); }catch(e){}
        return;
    }
    
    if (document.getElementById('buy-mode-container-pc').classList.contains('d-none') === false) {
        if (!buyMode) return alert('请选择购买方式');
        if (buyMode === 'select' && !selectedCardId) return alert('请选择号码');
    }
    
    addToCartLogic(
        parseInt(document.getElementById('buy-qty-pc').value) || 1, 
        document.querySelector('.btn-buy-split-left')
    );
}

// 通用加入购物车 (Mobile)
function submitAddToCart() {
    if (!selectedVariant) return alert('请选择规格');
    addToCartLogic(
        parseInt(document.getElementById('buy-qty').value) || 1,
        skuSheetEl.querySelector('.btn-confirm')
    );
    skuSheet.hide();
}

function addToCartLogic(qty, btnEl) {
    try {
        let cart = JSON.parse(localStorage.getItem('tbShopCart') || '[]');
        const noteToStore = (buyMode === 'select') ? (selectedCardNote || selectedCardId) : null;
        
        let finalPrice = selectedVariant.price;
        if (window.currentCalculatedPrice) finalPrice = window.currentCalculatedPrice;
        else if(buyMode === 'select') finalPrice += (selectedVariant.custom_markup || 0);
        
        const cartItem = {
            productId: currentProduct.id, productName: currentProduct.name,
            variantId: selectedVariant.id, variantName: selectedVariant.name,
            price: parseFloat(finalPrice), quantity: qty,
            img: selectedVariant.image_url || currentProduct.image_url || '',
            buyMode: buyMode,
            selectedCardId: (buyMode === 'select') ? selectedCardId : null,
            selectedCardNote: noteToStore
        };

        const idx = cart.findIndex(item => 
            item.variantId === cartItem.variantId && 
            item.buyMode === cartItem.buyMode
        );

        if (idx > -1) cart[idx].quantity += qty;
        else cart.push(cartItem);

        localStorage.setItem('tbShopCart', JSON.stringify(cart));
        if (typeof updateCartBadge === 'function') updateCartBadge(cart.length);
        
        if(btnEl) {
            const oldText = btnEl.innerText;
            btnEl.innerText = '已加入 ✔';
            setTimeout(() => btnEl.innerText = oldText, 1500);
        }
    } catch (e) { console.error(e); alert('添加失败'); }
}

function validateSubmit() {
    if (!selectedVariant) { alert('请选择规格'); return false; }
    if (!document.getElementById('buy-mode-container-pc').classList.contains('d-none')) {
        if (!buyMode) { alert('请选择购买方式'); return false; }
        if (buyMode === 'select' && !selectedCardId) { alert('请选择号码'); return false; }
    }
    const qty = parseInt(document.getElementById('buy-qty-pc').value);
    if (buyMode !== 'select' && selectedVariant.stock < qty) { alert('库存不足'); return false; }
    
    const contact = document.getElementById('contact-info-pc').value;
    if(!contact) { alert('请填写联系方式'); return false; }
    
    const pwd = document.getElementById('query-password-pc').value;
    if(!pwd) { alert('请设置查单密码'); return false; }
    
    const pm = document.querySelector('input[name="payment-pc"]:checked');
    if(!pm) { alert('请选择支付方式'); return false; }
    
    return true;
}


// =============================================
// === 辅助函数 (分页渲染) ===
// =============================================

function calculateSpecPages() { /* ... 原有逻辑保留 ... */
    commonSpecPagination('variant-list', specListMaxRows, (pages)=>specPages=pages, ()=>renderSpecListPage(1));
}
function calculatePCSpecPages() {
    commonSpecPagination('variant-list-pc', specListMaxRows, (pages)=>pcSpecPages=pages, ()=>renderPCSpecListPage(1));
}

function commonSpecPagination(listId, maxRows, setPages, renderFirst) {
    const vList = document.getElementById(listId);
    if (!currentProduct || !vList) return;
    
    vList.innerHTML = currentProduct.variants.map((v) => {
        const style = v.color ? `style="color:${v.color}"` : '';
        const isDisabled = v.stock <= 0;
        return `<div class="spec-btn ${isDisabled?'disabled':''}" ${style}>${v.name}</div>`;
    }).join('');
    
    const buttons = vList.querySelectorAll('.spec-btn');
    if (buttons.length === 0) return;
    
    const rowHeight = buttons[0].offsetHeight;
    const gap = parseFloat(window.getComputedStyle(vList).gap) || 10;
    const maxHeight = (maxRows * rowHeight) + ((maxRows - 1) * gap);
    const listTop = vList.offsetTop;
    
    let pages = [], currPage = [], startOffset = listTop;
    
    for (let i = 0; i < buttons.length; i++) {
        const btn = buttons[i];
        const variant = currentProduct.variants[i];
        if (btn.offsetTop >= (startOffset + maxHeight - (rowHeight / 2))) {
            if (currPage.length > 0) pages.push(currPage);
            currPage = [variant];
            startOffset = btn.offsetTop;
        } else {
            currPage.push(variant);
        }
    }
    if (currPage.length > 0) pages.push(currPage);
    setPages(pages);
    renderFirst();
}

function renderSpecListPage(page) { renderAnySpecList('variant-list', 'spec-pagination-container', specPages, page, (p)=>specCurrentPage=p); }
function renderPCSpecListPage(page) { renderAnySpecList('variant-list-pc', 'spec-pagination-container-pc', pcSpecPages, page, (p)=>pcSpecCurrentPage=p); }

function renderAnySpecList(listId, pageId, pages, page, setPageVar) {
    const vList = document.getElementById(listId);
    if (!pages || pages.length === 0) { vList.innerHTML = '<div class="text-muted">暂无规格</div>'; return; }
    
    let p = Math.max(1, Math.min(page, pages.length));
    setPageVar(p);
    
    vList.innerHTML = pages[p - 1].map(v => {
        const style = v.color ? `style="color:${v.color}"` : '';
        const active = selectedVariant && selectedVariant.id === v.id ? 'active' : '';
        const disabled = v.stock <= 0 ? 'disabled' : '';
        const click = disabled ? '' : `onclick="selectVariant(${v.id})"`;
        return `<div class="spec-btn ${active} ${disabled}" ${style} ${click}>${v.name}</div>`;
    }).join('');
    
    renderPaginationUI(pageId, pages.length, p, listId === 'variant-list-pc' ? changePCSpecPage : changeSpecPage);
}

function renderPaginationUI(containerId, total, current, clickFn) {
    const el = document.getElementById(containerId);
    if (total <= 1) { el.innerHTML = ''; return; }
    const fnName = clickFn.name;
    el.innerHTML = `
        <ul class="pagination pagination-sm justify-content-${containerId.includes('pc')?'start':'center'}">
            <li class="page-item ${current===1?'disabled':''}"><a class="page-link" onclick="${fnName}(1)">首页</a></li>
            <li class="page-item ${current===1?'disabled':''}"><a class="page-link" onclick="${fnName}(${current-1})">上一页</a></li>
            <li class="page-item disabled"><span class="page-link">${current}/${total}</span></li>
            <li class="page-item ${current===total?'disabled':''}"><a class="page-link" onclick="${fnName}(${current+1})">下一页</a></li>
            <li class="page-item ${current===total?'disabled':''}"><a class="page-link" onclick="${fnName}(${total})">尾页</a></li>
        </ul>`;
}

function changeSpecPage(p) { renderSpecListPage(p); }
function changePCSpecPage(p) { renderPCSpecListPage(p); }

// 辅助函数
function renderExtraInfo(v) {
    const el = document.getElementById('p-extra-info');
    if(!el) return;
    const hasMarkup = v ? v.custom_markup > 0 : currentProduct.variants.some(i=>i.custom_markup>0);
    const ws = getWholesaleDesc(v) || (v ? '' : (currentProduct.variants.some(i=>i.wholesale_config) ? '批发价：请选择规格' : ''));
    
    let html = '';
    if(hasMarkup) html += `<span class="extra-tag-solid">自选加价</span> `;
    if(ws) html += `<span>${ws}</span>`;
    
    el.innerHTML = html;
    el.classList.toggle('d-none', !html);
}

function updatePcSelectionText() {
    const el = document.getElementById('pc-selected-card-note');
    if(!el) return;
    if(!selectedVariant) { el.innerText = ''; return; }
    
    let text = `已选: ${selectedVariant.name}`;
    if(buyMode === 'select' && selectedCardId && selectedCardNote) text += ` + ${selectedCardNote}`;
    el.innerText = text;
}
