"""Pydantic response models for the API.

These are the public contract the frontend codes against (``frontend/src/lib/types.ts``).
Field names are the snake_case form of the processed-CSV headers in :mod:`momsolar.schema`,
so the static-CSV and API data sources hand the UI identical rows.
"""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel, ConfigDict, Field


class DataGap(BaseModel):
    """A known stretch without monitoring data, and why (shown instead of "not loaded")."""

    model_config = ConfigDict(populate_by_name=True)

    from_: str = Field(alias="from")
    to: str
    reason: str
    reasonTh: str = ""


class HomeOut(BaseModel):
    """One entry of homes.json (display + tariff facts, edited by hand)."""

    id: str
    name: str
    subtitle: str
    subtitleShort: str
    installed: str | None = None  # switch-on date; the first data row if absent
    kwp: float
    battery: dict[str, Any] | None
    inverter: dict[str, Any]
    utility: str
    tariff: dict[str, Any]
    exportRate: float = 0
    meterNetsExport: bool = False
    systemCost: float
    systemCostPlaceholder: bool = True
    dataGaps: list[DataGap] = []


class BmsOut(BaseModel):
    time: str  # the inverter's reading time, local UTC+7
    temp_min_c: float | None
    temp_max_c: float | None
    cell_min_v: float | None
    cell_max_v: float | None
    soc_pct: float | None


class FiveMinOut(BaseModel):
    time: str  # 2026-09-23 00:03:36, local UTC+7
    working_state: str
    alarm_code: str  # "" when no alarm
    pv_w: float | None
    mppt1_w: float | None
    mppt2_w: float | None
    mppt1_v: float | None
    mppt2_v: float | None
    battery_w: float | None  # − = discharging
    grid_w: float | None  # − = importing
    grid_load_w: float | None
    backup_load_w: float | None
    soc_pct: float | None
    soh_pct: float | None
    temp_c: float | None
    gen_w: float | None
    smart_w: float | None
    ac_coupled_w: float | None
    today_yield_kwh: float | None
    today_to_battery_kwh: float | None
    today_from_battery_kwh: float | None
    today_from_grid_kwh: float | None
    today_grid_load_kwh: float | None
    today_backup_load_kwh: float | None
    total_grid_load_kwh: float | None
    total_backup_load_kwh: float | None


class DailyOut(BaseModel):
    date: str  # 2026-09-23
    yield_kwh: float | None
    to_grid_kwh: float | None  # export
    from_grid_kwh: float | None
    to_battery_kwh: float | None
    from_battery_kwh: float | None
    load_kwh: float | None
    generation_kwh: float | None
    gen_kwh: float | None
    smart_load_kwh: float | None
    ac_coupled_kwh: float | None


class BillOut(BaseModel):
    bill_date: str  # "Month Year": the bill date
    year: int  # usage year / month — what bills are matched on
    month: int
    on_peak_units: float | None
    off_peak_units: float | None
    units: float
    on_peak_thb: float | None
    off_peak_thb: float | None
    amount_thb: float  # paid incl. VAT


class FtRateOut(BaseModel):
    year: int
    month: int
    type: int
    ft_rate: float


class FreshnessOut(BaseModel):
    home: str
    latest_reading: str | None
    latest_day: str | None
    last_bill: str | None
    dates: list[str]
    refreshing: bool


class RefreshOut(BaseModel):
    status: str
