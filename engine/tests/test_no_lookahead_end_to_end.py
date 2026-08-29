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


# ---------------------------------------------------------------------------
# ENGINE-4. The same attack, extended to both `orb_simple_*.v1` variants and
# strengthened: as well as amputating the 1-minute view, the higher-timeframe
# CONTEXT is rebuilt from a tape that ends at the decision bar, so the 1h/4h
# trend reading has no future to read either.

DEEP = "polygon-deep-v1"
DEEP_SYMBOLS = ["SPY", "QQQ", "IWM"]

deep = pytest.mark.skipif(not has_symbol("SPY", "1m", DEEP),
                          reason="polygon-deep-v1 cache not present")


def _simple_decisions(symbol: str, variant: str, limit: int = 5):
    """(window, local index, global index, day, signal) for the first signals."""
    from engine.models.orb_simple import OrbSimple

    series = load(symbol, "1m", DEEP)
    bounds = series.day_bounds()
    days = sorted(bounds)
    out = []
    for t in range(200, len(days), 53):
        day = days[t]
        win_start = bounds[days[t - 5]][0]
        win = series.subrange(win_start, bounds[day][1])
        m = OrbSimple(variant, snapshot=DEEP)
        for j in range(len(win)):
            minute = int(win.minute[j])
            if int(win.day[j]) != day or not m.wants_bar(minute, day):
                continue
            sig = m.evaluate(win.view(j), day)
            if sig is not None:
                out.append((series, win, j, win_start + j, day, sig))
                break
        if len(out) >= limit:
            break
    return out


@deep
@pytest.mark.parametrize("variant", ["1h", "4h"])
@pytest.mark.parametrize("symbol", DEEP_SYMBOLS)
def test_orb_simple_decides_the_same_thing_with_the_future_amputated(symbol, variant):
    from engine.backtest.mtf import MtfContext
    from engine.models.orb_simple import OrbSimple

    found = _simple_decisions(symbol, variant)
    assert found, f"no {variant} signal for {symbol}; the test would prove nothing"
    for series, win, j, gj, day, sig in found:
        truncated = series.subrange(0, gj + 1)
        ctx = MtfContext(truncated)
        m2 = OrbSimple(variant, ctx_factory=lambda _s, c=ctx: c)
        again = m2.evaluate(win.subrange(0, j + 1).view(j), day)
        assert again is not None, f"{symbol} {variant} {day}: the signal vanished"
        for field in ("side", "entry_type", "entry_price", "stop_price",
                      "target_price", "target_r", "decision_minute",
                      "expiry_minute", "exit_minute"):
            assert getattr(sig, field) == getattr(again, field), \
                f"{symbol} {variant} {day}: {field} moved when the future was removed"
        for k in ("trend", "or_high", "or_low", "trigger_high", "trigger_low",
                  "risk_ps"):
            assert sig.meta[k] == again.meta[k], \
                f"{symbol} {variant} {day}: meta[{k}] moved when the future was removed"


@deep
@pytest.mark.parametrize("variant", ["1h", "4h"])
def test_the_trigger_candle_only_ever_reads_minutes_that_have_printed(variant):
    """The one genuinely new primitive. Its answer must not depend on anything
    after the candle's final minute, and it must equal the aggregate of exactly
    the 1-minute bars in that 5-minute bucket."""
    from engine.models.orb_simple import ENTRY_TF_MINUTES, OrbSimple

    series = load("SPY", "1m", DEEP)
    bounds = series.day_bounds()
    days = sorted(bounds)
    checked = 0
    for day in days[200:2000:211]:
        a, b = bounds[day]
        for gj in range(a, b):
            minute = int(series.minute[gj])
            if minute % ENTRY_TF_MINUTES != ENTRY_TF_MINUTES - 1 or minute < 589:
                continue
            hi, lo = OrbSimple._trigger_candle(series.view(gj), day, minute)
            start = minute - (ENTRY_TF_MINUTES - 1)
            sel = ((series.day[a:b] == day) & (series.minute[a:b] >= start)
                   & (series.minute[a:b] <= minute))
            assert hi == pytest.approx(float(np.max(series.high[a:b][sel])))
            assert lo == pytest.approx(float(np.min(series.low[a:b][sel])))
            # and it is unchanged when everything after the candle is gone
            hi2, lo2 = OrbSimple._trigger_candle(
                series.subrange(0, gj + 1).view(gj), day, minute)
            assert (hi2, lo2) == (hi, lo)
            checked += 1
            if checked > 400:
                return
    assert checked > 0
