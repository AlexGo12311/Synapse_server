import { state } from './state.js';
import { t } from './i18n.js';
import { hashStringToColor, getInitials } from './utils.js';

const chatElements = ['chatHeader', 'log', 'inputArea', 'chatSearchPanel', 'replyPreview'];

const PROFILE_COLORS = [
    'red', 'blue', 'green', 'purple', 'orange', 'teal', 'pink', 'indigo',
    'ocean', 'sunset', 'forest', 'fire', 'night', 'candy', 'aurora', 'rose'
];

// 🆕 Хранилище для карт (чтобы корректно уничтожать)
let previewMap = null;
let editMap = null;
let editMarker = null;
let geocodeTimeout = null;

// Координаты по умолчанию (центр Европы)
const DEFAULT_CENTER = [50.0, 10.0];
const DEFAULT_ZOOM = 4;

function formatBirthday(dateStr) {
    if (!dateStr) return '';
    try {
        const [year, month, day] = dateStr.split('-').map(Number);
        if (!year || !month || !day) return dateStr;
        const months = t('months');
        if (Array.isArray(months) && months[month - 1]) {
            if (state.currentLang === 'ru') {
                return `${day} ${months[month - 1]} ${year}`;
            } else {
                return `${months[month - 1]} ${day}, ${year}`;
            }
        }
        return dateStr;
    } catch (e) {
        return dateStr;
    }
}

function showHeroOrPlain(hasColor, username, isOnline, statusText) {
    const hero = document.getElementById('profileHero');
    const plain = document.getElementById('profilePlainSection');
    
    if (hasColor) {
        if (hero) { hero.style.display = 'flex'; hero.dataset.color = hasColor; }
        if (plain) plain.style.display = 'none';
        
        const avatar = document.getElementById('profileAvatar');
        if (avatar) {
            avatar.style.backgroundColor = hashStringToColor(username);
            avatar.textContent = getInitials(username);
        }
        const name = document.getElementById('profileName');
        if (name) name.textContent = username;
        
        const statusEl = document.getElementById('profileStatus');
        const statusTextEl = document.getElementById('profileStatusText');
        if (statusEl && statusTextEl) {
            statusTextEl.textContent = statusText;
            statusEl.className = `profile-status ${isOnline ? 'online' : 'offline'}`;
        }
    } else {
        if (hero) hero.style.display = 'none';
        if (plain) plain.style.display = 'flex';
        
        const avatar = document.getElementById('profileAvatarPlain');
        if (avatar) {
            avatar.style.backgroundColor = hashStringToColor(username);
            avatar.textContent = getInitials(username);
        }
        const name = document.getElementById('profileNamePlain');
        if (name) name.textContent = username;
        
        const statusEl = document.getElementById('profileStatusPlain');
        const statusTextEl = document.getElementById('profileStatusTextPlain');
        if (statusEl && statusTextEl) {
            statusTextEl.textContent = statusText;
            statusEl.className = `profile-status ${isOnline ? 'online' : 'offline'}`;
        }
    }
}

function renderColorPalette(selectedColor) {
    const palette = document.getElementById('profileColorPalette');
    if (!palette) return;
    palette.innerHTML = '';
    
    const noneSwatch = document.createElement('div');
    noneSwatch.className = 'color-swatch' + (!selectedColor ? ' active' : '');
    noneSwatch.dataset.color = 'none';
    noneSwatch.onclick = () => selectColor('');
    palette.appendChild(noneSwatch);
    
    PROFILE_COLORS.forEach(color => {
        const swatch = document.createElement('div');
        swatch.className = 'color-swatch' + (selectedColor === color ? ' active' : '');
        swatch.dataset.color = color;
        swatch.onclick = () => selectColor(color);
        palette.appendChild(swatch);
    });
}

let pendingColor = '';
let pendingLatitude = 0;
let pendingLongitude = 0;

function selectColor(color) {
    pendingColor = color;
    
    document.querySelectorAll('.color-swatch').forEach(s => {
        const isNone = s.dataset.color === 'none';
        if (isNone) {
            s.classList.toggle('active', color === '');
        } else {
            s.classList.toggle('active', s.dataset.color === color);
        }
    });
    
    const heroName = document.getElementById('profileName');
    const plainName = document.getElementById('profileNamePlain');
    const username = (heroName && heroName.textContent.trim()) || 
                     (plainName && plainName.textContent.trim()) || '';
    
    const heroStatus = document.getElementById('profileStatus');
    const plainStatus = document.getElementById('profileStatusPlain');
    const statusEl = (heroStatus && heroStatus.offsetParent !== null) ? heroStatus : plainStatus;
    const isOnline = statusEl?.classList.contains('online') || false;
    
    const heroStatusText = document.getElementById('profileStatusText');
    const plainStatusText = document.getElementById('profileStatusTextPlain');
    const statusText = (heroStatusText && heroStatusText.textContent) || 
                       (plainStatusText && plainStatusText.textContent) || '';
    
    showHeroOrPlain(color, username, isOnline, statusText);
}

