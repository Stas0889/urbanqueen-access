#!/usr/bin/env bash
set -euo pipefail

env_file="/etc/urbanqueen/access.env"

if [[ ! -f "$env_file" ]]; then
  printf 'Environment file not found: %s\n' "$env_file" >&2
  exit 1
fi

cleanup() {
  stty echo 2>/dev/null || true
  unset telegram_bot_token getcourse_api_key
}
trap cleanup EXIT INT TERM

stty -echo
printf 'Telegram Bot Token (input hidden): '
IFS= read -r telegram_bot_token
printf '\nGetCourse API key (input hidden): '
IFS= read -r getcourse_api_key
printf '\n'
stty echo

if [[ ! "$telegram_bot_token" =~ ^[0-9]{7,12}:[A-Za-z0-9_-]{30,80}$ ]]; then
  printf 'Telegram token format is invalid; nothing was changed. Paste it exactly once.\n' >&2
  exit 1
fi

if [[ ${#getcourse_api_key} -lt 16 || ${#getcourse_api_key} -gt 256 || "$getcourse_api_key" =~ [[:space:]] ]]; then
  printf 'GetCourse API key format is invalid; nothing was changed. Copy only the key value.\n' >&2
  exit 1
fi

TELEGRAM_BOT_TOKEN_INPUT="$telegram_bot_token" \
GETCOURSE_API_KEY_INPUT="$getcourse_api_key" \
python3 - "$env_file" <<'PY'
import os
import pathlib
import sys

path = pathlib.Path(sys.argv[1])
updates = {
    "TELEGRAM_BOT_TOKEN": os.environ["TELEGRAM_BOT_TOKEN_INPUT"],
    "GETCOURSE_API_KEY": os.environ["GETCOURSE_API_KEY_INPUT"],
}

lines = path.read_text(encoding="utf-8").splitlines()
seen = set()
result = []
for line in lines:
    key = line.split("=", 1)[0] if "=" in line else ""
    if key in updates:
        result.append(f"{key}={updates[key]}")
        seen.add(key)
    else:
        result.append(line)

for key, value in updates.items():
    if key not in seen:
        result.append(f"{key}={value}")

temporary = path.with_suffix(".env.new")
temporary.write_text("\n".join(result) + "\n", encoding="utf-8")
temporary.chmod(0o600)
temporary.replace(path)
PY

unset telegram_bot_token getcourse_api_key
systemctl restart urbanqueen-access
printf 'Credentials saved and service restarted. You can close this terminal.\n'
