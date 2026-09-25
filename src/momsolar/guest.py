"""Guest links that expire on their own — for sharing the dashboard for a few days.

A guest token is ``<expiry unix time>.<signature>``: the signature is an HMAC of the expiry with
``SOLAR_GUEST_SECRET``, so nobody can stretch the date without breaking it, and no list of guests
is kept anywhere. Changing the secret cancels every guest link at once (the family key is separate).

Caddy asks ``serve`` (``forward_auth``) about every request without the family cookie:

- ``/…?guest=<token>`` still valid → 302 to the same path + a cookie that ends when the link does
- a ``solar_guest`` cookie still valid → 200 (Caddy then serves the page)
- anything else → 403

Usage::

    python -m momsolar.guest link --days 7 [--host https://<your host>]   # prints the link
    python -m momsolar.guest serve [--port 8081]                                 # the check service
"""

from __future__ import annotations

import argparse
import base64
import hashlib
import hmac
import os
import sys
import time
from datetime import datetime
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlsplit

COOKIE = "solar_guest"
MAX_DAYS = 90


def _sig(secret: str, exp: int) -> str:
    mac = hmac.new(secret.encode(), str(exp).encode(), hashlib.sha256).digest()[:16]
    return base64.urlsafe_b64encode(mac).decode().rstrip("=")


def sign(secret: str, exp: int) -> str:
    """Token valid until ``exp`` (unix seconds)."""
    return f"{exp}.{_sig(secret, exp)}"


def verify(secret: str, token: str | None, now: float) -> int | None:
    """The token's expiry if it is genuine and not yet expired, else None."""
    if not secret or not token or "." not in token:
        return None
    head, sig = token.split(".", 1)
    if not head.isdigit():
        return None
    exp = int(head)
    if not hmac.compare_digest(sig, _sig(secret, exp)) or exp <= now:
        return None
    return exp


def _cookie(header: str | None, name: str) -> str | None:
    for part in (header or "").split(";"):
        k, _, v = part.strip().partition("=")
        if k == name:
            return v
    return None


def decide(
    secret: str, uri: str, cookie_header: str | None, now: float
) -> tuple[int, dict[str, str]]:
    """The check for one request: (status, extra headers). Pure, for tests."""
    parts = urlsplit(uri or "/")
    link = parse_qs(parts.query).get("guest", [None])[0]
    exp = verify(secret, link, now)
    if exp:
        return 302, {
            "Location": parts.path or "/",
            "Set-Cookie": (
                f"{COOKIE}={link}; Path=/; Max-Age={int(exp - now)}; HttpOnly; SameSite=Lax"
            ),
        }
    if verify(secret, _cookie(cookie_header, COOKIE), now):
        return 200, {}
    return 403, {}


def serve(port: int, secret: str) -> None:
    class Handler(BaseHTTPRequestHandler):
        def do_GET(self) -> None:  # noqa: N802 — http.server API
            uri = self.headers.get("X-Forwarded-Uri", "/")
            status, headers = decide(secret, uri, self.headers.get("Cookie"), time.time())
            body = b"" if status != 403 else b"This guest link has expired or is not valid.\n"
            self.send_response(status)
            for k, v in headers.items():
                self.send_header(k, v)
            self.send_header("Content-Type", "text/plain; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def log_message(self, fmt: str, *args: object) -> None:  # quiet: only refusals
            if " 403 " in fmt % args:
                uri = self.headers.get("X-Forwarded-Uri", "").split("?")[0]
                sys.stderr.write(f"{self.log_date_time_string()} refused {uri[:40]}\n")

    ThreadingHTTPServer(("0.0.0.0", port), Handler).serve_forever()


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(prog="python -m momsolar.guest", description=__doc__.split("\n")[0])
    sub = p.add_subparsers(dest="cmd", required=True)
    lk = sub.add_parser("link", help="print a guest link")
    lk.add_argument("--days", type=float, default=7)
    lk.add_argument("--host", default=os.environ.get("SOLAR_PUBLIC_URL", "https://<your host>"))
    lk.add_argument("--page", default="", help='e.g. "#/mhuhome" to open a home')
    sv = sub.add_parser("serve", help="run the forward_auth check")
    sv.add_argument("--port", type=int, default=8081)
    a = p.parse_args(argv)

    secret = os.environ.get("SOLAR_GUEST_SECRET", "")
    if len(secret) < 16:
        p.error("SOLAR_GUEST_SECRET is missing or too short")
    if a.cmd == "serve":
        serve(a.port, secret)
        return 0
    if not 0 < a.days <= MAX_DAYS:
        p.error(f"--days must be between 0 and {MAX_DAYS}")
    exp = int(time.time() + a.days * 86400)
    print(f"{a.host.rstrip('/')}/?guest={sign(secret, exp)}{a.page}")
    print(f"valid until {datetime.fromtimestamp(exp):%d/%m/%Y %H:%M}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