// 🆕 Инициализация мини-карты для просмотра
function initPreviewMap(lat, lon) {
    destroyMaps();
    
    if (typeof L === 'undefined') {
        console.warn('Leaflet not loaded');
        return;
    }
    
    const container = document.getElementById('profileMapPreview');
    if (!container) return;
    
    if (lat === 0 && lon === 0) {
        container.style.display = 'none';
        return;
    }
    
    container.style.display = 'block';
    
    previewMap = L.map(container, {
        center: [lat, lon],
        zoom: 13,
        zoomControl: false,
        attributionControl: false,
        dragging: false,
        touchZoom: false,
        scrollWheelZoom: false,
        doubleClickZoom: false,
        boxZoom: false,
        keyboard: false
    });
    
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19
    }).addTo(previewMap);
    
    L.marker([lat, lon]).addTo(previewMap);
    
    // Небольшая задержка для корректного рендера
    setTimeout(() => previewMap.invalidateSize(), 100);
}

// 🆕 Инициализация интерактивной карты для редактирования
function initEditMap(lat, lon) {
    if (typeof L === 'undefined') {
        console.warn('Leaflet not loaded');
        return;
    }
    
    const container = document.getElementById('profileMapEditContainer');
    const mapContainer = document.getElementById('profileMapEdit');
    if (!container || !mapContainer) return;
    
    container.style.display = 'block';
    
    // Начальная позиция: или сохранённая, или центр мира
    const hasValidCoords = lat !== 0 || lon !== 0;
    const initialCenter = hasValidCoords ? [lat, lon] : DEFAULT_CENTER;
    const initialZoom = hasValidCoords ? 13 : DEFAULT_ZOOM;
    
    editMap = L.map(mapContainer, {
        center: initialCenter,
        zoom: initialZoom
    });
    
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '© OpenStreetMap'
    }).addTo(editMap);
    
    // Если есть координаты — ставим маркер
    if (hasValidCoords) {
        editMarker = L.marker([lat, lon], { draggable: true }).addTo(editMap);
        setupMarkerHandlers();
    }
    
    // Клик по карте — установка нового маркера
    editMap.on('click', async (e) => {
        const { lat, lng } = e.latlng;
        setMarkerAtPosition(lat, lng);
        await reverseGeocode(lat, lng);
    });
    
    setTimeout(() => editMap.invalidateSize(), 100);
}

function setMarkerAtPosition(lat, lon) {
    if (!editMap) return;
    
    pendingLatitude = lat;
    pendingLongitude = lon;
    
    if (editMarker) {
        editMarker.setLatLng([lat, lon]);
    } else {
        editMarker = L.marker([lat, lon], { draggable: true }).addTo(editMap);
        setupMarkerHandlers();
    }
}

function setupMarkerHandlers() {
    if (!editMarker) return;
    
    // Drag маркера — обратное геокодирование с debounce
    editMarker.on('dragend', async () => {
        const pos = editMarker.getLatLng();
        pendingLatitude = pos.lat;
        pendingLongitude = pos.lng;
        
        // Debounce: ждём 800мс перед геокодированием
        if (geocodeTimeout) clearTimeout(geocodeTimeout);
        geocodeTimeout = setTimeout(async () => {
            await reverseGeocode(pos.lat, pos.lng);
        }, 800);
    });
}

// 🆕 Обратное геокодирование: координаты → адрес
async function reverseGeocode(lat, lon) {
    try {
        const lang = state.currentLang || 'en';
        const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&accept-language=${lang}`;
        
        const res = await fetch(url, {
            headers: { 'User-Agent': 'AminiChat/1.0' }
        });
        
        if (!res.ok) return;
        
        const data = await res.json();
        if (data && data.display_name) {
            // Сокращаем адрес: берём только город/страну
            const parts = data.display_name.split(',').map(p => p.trim());
            // Берём город и страну (обычно первые и последние части)
            const shortAddress = parts.length > 2 
                ? `${parts[0]}, ${parts[parts.length - 1]}`
                : data.display_name;
            
            const input = document.getElementById('profileLocationEdit');
            if (input) {
                input.value = shortAddress;
            }
        }
    } catch (e) {
        console.error('Reverse geocode error:', e);
    }
}

// 🆕 Forward geocoding: адрес → координаты (при вводе в input)
async function forwardGeocode(address) {
    if (!address || address.trim().length < 3) {
        // Если адрес очищен — сбрасываем координаты
        pendingLatitude = 0;
        pendingLongitude = 0;
        if (editMarker && editMap) {
            editMap.removeLayer(editMarker);
            editMarker = null;
        }
        return;
    }
    
    try {
        const lang = state.currentLang || 'en';
        const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(address)}&limit=1&accept-language=${lang}`;
        
        const res = await fetch(url, {
            headers: { 'User-Agent': 'AminiChat/1.0' }
        });
        
        if (!res.ok) return;
        
        const data = await res.json();
        if (data && data.length > 0) {
            const lat = parseFloat(data[0].lat);
            const lon = parseFloat(data[0].lon);
            
            if (editMap) {
                editMap.setView([lat, lon], 13);
                setMarkerAtPosition(lat, lon);
            }
        }
    } catch (e) {
        console.error('Forward geocode error:', e);
    }
}

