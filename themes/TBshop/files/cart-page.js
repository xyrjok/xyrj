// =============================================
// === themes/TBshop/files/cart-page.js
// === (购物车页 - 含结算表单逻辑)
// =============================================

let cart = [];
let isEditing = false;
let contactInfo = null;
let queryPassword = null;
let cartPaymentMethod = 'alipay_f2f'; // 默认支付方式

/**
 * 页面加载总入口
 */
document.addEventListener('DOMContentLoaded', async () => {
    // 1. 加载配置
    try {
        const configRes = await fetch('/api/shop/config');
        const siteConfig = await configRes.json();
        if (typeof renderGlobalHeaders === 'function') {
            renderGlobalHeaders(siteConfig);
        }
    } catch (e) { console.error('Failed to load config', e); }

    // 2. 加载购物车
    loadCart();

    // 3. 加载联系人缓存 (自动回填)
    const cachedContact = localStorage.getItem('userContact');
    const cachedPass = localStorage.getItem('userPassword');
    
    if (cachedContact) {
        const el = document.getElementById('contact-info');
        if(el) el.value = cachedContact;
    }
    if (cachedPass) {
        const el = document.getElementById('query-password');
        if(el) el.value = cachedPass;
    }
});

/**
 * 支付方式选择逻辑
 */
function selectCartPayment(method, el) {
    cartPaymentMethod = method;
    // UI 更新
    const boxes = document.querySelectorAll('.payment-select-box');
    boxes.forEach(box => box.classList.remove('active'));
    if(el) el.classList.add('active');
}

/**
 * 加载并渲染购物车
 */
function loadCart() {
    try {
        cart = JSON.parse(localStorage.getItem('tbShopCart') || '[]');
        cart.forEach(item => {
            if (item.checked === undefined) item.checked = true;
        });
    } catch (e) {
        cart = [];
        console.error("购物车数据解析失败", e);
    }
    
    const listMobile = document.getElementById('cart-list-mobile');
    const listPC = document.getElementById('cart-list-pc');
    const emptyHtml = '<div class="text-center p-5 text-muted">购物车还是空的，快去逛逛吧~</div>';
    
    if (cart.length === 0) {
        if(listMobile) listMobile.innerHTML = emptyHtml;
        if(listPC) listPC.innerHTML = `<tr><td colspan="6" class="text-center p-5 text-muted">购物车空空如也</td></tr>`;
    } else {
        if(listMobile) listMobile.innerHTML = cart.map((item, index) => renderMobileItem(item, index)).join('');
        if(listPC) listPC.innerHTML = cart.map((item, index) => renderPCItem(item, index)).join('');
    }

    if (typeof updateCartBadge === 'function') updateCartBadge(cart.length);
    
    const mobileCount = document.getElementById('cart-count-mobile');
    if (mobileCount) mobileCount.innerText = cart.length;

    updateTotal();
    bindEvents();
}

/**
 * 绑定事件
 */
function bindEvents() {
    document.querySelectorAll('.cart-item-check-input').forEach(chk => {
        chk.addEventListener('change', (e) => {
            const index = parseInt(e.target.dataset.index);
            if(cart[index]) {
                cart[index].checked = e.target.checked;
                updateTotal();
            }
        });
    });

    document.querySelectorAll('.stepper-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const idx = e.target.dataset.index;
            const isPlus = e.target.classList.contains('plus');
            changeQty(idx, isPlus ? 1 : -1);
        });
    });
    
    document.querySelectorAll('.stepper-input').forEach(input => {
        input.addEventListener('change', (e) => {
            let newQty = parseInt(e.target.value);
            if (isNaN(newQty) || newQty < 1) newQty = 1;
            changeQty(e.target.dataset.index, 0, newQty);
        });
    });
    
    document.querySelectorAll('.delete-btn').forEach(btn => {
        btn.addEventListener('click', (e) => deleteItem(e.target.dataset.index));
    });
}

