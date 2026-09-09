import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import Database from 'better-sqlite3';

const tempDirectory = mkdtempSync(join(tmpdir(), 'uq-access-test-'));
const databasePath = join(tempDirectory, 'access.db');
const testChatId = -1003872347411;
const testGroupId = 4939538;
const webhookSecret = 'repeat-safe-webhook-secret';
const telegramSecret = 'repeat-safe-telegram-secret';
const adminPassword = 'repeat-safe-admin-password';

Object.assign(process.env, {
  NODE_ENV: 'test',
  APP_ENV: 'production',
  HOST: '127.0.0.1',
  PORT: '4199',
  APP_BASE_URL: 'https://access.test',
  SQLITE_PATH: databasePath,
  ADMIN_EMAIL: 'admin@test.local',
  ADMIN_PASSWORD: adminPassword,
  JWT_SECRET: 'repeat-safe-test-jwt-secret-at-least-32-characters',
  GETCOURSE_ACCOUNT: 'urban-queen',
  GETCOURSE_API_KEY: 'fake-export-key',
  GETCOURSE_WEBHOOK_SECRET: webhookSecret,
  GETCOURSE_AUDIT_SCOPE: 'test',
  GETCOURSE_AUDIT_INTERVAL_MINUTES: '30',
  TELEGRAM_BOT_TOKEN: 'fake-bot-token',
  TELEGRAM_WEBHOOK_SECRET: telegramSecret,
  TELEGRAM_API_BASE_URL: 'https://telegram.test',
  TELEGRAM_UPDATE_MODE: 'webhook',
  TELEGRAM_TEST_CHAT_IDS: String(testChatId),
  ALLOW_PRODUCTION_TELEGRAM_MUTATIONS: 'false',
});

const [{ app }, { db, applyMigrations }, { telegram }, worker, audit, { config }] = await Promise.all([
  import('../apps/api/src/index.js'),
  import('../apps/api/src/db.js'),
  import('../apps/api/src/telegram.js'),
  import('../apps/api/src/worker.js'),
  import('../apps/api/src/getcourse-audit.js'),
  import('../apps/api/src/config.js'),
]);

type MemberStatus = 'member' | 'left' | 'kicked';
const telegramState = new Map<number, MemberStatus>();
const telegramCalls: Array<{ method: string; chatId: number; userId?: number; invite?: string; expiresAt?: Date }> = [];
const guardedTelegramBan = telegram.ban;
let inviteCounter = 0;
let failBan = false;

function installTelegramFake() {
  (telegram as any).getChatMember = async (chatId: number, userId: number) => ({
    status: telegramState.get(userId) ?? 'left',
  });
  (telegram as any).createJoinRequestInvite = async (chatId: number, _name: string, expiresAt: Date) => {
    const invite = `https://t.me/+test-${++inviteCounter}`;
    telegramCalls.push({ method: 'createInvite', chatId, invite, expiresAt });
    return { invite_link: invite };
  };
  (telegram as any).approveJoin = async (chatId: number, userId: number) => {
    telegramCalls.push({ method: 'approve', chatId, userId });
    telegramState.set(userId, 'member');
    return true;
  };
  (telegram as any).declineJoin = async (chatId: number, userId: number) => {
    telegramCalls.push({ method: 'decline', chatId, userId });
    return true;
  };
  (telegram as any).ban = async (chatId: number, userId: number) => {
    telegramCalls.push({ method: 'ban', chatId, userId });
    if (failBan) throw new Error('simulated_telegram_ban_failure');
    telegramState.set(userId, 'kicked');
    return true;
  };
  (telegram as any).unban = async (chatId: number, userId: number) => {
    telegramCalls.push({ method: 'unban', chatId, userId });
    telegramState.set(userId, 'left');
    return true;
  };
  (telegram as any).revokeInvite = async (chatId: number, invite: string) => {
    telegramCalls.push({ method: 'revokeInvite', chatId, invite });
    return true;
  };
}

