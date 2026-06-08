// ============================================
// ========== ПРЕДОТВРАЩЕНИЕ SUBMIT ===========
// ============================================
document.addEventListener('submit', function(e) {
    e.preventDefault();
});

// ============================================
// ============ ГЛОБАЛЬНЫЕ ПЕРЕМЕННЫЕ =========
// ============================================
let token = null;
let userId = null;
let ws = null;
let activeTargetId = null;
let activeTargetName = null;
let currentTab = 'chats';

const shownMessages = new Set();
const publicKeys = {};
const pendingMessages = {};
const userCache = new Map();
const pendingReadQueue = new Map();
const shownKeyExchanges = new Set();

let wsReconnectTimer = null;
let wsReconnectAttempts = 0;
const WS_MAX_RECONNECT = 10;
const WS_RECONNECT_BASE_DELAY = 1000;
const WS_RECONNECT_MAX_DELAY = 30000;

let chatSearchMatches = [];
let chatSearchActiveIndex = -1;

let allUsersList = [];

// ============================================
// ============ ЛОКАЛИЗАЦИЯ ==================
// ============================================

const I18N = {
    en: {
        login: "Login",
        register: "Register",
        send: "Send",
        settings: "🎨 Settings",
        language: "🌐 Language",
        appearance: "🌓 Appearance",
        color_theme: "🎨 Color Theme",
        light_mode: "Light",
        dark_mode: "Dark",
        chat_with: "Chat with",
        select_user: "Select a user",
        message_placeholder: "Write a message...",
        keys_loaded: "🔑 Keys loaded",
        keys_generated: "🔑 Keys generated",
        fill_fields: "Fill all fields",
        server_error: "Server connection error",
        failed_load_users: "❌ Failed to load users list",
        error_history: "❌ Error loading history",
        you: "You",
        encrypted: "🔒 Encrypted message",
        encryption_code: "Encryption Code",
        encryption_info: "Compare this code with your contact to verify encryption security:",
        shared_code: "Shared Code",
        your_key: "Your Key",
        peer_key: "Peer's Key",
        copy_code: "📋 Copy Code",
        copied: "✓ Copied!",
        encryption_warning: "If this code changes, it may mean your contact reinstalled the app or someone is trying to intercept your conversation.",
        key_exchange: "🔐 Encryption established",
        need_peer_key: "Waiting for peer's key...",
        search_chats: "Search chats...",
        search_messages: "Search in conversation...",
        no_results: "No chats found",
        chats_tab: "Chats",
        keys_tab: "Keys",
        settings_tab: "Settings",
        your_key_title: "Your Encryption Key",
        your_key_description: "Share this code with contacts so they can verify your identity.",
        copy_key: "📋 Copy My Code",
        keys_warning: "If your code changes unexpectedly, it may indicate a security issue.",
        logout: "Log Out",
        connected: "Connected",
        connecting: "Connecting...",
        reconnecting: "Reconnecting",
        disconnected: "Connection lost",
        new_chat: "New Conversation",
        search_users: "Search users...",
        no_users: "No users found",
        no_chats_title: "No conversations yet",
        no_chats_subtitle: "Tap + to start a new chat",
        continue_chat: "Continue chat",
        start_chat: "Start new chat",
        welcome_subtitle: "Secure end-to-end encrypted messenger",
        welcome_theme: "Customize Appearance",
        welcome_theme_desc: "Themes, colors, dark mode",
        welcome_lang: "Language",
        welcome_lang_desc: "English, Русский",
        welcome_keys: "Your Encryption Key",
        welcome_keys_desc: "Verify your identity",
        welcome_hint: "Select a conversation or tap + to start a new one"
    },
    ru: {
        login: "Войти",
        register: "Регистрация",
        send: "Отправить",
        settings: "🎨 Настройки",
        language: "🌐 Язык",
        appearance: "🌓 Внешний вид",
        color_theme: "🎨 Цветовая тема",
        light_mode: "Светлая",
        dark_mode: "Тёмная",
        chat_with: "Чат с",
        select_user: "Выберите пользователя",
        message_placeholder: "Напишите сообщение...",
        keys_loaded: "🔑 Ключи загружены",
        keys_generated: "🔑 Ключи созданы",
        fill_fields: "Заполните все поля",
        server_error: "Ошибка подключения к серверу",
        failed_load_users: "❌ Не удалось загрузить список пользователей",
        error_history: "❌ Ошибка загрузки истории",
        you: "Вы",
        encrypted: "🔒 Зашифрованное сообщение",
        encryption_code: "Код шифрования",
        encryption_info: "Сравните этот код с собеседником для проверки безопасности шифрования:",
        shared_code: "Общий код",
        your_key: "Ваш ключ",
        peer_key: "Ключ собеседника",
        copy_code: "📋 Скопировать код",
        copied: "✓ Скопировано!",
        encryption_warning: "Если этот код изменился — возможно, собеседник переустановил приложение или кто-то пытается перехватить переписку.",
        key_exchange: "🔐 Шифрование установлено",
        need_peer_key: "Ожидание ключа собеседника...",
        search_chats: "Поиск чатов...",
        search_messages: "Поиск в переписке...",
        no_results: "Чаты не найдены",
        chats_tab: "Чаты",
        keys_tab: "Ключи",
        settings_tab: "Настройки",
        your_key_title: "Ваш ключ шифрования",
        your_key_description: "Поделитесь этим кодом с контактами, чтобы они могли подтвердить вашу личность.",
        copy_key: "📋 Скопировать мой код",
        keys_warning: "Если ваш код неожиданно изменился, это может указывать на проблему безопасности.",
        logout: "Выйти",
        connected: "Подключено",
        connecting: "Подключение...",
        reconnecting: "Переподключение",
        disconnected: "Соединение потеряно",
        new_chat: "Новый диалог",
        search_users: "Поиск пользователей...",
        no_users: "Пользователи не найдены",
        no_chats_title: "Пока нет диалогов",
        no_chats_subtitle: "Нажмите + чтобы начать новый чат",
        continue_chat: "Продолжить диалог",
        start_chat: "Начать новый чат",
        welcome_subtitle: "Безопасный мессенджер с end-to-end шифрованием",
        welcome_theme: "Настроить внешний вид",
        welcome_theme_desc: "Темы, цвета, тёмный режим",
        welcome_lang: "Язык интерфейса",
        welcome_lang_desc: "English, Русский",
        welcome_keys: "Ваш ключ шифрования",
        welcome_keys_desc: "Подтвердите свою личность",
        welcome_hint: "Выберите диалог или нажмите + чтобы начать новый"
    }
};

let currentLang = 'en';

function t(key) {
    return (I18N[currentLang] && I18N[currentLang][key]) || I18N.en[key] || key;
}

function setLanguage(lang) {
    if (!I18N[lang]) return;
    currentLang = lang;
    
    try { localStorage.setItem('amini_lang', lang); } catch (e) {}
    
    document.querySelectorAll('[data-i18n]').forEach(el => {
        const key = el.getAttribute('data-i18n');
        const translation = t(key);
        if (translation) el.textContent = translation;
    });
    
    document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
        const key = el.getAttribute('data-i18n-placeholder');
        const translation = t(key);
        if (translation) el.placeholder = translation;
    });
    
    document.querySelectorAll('.lang-btn').forEach(btn => {
        btn.classList.toggle('active', 
            btn.textContent.trim().toLowerCase() === lang);
    });
    
    document.querySelectorAll('.lang-option').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.lang === lang);
    });
    
    const statusBar = document.getElementById('statusBar');
    if (statusBar) {
        const currentStatus = statusBar.className.match(/status-(\w+)/)?.[1] || 'connecting';
        updateConnectionStatus(currentStatus);
    }
    
    renderChatsList();
    renderNewChatList(document.getElementById('newChatSearchInput')?.value || '');
}

