"""PEA Log / MEA Log / Ft history → bills.csv, ft_rates.csv."""

from __future__ import annotations

import csv
from pathlib import Path

import pytest

from momsolar import bills as b
from momsolar.schema import BILL_COLUMNS

HEAD = [
    "Month Year",
    "Year",
    "Usage Month",
    "On Peak unit",
    "Off Peak unit",
    "หน่วย",
    "OnPeak",
    "OffPeak",
]


def test_pea_log_derives_usage_month_from_bill_date():
    sheets = {
        "PEA Log": [
            [*HEAD, "จำนวนเงิน"],
            ["31/3/2026", "#N/A", "#VALUE!", "", "", "461", "", "", "2013.59"],
            ["", "", "", "", "", "", "", "", ""],
            ["30/4/2026", "", "", "", "", "173", "", "", "669.61"],
        ]
    }
    rows = b.bill_rows(sheets, b.PEA_LOG)
    assert [(r["Month Year"], r["Year"], r["Usage Month"]) for r in rows] == [
        ("2026-03-31", "2026", "3"),
        ("2026-04-30", "2026", "4"),
    ]
    assert rows[0]["หน่วย"] == "461" and rows[0]["จำนวนเงิน"] == "2013.59"
    assert set(rows[0]) == set(BILL_COLUMNS)


def test_mea_log_uses_its_usage_month_and_paid_amount():
    head = [*HEAD, "ค่าไฟ", "ค่าไฟฟ้ารวม VAT"]
    sheets = {
        # Another table with Month Year + หน่วย (the water bill) must not be picked.
        "Water": [
            ["Month Year", "Year", "Usage Month", "หน่วย", "รวมเงิน"],
            ["10/19/2024", "2024", "10", "16", "190.9"],
        ],
        "MEA log": [
            head,
            ["5/8/2020", "2020", "4", "", "", "754", "", "", "฿3,272.00", "฿3,272.00"],
            [
                "4/8/2025",
                "2025",
                "3",
                "141",
                "372",
                "513",
                "฿817.55",
                "฿980.93",
                "฿1,798.47",
                "฿2,115.36",
            ],
            [
                "10/8/2026",
                "2026",
                "9",
                "",
                "",
                "0",
                "",
                "",
                "฿1,495.21",
                "฿26.34",
            ],  # next bill, not in yet
        ],
    }
    rows = b.bill_rows(sheets, b.MEA_LOG)
    assert len(rows) == 2
    assert rows[0] == {
        "Month Year": "2020-05-08",
        "Year": "2020",
        "Usage Month": "4",
        "On Peak unit": "",
        "Off Peak unit": "",
        "หน่วย": "754",
        "OnPeak": "",
        "OffPeak": "",
        "จำนวนเงิน": "3272.00",
    }
    tou = rows[1]
    assert (tou["Usage Month"], tou["On Peak unit"], tou["Off Peak unit"], tou["OnPeak"]) == (
        "3",
        "141",
        "372",
        "817.55",
    )
    assert tou["จำนวนเงิน"] == "2115.36"  # ค่าไฟฟ้ารวม VAT, not ค่าไฟ


def test_missing_table_is_an_error():
    with pytest.raises(ValueError, match="MEA Log"):
        b.bill_rows({"x": [["a", "b"]]}, b.MEA_LOG)


def test_ft_rows_keep_residential_only():
    sheets = {
        "Ft": [
            ["year", "month", "type", "type_name", "ft_rate"],
            ["2025", "9", "1", "บ้านอยู่อาศัย", "0.1572"],
            ["2025", "9", "2", "กิจการขนาดเล็ก", "0.1572"],
        ]
    }
    assert b.ft_rows(sheets) == [{"year": "2025", "month": "9", "type": "1", "ft_rate": "0.1572"}]


def test_private_sheet_url_gives_clear_error(monkeypatch):
    class Resp:
        def __enter__(self):
            return self

        def __exit__(self, *a):
            return False

        def read(self):
            return b"<!DOCTYPE html><html>sign in</html>"

    monkeypatch.setattr(b.urllib.request, "urlopen", lambda *a, **k: Resp())
    with pytest.raises(RuntimeError, match="private"):
        b.load_source("https://docs.google.com/spreadsheets/d/x/export?format=csv")


def test_import_log_merges_by_usage_month(tmp_path: Path):
    src = tmp_path / "mea.csv"
    src.write_text(
        "Month Year,Year,Usage Month,หน่วย,ค่าไฟฟ้ารวม VAT\n"
        "5/8/2020,2020,4,754,3272\n"
        "6/8/2020,2020,5,889,2508\n",
        encoding="utf-8",
    )
    counts = b.import_log(str(src), b.MEA_LOG, tmp_path / "data", "mhuhome", logf=lambda *_: None)
    assert counts == {"mhuhome/bills.csv": 2}
    # A corrected re-download replaces the month rather than duplicating it.
    src.write_text(
        "Month Year,Year,Usage Month,หน่วย,ค่าไฟฟ้ารวม VAT\n6/9/2020,2020,5,890,2510\n",
        encoding="utf-8",
    )
    b.import_log(str(src), b.MEA_LOG, tmp_path / "data", "mhuhome", logf=lambda *_: None)
    with (tmp_path / "data" / "mhuhome" / "bills.csv").open(encoding="utf-8") as fh:
        rows = list(csv.DictReader(fh))
    assert [(r["Usage Month"], r["หน่วย"]) for r in rows] == [("4", "754"), ("5", "890")]
