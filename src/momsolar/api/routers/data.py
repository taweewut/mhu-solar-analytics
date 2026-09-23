"""Data routes — the processed CSVs as JSON rows, per home.

Mirrors the static files one-to-one (``data/<home>/*.csv``) so the frontend can switch
between the CSVs and this API with no change to its analytics.
"""

from __future__ import annotations

from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Query

from momsolar.api import service
from momsolar.api.schemas import BillOut, BmsOut, DailyOut, FiveMinOut, FtRateOut, HomeOut
from momsolar.config import Settings, get_settings

router = APIRouter(tags=["data"])


def home_path(home: str, settings: Settings = Depends(get_settings)) -> Path:
    """Resolve ``{home}`` to its data folder, or 404 for an id not in homes.json."""
    path = service.home_dir(settings.data_dir, home)
    if path is None:
        raise HTTPException(status_code=404, detail=f"unknown home {home!r}")
    return path


@router.get("/homes", response_model=list[HomeOut])
def homes(settings: Settings = Depends(get_settings)) -> list[dict]:
    """The homes (homes.json)."""
    return service.homes(settings.data_dir)


@router.get("/homes/{home}/5min", response_model=list[FiveMinOut])
def five_min(
    date: str | None = Query(default=None, pattern=r"^\d{4}-\d{2}-\d{2}$"),
    path: Path = Depends(home_path),
) -> list[dict]:
    """5-minute readings, optionally for one local date (empty for homes without them)."""
    return service.five_min(path, date)


@router.get("/homes/{home}/bms", response_model=list[BmsOut])
def bms(
    date: str | None = Query(default=None, pattern=r"^\d{4}-\d{2}-\d{2}$"),
    path: Path = Depends(home_path),
) -> list[dict]:
    """Battery BMS samples (temperature, cell voltage), optionally for one local date."""
    return service.bms(path, date)


@router.get("/homes/{home}/daily", response_model=list[DailyOut])
def daily(path: Path = Depends(home_path)) -> list[dict]:
    """Daily inverter totals since commissioning."""
    return service.daily(path)


@router.get("/homes/{home}/bills", response_model=list[BillOut])
def bills(path: Path = Depends(home_path)) -> list[dict]:
    """Utility bills (PEA Log / MEA Log)."""
    return service.bills(path)


@router.get("/ft-rates", response_model=list[FtRateOut])
def ft_rates(settings: Settings = Depends(get_settings)) -> list[dict]:
    """Residential Ft history (THB/unit), shared by every home."""
    return service.ft_rates(settings.data_dir)
