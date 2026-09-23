"""SolisCloud Platform API client (read-only), standard library only.

Keys come from SolisCloud → Account → Basic Settings → API Management, once Solis enables
API access for the account. Put them in ``.env`` (git-ignored), never in code:

    MOMSOLAR_SOLIS_KEY_ID=...
    MOMSOLAR_SOLIS_KEY_SECRET=...

Every call is a signed POST (Solis's HMAC-SHA1 scheme)::

    Content-MD5   = base64(md5(body))
    Authorization = "API " + KeyId + ":" + base64(hmac_sha1(KeySecret,
                    "POST\\n" + Content-MD5 + "\\n" + Content-Type + "\\n" + Date + "\\n" + path))

Rate limits: the API document gives 2 requests/sec per endpoint; SolisCloud also answers
``R0000 … too many request 200 times in 1DAYS`` (undocumented; seen per endpoint, reset
presumably at UTC midnight). So calls are spaced 1 s apart, and a per-endpoint daily budget
(``MOMSOLAR_SOLIS_DAILY_BUDGET``, default 180) is kept in ``.solis_usage.json`` (git-ignored):
past 80 % of it calls slow to one per 5 s, at the budget they stop, and an R0000 blocks every
call until the next UTC day.

Probe the account first — it saves the raw JSON to ``raw_api/`` (git-ignored) so the field
mapping onto ``5min.csv`` / ``daily.csv`` is built from real responses::

    python -m momsolar.solis_api probe --date 2026-09-23
"""

from __future__ import annotations

import argparse
import base64
import hashlib
import hmac
import json
import os
import ssl
import sys
import time
import urllib.error
import urllib.request
from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta
from email.utils import formatdate
from pathlib import Path
from typing import Any

DEFAULT_URL = "https://www.soliscloud.com:13333"
CONTENT_TYPE = "application/json"
ROOT = Path(__file__).resolve().parents[2]
MIN_INTERVAL = 1.0  # s between calls: half the documented 2 requests/sec
SLOW_INTERVAL = 5.0  # s between calls once an endpoint has used 80 % of its daily budget
DEFAULT_BUDGET = 180  # calls per endpoint per UTC day, under the observed 200/day cap
USAGE_FILE = ROOT / ".solis_usage.json"


class SolisApiError(RuntimeError):
    pass


class QuotaExceeded(SolisApiError):
    """The daily budget is used up, or SolisCloud said so (R0000): stop, don't retry."""


def utc_day() -> str:
    return datetime.now(UTC).date().isoformat()


def resumes_at() -> str:
    """When a used-up daily budget resets: the next 00:00 UTC, in local time."""
    now = datetime.now(UTC)
    midnight = datetime(now.year, now.month, now.day, tzinfo=UTC) + timedelta(days=1)
    return midnight.astimezone().strftime("%Y-%m-%d %H:%M")


@dataclass
class Usage:
    """Calls per endpoint per UTC day, persisted so separate runs share one budget."""

    path: Path | None = None  # None: in memory only
    budget: int = DEFAULT_BUDGET
    state: dict = field(default_factory=dict)

    def __post_init__(self) -> None:
        if self.path is not None and self.path.exists():
            try:
                self.state = json.loads(self.path.read_text(encoding="utf-8"))
            except ValueError:
                self.state = {}
        self._roll()

    def _roll(self) -> None:
        if self.state.get("day") != utc_day():
            blocked = self.state.get("blocked_day")
            self.state = {"day": utc_day(), "calls": {}}
            if blocked and blocked >= utc_day():
                self.state["blocked_day"] = blocked

    def _save(self) -> None:
        if self.path is not None:
            tmp = self.path.with_suffix(".tmp")
            tmp.write_text(json.dumps(self.state, indent=2), encoding="utf-8")
            tmp.replace(self.path)

    def calls(self, endpoint: str) -> int:
        self._roll()
        return self.state["calls"].get(endpoint, 0)

    def interval(self, endpoint: str) -> float:
        """Seconds to keep between calls; raises QuotaExceeded when none are left."""
        self._roll()
        if self.state.get("blocked_day", "") >= utc_day():
            raise QuotaExceeded(
                f"{endpoint}: SolisCloud refused (daily cap) today; try again after 00:00 UTC"
            )
        n = self.calls(endpoint)
        if n >= self.budget:
            raise QuotaExceeded(
                f"{endpoint}: {n}/{self.budget} calls used today (UTC); stopping below "
                "SolisCloud's 200/day cap. Resumes after 00:00 UTC (07:00 in Thailand)."
            )
        return SLOW_INTERVAL if n >= self.budget * 0.8 else MIN_INTERVAL

    def record(self, endpoint: str) -> None:
        self._roll()
        self.state["calls"][endpoint] = self.calls(endpoint) + 1
        self._save()

    def block(self) -> None:
        self.state["blocked_day"] = utc_day()
        self._save()


def ssl_context() -> ssl.SSLContext:
    """CA bundle from certifi when installed: python.org's macOS build ships none of its own."""
    try:
        import certifi
    except ImportError:
        return ssl.create_default_context()
    return ssl.create_default_context(cafile=certifi.where())


def content_md5(body: bytes) -> str:
    return base64.b64encode(hashlib.md5(body).digest()).decode()


def sign(secret: str, md5: str, date: str, path: str) -> str:
    text = f"POST\n{md5}\n{CONTENT_TYPE}\n{date}\n{path}"
    digest = hmac.new(secret.encode(), text.encode(), hashlib.sha1).digest()
    return base64.b64encode(digest).decode()


