import { db, nowIso } from './db.js';

type IncidentSource = 'system' | 'getcourse' | 'telegram' | 'admin';

type OpenIncidentInput = {
  source: IncidentSource;
  eventType: string;
  message: string;
  payload?: unknown;
  userId?: string;
  chatId?: string;
};

type IncidentRow = { id: number };

export function openIncident(input: OpenIncidentInput) {
  const timestamp = nowIso();
  const payload = input.payload === undefined ? null : JSON.stringify(input.payload);
  const existing = db.prepare(`
    SELECT id
    FROM events
    WHERE level = 'error'
      AND resolved_at IS NULL
      AND source = ?
      AND event_type = ?
      AND user_id IS ?
      AND chat_id IS ?
      AND payload IS ?
    ORDER BY id DESC
    LIMIT 1
  `).get(
    input.source,
    input.eventType,
    input.userId ?? null,
    input.chatId ?? null,
    payload,
  ) as IncidentRow | undefined;

  if (existing) {
    db.prepare(`
      UPDATE events
      SET occurrence_count = occurrence_count + 1,
          last_occurred_at = ?,
          message = ?
      WHERE id = ?
    `).run(timestamp, input.message, existing.id);
    return { id: existing.id, created: false } as const;
  }

  const result = db.prepare(`
    INSERT INTO events (
      user_id, chat_id, source, level, event_type, message, payload,
      occurrence_count, last_occurred_at, created_at
    ) VALUES (?, ?, ?, 'error', ?, ?, ?, 1, ?, ?)
  `).run(
    input.userId ?? null,
    input.chatId ?? null,
    input.source,
    input.eventType,
    input.message,
    payload,
    timestamp,
    timestamp,
  );
  return { id: Number(result.lastInsertRowid), created: true } as const;
}

export function resolveIncidents(input: {
  source: IncidentSource;
  eventType: string;
  userId?: string;
  chatId?: string;
}) {
  const clauses = ["level = 'error'", 'resolved_at IS NULL', 'source = ?', 'event_type = ?'];
  const values: Array<string> = [input.source, input.eventType];
  if (input.userId !== undefined) {
    clauses.push('user_id = ?');
    values.push(input.userId);
  }
  if (input.chatId !== undefined) {
    clauses.push('chat_id = ?');
    values.push(input.chatId);
  }
  const timestamp = nowIso();
  const result = db.prepare(`
    UPDATE events
    SET resolved_at = ?, last_occurred_at = COALESCE(last_occurred_at, created_at)
    WHERE ${clauses.join(' AND ')}
  `).run(timestamp, ...values);
  return result.changes;
}
