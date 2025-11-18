// =============================================
// === themes/TBshop/files/product-page.js
// === (商品详情页专属JS)
// === [购物车-升级版]
// =============================================

let currentProduct = null;
let selectedVariant = null;
let selectedCardId = null;
let selectedCardNote = null; // [新增] 用于存储已选卡密的文本
let buyMode = null; // 'random' 或 'select'，全局状态，由PC和SKU面板共享
let currentAction = 'buy'; // 'buy' (立即购买) 或 'cart' (加入购物车)

const skuSheetEl = document.getElementById('skuSheet');
const skuSheet = new bootstrap.Offcanvas(skuSheetEl);

// SKU 面板 (移动端/弹出) 的分页变量
let specPages = []; 
let specCurrentPage = 1;
const specListMaxRows = 6;
let hasCalculatedPages = false;

// PC端页内规格的分页变量
let pcSpecPages = [];
let pcSpecCurrentPage = 1;
let pcHasCalculatedPages = false;


// [修改] 监听SKU面板打开事件
skuSheetEl.addEventListener('show.bs.offcanvas', () => {
    // 1. SKU面板的规格列表使用 lazy loading，打开时才计算
    if (!hasCalculatedPages && currentProduct) {
        calculateSpecPages(); // 计算 SKU 面板的分页
        hasCalculatedPages = true;
    }

    // 2. 根据 currentAction 修改 SKU 底部按钮
    const confirmBtn = skuSheetEl.querySelector('.btn-confirm');
    if (currentAction === 'cart') {
        confirmBtn.innerText = '加入购物车';
        confirmBtn.onclick = submitAddToCart; 
    } else {
        confirmBtn.innerText = '确定支付';
        confirmBtn.onclick = submitOrder; 
    }

    // 3. [修改] 同步PC端的状态到SKU面板
    if (selectedVariant) {
        // 3.1 同步购买方式
        const modeContainer = document.getElementById('buy-mode-container');
        if (modeContainer.classList.contains('d-none')) {
            // 如果 SKU 面板的购买方式是隐藏的 (即规格不支持)，则跳过
        } else {
            // 如果支持，则根据全局 buyMode 状态设置单选框
            const randomRadio = document.getElementById('mode_random');
            const selectRadio = document.getElementById('mode_select');
            
            if (buyMode === 'random') {
                randomRadio.checked = true;
                selectRadio.checked = false;
            } else if (buyMode === 'select') {
                randomRadio.checked = false;
                selectRadio.checked = true;
            } else {
                randomRadio.checked = false;
                selectRadio.checked = false;
            }
            // 触发 toggleBuyMode 以显示/隐藏 SKU 面板中的卡密列表
            toggleBuyMode(); // 这会更新SKU面板的UI
            
            // 如果是自选，需要重新加载卡密列表并高亮已选项
            if (buyMode === 'select') {
                document.getElementById('card-selector').classList.remove('d-none');
                loadCardNotes('card-list'); 
            }
        }

        // 3.2 同步购买数量 (从PC端同步到SKU面板)
        const pcQtyInput = document.getElementById('buy-qty-pc');
        const skuQtyInput = document.getElementById('buy-qty');
        if (pcQtyInput && skuQtyInput) {
            skuQtyInput.value = pcQtyInput.value;
            // 同步 disabled 状态
            if (buyMode === 'select') {
                skuQtyInput.value = 1; // 确保SKU也是1
            }
        }

        // 3.3 更新SKU面板的价格 (基于同步后的数量和模式)
        updatePrice();
    }
});

// =============================================
// [新增] PC端支付方式UI切换 (UNCHANGED)
// =============================================
document.addEventListener('change', function(e) {
    if (e.target.name === 'payment-pc') {
        // 移除所有 active
        document.querySelectorAll('.pc-payment-label').forEach(label => {
            label.classList.remove('active');
        });
        // 添加 active 到被选中的
        const activeLabel = e.target.closest('.pc-payment-label');
        if (activeLabel) {
            activeLabel.classList.add('active');
        }
    }
});


/**
 * [新增] 处理“立即购买”点击 (移动端)
 */
function handleBuyNow() {
    currentAction = 'buy';
    skuSheet.show();
}

/**
 * [新增] 处理“加入购物车”点击 (移动端)
 */
function handleAddToCart() {
    currentAction = 'cart';
    skuSheet.show();
}


/**
 * 页面加载总入口
 */
