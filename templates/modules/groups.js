import { state, constants } from './state.js';
import { t } from './i18n.js';
import { createAvatarElement, formatTime, getLogDiv } from './utils.js';
import { attachSwipeToMessage } from './swipe.js';

// Флаг: идёт ли сейчас загрузка истории группы
let _isLoadingHistory = false;

// 🆕 Debounce таймер для обновления last_seen_at
let _seenDebounceTimer = null;

// 🆕 Debounced обновление last_seen_at на сервере
// Вызывается когда получаем сообщение в открытой группе
function debouncedMarkSeen(groupId) {
    if (_seenDebounceTimer) clearTimeout(_seenDebounceTimer);
    _seenDebounceTimer = setTimeout(() => {
        fetch('http://localhost:8080/groups/seen', {
            method: 'POST',
            headers: {
                "Authorization": "Bearer " + state.token,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ group_id: groupId })
        }).catch(e => console.error("Debounced mark seen error:", e));
    }, 1500); // 1.5 секунды debounce
}

// ============================================
// ===== ЗАГРУЗКА ГРУПП =====
// ============================================

export async function loadGroups() {
    try {
        const res = await fetch("http://localhost:8080/groups", {
            headers: { "Authorization": "Bearer " + state.token }
        });
        if (!res.ok) return;
        const groups = await res.json();
        state.groups = Array.isArray(groups) ? groups : [];
        
        state.groups.forEach(group => {
            if (group.unread_count === undefined) group.unread_count = 0;
        });
        
        if (window.renderChatsList) {
            window.renderChatsList();
        }
    } catch (e) {
        console.error("Failed to load groups:", e);
    }
}

// ============================================
// ===== СИНХРОНИЗАЦИЯ СЧЁТЧИКОВ С СЕРВЕРОМ =====
// ============================================

export async function syncGroupCounters() {
    try {
        const res = await fetch("http://localhost:8080/groups", {
            headers: { "Authorization": "Bearer " + state.token }
        });
        if (!res.ok) return;
        const groups = await res.json();
        if (!Array.isArray(groups)) return;
        
        let needsRender = false;
        
        groups.forEach(serverGroup => {
            const localGroup = state.groups.find(g => g.id === serverGroup.id);
            if (!localGroup) return;
            
            if (state.activeGroupId === serverGroup.id) {
                return;
            }
            
            const serverCount = serverGroup.unread_count || 0;
            const localCount = localGroup.unread_count || 0;
            if (serverCount > localCount) {
                localGroup.unread_count = serverCount;
                needsRender = true;
            }
            
            if (serverGroup.last_message_text) {
                localGroup.last_message_text = serverGroup.last_message_text;
                localGroup.last_message_sender = serverGroup.last_message_sender;
                localGroup.last_message_time = serverGroup.last_message_time;
                needsRender = true;
            }
            
            if (serverGroup.members && serverGroup.members.length > 0) {
                localGroup.members = serverGroup.members;
            }
        });
        
        if (needsRender && window.renderChatsList) {
            window.renderChatsList();
        }
    } catch (e) {
        console.error("Sync groups error:", e);
    }
}

// ============================================
// ===== РЕНДЕР ГРУППЫ В СПИСКЕ =====
// ============================================

