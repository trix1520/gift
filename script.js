// Конфигурация API
const API_URL = window.location.origin.includes('localhost') 
    ? 'http://localhost:3000/api' 
    : '/api';

// Глобальные переменные
let userData = {
    id: null,
    username: 'Пользователь',
    telegram_id: null,
    isAdmin: false,
    isWorker: false,
    role: 'user',
    requisites: {
        tonWallet: null,
        card: null,
        cardBank: null,
        cardCurrency: null,
        telegram: null
    },
    stats: {
        completedDeals: 0,
        volumes: {}
    }
};

let orders = [];
let currentOrderData = {};
let currentStep = 1;
let tonPrice = 6.42;
let notificationCheckInterval = null;

// Курсы валют к USD
const exchangeRates = {
    'RUB': 0.011,
    'USD': 1,
    'EUR': 1.09,
    'KZT': 0.0022,
    'UAH': 0.024,
    'TON': 6.42,
    'STARS': 0.013
};

// ========== ОСНОВНАЯ ИНИЦИАЛИЗАЦИЯ ==========
document.addEventListener('DOMContentLoaded', async function() {
    console.log('🚀 GiftMarket инициализация...');
    
    // Загрузка языка
    const savedLang = localStorage.getItem('language') || 'ru';
    if (typeof currentLanguage !== 'undefined') {
        currentLanguage = savedLang;
    }
    
    document.querySelectorAll('.lang-btn').forEach(btn => {
        btn.classList.remove('active');
        if (btn.getAttribute('data-lang') === savedLang) {
            btn.classList.add('active');
        }
    });
    
    document.documentElement.lang = savedLang === 'ru' ? 'ru' : 'en';
    
    if (typeof updatePageTranslations === 'function') {
        updatePageTranslations();
    }
    
    // Инициализация пользователя
    await initUser();
    
    // Настройка интерфейса
    setupBottomNavigation();
    setupOrderCreation();
    startDealsHistory();
    setupAdminTrigger();
    
    // Загрузка данных
    await updateTonPrice();
    await checkOrderFromUrl();
    startNotificationPolling();
    
    console.log('✅ Инициализация завершена');
});

