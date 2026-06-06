package storage

import (
	"Synapse_server/models"
	"database/sql"
	"log"

	"github.com/google/uuid"
)

func (s *Storage) CreateUser(username, password string) (*models.User, error) {
	id := uuid.New().String()

	_, err := s.db.DB.Exec(`
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

func (s *Storage) GetUserByUsername(username string) (*models.User, error) {
	log.Println("LOGIN SEARCH:", username)

	var user models.User
	var rawPubKey sql.NullString

	err := s.db.DB.QueryRow(`
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

	if rawPubKey.Valid {
		user.PubKey = rawPubKey.String
	} else {
		user.PubKey = ""
	}

	log.Println("✅ USER FOUND:", user.Username)
	return &user, nil
}

func (s *Storage) SavePubKey(userID, pubkey string) {
	result, err := s.db.DB.Exec(`
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

func (s *Storage) GetPubKey(userID string) (string, error) {
	var rawKey sql.NullString

	err := s.db.DB.QueryRow(`
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

func (s *Storage) GetAllUsers() ([]models.User, error) {

	rows, err := s.db.DB.Query(`
		SELECT id, username
		FROM users
		ORDER BY username ASC
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var users []models.User

	for rows.Next() {

		var user models.User

		err := rows.Scan(
			&user.ID,
			&user.Username,
		)

		if err != nil {
			continue
		}

		users = append(users, user)
	}

	return users, nil
}