async function init() {
    if (typeof loadCartBadge === 'function') {
        loadCartBadge();
    }
    const urlParams = new URLSearchParams(window.location.search);
    const id = urlParams.get('id');
    if(!id) return alert('未指定商品');

    try {
        const configRes = await fetch('/api/shop/config');
        const siteConfig = await configRes.json();
        if (typeof renderGlobalHeaders === 'function') {
            renderGlobalHeaders(siteConfig);
        }
        if (typeof renderSidebarNoticeContact === 'function') {
            renderSidebarNoticeContact(siteConfig);
        }
    } catch (e) { console.error('Failed to load config', e); }

    let allProducts = [];
    try {
        const res = await fetch('/api/shop/products');
        allProducts = await res.json();
        currentProduct = allProducts.find(p => p.id == id);
        if (!currentProduct) return alert('商品不存在或已下架');
        renderPage();
        if (typeof renderSidebarTopSales === 'function') {
            renderSidebarTopSales(allProducts);
        }
        if (typeof renderSidebarTagCloud === 'function') {
            renderSidebarTagCloud(allProducts);
        }
    } catch (e) { console.error(e); alert('加载失败'); }

    try {
        const artRes = await fetch('/api/shop/articles/list');
        const articles = await artRes.json();
        if (typeof renderSidebarArticleCats === 'function') {
            renderSidebarArticleCats(articles);
        }
    } catch(e) { console.error('Failed to load articles', e); }
    
    if (typeof checkSidebarStatus === 'function') {
        setTimeout(checkSidebarStatus, 500);
    }
}

// --- (专属函数) ---

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
    const pExtraInfoPc = document.getElementById('p-extra-info-pc');
    
    if (pImgPc) pImgPc.src = targetImg;
    if (pTitlePc) pTitlePc.innerText = p.name;
    
    if (pPricePc && !selectedVariant) {
         pPricePc.innerText = priceDisplay;
    }

    if (pStockPc) pStockPc.innerText = `库存: ${totalStock}`;
    if (pSalesPc) pSalesPc.innerText = `已售: ${totalSales}`;
    if (pDescPc) pDescPc.innerText = p.description || '暂无详细介绍';
    
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

// ==========================================================
// PC 端页内规格函数 (UNCHANGED)
// ==========================================================
function calculatePCSpecPages() {
    const vList = document.getElementById('variant-list-pc');
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
    pcSpecPages = [];
    let currentPageItems = [];
    let currentPageStartOffset = listTop;
    for (let i = 0; i < buttons.length; i++) {
        const button = buttons[i];
        const variant = currentProduct.variants[i];
        const buttonTop = button.offsetTop; 
        if (buttonTop >= (currentPageStartOffset + pageMaxHeight - (specRowHeight / 2))) {
            if (currentPageItems.length > 0) {
                pcSpecPages.push(currentPageItems);
            }
            currentPageItems = [variant];
            currentPageStartOffset = buttonTop;
        } else {
            currentPageItems.push(variant);
        }
    }
    if (currentPageItems.length > 0) {
        pcSpecPages.push(currentPageItems);
    }
    if (pcSpecPages.length <= 1) {
        document.getElementById('spec-pagination-container-pc').innerHTML = '';
    }
    renderPCSpecListPage(1);
}

function renderPCSpecPagination() {
    const totalPages = pcSpecPages.length;
    const container = document.getElementById('spec-pagination-container-pc');
    if (totalPages <= 1) {
        container.innerHTML = '';
        return;
    }
    let pagesHtml = `
        <ul class="pagination pagination-sm justify-content-start">
            <li class="page-item ${pcSpecCurrentPage === 1 ? 'disabled' : ''}"><a class="page-link" onclick="changePCSpecPage(1)">首页</a></li>
            <li class="page-item ${pcSpecCurrentPage === 1 ? 'disabled' : ''}"><a class="page-link" onclick="changePCSpecPage(${pcSpecCurrentPage - 1})">上一页</a></li>
            <li class="page-item disabled"><span class="page-link">${pcSpecCurrentPage} / ${totalPages}</span></li>
            <li class="page-item ${pcSpecCurrentPage === totalPages ? 'disabled' : ''}"><a class="page-link" onclick="changePCSpecPage(${pcSpecCurrentPage + 1})">下一页</a></li>
            <li class="page-item ${pcSpecCurrentPage === totalPages ? 'disabled' : ''}"><a class="page-link" onclick="changePCSpecPage(${totalPages})">尾页</a></li>
        </ul>`;
    container.innerHTML = pagesHtml;
}

function renderPCSpecListPage(page) {
    const vList = document.getElementById('variant-list-pc');
    if (!pcSpecPages || pcSpecPages.length === 0) {
        vList.innerHTML = '<div class="text-muted">暂无规格</div>';
        return;
    }
    pcSpecCurrentPage = Math.max(1, Math.min(page, pcSpecPages.length));
    const variantsToShow = pcSpecPages[pcSpecCurrentPage - 1] || [];
    vList.innerHTML = variantsToShow.map((v) => {
    const style = v.color ? `style="color:${v.color}"` : '';
    const isActive = selectedVariant && selectedVariant.id === v.id;
    const isDisabled = v.stock <= 0;
    const disabledClass = isDisabled ? 'disabled' : '';
    const clickHandler = isDisabled ? '' : `onclick="selectVariant(${v.id})"`;
    return `<div class="spec-btn ${isActive ? 'active' : ''} ${disabledClass}" ${style} ${clickHandler} data-id="${v.id}">${v.name}</div>`;
    }).join('');
    renderPCSpecPagination();
}