// ============================================
// ============ 🎨 MATERIAL YOU THEMES ========
// ============================================

const THEMES = [
    { 
        name: "Ocean Blue", 
        wallpaper: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)", 
        wallpaperDark: "linear-gradient(135deg, #1e3a8a 0%, #4c1d95 100%)", 
        accent: "#4A90E2", accentHover: "#357ABD", 
        bubbleMe: "#D6EAF8", bubbleMeDark: "#2b5278",
        surfaceLight: { main: "#eef4ff", container: "#ffffff", header: "#e1ebfa", input: "#ffffff", hover: "#e8f0fb", border: "#d6e3f5" },
        surfaceDark: { main: "#0d1520", container: "#172230", header: "#1e2a3a", input: "#1e2a3a", hover: "#253447", border: "#0a1018" }
    },
    { 
        name: "Forest", 
        wallpaper: "linear-gradient(135deg, #134E5E 0%, #71B280 100%)", 
        wallpaperDark: "linear-gradient(135deg, #0a2e26 0%, #1e5a3f 100%)", 
        accent: "#27AE60", accentHover: "#229954", 
        bubbleMe: "#D5F5E3", bubbleMeDark: "#1e5a3f",
        surfaceLight: { main: "#eefaf3", container: "#ffffff", header: "#def5e8", input: "#ffffff", hover: "#e5f7ec", border: "#c8ebd6" },
        surfaceDark: { main: "#0a1612", container: "#15261f", header: "#1c332a", input: "#1c332a", hover: "#254536", border: "#08100c" }
    },
    { 
        name: "Sunset", 
        wallpaper: "linear-gradient(135deg, #FF6B6B 0%, #FFA500 50%, #FFE66D 100%)", 
        wallpaperDark: "linear-gradient(135deg, #7d1f1f 0%, #7d4a1f 50%, #5a4318 100%)", 
        accent: "#E67E22", accentHover: "#D35400", 
        bubbleMe: "#FDEBD0", bubbleMeDark: "#7d4a1f",
        surfaceLight: { main: "#fff5ec", container: "#ffffff", header: "#ffe9d4", input: "#ffffff", hover: "#ffefdd", border: "#f5d4b0" },
        surfaceDark: { main: "#1a110a", container: "#281910", header: "#352215", input: "#352215", hover: "#43301f", border: "#120a06" }
    },
    { 
        name: "Night Sky", 
        wallpaper: "linear-gradient(135deg, #2C3E50 0%, #4CA1AF 100%)", 
        wallpaperDark: "linear-gradient(135deg, #0F2027 0%, #203A43 50%, #2C5364 100%)", 
        accent: "#3498DB", accentHover: "#2980B9", 
        bubbleMe: "#AED6F1", bubbleMeDark: "#2b5278",
        surfaceLight: { main: "#edf5fb", container: "#ffffff", header: "#d9ebf7", input: "#ffffff", hover: "#e3eff8", border: "#c3dced" },
        surfaceDark: { main: "#0a1620", container: "#15222e", header: "#1c2d3d", input: "#1c2d3d", hover: "#243c50", border: "#081018" }
    },
    { 
        name: "Rose Gold", 
        wallpaper: "linear-gradient(135deg, #E8B4B8 0%, #D4A5A5 50%, #C89696 100%)", 
        wallpaperDark: "linear-gradient(135deg, #3d1f2f 0%, #4d2a2a 50%, #5a2f2f 100%)", 
        accent: "#C0392B", accentHover: "#A93226", 
        bubbleMe: "#FADBD8", bubbleMeDark: "#7d3a2f",
        surfaceLight: { main: "#fef0f1", container: "#ffffff", header: "#fbe0e2", input: "#ffffff", hover: "#fde7e9", border: "#f2c4c7" },
        surfaceDark: { main: "#1a0e11", container: "#28171b", header: "#351f24", input: "#351f24", hover: "#432c31", border: "#120a0c" }
    },
    { 
        name: "Mint", 
        wallpaper: "linear-gradient(135deg, #A8E6CF 0%, #DCEDC1 50%, #FFD3B6 100%)", 
        wallpaperDark: "linear-gradient(135deg, #1e3a2f 0%, #2d4a3f 50%, #3a4a2f 100%)", 
        accent: "#16A085", accentHover: "#138D75", 
        bubbleMe: "#D1F2EB", bubbleMeDark: "#1e5a4d",
        surfaceLight: { main: "#eefaf6", container: "#ffffff", header: "#def5ee", input: "#ffffff", hover: "#e5f7f2", border: "#c5e8de" },
        surfaceDark: { main: "#0a1612", container: "#15261f", header: "#1c332a", input: "#1c332a", hover: "#254536", border: "#08100c" }
    },
    { 
        name: "Purple Haze", 
        wallpaper: "linear-gradient(135deg, #8E2DE2 0%, #4A00E0 100%)", 
        wallpaperDark: "linear-gradient(135deg, #2d0a4d 0%, #1a0033 100%)", 
        accent: "#8E44AD", accentHover: "#7D3C98", 
        bubbleMe: "#E8DAEF", bubbleMeDark: "#5a2f7a",
        surfaceLight: { main: "#f5f0fc", container: "#ffffff", header: "#e8dff8", input: "#ffffff", hover: "#ece4f8", border: "#d7c6eb" },
        surfaceDark: { main: "#120a1e", container: "#1e1330", header: "#281c42", input: "#281c42", hover: "#352755", border: "#0c0618" }
    },
    { 
        name: "Classic", 
        wallpaper: "linear-gradient(135deg, #ECE9E6 0%, #FFFFFF 100%)", 
        wallpaperDark: "linear-gradient(135deg, #1a1f2e 0%, #2d3748 100%)", 
        accent: "#007BFF", accentHover: "#0056B3", 
        bubbleMe: "#D9FDD3", bubbleMeDark: "#2b5278",
        surfaceLight: { main: "#f8f9fa", container: "#ffffff", header: "#f1f3f5", input: "#ffffff", hover: "#f4f5f7", border: "#dee2e6" },
        surfaceDark: { main: "#0e1621", container: "#17212b", header: "#242f3d", input: "#242f3d", hover: "#2b3a4a", border: "#0c1621" }
    }
];

let currentThemeIndex = 0;
let currentThemeMode = 'light';

// ============================================
// ========== ГЕНЕРАЦИЯ ЦВЕТА АВАТАРА =========
// ============================================

const AVATAR_COLORS = [
    "#FF6B6B", "#4ECDC4", "#45B7D1", "#FFA07A", "#98D8C8", "#F7B731", 
    "#A8E6CF", "#FF8B94", "#B39DDB", "#81C784", "#FFD54F", "#4DB6AC",
    "#FF8A65", "#BA68C8", "#64B5F6", "#AED581", "#FFB74D", "#F06292", 
    "#7986CB", "#4DD0E1"
];

