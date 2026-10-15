#!/bin/sh
# Runs from /docker-entrypoint.d before nginx starts. Picks HTTPS when a
# certificate for $DOMAIN exists, else HTTP-only, and keeps watching: once
# certbot issues the certificate nginx switches to HTTPS, and it reloads
# twice a day so renewed certificates are picked up.
set -eu

CONF=/etc/nginx/conf.d/default.conf

render() {
  if [ -n "${DOMAIN:-}" ] && [ -f "/etc/letsencrypt/live/${DOMAIN}/fullchain.pem" ]; then
    envsubst '${DOMAIN}' < /etc/nginx/taap/templates/https.conf.template
  else
    envsubst '${DOMAIN}' < /etc/nginx/taap/templates/http.conf.template
  fi
}

render > "$CONF"
if grep -q 'listen 443' "$CONF"; then mode=https; else mode=http; fi
echo "[taap-nginx] serving in $mode mode${DOMAIN:+ for $DOMAIN}"

if [ -n "${DOMAIN:-}" ]; then
  (
    ticks=0
    while sleep 300; do
      ticks=$((ticks + 1))
      next="$(render)"
      if [ "$next" != "$(cat "$CONF")" ]; then
        printf '%s\n' "$next" > "$CONF"
        echo "[taap-nginx] certificate state changed; reloading"
        nginx -s reload || true
      elif [ $((ticks % 144)) -eq 0 ]; then
        nginx -s reload || true # every 12 h: pick up renewed certificates
      fi
    done
  ) &
fi
