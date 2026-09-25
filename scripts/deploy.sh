#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# Controlled deployment script executed ON the EC2 host (by GitHub Actions
# over SSH, or manually). Pulls the latest code, rebuilds, migrates and
# restarts the stack, then verifies health.
#
# Usage: ./scripts/deploy.sh [app-directory]
# ---------------------------------------------------------------------------
set -euo pipefail

APP_DIR="${1:-$HOME/travel-assistance-os}"
HEALTH_URL="${HEALTH_URL:-http://localhost/api/health}"
HEALTH_RETRIES="${HEALTH_RETRIES:-20}"

log() { echo "[deploy] $(date '+%H:%M:%S') $*"; }

log "1/7 moving to application directory: $APP_DIR"
cd "$APP_DIR"

log "2/7 pulling latest code"
git pull --ff-only

log "3/7 validating environment"
if [ ! -f .env ]; then
  echo "[deploy] ERROR: .env is missing. Copy .env.example and configure it." >&2
  exit 1
fi
if grep -q "change_me" .env; then
  echo "[deploy] ERROR: .env still contains placeholder credentials." >&2
  exit 1
fi

log "4/7 building containers"
docker compose build --pull

log "5/7 starting stack (migrations run in the app entrypoint)"
docker compose up -d

log "6/7 waiting for health check at $HEALTH_URL"
for i in $(seq 1 "$HEALTH_RETRIES"); do
  if curl -fsS "$HEALTH_URL" | grep -q '"status":"ok"'; then
    log "7/7 deployment successful — health check passed."
    docker image prune -f >/dev/null 2>&1 || true
    exit 0
  fi
  sleep 5
done

echo "[deploy] ERROR: health check did not pass after $HEALTH_RETRIES attempts." >&2
echo "[deploy] Recent app logs:" >&2
docker compose logs --tail 50 app >&2
exit 1
