package main

import (
	"log"
	"net/http"

	"Synapse_server/handlers"
)

func main() {
	http.HandleFunc("/register", handlers.Register)
	http.HandleFunc("/login", handlers.Login)
	http.HandleFunc("/ws", handlers.HandleConnections)

	log.Println("Server running on :8080")
	http.ListenAndServe(":8080", nil)
}