function hashStringToColor(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

function getInitials(username) {
    if (!username) return "?";
    const clean = username.trim();
    if (clean.length <= 2) return clean.toUpperCase();
    return clean.substring(0, 2).toUpperCase();
}

function createAvatarElement(username, sizeClass = "") {
    const div = document.createElement("div");
    div.className = `avatar ${sizeClass}`.trim();
    div.style.backgroundColor = hashStringToColor(username);
    div.textContent = getInitials(username);
    return div;
}

function updateAvatar(avatarEl, username) {
    if (!avatarEl) return;
    avatarEl.style.backgroundColor = hashStringToColor(username);
    avatarEl.textContent = getInitials(username);
}

// ============================================
// ========== УТИЛИТЫ =========================
// ============================================

const getLogDiv = () => document.getElementById("log");
const getAuthErrorDiv = () => document.getElementById("authError");

function formatTime(timeInput) {
    let d;
    if (timeInput) {
        const ts = timeInput > 1e12 ? timeInput : timeInput * 1000;
        d = new Date(ts);
    } else {
        d = new Date();
    }
    if (isNaN(d.getTime())) d = new Date(); 
    let hours = String(d.getHours()).padStart(2, '0');
    let minutes = String(d.getMinutes()).padStart(2, '0');
    return `${hours}:${minutes}`;
}

// ============================================
// ============ STATUS BAR ====================
// ============================================

function updateConnectionStatus(status, details = '') {
    const bar = document.getElementById('statusBar');
    if (!bar) return;
    
    const text = bar.querySelector('.status-text');
    bar.className = 'status-bar status-' + status;
    
    const messages = {
        connected: t('connected'),
        connecting: t('connecting'),
        reconnecting: t('reconnecting') + (details ? ` (${details})` : ''),
        disconnected: t('disconnected')
    };
    
    text.textContent = messages[status] || status;
}

// ============================================
// ============ ПЕРЕКЛЮЧЕНИЕ ВКЛАДОК ==========
// ============================================

function switchTab(tabName) {
    currentTab = tabName;
    
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.tab === tabName);
    });
    
    document.querySelectorAll('.tab-pane').forEach(pane => {
        pane.classList.toggle('active', pane.id === 'tab-' + tabName);
    });
    
    const searchContainer = document.getElementById('searchContainer');
    if (searchContainer) {
        searchContainer.classList.toggle('hidden', tabName !== 'chats');
    }
    
    if (tabName === 'keys') {
        updateMyFingerprintDisplay();
    }
}

async function updateMyFingerprintDisplay() {
    const el = document.getElementById('myFingerprint');
    if (!el) return;
    
    if (!publicKeyBase64) {
        el.textContent = 'Loading...';
        return;
    }
    
    const fp = await getMyFingerprint();
    el.textContent = fp.full;
}

async function copyMyFingerprint() {
    const fp = await getMyFingerprint();
    if (!fp || !fp.full || fp.full === '—') return;
    
    try {
        await navigator.clipboard.writeText(fp.full);
        const btn = document.querySelector('.keys-copy-btn');
        const originalText = btn.textContent;
        btn.textContent = t('copied');
        btn.classList.add('copied');
        setTimeout(() => {
            btn.textContent = originalText;
            btn.classList.remove('copied');
        }, 1500);
    } catch (e) {
        console.log("Copy failed:", e);
    }
}

// ============================================
// ============ ПОИСК ПО ЧАТАМ ================
// ============================================

function initChatListSearch() {
    const input = document.getElementById('searchInput');
    const clearBtn = document.getElementById('searchClear');
    
    if (!input) return;
    
    input.addEventListener('input', (e) => {
        const query = e.target.value.trim();
        clearBtn.style.display = query ? 'block' : 'none';
        filterChats(query);
    });
    
    clearBtn.addEventListener('click', () => {
        input.value = '';
        clearBtn.style.display = 'none';
        filterChats('');
        input.focus();
    });
}

function filterChats(query) {
    renderChatsList();
    
    const items = document.querySelectorAll('.user-item');
    const emptyState = document.getElementById('searchEmptyState');
    const noChatsState = document.getElementById('noChatsState');
    let visibleCount = 0;
    
    items.forEach(item => {
        if (item.style.display !== 'none') visibleCount++;
    });
    
    if (emptyState) {
        const hasChats = noChatsState && noChatsState.style.display === 'none';
        emptyState.style.display = (query && visibleCount === 0 && hasChats) ? 'flex' : 'none';
    }
}

// ============================================
// ============ ПОИСК В ЧАТЕ ==================
// ============================================

function openChatSearch() {
    const panel = document.getElementById('chatSearchPanel');
    const input = document.getElementById('chatSearchInput');
    if (!panel || !input) return;
    
    panel.style.display = 'flex';
    input.value = '';
    input.focus();
    chatSearchMatches = [];
    chatSearchActiveIndex = -1;
    updateChatSearchCounter();
    
    if (!input.hasAttribute('data-listener-attached')) {
        input.addEventListener('input', onChatSearchInput);
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                if (e.shiftKey) chatSearchPrev();
                else chatSearchNext();
            } else if (e.key === 'Escape') {
                closeChatSearch();
            }
        });
        input.setAttribute('data-listener-attached', 'true');
    }
}

function closeChatSearch() {
    const panel = document.getElementById('chatSearchPanel');
    const logDiv = getLogDiv();
    const input = document.getElementById('chatSearchInput');
    
    if (panel) panel.style.display = 'none';
    if (input) input.value = '';
    if (logDiv) logDiv.classList.remove('chat-searching');
    
    document.querySelectorAll('.message-row.search-hit, .message-row.search-hit-active').forEach(row => {
        row.classList.remove('search-hit', 'search-hit-active');
    });
    
    chatSearchMatches = [];
    chatSearchActiveIndex = -1;
}

function onChatSearchInput(e) {
    const query = e.target.value.trim();
    const logDiv = getLogDiv();
    
    if (!logDiv) return;
    
    document.querySelectorAll('.message-row.search-hit, .message-row.search-hit-active').forEach(row => {
        row.classList.remove('search-hit', 'search-hit-active');
    });
    
    if (!query) {
        logDiv.classList.remove('chat-searching');
        chatSearchMatches = [];
        chatSearchActiveIndex = -1;
        updateChatSearchCounter();
        return;
    }
    
    logDiv.classList.add('chat-searching');
    chatSearchMatches = [];
    
    const rows = logDiv.querySelectorAll('.message-row.me, .message-row.other');
    rows.forEach(row => {
        const text = row.querySelector('.bubble-text')?.textContent || '';
        if (text.toLowerCase().includes(query.toLowerCase())) {
            row.classList.add('search-hit');
            chatSearchMatches.push(row);
        }
    });
    
    chatSearchActiveIndex = chatSearchMatches.length > 0 ? 0 : -1;
    updateChatSearchActive();
    updateChatSearchCounter();
}

