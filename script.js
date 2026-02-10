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
let currentLanguage = 'ru'; // ДОБАВЛЕНО: инициализация переменной языка
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
    
    // Курсы валют к USD (обновляются динамически)
    exchangeRates: {
        'RUB': 0.011,
        'USD': 1,
        'EUR': 1.09,
        'KZT': 0.0022,
        'UAH': 0.024,
        'TON': 6.42,
        'STARS': 0.013
    },
    
    // Интервалы для автообновления
    intervals: {
        tonPrice: null,
        deals: null,
        notifications: null
    }
};

// ============================================
// Утилиты и хелперы
// ============================================

/**
 * Форматирование чисел с разделителями
 */
function formatNumber(num, decimals = 2) {
    const number = parseFloat(num);
    if (isNaN(number)) return '0.00';
    return number.toLocaleString('ru-RU', {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals
    });
}

/**
 * Форматирование суммы с валютой
 */
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

/**
 * Конвертация в USD
 */
function convertToUSD(amount, currency) {
    const rate = state.exchangeRates[currency] || 1;
    return amount * rate;
}

/**
 * Генерация случайного цвета для аватара
 */
function generateAvatarColor() {
    const colors = [
        '#667eea', '#764ba2', '#f093fb', '#f5576c',
        '#4facfe', '#00f2fe', '#43e97b', '#38f9d7',
        '#fa709a', '#fee140', '#a8edea', '#fed6e3'
    ];
    return colors[Math.floor(Math.random() * colors.length)];
}

/**
 * Проверка онлайн статуса
 */
function isOnline() {
    return navigator.onLine;
}

/**
 * Показ/скрытие лоадера
 */
function showLoader() {
    const overlay = document.getElementById('loadingOverlay');
    if (overlay) overlay.classList.remove('hidden');
}

function hideLoader() {
    const overlay = document.getElementById('loadingOverlay');
    if (overlay) overlay.classList.add('hidden');
}

/**
 * Задержка выполнения
 */
function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// ============================================
// Работа с API
// ============================================

