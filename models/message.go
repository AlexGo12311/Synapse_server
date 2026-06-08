package models

type Message struct {
	Type string `json:"type"`

	ID string `json:"id"`

	From string `json:"from"`
	To   string `json:"to"`

	Data string `json:"data"`
	IV   string `json:"iv"`

	KeySender   string `json:"key_sender"`
	KeyReceiver string `json:"key_receiver"`

	CreatedAt int64  `json:"created_at"`
	Status    string `json:"status"`
	ReplyTo   string `json:"reply_to,omitempty"`
}