function changePCSpecPage(page) {
    const totalPages = pcSpecPages.length;
    if (page < 1 || page > totalPages || page === pcSpecCurrentPage) return;
    renderPCSpecListPage(page);
}


// ==========================================================
// SKU 弹出面板函数 (UNCHANGED)
// ==========================================================
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
    if (page < 1 || page > totalPages || page === pcSpecCurrentPage) return;
    renderSpecListPage(page);
}

// ==========================================================
// 共享函数 (UNCHANGED)
// ==========================================================

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
    
    // SKU 面板的规格重置
    hasCalculatedPages = false;
    specPages = [];
    specCurrentPage = 1;
    document.getElementById('variant-list').innerHTML = '<div class="text-muted small">规格加载中...</div>';
    document.getElementById('spec-pagination-container').innerHTML = '';
    document.getElementById('sku-spec-title-container').innerHTML = `规格 <span style="font-size: 12px; color: #999; font-weight: normal;">（共${p.variants.length}个）</span>`;
    
    // PC 端页内规格重置 (变量)
    pcHasCalculatedPages = false;
    pcSpecPages = [];
    pcSpecCurrentPage = 1;

    // 移动端规格预览
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
    
    // [修改] 重置PC端购买方式/数量
    document.getElementById('buy-mode-container-pc').classList.add('d-none');
    document.getElementById('quantity-container-pc').classList.add('d-none');
    document.getElementById('buy-qty-pc').value = 1;
    selectPcBuyMode(null); // [修改] 重置PC端按钮状态并更新文本
    
    updatePcElements(p, null, priceDisplay); // [修改] 传入 priceDisplay

    // 立即为PC端计算并渲染规格
    if (!pcHasCalculatedPages && currentProduct) {
        const pcTitleContainer = document.getElementById('sku-spec-title-container-pc');
        if (pcTitleContainer) {
            pcTitleContainer.innerHTML = `规格 <span style="font-size: 12px; color: #999; font-weight: normal;">（共${p.variants.length}个）</span>`;
        }
        calculatePCSpecPages(); 
        pcHasCalculatedPages = true;
    }
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

/**
 * [修改] 此函数现在专用于移动端打开SKU面板
 */
function openSkuSheet() { 
    handleBuyNow(); 
}

/**
 * [修改] 选择规格时，同时更新 PC端 和 SKU面板 的显示状态
 */
