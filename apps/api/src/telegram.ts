import { config } from './config.js';

type TelegramResponse<T> = { ok: true; result: T } | { ok: false; description?: string; error_code?: number };
export type TelegramMemberStatus = 'creator' | 'administrator' | 'member' | 'restricted' | 'left' | 'kicked';
export type TelegramBotIdentity = { id: number; username?: string; first_name: string };
export type TelegramChatMember = {
  status: TelegramMemberStatus;
  can_invite_users?: boolean;
  can_restrict_members?: boolean;
};

async function callTelegram<T>(method: string, body: Record<string, unknown>, mutationChatId?: number): Promise<T> {
  if (mutationChatId !== undefined && !config.isAllowedTelegramMutation(mutationChatId)) {
    throw new Error(`telegram_mutation_not_allowed_for_chat:${mutationChatId}`);
  }
  if (!config.telegramBotToken) throw new Error('telegram_not_configured');
  const response = await fetch(`${config.telegramApiBaseUrl}/bot${config.telegramBotToken}/${method}`, {
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
  getMe() {
    return callTelegram<TelegramBotIdentity>('getMe', {});
  },
  getChatMember(chatId: number, userId: number) {
    return callTelegram<TelegramChatMember>('getChatMember', { chat_id: chatId, user_id: userId });
  },
  createJoinRequestInvite(chatId: number, name: string, expiresAt: Date) {
    return callTelegram<{ invite_link: string }>('createChatInviteLink', {
      chat_id: chatId,
      name: name.slice(0, 32),
      expire_date: Math.floor(expiresAt.getTime() / 1000),
      creates_join_request: true,
    }, chatId);
  },
  revokeInvite(chatId: number, inviteLink: string) {
    return callTelegram('revokeChatInviteLink', { chat_id: chatId, invite_link: inviteLink }, chatId);
  },
  approveJoin(chatId: number, userId: number) {
    return callTelegram('approveChatJoinRequest', { chat_id: chatId, user_id: userId }, chatId);
  },
  declineJoin(chatId: number, userId: number) {
    return callTelegram('declineChatJoinRequest', { chat_id: chatId, user_id: userId }, chatId);
  },
  ban(chatId: number, userId: number) {
    return callTelegram('banChatMember', { chat_id: chatId, user_id: userId, revoke_messages: false }, chatId);
  },
  unban(chatId: number, userId: number) {
    return callTelegram('unbanChatMember', { chat_id: chatId, user_id: userId, only_if_banned: true }, chatId);
  },
};
