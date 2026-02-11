require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const path = require('path');
const { Pool } = require('pg');

const app = express();

// Security middleware
app.use(helmet({
    contentSecurityPolicy: false, // Отключаем для простоты на Render
}));

// Rate limiting
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100
});
app.use('/api/', limiter);

// Middleware
app.use(compression());
app.use(cors({
    origin: process.env.FRONTEND_URL || '*',
    credentials: true
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Database connection for Render PostgreSQL
const db = new Pool({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT || 5432,
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    ssl: {
        rejectUnauthorized: false // Важно для Render PostgreSQL
    },
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
});

// Test database connection
db.connect((err, client, release) => {
    if (err) {
        console.error('❌ Database connection error:', err.stack);
    } else {
        console.log('✅ Database connected successfully');
        release();
    }
});

// Initialize database tables
async function initDatabase() {
    try {
        await db.query(`
            CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY,
                telegram_id VARCHAR(255) UNIQUE NOT NULL,
                username VARCHAR(255),
                ton_wallet VARCHAR(255),
                card_number VARCHAR(255),
                card_bank VARCHAR(255),
                card_currency VARCHAR(10),
                telegram_username VARCHAR(255),
                completed_deals INTEGER DEFAULT 0,
                volumes JSONB DEFAULT '{}',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS orders (
                id SERIAL PRIMARY KEY,
                code VARCHAR(10) UNIQUE NOT NULL,
                seller_id INTEGER REFERENCES users(id),
                buyer_id INTEGER REFERENCES users(id),
                type VARCHAR(50) NOT NULL,
                payment_method VARCHAR(20) NOT NULL,
                amount DECIMAL(15,2) NOT NULL,
                currency VARCHAR(10) NOT NULL,
                description TEXT,
                seller_requisites TEXT,
                status VARCHAR(20) DEFAULT 'active',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS notifications (
                id SERIAL PRIMARY KEY,
                user_id INTEGER REFERENCES users(id),
                order_id INTEGER REFERENCES orders(id),
                type VARCHAR(50) NOT NULL,
                message TEXT NOT NULL,
                read BOOLEAN DEFAULT false,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            CREATE INDEX IF NOT EXISTS idx_orders_code ON orders(code);
            CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
            CREATE INDEX IF NOT EXISTS idx_notifications_user_read ON notifications(user_id, read);
        `);
        console.log('✅ Database tables initialized');
    } catch (error) {
        console.error('❌ Database initialization error:', error);
    }
}
initDatabase();

// Generate random order code
function generateOrderCode() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = '';
    for (let i = 0; i < 8; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
}

// API Routes
const apiRouter = express.Router();

// Health check for Render
apiRouter.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Get TON price
apiRouter.get('/ton-price', async (req, res) => {
    try {
        const response = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=the-open-network&vs_currencies=usd');
        const data = await response.json();
        res.json({ price: data['the-open-network']?.usd || 5.5 });
    } catch (error) {
        console.error('Error fetching TON price:', error);
        res.json({ price: 5.5 });
    }
});

// Users endpoints
apiRouter.post('/users', async (req, res) => {
    const { username, telegram_id } = req.body;
    
    try {
        const result = await db.query(
            `INSERT INTO users (username, telegram_id) 
             VALUES ($1, $2) 
             ON CONFLICT (telegram_id) 
             DO UPDATE SET username = EXCLUDED.username, updated_at = CURRENT_TIMESTAMP
             RETURNING *`,
            [username, telegram_id]
        );
        
        res.json(result.rows[0]);
    } catch (error) {
        console.error('Error creating user:', error);
        res.status(500).json({ error: 'Failed to create user' });
    }
});

apiRouter.get('/users/:telegram_id', async (req, res) => {
    try {
        const result = await db.query(
            'SELECT * FROM users WHERE telegram_id = $1',
            [req.params.telegram_id]
        );
        
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }
        
        res.json(result.rows[0]);
    } catch (error) {
        console.error('Error fetching user:', error);
        res.status(500).json({ error: 'Failed to fetch user' });
    }
});

apiRouter.put('/users/:telegram_id/requisites', async (req, res) => {
    const { telegram_id } = req.params;
    const updates = req.body;
    
    const setClauses = [];
    const values = [];
    let paramIndex = 1;
    
    Object.entries(updates).forEach(([key, value]) => {
        setClauses.push(`${key} = $${paramIndex}`);
        values.push(value);
        paramIndex++;
    });
    
    values.push(telegram_id);
    
    try {
        const result = await db.query(
            `UPDATE users 
             SET ${setClauses.join(', ')}, updated_at = CURRENT_TIMESTAMP 
             WHERE telegram_id = $${paramIndex} 
             RETURNING *`,
            values
        );
        
        res.json(result.rows[0]);
    } catch (error) {
        console.error('Error updating requisites:', error);
        res.status(500).json({ error: 'Failed to update requisites' });
    }
});

// Orders endpoints
apiRouter.post('/orders', async (req, res) => {
    const {
        seller_telegram_id,
        type,
        payment_method,
        amount,
        currency,
        description,
        seller_requisites
    } = req.body;
    
    try {
        const sellerResult = await db.query(
            'SELECT id FROM users WHERE telegram_id = $1',
            [seller_telegram_id]
        );
        
        if (sellerResult.rows.length === 0) {
            return res.status(404).json({ error: 'Seller not found' });
        }
        
        const seller_id = sellerResult.rows[0].id;
        let code;
        let codeExists = true;
        
        while (codeExists) {
            code = generateOrderCode();
            const checkResult = await db.query(
                'SELECT id FROM orders WHERE code = $1',
                [code]
            );
            codeExists = checkResult.rows.length > 0;
        }
        
        const result = await db.query(
            `INSERT INTO orders (
                code, seller_id, type, payment_method, 
                amount, currency, description, seller_requisites, status
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'active')
            RETURNING *`,
            [code, seller_id, type, payment_method, amount, currency, description, seller_requisites]
        );
        
        res.status(201).json(result.rows[0]);
    } catch (error) {
        console.error('Error creating order:', error);
        res.status(500).json({ error: 'Failed to create order' });
    }
});

apiRouter.get('/orders/:code', async (req, res) => {
    try {
        const result = await db.query(
            `SELECT o.*, 
                    s.telegram_id as seller_telegram_id, 
                    s.username as seller_username,
                    b.telegram_id as buyer_telegram_id,
                    b.username as buyer_username
             FROM orders o
             LEFT JOIN users s ON o.seller_id = s.id
             LEFT JOIN users b ON o.buyer_id = b.id
             WHERE o.code = $1`,
            [req.params.code]
        );
        
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Order not found' });
        }
        
        res.json(result.rows[0]);
    } catch (error) {
        console.error('Error fetching order:', error);
        res.status(500).json({ error: 'Failed to fetch order' });
    }
});

apiRouter.get('/users/:telegram_id/orders', async (req, res) => {
    try {
        const userResult = await db.query(
            'SELECT id FROM users WHERE telegram_id = $1',
            [req.params.telegram_id]
        );
        
        if (userResult.rows.length === 0) {
            return res.json([]);
        }
        
        const user_id = userResult.rows[0].id;
        
        const result = await db.query(
            `SELECT o.*, 
                    s.telegram_id as seller_telegram_id, 
                    s.username as seller_username,
                    b.telegram_id as buyer_telegram_id,
                    b.username as buyer_username
             FROM orders o
             LEFT JOIN users s ON o.seller_id = s.id
             LEFT JOIN users b ON o.buyer_id = b.id
             WHERE o.seller_id = $1 OR o.buyer_id = $1
             ORDER BY o.created_at DESC`,
            [user_id]
        );
        
        res.json(result.rows);
    } catch (error) {
        console.error('Error fetching user orders:', error);
        res.status(500).json({ error: 'Failed to fetch orders' });
    }
});

apiRouter.post('/orders/:id/join', async (req, res) => {
    const { id } = req.params;
    const { buyer_telegram_id } = req.body;
    
    try {
        const buyerResult = await db.query(
            'SELECT id FROM users WHERE telegram_id = $1',
            [buyer_telegram_id]
        );
        
        if (buyerResult.rows.length === 0) {
            return res.status(404).json({ error: 'Buyer not found' });
        }
        
        const buyer_id = buyerResult.rows[0].id;
        
        const orderResult = await db.query(
            'SELECT * FROM orders WHERE id = $1 AND status = $2',
            [id, 'active']
        );
        
        if (orderResult.rows.length === 0) {
            return res.status(404).json({ error: 'Order not available' });
        }
        
        const order = orderResult.rows[0];
        
        if (order.seller_id === buyer_id) {
            return res.status(400).json({ error: 'Cannot buy your own order' });
        }
        
        const result = await db.query(
            `UPDATE orders 
             SET buyer_id = $1, updated_at = CURRENT_TIMESTAMP 
             WHERE id = $2 
             RETURNING *`,
            [buyer_id, id]
        );
        
        await db.query(
            `INSERT INTO notifications (user_id, order_id, type, message)
             VALUES ($1, $2, $3, $4)`,
            [
                order.seller_id,
                id,
                'buyer_joined',
                `Buyer joined order #${order.code}`
            ]
        );
        
        res.json(result.rows[0]);
    } catch (error) {
        console.error('Error joining order:', error);
        res.status(500).json({ error: 'Failed to join order' });
    }
});

apiRouter.put('/orders/:id/status', async (req, res) => {
    const { id } = req.params;
    const { status, user_telegram_id } = req.body;
    
    try {
        const userResult = await db.query(
            'SELECT id FROM users WHERE telegram_id = $1',
            [user_telegram_id]
        );
        
        if (userResult.rows.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }
        
        const user_id = userResult.rows[0].id;
        
        const orderResult = await db.query(
            'SELECT * FROM orders WHERE id = $1',
            [id]
        );
        
        if (orderResult.rows.length === 0) {
            return res.status(404).json({ error: 'Order not found' });
        }
        
        const order = orderResult.rows[0];
        
        const result = await db.query(
            `UPDATE orders 
             SET status = $1, updated_at = CURRENT_TIMESTAMP 
             WHERE id = $2 
             RETURNING *`,
            [status, id]
        );
        
        if (status === 'paid') {
            await db.query(
                `INSERT INTO notifications (user_id, order_id, type, message)
                 VALUES ($1, $2, $3, $4)`,
                [
                    order.seller_id,
                    id,
                    'payment_confirmed',
                    `Payment confirmed for order #${order.code}`
                ]
            );
        } else if (status === 'completed') {
            await db.query(
                `INSERT INTO notifications (user_id, order_id, type, message)
                 VALUES ($1, $2, $3, $4)`,
                [
                    order.seller_id,
                    id,
                    'order_completed',
                    `Order #${order.code} completed successfully`
                ]
            );
            
            await db.query(
                `INSERT INTO notifications (user_id, order_id, type, message)
                 VALUES ($1, $2, $3, $4)`,
                [
                    order.buyer_id,
                    id,
                    'order_completed',
                    `Order #${order.code} completed successfully`
                ]
            );
            
            await db.query(
                `UPDATE users 
                 SET completed_deals = completed_deals + 1,
                     volumes = jsonb_set(
                         COALESCE(volumes, '{}'::jsonb),
                         ARRAY[$2],
                         COALESCE((volumes->>$2)::numeric, 0) + $3,
                         true
                     ),
                     updated_at = CURRENT_TIMESTAMP
                 WHERE id = $1`,
                [order.seller_id, order.currency, order.amount]
            );
        }
        
        res.json(result.rows[0]);
    } catch (error) {
        console.error('Error updating order status:', error);
        res.status(500).json({ error: 'Failed to update order status' });
    }
});

// Notifications endpoints
apiRouter.get('/users/:telegram_id/notifications', async (req, res) => {
    try {
        const userResult = await db.query(
            'SELECT id FROM users WHERE telegram_id = $1',
            [req.params.telegram_id]
        );
        
        if (userResult.rows.length === 0) {
            return res.json([]);
        }
        
        const user_id = userResult.rows[0].id;
        
        const result = await db.query(
            `SELECT * FROM notifications 
             WHERE user_id = $1 
             ORDER BY created_at DESC 
             LIMIT 50`,
            [user_id]
        );
        
        res.json(result.rows);
    } catch (error) {
        console.error('Error fetching notifications:', error);
        res.status(500).json({ error: 'Failed to fetch notifications' });
    }
});

apiRouter.put('/notifications/:id/read', async (req, res) => {
    try {
        const result = await db.query(
            'UPDATE notifications SET read = true WHERE id = $1 RETURNING *',
            [req.params.id]
        );
        
        res.json(result.rows[0]);
    } catch (error) {
        console.error('Error marking notification as read:', error);
        res.status(500).json({ error: 'Failed to mark notification as read' });
    }
});

// Mount API routes
app.use('/api', apiRouter);

// Error handling middleware
app.use((err, req, res, next) => {
    console.error('Unhandled error:', err);
    res.status(500).json({ error: 'Internal server error' });
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`📝 Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`🌍 Frontend URL: ${process.env.FRONTEND_URL || 'Not set'}`);
});
