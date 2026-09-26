"""Turn Huawei FusionSolar monthly reports + the MEA Log sheet into a home's processed CSVs.

Inputs: every .xlsx under ``--raw`` (searched recursively, e.g. ``Raw from Inverter report``
with its ``Y2020-2021 … Y2026`` / ``All Year`` folders). FusionSolar has used three names for
the same daily table — "Energy Revenue Summary" (2020–21), "Yield and Revenue Summary"
(2022) and "<plant>_MM-YYYY_Plant Statistics Report_by Time" (Dec 2022 →) — with the
columns in a different order, so files are recognised by their header row and columns are
read by name. Duplicates (a month in both ``Y2022`` and ``All Year``) merge by date, the
newest file winning.

FusionSolar emails a month-to-date report every morning (~07:20), and it already carries a row
for that day: near zero, because the day has barely started. So a file's rows dated on or after
the day the file was made (its modification time, in Thai time) are partial and skipped; the
next morning's report brings the complete day. solar_pipeline sets each saved report's
modification time to the email's send time, so this holds for files it saves.

The MEA Log (``--mea-log``: a .xlsx/.csv download of the Google Sheet) becomes bills.csv.

Output: ``<out>/<home>/daily.csv`` and ``bills.csv``. Huawei has no 5-minute export here and
this home has no battery, so the battery columns stay blank (never 0).

Usage::

    python -m momsolar.fetch_huawei --home mhuhome \\
        --raw "<OneDrive>/Solar Energy/Raw from Inverter report" --mea-log ~/Downloads/PEA.xlsx
"""

from __future__ import annotations

import argparse
import sys
from collections.abc import Iterable
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

from momsolar.bills import MEA_LOG, import_log
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

DEFAULT_HOME = "mhuhome"

# daily.csv column → FusionSolar header. Anything not listed stays blank.
DAILY_SOURCE = {
    "Today Yield(kWh)": "PV Yield (kWh)",
    "Energy to Grid(kWh)": "Export (kWh)",
    "Energy from Grid(kWh)": "Import (kWh)",
    "Energy to Battery(kWh)": "Charge (kWh)",
    "Energy from Battery(kWh)": "Discharge (kWh)",
    "Load Consumption(kWh)": "Consumption (kWh)",
    "Generation(kWh)": "Inverter Yield (kWh)",
}
PERIOD_HEADERS = ("Statistical Period", "Statistical Time")
# The plants' time zone (Thailand has no DST): a report's day boundaries are Thai days.
PLANT_TZ = timezone(timedelta(hours=7))


def find_table(sheets: dict[str, list[Row]]) -> tuple[list[Row], int, str] | None:
    """The daily table in a FusionSolar report: (rows, header index, period column) or None."""
    for rows in sheets.values():
        for period in PERIOD_HEADERS:
            at = find_header(rows, period, "PV Yield (kWh)")
            if at is not None:
                return rows, at, period
    return None


def huawei_daily_rows(sheets: dict[str, list[Row]]) -> list[dict[str, str]]:
    """One row per day. Summary / monthly rows (no full date) are skipped."""
    found = find_table(sheets)
    if found is None:
        return []
    rows, at, period = found
    out = []
    for rec in records(rows, at):
        try:
            day = parse_date(rec.get(period, ""))
        except ValueError:
            continue
        row = {c: "" for c in DAILY_COLUMNS}
        row["Time"] = day.isoformat()
        for col, src in DAILY_SOURCE.items():
            row[col] = fmt_num(num(rec.get(src)))
        out.append(row)
    return out


def made_on(path: Path) -> date:
    """The Thai date a report file was made (its modification time)."""
    return datetime.fromtimestamp(path.stat().st_mtime, PLANT_TZ).date()


def run(
    raw: Path | Iterable[Path] | None,
    out: Path,
    mea_log: str | None = None,
    log=print,
    home: str = DEFAULT_HOME,
) -> dict[str, int]:
    counts: dict[str, int] = {}
    home_dir = out / home
    if raw is not None:
        raws = [raw] if isinstance(raw, Path) else list(raw)
        new: list[dict] = []
        for p in workbooks(raws, recursive=True):
            try:
                sheets = read_sheets(p)
            except Exception as exc:  # a locked, corrupt or mis-named file shouldn't stop the run
                log(f"skip   {p.name}: unreadable ({exc})")
                continue
            rows = huawei_daily_rows(sheets)
            if not rows:
                continue  # e.g. the Power BI export
            made = made_on(p).isoformat()
            partial = [r["Time"] for r in rows if r["Time"] >= made]
            rows = [r for r in rows if r["Time"] < made]
            note = f" (skipped partial {', '.join(partial)})" if partial else ""
            log(f"daily  {p.parent.name}/{p.name}: {len(rows)} days{note}")
            new += rows  # oldest file first, so merge() keeps the newest export of a day
        if new:
            rowsd = merge(read_csv(home_dir / DAILY_FILE), new, key=lambda r: r["Time"])
            write_csv(home_dir / DAILY_FILE, DAILY_COLUMNS, rowsd)
            counts[f"{home}/{DAILY_FILE}"] = len(rowsd)
    if mea_log:
        counts.update(import_log(mea_log, MEA_LOG, out, home, logf=log))
    # FusionSolar reports have no 5-minute data: a header-only 5min.csv keeps every home's
    # folder the same shape (the dashboard reads it as "no 5-minute data", no 404).
    if raw is not None and not (home_dir / FIVE_MIN_FILE).exists():
        write_csv(home_dir / FIVE_MIN_FILE, FIVE_MIN_COLUMNS, [])
    return counts


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("--home", default=DEFAULT_HOME, help="home id in homes.json (default mhuhome)")
    ap.add_argument(
        "--raw", type=Path, action="append", help="folder with FusionSolar reports (recursive)"
    )
    ap.add_argument("--out", type=Path, default=Path("frontend/public/data"), help="data folder")
    ap.add_argument("--mea-log", help="MEA Log .csv/.xlsx download, or its CSV-export URL")
    args = ap.parse_args(argv)
    if not (args.raw or args.mea_log):
        ap.error("nothing to do: pass --raw and/or --mea-log")
    try:
        counts = run(args.raw, args.out, args.mea_log, home=args.home)
    except (ValueError, RuntimeError, OSError) as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 1
    for name, n in counts.items():
        print(f"wrote {args.out / name} ({n} rows)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
