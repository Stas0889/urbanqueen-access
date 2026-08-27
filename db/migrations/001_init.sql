PRAGMA foreign_keys = ON;
PRAGMA journal_mode = WAL;

CREATE TABLE IF NOT EXISTS admins (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0,1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS chats (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  getcourse_group_id INTEGER NOT NULL UNIQUE,
  telegram_chat_id INTEGER UNIQUE,
  telegram_chat_title TEXT,
  is_enabled INTEGER NOT NULL DEFAULT 1 CHECK (is_enabled IN (0,1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  getcourse_user_id INTEGER NOT NULL UNIQUE,
  email TEXT,
  name TEXT,
  phone TEXT,
  telegram_user_id INTEGER UNIQUE,
  telegram_username TEXT,
  telegram_first_name TEXT,
  personal_access_token TEXT NOT NULL UNIQUE,
  manual_block INTEGER NOT NULL DEFAULT 0 CHECK (manual_block IN (0,1)),
  manual_block_reason TEXT,
  telegram_binding_locked INTEGER NOT NULL DEFAULT 0 CHECK (telegram_binding_locked IN (0,1)),
  last_getcourse_sync_at TEXT,
  last_telegram_sync_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS user_chat_access (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  chat_id TEXT NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
  access_status TEXT NOT NULL DEFAULT 'unknown' CHECK (access_status IN ('active','inactive','unknown')),
  telegram_status TEXT NOT NULL DEFAULT 'not_connected' CHECK (telegram_status IN ('unknown','not_connected','member','left','banned','administrator','creator')),
  access_started_at TEXT,
  access_ended_at TEXT,
  last_access_change_at TEXT,
  last_telegram_change_at TEXT,
  technical_ban_reason TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, chat_id)
);

CREATE TABLE IF NOT EXISTS invite_links (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  chat_id TEXT NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
  telegram_invite_link TEXT NOT NULL UNIQUE,
  telegram_invite_name TEXT,
  expires_at TEXT NOT NULL,
  used_at TEXT,
  revoked_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  chat_id TEXT REFERENCES chats(id) ON DELETE SET NULL,
  source TEXT NOT NULL CHECK (source IN ('system','getcourse','telegram','admin')),
  level TEXT NOT NULL DEFAULT 'info' CHECK (level IN ('info','warning','error')),
  event_type TEXT NOT NULL,
  message TEXT NOT NULL,
  payload TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS sync_jobs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  job_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  attempts INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 5,
  payload TEXT,
  last_error TEXT,
  run_after TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_user_chat_access_status ON user_chat_access(access_status);
CREATE INDEX IF NOT EXISTS idx_user_chat_telegram_status ON user_chat_access(telegram_status);
CREATE INDEX IF NOT EXISTS idx_events_created_at ON events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_events_type ON events(event_type);
CREATE INDEX IF NOT EXISTS idx_sync_jobs_due ON sync_jobs(status, run_after);

INSERT OR IGNORE INTO chats (id, name, slug, getcourse_group_id)
VALUES
  ('00000000-0000-4000-8000-000000000001', 'Пространство «ВЕДАНИЕ. Система восстановления человека»', 'vedanie', 4825549),
  ('00000000-0000-4000-8000-000000000002', 'Пространство «ВЕДАНИЕ: гормональный возраст 35+, 45+, 55+»', 'hormonal-age', 4900239);
