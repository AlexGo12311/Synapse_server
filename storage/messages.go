package storage

import (
	"Synapse_server/database"
	"Synapse_server/models"
	"log"
)

// Генерация ChatID
func GetChatID(a, b string) string {
	if a < b {
		return a + ":" + b
	}
	return b + ":" + a
}

// Сохранение сообщения в БД
func SaveMessage(msg models.Message) {
	chatID := GetChatID(msg.From, msg.To)

	_, err := database.DB.Exec(`
		INSERT INTO messages (chat_id, sender, receiver, data, iv, enc_key)
		VALUES (?, ?, ?, ?, ?, ?)
	`, chatID, msg.From, msg.To, msg.Data, msg.IV, msg.Key)

	if err != nil {
		log.Println("❌ DB save error:", err)
	}
}

// Получение истории чата
func GetMessages(chatID string) ([]models.Message, error) {
	rows, err := database.DB.Query(`
		SELECT sender, receiver, data, iv, enc_key
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

		err := rows.Scan(
			&msg.From,
			&msg.To,
			&msg.Data,
			&msg.IV,
			&msg.Key,
		)

		if err != nil {
			log.Println("❌ Scan error:", err)
			continue
		}

		messages = append(messages, msg)
	}

	return messages, nil
}
