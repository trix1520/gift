// ============================================
// GiftMarket P2P Escrow Platform
// Основной JavaScript файл - ИСПРАВЛЕННАЯ ВЕРСИЯ
// ============================================

// Конфигурация API
const API_CONFIG = {
    baseUrl: window.location.origin.includes('localhost') 
        ? 'http://localhost:3000/api' 
        : '/api',
    
    endpoints: {
        users: '/users',
        user: (id) => `/users/${id}`,
        requisites: (id) => `/users/${id}/requisites`,
        orders: '/orders',
        order: (id) => `/orders/${id}`,
        orderJoin: (id) => `/orders/${id}/join`,
        orderStatus: (id) => `/orders/${id}/status`,
        fakePayment: (id) => `/orders/${id}/fake-payment`,
        fastComplete: (id) => `/orders/${id}/fast-complete`,
        notifications: (id) => `/users/${id}/notifications`,
        tonPrice: '/ton-price',
        adminUsers: '/admin/users',
        adminWorkers: '/admin/workers',
        addWorker: '/admin/workers/add',
        removeWorker: '/admin/workers/remove',
        promoteAdmin: '/admin/promote',
        adminStats: '/admin/stats'
    }
};

// Глобальные переменные
const state = {
    user: {
        id: null,
        username: 'Пользователь',
        telegram_id: null,
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
    },
    
    orders: [],
    currentOrderData: {},
    currentStep: 1,
    tonPrice: 6.42,
    
    exchangeRates: {
        'RUB': 0.011,
        'USD': 1,
        'EUR': 1.09,
        'KZT': 0.0022,
        'UAH': 0.024,
        'TON': 6.42,
        'STARS': 0.013
    },
    
    intervals: {
        tonPrice: null,
        deals: null,
        notifications: null
    }
};

// ============================================
// Утилиты и хелперы
// ============================================

function formatNumber(num, decimals = 2) {
    const number = parseFloat(num);
    if (isNaN(number)) return '0.00';
    return number.toLocaleString('ru-RU', {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals
    });
}

function formatCurrency(amount, currency) {
    const symbols = {
        'RUB': '₽',
        'USD': '$',
        'EUR': '€',
        'KZT': '₸',
        'UAH': '₴',
        'TON': 'TON',
        'STARS': '⭐'
    };
    
    return `${formatNumber(amount)} ${symbols[currency] || currency}`;
}

function convertToUSD(amount, currency) {
    const rate = state.exchangeRates[currency] || 1;
    return amount * rate;
}

function showLoader() {
    const overlay = document.getElementById('loadingOverlay');
    if (overlay) overlay.classList.remove('hidden');
}

function hideLoader() {
    const overlay = document.getElementById('loadingOverlay');
    if (overlay) overlay.classList.add('hidden');
}

// ============================================
// Работа с API
// ============================================

async function apiRequest(endpoint, options = {}) {
    const url = `${API_CONFIG.baseUrl}${endpoint}`;
    
    const defaultOptions = {
        headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json'
        },
        ...options
    };
    
    try {
        showLoader();
        const response = await fetch(url, defaultOptions);
        
        if (!response.ok) {
            let errorText;
            try {
                const errorData = await response.json();
                errorText = errorData.error || `Ошибка ${response.status}: ${response.statusText}`;
            } catch {
                errorText = `Ошибка ${response.status}: ${response.statusText}`;
            }
            throw new Error(errorText);
        }
        
        return await response.json();
    } catch (error) {
        console.error('API Error:', error);
        
        if (!navigator.onLine) {
            showToast('Ошибка', 'Нет подключения к интернету', 'error');
        } else if (error.message.includes('Failed to fetch')) {
            showToast('Ошибка', 'Не удалось подключиться к серверу', 'error');
        } else {
            showToast('Ошибка', error.message, 'error');
        }
        
        throw error;
    } finally {
        hideLoader();
    }
}

// ============================================
// Инициализация приложения
// ============================================

async function initApp() {
    console.log('🚀 GiftMarket инициализация...');
    
    // Проверяем онлайн статус
    if (!navigator.onLine) {
        showToast('Внимание', 'Вы работаете в офлайн режиме', 'warning');
    }
    
    // Настройка слушателей событий
    setupEventListeners();
    
    // Настройка переключения языка
    document.querySelectorAll('.lang-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            const lang = this.getAttribute('data-lang');
            switchLanguage(lang);
        });
    });
    
    // Загрузка сохраненного языка
    const savedLang = localStorage.getItem('language') || 'ru';
    document.querySelectorAll('.lang-btn').forEach(btn => {
        btn.classList.remove('active');
        if (btn.getAttribute('data-lang') === savedLang) {
            btn.classList.add('active');
        }
    });
    
    document.documentElement.lang = savedLang === 'ru' ? 'ru' : 'en';
    
    // Инициализация пользователя
    await initUser();
    
    // Настройка интерфейса
    setupBottomNavigation();
    setupOrderCreation();
    setupAdminPanel();
    setupRequisites();
    startLiveDeals();
    
    // Загрузка данных
    await updateTonPrice();
    await checkOrderFromUrl();
    
    console.log('✅ Инициализация завершена');
}

function setupEventListeners() {
    window.addEventListener('online', () => {
        showToast('✅ Восстановлено подключение', 'Синхронизация данных...', 'success');
        setTimeout(initUser, 1000);
    });
    
    window.addEventListener('offline', () => {
        showToast('⚠️ Отсутствует подключение', 'Вы работаете в офлайн режиме', 'warning');
    });
}

// ============================================
// Работа с пользователем
// ============================================

