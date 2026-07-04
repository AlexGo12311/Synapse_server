import { state, constants } from './state.js';
import { t } from './i18n.js';
import { createAvatarElement, formatTime, getLogDiv } from './utils.js';

// ============================================
// ===== ЗАГРУЗКА И РЕНДЕР СПИСКА ГРУПП =====
// ============================================

export async function loadGroups() {
    try {
        const res = await fetch("http://localhost:8080/groups", {
            headers: { "Authorization": "Bearer " + state.token }
        });
        if (!res.ok) return;
        const groups = await res.json();
        state.groups = Array.isArray(groups) ? groups : [];
        renderGroupsList();
    } catch (e) {
        console.error("Failed to load groups:", e);
    }
}

export function renderGroupsList() {
    const listContainer = document.getElementById("groupsList");
    const noGroupsState = document.getElementById("noGroupsState");
    if (!listContainer) return;
    
    listContainer.innerHTML = "";
    
    if (noGroupsState) {
        noGroupsState.style.display = state.groups.length === 0 ? 'flex' : 'none';
    }
    
    state.groups.forEach(group => {
        const btn = document.createElement("button");
        btn.className = "group-item";
        btn.id = "group-btn-" + group.id;
        if (group.id === state.activeGroupId) btn.classList.add('active');
        
        // Аватар группы (иконка 👥)
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
        
        content.appendChild(top);
        
        // Участники
        const membersSpan = document.createElement("span");
        membersSpan.className = "group-item-members";
        const memberCount = group.members ? group.members.length : 0;
        membersSpan.textContent = `👥 ${memberCount} ${memberCount === 1 ? 'member' : 'members'}`;
        content.appendChild(membersSpan);
        
        btn.appendChild(avatar);
        btn.appendChild(content);
        
        btn.onclick = () => openGroupChat(group);
        listContainer.appendChild(btn);
    });
}

// ============================================
// ===== ОТКРЫТИЕ ГРУППОВОГО ЧАТА =====
// ============================================

export function openGroupChat(group) {
    // Закрываем профиль если открыт
    const profileView = document.getElementById('profileView');
    if (profileView && profileView.style.display === 'flex') {
        profileView.style.display = 'none';
    }
    
    state.activeGroupId = group.id;
    state.activeGroupName = group.name;
    state.activeTargetId = null; // сбрасываем личный чат
    
    // Обновляем активный элемент в списке
    document.querySelectorAll('.group-item').forEach(el => el.classList.remove('active'));
    const btn = document.getElementById('group-btn-' + group.id);
    if (btn) btn.classList.add('active');
    document.querySelectorAll('.user-item').forEach(el => el.classList.remove('active'));
    
    // Обновляем шапку чата
    const chatTarget = document.getElementById("activeChatTarget");
    if (chatTarget) {
        chatTarget.innerText = group.name;
        chatTarget.onclick = null; // отключаем клик для групп
    }
    
    const chatLabel = document.querySelector('.chat-header-label');
    if (chatLabel) chatLabel.innerText = t('group_chat');
    
    // Аватар группы
    const chatHeaderAvatar = document.getElementById("chatHeaderAvatar");
    if (chatHeaderAvatar) {
        chatHeaderAvatar.style.backgroundColor = '';
        chatHeaderAvatar.style.background = 'linear-gradient(135deg, var(--accent-color), var(--accent-color-hover))';
        chatHeaderAvatar.textContent = "👥";
        chatHeaderAvatar.style.cursor = 'default';
        chatHeaderAvatar.onclick = null;
    }
    
    // Скрываем presence (для групп нет смысла)
    const chatHeaderPresence = document.getElementById("chatHeaderPresence");
    if (chatHeaderPresence) chatHeaderPresence.style.display = 'none';
    
    // Скрываем кнопки шифрования
    const encryptionBtn = document.getElementById('encryptionBtn');
    if (encryptionBtn) encryptionBtn.style.display = 'none';
    
    // Показываем поиск в чате
    const chatSearchBtn = document.getElementById('chatSearchBtn');
    if (chatSearchBtn) chatSearchBtn.style.display = 'flex';
    
    // Очищаем и показываем чат
    const logDiv = getLogDiv();
    if (logDiv) logDiv.innerHTML = "";
    
    // Показываем элементы чата
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
    
    // Загружаем историю
    loadGroupHistory(group.id);
    
    // Переключаемся на вкладку chats
    if (state.currentTab !== 'chats') {
        document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
        document.querySelectorAll('.tab-pane').forEach(pane => pane.classList.remove('active'));
        const chatsTab = document.querySelector('[data-tab="chats"]');
        const chatsPane = document.getElementById('tab-chats');
        if (chatsTab) chatsTab.classList.add('active');
        if (chatsPane) chatsPane.classList.add('active');
        state.currentTab = 'chats';
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
        
        // Инициализируем карту сообщений группы
        if (!state.groupMessagesMap.has(groupId)) {
            state.groupMessagesMap.set(groupId, new Map());
        }
        const msgMap = state.groupMessagesMap.get(groupId);
        
        messages.forEach(msg => {
            if (!msgMap.has(msg.id)) {
                msgMap.set(msg.id, msg);
                renderGroupMessage(msg);
            }
        });
        
        // Скролл вниз
        const logDiv = getLogDiv();
        if (logDiv) logDiv.scrollTop = logDiv.scrollHeight;
    } catch (e) {
        console.error("Failed to load group history:", e);
    }
}

