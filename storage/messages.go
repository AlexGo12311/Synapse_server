package storage

import (
	"Synapse_server/models"
	"database/sql"
	"log"
)

// GetChatID генерирует уникальный ID чата между двумя пользователями
func GetChatID(a, b string) string {
	if a < b {
		return a + ":" + b
	}
	return b + ":" + a
}

// SaveMessage сохраняет сообщение в БД
func (s *Storage) SaveMessage(msg models.Message) {

	chatID := GetChatID(msg.From, msg.To)

	status := msg.Status
	if status == "" {
		status = "sent"
	}

	_, err := s.db.DB.Exec(`
        INSERT INTO messages
        (
            id,
            chat_id,
            sender,
            receiver,
            data,
            iv,
            key_sender,
            key_receiver,
            created_at,
            status
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
		msg.ID,
		chatID,
		msg.From,
		msg.To,
		msg.Data,
		msg.IV,
		msg.KeySender,
		msg.KeyReceiver,
		msg.CreatedAt,
		status,
	)

	if err != nil {
		log.Println("❌ SaveMessage error:", err)
	}
}

// GetMessages возвращает историю переписки
func (s *Storage) GetMessages(chatID string) ([]models.Message, error) {

	rows, err := s.db.DB.Query(`
        SELECT
            id,
            sender,
            receiver,
            data,
            iv,
            key_sender,
            key_receiver,
            created_at,
            status
        FROM messages
        WHERE chat_id = ?
        ORDER BY created_at ASC
    `, chatID)

	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var messages []models.Message

	for rows.Next() {

		var msg models.Message
		var status sql.NullString

		err := rows.Scan(
			&msg.ID,
			&msg.From,
			&msg.To,
			&msg.Data,
			&msg.IV,
			&msg.KeySender,
			&msg.KeyReceiver,
			&msg.CreatedAt,
			&status,
		)

		if err != nil {
			log.Println("❌ Scan error:", err)
			continue
		}

		msg.Type = "message"

		if status.Valid {
			msg.Status = status.String
		} else {
			msg.Status = "sent"
		}

		messages = append(messages, msg)
	}

	if err := rows.Err(); err != nil {
		return nil, err
	}

	return messages, nil
}

// UpdateMessageStatus обновляет статус доставки сообщения
func (s *Storage) UpdateMessageStatus(msgID string, newStatus string) error {
	_, err := s.db.DB.Exec(`
        UPDATE messages 
        SET status = ? 
        WHERE id = ?
    `, newStatus, msgID)

	if err != nil {
		log.Println("❌ Ошибка обновления статуса в БД:", err)
		return err
	}

	return nil
}
