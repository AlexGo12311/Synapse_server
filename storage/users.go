package storage

import (
	"Synapse_server/database"
	"Synapse_server/models"
	"database/sql"
	"log"

	"github.com/google/uuid"
)

// CreateUser регистрирует нового пользователя в базе данных.
func CreateUser(username, password string) (*models.User, error) {
	id := uuid.New().String()

	_, err := database.DB.Exec(`
		INSERT INTO users (id, username, password)
		VALUES (?, ?, ?)
	`, id, username, password)

	if err != nil {
		return nil, err
	}

	log.Println("REGISTER:", username)

	return &models.User{
		ID:       id,
		Username: username,
		Password: password,
	}, nil
}

// GetUserByUsername ищет пользователя для авторизации.
// Использует sql.NullString для безопасного чтения поля pubkey, которое может быть NULL.
func GetUserByUsername(username string) (*models.User, error) {
	log.Println("LOGIN SEARCH:", username)

	var user models.User
	var rawPubKey sql.NullString

	err := database.DB.QueryRow(`
		SELECT id, username, password, pubkey
		FROM users
		WHERE username = ?
	`, username).Scan(&user.ID, &user.Username, &user.Password, &rawPubKey)

	if err != nil {
		if err == sql.ErrNoRows {
			log.Println("❌ USER NOT FOUND:", username)
			return nil, nil
		}
		log.Println("❌ DB ERROR IN GetUserByUsername:", err)
		return nil, err
	}

	// Если в БД NULL, записываем пустую строку, иначе — само значение
	if rawPubKey.Valid {
		user.PubKey = rawPubKey.String
	} else {
		user.PubKey = ""
	}

	log.Println("✅ USER FOUND:", user.Username)
	return &user, nil
}

// SavePubKey обновляет публичный ключ пользователя.
func SavePubKey(userID, pubkey string) {
	result, err := database.DB.Exec(`
        UPDATE users SET pubkey = ? WHERE id = ?
    `, pubkey, userID)

	if err != nil {
		log.Println("❌ PUBKEY SAVE ERROR:", err)
		return
	}

	rows, _ := result.RowsAffected()
	if rows == 0 {
		log.Printf("⚠️ ПРЕДУПРЕЖДЕНИЕ: Ключ не обновлен. Пользователь с ID %s не найден.", userID)
	}
}

// GetPubKey возвращает публичный ключ пользователя.
func GetPubKey(userID string) (string, error) {
	var rawKey sql.NullString

	err := database.DB.QueryRow(`
		SELECT pubkey FROM users WHERE id = ?
	`, userID).Scan(&rawKey)

	if err != nil {
		if err == sql.ErrNoRows {
			return "", nil
		}
		return "", err
	}

	if rawKey.Valid {
		return rawKey.String, nil
	}
	return "", nil
}
