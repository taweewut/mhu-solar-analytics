"""Generate the synthetic sample dataset in ``sample_data/`` (committed; real data is not).

Same layout and columns as the pipeline output, so the dashboard, API and tests run on a
fresh clone. The numbers are invented — seeded random days shaped like a Thai rooftop
system. Only the tariffs and ``ft_rates.csv`` (kept as is, not generated) are real; both are
public.

    .venv/bin/python scripts/make_sample_data.py
"""

from __future__ import annotations

import csv
import json
import math
import random
import shutil
from datetime import date, datetime, timedelta
from pathlib import Path

from momsolar.schema import (
    BILL_COLUMNS,
    BMS_COLUMNS,
    DAILY_COLUMNS,
    FIVE_MIN_COLUMNS,
    WEATHER_COLUMNS,
)

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "sample_data"

# Mean daily yield per kWp by month (Thailand: dry-season peak, monsoon dip).
YIELD = [4.1, 4.4, 4.7, 4.6, 4.1, 3.7, 3.6, 3.5, 3.5, 3.7, 3.9, 4.0]
# Extra household load by month (air conditioning in the hot season).
AIRCON = [2, 4, 8, 10, 9, 6, 5, 5, 4, 4, 3, 2]

TIERS = [[150, 3.2484], [250, 4.2218], [None, 4.4217]]
HOMES = [
    {
        "id": "momhome",
        "name": "MomHome",
        "subtitle": "Sample data · 7.44 kWp · 16 kWh",
        "subtitleShort": "Sample data · 7.44 kWp",
        "installed": "2026-03-29",
        "kwp": 7.44,
        "battery": {"kwh": 16, "label": "LiFePO4 16 kWh"},
        "inverter": {
            "brand": "Solis",
            "model": "S6-EH1P10K-L-PLUS",
            "sn": None,
            "ratedW": 10000,
        },
        "utility": "PEA",
        "tariff": {"service": 38.22, "tiers": TIERS, "touOn": None, "touOff": None},
        "exportRate": 0,
        "meterNetsExport": False,
        "systemCost": 250000,
        "systemCostPlaceholder": True,
        "dataGaps": [],
    },
    {
        "id": "mhuhome",
        "name": "MhuHome",
        "subtitle": "Sample data · Huawei · 5 kWp · no battery · MEA",
        "subtitleShort": "Huawei · 5 kWp · MEA",
        "installed": "2020-09-20",
        "kwp": 5,
        "battery": None,
        "inverter": {"brand": "Huawei", "model": None, "sn": None, "ratedW": None},
        "utility": "MEA",
        "tariff": {"service": 24.62, "tiers": TIERS, "touOn": 5.7982, "touOff": 2.6369},
        "exportRate": 0,
        "meterNetsExport": True,
        "systemCost": 200000,
        "systemCostPlaceholder": False,
        "dataGaps": [
            {
                "from": "2025-10-31",
                "to": "2026-02-15",
                "reason": "Inverter offline (no cloud connection)",
                "reasonTh": "อินเวอร์เตอร์ขาดการเชื่อมต่อคลาวด์",
            }
        ],
    },
]

TOU_FROM = date(2025, 3, 1)  # MhuHome: TOU meter, no export from here on
NET_METER_UNTIL = date(2024, 12, 31)  # MhuHome: meter nets exports until then


def days(start: date, end: date):
    d = start
    while d <= end:
        yield d
        d += timedelta(days=1)


def r2(x: float) -> float:
    return round(x, 2)


def pv_day(rng: random.Random, d: date, kwp: float) -> float:
    cloud = min(1.1, max(0.25, rng.gauss(0.95, 0.18)))
    return kwp * YIELD[d.month - 1] * cloud


def load_day(rng: random.Random, d: date, base: float) -> float:
    return max(6.0, rng.gauss(base + AIRCON[d.month - 1], 2.5))


