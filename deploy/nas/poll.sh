#!/bin/sh
# The NAS replaces the Mac's launchd jobs: every 15 minutes MomHome's newest SolisCloud readings
# + a battery BMS sample, weather for both homes at most hourly, and on the first days of a month
# MhuHome's FusionSolar report from Gmail (if solar_pipeline is mounted at /pipeline) + its import.
# The API budget / rate limits in momsolar.solis_api apply as before.
DATA=/data
while true; do
  echo "── $(date '+%Y-%m-%d %H:%M:%S')"
  python -W ignore -m momsolar.fetch_solis_api --home momhome --out "$DATA"
  for h in momhome mhuhome; do
    python -W ignore -m momsolar.fetch_weather --home "$h" --out "$DATA" --if-older 55
  done
  day=$(date +%d)
  if [ -f /pipeline/fetch_solar_report.py ] && [ "$day" -le 03 ] && [ "$(date +%M)" -lt 15 ]; then
    SOLAR_REPORT_DIR=/reports SOLAR_REPORT_LOG=/state/solar_report.log python -W ignore /pipeline/fetch_solar_report.py \
      && python -W ignore -m momsolar.fetch_huawei --home mhuhome --raw /reports --out "$DATA"
  fi
  # Sleep to the next quarter hour (+2 min, so the inverter's 5-min upload is in).
  now=$(date +%s); next=$(( (now / 900 + 1) * 900 + 120 )); sleep $(( next - now ))
done
