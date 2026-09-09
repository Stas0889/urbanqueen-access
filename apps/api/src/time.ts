let nowProvider = () => new Date();

export function nowDate() {
  return nowProvider();
}

export function nowMs() {
  return nowDate().getTime();
}

export function nowIso() {
  return nowDate().toISOString();
}

export function setNowProviderForTests(provider: () => Date) {
  if (process.env.NODE_ENV !== 'test') throw new Error('test_clock_is_test_only');
  nowProvider = provider;
}

export function resetNowProviderForTests() {
  if (process.env.NODE_ENV !== 'test') throw new Error('test_clock_is_test_only');
  nowProvider = () => new Date();
}
