import { config } from './config.js';

type TelegramResponse<T> = { ok: true; result: T } | { ok: false; description?: string; error_code?: number };
export type TelegramMemberStatus = 'creator' | 'administrator' | 'member' | 'restricted' | 'left' | 'kicked';

async function callTelegram<T>(method: string, body: Record<string, unknown>, mutation = false): Promise<T> {
  if (!config.telegramBotToken) throw new Error('telegram_not_configured');
  if (mutation && !config.telegramMutationsAllowed) throw new Error('production_telegram_mutations_disabled');
  const response = await fetch(`https://api.telegram.org/bot${config.telegramBotToken}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(12_000),
  });
  const payload = await response.json() as TelegramResponse<T>;
  if (!response.ok || !payload.ok) {
    const description = 'description' in payload ? payload.description : undefined;
    throw new Error(`telegram_${method}_failed:${description ?? response.status}`);
  }
  return payload.result;
}

export const telegram = {
  getChatMember(chatId: number, userId: number) {
    return callTelegram<{ status: TelegramMemberStatus }>('getChatMember', { chat_id: chatId, user_id: userId });
  },
  createJoinRequestInvite(chatId: number, name: string, expiresAt: Date) {
    return callTelegram<{ invite_link: string }>('createChatInviteLink', {
      chat_id: chatId,
      name: name.slice(0, 32),
      expire_date: Math.floor(expiresAt.getTime() / 1000),
      creates_join_request: true,
    }, true);
  },
  revokeInvite(chatId: number, inviteLink: string) {
    return callTelegram('revokeChatInviteLink', { chat_id: chatId, invite_link: inviteLink }, true);
  },
  approveJoin(chatId: number, userId: number) {
    return callTelegram('approveChatJoinRequest', { chat_id: chatId, user_id: userId }, true);
  },
  declineJoin(chatId: number, userId: number) {
    return callTelegram('declineChatJoinRequest', { chat_id: chatId, user_id: userId }, true);
  },
  ban(chatId: number, userId: number) {
    return callTelegram('banChatMember', { chat_id: chatId, user_id: userId, revoke_messages: false }, true);
  },
  unban(chatId: number, userId: number) {
    return callTelegram('unbanChatMember', { chat_id: chatId, user_id: userId, only_if_banned: true }, true);
  },
};
