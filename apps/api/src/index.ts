import 'dotenv/config';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import { z } from 'zod';
import { pool } from './db.js';

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
  time: new Date().toISOString(),
}));

app.get('/api/dashboard', async () => {
  try {
    const chats = await pool.query(`
      SELECT
        c.id,
        c.name,
        c.slug,
        c.getcourse_group_id,
        c.telegram_chat_id,
        COUNT(uca.id) FILTER (WHERE uca.access_status = 'active')::int AS active_access,
        COUNT(uca.id) FILTER (WHERE uca.telegram_status = 'member')::int AS telegram_members,
        COUNT(uca.id) FILTER (WHERE uca.access_status = 'active' AND uca.telegram_status IN ('not_connected','unknown'))::int AS not_connected,
        COUNT(uca.id) FILTER (WHERE uca.telegram_status = 'banned')::int AS banned
      FROM chats c
      LEFT JOIN user_chat_access uca ON uca.chat_id = c.id
      GROUP BY c.id
      ORDER BY c.created_at
    `);

    const stats = await pool.query(`
      SELECT
        COUNT(*)::int AS total_users,
        COUNT(*) FILTER (WHERE telegram_user_id IS NOT NULL)::int AS telegram_connected,
        COUNT(*) FILTER (WHERE manual_block = true)::int AS manual_blocked
      FROM users
    `);

    const errors = await pool.query(`
      SELECT COUNT(*)::int AS count
      FROM events
      WHERE level = 'error' AND created_at > now() - interval '7 days'
    `);

    return {
      mode: 'database',
      stats: { ...stats.rows[0], errors: errors.rows[0]?.count ?? 0 },
      chats: chats.rows,
    };
  } catch (error) {
    app.log.warn({ error }, 'Dashboard switched to demo mode');
    return {
      mode: 'demo',
      stats: { total_users: 0, telegram_connected: 0, manual_blocked: 0, errors: 0 },
      chats: fallbackChats,
    };
  }
});

app.get('/api/chats', async () => {
  try {
    const result = await pool.query('SELECT * FROM chats ORDER BY created_at');
    return result.rows;
  } catch {
    return fallbackChats;
  }
});

app.get('/api/users', async () => {
  try {
    const result = await pool.query(`
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
    `);
    return result.rows;
  } catch {
    return [];
  }
});

app.get('/api/users/:id', async (request, reply) => {
  const params = z.object({ id: z.string().uuid() }).safeParse(request.params);
  if (!params.success) return reply.code(400).send({ error: 'invalid_user_id' });

  const userResult = await pool.query(`
    SELECT
      id, getcourse_user_id, email, name, phone,
      telegram_user_id, telegram_username, telegram_first_name,
      personal_access_token, manual_block, manual_block_reason,
      last_getcourse_sync_at, last_telegram_sync_at
    FROM users
    WHERE id = $1
  `, [params.data.id]);

  if (!userResult.rowCount) return reply.code(404).send({ error: 'user_not_found' });

  const accessResult = await pool.query(`
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
      ON uca.chat_id = c.id AND uca.user_id = $1
    ORDER BY c.created_at
  `, [params.data.id]);

  return { ...userResult.rows[0], chats: accessResult.rows.map((row) => ({
    ...row,
    access_status: row.access_status ?? 'unknown',
    telegram_status: row.telegram_status ?? 'not_connected',
  })) };
});

app.post('/api/users/:id/manual-block', async (request, reply) => {
  const params = z.object({ id: z.string().uuid() }).safeParse(request.params);
  const body = z.object({ blocked: z.boolean(), reason: z.string().nullable().optional() }).safeParse(request.body);
  if (!params.success || !body.success) return reply.code(400).send({ error: 'invalid_request' });

  const result = await pool.query(`
    UPDATE users
    SET manual_block = $2,
        manual_block_reason = CASE WHEN $2 THEN COALESCE($3, 'Ручная блокировка администратора') ELSE NULL END,
        updated_at = now()
    WHERE id = $1
    RETURNING *
  `, [params.data.id, body.data.blocked, body.data.reason ?? null]);

  if (!result.rowCount) return reply.code(404).send({ error: 'user_not_found' });

  await pool.query(`
    INSERT INTO events (user_id, source, level, event_type, message, payload)
    VALUES ($1, 'admin', 'info', $2, $3, $4::jsonb)
  `, [params.data.id, body.data.blocked ? 'MANUAL_BLOCK_ENABLED' : 'MANUAL_BLOCK_DISABLED', body.data.blocked ? 'Пользователь заблокирован вручную' : 'Ручная блокировка снята', JSON.stringify(body.data)]);

  return result.rows[0];
});

app.post('/api/users/:id/reset-telegram', async (request, reply) => {
  const params = z.object({ id: z.string().uuid() }).safeParse(request.params);
  if (!params.success) return reply.code(400).send({ error: 'invalid_user_id' });

  const result = await pool.query(`
    UPDATE users
    SET telegram_user_id = NULL,
        telegram_username = NULL,
        telegram_first_name = NULL,
        telegram_binding_locked = false,
        last_telegram_sync_at = NULL,
        updated_at = now()
    WHERE id = $1
    RETURNING *
  `, [params.data.id]);

  if (!result.rowCount) return reply.code(404).send({ error: 'user_not_found' });

  await pool.query(`
    UPDATE user_chat_access
    SET telegram_status = 'not_connected', updated_at = now()
    WHERE user_id = $1
  `, [params.data.id]);

  await pool.query(`
    INSERT INTO events (user_id, source, level, event_type, message)
    VALUES ($1, 'admin', 'warning', 'TELEGRAM_BINDING_RESET', 'Telegram-привязка пользователя сброшена')
  `, [params.data.id]);

  return result.rows[0];
});

app.get('/api/events', async () => {
  try {
    const result = await pool.query(`
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
    `);
    return result.rows;
  } catch {
    return [];
  }
});

app.post('/api/sync', async (_request, reply) => {
  try {
    await pool.query(`
      INSERT INTO sync_jobs (job_type, payload)
      VALUES ('FULL_RECONCILIATION', '{}'::jsonb)
    `);
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
