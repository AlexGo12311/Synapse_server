package handlers

import (
	"Synapse_server/auth"
	"encoding/json"
	"net/http"
)

type ProfileResponse struct {
	UserID   string `json:"user_id"`
	Username string `json:"username"`
	Bio      string `json:"bio"`
}

type UpdateBioRequest struct {
	Bio string `json:"bio"`
}

// GetProfile возвращает профиль пользователя по ID
// GET /profile?user_id=xxx
func (s *Server) GetProfile(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	// Текущий пользователь (из токена)
	userIDRaw := r.Context().Value(auth.UserContextKey)
	_, ok := userIDRaw.(string)
	if !ok {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	// ID пользователя чей профиль смотрим
	targetID := r.URL.Query().Get("user_id")
	if targetID == "" {
		http.Error(w, "user_id required", http.StatusBadRequest)
		return
	}

	username, bio, err := s.store.GetProfile(targetID)
	if err != nil {
		http.Error(w, "User not found", http.StatusNotFound)
		return
	}

	json.NewEncoder(w).Encode(ProfileResponse{
		UserID:   targetID,
		Username: username,
		Bio:      bio,
	})
}

// UpdateMyBio обновляет био текущего пользователя
// POST /profile/bio
func (s *Server) UpdateMyBio(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	userIDRaw := r.Context().Value(auth.UserContextKey)
	userID, ok := userIDRaw.(string)
	if !ok || userID == "" {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	var req UpdateBioRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request", http.StatusBadRequest)
		return
	}

	if err := s.store.UpdateBio(userID, req.Bio); err != nil {
		http.Error(w, "Failed to update bio", http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]string{"status": "ok"})
}
