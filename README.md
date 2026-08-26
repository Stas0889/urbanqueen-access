# UrbanQueen Access

Сервис управления доступом GetCourse → Telegram для двух действующих чатов UrbanQueen / ВЕДАНИЕ.

## Что уже заложено в v0.2

- React + TypeScript админка
- Node.js + Fastify API
- PostgreSQL schema
- две группы GetCourse: 4825549 и 4900239
- отдельное состояние доступа для каждого чата
- связь GetCourse user ID ↔ Telegram user ID
- технический Telegram ban и отдельный ручной stop-list
- временные invite links
- журнал событий и очередь синхронизации
- webhook endpoints для GetCourse и Telegram
- логика будущей reconciliation: ACTIVE + BANNED → UNBAN, INACTIVE + MEMBER → BAN

## Локальный запуск

1. Скопировать `.env.example` в `.env`
2. Запустить PostgreSQL: `docker compose up -d`
3. Применить `db/migrations/001_init.sql`
4. Установить зависимости: `npm install`
5. Запустить: `npm run dev`

Web: http://localhost:5173
API: http://localhost:4100

## Следующий этап

Подключение реального GetCourse, Telegram Bot API, обработка join requests, ban/unban и миграция со встроенного контроллера GetCourse.
