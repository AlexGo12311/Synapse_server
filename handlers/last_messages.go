package handlers

import (
	"Synapse_server/auth"
	"Synapse_server/storage"
	"encoding/json"
	"net/http"
)

// GetLastMessages возвращает последние сообщения из каждого чата текущего пользователя.
// Используется для отображения превью в списке чатов.
func (s *Server) GetLastMessages(w http.ResponseWriter, r *http.Request) {

	w.Header().Set("Content-Type", "application/json")

	userIDRaw := r.Context().Value(auth.UserContextKey)
	userID, ok := userIDRaw.(string)

	if !ok || userID == "" {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	messages, err := s.store.GetLastMessages(userID)
	if err != nil {
		http.Error(w, "DB error", http.StatusInternalServerError)
		return
	}

	// ✅ ВАЖНО: используем тот же тип, что возвращает storage
	// чтобы JSON-сериализатор выдал [] вместо null для пустого результата
	if messages == nil {
		messages = []storage.LastMessage{}
	}

	json.NewEncoder(w).Encode(messages)
}