export function renderGroupItem(group) {
    const btn = document.createElement("button");
    btn.className = "group-item";
    btn.id = "group-btn-" + group.id;
    if (group.id === state.activeGroupId) btn.classList.add('active');
    
    const avatar = document.createElement("div");
    avatar.className = "group-avatar";
    avatar.textContent = "👥";
    
    const content = document.createElement("div");
    content.className = "group-item-content";
    
    const top = document.createElement("div");
    top.className = "group-item-top";
    
    const nameSpan = document.createElement("span");
    nameSpan.className = "group-item-name";
    nameSpan.textContent = group.name;
    top.appendChild(nameSpan);
    
    const lastTime = group.last_message_time || group.created_at;
    if (lastTime) {
        const timeSpan = document.createElement("span");
        timeSpan.className = "user-item-time";
        timeSpan.textContent = formatTime(lastTime);
        top.appendChild(timeSpan);
    }
    
    if (group.unread_count && group.unread_count > 0) {
        const unreadBadge = document.createElement("span");
        unreadBadge.className = "user-item-unread";
        unreadBadge.textContent = group.unread_count;
        top.appendChild(unreadBadge);
    }
    
    content.appendChild(top);
    
    const membersSpan = document.createElement("span");
    membersSpan.className = "group-item-members";
    if (group.last_message_text) {
        const prefix = group.last_message_sender === state.userId ? t('you') + ": " : "";
        membersSpan.textContent = prefix + group.last_message_text;
    } else {
        const memberCount = group.members ? group.members.length : 0;
        const memberNames = group.members 
            ? group.members.slice(0, 3).map(m => m.username).join(', ')
            : '';
        membersSpan.textContent = memberNames 
            ? `👥 ${memberNames}${memberCount > 3 ? ` +${memberCount - 3}` : ''}`
            : `👥 ${memberCount} ${memberCount === 1 ? 'member' : 'members'}`;
    }
    content.appendChild(membersSpan);
    
    btn.appendChild(avatar);
    btn.appendChild(content);
    
    btn.onclick = () => openGroupChat(group);
    return btn;
}

// ============================================
// ===== ОТКРЫТИЕ ГРУППОВОГО ЧАТА =====
// ============================================

export async function openGroupChat(group) {
    if (state.activeGroupId === group.id) {
        const logDiv = getLogDiv();
        if (logDiv && logDiv.children.length > 0) {
            return;
        }
    }
    
    const profileView = document.getElementById('profileView');
    if (profileView && profileView.style.display === 'flex') {
        profileView.style.display = 'none';
    }
    
    state.activeTargetId = null;
    state.activeTargetName = null;
    document.querySelectorAll('.user-item').forEach(el => el.classList.remove('active'));
    
    state.activeGroupId = group.id;
    state.activeGroupName = group.name;
    
    document.querySelectorAll('.group-item').forEach(el => el.classList.remove('active'));
    const btn = document.getElementById('group-btn-' + group.id);
    if (btn) btn.classList.add('active');
    
    if (group.unread_count > 0) {
        group.unread_count = 0;
        if (window.renderChatsList) window.renderChatsList();
    }
    
    // Помечаем как просмотренную (для всех старых сообщений)
    fetch('http://localhost:8080/groups/seen', {
        method: 'POST',
        headers: {
            "Authorization": "Bearer " + state.token,
            "Content-Type": "application/json"
        },
        body: JSON.stringify({ group_id: group.id })
    }).catch(e => console.error("Mark seen error:", e));
    
    const chatTarget = document.getElementById("activeChatTarget");
    if (chatTarget) {
        chatTarget.innerText = group.name;
        chatTarget.onclick = null;
    }
    
    const chatLabel = document.querySelector('.chat-header-label');
    if (chatLabel) chatLabel.innerText = t('group_chat');
    
    const chatHeaderAvatar = document.getElementById("chatHeaderAvatar");
    if (chatHeaderAvatar) {
        chatHeaderAvatar.style.background = '';
        chatHeaderAvatar.style.backgroundColor = '';
        chatHeaderAvatar.style.background = 'linear-gradient(135deg, var(--accent-color), var(--accent-color-hover))';
        chatHeaderAvatar.textContent = "👥";
        chatHeaderAvatar.style.cursor = 'default';
        chatHeaderAvatar.onclick = null;
    }
    
    const chatHeaderPresence = document.getElementById("chatHeaderPresence");
    if (chatHeaderPresence) chatHeaderPresence.style.display = 'none';
    
    const encryptionBtn = document.getElementById('encryptionBtn');
    if (encryptionBtn) encryptionBtn.style.display = 'none';
    
    const chatSearchBtn = document.getElementById('chatSearchBtn');
    if (chatSearchBtn) chatSearchBtn.style.display = 'flex';
    
    const logDiv = getLogDiv();
    if (logDiv) logDiv.innerHTML = "";
    
    document.getElementById('welcomeScreen').style.display = 'none';
    document.getElementById('chatHeader').style.display = 'flex';
    document.getElementById('log').style.display = 'flex';
    document.getElementById('inputArea').style.display = 'flex';
    
    const messageInput = document.getElementById("messageInput");
    if (messageInput) {
        messageInput.disabled = false;
        messageInput.placeholder = t('group_message_placeholder');
    }
    document.getElementById("sendBtn").disabled = false;
    
    _isLoadingHistory = true;
    
    try {
        await loadGroupHistory(group.id);
        
        if (group.creator_id === state.userId) {
            prependSystemMessage(group.id, {
                id: 'system-created-' + group.id,
                type: 'system',
                group_id: group.id,
                text: `🎉 Group "${group.name}" created`,
                created_at: group.created_at
            });
        } else {
            const shown = JSON.parse(localStorage.getItem('amini_shown_invites') || '{}');
            if (!shown[group.id]) {
                shown[group.id] = true;
                localStorage.setItem('amini_shown_invites', JSON.stringify(shown));
            }
            
            prependSystemMessage(group.id, {
                id: 'system-invited-' + group.id,
                type: 'system',
                group_id: group.id,
                text: `✨ You were invited to the group "${group.name}"`,
                created_at: group.created_at
            });
        }
    } finally {
        _isLoadingHistory = false;
    }
}