/**
 * Обертка для fetch запросов с обработкой ошибок
 */
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
        
        // Проверяем тип ошибки
        if (!isOnline()) {
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

/**
 * Основная инициализация приложения
 */
async function initApp() {
    console.log('🚀 GiftMarket инициализация...');
    
    // Проверяем онлайн статус
    if (!isOnline()) {
        showToast('Внимание', 'Вы работаете в офлайн режиме', 'warning');
    }
    
    // Настройка слушателей событий
    setupEventListeners();
    
    // Загрузка языка
    const savedLang = localStorage.getItem('language') || 'ru';
    currentLanguage = savedLang;
    
    document.querySelectorAll('.lang-btn').forEach(btn => {
        btn.classList.remove('active');
        if (btn.getAttribute('data-lang') === savedLang) {
            btn.classList.add('active');
        }
    });
    
    document.documentElement.lang = savedLang === 'ru' ? 'ru' : 'en';
    updatePageTranslations();
    
    // Инициализация пользователя
    await initUser();
    
    // Настройка интерфейса
    setupBottomNavigation();
    setupOrderCreation();
    startLiveDeals();
    setupAdminTrigger();
    
    // Загрузка данных
    await updateTonPrice();
    await checkOrderFromUrl();
    startNotificationPolling();
    
    // Отображаем версию в консоли
    console.log('✅ Инициализация завершена');
    console.log('📱 Версия: 2.0.0');
    console.log('🌐 Язык:', currentLanguage);
    console.log('👤 Пользователь:', state.user.username);
}

/**
 * Настройка слушателей событий
 */
function setupEventListeners() {
    // Обработка онлайн/офлайн статуса
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

/**
 * Инициализация пользователя
 */
async function initUser() {
    try {
        let telegramId = localStorage.getItem('telegram_id');
        
        if (!telegramId) {
            // Генерация уникального ID для нового пользователя
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

/**
 * Загрузка ордеров пользователя
 */
async function loadUserOrders() {
    try {
        const response = await apiRequest(
            `/api/users/${state.user.telegram_id}/orders`
        );
        
        state.orders = response;
        updateOrdersList();
    } catch (error) {
        console.error('Ошибка загрузки ордеров:', error);
        state.orders = [];
        updateOrdersList();
    }
}

// ============================================
// Обновление интерфейса
// ============================================

/**
 * Обновление всего интерфейса пользователя
 */
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

/**
 * Обновление UI реквизитов
 */
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

/**
 * Обновление статистики профиля
 */
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
            currencyStatsElement.innerHTML = `<p class="empty-text">Нет данных</p>`;
        }
    }
}

// ============================================
// Навигация
// ============================================

/**
 * Настройка нижней навигации
 */
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

/**
 * Показать страницу
 */
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
// Реквизиты
// ============================================

/**
 * Сохранить TON кошелек
 */
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

/**
 * Редактировать TON кошелек
 */
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

/**
 * Сохранить банковскую карту
 */
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

/**
 * Редактировать карту
 */
function editCard() {
    document.getElementById('cardNumberInput').value = state.user.requisites.card || '';
    document.getElementById('cardBankInput').value = state.user.requisites.cardBank || '';
    document.getElementById('cardCurrencyInput').value = state.user.requisites.cardCurrency || 'RUB';
    
    const cardDisplay = document.getElementById('cardDisplay');
    const cardForm = document.getElementById('cardForm');
    
    if (cardDisplay && cardForm) {
        cardDisplay.classList.add('hidden');
        cardForm.classList.remove('hidden');
    }
}

/**
 * Сохранить Telegram
 */
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

/**
 * Редактировать Telegram
 */
function editTelegram() {
    document.getElementById('telegramInput').value = state.user.requisites.telegram || '';
    
    const telegramDisplay = document.getElementById('telegramDisplay');
    const telegramForm = document.getElementById('telegramForm');
    
    if (telegramDisplay && telegramForm) {
        telegramDisplay.classList.add('hidden');
        telegramForm.classList.remove('hidden');
    }
}

// ============================================
// Создание ордеров - ИСПРАВЛЕННЫЙ РАЗДЕЛ
// ============================================

/**
 * Настройка создания ордеров
 */
function setupOrderCreation() {
    // Кнопки создания ордера
    const createOrderBtn = document.getElementById('createOrderBtn');
    const createOrderBtn2 = document.getElementById('createOrderBtn2');
    
    if (createOrderBtn) {
        createOrderBtn.addEventListener('click', showCreateOrderForm);
    }
    
    if (createOrderBtn2) {
        createOrderBtn2.addEventListener('click', showCreateOrderForm);
    }
    
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

/**
 * Показать форму создания ордера
 */
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

/**
 * Отмена создания ордера
 */
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

/**
 * Сброс формы ордера
 */
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

/**
 * Обновление отображения валюты
 */
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

/**
 * Следующий шаг
 */
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

/**
 * Предыдущий шаг
 */
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

/**
 * Создание ордера
 */
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
        return;
    }
    
    if (state.currentOrderData.payment_method === 'card' && !state.user.requisites.card) {
        showToast('Ошибка', 'Добавьте банковскую карту в реквизитах', 'error');
        return;
    }
    
    if (state.currentOrderData.payment_method === 'stars' && !state.user.requisites.telegram) {
        showToast('Ошибка', 'Добавьте Telegram в реквизитах', 'error');
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
                <button class="btn btn-primary btn-full" onclick="copyOrderLink('${order.code}'); closeModal();">
                    <i class="fas fa-copy"></i> Скопировать ссылку
                </button>
            </div>
        `);
        
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

/**
 * Обновление списка ордеров
 */
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

/**
 * Создание карточки ордера
 */
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
                <button class="btn btn-secondary btn-small" onclick="copyOrderLink('${order.code}')">
                    <i class="fas fa-copy"></i> Копировать ссылку
                </button>
                ${isBuyer ? `
                    <button class="btn btn-primary btn-small" onclick="confirmPayment('${order.id}')">
                        <i class="fas fa-check"></i> Я оплатил
                    </button>
                ` : ''}
                ${isSeller && order.buyer_telegram_id ? `
                    <button class="btn btn-success btn-small" onclick="confirmTransfer('${order.id}')">
                        <i class="fas fa-exchange-alt"></i> Актив передан
                    </button>
                ` : ''}
                ${(state.user.role === 'admin' || state.user.role === 'worker') && !isBuyer && !isSeller ? `
                    <button class="btn btn-warning btn-small" onclick="adminConfirmPayment('${order.id}')">
                        <i class="fas fa-user-shield"></i> Подтвердить оплату
                    </button>
                ` : ''}
            ` : ''}
            ${order.status === 'paid' && isBuyer ? `
                <button class="btn btn-success btn-small" onclick="confirmReceipt('${order.id}')">
                    <i class="fas fa-check-double"></i> Получил актив
                </button>
            ` : ''}
            <button class="btn btn-secondary btn-small" onclick="showOrderDetailsModal('${order.id}')">
                <i class="fas fa-info-circle"></i> Подробнее
            </button>
        </div>
    `;
    
    return card;
}

/**
 * Копировать ссылку на ордер
 */
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

/**
 * Резервное копирование текста (для старых браузеров)
 */
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

// ============================================
// Действия с ордерами
// ============================================

/**
 * Подтвердить оплату
 */
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

/**
 * Подтвердить передачу актива
 */
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

/**
 * Подтвердить получение
 */
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

// ============================================
// Live Deals
// ============================================

/**
 * Запуск системы Live Deals
 */
function startLiveDeals() {
    const dealsHistory = document.getElementById('dealsHistory');
    if (!dealsHistory) return;
    
    // Очищаем историю
    dealsHistory.innerHTML = '';
    
    // Генерация начальных сделок
    generateInitialDeals();
    
    // Запускаем обновление каждые 10 секунд
    state.intervals.deals = setInterval(generateNewDeal, 10000);
}

/**
 * Генерация начальных сделок
 */
function generateInitialDeals() {
    const dealsCount = 10;
    for (let i = 0; i < dealsCount; i++) {
        addDealToHistory(generateRandomDeal());
    }
}

/**
 * Генерация новой сделки
 */
function generateNewDeal() {
    addDealToHistory(generateRandomDeal());
}

/**
 * Генерация случайной сделки
 */
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

/**
 * Добавление сделки в историю
 */
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
    
    // Ограничиваем количество отображаемых сделок
    if (dealsHistory.children.length > 20) {
        dealsHistory.removeChild(dealsHistory.lastChild);
    }
}

// ============================================
// Вспомогательные функции
// ============================================

/**
 * Обновление курса TON
 */
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

/**
 * Показать toast-уведомление
 */
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
    
    // Автоматическое удаление через 5 секунд
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

/**
 * Показать модальное окно
 */
function showModal(title, content) {
    const modal = document.getElementById('modal');
    const modalTitle = document.getElementById('modalTitle');
    const modalBody = document.getElementById('modalBody');
    
    if (!modal || !modalTitle || !modalBody) return;
    
    modalTitle.textContent = title;
    modalBody.innerHTML = content;
    modal.classList.remove('hidden');
    
    // Блокируем скролл под модальным окном
    document.body.style.overflow = 'hidden';
}

/**
 * Закрыть модальное окно
 */
function closeModal() {
    const modal = document.getElementById('modal');
    if (!modal) return;
    
    modal.classList.add('hidden');
    
    // Разблокируем скролл
    document.body.style.overflow = '';
}

/**
 * Показать модальное окно завершения сделки
 */
function showCompletionModal(orderId) {
    const order = state.orders.find(o => o.id == orderId); // Исправлено: сравнение без строгого равенства
    if (!order) return;
    
    showModal('Сделка завершена', `
        <div class="modal-info-box">
            <p><strong>Номер ордера:</strong> ${order.code}</p>
            <p><strong>Сумма:</strong> ${formatCurrency(order.amount, order.currency)}</p>
            <p><strong>Тип:</strong> ${order.type}</p>
        </div>
        <p>Сделка успешно завершена. Средства будут переведены продавцу.</p>
        <div class="modal-actions" style="margin-top: 20px;">
            <button class="btn btn-success btn-full" onclick="closeModal()">
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
