package database

import (
	"database/sql"
	"log"
	"os"

	_ "github.com/mattn/go-sqlite3"
)

type Database struct {
	DB *sql.DB
}

// 🆕 ИСПРАВЛЕНО: возвращаем оригинальную сигнатуру New() без параметров
func New() *Database {
	// Путь к БД: из переменной окружения или по умолчанию
	dbPath := os.Getenv("DB_PATH")
	if dbPath == "" {
		dbPath = "chat.db"
	}

	// 🆕 Подключаем с busy_timeout и WAL режимом прямо в DSN
	dsn := dbPath + "?_busy_timeout=5000&_journal_mode=WAL&_foreign_keys=ON"
	db, err := sql.Open("sqlite3", dsn)
	if err != nil {
		log.Fatal("❌ Failed to open database:", err)
	}

	// Проверяем подключение
	if err := db.Ping(); err != nil {
		log.Fatal("❌ Failed to ping database:", err)
	}

	// 🆕 КРИТИЧНО: включаем WAL режим для параллельного чтения/записи
	_, err = db.Exec(`PRAGMA journal_mode=WAL;`)
	if err != nil {
		log.Printf("⚠️ WAL pragma failed: %v", err)
	}

	// 🆕 Ждём разблокировки до 5 секунд вместо мгновенного SQLITE_BUSY
	_, err = db.Exec(`PRAGMA busy_timeout=5000;`)
	if err != nil {
		log.Printf("⚠️ busy_timeout pragma failed: %v", err)
	}

	// 🆕 Включаем foreign keys
	_, err = db.Exec(`PRAGMA foreign_keys=ON;`)
	if err != nil {
		log.Printf("⚠️ foreign_keys pragma failed: %v", err)
	}

	// 🆕 Оптимизация: синхронизация NORMAL (быстрее чем FULL, безопасно с WAL)
	_, err = db.Exec(`PRAGMA synchronous=NORMAL;`)
	if err != nil {
		log.Printf("⚠️ synchronous pragma failed: %v", err)
	}

	// 🆕 Увеличиваем пул соединений для параллельных запросов
	db.SetMaxOpenConns(10)
	db.SetMaxIdleConns(5)
	db.SetConnMaxLifetime(0) // Бессрочные соединения

	log.Println("✅ Database initialized with WAL mode and busy_timeout=5000ms")

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
		last_seen_at INTEGER DEFAULT 0,
		role TEXT DEFAULT 'member',
		PRIMARY KEY (group_id, user_id),
		FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE CASCADE,
		FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
	);

	CREATE INDEX IF NOT EXISTS idx_messages_group ON messages(group_id);
	CREATE INDEX IF NOT EXISTS idx_messages_chat ON messages(chat_id);
	CREATE INDEX IF NOT EXISTS idx_group_members_user ON group_members(user_id);
	`

	_, err := d.DB.Exec(query)
	if err != nil {
		log.Fatal("❌ Failed to create tables:", err)
	}

	// 🆕 Миграция: добавляем last_seen_at если его нет (для старых БД)
	d.DB.Exec(`ALTER TABLE group_members ADD COLUMN last_seen_at INTEGER DEFAULT 0`)
	// Игнорируем ошибку если колонка уже есть

	log.Println("✅ Database tables created/verified")
}

func (d *Database) Close() {
	if d.DB != nil {
		d.DB.Close()
	}
}