/**
 * 渲染移动端项目
 */
function renderMobileItem(item, index) {
    const price = parseFloat(item.price) || 0;
    const qty = parseInt(item.quantity) || 1;
    const isSelectMode = item.buyMode === 'select';
    
    return `
    <div class="cart-item">
        <div class="cart-item-check">
            <input class="form-check-input cart-item-check-input" type="checkbox" data-index="${index}" ${item.checked ? 'checked' : ''}>
        </div>
        <img src="${item.img || '/assets/img/no-image.png'}" class="cart-item-img" alt="商品图片">
        <div class="cart-item-info">
            <div class="cart-item-title">${item.productName || '未命名商品'}</div>
            <div class="cart-item-sku">${item.variantName || '默认规格'}</div>
            ${isSelectMode ? `<div class="cart-item-note">自选: ${item.selectedCardNote || '已选号码'}</div>` : ''}
            <div class="cart-item-footer">
                <div class="cart-item-price">¥${price.toFixed(2)}</div>
                ${isSelectMode ? `<span>x 1</span>` : `
                <div class="stepper">
                    <div class="stepper-btn minus" data-index="${index}">-</div>
                    <input type="number" class="stepper-input" value="${qty}" data-index="${index}">
                    <div class="stepper-btn plus" data-index="${index}">+</div>
                </div>
                `}
            </div>
            <button class="btn btn-sm btn-danger delete-btn" data-index="${index}" style="display: ${isEditing ? 'block' : 'none'}; float: right; margin-top: 5px;">删除</button>
        </div>
    </div>`;
}

/**
 * 渲染PC端项目
 */
function renderPCItem(item, index) {
    const price = parseFloat(item.price) || 0;
    const qty = parseInt(item.quantity) || 1;
    const subtotal = (price * qty).toFixed(2);
    const isSelectMode = item.buyMode === 'select';
    
    return `
    <tr>
        <td><input class="form-check-input cart-item-check-input" type="checkbox" data-index="${index}" ${item.checked ? 'checked' : ''}></td>
        <td>
            <div class="pc-item-info">
                <img src="${item.img || '/assets/img/no-image.png'}" alt="图片">
                <div class="cart-item-info">
                    <div class="cart-item-title">${item.productName || '未命名商品'}</div>
                    <div class="cart-item-sku">${item.variantName || '默认规格'}</div>
                    ${isSelectMode ? `<div class="cart-item-note text-primary small">自选: ${item.selectedCardNote || '已选号码'}</div>` : ''}
                </div>
            </div>
        </td>
        <td>¥${price.toFixed(2)}</td>
        <td>
            ${isSelectMode ? `<span>1</span>` : `
            <div class="stepper" style="width: 100px;">
                <div class="stepper-btn minus" data-index="${index}">-</div>
                <input type="number" class="stepper-input" value="${qty}" data-index="${index}">
                <div class="stepper-btn plus" data-index="${index}">+</div>
            </div>
            `}
        </td>
        <td><strong class="text-danger">¥${subtotal}</strong></td>
        <td><a href="javascript:void(0)" class="text-danger delete-btn" data-index="${index}">删除</a></td>
    </tr>`;
}

function toggleEdit(view) {
    isEditing = !isEditing;
    const btnMobile = document.getElementById('edit-btn-mobile');
    const text = isEditing ? '完成' : '管理';
    if(btnMobile) btnMobile.innerText = text;
    
    document.querySelectorAll('.delete-btn').forEach(b => {
        if (view === 'mobile') {
            b.style.display = isEditing ? 'block' : 'none';
        }
    });
}

function toggleCheckAll(checkbox) {
    const isChecked = checkbox.checked;
    ['check-all-pc', 'check-all-mobile-footer'].forEach(id => {
        const el = document.getElementById(id);
        if(el) el.checked = isChecked;
    });

    cart.forEach(item => item.checked = isChecked);
    document.querySelectorAll('.cart-item-check-input').forEach(chk => chk.checked = isChecked);
    updateTotal();
}

