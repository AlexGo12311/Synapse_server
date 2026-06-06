package auth

import (
	"errors"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

var Secret = []byte("super_secret_key")

func ParseToken(tokenString string) (string, error) {
	token, err := jwt.Parse(tokenString, func(token *jwt.Token) (interface{}, error) {
		return Secret, nil
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
		return "", errors.New("no user_id")
	}

	return userID, nil
}

func GenerateToken(userID string) (string, error) {

	claims := jwt.MapClaims{
		"user_id": userID,
		"exp":     time.Now().Add(time.Hour * 72).Unix(),
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)

	return token.SignedString(Secret)
}
