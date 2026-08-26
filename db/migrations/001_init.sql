CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TYPE access_status AS ENUM ('active', 'inactive', 'unknown');
CREATE TYPE telegram_member_status AS ENUM ('unknown', 'not_connected', 'member', 'left', 'banned', 'administrator', 'creator');
CREATE TYPE event_level AS ENUM ('info', 'warning', 'error');
CREATE TYPE event_source AS ENUM ('system', 'getcourse', 'telegram', 'admin');

CREATE TABLE IF NOT EXISTS admins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE,
  password_hash text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS chats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  getcourse_group_id bigint NOT NULL UNIQUE,
  telegram_chat_id bigint UNIQUE,
  telegram_chat_title text,
  is_enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  getcourse_user_id bigint NOT NULL UNIQUE,
  email text,
  name text,
  phone text,
  telegram_user_id bigint UNIQUE,
  telegram_username text,
  telegram_first_name text,
  personal_access_token text NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(24), 'hex'),
  manual_block boolean NOT NULL DEFAULT false,
  manual_block_reason text,
  telegram_binding_locked boolean NOT NULL DEFAULT false,
  last_getcourse_sync_at timestamptz,
  last_telegram_sync_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS user_chat_access (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  chat_id uuid NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
  access_status access_status NOT NULL DEFAULT 'unknown',
  telegram_status telegram_member_status NOT NULL DEFAULT 'not_connected',
  access_started_at timestamptz,
  access_ended_at timestamptz,
  last_access_change_at timestamptz,
  last_telegram_change_at timestamptz,
  technical_ban_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, chat_id)
);

CREATE TABLE IF NOT EXISTS invite_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  chat_id uuid NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
  telegram_invite_link text NOT NULL UNIQUE,
  telegram_invite_name text,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS events (
  id bigserial PRIMARY KEY,
  user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  chat_id uuid REFERENCES chats(id) ON DELETE SET NULL,
  source event_source NOT NULL,
  level event_level NOT NULL DEFAULT 'info',
  event_type text NOT NULL,
  message text NOT NULL,
  payload jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sync_jobs (
  id bigserial PRIMARY KEY,
  job_type text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  attempts integer NOT NULL DEFAULT 0,
  max_attempts integer NOT NULL DEFAULT 5,
  payload jsonb,
  last_error text,
  run_after timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_user_chat_access_status ON user_chat_access(access_status);
CREATE INDEX IF NOT EXISTS idx_user_chat_telegram_status ON user_chat_access(telegram_status);
CREATE INDEX IF NOT EXISTS idx_events_created_at ON events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_events_type ON events(event_type);
CREATE INDEX IF NOT EXISTS idx_sync_jobs_due ON sync_jobs(status, run_after);

INSERT INTO chats (name, slug, getcourse_group_id)
VALUES
  ('Пространство «ВЕДАНИЕ. Система восстановления человека»', 'vedanie', 4825549),
  ('Пространство «ВЕДАНИЕ: гормональный возраст 35+, 45+, 55+»', 'hormonal-age', 4900239)
ON CONFLICT (slug) DO NOTHING;
