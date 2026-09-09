# GPT sync handoff — UrbanQueen Access / Telegram

## Назначение документа

Это актуальный read-only снимок первого приложения `urbanqueen-access` на 2026-09-09. Его нужно использовать как source of truth при подготовке следующего задания для Codex. В рамках аудита production-код, база, GetCourse, Telegram, systemd и Nginx не изменялись и не перезапускались.

## Что это за приложение

`urbanqueen-access` — отдельный сервис управления доступом из GetCourse в Telegram-чаты UrbanQueen. Это не LMS и не авторизация Food-приложения.

Основной поток:

```text
GetCourse group event/audit
→ локальный users + user_chat_access в SQLite
→ reconcile job
→ Telegram join request / approve / decline / ban / unban
→ журнал events и incidents
```

Постоянный `personal_access_token` пользователя используется только в URL `/join/...`. По нему сервис проверяет текущий активный доступ, при необходимости снимает технический Telegram-ban, создаёт временную join-request ссылку на 10 минут и перенаправляет пользователя в Telegram. Это не login token для других приложений.

## Production runtime

- URL: `https://access.urban-queen.com`.
- Frontend: React 19 + TypeScript + Vite.
- API: Node.js 22.23.2 + Fastify.
- API bind: `127.0.0.1:4100`, наружу только через отдельный Nginx vhost.
- Runtime: `/opt/urbanqueen-access/apps/api/dist/index.js`.
- SQLite: `/var/lib/urbanqueen/access.db`, WAL, foreign keys и busy timeout.
- systemd: `urbanqueen-access.service`.
- Service status: active/running, PID `39185`, `NRestarts=0`, работает с 2026-09-04 10:20:41 MSK.
- Unit enabled on boot; `Restart=on-failure`, delay 5 seconds.
- Public `/health`: HTTP 200; local health confirms database, Telegram and GetCourse configuration.
- Nginx and TLS are working.
- Daily local SQLite backup timer enabled. Latest verified backup: `/var/backups/urbanqueen/access-20260908T211236Z.db`.
- Database `PRAGMA integrity_check`: `ok`; foreign-key orphans: 0.

Production is not a Git checkout: `/opt/urbanqueen-access` has no `.git`. Current deployment is a copied/built tree, so Git SHA cannot be read from the server itself.

## Current repository state

Local repository: `D:\CODEX\projects\urbanqueen-access`.

- Current local branch: `main`.
- Local HEAD: `cfa32bb` — `Fix error incident tracking`.
- GitHub `origin/main`: `119fcb9` — `Support isolated Telegram API relay`.
- Local `main` is **ahead of GitHub by 8 commits**.
- `DESIGN_SYSTEM.md` is an untracked file and must not be deleted or silently included without deciding its ownership.
- No release tags exist.

The 8 unpublished commits add:

1. GetCourse callback returning a permanent personal access link;
2. correct UTF-8 error responses;
3. Telegram polling fallback;
4. Cloudflare Telegram relay package;
5. relay deployment validation;
6. disabled public Worker preview URLs;
7. automatic GetCourse membership audit;
8. deduplicated/resolvable error incident tracking.

The previous critical `src`/`dist` drift has now been repaired locally. Both API and Web TypeScript pass `tsc --noEmit`. A fresh API compilation produced 10 JavaScript files with **0 mismatches** against local `dist`; all 10 local `dist` files have exactly the same SHA256 as production server `dist`. Therefore current local source is reproducible for the running API. However, this source is not safely backed up in GitHub until the 8 commits are pushed.

Aggregate deployed assets/runtime hash from the current audit: `77b422697d3a4e22f509685ea6cd55ff8cdb0b4cca5d8cfd03c0c629d30c3666`.

Unchanged production configuration hashes:

- systemd unit: `557667c9adf93751a3eb624b41acb909443bee0d9aecb636a3b3baea0c446172`;
- Nginx vhost: `3900d3d8b52c6145ba4c67718206d9496c2135dfe59d2e0f6015d28653731df0`;
- environment file: `051ba5f8dcda42319a9cc33b9b09de7842b4205ceef1bb71a1959efd7030f000`.

