"""orb_mtf.v1 on the real tape, with the future removed and with it poisoned.

`test_no_lookahead_end_to_end.py` did this for ENGINE-2. ENGINE-3 adds two
higher timeframes and a level finder that reads them, and "a recent major 4-hour
level" is the single easiest thing in this repo to compute from bars that had
not printed. So the same treatment, extended:

* **amputated** — rebuild the whole context from a tape that STOPS at the
  decision bar. The rest of the session, and every session after it, does not
  exist.
* **poisoned** — keep the tape's length but multiply every bar after the
  decision by four. If any part of the decision moves, something read forward.

Every field of the signal, and every level it named, has to come out identical.

Skipped when the bar cache is absent; the cache is ~400MB and is not committed.
"""

from __future__ import annotations

import numpy as np
import pytest

from engine.backtest.mtf import H1, H4, MtfContext
from engine.cache.load import has_symbol, load
from engine.models.orb_mtf import OrbMtf
from engine.series import BarSeries

pytestmark = pytest.mark.skipif(not has_symbol("AAPL"),
                                reason="bar cache not present")

SYMBOLS = ["AAPL", "NVDA", "SPY"]
FIELDS = ("side", "entry_type", "entry_price", "stop_price", "target_price",
          "expiry_minute", "decision_minute", "exit_minute")
META = ("trend", "or_high", "or_low", "stop_level", "stop_label",
        "target_level", "target_label", "risk_ps", "reward_ps", "n_levels")


def _amputate(s: BarSeries, cut: int) -> BarSeries:
    return s.subrange(0, cut + 1)


def _poison(s: BarSeries, cut: int, factor: float = 4.0) -> BarSeries:
    o, h, l, c, v = (np.array(x, dtype="float64") for x in
                     (s.open, s.high, s.low, s.close, s.volume))
    for arr in (o, h, l, c):
        arr[cut + 1:] *= factor
    return BarSeries(s.symbol, s.timeframe, np.array(s.ts_ms), o, h, l, c, v,
                     np.array(s.day), np.array(s.minute))


def _signals(symbol: str, limit: int = 5):
    """The first few real signals, with the global bar index each was made on."""
    series = load(symbol, "1m")
    ctx = MtfContext(series)
    bounds = series.day_bounds()
    days = sorted(bounds)
    out = []
    for t in range(3, len(days)):
        day = days[t]
        win_start = bounds[days[t - 3]][0]
        win = series.subrange(win_start, bounds[day][1])
        m = OrbMtf(ctx_factory=lambda _s: ctx)
        for j in range(bounds[day][0] - win_start, len(win)):
            minute = int(win.minute[j])
            if not m.wants_bar(minute, day):
                continue
            sig = m.evaluate(win.view(j), day)
            if sig is not None:
                out.append((series, win_start + j, day, sig))
                break
        if len(out) >= limit:
            break
    return out


def _redecide(series: BarSeries, gj: int, day: int, warmup_start: int):
    ctx = MtfContext(series)
    m = OrbMtf(ctx_factory=lambda _s: ctx)
    win = series.subrange(warmup_start, gj + 1)
    j = gj - warmup_start
    for k in range(j + 1):
        minute = int(win.minute[k])
        if int(win.day[k]) != day or not m.wants_bar(minute, day):
            continue
        sig = m.evaluate(win.view(k), day)
        if sig is not None:
            return sig
    return None


@pytest.mark.parametrize("symbol", SYMBOLS)
def test_the_model_decides_the_same_thing_with_the_future_amputated(symbol):
    found = _signals(symbol)
    assert found, f"no signal found for {symbol}; the test would prove nothing"
    for series, gj, day, sig in found:
        start = _window_start(series, day, 3)
        again = _redecide(_amputate(series, gj), gj, day, start)
        _same(sig, again, symbol, day, "amputated")


@pytest.mark.parametrize("symbol", SYMBOLS)
def test_the_model_decides_the_same_thing_with_the_future_poisoned(symbol):
    found = _signals(symbol)
    assert found, f"no signal found for {symbol}"
    for series, gj, day, sig in found:
        start = _window_start(series, day, 3)
        again = _redecide(_poison(series, gj), gj, day, start)
        _same(sig, again, symbol, day, "poisoned")


@pytest.mark.parametrize("symbol", SYMBOLS)
def test_the_higher_timeframe_bars_never_run_ahead_of_the_minute(symbol):
    """Across a whole year of decision minutes: the 1h and 4h bar the context
    hands out must always have finished before the minute asking for it."""
    series = load(symbol, "1m")
    ctx = MtfContext(series)
    for day in sorted(series.day_bounds())[5::19]:
        for minute in (9 * 60 + 49, 10 * 60 + 34, 10 * 60 + 59):
            for tf in (H1, H4):
                v = ctx.view(tf, day, minute)
                if v is None:
                    continue
                assert int(v.day[-1]) < day or (
                    int(v.day[-1]) == day and int(v.minute[-1]) + tf <= minute), \
                    f"{symbol} {day} {minute}: {tf}m bar at {int(v.minute[-1])}"


def _window_start(series: BarSeries, day: int, warmup: int) -> int:
    bounds = series.day_bounds()
    days = sorted(bounds)
    t = days.index(day)
    return bounds[days[t - warmup]][0]


def _same(sig, again, symbol, day, how):
    assert again is not None, f"{symbol} {day}: the signal vanished when {how}"
    for f in FIELDS:
        assert getattr(sig, f) == getattr(again, f), \
            f"{symbol} {day}: {f} moved when the future was {how}"
    for k in META:
        assert sig.meta[k] == again.meta[k], \
            f"{symbol} {day}: meta[{k}] moved when the future was {how}"
