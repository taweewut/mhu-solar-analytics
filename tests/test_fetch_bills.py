"""fetch_bills: the Google Sheet (Sheets API grid data) → bills.csv per home + ft_rates.csv."""

from __future__ import annotations

import csv
import json
from datetime import date
from pathlib import Path

import pytest

from momsolar import fetch_bills as fb

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


def serial(d: date) -> int:
    """A date as Google Sheets stores it (days since 1899-12-30)."""
    return (d - date(1899, 12, 30)).days


def n(v: float, is_date: bool = False) -> dict:
    c: dict = {"effectiveValue": {"numberValue": v}}
    if is_date:
        c["effectiveFormat"] = {"numberFormat": {"type": "DATE"}}
    return c


def t(s: str) -> dict:
    return {"effectiveValue": {"stringValue": s}}


NA = {"effectiveValue": {"errorValue": {"type": "N_A"}}, "formattedValue": "#N/A"}
EMPTY: dict = {}


def tab(title: str, *rows: list[dict]) -> dict:
    return {
        "properties": {"title": title},
        "data": [{"rowData": [{"values": list(r)} for r in rows]}],
    }


# An invented sheet in the Sheets API's shape: the PEA Log's Year / Usage Month are #N/A (the
# usage month comes from its month-end date), the MEA Log's bill is dated the following month.
REPLY = {
    "sheets": [
        tab(
            "PEA Log",
            [t(h) for h in [*HEAD, "จำนวนเงิน"]],
            [
                n(serial(date(2026, 8, 31)), True),
                NA,
                NA,
                EMPTY,
                EMPTY,
                n(210),
                EMPTY,
                EMPTY,
                n(1015.4),
            ],
            [
                n(serial(date(2026, 9, 30)), True),
                NA,
                NA,
                EMPTY,
                EMPTY,
                n(185),
                EMPTY,
                EMPTY,
                n(902.25),
            ],
        ),
        tab(
            "MEA Log",
            [t(h) for h in [*HEAD, "ค่าไฟ", "ค่าไฟฟ้ารวม VAT"]],
            [
                n(serial(date(2026, 10, 7)), True),
                n(2026),
                n(9),
                n(90),
                n(240),
                n(330),
                n(560.4412),  # the TOU split in full precision; stored to the satang
                n(830.2),
                n(1),
                n(1480),
            ],
        ),
        tab(
            "Ft",
            [t("year"), t("month"), t("type"), t("ft_rate")],
            [n(2026), n(9), n(1), n(0.1972)],
            [n(2026), n(9), n(2), n(0.5)],
        ),
        tab("Notes", [t("   free text  ")]),
    ]
}


def read(path: Path) -> list[dict[str, str]]:
    with path.open(encoding="utf-8", newline="") as f:
        return list(csv.DictReader(f))


@pytest.fixture
def data(tmp_path: Path) -> Path:
    out = tmp_path / "data"
    out.mkdir()
    homes = [{"id": "momhome", "utility": "PEA"}, {"id": "mhuhome", "utility": "MEA"}]
    (out / "homes.json").write_text(json.dumps(homes), encoding="utf-8")
    return out


def test_cells_read_like_the_xlsx_download():
    assert fb.cell_value(n(serial(date(2026, 8, 31)), True)) == "2026-08-31"
    assert fb.cell_value(n(210)) == "210"  # a whole number, not "210.0"
    assert fb.cell_value(n(1015.4)) == "1015.4"
    assert fb.cell_value(t("  ฿1,480 ")) == "฿1,480"
    assert fb.cell_value(NA) == "#N/A"
    assert fb.cell_value(EMPTY) == ""
    assert fb.grid_to_sheets(REPLY)["Notes"] == [["free text"]]


def test_each_home_gets_its_utilitys_log_and_the_ft_history(data: Path):
    counts = fb.run(fb.grid_to_sheets(REPLY), data, log=lambda *_: None)
    assert counts == {"momhome/bills.csv": 2, "mhuhome/bills.csv": 1, "ft_rates.csv": 1}
    pea = read(data / "momhome" / "bills.csv")
    assert [(r["Year"], r["Usage Month"], r["หน่วย"], r["จำนวนเงิน"]) for r in pea] == [
        ("2026", "8", "210", "1015.40"),
        ("2026", "9", "185", "902.25"),
    ]
    (mea,) = read(data / "mhuhome" / "bills.csv")
    assert (mea["Month Year"], mea["Usage Month"], mea["จำนวนเงิน"]) == (
        "2026-10-07",
        "9",
        "1480.00",
    )
    assert (mea["OnPeak"], mea["OffPeak"]) == ("560.44", "830.2")  # to the satang, as the .xlsx
    assert read(data / "ft_rates.csv") == [
        {"year": "2026", "month": "9", "type": "1", "ft_rate": "0.1972"}
    ]


def test_baht_round_like_the_sheet_shows_them():
    from momsolar.bills import satang

    assert str(satang(250.11499999999998)) == "250.12"  # a formula's result; round() gives 250.11
    assert str(satang(123.4567)) == "123.46"
    assert str(satang(830.2)) == "830.20"


def test_a_missing_log_skips_only_that_home(data: Path):
    reply = {"sheets": [s for s in REPLY["sheets"] if s["properties"]["title"] != "MEA Log"]}
    notes: list[str] = []
    counts = fb.run(fb.grid_to_sheets(reply), data, log=notes.append)
    assert "momhome/bills.csv" in counts and "mhuhome/bills.csv" not in counts
    assert any(m.startswith("skip   mhuhome") for m in notes)


def test_an_unchanged_sheet_writes_nothing(data: Path, monkeypatch, capsys):
    monkeypatch.setattr(fb, "fetch", lambda *_: fb.grid_to_sheets(REPLY))
    args = [
        "--sheet-id",
        "x",
        "--token",
        "t.json",
        "--out",
        str(data),
        "--state",
        str(data.parent / "state" / "sha"),
    ]
    assert fb.main(args) == 0
    bills = data / "momhome" / "bills.csv"
    bills.unlink()
    assert fb.main(args) == 0
    assert "sheet unchanged" in capsys.readouterr().out
    assert not bills.exists()  # skipped: the sheet is the same as last time


def test_a_failed_read_is_reported_and_retried_later(monkeypatch, capsys, data: Path):
    def boom(*_):
        raise OSError("network down")

    monkeypatch.setattr(fb, "fetch", boom)
    assert fb.main(["--sheet-id", "x", "--token", "t.json", "--out", str(data)]) == 1
    assert "network down" in capsys.readouterr().err


def test_a_token_without_sheets_permission_says_how_to_fix_it(tmp_path: Path):
    pytest.importorskip("google.oauth2.credentials")
    token = tmp_path / "token.json"
    token.write_text(
        json.dumps(
            {
                "token": "t",
                "refresh_token": "r",
                "client_id": "c",
                "client_secret": "s",
                "scopes": ["https://www.googleapis.com/auth/gmail.readonly"],
            }
        )
    )
    with pytest.raises(RuntimeError, match="--reauth"):
        fb.fetch("x", token)
