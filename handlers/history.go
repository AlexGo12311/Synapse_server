package handlers

import (
	"encoding/json"
	"net/http"

	"Synapse_server/storage"
)

func GetHistory(w http.ResponseWriter, r *http.Request) {
	from := r.URL.Query().Get("from")
	to := r.URL.Query().Get("to")

	if from == "" || to == "" {
		http.Error(w, "Missing 'from' or 'to' parameters", http.StatusBadRequest)
		return
	}

	// Сервер САМ правильно склеивает и сортирует ID
	chatID := storage.GetChatID(from, to)

	messages, err := storage.GetMessages(chatID)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(messages)
}
