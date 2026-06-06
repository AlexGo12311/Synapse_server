package handlers

import (
	"encoding/json"
	"net/http"
)

func (s *Server) GetUsers(w http.ResponseWriter, r *http.Request) {

	users, err := s.store.GetAllUsers()
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(users)
}
