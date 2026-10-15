#!/usr/bin/env bash
# Copies the database dumps from the taap_backups volume to S3. Run on the
# EC2 host (root cron, see DEPLOYMENT.md); uses the instance role's
# credentials, which containers cannot reach (IMDS hop limit 1).
# Usage: backup-to-s3.sh s3://<bucket>/<prefix>
set -euo pipefail

DEST="${1:?usage: backup-to-s3.sh s3://bucket/prefix}"
SRC="$(docker volume inspect taap_taap_backups --format '{{ .Mountpoint }}')"
aws s3 sync "$SRC" "$DEST" --exclude '*.partial' --only-show-errors
echo "[backup-to-s3] $(date -Is) synced $SRC → $DEST"
