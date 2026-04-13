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
		// СОХРАНИТЬ PUBKEY (в БД)
		// =========================
		case "set_pubkey":
			storage.SavePubKey(msg.From, msg.PubKey)
			log.Println("Saved pubkey for", msg.From)

		// =========================
		// ПОЛУЧИТЬ PUBKEY (из БД)
		// =========================
		case "get_pubkey":

			key, err := storage.GetPubKey(msg.To)

			if err == nil && key != "" {
				log.Println("Sending pubkey of", msg.To, "to", msg.From)

				ws.WriteJSON(models.Message{
					Type:   "pubkey",
					From:   msg.To,
					To:     msg.From,
					PubKey: key,
				})
			} else {
				log.Println("No pubkey found for", msg.To)
			}

		// =========================
		// СООБЩЕНИЕ
		// =========================
		case "message":

			// 💾 сохраняем в БД
			storage.SaveMessage(msg)

			// 🚀 отправляем если пользователь онлайн
			storage.ClientsMutex.Lock()

			receiver, ok := storage.Clients[msg.To]

			if ok {
				log.Println("Forwarding message from", msg.From, "to", msg.To)
				err := receiver.Conn.WriteJSON(msg)
				if err != nil {
					log.Println("Write error:", err)
				}
			} else {
				log.Println("User offline, message saved in DB")
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
