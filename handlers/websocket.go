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

	// Получаем username для broadcast
	username, err := s.store.GetUserByID(userID)
	if err != nil {
		log.Println("Failed to get username for broadcast:", err)
		username = ""
	}

	// 🆕 Создаём клиент с поддержкой групп
	client := models.Client{
		ID:     userID,
		Conn:   ws,
		Groups: make(map[string]bool),
	}

	// 🆕 Загружаем группы пользователя из БД и регистрируем в hub
	userGroups, err := s.store.GetUserGroups(userID)
	if err == nil {
		s.hub.Mutex.Lock()
		for _, g := range userGroups {
			client.Groups[g.ID] = true

			if s.hub.Groups[g.ID] == nil {
				s.hub.Groups[g.ID] = make(map[string]bool)
			}
			s.hub.Groups[g.ID][userID] = true
		}
		s.hub.Mutex.Unlock()
	}

	defer func() {
		s.hub.Mutex.Lock()
		delete(s.hub.Clients, userID)

		// 🆕 Удаляем пользователя из всех групп в hub
		for groupID, members := range s.hub.Groups {
			delete(members, userID)
			// Если группа стала пустой — можно удалить (опционально)
			if len(members) == 0 {
				delete(s.hub.Groups, groupID)
			}
		}

		for id, c := range s.hub.Clients {
			if id != userID {
				c.Conn.WriteJSON(map[string]interface{}{
					"type": "user_left",
					"id":   userID,
				})
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

	// Отправляем новому пользователю список онлайн-пользователей
	ws.WriteJSON(map[string]interface{}{
		"type":  "online_list",
		"users": onlineUsers,
	})

	// 🆕 Отправляем список групп пользователя
	if userGroups != nil {
		ws.WriteJSON(map[string]interface{}{
			"type":   "my_groups",
			"groups": userGroups,
		})
	}

	s.hub.Mutex.Lock()
	for id, c := range s.hub.Clients {
		if id != userID {
			c.Conn.WriteJSON(map[string]interface{}{
				"type":     "user_joined",
				"id":       userID,
				"username": username,
			})
			c.Conn.WriteJSON(map[string]interface{}{
				"type":   "presence",
				"user":   userID,
				"status": "online",
			})
		}
	}
	s.hub.Mutex.Unlock()

	// ПОМЕЧАЕМ ВСЕ НЕДОСТАВЛЕННЫЕ СООБЩЕНИЯ КАК DELIVERED
	deliveries, err := s.store.MarkAsDelivered(userID)
	if err != nil {
		log.Println("MarkAsDelivered error:", err)
	} else {
		s.hub.Mutex.Lock()
		for senderID, msgIDs := range deliveries {
			if senderClient, ok := s.hub.Clients[senderID]; ok {
				for _, msgID := range msgIDs {
					senderClient.Conn.WriteJSON(map[string]interface{}{
						"type":   "status_update",
						"id":     msgID,
						"status": "delivered",
						"from":   userID,
					})
				}
			}
		}
		s.hub.Mutex.Unlock()

		if len(deliveries) > 0 {
			log.Printf("✅ Marked %d senders' messages as delivered for user %s", len(deliveries), userID)
		}
	}

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

		// ================= TYPING INDICATOR (личные чаты) =================
		case "typing":
			target, _ := raw["to"].(string)
			if target == "" {
				continue
			}

			s.hub.Mutex.Lock()
			receiver, isOnline := s.hub.Clients[target]
			if isOnline {
				receiver.Conn.WriteJSON(map[string]interface{}{
					"type": "typing",
					"from": userID,
				})
			}
			s.hub.Mutex.Unlock()

		case "stop_typing":
			target, _ := raw["to"].(string)
			if target == "" {
				continue
			}

			s.hub.Mutex.Lock()
			receiver, isOnline := s.hub.Clients[target]
			if isOnline {
				receiver.Conn.WriteJSON(map[string]interface{}{
					"type": "stop_typing",
					"from": userID,
				})
			}
			s.hub.Mutex.Unlock()

		// ================= GROUP MESSAGES =================
		case "group_message":
			groupID, _ := raw["group_id"].(string)
			data, _ := raw["data"].(string)
			msgID, _ := raw["id"].(string)
			replyTo, _ := raw["reply_to"].(string)

			if groupID == "" || data == "" {
				log.Println("❌ group_message: missing group_id or data")
				continue
			}

			// Проверяем что отправитель состоит в группе
			isMember, _ := s.store.IsGroupMember(groupID, userID)
			if !isMember {
				log.Printf("❌ User %s is not a member of group %s", userID, groupID)
				continue
			}

			if msgID == "" {
				msgID = uuid.New().String()
			}

			groupMsg := models.GroupMessage{
				ID:        msgID,
				GroupID:   groupID,
				Sender:    userID,
				Username:  username,
				Data:      data,
				CreatedAt: time.Now().Unix(),
				ReplyTo:   replyTo,
			}

			// Сохраняем в БД
			if err := s.store.SaveGroupMessage(groupMsg); err != nil {
				log.Printf("❌ SaveGroupMessage error: %v", err)
				continue
			}

			// Подтверждение отправителю
			ws.WriteJSON(map[string]interface{}{
				"type":       "group_message_saved",
				"id":         msgID,
				"group_id":   groupID,
				"created_at": groupMsg.CreatedAt,
			})

			// Рассылаем всем онлайн-участникам группы
			s.hub.Mutex.Lock()
			members := s.hub.Groups[groupID]
			for memberID := range members {
				if memberID == userID {
					continue
				}
				if client, ok := s.hub.Clients[memberID]; ok {
					client.Conn.WriteJSON(map[string]interface{}{
						"type":       "group_message",
						"id":         msgID,
						"group_id":   groupID,
						"sender":     userID,
						"username":   username,
						"data":       data,
						"created_at": groupMsg.CreatedAt,
						"reply_to":   replyTo,
					})
				}
			}
			s.hub.Mutex.Unlock()

		// ================= GROUP TYPING =================
		case "group_typing":
			groupID, _ := raw["group_id"].(string)
			if groupID == "" {
				continue
			}

			isMember, _ := s.store.IsGroupMember(groupID, userID)
			if !isMember {
				continue
			}

			s.hub.Mutex.Lock()
			members := s.hub.Groups[groupID]
			for memberID := range members {
				if memberID == userID {
					continue
				}
				if client, ok := s.hub.Clients[memberID]; ok {
					client.Conn.WriteJSON(map[string]interface{}{
						"type":     "group_typing",
						"group_id": groupID,
						"from":     userID,
					})
				}
			}
			s.hub.Mutex.Unlock()

		case "group_stop_typing":
			groupID, _ := raw["group_id"].(string)
			if groupID == "" {
				continue
			}

			isMember, _ := s.store.IsGroupMember(groupID, userID)
			if !isMember {
				continue
			}

			s.hub.Mutex.Lock()
			members := s.hub.Groups[groupID]
			for memberID := range members {
				if memberID == userID {
					continue
				}
				if client, ok := s.hub.Clients[memberID]; ok {
					client.Conn.WriteJSON(map[string]interface{}{
						"type":     "group_stop_typing",
						"group_id": groupID,
						"from":     userID,
					})
				}
			}
			s.hub.Mutex.Unlock()

		}
	}
}