Secrets were not read into this document.

## Safety configuration currently active

```text
APP_ENV=production
HOST=127.0.0.1
PORT=4100
GETCOURSE_AUDIT_SCOPE=test
GETCOURSE_AUDIT_INTERVAL_MINUTES=30
TELEGRAM_UPDATE_MODE=webhook
ALLOW_PRODUCTION_TELEGRAM_MUTATIONS=false
```

Only the dedicated test Telegram chat is allow-listed. Even though the service runs with `APP_ENV=production`, Telegram mutations for the two production chats are blocked. GetCourse audit also runs only for the test group.

Do not enable `ALLOW_PRODUCTION_TELEGRAM_MUTATIONS`, switch audit scope to `all`, write production Telegram chat IDs or change production GetCourse processes without a separate explicit owner approval and a completed repeat-access test.

## Current data and configured groups

Schema migrations applied:

- `001_init.sql`;
- `002_production_foundation.sql`;
- `003_test_access_rule.sql`;
- `004_error_incidents.sql`.

Current aggregate data, without personal information:

- users: 3;
- Telegram-linked users: 2;
- manual blocks: 0;
- access rows: 3, all active in the test group;
- Telegram state: 2 members, 1 not connected;
- events: 131;
- sync jobs: 22, all completed, none requiring admin attention;
- open error incidents: 0;
- invite-link history: 18, currently active links: 0.

Groups/chats:

| Environment | GetCourse group | Telegram chat | Current use |
|---|---:|---|---|
| production | `4825549` | not set | Defined but not activated |
| production | `4900239` | not set | Defined but not activated |
| test | `4939538` | test chat set | Active isolated testing |

Only test group `4939538` currently has access history in this database:

- `ACCESS_GRANTED`: 9;
- `ACCESS_REVOKED`: 7.

There are no access rows/events for production groups `4825549` and `4900239` in `urbanqueen-access`.

Important: later webhook tests for these two production group IDs were performed against the separate `vedanie-food` member-foundation callback. They must not be treated as evidence that `urbanqueen-access` production Telegram automation is configured.

## Existing admin UI

The protected admin application already contains:

- dashboard statistics;
- users/search/detail drawer;
- current GetCourse and Telegram state per user/chat;
- permanent personal-link copy action;
- manual block/unblock;
- Telegram binding reset;
- chats overview;
- event log;
- unresolved error/incidents screen;
- integrations diagnostics;
- manual test-user reconciliation by email or GetCourse ID.

Admin auth is password → JWT cookie `uq_session`, TTL 8 hours, HttpOnly, Secure in production, SameSite Strict. Mutating admin requests require CSRF. Login has rate limiting. Member accounts/auth are not part of this application.

## Existing integration endpoints

- `POST /api/webhooks/getcourse` — protected by `X-Access-Secret`, validates payload, idempotently updates access and returns 202.
- `POST /api/callbacks/getcourse/access-link` — protected by the same integration secret, accepts an active group event and returns the permanent `/join/{token}/{chat}` URL as plain text. The group must have a configured/allowed Telegram chat.
- `POST /api/webhooks/telegram` — protected by Telegram secret-token header, deduplicates `update_id` and queues processing.
- `GET /join/{token}` and `/join/{token}/{chatSlug}` — validate current access/manual block and create a short-lived Telegram join-request link.

The Telegram worker supports join requests and reconciliation. Rules already implemented:

- `ACTIVE + BANNED` → technical unban, then new invite;
- `INACTIVE + MEMBER` → remove/ban from chat;
- manual administrator block has higher priority and is not removed by renewed payment;
- duplicate Telegram updates are ignored;
- failed operations open/deduplicate incidents; successful recovery resolves them.

