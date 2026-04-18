package models

type Message struct {
	Type string `json:"type"`

	From string `json:"from"`
	To   string `json:"to"`

	Data string `json:"data"`
	IV   string `json:"iv"`

	KeySender   string `json:"key_sender"`
	KeyReceiver string `json:"key_receiver"`
}
