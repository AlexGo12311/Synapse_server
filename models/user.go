package models

type User struct {
	ID        string  `json:"id"`
	Username  string  `json:"username"`
	Bio       string  `json:"bio"`
	Location  string  `json:"location"`
	Latitude  float64 `json:"-"`
	Longitude float64 `json:"-"`
	Birthday  string  `json:"birthday"`

	Password     string `json:"-"`
	PubKey       string `json:"-"`
	ProfileColor string `json:"-"`
}