// ============================================
// ===== СИСТЕМНЫЕ СООБЩЕНИЯ (PREPEND) =====
// ============================================

function prependSystemMessage(groupId, sysMsg) {
    if (!sysMsg.group_id) sysMsg.group_id = groupId;
    
    if (!state.groupMessagesMap.has(groupId)) {
        state.groupMessagesMap.set(groupId, new Map());
    }
    const msgMap = state.groupMessagesMap.get(groupId);
    
    if (msgMap.has(sysMsg.id)) {
        const logDiv = getLogDiv();
        if (logDiv && state.activeGroupId === groupId && !logDiv.querySelector(`[data-msg-id="${sysMsg.id}"]`)) {
            renderSystemAtTop(sysMsg);
        }
        return;
    }
    
    msgMap.set(sysMsg.id, sysMsg);
    
    if (state.activeGroupId === groupId) {
        renderSystemAtTop(sysMsg);
    }
}

function renderSystemAtTop(sysMsg) {
    const logDiv = getLogDiv();
    if (!logDiv) return;
    
    if (logDiv.querySelector(`[data-msg-id="${sysMsg.id}"]`)) return;
    
    const row = document.createElement("div");
    row.className = "system-row";
    row.dataset.msgId = sysMsg.id;
    const sysBox = document.createElement("div");
    sysBox.className = "system-box";
    sysBox.innerText = sysMsg.text;
    row.appendChild(sysBox);
    
    logDiv.insertBefore(row, logDiv.firstChild);
}

function addSystemMessage(groupId, sysMsg, forceRender = false) {
    if (!sysMsg.group_id) sysMsg.group_id = groupId;
    
    if (!state.groupMessagesMap.has(groupId)) {
        state.groupMessagesMap.set(groupId, new Map());
    }
    const msgMap = state.groupMessagesMap.get(groupId);
    
    if (msgMap.has(sysMsg.id) && !forceRender) {
        return;
    }
    
    msgMap.set(sysMsg.id, sysMsg);
    
    if (forceRender || state.activeGroupId === groupId) {
        renderGroupMessage(sysMsg);
    }
}

// ============================================
// ===== ИСТОРИЯ СООБЩЕНИЙ ГРУППЫ =====
// ============================================

export async function loadGroupHistory(groupId) {
    try {
        const res = await fetch(`http://localhost:8080/groups/history?id=${groupId}`, {
            headers: { "Authorization": "Bearer " + state.token }
        });
        if (!res.ok) return;
        
        const messages = await res.json();
        if (!Array.isArray(messages)) return;
        
        if (!state.groupMessagesMap.has(groupId)) {
            state.groupMessagesMap.set(groupId, new Map());
        }
        const msgMap = state.groupMessagesMap.get(groupId);
        
        messages.forEach(msg => {
            msgMap.set(msg.id, msg);
            
            if (state.activeGroupId === groupId) {
                renderGroupMessage(msg);
            }
        });
        
        const logDiv = getLogDiv();
        if (logDiv && state.activeGroupId === groupId) {
            logDiv.scrollTop = logDiv.scrollHeight;
        }
    } catch (e) {
        console.error("Failed to load group history:", e);
    }
}

