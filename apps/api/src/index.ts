import 'dotenv/config';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import { z } from 'zod';
import { db, nowIso, sqliteInfo } from './db.js';

const app = Fastify({ logger: true });

await app.register(cors, {
  origin: process.env.APP_BASE_URL ?? 'http://localhost:5173',
});

const fallbackChats = [
  {
    id: 'demo-1',
    name: 'Пространство «ВЕДАНИЕ. Система восстановления человека»',
    slug: 'vedanie',
    getcourse_group_id: 4825549,
    telegram_chat_id: null,
    active_access: 0,
    telegram_members: 0,
    not_connected: 0,
    banned: 0,
  },
  {
    id: 'demo-2',
    name: 'Пространство «ВЕДАНИЕ: гормональный возраст 35+, 45+, 55+»',
    slug: 'hormonal-age',
    getcourse_group_id: 4900239,
    telegram_chat_id: null,
    active_access: 0,
    telegram_members: 0,
    not_connected: 0,
    banned: 0,
  },
];

app.get('/health', async () => ({
  ok: true,
  service: 'urbanqueen-access-api',
  database: 'sqlite',
  database_path: sqliteInfo.path,
  time: new Date().toISOString(),
}));

app.get('/api/dashboard', async () => {
  try {
    const chats = db.prepare(`
      SELECT
        c.id,
        c.name,
        c.slug,
        c.getcourse_group_id,
        c.telegram_chat_id,
        CAST(SUM(CASE WHEN uca.access_status = 'active' THEN 1 ELSE 0 END) AS INTEGER) AS active_access,
        CAST(SUM(CASE WHEN uca.telegram_status = 'member' THEN 1 ELSE 0 END) AS INTEGER) AS telegram_members,
        CAST(SUM(CASE WHEN uca.access_status = 'active' AND uca.telegram_status IN ('not_connected','unknown') THEN 1 ELSE 0 END) AS INTEGER) AS not_connected,
        CAST(SUM(CASE WHEN uca.telegram_status = 'banned' THEN 1 ELSE 0 END) AS INTEGER) AS banned
      FROM chats c
      LEFT JOIN user_chat_access uca ON uca.chat_id = c.id
      GROUP BY c.id
      ORDER BY c.created_at
    `).all();

    const stats = db.prepare(`
      SELECT
        COUNT(*) AS total_users,
        SUM(CASE WHEN telegram_user_id IS NOT NULL THEN 1 ELSE 0 END) AS telegram_connected,
        SUM(CASE WHEN manual_block = 1 THEN 1 ELSE 0 END) AS manual_blocked
      FROM users
    `).get() as Record<string, number | null>;

    const errors = db.prepare(`
      SELECT COUNT(*) AS count
      FROM events
      WHERE level = 'error' AND datetime(created_at) > datetime('now', '-7 days')
    `).get() as { count?: number } | undefined;

    return {
      mode: 'database',
      database: 'sqlite',
      stats: {
        total_users: Number(stats?.total_users ?? 0),
        telegram_connected: Number(stats?.telegram_connected ?? 0),
        manual_blocked: Number(stats?.manual_blocked ?? 0),
        errors: Number(errors?.count ?? 0),
      },
      chats,
    };
  } catch (error) {
    app.log.warn({ error }, 'Dashboard switched to demo mode');
    return {
      mode: 'demo',
      database: 'sqlite',
      stats: { total_users: 0, telegram_connected: 0, manual_blocked: 0, errors: 0 },
      chats: fallbackChats,
    };
  }
});

app.get('/api/chats', async () => {
  try {
    return db.prepare('SELECT * FROM chats ORDER BY created_at').all();
  } catch {
    return fallbackChats;
  }
});

app.get('/api/users', async () => {
  try {
    return db.prepare(`
      SELECT
        u.id,
        u.getcourse_user_id,
        u.email,
        u.name,
        u.phone,
        u.telegram_user_id,
        u.telegram_username,
        u.telegram_first_name,
        u.manual_block,
        u.manual_block_reason,
        u.last_getcourse_sync_at,
        u.last_telegram_sync_at
      FROM users u
      ORDER BY u.created_at DESC
      LIMIT 500
    `).all();
  } catch {
    return [];
  }
});

app.get('/api/users/:id', async (request, reply) => {
  const params = z.object({ id: z.string().uuid() }).safeParse(request.params);
  if (!params.success) return reply.code(400).send({ error: 'invalid_user_id' });

  const user = db.prepare(`
    SELECT
      id, getcourse_user_id, email, name, phone,
      telegram_user_id, telegram_username, telegram_first_name,
      personal_access_token, manual_block, manual_block_reason,
      last_getcourse_sync_at, last_telegram_sync_at
    FROM users
    WHERE id = ?
  `).get(params.data.id) as Record<string, unknown> | undefined;

  if (!user) return reply.code(404).send({ error: 'user_not_found' });

  const access = db.prepare(`
    SELECT
      c.id AS chat_id,
      c.name AS chat_name,
      c.slug AS chat_slug,
      uca.access_status,
      uca.telegram_status,
      uca.technical_ban_reason,
      uca.last_access_change_at
    FROM chats c
    LEFT JOIN user_chat_access uca
      ON uca.chat_id = c.id AND uca.user_id = ?
    ORDER BY c.created_at
  `).all(params.data.id) as Record<string, unknown>[];

  return {
    ...user,
    chats: access.map((row) => ({
      ...row,
      access_status: row.access_status ?? 'unknown',
      telegram_status: row.telegram_status ?? 'not_connected',
    })),
  };
});

