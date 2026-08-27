import { config } from './config.js';

type JsonRecord = Record<string, unknown>;

function record(value: unknown): JsonRecord | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : null;
}

function nested(payload: JsonRecord, key: string) {
  return record(payload[key]);
}

function exportId(payload: JsonRecord) {
  const candidates = [
    payload.export_id,
    nested(payload, 'info')?.export_id,
    nested(payload, 'result')?.export_id,
    nested(payload, 'info')?.id,
    nested(payload, 'result')?.id,
  ];
  const value = candidates.find((item) => typeof item === 'string' || typeof item === 'number');
  return value === undefined ? null : String(value);
}

function normalizeKey(value: string) {
  return value.trim().toLowerCase().replaceAll('ё', 'е');
}

function objectRows(container: JsonRecord): JsonRecord[] | null {
  const items = container.items;
  if (!Array.isArray(items)) return null;
  if (!items.length) return [];
  if (items.every((item) => record(item))) return items as JsonRecord[];

  const rawFields = container.fields;
  if (!Array.isArray(rawFields)) return null;
  const fields = rawFields.map((field) => {
    if (typeof field === 'string') return field;
    const value = record(field);
    return String(value?.name ?? value?.title ?? value?.label ?? '');
  });
  return items.filter(Array.isArray).map((item) => Object.fromEntries(fields.map((field, index) => [field, item[index]])));
}

function rows(payload: JsonRecord): JsonRecord[] | null {
  return objectRows(payload)
    ?? (nested(payload, 'info') ? objectRows(nested(payload, 'info')!) : null)
    ?? (nested(payload, 'result') ? objectRows(nested(payload, 'result')!) : null);
}

function field(item: JsonRecord, aliases: string[]) {
  const normalized = new Map(Object.entries(item).map(([key, value]) => [normalizeKey(key), value]));
  for (const alias of aliases) {
    const value = normalized.get(normalizeKey(alias));
    if (value !== undefined && value !== null && String(value).trim()) return String(value).trim();
  }
  return null;
}

async function request(url: URL, options: { allowExportPending?: boolean } = {}) {
  const response = await fetch(url, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(15_000),
  });
  const text = await response.text();
  let payload: unknown;
  try { payload = JSON.parse(text); }
  catch { throw new Error(`getcourse_invalid_json:${response.status}`); }
  if (!response.ok) throw new Error(`getcourse_http_error:${response.status}`);
  const value = record(payload);
  if (!value) throw new Error('getcourse_invalid_response');
  if (value.success === false || value.success === 'false') {
    const message = field(value, ['error_message', 'error', 'message']) ?? 'request_failed';
    const normalizedMessage = normalizeKey(message);
    if (options.allowExportPending && (
      normalizedMessage.includes('файл еще не создан')
      || normalizedMessage.includes('file is not ready')
    )) return value;
    throw new Error(`getcourse_error:${message}`);
  }
  return value;
}

export type GetCourseUserSnapshot = {
  userId: number;
  email: string;
  name: string | null;
  groupIds: number[];
};

export async function getCourseUserByEmail(email: string): Promise<GetCourseUserSnapshot | null> {
  if (!config.getcourseApiKey) throw new Error('getcourse_api_key_missing');
  const base = `https://${config.getcourseAccount}.getcourse.ru/pl/api/account`;
  const startUrl = new URL(`${base}/users`);
  startUrl.searchParams.set('key', config.getcourseApiKey);
  startUrl.searchParams.set('email', email);
  startUrl.searchParams.set('idgrouplist', 'id');
  const started = await request(startUrl);
  const id = exportId(started);
  if (!id) throw new Error('getcourse_export_id_missing');

  const resultUrl = new URL(`${base}/exports/${encodeURIComponent(id)}`);
  resultUrl.searchParams.set('key', config.getcourseApiKey);
  for (let attempt = 0; attempt < 10; attempt += 1) {
    if (attempt) await new Promise((resolve) => setTimeout(resolve, 2_000));
    const result = await request(resultUrl, { allowExportPending: true });
    const exported = rows(result);
    if (exported === null) continue;
    const item = exported[0];
    if (!item) return null;
    const rawId = field(item, ['id', 'user_id', 'ID пользователя']);
    const exportedEmail = field(item, ['email', 'e-mail', 'эл. почта', 'электронная почта']);
    if (!rawId || !exportedEmail || !Number.isSafeInteger(Number(rawId))) throw new Error('getcourse_user_fields_missing');
    const groups = field(item, ['idgrouplist', 'group_ids', 'id групп пользователя', 'ID групп пользователя']) ?? '';
    const firstName = field(item, ['name', 'first_name', 'имя']);
    const lastName = field(item, ['last_name', 'фамилия']);
    return {
      userId: Number(rawId),
      email: exportedEmail.toLowerCase(),
      name: [firstName, lastName].filter(Boolean).join(' ') || null,
      groupIds: groups.split(',').map((value) => Number(value.trim().split(':')[0])).filter(Number.isSafeInteger),
    };
  }
  throw new Error('getcourse_export_timeout');
}
