import type { FastifyBaseLogger } from 'fastify';
import { db, nowIso } from './db.js';
import { telegram, type TelegramMemberStatus } from './telegram.js';

const retrySeconds = [30, 120, 600, 3600];
let timer: NodeJS.Timeout | undefined;
let running = false;

type Job = { id: number; job_type: string; payload: string | null; attempts: number; max_attempts: number };
type ReconcileRow = {
  user_id: string; chat_id: string; telegram_user_id: number; telegram_chat_id: number;
  access_status: 'active' | 'inactive' | 'unknown'; telegram_status: string;
  manual_block: number;
};

function event(input: { userId?: string; chatId?: string; level?: 'info'|'warning'|'error'; type: string; message: string; payload?: unknown }) {
  db.prepare(`INSERT INTO events (user_id, chat_id, source, level, event_type, message, payload, created_at)
    VALUES (?, ?, 'telegram', ?, ?, ?, ?, ?)`).run(
    input.userId ?? null, input.chatId ?? null, input.level ?? 'info', input.type,
    input.message, input.payload ? JSON.stringify(input.payload) : null, nowIso(),
  );
}

function normalizedStatus(status: TelegramMemberStatus) {
  return status === 'kicked' ? 'banned' : status === 'restricted' ? 'member' : status;
}

async function reconcileRow(row: ReconcileRow) {
  const current = await telegram.getChatMember(row.telegram_chat_id, row.telegram_user_id);
  const status = normalizedStatus(current.status);
  const timestamp = nowIso();
  db.prepare(`UPDATE user_chat_access SET telegram_status = ?, last_telegram_change_at = ?, updated_at = ? WHERE user_id = ? AND chat_id = ?`)
    .run(status, timestamp, timestamp, row.user_id, row.chat_id);

  if ((status === 'administrator' || status === 'creator') && (row.access_status === 'inactive' || row.manual_block)) {
    event({ userId: row.user_id, chatId: row.chat_id, level: 'warning', type: 'TELEGRAM_ADMIN_NOT_BANNED', message: 'Автоматическое удаление администратора Telegram пропущено' });
    return;
  }
  if (row.manual_block && status === 'member') {
    await telegram.ban(row.telegram_chat_id, row.telegram_user_id);
    db.prepare(`UPDATE user_chat_access SET telegram_status = 'banned', technical_ban_reason = 'manual_block', last_telegram_change_at = ?, updated_at = ? WHERE user_id = ? AND chat_id = ?`)
      .run(timestamp, timestamp, row.user_id, row.chat_id);
    event({ userId: row.user_id, chatId: row.chat_id, type: 'TELEGRAM_BAN_SUCCESS', message: 'Пользователь удалён из Telegram из-за ручной блокировки' });
  } else if (row.access_status === 'inactive' && status === 'member') {
    await telegram.ban(row.telegram_chat_id, row.telegram_user_id);
    db.prepare(`UPDATE user_chat_access SET telegram_status = 'banned', technical_ban_reason = 'payment_expired', last_telegram_change_at = ?, updated_at = ? WHERE user_id = ? AND chat_id = ?`)
      .run(timestamp, timestamp, row.user_id, row.chat_id);
    event({ userId: row.user_id, chatId: row.chat_id, type: 'TELEGRAM_BAN_SUCCESS', message: 'Доступ закончился: пользователь удалён из Telegram' });
  } else if (!row.manual_block && row.access_status === 'active' && status === 'banned') {
    await telegram.unban(row.telegram_chat_id, row.telegram_user_id);
    db.prepare(`UPDATE user_chat_access SET telegram_status = 'left', technical_ban_reason = NULL, last_telegram_change_at = ?, updated_at = ? WHERE user_id = ? AND chat_id = ?`)
      .run(timestamp, timestamp, row.user_id, row.chat_id);
    event({ userId: row.user_id, chatId: row.chat_id, type: 'TELEGRAM_UNBAN_SUCCESS', message: 'Активный доступ восстановлен: Telegram ban снят' });
  }
}

function reconcileRows(userId?: string, chatId?: string) {
  return db.prepare(`
    SELECT u.id AS user_id, c.id AS chat_id, u.telegram_user_id, c.telegram_chat_id,
      u.manual_block, uca.access_status, uca.telegram_status
    FROM user_chat_access uca
    JOIN users u ON u.id = uca.user_id
    JOIN chats c ON c.id = uca.chat_id
    WHERE u.telegram_user_id IS NOT NULL AND c.telegram_chat_id IS NOT NULL AND c.is_enabled = 1
      AND (? IS NULL OR u.id = ?) AND (? IS NULL OR c.id = ?)
  `).all(userId ?? null, userId ?? null, chatId ?? null, chatId ?? null) as ReconcileRow[];
}

