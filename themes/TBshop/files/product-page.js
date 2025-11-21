// =============================================
// === themes/TBshop/files/product-page.js
// === (商品详情页专属逻辑 - 最终修正版)
// =============================================

// 全局变量
let currentProduct = null;   // 当前商品数据
let currentVariant = null;   // 当前选中的 SKU (初始为 null)
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

    // 1. [修改] 默认不选中任何规格
    let selectedIdx = -1; 
    currentVariant = null;

    // 2. [修改] 计算价格区间和总库存
    let minPrice = Infinity, maxPrice = -Infinity;
    let totalStock = 0;
    
    if (p.variants && p.variants.length > 0) {
        p.variants.forEach(v => {
            let val = parseFloat(v.price);
            if (val < minPrice) minPrice = val;
            if (val > maxPrice) maxPrice = val;
            totalStock += (v.stock || 0);
        });
    } else {
        minPrice = 0; maxPrice = 0;
    }
    
    // 生成初始价格显示文本 (如: 10.00-20.00)
    let initialPriceText = (minPrice === Infinity) ? '0.00' : 
                           (minPrice === maxPrice) ? minPrice.toFixed(2) : 
                           `${minPrice.toFixed(2)}-${maxPrice.toFixed(2)}`;

    // 3. 构建 HTML 结构
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
                                    <span class="fs-1 fw-bold" id="p-display-price" style="line-height: 1;">${initialPriceText}</span>
                                </div>

                                <div class="text-muted small d-flex flex-column align-items-end" style="font-size: 13px;">
                                    <div class="mb-1">
                                        <span>库存: <span id="p-stock">${totalStock}</span></span>
                                        <span class="mx-2">|</span>
                                        <span>销量: ${p.variants ? p.variants.reduce((a,b)=>a+(b.sales_count||0), 0) : 0}</span>
                                    </div>
                                </div>
                            </div>

                            <div id="dynamic-info-display" style="display:none; margin-top:8px; padding-top:8px; border-top:1px dashed #ddd;">
                                </div>
                        </div>

                        <div class="sku-section mb-4">
                            <div class="mb-2 text-secondary small">选择规格 <span class="fw-normal text-muted" style="font-size: 0.9em;">(共${p.variants ? p.variants.length : 0}个)</span>：</div>
                            <div class="sku-list d-flex flex-wrap" id="sku-btn-list">
                                ${renderSkuButtons(p.variants, selectedIdx)}
                            </div>
                            <div id="spec-pagination-area" class="spec-pagination-container"></div>
                        </div>

                        <div class="mb-3 d-flex align-items-center flex-wrap">
                            <span class="text-secondary small me-3 text-nowrap">购买方式：</span>
                            <div class="d-flex align-items-center flex-wrap" id="buy-method-container">
                                <span class="text-muted small">请先选择规格</span>
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
    
    // 初始化分页
    setTimeout(() => {
         if (typeof initSpecPagination === 'function') {
             initSpecPagination('#sku-btn-list', '.sku-btn', 6);
         }
    }, 100);
}

// =============================================
// === 交互逻辑 (修改版)
// =============================================

/**
 * [修改] 切换规格逻辑 (支持取消选中)
 */
function selectSku(index, btn) {
    if (!currentProduct) return;
    
    const clickedVariant = currentProduct.variants[index];

    // [关键逻辑] 检查是否点击了当前已选中的规格
    if (currentVariant && currentVariant === clickedVariant) {
        // === 执行取消选中逻辑 ===
        currentVariant = null;
        buyMethod = null; // 重置购买方式
        
        // 1. 移除所有按钮激活状态
        document.querySelectorAll('.sku-btn').forEach(b => {
            b.classList.remove('btn-danger', 'active');
            b.classList.add('btn-outline-secondary');
        });

        // 2. 恢复价格显示为区间
        updateRealTimePrice(); 
        
        // 3. 恢复总库存显示
        let totalStock = currentProduct.variants.reduce((acc, v) => acc + (v.stock||0), 0);
        document.getElementById('p-stock').innerText = totalStock;
        
        // 4. 恢复商品主图
        document.getElementById('p-main-img').src = currentProduct.image_url;
        
        // 5. 重置购买方式区域
        document.getElementById('buy-method-container').innerHTML = '<span class="text-muted small">请先选择规格</span>';
        document.getElementById('dynamic-info-display').style.display = 'none';
        
        return; // 结束函数
    }

    // === 执行选中逻辑 ===
    
    // 1. 更新按钮样式
    document.querySelectorAll('.sku-btn').forEach(b => {
        b.classList.remove('btn-danger');
        b.classList.add('btn-outline-secondary');
        b.classList.remove('active');
    });
    btn.classList.remove('btn-outline-secondary');
    btn.classList.add('btn-danger');

    // 2. 更新数据
    currentVariant = clickedVariant;
    buyMethod = null; // 切换规格时重置购买方式，等待用户重新选择

    // 3. 更新价格显示
    updateRealTimePrice(); 

    // 4. 更新库存和图片
    document.getElementById('p-stock').innerText = clickedVariant.stock;
    if (clickedVariant.image_url) document.getElementById('p-main-img').src = clickedVariant.image_url;

    // 5. 刷新购买方式按钮
    updateBuyMethodButtons();
    updateDynamicInfoDisplay();
}

