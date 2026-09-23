"""fetch_huawei: FusionSolar monthly reports (three layouts) → daily.csv."""

from __future__ import annotations

import csv
import os

import openpyxl

from momsolar import fetch_huawei as h
from momsolar.schema import DAILY_COLUMNS

# The 2020–21 "Energy Revenue Summary" and 2026 "Plant Statistics Report" put columns in a
# different order (Import before / after Specific Energy; Charge / Discharge only later).
OLD = [
    "Statistical Time",
    "Total String Capacity (kWp)",
    "PV Yield (kWh)",
    " Inverter Yield (kWh)",
    "Export (kWh)",
    "Specific Energy (kWh/kWp)",
    "Import (kWh)",
    "Consumption (kWh)",
    "Revenue (฿)",
]
NEW = [
    "Statistical Period",
    "Total String Capacity (kWp)",
    "PV Yield (kWh)",
    " Inverter Yield (kWh)",
    "Export (kWh)",
    "Import (kWh)",
    "Specific Energy (kWh/kWp)",
    "Consumption (kWh)",
    "Charge (kWh)",
    "Discharge (kWh)",
    "Revenue (฿)",
]


def report(path, title, header, rows):
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.append([title])
    ws.append(header)
    for r in rows:
        ws.append(r)
    wb.create_sheet("Sheet2")  # FusionSolar adds an empty sheet
    wb.save(path)
    return path


def read(path):
    with path.open(encoding="utf-8", newline="") as fh:
        return list(csv.DictReader(fh))


def test_reads_columns_by_name_in_any_order(tmp_path):
    old = report(
        tmp_path / "old.xlsx",
        "Energy Revenue Summary",
        OLD,
        [["2020-09-23", 5, 8.31, 8.31, 0.21, 1.66, 9.48, 17.58, 0]],
    )
    new = report(
        tmp_path / "new.xlsx",
        "demo 5k_08-2026_Plant Statistics Report_by Time",
        NEW,
        [
            ["2026-08-01", 5.0, 12.5, 12.5, 0.0, 14.13, 2.5, 26.63, "", "", 52.51],
            ["Total", "", 400, "", "", "", "", "", "", "", ""],
        ],
    )
    (a,) = h.huawei_daily_rows(h.read_sheets(old))
    assert a["Time"] == "2020-09-23"
    assert (
        a["Today Yield(kWh)"],
        a["Energy to Grid(kWh)"],
        a["Energy from Grid(kWh)"],
        a["Load Consumption(kWh)"],
    ) == ("8.31", "0.21", "9.48", "17.58")
    assert (
        a["Generation(kWh)"] == "8.31"
    )  # " Inverter Yield (kWh)" has a leading space in the export
    (b,) = h.huawei_daily_rows(h.read_sheets(new))  # the "Total" row is skipped
    assert (b["Energy from Grid(kWh)"], b["Load Consumption(kWh)"]) == ("14.13", "26.63")
    # No battery: charge / discharge stay blank, never 0.
    assert b["Energy to Battery(kWh)"] == "" and b["Energy from Battery(kWh)"] == ""
    assert set(b) == set(DAILY_COLUMNS)


def test_run_scans_year_folders_and_newest_duplicate_wins(tmp_path):
    raw, out = tmp_path / "raw", tmp_path / "out"
    (raw / "Y2026").mkdir(parents=True)
    (raw / "All Year").mkdir()
    old = report(
        raw / "All Year" / "a.xlsx",
        "x",
        NEW,
        [["2026-08-01", 5, 12.0, 12.0, 0, 14, 2.4, 26, "", "", 0]],
    )
    report(
        raw / "Y2026" / "b.xlsx",
        "x",
        NEW,
        [["2026-08-01", 5, 12.5, 12.5, 0, 14.13, 2.5, 26.63, "", "", 0]],
    )
    report(
        raw / "BI.xlsx", "Power BI", ["Date", "Value"], [["2026-08-01", 1]]
    )  # not a report: skipped
    os.utime(old, (1, 1))
    counts = h.run(raw, out, log=lambda *_: None)
    assert counts == {"mhuhome/daily.csv": 1}
    # header only
    assert (out / "mhuhome" / "5min.csv").read_text().startswith("Time,Working State")
    assert read(out / "mhuhome" / "5min.csv") == []
    assert read(out / "mhuhome" / "daily.csv")[0]["Today Yield(kWh)"] == "12.5"


def test_main_requires_an_input():
    import pytest

    with pytest.raises(SystemExit):
        h.main([])
