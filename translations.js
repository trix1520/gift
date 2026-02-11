// translations.js
const translations = {
    ru: {
        // Заголовки и текст
        welcomeTitle: "GiftMarket",
        welcomeSubtitle: "Надёжный P2P гарант для ваших сделок",
        tonPrice: "TON:",
        
        // Навигация
        navHome: "Главная",
        navRequisites: "Реквизиты",
        navOrders: "Ордера",
        navProfile: "Профиль",
        navSupport: "Поддержка",
        
        // Особенности
        featureSecurityTitle: "Гарантия безопасности",
        featureSecurityDesc: "Более года на рынке P2P гарантов",
        featureSpeedTitle: "Быстрые транзакции",
        featureSpeedDesc: "Мгновенная обработка транзакций",
        featureCommissionTitle: "Комиссия",
        featureCommissionDesc: "Всего 1% от суммы сделки",
        
        // Кнопки
        createOrderBtn: "Создать ордер",
        edit: "Изменить",
        save: "Сохранить",
        create: "Создать",
        update: "Обновить",
        add: "Добавить",
        cancel: "Отмена",
        
        // Реквизиты
        requisites: "Реквизиты",
        userName: "Имя пользователя",
        notSet: "Не указано",
        enterUserName: "Укажите имя для отображения в профиле",
        tonWalletTitle: "TON кошелёк",
        bankCardTitle: "Банковская карта",
        telegramTitle: "Telegram",
        notAdded: "Не добавлен",
        notAddedFemale: "Не добавлена",
        enterTonWallet: "Введите адрес TON кошелька",
        
        // Ордера
        myOrders: "Мои ордера",
        noOrdersTitle: "У вас пока нет ордеров",
        noOrdersDesc: "Создайте свой первый ордер",
        createNewOrder: "Создать новый ордер",
        orderCreation: "Создание ордера",
        dealType: "Тип сделки",
        paymentMethod: "Способ оплаты",
        orderDetails: "Детали ордера",
        dealAmount: "Сумма сделки",
        description: "Описание",
        
        // Типы сделок
        nftGift: "Продажа NFT подарка",
        nftUsername: "Продажа NFT username",
        nftNumber: "Продажа NFT number",
        
        // Способы оплаты
        tonWallet: "TON кошелёк",
        bankCard: "Банковская карта",
        telegramStars: "Telegram Stars",
        
        // Профиль
        profile: "Профиль",
        completedDeals: "Завершено сделок",
        totalVolume: "Общий оборот",
        volumeByCurrency: "Оборот по валютам",
        noData: "Нет данных",
        adminPanel: "🔧 Панель администратора",
        dealsCount: "Количество сделок",
        addVolume: "Добавить оборот",
        
        // Поддержка
        support: "Поддержка",
        workingHours: "Часы работы",
        workingHoursText: "Ежедневно<br>с 6:00 до 22:00 UTC+3",
        supportService: "Служба поддержки",
        escrowAccount: "Эскроу аккаунт",
        escrowAccountText: "Аккаунт для передачи активов:",
        
        // Успешные сделки
        successfulDeals: "Успешные сделки",
        
        // Валюты
        RUB: "RUB",
        USD: "USD",
        EUR: "EUR",
        KZT: "KZT",
        UAH: "UAH"
    },
    en: {
        // Titles and text
        welcomeTitle: "GiftMarket",
        welcomeSubtitle: "Reliable P2P Escrow for Your Deals",
        tonPrice: "TON:",
        
        // Navigation
        navHome: "Home",
        navRequisites: "Requisites",
        navOrders: "Orders",
        navProfile: "Profile",
        navSupport: "Support",
        
        // Features
        featureSecurityTitle: "Security Guarantee",
        featureSecurityDesc: "Over a year in P2P escrow market",
        featureSpeedTitle: "Fast Transactions",
        featureSpeedDesc: "Instant transaction processing",
        featureCommissionTitle: "Commission",
        featureCommissionDesc: "Only 1% of deal amount",
        
        // Buttons
        createOrderBtn: "Create Order",
        edit: "Edit",
        save: "Save",
        create: "Create",
        update: "Update",
        add: "Add",
        cancel: "Cancel",
        
        // Requisites
        requisites: "Requisites",
        userName: "Username",
        notSet: "Not set",
        enterUserName: "Enter your name to display in profile",
        tonWalletTitle: "TON Wallet",
        bankCardTitle: "Bank Card",
        telegramTitle: "Telegram",
        notAdded: "Not added",
        notAddedFemale: "Not added",
        enterTonWallet: "Enter TON wallet address",
        
        // Orders
        myOrders: "My Orders",
        noOrdersTitle: "You have no orders yet",
        noOrdersDesc: "Create your first order",
        createNewOrder: "Create New Order",
        orderCreation: "Order Creation",
        dealType: "Deal Type",
        paymentMethod: "Payment Method",
        orderDetails: "Order Details",
        dealAmount: "Deal Amount",
        description: "Description",
        
        // Deal types
        nftGift: "NFT Gift Sale",
        nftUsername: "NFT Username Sale",
        nftNumber: "NFT Number Sale",
        
        // Payment methods
        tonWallet: "TON Wallet",
        bankCard: "Bank Card",
        telegramStars: "Telegram Stars",
        
        // Profile
        profile: "Profile",
        completedDeals: "Completed Deals",
        totalVolume: "Total Volume",
        volumeByCurrency: "Volume by Currency",
        noData: "No data",
        adminPanel: "🔧 Admin Panel",
        dealsCount: "Deals Count",
        addVolume: "Add Volume",
        
        // Support
        support: "Support",
        workingHours: "Working Hours",
        workingHoursText: "Daily<br>from 6:00 to 22:00 UTC+3",
        supportService: "Support Service",
        escrowAccount: "Escrow Account",
        escrowAccountText: "Account for asset transfer:",
        
        // Successful deals
        successfulDeals: "Successful Deals",
        
        // Currencies
        RUB: "RUB",
        USD: "USD",
        EUR: "EUR",
        KZT: "KZT",
        UAH: "UAH"
    }
};

let currentLanguage = 'ru';

function switchLanguage(lang) {
    currentLanguage = lang;
    localStorage.setItem('language', lang);
    updateTranslations(lang);
    
    document.querySelectorAll('.lang-btn').forEach(btn => {
        btn.classList.remove('active');
        if (btn.getAttribute('data-lang') === lang) {
            btn.classList.add('active');
        }
    });
    
    document.documentElement.lang = lang;
}

function updateTranslations(lang) {
    const langData = translations[lang] || translations.ru;
    
    document.querySelectorAll('[data-i18n]').forEach(element => {
        const key = element.getAttribute('data-i18n');
        if (langData[key]) {
            if (element.tagName === 'INPUT' || element.tagName === 'TEXTAREA') {
                element.placeholder = langData[key];
            } else if (element.tagName === 'OPTION') {
                element.textContent = langData[key];
            } else {
                element.innerHTML = langData[key];
            }
        }
    });
}

document.addEventListener('DOMContentLoaded', function() {
    const savedLang = localStorage.getItem('language') || 'ru';
    switchLanguage(savedLang);
});

window.switchLanguage = switchLanguage;
