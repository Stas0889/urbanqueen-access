# UrbanQueen Access

Сервис контроля доступа GetCourse → Telegram.

## Preview
Интерактивный макет админки: `preview/index.html`.

## Stack
- React + TypeScript
- Node.js + Fastify
- PostgreSQL

## Access rules
- GetCourse group `4825549` → основной чат ВЕДАНИЕ
- GetCourse group `4900239` → чат «Гормональный возраст»

Ключевая логика: ACTIVE + BANNED → UNBAN; INACTIVE + MEMBER → BAN; ручная блокировка не снимается новой оплатой.