function updateChatSearchActive() {
    document.querySelectorAll('.message-row.search-hit-active').forEach(row => {
        row.classList.remove('search-hit-active');
    });
    
    if (chatSearchActiveIndex >= 0 && chatSearchMatches[chatSearchActiveIndex]) {
        const active = chatSearchMatches[chatSearchActiveIndex];
        active.classList.add('search-hit-active');
        active.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
}

function updateChatSearchCounter() {
    const counter = document.getElementById('chatSearchCounter');
    if (!counter) return;
    
    if (chatSearchMatches.length === 0) {
        counter.textContent = '0/0';
    } else {
        counter.textContent = `${chatSearchActiveIndex + 1}/${chatSearchMatches.length}`;
    }
}

function chatSearchNext() {
    if (chatSearchMatches.length === 0) return;
    chatSearchActiveIndex = (chatSearchActiveIndex + 1) % chatSearchMatches.length;
    updateChatSearchActive();
    updateChatSearchCounter();
}

function chatSearchPrev() {
    if (chatSearchMatches.length === 0) return;
    chatSearchActiveIndex = (chatSearchActiveIndex - 1 + chatSearchMatches.length) % chatSearchMatches.length;
    updateChatSearchActive();
    updateChatSearchCounter();
}

// ============================================
// ========== ЛОГИРОВАНИЕ СООБЩЕНИЙ ==========
// ============================================

function logMessage(id, text, type, timeStr = "", status = "sent", username = null) {
    const logDiv = getLogDiv();
    if (!logDiv) return;

    const row = document.createElement("div");

    if (type === "me" || type === "other") {
        row.className = `message-row ${type}`;
        
        const bubble = document.createElement("div");
        bubble.className = "bubble";
        
        const txtSpan = document.createElement("span");
        txtSpan.className = "bubble-text";
        txtSpan.innerText = text;
        
        const metaDiv = document.createElement("div");
        metaDiv.className = "msg-meta";

        const timeSpan = document.createElement("span");
        timeSpan.className = "msg-time";
        timeSpan.innerText = timeStr || formatTime();
        metaDiv.appendChild(timeSpan);

        if (type === "me") {
            const statusSpan = document.createElement("span");
            statusSpan.className = `msg-status status-${status}`;
            statusSpan.id = `status-${id}`; 
            metaDiv.appendChild(statusSpan);
        }
        
        bubble.appendChild(txtSpan);
        bubble.appendChild(metaDiv);
        row.appendChild(bubble);
    } else if (type === "key_exchange") {
        row.className = "system-row key-exchange";
        const sysBox = document.createElement("div");
        sysBox.className = "system-box";
        
        const mainText = document.createElement("span");
        mainText.textContent = text;
        sysBox.appendChild(mainText);
        
        if (username) {
            const fingerprintSpan = document.createElement("span");
            fingerprintSpan.className = "key-exchange-fingerprint";
            fingerprintSpan.textContent = username;
            sysBox.appendChild(fingerprintSpan);
        }
        
        sysBox.onclick = () => openEncryptionModal();
        row.appendChild(sysBox);
    } else {
        row.className = `system-row ${type === 'error' ? 'error' : ''}`;
        const sysBox = document.createElement("div");
        sysBox.className = "system-box";
        sysBox.innerText = text;
        row.appendChild(sysBox);
    }

    logDiv.appendChild(row);
    logDiv.scrollTop = logDiv.scrollHeight;
}

function updateMessageStatus(id, newStatus) {
    const statusEl = document.getElementById(`status-${id}`);
    if (statusEl) {
        statusEl.className = `msg-status status-${newStatus}`;
    }
}

// ============================================
// ======= МОДАЛЬНОЕ ОКНО КОДА ШИФРОВАНИЯ =====
// ============================================

async function openEncryptionModal() {
    if (!activeTargetId || !activeTargetName) return;
    
    const overlay = document.getElementById('encryptionOverlay');
    const myCodeEl = document.getElementById('myCode');
    const peerCodeEl = document.getElementById('peerCode');
    const sharedCodeEl = document.getElementById('sharedCode');
    const peerNameLabel = document.getElementById('peerNameLabel');
    
    const peerLabelBase = currentLang === 'ru' ? `Ключ ${activeTargetName}` : `${activeTargetName}'s Key`;
    peerNameLabel.textContent = peerLabelBase;
    
    const myFP = await getMyFingerprint();
    const peerFP = await getPeerFingerprint(activeTargetId);
    
    myCodeEl.textContent = myFP.full;
    
    if (peerFP) {
        peerCodeEl.textContent = peerFP.full;
        const sharedRaw = xorHexStrings(myFP.raw, peerFP.raw);
        const sharedGroups = [];
        for (let i = 0; i < sharedRaw.length; i += 5) {
            sharedGroups.push(sharedRaw.slice(i, i + 5));
        }
        sharedCodeEl.textContent = sharedGroups.join(' ');
    } else {
        peerCodeEl.textContent = t('need_peer_key');
        sharedCodeEl.textContent = "—";
    }
    
    overlay.classList.add('open');
}

function closeEncryptionModal() {
    document.getElementById('encryptionOverlay').classList.remove('open');
}

async function copyEncryptionCode() {
    const sharedCode = document.getElementById('sharedCode').textContent;
    if (!sharedCode || sharedCode === "—") return;
    
    try {
        await navigator.clipboard.writeText(sharedCode);
        const btn = document.querySelector('.btn-copy');
        const originalText = btn.textContent;
        btn.textContent = t('copied');
        btn.classList.add('copied');
        setTimeout(() => {
            btn.textContent = originalText;
            btn.classList.remove('copied');
        }, 1500);
    } catch (e) {
        console.log("Copy failed:", e);
    }
}

function xorHexStrings(hex1, hex2) {
    const len = Math.min(hex1.length, hex2.length);
    let result = '';
    for (let i = 0; i < len; i++) {
        const n1 = parseInt(hex1[i], 16);
        const n2 = parseInt(hex2[i], 16);
        result += (n1 ^ n2).toString(16).toUpperCase();
    }
    return result;
}

async function showKeyExchangeIfNeeded(targetId) {
    if (!targetId || !publicKeys[targetId]) return;
    
    const myFP = await getMyFingerprint();
    const peerFP = await getPeerFingerprint(targetId);
    
    if (!peerFP) return;
    
    const pairId = `${myFP.raw.slice(0, 10)}-${peerFP.raw.slice(0, 10)}`;
    
    if (shownKeyExchanges.has(pairId)) return;
    shownKeyExchanges.add(pairId);
    
    logMessage(null, t('key_exchange'), "key_exchange", formatTime(), "sent", peerFP.short);
}

// ============================================
// ========== 🎨 ПРИМЕНЕНИЕ ТЕМЫ (Material You) 
// ============================================

function applyTheme(themeIndex) {
    const theme = THEMES[themeIndex];
    if (!theme) return;
    
    const root = document.documentElement;
    const isDark = currentThemeMode === 'dark';
    
    root.style.setProperty('--accent-color', theme.accent);
    root.style.setProperty('--accent-color-hover', theme.accentHover);
    root.style.setProperty('--bubble-me', isDark ? theme.bubbleMeDark : theme.bubbleMe);
    root.style.setProperty('--chat-bg-image', isDark ? theme.wallpaperDark : theme.wallpaper);
    
    // 🎨 Material You surface colors
    const surface = isDark ? theme.surfaceDark : theme.surfaceLight;
    if (surface) {
        root.style.setProperty('--surface-main', surface.main);
        root.style.setProperty('--surface-container', surface.container);
        root.style.setProperty('--surface-header', surface.header);
        root.style.setProperty('--surface-input', surface.input);
        root.style.setProperty('--surface-hover', surface.hover);
        root.style.setProperty('--surface-elevated', surface.container);
        root.style.setProperty('--surface-border', surface.border);
    }
    
    currentThemeIndex = themeIndex;
    
    try { localStorage.setItem('amini_theme', themeIndex.toString()); } catch (e) {}
    
    document.querySelectorAll('.theme-card').forEach((card, idx) => {
        card.classList.toggle('active', idx === themeIndex);
    });
}

function setThemeMode(mode) {
    currentThemeMode = mode;
    
    if (mode === 'dark') {
        document.body.classList.add('dark-theme');
    } else {
        document.body.classList.remove('dark-theme');
    }
    
    try { localStorage.setItem('amini_mode', mode); } catch (e) {}
    
    document.querySelectorAll('.mode-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.mode === mode);
    });
    
    applyTheme(currentThemeIndex);
    renderThemesGrid();
}

