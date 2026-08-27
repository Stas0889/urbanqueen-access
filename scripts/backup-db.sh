#!/usr/bin/env bash
set -euo pipefail

DB_PATH="${SQLITE_PATH:-/var/lib/urbanqueen/access.db}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/urbanqueen-access}"
KEEP_DAYS="${BACKUP_KEEP_DAYS:-14}"

if [[ ! -f "$DB_PATH" ]]; then
  echo "Database not found: $DB_PATH" >&2
  exit 1
fi

install -d -m 0700 "$BACKUP_DIR"
timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
temporary="$BACKUP_DIR/.access-$timestamp.db.tmp"
destination="$BACKUP_DIR/access-$timestamp.db"

sqlite3 "$DB_PATH" ".timeout 10000" ".backup '$temporary'"
chmod 0600 "$temporary"
mv "$temporary" "$destination"
find "$BACKUP_DIR" -maxdepth 1 -type f -name 'access-*.db' -mtime "+$KEEP_DAYS" -delete

echo "$destination"
