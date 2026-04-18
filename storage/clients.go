package storage

import (
	"Synapse_server/models"
	"sync"
)

var Clients = make(map[string]*models.Client)
var ClientsMutex = sync.Mutex{}
