#!/bin/sh
# Nightly logical backups of the demo database (compose "backup" service).
# Dumps land on the taap_backups volume; scripts/backup-to-s3.sh copies them
# off the host. Restore: pg_restore --clean --if-exists -d "$PGDATABASE" <file>
set -eu

RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-7}"
mkdir -p /backups

backup() {
  file="/backups/taap-$(date -u +%Y%m%dT%H%M%SZ).dump"
  if pg_dump --format=custom --no-owner --file="$file.partial"; then
    mv "$file.partial" "$file"
    echo "[backup] wrote $file ($(du -h "$file" | cut -f1))"
  else
    rm -f "$file.partial"
    echo "[backup] pg_dump failed" >&2
  fi
  find /backups -name 'taap-*.dump' -mtime +"$RETENTION_DAYS" -delete
}

until pg_isready -q; do sleep 5; done
backup
while sleep 86400; do backup; done
