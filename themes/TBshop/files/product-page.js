// =============================================
// === themes/TBshop/files/product-page.js
// === (商品详情页 - 增加卡密自选滑出面板版)
// =============================================

// 全局变量
let currentProduct = null;   // 当前商品数据
let currentVariant = null;   // 当前选中的 SKU
let quantity = 1;            // 购买数量
let buyMethod = null;        // 购买方式: null | 'random' | 'select'
let paymentMethod = 'alipay'; 
let selectedCardInfo = null; // [新增] 当前选中的具体卡密信息

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
    selectedCardInfo = null;

    // 计算价格范围和库存
    let priceDisplay = '0.00';
    let totalStock = 0;
    if (p.variants && p.variants.length > 0) {
        const prices = p.variants.map(v => parseFloat(v.price));
        const min = Math.min(...prices);
        const max = Math.max(...prices);
        priceDisplay = min === max ? min.toFixed(2) : `${min.toFixed(2)}-${max.toFixed(2)}`;
        totalStock = p.variants.reduce((acc, v) => acc + (v.stock || 0), 0);
    }

    const defaultImg = (p.variants && p.variants[0] && p.variants[0].image_url) ? p.variants[0].image_url : p.image_url;

    // 2. 构建 HTML
    // 注意：为 col-md-7 添加 position-relative 以支持面板绝对定位
    const html = `
        <style>
            /* [新增] 自选卡密面板样式 */
            #card-selector-panel {
                position: absolute;
                bottom: 100px; /* 初始位置在购买方式上方 */
                left: 15px;
                right: 15px;
                background: #fff;
                border: 1px solid #e0e0e0;
                border-radius: 8px;
                box-shadow: 0 -4px 20px rgba(0,0,0,0.1);
                z-index: 10;
                max-height: 0;
                opacity: 0;
                overflow: hidden;
                transition: all 0.4s cubic-bezier(0.25, 0.8, 0.25, 1);
                display: flex;
                flex-direction: column;
            }
            #card-selector-panel.active {
                max-height: 400px; /* 面板最大高度 */
                opacity: 1;
                bottom: 150px; /* 向上滑出的终点位置，需根据实际布局微调 */
                padding: 15px;
            }
            .card-item-btn {
                text-align: left;
                margin-bottom: 8px;
                font-size: 13px;
                white-space: normal;
                border: 1px solid #eee;
                transition: all 0.2s;
            }
            .card-item-btn:hover {
                border-color: #dc3545;
                background-color: #fff5f5;
            }
            .card-item-btn.active {
                border-color: #dc3545;
                background-color: #dc3545;
                color: #fff;
            }
            /* 让右侧详情栏相对定位 */
            .product-detail-col { position: relative; }
        </style>

        <div class="module-box product-showcase">
            <div class="row g-0">
                <div class="col-md-5">
                    <div class="p-3">
                        <div class="main-img-wrap border rounded mb-2" style="position:relative; padding-bottom:100%; overflow:hidden;">
                            <img id="p-main-img" src="${defaultImg}" class="position-absolute w-100 h-100" style="object-fit:contain; top:0; left:0;">
                        </div>
                    </div>
                </div>

                <div class="col-md-7 product-detail-col">
                    <div class="p-3" style="height: 100%; display: flex; flex-direction: column;">
                        <h5 class="fw-bold mb-2" id="product-title" style="line-height:1.4;">${p.name}</h5>
                        
                        <div class="tb-tags-row mb-3">
                            ${renderProductTags(p.tags)}
                        </div>

                        <div class="price-bar bg-light p-3 rounded mb-3">
                            <div class="d-flex justify-content-between align-items-start">
                                <div class="d-flex align-items-baseline text-danger">
                                    <span class="fw-bold me-1" style="font-size: 18px;">¥</span>
                                    <span class="fs-1 fw-bold" id="p-display-price" style="line-height: 1;">${priceDisplay}</span>
                                </div>
                                <div class="text-muted small d-flex flex-column align-items-end">
                                    <div class="mb-1">
                                        <span>库存: <span id="p-stock">${totalStock}</span></span>
                                        <span class="mx-2">|</span>
                                        <span>销量: ${p.variants.reduce((a,b)=>a+(b.sales_count||0), 0)}</span>
                                    </div>
                                </div>
                            </div>
                            <div id="dynamic-info-display" style="display:none; margin-top:8px; padding-top:8px; border-top:1px dashed #ddd;"></div>
                        </div>

                        <div class="sku-section mb-4">
                            <div class="mb-2 text-secondary small">选择规格 <span class="fw-normal text-muted" style="font-size: 0.9em;">(共${p.variants ? p.variants.length : 0}个)</span>：</div>
                            <div class="sku-list d-flex flex-wrap" id="sku-btn-list">
                                ${renderSkuButtons(p.variants, -1)}
                            </div>
                        </div>

                        <div id="card-selector-panel">
                            <div class="d-flex justify-content-between align-items-center mb-2 pb-2 border-bottom">
                                <span class="fw-bold small">请选择预设信息</span>
                                <button type="button" class="btn-close btn-sm" onclick="closeCardPanel()" aria-label="Close"></button>
                            </div>
                            <div id="card-list-content" style="overflow-y: auto; flex-grow: 1;">
                                <div class="text-center text-muted small py-3">请先选择规格</div>
                            </div>
                        </div>

                        <div class="mb-3 d-flex align-items-center flex-wrap mt-auto" style="position: relative; z-index: 11; background: #fff;">
                            <span class="text-secondary small me-3 text-nowrap">购买方式：</span>
                            <div class="d-flex align-items-center flex-wrap" id="buy-method-container">
                                ${renderBuyMethodButtons_Preview(p)}
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
                                </div>
                                <div class="payment-option" onclick="selectPayment('wxpay', this)">
                                    <i class="fab fa-weixin" style="color:#09bb07;"></i>
                                </div>
                                <div class="payment-option" onclick="selectPayment('usdt', this)">
                                    <span style="font-size:12px; font-weight:bold; color:#26a17b;">USDT</span>
                                </div>
                            </div>
                        </div>

                        <div class="action-btns d-flex gap-2 mt-2">
                            <button class="btn btn-warning flex-grow-1 text-white fw-bold py-2" onclick="addToCart()"><i class="fa fa-cart-plus"></i> 加入购物车</button>
                            <button class="btn btn-danger flex-grow-1 fw-bold py-2" onclick="buyNow()">立即购买</button>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <div class="module-box mt-3">
            <div class="border-bottom pb-2 mb-3"><span class="fw-bold border-bottom border-3 border-danger pb-2 px-1">商品详情</span></div>
            <div class="product-desc p-2">${p.description || '暂无详细介绍'}</div>
        </div>
    `;

    container.innerHTML = html;
    if(loading) loading.style.display = 'none';
    container.style.display = 'block';
    
    // 初始化动态定位：设置面板滑出的终点位置（商品标题下方）
    setTimeout(() => {
        const titleEl = document.getElementById('product-title');
        const panelEl = document.getElementById('card-selector-panel');
        const buyMethodEl = document.getElementById('buy-method-container').parentElement;
        
        if(titleEl && panelEl && buyMethodEl) {
            // 动态计算 top 和 bottom，使其滑出时正好覆盖中间区域
            // 这里简单通过 CSS bottom 控制，如果需要精确到标题下方，可以动态设置 height
            // 下面的代码会在点击“自选”时动态调整面板高度
        }
    }, 200);

    updateRealTimePrice();
}

