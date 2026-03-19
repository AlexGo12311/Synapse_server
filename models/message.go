package models

type Message struct {
	Type   string `json:"type"`
	From   string `json:"from"`
	To     string `json:"to"`
	Data   []byte `json:"data"`
	Key    []byte `json:"key"`
	Iv     []byte `json:"iv"`
	PubKey []byte `json:"pubKey"`
}