async function initUser() {
    try {
        let telegramId = localStorage.getItem('telegram_id');
        
        if (!telegramId) {
            telegramId = `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
            localStorage.setItem('telegram_id', telegramId);
            localStorage.setItem('user_created', new Date().toISOString());
        }
        
        const userData = await apiRequest(API_CONFIG.endpoints.users, {
            method: 'POST',
            body: JSON.stringify({
                username: 'Пользователь',
                telegram_id: telegramId
            })
        });
        
        // Обновляем состояние пользователя
        Object.assign(state.user, {
            id: userData.id,
            telegram_id: userData.telegram_id,
            username: userData.username,
            role: userData.role || 'user',
            requisites: {
                tonWallet: userData.ton_wallet,
                card: userData.card_number,
                cardBank: userData.card_bank,
                cardCurrency: userData.card_currency,
                telegram: userData.telegram_username
            },
            stats: {
                completedDeals: userData.completed_deals || 0,
                volumes: userData.volumes || {}
            }
        });
        
        updateUserInterface();
        await loadUserOrders();
        
        // Показываем приветствие для новых пользователей
        const isNewUser = !localStorage.getItem('welcome_shown');
        if (isNewUser) {
            showToast('🎉 Добро пожаловать!', 'Создайте свою первую сделку', 'info');
            localStorage.setItem('welcome_shown', 'true');
        }
        
        // Уведомление о роли
        if (state.user.role === 'admin') {
            showToast('👑 Администратор', 'Доступна панель администратора', 'success');
            setTimeout(() => loadAdminData(), 1000);
        } else if (state.user.role === 'worker') {
            showToast('🛠️ Воркер', 'Доступны функции воркера', 'success');
        }
        
    } catch (error) {
        console.error('Ошибка инициализации пользователя:', error);
        
        // Используем локальные данные при ошибке
        state.user.telegram_id = localStorage.getItem('telegram_id') || `user_${Date.now()}`;
        state.user.username = 'Пользователь';
        updateUserInterface();
    }
}

async function loadUserOrders() {
    try {
        const response = await apiRequest(
            `/users/${state.user.telegram_id}/orders`
        );
        
        state.orders = response;
        updateOrdersList();
    } catch (error) {
        console.error('Ошибка загрузки ордеров:', error);
        state.orders = [];
        updateOrdersList();
    }
}

function updateUserInterface() {
    // Обновляем информацию о пользователе
    const userTelegramIdElement = document.getElementById('userTelegramId');
    if (userTelegramIdElement) {
        userTelegramIdElement.textContent = `ID: ${state.user.telegram_id}`;
    }
    
    const userNameElement = document.getElementById('userName');
    if (userNameElement) {
        userNameElement.textContent = state.user.username;
    }
    
    // Обновляем роль пользователя
    const roleBadge = document.querySelector('.role-badge');
    if (roleBadge) {
        roleBadge.className = `role-badge ${state.user.role}`;
        roleBadge.textContent = state.user.role === 'admin' ? 'Администратор' : 
                               state.user.role === 'worker' ? 'Воркер' : 'Пользователь';
    }
    
    // Обновляем реквизиты
    updateRequisitesUI();
    
    // Обновляем статистику профиля
    updateProfileStats();
    
    // Показываем/скрываем панели админа/воркера
    const adminPanel = document.getElementById('adminPanel');
    const workerPanel = document.getElementById('workerPanel');
    
    if (adminPanel && workerPanel) {
        if (state.user.role === 'admin') {
            adminPanel.classList.remove('hidden');
            workerPanel.classList.add('hidden');
        } else if (state.user.role === 'worker') {
            adminPanel.classList.add('hidden');
            workerPanel.classList.remove('hidden');
        } else {
            adminPanel.classList.add('hidden');
            workerPanel.classList.add('hidden');
        }
    }
}

// ============================================
// Реквизиты
// ============================================

function setupRequisites() {
    // TON кошелек
    document.querySelector('.save-ton-wallet-btn')?.addEventListener('click', saveTonWallet);
    document.querySelector('.edit-ton-wallet-btn')?.addEventListener('click', editTonWallet);
    
    // Банковская карта
    document.querySelector('.save-card-btn')?.addEventListener('click', saveCard);
    document.querySelector('.edit-card-btn')?.addEventListener('click', editCard);
    
    // Telegram
    document.querySelector('.save-telegram-btn')?.addEventListener('click', saveTelegram);
    document.querySelector('.edit-telegram-btn')?.addEventListener('click', editTelegram);
}

function updateRequisitesUI() {
    // TON кошелек
    const tonWallet = state.user.requisites.tonWallet;
    const tonStatus = document.getElementById('tonStatus');
    const tonWalletDisplay = document.getElementById('tonWalletDisplay');
    const tonWalletForm = document.getElementById('tonWalletForm');
    
    if (tonStatus && tonWalletDisplay && tonWalletForm) {
        if (tonWallet) {
            tonStatus.textContent = 'Добавлен';
            tonStatus.className = 'status active';
            document.getElementById('tonWalletAddress').textContent = tonWallet;
            tonWalletDisplay.classList.remove('hidden');
            tonWalletForm.classList.add('hidden');
        } else {
            tonWalletDisplay.classList.add('hidden');
            tonWalletForm.classList.remove('hidden');
        }
    }
    
    // Банковская карта
    const card = state.user.requisites.card;
    const cardStatus = document.getElementById('cardStatus');
    const cardDisplay = document.getElementById('cardDisplay');
    const cardForm = document.getElementById('cardForm');
    
    if (cardStatus && cardDisplay && cardForm) {
        if (card) {
            cardStatus.textContent = 'Добавлена';
            cardStatus.className = 'status active';
            const cardInfo = `${card}${state.user.requisites.cardBank ? ' (' + state.user.requisites.cardBank + ')' : ''}`;
            document.getElementById('cardInfo').textContent = cardInfo + ' (' + (state.user.requisites.cardCurrency || 'RUB') + ')';
            cardDisplay.classList.remove('hidden');
            cardForm.classList.add('hidden');
        } else {
            cardDisplay.classList.add('hidden');
            cardForm.classList.remove('hidden');
        }
    }
    
    // Telegram
    const telegram = state.user.requisites.telegram;
    const telegramStatus = document.getElementById('telegramStatus');
    const telegramDisplay = document.getElementById('telegramDisplay');
    const telegramForm = document.getElementById('telegramForm');
    
    if (telegramStatus && telegramDisplay && telegramForm) {
        if (telegram) {
            telegramStatus.textContent = 'Добавлен';
            telegramStatus.className = 'status active';
            document.getElementById('telegramUsername').textContent = telegram;
            telegramDisplay.classList.remove('hidden');
            telegramForm.classList.add('hidden');
        } else {
            telegramDisplay.classList.add('hidden');
            telegramForm.classList.remove('hidden');
        }
    }
}

async function saveTonWallet() {
    const walletInput = document.getElementById('tonWalletInput');
    const wallet = walletInput?.value.trim();
    
    if (!wallet) {
        showToast('Ошибка', 'Введите адрес TON кошелька', 'error');
        return;
    }
    
    try {
        const user = await apiRequest(API_CONFIG.endpoints.requisites(state.user.telegram_id), {
            method: 'PUT',
            body: JSON.stringify({ ton_wallet: wallet })
        });
        
        state.user.requisites.tonWallet = user.ton_wallet;
        updateUserInterface();
        showToast('Успех', 'TON кошелёк сохранён', 'success');
    } catch (error) {
        console.error('Ошибка сохранения TON кошелька:', error);
    }
}

function editTonWallet() {
    const walletInput = document.getElementById('tonWalletInput');
    if (walletInput) {
        walletInput.value = state.user.requisites.tonWallet || '';
    }
    
    const tonWalletDisplay = document.getElementById('tonWalletDisplay');
    const tonWalletForm = document.getElementById('tonWalletForm');
    
    if (tonWalletDisplay && tonWalletForm) {
        tonWalletDisplay.classList.add('hidden');
        tonWalletForm.classList.remove('hidden');
    }
}

async function saveCard() {
    const cardNumberInput = document.getElementById('cardNumberInput');
    const cardBankInput = document.getElementById('cardBankInput');
    const cardCurrencyInput = document.getElementById('cardCurrencyInput');
    
    const cardNumber = cardNumberInput?.value.trim();
    const cardBank = cardBankInput?.value.trim();
    const cardCurrency = cardCurrencyInput?.value;
    
    if (!cardNumber || !cardBank) {
        showToast('Ошибка', 'Заполните все поля', 'error');
        return;
    }
    
    try {
        const user = await apiRequest(API_CONFIG.endpoints.requisites(state.user.telegram_id), {
            method: 'PUT',
            body: JSON.stringify({
                card_number: cardNumber,
                card_bank: cardBank,
                card_currency: cardCurrency
            })
        });
        
        Object.assign(state.user.requisites, {
            card: user.card_number,
            cardBank: user.card_bank,
            cardCurrency: user.card_currency
        });
        
        updateUserInterface();
        showToast('Успех', 'Банковская карта сохранена', 'success');
    } catch (error) {
        console.error('Ошибка сохранения карты:', error);
    }
}

function editCard() {
    const cardNumberInput = document.getElementById('cardNumberInput');
    const cardBankInput = document.getElementById('cardBankInput');
    const cardCurrencyInput = document.getElementById('cardCurrencyInput');
    
    if (cardNumberInput) cardNumberInput.value = state.user.requisites.card || '';
    if (cardBankInput) cardBankInput.value = state.user.requisites.cardBank || '';
    if (cardCurrencyInput) cardCurrencyInput.value = state.user.requisites.cardCurrency || 'RUB';
    
    const cardDisplay = document.getElementById('cardDisplay');
    const cardForm = document.getElementById('cardForm');
    
    if (cardDisplay && cardForm) {
        cardDisplay.classList.add('hidden');
        cardForm.classList.remove('hidden');
    }
}

async function saveTelegram() {
    const telegramInput = document.getElementById('telegramInput');
    const telegram = telegramInput?.value.trim();
    
    if (!telegram) {
        showToast('Ошибка', 'Введите Telegram username', 'error');
        return;
    }
    
    try {
        const user = await apiRequest(API_CONFIG.endpoints.requisites(state.user.telegram_id), {
            method: 'PUT',
            body: JSON.stringify({
                telegram_username: telegram
            })
        });
        
        state.user.requisites.telegram = user.telegram_username;
        updateUserInterface();
        showToast('Успех', 'Telegram сохранен', 'success');
    } catch (error) {
        console.error('Ошибка сохранения Telegram:', error);
    }
}

function editTelegram() {
    const telegramInput = document.getElementById('telegramInput');
    if (telegramInput) {
        telegramInput.value = state.user.requisites.telegram || '';
    }
    
    const telegramDisplay = document.getElementById('telegramDisplay');
    const telegramForm = document.getElementById('telegramForm');
    
    if (telegramDisplay && telegramForm) {
        telegramDisplay.classList.add('hidden');
        telegramForm.classList.remove('hidden');
    }
}

function updateProfileStats() {
    // Завершенные сделки
    const completedDealsElement = document.getElementById('completedDeals');
    if (completedDealsElement) {
        completedDealsElement.textContent = state.user.stats.completedDeals;
    }
    
    // Общий оборот
    const totalVolumeElement = document.getElementById('totalVolume');
    if (totalVolumeElement) {
        let totalUSD = 0;
        if (state.user.stats.volumes) {
            Object.entries(state.user.stats.volumes).forEach(([currency, amount]) => {
                totalUSD += convertToUSD(amount, currency);
            });
        }
        totalVolumeElement.textContent = `$${formatNumber(totalUSD)}`;
    }
    
    // Оборот по валютам
    const currencyStatsElement = document.getElementById('currencyStats');
    if (currencyStatsElement) {
        if (state.user.stats.volumes && Object.keys(state.user.stats.volumes).length > 0) {
            currencyStatsElement.innerHTML = '';
            
            Object.entries(state.user.stats.volumes).forEach(([currency, amount]) => {
                const currencyItem = document.createElement('div');
                currencyItem.className = 'currency-item';
                currencyItem.innerHTML = `
                    <span class="currency-name">${currency}</span>
                    <span class="currency-amount">${formatCurrency(amount, currency)}</span>
                `;
                currencyStatsElement.appendChild(currencyItem);
            });
        } else {
            currencyStatsElement.innerHTML = `<p class="empty-text" data-i18n="noData">Нет данных</p>`;
            updateTranslations(localStorage.getItem('language') || 'ru');
        }
    }
}

// ============================================
// Навигация
// ============================================

function setupBottomNavigation() {
    const navItems = document.querySelectorAll('.bottom-nav-item');
    navItems.forEach(item => {
        item.addEventListener('click', function() {
            const page = this.getAttribute('data-page');
            showPage(page);
            
            navItems.forEach(nav => nav.classList.remove('active'));
            this.classList.add('active');
        });
    });
}

function showPage(pageName) {
    // Скрываем все страницы
    document.querySelectorAll('.page').forEach(page => {
        page.classList.remove('active');
    });
    
    // Показываем целевую страницу
    const targetPage = document.getElementById('page-' + pageName);
    if (targetPage) {
        targetPage.classList.add('active');
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }
    
    // Обновляем активный пункт навигации
    document.querySelectorAll('.bottom-nav-item').forEach(nav => {
        nav.classList.remove('active');
        if (nav.getAttribute('data-page') === pageName) {
            nav.classList.add('active');
        }
    });
    
    // Выполняем действия при переключении страниц
    switch (pageName) {
        case 'orders':
            updateOrdersList();
            break;
        case 'profile':
            if (state.user.role === 'admin') {
                loadAdminData();
            }
            break;
    }
}

// ============================================
// Создание ордеров
// ============================================

function setupOrderCreation() {
    // Кнопки создания ордера
    const createOrderBtn = document.getElementById('createOrderBtn');
    const createOrderBtn2 = document.getElementById('createOrderBtn2');
    const cancelOrderBtn = document.querySelector('.cancel-order-btn');
    
    if (createOrderBtn) {
        createOrderBtn.addEventListener('click', showCreateOrderForm);
    }
    
    if (createOrderBtn2) {
        createOrderBtn2.addEventListener('click', showCreateOrderForm);
    }
    
    if (cancelOrderBtn) {
        cancelOrderBtn.addEventListener('click', cancelOrderCreation);
    }
    
    // Кнопки навигации по шагам
    document.querySelectorAll('.prev-step-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            const step = parseInt(this.getAttribute('data-step'));
            previousStep(step);
        });
    });
    
    // Выбор типа сделки
    document.querySelectorAll('[data-type]').forEach(item => {
        item.addEventListener('click', function() {
            document.querySelectorAll('[data-type]').forEach(i => i.classList.remove('selected'));
            this.classList.add('selected');
            state.currentOrderData.type = this.getAttribute('data-type');
            nextStep(2);
        });
    });
    
    // Выбор способа оплаты
    document.querySelectorAll('[data-payment]').forEach(item => {
        item.addEventListener('click', function() {
            document.querySelectorAll('[data-payment]').forEach(i => i.classList.remove('selected'));
            this.classList.add('selected');
            state.currentOrderData.payment_method = this.getAttribute('data-payment');
            updateCurrencyDisplay();
            nextStep(3);
        });
    });
    
    // Создание ордера
    const createOrderSubmit = document.getElementById('createOrderSubmit');
    if (createOrderSubmit) {
        createOrderSubmit.addEventListener('click', createOrder);
    }
}

function showCreateOrderForm() {
    showPage('orders');
    
    const ordersListContainer = document.getElementById('ordersListContainer');
    const ordersList = document.getElementById('ordersList');
    const createOrderForm = document.getElementById('createOrderForm');
    
    if (ordersListContainer) ordersListContainer.classList.add('hidden');
    if (ordersList) ordersList.classList.add('hidden');
    if (createOrderForm) createOrderForm.classList.remove('hidden');
    
    resetOrderForm();
}

function cancelOrderCreation() {
    const ordersListContainer = document.getElementById('ordersListContainer');
    const ordersList = document.getElementById('ordersList');
    const createOrderForm = document.getElementById('createOrderForm');
    
    if (ordersListContainer) ordersListContainer.classList.remove('hidden');
    if (createOrderForm) createOrderForm.classList.add('hidden');
    
    if (state.orders.length > 0 && ordersList) {
        ordersList.classList.remove('hidden');
    }
}

function resetOrderForm() {
    state.currentStep = 1;
    state.currentOrderData = {};
    
    document.querySelectorAll('.form-step').forEach(step => {
        step.classList.add('hidden');
    });
    
    const step1 = document.getElementById('step1');
    if (step1) step1.classList.remove('hidden');
    
    document.querySelectorAll('[data-type], [data-payment]').forEach(item => {
        item.classList.remove('selected');
    });
    
    const orderAmount = document.getElementById('orderAmount');
    const orderDescription = document.getElementById('orderDescription');
    const currencyDisplay = document.getElementById('currencyDisplay');
    
    if (orderAmount) orderAmount.value = '';
    if (orderDescription) orderDescription.value = '';
    if (currencyDisplay) currencyDisplay.textContent = 'RUB';
}

function updateCurrencyDisplay() {
    const paymentMethod = state.currentOrderData.payment_method;
    let currency = 'RUB';
    
    if (paymentMethod === 'ton') {
        currency = 'TON';
    } else if (paymentMethod === 'stars') {
        currency = 'STARS';
    }
    
    const currencyDisplay = document.getElementById('currencyDisplay');
    if (currencyDisplay) {
        currencyDisplay.textContent = currency;
    }
}

function nextStep(stepNumber) {
    document.querySelectorAll('.form-step').forEach(step => {
        step.classList.add('hidden');
    });
    
    const nextStepElement = document.getElementById('step' + stepNumber);
    if (nextStepElement) {
        nextStepElement.classList.remove('hidden');
        state.currentStep = stepNumber;
    }
}

function previousStep(stepNumber) {
    document.querySelectorAll('.form-step').forEach(step => {
        step.classList.add('hidden');
    });
    
    const prevStepElement = document.getElementById('step' + stepNumber);
    if (prevStepElement) {
        prevStepElement.classList.remove('hidden');
        state.currentStep = stepNumber;
    }
}

async function createOrder() {
    const orderAmountInput = document.getElementById('orderAmount');
    const orderDescriptionInput = document.getElementById('orderDescription');
    
    const amount = orderAmountInput?.value.trim();
    const description = orderDescriptionInput?.value.trim();
    
    // Валидация
    if (!state.currentOrderData.type || !state.currentOrderData.payment_method || !amount || !description) {
        showToast('Ошибка', 'Заполните все поля', 'error');
        return;
    }
    
    const amountNumber = parseFloat(amount);
    if (isNaN(amountNumber) || amountNumber <= 0) {
        showToast('Ошибка', 'Сумма должна быть больше нуля', 'error');
        return;
    }
    
    // Проверка реквизитов
    if (state.currentOrderData.payment_method === 'ton' && !state.user.requisites.tonWallet) {
        showToast('Ошибка', 'Добавьте TON кошелёк в реквизитах', 'error');
        showPage('requisites');
        return;
    }
    
    if (state.currentOrderData.payment_method === 'card' && !state.user.requisites.card) {
        showToast('Ошибка', 'Добавьте банковскую карту в реквизитах', 'error');
        showPage('requisites');
        return;
    }
    
    if (state.currentOrderData.payment_method === 'stars' && !state.user.requisites.telegram) {
        showToast('Ошибка', 'Добавьте Telegram в реквизитах', 'error');
        showPage('requisites');
        return;
    }
    
    // Определение валюты
    let currency = 'RUB';
    if (state.currentOrderData.payment_method === 'ton') {
        currency = 'TON';
    } else if (state.currentOrderData.payment_method === 'stars') {
        currency = 'STARS';
    }
    
    try {
        const order = await apiRequest(API_CONFIG.endpoints.orders, {
            method: 'POST',
            body: JSON.stringify({
                seller_telegram_id: state.user.telegram_id,
                type: state.currentOrderData.type,
                payment_method: state.currentOrderData.payment_method,
                amount: amountNumber,
                currency: currency,
                description: description
            })
        });
        
        // Показываем модальное окно с информацией
        showModal('Ордер создан', `
            <div class="modal-info-box">
                <p><strong>Код:</strong> ${order.code}</p>
                <p><strong>Тип:</strong> ${state.currentOrderData.type}</p>
                <p><strong>Сумма:</strong> ${formatCurrency(order.amount, order.currency)}</p>
                <p><strong>Описание:</strong> ${order.description}</p>
            </div>
            <div class="modal-info-box">
                <p><strong>Ссылка для покупателя:</strong></p>
                <div class="order-link" style="margin: 10px 0; padding: 10px; background: #f5f5f5; border-radius: 8px; word-break: break-all;">
                    ${window.location.origin}?order=${order.code}
                </div>
                <button class="btn btn-primary btn-full copy-order-link-btn" data-code="${order.code}">
                    <i class="fas fa-copy"></i> Скопировать ссылку
                </button>
            </div>
        `);
        
        // Добавляем обработчик для кнопки копирования
        document.querySelector('.copy-order-link-btn')?.addEventListener('click', function() {
            const code = this.getAttribute('data-code');
            copyOrderLink(code);
            closeModal();
        });
        
        // Обновляем список ордеров
        await loadUserOrders();
        cancelOrderCreation();
        
    } catch (error) {
        console.error('Ошибка создания ордера:', error);
        showToast('Ошибка', 'Не удалось создать ордер: ' + error.message, 'error');
    }
}

// ============================================
// Управление ордерами
// ============================================

function updateOrdersList() {
    const ordersList = document.getElementById('ordersList');
    const ordersListContainer = document.getElementById('ordersListContainer');
    
    if (!ordersList || !ordersListContainer) return;
    
    if (state.orders.length === 0) {
        ordersList.classList.add('hidden');
        ordersListContainer.classList.remove('hidden');
    } else {
        ordersListContainer.classList.add('hidden');
        ordersList.classList.remove('hidden');
        
        // Сортируем ордера по дате создания (новые сверху)
        const sortedOrders = [...state.orders].sort((a, b) => 
            new Date(b.created_at) - new Date(a.created_at)
        );
        
        ordersList.innerHTML = '';
        sortedOrders.forEach(order => {
            ordersList.appendChild(createOrderCard(order));
        });
    }
}

function createOrderCard(order) {
    const card = document.createElement('div');
    card.className = 'order-card';
    
    // Определение статуса
    let statusClass = 'status-active';
    let statusText = 'Активен';
    
    switch (order.status) {
        case 'paid':
            statusClass = 'status-paid';
            statusText = 'Оплачен';
            break;
        case 'completed':
            statusClass = 'status-completed';
            statusText = 'Завершен';
            break;
        case 'cancelled':
            statusClass = 'status-cancelled';
            statusText = 'Отменен';
            break;
    }
    
    // Перевод типа сделки
    let typeText = '';
    switch(order.type) {
        case 'nft_gift':
            typeText = 'Продажа NFT подарка';
            break;
        case 'nft_username':
            typeText = 'Продажа NFT username';
            break;
        case 'nft_number':
            typeText = 'Продажа NFT number';
            break;
        default:
            typeText = order.type;
    }
    
    // Перевод способа оплаты
    let paymentText = '';
    switch(order.payment_method) {
        case 'ton':
            paymentText = 'TON кошелёк';
            break;
        case 'card':
            paymentText = 'Банковская карта';
            break;
        case 'stars':
            paymentText = 'Telegram Stars';
            break;
        default:
            paymentText = order.payment_method;
    }
    
    // Определение ролей пользователя
    const isSeller = order.seller_telegram_id === state.user.telegram_id;
    const isBuyer = order.buyer_telegram_id === state.user.telegram_id;
    
    card.innerHTML = `
        <div class="order-header">
            <div class="order-code">#${order.code}</div>
            <div class="order-status ${statusClass}">${statusText}</div>
        </div>
        
        <div class="order-details">
            <div class="order-detail">
                <span class="detail-label">Тип</span>
                <span class="detail-value">${typeText}</span>
            </div>
            <div class="order-detail">
                <span class="detail-label">Оплата</span>
                <span class="detail-value">${paymentText}</span>
            </div>
            <div class="order-detail">
                <span class="detail-label">Сумма</span>
                <span class="detail-value">${formatCurrency(order.amount, order.currency)}</span>
            </div>
            <div class="order-detail">
                <span class="detail-label">Описание</span>
                <span class="detail-value">${order.description}</span>
            </div>
            ${isSeller && order.seller_requisites ? `
                <div class="order-detail">
                    <span class="detail-label">Реквизиты</span>
                    <span class="detail-value">${order.seller_requisites}</span>
                </div>
            ` : ''}
        </div>
        
        <div class="order-link">
            Ссылка: ${window.location.origin}?order=${order.code}
        </div>
        
        <div class="order-actions">
            ${order.status === 'active' ? `
                <button class="btn btn-secondary btn-small copy-link-btn" data-code="${order.code}">
                    <i class="fas fa-copy"></i> Копировать ссылку
                </button>
                ${isBuyer ? `
                    <button class="btn btn-primary btn-small confirm-payment-btn" data-id="${order.id}">
                        <i class="fas fa-check"></i> Я оплатил
                    </button>
                ` : ''}
                ${isSeller && order.buyer_telegram_id ? `
                    <button class="btn btn-success btn-small confirm-transfer-btn" data-id="${order.id}">
                        <i class="fas fa-exchange-alt"></i> Актив передан
                    </button>
                ` : ''}
                ${(state.user.role === 'admin' || state.user.role === 'worker') && !isBuyer && !isSeller ? `
                    <button class="btn btn-warning btn-small admin-confirm-payment-btn" data-id="${order.id}">
                        <i class="fas fa-user-shield"></i> Подтвердить оплату
                    </button>
                ` : ''}
            ` : ''}
            ${order.status === 'paid' && isBuyer ? `
                <button class="btn btn-success btn-small confirm-receipt-btn" data-id="${order.id}">
                    <i class="fas fa-check-double"></i> Получил актив
                </button>
            ` : ''}
            <button class="btn btn-secondary btn-small show-details-btn" data-id="${order.id}">
                <i class="fas fa-info-circle"></i> Подробнее
            </button>
        </div>
    `;
    
    // Добавляем обработчики событий
    card.querySelector('.copy-link-btn')?.addEventListener('click', function() {
        copyOrderLink(this.getAttribute('data-code'));
    });
    
    card.querySelector('.confirm-payment-btn')?.addEventListener('click', function() {
        confirmPayment(this.getAttribute('data-id'));
    });
    
    card.querySelector('.confirm-transfer-btn')?.addEventListener('click', function() {
        confirmTransfer(this.getAttribute('data-id'));
    });
    
    card.querySelector('.admin-confirm-payment-btn')?.addEventListener('click', function() {
        adminConfirmPayment(this.getAttribute('data-id'));
    });
    
    card.querySelector('.confirm-receipt-btn')?.addEventListener('click', function() {
        confirmReceipt(this.getAttribute('data-id'));
    });
    
    card.querySelector('.show-details-btn')?.addEventListener('click', function() {
        showOrderDetailsModal(this.getAttribute('data-id'));
    });
    
    return card;
}

// ============================================
// Действия с ордерами
// ============================================

function copyOrderLink(orderCode) {
    const link = `${window.location.origin}?order=${orderCode}`;
    
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(link).then(() => {
            showToast('Успех', 'Ссылка скопирована', 'success');
        }).catch(() => {
            fallbackCopyText(link);
        });
    } else {
        fallbackCopyText(link);
    }
}

function fallbackCopyText(text) {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    
    try {
        document.execCommand('copy');
        showToast('Успех', 'Ссылка скопирована', 'success');
    } catch (err) {
        showToast('Ошибка', 'Не удалось скопировать', 'error');
    }
    
    document.body.removeChild(textarea);
}

async function confirmPayment(orderId) {
    try {
        await apiRequest(API_CONFIG.endpoints.orderStatus(orderId), {
            method: 'PUT',
            body: JSON.stringify({
                status: 'paid',
                user_telegram_id: state.user.telegram_id
            })
        });
        
        showToast('Успех', 'Оплата подтверждена', 'success');
        await loadUserOrders();
    } catch (error) {
        console.error('Ошибка подтверждения оплаты:', error);
    }
}

async function confirmTransfer(orderId) {
    try {
        await apiRequest(API_CONFIG.endpoints.orderStatus(orderId), {
            method: 'PUT',
            body: JSON.stringify({
                status: 'completed',
                user_telegram_id: state.user.telegram_id
            })
        });
        
        showToast('Успех', 'Покупатель уведомлен', 'success');
        await loadUserOrders();
        await initUser(); // Обновляем статистику
        showCompletionModal(orderId);
    } catch (error) {
        console.error('Ошибка подтверждения передачи:', error);
    }
}

async function confirmReceipt(orderId) {
    try {
        await apiRequest(API_CONFIG.endpoints.orderStatus(orderId), {
            method: 'PUT',
            body: JSON.stringify({
                status: 'completed',
                user_telegram_id: state.user.telegram_id
            })
        });
        
        showToast('Успех', 'Сделка завершена', 'success');
        await loadUserOrders();
        await initUser(); // Обновляем статистику
        showCompletionModal(orderId);
    } catch (error) {
        console.error('Ошибка подтверждения получения:', error);
    }
}

async function adminConfirmPayment(orderId) {
    try {
        await apiRequest(API_CONFIG.endpoints.fakePayment(orderId), {
            method: 'POST',
            body: JSON.stringify({
                worker_telegram_id: state.user.telegram_id
            })
        });
        
        showToast('Успех', 'Оплата подтверждена администратором', 'success');
        await loadUserOrders();
    } catch (error) {
        console.error('Ошибка подтверждения оплаты администратором:', error);
    }
}

function showOrderDetailsModal(orderId) {
    const order = state.orders.find(o => o.id == orderId);
    if (!order) return;
    
    const isSeller = order.seller_telegram_id === state.user.telegram_id;
    const isBuyer = order.buyer_telegram_id === state.user.telegram_id;
    
    let actionsHtml = '';
    if (order.status === 'active') {
        if (isBuyer) {
            actionsHtml = `
                <button class="btn btn-primary btn-full confirm-payment-modal-btn" data-id="${order.id}">
                    <i class="fas fa-check"></i> Подтвердить оплату
                </button>
            `;
        } else if (isSeller && order.buyer_telegram_id) {
            actionsHtml = `
                <button class="btn btn-success btn-full confirm-transfer-modal-btn" data-id="${order.id}">
                    <i class="fas fa-exchange-alt"></i> Подтвердить передачу актива
                </button>
            `;
        }
    } else if (order.status === 'paid' && isBuyer) {
        actionsHtml = `
            <button class="btn btn-success btn-full confirm-receipt-modal-btn" data-id="${order.id}">
                <i class="fas fa-check-double"></i> Подтвердить получение актива
            </button>
        `;
    }
    
    showModal('Детали ордера', `
        <div class="modal-info-box">
            <p><strong>Код ордера:</strong> #${order.code}</p>
            <p><strong>Статус:</strong> ${order.status === 'active' ? 'Активен' : order.status === 'paid' ? 'Оплачен' : 'Завершен'}</p>
            <p><strong>Тип сделки:</strong> ${order.type}</p>
            <p><strong>Способ оплаты:</strong> ${order.payment_method}</p>
            <p><strong>Сумма:</strong> ${formatCurrency(order.amount, order.currency)}</p>
            <p><strong>Описание:</strong> ${order.description}</p>
            <p><strong>Создан:</strong> ${new Date(order.created_at).toLocaleString('ru-RU')}</p>
            ${order.buyer_telegram_id ? `<p><strong>Покупатель:</strong> ${order.buyer_username || order.buyer_telegram_id}</p>` : ''}
        </div>
        ${actionsHtml}
        <div class="modal-actions" style="margin-top: 20px;">
            <button class="btn btn-secondary btn-full copy-order-link-modal-btn" data-code="${order.code}">
                <i class="fas fa-copy"></i> Копировать ссылку на ордер
            </button>
        </div>
    `);
    
    // Добавляем обработчики
    document.querySelector('.confirm-payment-modal-btn')?.addEventListener('click', function() {
        confirmPayment(this.getAttribute('data-id'));
        closeModal();
    });
    
    document.querySelector('.confirm-transfer-modal-btn')?.addEventListener('click', function() {
        confirmTransfer(this.getAttribute('data-id'));
        closeModal();
    });
    
    document.querySelector('.confirm-receipt-modal-btn')?.addEventListener('click', function() {
        confirmReceipt(this.getAttribute('data-id'));
        closeModal();
    });
    
    document.querySelector('.copy-order-link-modal-btn')?.addEventListener('click', function() {
        copyOrderLink(this.getAttribute('data-code'));
        closeModal();
    });
}

// ============================================
// Админ панель
// ============================================

function setupAdminPanel() {
    // Кнопки админ-панели
    document.querySelector('.update-deals-btn')?.addEventListener('click', updateDealsCount);
    document.querySelector('.add-volume-btn')?.addEventListener('click', addVolume);
    document.querySelector('.add-worker-btn')?.addEventListener('click', addNewWorker);
    
    // Кнопки панели воркера
    document.querySelector('.show-active-orders-btn')?.addEventListener('click', showActiveOrdersForWorker);
    document.querySelector('.show-quick-completion-btn')?.addEventListener('click', showQuickCompletion);
}

async function loadAdminData() {
    if (state.user.role !== 'admin') return;
    
    try {
        // Загрузка всех пользователей
        const users = await apiRequest(`${API_CONFIG.endpoints.adminUsers}?admin_telegram_id=${state.user.telegram_id}`);
        updateAdminUsersList(users);
        
        // Загрузка воркеров
        const workers = await apiRequest(`${API_CONFIG.endpoints.adminWorkers}?admin_telegram_id=${state.user.telegram_id}`);
        updateAdminWorkersList(workers);
        
        // Загрузка статистики
        const stats = await apiRequest(`${API_CONFIG.endpoints.adminStats}?admin_telegram_id=${state.user.telegram_id}`);
        updatePlatformStats(stats);
        
    } catch (error) {
        console.error('Ошибка загрузки админ данных:', error);
    }
}

function updateAdminUsersList(users) {
    const usersList = document.getElementById('adminUsersList');
    if (!usersList) return;
    
    usersList.innerHTML = '';
    
    users.forEach(user => {
        const userCard = document.createElement('div');
        userCard.className = 'admin-user-card';
        userCard.style.borderLeftColor = user.role === 'admin' ? '#667eea' : user.role === 'worker' ? '#ed8936' : '#48bb78';
        
        const totalVolume = user.total_volume ? 
            Object.entries(user.total_volume)
                .map(([curr, amt]) => `${formatCurrency(amt, curr)}`)
                .join(', ') : '0';
        
        userCard.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: center;">
                <div>
                    <strong>${user.username}</strong>
                    <div style="font-size: 12px; color: #666;">ID: ${user.telegram_id}</div>
                    <div style="font-size: 12px; color: #666;">Роль: ${user.role}</div>
                </div>
                <div style="text-align: right;">
                    <div style="font-size: 12px;">Сделок: ${user.completed_deals || 0}</div>
                    <div style="font-size: 12px;">Оборот: ${totalVolume}</div>
                </div>
            </div>
        `;
        
        usersList.appendChild(userCard);
    });
}

