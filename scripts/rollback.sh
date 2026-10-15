#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# Manual rollback on the EC2 host: re-deploys the previous release recorded
# by deploy.sh (or a given commit). Images are tagged per release, so this
# is usually a restart, not a rebuild.
#
# Usage: ./scripts/rollback.sh [app-directory] [commit-sha]
# ---------------------------------------------------------------------------
set -euo pipefail

APP_DIR="${1:-$HOME/travel-assistance-os}"
cd "$APP_DIR"

TARGET="${2:-$(cat .deploy/previous 2>/dev/null || true)}"
if [ -z "$TARGET" ]; then
  echo "[rollback] No previous release recorded; pass a commit SHA explicitly." >&2
  exit 1
fi

echo "[rollback] re-deploying $TARGET"
exec ./scripts/deploy.sh "$APP_DIR" "$TARGET"
