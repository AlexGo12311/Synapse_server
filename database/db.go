package database

import (
	"database/sql"
	"log"

	_ "modernc.org/sqlite"
)

type Database struct {
	DB *sql.DB
}

// New инициализирует подключение к БД и создает таблицы
func New() *Database {
	db, err := sql.Open("sqlite", "chat.db")
	if err != nil {
		log.Fatal(err)
	}

	d := &Database{DB: db}
	d.createTables()
	return d
}

func (d *Database) createTables() {
	query := `
    CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY,
        chat_id TEXT,
        sender TEXT,
        receiver TEXT,
        data TEXT,
        iv TEXT,
        key_sender TEXT,
        key_receiver TEXT,
        created_at INTEGER,
        status TEXT DEFAULT 'sent' -- НОВАЯ КОЛОНКА
    );

    CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        username TEXT UNIQUE,
        password TEXT,
        pubkey TEXT
    );
    `

	_, err := d.DB.Exec(query)
	if err != nil {
		log.Fatal(err)
	}
}
