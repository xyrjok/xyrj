// =============================================
// === themes/TBshop/files/cart-page.js
// === (购物车页 - 含结算表单逻辑 - 重构版)
// =============================================

let cart = [];
let isEditing = false;
let cartPaymentMethod = 'alipay_f2f'; // 默认支付方式

/**
 * 页面加载总入口
 */
document.addEventListener('DOMContentLoaded', async () => {
    // 1. 加载配置并渲染公共头尾
    try {
        const configRes = await fetch('/api/shop/config');
        const siteConfig = await configRes.json();
        
        // 优先使用 common.js 中的 renderCommonLayout 如果存在
        if (typeof renderCommonLayout === 'function') {
            renderCommonLayout('cart'); // 传入 'cart' 标识
        } else if (typeof renderGlobalHeaders === 'function') {
            // 降级兼容
            renderGlobalHeaders(siteConfig);
        }
    } catch (e) { console.error('Failed to load config', e); }

    // 2. 加载购物车
    loadCart();

    // 3. 加载联系人缓存 (自动回填到 PC 和 Mobile 输入框)
    const cachedContact = localStorage.getItem('userContact');
    const cachedPass = localStorage.getItem('userPassword');
    
    // 辅助函数：同步设置多个 input 的值
    const setInputVal = (ids, val) => {
        ids.forEach(id => {
            const el = document.getElementById(id);
            if(el) el.value = val;
        });
    };

    if (cachedContact) setInputVal(['contact-info', 'contact-info-mobile'], cachedContact);
    if (cachedPass) setInputVal(['query-password', 'query-password-mobile'], cachedPass);

    // 监听输入框同步 (PC输入时同步到Mobile，反之亦然)
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
 * 支付方式选择逻辑
 */
function selectCartPayment(method, el) {
    cartPaymentMethod = method;
    
    // UI 更新：同时更新 PC 和 Mobile 的选中状态
    // 找到所有支付方式列表容器
    const containers = [
        document.getElementById('cart-payment-list-pc'),
        document.getElementById('cart-payment-list-mobile')
    ];
    
    containers.forEach(container => {
        if(!container) return;
        const boxes = container.querySelectorAll('.payment-select-box');
        // 移除所有 active
        boxes.forEach(box => box.classList.remove('active'));
        
        // 根据点击的 method 类型，激活对应的 box (简单的根据 onclick 属性匹配)
        // 这里为了简化，假设点击的元素已经传进来了，我们手动高亮所有相同支付方式的块
        boxes.forEach(box => {
            if(box.getAttribute('onclick').includes(`'${method}'`)) {
                box.classList.add('active');
            }
        });
    });
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
    const emptyRowPC = `<tr><td colspan="6" class="text-center p-5 text-muted">购物车空空如也</td></tr>`;
    
    if (cart.length === 0) {
        if(listMobile) listMobile.innerHTML = emptyHtml;
        if(listPC) listPC.innerHTML = emptyRowPC;
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
    // 复选框事件
    document.querySelectorAll('.cart-item-check-input').forEach(chk => {
        chk.addEventListener('change', (e) => {
            const index = parseInt(e.target.dataset.index);
            if(cart[index]) {
                cart[index].checked = e.target.checked;
                updateTotal();
            }
        });
    });

    // 加减按钮事件
    document.querySelectorAll('.stepper-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            // 防止双击选中文字
            e.preventDefault(); 
            const idx = e.target.dataset.index;
            const isPlus = e.target.classList.contains('plus');
            changeQty(idx, isPlus ? 1 : -1);
        });
    });
    
    // 数量输入框手动输入事件
    document.querySelectorAll('.stepper-input').forEach(input => {
        // 聚焦时全选内容
        input.addEventListener('focus', (e) => e.target.select());
        
        // 失焦或回车时提交
        input.addEventListener('change', (e) => {
            let newQty = parseInt(e.target.value);
            if (isNaN(newQty) || newQty < 1) newQty = 1;
            changeQty(e.target.dataset.index, 0, newQty);
        });
    });
    
    // 删除按钮
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
    // 优先使用 item.img (规格图)，没有则用默认
    const displayImg = item.img || '/assets/img/no-image.png';
    
    return `
    <div class="cart-item">
        <div class="cart-item-check">
            <input class="form-check-input cart-item-check-input" type="checkbox" data-index="${index}" ${item.checked ? 'checked' : ''}>
        </div>
        <img src="${displayImg}" class="cart-item-img" alt="商品图片">
        <div class="cart-item-info">
            <div class="cart-item-title" style="font-size:14px;">${item.productName || '未命名商品'}</div>
            <div class="cart-item-sku small text-muted">${item.variantName || '默认规格'}</div>
            ${isSelectMode ? `<div class="cart-item-note small text-primary">自选: ${item.selectedCardNote || '已选号码'}</div>` : ''}
            <div class="cart-item-footer mt-2">
                <div class="cart-item-price text-danger fw-bold">¥${price.toFixed(2)}</div>
                ${isSelectMode ? `<span class="small text-muted">x 1</span>` : `
                <div class="stepper">
                    <div class="stepper-btn minus" data-index="${index}">-</div>
                    <input type="number" class="stepper-input" value="${qty}" data-index="${index}">
                    <div class="stepper-btn plus" data-index="${index}">+</div>
                </div>
                `}
            </div>
            <button class="btn btn-sm btn-light text-danger border delete-btn" data-index="${index}" style="display: ${isEditing ? 'block' : 'none'}; float: right; margin-top: -25px;">删除</button>
        </div>
    </div>`;
}

