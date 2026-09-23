"""Layout of the processed data folder (project.md §3 / §8), shared by every home.

    data/
      homes.json          the homes: name, array, battery, inverter, utility, tariff
      ft_rates.csv        Ft history (national, shared by PEA and MEA)
      <home>/5min.csv     5-minute readings        (optional — Solis All-History only)
      <home>/daily.csv    one row per day           (Solis monthly report / Huawei reports)
      <home>/bills.csv    one row per utility bill  (PEA Log / MEA Log)
      <home>/bms.csv      battery BMS samples       (optional — SolisCloud API snapshots)

These headers are the contract between the pipeline scripts (writers), the API (reader) and
the frontend's ``lib/csv.ts`` (reader). Header names follow the SolisCloud / PEA Log labels,
and other sources are mapped onto them (Huawei "Export (kWh)" → "Energy to Grid(kWh)").

All times are local to the site (UTC+07:00). Power sign conventions are Solis's own:
``Battery(W)`` is negative while discharging, ``Grid(W)`` is negative while importing.
"""

from __future__ import annotations

HOMES_FILE = "homes.json"
FT_FILE = "ft_rates.csv"
FIVE_MIN_FILE = "5min.csv"
DAILY_FILE = "daily.csv"
BILLS_FILE = "bills.csv"
BMS_FILE = "bms.csv"

# Plant 5-min fields + the inverter fields the dashboard needs (MPPT split, SOH,
# temperature) + the inverter's own day counters, which are more accurate than
# integrating 5-min power samples.
FIVE_MIN_COLUMNS = [
    "Time",  # 2026-09-23 00:03:36
    "Working State",
    "Alarm Code",  # blank when no alarm
    "PV(W)",
    "MPPT1(W)",
    "MPPT2(W)",
    "MPPT1(V)",
    "MPPT2(V)",
    "Battery(W)",
    "Grid(W)",
    "Grid Load(W)",
    "Backup Load(W)",
    "SOC(%)",
    "SOH(%)",
    "Temp(C)",
    "GEN(W)",
    "Smart(W)",
    "AC Coupled(W)",
    "Today Yield(kWh)",
    "Today Energy to Battery(kWh)",
    "Today Energy from Battery(kWh)",
    "Today Energy from Grid(kWh)",
    "Today Grid Load(kWh)",
    "Today Backup Load(kWh)",
    "Total Grid Load(kWh)",
    "Total Backup Load(kWh)",
]

# One row per day. Battery columns stay blank for a home without a battery.
DAILY_COLUMNS = [
    "Time",  # 2026-09-23
    "Today Yield(kWh)",
    "Energy to Grid(kWh)",
    "Energy from Grid(kWh)",
    "Energy to Battery(kWh)",
    "Energy from Battery(kWh)",
    "Load Consumption(kWh)",
    "Generation(kWh)",
    "GEN(kWh)",
    "Smart Load(kWh)",
    "AC Coupled(kWh)",
]

# One row per bill (Google Sheet "PEA Log" / "MEA Log"). `Month Year` is the bill date;
# `Year` / `Usage Month` are the month the energy was used, which bills are matched on.
# `จำนวนเงิน` is the amount paid incl. VAT (MEA Log: its "ค่าไฟฟ้ารวม VAT" column).
BILL_COLUMNS = [
    "Month Year",  # 2026-03-31
    "Year",
    "Usage Month",
    "On Peak unit",
    "Off Peak unit",
    "หน่วย",
    "OnPeak",
    "OffPeak",
    "จำนวนเงิน",
]

# Battery BMS snapshots (SolisCloud inverterDetail → batteryList). Neither the 5-min history
# nor the exports carry battery temperature or cell voltages, so they're logged going forward,
# one row per sample (every 15 min by the scheduled fetch). Time = the inverter's reading time.
BMS_COLUMNS = [
    "Time",  # 2026-09-23 21:33:49
    "Battery Temp Min(C)",
    "Battery Temp Max(C)",
    "Cell Min(V)",
    "Cell Max(V)",
    "SOC(%)",
]

# Ft history (same Google Sheet); ft_rate in THB/unit. type 1 = residential.
FT_COLUMNS = ["year", "month", "type", "ft_rate"]