// =============================================
// === 交互逻辑
// =============================================

// 渲染购买方式按钮（预览用）
function renderBuyMethodButtons_Preview(p) {
    // 即使未选规格，也显示按钮，点击时提示
    // 检查是否有任意规格支持自选
    let hasSelectable = false;
    if (p.variants) {
        hasSelectable = p.variants.some(v => parseFloat(v.custom_markup||0) > 0);
    }

    let html = `
        <button class="btn btn-sm btn-outline-secondary me-2 mb-1 method-btn" 
            onclick="selectBuyMethod('random', this)">默认随机</button>
    `;
    if (hasSelectable) {
        html += `
            <button class="btn btn-sm btn-outline-secondary mb-1 method-btn" 
                onclick="selectBuyMethod('select', this)">自选号码/卡密</button>
        `;
    }
    return html;
}

// 核心：切换购买方式
function selectBuyMethod(type, btn) {
    if (!currentVariant) {
        alert('请先选择商品规格');
        return;
    }

    // 切换选中状态
    const isSame = (buyMethod === type);
    buyMethod = isSame ? null : type;

    // 重置具体选中的卡密
    selectedCardInfo = null; 

    // UI 更新
    renderBuyButtonsState();
    
    const panel = document.getElementById('card-selector-panel');

    if (buyMethod === 'select') {
        // 1. [需求] 自选 -> 面板向上滑出
        // 渲染可选卡密列表
        renderCardListInPanel();
        
        // 计算滑动高度：从购买方式上方滑到标题下方
        const titleEl = document.getElementById('product-title');
        const methodEl = btn.closest('.d-flex.align-items-center'); // 购买方式容器
        
        if (titleEl && methodEl) {
            // 简单的视觉处理：让面板铺满中间区域
            // 通过添加 active 类触发 CSS 动画
            panel.classList.add('active');
            // 可以动态设置 bottom 距离使其看起来像滑上去
            // CSS 中 bottom: 100px -> 150px 或者使用 top 计算
        }
    } else {
        // 2. 随机或取消 -> 面板收起
        panel.classList.remove('active');
    }

    updateRealTimePrice();
}

