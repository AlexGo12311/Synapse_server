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
	Members []string `json:"members"`
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

	group, err := s.store.CreateGroup(req.Name, userID)
	if err != nil {
		log.Printf("❌ CreateGroup error: %v", err)
		http.Error(w, "Failed to create group", http.StatusInternalServerError)
		return
	}

	for _, memberID := range req.Members {
		if memberID == userID {
			continue
		}
		if err := s.store.AddMember(group.ID, memberID); err != nil {
			log.Printf("⚠️ Failed to add member %s: %v", memberID, err)
		} else {
			s.notifyGroupCreated(memberID, group, userID)
		}
	}

	s.hub.Mutex.Lock()
	if s.hub.Groups[group.ID] == nil {
		s.hub.Groups[group.ID] = make(map[string]bool)
	}
	s.hub.Groups[group.ID][userID] = true
	s.hub.Mutex.Unlock()

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

// GetUserGroups возвращает все группы пользователя
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

	// 🆕 ИСПРАВЛЕНО: передаём userID для вычисления статусов своих сообщений
	messages, err := s.store.GetGroupMessages(groupID, userID, 200)
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

	s.notifyGroupCreated(req.UserID, group, userID)

	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]string{"status": "ok"})
}

// notifyGroupCreated уведомляет пользователя о добавлении в группу
func (s *Server) notifyGroupCreated(userID string, group *models.Group, addedBy string) {
	s.hub.Mutex.Lock()
	defer s.hub.Mutex.Unlock()

	if s.hub.Groups[group.ID] == nil {
		s.hub.Groups[group.ID] = make(map[string]bool)
	}
	s.hub.Groups[group.ID][userID] = true

	members, _ := s.store.GetGroupMembers(group.ID)
	if members == nil {
		members = []models.GroupMember{}
	}

	if client, ok := s.hub.Clients[userID]; ok {
		client.Groups[group.ID] = true
		client.Conn.WriteJSON(map[string]interface{}{
			"type":       "group_created",
			"id":         group.ID,
			"name":       group.Name,
			"creator_id": group.CreatorID,
			"added_by":   addedBy,
			"created_at": group.CreatedAt,
			"members":    members,
		})
	}
}

// MarkGroupSeen помечает группу как просмотренную
// И рассылает read статусы отправителям сообщений через WebSocket
func (s *Server) MarkGroupSeen(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	userIDRaw := r.Context().Value(auth.UserContextKey)
	userID, ok := userIDRaw.(string)
	if !ok || userID == "" {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	var req struct {
		GroupID string `json:"group_id"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request", http.StatusBadRequest)
		return
	}

	isMember, err := s.store.IsGroupMember(req.GroupID, userID)
	if err != nil || !isMember {
		http.Error(w, "Not a member", http.StatusForbidden)
		return
	}

	// Получаем предыдущее значение last_seen_at ДО обновления
	previousLastSeen, _ := s.store.GetGroupLastSeen(req.GroupID, userID)

	// Обновляем last_seen_at
	if err := s.store.UpdateGroupLastSeen(req.GroupID, userID); err != nil {
		http.Error(w, "Failed to mark as seen", http.StatusInternalServerError)
		return
	}

	// Получаем все "непрочитанные" сообщения (от других пользователей,
	// созданные между previousLastSeen и текущим временем)
	unreadMsgs, err := s.store.GetUnreadGroupMessages(req.GroupID, userID, previousLastSeen)
	if err == nil && len(unreadMsgs) > 0 {
		// Группируем msg_id по sender_id
		messagesBySender := make(map[string][]string)
		for _, msg := range unreadMsgs {
			if msg.Sender != "" && msg.Sender != userID {
				messagesBySender[msg.Sender] = append(messagesBySender[msg.Sender], msg.ID)
			}
		}

		// Рассылаем read статусы отправителям через WebSocket
		if len(messagesBySender) > 0 {
			s.hub.Mutex.Lock()
			for senderID, msgIDs := range messagesBySender {
				if senderClient, ok := s.hub.Clients[senderID]; ok {
					// Конвертируем []string в []interface{} для JSON
					idsInterface := make([]interface{}, len(msgIDs))
					for i, id := range msgIDs {
						idsInterface[i] = id
					}

					senderClient.Conn.WriteJSON(map[string]interface{}{
						"type":     "group_bulk_status_update",
						"group_id": req.GroupID,
						"status":   "read",
						"ids":      idsInterface,
					})
				}
			}
			s.hub.Mutex.Unlock()

			log.Printf("✅ Sent read status for %d messages in group %s to %d senders",
				len(unreadMsgs), req.GroupID, len(messagesBySender))
		}
	}

	json.NewEncoder(w).Encode(map[string]string{"status": "ok"})
}
