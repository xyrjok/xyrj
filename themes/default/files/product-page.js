// 全局变量
let currentProduct = null;
let currentVariant = null;
let buyMethod = null; // 'random' | 'select' | null
let quantity = 1;
let paymentMethod = 'alipay_f2f'; // 默认
let selectedSpecificCardId = null;
let selectedSpecificCardInfo = '';

$(document).ready(function() {
    loadProductDetail();

    // 加载全局配置并渲染页头页尾
    $.ajax({
        url: '/api/shop/config',
        method: 'GET',
        success: function(config) {
            const siteName = (config && config.site_name) || '我的商店';
            const siteLogo = (config && config.site_logo) || '';
            const showName = (config && config.show_site_name);

            if (typeof renderHeader === 'function') renderHeader(siteName, siteLogo, showName);
            if (typeof renderFooter === 'function') renderFooter(siteName);
            
            if (document.title === '商品详情加载中...') document.title = siteName;
        },
        error: function() {
            if (typeof renderHeader === 'function') renderHeader();
            if (typeof renderFooter === 'function') renderFooter();
        }
    });
});

// 获取 URL 参数
function getQueryParam(name) {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get(name);
}

// 加载商品详情
function loadProductDetail() {
    const id = getQueryParam('id');
    if (!id) {
        alert('未指定商品ID');
        window.location.href = '/';
        return;
    }

    // 显示加载状态
    $('#detail-left-content').html('<div class="p-5 text-center text-muted">正在加载商品说明...</div>');
    $('#detail-right-content').html('<div class="p-5 text-center text-muted">加载信息...</div>');

    $.ajax({
        url: `/api/shop/product?id=${id}`,
        method: 'GET',
        success: function(res) {
            if (!res || res.error) {
                const msg = res.error || '商品不存在或已下架';
                alert(msg);
                window.location.href = '/';
                return;
            }
            currentProduct = res;
            renderProductPage(res);
        },
        error: function() {
            alert('网络错误，无法加载商品');
            window.location.href = '/';
        }
    });
}

// 渲染页面
function renderProductPage(product) {
    // 1. 渲染左侧：仅描述
    const descContent = product.description && product.description.trim() !== '' 
        ? product.description 
        : '<p class="text-muted text-center py-5">暂无详细说明</p>';

    $('#detail-left-content').html(`<div class="product-description-content">${descContent}</div>`);

    // 2. 渲染右侧：完整交互区域
    renderRightSidebar(product);
    
    // 3. 回显缓存的联系方式
    const cachedContact = localStorage.getItem('userContact');
    const cachedPass = localStorage.getItem('userPassword');
    if (cachedContact) $('#contact').val(cachedContact);
    if (cachedPass) $('#query_password').val(cachedPass);
}