// ============================================
// ===== РЕНДЕР СООБЩЕНИЙ ГРУППЫ =====
// ============================================

export function renderGroupMessage(msg) {
    if (msg.group_id && state.activeGroupId !== msg.group_id) {
        return;
    }
    
    const logDiv = getLogDiv();
    if (!logDiv) return;
    
    if (logDiv.querySelector(`[data-msg-id="${msg.id}"]`)) {
        return;
    }
    
    if (msg.type === 'system') {
        const row = document.createElement("div");
        row.className = "system-row";
        row.dataset.msgId = msg.id;
        const sysBox = document.createElement("div");
        sysBox.className = "system-box";
        sysBox.innerText = msg.text;
        row.appendChild(sysBox);
        logDiv.appendChild(row);
        return;
    }
    
    const isMe = msg.sender === state.userId;
    const row = document.createElement("div");
    row.className = `message-row ${isMe ? 'me' : 'group-other'}`;
    row.dataset.msgId = msg.id;
    
    const bubble = document.createElement("div");
    bubble.className = "bubble";
    
    if (!isMe) {
        const senderName = document.createElement("div");
        senderName.className = "group-sender-name";
        senderName.textContent = msg.username || 'Unknown';
        bubble.appendChild(senderName);
    }
    
    if (msg.reply_to) {
        const groupMsgMap = state.groupMessagesMap.get(msg.group_id);
        const original = groupMsgMap ? groupMsgMap.get(msg.reply_to) : null;
        if (original && original.type !== 'system') {
            const quote = document.createElement('div');
            quote.className = 'reply-quote';
            quote.onclick = (e) => {
                e.stopPropagation();
                const originalEl = document.querySelector(`[data-msg-id="${msg.reply_to}"]`);
                if (originalEl) {
                    originalEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    originalEl.classList.add('highlight-pulse');
                    setTimeout(() => originalEl.classList.remove('highlight-pulse'), 1500);
                }
            };
            const name = document.createElement('div');
            name.className = 'reply-quote-name';
            name.textContent = original.username || 'Unknown';
            quote.appendChild(name);
            const text = document.createElement('div');
            text.className = 'reply-quote-text';
            text.textContent = original.data;
            quote.appendChild(text);
            bubble.appendChild(quote);
        }
    }
    
    const txtSpan = document.createElement("span");
    txtSpan.className = "bubble-text";
    txtSpan.innerText = msg.data;
    
    const metaDiv = document.createElement("div");
    metaDiv.className = "msg-meta";
    const timeSpan = document.createElement("span");
    timeSpan.className = "msg-time";
    timeSpan.innerText = formatTime(msg.created_at);
    metaDiv.appendChild(timeSpan);
    
    if (isMe) {
        const statusSpan = document.createElement("span");
        const status = msg.status || "delivered";
        statusSpan.className = `msg-status status-${status}`;
        statusSpan.id = `status-${msg.id}`;
        metaDiv.appendChild(statusSpan);
    }
    
    bubble.appendChild(txtSpan);
    bubble.appendChild(metaDiv);
    
    const swipeIcon = document.createElement("span");
    swipeIcon.className = "swipe-reply-icon";
    swipeIcon.innerHTML = "↩";
    bubble.appendChild(swipeIcon);
    
    row.appendChild(bubble);
    
    const replyBtn = document.createElement("button");
    replyBtn.className = "reply-btn";
    replyBtn.innerHTML = "↩";
    replyBtn.onclick = (e) => { 
        e.stopPropagation(); 
        if (window.startReply) {
            window.startReply(msg.id);
        }
    };
    row.appendChild(replyBtn);
    
    logDiv.appendChild(row);
    
    attachSwipeToMessage(row);
    
    const isNearBottom = logDiv.scrollHeight - logDiv.scrollTop - logDiv.clientHeight < 100;
    if (isNearBottom) {
        logDiv.scrollTop = logDiv.scrollHeight;
    }
}

