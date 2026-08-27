ALTER TABLE chats ADD COLUMN environment TEXT NOT NULL DEFAULT 'production'
  CHECK (environment IN ('production','test'));

ALTER TABLE chats ADD COLUMN last_sync_at TEXT;

CREATE INDEX IF NOT EXISTS idx_chats_environment ON chats(environment, is_enabled);

CREATE TABLE IF NOT EXISTS telegram_updates (
  update_id INTEGER PRIMARY KEY,
  received_at TEXT NOT NULL
);

INSERT INTO chats (
  id, name, slug, getcourse_group_id, telegram_chat_id,
  telegram_chat_title, is_enabled, environment, created_at, updated_at
) VALUES (
  '00000000-0000-4000-8000-000000000003',
  'TEST | UrbanQueen Access',
  'test-urbanqueen-access',
  4938193,
  -1003872347411,
  'TEST | UrbanQueen Access',
  1,
  'test',
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
)
ON CONFLICT(getcourse_group_id) DO UPDATE SET
  name = excluded.name,
  slug = excluded.slug,
  telegram_chat_id = excluded.telegram_chat_id,
  telegram_chat_title = excluded.telegram_chat_title,
  is_enabled = excluded.is_enabled,
  environment = excluded.environment,
  updated_at = CURRENT_TIMESTAMP;