// 渲染右侧区域
function renderRightSidebar(product) {
    const tagsHtml = renderTagsLocal(product.tags);
    const imgUrl = product.image_url || '/assets/noimage.jpg';

    // 计算价格范围
    let priceDisplay = '0.00';
    if (product.variants && product.variants.length > 0) {
        const prices = product.variants.map(v => parseFloat(v.price));
        const minPrice = Math.min(...prices);
        const maxPrice = Math.max(...prices);
        priceDisplay = minPrice !== maxPrice ? `${minPrice.toFixed(2)}-${maxPrice.toFixed(2)}` : minPrice.toFixed(2);
    }

    // 规格按钮 HTML
    let variantsHtml = '';
    if (product.variants && product.variants.length > 0) {
        variantsHtml = `<div class="mb-2"><div class="fw-bold mb-1 small text-secondary">选择规格 (共${product.variants.length}个)</div><div class="d-flex flex-wrap">`;
        product.variants.forEach((v, index) => {
            const isOOS = v.stock <= 0;
            const btnClass = isOOS ? 'disabled text-muted' : 'variant-btn';
            variantsHtml += `<button class="${btnClass}" onclick="${isOOS ? '' : `selectSku(${index})`}" ${isOOS ? 'disabled' : ''}>${v.name}</button>`;
        });
        variantsHtml += `</div></div>`;
    }

    const rightHtml = `
    <div class="img-aspect-ratio-box">
        <img src="${imgUrl}" id="main-product-img" class="detail-product-img" alt="${product.name}">
    </div>
    
    <h1 class="product-page-title">${product.name}</h1>
    <div class="mb-3">${tagsHtml}</div>
    
    <div class="bg-light p-3 rounded mb-3">
        <div class="d-flex align-items-baseline text-danger mb-1">
            <span class="fw-bold me-1">¥</span>
            <span class="detail-price-lg" id="price-display" style="line-height:1;">${priceDisplay}</span>
        </div>
        <div id="dynamic-info-display" class="small text-muted border-top border-dashed pt-2 mt-2">
            请选择规格和购买方式
        </div>
    </div>

    ${variantsHtml}

    <div class="mb-2">
        <div class="fw-bold mb-1 small text-secondary">购买方式</div>
        <div class="d-flex flex-wrap" id="buy-method-container">
            <span class="text-muted small py-1">请先选择规格</span>
        </div>
    </div>

    <div class="mb-3">
        <div class="fw-bold mb-1 small text-secondary">数量</div>
        <div class="input-group input-group-sm" style="width: 120px;">
            <button class="btn btn-outline-secondary" type="button" onclick="changeQty(-1)">-</button>
            <input type="text" class="form-control text-center" id="buy-qty" value="1" readonly>
            <button class="btn btn-outline-secondary" type="button" onclick="changeQty(1)">+</button>
        </div>
    </div>

    <div class="mb-3">
        <div class="fw-bold mb-1 small text-secondary">信息</div>
        <div class="d-flex">
            <input type="text" class="form-control form-control-sm me-2" id="contact" placeholder="联系方式 (Email/QQ)">
            <input type="text" class="form-control form-control-sm" id="query_password" placeholder="查单密码">
        </div>
    </div>

    <div class="mb-4">
        <div class="fw-bold mb-1 small text-secondary">支付方式</div>
        <div class="d-flex flex-wrap">
            <div class="payment-option active" onclick="selectPayment('alipay_f2f', this)">
                <i class="fab fa-alipay" style="color:#1678ff;"></i> 支付宝
                <div class="payment-check-mark"><i class="fa fa-check"></i></div>
            </div>
            <div class="payment-option" onclick="selectPayment('wxpay', this)">
                <i class="fab fa-weixin" style="color:#09bb07;"></i> 微信
                <div class="payment-check-mark"><i class="fa fa-check"></i></div>
            </div>
            <div class="payment-option" onclick="selectPayment('usdt', this)">
                <span class="fw-bold text-success" style="font-size:12px;">USDT</span>
                <div class="payment-check-mark"><i class="fa fa-check"></i></div>
            </div>
        </div>
    </div>

    <div class="d-flex">
        <button class="btn btn-outline-warning fw-bold flex-grow-1 me-2" onclick="addToCart()">
            <i class="fas fa-cart-plus"></i> 加入购物车
        </button>
        <button class="btn btn-danger fw-bold flex-grow-1" onclick="createOrder()">
            立即购买
        </button>
    </div>
    `;
    
    $('#detail-right-content').html(rightHtml);
}

// 切换规格
window.selectSku = function(index) {
    if (!currentProduct) return;
    
    // 切换状态
    if (currentVariant && currentVariant === currentProduct.variants[index]) {
        // 取消选中
        currentVariant = null;
        buyMethod = null;
        selectedSpecificCardId = null;
        $('.variant-btn').removeClass('active');
        $('#main-product-img').attr('src', currentProduct.image_url || '/assets/noimage.jpg');
        
        // 重置价格为范围
        const prices = currentProduct.variants.map(v => parseFloat(v.price));
        const minPrice = Math.min(...prices);
        const maxPrice = Math.max(...prices);
        $('#price-display').text(minPrice !== maxPrice ? `${minPrice.toFixed(2)}-${maxPrice.toFixed(2)}` : minPrice.toFixed(2));
    } else {
        // 选中
        currentVariant = currentProduct.variants[index];
        $('.variant-btn').removeClass('active');
        $('.variant-btn').eq(index).addClass('active');
        
        const img = currentVariant.image_url || currentProduct.image_url || '/assets/noimage.jpg';
        $('#main-product-img').attr('src', img);
        
        // 重置购买方式
        buyMethod = null;
        selectedSpecificCardId = null;
    }

    updateBuyMethodButtons();
    updateDynamicInfoDisplay();
    updateRealTimePrice();
};

function updateBuyMethodButtons() {
    const container = $('#buy-method-container');
    if (!currentVariant) {
        container.html('<span class="text-muted small py-1">请先选择规格</span>');
        return;
    }

    const markup = parseFloat(currentVariant.custom_markup || 0);
    const showSelect = markup > 0;
    
    let html = '';
    const randomClass = (buyMethod === 'random') ? 'btn btn-sm btn-danger me-2' : 'btn btn-sm btn-outline-secondary me-2';
    html += `<button class="${randomClass} method-btn" onclick="selectBuyMethod('random')">默认随机</button>`;
    
    if (showSelect) {
        const selectClass = (buyMethod === 'select') ? 'btn btn-sm btn-danger' : 'btn btn-sm btn-outline-secondary';
        const label = currentVariant.selection_label || '自选号码';
        html += `<button class="${selectClass} method-btn" onclick="selectBuyMethod('select')">${label} (+${markup.toFixed(2)}元)</button>`;
    }
    
    container.html(html);
}

