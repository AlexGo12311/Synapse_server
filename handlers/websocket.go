package handlers

import (
	"Synapse_server/auth"
	"encoding/json"
	"log"
	"net/http"
	"time"

	"github.com/google/uuid"

	"Synapse_server/models"

	"github.com/gorilla/websocket"
)

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool { return true },
}

func (s *Server) HandleConnections(w http.ResponseWriter, r *http.Request) {

	tokenString := r.URL.Query().Get("token")
	if tokenString == "" {
		http.Error(w, "Missing token", http.StatusUnauthorized)
		return
	}

	userID, err := auth.ParseToken(tokenString)
	if err != nil {
		http.Error(w, "Invalid token", http.StatusUnauthorized)
		return
	}

	ws, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Println("Upgrade error:", err)
		return
	}

	// Закрываем сокет и удаляем из хаба при разрыве связи
	defer func() {
		s.hub.Mutex.Lock()
		delete(s.hub.Clients, userID)

		for id, c := range s.hub.Clients {
			if id != userID {
				c.Conn.WriteJSON(map[string]interface{}{
					"type":   "presence",
					"user":   userID,
					"status": "offline",
				})
			}
		}
		s.hub.Mutex.Unlock()

		ws.Close()
		log.Println("User disconnected:", userID)
	}()

	client := models.Client{
		ID:   userID,
		Conn: ws,
	}

	s.hub.Mutex.Lock()
	s.hub.Clients[userID] = &client

	var onlineUsers []string
	for id := range s.hub.Clients {
		if id != userID {
			onlineUsers = append(onlineUsers, id)
		}
	}
	s.hub.Mutex.Unlock()

	log.Println("User connected:", userID)

	ws.WriteJSON(map[string]interface{}{
		"type":  "online_list",
		"users": onlineUsers,
	})

	s.hub.Mutex.Lock()
	for id, c := range s.hub.Clients {
		if id != userID {
			c.Conn.WriteJSON(map[string]interface{}{
				"type":   "presence",
				"user":   userID,
				"status": "online",
			})
		}
	}
	s.hub.Mutex.Unlock()

	for {
		var raw map[string]interface{}

		if err := ws.ReadJSON(&raw); err != nil {
			log.Println("Read error:", err)
			break
		}

		msgType, _ := raw["type"].(string)

		switch msgType {

		case "set_pubkey":
			pubKey, _ := raw["pubKey"].(string)

			s.store.SavePubKey(userID, pubKey)
			log.Println("Saved pubkey for", userID)

			s.hub.Mutex.Lock()
			for id, c := range s.hub.Clients {
				if id != userID {
					c.Conn.WriteJSON(map[string]interface{}{
						"type":   "pubkey",
						"from":   userID,
						"pubKey": pubKey,
					})
				}
			}
			s.hub.Mutex.Unlock()

		case "get_pubkey":
			target, _ := raw["to"].(string)
			key, _ := s.store.GetPubKey(target)

			if key != "" {
				ws.WriteJSON(map[string]interface{}{
					"type":   "pubkey",
					"from":   target,
					"pubKey": key,
				})
			}

		case "message":
			var msg models.Message
			bytes, _ := json.Marshal(raw)

			if err := json.Unmarshal(bytes, &msg); err != nil {
				log.Println("JSON unmarshal error:", err)
				continue
			}

			msg.From = userID

			if msg.ID == "" {
				msg.ID = uuid.New().String()
			}

			if msg.CreatedAt == 0 {
				msg.CreatedAt = time.Now().Unix()
			}

			s.store.SaveMessage(msg)

			ws.WriteJSON(map[string]interface{}{
				"type": "message_saved",
				"id":   msg.ID,
			})

			s.hub.Mutex.Lock()
			receiver, ok := s.hub.Clients[msg.To]

			if ok {
				log.Println("Forwarding message", msg.ID, "from", userID, "to", msg.To)

				if err := receiver.Conn.WriteJSON(msg); err == nil {
					s.store.UpdateMessageStatus(msg.ID, "delivered")

					ws.WriteJSON(map[string]interface{}{
						"type":   "status_update",
						"id":     msg.ID,
						"status": "delivered",
						"from":   msg.To,
					})
				} else {
					log.Println("Forward error:", err)
				}
			}
			s.hub.Mutex.Unlock()

		case "status_update":
			target, _ := raw["to"].(string)
			msgID, okID := raw["id"].(string)
			status, okStatus := raw["status"].(string)

			if okID && okStatus {
				err := s.store.UpdateMessageStatus(msgID, status)
				if err != nil {
					log.Printf("Failed to update status for msg %s: %v", msgID, err)
				}
			}

			s.hub.Mutex.Lock()
			receiver, isOnline := s.hub.Clients[target]

			if isOnline {
				log.Println("Forwarding status", status, "from", userID, "to", target)

				raw["from"] = userID

				if err := receiver.Conn.WriteJSON(raw); err != nil {
					log.Println("Status forward error:", err)
				}
			}
			s.hub.Mutex.Unlock()
		}
	}
}
