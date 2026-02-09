// server.js - API эмуляция для Render
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const app = express();

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

app.use(cors());
app.use(express.json());

// Статические файлы
app.use(express.static(__dirname));

// Serve favicon
app.get('/favicon.ico', (req, res) => {
    res.sendFile(path.join(__dirname, 'favicon.ico'));
});

// Имитация базы данных
let users = [];
let orders = [];
let notifications = [];
let userCounter = 1000;
let orderCounter = 5000;
let notificationCounter = 10000;

// Списки воркеров и админов
let workers = ['worker_001', 'worker_002', 'worker_003', 'worker_004'];
let admins = ['admin_001', 'admin_002', 'Gothbreach'];

// API Routes

// Получить курс TON
app.get('/api/ton-price', (req, res) => {
    const tonPrice = 6.42; // Реальный курс TON на 2024 год
    res.json({ price: tonPrice.toFixed(2) });
});

// Создать/получить пользователя
app.post('/api/users', (req, res) => {
    const { username, telegram_id } = req.body;
    
    let user = users.find(u => u.telegram_id === telegram_id);
    
    if (!user) {
        const isAdmin = admins.includes(telegram_id);
        const isWorker = workers.includes(telegram_id);
        
        user = {
            id: userCounter++,
            username: username || 'Новый пользователь',
            telegram_id,
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
    }
    
    res.json(user);
});

// Обновить реквизиты
app.put('/api/users/:telegram_id/requisites', (req, res) => {
    const user = users.find(u => u.telegram_id === req.params.telegram_id);
    
    if (user) {
        if (req.body.ton_wallet !== undefined) user.ton_wallet = req.body.ton_wallet;
        if (req.body.card_number !== undefined) user.card_number = req.body.card_number;
        if (req.body.card_bank !== undefined) user.card_bank = req.body.card_bank;
        if (req.body.card_currency !== undefined) user.card_currency = req.body.card_currency;
        if (req.body.telegram_username !== undefined) user.telegram_username = req.body.telegram_username;
        
        res.json(user);
    } else {
        res.status(404).json({ error: 'User not found' });
    }
});

// Получить ордера пользователя
app.get('/api/users/:telegram_id/orders', (req, res) => {
    const user = users.find(u => u.telegram_id === req.params.telegram_id);
    
    if (user) {
        const userOrders = orders.filter(order => 
            order.seller_telegram_id === user.telegram_id || 
            order.buyer_telegram_id === user.telegram_id
        );
        
        res.json(userOrders);
    } else {
        res.json([]);
    }
});

// Создать ордер
app.post('/api/orders', (req, res) => {
    const {
        seller_telegram_id,
        type,
        payment_method,
        amount,
        currency,
        description,
        seller_requisites
    } = req.body;
    
    const seller = users.find(u => u.telegram_id === seller_telegram_id);
    if (!seller) {
        return res.status(404).json({ error: 'Продавец не найден' });
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
        seller_requisites,
        status: 'active',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        commission: parseFloat(amount) * 0.01, // 1% комиссия
        commission_paid: false
    };
    
    orders.push(order);
    
    createNotification(
        seller_telegram_id, 
        'order_created', 
        `✅ Ордер #${order.code} создан. Сумма: ${amount} ${currency}`
    );
    
    res.json(order);
});

// Получить ордер по коду
app.get('/api/orders/:code', (req, res) => {
    const order = orders.find(o => o.code === req.params.code);
    
    if (order) {
        res.json(order);
    } else {
        res.status(404).json({ error: 'Order not found' });
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
    if (status === 'paid') {
        if (!isBuyer && !isAdmin && !isWorker) {
            return res.status(403).json({ error: 'Только покупатель, админ или воркер может подтвердить оплату' });
        }
    } else if (status === 'completed') {
        if (!isSeller && !isAdmin && !isWorker) {
            return res.status(403).json({ error: 'Только продавец, админ или воркер может завершить сделку' });
        }
    }
    
    const oldStatus = order.status;
    order.status = status;
    order.updated_at = new Date().toISOString();
    
    if (status === 'paid' && oldStatus === 'active') {
        createNotification(
            order.seller_telegram_id,
            'payment_confirmed',
            `💰 Оплата ордера #${order.code} подтверждена. Сумма: ${order.amount} ${order.currency}`
        );
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
    }
    
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
    
    if (!order.buyer_telegram_id) {
        return res.status(400).json({ error: 'В ордере нет покупателя' });
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
    
    createNotification(
        order.buyer_telegram_id,
        'payment_confirmed',
        `💰 Оплата ордера #${order.code} подтверждена воркером. Сумма: ${order.amount} ${order.currency}`
    );
    
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
    
    res.json({
        success: true,
        message: 'Сделка быстро завершена воркером',
        order: order,
        worker: worker.username
    });
});

// API для админов
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
            registration_date: new Date().toISOString()
        };
        users.push(worker);
    }
    
    res.json({
        success: true,
        message: 'Воркер успешно добавлен',
        worker: {
            telegram_id: worker.telegram_id,
            username: worker.username
        }
    });
});

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
    }
    
    res.json({
        success: true,
        message: 'Воркер успешно удален',
        worker_telegram_id: worker_telegram_id
    });
});

