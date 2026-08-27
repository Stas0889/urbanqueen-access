import 'dotenv/config';
import Fastify, { LogController, type FastifyReply, type FastifyRequest } from 'fastify';
import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import jwt from '@fastify/jwt';
import rateLimit from '@fastify/rate-limit';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { bootstrapAdmin, registerAuthRoutes, requireAdmin, requireAdminMutation } from './auth.js';
import { config } from './config.js';
import { db, nowIso, sqliteInfo } from './db.js';
import { getCourseUserByEmail } from './getcourse-client.js';
import { applyGetCourseAccessUpdate } from './getcourse.js';
import { telegram } from './telegram.js';
import { startWorker } from './worker.js';

const app = Fastify({
  logger: true,
  trustProxy: config.isProduction,
  logController: new LogController({ disableRequestLogging: true }),
});

await app.register(cookie);
await app.register(jwt, { secret: config.jwtSecret });
await app.register(rateLimit, { global: true, max: 240, timeWindow: '1 minute' });
await app.register(helmet, { contentSecurityPolicy: config.isProduction });
await app.register(cors, {
  origin: config.appBaseUrl,
  credentials: true,
  allowedHeaders: ['Content-Type', 'X-CSRF-Token', 'X-Access-Secret', 'X-Telegram-Bot-Api-Secret-Token'],
});

bootstrapAdmin(app);
registerAuthRoutes(app);

const userSelect = `
  SELECT id, getcourse_user_id, email, name,
    telegram_user_id, telegram_username, telegram_first_name,
    personal_access_token, manual_block, manual_block_reason,
    telegram_binding_locked, migration_status,
    last_getcourse_sync_at, last_telegram_sync_at, created_at, updated_at
  FROM users WHERE id = ?
`;

function getUser(id: string) {
  const user = db.prepare(userSelect).get(id) as Record<string, unknown> | undefined;
  if (!user) return null;
  const chats = db.prepare(`
    SELECT c.id AS chat_id, c.name AS chat_name, c.slug AS chat_slug, c.environment,
      COALESCE(uca.access_status, 'unknown') AS access_status,
      COALESCE(uca.telegram_status, 'not_connected') AS telegram_status,
      uca.technical_ban_reason, uca.last_access_change_at, uca.last_telegram_change_at
    FROM chats c
    LEFT JOIN user_chat_access uca ON uca.chat_id = c.id AND uca.user_id = ?
    ORDER BY c.created_at
  `).all(id);
  return { ...user, chats };
}

app.get('/health', async () => ({
  ok: true,
  database: true,
  telegramConfigured: config.telegramConfigured,
  getcourseConfigured: config.getcourseConfigured,
}));

app.get('/api/dashboard', { preHandler: requireAdmin }, async () => {
  const chats = db.prepare(`
    SELECT c.id, c.name, c.slug, c.getcourse_group_id, c.telegram_chat_id,
      c.telegram_chat_title, c.environment, c.last_sync_at,
      COUNT(CASE WHEN uca.access_status = 'active' THEN 1 END) AS active_access,
      COUNT(CASE WHEN uca.telegram_status = 'member' THEN 1 END) AS telegram_members,
      COUNT(CASE WHEN uca.access_status = 'active' AND uca.telegram_status IN ('not_connected','unknown') THEN 1 END) AS not_connected,
      COUNT(CASE WHEN uca.telegram_status = 'banned' THEN 1 END) AS banned
    FROM chats c LEFT JOIN user_chat_access uca ON uca.chat_id = c.id
    GROUP BY c.id ORDER BY c.created_at
  `).all();
  const stats = db.prepare(`
    SELECT COUNT(*) AS total_users,
      COUNT(telegram_user_id) AS telegram_connected,
      COUNT(CASE WHEN manual_block = 1 THEN 1 END) AS manual_blocked,
      COUNT(CASE WHEN migration_status = 'linked' THEN 1 END) AS migration_linked,
      COUNT(CASE WHEN migration_status IN ('unlinked','legacy') THEN 1 END) AS migration_unlinked
    FROM users
  `).get() as Record<string, number>;
  const errors = db.prepare(`SELECT COUNT(*) AS count FROM events WHERE level = 'error' AND resolved_at IS NULL`).get() as { count: number };
  return { mode: 'database', database: 'sqlite', appEnv: config.appEnv, stats: { ...stats, errors: errors.count }, chats };
});

