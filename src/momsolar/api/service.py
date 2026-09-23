"""Read the processed data folder into API rows.

The CSVs are the single store (no database): the pipeline scripts write them, the static
frontend fetches them directly, and this module serves the same data as JSON, per home.
"""

from __future__ import annotations

import csv
import json
from pathlib import Path

from momsolar.schema import (
    BILLS_FILE,
    BMS_FILE,
    DAILY_FILE,
    FIVE_MIN_FILE,
    FT_COLUMNS,
    FT_FILE,
    HOMES_FILE,
)

# CSV header → API field, in schema order.
FIVE_MIN_FIELDS = {
    "Time": "time",
    "Working State": "working_state",
    "Alarm Code": "alarm_code",
    "PV(W)": "pv_w",
    "MPPT1(W)": "mppt1_w",
    "MPPT2(W)": "mppt2_w",
    "MPPT1(V)": "mppt1_v",
    "MPPT2(V)": "mppt2_v",
    "Battery(W)": "battery_w",
    "Grid(W)": "grid_w",
    "Grid Load(W)": "grid_load_w",
    "Backup Load(W)": "backup_load_w",
    "SOC(%)": "soc_pct",
    "SOH(%)": "soh_pct",
    "Temp(C)": "temp_c",
    "GEN(W)": "gen_w",
    "Smart(W)": "smart_w",
    "AC Coupled(W)": "ac_coupled_w",
    "Today Yield(kWh)": "today_yield_kwh",
    "Today Energy to Battery(kWh)": "today_to_battery_kwh",
    "Today Energy from Battery(kWh)": "today_from_battery_kwh",
    "Today Energy from Grid(kWh)": "today_from_grid_kwh",
    "Today Grid Load(kWh)": "today_grid_load_kwh",
    "Today Backup Load(kWh)": "today_backup_load_kwh",
    "Total Grid Load(kWh)": "total_grid_load_kwh",
    "Total Backup Load(kWh)": "total_backup_load_kwh",
}
DAILY_FIELDS = {
    "Time": "date",
    "Today Yield(kWh)": "yield_kwh",
    "Energy to Grid(kWh)": "to_grid_kwh",
    "Energy from Grid(kWh)": "from_grid_kwh",
    "Energy to Battery(kWh)": "to_battery_kwh",
    "Energy from Battery(kWh)": "from_battery_kwh",
    "Load Consumption(kWh)": "load_kwh",
    "Generation(kWh)": "generation_kwh",
    "GEN(kWh)": "gen_kwh",
    "Smart Load(kWh)": "smart_load_kwh",
    "AC Coupled(kWh)": "ac_coupled_kwh",
}
BILL_FIELDS = {
    "Month Year": "bill_date",
    "Year": "year",
    "Usage Month": "month",
    "On Peak unit": "on_peak_units",
    "Off Peak unit": "off_peak_units",
    "หน่วย": "units",
    "OnPeak": "on_peak_thb",
    "OffPeak": "off_peak_thb",
    "จำนวนเงิน": "amount_thb",
}
BMS_FIELDS = {
    "Time": "time",
    "Battery Temp Min(C)": "temp_min_c",
    "Battery Temp Max(C)": "temp_max_c",
    "Cell Min(V)": "cell_min_v",
    "Cell Max(V)": "cell_max_v",
    "SOC(%)": "soc_pct",
}
TEXT_FIELDS = {"time", "working_state", "alarm_code", "date", "bill_date"}


def _value(field: str, raw: str | None):
    if field in TEXT_FIELDS:
        return raw or ""
    if raw is None or raw.strip() == "":
        return None
    return float(raw)


def _read(path: Path, fields: dict[str, str]) -> list[dict]:
    if not path.exists():
        return []
    with path.open(encoding="utf-8", newline="") as f:
        return [
            {api: _value(api, r.get(col)) for col, api in fields.items()} for r in csv.DictReader(f)
        ]


def homes(data_dir: Path) -> list[dict]:
    path = data_dir / HOMES_FILE
    return json.loads(path.read_text(encoding="utf-8")) if path.exists() else []


def home_dir(data_dir: Path, home: str) -> Path | None:
    """The home's folder, or None if ``home`` isn't in homes.json (guards the path too)."""
    return data_dir / home if any(h["id"] == home for h in homes(data_dir)) else None


def five_min(home_path: Path, day: str | None = None) -> list[dict]:
    rows = _read(home_path / FIVE_MIN_FILE, FIVE_MIN_FIELDS)
    return [r for r in rows if r["time"].startswith(day)] if day else rows


def bms(home_path: Path, day: str | None = None) -> list[dict]:
    rows = _read(home_path / BMS_FILE, BMS_FIELDS)
    return [r for r in rows if r["time"].startswith(day)] if day else rows


def daily(home_path: Path) -> list[dict]:
    return _read(home_path / DAILY_FILE, DAILY_FIELDS)


def bills(home_path: Path) -> list[dict]:
    rows = _read(home_path / BILLS_FILE, BILL_FIELDS)
    for r in rows:
        r["year"], r["month"] = int(r["year"]), int(r["month"])
    return rows


def ft_rates(data_dir: Path) -> list[dict]:
    rows = _read(data_dir / FT_FILE, {c: c for c in FT_COLUMNS})
    return [{k: (v if k == "ft_rate" else int(v)) for k, v in r.items()} for r in rows]


def freshness(home_path: Path) -> dict:
    five = five_min(home_path)
    days, bs = daily(home_path), bills(home_path)
    return {
        "home": home_path.name,
        "latest_reading": five[-1]["time"] if five else None,
        "latest_day": days[-1]["date"] if days else None,
        "last_bill": bs[-1]["bill_date"] if bs else None,
        "dates": sorted({r["time"][:10] for r in five}),
    }