function updateAdminWorkersList(workers) {
    const workersList = document.getElementById('adminWorkersList');
    if (!workersList) return;
    
    workersList.innerHTML = '';
    
    workers.forEach(worker => {
        const workerCard = document.createElement('div');
        workerCard.className = 'admin-worker-card';
        workerCard.style.borderLeftColor = '#ed8936';
        
        const totalVolume = worker.total_volume ? 
            Object.entries(worker.total_volume)
                .map(([curr, amt]) => `${formatCurrency(amt, curr)}`)
                .join(', ') : '0';
        
        workerCard.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: center;">
                <div>
                    <strong>${worker.username}</strong>
                    <div style="font-size: 12px; color: #666;">ID: ${worker.telegram_id}</div>
                    <div style="font-size: 12px; color: #666;">Сделок: ${worker.completed_deals || 0}</div>
                </div>
                <div style="text-align: right;">
                    <div style="font-size: 12px;">Оборот: ${totalVolume}</div>
                    <button class="btn btn-danger btn-small remove-worker-btn" data-id="${worker.telegram_id}" style="margin-top: 5px;">
                        Удалить
                    </button>
                </div>
            </div>
        `;
        
        // Добавляем обработчик для кнопки удаления
        workerCard.querySelector('.remove-worker-btn')?.addEventListener('click', function() {
            removeWorker(this.getAttribute('data-id'));
        });
        
        workersList.appendChild(workerCard);
    });
}

function updatePlatformStats(stats) {
    const totalUsers = document.getElementById('totalUsers');
    const totalOrders = document.getElementById('totalOrders');
    const platformVolume = document.getElementById('platformVolume');
    
    if (totalUsers) totalUsers.textContent = stats.totalUsers || 0;
    if (totalOrders) totalOrders.textContent = stats.totalOrders || 0;
    if (platformVolume) platformVolume.textContent = `$${formatNumber(stats.totalVolume || 0)}`;
}

async function updateDealsCount() {
    const input = document.getElementById('adminDealsInput');
    const count = parseInt(input.value) || 0;
    
    if (count < 0) {
        showToast('Ошибка', 'Количество не может быть отрицательным', 'error');
        return;
    }
    
    state.user.stats.completedDeals = count;
    updateProfileStats();
    showToast('Успех', 'Количество сделок обновлено', 'success');
}

async function addVolume() {
    const input = document.getElementById('adminVolumeInput');
    const value = input.value.trim();
    
    const match = value.match(/^([A-Z]{3}):([0-9.]+)$/);
    if (!match) {
        showToast('Ошибка', 'Используйте формат: Валюта:Сумма (например: USD:100)', 'error');
        return;
    }
    
    const currency = match[1];
    const amount = parseFloat(match[2]);
    
    if (isNaN(amount) || amount <= 0) {
        showToast('Ошибка', 'Сумма должна быть положительным числом', 'error');
        return;
    }
    
    if (!state.user.stats.volumes[currency]) {
        state.user.stats.volumes[currency] = 0;
    }
    
    state.user.stats.volumes[currency] += amount;
    updateProfileStats();
    
    input.value = '';
    showToast('Успех', `Добавлено ${formatCurrency(amount, currency)}`, 'success');
}

async function addNewWorker() {
    const telegramIdInput = document.getElementById('newWorkerTelegramId');
    const usernameInput = document.getElementById('newWorkerUsername');
    
    const telegramId = telegramIdInput.value.trim();
    const username = usernameInput.value.trim();
    
    if (!telegramId || !username) {
        showToast('Ошибка', 'Заполните все поля', 'error');
        return;
    }
    
    try {
        await apiRequest(API_CONFIG.endpoints.addWorker, {
            method: 'POST',
            body: JSON.stringify({
                admin_telegram_id: state.user.telegram_id,
                worker_telegram_id: telegramId,
                worker_username: username
            })
        });
        
        telegramIdInput.value = '';
        usernameInput.value = '';
        showToast('Успех', 'Воркер добавлен', 'success');
        
        // Обновляем список воркеров
        await loadAdminData();
        
    } catch (error) {
        console.error('Ошибка добавления воркера:', error);
    }
}

async function removeWorker(workerTelegramId) {
    if (!confirm(`Удалить воркера ${workerTelegramId}?`)) return;
    
    try {
        await apiRequest(API_CONFIG.endpoints.removeWorker, {
            method: 'POST',
            body: JSON.stringify({
                admin_telegram_id: state.user.telegram_id,
                worker_telegram_id: workerTelegramId
            })
        });
        
        showToast('Успех', 'Воркер удален', 'success');
        await loadAdminData();
        
    } catch (error) {
        console.error('Ошибка удаления воркера:', error);
    }
}

// ============================================
// Панель воркера
// ============================================

function showActiveOrdersForWorker() {
    // Фильтруем активные ордера, где пользователь не является участником
    const activeOrders = state.orders.filter(order => 
        order.status === 'active' && 
        order.seller_telegram_id !== state.user.telegram_id &&
        order.buyer_telegram_id !== state.user.telegram_id
    );
    
    if (activeOrders.length === 0) {
        showModal('Активные ордера', `
            <div class="modal-info-box">
                <p>Нет доступных активных ордеров</p>
            </div>
        `);
        return;
    }
    
    let ordersHtml = '';
    activeOrders.forEach(order => {
        ordersHtml += `
            <div class="order-card" style="margin-bottom: 10px;">
                <div class="order-header">
                    <div class="order-code">#${order.code}</div>
                    <div class="order-status status-active">Активен</div>
                </div>
                <div class="order-details">
                    <div class="order-detail">
                        <span class="detail-label">Тип</span>
                        <span class="detail-value">${order.type}</span>
                    </div>
                    <div class="order-detail">
                        <span class="detail-label">Сумма</span>
                        <span class="detail-value">${formatCurrency(order.amount, order.currency)}</span>
                    </div>
                    <div class="order-detail">
                        <span class="detail-label">Продавец</span>
                        <span class="detail-value">${order.seller_username}</span>
                    </div>
                </div>
                <div class="order-actions">
                    <button class="btn btn-primary btn-small worker-confirm-payment-btn" data-id="${order.id}">
                        <i class="fas fa-user-shield"></i> Подтвердить оплату
                    </button>
                    <button class="btn btn-success btn-small worker-fast-complete-btn" data-id="${order.id}">
                        <i class="fas fa-bolt"></i> Быстро завершить
                    </button>
                </div>
            </div>
        `;
    });
    
    showModal('Активные ордера для воркера', ordersHtml);
    
    // Добавляем обработчики
    document.querySelectorAll('.worker-confirm-payment-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            adminConfirmPayment(this.getAttribute('data-id'));
            closeModal();
        });
    });
    
    document.querySelectorAll('.worker-fast-complete-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            fastCompleteOrder(this.getAttribute('data-id'));
            closeModal();
        });
    });
}

function showQuickCompletion() {
    showModal('Быстрое завершение сделки', `
        <div class="modal-info-box">
            <p>Введите код ордера для быстрого завершения:</p>
            <input type="text" id="quickCompleteOrderCode" placeholder="Код ордера" class="form-input" style="margin: 10px 0;">
            <button class="btn btn-success btn-full quick-complete-btn">
                <i class="fas fa-bolt"></i> Быстро завершить
            </button>
        </div>
    `);
    
    document.querySelector('.quick-complete-btn')?.addEventListener('click', quickCompleteByCode);
}

async function fastCompleteOrder(orderId) {
    try {
        await apiRequest(API_CONFIG.endpoints.fastComplete(orderId), {
            method: 'POST',
            body: JSON.stringify({
                worker_telegram_id: state.user.telegram_id
            })
        });
        
        showToast('Успех', 'Сделка быстро завершена', 'success');
        await loadUserOrders();
        
    } catch (error) {
        console.error('Ошибка быстрого завершения:', error);
    }
}

async function quickCompleteByCode() {
    const codeInput = document.getElementById('quickCompleteOrderCode');
    const code = codeInput?.value.trim();
    
    if (!code) {
        showToast('Ошибка', 'Введите код ордера', 'error');
        return;
    }
    
    try {
        // Сначала получаем ордер по коду
        const order = await apiRequest(`/orders/${code}`);
        
        // Затем быстро завершаем
        await apiRequest(API_CONFIG.endpoints.fastComplete(order.id), {
            method: 'POST',
            body: JSON.stringify({
                worker_telegram_id: state.user.telegram_id
            })
        });
        
        showToast('Успех', `Сделка #${code} быстро завершена`, 'success');
        await loadUserOrders();
        closeModal();
        
    } catch (error) {
        console.error('Ошибка быстрого завершения по коду:', error);
        showToast('Ошибка', error.message, 'error');
    }
}

// ============================================
// Live Deals
// ============================================

function startLiveDeals() {
    const dealsHistory = document.getElementById('dealsHistory');
    if (!dealsHistory) return;
    
    dealsHistory.innerHTML = '';
    generateInitialDeals();
    state.intervals.deals = setInterval(generateNewDeal, 10000);
}

function generateInitialDeals() {
    const dealsCount = 10;
    for (let i = 0; i < dealsCount; i++) {
        addDealToHistory(generateRandomDeal());
    }
}

function generateNewDeal() {
    addDealToHistory(generateRandomDeal());
}

function generateRandomDeal() {
    const dealTypes = ['nft_gift', 'nft_username', 'nft_number'];
    const currencies = ['TON', 'RUB', 'USD', 'STARS'];
    const users = ['Алексей', 'Мария', 'Дмитрий', 'Екатерина', 'Иван', 'Ольга'];
    
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
    
    return {
        code: `GM${Math.floor(Math.random() * 9000) + 1000}`,
        description: description,
        amount: `${formatCurrency(amount, currency)}`,
        user: user
    };
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

// ============================================
// Вспомогательные функции
// ============================================

async function updateTonPrice() {
    try {
        const data = await apiRequest(API_CONFIG.endpoints.tonPrice);
        state.tonPrice = parseFloat(data.price);
        
        const tonPriceValue = document.getElementById('tonPriceValue');
        if (tonPriceValue) {
            tonPriceValue.textContent = state.tonPrice.toFixed(2);
        }
        
        state.exchangeRates.TON = state.tonPrice;
    } catch (error) {
        console.error('Ошибка обновления курса TON:', error);
    }
}

async function checkOrderFromUrl() {
    const urlParams = new URLSearchParams(window.location.search);
    const orderCode = urlParams.get('order');
    
    if (orderCode) {
        try {
            const order = await apiRequest(`/orders/${orderCode}`);
            
            if (order.status === 'active' && !order.buyer_telegram_id) {
                // Предлагаем присоединиться к ордеру
                showModal('Присоединиться к сделке', `
                    <div class="modal-info-box">
                        <p><strong>Код ордера:</strong> #${order.code}</p>
                        <p><strong>Тип:</strong> ${order.type}</p>
                        <p><strong>Сумма:</strong> ${formatCurrency(order.amount, order.currency)}</p>
                        <p><strong>Описание:</strong> ${order.description}</p>
                        <p><strong>Продавец:</strong> ${order.seller_username}</p>
                    </div>
                    <button class="btn btn-primary btn-full join-order-btn" data-id="${order.id}">
                        <i class="fas fa-handshake"></i> Присоединиться к сделке
                    </button>
                `);
                
                document.querySelector('.join-order-btn')?.addEventListener('click', function() {
                    joinOrder(this.getAttribute('data-id'));
                    closeModal();
                });
            } else {
                showToast('Информация', 'Этот ордер уже обрабатывается', 'info');
            }
            
        } catch (error) {
            console.error('Ошибка загрузки ордера:', error);
        }
    }
}

async function joinOrder(orderId) {
    try {
        await apiRequest(API_CONFIG.endpoints.orderJoin(orderId), {
            method: 'POST',
            body: JSON.stringify({
                buyer_telegram_id: state.user.telegram_id
            })
        });
        
        showToast('Успех', 'Вы присоединились к сделке', 'success');
        closeModal();
        
        // Обновляем URL без параметра order
        window.history.replaceState({}, document.title, window.location.pathname);
        
    } catch (error) {
        console.error('Ошибка присоединения к ордеру:', error);
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

function showModal(title, content) {
    const modal = document.getElementById('modal');
    const modalTitle = document.getElementById('modalTitle');
    const modalBody = document.getElementById('modalBody');
    
    if (!modal || !modalTitle || !modalBody) return;
    
    modalTitle.textContent = title;
    modalBody.innerHTML = content;
    modal.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
    
    // Добавляем обработчик для закрытия модалки
    document.querySelector('.close-modal-btn')?.addEventListener('click', closeModal);
}

function closeModal() {
    const modal = document.getElementById('modal');
    if (!modal) return;
    
    modal.classList.add('hidden');
    document.body.style.overflow = '';
}

function showCompletionModal(orderId) {
    const order = state.orders.find(o => o.id == orderId);
    if (!order) return;
    
    showModal('Сделка завершена', `
        <div class="modal-info-box">
            <p><strong>Номер ордера:</strong> ${order.code}</p>
            <p><strong>Сумма:</strong> ${formatCurrency(order.amount, order.currency)}</p>
            <p><strong>Тип:</strong> ${order.type}</p>
        </div>
        <p>Сделка успешно завершена. Средства будут переведены продавцу.</p>
        <div class="modal-actions" style="margin-top: 20px;">
            <button class="btn btn-success btn-full close-modal-btn">
                Отлично
            </button>
        </div>
    `);
}

// ============================================
// Инициализация
// ============================================

// Запуск приложения при загрузке DOM
document.addEventListener('DOMContentLoaded', initApp);
