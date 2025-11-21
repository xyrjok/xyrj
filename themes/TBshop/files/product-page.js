// =============================================
// === themes/TBshop/files/product-page.js
// === (商品详情页专属逻辑 - 自选逻辑深度优化版)
// =============================================

// 全局变量
let currentProduct = null;   // 当前商品数据
let currentVariant = null;   // 当前选中的 SKU
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

    // 1. 初始化: 默认不选中任何规格
    let selectedIdx = -1; 
    currentVariant = null; 

    // 2. 计算初始显示数据 (价格区间、总库存、默认图)
    let priceDisplay = '0.00';
    let totalStock = 0;
    let defaultImg = p.image_url;

    if (p.variants && p.variants.length > 0) {
        // 计算价格区间
        const prices = p.variants.map(v => parseFloat(v.price));
        const min = Math.min(...prices).toFixed(2);
        const max = Math.max(...prices).toFixed(2);
        priceDisplay = min === max ? min : `${min}-${max}`;
        
        // 计算总库存
        totalStock = p.variants.reduce((acc, v) => acc + v.stock, 0);
        
        // 如果主图不存在，用第一个规格图做备选
        if (!defaultImg) defaultImg = p.variants[0].image_url;
    }

    // 3. 构建 HTML 结构
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
                                    <span class="fs-1 fw-bold" id="p-display-price" style="line-height: 1;">${priceDisplay}</span>
                                </div>

                                <div class="text-muted small d-flex flex-column align-items-end" style="font-size: 13px;">
                                    <div class="mb-1">
                                        <span>库存: <span id="p-stock">${totalStock}</span></span>
                                        <span class="mx-2">|</span>
                                        <span>销量: ${p.variants.reduce((a,b)=>a+(b.sales_count||0), 0)}</span>
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
    
    // 初始状态：buyMethod buttons 已经在 HTML 中设置为提示文案
    // 不需要调用 updateBuyMethodButtons，或者调用一下确认状态
    updateBuyMethodButtons(); 
    
    setTimeout(() => {
         if (typeof initSpecPagination === 'function') {
             initSpecPagination('#sku-btn-list', '.sku-btn', 6);
         }
    }, 100);
}

// =============================================
// === 交互逻辑 (核心修改)
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
            try {
                data = JSON.parse(data);
            } catch (e) {
                data.replace(/，/g, ',').split(',').forEach(item => {
                    const [n, p] = item.split('=');
                    if (n && p) rules.push(`${n}个起${p}元/1个`);
                });
                return rules.length ? rules.join('，') : data;
            }
        } else {
            data.replace(/，/g, ',').split(',').forEach(item => {
                const [n, p] = item.split('=');
                if (n && p) rules.push(`${n}个起${p}元/1个`);
            });
            return rules.length ? rules.join('，') : data;
        }
    }

    if (typeof data === 'object' && data !== null) {
        if (Array.isArray(data)) {
            data.forEach(item => {
                const n = item.num || item.number || item.count || item.quantity || item.n || item.key;
                const p = item.price || item.money || item.amount || item.value || item.p || item.val;
                if (n !== undefined && p !== undefined) {
                    rules.push(`${n}个起${p}元/1个`);
                } else {
                    const vals = Object.values(item);
                    if (vals.length >= 2) rules.push(`${vals[0]}个起${vals[1]}元/1个`);
                }
            });
        } else {
            Object.entries(data).forEach(([k, v]) => {
                if (!isNaN(k)) rules.push(`${k}个起${v}元/1个`);
            });
        }
    }
    
    if (rules.length > 0) return rules.join('，');
    return typeof data === 'object' ? JSON.stringify(data) : String(data);
}

/**
 * [核心逻辑] 更新购买方式按钮
 */
function updateBuyMethodButtons() {
    const container = document.getElementById('buy-method-container');
    if (!container) return;

    // 如果没有选择规格，显示提示
    if (!currentVariant) {
        container.innerHTML = '<span class="text-muted small">请先选择规格</span>';
        return;
    }

    // 获取加价数值，默认为 0
    const markup = parseFloat(currentVariant.custom_markup || 0);
    
    // [关键判断] 是否显示自选按钮：仅当加价 > 0 时显示
    const showSelect = markup > 0;

    let label = currentVariant.selection_label;
    if (!label || label.trim() === '') {
        label = '自选卡密/号码';
    } else {
        label = label.trim();
    }

    // 如果当前选了 'select' 但现在不满足显示条件，重置选择
    if (buyMethod === 'select' && !showSelect) {
        buyMethod = null;
        updateDynamicInfoDisplay(); 
    }

    let html = '';

    // 按钮1：默认随机
    const randomClass = buyMethod === 'random' ? 'btn-danger' : 'btn-outline-secondary';
    html += `
        <button class="btn btn-sm ${randomClass} me-2 mb-1 method-btn" 
            data-type="random" onclick="selectBuyMethod('random', this)">
            默认随机
        </button>
    `;

    // 按钮2：自选 (条件显示)
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
    if (buyMethod === type) {
        buyMethod = null; // 取消选中
    } else {
        buyMethod = type;
    }
    updateBuyMethodButtons(); 
    updateDynamicInfoDisplay(); 
    updateRealTimePrice();
}

