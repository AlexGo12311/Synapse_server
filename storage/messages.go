package storage

import (
	"Synapse_server/database"
	"Synapse_server/models"
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

	_, err := database.DB.Exec(`
		INSERT INTO messages 
		(chat_id, sender, receiver, data, iv, key_sender, key_receiver)
		VALUES (?, ?, ?, ?, ?, ?, ?)
	`,
		chatID,
		msg.From,
		msg.To,
		msg.Data,
		msg.IV,
		msg.KeySender,
		msg.KeyReceiver,
	)

	if err != nil {
		log.Println("❌ SaveMessage error:", err)
	}
}

// ===== GET MESSAGES =====
func GetMessages(chatID string) ([]models.Message, error) {

	rows, err := database.DB.Query(`
		SELECT sender, receiver, data, iv, key_sender, key_receiver
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
			&msg.KeySender,
			&msg.KeyReceiver,
		)

		if err != nil {
			log.Println("❌ Scan error:", err)
			continue
		}

		// важно: чтобы фронт понимал тип
		msg.Type = "message"

		messages = append(messages, msg)
	}

	return messages, nil
}
