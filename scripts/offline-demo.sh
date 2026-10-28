#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# Plan B: CareTrail on this laptop when the venue's Wi-Fi fails. A production
# build served by `next start` on every interface, so an iPad on the same
# hotspot opens it at http://<laptop's address>:3000, against a fresh demo
# database on the local Postgres. Nothing reaches the internet: no AI model
# (the deterministic offline rules answer, as rehearsed), no voice, no
# telephony, no e-mail, no Teams invites. See "Plan B" in DEMO_GUIDE.md.
#
#   npm run demo:offline                  # fresh database, new build, start
#   npm run demo:offline -- --keep-data   # keep what was entered offline
#   npm run demo:offline -- --no-build    # reuse the last build (fast restart)
#
# Run it once while you still have internet (the morning of the show): the
# build and the seed need nothing online, but `npm ci` does.
#
# Settings (environment):
#   OFFLINE_DB     database name (default caretrail_offline); it is dropped
#                  and re-created unless --keep-data
#   OFFLINE_PORT   port (default 3000)
#   PGHOST, PGPORT, PGUSER   the local Postgres (default localhost, 5432, you)
# Sign-in uses OPERATOR_USERS and SESSION_SECRET from .env, as usual.
# ---------------------------------------------------------------------------
set -euo pipefail

cd "$(dirname "$0")/.."

KEEP_DATA=0
BUILD=1
for arg in "$@"; do
  case "$arg" in
    --keep-data) KEEP_DATA=1 ;;
    --no-build) BUILD=0 ;;
    -h | --help)
      sed -n '2,24p' "$0" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    *)
      echo "Unknown option: $arg (try --help)" >&2
      exit 2
      ;;
  esac
done

DB="${OFFLINE_DB:-caretrail_offline}"
PORT="${OFFLINE_PORT:-3000}"
export PGHOST="${PGHOST:-localhost}"
export PGPORT="${PGPORT:-5432}"
export PGUSER="${PGUSER:-$(whoami)}"

say() { printf '\n\033[1m[plan b]\033[0m %s\n' "$*"; }

if [[ ! "$DB" =~ ^[A-Za-z0-9_]+$ ]]; then
  echo "OFFLINE_DB must be letters, digits and underscores only." >&2
  exit 2
fi
if [ ! -d node_modules ]; then
  echo "node_modules is missing: run 'npm ci' while you still have internet." >&2
  exit 1
fi
if ! pg_isready -q; then
  echo "Postgres isn't answering on $PGHOST:$PGPORT. Start it (brew services start postgresql@17) and run this again." >&2
  exit 1
fi

# --- Everything that needs the internet is switched off ---------------------
# Empty values win over .env (Next and the scripts only fill in unset ones).
export DATABASE_URL="postgresql://${PGUSER}@${PGHOST}:${PGPORT}/${DB}"
export AI_API_KEY=""                # offline rules: the rehearsed figures
export XAI_API_KEY=""               # no live voice
export TWILIO_ACCOUNT_SID="" TWILIO_AUTH_TOKEN="" TWILIO_PHONE_NUMBER="" TWILIO_WHATSAPP_FROM=""
export ON_CALL_DOCTOR_NUMBER="" CASE_MANAGER_NUMBER="" OUTBOUND_ALLOWED_NUMBERS=""
export VOICE_GATEWAY_PUBLIC_URL="" APP_INTERNAL_URL=""
export SENDGRID_API_KEY="" SES_SMTP_HOST="" SES_SMTP_PORT="" SES_SMTP_USER="" SES_SMTP_PASSWORD="" SES_MAIL_FROM=""
export MS_TENANT_ID="" MS_CLIENT_ID="" MS_CLIENT_SECRET="" MS_MEETING_ORGANIZER=""
# Links and the visitor QR code follow the address the page was opened at.
export PUBLIC_BASE_URL=""
export NEXT_PUBLIC_APP_URL="http://localhost:${PORT}"
export NEXT_TELEMETRY_DISABLED=1

# --- A fresh demo database ----------------------------------------------------
if [ "$KEEP_DATA" = 1 ] && psql -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname = '${DB}'" | grep -q 1; then
  say "Keeping the database ${DB}; adding only demo records it lacks."
  npx prisma migrate deploy
  npx tsx prisma/seed.ts --if-empty
else
  say "Creating a fresh demo database: ${DB} on ${PGHOST}:${PGPORT}."
  dropdb --if-exists "$DB"
  createdb "$DB"
  npx prisma migrate deploy
  npm run --silent db:seed
fi

# --- The production build ----------------------------------------------------
if [ "$BUILD" = 1 ] || [ ! -f .next/BUILD_ID ]; then
  say "Building (a minute or two)…"
  npx next build
fi

# --- Where to open it ----------------------------------------------------------
ADDRESSES=$(ifconfig 2>/dev/null | awk '/inet / && $2 != "127.0.0.1" { print $2 }' || true)
say "CareTrail is starting, offline."
echo "  On this laptop:   http://localhost:${PORT}"
if [ -n "$ADDRESSES" ]; then
  for ip in $ADDRESSES; do echo "  On the iPad:      http://${ip}:${PORT}"; done
else
  echo "  On the iPad:      join the same hotspot, then run this again to see the address."
fi
echo "  Stop with Ctrl+C. Leads entered here stay in ${DB}: Leads → Export CSV before you go back online."
echo "  (Next warns that \"next start\" doesn't suit a standalone build: expected, it serves this laptop fine.)"

exec npx next start -H 0.0.0.0 -p "$PORT"