function loadSavedTheme() {
    try {
        const savedMode = localStorage.getItem('amini_mode');
        if (savedMode === 'dark' || savedMode === 'light') currentThemeMode = savedMode;
    } catch (e) {}
    
    try {
        const saved = localStorage.getItem('amini_theme');
        if (saved !== null) {
            const idx = parseInt(saved, 10);
            if (!isNaN(idx) && idx >= 0 && idx < THEMES.length) currentThemeIndex = idx;
        }
    } catch (e) {}
    
    setThemeMode(currentThemeMode);
    applyTheme(currentThemeIndex);
}

function renderThemesGrid() {
    const grid = document.getElementById('themesGrid');
    if (!grid) return;
    
    grid.innerHTML = '';
    const isDark = currentThemeMode === 'dark';
    
    THEMES.forEach((theme, idx) => {
        const card = document.createElement('div');
        card.className = 'theme-card';
        card.style.background = isDark ? theme.wallpaperDark : theme.wallpaper;
        
        if (idx === currentThemeIndex) card.classList.add('active');
        
        const nameDiv = document.createElement('div');
        nameDiv.className = 'theme-name';
        nameDiv.textContent = theme.name;
        card.appendChild(nameDiv);
        
        const preview = document.createElement('div');
        preview.className = 'theme-preview';
        
        const otherBubble = document.createElement('div');
        otherBubble.className = 'theme-preview-bubble';
        otherBubble.textContent = 'Hi!';
        if (isDark) {
            otherBubble.style.background = '#182533';
            otherBubble.style.color = 'white';
        }
        preview.appendChild(otherBubble);
        
        const meBubble = document.createElement('div');
        meBubble.className = 'theme-preview-bubble me';
        meBubble.style.background = isDark ? theme.bubbleMeDark : theme.bubbleMe;
        if (isDark) meBubble.style.color = 'white';
        meBubble.textContent = 'Hey!';
        preview.appendChild(meBubble);
        
        card.appendChild(preview);
        card.onclick = () => applyTheme(idx);
        grid.appendChild(card);
    });
}

// ============================================
// ========== ИНИЦИАЛИЗАЦИЯ UI ================
// ============================================

function initUI() {
    initChatListSearch();
    
    document.getElementById('chatSearchBtn')?.addEventListener('click', openChatSearch);
    document.getElementById('encryptionBtn')?.addEventListener('click', openEncryptionModal);
    
    document.getElementById('encryptionOverlay')?.addEventListener('click', (e) => {
        if (e.target.id === 'encryptionOverlay') closeEncryptionModal();
    });
    
    document.getElementById('newChatOverlay')?.addEventListener('click', (e) => {
        if (e.target.id === 'newChatOverlay') closeNewChatModal();
    });
    
    const newChatSearchInput = document.getElementById('newChatSearchInput');
    if (newChatSearchInput) {
        newChatSearchInput.addEventListener('input', (e) => {
            renderNewChatList(e.target.value);
        });
    }
    
    renderThemesGrid();
    loadSavedTheme();
}

// ============================================
// ========= МОДАЛКА НОВОГО ЧАТА ==============
// ============================================

function openNewChatModal() {
    const overlay = document.getElementById('newChatOverlay');
    if (!overlay) return;
    
    overlay.classList.add('open');
    
    setTimeout(() => {
        const input = document.getElementById('newChatSearchInput');
        if (input) {
            input.value = '';
            input.focus();
        }
    }, 100);
    
    renderNewChatList('');
}

function closeNewChatModal() {
    const overlay = document.getElementById('newChatOverlay');
    if (overlay) overlay.classList.remove('open');
}

function renderNewChatList(query) {
    const list = document.getElementById('newChatList');
    const emptyState = document.getElementById('newChatEmpty');
    if (!list) return;
    
    list.innerHTML = '';
    
    const q = (query || '').toLowerCase().trim();
    const filtered = allUsersList.filter(u => {
        if (String(u.id) === userId) return false;
        if (!q) return true;
        return u.username.toLowerCase().includes(q);
    });
    
    if (filtered.length === 0) {
        if (emptyState) emptyState.style.display = 'flex';
        return;
    }
    
    if (emptyState) emptyState.style.display = 'none';
    
    filtered.sort((a, b) => {
        const aData = userCache.get(String(a.id));
        const bData = userCache.get(String(b.id));
        const aHasChat = aData && aData.lastMessage !== null;
        const bHasChat = bData && bData.lastMessage !== null;
        
        if (aHasChat && !bHasChat) return -1;
        if (!aHasChat && bHasChat) return 1;
        return a.username.localeCompare(b.username);
    });
    
    filtered.forEach(u => {
        const uIdStr = String(u.id);
        const data = userCache.get(uIdStr);
        const hasChat = data && data.lastMessage !== null;
        
        const item = document.createElement('button');
        item.className = 'new-chat-item';
        
        const avatarWrapper = document.createElement('div');
        avatarWrapper.className = 'avatar-wrapper';
        const avatar = createAvatarElement(u.username);
        avatarWrapper.appendChild(avatar);
        
        const presence = document.createElement('span');
        presence.className = 'presence-indicator offline';
        const existingPresence = document.getElementById(`presence-${uIdStr}`);
        if (existingPresence && existingPresence.classList.contains('online')) {
            presence.className = 'presence-indicator online';
        }
        avatarWrapper.appendChild(presence);
        
        const info = document.createElement('div');
        info.className = 'new-chat-item-info';
        
        const nameSpan = document.createElement('span');
        nameSpan.className = 'new-chat-item-name';
        nameSpan.textContent = u.username;
        info.appendChild(nameSpan);
        
        const statusSpan = document.createElement('span');
        statusSpan.className = 'new-chat-item-status' + (hasChat ? ' has-chat' : '');
        statusSpan.textContent = hasChat ? `💬 ${t('continue_chat')}` : `✨ ${t('start_chat')}`;
        info.appendChild(statusSpan);
        
        item.appendChild(avatarWrapper);
        item.appendChild(info);
        
        item.onclick = () => {
            startChatWith(uIdStr, u.username);
            closeNewChatModal();
        };
        
        list.appendChild(item);
    });
}

function startChatWith(targetId, targetName) {
    if (!userCache.has(targetId)) {
        userCache.set(targetId, {
            username: targetName,
            lastMessage: null,
            lastMessageText: null,
            lastTime: null,
            lastFromMe: false,
            unreadCount: 0
        });
    }
    
    renderChatsList();
    selectUser(targetId, targetName);
    
    if (currentTab !== 'chats') {
        switchTab('chats');
    }
}

// ============================================
// ========= WELCOME SCREEN ACTIONS ===========
// ============================================