function selectVariant(vid) {
    selectedVariant = currentProduct.variants.find(v => v.id == vid);
    
    // 1. 同时更新 PC 端和 SKU 面板的列表状态
    renderSpecListPage(specCurrentPage); // 更新 SKU 面板
    if (pcHasCalculatedPages) {
        renderPCSpecListPage(pcSpecCurrentPage); // 更新 PC 端页内
    }
    
    // 2. 更新SKU面板的常规信息
    document.getElementById('sku-stock-text').innerText = selectedVariant.stock;
    document.getElementById('sku-selected-text').innerText = selectedVariant.name;
    document.getElementById('p-price').innerText = selectedVariant.price; // 移动端价格
    const labelText = selectedVariant.selection_label || '自选卡密/号码';
    document.getElementById('selection-label-text').innerText = labelText;
    
    // 3. 更新移动端“已选”
    const p = currentProduct;
    let selectedHtml = `<div style="padding-right: 10px;">已选: ${selectedVariant.name}</div>`;
    if (p.variants.length > 1) { 
        selectedHtml += ` <span class="text-danger small" style="padding-top: 1px; vertical-align: middle; font-weight: 500;">点此选择更多 (共${p.variants.length}个)</span>`;
    }
    document.getElementById('p-select-text').innerHTML = selectedHtml;
    
    // 4. 更新图片
    const defV = p.variants[0];
    const mainImg = p.image_url || (defV && defV.image_url ? defV.image_url : 'https://via.placeholder.com/400x400?text=No+Image');
    const targetImg = selectedVariant.image_url || mainImg;
    document.getElementById('sku-img').src = targetImg;
    document.getElementById('p-img').src = targetImg;
    
    // 5. 更新移动端批发/加价信息
    renderExtraInfo(selectedVariant);
    
    // 6. 更新SKU面板和PC的批发信息
    const randomDesc = document.getElementById('random-mode-desc');
    const randomDescPc = document.getElementById('random-mode-desc-pc'); 
    if (selectedVariant.wholesale_config) {
        try {
            let ws = selectedVariant.wholesale_config;
            if (typeof ws === 'string') ws = JSON.parse(ws);
            if (Array.isArray(ws) && ws.length > 0) {
                ws.sort((a, b) => a.qty - b.qty);
                const wsText = ws.map(w => `${w.qty}起${w.price}元/1个`).join('，');
                randomDesc.innerText = `批发价：${wsText}`;
                randomDescPc.innerText = `批发价：${wsText}`; 
            } else {
                randomDesc.innerText = '暂无批发价';
                randomDescPc.innerText = '暂无批发价';
            }
        } catch(e) { 
            randomDesc.innerText = '暂无批发价'; 
            randomDescPc.innerText = '暂无批发价';
        }
    } else {
        randomDesc.innerText = '暂无批发价';
        randomDescPc.innerText = '暂无批发价';
    }
    
    // 7. SKU面板购买方式 (仅控制SKU面板)
    const modeContainer = document.getElementById('buy-mode-container');
    if (selectedVariant.custom_markup > 0 && selectedVariant.auto_delivery === 1) {
        modeContainer.classList.remove('d-none');
        document.getElementById('markup-amount').innerText = selectedVariant.custom_markup;
    } else {
        modeContainer.classList.add('d-none');
    }

    // 8. PC端购买方式 (控制PC页面)
    const modeContainerPc = document.getElementById('buy-mode-container-pc');
    const qtyContainerPc = document.getElementById('quantity-container-pc');
    if (selectedVariant.custom_markup > 0 && selectedVariant.auto_delivery === 1) {
        modeContainerPc.classList.remove('d-none'); // 显示PC购买方式
        qtyContainerPc.classList.remove('d-none');  // 显示PC购买数量
        document.getElementById('markup-amount-pc').innerText = selectedVariant.custom_markup;
        document.getElementById('selection-label-text-pc').innerText = labelText;
        // 重置
        selectPcBuyMode(null);
        document.getElementById('buy-qty-pc').value = 1;
        selectedCardId = null;
        selectedCardNote = null; // [修改] 重置
    } else {
        modeContainerPc.classList.add('d-none'); // 隐藏PC购买方式
        qtyContainerPc.classList.remove('d-none'); // 基础数量选择器总是显示
        // 重置
        selectPcBuyMode(null);
        document.getElementById('buy-qty-pc').value = 1;
        selectedCardId = null;
        selectedCardNote = null; // [修改] 重置
    }
    
    // 9. 重置全局状态 (buyMode)
    buyMode = null; 
    selectedCardId = null; 
    selectedCardNote = null; // [修改] 重置
    // 重置SKU面板的单选框
    const radios = document.getElementsByName('buy_mode');
    radios.forEach(r => r.checked = false);
    document.getElementById('card-selector').classList.add('d-none');
    
    // 10. 更新价格 (SKU面板)
    updatePrice();
    
    // 11. 更新PC端元素 (价格等)
    updatePcElements(currentProduct, selectedVariant, selectedVariant.price);

    // 12. [新增] 更新PC端已选文本
    updatePcSelectionText();
}

/**
 * SKU面板的购买方式切换 (只管SKU面板)
 */
function toggleBuyMode() {
    const radios = document.getElementsByName('buy_mode');
    let currentSkuBuyMode = null;
    for(let r of radios) if(r.checked) currentSkuBuyMode = r.value;
    
    // 将SKU面板的选择同步到全局 buyMode
    buyMode = currentSkuBuyMode;
    
    const cardSelector = document.getElementById('card-selector');
    if (currentSkuBuyMode === 'select') {
        cardSelector.classList.remove('d-none');
        document.getElementById('buy-qty').value = 1;
        loadCardNotes('card-list'); // 指定SKU列表ID
        
        // [新增] 同步PC端
        selectPcBuyMode('select');
        
    } else {
        cardSelector.classList.add('d-none');
        if (currentSkuBuyMode === 'random') {
            selectedCardId = null;
            selectedCardNote = null; // [修改] 重置
            selectPcBuyMode('random'); // 同步PC端按钮状态
        }
    }
    updatePrice();
}

/**
 * [修改] 加载卡密/号码列表 (可用于PC或SKU面板)
 */
