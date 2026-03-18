package models

type Message struct {
	Type   string `json:"type"`
	From   string `json:"from"`
	To     string `json:"to"`
	Data   string `json:"data"`
	PubKey string `json:"pubKey"`
}