/**
 * [核心] 更新价格下方的动态信息栏
 */
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
            displayDiv.innerHTML = `
                <span style="color:#dc3545; font-size:13px; font-weight:500;">
                    <i class="fa fa-tag me-1"></i>
                    批发优惠: ${promoText}
                </span>
            `;
        } else {
            displayDiv.innerHTML = `
                <span style="color:#999; font-size:13px;">
                    <i class="fa fa-info-circle me-1"></i> 暂无批发优惠
                </span>
            `;
        }
    } 
    else if (buyMethod === 'select') {
        let label = currentVariant.selection_label;
        if (!label || label.trim() === '') label = '自选卡密/号码';
        else label = label.trim();

        const markup = parseFloat(currentVariant.custom_markup || 0).toFixed(2);
        
        displayDiv.innerHTML = `
            <span style="color:#dc3545; font-size:13px; font-weight:500;">
                <i class="fa fa-check-circle me-1"></i>
                ${label} (加价 ${markup}元)
            </span>
        `;
    }
}

function selectSku(index, btn) {
    if (!currentProduct) return;
    
    // === 取消选择逻辑 ===
    // 如果点击的是当前已激活的按钮，则取消选择
    if (btn.classList.contains('btn-danger')) {
        // 1. 样式重置
        btn.classList.remove('btn-danger');
        btn.classList.add('btn-outline-secondary');
        
        // 2. 状态重置
        currentVariant = null;
        buyMethod = null;

        // 3. 更新 UI 为默认状态
        updateRealTimePrice(); // 将显示价格区间
        updateBuyMethodButtons(); // 将显示"请选择规格"
        updateDynamicInfoDisplay();

        // 4. 恢复总库存显示
        const totalStock = currentProduct.variants.reduce((a,b)=>a+b.stock, 0);
        document.getElementById('p-stock').innerText = totalStock;

        // 5. 恢复默认图
        if (currentProduct.image_url) {
            document.getElementById('p-main-img').src = currentProduct.image_url;
        } else if (currentProduct.variants && currentProduct.variants.length > 0) {
            // 如果没有主图，尝试用第一张图作为回退
            document.getElementById('p-main-img').src = currentProduct.variants[0].image_url;
        }
        
        return;
    }
    
    // === 正常选择逻辑 ===
    document.querySelectorAll('.sku-btn').forEach(b => {
        b.classList.remove('btn-danger');
        b.classList.add('btn-outline-secondary');
        b.classList.remove('active');
    });
    btn.classList.remove('btn-outline-secondary');
    btn.classList.add('btn-danger');

    const variant = currentProduct.variants[index];
    currentVariant = variant;
    
    // 实时计算价格
    updateRealTimePrice(); 

    document.getElementById('p-stock').innerText = variant.stock;
    if (variant.image_url) document.getElementById('p-main-img').src = variant.image_url;

    // 切换规格时刷新
    updateBuyMethodButtons();
    updateDynamicInfoDisplay();
}

// --- 辅助函数 ---

function renderSkuButtons(variants, selectedIdx) {
    if (!variants || variants.length === 0) return '<span class="text-muted">默认规格</span>';
    
    return variants.map((v, index) => {
        const isOOS = v.stock <= 0;
        // 如果 selectedIdx 为 -1，则都不选中
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
    
    // 如果选中了规格，则检查库存限制
    if (currentVariant && newQty > currentVariant.stock) {
        alert('库存不足');
        newQty = currentVariant.stock;
    }
    // 如果没选规格，虽然不限制点击，但加入购物车时会拦截

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
    setTimeout(() => {
        btn.innerHTML = originalText;
        btn.classList.remove('btn-success');
    }, 1500);
}

function buyNow() {
    if (!currentVariant) { alert('请先选择规格'); return; }
    if (buyMethod === null) { alert('请选择购买方式'); return; }
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


// =============================================
// === 新增功能：实时价格计算与批发逻辑
// =============================================

function updateRealTimePrice() {
    const priceEl = document.getElementById('p-display-price');
    if (!priceEl) return;

    // 情况 0: 未选择规格 -> 显示价格区间 (min-max)
    if (!currentVariant) {
         if (currentProduct && currentProduct.variants && currentProduct.variants.length > 0) {
            const prices = currentProduct.variants.map(v => parseFloat(v.price));
            const min = Math.min(...prices).toFixed(2);
            const max = Math.max(...prices).toFixed(2);
            priceEl.innerText = min === max ? min : `${min}-${max}`;
        } else {
            priceEl.innerText = '0.00';
        }
        return;
    }

    // 基础价格（默认为当前规格的价格）
    let finalPrice = parseFloat(currentVariant.price);
    let displayHTML = finalPrice.toFixed(2); // 默认显示

    // 情况 A: 默认随机 -> 检查批发价
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
    
    // 情况 B: 自选规格 -> 显示加价公式
    else if (buyMethod === 'select') {
        const markup = parseFloat(currentVariant.custom_markup || 0);
        
        if (markup > 0) {
            // 公式：售价 + 加价 = 最终价
            // 假设 currentVariant.price 是最终价 (通常后端逻辑如此)
            // 则 售价 = 最终价 - 加价
            const basePrice = finalPrice - markup;
            
            // 显示格式: 10.00 + 2.00 = 12.00 (不带￥)
            // 使用小字体显示公式部分
            displayHTML = `<span style="font-size:0.5em; color:#666; vertical-align: middle;">${basePrice.toFixed(2)} + ${markup.toFixed(2)} = </span>${finalPrice.toFixed(2)}`;
        }
    }

    // 更新页面显示
    priceEl.innerHTML = displayHTML;
}

// 辅助函数：解析批发数据为数组 [{count:10, price:5}, ...]
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
             const c = item.count || item.num || item.number || item.quantity || item.n;
             const p = item.price || item.amount || item.money || item.p;
             if(c && p) rules.push({ count: parseInt(c), price: parseFloat(p) });
         });
    } else if (typeof data === 'object') {
        Object.entries(data).forEach(([k,v]) => {
             rules.push({ count: parseInt(k), price: parseFloat(v) });
        });
    }
    
    return rules.sort((a,b) => b.count - a.count);
}
