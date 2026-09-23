"""Background data refresh: re-import every home's raw exports into the data folder, then
pull MomHome's newest readings from the SolisCloud API (budgeted) when its keys are set.

Single-flight — a second POST /refresh while one is running is a no-op.
"""

from __future__ import annotations

import logging
import threading
from datetime import date

from fastapi import BackgroundTasks

from momsolar import fetch_huawei, fetch_solis_api, fetch_solis_day
from momsolar.config import get_settings
from momsolar.solis_api import SolisApiError, SolisClient

log = logging.getLogger(__name__)
_lock = threading.Lock()
_running = False


def is_refreshing() -> bool:
    return _running


def _run() -> None:
    global _running
    s = get_settings()
    try:
        fetch_solis_day.run(s.solis_raw_dir, s.data_dir, s.sheet, log=log.info, home="momhome")
        fetch_huawei.run(s.huawei_raw_dir, s.data_dir, s.sheet, log=log.info, home="mhuhome")
        try:
            client = SolisClient.from_env()
        except SolisApiError:
            client = None  # no API keys: exports only
        if client is not None:
            days, months = fetch_solis_api.incremental_plan(s.data_dir / "momhome", date.today())
            fetch_solis_api.run(
                client, s.data_dir, days, home="momhome", log=log.info, months=months, bms=True
            )
    except Exception:  # keep the API alive; the error lands in the server log
        log.exception("refresh failed")
    finally:
        with _lock:
            _running = False


def start(background_tasks: BackgroundTasks) -> bool:
    """Queue a refresh; False if one is already running."""
    global _running
    with _lock:
        if _running:
            return False
        _running = True
    background_tasks.add_task(_run)
    return True
