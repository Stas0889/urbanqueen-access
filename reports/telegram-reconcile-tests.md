# Telegram reconcile tests

Covered with a fake Bot API and production-mode safety configuration:

- active/not-connected user receives a 10-minute join-request invite;
- active/banned user is technically unbanned and receives a fresh invite;
- inactive/member user is banned/removed;
- re-grant permits the same linked Telegram account to return;
- valid join request is approved and binds the Telegram ID;
- unknown invite is declined;
- duplicate update ID is ignored;
- manual block wins over active GetCourse access;
- explicit admin unblock restores the normal reconcile path;
- test chat is allow-listed;
- arbitrary and production chat IDs fail before an HTTP mutation.

Production Telegram chat IDs remain unset and no live production-chat mutation was
performed.
