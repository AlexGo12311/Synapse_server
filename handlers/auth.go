package handlers

import (
	"Synapse_server/auth"
	"encoding/json"
	"net/http"

	"golang.org/x/crypto/bcrypt"
)

// ===== REGISTER =====
func (s *Server) Register(w http.ResponseWriter, r *http.Request) {

	var input struct {
		Username string `json:"username"`
		Password string `json:"password"`
	}

	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		http.Error(w, "Invalid request", http.StatusBadRequest)
		return
	}

	if input.Username == "" || input.Password == "" {
		http.Error(w, "Username and password required", http.StatusBadRequest)
		return
	}

	hashedPassword, err := bcrypt.GenerateFromPassword([]byte(input.Password), bcrypt.DefaultCost)
	if err != nil {
		http.Error(w, "Password hashing error", http.StatusInternalServerError)
		return
	}

	user, err := s.store.CreateUser(input.Username, string(hashedPassword))
	if err != nil {
		http.Error(w, "User already exists", http.StatusConflict)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]any{
		"id":       user.ID,
		"username": user.Username,
	})
}

// ===== LOGIN =====
func (s *Server) Login(w http.ResponseWriter, r *http.Request) {

	var input struct {
		Username string `json:"username"`
		Password string `json:"password"`
	}

	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		http.Error(w, "Invalid request", http.StatusBadRequest)
		return
	}

	if input.Username == "" || input.Password == "" {
		http.Error(w, "Username and password required", http.StatusBadRequest)
		return
	}

	user, err := s.store.GetUserByUsername(input.Username)
	if err != nil || user == nil {
		http.Error(w, "User not found", http.StatusNotFound)
		return
	}

	err = bcrypt.CompareHashAndPassword([]byte(user.Password), []byte(input.Password))
	if err != nil {
		http.Error(w, "Invalid credentials", http.StatusUnauthorized)
		return
	}

	token, err := auth.GenerateToken(user.ID)
	if err != nil {
		http.Error(w, "Token generation error", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")

	json.NewEncoder(w).Encode(map[string]any{
		"id":    user.ID,
		"token": token,
	})
}
