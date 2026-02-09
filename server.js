// server.js - API эмуляция для Render
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const app = express();

// Middleware для настройки CSP заголовков
app.use((req, res, next) => {
    // Разрешаем все для демонстрации (не для продакшена!)
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
let userCounter = 1;
let orderCounter = 1;
let notificationCounter = 1;

// API Routes

// Получить курс TON
app.get('/api/ton-price', (req, res) => {
    const tonPrice = Math.random() * 0.5 + 5.0;
    res.json({ price: tonPrice.toFixed(2) });
});

// Создать/получить пользователя
app.post('/api/users', (req, res) => {
    const { username, telegram_id } = req.body;
    
    let user = users.find(u => u.telegram_id === telegram_id);
    
    if (!user) {
        user = {
            id: userCounter++,
            username: username || 'Пользователь',
            telegram_id,
            isAdmin: false,
            ton_wallet: null,
            card_number: null,
            card_bank: null,
            card_currency: null,
            telegram_username: null,
            completed_deals: Math.floor(Math.random() * 50),
            volumes: {
                'USD': Math.random() * 10000,
                'RUB': Math.random() * 500000,
                'TON': Math.random() * 50
            }
        };
        users.push(user);
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
    
    const order = {
        id: orderCounter++,
        code: generateOrderCode(),
        seller_id: users.find(u => u.telegram_id === seller_telegram_id)?.id,
        seller_telegram_id,
        buyer_id: null,
        buyer_telegram_id: null,
        type,
        payment_method,
        amount: parseFloat(amount),
        currency,
        description,
        seller_requisites,
        status: 'active',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
    };
    
    orders.push(order);
    
    // Создаем уведомление для продавца
    createNotification(seller_telegram_id, 'order_created', `Ордер #${order.code} создан`);
    
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
        return res.status(404).json({ error: 'Order not found' });
    }
    
    if (order.seller_telegram_id === buyer_telegram_id) {
        return res.status(400).json({ error: 'Cannot join your own order' });
    }
    
    const buyer = users.find(u => u.telegram_id === buyer_telegram_id);
    
    if (!buyer) {
        return res.status(400).json({ error: 'Buyer not found' });
    }
    
    order.buyer_id = buyer.id;
    order.buyer_telegram_id = buyer_telegram_id;
    order.updated_at = new Date().toISOString();
    
    createNotification(
        order.seller_telegram_id,
        'buyer_joined',
        `Покупатель присоединился к ордеру #${order.code}`
    );
    
    res.json(order);
});

// Обновить статус ордера
app.put('/api/orders/:id/status', (req, res) => {
    const orderId = parseInt(req.params.id);
    const { status, user_telegram_id } = req.body;
    
    const order = orders.find(o => o.id === orderId);
    
    if (!order) {
        return res.status(404).json({ error: 'Order not found' });
    }
    
    const user = users.find(u => u.telegram_id === user_telegram_id);
    
    if (!user) {
        return res.status(400).json({ error: 'User not found' });
    }
    
    if (user.id !== order.seller_id && user.id !== order.buyer_id && !user.isAdmin) {
        return res.status(403).json({ error: 'Access denied' });
    }
    
    order.status = status;
    order.updated_at = new Date().toISOString();
    
    if (status === 'paid') {
        createNotification(
            order.seller_telegram_id,
            'payment_confirmed',
            `Оплата ордера #${order.code} подтверждена`
        );
    } else if (status === 'completed') {
        createNotification(
            order.seller_telegram_id,
            'order_completed',
            `Сделка #${order.code} успешно завершена`
        );
        
        const seller = users.find(u => u.telegram_id === order.seller_telegram_id);
        const buyer = users.find(u => u.telegram_id === order.buyer_telegram_id);
        
        if (seller) {
            seller.completed_deals = (seller.completed_deals || 0) + 1;
            seller.volumes = seller.volumes || {};
            seller.volumes[order.currency] = (seller.volumes[order.currency] || 0) + order.amount;
        }
        
        if (buyer) {
            buyer.completed_deals = (buyer.completed_deals || 0) + 1;
        }
    }
    
    res.json(order);
});

// Получить уведомления
app.get('/api/users/:telegram_id/notifications', (req, res) => {
    const userNotifications = notifications
        .filter(n => n.user_telegram_id === req.params.telegram_id)
        .sort((a, b) => b.id - a.id);
    
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

// Инициализация тестовых данных
function initializeTestData() {
    const testUser = {
        id: userCounter++,
        username: 'Тестовый Пользователь',
        telegram_id: 'test_user_123',
        isAdmin: false,
        ton_wallet: 'UQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
        card_number: '1234 5678 9012 3456',
        card_bank: 'Сбербанк',
        card_currency: 'RUB',
        telegram_username: '@testuser',
        completed_deals: 15,
        volumes: {
            'USD': 2500,
            'RUB': 150000,
            'TON': 45
        }
    };
    users.push(testUser);
    
    const orderTypes = ['nft_gift', 'nft_username', 'nft_number'];
    const paymentMethods = ['ton', 'card', 'stars'];
    const currencies = ['USD', 'RUB', 'TON', 'STARS'];
    
    for (let i = 0; i < 5; i++) {
        const order = {
            id: orderCounter++,
            code: generateOrderCode(),
            seller_id: testUser.id,
            seller_telegram_id: testUser.telegram_id,
            buyer_id: i < 2 ? userCounter++ : null,
            buyer_telegram_id: i < 2 ? 'buyer_' + i : null,
            type: orderTypes[i % 3],
            payment_method: paymentMethods[i % 3],
            amount: Math.floor(Math.random() * 1000) + 100,
            currency: currencies[i % 4],
            description: `Тестовый ордер ${i + 1} - Описание сделки`,
            seller_requisites: i % 3 === 0 ? testUser.ton_wallet : 
                             i % 3 === 1 ? `${testUser.card_number} (${testUser.card_bank})` :
                             testUser.telegram_username,
            status: i === 0 ? 'active' : i === 1 ? 'paid' : 'completed',
            created_at: new Date(Date.now() - i * 86400000).toISOString(),
            updated_at: new Date(Date.now() - i * 43200000).toISOString()
        };
        orders.push(order);
        
        if (i > 1) {
            createNotification(
                testUser.telegram_id,
                'order_completed',
                `Сделка #${order.code} успешно завершена`
            );
        }
    }
    
    console.log('✅ Тестовые данные инициализированы');
    console.log(`👥 Пользователей: ${users.length}`);
    console.log(`🛒 Ордеров: ${orders.length}`);
    console.log(`🔔 Уведомлений: ${notifications.length}`);
}

// Инициализируем тестовые данные при старте
initializeTestData();

// Все остальные маршруты ведут к index.html
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Запуск сервера
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 Сервер запущен на порту ${PORT}`);
    console.log(`📡 API доступен по адресу: http://localhost:${PORT}/api`);
});
