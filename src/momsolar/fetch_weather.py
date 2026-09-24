"""Hourly weather at a home's site from Open-Meteo, for the Day chart's weather row.

Open-Meteo is free and needs no key. It is model data for the location (≈1 km grid), not a
local sensor: WMO weather code, cloud cover, rain and shortwave radiation per hour. The
location comes from ``homes.json → location`` (git-ignored, rounded to 2 decimals before it is
sent); a home without one is skipped.

* Recent days (default): the forecast API with ``past_days`` — today's later hours are forecast.
* ``--since DATE``: the historical archive (ERA5) for older days, then the recent days.

Rows merge by hour into ``<home>/weather.csv``. ``--if-older MIN`` skips the call when the file
was written less than MIN minutes ago, so the 15-min poll can call it without hammering the API.

    python -m momsolar.fetch_weather --home momhome                  # last 3 days + today
    python -m momsolar.fetch_weather --home momhome --since 2026-03-29
"""

from __future__ import annotations

import argparse
import json
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import date, timedelta
from pathlib import Path

from momsolar.schema import HOMES_FILE, WEATHER_COLUMNS, WEATHER_FILE
from momsolar.sheets import fmt_num, merge, read_csv, write_csv
from momsolar.solis_api import ROOT, ssl_context

FORECAST = "https://api.open-meteo.com/v1/forecast"
ARCHIVE = "https://archive-api.open-meteo.com/v1/archive"
HOURLY = "weather_code,cloud_cover,precipitation,shortwave_radiation"
TZ = "Asia/Bangkok"
ARCHIVE_LAG_DAYS = 5  # the archive trails today by a few days; newer days come from the forecast


class WeatherError(RuntimeError):
    pass


def home_location(data: Path, home: str) -> tuple[float, float] | None:
    path = data / HOMES_FILE
    if not path.exists():
        return None
    for h in json.loads(path.read_text(encoding="utf-8")):
        if h.get("id") == home and h.get("location"):
            loc = h["location"]
            return round(float(loc["lat"]), 2), round(float(loc["lon"]), 2)
    return None


def get(url: str, params: dict) -> dict:
    full = f"{url}?{urllib.parse.urlencode(params)}"
    try:
        with urllib.request.urlopen(full, timeout=30, context=ssl_context()) as res:
            return json.load(res)
    except urllib.error.HTTPError as e:
        raise WeatherError(f"{url}: HTTP {e.code} {e.read().decode(errors='replace')[:200]}") from e
    except urllib.error.URLError as e:
        raise WeatherError(f"{url}: {e.reason}") from e


def rows_from(reply: dict) -> list[dict[str, str]]:
    """Open-Meteo hourly arrays → weather.csv rows (hours with no code are skipped)."""
    h = reply.get("hourly") or {}
    out = []

    def val(key: str, i: int):
        col = h.get(key) or []
        return col[i] if i < len(col) else None

    for i, t in enumerate(h.get("time") or []):
        code = val("weather_code", i)
        if code is None:
            continue
        out.append(
            {
                "Time": t.replace("T", " "),
                "Code": str(int(code)),
                "Cloud(%)": fmt_num(val("cloud_cover", i)),
                "Rain(mm)": fmt_num(val("precipitation", i)),
                "Radiation(W/m2)": fmt_num(val("shortwave_radiation", i)),
            }
        )
    return out


def run(
    out: Path, home: str, since: str | None = None, today: date | None = None, log=print
) -> int:
    """Fetch and merge; returns the rows in weather.csv (0 when the home has no location)."""
    loc = home_location(out, home)
    if not loc:
        log(f"weather: {home} has no location in homes.json, skipped")
        return 0
    lat, lon = loc
    today = today or date.today()
    base = {"latitude": lat, "longitude": lon, "hourly": HOURLY, "timezone": TZ}
    new: list[dict] = []
    if since:
        end = today - timedelta(days=ARCHIVE_LAG_DAYS)
        if date.fromisoformat(since) <= end:
            reply = get(ARCHIVE, base | {"start_date": since, "end_date": end.isoformat()})
            new += rows_from(reply)
            log(f"weather archive {since} … {end}: {len(new)} hours")
    past = ARCHIVE_LAG_DAYS + 2 if since else 3
    recent = rows_from(get(FORECAST, base | {"past_days": past, "forecast_days": 1}))
    log(f"weather recent ({past} days + today): {len(recent)} hours")
    new += recent  # newer (forecast-model) rows win for the overlapping days
    path = out / home / WEATHER_FILE
    rows = merge(read_csv(path), new, key=lambda r: r["Time"])
    write_csv(path, WEATHER_COLUMNS, rows)
    return len(rows)


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("--home", default="momhome")
    ap.add_argument("--out", type=Path, default=ROOT / "frontend" / "public" / "data")
    ap.add_argument("--since", help="also fetch the archive from YYYY-MM-DD")
    ap.add_argument(
        "--if-older", type=float, default=0, help="skip if weather.csv is newer (minutes)"
    )
    args = ap.parse_args(argv)
    path = args.out / args.home / WEATHER_FILE
    if (
        args.if_older
        and path.exists()
        and (time.time() - path.stat().st_mtime) < args.if_older * 60
    ):
        return 0
    try:
        n = run(args.out, args.home, args.since)
    except WeatherError as e:
        print(f"weather error: {e}", file=sys.stderr)
        return 1
    if n:
        print(f"wrote {path} ({n} rows)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
