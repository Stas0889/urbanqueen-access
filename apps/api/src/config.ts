import { z } from 'zod';

const booleanValue = z.preprocess(
  (value) => value === true || value === 'true' || value === '1',
  z.boolean(),
);

function telegramChatIds(value: unknown) {
  if (typeof value !== 'string' || !value.trim()) return [];
  return value.split(',').map((item) => Number(item.trim())).filter(Number.isSafeInteger);
}

const envSchema = z.object({
  APP_ENV: z.enum(['test', 'production']).default('test'),
  HOST: z.string().min(1).default('127.0.0.1'),
  PORT: z.coerce.number().int().min(1).max(65535).default(4100),
  APP_BASE_URL: z.string().url().default('http://localhost:5173'),
  SQLITE_PATH: z.string().min(1).default('./data/access.db'),
  ADMIN_EMAIL: z.string().email().default('admin@local.test'),
  ADMIN_PASSWORD: z.string().min(8).default('local-development-only'),
  JWT_SECRET: z.string().min(32).default('local-development-jwt-secret-change-me'),
  GETCOURSE_ACCOUNT: z.string().default('urban-queen'),
  GETCOURSE_API_KEY: z.string().default(''),
  GETCOURSE_WEBHOOK_SECRET: z.string().default(''),
  TELEGRAM_BOT_TOKEN: z.string().default(''),
  TELEGRAM_WEBHOOK_SECRET: z.string().default(''),
  TELEGRAM_API_BASE_URL: z.string().url().default('https://api.telegram.org'),
  TELEGRAM_TEST_CHAT_IDS: z.preprocess(telegramChatIds, z.array(z.number().int().safe())).default([]),
  ALLOW_PRODUCTION_TELEGRAM_MUTATIONS: booleanValue.default(false),
});

const parsed = envSchema.parse(process.env);

if (parsed.APP_ENV === 'production') {
  const unsafe = [
    parsed.ADMIN_PASSWORD === 'local-development-only' && 'ADMIN_PASSWORD',
    parsed.JWT_SECRET === 'local-development-jwt-secret-change-me' && 'JWT_SECRET',
  ].filter(Boolean);
  if (unsafe.length) throw new Error(`Production secrets are not configured: ${unsafe.join(', ')}`);
}

export const config = {
  appEnv: parsed.APP_ENV,
  host: parsed.HOST,
  port: parsed.PORT,
  appBaseUrl: parsed.APP_BASE_URL,
  sqlitePath: parsed.SQLITE_PATH,
  adminEmail: parsed.ADMIN_EMAIL.toLowerCase(),
  adminPassword: parsed.ADMIN_PASSWORD,
  jwtSecret: parsed.JWT_SECRET,
  getcourseAccount: parsed.GETCOURSE_ACCOUNT,
  getcourseApiKey: parsed.GETCOURSE_API_KEY,
  getcourseWebhookSecret: parsed.GETCOURSE_WEBHOOK_SECRET,
  telegramBotToken: parsed.TELEGRAM_BOT_TOKEN,
  telegramWebhookSecret: parsed.TELEGRAM_WEBHOOK_SECRET,
  telegramApiBaseUrl: parsed.TELEGRAM_API_BASE_URL.replace(/\/$/, ''),
  telegramTestChatIds: parsed.TELEGRAM_TEST_CHAT_IDS,
  allowProductionTelegramMutations: parsed.ALLOW_PRODUCTION_TELEGRAM_MUTATIONS,
  get isProduction() { return this.appEnv === 'production'; },
  get telegramConfigured() { return Boolean(this.telegramBotToken && this.telegramWebhookSecret); },
  get getcourseApiConfigured() { return Boolean(this.getcourseApiKey); },
  get getcourseConfigured() { return Boolean(this.getcourseApiKey && this.getcourseWebhookSecret); },
  isAllowedTelegramMutation(chatId: number) {
    return this.appEnv === 'test'
      || this.allowProductionTelegramMutations
      || this.telegramTestChatIds.includes(chatId);
  },
};