async function loadCardNotes(targetListId) {
    if (!selectedVariant) return;
    const listEl = document.getElementById(targetListId);
    if (!listEl) return;
    
    listEl.innerHTML = '<div class="text-center text-muted w-100" style="grid-column: 1/-1;">加载中...</div>';
    try {
        const res = await fetch(`/api/shop/cards/notes?variant_id=${selectedVariant.id}`);
        const notes = await res.json();
        if (notes.length === 0) { 
            listEl.innerHTML = '<div class="text-center text-muted w-100" style="grid-column: 1/-1;">暂无可自选卡密/号码</div>'; 
            return; 
        }
        
        listEl.innerHTML = notes.map(n => 
            `<div class="card-option" onclick="selectCard(this, ${n.id})">${n.note}</div>`
        ).join('');

        // [新增] 加载后，自动高亮全局 selectedCardId
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

/**
 * [修改] 选择一个卡密/号码
 */
function selectCard(el, id) {
    // 仅在当前列表内清除 active 状态
    const parentList = el.closest('.card-select-list, .card-select-list-pc');
    if (parentList) {
        parentList.querySelectorAll('.card-option').forEach(opt => opt.classList.remove('active'));
    }
    
    el.classList.add('active');
    selectedCardId = id; // 始终更新全局 selectedCardId
    selectedCardNote = el.innerText; // [修改] 立即存储文本
}

/**
 * [修改] 验证数量 (可用于PC或SKU)
 */
function validateQty(input) {
    let currentBuyMode = buyMode;
    let inputId = input.id;
    
    // 如果在SKU面板操作，以SKU面板的为准
    if (inputId === 'buy-qty') {
        const radios = document.getElementsByName('buy_mode');
        for(let r of radios) if(r.checked) currentBuyMode = r.value;
    }

    if (currentBuyMode === 'select') {
        input.value = 1;
        // [新增] 确保两个输入框都为1
        document.getElementById('buy-qty-pc').value = 1;
        document.getElementById('buy-qty').value = 1;
        return;
    }
    
    let val = parseInt(input.value);
    if (isNaN(val) || val < 1) val = 1;
    if (selectedVariant && val > selectedVariant.stock) val = selectedVariant.stock;
    input.value = val;
    
    // [修改] 确保两个输入框同步
    if (inputId === 'buy-qty-pc') {
        document.getElementById('buy-qty').value = val;
    } else if (inputId === 'buy-qty') {
        document.getElementById('buy-qty-pc').value = val;
    }
    
    updatePrice(); // SKU面板价格计算
}

/**
 * [修改] 改变数量
 */
function changeQty(delta, inputId) {
    const input = document.getElementById(inputId);
    if (!input) return;

    let currentBuyMode = buyMode;
    if (inputId === 'buy-qty') {
        const radios = document.getElementsByName('buy_mode');
        for(let r of radios) if(r.checked) currentBuyMode = r.value;
    }
    
    if (currentBuyMode === 'select') return; // 自选模式不允许增减

    let val = parseInt(input.value) + delta;
    input.value = val;
    validateQty(input); // 传递元素本身
}

// ==========================================================
// [
//   *** 价格显示 (MODIFIED) ***
// ]
// ==========================================================
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
                let ws = selectedVariant.wholesale_config;
                if (typeof ws === 'string') ws = JSON.parse(ws);
                if (Array.isArray(ws)) {
                    ws.sort((a,b) => b.qty - a.qty);
                    for(let rule of ws) { 
                        if(qty >= rule.qty) { 
                            price = rule.price; 
                            break; 
                        } 
                    }
                }
            } catch(e) {}
        }
    }
    
    const finalUnitPriceStr = price.toFixed(2);

    // 更新SKU价格
    document.getElementById('sku-price-text').innerText = finalUnitPriceStr;

    // --- PC端价格显示逻辑 ---
    const pPricePc = document.getElementById('p-price-pc');
    if (pPricePc) {
        if (buyMode === 'select' && markup > 0) {
            // 模式: 自选 + 有加价
            const basePriceStr = basePrice.toFixed(2);
            const markupStr = markup.toFixed(2);
            const totalStr = (basePrice + markup).toFixed(2); 
            
            pPricePc.innerHTML = `<span style="font-size: 16px; font-weight: normal; color: #555;">${basePriceStr} (规格价) + ${markupStr} (自选) = </span>${totalStr}`;
        } else {
            // 模式: 随机, 或 自选无加价
            pPricePc.innerText = finalUnitPriceStr; 
        }
    }
    
    // [新增] 将计算后的单价存储到全局变量，供 PC端加入购物车使用
    window.currentCalculatedPrice = price; 
}

// ==========================================================
// PC端 购买方式/卡密选择 面板控制
// ==========================================================

// ==========================================================
// [
//   *** “已选”文本 (UNCHANGED) ***
// ]
// ==========================================================
/**
 * [修改] 更新PC端的“已选”提示文本 (使用全局变量)
 */
function updatePcSelectionText() {
    const noteEl = document.getElementById('pc-selected-card-note');
    if (!noteEl) return;

    if (!selectedVariant) {
        noteEl.innerText = '';
        return;
    }
    
    const modeContainerPc = document.getElementById('buy-mode-container-pc');
    
    if (modeContainerPc && modeContainerPc.classList.contains('d-none')) {
        // 如果父容器是隐藏的 (即不支持自选), 则只显示规格
        noteEl.innerText = `已选: ${selectedVariant.name}`; 
        return;
    }

    // --- 以下逻辑处理支持自选的情况 ---
    let text = `已选: ${selectedVariant.name}`;

    // [修改] 使用全局变量 selectedCardNote 并添加 "+"
    if (buyMode === 'select' && selectedCardId && selectedCardNote) {
        text += ` + ${selectedCardNote}`;
    }
    
    noteEl.innerText = text;
}


/**
 * [修改] 选择PC端的购买方式 (随机/自选)
 */
