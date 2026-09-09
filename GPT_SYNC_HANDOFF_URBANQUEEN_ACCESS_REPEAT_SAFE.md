# GPT sync handoff — UrbanQueen Access repeat-safe milestone

## Status

The safe local/backend portion of the milestone is complete on
`feature/repeat-safe-milestone`. Production activation remains intentionally
blocked. A real GetCourse Cycle A/B is waiting for one owner-only configuration
step in the isolated test group.

## Git and source preservation

- previous production-reproducible SHA:
  `cfa32bba970360fb8ade38662115b09490ba90ff`;
- baseline tag: `production-source-baseline-2026-09-09`;
- feature implementation SHA:
  `aed6daa8708006bae23353757c802ef470ba20a9`;
- remote branch: `origin/feature/repeat-safe-milestone`;
- the original eight local commits and both new milestone commits are on GitHub;
- `DESIGN_SYSTEM.md` remains untracked and untouched;
- `GPT_CONTEXT_URBANQUEEN_ACCESS_NEXT_TASK.md` remains untracked and untouched.

## What changed

- Built-in Node test harness using isolated SQLite and fakes for Telegram,
  GetCourse Export API and time.
- Import-safe Fastify application and deterministic one-job worker entry point;
  importing tests does not open a port or start background timers.
- Test-only clock abstraction for invite TTL and retry timing.
- Worker failures now open/deduplicate an incident on the first failed attempt;
  a successful user/chat retry resolves only the matching incident.
- GetCourse audit backoff is an independently tested pure policy.
- Migration runner can be exercised against disposable databases.
- Added idempotent `005_fix_test_access_rule_baseline.sql`; migration 003 was not
  edited.
- Added release, rollback, health/incident monitoring, off-server copy and restore
  drill scripts.
- Added all milestone reports.

No production configuration, service, Nginx, GetCourse process, Telegram chat or
`vedanie-food` file/database was changed.

## Automated evidence

One full suite: 7 passed, 0 failed.

The suite proves:

- webhook auth/validation/unknown group behavior;
- grant/retry/revoke/retry/re-grant idempotency;
- same permanent link across two complete synthetic Telegram cycles;
- fresh 600-second invite per cycle;
- technical unban on renewed access;
- join approve/decline and Telegram update dedupe;
- manual block remains stronger than renewed GetCourse access;
- explicit unblock restores reconcile;
- test-chat allowlist and production/arbitrary mutation rejection;
- incident dedupe/recovery without secret/token leakage;
- test-only known-user audit repair, rate-limit backoff and zero Export API calls
  on permanent-link opening;
- migration clean install, repeat application, SQLite integrity and foreign keys.

Acceptance checks:

- API/Web build passed;
- API `tsc --noEmit` passed;
- fresh compile: 11 files, 0 mismatches with generated API dist;
- `git diff --check` passed;
- operational scripts syntax passed.

## Release artifact

- archive:
  `release-artifacts/urbanqueen-access-aed6daa.tar.gz`;
- SHA256:
  `257129904d8540db5565aeea798725cb86430369af211b4e9d48c3cf39dd43e1`;
- generated from committed source and includes built API/Web dist;
- no environment files or untracked files are included.

The feature archive was not deployed.

## GetCourse finding and remaining live test

Read-only inspection found existing process `2572358` is a periodic User process
with one delayed task and a production VEDANIE-group condition. It is not a
permitted proof for test group `4939538`. GetCourse documents that one process
creates at most one task per user, so a completed linear process cannot be relied
on for leave/re-add.

The proposed test-only solution keeps one task alive in a loop:

`grant callback → wait not in group → revoke callback → wait in group → grant callback → repeat`.

Exact fields, URLs, headers and POST bodies are in
`reports/getcourse-repeat-event-scheme.md`. Owner must create/approve/start that
separate test process. Then perform two real cycles with one test user and confirm
aggregate events/jobs/invite history. Until that happens, live Cycle A/B is
correctly marked pending rather than passed.

## Safety gate

Required state remains:

- `ALLOW_PRODUCTION_TELEGRAM_MUTATIONS=false`;
- `GETCOURSE_AUDIT_SCOPE=test`;
- only the dedicated test Telegram chat in `TELEGRAM_TEST_CHAT_IDS`;
- production Telegram chat IDs unset;
- no production GetCourse group/process changes;
- no production backfill;
- no `vedanie-food` coupling.

## Reports

- `reports/repeat-access-tests.md`
- `reports/getcourse-repeat-event-scheme.md`
- `reports/telegram-reconcile-tests.md`
- `reports/migration-fix.md`
- `reports/release-rollback.md`
- `reports/monitoring-backup-readiness.md`
- `reports/test-results.md`

## Next owner decision

Configure and start the isolated repeat-safe process for group `4939538` using
the exact guide, then tell Codex to continue the live Cycle A/B acceptance. Do not
authorize production chat activation in that same step.
