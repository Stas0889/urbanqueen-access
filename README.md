# UrbanQueen Access

Сервис контроля доступа GetCourse → Telegram.

## Preview
Интерактивный макет админки: `preview/index.html`.

## Local development

```bash
npm install
npm run dev
```

Frontend: `http://localhost:5173`
API: `http://localhost:4100`

Backend по умолчанию слушает только `127.0.0.1`; внешний доступ в production
идёт исключительно через отдельный Nginx virtual host.

Без `.env` приложение запускается только в безопасном режиме `APP_ENV=test`.
Локальная учётная запись: `admin@local.test`; пароль:
`local-development-only`. Перед любой общей или production-средой задайте
собственные `ADMIN_PASSWORD` и `JWT_SECRET`.

## Stack
- React + TypeScript
- Node.js + Fastify
- SQLite (`better-sqlite3`)

Основная база хранится локальным файлом на сервере приложения. Для production планируется российский VPS; внешний сервис базы данных не требуется.

## Storage
По умолчанию база создаётся в `./data/access.db`.

В production путь задаётся через:

`SQLITE_PATH=/var/lib/urbanqueen/access.db`

SQLite работает в режиме WAL, включены foreign keys и `busy_timeout` для устойчивой работы webhook-запросов.

Схема применяется последовательно из `db/migrations`; выполненные миграции
фиксируются в `schema_migrations`.

Файлы `.db`, `.db-wal` и `.db-shm` исключены из Git.

## Access rules
- GetCourse group `4825549` → основной чат ВЕДАНИЕ
- GetCourse group `4900239` → чат «Гормональный возраст»

Ключевая логика:
- `ACTIVE + BANNED` → автоматически снять Telegram ban;
- `INACTIVE + MEMBER` → автоматически удалить из Telegram;
- ручная блокировка администратора не снимается новой оплатой;
- технический ban после окончания оплаты снимается автоматически при восстановлении доступа.

## Backup

`scripts/backup-db.sh` создаёт согласованную копию через SQLite `.backup`,
назначает права `0600` и удаляет копии старше заданного срока. На production
скрипт следует запускать отдельным systemd timer/cron и затем переносить копию
в согласованное российское backup-хранилище.

## Safety boundary

- Telegram worker стартует только когда заданы bot token и webhook secret.
- В production любые ban/unban/invite/approve/decline заблокированы, пока
  `ALLOW_PRODUCTION_TELEGRAM_MUTATIONS=true` не включён явно.
- Во время разработки реальные Telegram chat ID не задаются.
- GetCourse webhook принимает запросы только с правильным `X-Access-Secret`.
- Telegram webhook проверяет `X-Telegram-Bot-Api-Secret-Token`.

## Production files

- `deploy/nginx-access.urban-queen.com.conf`
- `deploy/urbanqueen-access.service`
- `deploy/access.env.example`

HTTPS выпускается Certbot после настройки DNS. Сначала проект проверяется на
тестовом Telegram-чате; существующий GetCourse-контроллер не отключается.
