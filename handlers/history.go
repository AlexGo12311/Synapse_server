package handlers

import (
	"Synapse_server/auth"
	"Synapse_server/models"
	"Synapse_server/storage"
	"encoding/json"
	"net/http"
)

func (s *Server) GetHistory(w http.ResponseWriter, r *http.Request) {

	w.Header().Set("Content-Type", "application/json")

	userIDRaw := r.Context().Value(auth.UserContextKey)
	userID, ok := userIDRaw.(string)

	if !ok || userID == "" {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	target := r.URL.Query().Get("to")
	if target == "" {
		http.Error(w, "Missing target", http.StatusBadRequest)
		return
	}

	chatID := storage.GetChatID(userID, target)

	messages, err := s.store.GetMessages(chatID)
	if err != nil {
		http.Error(w, "DB error", http.StatusInternalServerError)
		return
	}

	if messages == nil {
		messages = []models.Message{}
	}

	json.NewEncoder(w).Encode(messages)
}
