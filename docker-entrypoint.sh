#!/bin/sh
set -e

echo "[entrypoint] applying database migrations…"
node /opt/prisma/node_modules/prisma/build/index.js migrate deploy --schema /app/prisma/schema.prisma

if [ "$AUTO_SEED" = "true" ]; then
  echo "[entrypoint] seeding demo data (idempotent)…"
  node seed.cjs
fi

echo "[entrypoint] starting application…"
exec node server.js
