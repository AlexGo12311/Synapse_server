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

// оффлайн сообщения
var Pending = make(map[string][]models.Message)

func HandleConnections(w http.ResponseWriter, r *http.Request) {
	ws, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Println("Upgrade error:", err)
		return
	}
	defer ws.Close()

	userID := r.URL.Query().Get("userId")
	if userID == "" {
		log.Println("No userId provided")
		return
	}

	client := models.Client{
		ID:   userID,
		Conn: ws,
	}

	// ===== CONNECT =====
	storage.ClientsMutex.Lock()
	storage.Clients[client.ID] = &client
	storage.ClientsMutex.Unlock()

	log.Println("User connected:", client.ID)

	// отправляем оффлайн сообщения
	if msgs, ok := Pending[client.ID]; ok {
		for _, m := range msgs {
			log.Println("Delivering pending", m.Type, "from", m.From, "to", client.ID)
			ws.WriteJSON(m)
		}
		delete(Pending, client.ID)
	}

	// ===== READ LOOP =====
	for {
		var msg models.Message

		err := ws.ReadJSON(&msg)
		if err != nil {
			log.Println("Read error:", err)
			break
		}

		msg.From = client.ID

		switch msg.Type {

		// =========================
		// СОХРАНИТЬ PUBKEY
		// =========================
		case "set_pubkey":
			storage.UsersMutex.Lock()

			user, ok := storage.UsersByID[msg.From]
			if ok {
				user.PubKey = msg.PubKey
				log.Println("Saved pubkey for", msg.From)
			} else {
				log.Println("User not found:", msg.From)
			}

			storage.UsersMutex.Unlock()

		// =========================
		// ПОЛУЧИТЬ PUBKEY
		// =========================
		case "get_pubkey":
			storage.UsersMutex.Lock()

			user, ok := storage.UsersByID[msg.To]

			if ok && user.PubKey != "" {
				log.Println("Sending pubkey of", msg.To, "to", msg.From)

				ws.WriteJSON(models.Message{
					Type:   "pubkey",
					From:   msg.To,
					To:     msg.From,
					PubKey: user.PubKey,
				})
			} else {
				log.Println("No pubkey found for", msg.To)
			}

			storage.UsersMutex.Unlock()

		// =========================
		// СООБЩЕНИЕ
		// =========================
		case "message":
			storage.ClientsMutex.Lock()

			receiver, ok := storage.Clients[msg.To]

			if ok {
				log.Println("Forwarding message from", msg.From, "to", msg.To)
				receiver.Conn.WriteJSON(msg)
			} else {
				log.Println("User offline, storing message for", msg.To)
				Pending[msg.To] = append(Pending[msg.To], msg)
			}

			storage.ClientsMutex.Unlock()

		default:
			log.Println("Unknown message type:", msg.Type)
		}
	}

	// ===== DISCONNECT =====
	storage.ClientsMutex.Lock()
	delete(storage.Clients, client.ID)
	storage.ClientsMutex.Unlock()

	log.Println("User disconnected:", client.ID)
}
