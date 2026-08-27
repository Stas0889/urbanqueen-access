#!/usr/bin/env bash
set -euo pipefail

NODE_VERSION="${NODE_VERSION:-24.20.0}"
ARCHIVE="node-v${NODE_VERSION}-linux-x64.tar.xz"
DOWNLOAD_ROOT="https://nodejs.org/download/release/v${NODE_VERSION}"
TEMP_DIR="$(mktemp -d /tmp/node-install.XXXXXX)"

cleanup() {
  rm -rf -- "$TEMP_DIR"
}
trap cleanup EXIT

cd "$TEMP_DIR"
curl -fsSLO "$DOWNLOAD_ROOT/SHASUMS256.txt"
curl -fsSLO "$DOWNLOAD_ROOT/$ARCHIVE"
grep " $ARCHIVE$" SHASUMS256.txt | sha256sum -c -

install -d -m 0755 /usr/local/lib/nodejs
tar -xJf "$ARCHIVE" -C /usr/local/lib/nodejs
ln -sfn "/usr/local/lib/nodejs/node-v${NODE_VERSION}-linux-x64" /usr/local/lib/nodejs/current

for executable in node npm npx corepack; do
  ln -sfn "/usr/local/lib/nodejs/current/bin/$executable" "/usr/local/bin/$executable"
done

node --version
npm --version
