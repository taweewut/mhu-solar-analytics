"""Turn SolisCloud exports + the PEA Log sheet into a home's processed CSVs.

Inputs (every .xls/.xlsx in the ``--raw`` folder(s), recognised by their header row, not
their file name — SolisCloud reuses "Inverter History Report_…" for different exports):

* Inverter "All History", 5-min, ~80 cols (``Inverter_Report_<SN>_DD-MM-YYYY_<ts>.xlsx``).
  One day or several. The header is the row holding ``Time`` + ``Battery SOC(%)``.
* The monthly inverter report, one row per day (``Inverter_Report_YYYY-MM_Report.xls``,
  or the current month as ``Inverter History Report_<ts>.xls``).
* Anything else (plant reports, the PEA workbook…) is skipped.
* PEA Log — a CSV or .xlsx download of the Google Sheet (File → Download), or its
  CSV-export URL if the sheet is link-shared. An .xlsx of the whole workbook also yields
  the Ft history table (``year, month, type, type_name, ft_rate``).

Outputs: ``<out>/<home>/5min.csv``, ``daily.csv``, ``bills.csv`` and the shared
``<out>/ft_rates.csv``, in the layout of :mod:`momsolar.schema`. Existing rows are kept and
re-exported rows replace them by key, so a daily run only needs the newest export.

Usage::

    python -m momsolar.fetch_solis_day --home momhome \\
        --raw "<OneDrive>/Solar Energy/MomHome" --pea-log ~/Downloads/PEA.xlsx

When the SolisCloud API (ticket #1061839) is approved, a fetcher that returns rows with
the same source headers can feed :func:`five_min_rows` / :func:`daily_rows` unchanged.
"""

from __future__ import annotations

import argparse
import re
import sys
from collections.abc import Iterable
from datetime import datetime
from pathlib import Path

from momsolar.bills import PEA_LOG, ft_rows, import_log, write_ft
from momsolar.schema import DAILY_COLUMNS, DAILY_FILE, FIVE_MIN_COLUMNS, FIVE_MIN_FILE
from momsolar.sheets import (
    Row,
    find_header,
    fmt_num,
    merge,
    num,
    parse_date,
    read_csv,
    read_sheets,
    records,
    workbooks,
    write_csv,
)

DEFAULT_HOME = "momhome"

# Output column → source header in the inverter All-History export. PV(W) is derived.
FIVE_MIN_SOURCE = {
    "Working State": "Working State",
    "Alarm Code": "Alarm Code",
    "MPPT1(W)": "DC Power PvMPPT1(W)",
    "MPPT2(W)": "DC Power PvMPPT2(W)",
    "MPPT1(V)": "DC Voltage PvMPPT1(V)",
    "MPPT2(V)": "DC Voltage PvMPPT2(V)",
    "Battery(W)": "Battery Power(W)",
    "Grid(W)": "Grid Total Active Power(W)",
    "Grid Load(W)": "Grid load power(W)",
    "Backup Load(W)": "Backup Active Power L1(W)",
    "SOC(%)": "Battery SOC(%)",
    "SOH(%)": "Battery SOH(%)",
    "Temp(C)": "Inverter Internal Operating Ambient Temperature(℃)",
    "GEN(W)": "Gen active power L1(W)",
    "Smart(W)": "Smart Port active power L1(W)",
    "AC Coupled(W)": "Smart Port AC Coupled Input Power(W)",
    "Today Yield(kWh)": "Today Yield(kWh)",
    "Today Energy to Battery(kWh)": "Today Energy to Battery(kWh)",
    "Today Energy from Battery(kWh)": "Today Energy from Battery(kWh)",
    "Today Energy from Grid(kWh)": "Daily Energy from Grid(kWh)",
    "Today Grid Load(kWh)": "Today Grid Load Consumption(kWh)",
    "Today Backup Load(kWh)": "Today Backup Load Consumption(kWh)",
    "Total Grid Load(kWh)": "Total Grid Load Consumption(kWh)",
    "Total Backup Load(kWh)": "Total Backup Load Consumption(kWh)",
}