app.get('/api/chats', { preHandler: requireAdmin }, async () => db.prepare(`
  SELECT c.*,
    COUNT(DISTINCT uca.user_id) AS users,
    COUNT(CASE WHEN uca.access_status = 'active' THEN 1 END) AS active,
    COUNT(CASE WHEN uca.telegram_status = 'member' THEN 1 END) AS member,
    COUNT(CASE WHEN uca.telegram_status = 'banned' THEN 1 END) AS banned,
    COUNT(CASE WHEN uca.telegram_status IN ('not_connected','unknown') THEN 1 END) AS not_connected
  FROM chats c LEFT JOIN user_chat_access uca ON uca.chat_id = c.id
  GROUP BY c.id ORDER BY c.created_at
`).all());

app.patch('/api/chats/:id', { preHandler: requireAdminMutation }, async (request, reply) => {
  const params = z.object({ id: z.string().uuid() }).safeParse(request.params);
  const body = z.object({
    telegram_chat_id: z.coerce.number().int().safe().nullable().optional(),
    telegram_chat_title: z.string().trim().max(300).nullable().optional(),
    is_enabled: z.boolean().optional(),
  }).safeParse(request.body);
  if (!params.success || !body.success) return reply.code(400).send({ error: 'invalid_request' });
  const current = db.prepare('SELECT id FROM chats WHERE id = ?').get(params.data.id);
  if (!current) return reply.code(404).send({ error: 'chat_not_found' });
  const timestamp = nowIso();
  db.prepare(`
    UPDATE chats SET
      telegram_chat_id = CASE WHEN ? = 1 THEN ? ELSE telegram_chat_id END,
      telegram_chat_title = CASE WHEN ? = 1 THEN ? ELSE telegram_chat_title END,
      is_enabled = COALESCE(?, is_enabled),
      updated_at = ?
    WHERE id = ?
  `).run(
    Object.hasOwn(body.data, 'telegram_chat_id') ? 1 : 0,
    body.data.telegram_chat_id ?? null,
    Object.hasOwn(body.data, 'telegram_chat_title') ? 1 : 0,
    body.data.telegram_chat_title ?? null,
    body.data.is_enabled === undefined ? null : body.data.is_enabled ? 1 : 0,
    timestamp,
    params.data.id,
  );
  db.prepare(`INSERT INTO events (chat_id, source, level, event_type, message, payload, created_at) VALUES (?, 'admin', 'warning', 'CHAT_CONFIGURATION_UPDATED', 'Настройки Telegram-чата изменены', ?, ?)`)
    .run(params.data.id, JSON.stringify({ ...body.data, telegram_chat_id: body.data.telegram_chat_id ? 'configured' : undefined }), timestamp);
  return db.prepare('SELECT * FROM chats WHERE id = ?').get(params.data.id);
});

app.get('/api/users', { preHandler: requireAdmin }, async (request) => {
  const query = z.object({ q: z.string().trim().max(100).optional(), limit: z.coerce.number().int().min(1).max(500).default(200) }).parse(request.query);
  const pattern = `%${query.q ?? ''}%`;
  return db.prepare(`
    SELECT id, getcourse_user_id, email, name, telegram_user_id, telegram_username,
      manual_block, manual_block_reason, migration_status,
      last_getcourse_sync_at, last_telegram_sync_at
    FROM users
    WHERE ? = '%%' OR name LIKE ? OR email LIKE ? OR CAST(getcourse_user_id AS TEXT) LIKE ?
      OR telegram_username LIKE ? OR CAST(telegram_user_id AS TEXT) LIKE ?
    ORDER BY created_at DESC LIMIT ?
  `).all(pattern, pattern, pattern, pattern, pattern, pattern, query.limit);
});

app.get('/api/users/:id', { preHandler: requireAdmin }, async (request, reply) => {
  const params = z.object({ id: z.string().uuid() }).safeParse(request.params);
  if (!params.success) return reply.code(400).send({ error: 'invalid_user_id' });
  const user = getUser(params.data.id);
  return user ?? reply.code(404).send({ error: 'user_not_found' });
});

