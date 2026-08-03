package storage

import (
	"Synapse_server/models"
	"database/sql"
	"fmt"
	"log"
	"time"

	"github.com/google/uuid"
)

func (s *Storage) CreateGroup(name, creatorID string) (*models.Group, error) {
	id := uuid.New().String()
	now := time.Now().Unix()

	tx, err := s.db.DB.Begin()
	if err != nil {
		return nil, err
	}
	defer tx.Rollback()

	_, err = tx.Exec(`
		INSERT INTO groups (id, name, creator_id, created_at)
		VALUES (?, ?, ?, ?)
	`, id, name, creatorID, now)
	if err != nil {
		return nil, err
	}

	// last_seen_at = now, чтобы создатель не видел своих сообщений как непрочитанные
	_, err = tx.Exec(`
		INSERT INTO group_members (group_id, user_id, joined_at, last_seen_at, role)
		VALUES (?, ?, ?, ?, 'admin')
	`, id, creatorID, now, now)
	if err != nil {
		return nil, err
	}

	if err := tx.Commit(); err != nil {
		return nil, err
	}

	log.Printf("✅ Group created: %s (%s) by %s", name, id, creatorID)

	return &models.Group{
		ID:        id,
		Name:      name,
		CreatorID: creatorID,
		CreatedAt: now,
	}, nil
}

func (s *Storage) AddMember(groupID, userID string) error {
	now := time.Now().Unix()

	// last_seen_at = 0, чтобы все предыдущие сообщения были "непрочитанными"
	_, err := s.db.DB.Exec(`
		INSERT OR IGNORE INTO group_members (group_id, user_id, joined_at, last_seen_at, role)
		VALUES (?, ?, ?, ?, 'member')
	`, groupID, userID, now, 0)

	if err != nil {
		log.Printf("❌ AddMember error: %v", err)
	}
	return err
}

func (s *Storage) RemoveMember(groupID, userID string) error {
	var creatorID string
	err := s.db.DB.QueryRow(`SELECT creator_id FROM groups WHERE id = ?`, groupID).Scan(&creatorID)
	if err != nil {
		return err
	}
	if creatorID == userID {
		return fmt.Errorf("cannot remove group creator")
	}

	_, err = s.db.DB.Exec(`
		DELETE FROM group_members WHERE group_id = ? AND user_id = ?
	`, groupID, userID)
	return err
}