const log = {
  info() {},
  error() {},
  warn() {},
  debug() {},
  fatal() {},
  trace() {},
  child() { return this; },
} as any;

function clearRuntimeData() {
  db.exec(`
    DELETE FROM telegram_updates;
    DELETE FROM sync_jobs;
    DELETE FROM invite_links;
    DELETE FROM events;
    DELETE FROM user_chat_access;
    DELETE FROM users;
  `);
  db.prepare(`
    UPDATE chats
    SET telegram_chat_id = CASE WHEN getcourse_group_id = ? THEN ? ELSE NULL END,
        is_enabled = 1,
        environment = CASE WHEN getcourse_group_id = ? THEN 'test' ELSE 'production' END
  `).run(testGroupId, testChatId, testGroupId);
  telegramState.clear();
  telegramCalls.length = 0;
  inviteCounter = 0;
  failBan = false;
  installTelegramFake();
}

async function drainJobs(max = 50) {
  for (let count = 0; count < max; count += 1) {
    const pending = db.prepare("SELECT id FROM sync_jobs WHERE status = 'pending'").get();
    if (!pending) return;
    db.prepare("UPDATE sync_jobs SET run_after = CURRENT_TIMESTAMP WHERE status = 'pending'").run();
    await worker.processNextJobOnce(log);
  }
  throw new Error('job_queue_did_not_drain');
}

async function getAdminSession() {
  const response = await app.inject({
    method: 'POST',
    url: '/api/auth/login',
    payload: { email: 'admin@test.local', password: adminPassword },
  });
  assert.equal(response.statusCode, 200);
  const cookie = response.headers['set-cookie'];
  assert.ok(cookie);
  return {
    cookie: (Array.isArray(cookie) ? cookie[0] : cookie).split(';')[0],
    csrf: response.json().csrf as string,
  };
}

async function callback(status: 'active' | 'inactive', event: string) {
  return app.inject({
    method: status === 'active' ? 'POST' : 'POST',
    url: status === 'active' ? '/api/callbacks/getcourse/access-link' : '/api/webhooks/getcourse',
    headers: { 'x-access-secret': webhookSecret },
    payload: {
      user_id: 900001,
      email: 'repeat.user@example.test',
      name: 'Repeat User',
      group_id: testGroupId,
      access_status: status,
      event,
    },
  });
}

async function sendJoin(updateId: number, invite: string, telegramUserId = 700001) {
  return app.inject({
    method: 'POST',
    url: '/api/webhooks/telegram',
    headers: { 'x-telegram-bot-api-secret-token': telegramSecret },
    payload: {
      update_id: updateId,
      chat_join_request: {
        chat: { id: testChatId },
        from: { id: telegramUserId, username: 'repeat_test', first_name: 'Repeat' },
        invite_link: { invite_link: invite },
      },
    },
  });
}

test('005 migration is idempotent on a clean install and corrects the obsolete test group', () => {
  const path = join(tempDirectory, 'migration.db');
  const database = new Database(path);
  database.pragma('foreign_keys = ON');
  applyMigrations(database, resolve('db/migrations'));
  applyMigrations(database, resolve('db/migrations'));
  const current = database.prepare('SELECT COUNT(*) AS count FROM chats WHERE getcourse_group_id = ? AND is_enabled = 1').get(testGroupId) as { count: number };
  const obsolete = database.prepare('SELECT COUNT(*) AS count FROM chats WHERE getcourse_group_id = 4938193 AND is_enabled = 1').get() as { count: number };
  assert.equal(current.count, 1);
  assert.equal(obsolete.count, 0);
  assert.equal(database.pragma('integrity_check', { simple: true }), 'ok');
  assert.deepEqual(database.pragma('foreign_key_check'), []);
  database.close();
});