app.post('/api/users/:id/manual-block', { preHandler: requireAdminMutation }, async (request, reply) => {
  const params = z.object({ id: z.string().uuid() }).safeParse(request.params);
  const body = z.object({ blocked: z.boolean(), reason: z.string().trim().max(500).nullable().optional() }).safeParse(request.body);
  if (!params.success || !body.success) return reply.code(400).send({ error: 'invalid_request' });
  if (!getUser(params.data.id)) return reply.code(404).send({ error: 'user_not_found' });
  const timestamp = nowIso();
  db.transaction(() => {
    db.prepare('UPDATE users SET manual_block = ?, manual_block_reason = ?, updated_at = ? WHERE id = ?')
      .run(body.data.blocked ? 1 : 0, body.data.blocked ? (body.data.reason || 'Ручная блокировка администратора') : null, timestamp, params.data.id);
    db.prepare(`INSERT INTO events (user_id, source, level, event_type, message, created_at) VALUES (?, 'admin', 'warning', ?, ?, ?)`)
      .run(params.data.id, body.data.blocked ? 'MANUAL_BLOCK_ENABLED' : 'MANUAL_BLOCK_DISABLED', body.data.blocked ? 'Ручная блокировка включена' : 'Ручная блокировка снята', timestamp);
    db.prepare(`INSERT INTO sync_jobs (job_type, payload, run_after, created_at, updated_at) VALUES ('RECONCILE_USER', ?, ?, ?, ?)`)
      .run(JSON.stringify({ user_id: params.data.id }), timestamp, timestamp, timestamp);
  })();
  return getUser(params.data.id);
});

app.post('/api/users/:id/reset-telegram', { preHandler: requireAdminMutation }, async (request, reply) => {
  const params = z.object({ id: z.string().uuid() }).safeParse(request.params);
  if (!params.success) return reply.code(400).send({ error: 'invalid_user_id' });
  if (!getUser(params.data.id)) return reply.code(404).send({ error: 'user_not_found' });
  const timestamp = nowIso();
  db.transaction(() => {
    db.prepare(`UPDATE users SET telegram_user_id = NULL, telegram_username = NULL, telegram_first_name = NULL, telegram_binding_locked = 0, migration_status = 'unlinked', last_telegram_sync_at = NULL, updated_at = ? WHERE id = ?`).run(timestamp, params.data.id);
    db.prepare(`UPDATE user_chat_access SET telegram_status = 'not_connected', last_telegram_change_at = ?, updated_at = ? WHERE user_id = ?`).run(timestamp, timestamp, params.data.id);
    db.prepare(`INSERT INTO events (user_id, source, level, event_type, message, created_at) VALUES (?, 'admin', 'warning', 'TELEGRAM_BINDING_RESET', 'Telegram-привязка пользователя сброшена', ?)`).run(params.data.id, timestamp);
  })();
  return getUser(params.data.id);
});

app.get('/api/events', { preHandler: requireAdmin }, async () => db.prepare(`
  SELECT e.id, e.created_at, e.source, e.level, e.event_type, e.message, e.resolved_at,
    u.name AS user_name, u.email AS user_email, c.name AS chat_name
  FROM events e LEFT JOIN users u ON u.id = e.user_id LEFT JOIN chats c ON c.id = e.chat_id
  ORDER BY e.created_at DESC LIMIT 250
`).all());

