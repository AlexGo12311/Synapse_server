package storage

import (
	"Synapse_server/models"
	"sync"
)

var Clients = make(map[string]*models.Client)
var Mutex = sync.Mutex{}
