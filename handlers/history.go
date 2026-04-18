package handlers

import (
	"Synapse_server/middlewares"
	"Synapse_server/models"
	"encoding/json"
	"net/http"

	"Synapse_server/storage"
)

func GetHistory(w http.ResponseWriter, r *http.Request) {

	w.Header().Set("Content-Type", "application/json")

	// ===== user из middleware =====
	userIDRaw := r.Context().Value(middlewares.UserContextKey)
	userID, ok := userIDRaw.(string)

	if !ok || userID == "" {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	// ===== target =====
	target := r.URL.Query().Get("to")
	if target == "" {
		http.Error(w, "Missing target", http.StatusBadRequest)
		return
	}

	// ===== chat =====
	chatID := storage.GetChatID(userID, target)

	// ===== messages =====
	messages, err := storage.GetMessages(chatID)
	if err != nil {
		http.Error(w, "DB error", http.StatusInternalServerError)
		return
	}

	if messages == nil {
		messages = []models.Message{}
	}

	json.NewEncoder(w).Encode(messages)
}
