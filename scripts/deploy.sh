#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# Controlled deployment script executed ON the EC2 host (by GitHub Actions
# over SSH, or manually). Deploys an exact commit, builds an image tagged
# with it, migrates and restarts the stack, then verifies health. If the new
# release never turns healthy, the previous release is restored.
#
# Usage: ./scripts/deploy.sh [app-directory] [commit-sha]
#   commit-sha defaults to the tip of origin/$DEPLOY_BRANCH (main).
# ---------------------------------------------------------------------------
set -euo pipefail

APP_DIR="${1:-$HOME/travel-assistance-os}"
TARGET="${2:-}"
DEPLOY_BRANCH="${DEPLOY_BRANCH:-main}"
HEALTH_RETRIES="${HEALTH_RETRIES:-30}"
STATE_DIR=".deploy"

log() { echo "[deploy] $(date '+%H:%M:%S') $*"; }
fail() { echo "[deploy] ERROR: $*" >&2; exit 1; }

env_value() { grep -E "^$1=" .env | tail -n1 | cut -d= -f2- || true; }

compose() {
  if [ -n "$(env_value DOMAIN)" ]; then
    COMPOSE_PROFILES=tls docker compose "$@"
  else
    docker compose "$@"
  fi
}

app_healthy() {
  local id
  id="$(compose ps -q app)"
  [ -n "$id" ] && [ "$(docker inspect -f '{{.State.Health.Status}}' "$id" 2>/dev/null)" = "healthy" ]
}

nginx_serving() {
  # 200 over HTTP, or the 301 to HTTPS once TLS is active.
  local code
  code="$(curl -s -o /dev/null -w '%{http_code}' http://localhost/api/health || true)"
  [ "$code" = "200" ] || [ "$code" = "301" ]
}

wait_healthy() {
  for _ in $(seq 1 "$HEALTH_RETRIES"); do
    if app_healthy && nginx_serving; then return 0; fi
    sleep 5
  done
  return 1
}

log "1/8 moving to application directory: $APP_DIR"
cd "$APP_DIR"
mkdir -p "$STATE_DIR"

log "2/8 fetching code"
git fetch --prune origin
SHA="$(git rev-parse --verify "${TARGET:-origin/$DEPLOY_BRANCH}^{commit}")"
git checkout --quiet --detach "$SHA"
TAG="$(git rev-parse --short=12 "$SHA")"
log "    deploying $SHA (image taap-app:$TAG)"

log "3/8 validating environment"
[ -f .env ] || fail ".env is missing. Copy .env.example and configure it."
grep -q "change_me" .env && fail ".env still contains placeholder credentials."
if [ -z "$(env_value OPERATOR_USERS)" ] || [ -z "$(env_value SESSION_SECRET)" ]; then
  fail "operator sign-in is not configured. Run: ./scripts/add-operator.sh <name>"
fi
if [ -n "$(env_value DOMAIN)" ] && [ -z "$(env_value LETSENCRYPT_EMAIL)" ]; then
  fail "DOMAIN is set but LETSENCRYPT_EMAIL is not."
fi

PREV_SHA="$(cat "$STATE_DIR/current" 2>/dev/null || true)"

log "4/8 building image"
IMAGE_TAG="$TAG" compose build --pull app

log "5/8 starting stack (migrations run in the app entrypoint)"
IMAGE_TAG="$TAG" compose up -d --remove-orphans

log "6/8 waiting for the app and nginx to report healthy"
if wait_healthy; then
  log "7/8 healthy — recording release"
  [ -n "$PREV_SHA" ] && [ "$PREV_SHA" != "$SHA" ] && echo "$PREV_SHA" > "$STATE_DIR/previous"
  echo "$SHA" > "$STATE_DIR/current"

  log "8/8 pruning old images (keeping the current and previous release)"
  keep="taap-app:$TAG"
  [ -n "$PREV_SHA" ] && keep="$keep taap-app:$(git rev-parse --short=12 "$PREV_SHA")"
  docker images taap-app --format '{{.Repository}}:{{.Tag}}' | while read -r image; do
    case " $keep taap-app:latest " in *" $image "*) ;; *) docker rmi "$image" >/dev/null 2>&1 || true ;; esac
  done
  docker image prune -f >/dev/null 2>&1 || true
  docker builder prune -f --filter 'until=168h' >/dev/null 2>&1 || true
  log "deployment successful."
  exit 0
fi

echo "[deploy] ERROR: release $TAG did not become healthy. Recent app logs:" >&2
compose logs --tail 60 app >&2 || true

if [ -n "$PREV_SHA" ] && [ "$PREV_SHA" != "$SHA" ]; then
  log "rolling back to $PREV_SHA"
  git checkout --quiet --detach "$PREV_SHA"
  PREV_TAG="$(git rev-parse --short=12 "$PREV_SHA")"
  if ! docker image inspect "taap-app:$PREV_TAG" >/dev/null 2>&1; then
    IMAGE_TAG="$PREV_TAG" compose build app
  fi
  IMAGE_TAG="$PREV_TAG" compose up -d --remove-orphans
  if wait_healthy; then
    log "rollback to $PREV_TAG is healthy. (Database migrations are forward-only and additive.)"
  else
    echo "[deploy] ERROR: rollback did not become healthy either — manual attention needed." >&2
  fi
fi
exit 1
