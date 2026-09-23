"""API routes serve each home's processed CSVs as the typed rows the frontend expects.

Runs on the synthetic sample_data/ (scripts/make_sample_data.py), not on real data.
"""

from __future__ import annotations

from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from momsolar.api.app import create_app
from momsolar.config import Settings, get_settings

SAMPLE = Path(__file__).resolve().parents[1] / "sample_data"


@pytest.fixture
def client():
    app = create_app()
    app.dependency_overrides[get_settings] = lambda: Settings(data_dir=SAMPLE)
    return TestClient(app)


def test_health(client):
    assert client.get("/health").json() == {"status": "ok"}


def test_homes(client):
    homes = client.get("/homes").json()
    assert [h["id"] for h in homes] == ["momhome", "mhuhome"]
    assert homes[0]["battery"]["kwh"] == 16 and homes[1]["battery"] is None
    assert (homes[0]["installed"], homes[1]["installed"]) == ("2026-03-29", "2020-09-20")
    assert homes[1]["utility"] == "MEA" and homes[1]["tariff"]["service"] == 24.62
    gap = homes[1]["dataGaps"][0]
    assert (gap["from"], gap["to"]) == ("2025-10-31", "2026-02-15")  # serialised as "from"


def test_unknown_home_is_404_not_a_path(client):
    assert client.get("/homes/nope/daily").status_code == 404
    assert client.get("/homes/..%2F..%2Fetc/daily").status_code == 404


def test_momhome_five_min_for_a_day(client):
    rows = client.get("/homes/momhome/5min", params={"date": "2026-09-23"}).json()
    assert len(rows) == 148
    last = rows[-1]
    assert last["time"] == "2026-09-23 12:17:00"
    assert last["today_yield_kwh"] == 19.8
    assert last["working_state"] == "Normal" and last["alarm_code"] == ""
    assert client.get("/homes/momhome/5min", params={"date": "2026-01-01"}).json() == []
    assert client.get("/homes/momhome/5min", params={"date": "23/09/2026"}).status_code == 422


def test_mhuhome_has_daily_and_mea_bills_but_no_5min(client):
    assert client.get("/homes/mhuhome/5min").json() == []
    daily = client.get("/homes/mhuhome/daily").json()
    assert daily[0]["date"] == "2020-09-23" and daily[0]["to_grid_kwh"] == 10.78
    assert daily[0]["to_battery_kwh"] is None  # no battery: blank, not 0
    bills = client.get("/homes/mhuhome/bills").json()
    first = bills[0]
    assert (
        first["bill_date"],
        first["year"],
        first["month"],
        first["units"],
        first["amount_thb"],
    ) == (
        "2020-05-08",
        2020,
        4,
        946,
        4393.59,
    )
    tou = next(b for b in bills if (b["year"], b["month"]) == (2025, 3))
    assert (tou["on_peak_units"], tou["off_peak_units"]) == (87, 286)


def test_momhome_bills_and_shared_ft(client):
    bills = client.get("/homes/momhome/bills").json()
    assert bills[0]["year"] == 2026 and bills[0]["month"] == 3 and bills[0]["amount_thb"] == 1906.79
    ft = client.get("/ft-rates").json()
    assert {"year": 2026, "month": 3, "type": 1, "ft_rate": 0.0972} in ft
    assert {"year": 2020, "month": 9, "type": 1, "ft_rate": -0.1243} in ft


def test_freshness(client):
    body = client.get("/homes/momhome/freshness").json()
    assert body["latest_reading"] == "2026-09-23 12:17:00"
    assert body["dates"] == ["2026-09-23"] and body["refreshing"] is False
    assert client.get("/homes/mhuhome/freshness").json()["latest_day"] == "2026-08-31"


def test_momhome_bms_samples(client):
    rows = client.get("/homes/momhome/bms", params={"date": "2026-09-23"}).json()
    assert len(rows) == 50 and rows[0]["time"] == "2026-09-23 00:02:00"
    assert rows[0]["temp_min_c"] < rows[0]["temp_max_c"]
    assert client.get("/homes/mhuhome/bms").json() == []  # no BMS log: empty, not an error
