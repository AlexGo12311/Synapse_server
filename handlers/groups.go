package handlers

import (
	"Synapse_server/auth"
	"Synapse_server/models"
	"encoding/json"
	"log"
	"net/http"
)

type CreateGroupRequest struct {
	Name    string   `json:"name"`
	Members []string `json:"members"` // список user_id для добавления
}

type AddMemberRequest struct {
	UserID string `json:"user_id"`
}

// CreateGroup создаёт новую группу
// POST /groups
func (s *Server) CreateGroup(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	userIDRaw := r.Context().Value(auth.UserContextKey)
	userID, ok := userIDRaw.(string)
	if !ok || userID == "" {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	var req CreateGroupRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request", http.StatusBadRequest)
		return
	}

	if req.Name == "" {
		http.Error(w, "Name is required", http.StatusBadRequest)
		return
	}

	if len(req.Name) > 100 {
		req.Name = req.Name[:100]
	}

	// Создаём группу
	group, err := s.store.CreateGroup(req.Name, userID)
	if err != nil {
		log.Printf("❌ CreateGroup error: %v", err)
		http.Error(w, "Failed to create group", http.StatusInternalServerError)
		return
	}

	// Добавляем остальных участников
	for _, memberID := range req.Members {
		if memberID == userID {
			continue // создатель уже добавлен
		}
		if err := s.store.AddMember(group.ID, memberID); err != nil {
			log.Printf("⚠️ Failed to add member %s: %v", memberID, err)
		} else {
			// 🆕 Уведомляем участника через WebSocket если он онлайн
			s.notifyGroupCreated(memberID, group, userID)
		}
	}

	// 🆕 Добавляем создателя в hub.Groups
	s.hub.Mutex.Lock()
	if s.hub.Groups[group.ID] == nil {
		s.hub.Groups[group.ID] = make(map[string]bool)
	}
	s.hub.Groups[group.ID][userID] = true
	s.hub.Mutex.Unlock()

	// Возвращаем полную информацию о группе
	members, _ := s.store.GetGroupMembers(group.ID)
	response := map[string]interface{}{
		"id":         group.ID,
		"name":       group.Name,
		"creator_id": group.CreatorID,
		"created_at": group.CreatedAt,
		"members":    members,
	}

	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(response)
}

// GetUserGroups возвращает все группы текущего пользователя
// GET /groups
func (s *Server) GetUserGroups(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	userIDRaw := r.Context().Value(auth.UserContextKey)
	userID, ok := userIDRaw.(string)
	if !ok || userID == "" {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	groups, err := s.store.GetUserGroups(userID)
	if err != nil {
		log.Printf("❌ GetUserGroups error: %v", err)
		http.Error(w, "Failed to load groups", http.StatusInternalServerError)
		return
	}

	if groups == nil {
		groups = []models.GroupWithMembers{}
	}

	json.NewEncoder(w).Encode(groups)
}

// GetGroup возвращает информацию о конкретной группе
// GET /groups/info?id=xxx
func (s *Server) GetGroup(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	userIDRaw := r.Context().Value(auth.UserContextKey)
	userID, ok := userIDRaw.(string)
	if !ok || userID == "" {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	groupID := r.URL.Query().Get("id")
	if groupID == "" {
		http.Error(w, "id required", http.StatusBadRequest)
		return
	}

	// Проверяем что пользователь состоит в группе
	isMember, err := s.store.IsGroupMember(groupID, userID)
	if err != nil || !isMember {
		http.Error(w, "Not a member", http.StatusForbidden)
		return
	}

	group, err := s.store.GetGroupByID(groupID)
	if err != nil {
		http.Error(w, "Group not found", http.StatusNotFound)
		return
	}

	members, _ := s.store.GetGroupMembers(groupID)

	response := map[string]interface{}{
		"id":         group.ID,
		"name":       group.Name,
		"creator_id": group.CreatorID,
		"created_at": group.CreatedAt,
		"members":    members,
	}

	json.NewEncoder(w).Encode(response)
}

// GetGroupHistory возвращает историю сообщений группы
// GET /groups/history?id=xxx
func (s *Server) GetGroupHistory(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	userIDRaw := r.Context().Value(auth.UserContextKey)
	userID, ok := userIDRaw.(string)
	if !ok || userID == "" {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	groupID := r.URL.Query().Get("id")
	if groupID == "" {
		http.Error(w, "id required", http.StatusBadRequest)
		return
	}

	isMember, err := s.store.IsGroupMember(groupID, userID)
	if err != nil || !isMember {
		http.Error(w, "Not a member", http.StatusForbidden)
		return
	}

	messages, err := s.store.GetGroupMessages(groupID, 200)
	if err != nil {
		log.Printf("❌ GetGroupHistory error: %v", err)
		http.Error(w, "Failed to load history", http.StatusInternalServerError)
		return
	}

	if messages == nil {
		messages = []models.GroupMessage{}
	}

	json.NewEncoder(w).Encode(messages)
}

// AddMember добавляет участника в группу
// POST /groups/members
func (s *Server) AddMember(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	userIDRaw := r.Context().Value(auth.UserContextKey)
	userID, ok := userIDRaw.(string)
	if !ok || userID == "" {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	var req struct {
		GroupID string `json:"group_id"`
		UserID  string `json:"user_id"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request", http.StatusBadRequest)
		return
	}

	// Проверяем что requester — админ группы
	group, err := s.store.GetGroupByID(req.GroupID)
	if err != nil {
		http.Error(w, "Group not found", http.StatusNotFound)
		return
	}

	if group.CreatorID != userID {
		http.Error(w, "Only creator can add members", http.StatusForbidden)
		return
	}

	if err := s.store.AddMember(req.GroupID, req.UserID); err != nil {
		http.Error(w, "Failed to add member", http.StatusInternalServerError)
		return
	}

	// 🆕 Уведомляем нового участника
	s.notifyGroupCreated(req.UserID, group, userID)

	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]string{"status": "ok"})
}

// 🆕 Уведомляет пользователя о том, что его добавили в группу
func (s *Server) notifyGroupCreated(userID string, group *models.Group, addedBy string) {
	s.hub.Mutex.Lock()
	defer s.hub.Mutex.Unlock()

	// Добавляем в hub.Groups
	if s.hub.Groups[group.ID] == nil {
		s.hub.Groups[group.ID] = make(map[string]bool)
	}
	s.hub.Groups[group.ID][userID] = true

	// Если пользователь онлайн — отправляем уведомление
	if client, ok := s.hub.Clients[userID]; ok {
		client.Groups[group.ID] = true
		client.Conn.WriteJSON(map[string]interface{}{
			"type":       "group_created",
			"id":         group.ID,
			"name":       group.Name,
			"creator_id": group.CreatorID,
			"added_by":   addedBy,
			"created_at": group.CreatedAt,
		})
	}
}
