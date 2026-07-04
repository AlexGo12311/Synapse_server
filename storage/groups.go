package storage

import (
	"Synapse_server/models"
	"database/sql"
	"fmt"
	"log"
	"time"

	"github.com/google/uuid"
)

// CreateGroup создаёт новую группу и добавляет создателя как админа
func (s *Storage) CreateGroup(name, creatorID string) (*models.Group, error) {
	id := uuid.New().String()
	now := time.Now().Unix()

	tx, err := s.db.DB.Begin()
	if err != nil {
		return nil, err
	}
	defer tx.Rollback()

	// Создаём группу
	_, err = tx.Exec(`
        INSERT INTO groups (id, name, creator_id, created_at)
        VALUES (?, ?, ?, ?)
    `, id, name, creatorID, now)
	if err != nil {
		return nil, err
	}

	// Добавляем создателя как админа
	_, err = tx.Exec(`
        INSERT INTO group_members (group_id, user_id, joined_at, role)
        VALUES (?, ?, ?, 'admin')
    `, id, creatorID, now)
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

// AddMember добавляет пользователя в группу
func (s *Storage) AddMember(groupID, userID string) error {
	_, err := s.db.DB.Exec(`
        INSERT OR IGNORE INTO group_members (group_id, user_id, joined_at, role)
        VALUES (?, ?, ?, 'member')
    `, groupID, userID, time.Now().Unix())

	if err != nil {
		log.Printf("❌ AddMember error: %v", err)
	}
	return err
}

// RemoveMember удаляет пользователя из группы
func (s *Storage) RemoveMember(groupID, userID string) error {
	// Не даём удалить создателя
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

// GetUserGroups возвращает все группы пользователя
func (s *Storage) GetUserGroups(userID string) ([]models.GroupWithMembers, error) {
	rows, err := s.db.DB.Query(`
        SELECT g.id, g.name, g.creator_id, g.created_at
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
		if err := rows.Scan(&g.ID, &g.Name, &g.CreatorID, &g.CreatedAt); err != nil {
			continue
		}

		// Загружаем участников для каждой группы
		members, err := s.GetGroupMembers(g.ID)
		if err == nil {
			g.Members = members
		}

		groups = append(groups, g)
	}

	return groups, nil
}

// GetGroupMembers возвращает всех участников группы
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

// IsGroupMember проверяет, является ли пользователь участником группы
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

// SaveGroupMessage сохраняет сообщение в группу (plain text)
func (s *Storage) SaveGroupMessage(msg models.GroupMessage) error {
	_, err := s.db.DB.Exec(`
        INSERT INTO messages (id, chat_id, sender, receiver, group_id, data, iv, key_sender, key_receiver, created_at, status, reply_to)
        VALUES (?, ?, ?, '', ?, ?, '', '', '', ?, 'sent', ?)
    `, msg.ID, "group:"+msg.GroupID, msg.Sender, msg.GroupID, msg.Data, msg.CreatedAt, msg.ReplyTo)

	if err != nil {
		log.Printf("❌ SaveGroupMessage error: %v", err)
	}
	return err
}

// GetGroupMessages возвращает историю сообщений группы
func (s *Storage) GetGroupMessages(groupID string, limit int) ([]models.GroupMessage, error) {
	if limit <= 0 {
		limit = 100
	}

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

	return messages, nil
}

// GetGroupByID возвращает информацию о группе
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
