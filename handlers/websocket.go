package handlers

import (
	"log"
	"net/http"

	"Synapse_server/models"
	"Synapse_server/storage"

	"github.com/gorilla/websocket"
)

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool { return true },
}

func HandleConnections(w http.ResponseWriter, r *http.Request) {
	ws, _ := upgrader.Upgrade(w, r, nil)
	defer ws.Close()

	var client models.Client
	client.Conn = ws

	for {
		var msg models.Message
		err := ws.ReadJSON(&msg)
		if err != nil {
			log.Println("Read error:", err)
			break
		}

		switch msg.Type {

		case "register":
			storage.Mutex.Lock()
			client.ID = msg.From
			client.PubKey = msg.PubKey
			storage.Clients[client.ID] = &client
			storage.Mutex.Unlock()

			log.Println("User connected:", client.ID)

		case "message":
			storage.Mutex.Lock()
			receiver, ok := storage.Clients[msg.To]
			storage.Mutex.Unlock()

			if ok {
				receiver.Conn.WriteJSON(msg)
			}
		}
	}

	storage.Mutex.Lock()
	delete(storage.Clients, client.ID)
	storage.Mutex.Unlock()

	log.Println("User disconnected:", client.ID)
}
