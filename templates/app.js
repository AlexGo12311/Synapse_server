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

const shownMessages = new Set();
const publicKeys = {};
const pendingMessages = {};
const userCache = new Map();

// ✅ НОВОЕ: Очередь сообщений, ждущих отправки статуса "read"
// (когда ключ ещё не получен)
const pendingReadQueue = new Map(); // targetId -> [{id, from}, ...]

// ✅ НОВОЕ: Хранилище показанных кодов шифрования, чтобы не спамить
const shownKeyExchanges = new Set(); // "myKey-peerKey"

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
        key_exchange_click: "Click to verify code",
        need_peer_key: "Waiting for peer's key..."
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
        key_exchange_click: "Нажмите для проверки кода",
        need_peer_key: "Ожидание ключа собеседника..."
    }
};

let currentLang = 'en';

function t(key) {
    return (I18N[currentLang] && I18N[currentLang][key]) || I18N.en[key] || key;
}

function setLanguage(lang) {
    if (!I18N[lang]) return;
    currentLang = lang;
    
    try { localStorage.setItem('synapse_lang', lang); } catch (e) {}
    
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
    
    refreshAllPreviews();
}

function refreshAllPreviews() {
    userCache.forEach((data, uid) => {
        if (data.lastMessage) updateUserPreview(uid);
    });
}

// ============================================
// ============ СИСТЕМА ТЕМ ===================
// ============================================

