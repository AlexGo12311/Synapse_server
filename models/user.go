package models

type User struct {
	ID       string `json:"id"`
	Username string `json:"username"`
	Bio      string `json:"bio"`
	Location string `json:"location"`
	Birthday string `json:"birthday"`

	Password     string `json:"-"`
	PubKey       string `json:"-"`
	ProfileColor string `json:"-"`
}