// 🆕 Уничтожение карт при закрытии
function destroyMaps() {
    if (geocodeTimeout) {
        clearTimeout(geocodeTimeout);
        geocodeTimeout = null;
    }
    
    if (previewMap) {
        previewMap.remove();
        previewMap = null;
    }
    
    if (editMap) {
        editMap.remove();
        editMap = null;
        editMarker = null;
    }
}

export async function openProfile(userId) {
    const welcomeScreen = document.getElementById('welcomeScreen');
    if (welcomeScreen && welcomeScreen.style.display !== 'none') {
        welcomeScreen.style.display = 'none';
    }
    
    chatElements.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.display = 'none';
    });
    
    // 🆕 Уничтожаем старые карты перед открытием
    destroyMaps();
    
    const profileView = document.getElementById('profileView');
    if (!profileView) return;
    
    try {
        const res = await fetch(`http://localhost:8080/profile?user_id=${userId}`, {
            headers: { "Authorization": "Bearer " + state.token }
        });
        
        if (!res.ok) {
            console.error("Failed to load profile");
            closeProfile();
            return;
        }
        
        const profile = await res.json();
        
        const isMyProfile = userId === state.userId;
        let isOnline = false;
        let statusText = '';
        
        if (isMyProfile) {
            isOnline = true;
            statusText = t('online');
        } else {
            isOnline = state.onlineStatuses.get(userId) === 'online';
            statusText = isOnline ? t('online') : t('offline');
        }
        
        const profileColor = profile.profile_color || '';
        showHeroOrPlain(profileColor, profile.username, isOnline, statusText);
        
        const colorField = document.getElementById('profileColorField');
        if (colorField) colorField.style.display = 'none';
        
        pendingColor = profileColor;
        pendingLatitude = profile.latitude || 0;
        pendingLongitude = profile.longitude || 0;
        
        // Location
        const locationField = document.getElementById('profileLocationField');
        const locationEl = document.getElementById('profileLocation');
        const locationEdit = document.getElementById('profileLocationEdit');
        const mapPreview = document.getElementById('profileMapPreview');
        const mapEditContainer = document.getElementById('profileMapEditContainer');
        
        const hasLocation = profile.location && profile.location.trim() !== '';
        
        if (locationField) locationField.style.display = hasLocation ? 'block' : 'none';
        if (locationEl) { locationEl.textContent = profile.location || ''; locationEl.style.display = 'block'; }
        if (locationEdit) { locationEdit.value = profile.location || ''; locationEdit.style.display = 'none'; }
        
        // Скрываем карту редактирования
        if (mapEditContainer) mapEditContainer.style.display = 'none';
        
        // 🆕 Инициализируем мини-карту просмотра
        if (mapPreview) {
            if (profile.latitude && profile.longitude) {
                // Даём время DOM обновиться
                setTimeout(() => initPreviewMap(profile.latitude, profile.longitude), 200);
            } else {
                mapPreview.style.display = 'none';
            }
        }
        
        // Birthday
        const birthdayField = document.getElementById('profileBirthdayField');
        const birthdayEl = document.getElementById('profileBirthday');
        const birthdayEdit = document.getElementById('profileBirthdayEdit');
        const hasBirthday = profile.birthday && profile.birthday.trim() !== '';
        
        if (birthdayField) birthdayField.style.display = hasBirthday ? 'block' : 'none';
        if (birthdayEl) { birthdayEl.textContent = formatBirthday(profile.birthday); birthdayEl.style.display = 'block'; }
        if (birthdayEdit) { birthdayEdit.value = profile.birthday || ''; birthdayEdit.style.display = 'none'; }
        
        // Bio
        const bioField = document.getElementById('profileBioField');
        const bioEl = document.getElementById('profileBio');
        const bioEdit = document.getElementById('profileBioEdit');
        const hasBio = profile.bio && profile.bio.trim() !== '';
        
        if (bioField) bioField.style.display = hasBio ? 'block' : 'none';
        if (bioEl) { bioEl.textContent = profile.bio || ''; bioEl.style.display = 'block'; }
        if (bioEdit) { bioEdit.value = profile.bio || ''; bioEdit.style.display = 'none'; }
        
        // Кнопки
        const editBtn = document.getElementById('profileEditBtn');
        const saveBtn = document.getElementById('profileSaveBtn');
        const cancelBtn = document.getElementById('profileCancelBtn');
        
        if (editBtn) editBtn.style.display = isMyProfile ? 'block' : 'none';
        if (saveBtn) saveBtn.style.display = 'none';
        if (cancelBtn) cancelBtn.style.display = 'none';
        
        profileView.dataset.profileUserId = userId;
        profileView.style.display = 'flex';
    } catch (e) {
        console.error("Open profile error:", e);
        closeProfile();
    }
}