// 渲染按钮选中态
function renderBuyButtonsState() {
    const container = document.getElementById('buy-method-container');
    if (!currentVariant) return;

    const markup = parseFloat(currentVariant.custom_markup || 0);
    const showSelect = markup > 0;
    let label = currentVariant.selection_label || '自选号码/卡密';

    let html = '';
    const randomClass = buyMethod === 'random' ? 'btn-danger' : 'btn-outline-secondary';
    html += `<button class="btn btn-sm ${randomClass} me-2 mb-1" onclick="selectBuyMethod('random', this)">默认随机</button>`;

    if (showSelect) {
        const selectClass = buyMethod === 'select' ? 'btn-danger' : 'btn-outline-secondary';
        html += `<button class="btn btn-sm ${selectClass} mb-1" onclick="selectBuyMethod('select', this)">${label} (加价${markup.toFixed(2)}元)</button>`;
    }
    container.innerHTML = html;
}

// [新增] 渲染面板中的卡密列表
function renderCardListInPanel() {
    const listContainer = document.getElementById('card-list-content');
    if (!listContainer || !currentVariant) return;

    // 获取该规格下的卡密数据
    // 假设数据在 currentProduct.cards 或 currentVariant.cards 中
    // 这里需要根据您实际的数据结构调整。
    // 如果 API 返回的 product 对象里直接包含 cards 列表，我们需要筛选属于当前 variant_id 的
    let availableCards = [];
    
    if (currentProduct.cards) {
        // 筛选：属于当前规格 + 未售出 (status=0 或 'unsold')
        availableCards = currentProduct.cards.filter(c => 
            (c.variant_id == currentVariant.id) && (c.status === 0 || c.status === 'unsold')
        );
    } else if (currentVariant.cards) {
        availableCards = currentVariant.cards.filter(c => c.status === 0 || c.status === 'unsold');
    }

    if (availableCards.length === 0) {
        listContainer.innerHTML = '<div class="text-center text-muted py-3">暂无可选库存</div>';
        return;
    }

    // 生成列表 HTML
    let html = '<div class="d-flex flex-column">';
    availableCards.forEach(card => {
        // 获取预设显示信息：优先取 info, summary, description, 或者截取 content
        const displayInfo = card.info || card.summary || card.description || (card.content ? card.content.substring(0, 20) + '...' : '卡密');
        
        html += `
            <button class="btn card-item-btn ${selectedCardInfo && selectedCardInfo.id === card.id ? 'active' : ''}" 
                onclick="selectSpecificCard('${card.id}', '${displayInfo.replace(/'/g, "\\'")}')">
                ${displayInfo}
            </button>
        `;
    });
    html += '</div>';
    listContainer.innerHTML = html;
}

