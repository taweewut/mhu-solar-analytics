"""Spreadsheet + CSV plumbing shared by the per-source importers.

Every export is read as rows of strings and located by its header row (never by row number
or file name), because SolisCloud, FusionSolar and the Google Sheet all move things around.
"""

from __future__ import annotations

import csv
from collections.abc import Iterable, Iterator
from datetime import date, datetime
from pathlib import Path

Row = list[str]


# ── Reading spreadsheets ────────────────────────────────────────────────────
def cell(v: object) -> str:
    """Normalise a cell to a stripped string (Solis stores numbers as inline strings)."""
    if v is None:
        return ""
    if isinstance(v, float) and v.is_integer():
        return str(int(v))
    if isinstance(v, datetime | date):
        return v.strftime("%Y-%m-%d")  # unambiguous, whatever the sheet's locale
    return str(v).strip()


def read_sheets(path: Path) -> dict[str, list[Row]]:
    """Every sheet of a .xlsx/.xls/.csv file as rows of strings, keyed by sheet name."""
    suffix = path.suffix.lower()
    if suffix == ".csv":
        with path.open(encoding="utf-8-sig", newline="") as f:
            return {path.stem: [[cell(c) for c in r] for r in csv.reader(f)]}
    if suffix == ".xlsx":
        import openpyxl

        # Not read_only: Solis writes a bogus <dimension> (A1:A1) that read-only mode trusts.
        wb = openpyxl.load_workbook(path, data_only=True)
        return {
            ws.title: [[cell(c) for c in r] for r in ws.iter_rows(values_only=True)] for ws in wb
        }
    if suffix == ".xls":
        import xlrd

        book = xlrd.open_workbook(str(path))
        return {
            s.name: [[cell(c) for c in s.row_values(i)] for i in range(s.nrows)]
            for s in book.sheets()
        }
    raise ValueError(f"unsupported file type: {path}")


def find_header(rows: list[Row], *required: str) -> int | None:
    """Index of the first row containing every ``required`` label, or None."""
    for i, r in enumerate(rows):
        cells = set(r)
        if all(name in cells for name in required):
            return i
    return None


def records(rows: list[Row], header_at: int) -> Iterator[dict[str, str]]:
    header = rows[header_at]
    for r in rows[header_at + 1 :]:
        if not any(r):
            continue
        yield {h: (r[j] if j < len(r) else "") for j, h in enumerate(header) if h}


def workbooks(dirs: Iterable[Path], recursive: bool = False) -> list[Path]:
    """Every .xls/.xlsx under ``dirs``, oldest first, so a later re-export wins a merge."""
    files = {
        p
        for d in dirs
        for p in (d.rglob("*.xls*") if recursive else d.glob("*.xls*"))
        if p.suffix.lower() in (".xls", ".xlsx") and not p.name.startswith("~$")
    }
    return sorted(files, key=lambda p: (p.stat().st_mtime, str(p)))


# ── Values ──────────────────────────────────────────────────────────────────
def num(s: str | None) -> float | None:
    if s is None:
        return None
    s = s.replace(",", "").replace("฿", "").strip()
    if s in ("", "-", "#N/A", "#VALUE!", "#DIV/0!"):
        return None
    try:
        return float(s)
    except ValueError:
        return None


def fmt_num(v: float | None) -> str:
    """Compact number: no trailing zeros, max 4 dp (``-410.000`` → ``-410``)."""
    if v is None:
        return ""
    text = f"{v:.4f}".rstrip("0").rstrip(".")
    return "0" if text in ("-0", "") else text


def parse_date(s: str, order: str = "dmy") -> date:
    """A date cell: ISO (from a real date cell), or d/m/Y (``order="dmy"``) / m/d/Y text."""
    s = s.strip().split(" ")[0]
    fmts = ["%Y-%m-%d"] + (["%d/%m/%Y", "%d-%m-%Y"] if order == "dmy" else ["%m/%d/%Y"])
    for fmt in fmts:
        try:
            return datetime.strptime(s, fmt).date()
        except ValueError:
            pass
    raise ValueError(f"unrecognised date: {s!r}")


# ── Processed CSVs ──────────────────────────────────────────────────────────
def read_csv(path: Path) -> list[dict[str, str]]:
    if not path.exists():
        return []
    with path.open(encoding="utf-8", newline="") as f:
        return list(csv.DictReader(f))


def write_csv(path: Path, columns: list[str], rows: list[dict[str, str]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(".csv.tmp")
    with tmp.open("w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=columns, extrasaction="ignore", lineterminator="\n")
        w.writeheader()
        w.writerows(rows)
    tmp.replace(path)


def merge(existing: Iterable[dict[str, str]], new: Iterable[dict[str, str]], key) -> list[dict]:
    """Union by ``key``; rows in ``new`` replace existing ones. Sorted by key."""
    merged = {key(r): r for r in existing}
    merged.update({key(r): r for r in new})
    return [merged[k] for k in sorted(merged)]
