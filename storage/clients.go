package storage

import (
	"Synapse_server/models"
	"sync"
)

type ClientsHub struct {
	Clients map[string]*models.Client
	Groups  map[string]map[string]bool // group_id -> set of user_ids (онлайн участники)
	Mutex   sync.Mutex
}

func NewClientsHub() *ClientsHub {
	return &ClientsHub{
		Clients: make(map[string]*models.Client),
		Groups:  make(map[string]map[string]bool), // 🆕
	}
}
