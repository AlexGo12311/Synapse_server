import { AVATAR_COLORS } from './state.js';

export function formatTime(timeInput) {
    let d;
    if (timeInput) {
        const ts = timeInput > 1e12 ? timeInput : timeInput * 1000;
        d = new Date(ts);
    } else d = new Date();
    if (isNaN(d.getTime())) d = new Date();
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export function hashStringToColor(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash);
    return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

export function getInitials(username) {
    if (!username) return "?";
    const clean = username.trim();
    if (clean.length <= 2) return clean.toUpperCase();
    return clean.substring(0, 2).toUpperCase();
}

export function createAvatarElement(username, sizeClass = "") {
    const div = document.createElement("div");
    div.className = `avatar ${sizeClass}`.trim();
    div.style.backgroundColor = hashStringToColor(username);
    div.textContent = getInitials(username);
    return div;
}

export function updateAvatar(avatarEl, username) {
    if (!avatarEl) return;
    avatarEl.style.backgroundColor = hashStringToColor(username);
    avatarEl.textContent = getInitials(username);
}

export function xorHexStrings(hex1, hex2) {
    const len = Math.min(hex1.length, hex2.length);
    let result = '';
    for (let i = 0; i < len; i++) {
        result += (parseInt(hex1[i], 16) ^ parseInt(hex2[i], 16)).toString(16).toUpperCase();
    }
    return result;
}

export function getLogDiv() {
    return document.getElementById("log");
}

export function getAuthErrorDiv() {
    return document.getElementById("authError");
}