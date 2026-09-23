#!/bin/bash
# Re-import every home's raw exports into frontend/public/data. Idempotent: safe to run any
# time, e.g. after solar_pipeline saves a new Huawei report or you drop a Solis export in.
#
# Folders come from .env (copy .env.example): MOMSOLAR_SOLIS_RAW_DIR, MOMSOLAR_HUAWEI_RAW_DIR
# and, optionally, MOMSOLAR_SHEET (the Google Sheet as .xlsx, for PEA/MEA bills and Ft).
# A home whose folder isn't set is skipped.
#
#   scripts/refresh_all.sh                               # inverter data (+ bills if MOMSOLAR_SHEET)
#   MOMSOLAR_SHEET=~/Downloads/PEA.xlsx scripts/refresh_all.sh
set -euo pipefail
DIR="$(cd "$(dirname "$0")/.." && pwd)"
if [[ -f "$DIR/.env" ]]; then
  # Variables already set in the shell win over .env.
  while IFS= read -r line; do
    [[ "$line" =~ ^[[:space:]]*(#|$) ]] && continue
    key="${line%%=*}"
    [[ -n "${!key:-}" ]] && continue
    eval "export $line"
  done < "$DIR/.env"
fi
OUT="${MOMSOLAR_DATA_DIR:-frontend/public/data}"
[[ "$OUT" = /* ]] || OUT="$DIR/$OUT"
PY="$DIR/.venv/bin/python"
export PYTHONPATH="$DIR/src"
SHEET="${MOMSOLAR_SHEET:-}"

if [[ -n "${MOMSOLAR_SOLIS_RAW_DIR:-}" ]]; then
  echo "== MomHome (Solis)"
  "$PY" -W ignore -m momsolar.fetch_solis_day --home momhome --out "$OUT" \
    --raw "$MOMSOLAR_SOLIS_RAW_DIR" ${SHEET:+--pea-log "$SHEET"}
else
  echo "== MomHome: MOMSOLAR_SOLIS_RAW_DIR not set, skipped"
fi

if [[ -n "${MOMSOLAR_HUAWEI_RAW_DIR:-}" ]]; then
  echo "== MhuHome (Huawei)"
  "$PY" -W ignore -m momsolar.fetch_huawei --home mhuhome --out "$OUT" \
    --raw "$MOMSOLAR_HUAWEI_RAW_DIR" ${SHEET:+--mea-log "$SHEET"}
else
  echo "== MhuHome: MOMSOLAR_HUAWEI_RAW_DIR not set, skipped"
fi
