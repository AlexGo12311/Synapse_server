package handlers

import (
	"encoding/json"
	"log"
	"net/http"
	"time"

	"github.com/google/uuid"

	"Synapse_server/models"
	"Synapse_server/storage"
	"Synapse_server/utils"

	"github.com/gorilla/websocket"
)

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool { return true },
}

func HandleConnections(w http.ResponseWriter, r *http.Request) {

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

	storage.ClientsMutex.Lock()
	storage.Clients[userID] = &client
	storage.ClientsMutex.Unlock()

	log.Println("User connected:", userID)

	for {
		var raw map[string]interface{}

		if err := ws.ReadJSON(&raw); err != nil {
			log.Println("Read error:", err)
			break
		}

		msgType, _ := raw["type"].(string)

		switch msgType {

		// ================= PUBKEY =================
		case "set_pubkey":

			pubKey, _ := raw["pubKey"].(string)

			storage.SavePubKey(userID, pubKey)
			log.Println("Saved pubkey for", userID)

			// рассылаем всем
			storage.ClientsMutex.Lock()
			for id, c := range storage.Clients {
				if id != userID {
					c.Conn.WriteJSON(map[string]interface{}{
						"type":   "pubkey",
						"from":   userID,
						"pubKey": pubKey,
					})
				}
			}
			storage.ClientsMutex.Unlock()

		case "get_pubkey":

			target, _ := raw["to"].(string)

			key, _ := storage.GetPubKey(target)

			if key != "" {
				ws.WriteJSON(map[string]interface{}{
					"type":   "pubkey",
					"from":   target,
					"pubKey": key,
				})
			}

		// ================= MESSAGE =================
		case "message":

			var msg models.Message

			bytes, _ := json.Marshal(raw)

			if err := json.Unmarshal(bytes, &msg); err != nil {
				log.Println("JSON unmarshal error:", err)
				continue
			}

			msg.From = userID

			// Если клиент уже прислал ID — сохраняем его
			if msg.ID == "" {
				msg.ID = uuid.New().String()
			}

			// Если клиент не прислал время
			if msg.CreatedAt == 0 {
				msg.CreatedAt = time.Now().Unix()
			}

			// сохраняем сообщение
			storage.SaveMessage(msg)

			// подтверждаем отправителю сохранение
			ws.WriteJSON(map[string]interface{}{
				"type": "message_saved",
				"id":   msg.ID,
			})

			// отправляем получателю если он онлайн
			storage.ClientsMutex.Lock()

			receiver, ok := storage.Clients[msg.To]

			if ok {

				log.Println(
					"Forwarding message",
					msg.ID,
					"from",
					userID,
					"to",
					msg.To,
				)

				if err := receiver.Conn.WriteJSON(msg); err != nil {
					log.Println("Forward error:", err)
				}
			}

			storage.ClientsMutex.Unlock()

		}
	}

	storage.ClientsMutex.Lock()
	delete(storage.Clients, userID)
	storage.ClientsMutex.Unlock()

	log.Println("User disconnected:", userID)
}
