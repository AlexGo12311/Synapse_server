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
		log.Println("⚠️  .env файл не найден, используются системные переменные окружения")
	}

	// 2. Инициализируем секретный ключ для JWT
	if err := auth.InitSecret(); err != nil {
		log.Fatalf("❌ Ошибка инициализации секретного ключа: %v", err)
	}
	log.Println("✅ Секретный ключ JWT успешно загружен")

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
	mux.Handle("/last-messages", auth.AuthMiddleware(http.HandlerFunc(server.GetLastMessages)))
	mux.Handle("/unread-counts", auth.AuthMiddleware(http.HandlerFunc(server.GetUnreadCounts)))
	mux.HandleFunc("/profile", func(w http.ResponseWriter, r *http.Request) {
		handler := auth.AuthMiddleware(http.HandlerFunc(server.GetProfile))
		handler.ServeHTTP(w, r)
	})
	mux.HandleFunc("/profile/update", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != "POST" {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}
		handler := auth.AuthMiddleware(http.HandlerFunc(server.UpdateMyProfile))
		handler.ServeHTTP(w, r)
	})

	// Групповые чаты
	mux.Handle("/groups", auth.AuthMiddleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case "GET":
			server.GetUserGroups(w, r)
		case "POST":
			server.CreateGroup(w, r)
		default:
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		}
	})))
	mux.Handle("/groups/info", auth.AuthMiddleware(http.HandlerFunc(server.GetGroup)))
	mux.Handle("/groups/history", auth.AuthMiddleware(http.HandlerFunc(server.GetGroupHistory)))
	mux.Handle("/groups/members", auth.AuthMiddleware(http.HandlerFunc(server.AddMember)))
	mux.Handle("/groups/seen", auth.AuthMiddleware(http.HandlerFunc(server.MarkGroupSeen)))

	log.Println("🚀 Server running on :8080")
	http.ListenAndServe(":8080", enableCORS(mux))
}
