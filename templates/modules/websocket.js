import { state, constants, saveUnreadCounts } from './state.js';
import { t } from './i18n.js';
import { formatTime } from './utils.js';
import { 
    updateConnectionStatus, 
    logMessage, 
    updateMessageStatus, 
    showKeyExchangeIfNeeded,
    renderChatsList,
    showPeerTyping,
    hidePeerTyping,
    updatePresence,
    markAsRead,
    flushPendingReads
} from './ui.js';

export function initWebSocket() {
    if (state.ws && (state.ws.readyState === WebSocket.CONNECTING || state.ws.readyState === WebSocket.OPEN)) return;
    if (state.wsReconnectAttempts === 0) updateConnectionStatus('connecting');
    state.ws = new WebSocket(`ws://localhost:8080/ws?token=${state.token}`);
    
    state.ws.onopen = () => { 
        state.wsReconnectAttempts = 0; 
        updateConnectionStatus('connected'); 
        state.ws.send(JSON.stringify({ type: "set_pubkey", pubKey: window.publicKeyBase64 })); 
    };
    
    state.ws.onclose = () => {
        if (!state.token) return;
        state.wsReconnectAttempts++;
        if (state.wsReconnectAttempts <= constants.WS_MAX_RECONNECT) {
            const delay = Math.min(constants.WS_RECONNECT_BASE_DELAY * Math.pow(2, state.wsReconnectAttempts - 1), constants.WS_RECONNECT_MAX_DELAY);
            updateConnectionStatus('reconnecting', `${state.wsReconnectAttempts}/${constants.WS_MAX_RECONNECT}`);
            state.wsReconnectTimer = setTimeout(initWebSocket, delay);
        } else updateConnectionStatus('disconnected');
    };
    
    state.ws.onerror = () => { if (state.wsReconnectAttempts === 0) updateConnectionStatus('reconnecting'); };
    
    state.ws.onmessage = async (e) => {
        const d = JSON.parse(e.data);
        
        // ================= ONLINE / PRESENCE =================
        if (d.type === "online_list") { 
            if (Array.isArray(d.users)) {
                d.users.forEach(uid => {
                    const uidStr = String(uid);
                    state.onlineStatuses.set(uidStr, 'online');
                    updatePresence(uidStr, "online");
                });
            }
            return; 
        }
        
        if (d.type === "user_joined") {
            const userId = String(d.id);
            const username = d.username;
            
            if (!username) return;
            
            state.onlineStatuses.set(userId, 'online');
            
            if (!state.userCache.has(userId)) {
                state.userCache.set(userId, {
                    username: username,
                    lastMessage: null,
                    lastMessageText: null,
                    lastTime: null,
                    lastFromMe: false,
                    unreadCount: 0
                });
            }
            
            const existsInList = state.allUsersList.find(u => String(u.id) === userId);
            if (!existsInList) {
                state.allUsersList.push({ id: userId, username: username });
            }
            
            updatePresence(userId, "online");
            
            if (state.currentTab === 'chats') {
                renderChatsList();
            }
            return;
        }
        
        if (d.type === "user_left") {
            const userId = String(d.id);
            state.onlineStatuses.set(userId, 'offline');
            updatePresence(userId, "offline");
            return;
        }
        
        if (d.type === "presence") { 
            const userId = String(d.user);
            state.onlineStatuses.set(userId, d.status);
            updatePresence(userId, d.status); 
            return; 
        }
        
        // ================= MESSAGE STATUS =================
        if (d.type === "message_saved") { 
            updateMessageStatus(String(d.id), "sent"); 
            return; 
        }
        
        if (d.type === "status_update") { 
            updateMessageStatus(String(d.id), d.status); 
            return; 
        }
        
        // ================= TYPING (личные чаты) =================
        if (d.type === "typing") { 
            if (String(d.from) === state.activeTargetId) showPeerTyping(); 
            return; 
        }
        
        if (d.type === "stop_typing") { 
            if (String(d.from) === state.activeTargetId) hidePeerTyping(); 
            return; 
        }
        
        // ================= ГРУППОВЫЕ СОБЫТИЯ =================
        if (d.type === "my_groups") {
            if (window.groupsModule) {
                window.groupsModule.handleMyGroups(d);
            }
            return;
        }
        
        if (d.type === "group_created") {
            if (window.groupsModule) {
                window.groupsModule.handleGroupCreated(d);
            }
            return;
        }
        
        if (d.type === "group_message") {
            if (window.groupsModule) {
                window.groupsModule.handleGroupMessage(d);
            }
            return;
        }
        
        // 🆕 ОБНОВЛЕНИЕ СТАТУСА ОДНОГО СООБЩЕНИЯ (delivered)
        if (d.type === "group_status_update") {
            if (window.groupsModule && window.groupsModule.handleGroupStatusUpdate) {
                window.groupsModule.handleGroupStatusUpdate(d);
            }
            return;
        }
        
        // 🆕 МАССОВОЕ ОБНОВЛЕНИЕ СТАТУСОВ (read)
        if (d.type === "group_bulk_status_update") {
            if (window.groupsModule && window.groupsModule.handleGroupBulkStatusUpdate) {
                window.groupsModule.handleGroupBulkStatusUpdate(d);
            }
            return;
        }
        
        if (d.type === "group_typing") {
            if (window.groupsModule) {
                window.groupsModule.handleGroupTyping(d);
            }
            return;
        }
        
        if (d.type === "group_stop_typing") {
            if (window.groupsModule) {
                window.groupsModule.handleGroupTyping({ 
                    ...d, 
                    type: "group_typing", 
                    stop: true 
                });
            }
            return;
        }
        
        // ================= PUBKEY =================
        if (d.type === "pubkey") {
            state.publicKeys[d.from] = await crypto.subtle.importKey("spki", window.fromB64(d.pubKey), { name: "RSA-OAEP", hash: "SHA-256" }, true, ["encrypt"]);
            flushPendingReads(d.from);
            if (String(d.from) === state.activeTargetId) await showKeyExchangeIfNeeded(d.from);
            if (state.pendingMessages[d.from]) {
                const queue = [...state.pendingMessages[d.from]];
                delete state.pendingMessages[d.from];
                for (const text of queue) await sendQueuedMessage(text, d.from);
            }
            return;
        }
        
        // ================= ЛИЧНОЕ СООБЩЕНИЕ (с защитой от "Unknown") =================
        if (d.type === "message") {
            const msgIdStr = String(d.id);
            if (state.shownMessages.has(msgIdStr)) return;
            state.shownMessages.add(msgIdStr);
            
            const text = await window.decryptMessage(d, state.userId);
            const fromIdStr = String(d.from);
            const isMe = fromIdStr === state.userId;
            const fromUsername = isMe 
                ? localStorage.getItem("username") 
                : (state.userCache.get(fromIdStr)?.username || "User");
            const replyToId = d.reply_to || null;
            
            if (!isMe && fromIdStr === state.activeTargetId) hidePeerTyping();
            
            if (!isMe) {
                let partnerData = state.userCache.get(fromIdStr);
                if (!partnerData) {
                    const user = state.allUsersList.find(u => String(u.id) === fromIdStr);
                    
                    const resolvedUsername = user?.username || fromUsername;
                    if (!resolvedUsername || resolvedUsername === "Unknown" || resolvedUsername === "User") {
                        console.warn("⚠️ Skipping message from unknown user:", fromIdStr);
                        return;
                    }
                    
                    partnerData = { 
                        username: resolvedUsername, 
                        lastMessage: null, 
                        lastMessageText: null, 
                        lastTime: null, 
                        lastFromMe: false, 
                        unreadCount: 0 
                    };
                    state.userCache.set(fromIdStr, partnerData);
                }
                
                if (fromIdStr !== state.activeTargetId) {
                    partnerData.unreadCount = (partnerData.unreadCount || 0) + 1;
                    saveUnreadCounts();
                }
                
                partnerData.lastMessage = d;
                partnerData.lastMessageText = text;
                partnerData.lastTime = d.created_at || Date.now() / 1000;
                partnerData.lastFromMe = false;
                state.userCache.set(fromIdStr, partnerData);
                renderChatsList();
            } else {
                const toId = String(d.to);
                let partnerData = state.userCache.get(toId);
                if (!partnerData) {
                    const user = state.allUsersList.find(u => String(u.id) === toId);
                    
                    const resolvedUsername = user?.username;
                    if (!resolvedUsername) {
                        console.warn("⚠️ Skipping own message to unknown user:", toId);
                        return;
                    }
                    
                    partnerData = { 
                        username: resolvedUsername, 
                        lastMessage: null, 
                        lastMessageText: null, 
                        lastTime: null, 
                        lastFromMe: false, 
                        unreadCount: 0 
                    };
                    state.userCache.set(toId, partnerData);
                }
                partnerData.lastMessage = d;
                partnerData.lastMessageText = text;
                partnerData.lastTime = d.created_at || Date.now() / 1000;
                partnerData.lastFromMe = true;
                state.userCache.set(toId, partnerData);
                renderChatsList();
            }
            
            if (fromIdStr === state.activeTargetId || (isMe && String(d.to) === state.activeTargetId)) {
                if (text) {
                    logMessage(msgIdStr, text, isMe ? "me" : "other", formatTime(d.timestamp || d.created_at || null), "sent", fromUsername, replyToId);
                    if (!isMe) markAsRead(msgIdStr, fromIdStr);
                } else if (!isMe) markAsRead(msgIdStr, fromIdStr);
            } else {
                if (!isMe && state.ws && state.ws.readyState === WebSocket.OPEN) {
                    state.ws.send(JSON.stringify({ 
                        type: "status_update", 
                        id: msgIdStr, 
                        to: fromIdStr, 
                        status: "delivered" 
                    }));
                }
            }
        }
    };
}

