# Migration 005 test-group baseline fix

Added `db/migrations/005_fix_test_access_rule_baseline.sql`; migration
`003_test_access_rule.sql` was not edited.

Behavior:

- if only obsolete group `4938193` exists, the same row is updated to `4939538`;
- if a current `4939538` row already exists, obsolete history is disabled;
- current production databases without the obsolete row are unchanged;
- clean install followed by a repeated migration runner call creates no duplicate;
- `PRAGMA integrity_check` returns `ok`;
- `PRAGMA foreign_key_check` returns no rows.

The migration runner was extracted as `applyMigrations()` so clean-install and
repeat-application behavior can be tested without touching production SQLite.
