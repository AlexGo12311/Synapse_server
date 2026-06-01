package handlers

import (
	"encoding/json"
	"net/http"

	"Synapse_server/storage"
)

func GetUsers(w http.ResponseWriter, r *http.Request) {

	users, err := storage.GetAllUsers()
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(users)
}
