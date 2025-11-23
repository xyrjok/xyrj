// =============================================
// === themes/TBshop/files/cart-page.js
// === (Updated: 'Select' Item Qty Limit + Layout Fixes)
// =============================================

let cart = [];
let isEditing = false;
let cartPaymentMethod = 'alipay_f2f'; // Default Payment

/**
 * Page Load
 */
document.addEventListener('DOMContentLoaded', async () => {
    // 1. Load Config
    try {
        const configRes = await fetch('/api/shop/config');
        const siteConfig = await configRes.json();
        if (typeof renderCommonLayout === 'function') {
            renderCommonLayout('cart');
        } else if (typeof renderGlobalHeaders === 'function') {
            renderGlobalHeaders(siteConfig);
        }
    } catch (e) { console.error('Config load error', e); }

    // 2. Load Cart
    loadCart();

    // 3. Restore Contact Info
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

    // Sync Inputs
    syncInputs('contact-info', 'contact-info-mobile');
    syncInputs('query-password', 'query-password-mobile');
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
 * Normalize Item Data
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
        img: item.img || item.image || item.thumb || item.pic || '/assets/img/no-image.png',
        
        price: parseFloat(item.price || 0),
        quantity: parseInt(item.quantity || 1),
        buyMode: item.buyMode || 'auto',
        
        inputData: item.selectedCardInfo || item.selectedCardNote || item.input_data || item.customInfo || '',
        
        checked: item.checked !== false
    };
}

