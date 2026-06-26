// ============================================
// ===== ИМПОРТЫ (ВСЕ ДОЛЖНЫ БЫТЬ ВВЕРХУ) =====
// ============================================
import { setLanguage } from './modules/i18n.js';
import { 
    switchTab, 
    copyMyFingerprint, 
    openChatSearch, 
    closeChatSearch,
    openEncryptionModal,
    closeEncryptionModal,
    copyEncryptionCode,
    openNewChatModal,
    closeNewChatModal,
    openThemeSettings,
    openLanguageSettings,
    startReply,
    cancelReply,
    chatSearchNext,
    chatSearchPrev
} from './modules/ui.js';
import { register, login, logout, initApp } from './modules/events.js';
import { send } from './modules/websocket.js';
import { setThemeMode } from './modules/themes.js';
import { openProfile, closeProfile, initProfile } from './modules/profile.js';

// ============================================
// === ГЛОБАЛЬНЫЕ ФУНКЦИИ ДЛЯ HTML onclick ===
// ============================================
window.register = register;
window.login = login;
window.logout = logout;
window.switchTab = switchTab;
window.copyMyFingerprint = copyMyFingerprint;
window.openChatSearch = openChatSearch;
window.closeChatSearch = closeChatSearch;
window.openEncryptionModal = openEncryptionModal;
window.closeEncryptionModal = closeEncryptionModal;
window.copyEncryptionCode = copyEncryptionCode;
window.openNewChatModal = openNewChatModal;
window.closeNewChatModal = closeNewChatModal;
window.openThemeSettings = openThemeSettings;
window.openLanguageSettings = openLanguageSettings;
window.startReply = startReply;
window.cancelReply = cancelReply;
window.send = send;
window.setThemeMode = setThemeMode;
window.setLanguage = setLanguage;
window.chatSearchNext = chatSearchNext;
window.chatSearchPrev = chatSearchPrev;

// 🆕 Функции профиля
window.openProfileFn = openProfile;
window.closeProfileFn = closeProfile;

// ============================================
// ========== ОБРАБОТЧИКИ СОБЫТИЙ ============
// ============================================

// Предотвращаем submit формы
document.addEventListener('submit', (e) => e.preventDefault());

// Инициализация при загрузке
window.addEventListener('DOMContentLoaded', () => {
    initApp();
    initProfile();
});