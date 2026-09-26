#!/bin/sh
# The NAS replaces the Mac's launchd jobs: every 15 minutes MomHome's newest SolisCloud readings
# + a battery BMS sample, weather for both homes at most hourly, and MhuHome's FusionSolar report
# from Gmail (if solar_pipeline is mounted at /pipeline) + its import.
# The API budget / rate limits in momsolar.solis_api apply as before.
DATA=/data
while true; do
  echo "── $(date '+%Y-%m-%d %H:%M:%S')"
  python -W ignore -m momsolar.fetch_solis_api --home momhome --out "$DATA"
  for h in momhome mhuhome; do
    python -W ignore -m momsolar.fetch_weather --home "$h" --out "$DATA" --if-older 55
  done
  # FusionSolar emails a month-to-date report every morning (~07:20), so from 07:00 check once an
  # hour; --latest exits 0 only when it saved a newer report, and only then do we re-import
  # (yesterday becomes complete; the importer skips the partial row for the day it was sent).
  if [ -f /pipeline/fetch_solar_report.py ] && [ "$(date +%H)" -ge 07 ] && [ "$(date +%M)" -lt 15 ]; then
    SOLAR_REPORT_DIR=/reports SOLAR_REPORT_LOG=/state/solar_report.log python -W ignore /pipeline/fetch_solar_report.py --latest \
      && python -W ignore -m momsolar.fetch_huawei --home mhuhome --raw /reports --out "$DATA"
  fi
  # Sleep to the next quarter hour (+2 min, so the inverter's 5-min upload is in).
  now=$(date +%s); next=$(( (now / 900 + 1) * 900 + 120 )); sleep $(( next - now ))
done