function openThemeSettings() {
    switchTab('settings');
    setTimeout(() => {
        const themeSection = document.querySelector('#tab-settings .settings-section:nth-of-type(3)');
        if (themeSection) {
            themeSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    }, 100);
}

function openLanguageSettings() {
    switchTab('settings');
    setTimeout(() => {
        const langSection = document.querySelector('#tab-settings .settings-section:nth-of-type(1)');
        if (langSection) {
            langSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    }, 100);
}

function updateChatAreaVisibility() {
    const chatHeader = document.getElementById('chatHeader');
    const logDiv = document.getElementById('log');
    const inputArea = document.getElementById('inputArea');
    const welcomeScreen = document.getElementById('welcomeScreen');
    const chatSearchPanel = document.getElementById('chatSearchPanel');
    
    if (activeTargetId) {
        if (welcomeScreen) welcomeScreen.style.display = 'none';
        if (chatHeader) chatHeader.style.display = 'flex';
        if (logDiv) logDiv.style.display = 'flex';
        if (inputArea) inputArea.style.display = 'flex';
    } else {
        if (welcomeScreen) welcomeScreen.style.display = 'flex';
        if (chatHeader) chatHeader.style.display = 'none';
        if (logDiv) logDiv.style.display = 'none';
        if (inputArea) inputArea.style.display = 'none';
        if (chatSearchPanel) chatSearchPanel.style.display = 'none';
    }
}

// ============================================
// ======= РЕНДЕР СПИСКА АКТИВНЫХ ЧАТОВ ========
// ============================================

function renderChatsList() {
    const listContainer = document.getElementById("usersList");
    const noChatsState = document.getElementById("noChatsState");
    if (!listContainer) return;
    
    listContainer.innerHTML = "";
    
    const activeChats = [];
    userCache.forEach((data, uid) => {
        if (data.lastMessage !== null) {
            activeChats.push({ uid, ...data });
        }
    });
    
    activeChats.sort((a, b) => (b.lastTime || 0) - (a.lastTime || 0));
    
    if (noChatsState) {
        noChatsState.style.display = activeChats.length === 0 ? 'flex' : 'none';
    }
    
    const searchInput = document.getElementById('searchInput');
    const searchQuery = searchInput ? searchInput.value.trim().toLowerCase() : '';
    
    activeChats.forEach(chat => {
        if (searchQuery && !chat.username.toLowerCase().includes(searchQuery)) {
            return;
        }
        
        const btn = document.createElement("button");
        btn.className = "user-item";
        btn.id = "user-btn-" + chat.uid;
        btn.dataset.username = chat.username;
        btn.dataset.userid = chat.uid;
        
        const avatarWrapper = document.createElement("div");
        avatarWrapper.className = "avatar-wrapper";
        const avatar = createAvatarElement(chat.username);
        avatarWrapper.appendChild(avatar);
        
        const presenceIndicator = document.createElement("span");
        presenceIndicator.className = "presence-indicator offline";
        presenceIndicator.id = `presence-${chat.uid}`;
        avatarWrapper.appendChild(presenceIndicator);
        
        const content = document.createElement("div");
        content.className = "user-item-content";
        
        const top = document.createElement("div");
        top.className = "user-item-top";
        
        const nameSpan = document.createElement("span");
        nameSpan.className = "user-item-name";
        nameSpan.textContent = chat.username;
        top.appendChild(nameSpan);
        
        const timeSpan = document.createElement("span");
        timeSpan.className = "user-item-time";
        if (chat.lastTime) timeSpan.textContent = formatTime(chat.lastTime);
        top.appendChild(timeSpan);
        
        if (chat.unreadCount > 0) {
            const unreadBadge = document.createElement("span");
            unreadBadge.className = "user-item-unread";
            unreadBadge.textContent = chat.unreadCount;
            top.appendChild(unreadBadge);
        }
        
        content.appendChild(top);
        
        const preview = document.createElement("div");
        preview.className = "user-item-preview";
        
        const prefix = document.createElement("span");
        prefix.className = "user-item-preview-prefix";
        if (chat.lastFromMe) prefix.textContent = t('you') + ":";
        preview.appendChild(prefix);
        
        const previewText = document.createElement("span");
        previewText.className = "user-item-preview-text";
        previewText.textContent = chat.lastMessageText || t('encrypted');
        preview.appendChild(previewText);
        
        content.appendChild(preview);
        
        btn.appendChild(avatarWrapper);
        btn.appendChild(content);
        
        if (chat.uid === activeTargetId) {
            btn.classList.add('active');
        }
        
        btn.onclick = () => selectUser(chat.uid, chat.username);
        listContainer.appendChild(btn);
    });
}

// ============================================
// ======= ЗАГРУЗКА ВСЕХ ПОЛЬЗОВАТЕЛЕЙ ========
// ============================================

async function loadAllUsers() {
    try {
        const res = await fetch("http://localhost:8080/users", { 
            headers: { "Authorization": "Bearer " + token } 
        });
        const users = await res.json();
        if (!users || users.length === 0) return;
        
        allUsersList = users;
        
        users.forEach(u => {
            const uIdStr = String(u.id);
            if (uIdStr === userId) return;
            
            if (!userCache.has(uIdStr)) {
                userCache.set(uIdStr, {
                    username: u.username,
                    lastMessage: null,
                    lastMessageText: null,
                    lastTime: null,
                    lastFromMe: false,
                    unreadCount: 0
                });
            } else {
                userCache.get(uIdStr).username = u.username;
            }
        });
    } catch (err) {
        console.log("Failed to load users:", err);
    }
}

// ============================================
// ========== СПИСОК ПОЛЬЗОВАТЕЛЕЙ ===========
// ============================================

async function loadUsersList() {
    await loadAllUsers();
    await loadLastMessages();
    renderChatsList();
}

function updateUserPreview(uid) {
    const data = userCache.get(uid);
    if (!data) return;
    renderChatsList();
}

async function loadLastMessages() {
    try {
        const res = await fetch("http://localhost:8080/last-messages", {
            headers: { "Authorization": "Bearer " + token }
        });
        if (!res.ok) return;
        
        const messages = await res.json();
        if (!Array.isArray(messages)) return;
        
        for (const msg of messages) {
            const partnerId = String(msg.partner_id);
            const partner = userCache.get(partnerId);
            if (!partner) continue;
            
            const decrypted = await decryptMessage(msg, userId);
            
            userCache.set(partnerId, {
                ...partner,
                lastMessage: msg,
                lastMessageText: decrypted,
                lastTime: msg.created_at,
                lastFromMe: String(msg.from) === userId
            });
        }
        
        renderChatsList();
    } catch (e) {
        console.log("Failed to load last messages:", e);
    }
}

// ============================================
// ======= ОТПРАВКА READ СТАТУСА ==============
// ============================================

function markAsRead(msgId, fromId) {
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    
    if (!publicKeys[fromId]) {
        if (!pendingReadQueue.has(fromId)) {
            pendingReadQueue.set(fromId, []);
        }
        pendingReadQueue.get(fromId).push({ id: msgId, from: fromId });
        return;
    }
    
    ws.send(JSON.stringify({
        type: "status_update",
        id: msgId,
        to: fromId,
        status: "read"
    }));
}

function flushPendingReads(fromId) {
    if (!pendingReadQueue.has(fromId)) return;
    
    const queue = pendingReadQueue.get(fromId);
    pendingReadQueue.delete(fromId);
    
    queue.forEach(({ id, from }) => {
        if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({
                type: "status_update",
                id: id,
                to: from,
                status: "read"
            }));
        }
    });
}

// ============================================
// ========== АВТОРИЗАЦИЯ ====================
// ============================================

async function register() {
    const u = document.getElementById("authUsername").value.trim();
    const p = document.getElementById("authPassword").value;
    const authErrorDiv = getAuthErrorDiv();
    authErrorDiv.innerText = "";
    if (!u || !p) { authErrorDiv.innerText = t('fill_fields'); return; }

    try {
        const res = await fetch("http://localhost:8080/register", {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ username: u, password: p })
        });
        if (!res.ok) { authErrorDiv.innerText = await res.text(); return; }
        await login();
    } catch (err) { authErrorDiv.innerText = t('server_error'); }
}

