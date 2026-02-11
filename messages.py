RU_TEXTS = {

    "start_message": (

        "👋 <b>Добро пожаловать</b>!\n\n"

        "👜 <b>Playerok</b> - надёжный сервис для безопасных сделок!\n\n"

        "✨ Автоматизировано, быстро и без лишних хлопот!\n\n"

        "💌 <b>Теперь ваши сделки под защитой!</b> 🛡️"
    ),

    "wallet_menu_message": (

        "Выберите способ оплаты:"

    ),

    "add_ton_wallet_message": (

        "💼 Ваш текущий TON-кошелек: {current_wallet}\n\n"

        "Пожалуйста, отправьте новый адрес вашего кошелька."

    ),

    "add_usdt_wallet_message": (

        "💵 Ваш текущий USDT-кошелек: {current_wallet}\n\n"

        "Пожалуйста, отправьте новый адрес вашего USDT-кошелька."

    ),

    "add_card_message": (

        "💳 Ваши текущие реквизиты: {current_card}\n\n"

        "Пожалуйста, отправьте реквизиты в формате: `Банк - Номер карты`."

    ),

    "no_requisites_message": (

        "❌ Сначала добавьте необходимые реквизиты перед созданием сделки."

    ),

    "choose_payment_method_message": (

        "💰 Выберите метод получения оплаты:"

    ),

    "create_deal_message": (

        "💼 Создание сделки\n\n"

        "Введите сумму в формате: `100`"

    ),

    "create_deal_ton_message": (

        "💼 Создание сделки в TON\n\n"

        "<b>💎 Получатель TON</b>\n"

        "Укажите @username получателя\n\n"

        '<blockquote>💎 <b>Минимум</b>: 2 TON</blockquote>\n\n'

        "Введите @username получателя:"

    ),

    "create_deal_usdt_message": (

        "💼 Создание сделки в USDT\n\n"

        "<b>💵 Получатель USDT</b>\n"

        "Укажите @username получателя\n\n"

        "<blockquote>💵 <b>Минимум</b>: 1 USDT</blockquote>\n\n"

        "Введите @username получателя:"

    ),

    "create_deal_sbp_message": (

        "💼 Создание сделки в RUB\n\n"

        "<b>₽ Получатель RUB</b>\n"

        "Укажите @username получателя\n\n"

        "<blockquote>₽ <b>Минимум</b>: 50 RUB</blockquote>\n\n"

        "Введите @username получателя:"

    ),

    "create_deal_stars_message": (

        "💼 Создание сделки в звездах\n\n"

        "<b>⭐️ Получатель звезд</b>\n"

        "Укажите @username получателя\n\n"

        "<blockquote>⭐️ <b>Минимум</b>: 100 звёзд</blockquote>\n\n"

        "Введите @username получателя:"

    ),

    "change_lang_message": (

        "Сменить язык:"

    ),

    "awaiting_description_message": (

        "📝 Укажите, что вы предлагаете в этой сделке:\n\n"

        "<code>Пример: 10 Кепок и Пепочка</code>"

    ),

    "wallet_updated": (

        "🔗 {wallet_type} обновлен: {details}"

    ),

    "deal_created_message": (

        "<b><blockquote>✅ <b>Сделка успешно создана!</b></blockquote></b>\n\n"

        "<blockquote>🆔 <b>Номер ордера</b>: #{order_id}</blockquote>\n\n"

        "<blockquote>💰 <b>Цена</b>: {amount} {valute}</blockquote>\n\n"

        "<blockquote>🛍 <b><i>Вы продаёте</i></b>: {description}</blockquote>\n\n"

        "<b>🔗 Ссылка для покупателя: </b>{deal_link}\n\n"

    ), 

    "deal_info_ton_message": (

        "💳 Информация об ордере #{deal_id}\n\n"

        "👤 Вы покупатель в сделке.\n"

        "📌 Продавец: @{seller_username}\n"

        "• Успешные сделки: {successful_deals}\n\n"

        "• Вы покупаете: {description}\n\n"

        "🏦 Адрес для оплаты (TON): {wallet}\n\n"

        "💰 Сумма к оплате: {amount} TON\n"

        "📝 Комментарий к платежу (мемо): #{deal_id}\n\n"

        "⚠️ Убедитесь в правильности данных перед оплатой. Комментарий (мемо) обязателен!\n\n"

        "После оплаты ожидайте подтверждения администратором."

    ),

    "deal_info_usdt_message": (

        "💳 Информация об ордере #{deal_id}\n\n"

        "👤 Вы покупатель в сделке.\n"

        "📌 Продавец: @{seller_username}\n"

        "• Успешные сделки: {successful_deals}\n\n"

        "• Вы покупаете: {description}\n\n"

        "🏦 Адрес для оплаты (USDT): {wallet}\n\n"

        "💰 Сумма к оплате: {amount} USDT\n"

        "📝 Комментарий к платежу (мемо): #{deal_id}\n\n"

        "⚠️ Убедитесь в правильности данных перед оплатой. Комментарий (мемо) обязателен!\n\n"

        "После оплаты ожидайте подтверждения администратором."

    ),

    "deal_info_sbp_message": (

        "💳 Информация об ордере #{deal_id}\n\n"

        "👤 Вы покупатель в сделке.\n"

        "📌 Продавец: @{seller_username}\n"

        "• Успешные сделки: {successful_deals}\n\n"

        "• Вы покупаете: {description}\n\n"

        "💳 Карта для оплаты (РФ): {card}\n\n"

        "💰 Сумма к оплате: {amount} RUB\n"

        "📝 Комментарий к платежу: #{deal_id}\n\n"

        "⚠️ Убедитесь в правильности данных перед оплатой. Комментарий обязателен!\n\n"

        "После оплаты ожидайте подтверждения администратором."

    ),

    "deal_info_stars_message": (

        "💳 Информация об ордере #{deal_id}\n\n"

        "👤 Вы покупатель в сделке.\n"

        "📌 Продавец: @{seller_username}\n"

        "• Успешные сделки: {successful_deals}\n\n"

        "• Вы покупаете: {description}\n\n"

        "🌟 Оплата через Telegram Stars:\n"

        "Нажмите кнопку ниже для оплаты\n\n"

        "💰 Сумма к оплате: {amount} Звёзд\n\n"

        "⚠️ Убедитесь в правильности данных перед оплатой.\n\n"

        "После оплаты ожидайте подтверждения администратором."

    ),

    "deal_info_ton_formatted": (

        "<blockquote>Продавец @{seller_username}</blockquote>\n\n"

        "<blockquote>📈 Успешные ордера: {successful_deals}</blockquote>\n\n"

        "<blockquote>Вы покупаете:</blockquote>\n\n"

        "<blockquote>{description}</blockquote>\n\n"

        "<blockquote>💎 Цена: {amount} TON</blockquote>\n\n"

        "<blockquote>💫 Оплата происходит через TON сеть</blockquote>"

    ),

    "deal_info_usdt_formatted": (

        "<blockquote>Продавец @{seller_username}</blockquote>\n\n"

        "<blockquote>📈 Успешные ордера: {successful_deals}</blockquote>\n\n"

        "<blockquote>Вы покупаете:</blockquote>\n\n"

        "<blockquote>{description}</blockquote>\n\n"

        "<blockquote>💵 Цена: {amount} USDT</blockquote>\n\n"

        "<blockquote>💫 Оплата происходит через USDT сеть</blockquote>"

    ),

    "deal_info_sbp_formatted": (

        "<blockquote>Продавец @{seller_username}</blockquote>\n\n"

        "<blockquote>📈 Успешные ордера: {successful_deals}</blockquote>\n\n"

        "<blockquote>Вы покупаете:</blockquote>\n\n"

        "<blockquote>{description}</blockquote>\n\n"

        "<blockquote>₽ Цена: {amount} RUB</blockquote>\n\n"

        "<blockquote>💫 Оплата происходит через СБП/карту</blockquote>"

    ),

    "deal_info_stars_formatted": (

        "<b>Ордер #{order_id}</b>\n\n"

        "<b><blockquote>Продавец @{seller_username}</blockquote></b>\n\n"

        "<blockquote>📈 Успешные ордера: {successful_deals}</blockquote>\n\n"

        "<blockquote>Вы покупаете:</blockquote>\n\n"

        "<blockquote>{description}</blockquote>\n\n"

        "<blockquote>⭐ Цена: {amount} звёзд</blockquote>\n\n"

        "<blockquote>💫 Оплата происходит из баланса звёзд Telegram</blockquote>"

    ), 

    "stars_payment_success_formatted": (

        "<blockquote>⭐ {amount} звёзд было успешно списано с вашего баланса</blockquote>\n\n"

        "<blockquote>Ордер #{order_id} оплачен</blockquote>\n\n"

        "<b>Оплата по ордеру #{order_id} учтена.</b>"

    ),

    "payment_success_formatted": (

        "<blockquote>{icon} {amount} {currency} было успешно списано с вашего баланса</blockquote>\n\n"

        "<blockquote>Ордер #{order_id} оплачен</blockquote>\n\n"

        "<b>Оплата по ордеру #{order_id} учтена.</b>"

    ),

    "payment_confirmed_message": (

        "<blockquote>✅ Оплата подтверждена для ордера #{deal_id}</blockquote>\n\n"

        "<blockquote>Пожалуйста, подтвердите получение подарка после того, как продавец его отправит</blockquote>"

    ),

    "payment_confirmed_seller_message": (

        "<blockquote>✅ Оплата подтверждена для ордера #{deal_id}</blockquote>\n\n"

        "<blockquote>📜 Описание: {description}</blockquote>\n\n"

        "<blockquote>👤 Отправьте подарок в поддержку</blockquote> — <b>@GarantpIayerok</b>\n\n"

        "<blockquote>⚠️ Отправляйте подарок только указанному пользователю</blockquote>\n\n" 

        "<blockquote>⚠️ Скидывайте скриншот передачи подарка покупателю</blockquote>"

    ),

    "seller_confirm_sent_message": (

        "<blockquote>✅ Вы подтвердили отправку подарка для ордера #{deal_id}</blockquote>\n\n"

        "<b>Ожидайте подтверждения получения от покупателя</b>"

    ),

    "buyer_confirm_received_message": (

        "<blockquote>✅ Ордер #{deal_id} завершен</blockquote>\n\n"

        "<blockquote>Спасибо за использование нашего сервиса</blockquote>"

    ),

    "seller_notification_message": (

        "<blockquote>👤 Пользователь</blockquote> @{buyer_username} <blockquote>присоединился к ордеру</blockquote> <i>#{deal_id}</i>\n\n"

        "<blockquote>• Успешные сделки: {successful_deals}</blockquote>\n\n"

        "<blockquote>⚠️ Проверьте, что это тот же пользователь, с которым вы вели диалог ранее!</blockquote>"

    ),

    "insufficient_balance_message": "❌ Недостаточно средств на балансе!",

    "admin_panel_message": "🔧 Админ-панель:",

    "admin_broadcast_message": (

        "📢 Введите текст для рассылки всем пользователям:"

    ),

    "broadcast_success_message": (

        "📢 Рассылка завершена.\n"

        "✅ Успешно отправлено: {success_count}\n"

        "❌ Ошибок: {fail_count}"

    ),

    "admin_view_deals_message": "💳 Выберите ордер:\n{deals_list}",

    "admin_view_deal_message": (

        "<b>ℹ️ Информация об ордере #{deal_id}</b>\n\n"

        "👤 <b>Продавец:</b> @{seller_username} (ID: <code>{seller_id}</code>)\n"

        "✅ Успешных сделок: {seller_successful_deals}\n\n"

        "👤 <b>Покупатель:</b> @{buyer_username} (ID: <code>{buyer_id}</code>)\n"

        "✅ Успешных сделок: {buyer_successful_deals}\n\n"

        "➖➖➖➖➖➖➖➖➖➖\n\n"

        "📝 <b>Описание:</b>\n{description}\n\n"

        "💰 <b>Сумма:</b> {amount} {valute}\n"

        "💳 <b>Реквизиты для оплаты:</b>\n<code>{payment_details}</code>\n\n"

        "📊 <b>Статус:</b> {status}"

    ),

    "admin_confirm_deal_message": (

        "✅ Оплата для ордера #{deal_id} подтверждена администратором.\n"

        "Продавец и покупатель уведомлены."

    ),

    "admin_cancel_deal_message": (

        "❌ Ордер #{deal_id} был отменен администратором."

    ),

    "deal_cancelled_notification": (

        "❌ Ордер #{deal_id} был отменен администратором."

    ),

    "deal_completed_message": (
        "<b>✅ Ордер #{deal_id} успешно завершен!</b>\n\n"
        "<blockquote>💰 Сумма сделки: {amount} {valute}</blockquote>\n"
        "<blockquote>🛍 Описание: {description}</blockquote>\n\n"
        "<b>Спасибо за использование нашего сервиса! Ваш рейтинг успешных сделок увеличен.</b>"
    ),

    "deal_completed_buyer_message": (
        "<b>✅ Ордер #{deal_id} успешно завершен!</b>\n\n"
        "<blockquote>💰 Сумма сделки: {amount} {valute}</blockquote>\n"
        "<blockquote>🛍 Вы приобрели: {description}</blockquote>\n\n"
        "<b>Спасибо за покупку! Надеемся на дальнейшее сотрудничество.</b>"
    ),

    "admin_change_balance_message": "Введите ID пользователя и новый баланс в формате: user_id баланс",

    "admin_change_successful_deals_message": "Введите ID пользователя и количество успешных сделок в формате: user_id количество",

    "admin_change_valute_message": "Введите новую валюту (например, USD, EUR, RUB):",

    "admin_manage_admins_message": "Введите ID пользователя и действие (add/remove) в формате: user_id действие",

    "admin_added_message": "✅ Пользователь {user_id} добавлен в администраторы.",

    "admin_removed_message": "❌ Пользователь {user_id} удален из администраторов.",

    "admin_cannot_remove_self_message": "🚫 Вы не можете удалить себя из администраторов!",

    "admin_cannot_remove_super_admin_message": "🚫 Нельзя удалить суперадминистратора.",

    "invalid_action_message": "❌ Неверное действие. Используйте 'add' или 'remove'.",

    "admin_list_message": (

        "👑 Список администраторов:\n\n"

        "{admin_list}"

    ),

    "unknown_callback_error": "❌ Неизвестное действие. Пожалуйста, выберите опцию из меню.",

    "lang_set_message": "✅ Язык изменен на Русский.",

    "referral_message": (

        "🧷 Ваша реферальная ссылка: {referral_link}\n\n"

        "Приглашайте друзей и получайте бонусы за их сделки!"

    ),

    "menu_button": "🔙 Вернуться в меню",

    "pay_from_balance_button": "💸 Оплатить с баланса",

    "add_wallet_button": "🪙 Добавить/изменить кошелёк",

    "add_ton_wallet_button": "💼 Добавить/изменить TON-кошелек",

    "add_usdt_wallet_button": "💵 Добавить/изменить USDT-кошелек",

    "add_card_button": "💳 Добавить/изменить карту",

    "create_deal_button": "📄 Создать сделку",

    "referral_button": "🧷 Реферальная ссылка",

    "change_lang_button": "🌐 Change language",

    "support_button": "📞 Поддержка",

    "english_lang_button": "🇬🇧 English",

    "russian_lang_button": "🇷🇺 Русский",

    "admin_view_deals_button": "💳 Просмотр ордеров",

    "admin_change_balance_button": "💰 Изменить баланс пользователя",

    "admin_change_successful_deals_button": "✅ Изменить успешные сделки",

    "admin_change_valute_button": "💱 Изменить валюту",

    "admin_manage_admins_button": "👑 Назначить/удалить администратора",

    "admin_list_button": "👑 Список администраторов",

    "admin_confirm_deal_button": "✅ Подтвердить",

    "admin_cancel_deal_button": "❌ Отменить",

    "seller_confirm_sent_button": "📤 Я отправил подарок",

    "buyer_confirm_received_button": "📥 Я получил подарок",

    "contact_support_button": "📞 Связаться с поддержкой",

    "payment_ton_button": "На TON-кошелек",

    "payment_usdt_button": "USDT",

    "payment_sbp_button": "Карта(РФ)",

    "payment_stars_button": "Звезды",

    "not_specified_wallet": "не указан",

    "not_specified_card": "не указаны",

    "ton_limit_message": "💎 Минимум: 2 TON",

    "usdt_limit_message": "💵 Минимум: 1 USDT",

    "sbp_limit_message": "₽ Минимум: 50 RUB",

    "stars_limit_message": "⭐️ Минимум: 100 звёзд",

    "stars_payment_description": "Оплата {amount} звёзд за ордер #{deal_id}",

    "stars_success_payment": "✅ Оплата {amount} ⭐ успешно получена! Продавец уведомлен.",

    "stars_blockquote_checkout_error": "❌ Ордер недействителен или устарел",

    "pay_support_text": (

        "ℹ️ **Поддержка по оплате**\n\n"

        "По вопросам возврата средств за приобретенные цифровые товары "

        "обращайтесь в поддержку: @GarantpIayerok\n\n"

        "Возврат средств возможен в течение 14 дней после оплата при условии, что товар не был получен."

    )

}



