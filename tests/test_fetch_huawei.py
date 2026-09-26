"""fetch_huawei: FusionSolar monthly reports (three layouts) → daily.csv."""

from __future__ import annotations

import csv
import os
from datetime import datetime

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


def thai_time(*ymdhm):
    """Unix time of a Thai wall-clock time, for os.utime."""
    return datetime(*ymdhm, tzinfo=h.PLANT_TZ).timestamp()


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
    older = thai_time(2026, 9, 1, 10, 0)  # saved after August ended, but before b.xlsx
    os.utime(old, (older, older))
    counts = h.run(raw, out, log=lambda *_: None)
    assert counts == {"mhuhome/daily.csv": 1}
    # header only
    assert (out / "mhuhome" / "5min.csv").read_text().startswith("Time,Working State")
    assert read(out / "mhuhome" / "5min.csv") == []
    assert read(out / "mhuhome" / "daily.csv")[0]["Today Yield(kWh)"] == "12.5"


def test_daily_report_skips_the_partial_day_it_was_sent_on(tmp_path):
    # The ~07:20 email already has a row for that day: 0 PV and a little night-time import.
    raw, out = tmp_path / "raw", tmp_path / "out"
    raw.mkdir()
    f = raw / "demo 5k_09-2026_Plant Statistics Report_by Time.xlsx"
    report(
        f,
        "x",
        NEW,
        [
            ["2026-09-25", 5, 4.1, 4.1, 0, 8.7, 0.82, 12.8, "", "", 0],
            ["2026-09-26", 5, 0.0, 0.0, 0, 0.55, 0.0, 0.55, "", "", 0],
        ],
    )
    sent = thai_time(2026, 9, 26, 7, 23)
    os.utime(f, (sent, sent))
    h.run(raw, out, log=lambda *_: None)
    assert [r["Time"] for r in read(out / "mhuhome" / "daily.csv")] == ["2026-09-25"]

    # The next morning's report (same file name, overwritten) completes the 26th.
    report(
        f,
        "x",
        NEW,
        [
            ["2026-09-25", 5, 4.1, 4.1, 0, 8.7, 0.82, 12.8, "", "", 0],
            ["2026-09-26", 5, 8.1, 8.1, 0, 11.2, 1.62, 19.3, "", "", 0],
            ["2026-09-27", 5, 0.0, 0.0, 0, 0.6, 0.0, 0.6, "", "", 0],
        ],
    )
    sent = thai_time(2026, 9, 27, 7, 21)
    os.utime(f, (sent, sent))
    h.run(raw, out, log=lambda *_: None)
    rows = read(out / "mhuhome" / "daily.csv")
    assert [r["Time"] for r in rows] == ["2026-09-25", "2026-09-26"]
    assert rows[1]["Today Yield(kWh)"] == "8.1"


def test_month_end_report_sent_on_the_1st_keeps_every_day(tmp_path):
    raw, out = tmp_path / "raw", tmp_path / "out"
    raw.mkdir()
    f = report(
        raw / "demo 5k_09-2026_Plant Statistics Report_by Time.xlsx",
        "x",
        NEW,
        [["2026-09-30", 5, 7.0, 7.0, 0, 10, 1.4, 17, "", "", 0]],
    )
    sent = thai_time(2026, 10, 1, 7, 22)
    os.utime(f, (sent, sent))
    h.run(raw, out, log=lambda *_: None)
    assert [r["Time"] for r in read(out / "mhuhome" / "daily.csv")] == ["2026-09-30"]


def test_main_requires_an_input():
    import pytest

    with pytest.raises(SystemExit):
        h.main([])