async function login() {
    const u = document.getElementById("authUsername").value.trim();
    const p = document.getElementById("authPassword").value;
    const authErrorDiv = getAuthErrorDiv();
    authErrorDiv.innerText = "";
    if (!u || !p) { authErrorDiv.innerText = t('fill_fields'); return; }

    try {
        const res = await fetch("http://localhost:8080/login", {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ username: u, password: p })
        });
        if (!res.ok) { authErrorDiv.innerText = await res.text(); return; }

        const data = await res.json();
        token = data.token; 
        userId = String(data.id);
        
        localStorage.setItem("token", token);
        localStorage.setItem("userId", userId);
        localStorage.setItem("username", u);
        
        enterChat(u);
        
        const keyStatus = await initRSA(userId);
        const statusText = keyStatus === 'loaded' ? t('keys_loaded') : t('keys_generated');
        logMessage(null, statusText, "system");

        await loadUsersList();
        initWebSocket();
    } catch (err) { authErrorDiv.innerText = t('server_error'); }
}

function enterChat(username) {
    document.getElementById("authScreen").style.display = "none";
    document.getElementById("chatScreen").style.display = "flex";
    
    document.getElementById("myUsernameDisplay").innerText = username;
    
    const myAvatar = document.getElementById("myAvatar");
    if (myAvatar) updateAvatar(myAvatar, username);
    
    initUI();
    
    const savedLang = localStorage.getItem('amini_lang') || 'en';
    setLanguage(savedLang);
    
    switchTab('chats');
    
    updateChatAreaVisibility();
}

// ============================================
// ========== ВЫБОР ЧАТА ======================
// ============================================

function selectUser(targetId, targetName) {
    activeTargetId = String(targetId);
    activeTargetName = targetName;
    
    const chatTarget = document.getElementById("activeChatTarget");
    if (chatTarget.innerText === targetName && getLogDiv().children.length > 0) return;
    
    chatTarget.innerText = targetName;
    document.getElementById("messageInput").disabled = false;
    document.getElementById("sendBtn").disabled = false;
    
    const chatHeaderAvatar = document.getElementById("chatHeaderAvatar");
    if (chatHeaderAvatar) updateAvatar(chatHeaderAvatar, targetName);
    
    const sourcePresence = document.getElementById(`presence-${activeTargetId}`);
    const chatHeaderPresence = document.getElementById("chatHeaderPresence");
    if (sourcePresence && chatHeaderPresence) {
        chatHeaderPresence.className = `presence-indicator ${sourcePresence.classList.contains('online') ? 'online' : 'offline'}`;
    }
    
    document.getElementById('encryptionBtn').style.display = 'flex';
    document.getElementById('chatSearchBtn').style.display = 'flex';
    
    const data = userCache.get(activeTargetId);
    if (data) {
        data.unreadCount = 0;
    }
    
    getLogDiv().innerHTML = "";
    shownMessages.clear();
    shownKeyExchanges.clear();
    
    closeChatSearch();
    
    renderChatsList();
    
    updateChatAreaVisibility();

    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "get_pubkey", to: activeTargetId }));
    }
    loadHistory(activeTargetId);
}

// ============================================
// ========== ИСТОРИЯ СООБЩЕНИЙ ==============
// ============================================

async function loadHistory(target) {
    try {
        const res = await fetch(`http://localhost:8080/history?to=${target}`, { 
            headers: { "Authorization": "Bearer " + token } 
        });
        const messages = await res.json();
        if (!messages) return;

        for (let m of messages) {
            const msgIdStr = String(m.id);
            if (shownMessages.has(msgIdStr)) continue;
            shownMessages.add(msgIdStr);

            const text = await decryptMessage(m, userId);
            if (text) {
                let timeStr = formatTime(m.timestamp || m.created_at || null);
                let status = m.status || "sent"; 
                const fromIdStr = String(m.from);
                const isMe = fromIdStr === userId;
                const fromUsername = isMe 
                    ? localStorage.getItem("username") 
                    : (userCache.get(fromIdStr)?.username || "User");

                logMessage(msgIdStr, text, isMe ? "me" : "other", timeStr, status, fromUsername);
                
                if (!isMe && status !== "read") {
                    markAsRead(msgIdStr, fromIdStr);
                }
            } else if (!publicKeys[String(m.from)] && !publicKeys[String(m.to)]) {
                const fromIdStr = String(m.from);
                if (fromIdStr !== userId) {
                    markAsRead(msgIdStr, fromIdStr);
                }
            }
        }
        
        if (publicKeys[target]) {
            await showKeyExchangeIfNeeded(target);
        }
        
        if (messages.length > 0) {
            const lastMsg = messages[messages.length - 1];
            const decrypted = await decryptMessage(lastMsg, userId);
            const isMe = String(lastMsg.from) === userId;
            
            const currentData = userCache.get(target) || {
                username: activeTargetName,
                lastMessage: null,
                lastMessageText: null,
                lastTime: null,
                lastFromMe: false,
                unreadCount: 0
            };
            
            userCache.set(target, {
                ...currentData,
                lastMessage: lastMsg,
                lastMessageText: decrypted,
                lastTime: lastMsg.created_at,
                lastFromMe: isMe
            });
            
            renderChatsList();
        }
    } catch { 
        logMessage(null, t('error_history'), "error"); 
    }
}

// ============================================
// ========== WEBSOCKET =======================
// ============================================

function initWebSocket() {
    if (ws && (ws.readyState === WebSocket.CONNECTING || ws.readyState === WebSocket.OPEN)) {
        return;
    }
    
    if (wsReconnectAttempts === 0) {
        updateConnectionStatus('connecting');
    }
    
    ws = new WebSocket(`ws://localhost:8080/ws?token=${token}`);
    
    ws.onopen = () => {
        wsReconnectAttempts = 0;
        updateConnectionStatus('connected');
        ws.send(JSON.stringify({ type: "set_pubkey", pubKey: publicKeyBase64 })); 
    };
    
    ws.onclose = () => {
        if (!token) return;
        
        wsReconnectAttempts++;
        if (wsReconnectAttempts <= WS_MAX_RECONNECT) {
            const delay = Math.min(
                WS_RECONNECT_BASE_DELAY * Math.pow(2, wsReconnectAttempts - 1),
                WS_RECONNECT_MAX_DELAY
            );
            updateConnectionStatus('reconnecting', `${wsReconnectAttempts}/${WS_MAX_RECONNECT}`);
            wsReconnectTimer = setTimeout(initWebSocket, delay);
        } else {
            updateConnectionStatus('disconnected');
        }
    };
    
    ws.onerror = () => {
        if (wsReconnectAttempts === 0) {
            updateConnectionStatus('reconnecting');
        }
    };

    ws.onmessage = async (e) => {
        const d = JSON.parse(e.data);

        if (d.type === "online_list") {
            if (Array.isArray(d.users)) {
                d.users.forEach(uid => updatePresence(String(uid), "online"));
            }
            return;
        }

        if (d.type === "presence") {
            updatePresence(String(d.user), d.status);
            return;
        }

        if (d.type === "message_saved") {
            updateMessageStatus(String(d.id), "sent");
            return;
        }

        if (d.type === "status_update") {
            updateMessageStatus(String(d.id), d.status);
            return;
        }

        if (d.type === "pubkey") {
            publicKeys[d.from] = await crypto.subtle.importKey(
                "spki", fromB64(d.pubKey), 
                { name: "RSA-OAEP", hash: "SHA-256" }, 
                true, ["encrypt"]
            );
            
            flushPendingReads(d.from);
            
            if (String(d.from) === activeTargetId) {
                await showKeyExchangeIfNeeded(d.from);
            }
            
            if (pendingMessages[d.from]) {
                const queue = [...pendingMessages[d.from]];
                delete pendingMessages[d.from];
                for (const text of queue) await sendQueuedMessage(text, d.from);
            }
            return;
        }

        if (d.type === "message") {
            const msgIdStr = String(d.id);
            if (shownMessages.has(msgIdStr)) return;
            shownMessages.add(msgIdStr);

            const text = await decryptMessage(d, userId);
            const fromIdStr = String(d.from);
            const isMe = fromIdStr === userId;
            const fromUsername = isMe 
                ? localStorage.getItem("username") 
                : (userCache.get(fromIdStr)?.username || "User");
            
            if (!isMe) {
                let partnerData = userCache.get(fromIdStr);
                
                if (!partnerData) {
                    const user = allUsersList.find(u => String(u.id) === fromIdStr);
                    partnerData = {
                        username: user?.username || fromUsername || "Unknown",
                        lastMessage: null,
                        lastMessageText: null,
                        lastTime: null,
                        lastFromMe: false,
                        unreadCount: 0
                    };
                    userCache.set(fromIdStr, partnerData);
                }
                
                if (fromIdStr !== activeTargetId) {
                    partnerData.unreadCount = (partnerData.unreadCount || 0) + 1;
                }
                
                partnerData.lastMessage = d;
                partnerData.lastMessageText = text;
                partnerData.lastTime = d.created_at || Date.now() / 1000;
                partnerData.lastFromMe = false;
                
                userCache.set(fromIdStr, partnerData);
                renderChatsList();
            } else {
                const toId = String(d.to);
                let partnerData = userCache.get(toId);
                
                if (!partnerData) {
                    const user = allUsersList.find(u => String(u.id) === toId);
                    partnerData = {
                        username: user?.username || "Unknown",
                        lastMessage: null,
                        lastMessageText: null,
                        lastTime: null,
                        lastFromMe: false,
                        unreadCount: 0
                    };
                    userCache.set(toId, partnerData);
                }
                
                partnerData.lastMessage = d;
                partnerData.lastMessageText = text;
                partnerData.lastTime = d.created_at || Date.now() / 1000;
                partnerData.lastFromMe = true;
                
                userCache.set(toId, partnerData);
                renderChatsList();
            }
            
            if (fromIdStr === activeTargetId || (isMe && String(d.to) === activeTargetId)) {
                if (text) {
                    let timeStr = formatTime(d.timestamp || d.created_at || null);
                    logMessage(msgIdStr, text, isMe ? "me" : "other", timeStr, "sent", fromUsername);
                    
                    if (!isMe) {
                        markAsRead(msgIdStr, fromIdStr);
                    }
                } else if (!isMe) {
                    markAsRead(msgIdStr, fromIdStr);
                }
            } else {
                if (!isMe) {
                    if (ws && ws.readyState === WebSocket.OPEN) {
                        ws.send(JSON.stringify({ 
                            type: "status_update", 
                            id: msgIdStr, 
                            to: fromIdStr, 
                            status: "delivered" 
                        }));
                    }
                }
            }
        }
    };
}