const THEMES = [
    { name: "Ocean Blue", wallpaper: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)", accent: "#4A90E2", accentHover: "#357ABD", bubbleMe: "#D6EAF8", bubbleMeDark: "#2b5278" },
    { name: "Forest", wallpaper: "linear-gradient(135deg, #134E5E 0%, #71B280 100%)", accent: "#27AE60", accentHover: "#229954", bubbleMe: "#D5F5E3", bubbleMeDark: "#1e5a3f" },
    { name: "Sunset", wallpaper: "linear-gradient(135deg, #FF6B6B 0%, #FFA500 50%, #FFE66D 100%)", accent: "#E67E22", accentHover: "#D35400", bubbleMe: "#FDEBD0", bubbleMeDark: "#7d4a1f" },
    { name: "Night Sky", wallpaper: "linear-gradient(135deg, #0F2027 0%, #203A43 50%, #2C5364 100%)", accent: "#3498DB", accentHover: "#2980B9", bubbleMe: "#AED6F1", bubbleMeDark: "#2b5278" },
    { name: "Rose Gold", wallpaper: "linear-gradient(135deg, #E8B4B8 0%, #D4A5A5 50%, #C89696 100%)", accent: "#C0392B", accentHover: "#A93226", bubbleMe: "#FADBD8", bubbleMeDark: "#7d3a2f" },
    { name: "Mint", wallpaper: "linear-gradient(135deg, #A8E6CF 0%, #DCEDC1 50%, #FFD3B6 100%)", accent: "#16A085", accentHover: "#138D75", bubbleMe: "#D1F2EB", bubbleMeDark: "#1e5a4d" },
    { name: "Purple Haze", wallpaper: "linear-gradient(135deg, #8E2DE2 0%, #4A00E0 100%)", accent: "#8E44AD", accentHover: "#7D3C98", bubbleMe: "#E8DAEF", bubbleMeDark: "#5a2f7a" },
    { name: "Classic", wallpaper: "linear-gradient(135deg, #ECE9E6 0%, #FFFFFF 100%)", accent: "#007BFF", accentHover: "#0056B3", bubbleMe: "#D9FDD3", bubbleMeDark: "#2b5278" }
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
        // ✅ НОВОЕ: Системное сообщение об обмене ключами
        row.className = "system-row key-exchange";
        const sysBox = document.createElement("div");
        sysBox.className = "system-box";
        
        const mainText = document.createElement("span");
        mainText.textContent = text;
        sysBox.appendChild(mainText);
        
        if (username) { // username здесь содержит fingerprint
            const fingerprintSpan = document.createElement("span");
            fingerprintSpan.className = "key-exchange-fingerprint";
            fingerprintSpan.textContent = username;
            sysBox.appendChild(fingerprintSpan);
        }
        
        // Клик открывает модальное окно
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
    
    // Обновляем метку с именем собеседника
    const peerLabelBase = currentLang === 'ru' ? `Ключ ${activeTargetName}` : `${activeTargetName}'s Key`;
    peerNameLabel.textContent = peerLabelBase;
    
    // Получаем fingerprint'ы
    const myFP = await getMyFingerprint();
    const peerFP = await getPeerFingerprint(activeTargetId);
    
    myCodeEl.textContent = myFP.full;
    
    if (peerFP) {
        peerCodeEl.textContent = peerFP.full;
        // ✅ Общий код = XOR от обоих fingerprint'ов (уникален для пары)
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

/**
 * XOR двух hex-строк для создания уникального "общего кода"
 */
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

// ============================================
// ==== ПОКАЗ СООБЩЕНИЯ ОБ ОБМЕНЕ КЛЮЧАМИ ====
// ============================================

async function showKeyExchangeIfNeeded(targetId) {
    if (!targetId || !publicKeys[targetId]) return;
    
    // Создаём уникальный идентификатор пары ключей
    const myFP = await getMyFingerprint();
    const peerFP = await getPeerFingerprint(targetId);
    
    if (!peerFP) return;
    
    const pairId = `${myFP.raw.slice(0, 10)}-${peerFP.raw.slice(0, 10)}`;
    
    if (shownKeyExchanges.has(pairId)) return; // Уже показывали
    shownKeyExchanges.add(pairId);
    
    // Показываем системное сообщение
    logMessage(null, t('key_exchange'), "key_exchange", formatTime(), "sent", peerFP.short);
}

// ============================================
// ========== ПРИМЕНЕНИЕ ТЕМЫ ================
// ============================================

function applyTheme(themeIndex) {
    const theme = THEMES[themeIndex];
    if (!theme) return;
    
    const root = document.documentElement;
    const isDark = currentThemeMode === 'dark';
    
    root.style.setProperty('--accent-color', theme.accent);
    root.style.setProperty('--accent-color-hover', theme.accentHover);
    root.style.setProperty('--bubble-me', isDark ? theme.bubbleMeDark : theme.bubbleMe);
    root.style.setProperty('--chat-bg-image', theme.wallpaper);
    
    currentThemeIndex = themeIndex;
    
    try { localStorage.setItem('synapse_theme', themeIndex.toString()); } catch (e) {}
    
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
    
    try { localStorage.setItem('synapse_mode', mode); } catch (e) {}
    
    document.querySelectorAll('.mode-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.mode === mode);
    });
    
    const toggle = document.getElementById('themeToggle');
    if (toggle) toggle.textContent = mode === 'dark' ? '☀️' : '🌙';
    
    applyTheme(currentThemeIndex);
}

function toggleThemeMode() {
    setThemeMode(currentThemeMode === 'dark' ? 'light' : 'dark');
}

function loadSavedTheme() {
    try {
        const savedMode = localStorage.getItem('synapse_mode');
        if (savedMode === 'dark' || savedMode === 'light') currentThemeMode = savedMode;
    } catch (e) {}
    
    try {
        const saved = localStorage.getItem('synapse_theme');
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
    
    THEMES.forEach((theme, idx) => {
        const card = document.createElement('div');
        card.className = 'theme-card';
        card.style.background = theme.wallpaper;
        
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
        preview.appendChild(otherBubble);
        
        const meBubble = document.createElement('div');
        meBubble.className = 'theme-preview-bubble me';
        meBubble.style.background = theme.bubbleMe;
        meBubble.textContent = 'Hey!';
        preview.appendChild(meBubble);
        
        card.appendChild(preview);
        card.onclick = () => applyTheme(idx);
        grid.appendChild(card);
    });
}

// ============================================
// ========== ПАНЕЛЬ НАСТРОЕК ================
// ============================================

function openSettings() {
    document.getElementById('settingsPanel').classList.add('open');
    document.getElementById('settingsOverlay').classList.add('open');
}

function closeSettings() {
    document.getElementById('settingsPanel').classList.remove('open');
    document.getElementById('settingsOverlay').classList.remove('open');
}

function initSettingsPanel() {
    document.getElementById('settingsBtn')?.addEventListener('click', openSettings);
    document.getElementById('settingsClose')?.addEventListener('click', closeSettings);
    document.getElementById('settingsOverlay')?.addEventListener('click', closeSettings);
    document.getElementById('themeToggle')?.addEventListener('click', toggleThemeMode);
    
    // ✅ НОВОЕ: Обработчик кнопки кода шифрования
    document.getElementById('encryptionBtn')?.addEventListener('click', openEncryptionModal);
    
    // ✅ НОВОЕ: Закрытие модального окна по клику на оверлей
    document.getElementById('encryptionOverlay')?.addEventListener('click', (e) => {
        if (e.target.id === 'encryptionOverlay') closeEncryptionModal();
    });
    
    renderThemesGrid();
    loadSavedTheme();
}

// ============================================
// ========== ПРЕВЬЮ СООБЩЕНИЙ ===============
// ============================================

function updateUserPreview(uid) {
    const btn = document.getElementById("user-btn-" + uid);
    if (!btn) return;
    
    const data = userCache.get(uid);
    if (!data) return;
    
    const timeEl = btn.querySelector('.user-item-time');
    if (timeEl && data.lastTime) timeEl.textContent = formatTime(data.lastTime);
    
    const previewText = btn.querySelector('.user-item-preview-text');
    const prefixEl = btn.querySelector('.user-item-preview-prefix');
    
    if (previewText) {
        previewText.textContent = data.lastMessageText || t('encrypted');
    }
    
    if (prefixEl) {
        prefixEl.textContent = data.lastFromMe ? t('you') + ":" : "";
    }
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
            
            updateUserPreview(partnerId);
        }
    } catch (e) {
        console.log("Failed to load last messages:", e);
    }
}

