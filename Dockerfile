# ---------------------------------------------------------------------------
# Travel Assistance AI Platform — production image (multi-stage).
# Secrets are NEVER baked into the image; they come from the environment.
# ---------------------------------------------------------------------------

FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci

FROM node:22-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npx prisma generate \
 && npm run build \
 # Bundle the seed script so the runtime image can seed without dev deps.
 && npx esbuild prisma/seed.ts --bundle --platform=node --format=cjs \
      --outfile=.next/standalone/seed.cjs \
      --external:@prisma/client --external:pdf-parse \
 # The voice gateway (WebSocket server) ships in the same image; compose runs
 # it as its own service with `node voice-gateway.cjs`.
 && npx esbuild voice-gateway/main.ts --bundle --platform=node --format=cjs --target=node22 \
      --outfile=.next/standalone/voice-gateway.cjs \
      --external:@prisma/client --external:pdf-parse \
      --external:bufferutil --external:utf-8-validate

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup -S nodejs -g 1001 && adduser -S nextjs -u 1001

# Standalone server with traced node_modules (includes @prisma/client, pdf-parse).
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
# Output tracing misses pdf-parse's dynamically imported worker — ship the
# whole module.
COPY --from=deps --chown=nextjs:nodejs /app/node_modules/pdf-parse ./node_modules/pdf-parse
COPY --from=deps --chown=nextjs:nodejs /app/node_modules/pdfjs-dist ./node_modules/pdfjs-dist


# Prisma CLI (self-contained install) for `migrate deploy` at container start,
# plus @napi-rs/canvas (pdf.js's optional DOM polyfill provider, which Next's
# output tracing misses because pdf-parse loads it dynamically) and pdfkit.
RUN mkdir -p /opt/prisma /opt/extra \
 && cd /opt/prisma && npm init -y >/dev/null 2>&1 \
 && npm install prisma@6.19.3 --omit=dev --no-audit --no-fund >/dev/null \
 && cd /opt/extra && npm init -y >/dev/null 2>&1 \
 && npm install @napi-rs/canvas pdfkit@0.20.2 --omit=dev --no-audit --no-fund >/dev/null \
 && npm cache clean --force >/dev/null 2>&1
ENV NODE_PATH=/opt/extra/node_modules
# pdfkit (Letters of Guarantee) reads font data from disk and output tracing
# only copies part of it. Next loads it with an ES-module import(), which
# ignores NODE_PATH, so replace the partial copy with a symlink to the
# complete install in /opt/extra (its own dependencies resolve from there).
RUN rm -rf /app/node_modules/pdfkit \
 && ln -s /opt/extra/node_modules/pdfkit /app/node_modules/pdfkit
COPY --chown=nextjs:nodejs prisma ./prisma
COPY --chown=nextjs:nodejs docker-entrypoint.sh ./docker-entrypoint.sh
RUN chmod +x docker-entrypoint.sh && mkdir -p /app/uploads && chown nextjs:nodejs /app/uploads

USER nextjs
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

ENTRYPOINT ["./docker-entrypoint.sh"]
