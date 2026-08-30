"""The large-cap proxy universe, and the one mistake it exists to prevent."""

from __future__ import annotations

from engine.sip.us500 import EXCLUDE_TYPES, us500_universe

TYPES = {"AAPL": "CS", "MSFT": "CS", "BABA": "ADRC", "SPY": "ETF",
         "TSLA": "CS", "SQ": "UNKNOWN", "ZVZZT": "CS", "WARR": "WARRANT",
         "PFDX": "PFD"}
ORDER = ["TSLA", "AAPL", "BABA", "SPY", "MSFT", "ZVZZT", "SQ", "WARR", "PFDX"]


def test_it_keeps_dollar_volume_order():
    assert us500_universe(ORDER, TYPES) == ["TSLA", "AAPL", "MSFT", "SQ"]


def test_foreign_depositary_receipts_are_dropped():
    """The S&P 500 excludes foreign-domiciled companies; ENGINE-6 kept them."""
    assert "BABA" in ORDER and "BABA" not in us500_universe(ORDER, TYPES)
    assert "ADRC" in EXCLUDE_TYPES


def test_funds_warrants_preferreds_and_test_tickers_are_dropped():
    got = us500_universe(ORDER, TYPES)
    for t in ("SPY", "WARR", "PFDX", "ZVZZT"):
        assert t not in got


def test_unknown_types_are_kept_because_dropping_them_is_survivorship():
    """A ticker the reference API no longer knows is usually a delisted
    company. Dropping it would reintroduce exactly the bias the grouped-bar
    universe was built to avoid."""
    assert "SQ" in us500_universe(ORDER, TYPES)


def test_the_cut_is_applied_after_filtering_not_before():
    """Taking the top N and THEN filtering would silently return fewer than N
    names and quietly change the universe size day to day."""
    order = ["SPY", "BABA"] + [f"S{i}" for i in range(10)]
    types = dict(TYPES)
    types.update({f"S{i}": "CS" for i in range(10)})
    got = us500_universe(order, types, n=5)
    assert got == ["S0", "S1", "S2", "S3", "S4"]
    assert len(got) == 5
