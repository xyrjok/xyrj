// =============================================
// === themes/TBshop/files/product-page.js
// === (商品详情页专属JS)
// =============================================

let currentProduct = null;
let selectedVariant = null;
let selectedCardId = null;
let buyMode = null;

const skuSheetEl = document.getElementById('skuSheet');
const skuSheet = new bootstrap.Offcanvas(skuSheetEl);

let specPages = []; 
let specCurrentPage = 1;
const specListMaxRows = 6;
let hasCalculatedPages = false;

skuSheetEl.addEventListener('show.bs.offcanvas', () => {
    if (!hasCalculatedPages && currentProduct) {
        calculateSpecPages();
        hasCalculatedPages = true;
    }
});

/**
 * 页面加载总入口
 */
async function init() {
    const urlParams = new URLSearchParams(window.location.search);
    const id = urlParams.get('id');
    if(!id) return alert('未指定商品');

    // 1. 加载配置 (用于公告/联系方式/Logo)
    try {
        const configRes = await fetch('/api/shop/config');
        const siteConfig = await configRes.json();
        // 调用 common.js 中的函数
        if (typeof renderGlobalHeaders === 'function') {
            renderGlobalHeaders(siteConfig);
        }
        if (typeof renderSidebarNoticeContact === 'function') {
            renderSidebarNoticeContact(siteConfig);
        }
    } catch (e) { console.error('Failed to load config', e); }

    // 2. 加载所有商品 (用于查找当前商品 和 渲染侧边栏)
    let allProducts = [];
    try {
        const res = await fetch('/api/shop/products');
        allProducts = await res.json();
        currentProduct = allProducts.find(p => p.id == id);
        if (!currentProduct) return alert('商品不存在或已下架');
        
        // 渲染页面
        renderPage();

        // 调用 common.js 中的函数
        if (typeof renderSidebarTopSales === 'function') {
            renderSidebarTopSales(allProducts);
        }
        if (typeof renderSidebarTagCloud === 'function') {
            renderSidebarTagCloud(allProducts);
        }

    } catch (e) { console.error(e); alert('加载失败'); }

    // 3. 加载文章 (用于侧边栏)
    try {
        const artRes = await fetch('/api/shop/articles/list');
        const articles = await artRes.json();
        // 调用 common.js 中的函数
        if (typeof renderSidebarArticleCats === 'function') {
            renderSidebarArticleCats(articles);
        }
    } catch(e) { console.error('Failed to load articles', e); }
    
    // 4. 数据加载完成后，检查侧边栏粘性
    if (typeof checkSidebarStatus === 'function') {
        setTimeout(checkSidebarStatus, 500);
    }
}

// --- 以下是 product.html 的专属函数 (从内联脚本复制而来) ---

