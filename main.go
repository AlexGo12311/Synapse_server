package main

import (
	"log"
	"net/http"

	"github.com/joho/godotenv"

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

	// 1. Загружаем переменные из .env файла
	if err := godotenv.Load(); err != nil {
		log.Println(".env файл не найден, используются системные переменные окружения")
	}

	// 2. Инициализируем секретный ключ для JWT
	if err := auth.InitSecret(); err != nil {
		log.Fatalf("Ошибка инициализации секретного ключа: %v", err)
	}
	log.Println("Секретный ключ JWT успешно загружен")

	// 3. Инициализируем слои через New()
	db := database.New()
	store := storage.New(db)
	hub := storage.NewClientsHub()

	// 4. Собираем сервер с внедрёнными зависимостями
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