TEXT_COLUMNS = {"Working State", "Alarm Code"}

# The current All-History layout has grid power and per-port load counters; the early
# (Mar/Apr 2026) 54-column layout doesn't, and converting it would leave those blank.
CURRENT_5MIN_MARKER = "Grid Total Active Power(W)"

_SOLIS_TIME = re.compile(r"(\d{1,2})/(\d{1,2})/(\d{4})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?")


def parse_solis_time(s: str) -> datetime:
    """``23/09/2026 00:03:36 (UTC+07:00)`` → naive local datetime."""
    m = _SOLIS_TIME.search(s)
    if not m:
        raise ValueError(f"unrecognised Solis time: {s!r}")
    d, mo, y, hh, mm, ss = m.groups()
    return datetime(int(y), int(mo), int(d), int(hh), int(mm), int(ss or 0))


# ── Solis exports → rows ────────────────────────────────────────────────────
def classify(sheets: dict[str, list[Row]]) -> tuple[str, list[Row], int] | None:
    """What a workbook is: ``("5min" | "5min-old" | "daily", rows, header index)`` or None."""
    for rows in sheets.values():
        at = find_header(rows, "Time", "Battery SOC(%)")
        if at is not None:
            return ("5min" if CURRENT_5MIN_MARKER in rows[at] else "5min-old", rows, at)
        at = find_header(rows, "Time", "Today Yield(kWh)", "Load Consumption(kWh)")
        if at is not None:
            return ("daily", rows, at)
    return None  # e.g. the power-only second sheet, plant reports, the PEA workbook


def _five_min_from(rows: list[Row], at: int) -> list[dict[str, str]]:
    by_time: dict[str, dict[str, str]] = {}
    for rec in records(rows, at):
        if not rec.get("Time"):
            continue
        row = {"Time": parse_solis_time(rec["Time"]).strftime("%Y-%m-%d %H:%M:%S")}
        for col, src in FIVE_MIN_SOURCE.items():
            raw = rec.get(src, "")
            row[col] = raw.strip() if col in TEXT_COLUMNS else fmt_num(num(raw))
        pv = (num(rec.get(FIVE_MIN_SOURCE["MPPT1(W)"])) or 0) + (
            num(rec.get(FIVE_MIN_SOURCE["MPPT2(W)"])) or 0
        )
        row["PV(W)"] = fmt_num(pv)
        by_time[row["Time"]] = row  # Solis sometimes repeats a reading; keep one
    return [by_time[t] for t in sorted(by_time)]


def _daily_from(rows: list[Row], at: int) -> list[dict[str, str]]:
    out = []
    for rec in records(rows, at):
        if not rec.get("Time"):
            continue
        row = {"Time": parse_date(rec["Time"]).isoformat()}
        for col in DAILY_COLUMNS[1:]:
            row[col] = fmt_num(num(rec.get(col)))
        out.append(row)
    return out


def five_min_rows(path: Path) -> list[dict[str, str]]:
    """5-min rows from an Inverter All-History export (one or several days)."""
    kind = classify(read_sheets(path))
    if kind is None or kind[0] == "daily":
        raise ValueError(f"no All-History sheet (Time + Battery SOC(%)) in {path.name}")
    if kind[0] == "5min-old":
        raise ValueError(f"{path.name} uses the early export layout (no {CURRENT_5MIN_MARKER})")
    return _five_min_from(kind[1], kind[2])


def daily_rows(path: Path) -> list[dict[str, str]]:
    """Daily rows from an inverter monthly report."""
    kind = classify(read_sheets(path))
    if kind is None or kind[0] != "daily":
        raise ValueError(f"no daily report table in {path.name}")
    return _daily_from(kind[1], kind[2])


