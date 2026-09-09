#!/usr/bin/env bash
set -euo pipefail

source_dir="${BACKUP_DIR:-/var/backups/urbanqueen}"
destination="${OFFSITE_BACKUP_DESTINATION:-}"
retention_days="${OFFSITE_RETENTION_DAYS:-30}"
mode="${1:-dry-run}"

if [[ -z "$destination" || "$destination" != /* || "$destination" == "/" ]]; then
  echo "OFFSITE_BACKUP_DESTINATION must be a dedicated absolute mounted path" >&2
  exit 2
fi
if [[ "$destination" == "$source_dir" || "$destination" == "$source_dir/"* ]]; then
  echo "Off-server destination must not be inside the local backup directory" >&2
  exit 2
fi
if ! [[ "$retention_days" =~ ^[0-9]+$ ]] || (( retention_days < 1 )); then
  echo "OFFSITE_RETENTION_DAYS must be a positive integer" >&2
  exit 2
fi

latest="$(find "$source_dir" -maxdepth 1 -type f -name 'access-*.db' -printf '%T@ %p\n' | sort -nr | head -n1 | cut -d' ' -f2-)"
[[ -n "$latest" ]] || { echo "No SQLite backup found in $source_dir" >&2; exit 1; }
checksum="$(sha256sum "$latest" | cut -d' ' -f1)"

if [[ "$mode" != "--execute" ]]; then
  printf 'dry-run source=%s destination=%s checksum=%s retention_days=%s\n' "$latest" "$destination" "$checksum" "$retention_days"
  exit 0
fi

install -d -m 0700 "$destination"
target="$destination/$(basename "$latest")"
install -m 0600 "$latest" "$target"
printf '%s  %s\n' "$checksum" "$(basename "$target")" > "$target.sha256"
(cd "$destination" && sha256sum --check "$(basename "$target").sha256")
find "$destination" -maxdepth 1 -type f -name 'access-*.db' -mtime "+$retention_days" -delete
find "$destination" -maxdepth 1 -type f -name 'access-*.db.sha256' -mtime "+$retention_days" -delete
printf 'copied=%s checksum=%s\n' "$target" "$checksum"
