package storage

import (
	"Synapse_server/database"
	"Synapse_server/models"
	"database/sql"
	"log"
)

// ===== ChatID =====
func GetChatID(a, b string) string {
	if a < b {
		return a + ":" + b
	}
	return b + ":" + a
}

// ===== SAVE MESSAGE =====
func SaveMessage(msg models.Message) {

	chatID := GetChatID(msg.From, msg.To)

	// Если статус пустой при сохранении, ставим sent
	status := msg.Status
	if status == "" {
		status = "sent"
	}

	_, err := database.DB.Exec(`
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
		status, // СОХРАНЯЕМ СТАТУС
	)

	if err != nil {
		log.Println("❌ SaveMessage error:", err)
	}
}

// ===== GET MESSAGES =====
func GetMessages(chatID string) ([]models.Message, error) {

	rows, err := database.DB.Query(`
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
		// Используем sql.NullString на случай, если в базе есть старые сообщения со значением NULL
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
			&status, // СЧИТЫВАЕМ СТАТУС
		)

		if err != nil {
			log.Println("❌ Scan error:", err)
			continue
		}

		msg.Type = "message"

		// Обрабатываем NULL
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

// ===== UPDATE MESSAGE STATUS (НОВАЯ ФУНКЦИЯ) =====
func UpdateMessageStatus(msgID string, newStatus string) error {
	_, err := database.DB.Exec(`
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
