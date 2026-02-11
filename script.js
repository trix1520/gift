// ============================================
// GiftMarket P2P Escrow Platform
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
        orderByCode: (code) => `/orders/${code}`,
        orderById: (id) => `/orders/id/${id}`,
        orderJoin: (id) => `/orders/${id}/join`,
        orderStatus: (id) => `/orders/${id}/status`,
        fakePayment: (id) => `/orders/${id}/fake-payment`,
        fastComplete: (id) => `/orders/${id}/fast-complete`,
        notifications: (id) => `/users/${id}/notifications`,
        notificationRead: (id) => `/notifications/${id}/read`,
        deleteNotification: (id) => `/notifications/${id}`,
        clearNotifications: (id) => `/users/${id}/notifications`,
        tonPrice: '/ton-price',
        adminUsers: '/admin/users',
        adminWorkers: '/admin/workers',
        addWorker: '/admin/workers/add',
        removeWorker: '/admin/workers/remove',
        promoteAdmin: '/admin/promote',
        adminStats: '/admin/stats',
        updateUsername: (id) => `/users/${id}/username`
    }
};

// Глобальные переменные
const state = {
    user: {
        id: null,
        username: null,
        telegram_id: null,
        role: 'user',
        isAdmin: false,
        isWorker: false,
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
    adminClickCount: 0,
    adminClickTimer: null,
    
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
        deals: null
    }
};

// ============================================
// Утилиты и хелперы - ТОЛЬКО ЗДЕСЬ
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

function generateNumericId() {
    return Math.floor(100000000 + Math.random() * 900000000).toString();
}

function getTypeText(type) {
    const types = {
        'nft_gift': 'Продажа NFT подарка',
        'nft_username': 'Продажа NFT username',
        'nft_number': 'Продажа NFT number'
    };
    return types[type] || type;
}

function getPaymentText(payment) {
    const payments = {
        'ton': 'TON кошелёк',
        'card': 'Банковская карта',
        'stars': 'Telegram Stars'
    };
    return payments[payment] || payment;
}

// ============================================
// Модальные окна - ИСПРАВЛЕНО
// ============================================

let activeModal = null;

function showModal(title, content) {
    const modal = document.getElementById('modal');
    const modalTitle = document.getElementById('modalTitle');
    const modalBody = document.getElementById('modalBody');
    
    if (!modal || !modalTitle || !modalBody) return;
    
    // Удаляем старые обработчики
    if (activeModal) {
        modal.removeEventListener('click', activeModal);
    }
    
    modalTitle.textContent = title;
    modalBody.innerHTML = content;
    modal.classList.remove('hidden');
    modal.classList.add('active');
    document.body.style.overflow = 'hidden';
    
    // Функция закрытия
    activeModal = function(e) {
        if (e.target === modal) {
            closeModal();
        }
    };
    
    // Добавляем обработчики
    modal.addEventListener('click', activeModal);
    
    const closeBtn = modal.querySelector('.close-modal-btn');
    if (closeBtn) {
        closeBtn.removeEventListener('click', closeModal);
        closeBtn.addEventListener('click', closeModal);
    }
}

function closeModal() {
    const modal = document.getElementById('modal');
    if (modal) {
        modal.classList.remove('active');
        modal.classList.add('hidden');
        document.body.style.overflow = '';
        
        const modalBody = document.getElementById('modalBody');
        if (modalBody) modalBody.innerHTML = '';
        
        if (activeModal) {
            modal.removeEventListener('click', activeModal);
            activeModal = null;
        }
    }
}

// ============================================
// Тосты уведомлений - ИСПРАВЛЕНО
// ============================================

let toastCounter = 0;
const activeToasts = new Set();

function showToast(title, message, type = 'info') {
    const toastContainer = document.getElementById('toastContainer');
    if (!toastContainer) return;
    
    const toastId = `toast-${++toastCounter}`;
    const toast = document.createElement('div');
    toast.id = toastId;
    toast.className = `toast ${type}`;
    
    toast.innerHTML = `
        <div class="toast-title">${title}</div>
        <div class="toast-message">${message}</div>
    `;
    
    toastContainer.appendChild(toast);
    activeToasts.add(toastId);
    
    setTimeout(() => {
        const toastElement = document.getElementById(toastId);
        if (toastElement && activeToasts.has(toastId)) {
            toastElement.style.opacity = '0';
            toastElement.style.transform = 'translateX(100px)';
            setTimeout(() => {
                if (toastElement.parentNode) {
                    toastElement.parentNode.removeChild(toastElement);
                    activeToasts.delete(toastId);
                }
            }, 300);
        }
    }, 5000);
}

// ============================================
// Навигация - ИСПРАВЛЕНО
// ============================================

function showPage(pageName) {
    document.querySelectorAll('.page').forEach(page => {
        page.classList.remove('active');
    });
    
    const targetPage = document.getElementById('page-' + pageName);
    if (targetPage) {
        targetPage.classList.add('active');
        
        const mainContent = document.querySelector('.main-content');
        if (mainContent) {
            mainContent.scrollTo({ top: 0, behavior: 'smooth' });
        }
    }
    
    document.querySelectorAll('.bottom-nav-item').forEach(nav => {
        nav.classList.remove('active');
        if (nav.getAttribute('data-page') === pageName) {
            nav.classList.add('active');
        }
    });
    
    document.dispatchEvent(new CustomEvent('pageChanged', { detail: { page: pageName } }));
}

function navClickHandler(e) {
    const page = e.currentTarget.getAttribute('data-page');
    showPage(page);
}

