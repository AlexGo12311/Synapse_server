package storage

import (
	"Synapse_server/models"
	"sync"
)

type ClientsHub struct {
	Clients map[string]*models.Client
	Mutex   sync.Mutex
}

func NewClientsHub() *ClientsHub {
	return &ClientsHub{
		Clients: make(map[string]*models.Client),
	}
}
