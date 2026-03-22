package handlers

import (
	"Synapse_server/models"
	"Synapse_server/storage"
	"log"
	"net/http"

	"github.com/gorilla/websocket"
)

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool { return true },
}

// очередь для оффлайн пользователей
var Pending = make(map[string][]models.Message)

func HandleConnections(w http.ResponseWriter, r *http.Request) {
	ws, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Println("Upgrade error:", err)
		return
	}
	defer ws.Close()

	// берем userId из URL
	userID := r.URL.Query().Get("userId")
	if userID == "" {
		log.Println("No userId provided")
		return
	}

	client := models.Client{
		ID:   userID,
		Conn: ws,
	}

	// сохраняем клиента
	storage.Mutex.Lock()
	storage.Clients[client.ID] = &client
	log.Println("User connected:", client.ID)

	// отправляем все отложенные сообщения
	if msgs, ok := Pending[client.ID]; ok {
		for _, m := range msgs {
			log.Println("Delivering pending", m.Type, "from", m.From, "to", client.ID)
			ws.WriteJSON(m)
		}
		delete(Pending, client.ID)
	}
	storage.Mutex.Unlock()

	// ===== ЧТЕНИЕ СООБЩЕНИЙ =====
	for {
		var msg models.Message
		err := ws.ReadJSON(&msg)
		if err != nil {
			log.Println("Read error:", err)
			break
		}

		// подменяем From реальным userID
		msg.From = client.ID

		storage.Mutex.Lock()

		receiver, ok := storage.Clients[msg.To]
		if ok {
			log.Println("Forwarding", msg.Type, "from", msg.From, "to", msg.To)
			receiver.Conn.WriteJSON(msg)
		} else {
			log.Println("User not connected yet, storing", msg.Type, "for", msg.To)
			Pending[msg.To] = append(Pending[msg.To], msg)
		}

		storage.Mutex.Unlock()
	}

	// ===== DISCONNECT =====
	storage.Mutex.Lock()
	delete(storage.Clients, client.ID)
	storage.Mutex.Unlock()

	log.Println("User disconnected:", client.ID)
}
