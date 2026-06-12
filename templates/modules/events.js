import { state } from './state.js';
import { t, setLanguage } from './i18n.js';
import { updateAvatar, getAuthErrorDiv } from './utils.js';
import { 
    updateConnectionStatus, 
    logMessage, 
    switchTab, 
    initUI,
    loadUsersList,
    updateChatAreaVisibility,
    cancelReply,
    closeChatSearch,
    filterChats,
    hidePeerTyping
} from './ui.js';
import { initWebSocket } from './websocket.js';

export async function register() {
    const u = document.getElementById("authUsername").value.trim();
    const p = document.getElementById("authPassword").value;
    const authErrorDiv = getAuthErrorDiv();
    authErrorDiv.innerText = "";
    if (!u || !p) { authErrorDiv.innerText = t('fill_fields'); return; }
    try {
        const res = await fetch("http://localhost:8080/register", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username: u, password: p }) });
        if (!res.ok) { authErrorDiv.innerText = await res.text(); return; }
        await login();
    } catch (err) { authErrorDiv.innerText = t('server_error'); }
}

export async function login() {
    const u = document.getElementById("authUsername").value.trim();
    const p = document.getElementById("authPassword").value;
    const authErrorDiv = getAuthErrorDiv();
    authErrorDiv.innerText = "";
    if (!u || !p) { authErrorDiv.innerText = t('fill_fields'); return; }
    try {
        const res = await fetch("http://localhost:8080/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username: u, password: p }) });
        if (!res.ok) { authErrorDiv.innerText = await res.text(); return; }
        const data = await res.json();
        state.token = data.token;
        state.userId = String(data.id);
        localStorage.setItem("token", state.token);
        localStorage.setItem("userId", state.userId);
        localStorage.setItem("username", u);
        enterChat(u);
        const keyStatus = await window.initRSA(state.userId);
        logMessage(null, keyStatus === 'loaded' ? t('keys_loaded') : t('keys_generated'), "system");
        await loadUsersList();
        initWebSocket();
    } catch (err) { authErrorDiv.innerText = t('server_error'); }
}

export function enterChat(username) {
    document.getElementById("authScreen").style.display = "none";
    document.getElementById("chatScreen").style.display = "flex";
    document.getElementById("myUsernameDisplay").innerText = username;
    const myAvatar = document.getElementById("myAvatar");
    if (myAvatar) updateAvatar(myAvatar, username);
    initUI();
    setLanguage(localStorage.getItem('amini_lang') || 'en');
    switchTab('chats');
    updateChatAreaVisibility();
}

export function logout() {
    if (state.wsReconnectTimer) { clearTimeout(state.wsReconnectTimer); state.wsReconnectTimer = null; }
    state.wsReconnectAttempts = 0;
    state.token = null;
    if (state.ws) { state.ws.close(); state.ws = null; }
    state.userId = null; state.activeTargetId = null; state.activeTargetName = null; state.currentTab = 'chats';
    for (let key in state.publicKeys) delete state.publicKeys[key];
    state.shownMessages.clear(); state.userCache.clear(); state.shownKeyExchanges.clear(); state.pendingReadQueue.clear();
    if (state.pendingMessages) Object.keys(state.pendingMessages).forEach(k => delete state.pendingMessages[k]);
    state.chatSearchMatches = []; state.chatSearchActiveIndex = -1; state.allUsersList = [];
    cancelReply(); hidePeerTyping(); state.messagesMap.clear();
    if (state.typingTimer) clearTimeout(state.typingTimer);
    if (state.peerTypingTimer) clearTimeout(state.peerTypingTimer);
    state.isTyping = false;
    localStorage.removeItem("token"); localStorage.removeItem("userId"); localStorage.removeItem("username");
    const logDiv = document.getElementById("log");
    if (logDiv) logDiv.innerHTML = "";
    document.getElementById("usersList").innerHTML = "";
    document.getElementById("activeChatTarget").innerText = t('select_user');
    const messageInput = document.getElementById("messageInput");
    messageInput.value = ""; messageInput.disabled = true;
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

export async function initApp() {
    setLanguage(localStorage.getItem('amini_lang') || 'en');
    const savedToken = localStorage.getItem("token");
    const savedUserId = localStorage.getItem("userId");
    const savedUsername = localStorage.getItem("username");
    if (savedToken && savedUserId && savedUsername) {
        state.token = savedToken;
        state.userId = String(savedUserId);
        try {
            const res = await fetch("http://localhost:8080/users", { headers: { "Authorization": "Bearer " + state.token } });
            if (res.ok) {
                enterChat(savedUsername);
                const keyStatus = await window.initRSA(state.userId);
                logMessage(null, keyStatus === 'loaded' ? t('keys_loaded') : t('keys_generated'), "system");
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
}