/**
 * 渲染PC端项目 (按要求修改字体和样式)
 */
function renderPCItem(item, index) {
    const price = parseFloat(item.price) || 0;
    const qty = parseInt(item.quantity) || 1;
    const subtotal = (price * qty).toFixed(2);
    const isSelectMode = item.buyMode === 'select';
    const displayImg = item.img || '/assets/img/no-image.png';
    
    return `
    <tr>
        <td class="ps-3"><input class="form-check-input cart-item-check-input" type="checkbox" data-index="${index}" ${item.checked ? 'checked' : ''}></td>
        <td>
            <div class="d-flex align-items-center">
                <img src="${displayImg}" class="pc-item-img me-2" alt="img">
                <div>
                    <div class="pc-cart-title">${item.productName || '未命名商品'}</div>
                    <div class="pc-cart-sku">${item.variantName || '默认规格'}</div>
                    ${isSelectMode ? `<div class="small text-primary" style="font-size:12px;">自选: ${item.selectedCardNote || '已选号码'}</div>` : ''}
                </div>
            </div>
        </td>
        <td><span class="text-muted">¥${price.toFixed(2)}</span></td>
        <td>
            ${isSelectMode ? `<span class="small ms-2">1</span>` : `
            <div class="stepper">
                <div class="stepper-btn minus" data-index="${index}">-</div>
                <input type="number" class="stepper-input" value="${qty}" data-index="${index}">
                <div class="stepper-btn plus" data-index="${index}">+</div>
            </div>
            `}
        </td>
        <td><strong class="text-danger small">¥${subtotal}</strong></td>
        <td><a href="javascript:void(0)" class="text-muted delete-btn small text-decoration-none hover-danger" data-index="${index}"><i class="fa fa-trash"></i></a></td>
    </tr>`;
}

function toggleEdit(view) {
    isEditing = !isEditing;
    const btnMobile = document.getElementById('edit-btn-mobile');
    const text = isEditing ? '完成' : '管理';
    if(btnMobile) btnMobile.innerText = text;
    
    // 刷新列表以显示/隐藏删除按钮
    loadCart();
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

    // Mobile
    const totalEl = document.getElementById('total-price-mobile');
    if(totalEl) totalEl.innerText = totalPrice.toFixed(2);
    
    const countEl = document.getElementById('checkout-count-mobile');
    if(countEl) countEl.innerText = checkedCount;

    // PC
    const totalElPC = document.getElementById('total-price-pc');
    if(totalElPC) totalElPC.innerText = totalPrice.toFixed(2);
    
    const countElPC = document.getElementById('checkout-count-pc');
    if(countElPC) countElPC.innerText = checkedCount;
    
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
    // 简单确认，也可以去掉
    if (confirm(`确定要删除该商品吗？`)) {
        cart.splice(index, 1);
        localStorage.setItem('tbShopCart', JSON.stringify(cart));
        loadCart();
        if (typeof updateCartBadge === 'function') updateCartBadge(cart.length);
    }
}

/**
 * 结算
 */
async function handleCheckout() {
    const selectedItems = cart.filter(item => item.checked);
    if (selectedItems.length === 0) return alert('请至少选择一件商品');
    
    // 1. 获取页面上输入的联系方式和密码 (优先取PC端输入框，如果隐藏则取Mobile，但我们做了同步所以取任意一个非空即可)
    let contact = document.getElementById('contact-info').value.trim() || document.getElementById('contact-info-mobile').value.trim();
    let password = document.getElementById('query-password').value.trim() || document.getElementById('query-password-mobile').value.trim();
    
    if (!contact) {
        alert('请填写联系方式');
        return;
    }
    if (!password || password.length <= 1) {
        alert('请设置查单密码 (需大于1位)');
        return;
    }
    
    // 2. 保存用户信息到缓存
    localStorage.setItem('userContact', contact);
    localStorage.setItem('userPassword', password);

    // 3. UI 反馈 (PC和Mobile按钮都禁用)
    const btns = [document.getElementById('checkout-btn-mobile'), document.querySelector('.checkout-section button')];
    btns.forEach(btn => {
        if(btn) {
            btn.disabled = true;
            btn.innerText = '提交中...';
        }
    });
    
    try {
        const payload = {
            items: selectedItems,
            contact: contact,
            query_password: password,
            payment_method: cartPaymentMethod 
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
        btns.forEach(btn => {
            if(btn) {
                btn.disabled = false;
                btn.innerText = '立即结算';
            }
        });
    }
}
