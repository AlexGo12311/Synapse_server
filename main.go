package main

import (
	"log"
	"net/http"

	"Synapse_server/database"
	"Synapse_server/handlers"
	"Synapse_server/middlewares"
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

	// ИНИЦИАЛИЗАЦИЯ БД
	database.Init()

	mux := http.NewServeMux()

	mux.HandleFunc("/register", handlers.Register)
	mux.HandleFunc("/login", handlers.Login)
	mux.HandleFunc("/ws", handlers.HandleConnections)
	mux.Handle("/history", middlewares.AuthMiddleware(http.HandlerFunc(handlers.GetHistory)))
	mux.Handle("/users", middlewares.AuthMiddleware(http.HandlerFunc(handlers.GetUsers)))

	log.Println("Server running on :8080")
	http.ListenAndServe(":8080", enableCORS(mux))
}
