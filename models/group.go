package models

type Group struct {
	ID        string `json:"id"`
	Name      string `json:"name"`
	CreatorID string `json:"creator_id"`
	CreatedAt int64  `json:"created_at"`
}

type GroupMember struct {
	GroupID  string `json:"group_id"`
	UserID   string `json:"user_id"`
	Username string `json:"username,omitempty"` // заполняется при JOIN
	JoinedAt int64  `json:"joined_at"`
	Role     string `json:"role"` // "admin" или "member"
}

type GroupWithMembers struct {
	Group
	Members []GroupMember `json:"members"`
}

// GroupMessage — упрощённое сообщение для групп (без шифрования)
type GroupMessage struct {
	ID        string `json:"id"`
	GroupID   string `json:"group_id"`
	Sender    string `json:"sender"`
	Username  string `json:"username,omitempty"` // имя отправителя
	Data      string `json:"data"`               // plain text
	CreatedAt int64  `json:"created_at"`
	ReplyTo   string `json:"reply_to,omitempty"`
}
