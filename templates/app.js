let token = null;
let userId = null;
let ws = null;
let activeTargetId = null;

const shownMessages = new Set();
const publicKeys = {};
const pendingMessages = {};

const getLogDiv = () => document.getElementById("log");
const getAuthErrorDiv = () => document.getElementById("authError");

function formatTime(timeInput) {
    let d = timeInput ? new Date(timeInput) : new Date();
    if (isNaN(d.getTime())) d = new Date(); 
    let hours = String(d.getHours()).padStart(2, '0');
    let minutes = String(d.getMinutes()).padStart(2, '0');
    return `${hours}:${minutes}`;
}

// ===== УМНЫЙ ЛОГЕР С ГАЛОЧКАМИ =====
function logMessage(id, text, type, timeStr = "", status = "sent") {
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

// ===== ОБНОВЛЕНИЕ СТАТУСА В UI =====
function updateMessageStatus(id, newStatus) {
    const statusEl = document.getElementById(`status-${id}`);
    if (statusEl) {
        statusEl.className = `msg-status status-${newStatus}`;
    }
}

// ===== РЕГИСТРАЦИЯ =====
async function register() {
    const u = document.getElementById("authUsername").value;
    const p = document.getElementById("authPassword").value;
    const authErrorDiv = getAuthErrorDiv();
    authErrorDiv.innerText = "";
    if (!u || !p) { authErrorDiv.innerText = "Fill all fields"; return; }

    try {
        const res = await fetch("http://localhost:8080/register", {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ username: u, password: p })
        });
        if (!res.ok) { authErrorDiv.innerText = await res.text(); return; }
        await login();
    } catch (err) { authErrorDiv.innerText = "Server connection error"; }
}

// ===== ВХОД =====
async function login() {
    const u = document.getElementById("authUsername").value;
    const p = document.getElementById("authPassword").value;
    const authErrorDiv = getAuthErrorDiv();
    authErrorDiv.innerText = "";
    if (!u || !p) { authErrorDiv.innerText = "Fill all fields"; return; }

    try {
        const res = await fetch("http://localhost:8080/login", {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ username: u, password: p })
        });
        if (!res.ok) { authErrorDiv.innerText = await res.text(); return; }

        const data = await res.json();
        token = data.token; userId = data.id;
        
        document.getElementById("authScreen").style.display = "none";
        document.getElementById("chatScreen").style.display = "flex";
        document.getElementById("myUsernameDisplay").innerText = u;

        const keyStatus = await initRSA(userId);
        logMessage(null, `🔑 Keys ${keyStatus}`, "system");

        await loadUsersList();
        initWebSocket();
    } catch (err) { authErrorDiv.innerText = "Server connection error"; }
}

// ===== ВЫБОР ПОЛЬЗОВАТЕЛЯ =====
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
        // Уведомляем собеседника, что мы открыли чат и прочитали все сообщения
        ws.send(JSON.stringify({ type: "status_update", to: activeTargetId, status: "read_all" }));
    }
    loadHistory(activeTargetId);
}

// ===== ЗАГРУЗКА ПОЛЬЗОВАТЕЛЕЙ =====
async function loadUsersList() {
    try {
        const res = await fetch("http://localhost:8080/users", { headers: { "Authorization": "Bearer " + token } });
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
    } catch (err) { logMessage(null, "❌ Failed to load users list", "error"); }
}

// ===== HISTORY =====
async function loadHistory(target) {
    try {
        const res = await fetch(`http://localhost:8080/history?to=${target}`, { headers: { "Authorization": "Bearer " + token } });
        const messages = await res.json();
        if (!messages) return;

        for (let m of messages) {
            if (shownMessages.has(m.id)) continue;
            shownMessages.add(m.id);

            const text = await decryptMessage(m, userId);
            if (text) {
                let timeStr = formatTime(m.timestamp || m.created_at || null);
                // ИСПРАВЛЕНИЕ: По умолчанию ставим sent, а не read
                let status = m.status || "sent"; 
                logMessage(m.id, text, m.from === userId ? "me" : "other", timeStr, status);
            }
        }
    } catch { logMessage(null, "❌ Error loading history", "error"); }
}

// ===== WEBSOCKET =====
function initWebSocket() {
    ws = new WebSocket(`ws://localhost:8080/ws?token=${token}`);

    ws.onopen = () => { ws.send(JSON.stringify({ type: "set_pubkey", pubKey: publicKeyBase64 })); };

    ws.onmessage = async (e) => {
        const d = JSON.parse(e.data);

        if (d.type === "message_saved") {
            updateMessageStatus(d.id, "sent");
            return;
        }

        if (d.type === "status_update") {
            // Массовое обновление галочек, если собеседник только что открыл чат
            if (d.status === "read_all") {
                document.querySelectorAll('.msg-status:not(.status-read)').forEach(el => {
                    el.className = 'msg-status status-read';
                });
                return;
            }
            updateMessageStatus(d.id, d.status);
            return;
        }

        if (d.type === "pubkey") {
            publicKeys[d.from] = await crypto.subtle.importKey(
                "spki", fromB64(d.pubKey), { name: "RSA-OAEP", hash: "SHA-256" }, true, ["encrypt"]
            );
            if (pendingMessages[d.from]) {
                const queue = [...pendingMessages[d.from]];
                delete pendingMessages[d.from];
                for (const text of queue) await sendQueuedMessage(text, d.from);
            }
        }

        if (d.type === "message") {
            if (shownMessages.has(d.id)) return;
            shownMessages.add(d.id);

            const text = await decryptMessage(d, userId);
            
            if (d.from === activeTargetId || (d.from === userId && d.to === activeTargetId)) {
                if (text) {
                    let timeStr = formatTime(d.timestamp || d.created_at || null);
                    logMessage(d.id, text, d.from === userId ? "me" : "other", timeStr);
                    
                    if (d.from !== userId) {
                        ws.send(JSON.stringify({ type: "status_update", id: d.id, to: d.from, status: "read" }));
                    }
                }
            } else {
                const sideBtn = document.getElementById("user-btn-" + d.from);
                if (sideBtn && !sideBtn.innerText.includes("✉️")) {
                    sideBtn.innerText = "👤 " + sideBtn.dataset.username + " ✉️";
                }
                if (d.from !== userId) {
                    ws.send(JSON.stringify({ type: "status_update", id: d.id, to: d.from, status: "delivered" }));
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

    ws.send(JSON.stringify({ id: messageId, type: "message", to: target, ...encrypted }));
    logMessage(messageId, text, "me", formatTime(), "sent");
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

    ws.send(JSON.stringify({ id: messageId, type: "message", to: target, ...encrypted }));
    logMessage(messageId, text, "me", formatTime(), "sent"); 
    messageInput.value = "";
}

// ===== ВЫХОД =====
function logout() {
    if (ws) { ws.close(); ws = null; }
    token = null; userId = null; activeTargetId = null;
    for (let key in publicKeys) delete publicKeys[key];
    shownMessages.clear();

    getLogDiv().innerHTML = "";
    document.getElementById("usersList").innerHTML = "";
    document.getElementById("activeChatTarget").innerText = "Select a user";
    
    const messageInput = document.getElementById("messageInput");
    messageInput.value = ""; messageInput.disabled = true;
    document.getElementById("sendBtn").disabled = true;
    document.getElementById("authPassword").value = ""; 
    getAuthErrorDiv().innerText = "";

    document.getElementById("chatScreen").style.display = "none";
    document.getElementById("authScreen").style.display = "block";
}