def write(path: Path, columns: list[str], rows: list[dict]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", newline="", encoding="utf-8") as fh:
        w = csv.DictWriter(fh, columns)
        w.writeheader()
        for row in rows:
            w.writerow({c: row.get(c, "") for c in columns})


def bill_amount(units: float, service: float) -> float:
    energy, left, prev = 0.0, units, 0
    for cap, rate in TIERS:
        take = left if cap is None else min(left, cap - prev)
        energy += max(take, 0) * rate
        left -= max(take, 0)
        prev = cap or prev
    return round((energy + units * 0.1 + service) * 1.07, 2)


def tou_amount(on: float, off: float, service: float) -> float:
    return round((on * 5.7982 + off * 2.6369 + (on + off) * 0.1 + service) * 1.07, 2)


def month_end(y: int, m: int) -> date:
    return (date(y + m // 12, m % 12 + 1, 1)) - timedelta(days=1)


def mhuhome(rng: random.Random) -> tuple[list[dict], list[dict]]:
    daily, monthly = [], {}
    for d in days(date(2020, 9, 23), date(2026, 8, 31)):
        kwp_pv = pv_day(rng, d, 5)
        load = load_day(rng, d, 14)
        self_use = min(kwp_pv * rng.uniform(0.4, 0.6), load * 0.7)
        export = 0.0 if d >= TOU_FROM else kwp_pv - self_use
        pv = kwp_pv if d < TOU_FROM else self_use  # zero export curtails the rest
        imp = load - self_use
        units = max(imp - export, 0) if d <= NET_METER_UNTIL else imp
        m = monthly.setdefault((d.year, d.month), [0.0, 0.0])
        m[0] += units
        m[1] += imp * rng.uniform(0.2, 0.3)  # on-peak share of import
        if date(2025, 11, 1) <= d <= date(2026, 2, 15):
            continue  # inverter offline: no report rows
        daily.append(
            {
                "Time": d.isoformat(),
                "Today Yield(kWh)": r2(pv),
                "Energy to Grid(kWh)": r2(export),
                "Energy from Grid(kWh)": r2(imp),
                "Load Consumption(kWh)": r2(load),
                "Generation(kWh)": r2(pv),
            }
        )
    # Pre-solar bills (Apr–Aug 2020) give savings a baseline. Bills are dated the 8th of the
    # next month.
    for mo in range(4, 9):
        monthly[(2020, mo)] = [rng.uniform(700, 950), 0.0]
    bills = []
    for (y, mo), (units, on) in sorted(monthly.items()):
        units = round(units)
        bill_day = month_end(y, mo) + timedelta(days=8)
        row = {"Month Year": bill_day.isoformat(), "Year": y, "Usage Month": mo, "หน่วย": units}
        if date(y, mo, 1) >= TOU_FROM:
            on = round(on)
            off = units - on
            on_thb = round(on * 5.7982, 2)
            off_thb = round(off * 2.6369, 2)
            row |= {"On Peak unit": on, "Off Peak unit": off, "OnPeak": on_thb, "OffPeak": off_thb}
            row["จำนวนเงิน"] = tou_amount(on, off, 24.62)
        else:
            row["จำนวนเงิน"] = bill_amount(units, 24.62)
        bills.append(row)
    return daily, bills


def momhome_daily(rng: random.Random) -> tuple[list[dict], list[dict]]:
    daily, monthly = [], {(2026, 3): 28 * 15.0}  # March before switch-on: all from the grid
    for d in days(date(2026, 3, 29), date(2026, 9, 22)):
        avail = pv_day(rng, d, 7.44)
        load = load_day(rng, d, 20)
        direct = min(avail * 0.55, load * 0.55)
        charge = min(avail - direct, 15.0)
        discharge = charge * rng.uniform(0.9, 0.95)
        pv = direct + charge
        imp = max(load - direct - discharge, 0) + rng.uniform(1.5, 4)  # night top-up
        load = direct + discharge + imp
        export = rng.choice([0, 0, 0, 0.05])
        monthly[(d.year, d.month)] = monthly.get((d.year, d.month), 0.0) + imp
        daily.append(
            {
                "Time": d.isoformat(),
                "Today Yield(kWh)": r2(pv),
                "Energy to Grid(kWh)": export,
                "Energy from Grid(kWh)": r2(imp),
                "Energy to Battery(kWh)": r2(charge),
                "Energy from Battery(kWh)": r2(discharge),
                "Load Consumption(kWh)": r2(load),
                "Generation(kWh)": r2(pv),
                "GEN(kWh)": 0,
                "Smart Load(kWh)": 0,
                "AC Coupled(kWh)": 0,
            }
        )
    bills = [
        {
            "Month Year": month_end(y, m).isoformat(),
            "Year": y,
            "Usage Month": m,
            "หน่วย": round(units),
            "จำนวนเงิน": bill_amount(round(units), 38.22),
        }
        for (y, m), units in sorted(monthly.items())
        if (y, m) < (2026, 9)
    ]
    return daily, bills


def momhome_five_min(rng: random.Random) -> list[dict]:
    """2026-09-23 from midnight to 12:17 — a morning of "today" as the live view sees it."""
    rows, soc = [], 62.0
    tot = {"yield": 0.0, "chg": 0.0, "dis": 0.0, "imp": 0.0, "load": 0.0}
    t = datetime(2026, 9, 23, 0, 2, 0)
    while t <= datetime(2026, 9, 23, 12, 17, 0):
        h = t.hour + t.minute / 60
        sun = max(0.0, math.sin(math.pi * (h - 6.2) / 12.4))
        pv = round(6200 * sun**1.4 * rng.uniform(0.85, 1.0)) if sun else 0
        load = round(rng.uniform(300, 450) + (1200 if rng.random() < 0.12 else 0))
        batt = pv - load  # + charging, - discharging
        if batt < 0 and soc <= 20:
            batt = 0
        batt = max(min(batt, 5000), -5000)
        grid = pv - load - batt  # negative: importing
        soc = min(100.0, max(20.0, soc + batt * (5 / 60) / 16000 * 100))
        hours = 5 / 60
        tot["yield"] += pv * hours / 1000
        tot["chg"] += max(batt, 0) * hours / 1000
        tot["dis"] += max(-batt, 0) * hours / 1000
        tot["imp"] += max(-grid, 0) * hours / 1000
        tot["load"] += load * hours / 1000
        rows.append(
            {
                "Time": t.strftime("%Y-%m-%d %H:%M:%S"),
                "Working State": "Normal",
                "Alarm Code": "",
                "PV(W)": pv,
                "MPPT1(W)": round(pv * 0.55),
                "MPPT2(W)": pv - round(pv * 0.55),
                "MPPT1(V)": round(380 * sun + 22, 1) if pv else 22.1,
                "MPPT2(V)": round(370 * sun + 22, 1) if pv else 22.0,
                "Battery(W)": batt,
                "Grid(W)": grid,
                "Grid Load(W)": 0,
                "Backup Load(W)": load,
                "SOC(%)": round(soc),
                "SOH(%)": 99,
                "Temp(C)": round(38 + 14 * sun + rng.uniform(-1, 1), 1),
                "GEN(W)": 0,
                "Smart(W)": 0,
                "AC Coupled(W)": 0,
                "Today Yield(kWh)": round(tot["yield"], 1),
                "Today Energy to Battery(kWh)": round(tot["chg"], 1),
                "Today Energy from Battery(kWh)": round(tot["dis"], 1),
                "Today Energy from Grid(kWh)": round(tot["imp"], 1),
                "Today Grid Load(kWh)": 0,
                "Today Backup Load(kWh)": round(tot["load"], 1),
                "Total Grid Load(kWh)": 210,
                "Total Backup Load(kWh)": round(3400 + tot["load"]),
            }
        )
        t += timedelta(minutes=5)
    return rows


def momhome_bms(rng: random.Random, five_min: list[dict]) -> list[dict]:
    """A BMS sample every 15 min (the scheduled fetch), riding the 5-min SOC."""
    rows = []
    for r in five_min[::3]:
        h = int(r["Time"][11:13]) + int(r["Time"][14:16]) / 60
        warm = 29 + 4 * max(0.0, math.sin(math.pi * (h - 8) / 12)) + rng.uniform(-0.3, 0.3)
        cell = 3.20 + 0.0012 * float(r["SOC(%)"]) + rng.uniform(-0.004, 0.004)
        rows.append(
            {
                "Time": r["Time"],
                "Battery Temp Min(C)": round(warm - 1),
                "Battery Temp Max(C)": round(warm),
                "Cell Min(V)": round(cell - 0.003, 3),
                "Cell Max(V)": round(cell + 0.003, 3),
                "SOC(%)": r["SOC(%)"],
            }
        )
    return rows


def momhome_weather(rng: random.Random) -> list[dict]:
    """Invented hourly weather for 22–23/09 (a clear morning, afternoon showers)."""
    rows = []
    for day in ("2026-09-22", "2026-09-23"):
        for h in range(24):
            sun = max(0.0, math.sin(math.pi * (h + 0.5 - 6.2) / 12.4))
            code = 61 if 14 <= h <= 16 else 3 if 11 <= h <= 13 else 2 if 8 <= h <= 10 else 1
            rows.append(
                {
                    "Time": f"{day} {h:02d}:00",
                    "Code": code,
                    "Cloud(%)": {1: 15, 2: 45, 3: 95, 61: 100}[code],
                    "Rain(mm)": round(rng.uniform(0.5, 3), 1) if code == 61 else 0,
                    "Radiation(W/m2)": round(900 * sun * {1: 1, 2: 0.8, 3: 0.4, 61: 0.2}[code]),
                }
            )
    return rows


def main() -> None:
    rng = random.Random(2026)
    for home in HOMES:
        shutil.rmtree(OUT / home["id"], ignore_errors=True)
    (OUT / "homes.json").write_text(json.dumps(HOMES, ensure_ascii=False, indent=2) + "\n")

    daily, bills = momhome_daily(rng)
    write(OUT / "momhome" / "daily.csv", DAILY_COLUMNS, daily)
    write(OUT / "momhome" / "bills.csv", BILL_COLUMNS, bills)
    five = momhome_five_min(rng)
    write(OUT / "momhome" / "5min.csv", FIVE_MIN_COLUMNS, five)
    write(OUT / "momhome" / "bms.csv", BMS_COLUMNS, momhome_bms(random.Random(7), five))
    write(OUT / "momhome" / "weather.csv", WEATHER_COLUMNS, momhome_weather(random.Random(11)))

    daily, bills = mhuhome(rng)
    write(OUT / "mhuhome" / "daily.csv", DAILY_COLUMNS, daily)
    write(OUT / "mhuhome" / "bills.csv", BILL_COLUMNS, bills)
    write(OUT / "mhuhome" / "5min.csv", FIVE_MIN_COLUMNS, [])
    print(f"wrote {OUT.relative_to(ROOT)}/")


if __name__ == "__main__":
    main()
