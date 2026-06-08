package storage

import (
	"Synapse_server/models"
	"database/sql"
	"log"
)

func GetChatID(a, b string) string {
	if a < b {
		return a + ":" + b
	}
	return b + ":" + a
}

func (s *Storage) SaveMessage(msg models.Message) {
	chatID := GetChatID(msg.From, msg.To)

	status := msg.Status
	if status == "" {
		status = "sent"
	}

	replyTo := msg.ReplyTo

	_, err := s.db.DB.Exec(`
        INSERT INTO messages
        (
            id, chat_id, sender, receiver, data, iv,
            key_sender, key_receiver, created_at, status, reply_to
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
		msg.ID, chatID, msg.From, msg.To, msg.Data, msg.IV,
		msg.KeySender, msg.KeyReceiver, msg.CreatedAt, status, replyTo,
	)

	if err != nil {
		log.Println("❌ SaveMessage error:", err)
	}
}

func (s *Storage) GetMessages(chatID string) ([]models.Message, error) {
	rows, err := s.db.DB.Query(`
        SELECT id, sender, receiver, data, iv, key_sender, key_receiver,
               created_at, status, COALESCE(reply_to, '') as reply_to
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
			&msg.ID, &msg.From, &msg.To, &msg.Data, &msg.IV,
			&msg.KeySender, &msg.KeyReceiver, &msg.CreatedAt,
			&status, &msg.ReplyTo,
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

func (s *Storage) UpdateMessageStatus(msgID string, newStatus string) error {
	_, err := s.db.DB.Exec(`
        UPDATE messages SET status = ? WHERE id = ?
    `, newStatus, msgID)

	if err != nil {
		log.Println("❌ Ошибка обновления статуса в БД:", err)
		return err
	}

	return nil
}

type LastMessage struct {
	ChatID      string `json:"chat_id"`
	PartnerID   string `json:"partner_id"`
	ID          string `json:"id"`
	From        string `json:"from"`
	To          string `json:"to"`
	Data        string `json:"data"`
	IV          string `json:"iv"`
	KeySender   string `json:"key_sender"`
	KeyReceiver string `json:"key_receiver"`
	CreatedAt   int64  `json:"created_at"`
	Status      string `json:"status"`
	ReplyTo     string `json:"reply_to,omitempty"`
}

func (s *Storage) GetLastMessages(userID string) ([]LastMessage, error) {
	query := `
        SELECT 
            m.chat_id, m.id, m.sender, m.receiver, m.data, m.iv,
            m.key_sender, m.key_receiver, m.created_at, m.status,
            COALESCE(m.reply_to, '') as reply_to
        FROM messages m
        INNER JOIN (
            SELECT chat_id, MAX(created_at) as max_time
            FROM messages
            WHERE sender = ? OR receiver = ?
            GROUP BY chat_id
        ) latest ON m.chat_id = latest.chat_id AND m.created_at = latest.max_time
        ORDER BY m.created_at DESC
    `

	rows, err := s.db.DB.Query(query, userID, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var results []LastMessage

	for rows.Next() {
		var msg LastMessage
		var status sql.NullString

		err := rows.Scan(
			&msg.ChatID, &msg.ID, &msg.From, &msg.To,
			&msg.Data, &msg.IV, &msg.KeySender, &msg.KeyReceiver,
			&msg.CreatedAt, &status, &msg.ReplyTo,
		)

		if err != nil {
			log.Println("❌ Scan error in GetLastMessages:", err)
			continue
		}

		if status.Valid {
			msg.Status = status.String
		} else {
			msg.Status = "sent"
		}

		if msg.From == userID {
			msg.PartnerID = msg.To
		} else {
			msg.PartnerID = msg.From
		}

		results = append(results, msg)
	}

	if err := rows.Err(); err != nil {
		return nil, err
	}

	return results, nil
}