function selectPcBuyMode(mode) {
    buyMode = mode;
    const randomBtn = document.getElementById('mode_random_pc');
    const selectBtn = document.getElementById('mode_select_pc');
    
    randomBtn.classList.remove('active');
    selectBtn.classList.remove('active');
    
    const qtyInput = document.getElementById('buy-qty-pc');
    const stepper = document.querySelector('#quantity-container-pc .stepper-pc');

    if (mode === 'random') {
        randomBtn.classList.add('active');
        selectedCardId = null; // 选随机，清除自选ID
        selectedCardNote = null; // [修改] 清除文本
        
        // 恢复PC端数量输入
        if(qtyInput) qtyInput.disabled = false;
        if(stepper) stepper.style.opacity = '1';
        
        validateQty(qtyInput); // 验证数量，会触发 updatePrice
    } else if (mode === 'select') {
        selectBtn.classList.add('active');
        
        // PC端自选时，数量固定为1
        if(qtyInput) {
            qtyInput.value = 1;
            qtyInput.disabled = true;
        }
        if(stepper) stepper.style.opacity = '0.5';
        updatePrice(); // [新增] 确保切换到select时价格更新
    } else {
         // null，清除所有
        selectedCardId = null;
        selectedCardNote = null; // [修改] 清除文本
        
        // 恢复PC端数量输入
        if(qtyInput) qtyInput.disabled = false;
        if(stepper) stepper.style.opacity = '1';
        updatePrice(); // [新增] 确保清除时价格复位
    }

    updatePcSelectionText(); // [修改] 统一调用
    // updatePrice() 会在 validateQty() 或上面新增的地方被调用
}


// ==========================================================
// [
//   *** 关键修改点 1 (PC端) ***
// ]
// ==========================================================
/**
 * [新增] PC端购买方式点击处理器 (支持切换/取消)
 */
function handlePcBuyModeClick(mode) {
    if (buyMode === mode) {
        // 1. 已经激活，再次点击 -> 取消
        selectPcBuyMode(null);
        if (mode === 'select') {
            togglePcCardPanel(false); // 如果是自选，关闭面板
        }
    } else {
        // 2. 未激活 -> 激活
        selectPcBuyMode(mode);
        if (mode === 'select') {
            // 激活自选
            loadCardNotes('card-list-pc');
            togglePcCardPanel(true);
        } else {
            // 激活随机
            togglePcCardPanel(false); // 关闭自选面板
        }
    }
}

// ==========================================================
// [
//   *** 关键修改点 2 (Mobile端) ***
// ]
// ==========================================================
/**
 * [新增] 移动端SKU购买方式点击处理器 (支持切换/取消)
 */
function handleMobileBuyModeClick(event, mode) {
    const radio = document.getElementById(mode === 'select' ? 'mode_select' : 'mode_random');
    
    if (radio.checked) {
        // 1. 已经激活，再次点击 -> 取消
        event.preventDefault(); // 阻止 label 再次选中 radio
        radio.checked = false;
        buyMode = null;
        toggleBuyMode(); // 调用 toggleBuyMode 来更新UI (隐藏卡密列表)
    }
    // 2. 未激活 -> 正常点击
    // label的默认行为会选中 radio, 触发 onchange, onchange 会调用 toggleBuyMode()
    // 所以这里不需要写 else
}


/**
 * [修改] 切换PC端滑出面板的显示状态
 */
function togglePcCardPanel(show) {
    const panel = document.getElementById('pc-card-selector-panel');
    if (show) {
        panel.classList.add('show');
    } else {
        panel.classList.remove('show');
        
        // [修改] 如果关闭时没有确认选择 (selectedCardId 为空)，则取消"自选"模式
        // 这是为了处理用户点击 "︽ 收取" 按钮，而不是 "确定" 按钮的情况
        if (!selectedCardId) {
            selectPcBuyMode(null); // 这会重置模式、启用数量、更新文本和价格
        } else {
            // [新增] 如果用户选了卡密，但点了"收取"
            // 我们假定"收取"等于"确定"，以防止状态不一致
            updatePcSelectionText();
            updatePrice();
        }
    }
}

/**
 * [修改] PC端滑出面板 - 点击“确定”
 */
function confirmPcCardSelection() {
    // (selectedCardId 和 selectedCardNote 已经在 selectCard 时设置好了)
    togglePcCardPanel(false); // 关闭面板
    updatePcSelectionText(); // 更新已选文本
    updatePrice(); // [新增] 确认选择时更新价格
}


// ==========================================================
// 提交逻辑 (Add to Cart / Submit Order)
// ==========================================================

/**
 * [修改] PC端提交订单 (UNCHANGED)
 */
