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

// Курсы валют к USD (реальные на 2024)
const exchangeRates = {
    'RUB': 0.011,
    'USD': 1,
    'EUR': 1.09,
    'KZT': 0.0022,
    'UAH': 0.024,
    'TON': 6.42,
    'STARS': 0.013
};

// ФУНКЦИЯ ПЕРЕКЛЮЧЕНИЯ ЯЗЫКА - ОПРЕДЕЛЕНА ГЛОБАЛЬНО
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

// Инициализация
document.addEventListener('DOMContentLoaded', async function() {
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
    
    await initUser();
    setupNavigation();
    setupOrderCreation();
    startDealsHistory();
    setupAdminTrigger();
    await updateTonPrice();
    await checkOrderFromUrl();
    startNotificationPolling();
});

// Инициализация пользователя
async function initUser() {
    let telegramId = localStorage.getItem('telegram_id');
    
    if (!telegramId) {
        telegramId = 'user_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
        localStorage.setItem('telegram_id', telegramId);
    }

    try {
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
        
        // Показываем приветствие для админов/воркеров
        if (userData.isAdmin) {
            showToast('👑 Админ доступ', 'Добро пожаловать в панель администратора!', 'success');
        } else if (userData.isWorker) {
            showToast('🛠️ Воркер доступ', 'Добро пожаловать в панель воркера!', 'success');
        }
    } catch (error) {
        console.error('Ошибка инициализации пользователя:', error);
        showToast(t('error'), t('serverError'), 'error');
    }
}

// Загрузка ордеров пользователя
async function loadUserOrders() {
    try {
        const response = await fetch(`${API_URL}/users/${userData.telegram_id}/orders`);
        const data = await response.json();
        orders = data;
        updateOrdersList();
    } catch (error) {
        console.error('Ошибка загрузки ордеров:', error);
    }
}

// Обновление курса TON
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

// Конвертация в USD
function convertToUSD(amount, currency) {
    const rate = exchangeRates[currency] || 1;
    return amount * rate;
}

// Обновление UI
function updateUserInterface() {
    if (userData.requisites.tonWallet) {
        document.getElementById('tonStatus').textContent = t('added');
        document.getElementById('tonStatus').classList.add('active');
        document.getElementById('tonWalletAddress').textContent = userData.requisites.tonWallet;
        document.getElementById('tonWalletDisplay').classList.remove('hidden');
        document.getElementById('tonWalletForm').classList.add('hidden');
    }
    
    if (userData.requisites.card) {
        document.getElementById('cardStatus').textContent = t('addedFemale');
        document.getElementById('cardStatus').classList.add('active');
        const cardInfo = `${userData.requisites.card}${userData.requisites.cardBank ? ' (' + userData.requisites.cardBank + ')' : ''}`;
        document.getElementById('cardInfo').textContent = cardInfo + ' (' + userData.requisites.cardCurrency + ')';
        document.getElementById('cardDisplay').classList.remove('hidden');
        document.getElementById('cardForm').classList.add('hidden');
    }
    
    if (userData.requisites.telegram) {
        document.getElementById('telegramStatus').textContent = t('added');
        document.getElementById('telegramStatus').classList.add('active');
        document.getElementById('telegramUsername').textContent = userData.requisites.telegram;
        document.getElementById('telegramDisplay').classList.remove('hidden');
        document.getElementById('telegramForm').classList.add('hidden');
    }
    
    updateProfileStats();
    
    // Показываем админ/воркер интерфейс
    if (userData.isAdmin || userData.isWorker) {
        showAdminWorkerUI();
    }
}

// Навигация
function setupNavigation() {
    const navItems = document.querySelectorAll('.nav-item');
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
    
    if (pageName === 'orders') {
        updateOrdersList();
    }
}

// Показ админ/воркер интерфейса
function showAdminWorkerUI() {
    const ordersPage = document.getElementById('page-orders');
    const profilePage = document.getElementById('page-profile');
    
    // Добавляем панель воркера на страницу ордеров
    if (ordersPage && !document.getElementById('workerPanelBtn')) {
        const workerBtn = document.createElement('button');
        workerBtn.id = 'workerPanelBtn';
        workerBtn.className = 'btn btn-warning btn-full';
        workerBtn.style.marginTop = '20px';
        workerBtn.style.marginBottom = '20px';
        workerBtn.innerHTML = '<i class="fas fa-user-shield"></i> Панель воркера';
        workerBtn.onclick = showWorkerPanel;
        ordersPage.appendChild(workerBtn);
    }
    
    // Показываем админ панель
    if (userData.isAdmin) {
        const adminPanel = document.getElementById('adminPanel');
        if (adminPanel) {
            adminPanel.classList.remove('hidden');
            loadAdminData();
        }
    }
}

