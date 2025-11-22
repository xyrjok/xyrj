// =============================================
// === themes/TBshop/files/cart-page.js
// === (修复版：兼容字段名 + 显示逻辑优化)
// =============================================

let cart = [];
let isEditing = false;
let cartPaymentMethod = 'alipay_f2f';

/**
 * 页面加载
 */
document.addEventListener('DOMContentLoaded', async () => {
    // 1. 加载配置
    try {
        const configRes = await fetch('/api/shop/config');
        const siteConfig = await configRes.json();
        if (typeof renderCommonLayout === 'function') {
            renderCommonLayout('cart');
        } else if (typeof renderGlobalHeaders === 'function') {
            renderGlobalHeaders(siteConfig);
        }
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
 * 核心修复：标准化商品数据对象
 * 解决字段名不一致导致的图片/标题不显示问题
 */
function normalizeItem(item) {
    return {
        // 标题兼容：productName 或 name 或 title
        name: item.productName || item.name || item.title || '未命名商品',
        
        // 规格兼容：variantName 或 skuName 或 sku
        sku: item.variantName || item.variant || item.skuName || '默认规格',
        
        // 图片兼容：img 或 image 或 thumb 或 pic
        img: item.img || item.image || item.thumb || item.pic || '/assets/img/no-image.png',
        
        // 价格与数量
        price: parseFloat(item.price || 0),
        quantity: parseInt(item.quantity || 1),
        
        // 购买模式与预设信息
        buyMode: item.buyMode || 'auto',
        // 预设信息 (如选号的号码，或者输入的充值账号)
        inputData: item.selectedCardNote || item.input_data || item.customInfo || '',
        
        // 原始引用
        checked: item.checked !== false // 默认为 true
    };
}

/**
 * 加载购物车并渲染
 */
function loadCart() {
    try {
        cart = JSON.parse(localStorage.getItem('tbShopCart') || '[]');
        console.log("Debug Cart Data:", cart); // 调试用：在控制台查看真实数据
    } catch (e) {
        cart = [];
        console.error("Cart parse error", e);
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
    bindEvents();
}

/**
 * 渲染 PC 端列表项
 */
function renderPCItem(rawItem, index) {
    const item = normalizeItem(rawItem);
    const subtotal = (item.price * item.quantity).toFixed(2);
    
    // 构建“已选”显示逻辑：规格 + (预设信息 或 "默认随机")
    const specDisplay = `<span class="text-muted">${item.sku}</span>`;
    const extraInfo = item.inputData ? `<span class="text-primary ms-1">[${item.inputData}]</span>` : `<span class="text-muted ms-1">[默认随机]</span>`;
    
    return `
    <tr>
        <td class="ps-3">
            <input class="form-check-input cart-item-check-input" type="checkbox" data-index="${index}" ${item.checked ? 'checked' : ''}>
        </td>
        <td>
            <div class="d-flex align-items-center">
                <img src="${item.img}" class="pc-item-img me-2" alt="img" 
                     onerror="this.src='/assets/img/no-image.png'" 
                     style="width:48px;height:48px;object-fit:cover;border-radius:4px;border:1px solid #eee;">
                <div>
                    <div class="pc-cart-title text-dark" style="font-size:13px; font-weight:500;">${item.name}</div>
                    <div class="pc-cart-sku small" style="font-size:12px; color:#888;">
                        已选：${specDisplay}${extraInfo}
                    </div>
                </div>
            </div>
        </td>
        <td class="text-muted" style="font-size:13px;">¥${item.price.toFixed(2)}</td>
        <td>
            <div class="stepper" style="width:90px; height:26px; border:1px solid #ddd; display:flex; border-radius:3px;">
                <div class="stepper-btn minus d-flex align-items-center justify-content-center bg-light" 
                     data-index="${index}" style="width:26px; cursor:pointer; border-right:1px solid #ddd;">-</div>
                <input type="number" class="stepper-input text-center border-0" value="${item.quantity}" data-index="${index}" 
                       style="width:36px; font-size:13px; outline:none;">
                <div class="stepper-btn plus d-flex align-items-center justify-content-center bg-light" 
                     data-index="${index}" style="width:26px; cursor:pointer; border-left:1px solid #ddd;">+</div>
            </div>
        </td>
        <td><strong class="text-danger small">¥${subtotal}</strong></td>
        <td>
            <a href="javascript:void(0)" class="delete-btn text-muted small text-decoration-none" data-index="${index}">
                <i class="fa fa-trash-alt"></i>
            </a>
        </td>
    </tr>`;
}

/**
 * 渲染移动端列表项
 */
function renderMobileItem(rawItem, index) {
    const item = normalizeItem(rawItem);
    
    // 构建“已选”显示逻辑
    const infoText = item.inputData ? item.inputData : '默认随机';
    
    return `
    <div class="cart-item bg-white p-3 mb-2 rounded shadow-sm position-relative">
        <div class="d-flex">
            <div class="me-2 d-flex align-items-center">
                <input class="form-check-input cart-item-check-input" type="checkbox" data-index="${index}" ${item.checked ? 'checked' : ''}>
            </div>
            <img src="${item.img}" class="rounded" alt="img" 
                 onerror="this.src='/assets/img/no-image.png'"
                 style="width:70px; height:70px; object-fit:cover; border:1px solid #f0f0f0;">
            <div class="flex-grow-1 ms-2">
                <div class="text-truncate mb-1" style="font-size:14px; font-weight:bold; max-width:200px;">${item.name}</div>
                <div class="small text-muted bg-light px-2 py-1 rounded d-inline-block mb-2" style="font-size:12px;">
                    已选：${item.sku} <span class="text-primary">(${infoText})</span>
                </div>
                <div class="d-flex justify-content-between align-items-end">
                    <div class="text-danger fw-bold">¥${item.price.toFixed(2)}</div>
                    <div class="stepper d-flex border rounded" style="height:24px;">
                        <div class="stepper-btn minus px-2 d-flex align-items-center bg-light cursor-pointer" data-index="${index}">-</div>
                        <input type="number" class="stepper-input text-center border-0 border-start border-end" value="${item.quantity}" data-index="${index}" style="width:30px; font-size:12px; outline:none;">
                        <div class="stepper-btn plus px-2 d-flex align-items-center bg-light cursor-pointer" data-index="${index}">+</div>
                    </div>
                </div>
            </div>
        </div>
        <button class="delete-btn btn btn-sm text-muted position-absolute top-0 end-0 mt-2 me-2" 
                data-index="${index}" style="display:${isEditing?'block':'none'}">
            <i class="fa fa-times"></i>
        </button>
    </div>`;
}

/**
 * 交互逻辑与之前保持一致
 */
function selectCartPayment(method, el) {
    cartPaymentMethod = method;
    const lists = [document.getElementById('cart-payment-list-pc'), document.getElementById('cart-payment-list-mobile')];
    lists.forEach(list => {
        if(!list) return;
        list.querySelectorAll('.payment-select-box').forEach(box => box.classList.remove('active'));
        // 简单匹配：如果onclick内容包含该方法名
        const target = Array.from(list.children).find(child => 
            child.querySelector('.payment-select-box').getAttribute('onclick').includes(`'${method}'`)
        );
        if(target) target.querySelector('.payment-select-box').classList.add('active');
    });
}

function bindEvents() {
    // 复选框
    document.querySelectorAll('.cart-item-check-input').forEach(chk => {
        chk.addEventListener('change', (e) => {
            const idx = e.target.dataset.index;
            if(cart[idx]) {
                cart[idx].checked = e.target.checked;
                updateTotal();
            }
        });
    });
    
    // 数量加减
    document.querySelectorAll('.stepper-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            const idx = e.target.dataset.index;
            const isPlus = e.target.classList.contains('plus');
            changeQty(idx, isPlus ? 1 : -1);
        });
    });
    
    // 数量输入
    document.querySelectorAll('.stepper-input').forEach(input => {
        input.addEventListener('focus', e => e.target.select());
        input.addEventListener('change', e => {
            let val = parseInt(e.target.value);
            if(isNaN(val) || val < 1) val = 1;
            changeQty(e.target.dataset.index, 0, val);
        });
    });
    
    // 删除
    document.querySelectorAll('.delete-btn').forEach(btn => {
        btn.addEventListener('click', e => {
            // 找到最近的包含data-index的元素（因为可能点击的是i标签）
            const target = e.target.closest('.delete-btn');
            if(target) deleteItem(target.dataset.index);
        });
    });
}

function toggleEdit() {
    isEditing = !isEditing;
    const btn = document.getElementById('edit-btn-mobile');
    if(btn) btn.innerText = isEditing ? '完成' : '管理';
    loadCart(); // 重新渲染以切换删除按钮显示状态
}

function toggleCheckAll(source) {
    const checked = source.checked;
    cart.forEach(item => item.checked = checked);
    document.querySelectorAll('.cart-item-check-input').forEach(c => c.checked = checked);
    document.getElementById('check-all-pc').checked = checked;
    const mobileAll = document.getElementById('check-all-mobile-footer');
    if(mobileAll) mobileAll.checked = checked;
    updateTotal();
}

function updateTotal() {
    let total = 0;
    let count = 0;
    cart.forEach(item => {
        if(item.checked !== false) { // 默认为checked
            const p = parseFloat(item.price) || 0;
            const q = parseInt(item.quantity) || 1;
            total += p * q;
            count++;
        }
    });
    
    // 更新 PC 和 Mobile 的总价/数量
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

function changeQty(idx, delta, absVal=null) {
    if(!cart[idx]) return;
    let q = parseInt(cart[idx].quantity) || 1;
    if(absVal !== null) q = absVal;
    else q += delta;
    if(q < 1) q = 1;
    
    cart[idx].quantity = q;
    loadCart();
}

function deleteItem(idx) {
    if(confirm('确定删除该商品吗？')) {
        cart.splice(idx, 1);
        localStorage.setItem('tbShopCart', JSON.stringify(cart));
        loadCart();
    }
}

async function handleCheckout() {
    const selected = cart.filter(i => i.checked !== false);
    if(selected.length === 0) return alert('请选择要结算的商品');
    
    const contact = document.getElementById('contact-info').value.trim() || document.getElementById('contact-info-mobile').value.trim();
    const pass = document.getElementById('query-password').value.trim() || document.getElementById('query-password-mobile').value.trim();
    
    if(!contact) return alert('请输入联系方式');
    if(!pass || pass.length < 2) return alert('请输入查单密码 (至少2位)');
    
    localStorage.setItem('userContact', contact);
    localStorage.setItem('userPassword', pass);
    
    // 按钮 Loading 态
    const btns = document.querySelectorAll('button[onclick="handleCheckout()"]');
    btns.forEach(b => { b.disabled = true; b.innerText = '提交中...'; });
    
    try {
        const payload = {
            items: selected.map(normalizeItem), // 确保发送给后端的也是标准格式
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
        
        // 移除已结算商品
        const remaining = cart.filter(i => i.checked === false);
        localStorage.setItem('tbShopCart', JSON.stringify(remaining));
        
        window.location.href = `pay.html?order_id=${data.order_id}&method=${cartPaymentMethod}`;
    } catch(e) {
        alert('结算失败: ' + e.message);
        btns.forEach(b => { b.disabled = false; b.innerText = '立即结算'; });
    }
}