function updatePcElements(product, variant, priceStr) {
    const p = product || currentProduct;
    const v = variant || null;
    if (!p) return;
    let priceDisplay;
    if (priceStr) {
        priceDisplay = priceStr;
    } else if (v) {
        priceDisplay = v.price;
    } else {
        const prices = p.variants.map(v => v.price);
        const minPrice = Math.min(...prices);
        const maxPrice = Math.max(...prices);
        priceDisplay = (minPrice === maxPrice) ? minPrice : `${minPrice} - ${maxPrice}`;
    }
    const totalSales = p.variants.reduce((s,v) => s + (v.sales_count||0), 0);
    const totalStock = p.variants.reduce((s,v) => s + (v.stock||0), 0);
    const defV = p.variants[0];
    const mainImg = p.image_url || (defV && defV.image_url ? defV.image_url : 'https://via.placeholder.com/400x400?text=No+Image');
    const targetImg = v ? (v.image_url || mainImg) : mainImg;
    const pImgPc = document.getElementById('p-img-pc');
    const pTitlePc = document.getElementById('p-title-pc');
    const pPricePc = document.getElementById('p-price-pc');
    const pStockPc = document.getElementById('p-stock-pc');
    const pSalesPc = document.getElementById('p-sales-pc');
    const pDescPc = document.getElementById('p-desc-pc');
    const pSelectTextPc = document.getElementById('p-select-text-pc');
    const pExtraInfoPc = document.getElementById('p-extra-info-pc');
    if (pImgPc) pImgPc.src = targetImg;
    if (pTitlePc) pTitlePc.innerText = p.name;
    if (pPricePc) pPricePc.innerText = priceDisplay;
    if (pStockPc) pStockPc.innerText = `库存: ${totalStock}`;
    if (pSalesPc) pSalesPc.innerText = `已售: ${totalSales}`;
    if (pDescPc) pDescPc.innerText = p.description || '暂无详细介绍';
    if (pSelectTextPc) {
        if (v) {
            let selectedHtml = `<div style="padding-right: 10px;">已选: ${v.name}</div>`;
            if (p.variants.length > 1) { 
                selectedHtml += ` <span class="text-danger small" style="padding-top: 1px; vertical-align: middle; font-weight: 500;">点此选择更多 (共${p.variants.length}个)</span>`;
            }
            pSelectTextPc.innerHTML = selectedHtml;
        } else {
            const maxTagsToShow = 10;
            const tagsToShow = p.variants.slice(0, maxTagsToShow);
            let skuTagsHtml = tagsToShow.map(v => `<span class="sku-preview-tag">${v.name}</span>`).join('');
            if (p.variants.length > maxTagsToShow) {
                skuTagsHtml += ` <span class="text-danger small" style="padding-top: 1px; vertical-align: middle; font-weight: 500;">点此选择更多 (共${p.variants.length}个)</span>`;
            }
            pSelectTextPc.innerHTML = skuTagsHtml;
        }
    }
    if(pExtraInfoPc) {
        const variants = p.variants;
        let html = '';
        const showMarkup = v ? (v.custom_markup > 0) : variants.some(v => v.custom_markup > 0);
        if (showMarkup) { html += `<span class="extra-tag-solid">自选加价</span> `; }
        let wsText = '';
        if (v) {
            if (v.wholesale_config) {
                try {
                    let ws = v.wholesale_config;
                    if (typeof ws === 'string') ws = JSON.parse(ws);
                    if (Array.isArray(ws)) {
                        ws.sort((a, b) => a.qty - b.qty);
                        wsText = `批发价：${ws.map(w => `${w.qty}起${w.price}元/1个`).join('，')}`;
                    }
                } catch(e) {}
            }
        } else {
            const hasWholesale = variants.some(v => v.wholesale_config);
            if (hasWholesale) { wsText = `批发价：请选择规格`; }
        }
        if (wsText) { html += `<span style="padding-top: 2px;vertical-align: middle;">${wsText}</span>`; }
        if (html) {
            pExtraInfoPc.innerHTML = html;
            pExtraInfoPc.classList.remove('d-none');
        } else {
            pExtraInfoPc.innerHTML = '';
            pExtraInfoPc.classList.add('d-none');
        }
    }
}

function calculateSpecPages() {
    const vList = document.getElementById('variant-list');
    if (!currentProduct || !vList) return;
    vList.innerHTML = currentProduct.variants.map((v) => {
    const style = v.color ? `style="color:${v.color}"` : '';
    const isDisabled = v.stock <= 0;
    const disabledClass = isDisabled ? 'disabled' : '';
    return `<div class="spec-btn ${disabledClass}" ${style} data-id="${v.id}">${v.name}</div>`;
    }).join('');
    const buttons = vList.querySelectorAll('.spec-btn');
    if (buttons.length === 0) return;
    const specRowHeight = buttons[0].offsetHeight;
    const listStyle = window.getComputedStyle(vList);
    const rowGap = parseFloat(listStyle.gap) || 10;
    const pageMaxHeight = (specListMaxRows * specRowHeight) + ((specListMaxRows - 1) * rowGap);
    const listTop = vList.offsetTop;
    specPages = [];
    let currentPageItems = [];
    let currentPageStartOffset = listTop;
    for (let i = 0; i < buttons.length; i++) {
        const button = buttons[i];
        const variant = currentProduct.variants[i];
        const buttonTop = button.offsetTop; 
        if (buttonTop >= (currentPageStartOffset + pageMaxHeight - (specRowHeight / 2))) {
            if (currentPageItems.length > 0) {
                specPages.push(currentPageItems);
            }
            currentPageItems = [variant];
            currentPageStartOffset = buttonTop;
        } else {
            currentPageItems.push(variant);
        }
    }
    if (currentPageItems.length > 0) {
        specPages.push(currentPageItems);
    }
    if (specPages.length <= 1) {
        document.getElementById('spec-pagination-container').innerHTML = '';
    }
    renderSpecListPage(1);
}

