export const state = {
    token: null,
    userId: null,
    ws: null,
    activeTargetId: null,
    activeTargetName: null,
    currentTab: 'chats',
    currentLang: 'en',
    currentThemeIndex: 0,
    currentThemeMode: 'light',
    shownMessages: new Set(),
    publicKeys: {},
    pendingMessages: {},
    userCache: new Map(),
    pendingReadQueue: new Map(),
    shownKeyExchanges: new Set(),
    wsReconnectTimer: null,
    wsReconnectAttempts: 0,
    chatSearchMatches: [],
    chatSearchActiveIndex: -1,
    allUsersList: [],
    typingTimer: null,
    isTyping: false,
    peerTypingTimer: null,
    replyingTo: null,
    messagesMap: new Map()
};

export const constants = {
    WS_MAX_RECONNECT: 10,
    WS_RECONNECT_BASE_DELAY: 1000,
    WS_RECONNECT_MAX_DELAY: 30000,
    TYPING_TIMEOUT: 2500,
    SWIPE_THRESHOLD: 70,
    MIN_HORIZONTAL_RATIO: 1.5
};

export const AVATAR_COLORS = [
    "#FF6B6B", "#4ECDC4", "#45B7D1", "#FFA07A", "#98D8C8", 
    "#F7B731", "#A8E6CF", "#FF8B94", "#B39DDB", "#81C784", 
    "#FFD54F", "#4DB6AC", "#FF8A65", "#BA68C8", "#64B5F6", 
    "#AED581", "#FFB74D", "#F06292", "#7986CB", "#4DD0E1"
];

export const THEMES = [
    { name: "Ocean Blue", wallpaper: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)", wallpaperDark: "linear-gradient(135deg, #1e3a8a 0%, #4c1d95 100%)", accent: "#4A90E2", accentHover: "#357ABD", bubbleMe: "#D6EAF8", bubbleMeDark: "#2b5278", surfaceLight: { main: "#eef4ff", container: "#ffffff", header: "#e1ebfa", input: "#ffffff", hover: "#e8f0fb", border: "#d6e3f5" }, surfaceDark: { main: "#0d1520", container: "#172230", header: "#1e2a3a", input: "#1e2a3a", hover: "#253447", border: "#0a1018" } },
    { name: "Forest", wallpaper: "linear-gradient(135deg, #134E5E 0%, #71B280 100%)", wallpaperDark: "linear-gradient(135deg, #0a2e26 0%, #1e5a3f 100%)", accent: "#27AE60", accentHover: "#229954", bubbleMe: "#D5F5E3", bubbleMeDark: "#1e5a3f", surfaceLight: { main: "#eefaf3", container: "#ffffff", header: "#def5e8", input: "#ffffff", hover: "#e5f7ec", border: "#c8ebd6" }, surfaceDark: { main: "#0a1612", container: "#15261f", header: "#1c332a", input: "#1c332a", hover: "#254536", border: "#08100c" } },
    { name: "Sunset", wallpaper: "linear-gradient(135deg, #FF6B6B 0%, #FFA500 50%, #FFE66D 100%)", wallpaperDark: "linear-gradient(135deg, #7d1f1f 0%, #7d4a1f 50%, #5a4318 100%)", accent: "#E67E22", accentHover: "#D35400", bubbleMe: "#FDEBD0", bubbleMeDark: "#7d4a1f", surfaceLight: { main: "#fff5ec", container: "#ffffff", header: "#ffe9d4", input: "#ffffff", hover: "#ffefdd", border: "#f5d4b0" }, surfaceDark: { main: "#1a110a", container: "#281910", header: "#352215", input: "#352215", hover: "#43301f", border: "#120a06" } },
    { name: "Night Sky", wallpaper: "linear-gradient(135deg, #2C3E50 0%, #4CA1AF 100%)", wallpaperDark: "linear-gradient(135deg, #0F2027 0%, #203A43 50%, #2C5364 100%)", accent: "#3498DB", accentHover: "#2980B9", bubbleMe: "#AED6F1", bubbleMeDark: "#2b5278", surfaceLight: { main: "#edf5fb", container: "#ffffff", header: "#d9ebf7", input: "#ffffff", hover: "#e3eff8", border: "#c3dced" }, surfaceDark: { main: "#0a1620", container: "#15222e", header: "#1c2d3d", input: "#1c2d3d", hover: "#243c50", border: "#081018" } },
    { name: "Rose Gold", wallpaper: "linear-gradient(135deg, #E8B4B8 0%, #D4A5A5 50%, #C89696 100%)", wallpaperDark: "linear-gradient(135deg, #3d1f2f 0%, #4d2a2a 50%, #5a2f2f 100%)", accent: "#C0392B", accentHover: "#A93226", bubbleMe: "#FADBD8", bubbleMeDark: "#7d3a2f", surfaceLight: { main: "#fef0f1", container: "#ffffff", header: "#fbe0e2", input: "#ffffff", hover: "#fde7e9", border: "#f2c4c7" }, surfaceDark: { main: "#1a0e11", container: "#28171b", header: "#351f24", input: "#351f24", hover: "#432c31", border: "#120a0c" } },
    { name: "Mint", wallpaper: "linear-gradient(135deg, #A8E6CF 0%, #DCEDC1 50%, #FFD3B6 100%)", wallpaperDark: "linear-gradient(135deg, #1e3a2f 0%, #2d4a3f 50%, #3a4a2f 100%)", accent: "#16A085", accentHover: "#138D75", bubbleMe: "#D1F2EB", bubbleMeDark: "#1e5a4d", surfaceLight: { main: "#eefaf6", container: "#ffffff", header: "#def5ee", input: "#ffffff", hover: "#e5f7f2", border: "#c5e8de" }, surfaceDark: { main: "#0a1612", container: "#15261f", header: "#1c332a", input: "#1c332a", hover: "#254536", border: "#08100c" } },
    { name: "Purple Haze", wallpaper: "linear-gradient(135deg, #8E2DE2 0%, #4A00E0 100%)", wallpaperDark: "linear-gradient(135deg, #2d0a4d 0%, #1a0033 100%)", accent: "#8E44AD", accentHover: "#7D3C98", bubbleMe: "#E8DAEF", bubbleMeDark: "#5a2f7a", surfaceLight: { main: "#f5f0fc", container: "#ffffff", header: "#e8dff8", input: "#ffffff", hover: "#ece4f8", border: "#d7c6eb" }, surfaceDark: { main: "#120a1e", container: "#1e1330", header: "#281c42", input: "#281c42", hover: "#352755", border: "#0c0618" } },
    { name: "Classic", wallpaper: "linear-gradient(135deg, #ECE9E6 0%, #FFFFFF 100%)", wallpaperDark: "linear-gradient(135deg, #1a1f2e 0%, #2d3748 100%)", accent: "#007BFF", accentHover: "#0056B3", bubbleMe: "#D9FDD3", bubbleMeDark: "#2b5278", surfaceLight: { main: "#f8f9fa", container: "#ffffff", header: "#f1f3f5", input: "#ffffff", hover: "#f4f5f7", border: "#dee2e6" }, surfaceDark: { main: "#0e1621", container: "#17212b", header: "#242f3d", input: "#242f3d", hover: "#2b3a4a", border: "#0c1621" } }
];

// Делаем publicKeys доступным глобально для crypto.js
window.publicKeys = state.publicKeys;