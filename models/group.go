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
	Username string `json:"username,omitempty"`
	JoinedAt int64  `json:"joined_at"`
	Role     string `json:"role"`
}

type GroupWithMembers struct {
	Group
	Members           []GroupMember `json:"members"`
	LastMessageText   string        `json:"last_message_text,omitempty"`
	LastMessageSender string        `json:"last_message_sender,omitempty"`
	LastMessageTime   int64         `json:"last_message_time,omitempty"`
	UnreadCount       int           `json:"unread_count"`
}

type GroupMessage struct {
	ID        string `json:"id"`
	GroupID   string `json:"group_id"`
	Sender    string `json:"sender"`
	Username  string `json:"username,omitempty"`
	Data      string `json:"data"`
	CreatedAt int64  `json:"created_at"`
	ReplyTo   string `json:"reply_to,omitempty"`
	Status    string `json:"status,omitempty"` // 🆕 ОБЯЗАТЕЛЬНО для storage/groups.go
}