function renderSpecPagination() {
    const totalPages = specPages.length;
    const container = document.getElementById('spec-pagination-container');
    if (totalPages <= 1) {
        container.innerHTML = '';
        return;
    }
    let pagesHtml = `
        <ul class="pagination pagination-sm justify-content-center">
            <li class="page-item ${specCurrentPage === 1 ? 'disabled' : ''}"><a class="page-link" onclick="changeSpecPage(1)">首页</a></li>
            <li class="page-item ${specCurrentPage === 1 ? 'disabled' : ''}"><a class="page-link" onclick="changeSpecPage(${specCurrentPage - 1})">上一页</a></li>
            <li class="page-item disabled"><span class="page-link">${specCurrentPage} / ${totalPages}</span></li>
            <li class="page-item ${specCurrentPage === totalPages ? 'disabled' : ''}"><a class="page-link" onclick="changeSpecPage(${specCurrentPage + 1})">下一页</a></li>
            <li class="page-item ${specCurrentPage === totalPages ? 'disabled' : ''}"><a class="page-link" onclick="changeSpecPage(${totalPages})">尾页</a></li>
        </ul>`;
    container.innerHTML = pagesHtml;
}

function renderSpecListPage(page) {
    const vList = document.getElementById('variant-list');
    if (!specPages || specPages.length === 0) {
        vList.innerHTML = '<div class="text-muted">暂无规格</div>';
        return;
    }
    specCurrentPage = Math.max(1, Math.min(page, specPages.length));
    const variantsToShow = specPages[specCurrentPage - 1] || [];
    vList.innerHTML = variantsToShow.map((v) => {
    const style = v.color ? `style="color:${v.color}"` : '';
    const isActive = selectedVariant && selectedVariant.id === v.id;
    const isDisabled = v.stock <= 0;
    const disabledClass = isDisabled ? 'disabled' : '';
    const clickHandler = isDisabled ? '' : `onclick="selectVariant(${v.id})"`;
    return `<div class="spec-btn ${isActive ? 'active' : ''} ${disabledClass}" ${style} ${clickHandler} data-id="${v.id}">${v.name}</div>`;
    }).join('');
    renderSpecPagination();
}

function changeSpecPage(page) {
    const totalPages = specPages.length;
    if (page < 1 || page > totalPages || page === specCurrentPage) return;
    renderSpecListPage(page);
}

function renderPage() {
    const p = currentProduct;
    const prices = p.variants.map(v => v.price);
    const minPrice = Math.min(...prices);
    const maxPrice = Math.max(...prices);
    const priceDisplay = (minPrice === maxPrice) ? minPrice : `${minPrice} - ${maxPrice}`;
    document.title = p.name;
    document.getElementById('p-title').innerText = p.name;
    document.getElementById('sku-title').innerText = p.name;
    document.getElementById('p-desc').innerText = p.description || '暂无详细介绍';
    document.getElementById('p-price').innerText = priceDisplay;
    document.getElementById('sku-price-text').innerText = priceDisplay;
    const totalSales = p.variants.reduce((s,v) => s + (v.sales_count||0), 0);
    const totalStock = p.variants.reduce((s,v) => s + (v.stock||0), 0);
    document.getElementById('p-sales').innerText = `已售: ${totalSales}`;
    document.getElementById('p-stock').innerText = `库存: ${totalStock}`;
    const defV = p.variants[0];
    const mainImg = p.image_url || (defV && defV.image_url ? defV.image_url : 'https://via.placeholder.com/400x400?text=No+Image');
    document.getElementById('p-img').src = mainImg;
    document.getElementById('sku-img').src = mainImg;
    hasCalculatedPages = false;
    specPages = [];
    specCurrentPage = 1;
    document.getElementById('variant-list').innerHTML = '<div class="text-muted small">规格加载中...</div>';
    document.getElementById('spec-pagination-container').innerHTML = '';
    document.getElementById('sku-spec-title-container').innerHTML = `规格 <span style="font-size: 12px; color: #999; font-weight: normal;">（共${p.variants.length}个）</span>`;
    const maxTagsToShow = 10;
    const tagsToShow = p.variants.slice(0, maxTagsToShow);
    let skuTagsHtml = tagsToShow.map(v => `<span class="sku-preview-tag">${v.name}</span>`).join('');
    if (p.variants.length > maxTagsToShow) {
        skuTagsHtml += ` <span class="text-danger small" style="padding-top: 1px; vertical-align: middle; font-weight: 500;">点此选择更多 (共${p.variants.length}个)</span>`;
    }
    document.getElementById('p-select-text').innerHTML = skuTagsHtml;
    renderExtraInfo(null);
    document.getElementById('sku-selected-text').innerText = '未选择';
    document.getElementById('random-mode-desc').innerText = '享受批发优惠';
    selectedVariant = null;
    updatePcElements(p, null);
}

