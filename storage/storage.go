package storage

import (
	"Synapse_server/database"
)

type Storage struct {
	db *database.Database
}

func New(db *database.Database) *Storage {
	return &Storage{db: db}
}
