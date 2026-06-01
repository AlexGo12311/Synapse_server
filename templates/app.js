let token = null;
let userId = null;
let ws = null;
let activeTargetId = null;

const shownMessages = new Set();
const publicKeys = {};
const pendingMessages = {};

// Используем геттеры, чтобы гарантированно получать элементы после загрузки DOM
const getLogDiv = () => document.getElementById("log");
const getAuthErrorDiv = () => document.getElementById("authError");

function log(t, c="") {
    const el = document.createElement("div");
    el.className = c;
    el.innerHTML = t;
    const logDiv = getLogDiv();
    if(logDiv) {
        logDiv.appendChild(el);
        logDiv.scrollTop = logDiv.scrollHeight;
    }
}

// ===== РЕГИСТРАЦИЯ =====
async function register() {
    const u = document.getElementById("authUsername").value;
    const p = document.getElementById("authPassword").value;
    const authErrorDiv = getAuthErrorDiv();
    authErrorDiv.innerText = "";

    if (!u || !p) {
        authErrorDiv.innerText = "Fill all fields";
        return;
    }

    try {
        const res = await fetch("http://localhost:8080/register", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ username: u, password: p })
        });

        if (!res.ok) {
            const text = await res.text();
            authErrorDiv.innerText = text;
            return;
        }

        // Если регистрация успешна, сразу логинимся
        await login();
    } catch (err) {
        authErrorDiv.innerText = "Server connection error";
    }
}

// ===== ВХОД =====
async function login() {
    const u = document.getElementById("authUsername").value;
    const p = document.getElementById("authPassword").value;
    const authErrorDiv = getAuthErrorDiv();
    authErrorDiv.innerText = "";

    if (!u || !p) {
        authErrorDiv.innerText = "Fill all fields";
        return;
    }

    try {
        const res = await fetch("http://localhost:8080/login", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ username: u, password: p })
        });

        if (!res.ok) {
            const text = await res.text();
            authErrorDiv.innerText = text;
            return;
        }

        const data = await res.json();
        token = data.token;
        userId = data.id;
        
        // Переключение экранов
        document.getElementById("authScreen").style.display = "none";
        document.getElementById("chatScreen").style.display = "flex";
        document.getElementById("myUsernameDisplay").innerText = u;

        const keyStatus = await initRSA(userId);
        log(`🔑 Keys ${keyStatus}`, "msg-history");

        await loadUsersList();
        initWebSocket();
    } catch (err) {
        authErrorDiv.innerText = "Server connection error";
    }
}

// ===== ВЫБОР ПОЛЬЗОВАТЕЛЯ ИЗ СПИСКА =====
function selectUser(targetId, targetName) {
    if (targetId === activeTargetId) return;
    
    activeTargetId = targetId;
    document.getElementById("activeChatTarget").innerText = targetName;
    
    // Разблокируем поле ввода
    document.getElementById("messageInput").disabled = false;
    document.getElementById("sendBtn").disabled = false;
    
    document.querySelectorAll('.user-item').forEach(el => el.classList.remove('active'));
    const activeBtn = document.getElementById("user-btn-" + targetId);
    if (activeBtn) {
        activeBtn.classList.add('active');
        activeBtn.innerText = "👤 " + targetName;
    }

    getLogDiv().innerHTML = "";
    shownMessages.clear();

    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "get_pubkey", to: activeTargetId }));
    }
    loadHistory(activeTargetId);
}

// ===== ЗАГРУЗКА СПИСКА ПОЛЬЗОВАТЕЛЕЙ =====
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
            if (u.id === userId) return; 
            
            const btn = document.createElement("button");
            btn.className = "user-item";
            btn.id = "user-btn-" + u.id;
            btn.innerText = "👤 " + u.username;
            btn.dataset.username = u.username; 
            btn.onclick = () => selectUser(u.id, u.username);
            listContainer.appendChild(btn);
        });
    } catch (err) {
        log("❌ Failed to load users list", "msg-error");
    }
}

// ===== HISTORY =====
async function loadHistory(target) {
    try {
        const res = await fetch(`http://localhost:8080/history?to=${target}`, {
            headers: { "Authorization": "Bearer " + token }
        });
        const messages = await res.json();

        if (!messages) return;

        for (let m of messages) {
            if (shownMessages.has(m.id)) continue;
            shownMessages.add(m.id);

            const text = await decryptMessage(m, userId);
            if (text) {
                log(`<b>${m.from === userId ? 'Me' : m.from}:</b> ${text}`, "msg-history");
            }
        }
    } catch {
        log("❌ Error loading history", "msg-error");
    }
}

