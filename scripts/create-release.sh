#!/usr/bin/env bash
set -euo pipefail

ref="${1:-HEAD}"
output_dir="${RELEASE_OUTPUT_DIR:-./release-artifacts}"
commit="$(git rev-parse --verify "${ref}^{commit}")"
version="$(git describe --tags --always "$commit")"
version="${version//\//-}"
version="${version// /-}"
archive="$output_dir/urbanqueen-access-$version.tar.gz"
staging_dir="$(mktemp -d)"
[[ "$staging_dir" == /tmp/* || "$staging_dir" == /var/* || "$staging_dir" == [A-Za-z]:/* ]]
trap 'rm -rf -- "$staging_dir"' EXIT

mkdir -p "$output_dir"
git diff --quiet
git diff --cached --quiet
mkdir -p "$staging_dir/urbanqueen-access"
git archive "$commit" | tar -x -C "$staging_dir/urbanqueen-access"
(
  cd "$staging_dir/urbanqueen-access"
  npm ci
  npm run build
)
tar --exclude='node_modules' -czf "$archive" -C "$staging_dir" urbanqueen-access
sha256sum "$archive" > "$archive.sha256"

printf 'commit=%s\narchive=%s\nchecksum=%s\n' "$commit" "$archive" "$(cut -d' ' -f1 "$archive.sha256")"