function updateRealTimePrice() {
    const priceEl = document.getElementById('p-display-price');
    if (!priceEl) return;

    // [修改] 情况0: 未选择规格 -> 显示价格区间
    if (!currentVariant) {
        if (!currentProduct || !currentProduct.variants) return;
        let minP = Infinity, maxP = -Infinity;
        currentProduct.variants.forEach(v => {
            let val = parseFloat(v.price);
            if (val < minP) minP = val;
            if (val > maxP) maxP = val;
        });
        // 显示区间
        if (minP === Infinity) {
            priceEl.innerText = '0.00';
        } else if (minP === maxP) {
            priceEl.innerText = minP.toFixed(2);
        } else {
            priceEl.innerText = `${minP.toFixed(2)}-${maxP.toFixed(2)}`;
        }
        return;
    }

    // 情况1: 已选择规格
    let finalPrice = parseFloat(currentVariant.price);
    let displayHTML = finalPrice.toFixed(2); // 默认显示

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
        // 只有当有加价时才显示公式
        if (markup > 0) {
            const basePrice = finalPrice - markup;
            
            // [修改] 去除内部的 ￥ 符号
            // 格式: 10.00 + 2.00 = 12.00
            displayHTML = `<span style="font-size:0.5em; color:#666; vertical-align: middle;">${basePrice.toFixed(2)} + ${markup.toFixed(2)} = </span>${finalPrice.toFixed(2)}`;
        }
    }

    // 更新页面显示
    priceEl.innerHTML = displayHTML;
}

