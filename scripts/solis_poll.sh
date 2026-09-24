#!/bin/bash
# Scheduled SolisCloud fetch (launchd, every 15 min — see scripts/install_poll.sh): MomHome's
# newest 5-min readings plus one battery BMS sample (temperature, cell voltages), and the
# site weather once an hour. Keys and the
# daily call budget come from .env; a used-up budget just skips until the next UTC day.
set -uo pipefail
DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$DIR"
echo "── $(date '+%Y-%m-%d %H:%M:%S')"
"$DIR/.venv/bin/python" -W ignore -m momsolar.fetch_solis_api --home momhome
# Hourly weather for the Day chart (Open-Meteo, free): at most once an hour.
for h in momhome mhuhome; do
  "$DIR/.venv/bin/python" -W ignore -m momsolar.fetch_weather --home "$h" --if-older 55
done
