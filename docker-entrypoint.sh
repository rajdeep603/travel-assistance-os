#!/bin/sh
set -e

echo "[entrypoint] applying database migrations…"
node /opt/prisma/node_modules/prisma/build/index.js migrate deploy --schema /app/prisma/schema.prisma

# AUTO_SEED=true (default): seed an empty database only, so deploys keep the
# demo's live state. AUTO_SEED=always: restore the canonical demo data on
# every start. AUTO_SEED=false: never seed.
if [ "$AUTO_SEED" = "always" ]; then
  echo "[entrypoint] re-seeding demo data (idempotent)…"
  node seed.cjs
elif [ "$AUTO_SEED" = "true" ]; then
  echo "[entrypoint] seeding demo data if the database is empty…"
  node seed.cjs --if-empty
fi

echo "[entrypoint] starting application…"
exec node server.js