export function closeProfile() {
    // 🆕 Уничтожаем карты при закрытии
    destroyMaps();
    
    const profileView = document.getElementById('profileView');
    if (profileView) profileView.style.display = 'none';
    
    if (state.activeTargetId) {
        document.getElementById('chatHeader').style.display = 'flex';
        document.getElementById('log').style.display = 'flex';
        document.getElementById('inputArea').style.display = 'flex';
    } else {
        const welcomeScreen = document.getElementById('welcomeScreen');
        if (welcomeScreen) welcomeScreen.style.display = 'flex';
    }
}

export function startEditProfile() {
    const fields = [
        { field: 'profileLocationField', view: 'profileLocation', edit: 'profileLocationEdit' },
        { field: 'profileBirthdayField', view: 'profileBirthday', edit: 'profileBirthdayEdit' },
        { field: 'profileBioField', view: 'profileBio', edit: 'profileBioEdit' }
    ];
    
    fields.forEach(({ field, view, edit }) => {
        const fieldEl = document.getElementById(field);
        const viewEl = document.getElementById(view);
        const editEl = document.getElementById(edit);
        if (fieldEl) fieldEl.style.display = 'block';
        if (viewEl) viewEl.style.display = 'none';
        if (editEl) editEl.style.display = 'block';
    });
    
    // Скрываем мини-карту просмотра
    const mapPreview = document.getElementById('profileMapPreview');
    if (mapPreview) mapPreview.style.display = 'none';
    
    // 🆕 Показываем палитру цветов
    const colorField = document.getElementById('profileColorField');
    if (colorField) {
        colorField.style.display = 'block';
        renderColorPalette(pendingColor);
    }
    
    // 🆕 Инициализируем интерактивную карту
    setTimeout(() => {
        initEditMap(pendingLatitude, pendingLongitude);
        
        // Подключаем forward geocoding к input
        const locationInput = document.getElementById('profileLocationEdit');
        if (locationInput) {
            locationInput.addEventListener('change', (e) => {
                if (geocodeTimeout) clearTimeout(geocodeTimeout);
                geocodeTimeout = setTimeout(() => {
                    forwardGeocode(e.target.value);
                }, 600);
            });
        }
    }, 200);
    
    document.getElementById('profileEditBtn').style.display = 'none';
    document.getElementById('profileSaveBtn').style.display = 'block';
    document.getElementById('profileCancelBtn').style.display = 'block';
}

export function cancelEditProfile() {
    const profileView = document.getElementById('profileView');
    const userId = profileView?.dataset.profileUserId;
    if (userId) openProfile(userId);
}

export async function saveProfile() {
    const profileView = document.getElementById('profileView');
    const userId = profileView?.dataset.profileUserId;
    if (!userId) return;
    
    const bio = document.getElementById('profileBioEdit')?.value.trim() || '';
    const location = document.getElementById('profileLocationEdit')?.value.trim() || '';
    const birthday = document.getElementById('profileBirthdayEdit')?.value || '';
    
    // 🆕 Сбрасываем координаты если адрес пустой
    const finalLat = location ? pendingLatitude : 0;
    const finalLon = location ? pendingLongitude : 0;
    
    try {
        const res = await fetch('http://localhost:8080/profile/update', {
            method: 'POST',
            headers: {
                "Authorization": "Bearer " + state.token,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ 
                bio, 
                location, 
                birthday, 
                profile_color: pendingColor,
                latitude: finalLat,
                longitude: finalLon
            })
        });
        
        if (res.ok) {
            openProfile(userId);
        } else {
            console.error("Failed to save profile");
        }
    } catch (e) {
        console.error("Save profile error:", e);
    }
}

export function initProfile() {
    document.getElementById('profileBackBtn')?.addEventListener('click', closeProfile);
    document.getElementById('profileEditBtn')?.addEventListener('click', startEditProfile);
    document.getElementById('profileSaveBtn')?.addEventListener('click', saveProfile);
    document.getElementById('profileCancelBtn')?.addEventListener('click', cancelEditProfile);
}