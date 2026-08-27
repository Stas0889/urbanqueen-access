# UrbanQueen Access

Сервис контроля доступа GetCourse → Telegram.

## Preview
Интерактивный макет админки: `preview/index.html`.

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
На production-сервере необходимо настроить ежедневную резервную копию `access.db` в хранилище на территории РФ. При создании backup приложение должно использовать безопасный SQLite backup/копирование после checkpoint, чтобы копия была консистентной.