function renderExtraInfo(selectedV) {
    const infoDiv = document.getElementById('p-extra-info');
    const variants = currentProduct.variants;
    let html = '';
    const showMarkup = selectedV ? (selectedV.custom_markup > 0) : variants.some(v => v.custom_markup > 0);
    if (showMarkup) { html += `<span class="extra-tag-solid">自选加价</span> `; }
    let wsText = '';
    if (selectedV) {
        if (selectedV.wholesale_config) {
            try {
                let ws = selectedV.wholesale_config;
                if (typeof ws === 'string') ws = JSON.parse(ws);
                if (Array.isArray(ws)) {
                    ws.sort((a, b) => a.qty - b.qty);
                    wsText = `批发价：${ws.map(w => `${w.qty}起${w.price}元/1个`).join('，')}`;
                }
            } catch(e) { console.error('WS Error', e); }
        }
    } else {
        const hasWholesale = variants.some(v => v.wholesale_config);
        if (hasWholesale) { wsText = `批发价：请选择规格`; }
    }
    if (wsText) { html += `<span style="padding-top: 2px;vertical-align: middle;">${wsText}</span>`; }
    if (html) {
        infoDiv.innerHTML = html;
        infoDiv.classList.remove('d-none');
    } else {
        infoDiv.classList.add('d-none');
    }
}

function openSkuSheet() { skuSheet.show(); }

function selectVariant(vid) {
    selectedVariant = currentProduct.variants.find(v => v.id == vid);
    renderSpecListPage(specCurrentPage); 
    document.getElementById('sku-stock-text').innerText = selectedVariant.stock;
    document.getElementById('sku-selected-text').innerText = selectedVariant.name;
    document.getElementById('p-price').innerText = selectedVariant.price;
    const labelText = selectedVariant.selection_label || '自选卡密/号码';
    document.getElementById('selection-label-text').innerText = labelText;
    const p = currentProduct;
    let selectedHtml = `<div style="padding-right: 10px;">已选: ${selectedVariant.name}</div>`;
    if (p.variants.length > 1) { 
        selectedHtml += ` <span class="text-danger small" style="padding-top: 1px; vertical-align: middle; font-weight: 500;">点此选择更多 (共${p.variants.length}个)</span>`;
    }
    document.getElementById('p-select-text').innerHTML = selectedHtml;
    const defV = p.variants[0];
    const mainImg = p.image_url || (defV && defV.image_url ? defV.image_url : 'https://via.placeholder.com/400x400?text=No+Image');
    const targetImg = selectedVariant.image_url || mainImg;
    document.getElementById('sku-img').src = targetImg;
    document.getElementById('p-img').src = targetImg;
    renderExtraInfo(selectedVariant);
    const randomDesc = document.getElementById('random-mode-desc');
    if (selectedVariant.wholesale_config) {
        try {
            let ws = selectedVariant.wholesale_config;
            if (typeof ws === 'string') ws = JSON.parse(ws);
            if (Array.isArray(ws) && ws.length > 0) {
                ws.sort((a, b) => a.qty - b.qty);
                const wsText = ws.map(w => `${w.qty}起${w.price}元/1个`).join('，');
                randomDesc.innerText = `批发价：${wsText}`;
            } else {
                randomDesc.innerText = '暂无批发价';
            }
        } catch(e) { randomDesc.innerText = '暂无批发价'; }
    } else {
        randomDesc.innerText = '暂无批发价';
    }
    const modeContainer = document.getElementById('buy-mode-container');
    if (selectedVariant.custom_markup > 0 && selectedVariant.auto_delivery === 1) {
        modeContainer.classList.remove('d-none');
        document.getElementById('markup-amount').innerText = selectedVariant.custom_markup;
        const radios = document.getElementsByName('buy_mode');
        radios.forEach(r => r.checked = false);
        buyMode = null;
        document.getElementById('card-selector').classList.add('d-none');
        selectedCardId = null;
        updatePrice();
    } else {
        modeContainer.classList.add('d-none');
        buyMode = null; 
        updatePrice();
    }
    updatePcElements(currentProduct, selectedVariant, selectedVariant.price);
}

function toggleBuyMode() {
    const radios = document.getElementsByName('buy_mode');
    for(let r of radios) if(r.checked) buyMode = r.value;
    const cardSelector = document.getElementById('card-selector');
    if (buyMode === 'select') {
        cardSelector.classList.remove('d-none');
        document.getElementById('buy-qty').value = 1;
        loadCardNotes();
    } else {
        cardSelector.classList.add('d-none');
        selectedCardId = null;
    }
    updatePrice();
}

