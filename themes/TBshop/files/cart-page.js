// =============================================
// === themes/TBshop/files/cart-page.js
// === (购物车页专属JS)
// =============================================

let cart = [];
let isEditing = false;
let contactInfo = null;
let queryPassword = null;

/**
 * 页面加载总入口
 */
document.addEventListener('DOMContentLoaded', async () => {
    // 1. 加载配置 (用于公告/联系方式/Logo)
    try {
        const configRes = await fetch('/api/shop/config');
        const siteConfig = await configRes.json();
        // 调用 common.js 中的函数
        if (typeof renderGlobalHeaders === 'function') {
            renderGlobalHeaders(siteConfig);
        }
    } catch (e) { console.error('Failed to load config', e); }

    // 2. 加载购物车
    loadCart();

    // 3. 从 localStorage 加载联系人
    contactInfo = localStorage.getItem('userContact');
    queryPassword = localStorage.getItem('userPassword');
    if (contactInfo) document.getElementById('contact-info').value = contactInfo;
    if (queryPassword) document.getElementById('query-password').value = queryPassword;
});

/**
 * 加载并渲染购物车
 */
function loadCart() {
    try {
        cart = JSON.parse(localStorage.getItem('tbShopCart') || '[]');
        // 默认给所有物品添加 'checked' 属性
        cart.forEach(item => {
            if (item.checked === undefined) item.checked = true;
        });
    } catch (e) {
        cart = [];
        console.error("Failed to parse cart", e);
    }
    
    // 渲染移动端
    const listMobile = document.getElementById('cart-list-mobile');
    const listPC = document.getElementById('cart-list-pc');
    
    if (cart.length === 0) {
        const emptyHtml = '<div class="text-center p-5 text-muted">购物车还是空的，快去逛逛吧~</div>';
        listMobile.innerHTML = emptyHtml;
        listPC.innerHTML = `<tr><td colspan="6">${emptyHtml}</td></tr>`;
    } else {
        listMobile.innerHTML = cart.map((item, index) => renderMobileItem(item, index)).join('');
        listPC.innerHTML = cart.map((item, index) => renderPCItem(item, index)).join('');
    }

    // 更新角标和总价
    if (typeof updateCartBadge === 'function') updateCartBadge(cart.length);
    document.getElementById('cart-count-mobile').innerText = cart.length;
    updateTotal();
    bindEvents();
}

/**
 * 绑定所有事件
 */
function bindEvents() {
    // 绑定复选框
    document.querySelectorAll('.cart-item-check-input').forEach(chk => {
        chk.addEventListener('change', (e) => {
            const index = e.target.dataset.index;
            cart[index].checked = e.target.checked;
            updateTotal();
        });
    });

    // 绑定数量步进器
    document.querySelectorAll('.stepper-btn.minus').forEach(btn => {
        btn.addEventListener('click', (e) => changeQty(e.target.dataset.index, -1));
    });
    document.querySelectorAll('.stepper-btn.plus').forEach(btn => {
        btn.addEventListener('click', (e) => changeQty(e.target.dataset.index, 1));
    });
    document.querySelectorAll('.stepper-input').forEach(input => {
        input.addEventListener('change', (e) => {
            let newQty = parseInt(e.target.value);
            if (isNaN(newQty) || newQty < 1) newQty = 1;
            changeQty(e.target.dataset.index, 0, newQty); // 0 delta, absolute value
        });
    });
    
    // 绑定删除按钮
    document.querySelectorAll('.delete-btn').forEach(btn => {
        btn.addEventListener('click', (e) => deleteItem(e.target.dataset.index));
    });
}

/**
 * 渲染移动端项目
 */
function renderMobileItem(item, index) {
    const subtotal = (item.price * item.quantity).toFixed(2);
    const isSelectMode = item.buyMode === 'select';
    
    return `
    <div class="cart-item">
        <div class="cart-item-check">
            <input class="form-check-input cart-item-check-input" type="checkbox" data-index="${index}" ${item.checked ? 'checked' : ''}>
        </div>
        <img src="${item.img}" class="cart-item-img" alt="${item.productName}">
        <div class="cart-item-info">
            <div class="cart-item-title">${item.productName}</div>
            <div class="cart-item-sku">${item.variantName}</div>
            ${isSelectMode ? `<div class="cart-item-note">自选: ${item.selectedCardNote || 'N/A'}</div>` : ''}
            <div class="cart-item-footer">
                <div class="cart-item-price">¥${item.price.toFixed(2)}</div>
                ${isSelectMode ? `<span>x 1</span>` : `
                <div class="stepper">
                    <div class="stepper-btn minus" data-index="${index}">-</div>
                    <input type="number" class="stepper-input" value="${item.quantity}" data-index="${index}">
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
    const subtotal = (item.price * item.quantity).toFixed(2);
    const isSelectMode = item.buyMode === 'select';
    
    return `
    <tr>
        <td><input class="form-check-input cart-item-check-input" type="checkbox" data-index="${index}" ${item.checked ? 'checked' : ''}></td>
        <td>
            <div class="pc-item-info">
                <img src="${item.img}" alt="${item.productName}">
                <div class="cart-item-info">
                    <div class="cart-item-title">${item.productName}</div>
                    <div class="cart-item-sku">${item.variantName}</div>
                    ${isSelectMode ? `<div class="cart-item-note">自选: ${item.selectedCardNote || 'N/A'}</div>` : ''}
                </div>
            </div>
        </td>
        <td>¥${item.price.toFixed(2)}</td>
        <td>
            ${isSelectMode ? `<span>1</span>` : `
            <div class="stepper" style="width: 120px;">
                <div class="stepper-btn minus" data-index="${index}">-</div>
                <input type="number" class="stepper-input" value="${item.quantity}" data-index="${index}">
                <div class="stepper-btn plus" data-index="${index}">+</div>
            </div>
            `}
        </td>
        <td><strong class="text-danger">¥${subtotal}</strong></td>
        <td><a href="#" class="text-danger delete-btn" data-index="${index}" onclick="event.preventDefault()">删除</a></td>
    </tr>`;
}