// ============================================
// ======= ФУНКЦИЯ ОТПРАВКИ READ СТАТУСА ======
// ============================================

/**
 * ✅ ИСПРАВЛЕНО: Безопасная отправка статуса "read".
 * Если ключ ещё не получен - ставим в очередь.
 */
function markAsRead(msgId, fromId) {
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    
    // Проверяем, есть ли у нас ключ отправителя
    if (!publicKeys[fromId]) {
        // Ставим в очередь
        if (!pendingReadQueue.has(fromId)) {
            pendingReadQueue.set(fromId, []);
        }
        pendingReadQueue.get(fromId).push({ id: msgId, from: fromId });
        return;
    }
    
    // Отправляем сразу
    ws.send(JSON.stringify({
        type: "status_update",
        id: msgId,
        to: fromId,
        status: "read"
    }));
}

/**
 * ✅ ИСПРАВЛЕНО: При получении ключа - отправляем "read" для всех накопленных
 */
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
        await loadLastMessages();
        initWebSocket();
    } catch (err) { authErrorDiv.innerText = t('server_error'); }
}

function enterChat(username) {
    document.getElementById("authScreen").style.display = "none";
    document.getElementById("chatScreen").style.display = "flex";
    
    document.getElementById("myUsernameDisplay").innerText = username;
    
    const myAvatar = document.getElementById("myAvatar");
    if (myAvatar) updateAvatar(myAvatar, username);
    
    initSettingsPanel();
    
    const savedLang = localStorage.getItem('synapse_lang') || 'en';
    setLanguage(savedLang);
}

