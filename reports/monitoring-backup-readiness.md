# Monitoring and off-server backup readiness

## Monitoring

`scripts/monitor-readiness.sh` checks:

- systemd active;
- systemd enabled;
- public HTTPS health;
- SQLite integrity;
- unresolved error incident count equals zero.

Recommended alerts:

- HTTP non-200 for 2 consecutive checks / 5 minutes;
- systemd not active or restart counter increases;
- any unresolved incident for 10 minutes;
- pending job older than 10 minutes;
- `requires_admin_attention=1`;
- no successful GetCourse audit for 90 minutes in test scope;
- no local backup for 26 hours;
- SQLite integrity or foreign-key failure: immediate critical alert.

No external monitoring account or credential was added.

## Off-server backup

`scripts/offsite-backup.sh` is dry-run by default and requires a dedicated absolute
mounted off-server destination in `OFFSITE_BACKUP_DESTINATION`. It copies the
newest consistent SQLite backup, stores SHA256, and applies configurable retention
(`OFFSITE_RETENTION_DAYS`, default 30) only inside that exact destination.

`scripts/restore-drill.sh BACKUP CHECKSUM` copies into a disposable directory,
verifies SHA256, runs `integrity_check` and `foreign_key_check`, then removes
only its validated temporary directory.

No backup was transmitted because the owner has not supplied/approved an
off-server destination.
