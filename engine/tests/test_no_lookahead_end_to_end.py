"""The whole model, on the real tape, with the future physically removed.

The unit-level attacks in `test_no_lookahead.py` cover primitives one at a
time. This one takes `orb_htf_structural.v1` as it actually runs — daily trend
lookup, level finder, opening range, trigger, stop, target — and asks for its
decision twice: once from the real series, and once from a series that ends at
the decision bar, so the rest of the session does not exist. Every field of the
signal has to match.

Skipped when the bar cache is absent; the cache is ~400MB and is not committed.
"""

from __future__ import annotations

import numpy as np
import pytest

from engine.cache.load import has_symbol, load
from engine.models.orb_htf_structural import OrbHtfStructural

pytestmark = pytest.mark.skipif(not has_symbol("AAPL"),
                                reason="bar cache not present")

SYMBOLS = ["AAPL", "NVDA", "SPY"]


def _decisions(symbol: str, limit: int = 6):
    """Signals the model emits, with the window each one was made in."""
    series = load(symbol, "1m")
    bounds = series.day_bounds()
    days = sorted(bounds)
    out = []
    for t in range(5, len(days)):
        day = days[t]
        win = series.subrange(bounds[days[t - 5]][0], bounds[day][1])
        m = OrbHtfStructural()
        for j in range(len(win)):
            minute = int(win.minute[j])
            if int(win.day[j]) != day or not m.wants_bar(minute, day):
                continue
            sig = m.evaluate(win.view(j), day)
            if sig is not None:
                out.append((win, j, day, sig))
                break
        if len(out) >= limit:
            break
    return out


@pytest.mark.parametrize("symbol", SYMBOLS)
def test_the_model_decides_the_same_thing_without_the_rest_of_the_day(symbol):
    found = _decisions(symbol)
    assert found, f"no signal found for {symbol}; the test would prove nothing"
    for win, j, day, sig in found:
        amputated = win.subrange(0, j + 1)
        m2 = OrbHtfStructural()
        again = m2.evaluate(amputated.view(j), day)
        assert again is not None, f"{symbol} {day}: the signal vanished"
        for field in ("side", "entry_type", "entry_price", "stop_price",
                      "target_price", "expiry_minute", "decision_minute"):
            assert getattr(sig, field) == getattr(again, field), \
                f"{symbol} {day}: {field} moved when the future was removed"
        for key in ("stop_level", "target_level", "risk_ps", "reward_ps",
                    "daily_trend", "or_high", "or_low", "n_levels"):
            assert sig.meta[key] == again.meta[key], \
                f"{symbol} {day}: meta[{key}] moved when the future was removed"


@pytest.mark.parametrize("symbol", SYMBOLS)
def test_the_daily_context_never_carries_todays_bar(symbol):
    """`major_levels` refuses a daily view stamped with the trading day. This
    asserts the refusal is never triggered in production — i.e. the wiring is
    right, not merely defended."""
    from engine.backtest.htf import prior_daily_view

    series = load(symbol, "1m")
    days = sorted(series.day_bounds())
    for day in days[5::37]:
        dv = prior_daily_view(symbol, day)
        if dv is None:
            continue
        assert int(dv.day[-1]) < day
        assert np.all(dv.day < day)
