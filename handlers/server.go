package handlers

import (
	"Synapse_server/storage"
)

type Server struct {
	store *storage.Storage
	hub   *storage.ClientsHub
}

func NewServer(store *storage.Storage, hub *storage.ClientsHub) *Server {
	return &Server{
		store: store,
		hub:   hub,
	}
}