// [新增] 选择具体卡密
function selectSpecificCard(cardId, infoText) {
    // 记录选中
    selectedCardInfo = { id: cardId, text: infoText };
    
    // 更新列表选中态
    const btns = document.querySelectorAll('.card-item-btn');
    btns.forEach(b => b.classList.remove('active'));
    event.target.classList.add('active');

    // 更新价格下方的显示
    updateRealTimePrice();
}

// 关闭面板
function closeCardPanel() {
    const panel = document.getElementById('card-selector-panel');
    if(panel) panel.classList.remove('active');
    buyMethod = null;
    selectedCardInfo = null;
    renderBuyButtonsState();
    updateRealTimePrice();
}

// 规格选择
function selectSku(index, btn) {
    if (!currentProduct) return;
    const variant = currentProduct.variants[index];

    if (currentVariant && currentVariant.id === variant.id) {
        // 取消选中
        currentVariant = null;
        buyMethod = null;
        selectedCardInfo = null;
        closeCardPanel();
        
        document.querySelectorAll('.sku-btn').forEach(b => {
            b.classList.remove('btn-danger');
            b.classList.add('btn-outline-secondary');
        });
        updateRealTimePrice();
        // 恢复库存显示
        const total = currentProduct.variants.reduce((a,b)=>a+(b.stock||0),0);
        document.getElementById('p-stock').innerText = total;
        return;
    }

    // 选中新规格
    currentVariant = variant;
    buyMethod = null; // 重置购买方式
    selectedCardInfo = null;
    closeCardPanel(); // 切换规格时关闭面板

    document.querySelectorAll('.sku-btn').forEach(b => {
        b.classList.remove('btn-danger');
        b.classList.add('btn-outline-secondary');
        b.classList.remove('active');
    });
    btn.classList.remove('btn-outline-secondary');
    btn.classList.add('btn-danger');

    document.getElementById('p-stock').innerText = variant.stock;
    if (variant.image_url) document.getElementById('p-main-img').src = variant.image_url;

    renderBuyButtonsState();
    updateRealTimePrice();
}

