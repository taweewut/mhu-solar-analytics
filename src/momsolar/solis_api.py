"""SolisCloud Platform API client (read-only), standard library only.

Keys come from SolisCloud → Account → Basic Settings → API Management, once Solis enables
API access for the account. Put them in ``.env`` (git-ignored), never in code:

    MOMSOLAR_SOLIS_KEY_ID=...
    MOMSOLAR_SOLIS_KEY_SECRET=...

Every call is a signed POST (Solis's HMAC-SHA1 scheme)::

    Content-MD5   = base64(md5(body))
    Authorization = "API " + KeyId + ":" + base64(hmac_sha1(KeySecret,
                    "POST\\n" + Content-MD5 + "\\n" + Content-Type + "\\n" + Date + "\\n" + path))

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
import sys
import time
import urllib.error
import urllib.request
from dataclasses import dataclass
from email.utils import formatdate
from pathlib import Path
from typing import Any

DEFAULT_URL = "https://www.soliscloud.com:13333"
CONTENT_TYPE = "application/json"
ROOT = Path(__file__).resolve().parents[2]
MIN_INTERVAL = 0.6  # s between calls: the API allows ~2 requests per second


class SolisApiError(RuntimeError):
    pass


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
        return cls(key_id, secret, os.environ.get("MOMSOLAR_SOLIS_API_URL", DEFAULT_URL))

    def post(self, path: str, payload: dict[str, Any]) -> Any:
        wait = self._last + MIN_INTERVAL - time.monotonic()
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
        try:
            with urllib.request.urlopen(req, timeout=30) as res:
                reply = json.load(res)
        except urllib.error.HTTPError as e:
            raise SolisApiError(f"{path}: HTTP {e.code} {e.read().decode(errors='replace')}") from e
        finally:
            self._last = time.monotonic()
        if not reply.get("success") or str(reply.get("code")) != "0":
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