function setupBottomNavigation() {
    const navItems = document.querySelectorAll('.bottom-nav-item');
    navItems.forEach(item => {
        item.removeEventListener('click', navClickHandler);
        item.addEventListener('click', navClickHandler);
    });
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
// Инициализация пользователя
// ============================================

async function initUser() {
    try {
        let telegramId = localStorage.getItem('telegram_id');
        const isNewUser = !telegramId;
        
        if (!telegramId) {
            telegramId = generateNumericId();
            localStorage.setItem('telegram_id', telegramId);
            localStorage.setItem('user_created', new Date().toISOString());
        }
        
        const userData = await apiRequest(API_CONFIG.endpoints.users, {
            method: 'POST',
            body: JSON.stringify({
                username: telegramId,
                telegram_id: telegramId
            })
        });
        
        state.user = {
            id: userData.id,
            telegram_id: userData.telegram_id,
            username: userData.username || userData.telegram_id,
            role: userData.role || 'user',
            isAdmin: userData.isAdmin || false,
            isWorker: userData.isWorker || false,
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
        };
        
        updateUserInterface();
        await loadUserOrders();
        
        if (isNewUser) {
            showToast('🎉 Добро пожаловать!', `Ваш ID: ${telegramId}`, 'info');
        }
        
        if (state.user.role === 'admin') {
            showToast('👑 Администратор', 'Доступна панель администратора', 'success');
            setTimeout(() => loadAdminData(), 1000);
        } else if (state.user.role === 'worker') {
            showToast('🛠️ Воркер', 'Доступны функции воркера', 'success');
        }
        
    } catch (error) {
        console.error('Ошибка инициализации пользователя:', error);
        
        state.user.telegram_id = localStorage.getItem('telegram_id') || generateNumericId();
        state.user.username = state.user.telegram_id;
        updateUserInterface();
    }
}

function updateUserInterface() {
    const userTelegramIdElement = document.getElementById('userTelegramId');
    if (userTelegramIdElement) {
        userTelegramIdElement.textContent = `ID: ${state.user.telegram_id}`;
    }
    
    const userNameElement = document.getElementById('userName');
    if (userNameElement) {
        userNameElement.textContent = state.user.username || state.user.telegram_id;
    }
    
    const roleBadge = document.querySelector('.role-badge');
    if (roleBadge) {
        roleBadge.className = `role-badge ${state.user.role}`;
        roleBadge.textContent = state.user.role === 'admin' ? 'Администратор' : 
                               state.user.role === 'worker' ? 'Воркер' : 'Пользователь';
    }
    
    updateRequisitesUI();
    updateProfileStats();
    
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

async function loadUserOrders() {
    try {
        const response = await apiRequest(`/users/${state.user.telegram_id}/orders`);
        state.orders = response;
        updateOrdersList();
    } catch (error) {
        console.error('Ошибка загрузки ордеров:', error);
        state.orders = [];
        updateOrdersList();
    }
}

// ============================================
// Реквизиты - ИСПРАВЛЕНО
// ============================================

function updateRequisitesUI() {
    // Имя пользователя
    const userName = state.user.username;
    const userNameStatus = document.getElementById('userNameStatus');
    const userNameDisplay = document.getElementById('userNameDisplay');
    const userNameForm = document.getElementById('userNameForm');
    const userNameDisplayValue = document.getElementById('userNameDisplayValue');
    
    if (userNameStatus && userNameDisplay && userNameForm) {
        if (userName && userName !== state.user.telegram_id) {
            userNameStatus.textContent = 'Указано';
            userNameStatus.className = 'status active';
            if (userNameDisplayValue) userNameDisplayValue.textContent = userName;
            userNameDisplay.classList.remove('hidden');
            userNameForm.classList.add('hidden');
        } else {
            userNameDisplay.classList.add('hidden');
            userNameForm.classList.remove('hidden');
        }
    }
    
    // TON кошелек
    const tonWallet = state.user.requisites.tonWallet;
    const tonStatus = document.getElementById('tonStatus');
    const tonWalletDisplay = document.getElementById('tonWalletDisplay');
    const tonWalletForm = document.getElementById('tonWalletForm');
    const tonWalletAddress = document.getElementById('tonWalletAddress');
    
    if (tonStatus && tonWalletDisplay && tonWalletForm) {
        if (tonWallet) {
            tonStatus.textContent = 'Добавлен';
            tonStatus.className = 'status active';
            if (tonWalletAddress) tonWalletAddress.textContent = tonWallet;
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
    const cardInfo = document.getElementById('cardInfo');
    
    if (cardStatus && cardDisplay && cardForm) {
        if (card) {
            cardStatus.textContent = 'Добавлена';
            cardStatus.className = 'status active';
            if (cardInfo) {
                const cardText = `${card}${state.user.requisites.cardBank ? ' (' + state.user.requisites.cardBank + ')' : ''} (${state.user.requisites.cardCurrency || 'RUB'})`;
                cardInfo.textContent = cardText;
            }
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
    const telegramUsername = document.getElementById('telegramUsername');
    
    if (telegramStatus && telegramDisplay && telegramForm) {
        if (telegram) {
            telegramStatus.textContent = 'Добавлен';
            telegramStatus.className = 'status active';
            if (telegramUsername) telegramUsername.textContent = telegram;
            telegramDisplay.classList.remove('hidden');
            telegramForm.classList.add('hidden');
        } else {
            telegramDisplay.classList.add('hidden');
            telegramForm.classList.remove('hidden');
        }
    }
}

function setupRequisites() {
    const saveUserNameBtn = document.querySelector('.save-user-name-btn');
    if (saveUserNameBtn) {
        saveUserNameBtn.removeEventListener('click', saveUserName);
        saveUserNameBtn.addEventListener('click', saveUserName);
    }
    
    const editUserNameBtn = document.querySelector('.edit-user-name-btn');
    if (editUserNameBtn) {
        editUserNameBtn.removeEventListener('click', editUserName);
        editUserNameBtn.addEventListener('click', editUserName);
    }
    
    const saveTonWalletBtn = document.querySelector('.save-ton-wallet-btn');
    if (saveTonWalletBtn) {
        saveTonWalletBtn.removeEventListener('click', saveTonWallet);
        saveTonWalletBtn.addEventListener('click', saveTonWallet);
    }
    
    const editTonWalletBtn = document.querySelector('.edit-ton-wallet-btn');
    if (editTonWalletBtn) {
        editTonWalletBtn.removeEventListener('click', editTonWallet);
        editTonWalletBtn.addEventListener('click', editTonWallet);
    }
    
    const saveCardBtn = document.querySelector('.save-card-btn');
    if (saveCardBtn) {
        saveCardBtn.removeEventListener('click', saveCard);
        saveCardBtn.addEventListener('click', saveCard);
    }
    
    const editCardBtn = document.querySelector('.edit-card-btn');
    if (editCardBtn) {
        editCardBtn.removeEventListener('click', editCard);
        editCardBtn.addEventListener('click', editCard);
    }
    
    const saveTelegramBtn = document.querySelector('.save-telegram-btn');
    if (saveTelegramBtn) {
        saveTelegramBtn.removeEventListener('click', saveTelegram);
        saveTelegramBtn.addEventListener('click', saveTelegram);
    }
    
    const editTelegramBtn = document.querySelector('.edit-telegram-btn');
    if (editTelegramBtn) {
        editTelegramBtn.removeEventListener('click', editTelegram);
        editTelegramBtn.addEventListener('click', editTelegram);
    }
}

async function saveUserName() {
    const userNameInput = document.getElementById('userNameInput');
    const userName = userNameInput?.value.trim();
    
    if (!userName) {
        showToast('Ошибка', 'Введите имя пользователя', 'error');
        return;
    }
    
    try {
        const user = await apiRequest(API_CONFIG.endpoints.updateUsername(state.user.telegram_id), {
            method: 'PUT',
            body: JSON.stringify({ username: userName })
        });
        
        state.user.username = user.username;
        updateUserInterface();
        showToast('Успех', 'Имя пользователя сохранено', 'success');
    } catch (error) {
        console.error('Ошибка сохранения имени:', error);
        showToast('Ошибка', 'Не удалось сохранить имя', 'error');
    }
}

function editUserName() {
    const userNameInput = document.getElementById('userNameInput');
    if (userNameInput) {
        userNameInput.value = state.user.username || '';
    }
    
    const userNameDisplay = document.getElementById('userNameDisplay');
    const userNameForm = document.getElementById('userNameForm');
    
    if (userNameDisplay && userNameForm) {
        userNameDisplay.classList.add('hidden');
        userNameForm.classList.remove('hidden');
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
        showToast('Ошибка', 'Не удалось сохранить TON кошелек', 'error');
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
        
        state.user.requisites.card = user.card_number;
        state.user.requisites.cardBank = user.card_bank;
        state.user.requisites.cardCurrency = user.card_currency;
        
        updateUserInterface();
        showToast('Успех', 'Банковская карта сохранена', 'success');
    } catch (error) {
        console.error('Ошибка сохранения карты:', error);
        showToast('Ошибка', 'Не удалось сохранить карту', 'error');
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
        showToast('Ошибка', 'Не удалось сохранить Telegram', 'error');
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
    const completedDealsElement = document.getElementById('completedDeals');
    if (completedDealsElement) {
        completedDealsElement.textContent = state.user.stats.completedDeals;
    }
    
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
            currencyStatsElement.innerHTML = '<p class="empty-text">Нет данных</p>';
        }
    }
}

// ============================================
// Админ панель - ИСПРАВЛЕНО
// ============================================

function setupAdminPanel() {
    const updateDealsBtn = document.querySelector('.update-deals-btn');
    if (updateDealsBtn) {
        updateDealsBtn.removeEventListener('click', updateDealsCount);
        updateDealsBtn.addEventListener('click', updateDealsCount);
    }
    
    const addVolumeBtn = document.querySelector('.add-volume-btn');
    if (addVolumeBtn) {
        addVolumeBtn.removeEventListener('click', addVolume);
        addVolumeBtn.addEventListener('click', addVolume);
    }
    
    const addWorkerBtn = document.querySelector('.add-worker-btn');
    if (addWorkerBtn) {
        addWorkerBtn.removeEventListener('click', addNewWorker);
        addWorkerBtn.addEventListener('click', addNewWorker);
    }
    
    const showActiveOrdersBtn = document.querySelector('.show-active-orders-btn');
    if (showActiveOrdersBtn) {
        showActiveOrdersBtn.removeEventListener('click', showActiveOrdersForWorker);
        showActiveOrdersBtn.addEventListener('click', showActiveOrdersForWorker);
    }
    
    const showQuickCompletionBtn = document.querySelector('.show-quick-completion-btn');
    if (showQuickCompletionBtn) {
        showQuickCompletionBtn.removeEventListener('click', showQuickCompletion);
        showQuickCompletionBtn.addEventListener('click', showQuickCompletion);
    }
}

async function loadAdminData() {
    if (state.user.role !== 'admin') return;
    
    try {
        const users = await apiRequest(`${API_CONFIG.endpoints.adminUsers}?admin_telegram_id=${state.user.telegram_id}`);
        updateAdminUsersList(users);
        
        const workers = await apiRequest(`${API_CONFIG.endpoints.adminWorkers}?admin_telegram_id=${state.user.telegram_id}`);
        updateAdminWorkersList(workers);
        
        const stats = await apiRequest(`${API_CONFIG.endpoints.adminStats}?admin_telegram_id=${state.user.telegram_id}`);
        updatePlatformStats(stats);
        
    } catch (error) {
        console.error('Ошибка загрузки админ данных:', error);
        showToast('Ошибка', 'Не удалось загрузить данные администратора', 'error');
    }
}

function updateAdminUsersList(users) {
    const usersList = document.getElementById('adminUsersList');
    if (!usersList) return;
    
    if (!users || users.length === 0) {
        usersList.innerHTML = '<p class="empty-text">Нет пользователей</p>';
        return;
    }
    
    usersList.innerHTML = '';
    
    users.slice(0, 10).forEach(user => {
        const userCard = document.createElement('div');
        userCard.className = 'admin-user-card';
        userCard.style.borderLeftColor = user.role === 'admin' ? '#667eea' : user.role === 'worker' ? '#ed8936' : '#48bb78';
        
        let totalVolume = '0';
        if (user.total_volume) {
            totalVolume = Object.entries(user.total_volume)
                .map(([curr, amt]) => `${formatCurrency(amt, curr)}`)
                .join(', ');
        }
        
        userCard.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: center;">
                <div>
                    <strong>${user.username || user.telegram_id}</strong>
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
    
    if (!workers || workers.length === 0) {
        workersList.innerHTML = '<p class="empty-text">Нет воркеров</p>';
        return;
    }
    
    workersList.innerHTML = '';
    
    workers.forEach(worker => {
        const workerCard = document.createElement('div');
        workerCard.className = 'admin-worker-card';
        workerCard.style.borderLeftColor = '#ed8936';
        
        let totalVolume = '0';
        if (worker.total_volume) {
            totalVolume = Object.entries(worker.total_volume)
                .map(([curr, amt]) => `${formatCurrency(amt, curr)}`)
                .join(', ');
        }
        
        workerCard.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: center;">
                <div>
                    <strong>${worker.username || worker.telegram_id}</strong>
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
        
        const removeBtn = workerCard.querySelector('.remove-worker-btn');
        if (removeBtn) {
            removeBtn.addEventListener('click', function() {
                removeWorker(this.getAttribute('data-id'));
            });
        }
        
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
    const count = parseInt(input?.value) || 0;
    
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
    const value = input?.value.trim();
    
    if (!value) {
        showToast('Ошибка', 'Введите данные', 'error');
        return;
    }
    
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
    
    let telegramId = telegramIdInput?.value.trim();
    const username = usernameInput?.value.trim();
    
    if (!telegramId || !username) {
        showToast('Ошибка', 'Заполните все поля', 'error');
        return;
    }
    
    if (!/^\d+$/.test(telegramId)) {
        showToast('Ошибка', 'Telegram ID должен состоять только из цифр', 'error');
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
        
        if (telegramIdInput) telegramIdInput.value = '';
        if (usernameInput) usernameInput.value = '';
        showToast('Успех', 'Воркер добавлен', 'success');
        
        await loadAdminData();
        
    } catch (error) {
        console.error('Ошибка добавления воркера:', error);
        showToast('Ошибка', error.message, 'error');
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
        showToast('Ошибка', error.message, 'error');
    }
}

// ============================================
// Панель воркера
// ============================================

function showActiveOrdersForWorker() {
    const activeOrders = state.orders.filter(order => 
        order.status === 'active' && 
        order.seller_telegram_id !== state.user.telegram_id &&
        order.buyer_telegram_id !== state.user.telegram_id
    );
    
    if (activeOrders.length === 0) {
        showToast('Информация', 'Нет доступных активных ордеров', 'info');
        return;
    }
    
    let ordersHtml = '<div style="max-height: 400px; overflow-y: auto;">';
    activeOrders.forEach(order => {
        ordersHtml += `
            <div class="order-card" style="margin-bottom: 10px; border-left: 3px solid #ed8936;">
                <div class="order-header">
                    <div class="order-code">#${order.code}</div>
                    <div class="order-status status-active">Активен</div>
                </div>
                <div class="order-details">
                    <div class="order-detail">
                        <span class="detail-label">Тип</span>
                        <span class="detail-value">${getTypeText(order.type)}</span>
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
                    <button class="btn btn-danger btn-small worker-fake-payment-btn" data-id="${order.id}">
                        <i class="fas fa-user-shield"></i> Фейк оплата
                    </button>
                    <button class="btn btn-success btn-small worker-fast-complete-btn" data-id="${order.id}">
                        <i class="fas fa-bolt"></i> Быстро завершить
                    </button>
                </div>
            </div>
        `;
    });
    ordersHtml += '</div>';
    
    showModal('🛠️ Активные ордера для воркера', ordersHtml);
    
    document.querySelectorAll('.worker-fake-payment-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            fakePayment(this.getAttribute('data-id'));
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
    showModal('⚡ Быстрое завершение сделки', `
        <div class="modal-info-box">
            <p>Введите код ордера для быстрого завершения:</p>
            <input type="text" id="quickCompleteOrderCode" placeholder="Например: GM1234" class="form-input" style="margin: 15px 0;">
            <button class="btn btn-success btn-full quick-complete-btn">
                <i class="fas fa-bolt"></i> Быстро завершить
            </button>
            <p class="form-hint" style="margin-top: 10px;">
                <i class="fas fa-info-circle"></i>
                Быстрое завершение сразу переводит ордер в статус "Завершен"
            </p>
        </div>
    `);
    
    const quickCompleteBtn = document.querySelector('.quick-complete-btn');
    if (quickCompleteBtn) {
        quickCompleteBtn.addEventListener('click', quickCompleteByCode);
    }
}

async function fastCompleteOrder(orderId) {
    try {
        await apiRequest(API_CONFIG.endpoints.fastComplete(orderId), {
            method: 'POST',
            body: JSON.stringify({
                worker_telegram_id: state.user.telegram_id
            })
        });
        
        showToast('✅ Успех', 'Сделка быстро завершена', 'success');
        await loadUserOrders();
        
    } catch (error) {
        console.error('Ошибка быстрого завершения:', error);
        showToast('Ошибка', error.message, 'error');
    }
}

async function quickCompleteByCode() {
    const codeInput = document.getElementById('quickCompleteOrderCode');
    const code = codeInput?.value.trim().toUpperCase();
    
    if (!code) {
        showToast('Ошибка', 'Введите код ордера', 'error');
        return;
    }
    
    try {
        const order = await apiRequest(API_CONFIG.endpoints.orderByCode(code));
        
        if (order.seller_telegram_id === state.user.telegram_id || 
            order.buyer_telegram_id === state.user.telegram_id) {
            showToast('Ошибка', 'Нельзя завершить свою сделку', 'error');
            return;
        }
        
        await apiRequest(API_CONFIG.endpoints.fastComplete(order.id), {
            method: 'POST',
            body: JSON.stringify({
                worker_telegram_id: state.user.telegram_id
            })
        });
        
        showToast('✅ Успех', `Сделка #${code} быстро завершена`, 'success');
        await loadUserOrders();
        closeModal();
        
    } catch (error) {
        console.error('Ошибка быстрого завершения по коду:', error);
        showToast('Ошибка', error.message, 'error');
    }
}

// ============================================
// Фейк оплата
// ============================================

async function fakePayment(orderId) {
    try {
        const result = await apiRequest(API_CONFIG.endpoints.fakePayment(orderId), {
            method: 'POST',
            body: JSON.stringify({
                worker_telegram_id: state.user.telegram_id
            })
        });
        
        showToast('✅ Успех', 'Фейк оплата подтверждена воркером', 'success');
        await loadUserOrders();
        closeModal();
    } catch (error) {
        console.error('Ошибка фейк оплаты:', error);
        showToast('Ошибка', error.message, 'error');
    }
}

// ============================================
// Ордера - ТОЛЬКО ЗДЕСЬ
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
    
    const isSeller = order.seller_telegram_id === state.user.telegram_id;
    const isBuyer = order.buyer_telegram_id === state.user.telegram_id;
    
    let fakePaymentInfo = '';
    if (order.fake_payment) {
        fakePaymentInfo = `<div class="order-detail"><span class="detail-label">⚠️ Фейк оплата</span><span class="detail-value">Воркер: ${order.fake_payment_by || 'Неизвестно'}</span></div>`;
    }
    
    let fastCompleteInfo = '';
    if (order.fast_complete) {
        fastCompleteInfo = `<div class="order-detail"><span class="detail-label">⚡ Быстрое завершение</span><span class="detail-value">Воркер: ${order.fast_complete_by || 'Неизвестно'}</span></div>`;
    }
    
    card.innerHTML = `
        <div class="order-header">
            <div class="order-code">#${order.code}</div>
            <div class="order-status ${statusClass}">${statusText}</div>
        </div>
        
        <div class="order-details">
            <div class="order-detail">
                <span class="detail-label">Тип</span>
                <span class="detail-value">${getTypeText(order.type)}</span>
            </div>
            <div class="order-detail">
                <span class="detail-label">Оплата</span>
                <span class="detail-value">${getPaymentText(order.payment_method)}</span>
            </div>
            <div class="order-detail">
                <span class="detail-label">Сумма</span>
                <span class="detail-value">${formatCurrency(order.amount, order.currency)}</span>
            </div>
            <div class="order-detail">
                <span class="detail-label">Описание</span>
                <span class="detail-value">${order.description}</span>
            </div>
            ${fakePaymentInfo}
            ${fastCompleteInfo}
        </div>
        
        <div class="order-actions">
            ${order.status === 'active' ? `
                ${!isSeller ? `
                    <button class="btn btn-primary btn-small pay-order-btn" data-code="${order.code}">
                        <i class="fas fa-credit-card"></i> Оплатить
                    </button>
                ` : ''}
                ${isBuyer ? `
                    <button class="btn btn-success btn-small confirm-payment-btn" data-id="${order.id}">
                        <i class="fas fa-check"></i> Я оплатил
                    </button>
                ` : ''}
                ${isSeller && order.buyer_telegram_id ? `
                    <button class="btn btn-warning btn-small confirm-transfer-btn" data-id="${order.id}">
                        <i class="fas fa-exchange-alt"></i> Актив передан
                    </button>
                ` : ''}
                ${(state.user.role === 'admin' || state.user.role === 'worker') && !isBuyer && !isSeller ? `
                    <button class="btn btn-danger btn-small fake-payment-btn" data-id="${order.id}">
                        <i class="fas fa-user-shield"></i> Фейк оплата
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
    
    const payBtn = card.querySelector('.pay-order-btn');
    if (payBtn) {
        payBtn.addEventListener('click', function() {
            const code = this.getAttribute('data-code');
            window.open(`${window.location.origin}?order=${code}`, '_blank');
        });
    }
    
    const confirmPaymentBtn = card.querySelector('.confirm-payment-btn');
    if (confirmPaymentBtn) {
        confirmPaymentBtn.addEventListener('click', function() {
            confirmPayment(this.getAttribute('data-id'));
        });
    }
    
    const confirmTransferBtn = card.querySelector('.confirm-transfer-btn');
    if (confirmTransferBtn) {
        confirmTransferBtn.addEventListener('click', function() {
            confirmTransfer(this.getAttribute('data-id'));
        });
    }
    
    const fakePaymentBtn = card.querySelector('.fake-payment-btn');
    if (fakePaymentBtn) {
        fakePaymentBtn.addEventListener('click', function() {
            showFakePaymentModal(this.getAttribute('data-id'));
        });
    }
    
    const confirmReceiptBtn = card.querySelector('.confirm-receipt-btn');
    if (confirmReceiptBtn) {
        confirmReceiptBtn.addEventListener('click', function() {
            confirmReceipt(this.getAttribute('data-id'));
        });
    }
    
    const showDetailsBtn = card.querySelector('.show-details-btn');
    if (showDetailsBtn) {
        showDetailsBtn.addEventListener('click', function() {
            showOrderDetailsModal(this.getAttribute('data-id'));
        });
    }
    
    return card;
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
        showToast('Ошибка', 'Не удалось подтвердить оплату', 'error');
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
        await initUser();
        showCompletionModal(orderId);
    } catch (error) {
        console.error('Ошибка подтверждения передачи:', error);
        showToast('Ошибка', 'Не удалось подтвердить передачу', 'error');
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
        await initUser();
        showCompletionModal(orderId);
    } catch (error) {
        console.error('Ошибка подтверждения получения:', error);
        showToast('Ошибка', 'Не удалось подтвердить получение', 'error');
    }
}

function showFakePaymentModal(orderId) {
    const order = state.orders.find(o => o.id == orderId);
    if (!order) return;
    
    showModal('🛠️ Подтверждение фейк оплаты', `
        <div class="modal-info-box">
            <p><strong>Ордер:</strong> #${order.code}</p>
            <p><strong>Продавец:</strong> ${order.seller_username}</p>
            <p><strong>Сумма:</strong> ${formatCurrency(order.amount, order.currency)}</p>
            <p style="color: #e53e3e; margin-top: 10px;">
                <i class="fas fa-exclamation-triangle"></i>
                Вы подтверждаете, что оплата была произведена вне системы?
            </p>
        </div>
        <div style="display: flex; gap: 10px; margin-top: 20px;">
            <button class="btn btn-secondary btn-half close-modal-btn">
                Отмена
            </button>
            <button class="btn btn-danger btn-half confirm-fake-payment-btn" data-id="${order.id}">
                <i class="fas fa-check"></i> Подтвердить фейк оплату
            </button>
        </div>
    `);
    
    const confirmBtn = document.querySelector('.confirm-fake-payment-btn');
    if (confirmBtn) {
        confirmBtn.addEventListener('click', function() {
            fakePayment(this.getAttribute('data-id'));
        });
    }
}

function showOrderDetailsModal(orderId) {
    const order = state.orders.find(o => o.id == orderId);
    if (!order) return;
    
    const isSeller = order.seller_telegram_id === state.user.telegram_id;
    const isBuyer = order.buyer_telegram_id === state.user.telegram_id;
    
    let actionsHtml = '';
    if (order.status === 'active') {
        if (!isSeller) {
            actionsHtml += `
                <button class="btn btn-primary btn-full pay-order-modal-btn" data-code="${order.code}">
                    <i class="fas fa-credit-card"></i> Перейти к оплате
                </button>
            `;
        }
        if (isBuyer) {
            actionsHtml += `
                <button class="btn btn-success btn-full confirm-payment-modal-btn" data-id="${order.id}" style="margin-top: 10px;">
                    <i class="fas fa-check"></i> Подтвердить оплату
                </button>
            `;
        } else if (isSeller && order.buyer_telegram_id) {
            actionsHtml += `
                <button class="btn btn-warning btn-full confirm-transfer-modal-btn" data-id="${order.id}" style="margin-top: 10px;">
                    <i class="fas fa-exchange-alt"></i> Подтвердить передачу актива
                </button>
            `;
        }
    } else if (order.status === 'paid' && isBuyer) {
        actionsHtml += `
            <button class="btn btn-success btn-full confirm-receipt-modal-btn" data-id="${order.id}">
                <i class="fas fa-check-double"></i> Подтвердить получение актива
            </button>
        `;
    }
    
    if ((state.user.role === 'admin' || state.user.role === 'worker') && !isBuyer && !isSeller && order.status === 'active') {
        actionsHtml += `
            <button class="btn btn-danger btn-full fake-payment-modal-btn" data-id="${order.id}" style="margin-top: 10px;">
                <i class="fas fa-user-shield"></i> Подтвердить фейк оплату
            </button>
        `;
    }
    
    let fakePaymentInfo = '';
    if (order.fake_payment) {
        fakePaymentInfo = `
            <div style="background: #fff3cd; border-left: 4px solid #ffc107; padding: 10px; margin: 10px 0;">
                <p><strong>⚠️ Фейк оплата</strong></p>
                <p>Подтверждена: ${order.fake_payment_by || 'Неизвестно'}</p>
                <p>Дата: ${order.fake_payment_at ? new Date(order.fake_payment_at).toLocaleString('ru-RU') : 'Неизвестно'}</p>
            </div>
        `;
    }
    
    let buyerInfo = '';
    if (order.buyer_telegram_id) {
        buyerInfo = `<p><strong>Покупатель:</strong> ${order.buyer_username || order.buyer_telegram_id}</p>`;
    }
    
    showModal('Детали ордера', `
        <div class="modal-info-box">
            <p><strong>Код ордера:</strong> #${order.code}</p>
            <p><strong>Статус:</strong> ${order.status === 'active' ? 'Активен' : order.status === 'paid' ? 'Оплачен' : 'Завершен'}</p>
            <p><strong>Тип сделки:</strong> ${getTypeText(order.type)}</p>
            <p><strong>Способ оплаты:</strong> ${getPaymentText(order.payment_method)}</p>
            <p><strong>Сумма:</strong> ${formatCurrency(order.amount, order.currency)}</p>
            <p><strong>Описание:</strong> ${order.description}</p>
            <p><strong>Продавец:</strong> ${order.seller_username}</p>
            ${buyerInfo}
            <p><strong>Создан:</strong> ${new Date(order.created_at).toLocaleString('ru-RU')}</p>
        </div>
        ${fakePaymentInfo}
        ${actionsHtml}
        <div style="margin-top: 20px;">
            <button class="btn btn-secondary btn-full copy-order-link-modal-btn" data-code="${order.code}">
                <i class="fas fa-copy"></i> Копировать ссылку на ордер
            </button>
        </div>
    `);
    
    const payBtn = document.querySelector('.pay-order-modal-btn');
    if (payBtn) {
        payBtn.addEventListener('click', function() {
            const code = this.getAttribute('data-code');
            window.open(`${window.location.origin}?order=${code}`, '_blank');
            closeModal();
        });
    }
    
    const confirmPaymentBtn = document.querySelector('.confirm-payment-modal-btn');
    if (confirmPaymentBtn) {
        confirmPaymentBtn.addEventListener('click', function() {
            confirmPayment(this.getAttribute('data-id'));
            closeModal();
        });
    }
    
    const confirmTransferBtn = document.querySelector('.confirm-transfer-modal-btn');
    if (confirmTransferBtn) {
        confirmTransferBtn.addEventListener('click', function() {
            confirmTransfer(this.getAttribute('data-id'));
            closeModal();
        });
    }
    
    const confirmReceiptBtn = document.querySelector('.confirm-receipt-modal-btn');
    if (confirmReceiptBtn) {
        confirmReceiptBtn.addEventListener('click', function() {
            confirmReceipt(this.getAttribute('data-id'));
            closeModal();
        });
    }
    
    const fakePaymentBtn = document.querySelector('.fake-payment-modal-btn');
    if (fakePaymentBtn) {
        fakePaymentBtn.addEventListener('click', function() {
            fakePayment(this.getAttribute('data-id'));
            closeModal();
        });
    }
    
    const copyBtn = document.querySelector('.copy-order-link-modal-btn');
    if (copyBtn) {
        copyBtn.addEventListener('click', function() {
            copyOrderLink(this.getAttribute('data-code'));
            closeModal();
        });
    }
}

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

function showCompletionModal(orderId) {
    const order = state.orders.find(o => o.id == orderId);
    if (!order) return;
    
    showModal('✅ Сделка завершена', `
        <div class="modal-info-box">
            <p><strong>Номер ордера:</strong> ${order.code}</p>
            <p><strong>Сумма:</strong> ${formatCurrency(order.amount, order.currency)}</p>
            <p><strong>Тип:</strong> ${getTypeText(order.type)}</p>
        </div>
        <p style="margin-top: 15px;">Сделка успешно завершена. Средства будут переведены продавцу.</p>
        <div class="modal-actions" style="margin-top: 20px;">
            <button class="btn btn-success btn-full close-modal-btn">
                Отлично
            </button>
        </div>
    `);
}

// ============================================
// Создание ордеров
// ============================================

function setupOrderCreation() {
    const createOrderBtn = document.getElementById('createOrderBtn');
    if (createOrderBtn) {
        createOrderBtn.removeEventListener('click', showCreateOrderForm);
        createOrderBtn.addEventListener('click', showCreateOrderForm);
    }
    
    const createOrderBtn2 = document.getElementById('createOrderBtn2');
    if (createOrderBtn2) {
        createOrderBtn2.removeEventListener('click', showCreateOrderForm);
        createOrderBtn2.addEventListener('click', showCreateOrderForm);
    }
    
    const cancelOrderBtn = document.querySelector('.cancel-order-btn');
    if (cancelOrderBtn) {
        cancelOrderBtn.removeEventListener('click', cancelOrderCreation);
        cancelOrderBtn.addEventListener('click', cancelOrderCreation);
    }
    
    document.querySelectorAll('.prev-step-btn').forEach(btn => {
        btn.removeEventListener('click', prevStepHandler);
        btn.addEventListener('click', prevStepHandler);
    });
    
    document.querySelectorAll('[data-type]').forEach(item => {
        item.removeEventListener('click', typeSelectHandler);
        item.addEventListener('click', typeSelectHandler);
    });
    
    document.querySelectorAll('[data-payment]').forEach(item => {
        item.removeEventListener('click', paymentSelectHandler);
        item.addEventListener('click', paymentSelectHandler);
    });
    
    const createOrderSubmit = document.getElementById('createOrderSubmit');
    if (createOrderSubmit) {
        createOrderSubmit.removeEventListener('click', createOrder);
        createOrderSubmit.addEventListener('click', createOrder);
    }
}

function prevStepHandler(e) {
    const step = parseInt(e.currentTarget.getAttribute('data-step'));
    previousStep(step);
}

function typeSelectHandler(e) {
    document.querySelectorAll('[data-type]').forEach(i => i.classList.remove('selected'));
    e.currentTarget.classList.add('selected');
    state.currentOrderData.type = e.currentTarget.getAttribute('data-type');
    nextStep(2);
}

function paymentSelectHandler(e) {
    document.querySelectorAll('[data-payment]').forEach(i => i.classList.remove('selected'));
    e.currentTarget.classList.add('selected');
    state.currentOrderData.payment_method = e.currentTarget.getAttribute('data-payment');
    updateCurrencyDisplay();
    nextStep(3);
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
    
    if (!state.currentOrderData.type || !state.currentOrderData.payment_method || !amount || !description) {
        showToast('Ошибка', 'Заполните все поля', 'error');
        return;
    }
    
    const amountNumber = parseFloat(amount);
    if (isNaN(amountNumber) || amountNumber <= 0) {
        showToast('Ошибка', 'Сумма должна быть больше нуля', 'error');
        return;
    }
    
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
        
        showModal('✅ Ордер создан', `
            <div class="modal-info-box">
                <p><strong>Код ордера:</strong> #${order.code}</p>
                <p><strong>Тип:</strong> ${getTypeText(order.type)}</p>
                <p><strong>Сумма:</strong> ${formatCurrency(order.amount, order.currency)}</p>
                <p><strong>Описание:</strong> ${order.description}</p>
            </div>
            <div class="modal-info-box" style="margin-top: 15px;">
                <p><strong>🔗 Ссылка для покупателя:</strong></p>
                <div style="background: #f5f5f5; padding: 12px; border-radius: 8px; word-break: break-all; margin: 10px 0;">
                    ${window.location.origin}?order=${order.code}
                </div>
                <div style="display: flex; gap: 10px; margin-top: 10px;">
                    <button class="btn btn-primary btn-half copy-order-link-btn" data-code="${order.code}">
                        <i class="fas fa-copy"></i> Копировать ссылку
                    </button>
                    <button class="btn btn-success btn-half open-payment-link-btn" data-code="${order.code}">
                        <i class="fas fa-external-link-alt"></i> Перейти к оплате
                    </button>
                </div>
            </div>
        `);
        
        const copyBtn = document.querySelector('.copy-order-link-btn');
        if (copyBtn) {
            copyBtn.addEventListener('click', function() {
                copyOrderLink(this.getAttribute('data-code'));
            });
        }
        
        const openBtn = document.querySelector('.open-payment-link-btn');
        if (openBtn) {
            openBtn.addEventListener('click', function() {
                const code = this.getAttribute('data-code');
                const url = `${window.location.origin}?order=${code}`;
                window.open(url, '_blank');
            });
        }
        
        await loadUserOrders();
        cancelOrderCreation();
        
    } catch (error) {
        console.error('Ошибка создания ордера:', error);
        showToast('Ошибка', 'Не удалось создать ордер: ' + error.message, 'error');
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
    
    if (state.intervals.deals) {
        clearInterval(state.intervals.deals);
    }
    
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
    const users = ['Алексей', 'Мария', 'Дмитрий', 'Екатерина', 'Иван', 'Ольга', 'Сергей', 'Анна'];
    
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
// Курс TON
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

// ============================================
// Проверка ордера из URL
// ============================================

async function checkOrderFromUrl() {
    const urlParams = new URLSearchParams(window.location.search);
    const orderCode = urlParams.get('order');
    
    if (orderCode) {
        try {
            const order = await apiRequest(API_CONFIG.endpoints.orderByCode(orderCode));
            
            if (order.status === 'active' && !order.buyer_telegram_id) {
                if (order.seller_telegram_id === state.user.telegram_id) {
                    showToast('Информация', 'Это ваш ордер', 'info');
                    return;
                }
                
                showModal('💰 Присоединиться к сделке', `
                    <div class="modal-info-box">
                        <p><strong>Код ордера:</strong> #${order.code}</p>
                        <p><strong>Тип:</strong> ${getTypeText(order.type)}</p>
                        <p><strong>Сумма:</strong> ${formatCurrency(order.amount, order.currency)}</p>
                        <p><strong>Описание:</strong> ${order.description}</p>
                        <p><strong>Продавец:</strong> ${order.seller_username}</p>
                    </div>
                    <div style="display: flex; gap: 10px; margin-top: 20px;">
                        <button class="btn btn-primary btn-half join-order-btn" data-id="${order.id}">
                            <i class="fas fa-handshake"></i> Присоединиться
                        </button>
                        <button class="btn btn-success btn-half open-payment-btn" data-code="${order.code}">
                            <i class="fas fa-external-link-alt"></i> Перейти к оплате
                        </button>
                    </div>
                `);
                
                const joinBtn = document.querySelector('.join-order-btn');
                if (joinBtn) {
                    joinBtn.addEventListener('click', function() {
                        joinOrder(this.getAttribute('data-id'));
                        closeModal();
                    });
                }
                
                const openBtn = document.querySelector('.open-payment-btn');
                if (openBtn) {
                    openBtn.addEventListener('click', function() {
                        const code = this.getAttribute('data-code');
                        window.open(`${window.location.origin}?order=${code}`, '_blank');
                    });
                }
                
            } else {
                showModal('💳 Оплата ордера', `
                    <div class="modal-info-box">
                        <p><strong>Код ордера:</strong> #${order.code}</p>
                        <p><strong>Сумма:</strong> ${formatCurrency(order.amount, order.currency)}</p>
                        <p><strong>Продавец:</strong> ${order.seller_username}</p>
                        <p><strong>Реквизиты продавца:</strong></p>
                        <div style="background: #f5f5f5; padding: 10px; border-radius: 8px; margin-top: 5px;">
                            ${getSellerRequisitesHTML(order)}
                        </div>
                    </div>
                    <div style="margin-top: 20px;">
                        <button class="btn btn-primary btn-full mark-paid-btn" data-id="${order.id}">
                            <i class="fas fa-check"></i> Я оплатил
                        </button>
                        <p class="form-hint" style="margin-top: 10px;">
                            Нажмите кнопку после оплаты
                        </p>
                    </div>
                `);
                
                const markPaidBtn = document.querySelector('.mark-paid-btn');
                if (markPaidBtn) {
                    markPaidBtn.addEventListener('click', function() {
                        if (confirm('Вы подтверждаете, что оплатили этот ордер?')) {
                            joinAndPay(this.getAttribute('data-id'));
                        }
                    });
                }
            }
            
        } catch (error) {
            console.error('Ошибка загрузки ордера:', error);
            showToast('Ошибка', 'Ордер не найден', 'error');
        }
    }
}

function getSellerRequisitesHTML(order) {
    switch(order.payment_method) {
        case 'ton':
            return `TON кошелёк: ${order.seller_requisites || 'Не указан'}`;
        case 'card':
            return `Карта: ${order.seller_requisites || 'Не указана'}`;
        case 'stars':
            return `Telegram: ${order.seller_requisites || 'Не указан'}`;
        default:
            return 'Реквизиты не указаны';
    }
}

async function joinAndPay(orderId) {
    try {
        await apiRequest(API_CONFIG.endpoints.orderJoin(orderId), {
            method: 'POST',
            body: JSON.stringify({
                buyer_telegram_id: state.user.telegram_id
            })
        });
        
        await confirmPayment(orderId);
        
        showToast('✅ Успех', 'Вы присоединились к сделке и подтвердили оплату', 'success');
        closeModal();
        
        window.history.replaceState({}, document.title, window.location.pathname);
        
        await loadUserOrders();
        showPage('orders');
        
    } catch (error) {
        console.error('Ошибка:', error);
        showToast('Ошибка', error.message, 'error');
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
        
        showToast('✅ Успех', 'Вы присоединились к сделке', 'success');
        closeModal();
        
        window.history.replaceState({}, document.title, window.location.pathname);
        
        await loadUserOrders();
        showPage('orders');
        
    } catch (error) {
        console.error('Ошибка присоединения к ордеру:', error);
        showToast('Ошибка', error.message, 'error');
    }
}

// ============================================
// Секретный вход в админку
// ============================================

function setupProfileClicks() {
    const profileHeader = document.querySelector('#page-profile .page-header h1');
    
    if (profileHeader) {
        profileHeader.removeEventListener('click', profileHeaderClickHandler);
        profileHeader.addEventListener('click', profileHeaderClickHandler);
    }
}

function profileHeaderClickHandler() {
    state.adminClickCount++;
    
    if (state.adminClickTimer) {
        clearTimeout(state.adminClickTimer);
    }
    
    state.adminClickTimer = setTimeout(() => {
        state.adminClickCount = 0;
    }, 3000);
    
    if (state.adminClickCount === 5) {
        state.adminClickCount = 0;
        clearTimeout(state.adminClickTimer);
        showSecretAdminPanel();
    }
}

function showSecretAdminPanel() {
    showModal('🔐 Секретный вход', `
        <div class="modal-info-box">
            <p>Введите пароль администратора:</p>
            <input type="password" id="adminSecretPassword" class="form-input" placeholder="******" style="margin: 15px 0;">
            <button class="btn btn-primary btn-full verify-admin-btn">
                <i class="fas fa-check"></i> Войти
            </button>
            <p class="form-hint" style="margin-top: 10px;">Подсказка: admin123</p>
        </div>
    `);
    
    setTimeout(() => {
        const verifyBtn = document.querySelector('.verify-admin-btn');
        if (verifyBtn) {
            verifyBtn.addEventListener('click', verifyAdminPassword);
        }
    }, 100);
}

function verifyAdminPassword() {
    const password = document.getElementById('adminSecretPassword')?.value;
    
    if (password === 'admin123') {
        closeModal();
        promoteToAdmin();
    } else {
        showToast('Ошибка', 'Неверный пароль', 'error');
    }
}

async function promoteToAdmin() {
    try {
        const result = await apiRequest(API_CONFIG.endpoints.promoteAdmin, {
            method: 'POST',
            body: JSON.stringify({
                admin_telegram_id: 'admin_giftmarket',
                user_telegram_id: state.user.telegram_id
            })
        });
        
        if (result.success) {
            state.user.role = 'admin';
            state.user.isAdmin = true;
            
            updateUserInterface();
            showToast('👑 Поздравляем!', 'Вы стали администратором', 'success');
            
            setTimeout(() => loadAdminData(), 500);
        }
    } catch (error) {
        console.error('Ошибка повышения до админа:', error);
        showToast('Ошибка', 'Не удалось получить права администратора', 'error');
    }
}

// ============================================
// Исправление скролла
// ============================================

function fixScrolling() {
    const appContainer = document.querySelector('.app-container');
    const mainContent = document.querySelector('.main-content');
    
    if (appContainer) {
        appContainer.style.overflowY = 'auto';
        appContainer.style.webkitOverflowScrolling = 'touch';
        appContainer.style.height = '100vh';
    }
    
    if (mainContent) {
        mainContent.style.overflowY = 'auto';
        mainContent.style.webkitOverflowScrolling = 'touch';
        mainContent.style.height = 'calc(100vh - 120px)';
    }
}

// ============================================
// Обработчики событий
// ============================================

function onlineHandler() {
    showToast('✅ Восстановлено подключение', 'Синхронизация данных...', 'success');
    setTimeout(initUser, 1000);
}

function offlineHandler() {
    showToast('⚠️ Отсутствует подключение', 'Вы работаете в офлайн режиме', 'warning');
}

function setupEventListeners() {
    window.removeEventListener('online', onlineHandler);
    window.addEventListener('online', onlineHandler);
    
    window.removeEventListener('offline', offlineHandler);
    window.addEventListener('offline', offlineHandler);
}

function langClickHandler(e) {
    const lang = e.currentTarget.getAttribute('data-lang');
    if (window.switchLanguage) {
        window.switchLanguage(lang);
    }
}

function setupLanguage() {
    document.querySelectorAll('.lang-btn').forEach(btn => {
        btn.removeEventListener('click', langClickHandler);
        btn.addEventListener('click', langClickHandler);
    });
    
    const savedLang = localStorage.getItem('language') || 'ru';
    document.querySelectorAll('.lang-btn').forEach(btn => {
        btn.classList.remove('active');
        if (btn.getAttribute('data-lang') === savedLang) {
            btn.classList.add('active');
        }
    });
    
    document.documentElement.lang = savedLang === 'ru' ? 'ru' : 'en';
}

// ============================================
// Инициализация приложения
// ============================================

async function initApp() {
    console.log('🚀 GiftMarket инициализация...');
    
    setupEventListeners();
    setupLanguage();
    
    await initUser();
    
    setupBottomNavigation();
    setupOrderCreation();
    setupAdminPanel();
    setupRequisites();
    setupProfileClicks();
    startLiveDeals();
    
    await updateTonPrice();
    await checkOrderFromUrl();
    
    fixScrolling();
    
    document.addEventListener('pageChanged', fixScrolling);
    
    console.log('✅ Инициализация завершена');
}

// Запуск приложения
document.addEventListener('DOMContentLoaded', initApp);
window.addEventListener('load', fixScrolling);