window.selectBuyMethod = function(type) {
    if (buyMethod === type) {
        buyMethod = null;
        closeNumberSelector();
    } else {
        buyMethod = type;
        if (type === 'select') {
            openNumberSelector();
        } else {
            selectedSpecificCardId = null;
            selectedSpecificCardInfo = '';
            closeNumberSelector();
        }
    }
    updateBuyMethodButtons();
    updateDynamicInfoDisplay();
    updateRealTimePrice();
};

window.selectPayment = function(type, el) {
    paymentMethod = type;
    $('.payment-option').removeClass('active');
    $(el).addClass('active');
};

window.changeQty = function(delta) {
    let val = parseInt($('#buy-qty').val()) || 1;
    val += delta;
    if (val < 1) val = 1;
    
    // 库存/自选限制
    if (buyMethod === 'select') {
        val = 1; // 自选限购1
    } else if (currentVariant) {
        if (currentVariant.stock !== 0 && val > currentVariant.stock) {
            val = currentVariant.stock;
        }
    }
    quantity = val;
    $('#buy-qty').val(val);
    updateRealTimePrice();
};

function updateRealTimePrice() {
    if (!currentVariant) return;

    let price = parseFloat(currentVariant.price);
    
    if (buyMethod === 'select') {
        price += parseFloat(currentVariant.custom_markup || 0);
        $('#buy-qty').val(1); // 强制数量为1
    } else if (buyMethod === 'random') {
        // 批发价逻辑简化
        const rules = parseWholesale(currentVariant.wholesale_config);
        const rule = rules.find(r => quantity >= r.count);
        if (rule) price = rule.price;
    }

    $('#price-display').text(price.toFixed(2));
}

function updateDynamicInfoDisplay() {
    const el = $('#dynamic-info-display');
    if (!currentVariant) {
        el.html('请选择规格和购买方式');
        return;
    }
    if (!buyMethod) {
        el.html('请选择购买方式');
        return;
    }
    
    let text = (buyMethod === 'random') ? '默认随机发货' : '自选号码/卡密';
    if (buyMethod === 'select' && selectedSpecificCardInfo) {
        text += `：${selectedSpecificCardInfo}`;
    }
    // 批发提示
    if (buyMethod === 'random') {
        const rules = parseWholesale(currentVariant.wholesale_config);
        if (rules.length > 0) {
            const ruleText = rules.map(r => `${r.count}个起${r.price}元`).join('，');
            text += ` <span class="text-danger ms-2">(批发: ${ruleText})</span>`;
        }
    }

    el.html(text);
}

// === 自选号码弹窗逻辑 ===
window.openNumberSelector = function() {
    const modal = $('#number-selector-modal');
    if (!currentVariant) return;
    
    modal.show();
    // 简单定位
    const btn = $('#buy-method-container button[onclick="selectBuyMethod(\'select\')"]');
    if (btn.length) {
        // PC端定位，移动端由CSS控制固定底部
        if ($(window).width() >= 992) {
            modal.css({
                top: btn.offset().top + btn.outerHeight() + 5,
                left: btn.offset().left,
                width: '300px',
                position: 'absolute'
            });
        } else {
            modal.css({ top: 'auto', left: 0, width: '100%', position: 'fixed' });
        }
    }

    $('#ns-list-container').html('<div class="text-center p-3"><i class="fa fa-spinner fa-spin"></i> 加载中...</div>');
    
    $.ajax({
        url: `/api/shop/cards/notes?variant_id=${currentVariant.id}`,
        success: function(data) {
            if (Array.isArray(data) && data.length > 0) {
                let html = '';
                data.forEach(item => {
                    const active = (item.id === selectedSpecificCardId) ? 'selected' : '';
                    html += `<div class="ns-item ${active}" onclick="pickNumber(${item.id}, '${item.note}')">${item.note}</div>`;
                });
                $('#ns-list-container').html(html);
            } else {
                $('#ns-list-container').html('<div class="text-center p-3 text-muted">暂无可自选号码</div>');
            }
        },
        error: function() {
            $('#ns-list-container').html('<div class="text-center p-3 text-danger">加载失败</div>');
        }
    });
};

window.closeNumberSelector = function() {
    $('#number-selector-modal').hide();
};