async function handleJoinRequest(update: Record<string, unknown>) {
  const join = update.chat_join_request as {
    chat?: { id?: number }; from?: { id?: number; username?: string; first_name?: string };
    invite_link?: { invite_link?: string };
  } | undefined;
  if (!join?.chat?.id || !join.from?.id || !join.invite_link?.invite_link) return;
  const invite = db.prepare(`
    SELECT i.id, i.user_id, i.chat_id, i.expires_at, i.revoked_at,
      u.telegram_user_id, u.manual_block, uca.access_status
    FROM invite_links i JOIN users u ON u.id = i.user_id
    JOIN user_chat_access uca ON uca.user_id = i.user_id AND uca.chat_id = i.chat_id
    JOIN chats c ON c.id = i.chat_id
    WHERE i.telegram_invite_link = ? AND c.telegram_chat_id = ?
  `).get(join.invite_link.invite_link, join.chat.id) as {
    id: string; user_id: string; chat_id: string; expires_at: string; revoked_at: string | null;
    telegram_user_id: number | null; manual_block: number; access_status: string;
  } | undefined;

  if (!invite || invite.revoked_at || new Date(invite.expires_at).getTime() < Date.now()) {
    await telegram.declineJoin(join.chat.id, join.from.id);
    event({ level: 'warning', type: 'UNKNOWN_INVITE', message: 'Заявка по неизвестной или истёкшей ссылке отклонена' });
    return;
  }
  event({ userId: invite.user_id, chatId: invite.chat_id, type: 'JOIN_REQUEST_RECEIVED', message: 'Получена заявка на вступление' });
  const differentAccount = invite.telegram_user_id !== null && invite.telegram_user_id !== join.from.id;
  const duplicate = db.prepare('SELECT id FROM users WHERE telegram_user_id = ? AND id <> ?').get(join.from.id, invite.user_id);
  if (differentAccount || duplicate) {
    await telegram.declineJoin(join.chat.id, join.from.id);
    event({ userId: invite.user_id, chatId: invite.chat_id, level: 'error', type: 'SECURITY_DIFFERENT_TELEGRAM_ACCOUNT', message: 'Попытка привязать другой Telegram-аккаунт отклонена' });
    return;
  }
  if (invite.manual_block || invite.access_status !== 'active') {
    await telegram.declineJoin(join.chat.id, join.from.id);
    event({ userId: invite.user_id, chatId: invite.chat_id, level: 'warning', type: 'JOIN_DECLINED', message: 'Заявка отклонена: доступ не активен или включена ручная блокировка' });
    return;
  }

  await telegram.approveJoin(join.chat.id, join.from.id);
  const timestamp = nowIso();
  db.transaction(() => {
    db.prepare(`UPDATE users SET telegram_user_id = ?, telegram_username = ?, telegram_first_name = ?, telegram_binding_locked = 1, migration_status = 'linked', last_telegram_sync_at = ?, updated_at = ? WHERE id = ?`)
      .run(join.from!.id, join.from!.username ?? null, join.from!.first_name ?? null, timestamp, timestamp, invite.user_id);
    db.prepare(`UPDATE user_chat_access SET telegram_status = 'member', technical_ban_reason = NULL, last_telegram_change_at = ?, updated_at = ? WHERE user_id = ? AND chat_id = ?`)
      .run(timestamp, timestamp, invite.user_id, invite.chat_id);
    db.prepare('UPDATE invite_links SET used_at = ?, revoked_at = ? WHERE id = ?').run(timestamp, timestamp, invite.id);
  })();
  await telegram.revokeInvite(join.chat.id, join.invite_link.invite_link).catch(() => undefined);
  event({ userId: invite.user_id, chatId: invite.chat_id, type: 'JOIN_APPROVED', message: 'Заявка автоматически одобрена, Telegram ID сохранён' });
}

async function execute(job: Job) {
  const payload = job.payload ? JSON.parse(job.payload) as Record<string, unknown> : {};
  if (job.job_type === 'TELEGRAM_UPDATE') return handleJoinRequest(payload);
  if (job.job_type === 'FULL_RECONCILIATION') {
    for (const row of reconcileRows()) await reconcileRow(row);
    return;
  }
  if (job.job_type === 'RECONCILE_USER') {
    for (const row of reconcileRows(String(payload.user_id))) await reconcileRow(row);
    return;
  }
  if (job.job_type === 'RECONCILE_USER_CHAT') {
    for (const row of reconcileRows(String(payload.user_id), String(payload.chat_id))) await reconcileRow(row);
  }
}

async function tick(log: FastifyBaseLogger) {
  if (running) return;
  running = true;
  let job: Job | undefined;
  try {
    job = db.transaction(() => {
      const candidate = db.prepare(`SELECT id, job_type, payload, attempts, max_attempts FROM sync_jobs WHERE status = 'pending' AND datetime(run_after) <= datetime('now') ORDER BY id LIMIT 1`).get() as Job | undefined;
      if (candidate) db.prepare(`UPDATE sync_jobs SET status = 'processing', updated_at = ? WHERE id = ?`).run(nowIso(), candidate.id);
      return candidate;
    })();
    if (!job) return;
    await execute(job);
    db.prepare(`UPDATE sync_jobs SET status = 'completed', updated_at = ? WHERE id = ?`).run(nowIso(), job.id);
  } catch (error) {
    log.error({ error, jobId: job?.id }, 'Telegram worker job failed');
    if (job) {
      const attempts = job.attempts + 1;
      const attention = attempts >= job.max_attempts || attempts > retrySeconds.length;
      const runAfter = new Date(Date.now() + retrySeconds[Math.min(attempts - 1, retrySeconds.length - 1)] * 1000).toISOString();
      db.prepare(`UPDATE sync_jobs SET status = ?, attempts = ?, last_error = ?, run_after = ?, requires_admin_attention = ?, updated_at = ? WHERE id = ?`)
        .run(attention ? 'failed' : 'pending', attempts, error instanceof Error ? error.message : String(error), runAfter, attention ? 1 : 0, nowIso(), job.id);
      if (attention) event({ level: 'error', type: 'TELEGRAM_SYNC_ERROR', message: 'Telegram-операция требует внимания администратора', payload: { job_id: job.id } });
    }
  } finally {
    running = false;
  }
}

export function startWorker(log: FastifyBaseLogger) {
  if (timer) return;
  timer = setInterval(() => void tick(log), 2_000);
  timer.unref();
  void tick(log);
}
