/**
 * themes/default/files/product-page.js
 * 商品详情页专属逻辑
 */

let currentProduct = null;
let currentVariant = null;

$(document).ready(function() {
    loadProductDetail();

    // === 新增：加载全局配置并渲染页头页尾 ===
    $.ajax({
        url: '/api/shop/config',
        method: 'GET',
        success: function(config) {
            // 获取配置或使用默认值
            const siteName = (config && config.site_name) || '我的商店';
            const siteLogo = (config && config.site_logo) || '';
            const showName = (config && config.show_site_name);

            // 执行渲染 (函数来自 header.js 和 footer.js)
            if (typeof renderHeader === 'function') renderHeader(siteName, siteLogo, showName);
            if (typeof renderFooter === 'function') renderFooter(siteName);
            
            // 可选：更新网页标题
            if (document.title === '商品详情加载中...') document.title = siteName;
        },
        error: function() {
            // 如果接口失败，强制渲染默认页头页尾
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
    // 1. 渲染左侧：标题 + 标签 + 描述
    const tagsHtml = renderTagsLocal(product.tags); // 复用下方的标签渲染函数
    
    // 如果描述为空，显示默认提示
    const descContent = product.description && product.description.trim() !== '' 
        ? product.description 
        : '<p class="text-muted">暂无详细说明</p>';

    const leftHtml = `
        <h1 class="product-page-title">${product.name}</h1>
        <div class="mb-3">${tagsHtml}</div>
        <hr class="text-muted opacity-25">
        <div class="product-description-content">
            ${descContent}
        </div>
    `;
    $('#detail-left-content').html(leftHtml);

    // 2. 渲染右侧：图片 + 价格 + 参数 + 购买表单
    renderRightSidebar(product);
}

// 渲染右侧侧边栏 (购买区)
function renderRightSidebar(product) {
    // 默认选中第一个有效规格
    let defaultVariant = product.variants[0];
    if (product.variants && product.variants.length > 0) {
        // 优先选中有库存的
        const inStock = product.variants.find(v => (v.auto_delivery == 1 || v.stock > 0));
        if (inStock) defaultVariant = inStock;
    }
    
    currentVariant = defaultVariant;
    
    // 图片优先使用规格图，没有则用主图
    const displayImg = (currentVariant && currentVariant.image_url) ? currentVariant.image_url : (product.image_url || '/assets/noimage.jpg');

    // 规格按钮 HTML
    let variantsHtml = '';
    if (product.variants && product.variants.length > 0) {
        variantsHtml = `<div class="mb-3"><div class="fw-bold mb-2 small text-muted">选择规格</div><div class="d-flex flex-wrap">`;
        product.variants.forEach((v, index) => {
            const activeClass = (v.id === currentVariant.id) ? 'active' : '';
            variantsHtml += `<button class="variant-btn ${activeClass}" onclick="switchVariant(${index})">${v.name}</button>`;
        });
        variantsHtml += `</div></div>`;
    }

    const rightHtml = `
    <div class="img-aspect-ratio-box">
        <img src="${displayImg}" id="main-product-img" class="detail-product-img" alt="${product.name}">
    </div>
        <div class="mb-2">
            <span class="detail-price-lg" id="price-display">¥ ${parseFloat(currentVariant.price).toFixed(2)}</span>
        </div>

        ${variantsHtml}
        
        <div class="d-flex justify-content-between align-items-center mb-3 small text-muted bg-light p-2 rounded">
            <span id="delivery-type-badge">
                ${renderDeliveryType(currentVariant)}
            </span>
            <span id="stock-display">库存: ${getVariantStock(currentVariant)}</span>
        </div>

        <div class="purchase-form">
            <div class="mb-3">
                <label class="form-label small fw-bold">联系方式 (Email/QQ)</label>
                <input type="text" class="form-control" id="contact" placeholder="用于接收卡密/查询订单">
            </div>
            
            <div class="mb-3">
                <label class="form-label small fw-bold">查单密码</label>
                <input type="text" class="form-control" id="query_password" placeholder="设置一个密码，用于查询订单">
            </div>

            <div class="mb-4">
                <label class="form-label small fw-bold">购买数量</label>
                <div class="input-group" style="width: 140px;">
                    <button class="btn btn-outline-secondary" type="button" onclick="changeQty(-1)">-</button>
                    <input type="text" class="form-control text-center" id="buy-qty" value="1" readonly>
                    <button class="btn btn-outline-secondary" type="button" onclick="changeQty(1)">+</button>
                </div>
            </div>

            <button class="btn btn-primary w-100 py-2 fw-bold shadow-sm" onclick="createOrder()">
                <i class="fas fa-shopping-cart me-2"></i>立即购买
            </button>
        </div>
    `;
    
    $('#detail-right-content').html(rightHtml);
}

// 切换规格
window.switchVariant = function(index) {
    if (!currentProduct || !currentProduct.variants[index]) return;
    
    currentVariant = currentProduct.variants[index];
    
    // 更新 UI 状态
    $('.variant-btn').removeClass('active');
    $('.variant-btn').eq(index).addClass('active');
    
    // 更新图片
    const img = currentVariant.image_url || currentProduct.image_url || '/assets/noimage.jpg';
    $('#main-product-img').attr('src', img);
    
    // 更新价格
    $('#price-display').text(`¥ ${parseFloat(currentVariant.price).toFixed(2)}`);
    
    // 更新库存和发货方式
    $('#stock-display').text(`库存: ${getVariantStock(currentVariant)}`);
    $('#delivery-type-badge').html(renderDeliveryType(currentVariant));
    
    // 重置数量
    $('#buy-qty').val(1);
};

// 更改数量
window.changeQty = function(delta) {
    let val = parseInt($('#buy-qty').val()) || 1;
    val += delta;
    if (val < 1) val = 1;
    
    // 检查库存限制 (仅针对非自动发货且有库存限制的情况)
    const stock = getVariantStock(currentVariant);
    if (stock !== '充足' && val > stock) {
        val = stock;
    }
    $('#buy-qty').val(val);
};

// 下单逻辑
window.createOrder = function() {
    const contact = $('#contact').val().trim();
    const queryPwd = $('#query_password').val().trim();
    const qty = parseInt($('#buy-qty').val());

    if (!contact) return alert('请输入联系方式');
    if (!queryPwd) return alert('请设置查单密码');
    
    // 简单的库存前端检查
    const stock = getVariantStock(currentVariant);
    if (stock !== '充足' && qty > stock) return alert('库存不足');
    if (stock === 0) return alert('该规格缺货，无法购买');

    // 禁用按钮防重复
    const btn = $('button[onclick="createOrder()"]');
    const originalText = btn.html();
    btn.prop('disabled', true).html('<i class="fas fa-spinner fa-spin me-2"></i>处理中...');

    $.ajax({
        url: '/api/shop/order/create',
        method: 'POST',
        contentType: 'application/json',
        data: JSON.stringify({
            variant_id: currentVariant.id,
            quantity: qty,
            contact: contact,
            query_password: queryPwd,
            payment_method: 'alipay_f2f' // 默认支付方式，可根据需要扩展选择
        }),
        success: function(res) {
            if (res.error) {
                alert(res.error);
                btn.prop('disabled', false).html(originalText);
            } else {
                // 成功，跳转到支付或订单页
                // 这里我们假设跳转到通用的支付页，传递 order_id
                // 如果 default 主题没有单独的 pay.html，通常是在 orders.html 查单支付
                // 这里为了演示简单，直接 alert 或跳转到查单页自动查询
                // 更好的做法：在此处直接发起支付请求获取二维码
                initiatePay(res.order_id);
            }
        },
        error: function() {
            alert('下单请求失败');
            btn.prop('disabled', false).html(originalText);
        }
    });
};

// 发起支付 (获取二维码)
function initiatePay(orderId) {
    $.ajax({
        url: '/api/shop/pay',
        method: 'POST',
        contentType: 'application/json',
        data: JSON.stringify({ order_id: orderId }),
        success: function(res) {
            if (res.error) {
                alert('支付初始化失败: ' + res.error);
                window.location.href = 'orders'; // 跳转订单页
            } else if (res.type === 'qrcode') {
                // 简单展示二维码，实际项目中建议用 Modal 弹窗
                showPayModal(res.qr_code, res.amount, orderId);
            } else if (res.paid) {
                alert('该订单已支付');
            }
        },
        error: function() {
            alert('支付接口网络错误');
        }
    });
}

// 简单的支付弹窗 (需要 HTML 页面支持 Modal 结构，这里动态插入一个简单的覆盖层)
function showPayModal(qrUrl, amount, orderId) {
    // 移除旧的
    $('#pay-overlay').remove();
    
    const html = `
    <div id="pay-overlay" style="position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.6);z-index:9999;display:flex;align-items:center;justify-content:center;">
        <div class="bg-white p-4 rounded shadow text-center" style="width:320px;">
            <h5 class="mb-3">扫码支付 ¥${amount}</h5>
            <div id="qrcode-canvas" class="mb-3 d-flex justify-content-center"></div>
            <p class="small text-muted mb-3">请使用支付宝扫码</p>
            <p class="small text-danger">支付完成后页面将自动跳转</p>
            <button class="btn btn-outline-secondary btn-sm w-100" onclick="$('#pay-overlay').remove()">关闭</button>
        </div>
    </div>
    `;
    $('body').append(html);
    
    // 生成二维码
    new QRCode(document.getElementById("qrcode-canvas"), {
        text: qrUrl,
        width: 180,
        height: 180
    });

    // 轮询检查订单状态
    let checkInterval = setInterval(() => {
        if ($('#pay-overlay').length === 0) {
            clearInterval(checkInterval);
            return;
        }
        $.get(`/api/shop/order/status?order_id=${orderId}`, function(res) {
            if (res.status >= 1) {
                clearInterval(checkInterval);
                $('#pay-overlay').remove();
                alert('支付成功！');
                window.location.href = 'orders'; // 跳转查单页查看卡密
            }
        });
    }, 2000);
}


// --- 辅助工具函数 ---

// 获取库存显示文本
function getVariantStock(v) {
    if (v.auto_delivery == 1) {
        // 自动发货，库存可能是 API 返回的，如果没有返回具体数字，通常显示充足
        // 注意：_worker.js 返回的 variant 对象不直接包含实时卡密库存，需要 product 接口配合
        // 如果后端在 product 接口中处理了 stock 字段（将卡密数赋值给 stock），则直接用 stock
        return v.stock > 10 ? '充足' : v.stock;
    } else {
        return v.stock;
    }
}

// 渲染发货类型
function renderDeliveryType(v) {
    if (v.auto_delivery == 1) {
        return '<i class="fas fa-bolt text-warning me-1"></i>自动发货';
    } else {
        return '<i class="fas fa-user-clock text-primary me-1"></i>手动发货';
    }
}

// 标签渲染 (复用 main-default-bs.js 的逻辑)
function renderTagsLocal(tags) {
    if (!tags) return '';
    const tagsArr = tags.split(/[,，]+/).filter(t => t && t.trim());
    let html = '';
    
    tagsArr.forEach(tagStr => {
        tagStr = tagStr.trim();
        let borderColor = '#dc3545';
        let bgColor = '#dc3545';
        let textColor = '#fff';
        let labelText = tagStr;

        if (tagStr.includes(' ') && (tagStr.includes('b1#') || tagStr.includes('b2#'))) {
            const parts = tagStr.split(/\s+/);
            parts.forEach(part => {
                if (part.startsWith('b1#')) borderColor = part.replace('b1#', '#');
                else if (part.startsWith('b2#')) bgColor = part.replace('b2#', '#');
                else if (part.includes('#')) {
                    const txtParts = part.split('#');
                    labelText = txtParts[0];
                    if (txtParts[1]) textColor = '#' + txtParts[1];
                } else {
                    labelText = part;
                }
            });
        }
        
        // 使用 badge-tag 样式
        html += `<span class="badge-tag me-1" style="background-color:${bgColor};border-color:${borderColor};color:${textColor}">${labelText}</span>`;
    });
    return html;
}
