// --- 1. 全局共享变量 (合并自两个文件) ---
var allProducts = [];
var allCategories = [];
var currentProduct = null;
var selectedVariant = null;
var selectedCardId = null;
var buyMode = null;
var sidebar = null; // 用于首页
var productSidebar = null; // 用于商品页
var skuSheet = null; // Bootstrap Offcanvas 实例
var specPages = [];
var specCurrentPage = 1;
const specListMaxRows = 6;
var hasCalculatedPages = false;

// --- 2. 首页 (index.html) 的函数 ---

// 核心函数：智能判断高度，决定是开启还是销毁滑动 (首页)
function checkSidebarStatus() {
    const sidebarInner = document.querySelector('.sidebar-inner');
    const productArea = document.getElementById('products-list-area');
    
    if (!sidebarInner || !productArea) return;
    productArea.style.minHeight = '400px';
    const sbHeight = sidebarInner.offsetHeight;
    const contentHeight = productArea.offsetHeight;
    const isWideScreen = window.innerWidth >= 992;

    if (contentHeight < sbHeight || !isWideScreen) {
        if (sidebar) {
            sidebar.destroy();
            sidebar = null;
        }
    } else {
        if (!sidebar) {
            sidebar = new StickySidebar('#sidebar-wrapper', {
                topSpacing: 80,
                bottomSpacing: 20,
                containerSelector: '#main-content-row',
                innerWrapperSelector: '.sidebar-inner'
            });
        } else {
            sidebar.updateSticky();
        }
    }
}

function getProductCardHtml(p) {
    const mainVariant = p.variants[0] || {};
    const totalSales = p.variants.reduce((sum, v) => sum + (v.sales_count || 0), 0);
    const totalStock = p.variants.reduce((sum, v) => sum + (v.stock || 0), 0);
    const imgUrl = p.image_url || mainVariant.image_url || 'https://via.placeholder.com/300x300/e0e0e0/999999?text=No+Image';
    const price = mainVariant.price || '0.00';
    const tagsHtml = parseTags(p.tags);
    return `
        <a href="/product.html?id=${p.id}" class="tb-card">
            <div class="tb-img-wrap">
                <img src="${imgUrl}" alt="${p.name}" class="tb-img" loading="lazy">
            </div>
            <div class="tb-info">
                <div class="tb-title">${p.name}</div>
                <div class="tb-tags-row">${tagsHtml}</div>
                <div class="tb-price-row">
                    <span class="tb-price"><small>¥</small>${price}</span>
                    <span class="tb-sales">库存${totalStock} | 已售${totalSales}</span>
                </div>
            </div>
        </a>
    `;
}

// 渲染分类视图 (首页)
function renderCategorizedView(filterId) {
    const area = document.getElementById('products-list-area');
    if (!area) return; 
    area.innerHTML = ''; 
    let categoriesToShow = [];
    
    if (filterId === 'all') {
        categoriesToShow = allCategories;
    } else {
        const targetCat = allCategories.find(c => c.id == filterId);
        if (targetCat) categoriesToShow = [targetCat];
    }

    let hasAnyProduct = false;
    categoriesToShow.forEach(cat => {
        const catProducts = allProducts.filter(p => p.category_id == cat.id);
        if (catProducts.length > 0) {
            hasAnyProduct = true;
            area.innerHTML += `
                <div class="module-box">
                    <div class="module-title">${cat.name}</div>
                    <div class="taobao-grid">
                        ${catProducts.map(p => getProductCardHtml(p)).join('')}
                    </div>
                </div>
            `;
        }
    });

    if (!hasAnyProduct) {
        area.innerHTML = `<div class="module-box"><div class="text-center py-5 w-100 text-muted">暂无商品</div></div>`;
    }
    setTimeout(checkSidebarStatus, 100);
}

