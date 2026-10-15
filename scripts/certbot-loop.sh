#!/bin/sh
# Certificate manager for the "tls" compose profile: obtains a Let's Encrypt
# certificate for $DOMAIN via the webroot nginx serves, then renews it.
# nginx notices the certificate on its own (nginx/select-config.sh).
set -eu

if [ -z "${DOMAIN:-}" ] || [ -z "${LETSENCRYPT_EMAIL:-}" ]; then
  echo "[certbot] DOMAIN and LETSENCRYPT_EMAIL must be set for the tls profile." >&2
  exit 1
fi

if [ ! -f "/etc/letsencrypt/live/${DOMAIN}/fullchain.pem" ]; then
  # Give nginx a moment to come up and serve the challenge directory.
  sleep 10
  until certbot certonly --webroot -w /var/www/certbot \
      -d "$DOMAIN" --email "$LETSENCRYPT_EMAIL" \
      --agree-tos --non-interactive --keep-until-expiring; do
    echo "[certbot] issuance failed (is DNS for $DOMAIN pointing here?); retrying in 10 minutes"
    sleep 600
  done
fi

while :; do
  certbot renew --webroot -w /var/www/certbot --quiet || echo "[certbot] renew failed; will retry"
  sleep 43200
done
