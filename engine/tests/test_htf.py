"""Daily trend confirmation. The fixture is ten daily bars whose swing points
are countable by hand; every assertion is read off that table."""

from __future__ import annotations

import numpy as np

from engine.primitives.htf import daily_structure
from engine.series import BarSeries

#      bar:   0     1     2     3     4     5     6     7     8     9
HIGH = [10.0, 9.0, 12.0, 14.0, 11.0, 12.0, 15.0, 18.0, 16.0, 17.0]
LOW = [8.0, 6.0, 9.0, 10.0, 9.0, 8.0, 10.0, 12.0, 13.0, 14.0]
# confirmed fractals with one bar either side:
#   low  @1 = 6, high @3 = 14, low @5 = 8, high @7 = 18
#   -> higher high (18 > 14), higher low (8 > 6), and nothing closes below 8


def _daily(high, low, close=None) -> BarSeries:
    n = len(high)
    c = close if close is not None else [(h + l) / 2 for h, l in zip(high, low)]
    return BarSeries(
        "FIX", "day", (np.arange(n, dtype="int64") + 1) * 86_400_000,
        np.array(c, dtype="float64"), np.array(high, dtype="float64"),
        np.array(low, dtype="float64"), np.array(c, dtype="float64"),
        np.full(n, 1000.0), np.arange(20240101, 20240101 + n, dtype="int32"),
        np.zeros(n, dtype="int32"))


def test_higher_high_and_higher_low_is_an_uptrend():
    s = _daily(HIGH, LOW)
    d = daily_structure(s.view(9), pivot_n=1, lookback=60)
    assert d.direction == "up"
    assert (d.swing_high, d.prior_swing_high) == (18.0, 14.0)
    assert (d.swing_low, d.prior_swing_low) == (8.0, 6.0)


def test_the_mirror_is_a_downtrend():
    s = _daily([30 - x for x in LOW], [30 - x for x in HIGH])
    d = daily_structure(s.view(9), pivot_n=1, lookback=60)
    assert d.direction == "down"
    assert (d.swing_low, d.prior_swing_low) == (12.0, 16.0)


def test_a_broken_swing_low_is_not_an_uptrend():
    """Higher high and higher low, but the low that defines the trend gave way.
    That is the whole point of requiring it to be unbroken."""
    close = [(h + l) / 2 for h, l in zip(HIGH, LOW)]
    close[9] = 7.0                      # below the 8.0 swing low at bar 5
    s = _daily(HIGH, LOW, close)
    d = daily_structure(s.view(9), pivot_n=1, lookback=60)
    assert d.direction == "none"
    assert "swing low broke" in d.reason


def test_no_agreement_is_no_trade():
    """Higher high, lower low: the chart is expanding, not trending."""
    low = list(LOW)
    low[5] = 4.0                        # swing low at 4 is BELOW the prior 6
    s = _daily(HIGH, low)
    d = daily_structure(s.view(9), pivot_n=1, lookback=60)
    assert d.direction == "none"


def test_too_few_swings_is_none_not_a_guess():
    s = _daily(HIGH[:4], LOW[:4])
    assert daily_structure(s.view(3), pivot_n=1, lookback=60).direction == "none"


def test_the_trend_is_read_from_closed_bars_only():
    """A swing needs `pivot_n` bars either side; a fractal at the very end of
    the series is not yet a fact and must not move the answer."""
    s = _daily(HIGH, LOW)
    assert daily_structure(s.view(8), 1, 60).direction == "up"
    assert daily_structure(s.view(7), 1, 60).direction == "none"  # high@7 unconfirmed
