package models

type Message struct {
	Type   string `json:"type"`
	From   string `json:"from"`
	To     string `json:"to"`
	Data   string `json:"data,omitempty"`
	IV     string `json:"iv,omitempty"`
	Key    string `json:"key,omitempty"`
	PubKey string `json:"pubKey,omitempty"`
}
