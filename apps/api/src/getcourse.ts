import { randomBytes, randomUUID } from 'node:crypto';
import { db, nowIso } from './db.js';

export type GetCourseAccessUpdate = {
  user_id: number;
  email?: string | null;
  name?: string | null;
  group_id: number;
  access_status: 'active' | 'inactive';
  event: string;
};

export function applyGetCourseAccessUpdate(input: GetCourseAccessUpdate) {
  const chat = db.prepare('SELECT id FROM chats WHERE getcourse_group_id = ? AND is_enabled = 1').get(input.group_id) as { id: string } | undefined;
  if (!chat) return { accepted: false, reason: 'unknown_or_disabled_group' } as const;

  return db.transaction(() => {
    const timestamp = nowIso();
    let user = db.prepare('SELECT id FROM users WHERE getcourse_user_id = ?').get(input.user_id) as { id: string } | undefined;
    if (!user) {
      user = { id: randomUUID() };
      db.prepare(`
        INSERT INTO users (
          id, getcourse_user_id, email, name, personal_access_token,
          migration_status, last_getcourse_sync_at, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, 'unlinked', ?, ?, ?)
      `).run(
        user.id,
        input.user_id,
        input.email?.trim().toLowerCase() || null,
        input.name?.trim() || null,
        randomBytes(32).toString('base64url'),
        timestamp,
        timestamp,
        timestamp,
      );
    } else {
      db.prepare(`
        UPDATE users SET
          email = COALESCE(?, email), name = COALESCE(?, name),
          last_getcourse_sync_at = ?, updated_at = ?
        WHERE id = ?
      `).run(input.email?.trim().toLowerCase() || null, input.name?.trim() || null, timestamp, timestamp, user.id);
    }

    const current = db.prepare(`
      SELECT access_status FROM user_chat_access WHERE user_id = ? AND chat_id = ?
    `).get(user.id, chat.id) as { access_status: string } | undefined;
    const changed = current?.access_status !== input.access_status;
    const accessId = randomUUID();
    db.prepare(`
      INSERT INTO user_chat_access (
        id, user_id, chat_id, access_status, telegram_status,
        access_started_at, access_ended_at, last_access_change_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, 'not_connected', ?, ?, ?, ?, ?)
      ON CONFLICT(user_id, chat_id) DO UPDATE SET
        access_status = excluded.access_status,
        access_started_at = CASE WHEN excluded.access_status = 'active' AND user_chat_access.access_status <> 'active' THEN excluded.last_access_change_at ELSE user_chat_access.access_started_at END,
        access_ended_at = CASE WHEN excluded.access_status = 'inactive' AND user_chat_access.access_status <> 'inactive' THEN excluded.last_access_change_at ELSE user_chat_access.access_ended_at END,
        last_access_change_at = CASE WHEN user_chat_access.access_status <> excluded.access_status THEN excluded.last_access_change_at ELSE user_chat_access.last_access_change_at END,
        updated_at = excluded.updated_at
    `).run(
      accessId, user.id, chat.id, input.access_status,
      input.access_status === 'active' ? timestamp : null,
      input.access_status === 'inactive' ? timestamp : null,
      timestamp, timestamp, timestamp,
    );

    if (changed) {
      db.prepare(`
        INSERT INTO events (user_id, chat_id, source, level, event_type, message, payload, created_at)
        VALUES (?, ?, 'getcourse', 'info', ?, ?, ?, ?)
      `).run(
        user.id,
        chat.id,
        input.access_status === 'active' ? 'ACCESS_GRANTED' : 'ACCESS_REVOKED',
        input.access_status === 'active' ? 'GetCourse подтвердил активный доступ' : 'GetCourse сообщил об окончании доступа',
        JSON.stringify({ group_id: input.group_id, event: input.event }),
        timestamp,
      );
      db.prepare(`
        INSERT INTO sync_jobs (job_type, payload, run_after, created_at, updated_at)
        VALUES ('RECONCILE_USER_CHAT', ?, ?, ?, ?)
      `).run(JSON.stringify({ user_id: user.id, chat_id: chat.id }), timestamp, timestamp, timestamp);
    }
    return { accepted: true, changed, userId: user.id, chatId: chat.id } as const;
  })();
}