async function submitOrderPc() {
    // 1. 验证规格
    if (!selectedVariant) {
        alert('请选择规格');
        try {
            document.getElementById('variant-list-pc').style.border = '1px solid red';
            setTimeout(() => { 
                document.getElementById('variant-list-pc').style.border = 'none'; 
            }, 2000);
        } catch(e){}
        return;
    }
    
    // 2. 验证购买方式 (全局变量)
    const modeContainerPc = document.getElementById('buy-mode-container-pc');
    if (modeContainerPc && !modeContainerPc.classList.contains('d-none')) { // 检查是否启用了购买方式
        if (!buyMode) {
            alert('请选择购买方式 (随机或自选)');
            try {
                modeContainerPc.style.border = '1px solid red';
                setTimeout(() => { modeContainerPc.style.border = 'none'; }, 2000);
            } catch(e){}
            return;
        }
        
        if (buyMode === 'select' && !selectedCardId) {
            alert('请选择号码');
            // [修改] 触发新的点击处理器
            handlePcBuyModeClick('select');
            return;
        }
    }
    
    // 3. 验证数量
    const quantity = parseInt(document.getElementById('buy-qty-pc').value);
    if (buyMode !== 'select') {
        if (selectedVariant.stock < quantity) {
            alert('库存不足');
            document.getElementById('buy-qty-pc').focus();
            return;
        }
    }

    // 4. 验证PC端的联系方式和密码
    const contactInput = document.getElementById('contact-info-pc');
    const contact = contactInput.value;
    if (!contact) {
        alert('请填写联系方式');
        contactInput.focus();
        try { contactInput.style.border = '1px solid red'; } catch(e){}
        return;
    } else {
        try { contactInput.style.border = 'none'; } catch(e){}
    }

    const passwordInput = document.getElementById('query-password-pc');
    const password = passwordInput.value;
    
    // PC端密码验证 (1位)
    if (!password || password.length < 1) { 
        alert('请设置1位以上的查单密码'); 
        passwordInput.focus();
        try { passwordInput.style.border = '1px solid red'; } catch(e){}
        return;
    } else {
        try { passwordInput.style.border = 'none'; } catch(e){}
    }

    // 5. 验证PC端的支付方式
    const paymentMethod = document.querySelector('input[name="payment-pc"]:checked');
    if (!paymentMethod) {
        alert('请选择支付方式');
        try {
            document.getElementById('payment-method-container-pc').style.border = '1px solid red';
            setTimeout(() => { 
                document.getElementById('payment-method-container-pc').style.border = 'none'; 
            }, 2000);
        } catch(e){}
        return;
    }
    
    const btn = document.getElementById('btn-buy-pc');
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
        // 使用全局变量
        if (buyMode === 'select' && selectedCardId) {
            payload.card_id = selectedCardId;
        }
        
        const res = await fetch('/api/shop/order/create', { 
            method: 'POST', 
            headers: { 'Content-Type': 'application/json' }, 
            body: JSON.stringify(payload) 
        });
        
        const order = await res.json();
        if(order.error) throw new Error(order.error);
        
        window.location.href = `pay.html?order_id=${order.order_id}`;
    
    } catch (e) { 
        alert(e.message); 
    } 
    finally { 
        btn.disabled = false; 
        btn.innerText = oldText; 
    }
}


/**
 * [新增] 提交到购物车 (此功能依赖SKU面板)
 */
