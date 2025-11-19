// =============================================
// === themes/TBshop/files/product-page.js
// === (商品详情页专属JS - 自动渲染结构版)
// =============================================

let currentProduct = null;
let selectedVariant = null;
let selectedCardId = null;
let selectedCardNote = null; 
let buyMode = null; 
let currentAction = 'buy'; 

// 页面加载入口
async function init() {
    if (typeof loadCartBadge === 'function') loadCartBadge();
    
    const urlParams = new URLSearchParams(window.location.search);
    const id = urlParams.get('id');
    if(!id) return alert('未指定商品ID');

    // 1. 加载配置
    try {
        const configRes = await fetch('/api/shop/config');
        const siteConfig = await configRes.json();
        if (typeof renderGlobalHeaders === 'function') renderGlobalHeaders(siteConfig);
        if (typeof renderSidebarNoticeContact === 'function') renderSidebarNoticeContact(siteConfig);
    } catch (e) { console.error('Config load failed', e); }

    // 2. 加载商品数据
    try {
        // 显式显示加载状态
        const loadingEl = document.getElementById('product-loading');
        if(loadingEl) loadingEl.style.display = 'block';

        const res = await fetch(`/api/shop/product?id=${id}`);
        const data = await res.json();
        
        if(data.error) {
            if(loadingEl) loadingEl.innerHTML = `<div class="text-danger py-5">${data.error}</div>`;
            return;
        }
        
        currentProduct = data;
        
        // 【核心修复】先构建 HTML 结构，再绑定数据
        buildPageStructure(data); 
        
        // 渲染页面逻辑
        renderPage(); 
        
        // 隐藏加载动画
        if(loadingEl) loadingEl.style.display = 'none';
        document.getElementById('product-content').style.display = 'block';

        // 加载侧栏
        loadSidebarData();

    } catch (e) { 
        console.error(e); 
        const loadingEl = document.getElementById('product-loading');
        if(loadingEl) loadingEl.innerHTML = '<div class="text-center py-5 text-danger">商品加载失败，请检查网络</div>';
    }

    // 3. 加载文章
    try {
        const artRes = await fetch('/api/shop/articles/list');
        const articles = await artRes.json();
        if (typeof renderSidebarArticleCats === 'function') renderSidebarArticleCats(articles);
    } catch(e) {}
    
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
// === 【新增】构建页面 HTML 结构 ===
// =============================================
function buildPageStructure(p) {
    const container = document.getElementById('product-content');
    if(!container) return;

    // 1. 构建主商品区域 HTML
    const mainHtml = `
        <div class="module-box product-showcase">
            <div class="row g-0">
                <div class="col-md-5">
                    <div class="p-3">
                        <div class="main-img-wrap border rounded mb-2" style="position:relative; padding-bottom:100%; overflow:hidden;">
                            <img id="p-img-pc" src="" class="position-absolute w-100 h-100" style="object-fit:contain; top:0; left:0;">
                        </div>
                    </div>
                </div>

                <div class="col-md-7">
                    <div class="p-3">
                        <h4 id="p-title-pc" class="fw-bold mb-2" style="line-height:1.4;"></h4>
                        <div id="p-extra-info-pc" class="mb-2 text-warning small fw-bold"></div>
                        
                        <div class="price-bar bg-light p-3 rounded mb-3 mt-3">
                            <div class="d-flex align-items-end text-danger">
                                <span class="small me-1">¥</span>
                                <span id="p-price-pc" class="fs-2 fw-bold"></span>
                            </div>
                            <div id="random-mode-desc-pc" class="text-danger small mt-1" style="font-size: 0.8rem;"></div>
                            <div class="text-muted small mt-2 d-flex justify-content-between">
                                <span id="p-stock-pc"></span>
                                <span class="mx-2">|</span>
                                <span id="p-sales-pc"></span>
                            </div>
                        </div>

                        <div class="sku-section mb-3">
                            <div id="sku-spec-title-container-pc" class="mb-2 text-secondary small">规格</div>
                            <div id="variant-list-pc" class="d-flex flex-wrap gap-2"></div>
                            <div id="spec-pagination-container-pc" class="mt-2"></div>
                        </div>

                        <div id="buy-mode-container-pc" class="mb-3 d-none">
                            <div class="d-flex align-items-center mb-2">
                                <span class="text-secondary small me-3">购买方式：</span>
                                <div class="btn-group" role="group">
                                    <button type="button" class="btn btn-outline-danger btn-sm" id="mode_random_pc" onclick="handlePcBuyModeClick('random')">随机发货</button>
                                    <button type="button" class="btn btn-outline-danger btn-sm" id="mode_select_pc" onclick="handlePcBuyModeClick('select')">自选号码 (+<span id="markup-amount-pc">0</span>元)</button>
                                </div>
                            </div>
                            <div id="pc-card-selector-panel" class="card-selector-panel">
                                <div class="panel-header">
                                    <span class="fw-bold small">请选择号码</span>
                                    <span class="close-btn" onclick="togglePcCardPanel(false)">&times;</span>
                                </div>
                                <div id="card-list-pc" class="card-select-list-pc"></div>
                                <div class="panel-footer">
                                    <button class="btn btn-danger btn-sm w-100" onclick="confirmPcCardSelection()">确定</button>
                                </div>
                            </div>
                        </div>

                        <div class="mb-3 p-2 bg-light rounded text-dark small" id="pc-selected-card-note"></div>

                        <div class="d-flex align-items-center mt-4">
                            <div id="quantity-container-pc" class="d-flex align-items-center me-4">
                                <span class="text-secondary small me-2">数量：</span>
                                <div class="input-group input-group-sm stepper-pc" style="width: 100px;">
                                    <button class="btn btn-outline-secondary" type="button" onclick="changeQty(-1, 'buy-qty-pc')">-</button>
                                    <input type="text" class="form-control text-center" id="buy-qty-pc" value="1" onchange="validateQty(this)">
                                    <button class="btn btn-outline-secondary" type="button" onclick="changeQty(1, 'buy-qty-pc')">+</button>
                                </div>
                            </div>
                        </div>
                        
                        <div class="mt-3 p-3 bg-white border rounded">
                             <div class="mb-2">
                                <input type="text" class="form-control form-control-sm" id="contact-info-pc" placeholder="联系方式 (QQ/邮箱/手机号)">
                            </div>
                            <div class="mb-3">
                                <input type="password" class="form-control form-control-sm" id="query-password-pc" placeholder="设置查单密码 (6位以上)">
                            </div>
                            <div class="mb-3" id="payment-method-container-pc">
                                <div class="d-flex gap-3">
                                    <label class="pc-payment-label active">
                                        <input type="radio" name="payment-pc" value="alipay_f2f" checked> 
                                        <i class="fab fa-alipay text-primary"></i> 支付宝
                                    </label>
                                    <label class="pc-payment-label">
                                        <input type="radio" name="payment-pc" value="wechat"> 
                                        <i class="fab fa-weixin text-success"></i> 微信
                                    </label>
                                </div>
                            </div>
                            
                            <div class="d-flex gap-2">
                                <button class="btn-buy-split-left flex-grow-1" onclick="handlePcAddToCart()">加入购物车</button>
                                <button class="btn-buy-split-right flex-grow-1" id="btn-buy-pc" onclick="submitOrderPc()">立即购买</button>
                            </div>
                        </div>

                    </div>
                </div>
            </div>
        </div>

        <div class="module-box mt-3">
            <div class="border-bottom pb-2 mb-3">
                <span class="fw-bold border-bottom border-3 border-danger pb-2 px-1">商品详情</span>
            </div>
            <div id="p-desc-pc" class="product-desc p-2" style="overflow-x:auto;"></div>
        </div>

        <div class="d-lg-none" style="height: 60px;"></div>
        
        <div class="mobile-product-bar d-lg-none">
             <div class="mpb-left">
                 <a href="/" class="mpb-icon"><i class="fa fa-home"></i><span>首页</span></a>
                 <a href="#" class="mpb-icon" onclick="togglePanel('mobile-contact-sheet', 'mobile-contact-overlay')"><i class="fa fa-headset"></i><span>客服</span></a>
                 <a href="/cart.html" class="mpb-icon" style="position:relative;">
                    <i class="fa fa-shopping-cart"></i><span>购物车</span>
                    <span id="cart-badge-pc-product" class="badge bg-danger rounded-pill" style="position: absolute; top: -5px; right: 5px; font-size: 8px; display:none;">0</span>
                 </a>
             </div>
             <div class="mpb-right">
                 <button class="btn btn-warning mpb-btn-cart" onclick="handleAddToCart()">加入购物车</button>
                 <button class="btn btn-danger mpb-btn-buy" onclick="handleBuyNow()">立即购买</button>
             </div>
        </div>
    `;
    container.innerHTML = mainHtml;

    // 2. 构建 SKU 弹窗 (Offcanvas) HTML
    // 检查是否已存在，不存在则追加到 body
    if (!document.getElementById('skuSheet')) {
        const skuSheetHtml = `
        <div class="offcanvas offcanvas-bottom" tabindex="-1" id="skuSheet" style="height: 75vh; border-top-left-radius: 15px; border-top-right-radius: 15px;">
            <div class="offcanvas-header border-bottom pb-2">
                <div class="d-flex w-100">
                    <div class="me-3" style="width: 90px; height: 90px; margin-top: -40px; border: 1px solid #fff; border-radius: 5px; background: #fff; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
                        <img id="sku-img" src="" style="width: 100%; height: 100%; object-fit: contain;">
                    </div>
                    <div class="flex-grow-1 pt-1">
                        <div class="text-danger fw-bold fs-5">¥<span id="sku-price-text"></span></div>
                        <div class="text-muted small">库存: <span id="sku-stock-text">--</span></div>
                        <div class="text-dark small text-truncate" style="max-width: 200px;">已选: <span id="sku-selected-text"></span></div>
                    </div>
                    <button type="button" class="btn-close text-reset" data-bs-dismiss="offcanvas"></button>
                </div>
            </div>
            <div class="offcanvas-body pb-5">
                <div class="mb-3">
                    <div id="sku-spec-title-container" class="mb-2 fw-bold small">规格</div>
                    <div id="variant-list" class="sku-list d-flex flex-wrap"></div>
                    <div id="spec-pagination-container" class="mt-2"></div>
                </div>

                <div id="buy-mode-container" class="mb-3 d-none">
                    <div class="mb-2 fw-bold small">购买方式</div>
                    <div class="d-flex gap-3 mb-2">
                        <div class="form-check">
                            <input class="form-check-input" type="radio" name="buy_mode" id="mode_random" value="random" onclick="toggleBuyMode()">
                            <label class="form-check-label" for="mode_random">随机发货 <small class="text-danger" id="random-mode-desc"></small></label>
                        </div>
                        <div class="form-check">
                            <input class="form-check-input" type="radio" name="buy_mode" id="mode_select" value="select" onclick="handleMobileBuyModeClick(event, 'select')">
                            <label class="form-check-label" for="mode_select"><span id="selection-label-text">自选号码</span> <small class="text-danger">+<span id="markup-amount"></span>元</small></label>
                        </div>
                    </div>
                    <div id="card-selector" class="card-selector-box d-none mt-2">
                        <div class="small text-muted mb-2">请选择号码：</div>
                        <div id="card-list" class="card-select-list"></div>
                    </div>
                </div>

                <div class="d-flex justify-content-between align-items-center mb-4 border-top pt-3">
                    <span class="fw-bold small">购买数量</span>
                    <div class="input-group input-group-sm" style="width: 110px;">
                        <button class="btn btn-outline-secondary" type="button" onclick="changeQty(-1, 'buy-qty')">-</button>
                        <input type="text" class="form-control text-center" id="buy-qty" value="1" onchange="validateQty(this)">
                        <button class="btn btn-outline-secondary" type="button" onclick="changeQty(1, 'buy-qty')">+</button>
                    </div>
                </div>

                <div class="mb-3" id="contact-info-container">
                    <label class="form-label small">联系方式</label>
                    <input type="text" class="form-control" id="contact-info" placeholder="QQ/邮箱/手机号 (自动发货凭证)">
                </div>
                <div class="mb-3" id="query-password-container">
                    <label class="form-label small">查单密码</label>
                    <input type="text" class="form-control" id="query-password" placeholder="设置查单密码 (6位以上)">
                </div>
                 <div class="mb-3" id="payment-method-container">
                    <label class="form-label small">支付方式</label>
                    <div class="d-flex gap-3">
                        <label class="d-flex align-items-center border rounded px-3 py-2 w-50">
                            <input type="radio" name="payment" value="alipay_f2f" checked class="me-2"> 支付宝
                        </label>
                        <label class="d-flex align-items-center border rounded px-3 py-2 w-50">
                            <input type="radio" name="payment" value="wechat" class="me-2"> 微信
                        </label>
                    </div>
                </div>
                <div style="height: 60px;"></div>
            </div>
            <div class="offcanvas-footer border-top p-2 bg-white fixed-bottom">
                 <button class="btn btn-danger w-100 rounded-pill py-2 fs-6 btn-confirm" onclick="submitOrder()">立即购买</button>
            </div>
        </div>`;
        document.body.insertAdjacentHTML('beforeend', skuSheetHtml);
    }

    // 初始化 SKU Sheet 实例
    const el = document.getElementById('skuSheet');
    if(el && typeof bootstrap !== 'undefined') {
        skuSheet = new bootstrap.Offcanvas(el);
        el.addEventListener('show.bs.offcanvas', onSkuSheetShow);
    }
    
    // 绑定 PC 端支付方式切换样式
    document.querySelectorAll('input[name="payment-pc"]').forEach(input => {
        input.addEventListener('change', function() {
            document.querySelectorAll('.pc-payment-label').forEach(l => l.classList.remove('active'));
            this.closest('label').classList.add('active');
        });
    });
}


// =============================================
// === 页面渲染与更新逻辑 ===
// =============================================

function renderPage() {
    const p = currentProduct;
    
    // 计算价格范围
    const prices = p.variants.map(v => v.price);
    const minPrice = Math.min(...prices);
    const maxPrice = Math.max(...prices);
    const priceDisplay = (minPrice === maxPrice) ? minPrice : `${minPrice} - ${maxPrice}`;
    
    // 填充 Mobile 元素
    document.title = p.name;
    document.getElementById('p-title-pc').innerText = p.name;
    document.getElementById('p-desc-pc').innerText = p.description || '暂无详细介绍';
    
    // 填充 SKU 弹窗初始信息
    document.getElementById('sku-price-text').innerText = priceDisplay;
    const totalSales = p.variants.reduce((s,v) => s + (v.sales_count||0), 0);
    const totalStock = p.variants.reduce((s,v) => s + (v.stock||0), 0);
    document.getElementById('sku-stock-text').innerText = totalStock;

    // 初始化图片
    const defV = p.variants[0];
    const mainImg = p.image_url || (defV && defV.image_url ? defV.image_url : '/themes/TBshop/assets/no-image.png');
    document.getElementById('p-img-pc').src = mainImg;
    document.getElementById('sku-img').src = mainImg;
    
    // 重置状态
    buyMode = null;
    selectedVariant = null;
    selectedCardId = null;
    
    // 重置 SKU 面板列表
    hasCalculatedPages = false;
    specPages = [];
    document.getElementById('variant-list').innerHTML = '';
    document.getElementById('sku-spec-title-container').innerText = `规格（共${p.variants.length}个）`;

    // 重置 PC 面板
    pcHasCalculatedPages = false;
    pcSpecPages = [];
    document.getElementById('buy-mode-container-pc').classList.add('d-none');
    document.getElementById('quantity-container-pc').classList.add('d-none'); // 初始隐藏数量，选规格后显示
    document.getElementById('buy-qty-pc').value = 1;
    selectPcBuyMode(null);
    
    updatePcElements(p, null, priceDisplay);
    
    // 立即渲染 PC 规格
    const pcTitle = document.getElementById('sku-spec-title-container-pc');
    if(pcTitle) pcTitle.innerText = `规格（共${p.variants.length}个）`;
    calculatePCSpecPages();
    pcHasCalculatedPages = true;
}

function updatePcElements(product, variant, priceStr) {
    const p = product || currentProduct;
    const v = variant || null;
    if (!p) return;
    
    // 更新 PC 价格等
    const pPricePc = document.getElementById('p-price-pc');
    if (pPricePc && !selectedVariant) pPricePc.innerText = priceStr;

    const pStockPc = document.getElementById('p-stock-pc');
    const pSalesPc = document.getElementById('p-sales-pc');
    if (pStockPc) pStockPc.innerText = `库存: ${v ? v.stock : p.variants.reduce((s,i)=>s+(i.stock||0),0)}`;
    if (pSalesPc) pSalesPc.innerText = `已售: ${v ? v.sales_count : p.variants.reduce((s,i)=>s+(i.sales_count||0),0)}`;
    
    // 额外信息标签
    const pExtraInfoPc = document.getElementById('p-extra-info-pc');
    if(pExtraInfoPc) {
        let html = '';
        const showMarkup = v ? (v.custom_markup > 0) : p.variants.some(i => i.custom_markup > 0);
        if (showMarkup) html += `<span class="badge bg-warning text-dark me-2">支持自选</span> `;
        
        let wsText = '';
        if (v && v.wholesale_config) {
            try {
                let ws = v.wholesale_config;
                if (typeof ws === 'string') ws = JSON.parse(ws);
                if (Array.isArray(ws) && ws.length > 0) {
                    ws.sort((a, b) => a.qty - b.qty);
                    wsText = `批发：${ws.map(w => `${w.qty}个起${w.price}元`).join(' | ')}`;
                }
            } catch(e){}
        }
        if (wsText) html += `<span>${wsText}</span>`;
        
        pExtraInfoPc.innerHTML = html;
    }
}


// =============================================
// === 规格选择逻辑 ===
// =============================================

function selectVariant(vid) {
    selectedVariant = currentProduct.variants.find(v => v.id == vid);
    
    // 更新高亮
    renderSpecListPage(specCurrentPage);
    if (pcHasCalculatedPages) renderPCSpecListPage(pcSpecCurrentPage);
    
    // 更新 SKU 面板信息
    document.getElementById('sku-stock-text').innerText = selectedVariant.stock;
    document.getElementById('sku-selected-text').innerText = selectedVariant.name;
    
    const labelText = selectedVariant.selection_label || '自选号码';
    const labelEl = document.getElementById('selection-label-text');
    if(labelEl) labelEl.innerText = labelText;
    const pcLabelEl = document.getElementById('selection-label-text-pc'); // PC 自选按钮文本 (未在HTML中定义，需检查)
    // 如果需要修改PC按钮文本，需获取按钮内部文本节点
    const pcSelectBtn = document.getElementById('mode_select_pc');
    if(pcSelectBtn) pcSelectBtn.childNodes[0].textContent = labelText + " "; 

    const targetImg = selectedVariant.image_url || currentProduct.image_url || '/themes/TBshop/assets/no-image.png';
    document.getElementById('sku-img').src = targetImg;
    document.getElementById('p-img-pc').src = targetImg;
    
    // 更新批发提示
    const wsDesc = getWholesaleDesc(selectedVariant);
    const rdMobile = document.getElementById('random-mode-desc');
    const rdPc = document.getElementById('random-mode-desc-pc');
    if(rdMobile) rdMobile.innerText = wsDesc || '';
    if(rdPc) rdPc.innerText = wsDesc || '';

    // 【关键修复】显示购买方式
    const showBuyMode = (selectedVariant.auto_delivery === 1);
    
    // Mobile
    const modeContainer = document.getElementById('buy-mode-container');
    if (modeContainer) {
        if (showBuyMode) {
            modeContainer.classList.remove('d-none');
            const markupEl = document.getElementById('markup-amount');
            if(markupEl) markupEl.innerText = selectedVariant.custom_markup || '0';
        } else {
            modeContainer.classList.add('d-none');
        }
    }

    // PC
    const modeContainerPc = document.getElementById('buy-mode-container-pc');
    const qtyContainerPc = document.getElementById('quantity-container-pc');
    
    if (showBuyMode) {
        if(modeContainerPc) modeContainerPc.classList.remove('d-none');
        if(qtyContainerPc) qtyContainerPc.classList.remove('d-none');
        const pcMarkupEl = document.getElementById('markup-amount-pc');
        if(pcMarkupEl) pcMarkupEl.innerText = selectedVariant.custom_markup || '0';
        
        // 重置 PC
        selectPcBuyMode(null);
        document.getElementById('buy-qty-pc').value = 1;
        selectedCardId = null;
    } else {
        if(modeContainerPc) modeContainerPc.classList.add('d-none');
        if(qtyContainerPc) qtyContainerPc.classList.remove('d-none'); // 即使不支持自选，也要显示数量
        
        selectPcBuyMode(null);
        document.getElementById('buy-qty-pc').value = 1;
    }
    
    // 重置全局
    buyMode = null; selectedCardId = null; selectedCardNote = null;
    document.getElementsByName('buy_mode').forEach(r => r.checked = false);
    const cardSel = document.getElementById('card-selector');
    if(cardSel) cardSel.classList.add('d-none');
    
    updatePrice();
    updatePcElements(currentProduct, selectedVariant, selectedVariant.price);
    updatePcSelectionText();
}

function getWholesaleDesc(v) {
    if (v && v.wholesale_config) {
        try {
            let ws = typeof v.wholesale_config === 'string' ? JSON.parse(v.wholesale_config) : v.wholesale_config;
            if (Array.isArray(ws) && ws.length > 0) {
                ws.sort((a, b) => a.qty - b.qty);
                return `(批发：${ws.map(w => `${w.qty}起${w.price}元`).join('，')})`;
            }
        } catch(e) {}
    }
    return null;
}

// =============================================
// === 购买方式 & 卡密 ===
// =============================================

function toggleBuyMode() {
    const radios = document.getElementsByName('buy_mode');
    let currentSkuBuyMode = null;
    for(let r of radios) if(r.checked) currentSkuBuyMode = r.value;
    
    buyMode = currentSkuBuyMode;
    const cardSelector = document.getElementById('card-selector');
    if(!cardSelector) return;

    if (currentSkuBuyMode === 'select') {
        cardSelector.classList.remove('d-none');
        document.getElementById('buy-qty').value = 1;
        loadCardNotes('card-list'); 
        selectPcBuyMode('select'); 
    } else {
        cardSelector.classList.add('d-none');
        if (currentSkuBuyMode === 'random') {
            selectedCardId = null;
            selectPcBuyMode('random');
        }
    }
    updatePrice();
}

function selectPcBuyMode(mode) {
    buyMode = mode;
    const randomBtn = document.getElementById('mode_random_pc');
    const selectBtn = document.getElementById('mode_select_pc');
    const qtyInput = document.getElementById('buy-qty-pc');
    const stepper = document.querySelector('#quantity-container-pc .stepper-pc'); // 这里的 stepper-pc 类需确认HTML中有

    if(randomBtn) randomBtn.classList.remove('active');
    if(selectBtn) selectBtn.classList.remove('active');

    if (mode === 'random') {
        if(randomBtn) randomBtn.classList.add('active');
        selectedCardId = null; selectedCardNote = null;
        if(qtyInput) { qtyInput.disabled = false; }
        validateQty(qtyInput); 
    } else if (mode === 'select') {
        if(selectBtn) selectBtn.classList.add('active');
        if(qtyInput) { qtyInput.value = 1; qtyInput.disabled = true; }
    } else {
        selectedCardId = null; selectedCardNote = null;
        if(qtyInput) { qtyInput.disabled = false; }
    }
    updatePcSelectionText();
    updatePrice();
}

function handlePcBuyModeClick(mode) {
    if (buyMode === mode) {
        selectPcBuyMode(null);
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

function handleMobileBuyModeClick(event, mode) {
    const radio = document.getElementById(mode === 'select' ? 'mode_select' : 'mode_random');
    if (radio && radio.checked) {
        event.preventDefault();
        radio.checked = false;
        buyMode = null;
        toggleBuyMode();
    }
}

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

        if (selectedCardId) {
            const options = listEl.querySelectorAll('.card-option');
            for (let opt of options) {
                if (opt.getAttribute('onclick').includes(`${selectedCardId}`)) {
                    opt.classList.add('active');
                    break;
                }
            }
        }
    } catch(e) { listEl.innerHTML = '<div class="text-danger">加载失败</div>'; }
}

function selectCard(el, id) {
    const parentList = el.closest('.card-select-list-pc, .card-select-list, .sku-list'); 
    // 注意：这里父级可能是 card-select-list (mobile) 或 card-select-list-pc
    if (parentList) {
        parentList.querySelectorAll('.card-option').forEach(opt => opt.classList.remove('active'));
    }
    el.classList.add('active');
    selectedCardId = id;
    selectedCardNote = el.innerText;
}

function togglePcCardPanel(show) {
    const panel = document.getElementById('pc-card-selector-panel');
    if(!panel) return;
    
    // 简单处理：只控制显隐，不动态计算高度，避免复杂
    if (show) {
        panel.classList.add('show');
    } else {
        panel.classList.remove('show');
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
// === 价格与数量 ===
// =============================================

function updatePrice() {
    if (!selectedVariant) return;
    
    let price = selectedVariant.price;
    const qtyInput = document.getElementById('buy-qty-pc');
    const qty = qtyInput ? parseInt(qtyInput.value) : 1;
    
    const basePrice = selectedVariant.price; 
    let markup = 0; 

    if (buyMode === 'select') {
        markup = selectedVariant.custom_markup || 0;
        price += markup; 
    } else if (buyMode === 'random' || !buyMode) { // 默认或随机应用批发价
        if (selectedVariant.wholesale_config) {
            try {
                let ws = typeof selectedVariant.wholesale_config === 'string' ? JSON.parse(selectedVariant.wholesale_config) : selectedVariant.wholesale_config;
                if (Array.isArray(ws)) {
                    ws.sort((a,b) => b.qty - a.qty);
                    for(let rule of ws) { if(qty >= rule.qty) { price = rule.price; break; } }
                }
            } catch(e) {}
        }
    }
    
    const finalStr = price.toFixed(2);
    const skuPriceEl = document.getElementById('sku-price-text');
    if(skuPriceEl) skuPriceEl.innerText = finalStr;

    const pPricePc = document.getElementById('p-price-pc');
    if (pPricePc) {
        if (buyMode === 'select' && markup > 0) {
            pPricePc.innerHTML = `<span class="fs-5 fw-normal text-secondary">${basePrice.toFixed(2)} + ${markup.toFixed(2)} = </span>${(basePrice + markup).toFixed(2)}`;
        } else {
            pPricePc.innerText = finalStr; 
        }
    }
    window.currentCalculatedPrice = price; 
}

function validateQty(input) {
    if(!input) return;
    let currentBuyMode = buyMode;
    if (input.id === 'buy-qty') { // Mobile sync logic
         // ... (简化)
    }

    if (currentBuyMode === 'select') {
        input.value = 1;
        syncQty(1);
        return;
    }
    
    let val = parseInt(input.value);
    if (isNaN(val) || val < 1) val = 1;
    if (selectedVariant && val > selectedVariant.stock) val = selectedVariant.stock;
    input.value = val;
    
    syncQty(val);
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

function syncQty(val) {
    const pc = document.getElementById('buy-qty-pc');
    const mo = document.getElementById('buy-qty');
    if(pc) pc.value = val;
    if(mo) mo.value = val;
}


// =============================================
// === 分页辅助 ===
// =============================================
function calculateSpecPages() { commonSpecPagination('variant-list', specListMaxRows, (pages)=>specPages=pages, ()=>renderSpecListPage(1)); }
function calculatePCSpecPages() { commonSpecPagination('variant-list-pc', specListMaxRows, (pages)=>pcSpecPages=pages, ()=>renderPCSpecListPage(1)); }

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
    
    // 简单分页逻辑 (不依赖 offsetTop 计算，避免隐藏时计算为0)
    // 直接按数量分页，每页约 20 个
    const pageSize = 20; 
    let pages = [];
    for (let i = 0; i < currentProduct.variants.length; i += pageSize) {
        pages.push(currentProduct.variants.slice(i, i + pageSize));
    }
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
    // 简化分页UI
    const fnName = clickFn.name;
    el.innerHTML = `
        <div class="btn-group btn-group-sm mt-2">
            <button class="btn btn-outline-secondary" ${current===1?'disabled':''} onclick="${fnName}(${current-1})">上一页</button>
            <button class="btn btn-outline-secondary disabled">${current}/${total}</button>
            <button class="btn btn-outline-secondary" ${current===total?'disabled':''} onclick="${fnName}(${current+1})">下一页</button>
        </div>`;
}

function changeSpecPage(p) { renderSpecListPage(p); }
function changePCSpecPage(p) { renderPCSpecListPage(p); }
function onSkuSheetShow() { 
    if (!hasCalculatedPages && currentProduct) { calculateSpecPages(); hasCalculatedPages = true; }
    // ...
}

function updatePcSelectionText() {
    const el = document.getElementById('pc-selected-card-note');
    if(!el) return;
    if(!selectedVariant) { el.innerText = ''; return; }
    let text = `已选: ${selectedVariant.name}`;
    if(buyMode === 'select' && selectedCardId && selectedCardNote) text += ` + ${selectedCardNote}`;
    el.innerText = text;
}

// =============================================
// === 提交 (PC/Mobile) ===
// =============================================
function handleBuyNow() { currentAction = 'buy'; if(skuSheet) skuSheet.show(); }
function handleAddToCart() { currentAction = 'cart'; if(skuSheet) skuSheet.show(); }

// PC 提交
async function submitOrderPc() {
    if (!selectedVariant) return alert('请选择规格');
    const modeContainerPc = document.getElementById('buy-mode-container-pc');
    if (modeContainerPc && !modeContainerPc.classList.contains('d-none')) {
        if (!buyMode) return alert('请选择购买方式');
        if (buyMode === 'select' && !selectedCardId) return alert('请选择号码');
    }

    const contact = document.getElementById('contact-info-pc').value;
    const pwd = document.getElementById('query-password-pc').value;
    if(!contact) return alert('请填写联系方式');
    if(!pwd) return alert('请设置查单密码');
    
    const btn = document.getElementById('btn-buy-pc');
    btn.disabled = true; btn.innerText = '提交中...';
    
    try {
        const payload = { 
            variant_id: selectedVariant.id, 
            quantity: parseInt(document.getElementById('buy-qty-pc').value), 
            contact, query_password: pwd, 
            payment_method: document.querySelector('input[name="payment-pc"]:checked').value 
        };
        if (buyMode === 'select' && selectedCardId) payload.card_id = selectedCardId;
        
        const res = await fetch('/api/shop/order/create', { 
            method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(payload) 
        });
        const data = await res.json();
        if(data.error) throw new Error(data.error);
        window.location.href = `pay.html?order_id=${data.order_id}`;
    } catch(e) { alert(e.message); btn.disabled = false; btn.innerText = '立即购买'; }
}

// Mobile 提交
async function submitOrder() {
    const contact = document.getElementById('contact-info').value;
    const pwd = document.getElementById('query-password').value;
    if(!contact) return alert('请填写联系方式');
    if(!pwd) return alert('请设置查单密码');

    const btn = document.querySelector('.btn-confirm');
    btn.disabled = true; btn.innerText = '提交中...';
    
    try {
        const payload = {
             variant_id: selectedVariant.id,
             quantity: parseInt(document.getElementById('buy-qty').value),
             contact, query_password: pwd,
             payment_method: document.querySelector('input[name="payment"]:checked').value
        };
        if (buyMode === 'select' && selectedCardId) payload.card_id = selectedCardId;
        
        const res = await fetch('/api/shop/order/create', { 
            method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(payload) 
        });
        const data = await res.json();
        if(data.error) throw new Error(data.error);
        window.location.href = `pay.html?order_id=${data.order_id}`;
    } catch(e) { alert(e.message); btn.disabled = false; btn.innerText = '立即购买'; }
}

function handlePcAddToCart() {
    if (!selectedVariant) return alert('请选择规格');
    const qty = parseInt(document.getElementById('buy-qty-pc').value) || 1;
    addToCartLogic(qty, document.querySelector('.btn-buy-split-left'));
}

function submitAddToCart() {
    const qty = parseInt(document.getElementById('buy-qty').value) || 1;
    addToCartLogic(qty, skuSheetEl.querySelector('.btn-confirm'));
    skuSheet.hide();
}

function addToCartLogic(qty, btn) {
    try {
        let cart = JSON.parse(localStorage.getItem('tbShopCart') || '[]');
        const item = {
            productId: currentProduct.id, productName: currentProduct.name,
            variantId: selectedVariant.id, variantName: selectedVariant.name,
            price: window.currentCalculatedPrice || selectedVariant.price,
            quantity: qty, img: selectedVariant.image_url || currentProduct.image_url || '',
            buyMode: buyMode, selectedCardId: selectedCardId, selectedCardNote: selectedCardNote,
            auto_delivery: selectedVariant.auto_delivery // 存入，方便结算时判断
        };
        
        const idx = cart.findIndex(i => i.variantId === item.variantId && i.buyMode === item.buyMode && i.selectedCardId === item.selectedCardId);
        if (idx > -1) cart[idx].quantity += qty;
        else cart.push(item);
        
        localStorage.setItem('tbShopCart', JSON.stringify(cart));
        if(typeof updateCartBadge === 'function') updateCartBadge(cart.length);
        
        if(btn) {
            const old = btn.innerText; btn.innerText = '已加入';
            setTimeout(()=>btn.innerText=old, 1000);
        }
    } catch(e) { alert('添加失败'); }
}
document.addEventListener('DOMContentLoaded', init);