function updateTotal() {
    let totalPrice = 0;
    let checkedCount = 0;
    
    cart.forEach(item => {
        if (item.checked) {
            totalPrice += (parseFloat(item.price) || 0) * (parseInt(item.quantity) || 1);
            checkedCount += 1;
        }
    });

    const totalEl = document.getElementById('total-price-mobile');
    if(totalEl) totalEl.innerText = totalPrice.toFixed(2);
    
    const countEl = document.getElementById('checkout-count-mobile');
    if(countEl) countEl.innerText = checkedCount;
    
    const allChecked = cart.length > 0 && cart.every(item => item.checked);
    ['check-all-pc', 'check-all-mobile-footer'].forEach(id => {
        const el = document.getElementById(id);
        if(el) el.checked = allChecked;
    });
    
    localStorage.setItem('tbShopCart', JSON.stringify(cart));
}

function changeQty(index, delta, absoluteVal = null) {
    if (!cart[index] || cart[index].buyMode === 'select') return;
    
    let qty = parseInt(cart[index].quantity) || 1;
    if (absoluteVal !== null) {
        qty = absoluteVal;
    } else {
        qty += delta;
    }
    
    if (qty < 1) qty = 1;
    cart[index].quantity = qty;
    loadCart(); 
}

function deleteItem(index) {
    if (!cart[index]) return;
    if (confirm(`确定要删除 "${cart[index].productName}" 吗？`)) {
        cart.splice(index, 1);
        localStorage.setItem('tbShopCart', JSON.stringify(cart));
        loadCart();
        if (typeof updateCartBadge === 'function') updateCartBadge(cart.length);
    }
}

/**
 * 结算 (更新版：获取页面上的输入)
 */
async function handleCheckout() {
    const selectedItems = cart.filter(item => item.checked);
    if (selectedItems.length === 0) return alert('请至少选择一件商品');
    
    // 1. 获取页面上输入的联系方式和密码
    const contactInput = document.getElementById('contact-info');
    const passInput = document.getElementById('query-password');
    
    if (!contactInput || !passInput) return alert('页面加载不完整，请刷新');
    
    const contact = contactInput.value.trim();
    const password = passInput.value.trim();
    
    if (!contact) {
        alert('请在购物车页面下方填写联系方式');
        contactInput.focus();
        return;
    }
    if (!password || password.length <= 1) {
        alert('请在购物车页面下方设置查单密码 (需大于1位)');
        passInput.focus();
        return;
    }
    
    // 2. 保存用户信息到缓存 (方便下次)
    localStorage.setItem('userContact', contact);
    localStorage.setItem('userPassword', password);

    // 3. UI 反馈
    const btn = document.getElementById('checkout-btn-mobile');
    const originalText = btn.innerText;
    btn.disabled = true; 
    btn.innerText = '提交中...';
    
    try {
        const payload = {
            items: selectedItems,
            contact: contact,
            query_password: password,
            payment_method: cartPaymentMethod // 使用全局选中的支付方式
        };
        
        const res = await fetch('/api/shop/cart/checkout', { 
            method: 'POST', 
            headers: { 'Content-Type': 'application/json' }, 
            body: JSON.stringify(payload) 
        });
        
        const order = await res.json();
        if(order.error) throw new Error(order.error);

        // 4. 结算成功，移除购物车中已选商品
        const remaining = cart.filter(item => !item.checked);
        localStorage.setItem('tbShopCart', JSON.stringify(remaining));

        // 5. 跳转支付
        window.location.href = `pay.html?order_id=${order.order_id}&method=${cartPaymentMethod}`;
        
    } catch (e) {
        alert('订单创建失败: ' + e.message);
        btn.disabled = false; 
        btn.innerText = originalText;
    }
}
