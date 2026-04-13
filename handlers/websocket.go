package handlers

import (
	"log"
	"net/http"

	"Synapse_server/models"
	"Synapse_server/storage"
	"Synapse_server/utils"

	"github.com/gorilla/websocket"
)

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool { return true },
}

func HandleConnections(w http.ResponseWriter, r *http.Request) {

	// ===== JWT ИЗ HEADER =====
	tokenString := r.URL.Query().Get("token")
	if tokenString == "" {
		http.Error(w, "Missing token", http.StatusUnauthorized)
		return
	}

	userID, err := utils.ParseToken(tokenString)
	if err != nil {
		http.Error(w, "Invalid token", http.StatusUnauthorized)
		return
	}

	// ===== UPGRADE =====
	ws, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Println("Upgrade error:", err)
		return
	}
	defer ws.Close()

	client := models.Client{
		ID:   userID,
		Conn: ws,
	}

	// ===== CONNECT =====
	storage.ClientsMutex.Lock()
	storage.Clients[userID] = &client
	storage.ClientsMutex.Unlock()

	log.Println("User connected:", userID)

	// ===== READ LOOP =====
	for {
		var msg models.Message

		err := ws.ReadJSON(&msg)
		if err != nil {
			log.Println("Read error:", err)
			break
		}

		msg.From = userID

		switch msg.Type {

		case "set_pubkey":
			storage.SavePubKey(userID, msg.PubKey)
			log.Println("Saved pubkey for", userID)

		case "get_pubkey":
			key, _ := storage.GetPubKey(msg.To)

			if key != "" {
				ws.WriteJSON(models.Message{
					Type:   "pubkey",
					From:   msg.To,
					To:     userID,
					PubKey: key,
				})
			}

		case "message":

			// сохранить в БД
			storage.SaveMessage(msg)

			// отправить если онлайн
			storage.ClientsMutex.Lock()
			receiver, ok := storage.Clients[msg.To]

			if ok {
				log.Println("Forwarding message from", userID, "to", msg.To)
				receiver.Conn.WriteJSON(msg)
			}

			storage.ClientsMutex.Unlock()
		}
	}

	// ===== DISCONNECT =====
	storage.ClientsMutex.Lock()
	delete(storage.Clients, userID)
	storage.ClientsMutex.Unlock()

	log.Println("User disconnected:", userID)
}