function selectCartPayment(method, el) {
    cartPaymentMethod = method;
    const containers = ['cart-payment-list', 'cart-payment-list-pc', 'cart-payment-list-mobile'];
    containers.forEach(id => {
        const container = document.getElementById(id);
        if (!container) return;
        const boxes = container.querySelectorAll('.payment-select-box');
        boxes.forEach(box => box.classList.remove('active'));
        const target = container.querySelector(`.payment-select-box[data-method="${method}"]`);
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
    const emptyHtmlMobile = '<div class="text-center p-5 text-muted">购物车空空如也</div>';
    const emptyHtmlPC = '<tr><td colspan="6" class="text-center p-5 text-muted">购物车空空如也</td></tr>';
    
    if (cart.length === 0) {
        if(listMobile) listMobile.innerHTML = emptyHtmlMobile;
        if(listPC) listPC.innerHTML = emptyHtmlPC;
    } else {
        if(listMobile) listMobile.innerHTML = cart.map((item, index) => renderMobileItem(item, index)).join('');
        if(listPC) listPC.innerHTML = cart.map((item, index) => renderPCItem(item, index)).join('');
    }

    if (typeof updateCartBadge === 'function') updateCartBadge(cart.length);
    
    const mobileCount = document.getElementById('cart-count-mobile');
    if (mobileCount) mobileCount.innerText = cart.length;

    updateTotal();
}

function renderPCItem(rawItem, index) {
    const item = normalizeItem(rawItem);
    const subtotal = (item.price * item.quantity).toFixed(2);
    const specDisplay = `<span class="text-muted">${item.sku}</span>`;
    const productLink = item.productId ? `/product.html?id=${item.productId}` : 'javascript:void(0)';
    
    let extraInfo = '';
    if (item.buyMode === 'select') {
        extraInfo = item.inputData ? 
            `<span class="text-danger ms-1">[已选: ${item.inputData}]</span>` : 
            `<span class="text-danger ms-1">[未选号码]</span>`;
    } else if (item.buyMode === 'random') {
        extraInfo = `<span class="text-danger ms-1">[随机发货]</span>`;
    }
    
    return `
    <tr>
        <td class="ps-3">
            <input class="form-check-input cart-item-check-input" type="checkbox" onchange="toggleItemCheck(${index}, this)" ${item.checked ? 'checked' : ''}>
        </td>
        <td>
            <div class="d-flex align-items-center">
                <a href="${productLink}" target="_blank" class="d-block me-2">
                    <img src="${item.img}" class="pc-item-img" alt="img" 
                         onerror="this.src='/assets/img/no-image.png'" 
                         style="width:48px;height:48px;object-fit:cover;border-radius:4px;border:1px solid #eee;">
                </a>
                <div>
                    <a href="${productLink}" target="_blank" class="pc-cart-title text-dark text-decoration-none d-block" style="font-size:13px; font-weight:500;">
                        ${item.name}
                    </a>
                    <div class="pc-cart-sku small" style="font-size:12px; color:#888;">
                        ${specDisplay}${extraInfo}
                    </div>
                </div>
            </div>
        </td>
        <td class="text-muted" style="font-size:13px;">¥${item.price.toFixed(2)}</td>
        <td>
            <div class="stepper" style="width:90px; height:26px; border:1px solid #ddd; display:flex; border-radius:3px;">
                <button type="button" class="stepper-btn minus d-flex align-items-center justify-content-center bg-light border-0" 
                     onclick="changeQty(${index}, -1)" style="width:26px; cursor:pointer; border-right:1px solid #ddd !important;">-</button>
                <input type="number" class="stepper-input text-center border-0" value="${item.quantity}" 
                       onchange="changeQty(${index}, 0, this.value)" style="width:36px; font-size:13px; outline:none;">
                <button type="button" class="stepper-btn plus d-flex align-items-center justify-content-center bg-light border-0" 
                     onclick="changeQty(${index}, 1)" style="width:26px; cursor:pointer; border-left:1px solid #ddd !important;">+</button>
            </div>
        </td>
        <td><strong class="text-danger small">¥${subtotal}</strong></td>
        <td>
            <a href="javascript:void(0)" class="text-muted small text-decoration-none" onclick="deleteItem(${index})">
                <i class="fa fa-trash-alt"></i>
            </a>
        </td>
    </tr>`;
}

function renderMobileItem(rawItem, index) {
    const item = normalizeItem(rawItem);
    const productLink = item.productId ? `/product.html?id=${item.productId}` : 'javascript:void(0)';

    let infoText = '';
    if (item.buyMode === 'select') {
        infoText = item.inputData ? `已选: ${item.inputData}` : '未选号码';
    } else {
        infoText = '随机发货';
    }
    
    return `
    <div class="cart-item bg-white p-3 mb-2 rounded shadow-sm position-relative">
        <div class="d-flex">
            <div class="me-2 d-flex align-items-center">
                <input class="form-check-input cart-item-check-input" type="checkbox" onchange="toggleItemCheck(${index}, this)" ${item.checked ? 'checked' : ''}>
            </div>
            
            <a href="${productLink}" class="d-block me-2">
                <img src="${item.img}" class="rounded" alt="img" 
                     onerror="this.src='/assets/img/no-image.png'"
                     style="width:70px; height:70px; object-fit:cover; border:1px solid #f0f0f0;">
            </a>

            <div class="flex-grow-1">
                <a href="${productLink}" class="text-truncate mb-1 text-dark text-decoration-none d-block" style="font-size:14px; font-weight:bold; max-width:200px;">
                    ${item.name}
                </a>
                <div class="small text-muted bg-light px-2 py-1 rounded d-inline-block mb-2" style="font-size:12px;">
                    ${item.sku} <span class="text-danger">(${infoText})</span>
                </div>
                <div class="d-flex justify-content-between align-items-end">
                    <div class="text-danger fw-bold">¥${item.price.toFixed(2)}</div>
                    
                    <div class="stepper d-flex border rounded" style="height:24px; width: auto !important;">
                        <button type="button" class="stepper-btn minus px-2 d-flex align-items-center bg-light cursor-pointer border-0" 
                                onclick="changeQty(${index}, -1)" style="min-width: 28px;">-</button>
                        <input type="number" class="stepper-input text-center border-0 border-start border-end" value="${item.quantity}" 
                               onchange="changeQty(${index}, 0, this.value)" style="width:30px; font-size:12px; outline:none;">
                        <button type="button" class="stepper-btn plus px-2 d-flex align-items-center bg-light cursor-pointer border-0" 
                                onclick="changeQty(${index}, 1)" style="min-width: 28px;">+</button>
                    </div>

                </div>
            </div>
        </div>
        <button class="btn btn-sm text-muted position-absolute top-0 end-0 mt-2 me-2" 
                onclick="deleteItem(${index})" style="display:${isEditing?'block':'none'}">
            <i class="fa fa-times"></i>
        </button>
    </div>`;
}

function toggleItemCheck(idx, el) {
    if(cart[idx]) {
        cart[idx].checked = el.checked;
        updateTotal();
    }
}

function toggleEdit() {
    isEditing = !isEditing;
    const btn = document.getElementById('edit-btn-mobile');
    if(btn) btn.innerText = isEditing ? '完成' : '管理';
    loadCart(); 
}

function toggleCheckAll(source) {
    const checked = source.checked;
    cart.forEach(item => item.checked = checked);
    loadCart(); 
}

function updateTotal() {
    let total = 0;
    let count = 0;
    cart.forEach(item => {
        if(item.checked !== false) { 
            const p = parseFloat(item.price) || 0;
            const q = parseInt(item.quantity) || 1;
            total += p * q;
            count++;
        }
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

// Global exposure
window.changeQty = function(idx, delta, absVal=null) {
    if(!cart[idx]) return;
    
    // [Request 1] Restrict 'select' items to quantity 1
    if (cart[idx].buyMode === 'select') {
        const currentQ = parseInt(cart[idx].quantity) || 1;
        
        // If attempting to increase (delta > 0) or set absolute value > 1
        if ((delta > 0) || (absVal !== null && parseInt(absVal) > 1)) {
            alert('提示：该商品为加价自选，每组预设信息只能购买一份。\n如需购买多份，请返回商品页选择其他号码/预设信息。');
            
            // Force reset to 1 if input was changed manually
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
    
    // Save before reload
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

window.handleCheckout = async function() {
    const selected = cart.filter(i => i.checked !== false);
    if(selected.length === 0) return alert('请选择要结算的商品');
    
    const contact = document.getElementById('contact-info').value.trim() || document.getElementById('contact-info-mobile').value.trim();
    const pass = document.getElementById('query-password').value.trim() || document.getElementById('query-password-mobile').value.trim();
    
    if(!contact) return alert('请输入联系方式');
    if(!pass || pass.length < 2) return alert('请输入查单密码 (至少2位)');
    
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
        if(data.error) throw new Error(data.error);
        
        const remaining = cart.filter(i => i.checked === false);
        localStorage.setItem('tbShopCart', JSON.stringify(remaining));
        
        window.location.href = `pay.html?order_id=${data.order_id}&method=${cartPaymentMethod}`;
    } catch(e) {
        alert('结算失败: ' + e.message);
        btns.forEach(b => { b.disabled = false; b.innerText = '立即结算'; });
    }
}