// Панель воркера
function showWorkerPanel() {
    showModal('🛠️ Панель воркера', `
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
                <h4>Статистика воркера:</h4>
                <div style="display: flex; justify-content: space-around; text-align: center;">
                    <div>
                        <div style="font-size: 24px; font-weight: bold;">${userData.stats.completedDeals}</div>
                        <div style="font-size: 12px;">Завершено сделок</div>
                    </div>
                    <div>
                        <div style="font-size: 24px; font-weight: bold;">$${Object.values(userData.stats.volumes).reduce((sum, vol) => sum + convertToUSD(vol, Object.keys(userData.stats.volumes)[0]), 0).toFixed(2)}</div>
                        <div style="font-size: 12px;">Общий оборот</div>
                    </div>
                </div>
            </div>
            
            <button class="btn btn-secondary btn-full" onclick="closeModal()" style="margin-top: 20px;">
                Закрыть
            </button>
        </div>
    `);
}

// Функция фейковой оплаты для воркеров
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

// Быстрое завершение сделки для воркеров
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
            await initUser(); // Обновляем статистику
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

// Загрузка данных для админ панели
async function loadAdminData() {
    if (!userData.isAdmin) return;
    
    try {
        // Загружаем список пользователей
        const usersResponse = await fetch(`${API_URL}/admin/users?admin_telegram_id=${userData.telegram_id}`);
        if (usersResponse.ok) {
            const usersList = await usersResponse.json();
            updateAdminUsersList(usersList);
        }
        
        // Загружаем список воркеров
        const workersResponse = await fetch(`${API_URL}/admin/workers?admin_telegram_id=${userData.telegram_id}`);
        if (workersResponse.ok) {
            const workersList = await workersResponse.json();
            updateAdminWorkersList(workersList);
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
                Сделок: ${user.completed_deals} | Объем: $${Object.values(user.total_volume || {}).reduce((sum, vol) => sum + vol, 0).toFixed(2)}
            </div>
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
                Сделок: ${worker.completed_deals} | Объем: $${Object.values(worker.total_volume || {}).reduce((sum, vol) => sum + vol, 0).toFixed(2)}
            </div>
        </div>
    `).join('');
}

// Добавление нового воркера
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

// Удаление воркера
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

// Активация админ панели по 5 кликам
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
                // Активируем временный админ доступ
                userData.isAdmin = true;
                userData.role = 'admin';
                updateUserInterface();
                showToast('👑 Админ доступ', 'Включен временный админ доступ!', 'success');
                clickCount = 0;
                
                // Сохраняем на 24 часа
                localStorage.setItem('temp_admin_access', 'true');
                localStorage.setItem('temp_admin_expire', Date.now() + 24 * 60 * 60 * 1000);
                return;
            }
            
            clickTimer = setTimeout(function() {
                clickCount = 0;
            }, 2000);
        });
    }
    
    // Проверяем временный админ доступ при загрузке
    const tempAdmin = localStorage.getItem('temp_admin_access');
    const tempExpire = localStorage.getItem('temp_admin_expire');
    if (tempAdmin === 'true' && tempExpire && Date.now() < parseInt(tempExpire)) {
        userData.isAdmin = true;
        userData.role = 'admin';
    }
}

// [ОСТАЛЬНОЙ КОД ОСТАЕТСЯ БЕЗ ИЗМЕНЕНИЙ - СОХРАНЯЕТ ВСЕ СУЩЕСТВУЮЩИЕ ФУНКЦИИ]
// saveTonWallet, editTonWallet, saveCard, editCard, saveTelegram, editTelegram,
// setupOrderCreation, showCreateOrderForm, cancelOrderCreation, resetOrderForm,
// nextStep, previousStep, createOrder, updateOrdersList, createOrderCard,
// copyOrderLink, confirmPayment, confirmTransfer, actuallyConfirmTransfer,
// confirmReceipt, showCompletionModal, showOrderDetailsModal, startDealsHistory,
// generateRandomDeal, addDealToHistory, updateProfileStats, updateDealsCount,
// addVolume, showModal, closeModal, showToast, startNotificationPolling,
// checkNotifications, checkOrderFromUrl, showBuyerView, joinOrder
// Эти функции остаются без изменений из предыдущего кода

// Обновляем HTML для админ панели
document.addEventListener('DOMContentLoaded', function() {
    // Добавляем дополнительные секции в админ панель
    const adminPanel = document.getElementById('adminPanel');
    if (adminPanel) {
        adminPanel.innerHTML += `
            <div class="admin-section">
                <h4><i class="fas fa-users"></i> Все пользователи</h4>
                <div id="adminUsersList" class="admin-list" style="max-height: 300px; overflow-y: auto; margin: 10px 0;"></div>
            </div>
            
            <div class="admin-section">
                <h4><i class="fas fa-user-shield"></i> Воркеры</h4>
                <div id="adminWorkersList" class="admin-list" style="max-height: 200px; overflow-y: auto; margin: 10px 0;"></div>
                
                <div class="add-worker-form" style="margin-top: 15px;">
                    <h5>Добавить нового воркера</h5>
                    <div style="display: flex; gap: 10px; margin-bottom: 10px;">
                        <input type="text" id="newWorkerTelegramId" placeholder="Telegram ID" class="form-input" style="flex: 1;">
                        <input type="text" id="newWorkerUsername" placeholder="Имя" class="form-input" style="flex: 1;">
                    </div>
                    <button class="btn btn-success btn-full" onclick="addNewWorker()">
                        <i class="fas fa-plus"></i> Добавить воркера
                    </button>
                </div>
            </div>
            
            <div class="admin-section">
                <h4><i class="fas fa-chart-bar"></i> Статистика платформы</h4>
                <div id="platformStats" style="background: #f8f9fa; padding: 15px; border-radius: 8px;">
                    <div style="display: flex; justify-content: space-around; text-align: center;">
                        <div>
                            <div style="font-size: 24px; font-weight: bold;" id="totalUsers">0</div>
                            <div style="font-size: 12px;">Всего пользователей</div>
                        </div>
                        <div>
                            <div style="font-size: 24px; font-weight: bold;" id="totalOrders">0</div>
                            <div style="font-size: 12px;">Всего ордеров</div>
                        </div>
                        <div>
                            <div style="font-size: 24px; font-weight: bold;" id="totalVolume">$0</div>
                            <div style="font-size: 12px;">Общий оборот</div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }
});