app.get('/api/integrations', { preHandler: requireAdmin }, async () => {
  const testRule = db.prepare(`SELECT id, getcourse_group_id, telegram_chat_id, last_sync_at FROM chats WHERE environment = 'test' AND is_enabled = 1 ORDER BY created_at LIMIT 1`)
    .get() as { id: string; getcourse_group_id: number; telegram_chat_id: number | null; last_sync_at: string | null } | undefined;
  const lastWebhook = db.prepare(`SELECT MAX(created_at) AS value FROM events WHERE event_type = 'TELEGRAM_WEBHOOK_RECEIVED'`).get() as { value: string | null };
  let bot: Record<string, unknown> = { connected: false, status: 'not_configured' };
  if (config.telegramBotToken && testRule?.telegram_chat_id) {
    try {
      const identity = await telegram.getMe();
      const membership = await telegram.getChatMember(testRule.telegram_chat_id, identity.id);
      bot = {
        connected: true,
        status: membership.status,
        username: identity.username ?? null,
        canInviteUsers: membership.can_invite_users === true,
        canRestrictMembers: membership.can_restrict_members === true,
      };
    } catch {
      bot = { connected: false, status: 'check_failed' };
    }
  }
  return {
    appEnv: config.appEnv,
    sqlite: { connected: true, wal: sqliteInfo.journalMode.toLowerCase() === 'wal', foreignKeys: sqliteInfo.foreignKeys },
    getcourse: {
      configured: config.getcourseApiConfigured,
      webhookConfigured: Boolean(config.getcourseWebhookSecret),
      account: config.getcourseAccount,
      groups: testRule ? [testRule.getcourse_group_id] : [],
      lastSync: testRule?.last_sync_at ?? null,
    },
    telegram: {
      configured: config.telegramConfigured,
      productionMutationsAllowed: config.allowProductionTelegramMutations,
      testChatIds: config.telegramTestChatIds,
      testMutationsAllowed: Boolean(testRule?.telegram_chat_id && config.isAllowedTelegramMutation(testRule.telegram_chat_id)),
      lastWebhook: lastWebhook.value,
      testChatId: testRule?.telegram_chat_id ?? null,
      bot,
    },
  };
});

app.post('/api/sync', { preHandler: requireAdminMutation }, async () => {
  const timestamp = nowIso();
  db.prepare(`INSERT INTO sync_jobs (job_type, payload, run_after, created_at, updated_at) VALUES ('FULL_RECONCILIATION', '{}', ?, ?, ?)`).run(timestamp, timestamp, timestamp);
  return { ok: true, queued: true };
});

app.post('/api/test-sync/getcourse-user', { preHandler: requireAdminMutation }, async (request, reply) => {
  const input = z.object({
    email: z.string().email().optional(),
    getcourse_user_id: z.coerce.number().int().positive().optional(),
  }).refine((value) => value.email || value.getcourse_user_id, 'email_or_id_required').safeParse(request.body);
  if (!input.success) return reply.code(400).send({ error: 'invalid_request' });
  if (!config.getcourseApiKey) return reply.code(409).send({ error: 'getcourse_api_key_missing' });
  const testRule = db.prepare(`SELECT id, getcourse_group_id FROM chats WHERE environment = 'test' AND is_enabled = 1 ORDER BY created_at LIMIT 1`)
    .get() as { id: string; getcourse_group_id: number } | undefined;
  if (!testRule) return reply.code(409).send({ error: 'test_access_rule_missing' });
  let email = input.data.email?.trim().toLowerCase();
  if (!email && input.data.getcourse_user_id) {
    email = (db.prepare('SELECT email FROM users WHERE getcourse_user_id = ?').get(input.data.getcourse_user_id) as { email: string | null } | undefined)?.email ?? undefined;
  }
  if (!email) return reply.code(400).send({ error: 'email_required_for_getcourse_export' });

  try {
    const snapshot = await getCourseUserByEmail(email);
    const existing = db.prepare('SELECT getcourse_user_id, name FROM users WHERE email = ? COLLATE NOCASE').get(email) as { getcourse_user_id: number; name: string | null } | undefined;
    if (!snapshot && !existing) return reply.code(404).send({ error: 'getcourse_user_not_found' });
    const active = snapshot?.groupIds.includes(testRule.getcourse_group_id) ?? false;
    const result = applyGetCourseAccessUpdate({
      user_id: snapshot?.userId ?? existing!.getcourse_user_id,
      email: snapshot?.email ?? email,
      name: snapshot?.name ?? existing!.name,
      group_id: testRule.getcourse_group_id,
      access_status: active ? 'active' : 'inactive',
      event: 'manual_test_sync',
    });
    const timestamp = nowIso();
    db.prepare('UPDATE chats SET last_sync_at = ?, updated_at = ? WHERE id = ?').run(timestamp, timestamp, testRule.id);
    return { ok: true, active, groupId: testRule.getcourse_group_id, ...result };
  } catch (error) {
    request.log.error({ error: error instanceof Error ? error.message : 'unknown' }, 'GetCourse test user sync failed');
    return reply.code(502).send({ error: error instanceof Error ? error.message : 'getcourse_sync_failed' });
  }
});

