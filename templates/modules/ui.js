import { state, constants } from './state.js';
import { t } from './i18n.js';
import { formatTime, createAvatarElement, updateAvatar, xorHexStrings, getLogDiv } from './utils.js';
import { attachSwipeToMessage } from './swipe.js';
import { loadSavedTheme, renderThemesGrid } from './themes.js';

export function updateConnectionStatus(status, details = '') {
    const bar = document.getElementById('statusBar');
    if (!bar) return;
    const text = bar.querySelector('.status-text');
    bar.className = 'status-bar status-' + status;
    const messages = { connected: t('connected'), connecting: t('connecting'), reconnecting: t('reconnecting') + (details ? ` (${details})` : ''), disconnected: t('disconnected') };
    text.textContent = messages[status] || status;
}

export function switchTab(tabName) {
    state.currentTab = tabName;
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.toggle('active', btn.dataset.tab === tabName));
    document.querySelectorAll('.tab-pane').forEach(pane => pane.classList.toggle('active', pane.id === 'tab-' + tabName));
    const searchContainer = document.getElementById('searchContainer');
    if (searchContainer) searchContainer.classList.toggle('hidden', tabName !== 'chats');
    if (tabName === 'keys') updateMyFingerprintDisplay();
}

export async function updateMyFingerprintDisplay() {
    const el = document.getElementById('myFingerprint');
    if (!el) return;
    if (!window.publicKeyBase64) { el.textContent = 'Loading...'; return; }
    const fp = await window.getMyFingerprint();
    el.textContent = fp.full;
}

export async function copyMyFingerprint() {
    const fp = await window.getMyFingerprint();
    if (!fp || !fp.full || fp.full === '—') return;
    try {
        await navigator.clipboard.writeText(fp.full);
        const btn = document.querySelector('.keys-copy-btn');
        const originalText = btn.textContent;
        btn.textContent = t('copied');
        btn.classList.add('copied');
        setTimeout(() => { btn.textContent = originalText; btn.classList.remove('copied'); }, 1500);
    } catch (e) {}
}

export function initChatListSearch() {
    const input = document.getElementById('searchInput');
    const clearBtn = document.getElementById('searchClear');
    if (!input) return;
    input.addEventListener('input', (e) => {
        const query = e.target.value.trim();
        clearBtn.style.display = query ? 'block' : 'none';
        filterChats(query);
    });
    clearBtn.addEventListener('click', () => {
        input.value = ''; clearBtn.style.display = 'none';
        filterChats(''); input.focus();
    });
}

export function filterChats(query) {
    renderChatsList();
    const items = document.querySelectorAll('.user-item');
    const emptyState = document.getElementById('searchEmptyState');
    const noChatsState = document.getElementById('noChatsState');
    let visibleCount = 0;
    items.forEach(item => { if (item.style.display !== 'none') visibleCount++; });
    if (emptyState) {
        const hasChats = noChatsState && noChatsState.style.display === 'none';
        emptyState.style.display = (query && visibleCount === 0 && hasChats) ? 'flex' : 'none';
    }
}

export function openChatSearch() {
    const panel = document.getElementById('chatSearchPanel');
    const input = document.getElementById('chatSearchInput');
    if (!panel || !input) return;
    panel.style.display = 'flex';
    input.value = ''; input.focus();
    state.chatSearchMatches = []; state.chatSearchActiveIndex = -1;
    updateChatSearchCounter();
    if (!input.hasAttribute('data-listener-attached')) {
        input.addEventListener('input', onChatSearchInput);
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') { e.preventDefault(); if (e.shiftKey) chatSearchPrev(); else chatSearchNext(); }
            else if (e.key === 'Escape') closeChatSearch();
        });
        input.setAttribute('data-listener-attached', 'true');
    }
}

export function closeChatSearch() {
    const panel = document.getElementById('chatSearchPanel');
    const logDiv = getLogDiv();
    const input = document.getElementById('chatSearchInput');
    if (panel) panel.style.display = 'none';
    if (input) input.value = '';
    if (logDiv) logDiv.classList.remove('chat-searching');
    document.querySelectorAll('.message-row.search-hit, .message-row.search-hit-active').forEach(row => row.classList.remove('search-hit', 'search-hit-active'));
    state.chatSearchMatches = []; state.chatSearchActiveIndex = -1;
}

