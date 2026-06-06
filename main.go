package main

import (
	"log"
	"net/http"

	"Synapse_server/auth"
	"Synapse_server/database"
	"Synapse_server/handlers"
	"Synapse_server/storage"
)

// CORS middleware
func enableCORS(h http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")
		w.Header().Set("Access-Control-Allow-Methods", "POST, GET, OPTIONS")

		if r.Method == "OPTIONS" {
			return
		}

		h.ServeHTTP(w, r)
	})
}

func main() {

	// Инициализируем слои через New()
	db := database.New()
	store := storage.New(db)
	hub := storage.NewClientsHub()

	// Собираем сервер с внедренными зависимостями
	server := handlers.NewServer(store, hub)

	mux := http.NewServeMux()

	mux.HandleFunc("/register", server.Register)
	mux.HandleFunc("/login", server.Login)
	mux.HandleFunc("/ws", server.HandleConnections)
	mux.Handle("/history", auth.AuthMiddleware(http.HandlerFunc(server.GetHistory)))
	mux.Handle("/users", auth.AuthMiddleware(http.HandlerFunc(server.GetUsers)))

	log.Println("Server running on :8080")
	http.ListenAndServe(":8080", enableCORS(mux))
}
