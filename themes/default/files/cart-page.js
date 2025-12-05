// =============================================
// === themes/default/files/cart-page.js
// === (Default主题适配版)
// =============================================

let cart = [];
let isEditing = false;
let cartPaymentMethod = 'alipay_f2f'; // 默认选中支付宝

/**
 * 页面加载
 */
document.addEventListener('DOMContentLoaded', async () => {
    // 1. 加载配置 (可选，若header.js已处理可忽略，但为了稳健保留)
    try {
        // 如果有 config.js 或全局配置逻辑，此处可扩展
    } catch (e) { console.error('Config load error', e); }

    // 2. 加载购物车
    loadCart();

    // 3. 恢复联系人信息
    const cachedContact = localStorage.getItem('userContact');
    const cachedPass = localStorage.getItem('userPassword');
    
    if (cachedContact) {
        const inputs = [document.getElementById('contact-info'), document.getElementById('contact-info-mobile')];
        inputs.forEach(el => { if(el) el.value = cachedContact; });
    }
    if (cachedPass) {
        const inputs = [document.getElementById('query-password'), document.getElementById('query-password-mobile')];
        inputs.forEach(el => { if(el) el.value = cachedPass; });
    }

    // 监听输入同步
    syncInputs('contact-info', 'contact-info-mobile');
    syncInputs('query-password', 'query-password-mobile');

    // 侧边栏吸附 (PC)
    if (window.innerWidth > 991 && typeof StickySidebar !== 'undefined') {
        new StickySidebar('#sidebar-wrapper', {
            topSpacing: 20,
            bottomSpacing: 20,
            containerSelector: '.container',
            innerWrapperSelector: '.sidebar-inner'
        });
    }
});

function syncInputs(id1, id2) {
    const el1 = document.getElementById(id1);
    const el2 = document.getElementById(id2);
    if(el1 && el2) {
        el1.addEventListener('input', e => el2.value = e.target.value);
        el2.addEventListener('input', e => el1.value = e.target.value);
    }
}

/**
 * 标准化商品数据对象
 */
function normalizeItem(item) {
    return {
        productId: item.product_id || item.productId || item.product_id, 
        variantId: item.variant_id || item.variantId, 
        productName: item.productName || item.name || item.title || '未命名商品',
        variantName: item.variant_name || item.variantName || item.skuName || item.variant || '默认规格',
        selectedCardId: item.selectedCardId || null, 

        name: item.productName || item.name || item.title || '未命名商品',
        sku: item.variant_name || item.variantName || item.skuName || item.variant || '默认规格',
        img: item.img || item.image || item.thumb || item.pic || '/themes/TBshop/assets/no-image.png', // 注意：Default主题可能需要自己的默认图
        
        price: parseFloat(item.price || 0),
        quantity: parseInt(item.quantity || 1),
        buyMode: item.buyMode || 'auto',
        
        inputData: item.selectedCardInfo || item.selectedCardNote || item.input_data || item.customInfo || '',
        
        checked: item.checked !== false
    };
}

// 支付方式切换
function selectCartPayment(method, el) {
    cartPaymentMethod = method;
    const containers = ['cart-payment-list-pc', 'cart-payment-list-mobile'];
    
    containers.forEach(id => {
        const container = document.getElementById(id);
        if (!container) return;
        
        const options = container.querySelectorAll('.payment-option');
        options.forEach(opt => opt.classList.remove('active'));
        
        const target = container.querySelector(`.payment-option[data-method="${method}"]`);
        if (target) target.classList.add('active');
    });
}

function loadCart() {
    try {
        cart = JSON.parse(localStorage.getItem('tbShopCart') || '[]');
    } catch (e) {
        cart = [];
    }
    
    const listMobile = document.getElementById('cart-list-mobile');
    const listPC = document.getElementById('cart-list-pc');
    const emptyHtmlMobile = '<div class="text-center p-5 text-muted"><i class="fa fa-shopping-basket fa-3x mb-3 text-light"></i><br>购物车空空如也</div>';
    const emptyHtmlPC = '<tr><td colspan="6" class="text-center p-5 text-muted">购物车空空如也</td></tr>';
    
    if (cart.length === 0) {
        if(listMobile) listMobile.innerHTML = emptyHtmlMobile;
        if(listPC) listPC.innerHTML = emptyHtmlPC;
    } else {
        if(listMobile) listMobile.innerHTML = cart.map((item, index) => renderMobileItem(item, index)).join('');
        if(listPC) listPC.innerHTML = cart.map((item, index) => renderPCItem(item, index)).join('');
    }

    // 更新购物车角标 (如果Header支持)
    const badge = document.querySelector('.cart-badge'); // 假设Header有这个类
    if (badge) {
        badge.innerText = cart.length;
        badge.style.display = cart.length > 0 ? 'inline-block' : 'none';
    }
    
    // 更新手机底部总数
    const mobileCount = document.getElementById('checkout-count-mobile');
    if (mobileCount) mobileCount.innerText = cart.filter(i => i.checked !== false).length;

    updateTotal();
}