export function onChatSearchInput(e) {
    const query = e.target.value.trim();
    const logDiv = getLogDiv();
    if (!logDiv) return;
    document.querySelectorAll('.message-row.search-hit, .message-row.search-hit-active').forEach(row => row.classList.remove('search-hit', 'search-hit-active'));
    if (!query) { logDiv.classList.remove('chat-searching'); state.chatSearchMatches = []; state.chatSearchActiveIndex = -1; updateChatSearchCounter(); return; }
    logDiv.classList.add('chat-searching');
    state.chatSearchMatches = [];
    logDiv.querySelectorAll('.message-row.me, .message-row.other').forEach(row => {
        const text = row.querySelector('.bubble-text')?.textContent || '';
        if (text.toLowerCase().includes(query.toLowerCase())) { row.classList.add('search-hit'); state.chatSearchMatches.push(row); }
    });
    state.chatSearchActiveIndex = state.chatSearchMatches.length > 0 ? 0 : -1;
    updateChatSearchActive(); updateChatSearchCounter();
}

export function updateChatSearchActive() {
    document.querySelectorAll('.message-row.search-hit-active').forEach(row => row.classList.remove('search-hit-active'));
    if (state.chatSearchActiveIndex >= 0 && state.chatSearchMatches[state.chatSearchActiveIndex]) {
        const active = state.chatSearchMatches[state.chatSearchActiveIndex];
        active.classList.add('search-hit-active');
        active.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
}

export function updateChatSearchCounter() {
    const counter = document.getElementById('chatSearchCounter');
    if (!counter) return;
    counter.textContent = state.chatSearchMatches.length === 0 ? '0/0' : `${state.chatSearchActiveIndex + 1}/${state.chatSearchMatches.length}`;
}

export function chatSearchNext() {
    if (state.chatSearchMatches.length === 0) return;
    state.chatSearchActiveIndex = (state.chatSearchActiveIndex + 1) % state.chatSearchMatches.length;
    updateChatSearchActive(); updateChatSearchCounter();
}

export function chatSearchPrev() {
    if (state.chatSearchMatches.length === 0) return;
    state.chatSearchActiveIndex = (state.chatSearchActiveIndex - 1 + state.chatSearchMatches.length) % state.chatSearchMatches.length;
    updateChatSearchActive(); updateChatSearchCounter();
}

export function logMessage(id, text, type, timeStr = "", status = "sent", username = null, replyToId = null) {
    const logDiv = getLogDiv();
    if (!logDiv) return;
    const row = document.createElement("div");
    row.dataset.msgId = id;
    if (type === "me" || type === "other") {
        row.className = `message-row ${type}`;
        state.messagesMap.set(id, { id, text, from: type === "me" ? state.userId : state.activeTargetId, fromUsername: username || (type === "me" ? localStorage.getItem("username") : state.activeTargetName) });
        
        const bubble = document.createElement("div");
        bubble.className = "bubble";
        if (replyToId) { const quote = renderReplyQuote(replyToId); if (quote) bubble.appendChild(quote); }
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
        
        const swipeIcon = document.createElement("span");
        swipeIcon.className = "swipe-reply-icon";
        swipeIcon.innerHTML = "↩";
        bubble.appendChild(swipeIcon);
        
        const replyBtn = document.createElement("button");
        replyBtn.className = "reply-btn";
        replyBtn.innerHTML = "↩";
        replyBtn.onclick = (e) => { e.stopPropagation(); startReply(id); };
        
        row.appendChild(bubble);
        row.appendChild(replyBtn);
        
        attachSwipeToMessage(row);
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

export function updateMessageStatus(id, newStatus) {
    const statusEl = document.getElementById(`status-${id}`);
    if (statusEl) statusEl.className = `msg-status status-${newStatus}`;
}

export async function openEncryptionModal() {
    if (!state.activeTargetId || !state.activeTargetName) return;
    const overlay = document.getElementById('encryptionOverlay');
    const peerNameLabel = document.getElementById('peerNameLabel');
    peerNameLabel.textContent = state.currentLang === 'ru' ? `Ключ ${state.activeTargetName}` : `${state.activeTargetName}'s Key`;
    const myFP = await window.getMyFingerprint();
    const peerFP = await window.getPeerFingerprint(state.activeTargetId);
    document.getElementById('myCode').textContent = myFP.full;
    if (peerFP) {
        document.getElementById('peerCode').textContent = peerFP.full;
        const sharedRaw = xorHexStrings(myFP.raw, peerFP.raw);
        const groups = [];
        for (let i = 0; i < sharedRaw.length; i += 5) groups.push(sharedRaw.slice(i, i + 5));
        document.getElementById('sharedCode').textContent = groups.join(' ');
    } else {
        document.getElementById('peerCode').textContent = t('need_peer_key');
        document.getElementById('sharedCode').textContent = "—";
    }
    overlay.classList.add('open');
}

export function closeEncryptionModal() { document.getElementById('encryptionOverlay').classList.remove('open'); }

export async function copyEncryptionCode() {
    const sharedCode = document.getElementById('sharedCode').textContent;
    if (!sharedCode || sharedCode === "—") return;
    try {
        await navigator.clipboard.writeText(sharedCode);
        const btn = document.querySelector('.btn-copy');
        const originalText = btn.textContent;
        btn.textContent = t('copied');
        btn.classList.add('copied');
        setTimeout(() => { btn.textContent = originalText; btn.classList.remove('copied'); }, 1500);
    } catch (e) {}
}

export async function showKeyExchangeIfNeeded(targetId) {
    if (!targetId || !state.publicKeys[targetId]) return;
    const myFP = await window.getMyFingerprint();
    const peerFP = await window.getPeerFingerprint(targetId);
    if (!peerFP) return;
    const pairId = `${myFP.raw.slice(0, 10)}-${peerFP.raw.slice(0, 10)}`;
    if (state.shownKeyExchanges.has(pairId)) return;
    state.shownKeyExchanges.add(pairId);
    logMessage(null, t('key_exchange'), "key_exchange", formatTime(), "sent", peerFP.short);
}

export function renderChatsList() {
    const listContainer = document.getElementById("usersList");
    const noChatsState = document.getElementById("noChatsState");
    if (!listContainer) return;
    listContainer.innerHTML = "";
    const activeChats = [];
    state.userCache.forEach((data, uid) => { if (data.lastMessage !== null) activeChats.push({ uid, ...data }); });
    activeChats.sort((a, b) => (b.lastTime || 0) - (a.lastTime || 0));
    if (noChatsState) noChatsState.style.display = activeChats.length === 0 ? 'flex' : 'none';
    const searchInput = document.getElementById('searchInput');
    const searchQuery = searchInput ? searchInput.value.trim().toLowerCase() : '';
    activeChats.forEach(chat => {
        if (searchQuery && !chat.username.toLowerCase().includes(searchQuery)) return;
        const btn = document.createElement("button");
        btn.className = "user-item";
        btn.id = "user-btn-" + chat.uid;
        btn.dataset.username = chat.username;
        btn.dataset.userid = chat.uid;
        const avatarWrapper = document.createElement('div');
        avatarWrapper.className = 'avatar-wrapper';
        avatarWrapper.appendChild(createAvatarElement(chat.username));
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
        if (chat.uid === state.activeTargetId) btn.classList.add('active');
        btn.onclick = () => selectUser(chat.uid, chat.username);
        listContainer.appendChild(btn);
    });
}

export async function loadAllUsers() {
    try {
        const res = await fetch("http://localhost:8080/users", { headers: { "Authorization": "Bearer " + state.token } });
        const users = await res.json();
        if (!users || users.length === 0) return;
        state.allUsersList = users;
        users.forEach(u => {
            const uIdStr = String(u.id);
            if (uIdStr === state.userId) return;
            if (!state.userCache.has(uIdStr)) state.userCache.set(uIdStr, { username: u.username, lastMessage: null, lastMessageText: null, lastTime: null, lastFromMe: false, unreadCount: 0 });
            else state.userCache.get(uIdStr).username = u.username;
        });
    } catch (err) { console.log("Failed to load users:", err); }
}

export async function loadUsersList() { await loadAllUsers(); await loadLastMessages(); renderChatsList(); }

export function updateUserPreview(uid) {
    const data = state.userCache.get(uid);
    if (!data) return;
    renderChatsList();
}

export async function loadLastMessages() {
    try {
        const res = await fetch("http://localhost:8080/last-messages", { headers: { "Authorization": "Bearer " + state.token } });
        if (!res.ok) return;
        const messages = await res.json();
        if (!Array.isArray(messages)) return;
        for (const msg of messages) {
            const partnerId = String(msg.partner_id);
            const partner = state.userCache.get(partnerId);
            if (!partner) continue;
            const decrypted = await window.decryptMessage(msg, state.userId);
            state.userCache.set(partnerId, { ...partner, lastMessage: msg, lastMessageText: decrypted, lastTime: msg.created_at, lastFromMe: String(msg.from) === state.userId });
        }
        renderChatsList();
    } catch (e) { console.log("Failed to load last messages:", e); }
}

export function markAsRead(msgId, fromId) {
    if (!state.ws || state.ws.readyState !== WebSocket.OPEN) return;
    if (!state.publicKeys[fromId]) {
        if (!state.pendingReadQueue.has(fromId)) state.pendingReadQueue.set(fromId, []);
        state.pendingReadQueue.get(fromId).push({ id: msgId, from: fromId });
        return;
    }
    state.ws.send(JSON.stringify({ type: "status_update", id: msgId, to: fromId, status: "read" }));
}

export function flushPendingReads(fromId) {
    if (!state.pendingReadQueue.has(fromId)) return;
    const queue = state.pendingReadQueue.get(fromId);
    state.pendingReadQueue.delete(fromId);
    queue.forEach(({ id, from }) => {
        if (state.ws && state.ws.readyState === WebSocket.OPEN) state.ws.send(JSON.stringify({ type: "status_update", id, to: from, status: "read" }));
    });
}

export function initTypingIndicator() {
    const input = document.getElementById('messageInput');
    if (!input || input.hasAttribute('data-typing-attached')) return;
    input.addEventListener('input', onTypingInput);
    input.setAttribute('data-typing-attached', 'true');
}

export function onTypingInput() {
    if (!state.activeTargetId || !state.ws || state.ws.readyState !== WebSocket.OPEN) return;
    if (!state.isTyping) { state.isTyping = true; state.ws.send(JSON.stringify({ type: "typing", to: state.activeTargetId })); }
    if (state.typingTimer) clearTimeout(state.typingTimer);
    state.typingTimer = setTimeout(() => {
        state.isTyping = false;
        if (state.ws && state.ws.readyState === WebSocket.OPEN) state.ws.send(JSON.stringify({ type: "stop_typing", to: state.activeTargetId }));
    }, constants.TYPING_TIMEOUT);
}

export function showPeerTyping() {
    const indicator = document.getElementById('typingIndicator');
    const chatLabel = document.querySelector('.chat-header-label');
    const chatName = document.getElementById('activeChatTarget');
    if (indicator) indicator.style.display = 'flex';
    if (chatLabel) chatLabel.style.display = 'none';
    if (chatName) chatName.style.display = 'none';
    if (state.peerTypingTimer) clearTimeout(state.peerTypingTimer);
    state.peerTypingTimer = setTimeout(hidePeerTyping, constants.TYPING_TIMEOUT + 500);
}

export function hidePeerTyping() {
    const indicator = document.getElementById('typingIndicator');
    const chatLabel = document.querySelector('.chat-header-label');
    const chatName = document.getElementById('activeChatTarget');
    if (indicator) indicator.style.display = 'none';
    if (chatLabel) chatLabel.style.display = 'block';
    if (chatName) chatName.style.display = 'block';
    if (state.peerTypingTimer) { clearTimeout(state.peerTypingTimer); state.peerTypingTimer = null; }
}

export function startReply(msgId) {
    const msg = state.messagesMap.get(msgId);
    if (!msg) return;
    state.replyingTo = msg;
    const preview = document.getElementById('replyPreview');
    if (!preview) return;
    document.getElementById('replyPreviewName').textContent = msg.fromUsername;
    document.getElementById('replyPreviewText').textContent = msg.text || t('encrypted');
    preview.style.display = 'flex';
    const input = document.getElementById('messageInput');
    if (input) input.focus();
}

export function cancelReply() {
    state.replyingTo = null;
    const preview = document.getElementById('replyPreview');
    if (preview) preview.style.display = 'none';
}

export function renderReplyQuote(replyToId) {
    const msg = state.messagesMap.get(replyToId);
    if (!msg) return null;
    const quote = document.createElement('div');
    quote.className = 'reply-quote';
    quote.onclick = (e) => {
        e.stopPropagation();
        const original = document.querySelector(`[data-msg-id="${replyToId}"]`);
        if (original) {
            original.scrollIntoView({ behavior: 'smooth', block: 'center' });
            original.classList.add('highlight-pulse');
            setTimeout(() => original.classList.remove('highlight-pulse'), 1500);
        }
    };
    const name = document.createElement('div');
    name.className = 'reply-quote-name';
    name.textContent = msg.fromUsername;
    quote.appendChild(name);
    const text = document.createElement('div');
    text.className = 'reply-quote-text';
    text.textContent = msg.text || t('encrypted');
    quote.appendChild(text);
    return quote;
}

export function initUI() {
    initChatListSearch();
    document.getElementById('chatSearchBtn')?.addEventListener('click', openChatSearch);
    document.getElementById('encryptionBtn')?.addEventListener('click', openEncryptionModal);
    document.getElementById('encryptionOverlay')?.addEventListener('click', (e) => { if (e.target.id === 'encryptionOverlay') closeEncryptionModal(); });
    document.getElementById('newChatOverlay')?.addEventListener('click', (e) => { if (e.target.id === 'newChatOverlay') closeNewChatModal(); });
    const newChatSearchInput = document.getElementById('newChatSearchInput');
    if (newChatSearchInput) newChatSearchInput.addEventListener('input', (e) => renderNewChatList(e.target.value));
    renderThemesGrid();
    loadSavedTheme();
}

export function openNewChatModal() {
    const overlay = document.getElementById('newChatOverlay');
    if (!overlay) return;
    overlay.classList.add('open');
    setTimeout(() => {
        const input = document.getElementById('newChatSearchInput');
        if (input) { input.value = ''; input.focus(); }
    }, 100);
    renderNewChatList('');
}

export function closeNewChatModal() {
    const overlay = document.getElementById('newChatOverlay');
    if (overlay) overlay.classList.remove('open');
}

export function renderNewChatList(query) {
    const list = document.getElementById('newChatList');
    const emptyState = document.getElementById('newChatEmpty');
    if (!list) return;
    list.innerHTML = '';
    const q = (query || '').toLowerCase().trim();
    const filtered = state.allUsersList.filter(u => {
        if (String(u.id) === state.userId) return false;
        if (!q) return true;
        return u.username.toLowerCase().includes(q);
    });
    if (filtered.length === 0) { if (emptyState) emptyState.style.display = 'flex'; return; }
    if (emptyState) emptyState.style.display = 'none';
    filtered.sort((a, b) => {
        const aData = state.userCache.get(String(a.id));
        const bData = state.userCache.get(String(b.id));
        const aHasChat = aData && aData.lastMessage !== null;
        const bHasChat = bData && bData.lastMessage !== null;
        if (aHasChat && !bHasChat) return -1;
        if (!aHasChat && bHasChat) return 1;
        return a.username.localeCompare(b.username);
    });
    filtered.forEach(u => {
        const uIdStr = String(u.id);
        const data = state.userCache.get(uIdStr);
        const hasChat = data && data.lastMessage !== null;
        const item = document.createElement('button');
        item.className = 'new-chat-item';
        const avatarWrapper = document.createElement('div');
        avatarWrapper.className = 'avatar-wrapper';
        avatarWrapper.appendChild(createAvatarElement(u.username));
        const presence = document.createElement('span');
        presence.className = 'presence-indicator offline';
        const existingPresence = document.getElementById(`presence-${uIdStr}`);
        if (existingPresence && existingPresence.classList.contains('online')) presence.className = 'presence-indicator online';
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
        item.onclick = () => { startChatWith(uIdStr, u.username); closeNewChatModal(); };
        list.appendChild(item);
    });
}

export function startChatWith(targetId, targetName) {
    if (!state.userCache.has(targetId)) state.userCache.set(targetId, { username: targetName, lastMessage: null, lastMessageText: null, lastTime: null, lastFromMe: false, unreadCount: 0 });
    renderChatsList();
    selectUser(targetId, targetName);
    if (state.currentTab !== 'chats') switchTab('chats');
}

export function openThemeSettings() {
    switchTab('settings');
    setTimeout(() => {
        const themeSection = document.querySelector('#tab-settings .settings-section:nth-of-type(3)');
        if (themeSection) themeSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 100);
}

export function openLanguageSettings() {
    switchTab('settings');
    setTimeout(() => {
        const langSection = document.querySelector('#tab-settings .settings-section:nth-of-type(1)');
        if (langSection) langSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 100);
}

export function updateChatAreaVisibility() {
    const chatHeader = document.getElementById('chatHeader');
    const logDiv = document.getElementById('log');
    const inputArea = document.getElementById('inputArea');
    const welcomeScreen = document.getElementById('welcomeScreen');
    const chatSearchPanel = document.getElementById('chatSearchPanel');
    if (state.activeTargetId) {
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

export function selectUser(targetId, targetName) {
    state.activeTargetId = String(targetId);
    state.activeTargetName = targetName;
    const chatTarget = document.getElementById("activeChatTarget");
    if (chatTarget.innerText === targetName && getLogDiv().children.length > 0) return;
    chatTarget.innerText = targetName;
    document.getElementById("messageInput").disabled = false;
    document.getElementById("sendBtn").disabled = false;
    const chatHeaderAvatar = document.getElementById("chatHeaderAvatar");
    if (chatHeaderAvatar) updateAvatar(chatHeaderAvatar, targetName);
    const sourcePresence = document.getElementById(`presence-${state.activeTargetId}`);
    const chatHeaderPresence = document.getElementById("chatHeaderPresence");
    if (sourcePresence && chatHeaderPresence) chatHeaderPresence.className = `presence-indicator ${sourcePresence.classList.contains('online') ? 'online' : 'offline'}`;
    document.getElementById('encryptionBtn').style.display = 'flex';
    document.getElementById('chatSearchBtn').style.display = 'flex';
    const data = state.userCache.get(state.activeTargetId);
    if (data) data.unreadCount = 0;
    getLogDiv().innerHTML = "";
    state.shownMessages.clear();
    state.shownKeyExchanges.clear();
    state.messagesMap.clear();
    cancelReply();
    hidePeerTyping();
    initTypingIndicator();
    closeChatSearch();
    renderChatsList();
    updateChatAreaVisibility();
    if (state.ws && state.ws.readyState === WebSocket.OPEN) state.ws.send(JSON.stringify({ type: "get_pubkey", to: state.activeTargetId }));
    loadHistory(state.activeTargetId);
}

export async function loadHistory(target) {
    try {
        const res = await fetch(`http://localhost:8080/history?to=${target}`, { headers: { "Authorization": "Bearer " + state.token } });
        const messages = await res.json();
        if (!messages) return;
        for (let m of messages) {
            const msgIdStr = String(m.id);
            if (state.shownMessages.has(msgIdStr)) continue;
            state.shownMessages.add(msgIdStr);
            const text = await window.decryptMessage(m, state.userId);
            if (text) {
                const timeStr = formatTime(m.timestamp || m.created_at || null);
                const status = m.status || "sent";
                const fromIdStr = String(m.from);
                const isMe = fromIdStr === state.userId;
                const fromUsername = isMe ? localStorage.getItem("username") : (state.userCache.get(fromIdStr)?.username || "User");
                logMessage(msgIdStr, text, isMe ? "me" : "other", timeStr, status, fromUsername, m.reply_to || null);
                if (!isMe && status !== "read") markAsRead(msgIdStr, fromIdStr);
            } else if (!state.publicKeys[String(m.from)] && !state.publicKeys[String(m.to)]) {
                const fromIdStr = String(m.from);
                if (fromIdStr !== state.userId) markAsRead(msgIdStr, fromIdStr);
            }
        }
        if (state.publicKeys[target]) await showKeyExchangeIfNeeded(target);
        if (messages.length > 0) {
            const lastMsg = messages[messages.length - 1];
            const decrypted = await window.decryptMessage(lastMsg, state.userId);
            const isMe = String(lastMsg.from) === state.userId;
            const currentData = state.userCache.get(target) || { username: state.activeTargetName, lastMessage: null, lastMessageText: null, lastTime: null, lastFromMe: false, unreadCount: 0 };
            state.userCache.set(target, { ...currentData, lastMessage: lastMsg, lastMessageText: decrypted, lastTime: lastMsg.created_at, lastFromMe: isMe });
            renderChatsList();
        }
    } catch (e) {
        console.error("Load history error:", e);
        logMessage(null, t('error_history'), "error");
    }
}

export function updatePresence(uid, status) {
    const presenceIndicator = document.getElementById(`presence-${String(uid)}`);
    if (presenceIndicator) presenceIndicator.className = `presence-indicator ${status}`;
    if (String(uid) === state.activeTargetId) {
        const chatHeaderPresence = document.getElementById("chatHeaderPresence");
        if (chatHeaderPresence) chatHeaderPresence.className = `presence-indicator ${status}`;
    }
}