// GetUserGroups возвращает все группы пользователя с участниками и счётчиком непрочитанных
func (s *Storage) GetUserGroups(userID string) ([]models.GroupWithMembers, error) {
	rows, err := s.db.DB.Query(`
		SELECT g.id, g.name, g.creator_id, g.created_at, 
		       COALESCE(gm.last_seen_at, 0) as last_seen_at
		FROM groups g
		INNER JOIN group_members gm ON g.id = gm.group_id
		WHERE gm.user_id = ?
		ORDER BY g.created_at DESC
	`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var groups []models.GroupWithMembers
	for rows.Next() {
		var g models.GroupWithMembers
		var lastSeenAt int64
		if err := rows.Scan(&g.ID, &g.Name, &g.CreatorID, &g.CreatedAt, &lastSeenAt); err != nil {
			continue
		}

		members, err := s.GetGroupMembers(g.ID)
		if err == nil && members != nil {
			g.Members = members
		} else {
			g.Members = []models.GroupMember{}
		}

		lastMsg, err := s.GetLastGroupMessage(g.ID)
		if err == nil && lastMsg != nil {
			g.LastMessageText = lastMsg.Data
			g.LastMessageSender = lastMsg.Sender
			g.LastMessageTime = lastMsg.CreatedAt
		}

		unreadCount, err := s.GetGroupUnreadCount(g.ID, userID, lastSeenAt)
		if err == nil {
			g.UnreadCount = unreadCount
		} else {
			g.UnreadCount = 0
		}

		groups = append(groups, g)
	}

	return groups, nil
}

func (s *Storage) GetGroupMembers(groupID string) ([]models.GroupMember, error) {
	rows, err := s.db.DB.Query(`
		SELECT gm.group_id, gm.user_id, u.username, gm.joined_at, gm.role
		FROM group_members gm
		INNER JOIN users u ON gm.user_id = u.id
		WHERE gm.group_id = ?
		ORDER BY gm.role DESC, gm.joined_at ASC
	`, groupID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var members []models.GroupMember
	for rows.Next() {
		var m models.GroupMember
		if err := rows.Scan(&m.GroupID, &m.UserID, &m.Username, &m.JoinedAt, &m.Role); err != nil {
			continue
		}
		members = append(members, m)
	}

	return members, nil
}

func (s *Storage) IsGroupMember(groupID, userID string) (bool, error) {
	var count int
	err := s.db.DB.QueryRow(`
		SELECT COUNT(*) FROM group_members 
		WHERE group_id = ? AND user_id = ?
	`, groupID, userID).Scan(&count)

	if err != nil {
		return false, err
	}
	return count > 0, nil
}

// 🆕 ИСПРАВЛЕНО: обновляем last_seen_at отправителя при сохранении сообщения
// Когда пользователь пишет в группу — он "видит" её, значит все предыдущие
// сообщения от других пользователей считаются прочитанными для него
func (s *Storage) SaveGroupMessage(msg models.GroupMessage) error {
	// 1. Сохраняем сообщение
	_, err := s.db.DB.Exec(`
		INSERT INTO messages (id, chat_id, sender, receiver, group_id, data, iv, key_sender, key_receiver, created_at, status, reply_to)
		VALUES (?, ?, ?, '', ?, ?, '', '', '', ?, 'sent', ?)
	`, msg.ID, "group:"+msg.GroupID, msg.Sender, msg.GroupID, msg.Data, msg.CreatedAt, msg.ReplyTo)

	if err != nil {
		log.Printf("❌ SaveGroupMessage error: %v", err)
		return err
	}

	// 2. 🆕 КРИТИЧНО: обновляем last_seen_at отправителя
	// Он видел группу когда писал — значит все предыдущие сообщения прочитаны
	_, err = s.db.DB.Exec(`
		UPDATE group_members 
		SET last_seen_at = ? 
		WHERE group_id = ? AND user_id = ?
	`, msg.CreatedAt, msg.GroupID, msg.Sender)

	if err != nil {
		log.Printf("⚠️ SaveGroupMessage: failed to update last_seen_at: %v", err)
		// Не возвращаем ошибку — сообщение уже сохранено успешно
	}

	return nil
}

// GetGroupMessages — ОПТИМИЗИРОВАННАЯ версия (2 SQL запроса вместо N+1)
// Принимает viewerID для вычисления статусов СВОИХ сообщений
func (s *Storage) GetGroupMessages(groupID string, viewerID string, limit int) ([]models.GroupMessage, error) {
	if limit <= 0 {
		limit = 100
	}

	// 1. Загружаем все сообщения группы
	rows, err := s.db.DB.Query(`
		SELECT m.id, m.group_id, m.sender, u.username, m.data, m.created_at, COALESCE(m.reply_to, '')
		FROM messages m
		INNER JOIN users u ON m.sender = u.id
		WHERE m.group_id = ?
		ORDER BY m.created_at ASC
		LIMIT ?
	`, groupID, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var messages []models.GroupMessage
	for rows.Next() {
		var msg models.GroupMessage
		var replyTo sql.NullString
		if err := rows.Scan(&msg.ID, &msg.GroupID, &msg.Sender, &msg.Username, &msg.Data, &msg.CreatedAt, &replyTo); err != nil {
			continue
		}
		if replyTo.Valid {
			msg.ReplyTo = replyTo.String
		}
		messages = append(messages, msg)
	}

	// 2. ОДИН запрос: получаем last_seen_at ВСЕХ участников (кроме viewer)
	lastSeenMap := make(map[string]int64)
	if viewerID != "" {
		seenRows, err := s.db.DB.Query(`
			SELECT user_id, COALESCE(last_seen_at, 0)
			FROM group_members
			WHERE group_id = ? AND user_id != ?
		`, groupID, viewerID)
		if err != nil {
			log.Printf("⚠️ GetGroupMessages last_seen query error: %v", err)
		} else {
			for seenRows.Next() {
				var uid string
				var seen int64
				if err := seenRows.Scan(&uid, &seen); err == nil {
					lastSeenMap[uid] = seen
				}
			}
			seenRows.Close()
		}
	}

	// 3. Вычисляем статусы В ПАМЯТИ (без дополнительных SQL)
	for i := range messages {
		msg := &messages[i]
		if viewerID != "" && msg.Sender == viewerID {
			// Проверяем: хотя бы один участник "видел" это сообщение?
			readByAnyone := false
			for _, lastSeen := range lastSeenMap {
				if lastSeen >= msg.CreatedAt {
					readByAnyone = true
					break
				}
			}
			if readByAnyone {
				msg.Status = "read"
			} else {
				msg.Status = "delivered"
			}
		}
	}

	return messages, nil
}

func (s *Storage) GetGroupByID(groupID string) (*models.Group, error) {
	g := &models.Group{}
	err := s.db.DB.QueryRow(`
		SELECT id, name, creator_id, created_at
		FROM groups WHERE id = ?
	`, groupID).Scan(&g.ID, &g.Name, &g.CreatorID, &g.CreatedAt)

	if err != nil {
		return nil, err
	}
	return g, nil
}

func (s *Storage) GetLastGroupMessage(groupID string) (*models.GroupMessage, error) {
	var msg models.GroupMessage
	var replyTo sql.NullString

	err := s.db.DB.QueryRow(`
		SELECT m.id, m.group_id, m.sender, u.username, m.data, m.created_at, COALESCE(m.reply_to, '')
		FROM messages m
		INNER JOIN users u ON m.sender = u.id
		WHERE m.group_id = ?
		ORDER BY m.created_at DESC
		LIMIT 1
	`, groupID).Scan(&msg.ID, &msg.GroupID, &msg.Sender, &msg.Username, &msg.Data, &msg.CreatedAt, &replyTo)

	if err != nil {
		if err == sql.ErrNoRows {
			return nil, nil
		}
		return nil, err
	}

	if replyTo.Valid {
		msg.ReplyTo = replyTo.String
	}

	return &msg, nil
}

// Считает непрочитанные сообщения в группе
func (s *Storage) GetGroupUnreadCount(groupID, userID string, lastSeenAt int64) (int, error) {
	var count int
	err := s.db.DB.QueryRow(`
		SELECT COUNT(*) FROM messages
		WHERE group_id = ? 
		  AND sender != ?
		  AND created_at > ?
	`, groupID, userID, lastSeenAt).Scan(&count)

	if err != nil {
		log.Printf("❌ GetGroupUnreadCount error: %v", err)
		return 0, err
	}
	return count, nil
}

// Обновляет время последнего просмотра группы
func (s *Storage) UpdateGroupLastSeen(groupID, userID string) error {
	now := time.Now().Unix()
	_, err := s.db.DB.Exec(`
		UPDATE group_members 
		SET last_seen_at = ? 
		WHERE group_id = ? AND user_id = ?
	`, now, groupID, userID)

	if err != nil {
		log.Printf("❌ UpdateGroupLastSeen error: %v", err)
	}
	return err
}

// Возвращает sender_id сообщения в группе
func (s *Storage) GetGroupMessageSender(msgID, groupID string) (string, error) {
	var senderID string
	err := s.db.DB.QueryRow(`
        SELECT sender FROM messages 
        WHERE id = ? AND group_id = ?
    `, msgID, groupID).Scan(&senderID)

	if err != nil {
		return "", err
	}
	return senderID, nil
}

// Возвращает все сообщения группы, отправленные другими с created_at > since
func (s *Storage) GetUnreadGroupMessages(groupID, userID string, since int64) ([]models.GroupMessage, error) {
	rows, err := s.db.DB.Query(`
        SELECT id, sender, created_at
        FROM messages
        WHERE group_id = ?
          AND sender != ?
          AND created_at > ?
          AND created_at <= ?
    `, groupID, userID, since, time.Now().Unix())
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var msgs []models.GroupMessage
	for rows.Next() {
		var m models.GroupMessage
		if err := rows.Scan(&m.ID, &m.Sender, &m.CreatedAt); err != nil {
			continue
		}
		msgs = append(msgs, m)
	}
	return msgs, nil
}

// Получает ПРЕДЫДУЩЕЕ значение last_seen_at для пользователя в группе
func (s *Storage) GetGroupLastSeen(groupID, userID string) (int64, error) {
	var lastSeen int64
	err := s.db.DB.QueryRow(`
        SELECT COALESCE(last_seen_at, 0) 
        FROM group_members 
        WHERE group_id = ? AND user_id = ?
    `, groupID, userID).Scan(&lastSeen)

	if err != nil {
		return 0, err
	}
	return lastSeen, nil
}

// Переименовать группу (только создатель)
func (s *Storage) RenameGroup(groupID, newName, userID string) error {
	// Проверяем что пользователь - создатель
	var creatorID string
	err := s.db.DB.QueryRow(`SELECT creator_id FROM groups WHERE id = ?`, groupID).Scan(&creatorID)
	if err != nil {
		return err
	}
	if creatorID != userID {
		return fmt.Errorf("only creator can rename group")
	}

	_, err = s.db.DB.Exec(`
        UPDATE groups SET name = ? WHERE id = ?
    `, newName, groupID)
	return err
}

// Удалить участника из группы (только создатель)
func (s *Storage) RemoveMemberFromGroup(groupID, targetUserID, requesterID string) error {
	var creatorID string
	err := s.db.DB.QueryRow(`SELECT creator_id FROM groups WHERE id = ?`, groupID).Scan(&creatorID)
	if err != nil {
		return err
	}
	if creatorID != requesterID {
		return fmt.Errorf("only creator can remove members")
	}
	if creatorID == targetUserID {
		return fmt.Errorf("cannot remove creator from group")
	}

	_, err = s.db.DB.Exec(`
        DELETE FROM group_members WHERE group_id = ? AND user_id = ?
    `, groupID, targetUserID)
	return err
}

// Выйти из группы (не создатель)
func (s *Storage) LeaveGroup(groupID, userID string) error {
	var creatorID string
	err := s.db.DB.QueryRow(`SELECT creator_id FROM groups WHERE id = ?`, groupID).Scan(&creatorID)
	if err != nil {
		return err
	}
	if creatorID == userID {
		return fmt.Errorf("creator cannot leave group, use delete instead")
	}

	_, err = s.db.DB.Exec(`
        DELETE FROM group_members WHERE group_id = ? AND user_id = ?
    `, groupID, userID)
	return err
}

// Удалить группу (только создатель)
func (s *Storage) DeleteGroup(groupID, userID string) error {
	var creatorID string
	err := s.db.DB.QueryRow(`SELECT creator_id FROM groups WHERE id = ?`, groupID).Scan(&creatorID)
	if err != nil {
		return err
	}
	if creatorID != userID {
		return fmt.Errorf("only creator can delete group")
	}

	tx, err := s.db.DB.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()

	// Удаляем участников
	_, err = tx.Exec(`DELETE FROM group_members WHERE group_id = ?`, groupID)
	if err != nil {
		return err
	}

	// Удаляем сообщения
	_, err = tx.Exec(`DELETE FROM messages WHERE group_id = ?`, groupID)
	if err != nil {
		return err
	}

	// Удаляем саму группу
	_, err = tx.Exec(`DELETE FROM groups WHERE id = ?`, groupID)
	if err != nil {
		return err
	}

	return tx.Commit()
}

// Получить создателя группы
func (s *Storage) GetGroupCreator(groupID string) (string, error) {
	var creatorID string
	err := s.db.DB.QueryRow(`SELECT creator_id FROM groups WHERE id = ?`, groupID).Scan(&creatorID)
	if err != nil {
		return "", err
	}
	return creatorID, nil
}