// Функция для обновления статистики платформы
async function updatePlatformStats() {
    if (!userData.isAdmin) return;
    
    try {
        const usersResponse = await fetch(`${API_URL}/admin/users?admin_telegram_id=${userData.telegram_id}`);
        if (usersResponse.ok) {
            const usersList = await usersResponse.json();
            document.getElementById('totalUsers').textContent = usersList.length;
            
            let totalVolume = 0;
            usersList.forEach(user => {
                if (user.total_volume) {
                    Object.entries(user.total_volume).forEach(([currency, amount]) => {
                        totalVolume += convertToUSD(amount, currency);
                    });
                }
            });
            document.getElementById('totalVolume').textContent = `$${totalVolume.toFixed(2)}`;
        }
        
        // Общее количество ордеров можно получить из загруженных
        document.getElementById('totalOrders').textContent = orders.length;
    } catch (error) {
        console.error('Ошибка обновления статистики:', error);
    }
}

// Обновляем loadAdminData
async function loadAdminData() {
    if (!userData.isAdmin) return;
    
    try {
        const usersResponse = await fetch(`${API_URL}/admin/users?admin_telegram_id=${userData.telegram_id}`);
        if (usersResponse.ok) {
            const usersList = await usersResponse.json();
            updateAdminUsersList(usersList);
            updatePlatformStats();
        }
        
        const workersResponse = await fetch(`${API_URL}/admin/workers?admin_telegram_id=${userData.telegram_id}`);
        if (workersResponse.ok) {
            const workersList = await workersResponse.json();
            updateAdminWorkersList(workersList);
        }
    } catch (error) {
        console.error('Ошибка загрузки данных админа:', error);
    }
}
