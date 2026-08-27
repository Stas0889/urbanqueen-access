# UrbanQueen Access

Existing GitHub project: https://github.com/Stas0889/urbanqueen-access

## Scope

Automatic reconciliation of GetCourse group access with Telegram chat membership.
SQLite is the only database. Production target is Ubuntu 24.04 at REG.RU.

## Safety

- Never call or mutate the two production Telegram chats without separate user approval.
- Test Telegram integration only with a dedicated test bot and test group.
- Keep ALLOW_PRODUCTION_TELEGRAM_MUTATIONS=false until the migration is explicitly approved.
- Do not change production GetCourse processes during local development.
