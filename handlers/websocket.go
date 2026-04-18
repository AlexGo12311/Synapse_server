package handlers

import (
	"encoding/json"
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

			// 🔥 рассылаем всем
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
			json.Unmarshal(bytes, &msg)

			msg.From = userID

			// 💾 сохраняем
			storage.SaveMessage(msg)

			// 📤 отправляем получателю
			storage.ClientsMutex.Lock()
			receiver, ok := storage.Clients[msg.To]

			if ok {
				log.Println("Forwarding message from", userID, "to", msg.To)
				receiver.Conn.WriteJSON(msg)
			}

			storage.ClientsMutex.Unlock()
		}
	}

	storage.ClientsMutex.Lock()
	delete(storage.Clients, userID)
	storage.ClientsMutex.Unlock()

	log.Println("User disconnected:", userID)
}
