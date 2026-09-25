from momsolar.guest import COOKIE, decide, sign, verify

S = "test-secret-0123456789"
NOW = 1_800_000_000


def test_valid_until_expiry_only():
    t = sign(S, NOW + 60)
    assert verify(S, t, NOW) == NOW + 60
    assert verify(S, t, NOW + 60) is None


def test_tampered_or_other_secret_rejected():
    t = sign(S, NOW + 60)
    later = f"{NOW + 999_999}.{t.split('.')[1]}"
    assert verify(S, later, NOW) is None
    assert verify("another-secret-0123456789", t, NOW) is None
    assert verify(S, "garbage", NOW) is None
    assert verify(S, None, NOW) is None
    assert verify("", t, NOW) is None


def test_link_sets_cookie_that_ends_with_the_link():
    t = sign(S, NOW + 7 * 86400)
    status, h = decide(S, f"/?guest={t}", None, NOW)
    assert status == 302
    assert h["Location"] == "/"
    assert h["Set-Cookie"].startswith(f"{COOKIE}={t};")
    assert f"Max-Age={7 * 86400};" in h["Set-Cookie"]


def test_cookie_lets_in_until_expiry():
    t = sign(S, NOW + 60)
    assert decide(S, "/data/homes.json", f"other=1; {COOKIE}={t}", NOW)[0] == 200
    assert decide(S, "/data/homes.json", f"{COOKIE}={t}", NOW + 61)[0] == 403


def test_expired_link_and_no_cookie_refused():
    assert decide(S, f"/?guest={sign(S, NOW - 1)}", None, NOW)[0] == 403
    assert decide(S, "/", None, NOW)[0] == 403
