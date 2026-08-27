#!/usr/bin/env node
import { readFileSync } from 'node:fs';

const envPath = process.env.URBANQUEEN_ENV_FILE || '/etc/urbanqueen/access.env';
const env = Object.fromEntries(
  readFileSync(envPath, 'utf8').split(/\r?\n/).filter((line) => line && !line.startsWith('#')).map((line) => {
    const separator = line.indexOf('=');
    return [line.slice(0, separator), line.slice(separator + 1)];
  }),
);

const token = env.TELEGRAM_BOT_TOKEN;
const secret = env.TELEGRAM_WEBHOOK_SECRET;
const testChatIds = (env.TELEGRAM_TEST_CHAT_IDS || '').split(',').map((value) => Number(value.trim())).filter(Number.isSafeInteger);
const webhookUrl = `${env.APP_BASE_URL || 'https://access.urban-queen.com'}/api/webhooks/telegram`;

if (!token || !secret || !testChatIds.length) {
  console.error('Telegram token, webhook secret, or test chat allowlist is missing.');
  process.exit(1);
}

async function telegram(method, body = {}) {
  const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15_000),
  });
  const payload = await response.json();
  if (!response.ok || !payload.ok) throw new Error(`Telegram ${method} failed: ${payload.description || response.status}`);
  return payload.result;
}

try {
  const bot = await telegram('getMe');
  const chatId = testChatIds[0];
  const membership = await telegram('getChatMember', { chat_id: chatId, user_id: bot.id });
  const permissions = {
    chatId,
    botUsername: bot.username || null,
    status: membership.status,
    canInviteUsers: membership.can_invite_users === true,
    canRestrictMembers: membership.can_restrict_members === true,
  };
  console.log(JSON.stringify({ permissions }));
  if (membership.status !== 'administrator' || !permissions.canInviteUsers || !permissions.canRestrictMembers) {
    console.error('Bot must be an administrator with invite and restrict permissions. Webhook was not changed.');
    process.exit(2);
  }

  await telegram('setWebhook', {
    url: webhookUrl,
    secret_token: secret,
    allowed_updates: ['chat_join_request'],
    drop_pending_updates: false,
  });
  const info = await telegram('getWebhookInfo');
  console.log(JSON.stringify({
    webhook: {
      url: info.url,
      pendingUpdateCount: info.pending_update_count,
      lastErrorDate: info.last_error_date || null,
      lastErrorMessage: info.last_error_message || null,
      allowedUpdates: info.allowed_updates || [],
    },
  }));
} catch (error) {
  console.error(error instanceof Error ? error.message.replace(token, '[redacted]') : 'Telegram configuration failed.');
  process.exit(1);
}
