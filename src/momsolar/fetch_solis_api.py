"""Fetch a Solis home's 5-min and daily data from the SolisCloud API into its CSVs.

Same output as :mod:`momsolar.fetch_solis_day` (the Excel exports), and merged the same
way: a fetched day replaces that day's 5-min rows, daily rows replace by date. So the API
and the exports can be mixed freely.

Field mapping, checked against the Excel exports for the same readings (all equal):

* 5-min (``/v1/api/inverterDay``): ``timeStr`` is the export's local Time; power is in W
  with Solis's signs (``batteryPower`` − = discharging, ``pSum`` − = importing).
  MPPT power isn't sent, so it's ``uPv × iPv`` (V × A); PV(W) = MPPT1 + MPPT2 as for the
  exports.
* Daily (``/v1/api/inverterMonth``): one record per day, energy in ``energyStr`` units.

What the API doesn't send is left blank (missing, never 0): Alarm Code, GEN/Smart/AC
Coupled power, the lifetime load counters and daily Smart Load. The day's load counter
is a total (``homeLoadTodayEnergy``): Today Grid Load is integrated from the grid-port
load power (``familyLoadPower``) and Today Backup Load is the rest, so the total stays
Solis's own.

Calls are budgeted (see :mod:`momsolar.solis_api`), so a default run is incremental:
today's 5-min readings (1 call), plus yesterday and its month's daily rows only while
yesterday is incomplete in 5min.csv / daily.csv. If the budget runs out mid-backfill, the
days fetched so far are still written; re-run later (e.g. the next day) to continue.

A routine run also logs one battery BMS sample (temperature min/max, cell voltage min/max)
from ``inverterDetail`` into ``bms.csv``: that's a live snapshot with no history, so it's
collected from now on by the scheduled fetch (scripts/solis_poll.sh, every 15 min).

Usage::

    python -m momsolar.fetch_solis_api --home momhome              # incremental (today) + BMS
    python -m momsolar.fetch_solis_api --since 2026-03-29          # every day since then
"""

from __future__ import annotations

import argparse
import json
import sys
from datetime import date, datetime, timedelta
from pathlib import Path
from typing import Any

from momsolar.fetch_solis_day import replace_days
from momsolar.schema import (
    BMS_COLUMNS,
    BMS_FILE,
    DAILY_COLUMNS,
    DAILY_FILE,
    FIVE_MIN_COLUMNS,
    FIVE_MIN_FILE,
    HOMES_FILE,
    STATUS_FILE,
)
from momsolar.sheets import fmt_num, merge, read_csv, write_csv
from momsolar.solis_api import (
    ROOT,
    QuotaExceeded,
    SolisApiError,
    SolisClient,
    records_of,
    resumes_at,
)

DEFAULT_HOME = "momhome"
STATES = {1: "Normal", 2: "Offline", 3: "Alarm"}
MAX_GAP_MIN = 15  # don't integrate power across a longer gap (same rule as the frontend)


def _f(v: Any) -> float | None:
    try:
        return None if v is None or v == "" else float(v)
    except (TypeError, ValueError):
        return None


def _w(v: float | None) -> str:
    return fmt_num(None if v is None else round(v))


def _mppt(rec: dict, i: int) -> float | None:
    u, a = _f(rec.get(f"uPv{i}")), _f(rec.get(f"iPv{i}"))
    return None if u is None or a is None else u * a


def five_min_from_api(records: list[dict]) -> list[dict[str, str]]:
    """``inverterDay`` records (one day) → 5min.csv rows, oldest first."""
    by_time: dict[str, dict] = {}
    for rec in records:
        if rec.get("timeStr"):
            by_time[rec["timeStr"]] = rec  # keep one reading per timestamp
    rows, grid_load_kwh, prev = [], 0.0, None
    for t in sorted(by_time):
        rec = by_time[t]
        now = datetime.strptime(t, "%Y-%m-%d %H:%M:%S")
        gl = _f(rec.get("familyLoadPower"))
        if prev is not None and gl is not None:
            minutes = min((now - prev).total_seconds() / 60, MAX_GAP_MIN)
            grid_load_kwh += max(gl, 0) * minutes / 60 / 1000
        prev = now
        home_kwh = _f(rec.get("homeLoadTodayEnergy"))
        m1, m2 = _mppt(rec, 1), _mppt(rec, 2)
        pv = None if m1 is None and m2 is None else round(m1 or 0) + round(m2 or 0)
        state = rec.get("state")
        rows.append(
            {
                "Time": t,
                "Working State": STATES.get(state, "" if state is None else str(state)),
                "Alarm Code": "",
                "PV(W)": fmt_num(pv),
                "MPPT1(W)": _w(m1),
                "MPPT2(W)": _w(m2),
                "MPPT1(V)": fmt_num(_f(rec.get("uPv1"))),
                "MPPT2(V)": fmt_num(_f(rec.get("uPv2"))),
                "Battery(W)": _w(_f(rec.get("batteryPower"))),
                "Grid(W)": _w(_f(rec.get("pSum"))),
                "Grid Load(W)": _w(gl),
                "Backup Load(W)": _w(_f(rec.get("bypassLoadPower"))),
                "SOC(%)": fmt_num(_f(rec.get("batteryCapacitySoc"))),
                "SOH(%)": fmt_num(_f(rec.get("batteryHealthSoh"))),
                "Temp(C)": fmt_num(_f(rec.get("inverterTemperature"))),
                "Today Yield(kWh)": fmt_num(_f(rec.get("eToday"))),
                "Today Energy to Battery(kWh)": fmt_num(_f(rec.get("batteryTodayChargeEnergy"))),
                "Today Energy from Battery(kWh)": fmt_num(
                    _f(rec.get("batteryTodayDischargeEnergy"))
                ),
                "Today Energy from Grid(kWh)": fmt_num(_f(rec.get("gridPurchasedTodayEnergy"))),
                "Today Grid Load(kWh)": fmt_num(round(grid_load_kwh, 1)),
                "Today Backup Load(kWh)": fmt_num(
                    None if home_kwh is None else round(max(home_kwh - grid_load_kwh, 0), 1)
                ),
            }
        )
    return rows