// 渲染单一大网格 (首页搜索)
function renderSingleGrid(products, title) {
    const area = document.getElementById('products-list-area');
    if (!area) return;
    if (products.length === 0) {
        area.innerHTML = `<div class="module-box"><div class="text-center py-5 w-100">未找到相关商品</div></div>`;
    } else {
        area.innerHTML = `
            <div class="module-box">
                <div class="module-title">${title}</div>
                <div class="taobao-grid">
                    ${products.map(p => getProductCardHtml(p)).join('')}
                </div>
            </div>
        `;
    }
    setTimeout(checkSidebarStatus, 100);
}

function parseTags(tagStr) {
    if (!tagStr) return '';
    const tags = tagStr.split(',').map(t => t.trim()).filter(t => t);
    return tags.map(t => {
        const parts = t.split(/\s+/); 
        let borderColor = 'transparent', bgColor = '#f5f5f5', text = '', textColor = '#333';
        parts.forEach(part => {
            if (part.startsWith('b1')) borderColor = part.split('#')[1] ? '#' + part.split('#')[1] : borderColor;
            else if (part.startsWith('b2')) bgColor = part.split('#')[1] ? '#' + part.split('#')[1] : bgColor;
            else if (part.includes('#')) {
                const txtParts = part.split('#');
                text = txtParts[0];
                textColor = '#' + txtParts[1];
            } else { text = part; }
        });
        if (!text) return '';
        return `<span class="dynamic-tag" style="border-color:${borderColor}; background-color:${bgColor}; color:${textColor}">${text}</span>`;
    }).join('');
}

// 渲染标签云 (首页侧边栏，商品页侧边栏)
function renderTagCloud(products) {
    const tagSet = new Set();
    products.forEach(p => {
        if(p.tags) {
            p.tags.split(',').forEach(tStr => {
                const parts = tStr.trim().split(/\s+/);
                let text = '';
                parts.forEach(part => {
                   if(!part.startsWith('b1') && !part.startsWith('b2')) {
                       text = part.split('#')[0]; 
                   }
                });
                if(text) tagSet.add(text);
            });
        }
    });

    const listEl = document.getElementById('tag-cloud-list');
    if(!listEl) return; // 检查元素是否存在
    if(tagSet.size === 0) {
        listEl.innerHTML = '<div class="text-muted small w-100 text-center">暂无标签</div>';
        return;
    }
    listEl.innerHTML = Array.from(tagSet).map(tag => 
        `<span class="tag-cloud-item" onclick="filterByTag('${tag}')">${tag}</span>`
    ).join('');
}

function filterByTag(tag) {
    // 检查是否在首页
    if (document.getElementById('products-list-area')) {
        document.querySelectorAll('.tag-cloud-item').forEach(el => {
            if(el.innerText === tag) el.classList.add('active');
            else el.classList.remove('active');
        });
        document.querySelectorAll('.cat-pill').forEach(el => el.classList.remove('active')); 
        const filtered = allProducts.filter(p => p.tags && p.tags.includes(tag));
        renderSingleGrid(filtered, `标签: ${tag}`);
    } else {
        // 不在首页，跳转到首页
        window.location.href = `/?tag=${encodeURIComponent(tag)}`;
    }
}

function doSearch(source = 'pc') {
    const inputId = (source === 'mobile') ? 'mobile-search-input' : 'search-input';
    const keyword = document.getElementById(inputId).value.toLowerCase().trim();
    
    // 检查是否在首页
    if (document.getElementById('products-list-area')) {
        if (!keyword) { 
            renderCategorizedView('all'); 
            return; 
        }
        const filtered = allProducts.filter(p => p.name.toLowerCase().includes(keyword) || (p.description && p.description.toLowerCase().includes(keyword)));
        renderSingleGrid(filtered, `"${keyword}" 的搜索结果`);
        if (source === 'mobile') {
            toggleMobileSearch(false); 
        }
    } else {
        // 不在首页，跳转到首页
        window.location.href = `/?search=${encodeURIComponent(keyword)}`;
    }
}

