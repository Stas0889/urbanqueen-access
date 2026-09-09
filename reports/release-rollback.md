# Release and rollback foundation

## Baseline

- source baseline commit: `cfa32bba970360fb8ade38662115b09490ba90ff`;
- annotated tag: `production-source-baseline-2026-09-09`;
- branch: `feature/repeat-safe-milestone`.

## Release

`scripts/create-release.sh <commit-or-tag>` refuses a dirty tracked tree, uses
`git archive` (therefore excludes environment files and other untracked secrets),
and writes a SHA256 sidecar.

## Deployment gate

Before any future deployment:

1. make a consistent SQLite backup with `scripts/backup-db.sh`;
2. record environment/systemd/Nginx hashes without printing contents;
3. verify release SHA256;
4. install dependencies/build in a separate release directory;
5. apply migrations against a disposable restored database first;
6. deploy only the immutable archive;
7. verify service, HTTPS health, SQLite integrity, flags and test allowlist.

This milestone does not activate production chats and does not deploy the feature
branch.

## Rollback

`scripts/rollback-release.sh ARCHIVE SHA256` is dry-run by default. Explicit
`--execute` verifies the checksum, creates a SQLite backup, stages the archive,
replaces only `/opt/urbanqueen-access`, restarts only
`urbanqueen-access.service`, then checks HTTP health and SQLite integrity.

Database rollback is separate and must only be used when a forward-compatible
migration cannot be retained. Restore the pre-deploy SQLite backup while the
service is stopped, preserve the failed database for forensics, then run integrity
and foreign-key checks before starting the service.