DAILY_SOURCE = {
    "Energy to Grid(kWh)": "gridSellEnergy",
    "Energy from Grid(kWh)": "gridPurchasedEnergy",
    "Energy to Battery(kWh)": "batteryChargeEnergy",
    "Energy from Battery(kWh)": "batteryDischargeEnergy",
    "Load Consumption(kWh)": "homeLoadEnergy",
    "Generation(kWh)": "produceEnergy",
    "GEN(kWh)": "generatorEnergy",
    "AC Coupled(kWh)": "acCoupledEnergy",
}
UNIT = {"Wh": 0.001, "kWh": 1.0, "MWh": 1000.0, "GWh": 1e6}


def daily_from_api(records: list[dict]) -> list[dict[str, str]]:
    """``inverterMonth`` records → daily.csv rows."""
    out = []
    for rec in records:
        if not rec.get("dateStr"):
            continue
        energy = _f(rec.get("energy"))
        scale = UNIT.get(rec.get("energyStr") or "kWh", 1.0)
        row = {"Time": rec["dateStr"][:10]}
        row["Today Yield(kWh)"] = fmt_num(None if energy is None else round(energy * scale, 2))
        for col, src in DAILY_SOURCE.items():
            row[col] = fmt_num(_f(rec.get(src)))
        out.append(row)
    return sorted(out, key=lambda r: r["Time"])


def bms_row(detail: dict) -> dict[str, str] | None:
    """One BMS sample from ``inverterDetail``: coolest/warmest sensor and lowest/highest cell
    across the battery packs. A BMS that isn't reporting sends 0s: those stay blank."""
    packs = [b for b in detail.get("batteryList") or [] if isinstance(b, dict)]
    t = detail.get("timeStr")
    if not packs or not t:
        return None

    def pick(key: str, agg) -> str:
        vals = [v for b in packs if (v := _f(b.get(key)))]  # 0 = not reported
        return fmt_num(agg(vals)) if vals else ""

    row = {
        "Time": t,
        "Battery Temp Min(C)": pick("bmsMinTemp", min),
        "Battery Temp Max(C)": pick("bmsMaxTemp", max),
        "Cell Min(V)": pick("bmsMinU", min),
        "Cell Max(V)": pick("bmsMaxU", max),
        "SOC(%)": fmt_num(_f(detail.get("batteryCapacitySoc"))),
    }
    return row if any(row[c] for c in BMS_COLUMNS[1:5]) else None


def home_sn(data: Path, home: str) -> str | None:
    """The inverter serial from homes.json (git-ignored, so it stays private)."""
    path = data / HOMES_FILE
    if not path.exists():
        return None
    for h in json.loads(path.read_text(encoding="utf-8")):
        if h.get("id") == home:
            return (h.get("inverter") or {}).get("sn")
    return None


def months_of(days: list[str]) -> list[str]:
    return sorted({d[:7] for d in days})


COMPLETE_FROM = "23:50"  # a day whose 5-min data reaches this is complete


def incremental_plan(home_dir: Path, today: date) -> tuple[list[str], list[str]]:
    """(days for 5-min, months for daily rows) a routine refresh needs: today's readings,
    plus yesterday's 5-min data and/or its daily row only while they're still missing."""
    y = (today - timedelta(days=1)).isoformat()
    last_y = max(
        (r["Time"] for r in read_csv(home_dir / FIVE_MIN_FILE) if r["Time"][:10] == y),
        default="",
    )
    y_done = last_y[11:16] >= COMPLETE_FROM
    has_daily = any(r["Time"] == y for r in read_csv(home_dir / DAILY_FILE))
    days = [today.isoformat()] if y_done else [y, today.isoformat()]
    return days, [] if y_done and has_daily else [y[:7]]


