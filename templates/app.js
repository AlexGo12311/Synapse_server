document.addEventListener('submit', function(e) {
    e.preventDefault();
});

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

// ===== ОБНОВЛЕНИЕ СТАТУСА СООБЩЕНИЙ В UI =====
function updateMessageStatus(id, newStatus) {
    const statusEl = document.getElementById(`status-${id}`);
    if (statusEl) {
        statusEl.className = `msg-status status-${newStatus}`;
    }
}

// ===== ОБНОВЛЕНИЕ ОНЛАЙН СТАТУСА ПОЛЬЗОВАТЕЛЯ =====
function updatePresence(uid, status) {
    const presenceIndicator = document.getElementById(`presence-${String(uid)}`);
    if (presenceIndicator) {
        presenceIndicator.className = `presence-indicator ${status}`;
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
        token = data.token; 
        userId = String(data.id);
        
        localStorage.setItem("token", token);
        localStorage.setItem("userId", userId);
        localStorage.setItem("username", u);
        
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
    activeTargetId = String(targetId); 
    
    if (document.getElementById("activeChatTarget").innerText === targetName && getLogDiv().children.length > 0) return;
    
    document.getElementById("activeChatTarget").innerText = targetName;
    document.getElementById("messageInput").disabled = false;
    document.getElementById("sendBtn").disabled = false;
    
    document.querySelectorAll('.user-item').forEach(el => el.classList.remove('active'));
    const activeBtn = document.getElementById("user-btn-" + activeTargetId);
    if (activeBtn) {
        activeBtn.classList.add('active');
        const isOnline = document.getElementById(`presence-${activeTargetId}`)?.classList.contains('online');
        activeBtn.innerHTML = `<span class="presence-indicator ${isOnline ? 'online' : 'offline'}" id="presence-${activeTargetId}"></span> 👤 ${targetName}`;
    }

    getLogDiv().innerHTML = "";
    shownMessages.clear();

    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "get_pubkey", to: activeTargetId }));
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
            const uIdStr = String(u.id); 
            if (uIdStr === userId) return; 
            
            const btn = document.createElement("button");
            btn.className = "user-item";
            btn.id = "user-btn-" + uIdStr;
            btn.dataset.username = u.username; 
            
            btn.innerHTML = `<span class="presence-indicator offline" id="presence-${uIdStr}"></span> 👤 ${u.username}`;
            
            btn.onclick = () => selectUser(uIdStr, u.username);
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
            const msgIdStr = String(m.id);
            if (shownMessages.has(msgIdStr)) continue;
            shownMessages.add(msgIdStr);

            const text = await decryptMessage(m, userId);
            if (text) {
                let timeStr = formatTime(m.timestamp || m.created_at || null);
                let status = m.status || "sent"; 
                const fromIdStr = String(m.from);
                const isMe = fromIdStr === userId;

                logMessage(msgIdStr, text, isMe ? "me" : "other", timeStr, status);
                
                if (!isMe && status !== "read" && ws && ws.readyState === WebSocket.OPEN) {
                    ws.send(JSON.stringify({ type: "status_update", id: msgIdStr, to: fromIdStr, status: "read" }));
                }
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

        // --- Блок присутствия (Presence) ---
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

        // --- Блок статусов сообщений ---
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
                "spki", fromB64(d.pubKey), { name: "RSA-OAEP", hash: "SHA-256" }, true, ["encrypt"]
            );
            if (pendingMessages[d.from]) {
                const queue = [...pendingMessages[d.from]];
                delete pendingMessages[d.from];
                for (const text of queue) await sendQueuedMessage(text, d.from);
            }
        }

        if (d.type === "message") {
            const msgIdStr = String(d.id);
            if (shownMessages.has(msgIdStr)) return;
            shownMessages.add(msgIdStr);

            const text = await decryptMessage(d, userId);
            const fromIdStr = String(d.from);
            const isMe = fromIdStr === userId;
            
            if (fromIdStr === activeTargetId || (isMe && String(d.to) === activeTargetId)) {
                if (text) {
                    let timeStr = formatTime(d.timestamp || d.created_at || null);
                    logMessage(msgIdStr, text, isMe ? "me" : "other", timeStr);
                    
                    if (!isMe) {
                        ws.send(JSON.stringify({ type: "status_update", id: msgIdStr, to: fromIdStr, status: "read" }));
                    }
                }
            } else {
                const sideBtn = document.getElementById("user-btn-" + fromIdStr);
                if (sideBtn && !sideBtn.innerHTML.includes("✉️")) {
                    const isOnline = document.getElementById(`presence-${fromIdStr}`)?.classList.contains('online');
                    sideBtn.innerHTML = `<span class="presence-indicator ${isOnline ? 'online' : 'offline'}" id="presence-${fromIdStr}"></span> 👤 ${sideBtn.dataset.username} ✉️`;
                }
                if (!isMe) {
                    ws.send(JSON.stringify({ type: "status_update", id: msgIdStr, to: fromIdStr, status: "delivered" }));
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

    ws.send(JSON.stringify({ id: messageId, type: "message", to: String(target), ...encrypted }));
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
        ws.send(JSON.stringify({ type: "get_pubkey", to: String(target) }));
        messageInput.value = "";
        return;
    }

    const encrypted = await encryptDual(text, publicKeys[target]);
    const messageId = generateMessageId();
    shownMessages.add(messageId);

    ws.send(JSON.stringify({ id: messageId, type: "message", to: String(target), ...encrypted }));
    logMessage(messageId, text, "me", formatTime(), "sent"); 
    messageInput.value = "";
}

// ===== ВЫХОД =====
function logout() {
    if (ws) { ws.close(); ws = null; }
    token = null; userId = null; activeTargetId = null;
    for (let key in publicKeys) delete publicKeys[key];
    shownMessages.clear();

    localStorage.removeItem("token");
    localStorage.removeItem("userId");
    localStorage.removeItem("username");

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

// ===== АВТОЛОГИН ПРИ ОТКРЫТИИ / ОБНОВЛЕНИИ СТРАНИЦЫ =====
window.addEventListener('DOMContentLoaded', async () => {
    const savedToken = localStorage.getItem("token");
    const savedUserId = localStorage.getItem("userId");
    const savedUsername = localStorage.getItem("username");

    if (savedToken && savedUserId) {
        token = savedToken;
        userId = String(savedUserId);
        
        try {
            const res = await fetch("http://localhost:8080/users", { headers: { "Authorization": "Bearer " + token } });
            if (res.ok) {
                document.getElementById("authScreen").style.display = "none";
                document.getElementById("chatScreen").style.display = "flex";
                document.getElementById("myUsernameDisplay").innerText = savedUsername || "User";

                const keyStatus = await initRSA(userId);
                logMessage(null, `🔑 Keys ${keyStatus}`, "system");

                await loadUsersList();
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