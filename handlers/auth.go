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
		http.Error(w, "Invalid data", http.StatusBadRequest)
		return
	}

	storage.UsersMutex.Lock()
	defer storage.UsersMutex.Unlock()

	if _, exists := storage.Users[user.Username]; exists {
		http.Error(w, "User already exists", http.StatusBadRequest)
		return
	}

	user.ID = uuid.New().String()
	storage.Users[user.Username] = user

	json.NewEncoder(w).Encode(user)
}

// ===== LOGIN =====
func Login(w http.ResponseWriter, r *http.Request) {
	var req models.User

	err := json.NewDecoder(r.Body).Decode(&req)
	if err != nil {
		http.Error(w, "Invalid data", http.StatusBadRequest)
		return
	}

	storage.UsersMutex.Lock()
	defer storage.UsersMutex.Unlock()

	user, exists := storage.Users[req.Username]
	if !exists || user.Password != req.Password {
		http.Error(w, "Invalid credentials", http.StatusUnauthorized)
		return
	}

	json.NewEncoder(w).Encode(user)
}
