package storage

import (
	"Synapse_server/models"
	"sync"
)

// 🔑 поиск по ID (для websocket)
var UsersByID = make(map[string]*models.User)

// 🔐 поиск по username (для login)
var UsersByUsername = make(map[string]*models.User)

// mutex для пользователей
var UsersMutex = sync.Mutex{}
