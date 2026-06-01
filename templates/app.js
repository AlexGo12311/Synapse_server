let token = null;
let userId = null;
let ws = null;
let activeTargetId = null;

const shownMessages = new Set();
const publicKeys = {};
const pendingMessages = {};

const getLogDiv = () => document.getElementById("log");
const getAuthErrorDiv = () => document.getElementById("authError");

// ===== УМНЫЙ ЛОГЕР ДЛЯ БАБЛОВ И СИСТЕМНЫХ ТЕКСТОВ =====
function logMessage(text, type) {
    const logDiv = getLogDiv();
    if (!logDiv) return;

    const row = document.createElement("div");

    if (type === "me" || type === "other") {
        // Контейнер строки (выравнивание лево/право)
        row.className = `message-row ${type}`;
        
        // Сам пузырь сообщения
        const bubble = document.createElement("div");
        bubble.className = "bubble";
        bubble.innerText = text;
        
        row.appendChild(bubble);
    } else {
        // Системные уведомления (серые плашки по центру)
        row.className = `system-row ${type === 'error' ? 'error' : ''}`;
        
        const sysBox = document.createElement("div");
        sysBox.className = "system-box";
        sysBox.innerText = text;
        
        row.appendChild(sysBox);
    }

    logDiv.appendChild(row);
    logDiv.scrollTop = logDiv.scrollHeight;
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
        
        document.getElementById("authScreen").style.display = "none";
        document.getElementById("chatScreen").style.display = "flex";
        document.getElementById("myUsernameDisplay").innerText = u;

        const keyStatus = await initRSA(userId);
        logMessage(`🔑 Keys ${keyStatus}`, "system");

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
        logMessage("❌ Failed to load users list", "error");
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
                // История рендерится как обычные красивые баблы
                logMessage(text, m.from === userId ? "me" : "other");
            }
        }
    } catch {
        logMessage("❌ Error loading history", "error");
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
                    logMessage(text, d.from === userId ? "me" : "other");
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
    
    if(target === activeTargetId) logMessage(text, "me");
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

    logMessage(text, "me");
    messageInput.value = "";
}

// ===== ВЫХОД =====
function logout() {
    if (ws) {
        ws.close();
        ws = null;
    }

    token = null;
    userId = null;
    activeTargetId = null;
    
    for (let key in publicKeys) delete publicKeys[key];
    shownMessages.clear();

    getLogDiv().innerHTML = "";
    document.getElementById("usersList").innerHTML = "";
    document.getElementById("activeChatTarget").innerText = "Select a user";
    
    const messageInput = document.getElementById("messageInput");
    messageInput.value = "";
    messageInput.disabled = true;
    document.getElementById("sendBtn").disabled = true;
    document.getElementById("authPassword").value = ""; 
    getAuthErrorDiv().innerText = "";

    document.getElementById("chatScreen").style.display = "none";
    document.getElementById("authScreen").style.display = "block";
}