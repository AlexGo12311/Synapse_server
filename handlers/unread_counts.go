package handlers

import (
	"Synapse_server/auth"
	"encoding/json"
	"net/http"
)

// GetUnreadCounts возвращает количество непрочитанных сообщений для каждого собеседника
func (s *Server) GetUnreadCounts(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	userIDRaw := r.Context().Value(auth.UserContextKey)
	userID, ok := userIDRaw.(string)

	if !ok || userID == "" {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	counts, err := s.store.GetUnreadCounts(userID)
	if err != nil {
		http.Error(w, "DB error", http.StatusInternalServerError)
		return
	}

	// Возвращаем пустой объект вместо null
	if counts == nil {
		counts = make(map[string]int)
	}

	json.NewEncoder(w).Encode(counts)
}
