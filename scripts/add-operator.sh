#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# Adds (or resets) an operator login in .env on the host, generating a random
# password and, on first use, the session-signing secret. The password is
# printed once; only its scrypt hash is stored. Needs OpenSSL 3 (Ubuntu 24.04).
# Restart the app afterwards: docker compose up -d app
#
# Usage: ./scripts/add-operator.sh <name> [password]
# ---------------------------------------------------------------------------
set -euo pipefail

NAME="$(echo "${1:?usage: add-operator.sh <name> [password]}" | tr '[:upper:]' '[:lower:]')"
PASSWORD="${2:-$(openssl rand -base64 18 | tr -d '/+=' | cut -c1-16)}"
ENV_FILE="${ENV_FILE:-.env}"

[[ "$NAME" =~ ^[a-z0-9._-]{1,64}$ ]] || { echo "Name may use a-z 0-9 . _ - only." >&2; exit 1; }
touch "$ENV_FILE"

# Same parameters as Node's crypto.scrypt defaults (N=16384, r=8, p=1).
SALT="$(openssl rand -hex 16)"
KEY="$(openssl kdf -keylen 32 -kdfopt "pass:$PASSWORD" -kdfopt "hexsalt:$SALT" \
  -kdfopt n:16384 -kdfopt r:8 -kdfopt p:1 SCRYPT | tr -d ':' | tr '[:upper:]' '[:lower:]')"
ENTRY="$NAME:scrypt.$SALT.$KEY"

current="$(grep -E '^OPERATOR_USERS=' "$ENV_FILE" | tail -n1 | cut -d= -f2- || true)"
others="$(echo "$current" | tr ',' '\n' | grep -v "^$NAME:" | grep -v '^$' | paste -sd, - || true)"
updated="${others:+$others,}$ENTRY"

grep -v '^OPERATOR_USERS=' "$ENV_FILE" > "$ENV_FILE.tmp" || true
echo "OPERATOR_USERS=$updated" >> "$ENV_FILE.tmp"
if ! grep -qE '^SESSION_SECRET=.+' "$ENV_FILE.tmp"; then
  grep -v '^SESSION_SECRET=' "$ENV_FILE.tmp" > "$ENV_FILE.tmp2" || true
  echo "SESSION_SECRET=$(openssl rand -hex 32)" >> "$ENV_FILE.tmp2"
  mv "$ENV_FILE.tmp2" "$ENV_FILE.tmp"
fi
mv "$ENV_FILE.tmp" "$ENV_FILE"
chmod 600 "$ENV_FILE"

echo "Operator '$NAME' saved to $ENV_FILE."
echo "Password (shown once): $PASSWORD"
echo "Apply with: docker compose up -d app"
