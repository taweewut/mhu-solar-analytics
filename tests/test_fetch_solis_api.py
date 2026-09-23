"""SolisCloud API replies → the same 5min.csv / daily.csv rows as the Excel exports."""

from __future__ import annotations

import csv
import json

from momsolar import fetch_solis_api as f


def reading(t, **kw):
    rec = {
        "timeStr": f"2026-09-23 {t}",
        "state": 1,
        "uPv1": 260.3,
        "iPv1": 2.8,
        "uPv2": 257.0,
        "iPv2": 2.8,
        "batteryPower": -410.0,
        "pSum": -48.0,
        "familyLoadPower": 0,
        "bypassLoadPower": 360.0,
        "batteryCapacitySoc": 62,
        "batteryHealthSoh": 99.0,
        "inverterTemperature": 51.2,
        "eToday": 14.6,
        "batteryTodayChargeEnergy": 10.7,
        "batteryTodayDischargeEnergy": 4.6,
        "gridPurchasedTodayEnergy": 0.1,
        "homeLoadTodayEnergy": 7.3,
    }
    return rec | kw


def test_five_min_mapping_matches_the_export_columns():
    (row,) = f.five_min_from_api([reading("12:18:49")])
    assert row["Time"] == "2026-09-23 12:18:49" and row["Working State"] == "Normal"
    assert (row["MPPT1(W)"], row["MPPT2(W)"], row["PV(W)"]) == ("729", "720", "1449")  # V × A
    assert (row["Battery(W)"], row["Grid(W)"]) == ("-410", "-48")  # Solis signs kept
    assert (row["SOC(%)"], row["Today Yield(kWh)"]) == ("62", "14.6")
    assert row["Alarm Code"] == "" and "GEN(W)" not in row  # not sent → blank, not 0


def test_day_load_counter_is_split_by_integrating_grid_port_power():
    rows = f.five_min_from_api(
        [
            reading("10:05:00", familyLoadPower=1200, homeLoadTodayEnergy=5.0),
            reading("10:00:00", familyLoadPower=1200, homeLoadTodayEnergy=4.9),  # out of order
            reading("10:10:00", familyLoadPower=1200, homeLoadTodayEnergy=5.2),
        ]
    )
    assert [r["Time"][11:] for r in rows] == ["10:00:00", "10:05:00", "10:10:00"]
    last = rows[-1]  # 1.2 kW for 10 min = 0.2 kWh on the grid port
    assert (last["Today Grid Load(kWh)"], last["Today Backup Load(kWh)"]) == ("0.2", "5")


def test_missing_power_stays_blank():
    (row,) = f.five_min_from_api([reading("00:00:00", uPv1=None, iPv1=None, uPv2=None)])
    assert (row["PV(W)"], row["MPPT1(W)"]) == ("", "")


def test_daily_mapping_and_energy_units():
    recs = [
        {
            "dateStr": "2026-09-06",
            "energy": 31.0,
            "energyStr": "kWh",
            "gridSellEnergy": 0.0,
            "gridPurchasedEnergy": 3.78,
            "batteryChargeEnergy": 15.0,
            "batteryDischargeEnergy": 9.0,
            "homeLoadEnergy": 27.0,
            "produceEnergy": 31.0,
            "generatorEnergy": 0.0,
            "acCoupledEnergy": 0,
        },
        {"dateStr": "2026-09-05", "energy": 0.027, "energyStr": "MWh"},
    ]
    a, b = f.daily_from_api(recs)
    assert (a["Time"], a["Today Yield(kWh)"]) == ("2026-09-05", "27")
    assert b["Energy from Grid(kWh)"] == "3.78" and b["Load Consumption(kWh)"] == "27"
    assert b["Energy to Battery(kWh)"] == "15" and b["Energy from Battery(kWh)"] == "9"


class FakeClient:
    def __init__(self):
        self.calls = []

    def inverter_day(self, sn, day):
        self.calls.append(("day", sn, day))
        return [reading("12:00:00") | {"timeStr": f"{day} 12:00:00"}]

    def inverter_month(self, sn, month):
        self.calls.append(("month", sn, month))
        return [{"dateStr": f"{month}-01", "energy": 20, "energyStr": "kWh"}]


def test_run_merges_into_the_home_csvs_using_the_serial_from_homes_json(tmp_path):
    (tmp_path / "homes.json").write_text(json.dumps([{"id": "h", "inverter": {"sn": "SN1"}}]))
    home = tmp_path / "h"
    home.mkdir()
    (home / "5min.csv").write_text("Time,PV(W)\n2026-09-22 12:00:00,5\n2026-09-23 08:00:00,1\n")
    client = FakeClient()
    counts = f.run(client, tmp_path, ["2026-09-23"], home="h", log=lambda *_: None)
    assert counts == {"h/5min.csv": 2, "h/daily.csv": 1}
    assert client.calls == [("day", "SN1", "2026-09-23"), ("month", "SN1", "2026-09")]
    with (home / "5min.csv").open() as fh:
        times = [r["Time"] for r in csv.DictReader(fh)]
    assert times == ["2026-09-22 12:00:00", "2026-09-23 12:00:00"]  # the fetched day replaced
