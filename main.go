package main

import (
	"log"
	"net/http"
	"sync"

	"github.com/gorilla/websocket"
)

type Message struct {
	Type   string `json:"type"`
	From   string `json:"from"`
	To     string `json:"to"`
	Data   string `json:"data"`
	PubKey string `json:"pubKey"`
}

type Client struct {
	ID     string
	Conn   *websocket.Conn
	PubKey string
}

var clients = make(map[string]*Client)
var mutex = sync.Mutex{}

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool { return true },
}

func handleConnections(w http.ResponseWriter, r *http.Request) {
	ws, _ := upgrader.Upgrade(w, r, nil)
	defer ws.Close()

	var client Client
	client.Conn = ws

	for {
		var msg Message
		err := ws.ReadJSON(&msg)
		if err != nil {
			break
		}

		switch msg.Type {

		case "register":
			mutex.Lock()
			client.ID = msg.From
			client.PubKey = msg.PubKey
			clients[client.ID] = &client
			mutex.Unlock()

			log.Println("User connected:", client.ID)

		case "message":
			mutex.Lock()
			receiver, ok := clients[msg.To]
			mutex.Unlock()

			if ok {
				receiver.Conn.WriteJSON(msg)
			}
		}
	}

	mutex.Lock()
	delete(clients, client.ID)
	mutex.Unlock()

	log.Println("User disconnected:", client.ID)
}

func main() {
	http.HandleFunc("/ws", handleConnections)

	log.Println("Server running on :8080")
	http.ListenAndServe(":8080", nil)
}