// ============================================
// ========== СПИСОК ПОЛЬЗОВАТЕЛЕЙ ===========
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
    
    // ✅ ПОКАЗЫВАЕМ кнопку кода шифрования
    document.getElementById('encryptionBtn').style.display = 'flex';
    
    document.querySelectorAll('.user-item').forEach(el => el.classList.remove('active'));
    const activeBtn = document.getElementById("user-btn-" + activeTargetId);
    if (activeBtn) {
        activeBtn.classList.add('active');
        
        const data = userCache.get(activeTargetId);
        if (data) data.unreadCount = 0;
        
        const unreadEl = activeBtn.querySelector('.user-item-unread');
        if (unreadEl) unreadEl.remove();
    }

    getLogDiv().innerHTML = "";
    shownMessages.clear();
    shownKeyExchanges.clear(); // Сбрасываем для нового чата

    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "get_pubkey", to: activeTargetId }));
    }
    loadHistory(activeTargetId);
}

async function loadUsersList() {
    try {
        const res = await fetch("http://localhost:8080/users", { 
            headers: { "Authorization": "Bearer " + token } 
        });
        const users = await res.json();
        const listContainer = document.getElementById("usersList");
        listContainer.innerHTML = "";
        if (!users || users.length === 0) return;

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
            
            const btn = document.createElement("button");
            btn.className = "user-item";
            btn.id = "user-btn-" + uIdStr;
            btn.dataset.username = u.username;
            btn.dataset.userid = uIdStr;
            
            const avatarWrapper = document.createElement("div");
            avatarWrapper.className = "avatar-wrapper";
            const avatar = createAvatarElement(u.username);
            avatarWrapper.appendChild(avatar);
            
            const presenceIndicator = document.createElement("span");
            presenceIndicator.className = "presence-indicator offline";
            presenceIndicator.id = `presence-${uIdStr}`;
            avatarWrapper.appendChild(presenceIndicator);
            
            const content = document.createElement("div");
            content.className = "user-item-content";
            
            const top = document.createElement("div");
            top.className = "user-item-top";
            
            const nameSpan = document.createElement("span");
            nameSpan.className = "user-item-name";
            nameSpan.textContent = u.username;
            top.appendChild(nameSpan);
            
            const timeSpan = document.createElement("span");
            timeSpan.className = "user-item-time";
            top.appendChild(timeSpan);
            
            content.appendChild(top);
            
            const preview = document.createElement("div");
            preview.className = "user-item-preview";
            
            const prefix = document.createElement("span");
            prefix.className = "user-item-preview-prefix";
            preview.appendChild(prefix);
            
            const previewText = document.createElement("span");
            previewText.className = "user-item-preview-text";
            preview.appendChild(previewText);
            
            content.appendChild(preview);
            
            btn.appendChild(avatarWrapper);
            btn.appendChild(content);
            
            btn.onclick = () => selectUser(uIdStr, u.username);
            listContainer.appendChild(btn);
        });
    } catch (err) { 
        logMessage(null, t('failed_load_users'), "error"); 
    }
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
                
                // ✅ ИСПРАВЛЕНО: используем markAsRead вместо прямой отправки
                if (!isMe && status !== "read") {
                    markAsRead(msgIdStr, fromIdStr);
                }
            } else if (!publicKeys[String(m.from)] && !publicKeys[String(m.to)]) {
                // Если не удалось дешифровать и ключа нет - ждём ключ
                const fromIdStr = String(m.from);
                if (fromIdStr !== userId) {
                    markAsRead(msgIdStr, fromIdStr);
                }
            }
        }
        
        // Показываем сообщение об обмене ключами, если ключ уже есть
        if (publicKeys[target]) {
            await showKeyExchangeIfNeeded(target);
        }
        
        // Обновляем превью
        if (messages.length > 0) {
            const lastMsg = messages[messages.length - 1];
            const decrypted = await decryptMessage(lastMsg, userId);
            const isMe = String(lastMsg.from) === userId;
            
            userCache.set(target, {
                ...userCache.get(target),
                lastMessage: lastMsg,
                lastMessageText: decrypted,
                lastTime: lastMsg.created_at,
                lastFromMe: isMe
            });
            
            updateUserPreview(target);
        }
    } catch { 
        logMessage(null, t('error_history'), "error"); 
    }
}