function filterCategory(id, el) {
    document.querySelectorAll('.cat-pill').forEach(e => e.classList.remove('active'));
    if(el) el.classList.add('active');
    document.querySelectorAll('.tag-cloud-item').forEach(e => e.classList.remove('active'));
    renderCategorizedView(id);
}

// 通用面板开关函数
function togglePanel(panelId, overlayId, forceShow = null) {
    const panel = document.getElementById(panelId);
    const overlay = document.getElementById(overlayId);
    if (!panel || !overlay) return;
    let shouldShow = (typeof forceShow === 'boolean') ? forceShow : !panel.classList.contains('show');
    if (shouldShow) {
        panel.classList.add('show');
        overlay.classList.add('show');
    } else {
        panel.classList.remove('show');
        overlay.classList.remove('show');
    }
}

// 移动端搜索 (首页)
function toggleMobileSearch(forceShow = null) {
    const searchDropdown = document.querySelector('.mobile-search-dropdown');
    const searchOverlay = document.getElementById('mobile-search-overlay');
    if (!searchDropdown || !searchOverlay) return;
    let show = (forceShow === null) ? !searchDropdown.classList.contains('show') : forceShow;
    if (show) {
        searchDropdown.classList.add('show');
        searchOverlay.classList.add('show');
    } else {
        searchDropdown.classList.remove('show');
        searchOverlay.classList.remove('show');
    }
}

function filterCategoryMobile(id) {
    const pills = document.querySelectorAll('.cat-pill');
    let targetPill = null;
    let targetOnclick = (id === 'all') ? `filterCategory('all', this)` : `filterCategory(${id}, this)`;
    for (let pill of pills) {
        if (pill.getAttribute('onclick') === targetOnclick) {
            targetPill = pill;
            break;
        }
    }
    filterCategory(id, targetPill); 
    togglePanel('mobile-sidebar', 'mobile-overlay', false); 
}


// --- 3. 商品页 (product.html) 的函数 ---

// 更新PC端元素 (商品页)
function updatePcElements(product, variant, priceStr) {
    const p = product || currentProduct;
    const v = variant || null;
    if (!p) return;

    let priceDisplay;
    if (priceStr) { priceDisplay = priceStr; }
    else if (v) { priceDisplay = v.price; }
    else {
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
            if (variants.some(v => v.wholesale_config)) { wsText = `批发价：请选择规格`; }
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

// 渲染商品页 (商品页)
function renderPage() {
    const p = currentProduct;
    const prices = p.variants.map(v => v.price);
    const minPrice = Math.min(...prices);
    const maxPrice = Math.max(...prices);
    const priceDisplay = (minPrice === maxPrice) ? minPrice : `${minPrice} - ${maxPrice}`;
    
    // 更新移动端元素
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

    // 更新PC端视图
    updatePcElements(p, null);
}

// 渲染额外信息 (商品页)
function renderExtraInfo(selectedV) {
    const infoDiv = document.getElementById('p-extra-info');
    if (!infoDiv) return; // 检查元素
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
        if (variants.some(v => v.wholesale_config)) { wsText = `批发价：请选择规格`; }
    }
    if (wsText) { html += `<span style="padding-top: 2px;vertical-align: middle;">${wsText}</span>`; }
    if (html) {
        infoDiv.innerHTML = html;
        infoDiv.classList.remove('d-none');
    } else {
        infoDiv.classList.add('d-none');
    }
}

// SKU 面板 (商品页)
function openSkuSheet() { 
    if(skuSheet) skuSheet.show(); 
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
            if (currentPageItems.length > 0) specPages.push(currentPageItems);
            currentPageItems = [variant];
            currentPageStartOffset = buttonTop;
        } else {
            currentPageItems.push(variant);
        }
    }
    if (currentPageItems.length > 0) specPages.push(currentPageItems);
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
    container.innerHTML = `
        <ul class="pagination pagination-sm justify-content-center">
            <li class="page-item ${specCurrentPage === 1 ? 'disabled' : ''}">
                <a class="page-link" onclick="changeSpecPage(1)">首页</a>
            </li>
            <li class="page-item ${specCurrentPage === 1 ? 'disabled' : ''}">
                <a class="page-link" onclick="changeSpecPage(${specCurrentPage - 1})">上一页</a>
            </li>
            <li class="page-item disabled">
                <span class="page-link">${specCurrentPage} / ${totalPages}</span>
            </li>
            <li class="page-item ${specCurrentPage === totalPages ? 'disabled' : ''}">
                <a class="page-link" onclick="changeSpecPage(${specCurrentPage + 1})">下一页</a>
            </li>
            <li class="page-item ${specCurrentPage === totalPages ? 'disabled' : ''}">
                <a class="page-link" onclick="changeSpecPage(${totalPages})">尾页</a>
            </li>
        </ul>`;
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

