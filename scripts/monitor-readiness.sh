#!/usr/bin/env bash
set -euo pipefail

health_url="${ACCESS_HEALTH_URL:-https://access.urban-queen.com/health}"
database="${SQLITE_PATH:-/var/lib/urbanqueen/access.db}"
service="${ACCESS_SERVICE_NAME:-urbanqueen-access.service}"

systemctl is-active --quiet "$service"
systemctl is-enabled --quiet "$service"
curl --fail --silent --show-error --max-time 15 "$health_url" >/dev/null
[[ "$(sqlite3 "$database" 'PRAGMA integrity_check;')" == "ok" ]]
[[ "$(sqlite3 "$database" "SELECT COUNT(*) FROM events WHERE level='error' AND resolved_at IS NULL;")" == "0" ]]

printf 'ok service=%s health=%s database=%s\n' "$service" "$health_url" "$database"
