#!/bin/sh
# Have the CareTrail hotline ring a phone instead of waiting for it to call in.
# For places where the hotline number can't be dialled (toll-free from abroad,
# roaming SIMs that block international calls): Twilio calls the number, and
# when it is answered the call is handed to the same inbound webhook the hotline
# uses, so the hotline agent greets the caller exactly as on a dialled-in call.
#
#   sh scripts/hotline-ring-me.sh +916398081128
#
# Reads TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN / TWILIO_PHONE_NUMBER from .env;
# HOTLINE_BASE_URL overrides the production URL. Costs the outbound per-minute
# rate for the destination country.
set -eu
TO="${1:?usage: hotline-ring-me.sh +<number in E.164>}"
cd "$(dirname "$0")/.."
set -a; . ./.env; set +a
BASE="${HOTLINE_BASE_URL:-https://caretrail.caretrack.info}"
curl -s -u "$TWILIO_ACCOUNT_SID:$TWILIO_AUTH_TOKEN" \
  -X POST "https://api.twilio.com/2010-04-01/Accounts/$TWILIO_ACCOUNT_SID/Calls.json" \
  --data-urlencode "To=$TO" \
  --data-urlencode "From=$TWILIO_PHONE_NUMBER" \
  --data-urlencode "Url=$BASE/api/twilio/voice/inbound" \
  --data-urlencode "Method=POST" \
  --data-urlencode "StatusCallback=$BASE/api/twilio/voice/status" \
  --data-urlencode "StatusCallbackMethod=POST" \
  --data-urlencode "StatusCallbackEvent=initiated" \
  --data-urlencode "StatusCallbackEvent=ringing" \
  --data-urlencode "StatusCallbackEvent=answered" \
  --data-urlencode "StatusCallbackEvent=completed" \
  --data-urlencode "Timeout=40" \
  | python3 -I -c 'import json,sys; d=json.load(sys.stdin); print(d.get("message") or ("ringing %s from %s — call %s" % (d["to"], d["from"], d["sid"])))'
