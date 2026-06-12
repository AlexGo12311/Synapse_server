import { state, THEMES } from './state.js';

export function applyTheme(themeIndex) {
    const theme = THEMES[themeIndex];
    if (!theme) return;
    const root = document.documentElement;
    const isDark = state.currentThemeMode === 'dark';
    root.style.setProperty('--accent-color', theme.accent);
    root.style.setProperty('--accent-color-hover', theme.accentHover);
    root.style.setProperty('--bubble-me', isDark ? theme.bubbleMeDark : theme.bubbleMe);
    root.style.setProperty('--chat-bg-image', isDark ? theme.wallpaperDark : theme.wallpaper);
    const surface = isDark ? theme.surfaceDark : theme.surfaceLight;
    if (surface) {
        root.style.setProperty('--surface-main', surface.main);
        root.style.setProperty('--surface-container', surface.container);
        root.style.setProperty('--surface-header', surface.header);
        root.style.setProperty('--surface-input', surface.input);
        root.style.setProperty('--surface-hover', surface.hover);
        root.style.setProperty('--surface-elevated', surface.container);
        root.style.setProperty('--surface-border', surface.border);
    }
    state.currentThemeIndex = themeIndex;
    try { localStorage.setItem('amini_theme', themeIndex.toString()); } catch (e) {}
    document.querySelectorAll('.theme-card').forEach((card, idx) => 
        card.classList.toggle('active', idx === themeIndex)
    );
}

export function setThemeMode(mode) {
    state.currentThemeMode = mode;
    document.body.classList.toggle('dark-theme', mode === 'dark');
    try { localStorage.setItem('amini_mode', mode); } catch (e) {}
    document.querySelectorAll('.mode-btn').forEach(btn => 
        btn.classList.toggle('active', btn.dataset.mode === mode)
    );
    applyTheme(state.currentThemeIndex);
    renderThemesGrid();
}

export function loadSavedTheme() {
    try {
        const savedMode = localStorage.getItem('amini_mode');
        if (savedMode === 'dark' || savedMode === 'light') state.currentThemeMode = savedMode;
    } catch (e) {}
    try {
        const saved = localStorage.getItem('amini_theme');
        if (saved !== null) {
            const idx = parseInt(saved, 10);
            if (!isNaN(idx) && idx >= 0 && idx < THEMES.length) state.currentThemeIndex = idx;
        }
    } catch (e) {}
    setThemeMode(state.currentThemeMode);
    applyTheme(state.currentThemeIndex);
}

export function renderThemesGrid() {
    const grid = document.getElementById('themesGrid');
    if (!grid) return;
    grid.innerHTML = '';
    const isDark = state.currentThemeMode === 'dark';
    THEMES.forEach((theme, idx) => {
        const card = document.createElement('div');
        card.className = 'theme-card';
        card.style.background = isDark ? theme.wallpaperDark : theme.wallpaper;
        if (idx === state.currentThemeIndex) card.classList.add('active');
        const nameDiv = document.createElement('div');
        nameDiv.className = 'theme-name';
        nameDiv.textContent = theme.name;
        card.appendChild(nameDiv);
        const preview = document.createElement('div');
        preview.className = 'theme-preview';
        const otherBubble = document.createElement('div');
        otherBubble.className = 'theme-preview-bubble';
        otherBubble.textContent = 'Hi!';
        if (isDark) { otherBubble.style.background = '#182533'; otherBubble.style.color = 'white'; }
        preview.appendChild(otherBubble);
        const meBubble = document.createElement('div');
        meBubble.className = 'theme-preview-bubble me';
        meBubble.style.background = isDark ? theme.bubbleMeDark : theme.bubbleMe;
        if (isDark) meBubble.style.color = 'white';
        meBubble.textContent = 'Hey!';
        preview.appendChild(meBubble);
        card.appendChild(preview);
        card.onclick = () => applyTheme(idx);
        grid.appendChild(card);
    });
}