// ============================================
// ===== РЕНДЕР СООБЩЕНИЙ ГРУППЫ =====
// ============================================

export function renderGroupMessage(msg) {
    if (state.activeGroupId !== msg.group_id) return;
    
    const logDiv = getLogDiv();
    if (!logDiv) return;
    
    const isMe = msg.sender === state.userId;
    const row = document.createElement("div");
    row.className = `message-row ${isMe ? 'me' : 'group-other'}`;
    row.dataset.msgId = msg.id;
    
    const bubble = document.createElement("div");
    bubble.className = "bubble";
    
    // Имя отправителя (для чужих сообщений)
    if (!isMe) {
        const senderName = document.createElement("div");
        senderName.className = "group-sender-name";
        senderName.textContent = msg.username || 'Unknown';
        bubble.appendChild(senderName);
    }
    
    // Reply quote
    if (msg.reply_to) {
        const groupMsgMap = state.groupMessagesMap.get(msg.group_id);
        const original = groupMsgMap ? groupMsgMap.get(msg.reply_to) : null;
        if (original) {
            const quote = document.createElement('div');
            quote.className = 'reply-quote';
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
    
    bubble.appendChild(txtSpan);
    bubble.appendChild(metaDiv);
    row.appendChild(bubble);
    
    logDiv.appendChild(row);
    logDiv.scrollTop = logDiv.scrollHeight;
}

// ============================================
// ===== ОТПРАВКА СООБЩЕНИЙ =====
// ============================================

export function sendGroupMessage(text, replyTo = null) {
    if (!state.activeGroupId || !text.trim()) return;
    
    const msgId = crypto.randomUUID ? crypto.randomUUID() : Date.now() + '-' + Math.random();
    
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
    
    // Сразу показываем своё сообщение
    const myMsg = {
        id: msgId,
        group_id: state.activeGroupId,
        sender: state.userId,
        username: localStorage.getItem("username"),
        data: text,
        created_at: Math.floor(Date.now() / 1000),
        reply_to: replyTo
    };
    
    if (!state.groupMessagesMap.has(state.activeGroupId)) {
        state.groupMessagesMap.set(state.activeGroupId, new Map());
    }
    state.groupMessagesMap.get(state.activeGroupId).set(msgId, myMsg);
    renderGroupMessage(myMsg);
}

// ============================================
// ===== ОБРАБОТКА WEBSOCKET СОБЫТИЙ =====
// ============================================

export function handleGroupMessage(data) {
    const groupId = data.group_id;
    
    if (!state.groupMessagesMap.has(groupId)) {
        state.groupMessagesMap.set(groupId, new Map());
    }
    state.groupMessagesMap.get(groupId).set(data.id, data);
    
    // Рендерим только если эта группа открыта
    if (state.activeGroupId === groupId) {
        renderGroupMessage(data);
    }
}

export function handleMyGroups(data) {
    state.groups = Array.isArray(data.groups) ? data.groups : [];
    renderGroupsList();
}

export function handleGroupCreated(data) {
    // Добавляем группу в список
    const newGroup = {
        id: data.id,
        name: data.name,
        creator_id: data.creator_id,
        created_at: data.created_at,
        members: [] // участники загрузятся при открытии
    };
    state.groups.push(newGroup);
    renderGroupsList();
    
    // Показываем уведомление (можно улучшить через toast)
    console.log(`You were added to group: ${data.name}`);
}

// ============================================
// ===== TYPING INDICATOR ДЛЯ ГРУПП =====
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
    
    // Очищаем предыдущий таймер
    if (typingMap.has(userId)) {
        clearTimeout(typingMap.get(userId));
    }
    
    // Ставим новый таймер
    const timer = setTimeout(() => {
        typingMap.delete(userId);
        updateGroupTypingIndicator();
    }, constants.GROUP_TYPING_TIMEOUT + 500);
    
    typingMap.set(userId, timer);
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
                // Можно получить username из state.allUsersList
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
            
            // Автоматически открываем созданную группу
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
    // Поиск в модалке создания
    const searchInput = document.getElementById('groupMemberSearch');
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            renderCreateGroupMembers(e.target.value);
        });
    }
    
    // Закрытие модалки по клику на overlay
    const overlay = document.getElementById('createGroupOverlay');
    if (overlay) {
        overlay.addEventListener('click', (e) => {
            if (e.target.id === 'createGroupOverlay') closeCreateGroupModal();
        });
    }
    
    // Загружаем группы при старте
    loadGroups();
}