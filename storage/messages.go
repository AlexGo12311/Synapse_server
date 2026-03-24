package storage

import (
	"Synapse_server/models"
	"sync"
)

var Messages = make(map[string][]models.Message)
var MessagesMutex = sync.Mutex{}

func GetChatID(a, b string) string {
	if a < b {
		return a + ":" + b
	}
	return b + ":" + a
}
