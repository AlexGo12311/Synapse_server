package handlers

import (
	"Synapse_server/models"
	"Synapse_server/storage"
	"encoding/json"
	"net/http"

	"github.com/google/uuid"
)

// ===== REGISTER =====
func Register(w http.ResponseWriter, r *http.Request) {
	var user models.User

	err := json.NewDecoder(r.Body).Decode(&user)
	if err != nil {
		http.Error(w, "Invalid request", http.StatusBadRequest)
		return
	}

	storage.UsersMutex.Lock()
	defer storage.UsersMutex.Unlock()

	// проверка: существует ли username
	if _, exists := storage.UsersByUsername[user.Username]; exists {
		http.Error(w, "User already exists", http.StatusConflict)
		return
	}

	// генерируем ID
	user.ID = uuid.New().String()

	// сохраняем в ОБЕ карты
	storage.UsersByID[user.ID] = &user
	storage.UsersByUsername[user.Username] = &user

	// ответ
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(user)
}

// ===== LOGIN =====
func Login(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Username string `json:"username"`
		Password string `json:"password"`
	}

	err := json.NewDecoder(r.Body).Decode(&req)
	if err != nil {
		http.Error(w, "Invalid request", http.StatusBadRequest)
		return
	}

	storage.UsersMutex.Lock()
	user, ok := storage.UsersByUsername[req.Username]
	storage.UsersMutex.Unlock()

	if !ok || user.Password != req.Password {
		http.Error(w, "Invalid credentials", http.StatusUnauthorized)
		return
	}

	// возвращаем пользователя (с ID)
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(user)
}
