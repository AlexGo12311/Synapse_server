package handlers

import (
	"Synapse_server/models"
	"Synapse_server/storage"
	"encoding/json"
	"net/http"
)

// ===== REGISTER =====
func Register(w http.ResponseWriter, r *http.Request) {
	var input models.User

	err := json.NewDecoder(r.Body).Decode(&input)
	if err != nil {
		http.Error(w, "Invalid request", http.StatusBadRequest)
		return
	}

	// создаём пользователя в БД
	user, err := storage.CreateUser(input.Username, input.Password)
	if err != nil {
		http.Error(w, "User already exists", http.StatusConflict)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(user)
}

// ===== LOGIN =====
func Login(w http.ResponseWriter, r *http.Request) {

	var input struct {
		Username string `json:"username"`
		Password string `json:"password"`
	}

	err := json.NewDecoder(r.Body).Decode(&input)
	if err != nil {
		http.Error(w, "Invalid request", http.StatusBadRequest)
		return
	}

	// получаем пользователя из БД
	user, err := storage.GetUserByUsername(input.Username)
	if err != nil || user == nil {
		http.Error(w, "User not found", http.StatusNotFound)
		return
	}

	// проверяем пароль
	if user.Password != input.Password {
		http.Error(w, "Invalid credentials", http.StatusUnauthorized)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(user)
}