// ===== ИНИЦИАЛИЗАЦИЯ WEBSOCKET =====
function initWebSocket() {
    ws = new WebSocket(`ws://localhost:8080/ws?token=${token}`);

    ws.onopen = () => {
        ws.send(JSON.stringify({
            type: "set_pubkey",
            pubKey: publicKeyBase64
        }));
    };

    ws.onmessage = async (e) => {
        const d = JSON.parse(e.data);

        if (d.type === "message_saved") return;

        if (d.type === "pubkey") {
            publicKeys[d.from] = await crypto.subtle.importKey(
                "spki",
                fromB64(d.pubKey),
                { name: "RSA-OAEP", hash: "SHA-256" },
                true,
                ["encrypt"]
            );

            if (pendingMessages[d.from]) {
                const queue = [...pendingMessages[d.from]];
                delete pendingMessages[d.from];
                for (const text of queue) {
                    await sendQueuedMessage(text, d.from);
                }
            }
        }

        if (d.type === "message") {
            if (shownMessages.has(d.id)) return;
            shownMessages.add(d.id);

            const text = await decryptMessage(d, userId);
            
            if (d.from === activeTargetId || (d.from === userId && d.to === activeTargetId)) {
                if (text) {
                    log(`<b>${d.from === userId ? 'Me' : d.from}:</b> ${text}`, d.from === userId ? "msg-me" : "msg-other");
                }
            } else {
                const sideBtn = document.getElementById("user-btn-" + d.from);
                if (sideBtn && !sideBtn.innerText.includes("✉️")) {
                    sideBtn.innerText = "👤 " + sideBtn.dataset.username + " ✉️";
                }
            }
        }
    };
}

// ===== SEND QUEUED =====
async function sendQueuedMessage(text, target) {
    const encrypted = await encryptDual(text, publicKeys[target]);
    const messageId = generateMessageId();
    shownMessages.add(messageId);

    ws.send(JSON.stringify({
        id: messageId,
        type: "message",
        to: target,
        ...encrypted
    }));
    
    if(target === activeTargetId) log(`<b>Me:</b> ${text}`, "msg-me");
}

// ===== SEND =====
async function send() {
    const messageInput = document.getElementById("messageInput");
    const text = messageInput.value;
    const target = activeTargetId;

    if (!text || !target) return;

    if (!publicKeys[target]) {
        if (!pendingMessages[target]) pendingMessages[target] = [];
        pendingMessages[target].push(text);
        ws.send(JSON.stringify({ type: "get_pubkey", to: target }));
        messageInput.value = "";
        return;
    }

    const encrypted = await encryptDual(text, publicKeys[target]);
    const messageId = generateMessageId();
    shownMessages.add(messageId);

    ws.send(JSON.stringify({
        id: messageId,
        type: "message",
        to: target,
        ...encrypted
    }));

    log(`<b>Me:</b> ${text}`, "msg-me");
    messageInput.value = "";
}

// ===== ВЫХОД =====
function logout() {
    // 1. Закрываем WebSocket соединение
    if (ws) {
        ws.close();
        ws = null;
    }

    // 2. Очищаем глобальные переменные
    token = null;
    userId = null;
    activeTargetId = null;
    
    for (let key in publicKeys) delete publicKeys[key];
    shownMessages.clear();

    // 3. Очищаем интерфейс
    getLogDiv().innerHTML = "";
    document.getElementById("usersList").innerHTML = "";
    document.getElementById("activeChatTarget").innerText = "Select a user";
    document.getElementById("messageInput").value = "";
    document.getElementById("messageInput").disabled = true;
    document.getElementById("sendBtn").disabled = true;
    document.getElementById("authPassword").value = ""; // Стираем введенный пароль
    getAuthErrorDiv().innerText = "";

    // 4. Переключаем экраны обратно
    document.getElementById("chatScreen").style.display = "none";
    document.getElementById("authScreen").style.display = "block";
    
    log("Осуществлен выход из аккаунта", "msg-history");
}