// ============================================
// ===== ОТПРАВКА СООБЩЕНИЙ =====
// ============================================

export function sendGroupMessage(text, replyTo = null) {
    if (!state.activeGroupId || !text.trim()) return;
    
    const msgId = crypto.randomUUID ? crypto.randomUUID() : Date.now() + '-' + Math.random();
    const createdAt = Math.floor(Date.now() / 1000);
    
    const message = {
        type: "group_message",
        id: msgId,
        group_id: state.activeGroupId,
        data: text,
        reply_to: replyTo
    };
    
    if (state.ws && state.ws.readyState === WebSocket.OPEN) {
        state.ws.send(JSON.stringify(message));
    }
    
    const myMsg = {
        id: msgId,
        group_id: state.activeGroupId,
        sender: state.userId,
        username: localStorage.getItem("username"),
        data: text,
        created_at: createdAt,
        reply_to: replyTo,
        status: "delivered"
    };
    
    if (!state.groupMessagesMap.has(state.activeGroupId)) {
        state.groupMessagesMap.set(state.activeGroupId, new Map());
    }
    state.groupMessagesMap.get(state.activeGroupId).set(msgId, myMsg);
    renderGroupMessage(myMsg);
    
    const group = state.groups.find(g => g.id === state.activeGroupId);
    if (group) {
        group.last_message_text = text;
        group.last_message_sender = state.userId;
        group.last_message_time = createdAt;
        group.unread_count = 0;
    }
    
    if (window.renderChatsList) {
        window.renderChatsList();
    }
}

// ============================================
// ===== 🆕 ОБРАБОТКА WEBSOCKET СОБЫТИЙ (ИСПРАВЛЕНО) =====
// ============================================

export function handleGroupMessage(data) {
    const groupId = data.group_id;
    
    if (!state.groupMessagesMap.has(groupId)) {
        state.groupMessagesMap.set(groupId, new Map());
    }
    state.groupMessagesMap.get(groupId).set(data.id, data);
    
    let group = state.groups.find(g => g.id === groupId);
    
    if (!group) {
        group = {
            id: groupId,
            name: data.group_name || 'Group',
            creator_id: '',
            created_at: data.created_at,
            members: [],
            unread_count: 0
        };
        state.groups.push(group);
    }
    
    group.last_message_text = data.data;
    group.last_message_sender = data.sender;
    group.last_message_time = data.created_at;
    
    // Группа открыта и не идёт загрузка истории
    const isGroupActive = state.activeGroupId === groupId && !_isLoadingHistory;
    
    // Увеличиваем счётчик ТОЛЬКО для закрытой группы и не своих сообщений
    if (!isGroupActive && data.sender !== state.userId) {
        group.unread_count = (group.unread_count || 0) + 1;
    }
    
    if (state.activeGroupId === groupId) {
        renderGroupMessage(data);
    }
    
    // 🆕 ИСПРАВЛЕНО: Умная отправка статусов
    if (data.sender !== state.userId && state.ws && state.ws.readyState === WebSocket.OPEN) {
        if (isGroupActive) {
            // Группа ОТКРЫТА — отправляем "read" (Bob читает сообщение в реальном времени)
            state.ws.send(JSON.stringify({
                type: "group_status_update",
                id: data.id,
                group_id: data.group_id,
                status: "read"
            }));
            
            // Также обновляем last_seen_at на сервере (debounce для избежания лишних запросов)
            debouncedMarkSeen(data.group_id);
        } else {
            // Группа ЗАКРЫТА — отправляем "delivered"
            state.ws.send(JSON.stringify({
                type: "group_status_update",
                id: data.id,
                group_id: data.group_id,
                status: "delivered"
            }));
        }
    }
    
    if (window.renderChatsList) {
        window.renderChatsList();
    }
}

