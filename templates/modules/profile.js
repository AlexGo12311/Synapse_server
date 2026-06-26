import { state } from './state.js';
import { t } from './i18n.js';
import { hashStringToColor, getInitials } from './utils.js';

const chatElements = ['chatHeader', 'log', 'inputArea', 'chatSearchPanel', 'replyPreview'];

// 🆕 Форматирование даты с учётом языка
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

export async function openProfile(userId) {
    const welcomeScreen = document.getElementById('welcomeScreen');
    if (welcomeScreen && welcomeScreen.style.display !== 'none') {
        welcomeScreen.style.display = 'none';
    }
    
    chatElements.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.display = 'none';
    });
    
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
        
        // Аватарка
        const avatar = document.getElementById('profileAvatar');
        if (avatar) {
            avatar.style.backgroundColor = hashStringToColor(profile.username);
            avatar.textContent = getInitials(profile.username);
        }
        
        // Имя
        const nameEl = document.getElementById('profileName');
        if (nameEl) nameEl.textContent = profile.username;
        
        // Статус
        const isMyProfile = userId === state.userId;
        const statusEl = document.getElementById('profileStatus');
        const statusTextEl = document.getElementById('profileStatusText');
        
        if (statusEl && statusTextEl) {
            let isOnline = false;
            let statusText = '';
            
            if (isMyProfile) {
                isOnline = true;
                statusText = t('online');
            } else {
                isOnline = state.onlineStatuses.get(userId) === 'online';
                statusText = isOnline ? t('online') : t('offline');
            }
            
            statusTextEl.textContent = statusText;
            statusEl.className = `profile-status ${isOnline ? 'online' : 'offline'}`;
        }
        
        // 🆕 Location
        const locationField = document.getElementById('profileLocationField');
        const locationEl = document.getElementById('profileLocation');
        const locationEdit = document.getElementById('profileLocationEdit');
        const hasLocation = profile.location && profile.location.trim() !== '';
        
        if (locationField) locationField.style.display = hasLocation ? 'block' : 'none';
        if (locationEl) {
            locationEl.textContent = profile.location || '';
            locationEl.style.display = 'block';
        }
        if (locationEdit) {
            locationEdit.value = profile.location || '';
            locationEdit.style.display = 'none';
        }
        
        // 🆕 Birthday
        const birthdayField = document.getElementById('profileBirthdayField');
        const birthdayEl = document.getElementById('profileBirthday');
        const birthdayEdit = document.getElementById('profileBirthdayEdit');
        const hasBirthday = profile.birthday && profile.birthday.trim() !== '';
        
        if (birthdayField) birthdayField.style.display = hasBirthday ? 'block' : 'none';
        if (birthdayEl) {
            birthdayEl.textContent = formatBirthday(profile.birthday);
            birthdayEl.style.display = 'block';
        }
        if (birthdayEdit) {
            birthdayEdit.value = profile.birthday || '';
            birthdayEdit.style.display = 'none';
        }
        
        // Bio
        const bioField = document.getElementById('profileBioField');
        const bioEl = document.getElementById('profileBio');
        const bioEdit = document.getElementById('profileBioEdit');
        const hasBio = profile.bio && profile.bio.trim() !== '';
        
        if (bioField) bioField.style.display = hasBio ? 'block' : 'none';
        if (bioEl) {
            bioEl.textContent = profile.bio || '';
            bioEl.style.display = 'block';
        }
        if (bioEdit) {
            bioEdit.value = profile.bio || '';
            bioEdit.style.display = 'none';
        }
        
        // Кнопки — Edit Profile для своего профиля (даже если всё пустое)
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
    // Показываем все поля в режиме редактирования
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
    
    try {
        const res = await fetch('http://localhost:8080/profile/update', {
            method: 'POST',
            headers: {
                "Authorization": "Bearer " + state.token,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ bio, location, birthday })
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