const accessStatus = z.preprocess((value) => String(value).toLowerCase(), z.enum(['active', 'inactive']));
const getCourseWebhook = z.object({
  user_id: z.coerce.number().int().positive(),
  email: z.string().email().nullable().optional(),
  name: z.string().max(300).nullable().optional(),
  group_id: z.coerce.number().int().positive(),
  access_status: accessStatus,
  event: z.string().min(1).max(100),
});

app.post('/api/webhooks/getcourse', {
  config: { rateLimit: { max: 120, timeWindow: '1 minute' } },
}, async (request, reply) => {
  if (!config.getcourseWebhookSecret || request.headers['x-access-secret'] !== config.getcourseWebhookSecret) {
    return reply.code(401).send({ ok: false, error: 'invalid_secret' });
  }
  const input = getCourseWebhook.safeParse(request.body);
  if (!input.success) return reply.code(400).send({ ok: false, error: 'invalid_payload' });
  const result = applyGetCourseAccessUpdate(input.data);
  return reply.code(202).send({ ok: true, ...result });
});

app.post('/api/webhooks/telegram', {
  config: { rateLimit: { max: 180, timeWindow: '1 minute' } },
}, async (request, reply) => {
  if (!config.telegramWebhookSecret || request.headers['x-telegram-bot-api-secret-token'] !== config.telegramWebhookSecret) {
    return reply.code(401).send({ ok: false, error: 'invalid_secret' });
  }
  const update = z.object({ update_id: z.number().int() }).passthrough().safeParse(request.body);
  if (!update.success) return reply.code(400).send({ ok: false, error: 'invalid_payload' });
  const timestamp = nowIso();
  const accepted = db.prepare('INSERT OR IGNORE INTO telegram_updates (update_id, received_at) VALUES (?, ?)')
    .run(update.data.update_id, timestamp);
  if (accepted.changes === 0) return reply.code(200).send({ ok: true, duplicate: true });
  db.prepare(`INSERT INTO events (source, level, event_type, message, created_at) VALUES ('telegram', 'info', 'TELEGRAM_WEBHOOK_RECEIVED', 'Получено обновление Telegram webhook', ?)`)
    .run(timestamp);
  db.prepare(`INSERT INTO sync_jobs (job_type, payload, run_after, created_at, updated_at) VALUES ('TELEGRAM_UPDATE', ?, ?, ?, ?)`)
    .run(JSON.stringify(update.data), timestamp, timestamp, timestamp);
  return reply.code(202).send({ ok: true, queued: true });
});

