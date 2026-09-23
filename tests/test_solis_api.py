"""SolisCloud API client: request signing, key loading and reply handling (no network)."""

from __future__ import annotations

import base64
import hashlib
import hmac
import io
import json

import pytest

from momsolar import solis_api as s

DATE = "Wed, 23 Sep 2026 06:00:00 GMT"
PATH = "/v1/api/inverterDay"


def test_signature_follows_the_solis_scheme():
    body = b'{"sn":"X","time":"2026-09-23"}'
    h = s.signed_headers("key123", "secret", body, PATH, DATE)
    md5 = base64.b64encode(hashlib.md5(body).digest()).decode()
    text = f"POST\n{md5}\napplication/json\n{DATE}\n{PATH}".encode()
    expect = base64.b64encode(hmac.new(b"secret", text, hashlib.sha1).digest()).decode()
    assert h["Content-MD5"] == md5
    assert h["Authorization"] == f"API key123:{expect}"
    assert (h["Content-Type"], h["Date"]) == ("application/json", DATE)


def test_missing_keys_explain_where_to_get_them(monkeypatch, tmp_path):
    monkeypatch.setattr(s, "ROOT", tmp_path)
    monkeypatch.setattr(s, "load_env", lambda *a: None)
    monkeypatch.delenv("MOMSOLAR_SOLIS_KEY_ID", raising=False)
    monkeypatch.delenv("MOMSOLAR_SOLIS_KEY_SECRET", raising=False)
    with pytest.raises(s.SolisApiError, match="API Management"):
        s.SolisClient.from_env()


def test_load_env_reads_quoted_values_without_overriding(monkeypatch, tmp_path):
    env = tmp_path / ".env"
    env.write_text('# keys\nMOMSOLAR_SOLIS_KEY_ID="abc"\nMOMSOLAR_SOLIS_KEY_SECRET=from-file\n')
    monkeypatch.delenv("MOMSOLAR_SOLIS_KEY_ID", raising=False)
    monkeypatch.setenv("MOMSOLAR_SOLIS_KEY_SECRET", "from-shell")
    s.load_env(env)
    assert s.os.environ["MOMSOLAR_SOLIS_KEY_ID"] == "abc"
    assert s.os.environ["MOMSOLAR_SOLIS_KEY_SECRET"] == "from-shell"


class Reply(io.BytesIO):
    def __enter__(self):
        return self

    def __exit__(self, *a):
        return False


def fake_urlopen(reply, seen):
    def urlopen(req, timeout, context=None):
        seen.append(req)
        return Reply(json.dumps(reply).encode())

    return urlopen


def test_post_returns_data_and_signs_the_path(monkeypatch):
    seen = []
    ok = {"success": True, "code": "0", "msg": "success", "data": {"page": {"records": [1]}}}
    monkeypatch.setattr(s.urllib.request, "urlopen", fake_urlopen(ok, seen))
    c = s.SolisClient("id", "secret", "https://example.test")
    assert s.records_of(c.inverters()) == [1]
    req = seen[0]
    assert req.full_url == "https://example.test/v1/api/inverterList"
    assert req.get_header("Authorization").startswith("API id:")


def test_post_raises_on_an_api_error(monkeypatch):
    bad = {"success": False, "code": "Z0001", "msg": "sign error", "data": None}
    monkeypatch.setattr(s.urllib.request, "urlopen", fake_urlopen(bad, []))
    with pytest.raises(s.SolisApiError, match="Z0001 sign error"):
        s.SolisClient("id", "secret").stations()
