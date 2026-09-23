"""Shared spreadsheet / value parsing."""

from __future__ import annotations

from datetime import date, datetime

import pytest

from momsolar.sheets import cell, fmt_num, parse_date


def test_parse_date_orders():
    assert parse_date("31/3/2026") == date(2026, 3, 31)  # PEA Log: day first
    assert parse_date("5/8/2020", "mdy") == date(2020, 5, 8)  # MEA Log: month first
    assert parse_date("2026-03-31", "mdy") == date(2026, 3, 31)  # a real date cell, any order
    with pytest.raises(ValueError):
        parse_date("Total")


def test_date_cells_become_iso():
    assert cell(datetime(2020, 5, 8)) == "2020-05-08"
    assert (
        cell(2.0) == "2"
        and cell(None) == ""
        and cell(" Inverter Yield (kWh)") == "Inverter Yield (kWh)"
    )


def test_fmt_num_is_compact():
    assert fmt_num(-410.0) == "-410"
    assert fmt_num(0.1532) == "0.1532"
    assert fmt_num(-0.0) == "0"
    assert fmt_num(None) == ""
