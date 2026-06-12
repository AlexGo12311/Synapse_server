import { state } from './state.js';

const I18N = {
    en: {
        login: "Login", register: "Register", send: "Send", settings: "🎨 Settings",
        language: "🌐 Language", appearance: "🌓 Appearance", color_theme: "🎨 Color Theme",
        light_mode: "Light", dark_mode: "Dark", chat_with: "Chat with",
        select_user: "Select a user", message_placeholder: "Write a message...",
        keys_loaded: "🔑 Keys loaded", keys_generated: "🔑 Keys generated",
        fill_fields: "Fill all fields", server_error: "Server connection error",
        failed_load_users: "❌ Failed to load users list", error_history: "❌ Error loading history",
        you: "You", encrypted: "🔒 Encrypted message", encryption_code: "Encryption Code",
        encryption_info: "Compare this code with your contact to verify encryption security:",
        shared_code: "Shared Code", your_key: "Your Key", peer_key: "Peer's Key",
        copy_code: "📋 Copy Code", copied: "✓ Copied!",
        encryption_warning: "If this code changes, it may mean your contact reinstalled the app or someone is trying to intercept your conversation.",
        key_exchange: "🔐 Encryption established", need_peer_key: "Waiting for peer's key...",
        search_chats: "Search chats...", search_messages: "Search in conversation...",
        no_results: "No chats found", chats_tab: "Chats", keys_tab: "Keys", settings_tab: "Settings",
        your_key_title: "Your Encryption Key",
        your_key_description: "Share this code with contacts so they can verify your identity.",
        copy_key: "📋 Copy My Code",
        keys_warning: "If your code changes unexpectedly, it may indicate a security issue.",
        logout: "Log Out", connected: "Connected", connecting: "Connecting...",
        reconnecting: "Reconnecting", disconnected: "Connection lost",
        new_chat: "New Conversation", search_users: "Search users...", no_users: "No users found",
        no_chats_title: "No conversations yet", no_chats_subtitle: "Tap + to start a new chat",
        continue_chat: "Continue chat", start_chat: "Start new chat",
        welcome_subtitle: "Secure end-to-end encrypted messenger",
        welcome_theme: "Customize Appearance", welcome_theme_desc: "Themes, colors, dark mode",
        welcome_lang: "Language", welcome_lang_desc: "English, Русский",
        welcome_keys: "Your Encryption Key", welcome_keys_desc: "Verify your identity",
        welcome_hint: "Select a conversation or tap + to start a new one",
        typing: "typing", reply_to: "Reply to"
    },
    ru: {
        login: "Войти", register: "Регистрация", send: "Отправить", settings: "🎨 Настройки",
        language: "🌐 Язык", appearance: "🌓 Внешний вид", color_theme: "🎨 Цветовая тема",
        light_mode: "Светлая", dark_mode: "Тёмная", chat_with: "Чат с",
        select_user: "Выберите пользователя", message_placeholder: "Напишите сообщение...",
        keys_loaded: "🔑 Ключи загружены", keys_generated: "🔑 Ключи созданы",
        fill_fields: "Заполните все поля", server_error: "Ошибка подключения к серверу",
        failed_load_users: "❌ Не удалось загрузить список пользователей",
        error_history: "❌ Ошибка загрузки истории", you: "Вы", encrypted: "🔒 Зашифрованное сообщение",
        encryption_code: "Код шифрования",
        encryption_info: "Сравните этот код с собеседником для проверки безопасности шифрования:",
        shared_code: "Общий код", your_key: "Ваш ключ", peer_key: "Ключ собеседника",
        copy_code: "📋 Скопировать код", copied: "✓ Скопировано!",
        encryption_warning: "Если этот код изменился — возможно, собеседник переустановил приложение или кто-то пытается перехватить переписку.",
        key_exchange: "🔐 Шифрование установлено", need_peer_key: "Ожидание ключа собеседника...",
        search_chats: "Поиск чатов...", search_messages: "Поиск в переписке...",
        no_results: "Чаты не найдены", chats_tab: "Чаты", keys_tab: "Ключи",
        settings_tab: "Настройки", your_key_title: "Ваш ключ шифрования",
        your_key_description: "Поделитесь этим кодом с контактами, чтобы они могли подтвердить вашу личность.",
        copy_key: "📋 Скопировать мой код",
        keys_warning: "Если ваш код неожиданно изменился, это может указывать на проблему безопасности.",
        logout: "Выйти", connected: "Подключено", connecting: "Подключение...",
        reconnecting: "Переподключение", disconnected: "Соединение потеряно",
        new_chat: "Новый диалог", search_users: "Поиск пользователей...",
        no_users: "Пользователи не найдены", no_chats_title: "Пока нет диалогов",
        no_chats_subtitle: "Нажмите + чтобы начать новый чат", continue_chat: "Продолжить диалог",
        start_chat: "Начать новый чат",
        welcome_subtitle: "Безопасный мессенджер с end-to-end шифрованием",
        welcome_theme: "Настроить внешний вид", welcome_theme_desc: "Темы, цвета, тёмный режим",
        welcome_lang: "Язык интерфейса", welcome_lang_desc: "English, Русский",
        welcome_keys: "Ваш ключ шифрования", welcome_keys_desc: "Подтвердите свою личность",
        welcome_hint: "Выберите диалог или нажмите + чтобы начать новый",
        typing: "печатает", reply_to: "Ответ"
    }
};

export function t(key) {
    return (I18N[state.currentLang] && I18N[state.currentLang][key]) || I18N.en[key] || key;
}

export function setLanguage(lang) {
    if (!I18N[lang]) return;
    state.currentLang = lang;
    try { localStorage.setItem('amini_lang', lang); } catch (e) {}
    
    document.querySelectorAll('[data-i18n]').forEach(el => {
        const translation = t(el.getAttribute('data-i18n'));
        if (translation) el.textContent = translation;
    });
    
    document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
        const translation = t(el.getAttribute('data-i18n-placeholder'));
        if (translation) el.placeholder = translation;
    });
    
    document.querySelectorAll('.lang-btn').forEach(btn => 
        btn.classList.toggle('active', btn.textContent.trim().toLowerCase() === lang)
    );
    document.querySelectorAll('.lang-option').forEach(btn => 
        btn.classList.toggle('active', btn.dataset.lang === lang)
    );
}