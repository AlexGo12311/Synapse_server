package handlers

import (
	"Synapse_server/storage"
	"Synapse_server/utils"
	"encoding/json"
	"net/http"

	"golang.org/x/crypto/bcrypt"
)

// ===== REGISTER =====
func Register(w http.ResponseWriter, r *http.Request) {

	var input struct {
		Username string `json:"username"`
		Password string `json:"password"`
	}

	// decode + validate request
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		http.Error(w, "Invalid request", http.StatusBadRequest)
		return
	}

	if input.Username == "" || input.Password == "" {
		http.Error(w, "Username and password required", http.StatusBadRequest)
		return
	}

	// hash password
	hashedPassword, err := bcrypt.GenerateFromPassword([]byte(input.Password), bcrypt.DefaultCost)
	if err != nil {
		http.Error(w, "Password hashing error", http.StatusInternalServerError)
		return
	}

	// create user
	user, err := storage.CreateUser(input.Username, string(hashedPassword))
	if err != nil {
		http.Error(w, "User already exists", http.StatusConflict)
		return
	}

	// безопасный response (БЕЗ пароля)
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]any{
		"id":       user.ID,
		"username": user.Username,
	})
}

// ===== LOGIN =====
func Login(w http.ResponseWriter, r *http.Request) {

	var input struct {
		Username string `json:"username"`
		Password string `json:"password"`
	}

	// decode + validate
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		http.Error(w, "Invalid request", http.StatusBadRequest)
		return
	}

	if input.Username == "" || input.Password == "" {
		http.Error(w, "Username and password required", http.StatusBadRequest)
		return
	}

	// get user
	user, err := storage.GetUserByUsername(input.Username)
	if err != nil || user == nil {
		http.Error(w, "User not found", http.StatusNotFound)
		return
	}

	// compare bcrypt password
	err = bcrypt.CompareHashAndPassword([]byte(user.Password), []byte(input.Password))
	if err != nil {
		http.Error(w, "Invalid credentials", http.StatusUnauthorized)
		return
	}

	// generate JWT
	token, err := utils.GenerateToken(user.ID)
	if err != nil {
		http.Error(w, "Token generation error", http.StatusInternalServerError)
		return
	}

	// response
	w.Header().Set("Content-Type", "application/json")

	json.NewEncoder(w).Encode(map[string]any{
		"id":    user.ID,
		"token": token,
	})
}
