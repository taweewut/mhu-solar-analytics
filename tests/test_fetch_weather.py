"""Open-Meteo hourly weather → <home>/weather.csv (no network)."""

from __future__ import annotations

import csv
import json
from datetime import date

from momsolar import fetch_weather as w

REPLY = {
    "hourly": {
        "time": ["2026-09-23T10:00", "2026-09-23T11:00", "2026-09-23T12:00"],
        "weather_code": [3, 61, None],
        "cloud_cover": [96, 100, 50],
        "precipitation": [0.0, 1.2, 0.0],
        "shortwave_radiation": [576.0, 120.5, 800.0],
    }
}


def test_rows_from_maps_hours_and_skips_hours_without_a_code():
    rows = w.rows_from(REPLY)
    assert rows == [
        {
            "Time": "2026-09-23 10:00",
            "Code": "3",
            "Cloud(%)": "96",
            "Rain(mm)": "0",
            "Radiation(W/m2)": "576",
        },
        {
            "Time": "2026-09-23 11:00",
            "Code": "61",
            "Cloud(%)": "100",
            "Rain(mm)": "1.2",
            "Radiation(W/m2)": "120.5",
        },
    ]


def home(tmp_path, location=True):
    h = {"id": "h"} | ({"location": {"lat": 13.7563, "lon": 100.5018}} if location else {})
    (tmp_path / "homes.json").write_text(json.dumps([h]))


def test_run_sends_a_rounded_location_and_merges_by_hour(tmp_path, monkeypatch):
    home(tmp_path)
    calls = []
    monkeypatch.setattr(w, "get", lambda url, params: calls.append((url, params)) or REPLY)
    assert (
        w.run(tmp_path, "h", since="2026-09-01", today=date(2026, 9, 24), log=lambda *_: None) == 2
    )
    (archive, a), (recent, r) = calls
    assert archive == w.ARCHIVE and (a["latitude"], a["longitude"]) == (13.76, 100.5)
    assert (a["start_date"], a["end_date"]) == ("2026-09-01", "2026-09-19")
    assert recent == w.FORECAST and r["forecast_days"] == 1
    with (tmp_path / "h" / "weather.csv").open() as fh:
        assert [row["Time"] for row in csv.DictReader(fh)] == [
            "2026-09-23 10:00",
            "2026-09-23 11:00",
        ]


def test_a_home_without_a_location_is_skipped_without_a_call(tmp_path, monkeypatch):
    home(tmp_path, location=False)
    monkeypatch.setattr(w, "get", lambda *a: (_ for _ in ()).throw(AssertionError("no call")))
    assert w.run(tmp_path, "h", log=lambda *_: None) == 0
