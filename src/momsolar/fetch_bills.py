"""Bills and the Ft history from the Google Sheet, read through the Sheets API.

The sheet holds the PEA Log, the MEA Log and the Ft table. It's private, so it's read with the
solar_pipeline's Google sign-in (its ``token.json``), which needs the read-only Sheets permission:
``fetch_solar_report.py --reauth`` grants it. The NAS poller runs this hourly from 07:00.

Cells are converted the way the .xlsx download is read: a date-formatted cell becomes
YYYY-MM-DD, numbers plain numbers, errors (#N/A) their text. So the same importers in
momsolar.bills handle both, and each home takes the log of its utility in homes.json. When the
sheet is unchanged since the last run (``--state``), nothing is written.

Usage::

    python -m momsolar.fetch_bills --sheet-id <id> --token /pipeline/token.json \\
        --out /data --state /state/bills_sheet.sha256
"""

from __future__ import annotations

import argparse
import hashlib
import json
import sys
from datetime import datetime, timedelta
from pathlib import Path

from momsolar.bills import LOGS, import_sheets
from momsolar.schema import FT_FILE, HOMES_FILE
from momsolar.sheets import Row, cell

SCOPE = "https://www.googleapis.com/auth/spreadsheets.readonly"
# Only what the conversion needs: each cell's value, its display text and its number format.
FIELDS = (
    "sheets(properties(title),data(rowData(values("
    "effectiveValue,formattedValue,effectiveFormat(numberFormat(type))))))"
)
SERIAL_EPOCH = datetime(1899, 12, 30)  # Google Sheets' day 0 for date serial numbers


def cell_value(c: dict) -> str:
    """One Sheets API ``CellData`` as the .xlsx reader gives it (see sheets.cell)."""
    v = c.get("effectiveValue") or {}
    kind = ((c.get("effectiveFormat") or {}).get("numberFormat") or {}).get("type")
    if "numberValue" in v:
        n = v["numberValue"]
        if kind in ("DATE", "DATE_TIME"):
            return cell(SERIAL_EPOCH + timedelta(days=n))
        return cell(float(n))
    if "stringValue" in v:
        return cell(v["stringValue"])
    if "boolValue" in v:
        return cell(v["boolValue"])
    if "errorValue" in v:
        return cell(c.get("formattedValue") or "#ERROR")
    return ""


def grid_to_sheets(resp: dict) -> dict[str, list[Row]]:
    """A ``spreadsheets.get`` reply with grid data → rows of strings, keyed by tab name."""
    out: dict[str, list[Row]] = {}
    for sheet in resp.get("sheets", []):
        rows: list[Row] = []
        for block in sheet.get("data", []):
            for rd in block.get("rowData", []):
                rows.append([cell_value(c) for c in rd.get("values", [])])
        out[sheet["properties"]["title"]] = rows
    return out


def fetch(sheet_id: str, token: Path) -> dict[str, list[Row]]:
    """Every tab of the sheet, read with the Google sign-in in ``token``."""
    from google.auth.transport.requests import Request
    from google.oauth2.credentials import Credentials
    from googleapiclient.discovery import build

    creds = Credentials.from_authorized_user_file(str(token))  # with the scopes it was granted
    if not creds.has_scopes([SCOPE]):
        raise RuntimeError(
            f"{token} has no Google Sheets permission: run solar_pipeline's "
            "fetch_solar_report.py --reauth, then copy the new token.json here"
        )
    if not creds.valid:
        creds.refresh(Request())
    sheets = build("sheets", "v4", credentials=creds, cache_discovery=False).spreadsheets()
    reply = sheets.get(spreadsheetId=sheet_id, includeGridData=True, fields=FIELDS).execute()
    return grid_to_sheets(reply)


def fingerprint(sheets: dict[str, list[Row]]) -> str:
    return hashlib.sha256(
        json.dumps(sheets, ensure_ascii=False, sort_keys=True).encode()
    ).hexdigest()


def run(sheets: dict[str, list[Row]], out: Path, log=print) -> dict[str, int]:
    """Import each home's bills (by its utility in homes.json) and the Ft history."""
    homes = json.loads((out / HOMES_FILE).read_text(encoding="utf-8"))
    counts: dict[str, int] = {}
    for h in homes:
        billlog = LOGS.get(h.get("utility", ""))
        if billlog is None:
            continue
        try:
            counts.update(import_sheets(sheets, billlog, out, h["id"], logf=log))
        except ValueError as exc:  # e.g. the tab was renamed: keep the other home's bills
            log(f"skip   {h['id']}: {exc}")
    if FT_FILE not in counts:
        log("Ft     no Ft table in the sheet")
    return counts


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("--sheet-id", required=True, help="the Google Sheet's ID (from its URL)")
    ap.add_argument("--token", type=Path, required=True, help="Google sign-in (token.json)")
    ap.add_argument("--out", type=Path, default=Path("frontend/public/data"), help="data folder")
    ap.add_argument("--state", type=Path, help="remembers the sheet's fingerprint between runs")
    args = ap.parse_args(argv)
    try:
        sheets = fetch(args.sheet_id, args.token)
    except Exception as exc:  # network, permission, a missing sheet: report and try next hour
        print(f"error: {exc}", file=sys.stderr)
        return 1
    fp = fingerprint(sheets)
    if args.state and args.state.exists() and args.state.read_text().strip() == fp:
        print("bills  sheet unchanged")
        return 0
    counts = run(sheets, args.out)
    for name, n in counts.items():
        print(f"wrote {args.out / name} ({n} rows)")
    if args.state:
        args.state.parent.mkdir(parents=True, exist_ok=True)
        args.state.write_text(fp + "\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