async function submitAddToCart() {
    // 1. 验证 (基于SKU面板)
    if (!selectedVariant) {
        alert('请选择规格');
        if (typeof highlightAndScroll === 'function') highlightAndScroll('sku-spec-title-container');
        return;
    }
    
    // [修改] 验证全局 buyMode 和 selectedCardId
    const modeContainer = document.getElementById('buy-mode-container');
    if (modeContainer.offsetHeight > 0 || modeContainer.offsetWidth > 0) {
        const buyModeRadio = document.querySelector('input[name="buy_mode"]:checked');
        if (!buyModeRadio) {
            // [修改] 如果 radio 没选中 (因为被新逻辑取消了)，则使用全局 buyMode
            // 但加入购物车必须选一个模式
            if (!buyMode) {
                 alert('请选择购买方式');
                 if (typeof highlightAndScroll === 'function') highlightAndScroll('buy-mode-container');
                 return;
            }
        } else {
             buyMode = buyModeRadio.value; // 确保全局模式与SKU面板同步
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
    
    // 2. 将商品加入 localStorage
    const btn = skuSheetEl.querySelector('.btn-confirm');
    const oldText = btn.innerText;
    btn.disabled = true; btn.innerText = '正在添加...';
    
    try {
        let cart = JSON.parse(localStorage.getItem('tbShopCart') || '[]');
        
        // [修改] 使用 selectedCardNote
        const noteToStore = (buyMode === 'select') ? (selectedCardNote || document.querySelector('#card-list .card-option.active')?.innerText) : null;
        
        const cartItem = {
            productId: currentProduct.id,
            productName: currentProduct.name,
            variantId: selectedVariant.id,
            variantName: selectedVariant.name,
            price: parseFloat(document.getElementById('sku-price-text').innerText), // 存储单价
            quantity: quantity,
            img: document.getElementById('sku-img').src,
            buyMode: buyMode,
            selectedCardId: (buyMode === 'select') ? selectedCardId : null,
            selectedCardNote: noteToStore
        };

        const existingItemIndex = cart.findIndex(item => 
            item.variantId === cartItem.variantId && 
            item.buyMode !== 'select' && 
            cartItem.buyMode !== 'select' &&
            item.buyMode === cartItem.buyMode
        );

        if (existingItemIndex > -1) {
            cart[existingItemIndex].quantity += cartItem.quantity;
        } else {
            cart.push(cartItem);
        }

        localStorage.setItem('tbShopCart', JSON.stringify(cart));
        
        if (typeof updateCartBadge === 'function') {
            updateCartBadge(cart.length);
        }
        
        skuSheet.hide();
        
    } catch (e) {
        console.error('Add to cart failed', e);
        alert('添加失败，请重试');
    } finally {
        btn.disabled = false;
        btn.innerText = oldText; 
    }
}

/**
 * 提交订单 (此函数专用于SKU面板)
 */
async function submitOrder() {
    if (!selectedVariant) {
        alert('请选择规格');
        if (typeof highlightAndScroll === 'function') highlightAndScroll('sku-spec-title-container');
        return;
    }
    
    // [修改] 验证全局 buyMode 和 selectedCardId
    const modeContainer = document.getElementById('buy-mode-container');
    if (modeContainer.offsetHeight > 0 || modeContainer.offsetWidth > 0) {
        const buyModeRadio = document.querySelector('input[name="buy_mode"]:checked');
        if (!buyModeRadio) {
            // [修改] 检查全局 buyMode
             if (!buyMode) {
                alert('请选择购买方式');
                if (typeof highlightAndScroll === 'function') highlightAndScroll('buy-mode-container');
                return;
            }
        } else {
            buyMode = buyModeRadio.value; 
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
    
    // 移动端密码验证 (1位)
    if (!password || password.length < 1) {
        alert('请设置1位以上的查单密码');
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

/**
 * [新增] PC端加入购物车逻辑
 */
function handlePcAddToCart() {
    // 1. 验证规格
    if (!selectedVariant) {
        alert('请选择规格');
        try {
            const vList = document.getElementById('variant-list-pc');
            vList.style.border = '1px solid red';
            setTimeout(() => { vList.style.border = 'none'; }, 2000);
        } catch(e){}
        return;
    }
    
    // 2. 验证购买方式
    const modeContainerPc = document.getElementById('buy-mode-container-pc');
    if (modeContainerPc && !modeContainerPc.classList.contains('d-none')) {
        if (!buyMode) {
            alert('请选择购买方式 (随机或自选)');
            return;
        }
        if (buyMode === 'select' && !selectedCardId) {
            alert('请选择号码');
            handlePcBuyModeClick('select'); // 自动打开面板
            return;
        }
    }
    
    // 3. 验证数量
    const quantity = parseInt(document.getElementById('buy-qty-pc').value) || 1;
    if (buyMode !== 'select') {
        if (selectedVariant.stock < quantity) {
            alert('库存不足');
            return;
        }
    }
    
    // 4. 执行加入购物车
    try {
        let cart = JSON.parse(localStorage.getItem('tbShopCart') || '[]');
        
        // 使用全局存储的文本或备用逻辑
        const noteToStore = (buyMode === 'select') ? (selectedCardNote || selectedCardId) : null;
        // 使用 updatePrice 中计算好的价格
        const finalPrice = window.currentCalculatedPrice || selectedVariant.price;

        const cartItem = {
            productId: currentProduct.id,
            productName: currentProduct.name,
            variantId: selectedVariant.id,
            variantName: selectedVariant.name,
            price: finalPrice,
            quantity: quantity,
            img: selectedVariant.image_url || currentProduct.image_url || '',
            buyMode: buyMode,
            selectedCardId: (buyMode === 'select') ? selectedCardId : null,
            selectedCardNote: noteToStore
        };

        // 检查购物车中是否已存在相同的商品配置
        const existingItemIndex = cart.findIndex(item => 
            item.variantId === cartItem.variantId && 
            item.buyMode !== 'select' && // 自选卡密通常不合并数量，或者你可以根据需求修改
            cartItem.buyMode !== 'select' &&
            item.buyMode === cartItem.buyMode
        );

        if (existingItemIndex > -1) {
            cart[existingItemIndex].quantity += cartItem.quantity;
        } else {
            cart.push(cartItem);
        }

        localStorage.setItem('tbShopCart', JSON.stringify(cart));
        
        // 5. 更新所有角标
        if (typeof updateCartBadge === 'function') {
            updateCartBadge(cart.length);
        }
        
        // 6. 成功动画/提示
        const btn = document.querySelector('.btn-buy-split-left');
        const originalText = btn.innerText;
        btn.innerText = '已加入 ✔';
        btn.style.opacity = '0.8';
        setTimeout(() => {
            btn.innerText = originalText;
            btn.style.opacity = '1';
        }, 1500);

    } catch (e) {
        console.error('PC Add to cart failed', e);
        alert('添加失败，请重试');
    }
}

// 启动页面加载
init();