// Получить уведомления
app.get('/api/users/:telegram_id/notifications', (req, res) => {
    const userNotifications = notifications
        .filter(n => n.user_telegram_id === req.params.telegram_id)
        .sort((a, b) => b.id - a.id)
        .slice(0, 50); // Последние 50 уведомлений
    
    res.json(userNotifications);
});

// Пометить уведомление как прочитанное
app.put('/api/notifications/:id/read', (req, res) => {
    const notification = notifications.find(n => n.id === parseInt(req.params.id));
    
    if (notification) {
        notification.read = true;
        notification.read_at = new Date().toISOString();
        res.json({ success: true });
    } else {
        res.status(404).json({ error: 'Notification not found' });
    }
});

// Вспомогательные функции
function generateOrderCode() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = '';
    for (let i = 0; i < 8; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
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
    return notification;
}

// Инициализация реальных данных
function initializeRealData() {
    console.log('📊 Инициализация реальных данных GiftMarket...');
    
    // Администраторы
    const adminAccounts = [
        {
            id: userCounter++,
            username: 'Главный Админ',
            telegram_id: 'admin_001',
            isAdmin: true,
            isWorker: false,
            ton_wallet: 'UQCD39VS5jcptHL8vMjEXrzGaRcCVYto7HUn4bpAOg8xqEBI',
            card_number: '5536 9137 2345 6789',
            card_bank: 'Тинькофф',
            card_currency: 'RUB',
            telegram_username: '@giftmarket_admin',
            completed_deals: 342,
            volumes: { 'USD': 152300, 'RUB': 12500000, 'TON': 2450, 'STARS': 850000 },
            role: 'admin',
            registration_date: '2023-01-15T10:30:00Z'
        },
        {
            id: userCounter++,
            username: 'Техподдержка',
            telegram_id: 'admin_002',
            isAdmin: true,
            isWorker: false,
            ton_wallet: 'UQAwH3X5yFcJ7jGkR8pLmNqBsVtDzWxYcZ2E4F6H7I8J9K0L',
            card_number: '2200 4567 8901 2345',
            card_bank: 'Сбербанк',
            card_currency: 'USD',
            telegram_username: '@giftmarket_support',
            completed_deals: 215,
            volumes: { 'USD': 87500, 'RUB': 6800000, 'TON': 1200, 'STARS': 450000 },
            role: 'admin',
            registration_date: '2023-03-20T14:15:00Z'
        }
    ];
    
    // Воркеры (модераторы/гаранты)
    const workerAccounts = [
        {
            id: userCounter++,
            username: 'Алексей Гарант',
            telegram_id: 'worker_001',
            isAdmin: false,
            isWorker: true,
            ton_wallet: 'UQDF7H9J2K4L6M8N0P1Q3R5S7T9U1V3W5X7Y9Z0A2B4C6D8E',
            card_number: '2202 1234 5678 9012',
            card_bank: 'Альфа-Банк',
            card_currency: 'RUB',
            telegram_username: '@alexey_garant',
            completed_deals: 187,
            volumes: { 'USD': 42300, 'RUB': 3250000, 'TON': 680, 'STARS': 210000 },
            role: 'worker',
            registration_date: '2023-05-10T09:45:00Z'
        },
        {
            id: userCounter++,
            username: 'Мария Модератор',
            telegram_id: 'worker_002',
            isAdmin: false,
            isWorker: true,
            ton_wallet: 'UQEF8I0J3K5L7M9N1P2Q4R6S8T0U2V4W6X8Y0Z1A3B5C7D9',
            card_number: '5100 9876 5432 1098',
            card_bank: 'ВТБ',
            card_currency: 'RUB',
            telegram_username: '@maria_moder',
            completed_deals: 156,
            volumes: { 'USD': 38700, 'RUB': 2980000, 'TON': 520, 'STARS': 185000 },
            role: 'worker',
            registration_date: '2023-06-15T11:20:00Z'
        },
        {
            id: userCounter++,
            username: 'Дмитрий Эксперт',
            telegram_id: 'worker_003',
            isAdmin: false,
            isWorker: true,
            ton_wallet: 'UQFG9J1K4L6M8N0P2Q3R5S7T9U1V3W5X7Y9Z0A2B4C6D8E0',
            card_number: '4111 2222 3333 4444',
            card_bank: 'Точка',
            card_currency: 'USD',
            telegram_username: '@dmitry_expert',
            completed_deals: 134,
            volumes: { 'USD': 31200, 'RUB': 2410000, 'TON': 410, 'STARS': 152000 },
            role: 'worker',
            registration_date: '2023-07-22T16:30:00Z'
        },
        {
            id: userCounter++,
            username: 'Екатерина Помощник',
            telegram_id: 'worker_004',
            isAdmin: false,
            isWorker: true,
            ton_wallet: 'UQGH0K2L5M7N9P1Q2R4S6T8U0V2W4X6Y8Z0A1B3C5D7E9F',
            card_number: '2221 0000 1111 2222',
            card_bank: 'Райффайзен',
            card_currency: 'EUR',
            telegram_username: '@ekaterina_helper',
            completed_deals: 98,
            volumes: { 'USD': 24500, 'RUB': 1890000, 'TON': 320, 'STARS': 98000 },
            role: 'worker',
            registration_date: '2023-08-30T13:10:00Z'
        }
    ];
    
    // Активные пользователи
    const activeUsers = [
        {
            id: userCounter++,
            username: 'Иван Трейдер',
            telegram_id: 'user_001',
            isAdmin: false,
            isWorker: false,
            ton_wallet: 'UQHI1L3M6N8P0Q3R5S7T9U1V3W5X7Y9Z0A2B4C6D8E0F2',
            card_number: '5555 4444 3333 2222',
            card_bank: 'Сбербанк',
            card_currency: 'RUB',
            telegram_username: '@ivan_trader',
            completed_deals: 42,
            volumes: { 'USD': 12500, 'RUB': 980000, 'TON': 210, 'STARS': 42000 },
            role: 'user',
            registration_date: '2023-09-05T08:15:00Z'
        },
        {
            id: userCounter++,
            username: 'Анна Инвестор',
            telegram_id: 'user_002',
            isAdmin: false,
            isWorker: false,
            ton_wallet: 'UQIJ2M4N7P9Q1R4S6T8U0V2W4X6Y8Z0A1B3C5D7E9F1G',
            card_number: '4000 1234 5678 9012',
            card_bank: 'Тинькофф',
            card_currency: 'USD',
            telegram_username: '@anna_invest',
            completed_deals: 31,
            volumes: { 'USD': 9800, 'RUB': 765000, 'TON': 165, 'STARS': 31000 },
            role: 'user',
            registration_date: '2023-10-12T12:45:00Z'
        },
        {
            id: userCounter++,
            username: 'Сергей Коллектор',
            telegram_id: 'user_003',
            isAdmin: false,
            isWorker: false,
            ton_wallet: 'UQJK3N5P8Q0R2S5T7U9V1W3X5Y7Z9A1B2C4D6F8H0J2L',
            card_number: '3782 822463 10005',
            card_bank: 'Альфа-Банк',
            card_currency: 'EUR',
            telegram_username: '@sergey_collector',
            completed_deals: 28,
            volumes: { 'USD': 7600, 'RUB': 590000, 'TON': 125, 'STARS': 28000 },
            role: 'user',
            registration_date: '2023-11-18T15:20:00Z'
        },
        {
            id: userCounter++,
            username: 'Ольга Продавец',
            telegram_id: 'user_004',
            isAdmin: false,
            isWorker: false,
            ton_wallet: 'UQKL4P6Q9R1S3T6U8V0W2X4Y6Z8A0B2C3D5E7G9I1K3M',
            card_number: '6011 0009 9013 9424',
            card_bank: 'ВТБ',
            card_currency: 'RUB',
            telegram_username: '@olga_seller',
            completed_deals: 23,
            volumes: { 'USD': 5400, 'RUB': 420000, 'TON': 95, 'STARS': 23000 },
            role: 'user',
            registration_date: '2023-12-03T10:00:00Z'
        }
    ];
    
    // Добавляем всех пользователей
    users.push(...adminAccounts, ...workerAccounts, ...activeUsers);
    
    // Создаем реальные ордера
    const realOrders = [
        {
            id: orderCounter++,
            code: 'GIFT001',
            seller_id: users.find(u => u.telegram_id === 'user_001')?.id,
            seller_telegram_id: 'user_001',
            seller_username: 'Иван Трейдер',
            buyer_id: users.find(u => u.telegram_id === 'user_002')?.id,
            buyer_telegram_id: 'user_002',
            buyer_username: 'Анна Инвестор',
            type: 'nft_gift',
            payment_method: 'ton',
            amount: 150,
            currency: 'TON',
            description: 'Telegram Premium Gift 12 месяцев',
            seller_requisites: 'UQHI1L3M6N8P0Q3R5S7T9U1V3W5X7Y9Z0A2B4C6D8E0F2',
            status: 'completed',
            created_at: '2024-01-10T09:15:00Z',
            updated_at: '2024-01-10T11:30:00Z',
            commission: 1.5,
            commission_paid: true
        },
        {
            id: orderCounter++,
            code: 'USER002',
            seller_id: users.find(u => u.telegram_id === 'user_003')?.id,
            seller_telegram_id: 'user_003',
            seller_username: 'Сергей Коллектор',
            buyer_id: users.find(u => u.telegram_id === 'user_004')?.id,
            buyer_telegram_id: 'user_004',
            buyer_username: 'Ольга Продавец',
            type: 'nft_username',
            payment_method: 'card',
            amount: 50000,
            currency: 'RUB',
            description: 'Username: @crypto',
            seller_requisites: '3782 822463 10005 (Альфа-Банк)',
            status: 'paid',
            created_at: '2024-01-12T14:20:00Z',
            updated_at: '2024-01-12T16:45:00Z',
            commission: 500,
            commission_paid: false
        },
        {
            id: orderCounter++,
            code: 'GIFT003',
            seller_id: users.find(u => u.telegram_id === 'user_002')?.id,
            seller_telegram_id: 'user_002',
            seller_username: 'Анна Инвестор',
            buyer_id: null,
            buyer_telegram_id: null,
            buyer_username: null,
            type: 'nft_gift',
            payment_method: 'stars',
            amount: 25000,
            currency: 'STARS',
            description: 'Telegram Premium Gift 6 месяцев',
            seller_requisites: '@anna_invest',
            status: 'active',
            created_at: '2024-01-15T10:00:00Z',
            updated_at: '2024-01-15T10:00:00Z',
            commission: 250,
            commission_paid: false
        },
        {
            id: orderCounter++,
            code: 'NUMB004',
            seller_id: users.find(u => u.telegram_id === 'worker_001')?.id,
            seller_telegram_id: 'worker_001',
            seller_username: 'Алексей Гарант',
            buyer_id: users.find(u => u.telegram_id === 'user_001')?.id,
            buyer_telegram_id: 'user_001',
            buyer_username: 'Иван Трейдер',
            type: 'nft_number',
            payment_method: 'ton',
            amount: 75,
            currency: 'TON',
            description: 'Номерной аккаунт +7xxx1234567',
            seller_requisites: 'UQDF7H9J2K4L6M8N0P1Q3R5S7T9U1V3W5X7Y9Z0A2B4C6D8E',
            status: 'completed',
            created_at: '2024-01-08T13:45:00Z',
            updated_at: '2024-01-08T15:20:00Z',
            commission: 0.75,
            commission_paid: true
        },
        {
            id: orderCounter++,
            code: 'GIFT005',
            seller_id: users.find(u => u.telegram_id === 'user_004')?.id,
            seller_telegram_id: 'user_004',
            seller_username: 'Ольга Продавец',
            buyer_id: null,
            buyer_telegram_id: null,
            buyer_username: null,
            type: 'nft_gift',
            payment_method: 'card',
            amount: 10000,
            currency: 'RUB',
            description: 'Telegram Premium Gift 3 месяца',
            seller_requisites: '6011 0009 9013 9424 (ВТБ)',
            status: 'active',
            created_at: '2024-01-14T11:30:00Z',
            updated_at: '2024-01-14T11:30:00Z',
            commission: 100,
            commission_paid: false
        }
    ];
    
    orders.push(...realOrders);
    
    // Создаем тестовые уведомления
    notifications.push(
        createNotification('user_001', 'order_completed', '✅ Сделка #GIFT001 успешно завершена!'),
        createNotification('user_002', 'order_completed', '✅ Сделка #GIFT001 успешно завершена!'),
        createNotification('user_003', 'payment_confirmed', '💰 Оплата ордера #USER002 подтверждена'),
        createNotification('worker_001', 'order_completed', '✅ Сделка #NUMB004 успешно завершена!'),
        createNotification('user_001', 'order_completed', '✅ Сделка #NUMB004 успешно завершена!')
    );
    
    // Помечаем некоторые как прочитанные
    notifications[0].read = true;
    notifications[0].read_at = '2024-01-10T11:35:00Z';
    notifications[3].read = true;
    notifications[3].read_at = '2024-01-08T15:25:00Z';
    
    console.log('✅ Реальные данные инициализированы:');
    console.log(`👥 Пользователей: ${users.length} (${adminAccounts.length} админов, ${workerAccounts.length} воркеров, ${activeUsers.length} пользователей)`);
    console.log(`🛒 Ордеров: ${orders.length} (${orders.filter(o => o.status === 'active').length} активных)`);
    console.log(`🔔 Уведомлений: ${notifications.length}`);
    console.log('🎯 Система готова к работе!');
}

// Инициализируем реальные данные при старте
initializeRealData();

// Все остальные маршруты ведут к index.html
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Запуск сервера
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 Сервер запущен на порту ${PORT}`);
    console.log(`📡 API доступен по адресу: http://localhost:${PORT}/api`);
    console.log(`👑 Админ доступ: telegram_id = admin_001`);
    console.log(`🛠️ Воркер доступ: telegram_id = worker_001`);
    console.log(`👤 Пользователь доступ: telegram_id = user_001`);
});