// PC端 列表项渲染 (Default风格)
function renderPCItem(rawItem, index) {
    const item = normalizeItem(rawItem);
    const subtotal = (item.price * item.quantity).toFixed(2);
    const productLink = item.productId ? `product?id=${item.productId}` : 'javascript:void(0)';
    
    let extraInfo = '';
    if (item.buyMode === 'select') {
        extraInfo = item.inputData ? 
            `<span class="text-primary ms-1 small">[已选: ${item.inputData}]</span>` : 
            `<span class="text-danger ms-1 small">[未选号码]</span>`;
    } else if (item.buyMode === 'random') {
        extraInfo = `<span class="text-muted ms-1 small">[随机]</span>`;
    }
    
    return `
    <tr>
        <td class="ps-3">
            <input class="form-check-input" type="checkbox" onchange="toggleItemCheck(${index}, this)" ${item.checked ? 'checked' : ''}>
        </td>
        <td>
            <div class="d-flex align-items-center">
                <a href="${productLink}" target="_blank" class="d-block me-3">
                    <img src="${item.img}" alt="img" 
                         onerror="this.src='data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI1MCIgaGVpZ2h0PSI1MCI+PHJlY3Qgd2lkdGg9IjUwIiBoZWlnaHQ9IjUwIiBmaWxsPSIjZWVlIi8+PC9zdmc+'" 
                         style="width:50px;height:50px;object-fit:cover;border-radius:6px;">
                </a>
                <div>
                    <a href="${productLink}" target="_blank" class="text-dark text-decoration-none d-block fw-bold" style="font-size:14px;">
                        ${item.name}
                    </a>
                    <div class="small text-muted">
                        ${item.sku}${extraInfo}
                    </div>
                </div>
            </div>
        </td>
        <td class="text-muted">¥${item.price.toFixed(2)}</td>
        <td>
            <div class="stepper">
                <button type="button" class="stepper-btn minus" onclick="changeQty(${index}, -1)">-</button>
                <input type="number" class="stepper-input" value="${item.quantity}" onchange="changeQty(${index}, 0, this.value)">
                <button type="button" class="stepper-btn plus" onclick="changeQty(${index}, 1)">+</button>
            </div>
        </td>
        <td><strong class="text-danger">¥${subtotal}</strong></td>
        <td>
            <a href="javascript:void(0)" class="text-secondary small" onclick="deleteItem(${index})">
                <i class="fa fa-trash-alt"></i>
            </a>
        </td>
    </tr>`;
}

// 移动端 列表项渲染 (Default风格 - 卡片式)
function renderMobileItem(rawItem, index) {
    const item = normalizeItem(rawItem);
    const productLink = item.productId ? `product?id=${item.productId}` : 'javascript:void(0)';

    let infoText = '';
    if (item.buyMode === 'select') {
        infoText = item.inputData ? `已选: ${item.inputData}` : '未选';
    } else {
        infoText = '随机';
    }
    
    return `
    <div class="cart-item-mobile bg-white p-3 mb-2 rounded position-relative">
        <div class="d-flex">
            <div class="me-3 d-flex align-items-center">
                <input class="form-check-input" style="width:1.2em;height:1.2em;" type="checkbox" onchange="toggleItemCheck(${index}, this)" ${item.checked ? 'checked' : ''}>
            </div>
            
            <a href="${productLink}" class="d-block me-3">
                <img src="${item.img}" class="rounded" alt="img" 
                     onerror="this.src='data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI2MCIgaGVpZ2h0PSI2MCI+PHJlY3Qgd2lkdGg9IjYwIiBoZWlnaHQ9IjYwIiBmaWxsPSIjZWVlIi8+PC9zdmc+'"
                     style="width:64px; height:64px; object-fit:cover;">
            </a>

            <div class="flex-grow-1 overflow-hidden">
                <a href="${productLink}" class="text-truncate mb-1 text-dark text-decoration-none d-block fw-bold">
                    ${item.name}
                </a>
                <div class="d-flex align-items-center small text-muted mb-2">
                    <span class="badge bg-light text-dark border me-1">${item.sku}</span>
                    <span class="text-truncate" style="max-width: 100px;">${infoText}</span>
                </div>
                
                <div class="d-flex justify-content-between align-items-center">
                    <div class="text-danger fw-bold fs-6">¥${item.price.toFixed(2)}</div>
                    
                    <div class="stepper" style="height:26px; width:90px;">
                        <button type="button" class="stepper-btn minus" onclick="changeQty(${index}, -1)" style="width:26px; font-size:12px;">-</button>
                        <input type="number" class="stepper-input" value="${item.quantity}" onchange="changeQty(${index}, 0, this.value)" style="width:38px; font-size:12px;">
                        <button type="button" class="stepper-btn plus" onclick="changeQty(${index}, 1)" style="width:26px; font-size:12px;">+</button>
                    </div>
                </div>
            </div>
        </div>
        
        <button class="btn btn-sm text-secondary position-absolute top-0 end-0 mt-2 me-2" 
                onclick="deleteItem(${index})" style="display:${isEditing?'block':'none'}">
            <i class="fa fa-times"></i>
        </button>
    </div>`;
}