function updatePresence(uid, status) {
    const presenceIndicator = document.getElementById(`presence-${String(uid)}`);
    if (presenceIndicator) {
        presenceIndicator.className = `presence-indicator ${status}`;
    }
    
    if (String(uid) === activeTargetId) {
        const chatHeaderPresence = document.getElementById("chatHeaderPresence");
        if (chatHeaderPresence) {
            chatHeaderPresence.className = `presence-indicator ${status}`;
        }
    }
}

// ============================================
// ========== ОТПРАВКА СООБЩЕНИЙ =============
// ============================================

async function sendQueuedMessage(text, target) {
    const encrypted = await encryptDual(text, publicKeys[target]);
    const messageId = generateMessageId();
    shownMessages.add(messageId);

    ws.send(JSON.stringify({ id: messageId, type: "message", to: String(target), ...encrypted }));
    const myUsername = localStorage.getItem("username");
    logMessage(messageId, text, "me", formatTime(), "sent", myUsername);
}

async function send() {
    const messageInput = document.getElementById("messageInput");
    const text = messageInput.value.trim();
    const target = activeTargetId;

    if (!text || !target) return;

    if (!publicKeys[target]) {
        if (!pendingMessages[target]) pendingMessages[target] = [];
        pendingMessages[target].push(text);
        ws.send(JSON.stringify({ type: "get_pubkey", to: String(target) }));
        messageInput.value = "";
        return;
    }

    const encrypted = await encryptDual(text, publicKeys[target]);
    const messageId = generateMessageId();
    shownMessages.add(messageId);

    ws.send(JSON.stringify({ id: messageId, type: "message", to: String(target), ...encrypted }));
    const myUsername = localStorage.getItem("username");
    logMessage(messageId, text, "me", formatTime(), "sent", myUsername); 
    messageInput.value = "";
}

// ============================================
// ========== ВЫХОД ===========================
// ============================================

function logout() {
    if (wsReconnectTimer) {
        clearTimeout(wsReconnectTimer);
        wsReconnectTimer = null;
    }
    wsReconnectAttempts = 0;
    
    token = null;
    
    if (ws) { 
        ws.close(); 
        ws = null; 
    }
    
    userId = null; 
    activeTargetId = null;
    activeTargetName = null;
    currentTab = 'chats';
    
    for (let key in publicKeys) delete publicKeys[key];
    shownMessages.clear();
    userCache.clear();
    shownKeyExchanges.clear();
    pendingReadQueue.clear();
    if (pendingMessages) Object.keys(pendingMessages).forEach(k => delete pendingMessages[k]);
    chatSearchMatches = [];
    chatSearchActiveIndex = -1;
    allUsersList = [];

    localStorage.removeItem("token");
    localStorage.removeItem("userId");
    localStorage.removeItem("username");

    getLogDiv().innerHTML = "";
    document.getElementById("usersList").innerHTML = "";
    document.getElementById("activeChatTarget").innerText = t('select_user');
    
    const messageInput = document.getElementById("messageInput");
    messageInput.value = ""; 
    messageInput.disabled = true;
    document.getElementById("sendBtn").disabled = true;
    document.getElementById("authPassword").value = ""; 
    getAuthErrorDiv().innerText = "";
    
    const searchInput = document.getElementById('searchInput');
    if (searchInput) searchInput.value = '';
    const searchClear = document.getElementById('searchClear');
    if (searchClear) searchClear.style.display = 'none';
    filterChats('');
    closeChatSearch();

    document.getElementById("chatScreen").style.display = "none";
    document.getElementById("authScreen").style.display = "block";
    document.getElementById('encryptionBtn').style.display = 'none';
    document.getElementById('chatSearchBtn').style.display = 'none';
    
    updateChatAreaVisibility();
    
    updateConnectionStatus('connecting');
}

// ============================================
// ========== АВТОЛОГИН =======================
// ============================================

window.addEventListener('DOMContentLoaded', async () => {
    const savedLang = localStorage.getItem('amini_lang') || 'en';
    setLanguage(savedLang);
    
    const savedToken = localStorage.getItem("token");
    const savedUserId = localStorage.getItem("userId");
    const savedUsername = localStorage.getItem("username");

    if (savedToken && savedUserId && savedUsername) {
        token = savedToken;
        userId = String(savedUserId);
        
        try {
            const res = await fetch("http://localhost:8080/users", { 
                headers: { "Authorization": "Bearer " + token } 
            });
            if (res.ok) {
                enterChat(savedUsername);
                
                const keyStatus = await initRSA(userId);
                const statusText = keyStatus === 'loaded' ? t('keys_loaded') : t('keys_generated');
                logMessage(null, statusText, "system");

                await loadUsersList();
                initWebSocket();
            } else {
                localStorage.removeItem("token");
                localStorage.removeItem("userId");
                localStorage.removeItem("username");
            }
        } catch (err) {
            console.log("Server unavailable on load");
            updateConnectionStatus('disconnected');
        }
    }
});