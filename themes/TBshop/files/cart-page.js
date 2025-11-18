// =============================================
// === themes/TBshop/files/cart-page.js
// === (购物车页专属JS - 修复版)
// =============================================

let cart = [];
let isEditing = false;
let contactInfo = null;
let queryPassword = null;

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

    // 3. 加载联系人缓存
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
        // 初始化选中状态
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

    // 更新角标
    if (typeof updateCartBadge === 'function') updateCartBadge(cart.length);
    
    // 更新移动端标题数量
    const mobileCount = document.getElementById('cart-count-mobile');
    if (mobileCount) mobileCount.innerText = cart.length;

    updateTotal();
    bindEvents();
}

/**
 * 绑定事件
 */
function bindEvents() {
    // 复选框
    document.querySelectorAll('.cart-item-check-input').forEach(chk => {
        chk.addEventListener('change', (e) => {
            const index = parseInt(e.target.dataset.index);
            if(cart[index]) {
                cart[index].checked = e.target.checked;
                updateTotal();
            }
        });
    });

    // 数量加减
    document.querySelectorAll('.stepper-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const idx = e.target.dataset.index;
            const isPlus = e.target.classList.contains('plus');
            changeQty(idx, isPlus ? 1 : -1);
        });
    });
    
    // 数量输入
    document.querySelectorAll('.stepper-input').forEach(input => {
        input.addEventListener('change', (e) => {
            let newQty = parseInt(e.target.value);
            if (isNaN(newQty) || newQty < 1) newQty = 1;
            changeQty(e.target.dataset.index, 0, newQty);
        });
    });
    
    // 删除
    document.querySelectorAll('.delete-btn').forEach(btn => {
        btn.addEventListener('click', (e) => deleteItem(e.target.dataset.index));
    });
}

/**
 * 渲染移动端项目
 */
function renderMobileItem(item, index) {
    // 安全转换数字
    const price = parseFloat(item.price) || 0;
    const qty = parseInt(item.quantity) || 1;
    const subtotal = (price * qty).toFixed(2);
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
    // 安全转换数字，防止报错
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

/**
 * 切换管理模式
 */
function toggleEdit(view) {
    isEditing = !isEditing;
    const btnMobile = document.getElementById('edit-btn-mobile');
    const btnPC = document.getElementById('edit-btn-pc');
    
    const text = isEditing ? '完成' : '管理';
    if(btnMobile) btnMobile.innerText = text;
    if(btnPC) btnPC.innerText = text;
    
    document.querySelectorAll('.delete-btn').forEach(b => {
        // PC端在表格里，通常一直显示删除或者用hover，这里为了统一逻辑
        if (view === 'mobile') {
            b.style.display = isEditing ? 'block' : 'none';
        }
    });
}

/**
 * 全选
 */
function toggleCheckAll(checkbox) {
    const isChecked = checkbox.checked;
    ['check-all-pc', 'check-all-pc-footer', 'check-all-mobile-footer'].forEach(id => {
        const el = document.getElementById(id);
        if(el) el.checked = isChecked;
    });

    cart.forEach(item => item.checked = isChecked);
    
    // 更新UI选中状态
    document.querySelectorAll('.cart-item-check-input').forEach(chk => chk.checked = isChecked);
    
    updateTotal();
}

/**
 * 更新总价
 */
function updateTotal() {
    let totalPrice = 0;
    let checkedCount = 0;
    
    cart.forEach(item => {
        if (item.checked) {
            const price = parseFloat(item.price) || 0;
            const qty = parseInt(item.quantity) || 1;
            totalPrice += price * qty;
            checkedCount += 1;
        }
    });

    ['total-price-mobile', 'total-price-pc'].forEach(id => {
        const el = document.getElementById(id);
        if(el) el.innerText = totalPrice.toFixed(2);
    });
    
    ['checkout-count-mobile', 'checkout-count-pc'].forEach(id => {
        const el = document.getElementById(id);
        if(el) el.innerText = checkedCount;
    });
    
    // 检查全选状态
    const allChecked = cart.length > 0 && cart.every(item => item.checked);
    ['check-all-pc', 'check-all-pc-footer', 'check-all-mobile-footer'].forEach(id => {
        const el = document.getElementById(id);
        if(el) el.checked = allChecked;
    });
    
    localStorage.setItem('tbShopCart', JSON.stringify(cart));
}

/**
 * 修改数量
 */
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
    
    loadCart(); // 重新渲染
}

/**
 * 删除
 */
function deleteItem(index) {
    if (!cart[index]) return;
    if (confirm(`确定要删除 "${cart[index].productName}" 吗？`)) {
        cart.splice(index, 1);
        localStorage.setItem('tbShopCart', JSON.stringify(cart));
        loadCart();
        // 强制刷新角标
        if (typeof updateCartBadge === 'function') updateCartBadge(cart.length);
    }
}

/**
 * 结算
 */
async function handleCheckout() {
    const selectedItems = cart.filter(item => item.checked);
    if (selectedItems.length === 0) return alert('请至少选择一件商品');
    
    contactInfo = document.getElementById('contact-info').value;
    queryPassword = document.getElementById('query-password').value;
    const paymentMethod = document.querySelector('input[name="payment"]:checked');
    
    if (!contactInfo) return alert('请填写联系方式');
    if (!queryPassword || queryPassword.length < 6) return alert('请设置6位以上的查单密码');
    
    // 保存用户信息
    localStorage.setItem('userContact', contactInfo);
    localStorage.setItem('userPassword', queryPassword);

    const btnPC = document.getElementById('checkout-btn-pc');
    if(btnPC) { btnPC.disabled = true; btnPC.innerText = '提交中...'; }
    
    try {
        const payload = {
            items: selectedItems,
            contact: contactInfo,
            query_password: queryPassword,
            payment_method: paymentMethod ? paymentMethod.value : 'alipay_f2f'
        };
        
        const res = await fetch('/api/shop/cart/checkout', { 
            method: 'POST', 
            headers: { 'Content-Type': 'application/json' }, 
            body: JSON.stringify(payload) 
        });
        
        const order = await res.json();
        if(order.error) throw new Error(order.error);

        // 移除已结算商品
        const remaining = cart.filter(item => !item.checked);
        localStorage.setItem('tbShopCart', JSON.stringify(remaining));

        window.location.href = `pay.html?order_id=${order.order_id}`;
        
    } catch (e) {
        alert('订单创建失败: ' + e.message);
        if(btnPC) { btnPC.disabled = false; btnPC.innerText = `结算 (${selectedItems.length})`; }
    }
}