// ============================================
// ========== WEBSOCKET =======================
// ============================================

function initWebSocket() {
    ws = new WebSocket(`ws://localhost:8080/ws?token=${token}`);

    ws.onopen = () => { 
        ws.send(JSON.stringify({ type: "set_pubkey", pubKey: publicKeyBase64 })); 
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
            
            // ✅ НОВОЕ: Flush всех накопленных read-статусов
            flushPendingReads(d.from);
            
            // ✅ НОВОЕ: Показываем сообщение об обмене ключами для активного чата
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
            
            // Обновляем превью
            if (!isMe) {
                const partnerData = userCache.get(fromIdStr);
                if (partnerData) {
                    userCache.set(fromIdStr, {
                        ...partnerData,
                        lastMessage: d,
                        lastMessageText: text,
                        lastTime: d.created_at || Date.now() / 1000,
                        lastFromMe: false
                    });
                    updateUserPreview(fromIdStr);
                    
                    if (fromIdStr !== activeTargetId) {
                        partnerData.unreadCount = (partnerData.unreadCount || 0) + 1;
                        const sideBtn = document.getElementById("user-btn-" + fromIdStr);
                        if (sideBtn) {
                            let unreadBadge = sideBtn.querySelector('.user-item-unread');
                            if (!unreadBadge) {
                                unreadBadge = document.createElement("span");
                                unreadBadge.className = "user-item-unread";
                                sideBtn.querySelector('.user-item-top').appendChild(unreadBadge);
                            }
                            unreadBadge.textContent = partnerData.unreadCount;
                        }
                    }
                }
            } else {
                const toId = String(d.to);
                const partnerData = userCache.get(toId);
                if (partnerData) {
                    userCache.set(toId, {
                        ...partnerData,
                        lastMessage: d,
                        lastMessageText: text,
                        lastTime: d.created_at || Date.now() / 1000,
                        lastFromMe: true
                    });
                    updateUserPreview(toId);
                }
            }
            
            if (fromIdStr === activeTargetId || (isMe && String(d.to) === activeTargetId)) {
                if (text) {
                    let timeStr = formatTime(d.timestamp || d.created_at || null);
                    logMessage(msgIdStr, text, isMe ? "me" : "other", timeStr, "sent", fromUsername);
                    
                    // ✅ ИСПРАВЛЕНО: отправляем read через markAsRead
                    if (!isMe) {
                        markAsRead(msgIdStr, fromIdStr);
                    }
                } else if (!isMe) {
                    // Если не смогли дешифровать - всё равно пытаемся отметить как прочитанное
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
    if (ws) { ws.close(); ws = null; }
    token = null; 
    userId = null; 
    activeTargetId = null;
    activeTargetName = null;
    
    for (let key in publicKeys) delete publicKeys[key];
    shownMessages.clear();
    userCache.clear();
    shownKeyExchanges.clear();
    pendingReadQueue.clear();

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

    document.getElementById("chatScreen").style.display = "none";
    document.getElementById("authScreen").style.display = "block";
    document.getElementById('encryptionBtn').style.display = 'none';
}

// ============================================
// ========== АВТОЛОГИН =======================
// ============================================

window.addEventListener('DOMContentLoaded', async () => {
    const savedLang = localStorage.getItem('synapse_lang') || 'en';
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
                await loadLastMessages();
                initWebSocket();
            } else {
                localStorage.removeItem("token");
                localStorage.removeItem("userId");
                localStorage.removeItem("username");
            }
        } catch (err) {
            console.log("Server unavailable on load");
        }
    }
});