test('GetCourse webhook validates input, scope and idempotent state transitions', async () => {
  clearRuntimeData();
  const invalidSecret = await app.inject({
    method: 'POST', url: '/api/webhooks/getcourse', headers: { 'x-access-secret': 'wrong' }, payload: {},
  });
  assert.equal(invalidSecret.statusCode, 401);
  const malformed = await app.inject({
    method: 'POST', url: '/api/webhooks/getcourse', headers: { 'x-access-secret': webhookSecret }, payload: { user_id: 'bad' },
  });
  assert.equal(malformed.statusCode, 400);
  const unknown = await app.inject({
    method: 'POST',
    url: '/api/webhooks/getcourse',
    headers: { 'x-access-secret': webhookSecret },
    payload: { user_id: 1, group_id: 9999999, access_status: 'active', event: 'unknown' },
  });
  assert.equal(unknown.statusCode, 202);
  assert.equal(unknown.json().accepted, false);

  const grant = await callback('active', 'grant-a');
  assert.equal(grant.statusCode, 200);
  const permanentLink = grant.body;
  const duplicate = await callback('active', 'retry-same-state');
  assert.equal(duplicate.statusCode, 200);
  assert.equal(duplicate.body, permanentLink);
  assert.equal((db.prepare("SELECT COUNT(*) AS count FROM events WHERE event_type = 'ACCESS_GRANTED'").get() as any).count, 1);
  assert.equal((db.prepare("SELECT COUNT(*) AS count FROM sync_jobs").get() as any).count, 1);
  assert.equal((db.prepare("SELECT COUNT(*) AS count FROM user_chat_access").get() as any).count, 1);

  assert.equal((await callback('inactive', 'revoke-a')).statusCode, 202);
  assert.equal((await callback('inactive', 'retry-revoke')).json().changed, false);
  assert.equal((await callback('active', 'grant-b')).body, permanentLink);
  assert.equal((db.prepare("SELECT COUNT(*) AS count FROM events WHERE event_type = 'ACCESS_GRANTED'").get() as any).count, 2);
  assert.equal((db.prepare("SELECT COUNT(*) AS count FROM events WHERE event_type = 'ACCESS_REVOKED'").get() as any).count, 1);
});

test('same permanent link completes two grant/join/revoke cycles safely', async () => {
  clearRuntimeData();
  const grantA = await callback('active', 'cycle-a-grant');
  assert.equal(grantA.statusCode, 200);
  const permanentUrl = new URL(grantA.body);
  const token = permanentUrl.pathname.split('/')[2];
  await drainJobs();

  const inviteAResponse = await app.inject({ method: 'GET', url: permanentUrl.pathname });
  assert.equal(inviteAResponse.statusCode, 302);
  const inviteA = inviteAResponse.headers.location!;
  assert.ok(inviteA);
  assert.equal((await sendJoin(1001, inviteA)).statusCode, 202);
  assert.equal((await sendJoin(1001, inviteA)).json().duplicate, true);
  await drainJobs();
  assert.equal(telegramState.get(700001), 'member');

  assert.equal((await callback('inactive', 'cycle-a-revoke')).statusCode, 202);
  await drainJobs();
  assert.equal(telegramState.get(700001), 'kicked');
  assert.equal((await app.inject({ method: 'GET', url: permanentUrl.pathname })).statusCode, 403);

  const grantB = await callback('active', 'cycle-b-grant');
  assert.equal(grantB.body, permanentUrl.toString());
  await drainJobs();
  assert.equal(telegramState.get(700001), 'left');
  const inviteBResponse = await app.inject({ method: 'GET', url: permanentUrl.pathname });
  assert.equal(inviteBResponse.statusCode, 302);
  const inviteB = inviteBResponse.headers.location!;
  assert.notEqual(inviteB, inviteA);
  assert.equal((await sendJoin(1002, inviteB)).statusCode, 202);
  await drainJobs();
  assert.equal(telegramState.get(700001), 'member');

  assert.equal((await callback('inactive', 'cycle-b-revoke')).statusCode, 202);
  await drainJobs();
  assert.equal(telegramState.get(700001), 'kicked');
  assert.equal((db.prepare('SELECT COUNT(*) AS count FROM invite_links').get() as any).count, 2);
  const ttlRows = db.prepare("SELECT CAST(strftime('%s', expires_at) AS INTEGER) - CAST(strftime('%s', created_at) AS INTEGER) AS ttl FROM invite_links").all() as Array<{ ttl: number }>;
  assert.ok(ttlRows.every((row) => row.ttl >= 599 && row.ttl <= 601));
  assert.equal((db.prepare("SELECT COUNT(*) AS count FROM events WHERE event_type = 'ACCESS_GRANTED'").get() as any).count, 2);
  assert.equal((db.prepare("SELECT COUNT(*) AS count FROM events WHERE event_type = 'ACCESS_REVOKED'").get() as any).count, 2);
  const serializedEvents = JSON.stringify(db.prepare('SELECT message, payload FROM events').all());
  assert.equal(serializedEvents.includes(token), false);
  assert.equal(serializedEvents.includes(webhookSecret), false);

  assert.equal((await sendJoin(1003, 'https://t.me/+unknown')).statusCode, 202);
  await drainJobs();
  assert.ok(telegramCalls.some((call) => call.method === 'decline'));
});