export function handleMyGroups(data) {
    state.groups = Array.isArray(data.groups) ? data.groups : [];
    
    state.groups.forEach(group => {
        if (group.unread_count === undefined) group.unread_count = 0;
    });
    
    if (window.renderChatsList) window.renderChatsList();
}

export function handleGroupCreated(data) {
    const exists = state.groups.find(g => g.id === data.id);
    
    if (!exists) {
        const newGroup = {
            id: data.id,
            name: data.name,
            creator_id: data.creator_id,
            created_at: data.created_at,
            members: data.members || [],
            unread_count: 0
        };
        state.groups.push(newGroup);
    } else {
        exists.members = data.members || exists.members || [];
    }
    
    if (window.renderChatsList) {
        window.renderChatsList();
    }
}

// ============================================
// ===== ОБРАБОТКА СТАТУСОВ СООБЩЕНИЙ =====
// ============================================

export function handleGroupStatusUpdate(data) {
    if (!data.id || !data.group_id) return;
    
    const statusEl = document.getElementById(`status-${data.id}`);
    if (statusEl) {
        statusEl.className = `msg-status status-${data.status || 'delivered'}`;
    }
    
    if (state.groupMessagesMap.has(data.group_id)) {
        const msgMap = state.groupMessagesMap.get(data.group_id);
        const msg = msgMap.get(data.id);
        if (msg) {
            msg.status = data.status || 'delivered';
        }
    }
}

export function handleGroupBulkStatusUpdate(data) {
    if (!data.ids || !Array.isArray(data.ids) || !data.group_id) return;
    
    data.ids.forEach(msgId => {
        const statusEl = document.getElementById(`status-${msgId}`);
        if (statusEl) {
            statusEl.className = `msg-status status-${data.status || 'read'}`;
        }
        
        if (state.groupMessagesMap.has(data.group_id)) {
            const msgMap = state.groupMessagesMap.get(data.group_id);
            const msg = msgMap.get(msgId);
            if (msg) {
                msg.status = data.status || 'read';
            }
        }
    });
}

// ============================================
// ===== TYPING INDICATOR =====
// ============================================

export function sendGroupTyping() {
    if (!state.activeGroupId || !state.ws || state.ws.readyState !== WebSocket.OPEN) return;
    
    state.ws.send(JSON.stringify({
        type: "group_typing",
        group_id: state.activeGroupId
    }));
    
    if (state.groupTypingTimer) clearTimeout(state.groupTypingTimer);
    state.groupTypingTimer = setTimeout(() => {
        state.ws.send(JSON.stringify({
            type: "group_stop_typing",
            group_id: state.activeGroupId
        }));
    }, constants.GROUP_TYPING_TIMEOUT);
}

export function handleGroupTyping(data) {
    const groupId = data.group_id;
    const userId = data.from;
    
    if (state.activeGroupId !== groupId) return;
    if (userId === state.userId) return;
    
    if (!state.groupTypingUsers.has(groupId)) {
        state.groupTypingUsers.set(groupId, new Map());
    }
    
    const typingMap = state.groupTypingUsers.get(groupId);
    
    if (typingMap.has(userId)) {
        clearTimeout(typingMap.get(userId));
    }
    
    if (data.stop) {
        typingMap.delete(userId);
    } else {
        const timer = setTimeout(() => {
            typingMap.delete(userId);
            updateGroupTypingIndicator();
        }, constants.GROUP_TYPING_TIMEOUT + 500);
        typingMap.set(userId, timer);
    }
    
    updateGroupTypingIndicator();
}

