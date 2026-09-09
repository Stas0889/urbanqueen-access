#!/usr/bin/env bash
set -euo pipefail

archive="${1:-}"
expected_sha="${2:-}"
mode="${3:-dry-run}"
app_dir="${ACCESS_APP_DIR:-/opt/urbanqueen-access}"
service="${ACCESS_SERVICE_NAME:-urbanqueen-access.service}"
database="${SQLITE_PATH:-/var/lib/urbanqueen/access.db}"

[[ -f "$archive" && -n "$expected_sha" ]] || {
  echo "Usage: $0 RELEASE.tar.gz SHA256 [--execute]" >&2
  exit 2
}
[[ "$app_dir" == "/opt/urbanqueen-access" ]] || {
  echo "ACCESS_APP_DIR must remain the dedicated application directory" >&2
  exit 2
}
actual_sha="$(sha256sum "$archive" | cut -d' ' -f1)"
[[ "$actual_sha" == "$expected_sha" ]] || { echo "Release checksum mismatch" >&2; exit 1; }

if [[ "$mode" != "--execute" ]]; then
  printf 'dry-run archive=%s app_dir=%s service=%s database=%s\n' "$archive" "$app_dir" "$service" "$database"
  exit 0
fi

backup_path="$(SQLITE_PATH="$database" scripts/backup-db.sh)"
staging_dir="$(mktemp -d /opt/urbanqueen-access-rollback.XXXXXX)"
[[ "$staging_dir" == /opt/urbanqueen-access-rollback.* ]]
trap 'rm -rf -- "$staging_dir"' EXIT
tar -xzf "$archive" -C "$staging_dir"
[[ -f "$staging_dir/urbanqueen-access/apps/api/dist/index.js" ]]

systemctl stop "$service"
rsync -a --delete --exclude '.env' --exclude 'data/' "$staging_dir/urbanqueen-access/" "$app_dir/"
systemctl start "$service"
systemctl is-active --quiet "$service"
curl --fail --silent --show-error --max-time 15 "${ACCESS_HEALTH_URL:-https://access.urban-queen.com/health}" >/dev/null
[[ "$(sqlite3 "$database" 'PRAGMA integrity_check;')" == "ok" ]]
printf 'rollback=ok database_backup=%s\n' "$backup_path"