EN_TEXTS = {

    "start_message": (

        "<b>Welcome to ELF OTC – a reliable P2P guarantor</b>\n\n"

        "<b>💼 Buy and sell anything – safely!</b>\n"

        "From Telegram gifts and NFTs to tokens and fiat – transactions are easy and risk-free.\n\n"

        "🔹 Convenient wallet management\n"

        "🔹 Referral system\n\n"

        "<b>📖 How to use?</b>\n"

        "Read the guide — https://t.me/otcgifttg/71034/71035\n\n"

        "Choose the desired section below:"

    ),

    "wallet_menu_message": (

        "Select payment method:"

    ),

    "add_ton_wallet_message": (

        "💼 Your current TON wallet: {current_wallet}\n\n"

        "Please send the new wallet address."

    ),

    "add_usdt_wallet_message": (

        "💵 Your current USDT wallet: {current_wallet}\n\n"

        "Please send the new USDT wallet address."

    ),

    "add_card_message": (

        "💳 Your current card details: {current_card}\n\n"

        "Please send the card details in the format: `Bank - Card Number`."

    ),

    "no_requisites_message": (

        "❌ Please add payment details before creating a deal."

    ),

    "choose_payment_method_message": (

        "💰 Select payment method:"

    ),

    "create_deal_message": (

        "💼 Create a deal\n\n"

        "Enter the amount in the format: `100`"

    ),

    "create_deal_ton_message": (

        "💼 Create a deal in TON\n\n"

        "<b>💎 TON Recipient</b>\n"

        "Specify @username of recipient\n\n"

        "<b>💎 Minimum: 2 TON</b>\n\n"

        "Enter @username of recipient:"

    ),

    "create_deal_usdt_message": (

        "💼 Create a deal in USDT\n\n"

        "<b>💵 USDT Recipient</b>\n"

        "Specify @username of recipient\n\n"

        "<b>💵 Minimum: 1 USDT</b>\n\n"

        "Enter @username of recipient:"

    ),

    "create_deal_sbp_message": (

        "💼 Create a deal in RUB\n\n"

        "<b>₽ RUB Recipient</b>\n"

        "Specify @username of recipient\n\n"

        "<b>₽ Minimum: 50 RUB</b>\n\n"

        "Enter @username of recipient:"

    ),

    "create_deal_stars_message": (

        "💼 Create a deal in Stars\n\n"

        "<b>⭐️ Stars Recipient</b>\n"

        "Specify @username of recipient\n\n"

        "<b>⭐️ Minimum: 100 Stars</b>\n\n"

        "Enter @username of recipient:"

    ),

    "change_lang_message": (

        "Change Language:"

    ),

    "awaiting_description_message": (

        "📝 Specify what you are offering in this deal:\n\n"

        "<code>Example: 10 Caps and Pepe...</code>"

    ),

    "wallet_updated": (

        "🔗 {wallet_type} updated: {details}"

    ),

    "deal_created_message": (

        "✅ Deal successfully created!\n\n"

        "🆔 Order number: <code>#{order_id}</code>\n"

        "💰 Amount: {amount} {valute}\n"

        "📜 Description: {description}\n"

        "🔗 Buyer link: {deal_link}\n\n"

        "💡 Buyer can pay using command: <code>/pay {order_id}</code>"

    ), 

    "deal_info_ton_message": (

        "💳 Order information #{deal_id}\n\n"

        "👤 You are the buyer in this deal.\n"

        "📌 Seller: @{seller_username}\n"

        "• Successful deals: {successful_deals}\n\n"

        "• You are buying: {description}\n\n"

        "🏦 Payment address (TON): {wallet}\n\n"

        "💰 Amount to pay: {amount} TON\n"

        "📝 Payment comment (memo): #{deal_id}\n\n"

        "⚠️ Ensure the data is correct before payment. The comment (memo) is mandatory!\n\n"

        "After payment, wait for admin confirmation."

    ),

    "deal_info_usdt_message": (

        "💳 Order information #{deal_id}\n\n"

        "👤 You are the buyer in this deal.\n"

        "📌 Seller: @{seller_username}\n"

        "• Successful deals: {successful_deals}\n\n"

        "• You are buying: {description}\n\n"

        "🏦 Payment address (USDT): {wallet}\n\n"

        "💰 Amount to pay: {amount} USDT\n"

        "📝 Payment comment (memo): #{deal_id}\n\n"

        "⚠️ Ensure the data is correct before payment. The comment (memo) is mandatory!\n\n"

        "After payment, wait for admin confirmation."

    ),

    "deal_info_sbp_message": (

        "💳 Order information #{deal_id}\n\n"

        "👤 You are the buyer in this deal.\n"

        "📌 Seller: @{seller_username}\n"

        "• Successful deals: {successful_deals}\n\n"

        "• You are buying: {description}\n\n"

        "💳 Card for payment (Russia): {card}\n\n"

        "💰 Amount to pay: {amount} RUB\n"

        "📝 Payment comment: #{deal_id}\n\n"

        "⚠️ Ensure the data is correct before payment. The comment is mandatory!\n\n"

        "After payment, wait for admin confirmation."

    ),

    "deal_info_stars_message": (

        "💳 Order information #{deal_id}\n\n"

        "👤 You are the buyer in this deal.\n"

        "📌 Seller: @{seller_username}\n"

        "• Successful deals: {successful_deals}\n\n"

        "• You are buying: {description}\n\n"

        "🌟 Payment via Telegram Stars:\n"

        "Click the button below to pay\n\n"

        "💰 Amount to pay: {amount} Stars\n\n"

        "⚠️ Ensure the data is correct before payment.\n\n"

        "After payment, wait for admin confirmation."

    ),

    "deal_info_ton_formatted": (

        "<blockquote>Seller @{seller_username}</blockquote>\n\n"

        "<blockquote>📈 Successful orders: {successful_deals}</blockquote>\n\n"

        "<blockquote>You are buying:</blockquote>\n\n"

        "<blockquote>{description}</blockquote>\n\n"

        "<blockquote>💎 Price: {amount} TON</blockquote>\n\n"

        "<blockquote>💫 Payment is made through TON network</blockquote>"

    ),

    "deal_info_usdt_formatted": (

        "<blockquote>Seller @{seller_username}</blockquote>\n\n"

        "<blockquote>📈 Successful orders: {successful_deals}</blockquote>\n\n"

        "<blockquote>You are buying:</blockquote>\n\n"

        "<blockquote>{description}</blockquote>\n\n"

        "<blockquote>💵 Price: {amount} USDT</blockquote>\n\n"

        "<blockquote>💫 Payment is made through USDT network</blockquote>"

    ),

    "deal_info_sbp_formatted": (

        "<blockquote>Seller @{seller_username}</blockquote>\n\n"

        "<blockquote>📈 Successful orders: {successful_deals}</blockquote>\n\n"

        "<blockquote>You are buying:</blockquote>\n\n"

        "<blockquote>{description}</blockquote>\n\n"

        "<blockquote>₽ Price: {amount} RUB</blockquote>\n\n"

        "<blockquote>💫 Payment is made via SBP/card</blockquote>"

    ),

    "deal_info_stars_formatted": (

        "<b>Order #{order_id}</b>\n\n"

        "<blockquote>Seller @{seller_username}</blockquote>\n\n"

        "<blockquote>📈 Successful orders: {successful_deals}</blockquote>\n\n"

        "<blockquote>You are buying:</blockquote>\n\n"

        "<blockquote>{description}</blockquote>\n\n"

        "<blockquote>⭐ Price: {amount} stars</blockquote>\n\n"

        "<blockquote>💫 Payment is made from Telegram Stars balance</blockquote>"

    ), 

    "stars_payment_success_formatted": (

        "<blockquote>⭐ {amount} stars were successfully deducted from your balance</blockquote>\n\n"

        "<blockquote>Order #{order_id} paid</blockquote>\n\n"

        "<b>Payment for order #{order_id} has been accounted for.</b>"

    ), 

    "payment_success_formatted": (

        "<blockquote>{icon} {amount} {currency} were successfully deducted from your balance</blockquote>\n\n"

        "<blockquote>Order #{order_id} paid</blockquote>\n\n"

        "<b>Payment for order #{order_id} has been accounted for.</b>"

    ),

    "payment_confirmed_message": (

        "✅ Payment confirmed for order #{deal_id}.\n\n"

        "Please confirm receipt of the gift after the seller sends it."

    ),

    "payment_confirmed_seller_message": (

        "✅ Payment confirmed for order #{deal_id}\n\n"

        "📜 Description: {description}\n"

        "👤 Send the gift to the buyer — @GarantpIayerok\n\n"

        "⚠️ Send the gift only to the specified user. Be sure to record the moment of transfer on video."

    ),

    "seller_confirm_sent_message": (

        "✅ You confirmed sending the gift for order #{deal_id}.\n"

        "Waiting for the buyer's confirmation of receipt."

    ),

    "buyer_confirm_received_message": (

        "✅ Order #{deal_id} completed.\n\n"

        "Thank you for using our service."

    ),

    "seller_notification_message": (

        "👤 User @{buyer_username} has joined the order #{deal_id}\n"

        "• Successful deals: {successful_deals}\n\n"

        "⚠️ Make sure this is the same user you were talking to earlier!"

    ),

    "insufficient_balance_message": "❌ Insufficient balance!",

    "admin_panel_message": "🔧 Admin panel:",

    "admin_broadcast_message": (

        "📢 Enter the text for broadcasting to all users:"

    ),

    "broadcast_success_message": (

        "📢 Broadcast completed.\n"

        "✅ Successfully sent: {success_count}\n"

        "❌ Errors: {fail_count}"

    ),

    "admin_view_deals_message": "💳 Select an order:\n{deals_list}",

    "admin_view_deal_message": (

        "<b>ℹ️ Order Information #{deal_id}</b>\n\n"

        "👤 <b>Seller:</b> @{seller_username} (ID: <code>{seller_id}</code>)\n"

        "✅ Successful deals: {seller_successful_deals}\n\n"

        "👤 <b>Buyer:</b> @{buyer_username} (ID: <code>{buyer_id}</code>)\n"

        "✅ Successful deals: {buyer_successful_deals}\n\n"

        "➖➖➖➖➖➖➖➖➖➖\n\n"

        "📝 <b>Description:</b>\n{description}\n\n"

        "💰 <b>Amount:</b> {amount} {valute}\n"

        "💳 <b>Payment Details:</b>\n<code>{payment_details}</code>\n\n"

        "📊 <b>Status:</b> {status}"

    ),

    "admin_confirm_deal_message": (

        "✅ Payment for order #{deal_id} confirmed by admin.\n"

        "Seller and buyer have been notified."

    ),

    "admin_cancel_deal_message": (

        "❌ Order #{deal_id} was cancelled by admin."

    ),

    "deal_cancelled_notification": (

        "❌ Order #{deal_id} was cancelled by admin."

    ),

    "admin_change_balance_message": "Enter user ID and new balance in the format: user_id balance",

    "admin_change_successful_deals_message": "Enter user ID and number of successful deals in the format: user_id count",

    "admin_change_valute_message": "Enter new currency (e.g., USD, EUR, RUB):",

    "admin_manage_admins_message": "Enter user ID and action (add/remove) in the format: user_id action",

    "admin_added_message": "✅ User {user_id} has been added as an admin.",

    "admin_removed_message": "❌ User {user_id} has been removed from admins.",

    "admin_cannot_remove_self_message": "🚫 You cannot remove yourself from admins!",

    "admin_cannot_remove_super_admin_message": "🚫 Cannot remove a super admin.",

    "invalid_action_message": "❌ Invalid action. Use 'add' or 'remove'.",

    "admin_list_message": (

        "👑 List of administrators:\n\n"

        "{admin_list}"

    ),

    "unknown_callback_error": "❌ Unknown action. Please select an option from the menu.",

    "lang_set_message": "✅ Language changed to English.",

    "referral_message": (

        "🧷 Your referral link: {referral_link}\n\n"

        "Invite friends and earn bonuses for their deals!"

    ),

    "deal_completed_message": (
        "<b>✅ Order #{deal_id} successfully completed!</b>\n\n"
        "<blockquote>💰 Deal amount: {amount} {valute}</blockquote>\n"
        "<blockquote>🛍 Description: {description}</blockquote>\n\n"
        "<b>Thank you for using our service! Your successful deals rating has been increased.</b>"
    ),

    "deal_completed_buyer_message": (
        "<b>✅ Order #{deal_id} successfully completed!</b>\n\n"
        "<blockquote>💰 Deal amount: {amount} {valute}</blockquote>\n"
        "<blockquote>🛍 You purchased: {description}</blockquote>\n\n"
        "<b>Thank you for your purchase! We hope for further cooperation.</b>"
    ),

    "stars_pre_checkout_error": "❌ Order is invalid or expired",

    "menu_button": "🔙 Back to menu",

    "pay_from_balance_button": "💸 Pay from balance",

    "add_wallet_button": "🪙 Add/change wallet",

    "add_ton_wallet_button": "💼 Add/change TON wallet",

    "add_usdt_wallet_button": "💵 Add/change USDT wallet",

    "add_card_button": "💳 Add/change card",

    "create_deal_button": "📄 Create deal",

    "referral_button": "🧷 Referral link",

    "change_lang_button": "🌐 Change language",

    "support_button": "📞 Support",

    "english_lang_button": "🇬🇧 English",

    "russian_lang_button": "🇷🇺 Русский",

    "admin_view_deals_button": "💳 View orders",

    "admin_change_balance_button": "💰 Change user balance",

    "admin_change_successful_deals_button": "✅ Change successful deals",

    "admin_change_valute_button": "💱 Change currency",

    "admin_manage_admins_button": "👑 Appoint/remove admin",

    "admin_list_button": "👑 List of administrators",

    "admin_confirm_deal_button": "✅ Confirm",

    "admin_cancel_deal_button": "❌ Cancel",

    "seller_confirm_sent_button": "📤 I sent the gift",

    "buyer_confirm_received_button": "📥 I received the gift",

    "contact_support_button": "📞 Contact support",

    "payment_ton_button": "To TON wallet",

    "payment_usdt_button": "USDT",

    "payment_sbp_button": "Via RU CARD",

    "payment_stars_button": "Stars",

    "not_specified_wallet": "not specified",

    "not_specified_card": "not specified",

    "ton_limit_message": "💎 Minimum: 2 TON",

    "usdt_limit_message": "💵 Minimum: 1 USDT",

    "sbp_limit_message": "₽ Minimum: 50 RUB",

    "stars_limit_message": "⭐️ Minimum: 100 Stars",

    "stars_payment_description": "Payment of {amount} stars for order #{deal_id}",

    "stars_success_payment": "✅ Payment of {amount} ⭐ successfully received! Seller notified.",

    "stars_blockquote_checkout_error": "❌ Order is invalid or expired",

    "pay_support_text": (

        "ℹ️ **Payment Support**\n\n"

        "For refund requests for purchased digital goods, "

        "please contact support: @GarantpIayerok\n\n"

        "Refunds are possible within 14 days of payment provided the item has not been received."

    )

}



def get_text(lang, key, **kwargs):

    texts_to_use = RU_TEXTS if lang == 'ru' else EN_TEXTS

    message_template = texts_to_use.get(key, '')



    if not message_template and lang == 'ru':

        message_template = EN_TEXTS.get(key, '')

    elif not message_template and lang == 'en':

        message_template = RU_TEXTS.get(key, '')

        

    if not message_template:

        print(f"Warning: Text key '{key}' not found for language '{lang}' or fallback.")

        return f"Error: Text for '{key}' not found."



    try:

        return message_template.format(**kwargs)

    except KeyError as e:

        print(f"Warning: Missing placeholder {e} for key '{key}' in lang '{lang}'. Provided kwargs: {kwargs}")

        return f"Error: Text for '{key}' has missing data."

    except Exception as e:

        print(f"Error formatting text for key '{key}', lang '{lang}': {e}")

        return "Error: Could not format message."