async function joinHandler(request: FastifyRequest, reply: FastifyReply) {
  const params = z.object({
    token: z.string().min(32).max(128),
    chatSlug: z.string().min(1).max(100).optional(),
  }).safeParse(request.params);
  if (!params.success) return reply.code(404).type('text/plain').send('Ссылка недействительна.');
  const user = db.prepare(`SELECT id, manual_block, telegram_user_id FROM users WHERE personal_access_token = ?`)
    .get(params.data.token) as { id: string; manual_block: number; telegram_user_id: number | null } | undefined;
  if (!user) return reply.code(404).type('text/plain').send('Ссылка недействительна.');
  if (user.manual_block) return reply.code(403).type('text/plain').send('Доступ временно ограничен администратором.');

  const chats = (db.prepare(`
    SELECT c.id, c.name, c.slug, c.telegram_chat_id
    FROM user_chat_access uca JOIN chats c ON c.id = uca.chat_id
    WHERE uca.user_id = ? AND uca.access_status = 'active' AND c.is_enabled = 1
      AND c.telegram_chat_id IS NOT NULL AND (? IS NULL OR c.slug = ?)
    ORDER BY c.created_at
  `).all(user.id, params.data.chatSlug ?? null, params.data.chatSlug ?? null) as Array<{ id: string; name: string; slug: string; telegram_chat_id: number }>)
    .filter((chat) => config.isAllowedTelegramMutation(chat.telegram_chat_id));
  if (!chats.length) return reply.code(403).type('text/plain').send('Активный доступ к Telegram-чату не найден.');
  if (chats.length > 1 && !params.data.chatSlug) {
    const links = chats.map((chat) => `<li><a href="/join/${encodeURIComponent(params.data.token)}/${encodeURIComponent(chat.slug)}">${escapeHtml(chat.name)}</a></li>`).join('');
    return reply.type('text/html; charset=utf-8').send(`<!doctype html><html lang="ru"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Выберите чат</title><style>body{font-family:Montserrat,Arial,sans-serif;max-width:640px;margin:12vh auto;padding:24px;color:#11140B}a{display:block;padding:16px;border:1px solid #dfe8e5;border-radius:10px;color:#047865;text-decoration:none;margin:10px 0}ul{list-style:none;padding:0}</style><h1>Выберите Telegram-чат</h1><ul>${links}</ul></html>`);
  }

  const chat = chats[0];
  try {
    if (user.telegram_user_id) {
      const member = await telegram.getChatMember(chat.telegram_chat_id, user.telegram_user_id);
      if (member.status === 'kicked') {
        await telegram.unban(chat.telegram_chat_id, user.telegram_user_id);
        db.prepare(`UPDATE user_chat_access SET telegram_status = 'left', technical_ban_reason = NULL, last_telegram_change_at = ?, updated_at = ? WHERE user_id = ? AND chat_id = ?`)
          .run(nowIso(), nowIso(), user.id, chat.id);
        db.prepare(`INSERT INTO events (user_id, chat_id, source, level, event_type, message, created_at) VALUES (?, ?, 'telegram', 'info', 'TELEGRAM_UNBAN_SUCCESS', 'Ban снят перед созданием новой ссылки', ?)`)
          .run(user.id, chat.id, nowIso());
      }
    }
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
    const invite = await telegram.createJoinRequestInvite(chat.telegram_chat_id, `uq-${user.id.slice(0, 8)}`, expiresAt);
    db.prepare(`INSERT INTO invite_links (id, user_id, chat_id, telegram_invite_link, telegram_invite_name, expires_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`)
      .run(randomUUID(), user.id, chat.id, invite.invite_link, `uq-${user.id.slice(0, 8)}`, expiresAt.toISOString(), nowIso());
    db.prepare(`INSERT INTO events (user_id, chat_id, source, level, event_type, message, created_at) VALUES (?, ?, 'telegram', 'info', 'INVITE_CREATED', 'Создана временная Telegram-ссылка', ?)`)
      .run(user.id, chat.id, nowIso());
    return reply.redirect(invite.invite_link);
  } catch (error) {
    request.log.error({ error, userId: user.id, chatId: chat.id }, 'Join link creation failed');
    db.prepare(`INSERT INTO events (user_id, chat_id, source, level, event_type, message, created_at) VALUES (?, ?, 'telegram', 'error', 'TELEGRAM_SYNC_ERROR', 'Не удалось создать временную Telegram-ссылку', ?)`)
      .run(user.id, chat.id, nowIso());
    return reply.code(503).type('text/plain').send('Telegram временно недоступен. Попробуйте ещё раз через несколько минут.');
  }
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[character]!));
}

app.get('/join/:token', { config: { rateLimit: { max: 20, timeWindow: '1 minute' } } }, joinHandler);
app.get('/join/:token/:chatSlug', { config: { rateLimit: { max: 20, timeWindow: '1 minute' } } }, joinHandler);

if (!config.isProduction) {
  app.post('/api/test/access', { preHandler: requireAdminMutation }, async (request, reply) => {
    const input = getCourseWebhook.safeParse(request.body);
    if (!input.success) return reply.code(400).send({ error: 'invalid_payload', details: input.error.flatten() });
    return applyGetCourseAccessUpdate(input.data);
  });
}

if (config.telegramConfigured) startWorker(app.log);

await app.listen({ port: config.port, host: config.host });
