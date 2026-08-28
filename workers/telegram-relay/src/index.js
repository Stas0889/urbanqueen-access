const TELEGRAM_METHODS = new Set([
  'getMe',
  'getChatMember',
  'createChatInviteLink',
  'revokeChatInviteLink',
  'approveChatJoinRequest',
  'declineChatJoinRequest',
  'banChatMember',
  'unbanChatMember',
  'setWebhook',
  'getWebhookInfo',
]);

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
}

async function secretsEqual(left, right) {
  if (!left || !right) return false;
  const encoder = new TextEncoder();
  const a = encoder.encode(left);
  const b = encoder.encode(right);
  return a.length === b.length && crypto.subtle.timingSafeEqual(a, b);
}

function allowedChatIds(value) {
  return new Set(String(value || '').split(',').map((item) => Number(item.trim())).filter(Number.isSafeInteger));
}

async function telegramApi(request, env, method) {
  const authorization = request.headers.get('Authorization') || '';
  if (!await secretsEqual(authorization, `Bearer ${env.RELAY_SHARED_SECRET}`)) {
    return json({ ok: false, error: 'unauthorized' }, 401);
  }
  if (!TELEGRAM_METHODS.has(method)) return json({ ok: false, error: 'method_not_allowed' }, 404);
  if (request.method !== 'POST') return json({ ok: false, error: 'method_not_allowed' }, 405);

  const body = await request.text();
  const response = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
  });
  return new Response(response.body, {
    status: response.status,
    headers: {
      'Content-Type': response.headers.get('Content-Type') || 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
}

async function telegramWebhook(request, env) {
  if (request.method !== 'POST') return json({ ok: false, error: 'method_not_allowed' }, 405);
  const telegramSecret = request.headers.get('X-Telegram-Bot-Api-Secret-Token') || '';
  if (!await secretsEqual(telegramSecret, env.TELEGRAM_WEBHOOK_SECRET)) {
    return json({ ok: false, error: 'invalid_telegram_secret' }, 401);
  }

  const body = await request.text();
  let update;
  try {
    update = JSON.parse(body);
  } catch {
    return json({ ok: false, error: 'invalid_json' }, 400);
  }
  const chatId = update?.chat_join_request?.chat?.id;
  if (!Number.isSafeInteger(chatId) || !allowedChatIds(env.ALLOWED_CHAT_IDS).has(chatId)) {
    return json({ ok: true, ignored: true });
  }

  const response = await fetch(env.ORIGIN_WEBHOOK_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Telegram-Bot-Api-Secret-Token': env.ORIGIN_WEBHOOK_SECRET,
    },
    body,
  });
  return new Response(response.body, {
    status: response.status,
    headers: {
      'Content-Type': response.headers.get('Content-Type') || 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/health' && request.method === 'GET') return json({ ok: true });
    if (url.pathname === '/webhook') return telegramWebhook(request, env);
    const apiMatch = url.pathname.match(/^\/api\/([A-Za-z][A-Za-z0-9]+)$/);
    if (apiMatch) return telegramApi(request, env, apiMatch[1]);
    return json({ ok: false, error: 'not_found' }, 404);
  },
};