function renderSkuButtons(variants, selectedIdx) {
    if (!variants || variants.length === 0) return '<span class="text-muted">默认规格</span>';
    
    return variants.map((v, index) => {
        const isOOS = v.stock <= 0;
        // 如果 selectedIdx 为 -1，则没有任何按钮是 active
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

// === 辅助函数 (保持不变或微调) ===

function parseWholesaleInfo(config) {
    if (!config) return null;
    let rules = [];
    let data = config;
    if (typeof data === 'string') {
        data = data.trim();
        if (data.startsWith('[') || data.startsWith('{')) {
            try { data = JSON.parse(data); } catch (e) { return data; }
        }
    }
    // ... (复用之前的解析逻辑，此处为简化展示，实际上该函数内容与之前一致)
    // 确保这里有完整的 parseWholesaleInfo 实现，此处为了篇幅省略部分通用逻辑
    // 建议保留您原文件中的 parseWholesaleInfo 内容
    if (typeof data === 'string') {
         data.replace(/，/g, ',').split(',').forEach(item => {
            const [n, p] = item.split('=');
            if (n && p) rules.push(`${n}个起${p}元/1个`);
        });
        return rules.length ? rules.join('，') : data;
    }
    if (typeof data === 'object' && data !== null) {
        if (Array.isArray(data)) {
            data.forEach(item => {
                const n = item.num||item.count||item.n;
                const p = item.price||item.amount||item.p;
                if (n!==undefined && p!==undefined) rules.push(`${n}个起${p}元/1个`);
            });
        } else {
            Object.entries(data).forEach(([k,v]) => { if(!isNaN(k)) rules.push(`${k}个起${v}元/1个`); });
        }
    }
    return rules.length > 0 ? rules.join('，') : (typeof data === 'object' ? JSON.stringify(data) : String(data));
}

function updateBuyMethodButtons() {
    const container = document.getElementById('buy-method-container');
    // [修改] 如果没有选中规格，显示提示
    if (!container || !currentVariant) {
        if(container) container.innerHTML = '<span class="text-muted small">请先选择规格</span>';
        return;
    }

    const markup = parseFloat(currentVariant.custom_markup || 0);
    const showSelect = markup > 0;
    let label = currentVariant.selection_label;
    if (!label || label.trim() === '') label = '自选卡密/号码';

    if (buyMethod === 'select' && !showSelect) {
        buyMethod = null;
        updateDynamicInfoDisplay(); 
    }

    let html = '';
    const randomClass = buyMethod === 'random' ? 'btn-danger' : 'btn-outline-secondary';
    html += `
        <button class="btn btn-sm ${randomClass} me-2 mb-1 method-btn" 
            data-type="random" onclick="selectBuyMethod('random', this)">
            默认随机
        </button>
    `;

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

function selectBuyMethod(type, btn) {
    if (buyMethod === type) {
        buyMethod = null; 
    } else {
        buyMethod = type;
    }
    updateBuyMethodButtons(); 
    updateDynamicInfoDisplay(); 
    updateRealTimePrice(); // 更新价格显示
}

function updateDynamicInfoDisplay() {
    const displayDiv = document.getElementById('dynamic-info-display');
    if (!displayDiv) return;

    if (buyMethod === null || !currentVariant) {
        displayDiv.style.display = 'none';
        return;
    }
    displayDiv.style.display = 'block';

    if (buyMethod === 'random') {
        const promoText = parseWholesaleInfo(currentVariant.wholesale_config);
        if (promoText && promoText !== '[]' && promoText !== '{}') {
            displayDiv.innerHTML = `<span style="color:#dc3545; font-size:13px; font-weight:500;"><i class="fa fa-tag me-1"></i>批发优惠: ${promoText}</span>`;
        } else {
            displayDiv.innerHTML = `<span style="color:#999; font-size:13px;"><i class="fa fa-info-circle me-1"></i> 暂无批发优惠</span>`;
        }
    } else if (buyMethod === 'select') {
        let label = currentVariant.selection_label || '自选卡密/号码';
        const markup = parseFloat(currentVariant.custom_markup || 0).toFixed(2);
        displayDiv.innerHTML = `<span style="color:#dc3545; font-size:13px; font-weight:500;"><i class="fa fa-check-circle me-1"></i>${label} (加价 ${markup}元)</span>`;
    }
}

function renderProductTags(tags) {
    if (!tags) return '';
    let tagList = [];
    if (typeof tags === 'string') tagList = tags.split(',').filter(t => t.trim() !== '');
    else if (Array.isArray(tags)) tagList = tags;
    
    return tagList.map(tagStr => {
        let text = tagStr.trim();
        if (!text) return '';
        // 简化样式解析逻辑
        let borderColor='#dc3545', bgColor='#dc3545', textColor='#ffffff';
        const b1=text.match(/b1#([0-9a-fA-F]+)/); if(b1){borderColor='#'+b1[1]; text=text.replace(b1[0],'').trim();}
        const b2=text.match(/b2#([0-9a-fA-F]+)/); if(b2){bgColor='#'+b2[1]; text=text.replace(b2[0],'').trim();}
        const c=text.match(/#([0-9a-fA-F]+)$/); if(c){textColor='#'+c[1]; text=text.replace(c[0],'').trim();}
        return `<span class="dynamic-tag" style="display: inline-block; margin-right: 6px; margin-bottom: 4px; padding: 1px 5px; border: 1px solid ${borderColor}; background-color: ${bgColor}; color: ${textColor}; border-radius: 3px; font-size: 11px;">${text}</span>`;
    }).join('');
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
    if (!currentVariant) { alert('请先选择规格'); return; }
    if (currentVariant.stock <= 0) { alert('该规格缺货'); return; }
    if (buyMethod === null) { alert('请选择购买方式'); return; }

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
    setTimeout(() => { btn.innerHTML = originalText; btn.classList.remove('btn-success'); }, 1500);
}

function buyNow() {
    if (!currentVariant) { alert('请先选择规格'); return; }
    if (buyMethod === null) { alert('请选择购买方式'); return; }
    addToCart();
    setTimeout(() => { window.location.href = '/cart.html'; }, 200);
}

function loadSidebarRecommendations() {
    fetch('/api/shop/products').then(r=>r.json()).then(d=>{
        if(typeof renderSidebarTopSales === 'function') renderSidebarTopSales(d);
        if(typeof checkSidebarStatus === 'function') checkSidebarStatus();
    }).catch(console.warn);
}

function selectPayment(type, el) {
    paymentMethod = type;
    document.querySelectorAll('.payment-option').forEach(opt => opt.classList.remove('active'));
    el.classList.add('active');
}

function showError(msg) {
    const container = document.getElementById('product-loading');
    if (container) container.innerHTML = `<div class="text-danger py-5"><i class="fa fa-exclamation-triangle"></i> ${msg}</div>`;
}

function parseWholesaleDataForCalc(config) {
    let rules = [];
    if (!config) return rules;
    let data = config;
    if (typeof data === 'string') {
        try { 
            if (data.startsWith('[') || data.startsWith('{')) data = JSON.parse(data); 
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
             const c = item.count||item.num||item.n;
             const p = item.price||item.p;
             if(c && p) rules.push({ count: parseInt(c), price: parseFloat(p) });
         });
    } else if (typeof data === 'object') {
        Object.entries(data).forEach(([k,v]) => rules.push({ count: parseInt(k), price: parseFloat(v) }));
    }
    return rules.sort((a,b) => b.count - a.count);
}

function initSpecPagination(containerSelector, itemSelector, rowsPerPage = 6) {
    // 保持原有的分页逻辑，此处省略具体代码以节省篇幅，
    // 请确保文件中包含原有的 initSpecPagination 函数实现
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
