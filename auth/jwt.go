package auth

import (
	"errors"
	"os"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

// secret хранит ключ в памяти после первой инициализации
var secret []byte

// InitSecret загружает секретный ключ из переменных окружения.
func InitSecret() error {
	key := os.Getenv("SECRET_KEY")
	if key == "" {
		return errors.New("SECRET_KEY не установлен в .env файле")
	}
	secret = []byte(key)
	return nil
}

// GetSecret возвращает текущий секретный ключ.
func GetSecret() []byte {
	return secret
}

func ParseToken(tokenString string) (string, error) {
	token, err := jwt.Parse(tokenString, func(token *jwt.Token) (interface{}, error) {
		// Проверяем, что алгоритм подписи именно HS256
		if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, errors.New("unexpected signing method")
		}
		return secret, nil
	})

	if err != nil || !token.Valid {
		return "", errors.New("invalid token")
	}

	claims, ok := token.Claims.(jwt.MapClaims)
	if !ok {
		return "", errors.New("invalid claims")
	}

	userID, ok := claims["user_id"].(string)
	if !ok {
		return "", errors.New("no user_id in claims")
	}

	return userID, nil
}

func GenerateToken(userID string) (string, error) {
	claims := jwt.MapClaims{
		"user_id": userID,
		"exp":     time.Now().Add(time.Hour * 72).Unix(),
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString(secret)
}
