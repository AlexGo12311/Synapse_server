import { state } from './state.js';
import { hashStringToColor, getInitials } from './utils.js';

// Элементы чата которые нужно скрывать
const chatElements = ['chatHeader', 'log', 'inputArea', 'chatSearchPanel', 'replyPreview'];

export async function openProfile(userId) {
    // Скрываем чат
    chatElements.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.display = 'none';
    });
    
    // Показываем профиль
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
        
        // Username
        document.getElementById('profileUsername').textContent = profile.username;
        
        // 🆕 Bio: показываем секцию только если bio не пустое
        const bioField = document.getElementById('profileBioField');
        const bioEl = document.getElementById('profileBio');
        const bioEdit = document.getElementById('profileBioEdit');
        
        const hasBio = profile.bio && profile.bio.trim() !== '';
        
        if (bioField) {
            bioField.style.display = hasBio ? 'block' : 'none';
        }
        
        if (bioEl) {
            bioEl.textContent = profile.bio || '';
            bioEl.style.display = 'block';
        }
        
        if (bioEdit) {
            bioEdit.value = profile.bio || '';
            bioEdit.style.display = 'none';
        }
        
        // Кнопки редактирования только для своего профиля и только если bio не пустое
        const isMyProfile = userId === state.userId;
        const editBtn = document.getElementById('profileEditBtn');
        const saveBtn = document.getElementById('profileSaveBtn');
        const cancelBtn = document.getElementById('profileCancelBtn');
        
        if (editBtn) {
            editBtn.style.display = (isMyProfile && hasBio) ? 'block' : 'none';
        }
        if (saveBtn) saveBtn.style.display = 'none';
        if (cancelBtn) cancelBtn.style.display = 'none';
        
        // Для своего профиля без bio — показываем Edit чтобы можно было добавить
        if (isMyProfile && !hasBio && editBtn) {
            editBtn.style.display = 'block';
            editBtn.textContent = '✏️ Add Bio';
        } else if (isMyProfile && editBtn) {
            editBtn.textContent = '✏️ Edit Bio';
        }
        
        // Сохраняем ID текущего профиля
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
    
    // Возвращаем чат обратно
    if (state.activeTargetId) {
        // Если был открыт чат — показываем элементы чата
        document.getElementById('chatHeader').style.display = 'flex';
        document.getElementById('log').style.display = 'flex';
        document.getElementById('inputArea').style.display = 'flex';
    } else {
        // Если чат не был открыт — показываем welcome screen
        document.getElementById('welcomeScreen').style.display = 'flex';
    }
}

export function startEditBio() {
    const bioEl = document.getElementById('profileBio');
    const bioEdit = document.getElementById('profileBioEdit');
    const bioField = document.getElementById('profileBioField');
    const editBtn = document.getElementById('profileEditBtn');
    const saveBtn = document.getElementById('profileSaveBtn');
    const cancelBtn = document.getElementById('profileCancelBtn');
    
    // Показываем поле bio при редактировании, даже если оно было пустым
    if (bioField) bioField.style.display = 'block';
    if (bioEl) bioEl.style.display = 'none';
    if (bioEdit) {
        bioEdit.style.display = 'block';
        bioEdit.focus();
        bioEdit.setSelectionRange(bioEdit.value.length, bioEdit.value.length);
    }
    
    if (editBtn) editBtn.style.display = 'none';
    if (saveBtn) saveBtn.style.display = 'block';
    if (cancelBtn) cancelBtn.style.display = 'block';
}

export function cancelEditBio() {
    const profileView = document.getElementById('profileView');
    const userId = profileView?.dataset.profileUserId;
    if (userId) openProfile(userId);
}

export async function saveBio() {
    const profileView = document.getElementById('profileView');
    const userId = profileView?.dataset.profileUserId;
    const bioEdit = document.getElementById('profileBioEdit');
    
    if (!bioEdit || !userId) return;
    
    const newBio = bioEdit.value.trim();
    
    try {
        const res = await fetch('http://localhost:8080/profile/bio', {
            method: 'POST',
            headers: {
                "Authorization": "Bearer " + state.token,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ bio: newBio })
        });
        
        if (res.ok) {
            openProfile(userId);
        } else {
            console.error("Failed to save bio");
        }
    } catch (e) {
        console.error("Save bio error:", e);
    }
}

export function initProfile() {
    document.getElementById('profileBackBtn')?.addEventListener('click', closeProfile);
    document.getElementById('profileEditBtn')?.addEventListener('click', startEditBio);
    document.getElementById('profileSaveBtn')?.addEventListener('click', saveBio);
    document.getElementById('profileCancelBtn')?.addEventListener('click', cancelEditBio);
}