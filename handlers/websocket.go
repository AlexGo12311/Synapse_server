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

	// Оборачиваем закрытие в defer, чтобы 100% разослать статус offline при любом обрыве связи
	defer func() {
		storage.ClientsMutex.Lock()
		delete(storage.Clients, userID)

		// Рассылаем всем остальным, что пользователь вышел
		for id, c := range storage.Clients {
			if id != userID {
				c.Conn.WriteJSON(map[string]interface{}{
					"type":   "presence",
					"user":   userID,
					"status": "offline",
				})
			}
		}
		storage.ClientsMutex.Unlock()

		ws.Close()
		log.Println("User disconnected:", userID)
	}()

	client := models.Client{
		ID:   userID,
		Conn: ws,
	}

	storage.ClientsMutex.Lock()
	storage.Clients[userID] = &client

	// 1. Собираем список тех, кто уже онлайн, чтобы отправить новичку
	var onlineUsers []string
	for id := range storage.Clients {
		if id != userID {
			onlineUsers = append(onlineUsers, id)
		}
	}
	storage.ClientsMutex.Unlock()

	log.Println("User connected:", userID)

	// 2. Отправляем подключившемуся юзеру список онлайна
	ws.WriteJSON(map[string]interface{}{
		"type":  "online_list",
		"users": onlineUsers,
	})

	// 3. Сообщаем всем остальным, что этот юзер зашел
	storage.ClientsMutex.Lock()
	for id, c := range storage.Clients {
		if id != userID {
			c.Conn.WriteJSON(map[string]interface{}{
				"type":   "presence",
				"user":   userID,
				"status": "online",
			})
		}
	}
	storage.ClientsMutex.Unlock()

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

			// 1. Сохраняем сообщение в БД (по умолчанию оно получает статус 'sent')
			storage.SaveMessage(msg)

			// 2. Подтверждаем отправителю, что сервер всё записал (ЭТО ТОЛЬКО 1 ГАЛОЧКА!)
			ws.WriteJSON(map[string]interface{}{
				"type": "message_saved",
				"id":   msg.ID,
			})

			// 3. Проверяем, в сети ли получатель
			storage.ClientsMutex.Lock()
			receiver, ok := storage.Clients[msg.To]

			if ok {
				log.Println("Forwarding message", msg.ID, "from", userID, "to", msg.To)

				// Пытаемся отправить сообщение
				if err := receiver.Conn.WriteJSON(msg); err == nil {
					// УСПЕХ! Получатель онлайн и сообщение ушло в его сокет.

					// Обновляем статус в БД на "доставлено"
					storage.UpdateMessageStatus(msg.ID, "delivered")

					// Сразу сообщаем отправителю, что сообщение доставлено (2 серые галочки)
					ws.WriteJSON(map[string]interface{}{
						"type":   "status_update",
						"id":     msg.ID,
						"status": "delivered",
						"from":   msg.To, // от кого пришел статус
					})
				} else {
					log.Println("Forward error:", err)
				}
			}
			// Если !ok (оффлайн), мы ничего не делаем. Сообщение останется в БД со статусом 'sent'.
			storage.ClientsMutex.Unlock()

		// ================= СТАТУСЫ ДОСТАВКИ =================
		case "status_update":
			target, _ := raw["to"].(string)
			msgID, okID := raw["id"].(string)
			status, okStatus := raw["status"].(string)

			// 1. Сохраняем новый статус в базу данных
			// (Убрали условие status != "read_all", теперь любой статус корректно пишется в БД)
			if okID && okStatus {
				err := storage.UpdateMessageStatus(msgID, status)
				if err != nil {
					log.Printf("Failed to update status for msg %s: %v", msgID, err)
				}
			}

			// 2. Пересылаем статус получателю (если он онлайн), чтобы у него покрасились галочки
			storage.ClientsMutex.Lock()
			receiver, isOnline := storage.Clients[target]

			if isOnline {
				log.Println("Forwarding status", status, "from", userID, "to", target)

				// Добавляем поле from, чтобы фронтенд знал, в каком чате менять статус
				raw["from"] = userID

				if err := receiver.Conn.WriteJSON(raw); err != nil {
					log.Println("Status forward error:", err)
				}
			}
			storage.ClientsMutex.Unlock()

		}
	}
}
