ALTER TABLE users ADD COLUMN migration_status TEXT NOT NULL DEFAULT 'unlinked'
  CHECK (migration_status IN ('linked','unlinked','legacy'));

ALTER TABLE events ADD COLUMN resolved_at TEXT;
ALTER TABLE events ADD COLUMN resolved_by_admin_id TEXT REFERENCES admins(id) ON DELETE SET NULL;

ALTER TABLE sync_jobs ADD COLUMN requires_admin_attention INTEGER NOT NULL DEFAULT 0
  CHECK (requires_admin_attention IN (0,1));

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_telegram_username ON users(telegram_username);
CREATE INDEX IF NOT EXISTS idx_users_migration_status ON users(migration_status);
CREATE INDEX IF NOT EXISTS idx_user_chat_user ON user_chat_access(user_id);
CREATE INDEX IF NOT EXISTS idx_user_chat_chat ON user_chat_access(chat_id);
CREATE INDEX IF NOT EXISTS idx_invite_links_lookup ON invite_links(telegram_invite_link, revoked_at);
CREATE INDEX IF NOT EXISTS idx_events_attention ON events(level, resolved_at, created_at DESC);