test('manual block overrides renewed access until explicit admin unblock', async () => {
  clearRuntimeData();
  await callback('active', 'manual-grant');
  await drainJobs();
  const user = db.prepare('SELECT id FROM users WHERE getcourse_user_id = 900001').get() as { id: string };
  db.prepare("UPDATE users SET telegram_user_id = 700001, migration_status = 'linked' WHERE id = ?").run(user.id);
  db.prepare("UPDATE user_chat_access SET telegram_status = 'member' WHERE user_id = ?").run(user.id);
  telegramState.set(700001, 'member');
  const session = await getAdminSession();

  const blocked = await app.inject({
    method: 'POST',
    url: `/api/users/${user.id}/manual-block`,
    headers: { cookie: session.cookie, 'x-csrf-token': session.csrf },
    payload: { blocked: true, reason: 'repeat-safe test' },
  });
  assert.equal(blocked.statusCode, 200);
  assert.equal((await callback('active', 'renewal-while-blocked')).statusCode, 200);
  await drainJobs();
  assert.equal(telegramState.get(700001), 'kicked');
  assert.equal((db.prepare('SELECT manual_block FROM users WHERE id = ?').get(user.id) as any).manual_block, 1);
  const permanent = db.prepare('SELECT personal_access_token FROM users WHERE id = ?').get(user.id) as { personal_access_token: string };
  assert.equal((await app.inject({ method: 'GET', url: `/join/${permanent.personal_access_token}/test-urbanqueen-access` })).statusCode, 403);

  const unblocked = await app.inject({
    method: 'POST',
    url: `/api/users/${user.id}/manual-block`,
    headers: { cookie: session.cookie, 'x-csrf-token': session.csrf },
    payload: { blocked: false },
  });
  assert.equal(unblocked.statusCode, 200);
  await drainJobs();
  assert.equal(telegramState.get(700001), 'left');
});

test('production and arbitrary Telegram chats are rejected by the safety allowlist', async () => {
  clearRuntimeData();
  assert.equal(config.allowProductionTelegramMutations, false);
  assert.equal(config.getcourseAuditScope, 'test');
  assert.equal(config.isAllowedTelegramMutation(testChatId), true);
  assert.equal(config.isAllowedTelegramMutation(-1001111111111), false);
  const before = telegramCalls.length;
  await assert.rejects(() => guardedTelegramBan(-1001111111111, 700001), /telegram_mutation_not_allowed/);
  assert.equal(telegramCalls.length, before);
  const productionChats = db.prepare("SELECT telegram_chat_id FROM chats WHERE environment = 'production'").all() as Array<{ telegram_chat_id: number | null }>;
  assert.ok(productionChats.every((chat) => chat.telegram_chat_id === null));
});