// 实时价格与信息显示 (核心修改点)
function updateRealTimePrice() {
    const priceEl = document.getElementById('p-display-price');
    const infoEl = document.getElementById('dynamic-info-display');
    
    // 1. 未选规格：显示区间
    if (!currentVariant) {
        infoEl.style.display = 'none';
        if (currentProduct && currentProduct.variants) {
            const prices = currentProduct.variants.map(v => parseFloat(v.price));
            const min = Math.min(...prices);
            const max = Math.max(...prices);
            priceEl.innerHTML = min === max ? min.toFixed(2) : `${min.toFixed(2)}-${max.toFixed(2)}`;
        }
        return;
    }

    // 2. 已选规格：基础计算
    let finalPrice = parseFloat(currentVariant.price);
    let displayHTML = finalPrice.toFixed(2);
    let infoHTML = '';

    // 3. 根据购买方式分支
    if (buyMethod === 'random') {
        // [需求] 默认随机 -> 显示批发优惠 + 已选规格 (无预设信息)
        const rules = parseWholesaleData(currentVariant.wholesale_config);
        let wholesaleText = '';
        
        // 计算批发价
        if (rules.length > 0) {
            const rule = rules.find(r => quantity >= r.count);
            if (rule) {
                finalPrice = parseFloat(rule.price);
                displayHTML = finalPrice.toFixed(2);
            }
            // 生成批发文案 "5个起0.03元/1个..."
            wholesaleText = rules.map(r => `${r.count}个起${r.price}元/1个`).join('，');
        }

        // 信息栏：批发优惠 + 规格
        infoHTML = `
            <span style="color:#dc3545; font-size:13px;">
                ${wholesaleText ? `<i class="fa fa-tag"></i> 批发优惠: ${wholesaleText}` : ''}
            </span>
            <div style="margin-top:4px; color:#666; font-size:13px;">
                已选：${currentVariant.name || currentVariant.specs}
            </div>
        `;

    } else if (buyMethod === 'select') {
        // [需求] 自选 -> 价格显示公式，信息栏显示 预设信息
        const markup = parseFloat(currentVariant.custom_markup || 0);
        const totalPrice = finalPrice + markup;

        // 价格公式：售价 + 加价 = 最终价 (不带￥符号，仅最前面有)
        displayHTML = `<span style="font-size:0.5em; color:#666; vertical-align: middle;">${finalPrice.toFixed(2)} + ${markup.toFixed(2)} = </span>${totalPrice.toFixed(2)}`;

        // 信息栏：自选标签 + 规格 + 预设信息
        let label = currentVariant.selection_label || '自选';
        let cardInfoText = selectedCardInfo ? selectedCardInfo.text : '请选择下方卡密';
        
        infoHTML = `
            <span style="color:#dc3545; font-size:13px;">
                <i class="fa fa-check-circle"></i> ${label} (加价${markup.toFixed(2)}元)
            </span>
            <div style="margin-top:4px; color:#666; font-size:13px;">
                已选：${currentVariant.name || currentVariant.specs} 
                ${selectedCardInfo ? `<span class="text-dark fw-bold ms-1">+ ${cardInfoText}</span>` : ''}
            </div>
        `;
    } else {
        // 未选购买方式：仅显示规格
        infoHTML = `<div style="color:#666; font-size:13px;">已选：${currentVariant.name || currentVariant.specs}</div>`;
    }

    priceEl.innerHTML = displayHTML;
    infoEl.style.display = 'block';
    infoEl.innerHTML = infoHTML;
}

// 辅助工具
function renderSkuButtons(variants, selectedIdx) {
    if (!variants || variants.length === 0) return '';
    return variants.map((v, index) => {
        const isOOS = v.stock <= 0;
        const isSelected = index === selectedIdx; 
        let btnClass = isSelected ? 'btn-danger' : 'btn-outline-secondary';
        if (isOOS) btnClass += ' no-stock';
        return `<button class="btn btn-sm ${btnClass} me-2 mb-2 sku-btn" onclick="${isOOS?'':`selectSku(${index}, this)`}" ${isOOS?'disabled':''}>${v.name||v.specs||'规格'+(index+1)}</button>`;
    }).join('');
}
function renderProductTags(tags) {
    if (!tags) return '';
    const list = Array.isArray(tags) ? tags : tags.split(',');
    return list.map(t => `<span class="badge bg-danger me-1">${t}</span>`).join('');
}
function changeQty(d) {
    quantity = Math.max(1, quantity + d);
    document.getElementById('buy-qty').value = quantity;
    updateRealTimePrice();
}
function selectPayment(t, e) {
    paymentMethod = t;
    document.querySelectorAll('.payment-option').forEach(el => el.classList.remove('active'));
    e.classList.add('active');
}
function parseWholesaleData(config) {
    // 简化的解析逻辑
    if(!config) return [];
    let rules = [];
    try {
        let data = (typeof config === 'string' && (config.startsWith('{')||config.startsWith('['))) ? JSON.parse(config) : config;
        if(typeof data === 'string') {
            data.split(/[,，]/).forEach(s => {
                const [k,v] = s.split('=');
                if(k&&v) rules.push({count:parseInt(k), price:parseFloat(v)});
            });
        } else if(Array.isArray(data)) {
            data.forEach(i => rules.push({count:parseInt(i.count||i.num), price:parseFloat(i.price)}));
        }
    } catch(e){}
    return rules.sort((a,b)=>b.count-a.count);
}

// 购物车与购买逻辑保持不变 (addToCart, buyNow) ...
function addToCart() { /* ...原逻辑... */ }
function buyNow() { /* ...原逻辑... */ }