// ========== ПОЛЬЗОВАТЕЛЬ ==========
async function initUser() {
    try {
        let telegramId = localStorage.getItem('telegram_id');
        
        if (!telegramId) {
            telegramId = `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
            localStorage.setItem('telegram_id', telegramId);
        }

        const response = await fetch(`${API_URL}/users`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                username: 'Пользователь',
                telegram_id: telegramId
            })
        });

        if (!response.ok) {
            throw new Error('Ошибка сервера');
        }

        const user = await response.json();
        
        userData.id = user.id;
        userData.telegram_id = user.telegram_id;
        userData.username = user.username;
        userData.isAdmin = user.isAdmin;
        userData.isWorker = user.isWorker;
        userData.role = user.role;
        userData.requisites.tonWallet = user.ton_wallet;
        userData.requisites.card = user.card_number;
        userData.requisites.cardBank = user.card_bank;
        userData.requisites.cardCurrency = user.card_currency;
        userData.requisites.telegram = user.telegram_username;
        userData.stats.completedDeals = user.completed_deals;
        userData.stats.volumes = user.volumes || {};

        updateUserInterface();
        await loadUserOrders();
        
        if (userData.isAdmin) {
            showToast('👑 Админ доступ', 'Добро пожаловать в панель администратора!', 'success');
            setTimeout(() => loadAdminData(), 1000);
        } else if (userData.isWorker) {
            showToast('🛠️ Воркер доступ', 'Добро пожаловать в панель воркера!', 'success');
        }
        
    } catch (error) {
        console.error('Ошибка инициализации пользователя:', error);
        showToast(t('error'), t('serverError'), 'error');
        
        userData.telegram_id = localStorage.getItem('telegram_id') || `user_${Date.now()}`;
        userData.username = 'Пользователь';
        updateUserInterface();
    }
}

async function loadUserOrders() {
    try {
        const response = await fetch(`${API_URL}/users/${userData.telegram_id}/orders`);
        if (response.ok) {
            const data = await response.json();
            orders = data;
            updateOrdersList();
        }
    } catch (error) {
        console.error('Ошибка загрузки ордеров:', error);
    }
}

// ========== НАВИГАЦИЯ ==========
function setupBottomNavigation() {
    const navItems = document.querySelectorAll('.bottom-nav-item');
    navItems.forEach(function(item) {
        item.addEventListener('click', function() {
            const page = this.getAttribute('data-page');
            showPage(page);
            
            navItems.forEach(function(nav) {
                nav.classList.remove('active');
            });
            this.classList.add('active');
        });
    });
}

function showPage(pageName) {
    const pages = document.querySelectorAll('.page');
    pages.forEach(function(page) {
        page.classList.remove('active');
    });
    
    const targetPage = document.getElementById('page-' + pageName);
    if (targetPage) {
        targetPage.classList.add('active');
        window.scrollTo(0, 0);
    }
    
    const navItems = document.querySelectorAll('.bottom-nav-item');
    navItems.forEach(function(nav) {
        nav.classList.remove('active');
        if (nav.getAttribute('data-page') === pageName) {
            nav.classList.add('active');
        }
    });
    
    if (pageName === 'orders') {
        updateOrdersList();
    } else if (pageName === 'profile' && userData.isAdmin) {
        loadAdminData();
    }
}

// ========== РЕКВИЗИТЫ ==========
async function saveTonWallet() {
    const walletInput = document.getElementById('tonWalletInput');
    const wallet = walletInput.value.trim();
    
    if (!wallet) {
        showToast(t('error'), t('enterWallet'), 'error');
        return;
    }
    
    try {
        const response = await fetch(`${API_URL}/users/${userData.telegram_id}/requisites`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                ton_wallet: wallet
            })
        });
        
        if (response.ok) {
            const user = await response.json();
            userData.requisites.tonWallet = user.ton_wallet;
            updateUserInterface();
            showToast(t('success'), t('tonWalletSaved'), 'success');
        } else {
            showToast(t('error'), t('saveError'), 'error');
        }
    } catch (error) {
        console.error('Ошибка сохранения TON кошелька:', error);
        showToast(t('error'), t('saveError'), 'error');
    }
}

function editTonWallet() {
    const walletInput = document.getElementById('tonWalletInput');
    walletInput.value = userData.requisites.tonWallet || '';
    
    document.getElementById('tonWalletDisplay').classList.add('hidden');
    document.getElementById('tonWalletForm').classList.remove('hidden');
}

async function saveCard() {
    const cardNumber = document.getElementById('cardNumberInput').value.trim();
    const cardBank = document.getElementById('cardBankInput').value.trim();
    const cardCurrency = document.getElementById('cardCurrencyInput').value;
    
    if (!cardNumber || !cardBank) {
        showToast(t('error'), t('fillAllFields'), 'error');
        return;
    }
    
    try {
        const response = await fetch(`${API_URL}/users/${userData.telegram_id}/requisites`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                card_number: cardNumber,
                card_bank: cardBank,
                card_currency: cardCurrency
            })
        });
        
        if (response.ok) {
            const user = await response.json();
            userData.requisites.card = user.card_number;
            userData.requisites.cardBank = user.card_bank;
            userData.requisites.cardCurrency = user.card_currency;
            updateUserInterface();
            showToast(t('success'), t('bankCardSaved'), 'success');
        } else {
            showToast(t('error'), t('saveError'), 'error');
        }
    } catch (error) {
        console.error('Ошибка сохранения карты:', error);
        showToast(t('error'), t('saveError'), 'error');
    }
}

function editCard() {
    document.getElementById('cardNumberInput').value = userData.requisites.card || '';
    document.getElementById('cardBankInput').value = userData.requisites.cardBank || '';
    document.getElementById('cardCurrencyInput').value = userData.requisites.cardCurrency || 'RUB';
    
    document.getElementById('cardDisplay').classList.add('hidden');
    document.getElementById('cardForm').classList.remove('hidden');
}

async function saveTelegram() {
    const telegram = document.getElementById('telegramInput').value.trim();
    
    if (!telegram) {
        showToast(t('error'), 'Введите Telegram username', 'error');
        return;
    }
    
    try {
        const response = await fetch(`${API_URL}/users/${userData.telegram_id}/requisites`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                telegram_username: telegram
            })
        });
        
        if (response.ok) {
            const user = await response.json();
            userData.requisites.telegram = user.telegram_username;
            updateUserInterface();
            showToast(t('success'), t('telegramSaved'), 'success');
        } else {
            showToast(t('error'), t('saveError'), 'error');
        }
    } catch (error) {
        console.error('Ошибка сохранения Telegram:', error);
        showToast(t('error'), t('saveError'), 'error');
    }
}

function editTelegram() {
    document.getElementById('telegramInput').value = userData.requisites.telegram || '';
    
    document.getElementById('telegramDisplay').classList.add('hidden');
    document.getElementById('telegramForm').classList.remove('hidden');
}

// ========== СОЗДАНИЕ ОРДЕРА ==========
function setupOrderCreation() {
    document.getElementById('createOrderBtn')?.addEventListener('click', showCreateOrderForm);
    document.getElementById('createOrderBtn2')?.addEventListener('click', showCreateOrderForm);
    
    document.querySelectorAll('[data-type]').forEach(item => {
        item.addEventListener('click', function() {
            document.querySelectorAll('[data-type]').forEach(i => i.classList.remove('selected'));
            this.classList.add('selected');
            currentOrderData.type = this.getAttribute('data-type');
            nextStep(2);
        });
    });
    
    document.querySelectorAll('[data-payment]').forEach(item => {
        item.addEventListener('click', function() {
            document.querySelectorAll('[data-payment]').forEach(i => i.classList.remove('selected'));
            this.classList.add('selected');
            currentOrderData.payment_method = this.getAttribute('data-payment');
            nextStep(3);
        });
    });
    
    document.getElementById('createOrderSubmit')?.addEventListener('click', createOrder);
}

function showCreateOrderForm() {
    document.getElementById('ordersListContainer')?.classList.add('hidden');
    document.getElementById('ordersList')?.classList.add('hidden');
    document.getElementById('createOrderForm')?.classList.remove('hidden');
    
    resetOrderForm();
}

function cancelOrderCreation() {
    document.getElementById('ordersListContainer')?.classList.remove('hidden');
    document.getElementById('createOrderForm')?.classList.add('hidden');
    
    if (orders.length > 0) {
        document.getElementById('ordersList')?.classList.remove('hidden');
    }
}

function resetOrderForm() {
    currentStep = 1;
    currentOrderData = {};
    
    document.querySelectorAll('.form-step').forEach(step => {
        step.classList.add('hidden');
    });
    document.getElementById('step1')?.classList.remove('hidden');
    
    document.querySelectorAll('[data-type], [data-payment]').forEach(item => {
        item.classList.remove('selected');
    });
    
    document.getElementById('orderAmount').value = '';
    document.getElementById('orderDescription').value = '';
}

function nextStep(stepNumber) {
    document.querySelectorAll('.form-step').forEach(step => {
        step.classList.add('hidden');
    });
    document.getElementById('step' + stepNumber)?.classList.remove('hidden');
    currentStep = stepNumber;
}

function previousStep(stepNumber) {
    document.querySelectorAll('.form-step').forEach(step => {
        step.classList.add('hidden');
    });
    document.getElementById('step' + stepNumber)?.classList.remove('hidden');
    currentStep = stepNumber;
}

async function createOrder() {
    const amount = document.getElementById('orderAmount').value.trim();
    const description = document.getElementById('orderDescription').value.trim();
    
    if (!currentOrderData.type || !currentOrderData.payment_method || !amount || !description) {
        showToast(t('error'), t('fillAllFields'), 'error');
        return;
    }
    
    if (currentOrderData.payment_method === 'ton' && !userData.requisites.tonWallet) {
        showToast(t('error'), t('addTonWallet'), 'error');
        return;
    }
    
    if (currentOrderData.payment_method === 'card' && !userData.requisites.card) {
        showToast(t('error'), t('addBankCard'), 'error');
        return;
    }
    
    if (currentOrderData.payment_method === 'stars' && !userData.requisites.telegram) {
        showToast(t('error'), t('addTelegram'), 'error');
        return;
    }
    
    let currency = 'RUB';
    if (currentOrderData.payment_method === 'ton') {
        currency = 'TON';
    } else if (currentOrderData.payment_method === 'stars') {
        currency = 'STARS';
    }
    
    try {
        const response = await fetch(`${API_URL}/orders`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                seller_telegram_id: userData.telegram_id,
                type: currentOrderData.type,
                payment_method: currentOrderData.payment_method,
                amount: parseFloat(amount),
                currency: currency,
                description: description
            })
        });
        
        if (response.ok) {
            const order = await response.json();
            
            showModal(t('orderCreatedTitle'), `
                <div class="modal-info-box">
                    <p><strong>${t('code')}</strong> ${order.code}</p>
                    <p><strong>${t('type')}</strong> ${t(currentOrderData.type)}</p>
                    <p><strong>${t('amount')}</strong> ${order.amount} ${order.currency}</p>
                    <p><strong>${t('description')}</strong> ${order.description}</p>
                </div>
                <div class="modal-info-box">
                    <p><strong>${t('buyerLink')}</strong></p>
                    <div class="order-link">${window.location.origin}?order=${order.code}</div>
                    <button class="btn btn-primary btn-full" onclick="copyOrderLink('${order.code}'); closeModal();">
                        <i class="fas fa-copy"></i> ${t('copyLink')}
                    </button>
                </div>
            `);
            
            await loadUserOrders();
            cancelOrderCreation();
            
        } else {
            const error = await response.json();
            showToast(t('error'), error.error || t('createOrderError'), 'error');
        }
    } catch (error) {
        console.error('Ошибка создания ордера:', error);
        showToast(t('error'), t('createOrderError'), 'error');
    }
}

// ========== УПРАВЛЕНИЕ ОРДЕРАМИ ==========
function updateOrdersList() {
    const ordersList = document.getElementById('ordersList');
    const ordersListContainer = document.getElementById('ordersListContainer');
    
    if (!ordersList || !ordersListContainer) return;
    
    if (orders.length === 0) {
        ordersList.classList.add('hidden');
        ordersListContainer.classList.remove('hidden');
    } else {
        ordersListContainer.classList.add('hidden');
        ordersList.classList.remove('hidden');
        
        ordersList.innerHTML = '';
        orders.sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
            .forEach(order => {
                ordersList.appendChild(createOrderCard(order));
            });
    }
}

function createOrderCard(order) {
    const card = document.createElement('div');
    card.className = 'order-card';
    
    let statusClass = 'status-active';
    let statusText = t('statusActive');
    
    if (order.status === 'paid') {
        statusClass = 'status-paid';
        statusText = t('statusPaid');
    } else if (order.status === 'completed') {
        statusClass = 'status-completed';
        statusText = t('statusCompleted');
    } else if (order.status === 'cancelled') {
        statusClass = 'status-cancelled';
        statusText = 'Отменен';
    }
    
    let typeText = '';
    switch(order.type) {
        case 'nft_gift':
            typeText = t('nftGift');
            break;
        case 'nft_username':
            typeText = t('nftUsername');
            break;
        case 'nft_number':
            typeText = t('nftNumber');
            break;
        default:
            typeText = order.type;
    }
    
    let paymentText = '';
    switch(order.payment_method) {
        case 'ton':
            paymentText = t('tonWallet');
            break;
        case 'card':
            paymentText = t('bankCard');
            break;
        case 'stars':
            paymentText = t('telegramStars');
            break;
        default:
            paymentText = order.payment_method;
    }
    
    const isSeller = order.seller_telegram_id === userData.telegram_id;
    const isBuyer = order.buyer_telegram_id === userData.telegram_id;
    
    card.innerHTML = `
        <div class="order-header">
            <div class="order-code">#${order.code}</div>
            <div class="order-status ${statusClass}">${statusText}</div>
        </div>
        
        <div class="order-details">
            <div class="order-detail">
                <span class="detail-label">${t('type')}</span>
                <span class="detail-value">${typeText}</span>
            </div>
            <div class="order-detail">
                <span class="detail-label">${t('payment')}</span>
                <span class="detail-value">${paymentText}</span>
            </div>
            <div class="order-detail">
                <span class="detail-label">${t('amount')}</span>
                <span class="detail-value">${order.amount} ${order.currency}</span>
            </div>
            <div class="order-detail">
                <span class="detail-label">${t('description')}</span>
                <span class="detail-value">${order.description}</span>
            </div>
            ${isSeller ? `
                <div class="order-detail">
                    <span class="detail-label">${t('requisitesLabel')}</span>
                    <span class="detail-value">${order.seller_requisites}</span>
                </div>
            ` : ''}
        </div>
        
        <div class="order-link">
            ${t('link')}: ${window.location.origin}?order=${order.code}
        </div>
        
        <div class="order-actions">
            ${order.status === 'active' ? `
                <button class="btn btn-secondary btn-small" onclick="copyOrderLink('${order.code}')">
                    <i class="fas fa-copy"></i> ${t('copyLink')}
                </button>
                ${isBuyer ? `
                    <button class="btn btn-primary btn-small" onclick="confirmPayment(${order.id})">
                        <i class="fas fa-check"></i> ${t('iPaid')}
                    </button>
                ` : ''}
                ${isSeller && order.buyer_telegram_id ? `
                    <button class="btn btn-success btn-small" onclick="confirmTransfer(${order.id})">
                        <i class="fas fa-exchange-alt"></i> ${t('assetTransferred')}
                    </button>
                ` : ''}
                ${(userData.isAdmin || userData.isWorker) && !isBuyer && !isSeller ? `
                    <button class="btn btn-warning btn-small" onclick="adminConfirmPayment(${order.id})">
                        <i class="fas fa-user-shield"></i> ${t('adminPaid')}
                    </button>
                ` : ''}
            ` : ''}
            ${order.status === 'paid' && isBuyer ? `
                <button class="btn btn-success btn-small" onclick="confirmReceipt(${order.id})">
                    <i class="fas fa-check-double"></i> ${t('confirmReceipt')}
                </button>
            ` : ''}
            <button class="btn btn-secondary btn-small" onclick="showOrderDetailsModal(${order.id})">
                <i class="fas fa-info-circle"></i> Подробнее
            </button>
        </div>
    `;
    
    return card;
}

// ========== ДЕЙСТВИЯ С ОРДЕРАМИ ==========
function copyOrderLink(orderCode) {
    const link = `${window.location.origin}?order=${orderCode}`;
    navigator.clipboard.writeText(link).then(() => {
        showToast(t('success'), t('linkCopied'), 'success');
    }).catch(() => {
        const textarea = document.createElement('textarea');
        textarea.value = link;
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
        showToast(t('success'), t('linkCopied'), 'success');
    });
}

async function confirmPayment(orderId) {
    try {
        const response = await fetch(`${API_URL}/orders/${orderId}/status`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                status: 'paid',
                user_telegram_id: userData.telegram_id
            })
        });
        
        if (response.ok) {
            showToast(t('success'), t('paymentConfirmed'), 'success');
            await loadUserOrders();
        } else {
            const error = await response.json();
            showToast(t('error'), error.error || t('confirmPaymentError'), 'error');
        }
    } catch (error) {
        console.error('Ошибка подтверждения оплаты:', error);
        showToast(t('error'), t('confirmPaymentError'), 'error');
    }
}

async function adminConfirmPayment(orderId) {
    if (!userData.isAdmin && !userData.isWorker) {
        showToast(t('error'), 'Только админы и воркеры могут это делать', 'error');
        return;
    }
    
    try {
        const response = await fetch(`${API_URL}/orders/${orderId}/fake-payment`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                worker_telegram_id: userData.telegram_id
            })
        });
        
        if (response.ok) {
            showToast(t('success'), 'Фейковая оплата подтверждена', 'success');
            await loadUserOrders();
        } else {
            const error = await response.json();
            showToast(t('error'), error.error || 'Ошибка', 'error');
        }
    } catch (error) {
        console.error('Ошибка подтверждения оплаты:', error);
        showToast(t('error'), 'Ошибка сервера', 'error');
    }
}

function confirmTransfer(orderId) {
    const order = orders.find(o => o.id === orderId);
    if (!order) return;
    
    showModal(t('confirmTransferTitle'), `
        <div class="modal-info-box">
            <p><strong>${t('deal')}</strong> #${order.code}</p>
            <p><strong>${t('amount')}</strong> ${order.amount} ${order.currency}</p>
            <p><strong>Покупатель</strong> ${order.buyer_username}</p>
        </div>
        <p>${t('confirmTransferText')}</p>
        <p><small>${t('confirmTransferNote')}</small></p>
        <div class="modal-actions" style="display: flex; gap: 10px; margin-top: 20px;">
            <button class="btn btn-secondary" onclick="closeModal()" style="flex: 1;">
                ${t('cancel')}
            </button>
            <button class="btn btn-primary" onclick="actuallyConfirmTransfer(${orderId})" style="flex: 1;">
                ${t('confirm')}
            </button>
        </div>
    `);
}

async function actuallyConfirmTransfer(orderId) {
    try {
        const response = await fetch(`${API_URL}/orders/${orderId}/status`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                status: 'completed',
                user_telegram_id: userData.telegram_id
            })
        });
        
        if (response.ok) {
            showToast(t('success'), t('buyerNotified'), 'success');
            await loadUserOrders();
            closeModal();
            showCompletionModal(orderId);
        } else {
            const error = await response.json();
            showToast(t('error'), error.error || t('completeDealError'), 'error');
        }
    } catch (error) {
        console.error('Ошибка подтверждения передачи:', error);
        showToast(t('error'), t('completeDealError'), 'error');
    }
}

async function confirmReceipt(orderId) {
    try {
        const response = await fetch(`${API_URL}/orders/${orderId}/status`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                status: 'completed',
                user_telegram_id: userData.telegram_id
            })
        });
        
        if (response.ok) {
            showToast(t('success'), t('dealCompleted'), 'success');
            await loadUserOrders();
            showCompletionModal(orderId);
        } else {
            const error = await response.json();
            showToast(t('error'), error.error || t('completeDealError'), 'error');
        }
    } catch (error) {
        console.error('Ошибка подтверждения получения:', error);
        showToast(t('error'), t('completeDealError'), 'error');
    }
}

function showCompletionModal(orderId) {
    const order = orders.find(o => o.id === orderId);
    if (!order) return;
    
    showModal(t('dealCompletedTitle'), `
        <div class="modal-info-box">
            <p><strong>${t('orderNumber')}</strong> ${order.code}</p>
            <p><strong>${t('amount')}</strong> ${order.amount} ${order.currency}</p>
            <p><strong>${t('type')}</strong> ${order.type}</p>
        </div>
        <p>${t('dealCompletedText')}</p>
        <div class="modal-actions" style="margin-top: 20px;">
            <button class="btn btn-success btn-full" onclick="closeModal()">
                ${t('great')}
            </button>
        </div>
    `);
}

function showOrderDetailsModal(orderId) {
    const order = orders.find(o => o.id === orderId);
    if (!order) return;
    
    let typeText = '';
    switch(order.type) {
        case 'nft_gift':
            typeText = t('nftGift');
            break;
        case 'nft_username':
            typeText = t('nftUsername');
            break;
        case 'nft_number':
            typeText = t('nftNumber');
            break;
        default:
            typeText = order.type;
    }
    
    let paymentText = '';
    switch(order.payment_method) {
        case 'ton':
            paymentText = t('tonWallet');
            break;
        case 'card':
            paymentText = t('bankCard');
            break;
        case 'stars':
            paymentText = t('telegramStars');
            break;
        default:
            paymentText = order.payment_method;
    }
    
    let statusText = t('statusActive');
    let statusColor = '#4CAF50';
    if (order.status === 'paid') {
        statusText = t('statusPaid');
        statusColor = '#FF9800';
    } else if (order.status === 'completed') {
        statusText = t('statusCompleted');
        statusColor = '#2196F3';
    } else if (order.status === 'cancelled') {
        statusText = 'Отменен';
        statusColor = '#F44336';
    }
    
    const isSeller = order.seller_telegram_id === userData.telegram_id;
    const isBuyer = order.buyer_telegram_id === userData.telegram_id;
    const canJoin = !isSeller && !isBuyer && order.status === 'active';
    
    showModal(`Ордер #${order.code}`, `
        <div style="margin-bottom: 20px;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;">
                <div>
                    <div style="font-size: 12px; color: #666;">Статус</div>
                    <div style="padding: 4px 12px; background: ${statusColor}; color: white; border-radius: 12px; display: inline-block; font-weight: 600;">
                        ${statusText}
                    </div>
                </div>
                <div style="text-align: right;">
                    <div style="font-size: 12px; color: #666;">Сумма</div>
                    <div style="font-size: 20px; font-weight: 700;">${order.amount} ${order.currency}</div>
                </div>
            </div>
            
            <div style="background: #f5f5f5; padding: 15px; border-radius: 8px; margin-bottom: 15px;">
                <div style="font-size: 14px; color: #666; margin-bottom: 5px;">${t('description')}</div>
                <div>${order.description}</div>
            </div>
            
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 15px;">
                <div style="background: #f9f9f9; padding: 10px; border-radius: 6px;">
                    <div style="font-size: 12px; color: #666;">Тип сделки</div>
                    <div style="font-weight: 600;">${typeText}</div>
                </div>
                <div style="background: #f9f9f9; padding: 10px; border-radius: 6px;">
                    <div style="font-size: 12px; color: #666;">Способ оплаты</div>
                    <div style="font-weight: 600;">${paymentText}</div>
                </div>
            </div>
            
            <div style="background: #f5f5f5; padding: 15px; border-radius: 8px; margin-bottom: 15px;">
                <div style="font-size: 14px; color: #666; margin-bottom: 5px;">Участники</div>
                <div style="display: flex; justify-content: space-between;">
                    <div>
                        <div style="font-size: 12px; color: #666;">Продавец</div>
                        <div style="font-weight: 600;">${order.seller_username}</div>
                    </div>
                    <div style="text-align: right;">
                        <div style="font-size: 12px; color: #666;">Покупатель</div>
                        <div style="font-weight: 600;">${order.buyer_username || 'Нет'}</div>
                    </div>
                </div>
            </div>
            
            ${isSeller ? `
                <div style="background: #e8f5e9; padding: 15px; border-radius: 8px; margin-bottom: 15px;">
                    <div style="font-size: 14px; color: #666; margin-bottom: 5px;">Ваши реквизиты</div>
                    <div style="font-family: monospace; font-size: 14px; word-break: break-all;">${order.seller_requisites}</div>
                </div>
            ` : ''}
            
            <div style="font-size: 12px; color: #999; margin-bottom: 15px;">
                Создан: ${new Date(order.created_at).toLocaleString()}
                ${order.updated_at !== order.created_at ? `<br>Обновлен: ${new Date(order.updated_at).toLocaleString()}` : ''}
            </div>
        </div>
        
        <div style="display: flex; flex-direction: column; gap: 10px;">
            ${canJoin ? `
                <button class="btn btn-primary" onclick="joinOrder(${order.id})">
                    <i class="fas fa-shopping-cart"></i> Присоединиться к сделке
                </button>
            ` : ''}
            
            ${order.status === 'active' ? `
                ${isBuyer ? `
                    <button class="btn btn-success" onclick="confirmPayment(${order.id}); closeModal();">
                        <i class="fas fa-check"></i> Подтвердить оплату
                    </button>
                ` : ''}
                
                ${isSeller && order.buyer_telegram_id ? `
                    <button class="btn btn-success" onclick="confirmTransfer(${order.id}); closeModal();">
                        <i class="fas fa-exchange-alt"></i> Подтвердить передачу актива
                    </button>
                ` : ''}
                
                ${(userData.isAdmin || userData.isWorker) && !isBuyer && !isSeller ? `
                    <button class="btn btn-warning" onclick="adminConfirmPayment(${order.id}); closeModal();">
                        <i class="fas fa-user-shield"></i> Подтвердить фейковую оплату
                    </button>
                ` : ''}
            ` : ''}
            
            ${order.status === 'paid' && isBuyer ? `
                <button class="btn btn-success" onclick="confirmReceipt(${order.id}); closeModal();">
                    <i class="fas fa-check-double"></i> Подтвердить получение
                </button>
            ` : ''}
            
            <button class="btn btn-secondary" onclick="copyOrderLink('${order.code}'); closeModal();">
                <i class="fas fa-copy"></i> Копировать ссылку
            </button>
        </div>
    `);
}

// ========== ПРИСОЕДИНЕНИЕ К ОРДЕРУ ==========
async function joinOrder(orderId) {
    const order = orders.find(o => o.id === orderId);
    if (!order) return;
    
    if (order.seller_telegram_id === userData.telegram_id) {
        showToast(t('error'), t('cannotBuyOwnOrder'), 'error');
        return;
    }
    
    try {
        const response = await fetch(`${API_URL}/orders/${orderId}/join`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                buyer_telegram_id: userData.telegram_id
            })
        });
        
        if (response.ok) {
            showToast(t('success'), t('connectedToOrder'), 'success');
            await loadUserOrders();
        } else {
            const error = await response.json();
            showToast(t('error'), error.error || t('joinOrderError'), 'error');
        }
    } catch (error) {
        console.error('Ошибка подключения к ордеру:', error);
        showToast(t('error'), t('joinOrderError'), 'error');
    }
}

// ========== АДМИН ПАНЕЛЬ ==========
async function loadAdminData() {
    if (!userData.isAdmin) return;
    
    try {
        const usersResponse = await fetch(`${API_URL}/admin/users?admin_telegram_id=${userData.telegram_id}`);
        if (usersResponse.ok) {
            const usersList = await usersResponse.json();
            updateAdminUsersList(usersList);
        }
        
        const workersResponse = await fetch(`${API_URL}/admin/workers?admin_telegram_id=${userData.telegram_id}`);
        if (workersResponse.ok) {
            const workersList = await workersResponse.json();
            updateAdminWorkersList(workersList);
        }
        
        const statsResponse = await fetch(`${API_URL}/admin/stats?admin_telegram_id=${userData.telegram_id}`);
        if (statsResponse.ok) {
            const stats = await statsResponse.json();
            updatePlatformStats(stats);
        }
        
    } catch (error) {
        console.error('Ошибка загрузки данных админа:', error);
    }
}

function updateAdminUsersList(usersList) {
    const container = document.getElementById('adminUsersList');
    if (!container) return;
    
    container.innerHTML = usersList.map(user => `
        <div class="admin-user-card" style="background: #f8f9fa; padding: 12px; border-radius: 8px; margin-bottom: 10px; border-left: 4px solid ${user.role === 'admin' ? '#dc3545' : user.role === 'worker' ? '#ffc107' : '#28a745'};">
            <div style="display: flex; justify-content: space-between; align-items: center;">
                <div>
                    <strong>${user.username}</strong>
                    <div style="font-size: 12px; color: #666;">${user.telegram_id}</div>
                </div>
                <div style="text-align: right;">
                    <div style="font-size: 12px; padding: 4px 8px; background: ${user.role === 'admin' ? '#dc3545' : user.role === 'worker' ? '#ffc107' : '#28a745'}; color: white; border-radius: 4px; display: inline-block;">
                        ${user.role === 'admin' ? 'Админ' : user.role === 'worker' ? 'Воркер' : 'Пользователь'}
                    </div>
                </div>
            </div>
            <div style="font-size: 12px; color: #666; margin-top: 8px;">
                Сделок: ${user.completed_deals} | 
                Объем: $${Object.values(user.total_volume || {}).reduce((sum, vol) => sum + vol, 0).toFixed(2)}
            </div>
            ${user.role !== 'admin' ? `
                <div style="display: flex; gap: 5px; margin-top: 8px;">
                    <button class="btn btn-warning btn-small" onclick="promoteToWorker('${user.telegram_id}')" style="flex: 1;">
                        <i class="fas fa-user-shield"></i> Воркер
                    </button>
                    <button class="btn btn-danger btn-small" onclick="promoteToAdmin('${user.telegram_id}')" style="flex: 1;">
                        <i class="fas fa-crown"></i> Админ
                    </button>
                </div>
            ` : ''}
        </div>
    `).join('');
}

function updateAdminWorkersList(workersList) {
    const container = document.getElementById('adminWorkersList');
    if (!container) return;
    
    container.innerHTML = workersList.map(worker => `
        <div class="admin-worker-card" style="background: #fff3cd; padding: 12px; border-radius: 8px; margin-bottom: 10px; border-left: 4px solid #ffc107;">
            <div style="display: flex; justify-content: space-between; align-items: center;">
                <div>
                    <strong>${worker.username}</strong>
                    <div style="font-size: 12px; color: #666;">${worker.telegram_id}</div>
                </div>
                <div>
                    <button class="btn btn-danger btn-small" onclick="removeWorker('${worker.telegram_id}')">
                        <i class="fas fa-trash"></i> Удалить
                    </button>
                </div>
            </div>
            <div style="font-size: 12px; color: #666; margin-top: 8px;">
                Сделок: ${worker.completed_deals} | 
                Объем: $${Object.values(worker.total_volume || {}).reduce((sum, vol) => sum + vol, 0).toFixed(2)}
            </div>
        </div>
    `).join('');
}

function updatePlatformStats(stats) {
    const totalUsers = document.getElementById('totalUsers');
    const totalOrders = document.getElementById('totalOrders');
    const platformVolume = document.getElementById('platformVolume');
    
    if (totalUsers) totalUsers.textContent = stats.totalUsers;
    if (totalOrders) totalOrders.textContent = stats.totalOrders;
    if (platformVolume) platformVolume.textContent = `$${parseFloat(stats.totalVolume).toFixed(2)}`;
}

async function promoteToWorker(telegramId) {
    if (!userData.isAdmin) {
        showToast('Ошибка', 'Только админы могут назначать воркеров', 'error');
        return;
    }
    
    try {
        const response = await fetch(`${API_URL}/admin/workers/add`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                admin_telegram_id: userData.telegram_id,
                worker_telegram_id: telegramId,
                worker_username: `Воркер ${telegramId}`
            })
        });

        if (response.ok) {
            showToast('Успешно', 'Пользователь назначен воркером', 'success');
            loadAdminData();
        } else {
            const error = await response.json();
            showToast('Ошибка', error.error, 'error');
        }
    } catch (error) {
        console.error('Ошибка назначения воркера:', error);
        showToast('Ошибка', 'Не удалось назначить воркера', 'error');
    }
}

async function promoteToAdmin(telegramId) {
    if (!userData.isAdmin) {
        showToast('Ошибка', 'Только админы могут назначать админов', 'error');
        return;
    }
    
    if (!confirm(`Вы уверены, что хотите назначить пользователя ${telegramId} администратором?`)) {
        return;
    }
    
    try {
        const response = await fetch(`${API_URL}/admin/promote`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                admin_telegram_id: userData.telegram_id,
                user_telegram_id: telegramId
            })
        });

        if (response.ok) {
            showToast('Успешно', 'Пользователь назначен администратором', 'success');
            loadAdminData();
        } else {
            const error = await response.json();
            showToast('Ошибка', error.error, 'error');
        }
    } catch (error) {
        console.error('Ошибка назначения админа:', error);
        showToast('Ошибка', 'Не удалось назначить админа', 'error');
    }
}

async function addNewWorker() {
    const telegramId = document.getElementById('newWorkerTelegramId').value.trim();
    const username = document.getElementById('newWorkerUsername').value.trim();
    
    if (!telegramId || !username) {
        showToast('Ошибка', 'Заполните все поля', 'error');
        return;
    }
    
    try {
        const response = await fetch(`${API_URL}/admin/workers/add`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                admin_telegram_id: userData.telegram_id,
                worker_telegram_id: telegramId,
                worker_username: username
            })
        });

        if (response.ok) {
            const result = await response.json();
            showToast('Успешно', result.message, 'success');
            document.getElementById('newWorkerTelegramId').value = '';
            document.getElementById('newWorkerUsername').value = '';
            loadAdminData();
        } else {
            const error = await response.json();
            showToast('Ошибка', error.error, 'error');
        }
    } catch (error) {
        console.error('Ошибка добавления воркера:', error);
        showToast('Ошибка', 'Не удалось добавить воркера', 'error');
    }
}

async function removeWorker(workerTelegramId) {
    if (!confirm(`Вы уверены, что хотите удалить воркера ${workerTelegramId}?`)) {
        return;
    }
    
    try {
        const response = await fetch(`${API_URL}/admin/workers/remove`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                admin_telegram_id: userData.telegram_id,
                worker_telegram_id: workerTelegramId
            })
        });

        if (response.ok) {
            const result = await response.json();
            showToast('Успешно', result.message, 'success');
            loadAdminData();
        } else {
            const error = await response.json();
            showToast('Ошибка', error.error, 'error');
        }
    } catch (error) {
        console.error('Ошибка удаления воркера:', error);
        showToast('Ошибка', 'Не удалось удалить воркера', 'error');
    }
}

// ========== ВОРКЕР ПАНЕЛЬ ==========
function showAdminWorkerUI() {
    const ordersPage = document.getElementById('page-orders');
    
    if (ordersPage && !document.getElementById('workerPanelBtn')) {
        const workerBtn = document.createElement('button');
        workerBtn.id = 'workerPanelBtn';
        workerBtn.className = 'btn btn-warning btn-full';
        workerBtn.style.marginTop = '20px';
        workerBtn.style.marginBottom = '20px';
        workerBtn.innerHTML = `<i class="fas fa-user-shield"></i> Панель ${userData.isAdmin ? 'Администратора' : 'Воркера'}`;
        workerBtn.onclick = showWorkerPanel;
        ordersPage.appendChild(workerBtn);
    }
    
    if (userData.isAdmin) {
        const adminPanel = document.getElementById('adminPanel');
        if (adminPanel) {
            adminPanel.classList.remove('hidden');
        }
    }
}

function showWorkerPanel() {
    const isAdmin = userData.isAdmin;
    
    showModal(`🛠️ Панель ${isAdmin ? 'Администратора' : 'Воркера'}`, `
        <div class="worker-panel">
            <h3>Быстрые действия</h3>
            <p>Вы можете быстро подтвердить оплату или завершить сделку</p>
            
            <div class="active-orders">
                <h4>Активные ордера:</h4>
                <div id="workerOrdersList" style="max-height: 300px; overflow-y: auto; margin: 15px 0;">
                    ${orders.filter(o => o.status === 'active' || o.status === 'paid').map(order => `
                        <div class="worker-order-card" style="background: #f8f9fa; padding: 12px; border-radius: 8px; margin-bottom: 10px; border-left: 4px solid ${order.status === 'active' ? '#ffc107' : '#28a745'};">
                            <div style="display: flex; justify-content: space-between; align-items: center;">
                                <div>
                                    <strong>#${order.code}</strong>
                                    <div style="font-size: 12px; color: #666;">${order.seller_username}</div>
                                </div>
                                <div style="text-align: right;">
                                    <div><strong>${order.amount} ${order.currency}</strong></div>
                                    <div style="font-size: 12px; color: ${order.status === 'active' ? '#ffc107' : '#28a745'}">
                                        ${order.status === 'active' ? 'Ожидает оплаты' : 'Оплачен'}
                                    </div>
                                </div>
                            </div>
                            <div style="font-size: 13px; color: #666; margin: 8px 0;">${order.description}</div>
                            <div style="display: flex; gap: 10px; margin-top: 10px;">
                                ${order.status === 'active' ? `
                                    <button class="btn btn-success btn-small" onclick="fakePayment(${order.id})" style="flex: 1;">
                                        <i class="fas fa-check"></i> Подтвердить оплату
                                    </button>
                                ` : ''}
                                <button class="btn btn-primary btn-small" onclick="fastCompleteOrder(${order.id})" style="flex: 1;">
                                    <i class="fas fa-bolt"></i> Быстро завершить
                                </button>
                            </div>
                        </div>
                    `).join('') || '<p style="text-align: center; color: #999; padding: 20px;">Нет активных ордеров</p>'}
                </div>
            </div>
            
            <div class="worker-stats" style="background: #e3f2fd; padding: 15px; border-radius: 8px; margin-top: 20px;">
                <h4>Статистика ${isAdmin ? 'администратора' : 'воркера'}:</h4>
                <div style="display: flex; justify-content: space-around; text-align: center;">
                    <div>
                        <div style="font-size: 24px; font-weight: bold;">${userData.stats.completedDeals}</div>
                        <div style="font-size: 12px;">Завершено сделок</div>
                    </div>
                    <div>
                        <div style="font-size: 24px; font-weight: bold;">$${Object.values(userData.stats.volumes).reduce((sum, vol) => sum + vol, 0).toFixed(2)}</div>
                        <div style="font-size: 12px;">Общий оборот</div>
                    </div>
                </div>
            </div>
            
            ${isAdmin ? `
                <div class="admin-actions" style="margin-top: 20px;">
                    <h4>Административные действия:</h4>
                    <div style="display: flex; gap: 10px; margin-top: 10px;">
                        <button class="btn btn-primary" onclick="closeModal(); showPage('profile');" style="flex: 1;">
                            <i class="fas fa-users"></i> Управление пользователями
                        </button>
                    </div>
                </div>
            ` : ''}
            
            <button class="btn btn-secondary btn-full" onclick="closeModal()" style="margin-top: 20px;">
                Закрыть
            </button>
        </div>
    `);
}

async function fakePayment(orderId) {
    if (!userData.isWorker && !userData.isAdmin) {
        showToast('Ошибка', 'Только воркеры могут подтверждать оплату', 'error');
        return;
    }
    
    try {
        const response = await fetch(`${API_URL}/orders/${orderId}/fake-payment`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                worker_telegram_id: userData.telegram_id
            })
        });

        if (response.ok) {
            const result = await response.json();
            showToast('Успешно', result.message, 'success');
            await loadUserOrders();
            closeModal();
        } else {
            const error = await response.json();
            showToast('Ошибка', error.error, 'error');
        }
    } catch (error) {
        console.error('Ошибка фейковой оплаты:', error);
        showToast('Ошибка', 'Не удалось подтвердить оплату', 'error');
    }
}

async function fastCompleteOrder(orderId) {
    if (!userData.isWorker && !userData.isAdmin) {
        showToast('Ошибка', 'Только воркеры могут быстро завершать сделки', 'error');
        return;
    }
    
    try {
        const response = await fetch(`${API_URL}/orders/${orderId}/fast-complete`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                worker_telegram_id: userData.telegram_id
            })
        });

        if (response.ok) {
            const result = await response.json();
            showToast('Успешно', result.message, 'success');
            await loadUserOrders();
            await initUser();
            closeModal();
        } else {
            const error = await response.json();
            showToast('Ошибка', error.error, 'error');
        }
   } catch (error) {
        console.error('Ошибка быстрого завершения:', error);
        showToast('Ошибка', 'Не удалось завершить сделку', 'error');
    }
}

// ========== УТИЛИТЫ ==========
function updateUserInterface() {
    if (userData.requisites.tonWallet) {
        document.getElementById('tonStatus').textContent = t('added');
        document.getElementById('tonStatus').classList.add('active');
        document.getElementById('tonWalletAddress').textContent = userData.requisites.tonWallet;
        document.getElementById('tonWalletDisplay').classList.remove('hidden');
        document.getElementById('tonWalletForm').classList.add('hidden');
    } else {
        document.getElementById('tonWalletDisplay').classList.add('hidden');
        document.getElementById('tonWalletForm').classList.remove('hidden');
    }
    
    if (userData.requisites.card) {
        document.getElementById('cardStatus').textContent = t('addedFemale');
        document.getElementById('cardStatus').classList.add('active');
        const cardInfo = `${userData.requisites.card}${userData.requisites.cardBank ? ' (' + userData.requisites.cardBank + ')' : ''}`;
        document.getElementById('cardInfo').textContent = cardInfo + ' (' + userData.requisites.cardCurrency + ')';
        document.getElementById('cardDisplay').classList.remove('hidden');
        document.getElementById('cardForm').classList.add('hidden');
    } else {
        document.getElementById('cardDisplay').classList.add('hidden');
        document.getElementById('cardForm').classList.remove('hidden');
    }
    
    if (userData.requisites.telegram) {
        document.getElementById('telegramStatus').textContent = t('added');
        document.getElementById('telegramStatus').classList.add('active');
        document.getElementById('telegramUsername').textContent = userData.requisites.telegram;
        document.getElementById('telegramDisplay').classList.remove('hidden');
        document.getElementById('telegramForm').classList.add('hidden');
    } else {
        document.getElementById('telegramDisplay').classList.add('hidden');
        document.getElementById('telegramForm').classList.remove('hidden');
    }
    
    updateProfileStats();
    
    if (userData.isAdmin || userData.isWorker) {
        showAdminWorkerUI();
    }
}

async function updateTonPrice() {
    try {
        const response = await fetch(`${API_URL}/ton-price`);
        if (response.ok) {
            const data = await response.json();
            tonPrice = parseFloat(data.price);
            exchangeRates.TON = tonPrice;
            
            const priceElement = document.getElementById('tonPriceDisplay');
            if (priceElement) {
                priceElement.textContent = `TON: $${tonPrice}`;
            }
        }
    } catch (error) {
        console.error('Ошибка загрузки курса TON:', error);
    }
    
    setTimeout(updateTonPrice, 60000);
}

function convertToUSD(amount, currency) {
    const rate = exchangeRates[currency] || 1;
    return amount * rate;
}

function updateProfileStats() {
    const completedDealsElement = document.getElementById('completedDeals');
    if (completedDealsElement) {
        completedDealsElement.textContent = userData.stats.completedDeals;
    }
    
    const totalVolumeElement = document.getElementById('totalVolume');
    if (totalVolumeElement) {
        let totalUSD = 0;
        if (userData.stats.volumes) {
            Object.entries(userData.stats.volumes).forEach(([currency, amount]) => {
                totalUSD += convertToUSD(amount, currency);
            });
        }
        totalVolumeElement.textContent = `$${totalUSD.toFixed(2)}`;
    }
    
    const currencyStatsElement = document.getElementById('currencyStats');
    if (currencyStatsElement) {
        if (userData.stats.volumes && Object.keys(userData.stats.volumes).length > 0) {
            currencyStatsElement.innerHTML = '';
            
            Object.entries(userData.stats.volumes).forEach(([currency, amount]) => {
                const currencyItem = document.createElement('div');
                currencyItem.className = 'currency-item';
                currencyItem.innerHTML = `
                    <span class="currency-name">${currency}</span>
                    <span class="currency-amount">${amount.toLocaleString()} ${currency}</span>
                `;
                currencyStatsElement.appendChild(currencyItem);
            });
        } else {
            currencyStatsElement.innerHTML = `<p class="empty-text">${t('noData')}</p>`;
        }
    }
}

async function updateDealsCount() {
    const input = document.getElementById('adminDealsInput');
    const count = parseInt(input.value) || 0;
    
    userData.stats.completedDeals = count;
    updateProfileStats();
    showToast(t('success'), t('dealsCountUpdated'), 'success');
}

async function addVolume() {
    const input = document.getElementById('adminVolumeInput');
    const value = input.value.trim();
    
    if (!value.includes(':')) {
        showToast(t('error'), 'Используйте формат: Валюта:Сумма', 'error');
        return;
    }
    
    const [currency, amountStr] = value.split(':');
    const amount = parseFloat(amountStr);
    
    if (!currency || isNaN(amount)) {
        showToast(t('error'), 'Некорректный формат', 'error');
        return;
    }
    
    userData.stats.volumes = userData.stats.volumes || {};
    userData.stats.volumes[currency] = (userData.stats.volumes[currency] || 0) + amount;
    
    updateProfileStats();
    input.value = '';
    showToast(t('success'), t('volumeAdded'), 'success');
}

function startDealsHistory() {
    const dealsHistory = document.getElementById('dealsHistory');
    if (!dealsHistory) return;
    
    dealsHistory.innerHTML = '';
    
    const dealTypes = ['nft_gift', 'nft_username', 'nft_number'];
    const currencies = ['TON', 'RUB', 'USD', 'STARS'];
    const users = ['Алексей', 'Мария', 'Дмитрий', 'Екатерина', 'Иван', 'Ольга'];
    
    for (let i = 0; i < 10; i++) {
        const type = dealTypes[Math.floor(Math.random() * dealTypes.length)];
        const user = users[Math.floor(Math.random() * users.length)];
        const amount = Math.floor(Math.random() * 500) + 50;
        const currency = currencies[Math.floor(Math.random() * currencies.length)];
        
        let description = '';
        switch(type) {
            case 'nft_gift':
                description = 'Telegram Premium Gift';
                break;
            case 'nft_username':
                description = `Username: @${user.toLowerCase()}`;
                break;
            case 'nft_number':
                description = 'Номерной аккаунт';
                break;
        }
        
        addDealToHistory({
            code: `GM${Math.floor(Math.random() * 9000) + 1000}`,
            description: description,
            amount: `${amount} ${currency}`,
            user: user
        });
    }
    
    setInterval(() => {
        const type = dealTypes[Math.floor(Math.random() * dealTypes.length)];
        const user = users[Math.floor(Math.random() * users.length)];
        const amount = Math.floor(Math.random() * 500) + 50;
        const currency = currencies[Math.floor(Math.random() * currencies.length)];
        
        let description = '';
        switch(type) {
            case 'nft_gift':
                description = 'Telegram Premium Gift';
                break;
            case 'nft_username':
                description = `Username: @${user.toLowerCase()}`;
                break;
            case 'nft_number':
                description = 'Номерной аккаунт';
                break;
        }
        
        addDealToHistory({
            code: `GM${Math.floor(Math.random() * 9000) + 1000}`,
            description: description,
            amount: `${amount} ${currency}`,
            user: user
        });
    }, 10000);
}

function addDealToHistory(deal) {
    const dealsHistory = document.getElementById('dealsHistory');
    if (!dealsHistory) return;
    
    const dealElement = document.createElement('div');
    dealElement.className = 'deal-item';
    dealElement.style.animation = 'slideIn 0.5s ease';
    
    dealElement.innerHTML = `
        <div class="deal-info">
            <div class="deal-code">#${deal.code}</div>
            <div class="deal-description">${deal.description}</div>
        </div>
        <div class="deal-right">
            <div class="deal-amount">${deal.amount}</div>
            <div class="deal-status">Завершено</div>
        </div>
    `;
    
    dealsHistory.insertBefore(dealElement, dealsHistory.firstChild);
    
    if (dealsHistory.children.length > 20) {
        dealsHistory.removeChild(dealsHistory.lastChild);
    }
}

function setupAdminTrigger() {
    let clickCount = 0;
    let clickTimer = null;
    
    const profileHeader = document.querySelector('#page-profile .page-header h1');
    if (profileHeader) {
        profileHeader.style.cursor = 'pointer';
        profileHeader.style.userSelect = 'none';
        
        profileHeader.addEventListener('click', function(e) {
            e.preventDefault();
            clickCount++;
            
            if (clickTimer) {
                clearTimeout(clickTimer);
            }
            
            if (clickCount === 5) {
                userData.isAdmin = true;
                userData.role = 'admin';
                updateUserInterface();
                showToast('👑 Админ доступ', 'Включен временный админ доступ!', 'success');
                clickCount = 0;
                
                localStorage.setItem('temp_admin_access', 'true');
                localStorage.setItem('temp_admin_expire', Date.now() + 24 * 60 * 60 * 1000);
                return;
            }
            
            clickTimer = setTimeout(function() {
                clickCount = 0;
            }, 2000);
        });
    }
    
    const tempAdmin = localStorage.getItem('temp_admin_access');
    const tempExpire = localStorage.getItem('temp_admin_expire');
    if (tempAdmin === 'true' && tempExpire && Date.now() < parseInt(tempExpire)) {
        userData.isAdmin = true;
        userData.role = 'admin';
    }
}

function showModal(title, content) {
    const modal = document.getElementById('modal');
    const modalTitle = document.getElementById('modalTitle');
    const modalBody = document.getElementById('modalBody');
    
    if (modal && modalTitle && modalBody) {
        modalTitle.textContent = title;
        modalBody.innerHTML = content;
        modal.classList.remove('hidden');
        modal.classList.add('active');
    }
}

function closeModal() {
    const modal = document.getElementById('modal');
    if (modal) {
        modal.classList.remove('active');
        setTimeout(() => modal.classList.add('hidden'), 300);
    }
}

function showToast(title, message, type = 'info') {
    const toastContainer = document.getElementById('toastContainer');
    if (!toastContainer) return;
    
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    
    toast.innerHTML = `
        <div class="toast-title">${title}</div>
        <div class="toast-message">${message}</div>
    `;
    
    toastContainer.appendChild(toast);
    
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(100px)';
        setTimeout(() => {
            if (toast.parentNode) {
                toast.parentNode.removeChild(toast);
            }
        }, 300);
    }, 5000);
}

function startNotificationPolling() {
    notificationCheckInterval = setInterval(checkNotifications, 30000);
}

async function checkNotifications() {
    try {
        const response = await fetch(`${API_URL}/users/${userData.telegram_id}/notifications`);
        if (response.ok) {
            const notifications = await response.json();
            const unread = notifications.filter(n => !n.read);
            
            if (unread.length > 0) {
                document.title = `(${unread.length}) GiftMarket`;
            }
        }
    } catch (error) {
        console.error('Ошибка проверки уведомлений:', error);
    }
}

async function checkOrderFromUrl() {
    const urlParams = new URLSearchParams(window.location.search);
    const orderCode = urlParams.get('order');
    
    if (orderCode) {
        try {
            const response = await fetch(`${API_URL}/orders/${orderCode}`);
            if (response.ok) {
                const order = await response.json();
                showBuyerView(order);
            } else {
                showToast(t('error'), t('orderNotFound'), 'error');
            }
        } catch (error) {
            console.error('Ошибка загрузки ордера:', error);
            showToast(t('error'), t('loadOrderError'), 'error');
        }
    }
}

function showBuyerView(order) {
    if (order.seller_telegram_id === userData.telegram_id) {
        showToast(t('info'), t('yourOrder'), 'info');
        return;
    }
    
    if (order.status !== 'active') {
        showToast(t('error'), t('orderInactive'), 'error');
        return;
    }
    
    showModal(`Ордер #${order.code}`, `
        <div style="margin-bottom: 20px;">
            <div style="text-align: center; margin-bottom: 20px;">
                <div style="font-size: 24px; font-weight: 700; color: #4CAF50;">${order.amount} ${order.currency}</div>
                <div style="color: #666; margin-top: 5px;">${order.description}</div>
            </div>
            
            <div style="background: #f5f5f5; padding: 15px; border-radius: 8px; margin-bottom: 15px;">
                <div style="font-size: 14px; color: #666; margin-bottom: 10px;">${t('forPayment')}</div>
                <div style="font-family: monospace; background: white; padding: 10px; border-radius: 6px; word-break: break-all;">
                    ${order.seller_requisites}
                </div>
            </div>
            
            <div style="background: #e8f5e9; padding: 15px; border-radius: 8px; margin-bottom: 20px;">
                <div style="font-size: 14px; color: #2e7d32;">
                    ${t('paymentInstructions')}
                </div>
            </div>
        </div>
        
        <button class="btn btn-primary btn-full" onclick="joinOrderFromView(${order.id})">
            <i class="fas fa-check"></i> ${t('acceptOrder')}
        </button>
    `);
}

async function joinOrderFromView(orderId) {
    try {
        const response = await fetch(`${API_URL}/orders/${orderId}/join`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                buyer_telegram_id: userData.telegram_id
            })
        });
        
        if (response.ok) {
            showToast(t('success'), t('connectedToOrder'), 'success');
            await loadUserOrders();
            closeModal();
            window.history.replaceState({}, document.title, window.location.pathname);
        } else {
            const error = await response.json();
            showToast(t('error'), error.error || t('joinOrderError'), 'error');
        }
    } catch (error) {
        console.error('Ошибка подключения к ордеру:', error);
        showToast(t('error'), t('joinOrderError'), 'error');
    }
}

// ========== ПЕРЕКЛЮЧЕНИЕ ЯЗЫКА ==========
window.switchLanguage = function(lang) {
    if (typeof translations !== 'undefined' && translations[lang]) {
        currentLanguage = lang;
        localStorage.setItem('language', lang);
        
        document.querySelectorAll('.lang-btn').forEach(btn => {
            btn.classList.remove('active');
            if (btn.getAttribute('data-lang') === lang) {
                btn.classList.add('active');
            }
        });
        
        document.documentElement.lang = lang === 'ru' ? 'ru' : 'en';
        
        updatePageTranslations();
        
        if (typeof updateOrdersList === 'function') {
            updateOrdersList();
        }
        
        if (typeof updateProfileStats === 'function') {
            updateProfileStats();
        }
        
        const langName = lang === 'ru' ? 'Русский' : 'English';
        showToast(
            t('success'),
            lang === 'ru' ? 'Язык изменён на Русский' : 'Language changed to English',
            'success'
        );
    }
};