def run(
    client: SolisClient,
    out: Path,
    days: list[str],
    home: str = DEFAULT_HOME,
    sn: str | None = None,
    log=print,
    months: list[str] | None = None,
    today: str | None = None,
    bms: bool = False,
) -> dict[str, int]:
    """Fetch ``days`` (5-min) and ``months`` (daily rows; default: the months of the days
    fetched). Only completed days' daily rows are written — today's would be partial.
    ``bms`` also logs one battery BMS sample (a live snapshot, so only for "now").
    Returns rows written per file."""
    sn = sn or home_sn(out, home)
    if not sn:
        inverters = records_of(client.inverters())
        if len(inverters) != 1:
            raise SolisApiError(f"set inverter.sn for {home} in homes.json or pass --sn")
        sn = inverters[0]["sn"]
    home_dir = out / home
    counts: dict[str, int] = {}
    today = today or date.today().isoformat()

    new5: list[dict] = []
    fetched: list[str] = []
    stopped: QuotaExceeded | None = None
    for d in days:
        try:
            rows = five_min_from_api(client.inverter_day(sn, d) or [])
        except QuotaExceeded as e:
            stopped = e
            break
        log(f"5-min  {d}: {len(rows)} rows")
        new5 += rows
        fetched.append(d)
    if new5:
        rows5 = replace_days(read_csv(home_dir / FIVE_MIN_FILE), new5)
        write_csv(home_dir / FIVE_MIN_FILE, FIVE_MIN_COLUMNS, rows5)
        counts[f"{home}/{FIVE_MIN_FILE}"] = len(rows5)

    wanted = months_of([d for d in fetched if d < today]) if months is None else months
    newd: list[dict] = []
    for m in [] if stopped else wanted:
        try:
            rows = [
                r for r in daily_from_api(client.inverter_month(sn, m) or []) if r["Time"] < today
            ]
        except QuotaExceeded as e:
            stopped = e
            break
        log(f"daily  {m}: {len(rows)} days")
        newd += rows
    if newd:
        rowsd = merge(read_csv(home_dir / DAILY_FILE), newd, key=lambda r: r["Time"])
        write_csv(home_dir / DAILY_FILE, DAILY_COLUMNS, rowsd)
        counts[f"{home}/{DAILY_FILE}"] = len(rowsd)
    paused = stopped  # the 5-min / daily fetch hit the budget (shown in the dashboard)
    if bms:  # its own endpoint and budget: sample even if the 5-min fetch stopped
        try:
            row = bms_row(client.inverter_detail(sn) or {})
        except QuotaExceeded as e:
            stopped, row = stopped or e, None
        if row:
            rows_b = merge(read_csv(home_dir / BMS_FILE), [row], key=lambda r: r["Time"])
            write_csv(home_dir / BMS_FILE, BMS_COLUMNS, rows_b)
            counts[f"{home}/{BMS_FILE}"] = len(rows_b)
            lo, hi = row["Battery Temp Min(C)"], row["Battery Temp Max(C)"]
            log(f"bms    {row['Time']}: battery {lo}–{hi} °C")
    write_status(home_dir, paused)
    if stopped:
        log(f"stopped: {stopped}")
        left = [d for d in days if d not in fetched]
        if left:
            log(f"not fetched: {left[0]} … {left[-1]} ({len(left)} days); re-run later")
    return counts


def write_status(home_dir: Path, paused: QuotaExceeded | None) -> None:
    """Record this run for the dashboard header: when it ran, the newest 5-min reading, and
    whether the daily budget paused the 5-min fetch (and until when)."""
    latest = max((r["Time"] for r in read_csv(home_dir / FIVE_MIN_FILE)), default=None)
    status = {
        "checked": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        "latest": latest,
        "paused": {"reason": "daily API limit", "detail": str(paused), "until": resumes_at()}
        if paused
        else None,
    }
    home_dir.mkdir(parents=True, exist_ok=True)
    (home_dir / STATUS_FILE).write_text(json.dumps(status, indent=2) + "\n", encoding="utf-8")


def day_range(since: str, until: date) -> list[str]:
    d, out = date.fromisoformat(since), []
    while d <= until:
        out.append(d.isoformat())
        d += timedelta(days=1)
    return out


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("--home", default=DEFAULT_HOME, help="home id in homes.json")
    ap.add_argument("--out", type=Path, default=ROOT / "frontend" / "public" / "data")
    ap.add_argument("--sn", help="inverter serial (default: homes.json inverter.sn)")
    ap.add_argument(
        "--no-bms", action="store_true", help="skip the battery BMS sample (default run only)"
    )
    when = ap.add_mutually_exclusive_group()
    when.add_argument("--date", action="append", help="YYYY-MM-DD (repeatable)")
    when.add_argument("--since", help="every day from YYYY-MM-DD to today")
    args = ap.parse_args(argv)

    today = date.today()
    months, bms = None, False
    if args.since:
        days = day_range(args.since, today)
    elif args.date:
        days = args.date
    else:
        days, months = incremental_plan(args.out / args.home, today)
        bms = not args.no_bms  # a live snapshot: only on the routine (now) run
    try:
        client = SolisClient.from_env()
        counts = run(client, args.out, days, args.home, args.sn, months=months, bms=bms)
    except SolisApiError as e:
        print(f"error: {e}", file=sys.stderr)
        return 1
    for name, n in counts.items():
        print(f"wrote {args.out / name} ({n} rows)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
