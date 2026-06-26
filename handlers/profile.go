package handlers

import (
	"Synapse_server/auth"
	"encoding/json"
	"net/http"
)

type UpdateProfileRequest struct {
	Bio      string `json:"bio"`
	Location string `json:"location"`
	Birthday string `json:"birthday"`
}

// GetProfile возвращает профиль пользователя по ID
// GET /profile?user_id=xxx
func (s *Server) GetProfile(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	userIDRaw := r.Context().Value(auth.UserContextKey)
	_, ok := userIDRaw.(string)
	if !ok {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	targetID := r.URL.Query().Get("user_id")
	if targetID == "" {
		http.Error(w, "user_id required", http.StatusBadRequest)
		return
	}

	profile, err := s.store.GetProfile(targetID)
	if err != nil {
		http.Error(w, "User not found", http.StatusNotFound)
		return
	}

	json.NewEncoder(w).Encode(profile)
}

// UpdateMyProfile обновляет bio, location, birthday текущего пользователя
// POST /profile
func (s *Server) UpdateMyProfile(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	userIDRaw := r.Context().Value(auth.UserContextKey)
	userID, ok := userIDRaw.(string)
	if !ok || userID == "" {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	var req UpdateProfileRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request", http.StatusBadRequest)
		return
	}

	if err := s.store.UpdateProfile(userID, req.Bio, req.Location, req.Birthday); err != nil {
		http.Error(w, "Failed to update profile", http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]string{"status": "ok"})
}