A Cloudflare Worker relay exists only for Telegram transport and webhook delivery. It does not proxy the site/admin. Worker preview URLs are disabled. Current mode remains webhook; polling code exists as fallback but is not active.

## GetCourse audit and its limitation

Every 30 minutes the test-scope audit checks already known users against the actual GetCourse group through Export API. It can repair a webhook/process event missed during remove/re-add. It is rate-limited, backs off on export contention and must never run synchronously during user login.

It is not a complete initial import and does not discover every production member automatically. Historical errors from GetCourse exports are resolved; current open incident count is zero.

## Exact stage where work stopped

The isolated test infrastructure, test users/chat, personal access link, webhook processing, worker, relay, audit fallback and incident diagnostics are ready and running.

Production launch has **not** happened. We stopped before:

1. making the GetCourse grant/revoke automation demonstrably repeat-safe for the same user;
2. passing the complete test cycle `grant → join → revoke/remove → re-grant same user → unban → reuse permanent link` without a manually recreated GetCourse task;
3. adding the two production Telegram chat IDs;
4. enabling production Telegram mutations;
5. backfilling/reconciling production group members;
6. adding monitoring/alerts and external/off-VPS backup;
7. establishing a formal Git/release/deploy/rollback workflow.

The current README explicitly warns that a periodic GetCourse process may create only one task per user. Therefore a user who left and was later added again may not re-enter that process automatically. The test audit reduces risk for already known test users, but it is not a substitute for proving the direct repeatable event flow.

## Technical debt that the next task must respect

1. Push/back up the current 8 local commits to GitHub before new development; do not reset local `main` to `origin/main`.
2. Do not deploy from `origin/main` as it is now: it lacks current production behavior.
3. Create a feature/develop branch for further work; do not continue implementing directly on `main`.
4. Production directory has no Git metadata. A release archive/SHA and rollback procedure are needed before any deployment.
5. There are currently **no automated test files**. TypeScript compilation passes, but core business rules need integration/regression tests before production activation.
6. Applied `003_test_access_rule.sql` still contains obsolete test group `4938193`, while the real DB/README use `4939538`. Do not edit an already-applied migration in place; add an idempotent follow-up migration for clean installations/upgrades.
7. Daily backups live on the same VPS. An off-server copy and restore drill are still missing.
8. External uptime/error notification is not configured. systemd restarts on process failure, but this alone is not end-to-end monitoring.
9. Preserve untracked `DESIGN_SYSTEM.md` until the owner decides whether it belongs in the repository.

## Recommended next safe milestone

The next Codex assignment should be a test-first, non-production-activation release:

1. preserve and push the 8 existing commits;
2. create an isolated branch and release baseline;
3. add automated tests around GetCourse webhook idempotency, repeat grant/revoke, manual-block priority, Telegram join/reconcile, safety allowlist and incident recovery;
4. add the idempotent migration correcting the test group source baseline;
5. implement or document a repeat-safe GetCourse event scheme for the test group;
6. execute the full test cycle twice for the same user and permanent link;
7. record DB/event/job evidence and a rollback plan;
8. improve monitoring and off-server backup readiness;
9. stop before production chat IDs, `GETCOURSE_AUDIT_SCOPE=all` or `ALLOW_PRODUCTION_TELEGRAM_MUTATIONS=true` and request a separate owner decision.

Production chat connection/backfill/activation should be a later release only after the repeated test scenario passes.

## Non-negotiable boundaries for the next GPT/Codex task

- Do not touch `vedanie-food`, its LMS/member auth or its SQLite as part of Access work.
- Do not reuse Food membership events as Telegram Access events.
- Do not mutate production Telegram chats during development/testing.
- Do not query GetCourse Export API on every login or link opening.
- Do not expose GetCourse/Telegram secrets or `personal_access_token` in reports/logs.
- Do not rebuild/deploy from old GitHub `origin/main` before publishing the 8 missing commits.
- Do not replace SQLite with PostgreSQL.
- Do not remove manual-block precedence.
- Do not enable production mutations implicitly as part of a deployment.