function updateGroupTypingIndicator() {
    if (!state.activeGroupId) return;
    
    const typingMap = state.groupTypingUsers.get(state.activeGroupId);
    const indicator = document.getElementById('typingIndicator');
    const chatLabel = document.querySelector('.chat-header-label');
    const chatName = document.getElementById('activeChatTarget');
    
    if (!typingMap || typingMap.size === 0) {
        if (indicator) indicator.style.display = 'none';
        if (chatLabel) chatLabel.style.display = 'block';
        if (chatName) chatName.style.display = 'block';
        return;
    }
    
    const count = typingMap.size;
    if (indicator) {
        indicator.style.display = 'flex';
        const textEl = indicator.querySelector('.typing-text');
        if (textEl) {
            if (count === 1) {
                const userId = Array.from(typingMap.keys())[0];
                const user = state.allUsersList.find(u => String(u.id) === userId);
                textEl.textContent = user ? `${user.username} ${t('typing')}` : t('typing');
            } else {
                textEl.textContent = `${count} ${t('typing')}`;
            }
        }
    }
    if (chatLabel) chatLabel.style.display = 'none';
    if (chatName) chatName.style.display = 'none';
}

// ============================================
// ===== МОДАЛКА СОЗДАНИЯ ГРУППЫ =====
// ============================================

let selectedMembers = new Set();

export function openCreateGroupModal() {
    const overlay = document.getElementById('createGroupOverlay');
    if (!overlay) return;
    
    selectedMembers.clear();
    document.getElementById('groupNameInput').value = '';
    document.getElementById('groupMemberSearch').value = '';
    renderCreateGroupMembers('');
    
    overlay.classList.add('open');
}

export function closeCreateGroupModal() {
    const overlay = document.getElementById('createGroupOverlay');
    if (overlay) overlay.classList.remove('open');
}

export function renderCreateGroupMembers(query) {
    const list = document.getElementById('createGroupMembersList');
    if (!list) return;
    list.innerHTML = '';
    
    const q = (query || '').toLowerCase().trim();
    const users = state.allUsersList.filter(u => {
        if (String(u.id) === state.userId) return false;
        if (!q) return true;
        return u.username.toLowerCase().includes(q);
    });
    
    users.forEach(user => {
        const item = document.createElement("div");
        item.className = "create-group-member-item";
        if (selectedMembers.has(String(user.id))) item.classList.add('selected');
        
        const checkbox = document.createElement("div");
        checkbox.className = "create-group-checkbox";
        
        const avatar = createAvatarElement(user.username);
        avatar.className = "avatar small";
        
        const info = document.createElement("div");
        info.className = "create-group-member-info";
        const name = document.createElement("div");
        name.className = "create-group-member-name";
        name.textContent = user.username;
        info.appendChild(name);
        
        item.appendChild(checkbox);
        item.appendChild(avatar);
        item.appendChild(info);
        
        item.onclick = () => {
            const userId = String(user.id);
            if (selectedMembers.has(userId)) {
                selectedMembers.delete(userId);
                item.classList.remove('selected');
            } else {
                selectedMembers.add(userId);
                item.classList.add('selected');
            }
        };
        
        list.appendChild(item);
    });
}

export async function submitCreateGroup() {
    const name = document.getElementById('groupNameInput').value.trim();
    
    if (!name) {
        alert('Please enter a group name');
        return;
    }
    
    if (selectedMembers.size === 0) {
        alert('Please select at least one member');
        return;
    }
    
    try {
        const res = await fetch('http://localhost:8080/groups', {
            method: 'POST',
            headers: {
                "Authorization": "Bearer " + state.token,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                name: name,
                members: Array.from(selectedMembers)
            })
        });
        
        if (res.ok) {
            const group = await res.json();
            closeCreateGroupModal();
            await loadGroups();
            
            const newGroup = state.groups.find(g => g.id === group.id);
            if (newGroup) openGroupChat(newGroup);
        } else {
            alert('Failed to create group');
        }
    } catch (e) {
        console.error("Create group error:", e);
        alert('Error creating group');
    }
}

// ============================================
// ===== ИНИЦИАЛИЗАЦИЯ =====
// ============================================

export function initGroups() {
    const searchInput = document.getElementById('groupMemberSearch');
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            renderCreateGroupMembers(e.target.value);
        });
    }
    
    const overlay = document.getElementById('createGroupOverlay');
    if (overlay) {
        overlay.addEventListener('click', (e) => {
            if (e.target.id === 'createGroupOverlay') closeCreateGroupModal();
        });
    }
    
    loadGroups();
}