app.post('/api/users/:id/manual-block', async (request, reply) => {
  const params = z.object({ id: z.string().uuid() }).safeParse(request.params);
  const body = z.object({ blocked: z.boolean(), reason: z.string().nullable().optional() }).safeParse(request.body);
  if (!params.success || !body.success) return reply.code(400).send({ error: 'invalid_request' });

  const exists = db.prepare('SELECT id FROM users WHERE id = ?').get(params.data.id);
  if (!exists) return reply.code(404).send({ error: 'user_not_found' });

  const blocked = body.data.blocked ? 1 : 0;
  const reason = body.data.blocked ? (body.data.reason ?? 'Ручная блокировка администратора') : null;
  const timestamp = nowIso();

  const transaction = db.transaction(() => {
    db.prepare(`
      UPDATE users
      SET manual_block = ?, manual_block_reason = ?, updated_at = ?
      WHERE id = ?
    `).run(blocked, reason, timestamp, params.data.id);

    db.prepare(`
      INSERT INTO events (user_id, source, level, event_type, message, payload, created_at)
      VALUES (?, 'admin', 'info', ?, ?, ?, ?)
    `).run(
      params.data.id,
      body.data.blocked ? 'MANUAL_BLOCK_ENABLED' : 'MANUAL_BLOCK_DISABLED',
      body.data.blocked ? 'Пользователь заблокирован вручную' : 'Ручная блокировка снята',
      JSON.stringify(body.data),
      timestamp,
    );
  });
  transaction();

  return db.prepare('SELECT * FROM users WHERE id = ?').get(params.data.id);
});

app.post('/api/users/:id/reset-telegram', async (request, reply) => {
  const params = z.object({ id: z.string().uuid() }).safeParse(request.params);
  if (!params.success) return reply.code(400).send({ error: 'invalid_user_id' });

  const exists = db.prepare('SELECT id FROM users WHERE id = ?').get(params.data.id);
  if (!exists) return reply.code(404).send({ error: 'user_not_found' });

  const timestamp = nowIso();
  const transaction = db.transaction(() => {
    db.prepare(`
      UPDATE users
      SET telegram_user_id = NULL,
          telegram_username = NULL,
          telegram_first_name = NULL,
          telegram_binding_locked = 0,
          last_telegram_sync_at = NULL,
          updated_at = ?
      WHERE id = ?
    `).run(timestamp, params.data.id);

    db.prepare(`
      UPDATE user_chat_access
      SET telegram_status = 'not_connected', updated_at = ?
      WHERE user_id = ?
    `).run(timestamp, params.data.id);

    db.prepare(`
      INSERT INTO events (user_id, source, level, event_type, message, created_at)
      VALUES (?, 'admin', 'warning', 'TELEGRAM_BINDING_RESET', 'Telegram-привязка пользователя сброшена', ?)
    `).run(params.data.id, timestamp);
  });
  transaction();

  return db.prepare('SELECT * FROM users WHERE id = ?').get(params.data.id);
});

app.get('/api/events', async () => {
  try {
    return db.prepare(`
      SELECT
        e.id,
        e.created_at,
        e.source,
        e.level,
        e.event_type,
        e.message,
        u.name AS user_name,
        u.email AS user_email,
        c.name AS chat_name
      FROM events e
      LEFT JOIN users u ON u.id = e.user_id
      LEFT JOIN chats c ON c.id = e.chat_id
      ORDER BY e.created_at DESC
      LIMIT 250
    `).all();
  } catch {
    return [];
  }
});

app.post('/api/sync', async (_request, reply) => {
  try {
    db.prepare(`
      INSERT INTO sync_jobs (job_type, payload, created_at, updated_at)
      VALUES ('FULL_RECONCILIATION', '{}', ?, ?)
    `).run(nowIso(), nowIso());
    return { ok: true, queued: true };
  } catch {
    return reply.code(503).send({ ok: false, error: 'database_unavailable' });
  }
});

app.post('/api/webhooks/getcourse', async (request, reply) => {
  const secret = request.headers['x-access-secret'];
  if (!process.env.GETCOURSE_WEBHOOK_SECRET || secret !== process.env.GETCOURSE_WEBHOOK_SECRET) {
    return reply.code(401).send({ ok: false, error: 'invalid_secret' });
  }

  request.log.info({ body: request.body }, 'GetCourse webhook received');
  return { ok: true, accepted: true };
});

app.post('/api/webhooks/telegram', async (request) => {
  request.log.info({ body: request.body }, 'Telegram webhook received');
  return { ok: true };
});

const port = Number(process.env.PORT ?? 4100);
await app.listen({ port, host: '0.0.0.0' });
