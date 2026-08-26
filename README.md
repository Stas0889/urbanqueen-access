# UrbanQueen Access

Сервис управления доступом из GetCourse в закрытые Telegram-чаты UrbanQueen.

## Что уже есть в v0.2

- React + TypeScript админка.
- Dashboard по двум действующим чатам.
- Пользователи и карточка пользователя.
- Состояния GetCourse / Telegram для каждого чата отдельно.
- Ручная блокировка администратора.
- Сброс Telegram-привязки.
- Журнал событий и экран ошибок.
- Раздел интеграций.
- PostgreSQL schema.
- Заготовки GetCourse и Telegram webhook.
- Очередь задач для будущей фоновой сверки.

## Главные правила доступа

1. Пользователь находится в группе GetCourse → `access_status=active`.
2. Пользователя нет в группе GetCourse → `access_status=inactive`.
3. `ACTIVE + Telegram BANNED` → автоматически выполнить `unbanChatMember`.
4. `INACTIVE + Telegram MEMBER` → автоматически выполнить `banChatMember`.
5. `manual_block=true` имеет приоритет над оплатой и снимается только администратором.

## GetCourse группы

- `4825549` — Пространство «ВЕДАНИЕ. Система восстановления человека».
- `4900239` — Пространство «ВЕДАНИЕ: гормональный возраст 35+, 45+, 55+».

## Локальный запуск

Требования: Node.js 20+, npm, Docker.

```bash
cp .env.example .env
docker compose up -d
npm install
npm run dev
```

Web: `http://localhost:5173`

API: `http://localhost:4100`

Health: `http://localhost:4100/health`

## Следующий этап v0.3

- Получение активных пользователей из GetCourse.
- Callback изменения доступа.
- Telegram Bot API.
- Временные invite links с Join Request.
- Сопоставление GetCourse user ↔ Telegram user ID.
- BAN / UNBAN и reconciliation.
- Миграция со старого GetCourse-контроллера.

## Безопасность

`.env` не коммитится. Telegram Bot Token, GetCourse API key и webhook secrets должны храниться только на сервере.