// 切换单品选中
function toggleItemCheck(idx, el) {
    if(cart[idx]) {
        cart[idx].checked = el.checked;
        updateTotal();
    }
}

// 移动端管理模式
function toggleEdit() {
    isEditing = !isEditing;
    const btn = document.getElementById('edit-btn-mobile');
    if(btn) btn.innerText = isEditing ? '完成' : '管理';
    loadCart(); 
}

// 全选
window.toggleCheckAll = function(source) {
    const checked = source.checked;
    cart.forEach(item => item.checked = checked);
    localStorage.setItem('tbShopCart', JSON.stringify(cart));
    loadCart(); 
}

function updateTotal() {
    let total = 0;
    let count = 0;
    
    const hasItems = cart.length > 0;
    let allChecked = hasItems; 

    cart.forEach(item => {
        if(item.checked !== false) { 
            const p = parseFloat(item.price) || 0;
            const q = parseInt(item.quantity) || 1;
            total += p * q;
            count++;
        } else {
            allChecked = false;
        }
    });
    
    const checkAllIds = ['check-all-pc', 'check-all-mobile-top'];
    checkAllIds.forEach(id => {
        const el = document.getElementById(id);
        if(el) el.checked = allChecked;
    });

    const ids = [
        { t: 'total-price-pc', c: 'checkout-count-pc' },
        { t: 'total-price-mobile', c: 'checkout-count-mobile' }
    ];
    
    ids.forEach(obj => {
        const tEl = document.getElementById(obj.t);
        const cEl = document.getElementById(obj.c);
        if(tEl) tEl.innerText = total.toFixed(2);
        if(cEl) cEl.innerText = count;
    });
    
    localStorage.setItem('tbShopCart', JSON.stringify(cart));
}

// 数量变更
window.changeQty = function(idx, delta, absVal=null) {
    if(!cart[idx]) return;
    
    // 自选号码限制
    if (cart[idx].buyMode === 'select') {
        const currentQ = parseInt(cart[idx].quantity) || 1;
        if ((delta > 0) || (absVal !== null && parseInt(absVal) > 1)) {
            alert('提示：该商品为加价自选，每组预设信息只能购买一份。\n如需购买多份，请返回商品页选择其他号码/预设信息。');
            if (absVal !== null) {
                cart[idx].quantity = 1;
                localStorage.setItem('tbShopCart', JSON.stringify(cart));
                loadCart();
            }
            return;
        }
    }

    let q = parseInt(cart[idx].quantity) || 1;
    if(absVal !== null) {
        q = parseInt(absVal);
    } else {
        q += delta;
    }
    if(isNaN(q) || q < 1) q = 1;
    
    cart[idx].quantity = q;
    localStorage.setItem('tbShopCart', JSON.stringify(cart));
    loadCart(); 
}

window.deleteItem = function(idx) {
    if(confirm('确定删除该商品吗？')) {
        cart.splice(idx, 1);
        localStorage.setItem('tbShopCart', JSON.stringify(cart));
        loadCart();
    }
}

// 结算逻辑 (同TBshop，无需大改，仅需确保API一致)
window.handleCheckout = async function() {
    const selected = cart.filter(i => i.checked !== false);
    if(selected.length === 0) return alert('请选择要结算的商品');
    
    const contact = document.getElementById('contact-info').value.trim() || document.getElementById('contact-info-mobile').value.trim();
    const pass = document.getElementById('query-password').value.trim() || document.getElementById('query-password-mobile').value.trim();
    
    if(!contact) return alert('请输入联系方式');
    if(!pass || pass.length < 1) return alert('请输入查单密码 (至少1位)');
    
    localStorage.setItem('userContact', contact);
    localStorage.setItem('userPassword', pass);
    
    const btns = document.querySelectorAll('button[onclick="handleCheckout()"]');
    btns.forEach(b => { b.disabled = true; b.innerText = '提交中...'; });
    
    try {
        const payload = {
            items: selected.map(normalizeItem), 
            contact: contact,
            query_password: pass,
            payment_method: cartPaymentMethod
        };
        
        const res = await fetch('/api/shop/cart/checkout', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const data = await res.json();
        
        if(data.error) {
            if (data.error.includes('未支付订单')) {
                if(confirm('提示：' + data.error + '\n\n点击“确定”前往查单页面处理。')) {
                    window.location.href = 'orders'; // Default主题通常是 orders
                    return;
                }
            }
            throw new Error(data.error);
        }
        
        const remaining = cart.filter(i => i.checked === false);
        localStorage.setItem('tbShopCart', JSON.stringify(remaining));
        
        // 跳转支付页
        window.location.href = `pay?order_id=${data.order_id}&method=${cartPaymentMethod}`;
    } catch(e) {
        alert('结算失败: ' + e.message);
        btns.forEach(b => { b.disabled = false; b.innerText = '立即结算'; });
    }
}
