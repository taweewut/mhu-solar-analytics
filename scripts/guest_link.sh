#!/bin/sh
# Print a dashboard link for a guest that stops working after N days (default 7).
#   scripts/guest_link.sh [days] [#/mhuhome]
# The signing secret is read from the NAS .env over ssh and never printed; the public address
# comes from SOLAR_PUBLIC_URL in this repo's .env.
set -e
cd "$(dirname "$0")/.."
[ -f .env ] && . ./.env
NAS_ENV=${NAS_ENV:-/volume1/docker/mhu-solar/app/deploy/nas/.env}
SOLAR_GUEST_SECRET=$(ssh nas "sed -n 's/^SOLAR_GUEST_SECRET=//p' $NAS_ENV") \
SOLAR_PUBLIC_URL=${SOLAR_PUBLIC_URL:?set SOLAR_PUBLIC_URL in .env} \
  .venv/bin/python -m momsolar.guest link --days "${1:-7}" --page "${2:-}"