export async function sendQueuedMessage(text, target) {
    const encrypted = await window.encryptDual(text, state.publicKeys[target]);
    const messageId = window.generateMessageId();
    state.shownMessages.add(messageId);
    state.ws.send(JSON.stringify({ 
        id: messageId, 
        type: "message", 
        to: String(target), 
        ...encrypted 
    }));
    logMessage(messageId, text, "me", formatTime(), "sent", localStorage.getItem("username"));
    
    let partnerData = state.userCache.get(target);
    if (!partnerData) {
        const user = state.allUsersList.find(u => String(u.id) === target);
        
        if (!user?.username) {
            console.warn("⚠️ Cannot send queued message to unknown user:", target);
            return;
        }
        
        partnerData = { 
            username: user.username, 
            lastMessage: { id: messageId, from: state.userId, to: target, created_at: Date.now() / 1000 }, 
            lastMessageText: text, 
            lastTime: Date.now() / 1000, 
            lastFromMe: true, 
            unreadCount: 0 
        };
        state.userCache.set(target, partnerData);
    } else {
        partnerData.lastMessage = { id: messageId, from: state.userId, to: target, created_at: Date.now() / 1000 };
        partnerData.lastMessageText = text;
        partnerData.lastTime = Date.now() / 1000;
        partnerData.lastFromMe = true;
    }
    renderChatsList();
}