def replace_days(existing: list[dict], new: list[dict]) -> list[dict]:
    """5-min merge: a re-exported day replaces that whole day (timestamps shift per export)."""
    days = {r["Time"][:10] for r in new}
    kept = [r for r in existing if r["Time"][:10] not in days]
    return sorted(kept + new, key=lambda r: r["Time"])


# ── Entry point ─────────────────────────────────────────────────────────────
def run(
    raw: Path | Iterable[Path] | None,
    out: Path,
    pea_log: str | None = None,
    ft: Path | None = None,
    only_date: str | None = None,
    log=print,
    home: str = DEFAULT_HOME,
) -> dict[str, int]:
    """Convert everything available; returns the row count written per file."""
    counts: dict[str, int] = {}
    home_dir = out / home
    if raw is not None:
        raws = [raw] if isinstance(raw, Path) else list(raw)
        rows5: list[dict] | None = None
        newd: list[dict] = []
        for p in workbooks(raws):
            try:
                kind = classify(read_sheets(p))
            except Exception as exc:  # a locked or corrupt workbook shouldn't stop the run
                log(f"skip   {p.name}: unreadable ({exc})")
                continue
            if kind is None:
                continue
            what, rows, at = kind
            if what == "5min":
                new = _five_min_from(rows, at)
                if only_date:
                    new = [r for r in new if r["Time"].startswith(only_date)]
                days = sorted({r["Time"][:10] for r in new})
                log(f"5-min  {p.name}: {len(new)} rows, {len(days)} day(s)")
                if rows5 is None:
                    rows5 = read_csv(home_dir / FIVE_MIN_FILE)
                rows5 = replace_days(rows5, new)  # files run oldest → newest, so newer wins
            elif what == "5min-old":
                log(f"skip   {p.name}: early 5-min layout without grid power / port counters")
            else:
                new = _daily_from(rows, at)
                log(f"daily  {p.name}: {len(new)} rows")
                newd += new  # later (newer) files win in merge()
        if rows5 is not None:
            write_csv(home_dir / FIVE_MIN_FILE, FIVE_MIN_COLUMNS, rows5)
            counts[f"{home}/{FIVE_MIN_FILE}"] = len(rows5)
        if newd:
            rowsd = merge(read_csv(home_dir / DAILY_FILE), newd, key=lambda r: r["Time"])
            write_csv(home_dir / DAILY_FILE, DAILY_COLUMNS, rowsd)
            counts[f"{home}/{DAILY_FILE}"] = len(rowsd)

    if pea_log:
        counts.update(import_log(pea_log, PEA_LOG, out, home, logf=log))

    if ft is not None:
        fts = ft_rows(read_sheets(ft))
        log(f"Ft     {len(fts)} months ({ft.name})")
        counts["ft_rates.csv"] = write_ft(out, fts)
    return counts


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("--home", default=DEFAULT_HOME, help="home id in homes.json (default momhome)")
    ap.add_argument(
        "--raw",
        type=Path,
        action="append",
        help="folder with the Solis .xlsx/.xls exports (repeat for several folders)",
    )
    ap.add_argument("--out", type=Path, default=Path("frontend/public/data"), help="data folder")
    ap.add_argument("--pea-log", help="PEA Log .csv/.xlsx download, or its CSV-export URL")
    ap.add_argument("--ft", type=Path, help="Ft history .csv/.xlsx (year, month, type, ft_rate)")
    ap.add_argument("--date", help="only convert 5-min readings for this day (YYYY-MM-DD)")
    args = ap.parse_args(argv)
    if not (args.raw or args.pea_log or args.ft):
        ap.error("nothing to do: pass --raw, --pea-log and/or --ft")
    try:
        counts = run(args.raw, args.out, args.pea_log, args.ft, args.date, home=args.home)
    except (ValueError, RuntimeError, OSError) as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 1
    for name, n in counts.items():
        print(f"wrote {args.out / name} ({n} rows)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