function highlightAndScroll(elementId) {
    const el = (typeof elementId === 'string') ? document.getElementById(elementId) : elementId;
    if (!el) return;
    const skuBody = el.closest('.sku-body');
    if (skuBody) {
        skuBody.scrollTo({ top: el.offsetTop - skuBody.offsetTop - 15, behavior: 'smooth' });
    }
    const input = el.tagName === 'INPUT' ? el : el.querySelector('input');
    if (input) input.focus();
    el.style.transition = 'none';
    el.style.backgroundColor = '#fff5f7';
    setTimeout(() => {
        el.style.transition = 'background-color 0.5s ease';
        el.style.backgroundColor = 'transparent';
        setTimeout(() => el.style.transition = 'none', 500);
    }, 100);
}

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
                randomDesc.innerText = `批发价：${ws.map(w => `${w.qty}起${w.price}元/1个`).join('，')}`;
            } else { randomDesc.innerText = '暂无批发价'; }
        } catch(e) { randomDesc.innerText = '暂无批发价'; }
    } else { randomDesc.innerText = '暂无批发价'; }

    const modeContainer = document.getElementById('buy-mode-container');
    if (selectedVariant.custom_markup > 0 && selectedVariant.auto_delivery === 1) {
        modeContainer.classList.remove('d-none');
        document.getElementById('markup-amount').innerText = selectedVariant.custom_markup;
        document.getElementsByName('buy_mode').forEach(r => r.checked = false);
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
    if (buyMode === 'select') { input.value = 1; return; }
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
    if (!selectedVariant) { alert('请选择规格'); highlightAndScroll('sku-spec-title-container'); return; }
    const modeContainer = document.getElementById('buy-mode-container');
    if (modeContainer.offsetHeight > 0 || modeContainer.offsetWidth > 0) {
        if (!document.querySelector('input[name="buy_mode"]:checked')) {
            alert('请选择购买方式'); highlightAndScroll('buy-mode-container'); return;
        }
        if (buyMode === 'select' && !selectedCardId) {
            alert('请选择号码'); highlightAndScroll('card-selector'); return;
        }
    }
    const quantity = parseInt(document.getElementById('buy-qty').value);
    if (buyMode !== 'select' && selectedVariant.stock < quantity) {
        alert('库存不足'); highlightAndScroll(document.getElementById('buy-qty').closest('.d-flex')); return;
    }
    const contact = document.getElementById('contact-info').value;
    if (!contact) { alert('请填写联系方式'); highlightAndScroll('contact-info-container'); return; }
    const password = document.getElementById('query-password').value;
    if (!password || password.length < 6) { alert('请设置6位以上的查单密码'); highlightAndScroll('query-password-container'); return; }
    const paymentMethod = document.querySelector('input[name="payment"]:checked');
    if (!paymentMethod) { alert('请选择支付方式'); highlightAndScroll('payment-method-container'); return; }

    const btn = document.querySelector('.btn-confirm');
    const oldText = btn.innerText;
    btn.disabled = true; btn.innerText = '正在创建...';
    try {
        const payload = { 
            variant_id: selectedVariant.id, quantity, contact, 
            query_password: password, payment_method: paymentMethod.value
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


// --- 4. 全局初始化 "路由" (检查当前页面并执行相应代码) ---

async function init() {
    
    let config = {};

    // --- 1. COMMON INIT (所有页面都执行) ---
    try {
        // 加载配置 (页头/页脚/公告/联系方式)
        const configRes = await fetch('/api/shop/config');
        config = await configRes.json();
        
        // 设置页脚
        if (document.getElementById('footer-name')) {
            document.getElementById('year').innerText = new Date().getFullYear();
            document.getElementById('footer-name').innerText = config.site_name || 'TB Shop';
        }

        // PC端Logo/名称
        const logoEl = document.getElementById('site-logo');
        const nameWrapEl = document.getElementById('site-name-wrap');
        const nameTextEl = document.getElementById('header-site-name');
        if (nameTextEl) nameTextEl.innerText = config.site_name || 'TB Shop';
        
        // [!! 修复 !!] 移除了对 mobile-header-site-name 的引用
        // 这部分逻辑被移动到了下面的 "首页 (index.html)" 专属块中

        // 公告 (PC侧边栏)
        const notice = config.notice_content || config.announce;
        if (notice && document.getElementById('notice-box')) {
            document.getElementById('notice-box').innerHTML = notice;
        }

        // 联系方式 (PC侧边栏 + 首页移动端面板)
        const contactInfo = config.contact_info;
        const contactModulePC = document.getElementById('contact-module-box');
        const contactContentMobile = document.getElementById('mobile-contact-content');
        if (contactInfo) {
            if (document.getElementById('contact-box')) document.getElementById('contact-box').innerHTML = contactInfo;
            if (contactContentMobile) contactContentMobile.innerHTML = contactInfo;
        } else {
            if(contactModulePC) contactModulePC.style.display = 'none';
            if (contactContentMobile) contactContentMobile.innerHTML = '<p>暂无联系方式</p>';
        }

        // 加载商品 (两个页面都需要)
        const prodRes = await fetch('/api/shop/products');
        allProducts = await prodRes.json(); 

        // 加载文章 (PC侧边栏)
        const artRes = await fetch('/api/shop/articles/list');
        const articles = await artRes.json();
        const hotListEl = document.getElementById('hot-articles-list');
        if (hotListEl) { // 首页的热门教程
            if (articles.length > 0) {
                hotListEl.innerHTML = articles.slice(0, 8).map((a, index) => `
                    <div class="hot-article-item"><a href="/article.html?id=${a.id}" class="text-truncate" style="flex:1">
                        <span class="hot-rank ${index < 3 ? 'top-3' : ''}">${index + 1}</span> ${a.title}
                    </a><small class="text-muted ms-2">${new Date(a.created_at * 1000).toLocaleDateString()}</small></div>
                `).join('');
            }
        }
        const artCats = [...new Set(articles.map(a => a.category_name))].filter(Boolean);
        const artCatListEl = document.getElementById('article-cat-list');
        if (artCatListEl) { // PC侧边栏
            if (artCats.length > 0) {
                artCatListEl.innerHTML = artCats.map(c => `<a href="#">${c}</a>`).join('');
            } else { artCatListEl.innerHTML = '<div class="text-muted small">暂无分类</div>'; }
        }

        // 填充侧边栏 (销量排行, 标签云)
        const topProducts = [...allProducts].sort((a, b) => {
            const salesA = a.variants.reduce((s, v) => s + (v.sales_count||0), 0);
            const salesB = b.variants.reduce((s, v) => s + (v.sales_count||0), 0);
            return salesB - salesA;
        }).slice(0, 5);
        const topListEl = document.getElementById('top-sales-list');
        if (topListEl) {
            if (topProducts.length > 0) {
                topListEl.innerHTML = topProducts.map(p => `
                    <a href="/product.html?id=${p.id}" class="top-item">
                        <img src="${p.image_url || (p.variants[0] && p.variants[0].image_url) || 'https://via.placeholder.com/50'}" class="top-img">
                        <div class="top-info">
                            <div class="top-title">${p.name}</div>
                            <div class="top-price">¥${p.variants[0] ? p.variants[0].price : 0}</div>
                        </div>
                    </a>`).join('');
            } else { topListEl.innerHTML = '<div class="text-muted small text-center">暂无数据</div>'; }
        }
        renderTagCloud(allProducts); // 填充侧边栏标签云

    } catch (e) { console.error("Common init failed:", e); }

    // --- 2. PAGE-SPECIFIC ROUTER (检查当前是哪个页面) ---

    // 如果是 首页 (index.html)
    if (document.getElementById('products-list-area')) {
        try {
            document.title = config.site_name || '商店首页';
            
            // [!! 修复 !!] 移动端Logo/名称的逻辑只在这里运行
            const showName = config.show_site_name === '1';
            const showLogo = config.show_site_logo === '1';
            const logoEl = document.getElementById('site-logo'); // PC
            const nameWrapEl = document.getElementById('site-name-wrap'); // PC
            const mobileLogoEl = document.getElementById('mobile-logo-img');
            const mobileNameWrapEl = document.getElementById('mobile-site-name-wrap');
            const mobileNameTextEl = document.getElementById('mobile-header-site-name');
            
            // 设置 PC Logo
            if (logoEl && nameWrapEl) {
                if (!showName && !showLogo) { nameWrapEl.classList.remove('d-none'); }
                else {
                    if (showLogo && config.site_logo) { logoEl.src = config.site_logo; logoEl.classList.remove('d-none'); }
                    if (showName) { nameWrapEl.classList.remove('d-none'); }
                }
            }
            // 设置 移动端 Logo
            if (mobileNameTextEl) {
                mobileNameTextEl.innerText = config.site_name || 'TB Shop';
                if (!showName && !showLogo) { mobileNameWrapEl.classList.remove('d-none'); }
                else {
                    if (showLogo && config.site_logo) { mobileLogoEl.src = config.site_logo; mobileLogoEl.classList.remove('d-none'); }
                    if (showName) { mobileNameWrapEl.classList.remove('d-none'); }
                }
            }

            // 加载分类 (仅首页需要)
            const catRes = await fetch('/api/shop/categories');
            allCategories = await catRes.json(); 
            const catContainer = document.getElementById('category-container');
            const mobileCatContainer = document.getElementById('mobile-category-list');
            let pc_html = '<div class="cat-pill active" onclick="filterCategory(\'all\', this)">全部商品</div>';
            let mobile_html = '<a href="#" onclick="filterCategoryMobile(\'all\')">全部商品</a>';
            allCategories.forEach(c => {
                pc_html += `<div class="cat-pill" onclick="filterCategory(${c.id}, this)">${c.image_url ? `<img src="${c.image_url}" alt="${c.name}">` : ''}${c.name}</div>`;
                mobile_html += `<a href="#" onclick="filterCategoryMobile(${c.id})">${c.image_url ? `<img src="${c.image_url}" alt="${c.name}">` : ''}${c.name}</a>`;
            });
            catContainer.innerHTML = pc_html;
            mobileCatContainer.innerHTML = mobile_html;

            // 渲染首页商品网格
            renderCategorizedView('all');

            // 移动端公告重排
            if (window.innerWidth < 992) {
                const noticeModule = document.getElementById('notice-module-box');
                const mainContent = document.querySelector('.col-lg-9');
                if (noticeModule && mainContent) { mainContent.prepend(noticeModule); noticeModule.classList.remove('d-none'); }
            }

            // 绑定首页特有的事件
            window.addEventListener('load', checkSidebarStatus);
            window.addEventListener('resize', checkSidebarStatus);
            setTimeout(checkSidebarStatus, 500);

            document.getElementById('mobile-menu-btn').addEventListener('click', () => togglePanel('mobile-sidebar', 'mobile-overlay'));
            document.getElementById('mobile-overlay').addEventListener('click', () => togglePanel('mobile-sidebar', 'mobile-overlay', false));
            document.getElementById('mobile-sidebar-close-btn').addEventListener('click', () => togglePanel('mobile-sidebar', 'mobile-overlay', false));
            document.getElementById('mobile-search-btn').addEventListener('click', () => toggleMobileSearch());
            document.getElementById('mobile-search-overlay').addEventListener('click', () => toggleMobileSearch(false));
            document.getElementById('mobile-contact-close-btn').addEventListener('click', () => togglePanel('mobile-contact-sheet', 'mobile-contact-overlay', false));
            document.getElementById('mobile-contact-overlay').addEventListener('click', () => togglePanel('mobile-contact-sheet', 'mobile-contact-overlay', false));
            
            window.addEventListener('scroll', () => {
                if (document.querySelector('.mobile-search-dropdown').classList.contains('show')) toggleMobileSearch(false);
                if (document.getElementById('mobile-contact-sheet').classList.contains('show')) togglePanel('mobile-contact-sheet', 'mobile-contact-overlay', false);
            }, { passive: true });

        } catch(e) { console.error("Homepage init failed:", e); }
    }
    
    // 如果是 商品页 (product.html)
    if (document.getElementById('skuSheet')) {
        try {
            // [!! 修复 !!] PC Logo的逻辑也需要在这里运行
            const showName = config.show_site_name === '1';
            const showLogo = config.show_site_logo === '1';
            const logoEl = document.getElementById('site-logo'); // PC
            const nameWrapEl = document.getElementById('site-name-wrap'); // PC
            if (logoEl && nameWrapEl) {
                if (!showName && !showLogo) { nameWrapEl.classList.remove('d-none'); }
                else {
                    if (showLogo && config.site_logo) { logoEl.src = config.site_logo; logoEl.classList.remove('d-none'); }
                    if (showName) { nameWrapEl.classList.remove('d-none'); }
                }
            }

            // 初始化 SKU 面板
            const skuSheetEl = document.getElementById('skuSheet');
            skuSheet = new bootstrap.Offcanvas(skuSheetEl);
            skuSheetEl.addEventListener('show.bs.offcanvas', () => {
                if (!hasCalculatedPages && currentProduct) {
                    calculateSpecPages();
                    hasCalculatedPages = true;
                }
            });
            
            // 查找当前商品
            const urlParams = new URLSearchParams(window.location.search);
            const id = urlParams.get('id');
            if(!id) return alert('未指定商品');
            
            currentProduct = allProducts.find(p => p.id == id);
            if (!currentProduct) return alert('商品不存在或已下架');
            
            // 渲染商品页
            renderPage();
            
            // 激活商品页的PC侧边栏粘性滚动
            if (window.innerWidth > 991.98) {
                productSidebar = new StickySidebar('#sidebar-wrapper', {
                    topSpacing: 20,
                    bottomSpacing: 20,
                    containerSelector: '#main-content-row-pc',
                    innerWrapperSelector: '.sidebar-inner'
                });
            }

        } catch(e) {
            console.error("Product page init failed:", e);
            alert('加载失败');
        }
    }
    
    // --- 3. COMMON EVENT BINDERS (所有页面) ---
    // PC 搜索框
    const searchInput = document.getElementById('search-input');
    if (searchInput) {
        searchInput.addEventListener('keypress', function (e) {
            if (e.key === 'Enter') doSearch('pc');
        });
    }
    // 移动端 搜索框 (首页)
    const mobileSearchInput = document.getElementById('mobile-search-input');
    if (mobileSearchInput) {
        mobileSearchInput.addEventListener('keypress', function (e) {
            if (e.key === 'Enter') doSearch('mobile');
        });
    }
}

// --- 5. 启动APP ---
document.addEventListener('DOMContentLoaded', init);