// УНИВЕРСАЛЬНАЯ ФУНКЦИЯ ОТПРАВКИ (личные + группы)
export async function send() {
    const messageInput = document.getElementById("messageInput");
    const text = messageInput.value.trim();
    if (!text) return;
    
    // ================= ОТПРАВКА В ГРУППУ =================
    if (state.activeGroupId) {
        if (window.groupsModule && window.groupsModule.sendGroupMessage) {
            const replyTo = state.replyingTo ? state.replyingTo.id : null;
            window.groupsModule.sendGroupMessage(text, replyTo);
            
            state.replyingTo = null;
            const preview = document.getElementById('replyPreview');
            if (preview) preview.style.display = 'none';
            
            messageInput.value = "";
            if (state.typingTimer) clearTimeout(state.typingTimer);
            state.isTyping = false;
            if (state.ws && state.ws.readyState === WebSocket.OPEN) {
                state.ws.send(JSON.stringify({ 
                    type: "group_stop_typing", 
                    group_id: state.activeGroupId 
                }));
            }
        }
        return;
    }
    
    // ================= ОТПРАВКА В ЛИЧНЫЙ ЧАТ =================
    const target = state.activeTargetId;
    if (!target) return;
    
    if (!state.publicKeys[target]) {
        if (!state.pendingMessages[target]) state.pendingMessages[target] = [];
        state.pendingMessages[target].push(text);
        state.ws.send(JSON.stringify({ type: "get_pubkey", to: String(target) }));
        messageInput.value = "";
        return;
    }
    
    const encrypted = await window.encryptDual(text, state.publicKeys[target]);
    const messageId = window.generateMessageId();
    state.shownMessages.add(messageId);
    
    const payload = { id: messageId, type: "message", to: String(target), ...encrypted };
    if (state.replyingTo) payload.reply_to = state.replyingTo.id;
    state.ws.send(JSON.stringify(payload));
    
    logMessage(messageId, text, "me", formatTime(), "sent", localStorage.getItem("username"), state.replyingTo ? state.replyingTo.id : null);
    
    let partnerData = state.userCache.get(target);
    if (!partnerData) {
        const user = state.allUsersList.find(u => String(u.id) === target);
        
        if (!user?.username) {
            console.warn("⚠️ Cannot send message to unknown user:", target);
            messageInput.value = "";
            return;
        }
        
        partnerData = { 
            username: user.username, 
            lastMessage: { id: messageId, from: state.userId, to: target, created_at: Date.now() / 1000 }, 
            lastMessageText: text, 
            lastTime: Date.now() / 1000, 
            lastFromMe: true, 
            unreadCount: 0 
        };
        state.userCache.set(target, partnerData);
    } else {
        partnerData.lastMessage = { id: messageId, from: state.userId, to: target, created_at: Date.now() / 1000 };
        partnerData.lastMessageText = text;
        partnerData.lastTime = Date.now() / 1000;
        partnerData.lastFromMe = true;
    }
    renderChatsList();
    
    state.replyingTo = null;
    const preview = document.getElementById('replyPreview');
    if (preview) preview.style.display = 'none';
    
    messageInput.value = "";
    if (state.typingTimer) clearTimeout(state.typingTimer);
    state.isTyping = false;
    if (state.ws && state.ws.readyState === WebSocket.OPEN) {
        state.ws.send(JSON.stringify({ type: "stop_typing", to: target }));
    }
}