import type { FastifyBaseLogger } from 'fastify';
import { config } from './config.js';
import { db, nowIso } from './db.js';
import { applyGetCourseAccessUpdate } from './getcourse.js';
import { getCourseUsersByEmails } from './getcourse-client.js';
import { openIncident, resolveIncidents } from './incidents.js';

type KnownUser = { getcourse_user_id: number; email: string; name: string | null };
type AuditedChat = { id: string; getcourse_group_id: number; environment: 'test' | 'production' };

let timer: NodeJS.Timeout | undefined;
let running = false;

export async function runGetCourseAudit(log: FastifyBaseLogger) {
  if (running) return { ok: true, skipped: true, reason: 'already_running' } as const;
  running = true;
  try {
    const environmentClause = config.getcourseAuditScope === 'test' ? "AND environment = 'test'" : '';
    const chats = db.prepare(`
      SELECT id, getcourse_group_id, environment
      FROM chats
      WHERE is_enabled = 1 ${environmentClause}
      ORDER BY created_at
    `).all() as AuditedChat[];
    if (!chats.length) return { ok: true, skipped: true, reason: 'no_chats' } as const;

    const users = db.prepare(`
      SELECT getcourse_user_id, email, name
      FROM users
      WHERE email IS NOT NULL AND email <> ''
      ORDER BY created_at
    `).all() as KnownUser[];
    if (!users.length) return { ok: true, checked: 0, changed: 0, missing: 0 } as const;

    const snapshots = await getCourseUsersByEmails(users.map((user) => user.email));
    const byEmail = new Map(snapshots.map((user) => [user.email, user]));
    let changed = 0;
    let missing = 0;

    for (const known of users) {
      const current = byEmail.get(known.email.toLowerCase());
      // A missing export row is not proof of revoked access; fail closed only on an explicit group list.
      if (!current) {
        missing += 1;
        continue;
      }
      for (const chat of chats) {
        const result = applyGetCourseAccessUpdate({
          user_id: current.userId,
          email: current.email,
          name: current.name ?? known.name,
          group_id: chat.getcourse_group_id,
          access_status: current.groupIds.includes(chat.getcourse_group_id) ? 'active' : 'inactive',
          event: 'automatic_getcourse_audit',
        });
        if (result.accepted && result.changed) changed += 1;
      }
    }

    const timestamp = nowIso();
    for (const chat of chats) db.prepare('UPDATE chats SET last_sync_at = ?, updated_at = ? WHERE id = ?').run(timestamp, timestamp, chat.id);
    const resolved = resolveIncidents({ source: 'getcourse', eventType: 'GETCOURSE_AUDIT_ERROR' });
    if (resolved > 0) {
      db.prepare(`
        INSERT INTO events (source, level, event_type, message, payload, created_at)
        VALUES ('getcourse', 'info', 'GETCOURSE_AUDIT_RECOVERED', 'Сверка GetCourse снова работает', ?, ?)
      `).run(JSON.stringify({ resolved_incidents: resolved }), timestamp);
    }
    log.info({ scope: config.getcourseAuditScope, checked: snapshots.length, changed, missing }, 'GetCourse access audit completed');
    return { ok: true, checked: snapshots.length, changed, missing } as const;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log.error({ error: message }, 'GetCourse access audit failed');
    openIncident({
      source: 'getcourse',
      eventType: 'GETCOURSE_AUDIT_ERROR',
      message: 'Автоматическая сверка GetCourse завершилась ошибкой',
      payload: { error: message },
    });
    throw error;
  } finally {
    running = false;
  }
}

export function startGetCourseAudit(log: FastifyBaseLogger) {
  if (timer || config.getcourseAuditScope === 'off' || !config.getcourseApiConfigured) return;
  const intervalMs = config.getcourseAuditIntervalMinutes * 60_000;
  const schedule = (delay: number) => {
    timer = setTimeout(async () => {
      let nextDelay = intervalMs;
      try { await runGetCourseAudit(log); }
      catch (error) {
        const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
        // Export API is capped per rolling two-hour window. Back off instead of retrying into the limit.
        const exportIsBusy = message.includes('уже запущен один экспорт') || message.includes('export already');
        const exportTimedOut = message.includes('getcourse_export_timeout');
        nextDelay = message.includes('слишком много запросов') || message.includes('too many requests')
          ? Math.max(intervalMs, 2 * 60 * 60_000)
          : exportIsBusy || exportTimedOut
            ? Math.max(intervalMs, 60 * 60_000)
            : Math.max(intervalMs, 15 * 60_000);
      }
      schedule(nextDelay);
    }, delay);
    timer.unref();
  };
  schedule(15_000);
}