def signed_headers(key_id: str, secret: str, body: bytes, path: str, date: str) -> dict[str, str]:
    md5 = content_md5(body)
    return {
        "Content-Type": CONTENT_TYPE,
        "Content-MD5": md5,
        "Date": date,
        "Authorization": f"API {key_id}:{sign(secret, md5, date, path)}",
    }


def load_env(path: Path = ROOT / ".env") -> None:
    """Load KEY=value lines from .env into os.environ (values already set win)."""
    if not path.exists():
        return
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


@dataclass
class SolisClient:
    key_id: str
    secret: str
    url: str = DEFAULT_URL
    usage: Usage | None = None  # None: no daily budget (tests)
    _last: float = 0.0

    @classmethod
    def from_env(cls) -> SolisClient:
        load_env()
        key_id = os.environ.get("MOMSOLAR_SOLIS_KEY_ID", "")
        secret = os.environ.get("MOMSOLAR_SOLIS_KEY_SECRET", "")
        if not key_id or not secret:
            raise SolisApiError(
                "Set MOMSOLAR_SOLIS_KEY_ID and MOMSOLAR_SOLIS_KEY_SECRET in .env "
                "(SolisCloud → Account → Basic Settings → API Management)."
            )
        budget = int(os.environ.get("MOMSOLAR_SOLIS_DAILY_BUDGET") or DEFAULT_BUDGET)
        url = os.environ.get("MOMSOLAR_SOLIS_API_URL", DEFAULT_URL)
        return cls(key_id, secret, url, Usage(USAGE_FILE, budget))

    def post(self, path: str, payload: dict[str, Any]) -> Any:
        interval = self.usage.interval(path) if self.usage else MIN_INTERVAL
        wait = self._last + interval - time.monotonic()
        if wait > 0:
            time.sleep(wait)
        body = json.dumps(payload, separators=(",", ":")).encode()
        date = formatdate(usegmt=True)
        req = urllib.request.Request(
            self.url + path,
            data=body,
            method="POST",
            headers=signed_headers(self.key_id, self.secret, body, path, date),
        )
        if self.usage:
            self.usage.record(path)  # count it even if it fails: the server may have seen it
        try:
            with urllib.request.urlopen(req, timeout=30, context=ssl_context()) as res:
                reply = json.load(res)
        except urllib.error.HTTPError as e:
            raise SolisApiError(f"{path}: HTTP {e.code} {e.read().decode(errors='replace')}") from e
        except urllib.error.URLError as e:
            raise SolisApiError(f"{path}: {e.reason}") from e
        finally:
            self._last = time.monotonic()
        code, msg = str(reply.get("code")), str(reply.get("msg"))
        if code == "R0000" and "too many" in msg.lower():
            if self.usage:
                self.usage.block()
            raise QuotaExceeded(f"{path}: {code} {msg}")
        if not reply.get("success") or code != "0":
            raise SolisApiError(f"{path}: {reply.get('code')} {reply.get('msg')}")
        return reply.get("data")

    # ── Endpoints ──────────────────────────────────────────────────────────────────
    def stations(self) -> Any:
        return self.post("/v1/api/userStationList", {"pageNo": 1, "pageSize": 20})

    def inverters(self) -> Any:
        return self.post("/v1/api/inverterList", {"pageNo": 1, "pageSize": 20})

    def inverter_detail(self, sn: str) -> Any:
        return self.post("/v1/api/inverterDetail", {"sn": sn})

    def inverter_day(self, sn: str, day: str, tz: int = 7) -> Any:
        """5-minute readings for one day (``day`` = YYYY-MM-DD, site time)."""
        payload = {"sn": sn, "money": "THB", "time": day, "timeZone": tz}
        return self.post("/v1/api/inverterDay", payload)

    def inverter_month(self, sn: str, month: str) -> Any:
        """One row per day for a month (``month`` = YYYY-MM)."""
        return self.post("/v1/api/inverterMonth", {"sn": sn, "money": "THB", "month": month})


def records_of(data: Any) -> list[dict]:
    """The list inside a paged reply ({"page": {"records": [...]}}) or a bare list."""
    if isinstance(data, list):
        return data
    if isinstance(data, dict):
        page = data.get("page") or data.get("inverterStatusVo") or {}
        if isinstance(page, dict) and isinstance(page.get("records"), list):
            return page["records"]
        if isinstance(data.get("records"), list):
            return data["records"]
    return []


def probe(day: str, out: Path) -> None:
    """Save the raw replies for the account's stations and inverters (no mapping yet)."""
    client = SolisClient.from_env()
    out.mkdir(parents=True, exist_ok=True)

    def save(name: str, data: Any) -> None:
        path = out / f"{name}.json"
        path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
        print(f"saved {path.relative_to(ROOT) if path.is_relative_to(ROOT) else path}")

    save("stations", client.stations())
    inverters = client.inverters()
    save("inverters", inverters)
    for inv in records_of(inverters):
        sn = inv.get("sn")
        if not sn:
            continue
        tail = str(sn)[-4:]
        save(f"inverter_{tail}_detail", client.inverter_detail(sn))
        save(f"inverter_{tail}_day_{day}", client.inverter_day(sn, day))
        save(f"inverter_{tail}_month_{day[:7]}", client.inverter_month(sn, day[:7]))


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n", 1)[0])
    sub = ap.add_subparsers(dest="cmd", required=True)
    p = sub.add_parser("probe", help="save raw API replies to raw_api/ for inspection")
    p.add_argument("--date", default=time.strftime("%Y-%m-%d"), help="day for inverterDay")
    p.add_argument("--out", type=Path, default=ROOT / "raw_api")
    args = ap.parse_args(argv)
    try:
        probe(args.date, args.out)
    except SolisApiError as e:
        print(f"error: {e}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
