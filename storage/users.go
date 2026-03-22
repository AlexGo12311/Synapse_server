package storage

import (
	"Synapse_server/models"
	"sync"
)

var Users = make(map[string]models.User) // username -> User
var UsersMutex = sync.Mutex{}
