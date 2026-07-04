package database

import (
	"database/sql"
	"log"

	_ "modernc.org/sqlite"
)

type Database struct {
	DB *sql.DB
}

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
    CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        username TEXT UNIQUE,
        password TEXT,
        pubkey TEXT,
        bio TEXT DEFAULT '',
        location TEXT DEFAULT '',
        latitude REAL DEFAULT 0,
        longitude REAL DEFAULT 0,
        birthday TEXT DEFAULT '',
        profile_color TEXT DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY,
        chat_id TEXT,
        sender TEXT,
        receiver TEXT,
        group_id TEXT DEFAULT '',
        data TEXT,
        iv TEXT DEFAULT '',
        key_sender TEXT DEFAULT '',
        key_receiver TEXT DEFAULT '',
        created_at INTEGER,
        status TEXT DEFAULT 'sent',
        reply_to TEXT DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS groups (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        creator_id TEXT NOT NULL,
        created_at INTEGER,
        FOREIGN KEY (creator_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS group_members (
        group_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        joined_at INTEGER,
        role TEXT DEFAULT 'member',
        PRIMARY KEY (group_id, user_id),
        FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_messages_group ON messages(group_id);
    CREATE INDEX IF NOT EXISTS idx_group_members_user ON group_members(user_id);
    `

	_, err := d.DB.Exec(query)
	if err != nil {
		log.Fatal(err)
	}
}
