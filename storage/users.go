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

func (s *Storage) GetUserByID(userID string) (string, error) {
	var username string
	err := s.db.DB.QueryRow("SELECT username FROM users WHERE id = ?", userID).Scan(&username)
	if err != nil {
		log.Println("GetUserByID error:", err)
		return "", err
	}
	return username, nil
}

// UserProfile представляет публичную информацию о пользователе
type UserProfile struct {
	UserID   string `json:"user_id"`
	Username string `json:"username"`
	Bio      string `json:"bio"`
	Location string `json:"location"`
	Birthday string `json:"birthday"`
}

// GetProfile возвращает профиль пользователя (username, bio, location, birthday)
func (s *Storage) GetProfile(userID string) (*UserProfile, error) {
	profile := &UserProfile{UserID: userID}

	err := s.db.DB.QueryRow(`
		SELECT username, COALESCE(bio, ''), COALESCE(location, ''), COALESCE(birthday, '')
		FROM users 
		WHERE id = ?
	`, userID).Scan(&profile.Username, &profile.Bio, &profile.Location, &profile.Birthday)

	if err != nil {
		log.Println("❌ GetProfile error:", err)
		return nil, err
	}

	return profile, nil
}

// UpdateProfile обновляет bio, location и birthday пользователя
func (s *Storage) UpdateProfile(userID string, bio, location, birthday string) error {
	// Ограничиваем длину полей
	if len(bio) > 500 {
		bio = bio[:500]
	}
	if len(location) > 100 {
		location = location[:100]
	}
	if len(birthday) > 10 {
		birthday = birthday[:10]
	}

	_, err := s.db.DB.Exec(`
		UPDATE users 
		SET bio = ?, location = ?, birthday = ? 
		WHERE id = ?
	`, bio, location, birthday, userID)

	if err != nil {
		log.Println("❌ UpdateProfile error:", err)
	}
	return err
}