/**
 * 切换管理模式
 */
function toggleEdit(view) {
    isEditing = !isEditing;
    const btnMobile = document.getElementById('edit-btn-mobile');
    const btnPC = document.getElementById('edit-btn-pc');
    
    if (isEditing) {
        btnMobile.innerText = '完成';
        btnPC.innerText = '完成';
        document.querySelectorAll('.delete-btn').forEach(b => b.style.display = 'block');
    } else {
        btnMobile.innerText = '管理';
        btnPC.innerText = '管理';
        document.querySelectorAll('.delete-btn').forEach(b => b.style.display = 'none');
    }
}

/**
 * 切换全选
 */
function toggleCheckAll(checkbox) {
    const isChecked = checkbox.checked;
    // 同步所有全选框
    document.getElementById('check-all-pc').checked = isChecked;
    document.getElementById('check-all-pc-footer').checked = isChecked;
    document.getElementById('check-all-mobile-footer').checked = isChecked;

    // 更新数据和UI
    document.querySelectorAll('.cart-item-check-input').forEach((chk, index) => {
        chk.checked = isChecked;
        if (cart[index]) cart[index].checked = isChecked;
    });
    
    updateTotal();
}

/**
 * 更新总价和结算按钮
 */
function updateTotal() {
    let totalPrice = 0;
    let checkedCount = 0;
    
    cart.forEach((item, index) => {
        const chk = document.querySelector(`.cart-item-check-input[data-index="${index}"]`);
        // 确保从 DOM 读取最新状态
        if (chk && chk.checked) {
            item.checked = true;
            totalPrice += item.price * item.quantity;
            checkedCount += 1;
        } else if (chk) {
            item.checked = false;
        }
    });

    document.getElementById('total-price-mobile').innerText = totalPrice.toFixed(2);
    document.getElementById('total-price-pc').innerText = totalPrice.toFixed(2);
    
    document.getElementById('checkout-count-mobile').innerText = checkedCount;
    document.getElementById('checkout-count-pc').innerText = checkedCount;
    
    // 更新全选框状态
    const allChecked = cart.length > 0 && cart.every(item => item.checked);
    document.getElementById('check-all-pc').checked = allChecked;
    document.getElementById('check-all-pc-footer').checked = allChecked;
    document.getElementById('check-all-mobile-footer').checked = allChecked;
    
    // 保存购物车回 localStorage
    localStorage.setItem('tbShopCart', JSON.stringify(cart));
}

/**
 * 修改数量
 */
function changeQty(index, delta, absoluteVal = null) {
    if (!cart[index] || cart[index].buyMode === 'select') return; // 自选商品不许改数量
    
    let qty = cart[index].quantity;
    if (absoluteVal !== null) {
        qty = absoluteVal;
    } else {
        qty += delta;
    }
    
    if (qty < 1) qty = 1;
    // (缺少库存检查，因为我们前端不知道库存)
    
    cart[index].quantity = qty;
    
    // 重新渲染
    loadCart();
}

/**
 * 删除项目
 */
function deleteItem(index) {
    if (!cart[index]) return;
    
    if (confirm(`确定要删除 "${cart[index].productName}" 吗？`)) {
        cart.splice(index, 1);
        localStorage.setItem('tbShopCart', JSON.stringify(cart));
        loadCart(); // 重新加载
    }
}

/**
 * 处理结算
 */
async function handleCheckout() {
    const selectedItems = cart.filter(item => item.checked);
    if (selectedItems.length === 0) {
        return alert('请至少选择一件商品');
    }
    
    contactInfo = document.getElementById('contact-info').value;
    queryPassword = document.getElementById('query-password').value;
    const paymentMethod = document.querySelector('input[name="payment"]:checked');
    
    if (!contactInfo) return alert('请填写联系方式');
    if (!queryPassword || queryPassword.length < 6) return alert('请设置6位以上的查单密码');
    if (!paymentMethod) return alert('请选择支付方式');

    // 保存联系人信息
    localStorage.setItem('userContact', contactInfo);
    localStorage.setItem('userPassword', queryPassword);

    const btnPC = document.getElementById('checkout-btn-pc');
    const btnMobile = document.getElementById('checkout-btn-mobile');
    btnPC.disabled = true; btnPC.innerText = '创建订单...';
    btnMobile.disabled = true; btnMobile.innerText = '创建...';

    try {
        const payload = {
            items: selectedItems,
            contact: contactInfo,
            query_password: queryPassword,
            payment_method: paymentMethod.value
        };
        
        const res = await fetch('/api/shop/cart/checkout', { 
            method: 'POST', 
            headers: { 'Content-Type': 'application/json' }, 
            body: JSON.stringify(payload) 
        });
        
        const order = await res.json();
        if(order.error) throw new Error(order.error);

        // [重要] 结算成功，从购物车中移除已购买的商品
        const remainingItems = cart.filter(item => !item.checked);
        localStorage.setItem('tbShopCart', JSON.stringify(remainingItems));

        // 跳转支付
        window.location.href = `pay.html?order_id=${order.order_id}`;
        
    } catch (e) {
        alert('创建订单失败: ' + e.message);
        btnPC.disabled = false; btnPC.innerText = `结算 (${selectedItems.length})`;
        btnMobile.disabled = false; btnMobile.innerText = `结算 (${selectedItems.length})`;
    }
}
