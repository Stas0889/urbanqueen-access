#!/usr/bin/env bash
set -euo pipefail

NODE_VERSION="${NODE_VERSION:-22.23.2}"
ARCHIVE="node-v${NODE_VERSION}-linux-x64.tar.xz"
DOWNLOAD_ROOT="https://nodejs.org/download/release/v${NODE_VERSION}"
INSTALL_ROOT="${NODE_INSTALL_ROOT:-/usr/local/lib/nodejs}"
VERSION_DIR="$INSTALL_ROOT/node-v${NODE_VERSION}-linux-x64"
TEMP_DIR="$(mktemp -d /tmp/node-install.XXXXXX)"

cleanup() {
  rm -rf -- "$TEMP_DIR"
}
trap cleanup EXIT

cd "$TEMP_DIR"
curl -fsSLO "$DOWNLOAD_ROOT/SHASUMS256.txt"
curl -fsSLO "$DOWNLOAD_ROOT/$ARCHIVE"
grep " $ARCHIVE$" SHASUMS256.txt | sha256sum -c -

install -d -m 0755 "$INSTALL_ROOT"
if [[ ! -x "$VERSION_DIR/bin/node" ]]; then
  tar -xJf "$ARCHIVE" -C "$INSTALL_ROOT"
fi

"$VERSION_DIR/bin/node" --version
PATH="$VERSION_DIR/bin:$PATH" "$VERSION_DIR/bin/npm" --version