test('worker failures deduplicate an incident and successful retry resolves it', async () => {
  clearRuntimeData();
  await callback('active', 'incident-grant');
  await drainJobs();
  const user = db.prepare('SELECT id FROM users WHERE getcourse_user_id = 900001').get() as { id: string };
  db.prepare("UPDATE users SET telegram_user_id = 700001 WHERE id = ?").run(user.id);
  db.prepare("UPDATE user_chat_access SET access_status = 'inactive', telegram_status = 'member' WHERE user_id = ?").run(user.id);
  telegramState.set(700001, 'member');
  db.prepare("INSERT INTO sync_jobs (job_type, payload, run_after, created_at, updated_at) VALUES ('RECONCILE_USER_CHAT', ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)")
    .run(JSON.stringify({ user_id: user.id, chat_id: '00000000-0000-4000-8000-000000000003' }));

  failBan = true;
  await worker.processNextJobOnce(log);
  db.prepare("UPDATE sync_jobs SET run_after = CURRENT_TIMESTAMP WHERE status = 'pending'").run();
  await worker.processNextJobOnce(log);
  const incidents = db.prepare("SELECT occurrence_count, resolved_at, payload FROM events WHERE level = 'error' AND event_type = 'TELEGRAM_SYNC_ERROR'").all() as Array<{ occurrence_count: number; resolved_at: string | null; payload: string }>;
  assert.equal(incidents.length, 1);
  assert.equal(incidents[0].occurrence_count, 2);
  assert.equal(incidents[0].resolved_at, null);
  assert.equal(incidents[0].payload.includes('fake-bot-token'), false);

  failBan = false;
  db.prepare("UPDATE sync_jobs SET run_after = CURRENT_TIMESTAMP WHERE status = 'pending'").run();
  await worker.processNextJobOnce(log);
  assert.ok((db.prepare("SELECT resolved_at FROM events WHERE level = 'error' AND event_type = 'TELEGRAM_SYNC_ERROR'").get() as any).resolved_at);
});

test('GetCourse audit stays test-scoped, repairs a missed state and exposes safe backoff', async () => {
  clearRuntimeData();
  await callback('inactive', 'audit-baseline');
  await drainJobs();
  let getCourseCalls = 0;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input: string | URL | Request) => {
    getCourseCalls += 1;
    const url = String(input);
    if (url.includes('/account/users')) {
      return new Response(JSON.stringify({ success: true, info: { export_id: 'audit-1' } }), { status: 200 });
    }
    return new Response(JSON.stringify({
      success: true,
      items: [{ id: 900001, email: 'repeat.user@example.test', name: 'Repeat', last_name: 'User', idgrouplist: String(testGroupId) }],
    }), { status: 200 });
  };
  try {
    const result = await audit.runGetCourseAudit(log);
    assert.equal(result.changed, 1);
    assert.equal((db.prepare('SELECT access_status FROM user_chat_access').get() as any).access_status, 'active');
    assert.equal((db.prepare("SELECT COUNT(*) AS count FROM user_chat_access u JOIN chats c ON c.id = u.chat_id WHERE c.environment = 'production'").get() as any).count, 0);
    const token = (db.prepare('SELECT personal_access_token FROM users').get() as any).personal_access_token;
    const callsBeforeJoin = getCourseCalls;
    await app.inject({ method: 'GET', url: `/join/${token}/test-urbanqueen-access` });
    assert.equal(getCourseCalls, callsBeforeJoin);
    assert.equal(audit.getAuditRetryDelay('Too many requests', 30 * 60_000), 2 * 60 * 60_000);
    assert.equal(audit.getAuditRetryDelay('export already running', 30 * 60_000), 60 * 60_000);
    assert.equal(audit.getAuditRetryDelay('generic', 5 * 60_000), 15 * 60_000);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

after(async () => {
  await app.close();
  db.close();
  rmSync(tempDirectory, { recursive: true, force: true });
});
