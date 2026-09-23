"""Utility bills (Google Sheet "PEA Log" / "MEA Log") and the Ft history → processed CSVs.

Both logs share the columns Month Year · Year · Usage Month · On/Off Peak unit · หน่วย ·
OnPeak · OffPeak and differ in the amount column:

* PEA Log: ``จำนวนเงิน``. Year / Usage Month are broken formulas (#N/A), so the usage month is
  taken from Month Year (a month-end date).
* MEA Log: ``ค่าไฟฟ้ารวม VAT`` (the paid amount incl. VAT; its ``ค่าไฟ`` column holds stale
  copied-down values). Year / Usage Month are valid and used as-is — the bill is dated in the
  following month (e.g. 8/5/2020 for April 2020 usage).
"""

from __future__ import annotations

import csv
import io
import urllib.request
from dataclasses import dataclass
from pathlib import Path

from momsolar.schema import BILL_COLUMNS, BILLS_FILE, FT_COLUMNS, FT_FILE
from momsolar.sheets import (
    Row,
    cell,
    find_header,
    fmt_num,
    merge,
    num,
    parse_date,
    read_csv,
    read_sheets,
    records,
    write_csv,
)

RESIDENTIAL_FT_TYPE = "1"


@dataclass(frozen=True)
class BillLog:
    tab: str  # preferred sheet name
    amount: str  # column holding the paid amount incl. VAT
    date_order: str  # how Month Year is written when it's text ("dmy" / "mdy")


PEA_LOG = BillLog(tab="PEA Log", amount="จำนวนเงิน", date_order="dmy")
MEA_LOG = BillLog(tab="MEA Log", amount="ค่าไฟฟ้ารวม VAT", date_order="mdy")
LOGS = {"PEA": PEA_LOG, "MEA": MEA_LOG}


def _usage_month(rec: dict[str, str], bill_date) -> tuple[int, int]:
    y, m = num(rec.get("Year")), num(rec.get("Usage Month"))
    if y and m and 2000 < y < 2100 and 1 <= m <= 12:
        return int(y), int(m)
    return bill_date.year, bill_date.month  # PEA: month-end bill = usage month


def bill_rows(sheets: dict[str, list[Row]], log: BillLog) -> list[dict[str, str]]:
    """Bills from a log sheet, one per usage month. Rows without units or amount are skipped."""
    ordered = sorted(sheets.items(), key=lambda kv: kv[0].casefold() != log.tab.casefold())
    for _name, rows in ordered:
        at = find_header(rows, "Month Year", "หน่วย", log.amount)
        if at is None:
            continue
        out = []
        for rec in records(rows, at):
            units, amount = num(rec.get("หน่วย")), num(rec.get(log.amount))
            # A row prepared for the next bill has 0 units and only the service charge.
            if not rec.get("Month Year") or not units or units <= 0 or amount is None:
                continue
            bill_date = parse_date(rec["Month Year"], log.date_order)
            year, month = _usage_month(rec, bill_date)
            row = {c: fmt_num(num(rec.get(c))) for c in BILL_COLUMNS}
            row.update(
                {
                    "Month Year": bill_date.isoformat(),
                    "Year": str(year),
                    "Usage Month": str(month),
                    "จำนวนเงิน": f"{amount:.2f}",
                }
            )
            out.append(row)
        return out
    raise ValueError(f"no {log.tab} table (Month Year, หน่วย, {log.amount}) found")


def ft_rows(sheets: dict[str, list[Row]]) -> list[dict[str, str]]:
    """Residential Ft history (``year, month, type, ft_rate``); empty if the table is absent."""
    for rows in sheets.values():
        at = find_header(rows, "year", "month", "type", "ft_rate")
        if at is None:
            continue
        out = []
        for rec in records(rows, at):
            y, m, rate = num(rec.get("year")), num(rec.get("month")), num(rec.get("ft_rate"))
            if y is None or m is None or rate is None:
                continue
            if rec.get("type", "").strip() != RESIDENTIAL_FT_TYPE:
                continue
            out.append(
                {"year": str(int(y)), "month": str(int(m)), "type": "1", "ft_rate": fmt_num(rate)}
            )
        return out
    return []


def load_source(source: str, tab: str = "PEA Log") -> dict[str, list[Row]]:
    """Read a log from a local .csv/.xlsx, or a Google-Sheets CSV export URL."""
    if source.startswith(("http://", "https://")):
        with urllib.request.urlopen(source, timeout=30) as resp:  # noqa: S310 - user-given URL
            body = resp.read().decode("utf-8-sig")
        if body.lstrip().startswith("<"):
            raise RuntimeError(
                "Log URL returned HTML (sign-in page?) — the sheet is private. Download it "
                "via File → Download → .xlsx and pass the file instead."
            )
        return {tab: [[cell(c) for c in r] for r in csv.reader(io.StringIO(body))]}
    return read_sheets(Path(source).expanduser())


def _bill_key(r: dict[str, str]) -> tuple[int, int]:
    return int(r["Year"]), int(r["Usage Month"])


def write_bills(home_dir: Path, bills: list[dict[str, str]]) -> int:
    rows = merge(read_csv(home_dir / BILLS_FILE), bills, key=_bill_key)
    write_csv(home_dir / BILLS_FILE, BILL_COLUMNS, rows)
    return len(rows)


def write_ft(data_dir: Path, fts: list[dict[str, str]]) -> int:
    rows = merge(read_csv(data_dir / FT_FILE), fts, key=lambda r: (int(r["year"]), int(r["month"])))
    write_csv(data_dir / FT_FILE, FT_COLUMNS, rows)
    return len(rows)


def import_log(source: str, log: BillLog, data_dir: Path, home: str, logf=print) -> dict[str, int]:
    """Bills into ``<data>/<home>/bills.csv``; an Ft table in the same workbook into ft_rates."""
    sheets = load_source(source, log.tab)
    bills = bill_rows(sheets, log)
    logf(f"bills  {len(bills)} from {log.tab}")
    counts = {f"{home}/{BILLS_FILE}": write_bills(data_dir / home, bills)}
    fts = ft_rows(sheets)
    if fts:
        logf(f"Ft     {len(fts)} months (from the {log.tab} workbook)")
        counts[FT_FILE] = write_ft(data_dir, fts)
    return counts