async function loadCardNotes() {
    if (!selectedVariant) return;
    const listEl = document.getElementById('card-list');
    listEl.innerHTML = '<div class="text-center text-muted w-100" style="grid-column: 1/-1;">加载中...</div>';
    try {
        const res = await fetch(`/api/shop/cards/notes?variant_id=${selectedVariant.id}`);
        const notes = await res.json();
        if (notes.length === 0) { listEl.innerHTML = '<div class="text-center text-muted w-100" style="grid-column: 1/-1;">暂无可自选卡密/号码</div>'; return; }
        listEl.innerHTML = notes.map(n => `<div class="card-option" onclick="selectCard(this, ${n.id})">${n.note}</div>`).join('');
    } catch(e) { listEl.innerHTML = '<div class="text-danger">加载失败</div>'; }
}

function selectCard(el, id) {
    document.querySelectorAll('.card-option').forEach(opt => opt.classList.remove('active'));
    el.classList.add('active');
    selectedCardId = id;
}

function validateQty(input) {
    if (buyMode === 'select') {
        input.value = 1;
        return;
    }
    let val = parseInt(input.value);
    if (isNaN(val) || val < 1) val = 1;
    if (selectedVariant && val > selectedVariant.stock) val = selectedVariant.stock;
    input.value = val;
    updatePrice();
}

function changeQty(delta) {
    if (buyMode === 'select') return;
    const input = document.getElementById('buy-qty');
    let val = parseInt(input.value) + delta;
    input.value = val;
    validateQty(input);
}

function updatePrice() {
    if (!selectedVariant) return;
    let price = selectedVariant.price;
    const qty = parseInt(document.getElementById('buy-qty').value);
    if (buyMode === 'select') {
        price += (selectedVariant.custom_markup || 0);
    } else if (buyMode === 'random') {
        if (selectedVariant.wholesale_config) {
            try {
                let ws = selectedVariant.wholesale_config;
                if (typeof ws === 'string') ws = JSON.parse(ws);
                if (Array.isArray(ws)) {
                    ws.sort((a,b) => b.qty - a.qty);
                    for(let rule of ws) { if(qty >= rule.qty) { price = rule.price; break; } }
                }
            } catch(e) {}
        }
    }
    document.getElementById('sku-price-text').innerText = price.toFixed(2);
}

async function submitOrder() {
    if (!selectedVariant) {
        alert('请选择规格');
        if (typeof highlightAndScroll === 'function') highlightAndScroll('sku-spec-title-container');
        return;
    }
    const modeContainer = document.getElementById('buy-mode-container');
    if (modeContainer.offsetHeight > 0 || modeContainer.offsetWidth > 0) {
        const buyModeRadio = document.querySelector('input[name="buy_mode"]:checked');
        if (!buyModeRadio) {
            alert('请选择购买方式');
            if (typeof highlightAndScroll === 'function') highlightAndScroll('buy-mode-container');
            return;
        }
        if (buyMode === 'select' && !selectedCardId) {
            alert('请选择号码');
            if (typeof highlightAndScroll === 'function') highlightAndScroll('card-selector');
            return;
        }
    }
    const quantity = parseInt(document.getElementById('buy-qty').value);
    if (buyMode !== 'select') {
        if (selectedVariant.stock < quantity) {
            alert('库存不足');
            if (typeof highlightAndScroll === 'function') highlightAndScroll(document.getElementById('buy-qty').closest('.d-flex'));
            return;
        }
    }
    const contactInput = document.getElementById('contact-info');
    const contact = contactInput.value;
    if (!contact) {
        alert('请填写联系方式');
        if (typeof highlightAndScroll === 'function') highlightAndScroll('contact-info-container');
        return;
    }
    const passwordInput = document.getElementById('query-password');
    const password = passwordInput.value;
    if (!password || password.length < 6) {
        alert('请设置6位以上的查单密码');
        if (typeof highlightAndScroll === 'function') highlightAndScroll('query-password-container');
        return;
    }
    const paymentMethod = document.querySelector('input[name="payment"]:checked');
    if (!paymentMethod) {
        alert('请选择支付方式');
        if (typeof highlightAndScroll === 'function') highlightAndScroll('payment-method-container');
        return;
    }
    const btn = document.querySelector('.btn-confirm');
    const oldText = btn.innerText;
    btn.disabled = true; btn.innerText = '正在创建...';
    try {
        const payload = { 
            variant_id: selectedVariant.id, 
            quantity, 
            contact, 
            query_password: password, 
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

// 启动页面加载
init();
