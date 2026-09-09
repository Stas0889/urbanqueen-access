#!/usr/bin/env bash
set -euo pipefail

backup="${1:-}"
checksum_file="${2:-${backup}.sha256}"
[[ -f "$backup" ]] || { echo "Usage: $0 BACKUP.db [BACKUP.db.sha256]" >&2; exit 2; }
command -v sqlite3 >/dev/null

temporary_dir="$(mktemp -d)"
trap 'rm -rf -- "$temporary_dir"' EXIT
copy="$temporary_dir/restore-drill.db"
cp -- "$backup" "$copy"

if [[ -f "$checksum_file" ]]; then
  expected="$(cut -d' ' -f1 "$checksum_file")"
  actual="$(sha256sum "$copy" | cut -d' ' -f1)"
  [[ "$actual" == "$expected" ]] || { echo "Checksum mismatch" >&2; exit 1; }
fi

[[ "$(sqlite3 "$copy" 'PRAGMA integrity_check;')" == "ok" ]]
foreign_key_errors="$(sqlite3 "$copy" 'PRAGMA foreign_key_check;')"
[[ -z "$foreign_key_errors" ]]
printf 'restore-drill=ok source=%s\n' "$backup"