window.pickNumber = function(id, note) {
    selectedSpecificCardId = id;
    selectedSpecificCardInfo = note;
    updateDynamicInfoDisplay();
    updateRealTimePrice();
    closeNumberSelector();
};


// === 下单逻辑 ===
window.createOrder = function() {
    if (!currentVariant) return alert('请选择规格');
    if (!buyMethod) return alert('请选择购买方式');
    if (buyMethod === 'select' && !selectedSpecificCardId) {
        alert('请选择一个号码');
        openNumberSelector();
        return;
    }

    const contact = $('#contact').val().trim();
    const pwd = $('#query_password').val().trim();
    if (!contact) return alert('请输入联系方式');
    if (!pwd) return alert('请设置查单密码');

    // 缓存
    localStorage.setItem('userContact', contact);
    localStorage.setItem('userPassword', pwd);

    const btn = $('button[onclick="createOrder()"]');
    const oldText = btn.html();
    btn.prop('disabled', true).html('<i class="fa fa-spinner fa-spin"></i> 下单中...');

    $.ajax({
        url: '/api/shop/order/create',
        method: 'POST',
        contentType: 'application/json',
        data: JSON.stringify({
            variant_id: currentVariant.id,
            quantity: quantity,
            contact: contact,
            query_password: pwd,
            payment_method: paymentMethod,
            card_id: (buyMethod === 'select') ? selectedSpecificCardId : null
        }),
        success: function(res) {
            if (res.error) {
                if (res.error.includes('未支付')) {
                    if(confirm(res.error + '\n是否前往查单？')) window.location.href = '/orders';
                } else {
                    alert(res.error);
                }
                btn.prop('disabled', false).html(oldText);
            } else {
                // 跳转支付
                window.location.href = `/themes/default/pay.html?order_id=${res.order_id}&method=${paymentMethod}`; // 假设 default 也有 pay.html 或者通用
                // 如果 default 没有 pay.html，可以直接跳到 orders
                // window.location.href = 'orders';
            }
        },
        error: function() {
            alert('请求失败');
            btn.prop('disabled', false).html(oldText);
        }
    });
};

// 加入购物车 (简化版)
window.addToCart = function() {
    if (!currentVariant) return alert('请选择规格');
    if (!buyMethod) return alert('请选择购买方式');
    if (buyMethod === 'select' && !selectedSpecificCardId) return alert('请选择号码'), openNumberSelector();

    let cart = JSON.parse(localStorage.getItem('tbShopCart') || '[]');
    cart.push({
        product_id: currentProduct.id,
        variant_id: currentVariant.id,
        name: currentProduct.name,
        variant_name: currentVariant.name,
        price: $('#price-display').text(),
        quantity: quantity,
        buyMode: buyMethod,
        selectedCardId: selectedSpecificCardId,
        selectedCardInfo: selectedSpecificCardInfo
    });
    localStorage.setItem('tbShopCart', JSON.stringify(cart));
    
    const btn = $('button[onclick="addToCart()"]');
    btn.html('<i class="fa fa-check"></i> 已加入').addClass('btn-success');
    setTimeout(() => btn.html('<i class="fas fa-cart-plus"></i> 加入购物车').removeClass('btn-success'), 1500);
};

// 辅助：标签渲染
function renderTagsLocal(tags) {
    if (!tags) return '';
    const tagsArr = tags.split(/[,，]+/).filter(t => t && t.trim());
    return tagsArr.map(t => {
        let bc='#dc3545', bg='#dc3545', tc='#fff', txt=t;
        if(t.includes('b1#')) bc='#'+t.match(/b1#([0-9a-fA-F]+)/)[1];
        if(t.includes('b2#')) bg='#'+t.match(/b2#([0-9a-fA-F]+)/)[1];
        if(t.includes('#') && !t.includes('b1') && !t.includes('b2')) tc='#'+t.split('#')[1];
        txt = txt.replace(/b[12]#[0-9a-fA-F]+/g, '').replace(/#[0-9a-fA-F]+$/, '').trim();
        return `<span class="badge-tag me-1" style="background:${bg};border-color:${bc};color:${tc}">${txt}</span>`;
    }).join('');
}

// 辅助：解析批发配置
function parseWholesale(config) {
    let rules = [];
    if (!config) return rules;
    try {
        if (typeof config === 'string') {
            if (config.startsWith('[')) JSON.parse(config).forEach(i => rules.push({count:i.num||i.n||i.qty, price:i.price||i.p}));
        } else if (Array.isArray(config)) {
            config.forEach(i => rules.push({count:i.num||i.n||i.qty, price:i.price||i.p}));
        }
    } catch(e) {}
    return rules.sort((a,b) => b.count - a.count);
}
