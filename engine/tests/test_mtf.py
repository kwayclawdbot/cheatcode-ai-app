"""The multi-timeframe context: what the 1h and 4h charts said, as of a minute.

The context is built once from the whole tape, which is only safe because a
bucket's OHLC is a function of its own minutes alone. What has to be right is
the INDEX — which bucket a decision is allowed to see. That is what these
assert, by hand.
"""

from __future__ import annotations

import numpy as np
import pytest

from engine.backtest.mtf import H1, H4, MtfContext
from engine.primitives.htf import daily_structure
from engine.primitives.timeframe import session_resample
from engine.tests.fixtures import make_multiday


def _session(day: int, base: float, drift: float = 0.0):
    return [(m, base + (m - 570) * drift, base + (m - 570) * drift + 0.4,
             base + (m - 570) * drift - 0.4, base + (m - 570) * drift + 0.1, 10.0)
            for m in range(240, 1200)]


def _tape(n_days: int = 40, seed: int = 3):
    rng = np.random.default_rng(seed)
    days, px = {}, 100.0
    for k in range(n_days):
        d = 20240102 + k
        bars = []
        for m in range(240, 1200):
            px = max(1.0, px + float(rng.normal(0, 0.05)))
            bars.append((m, px, px + 0.3, px - 0.3, px + 0.05, 10.0))
        days[d] = bars
    return make_multiday(days)


def test_nothing_of_today_is_visible_before_the_first_bucket_closes():
    """At 09:49 the last closed 4-hour bar is YESTERDAY's afternoon bar. At
    09:49 the last closed 1-hour bar is yesterday's 15:30 bar."""
    s = _tape(5)
    ctx = MtfContext(s)
    for tf in (H1, H4):
        v = ctx.view(tf, 20240105, 9 * 60 + 49)
        assert v is not None
        assert int(v.day[-1]) == 20240104


def test_the_first_hourly_bar_of_today_appears_at_ten_thirty_and_not_before():
    s = _tape(5)
    ctx = MtfContext(s)
    assert int(ctx.view(H1, 20240105, 10 * 60 + 29).day[-1]) == 20240104
    v = ctx.view(H1, 20240105, 10 * 60 + 34)
    assert int(v.day[-1]) == 20240105 and int(v.minute[-1]) == 570


def test_the_four_hour_chart_does_not_move_inside_the_trigger_window():
    """09:49 to 10:59 all sit inside the 09:30-13:30 bucket, so every decision
    in the window reads the same 4-hour bar: yesterday's afternoon."""
    s = _tape(5)
    ctx = MtfContext(s)
    seen = {ctx.closed_index(H4, 20240105, m) for m in range(9 * 60 + 49, 11 * 60)}
    assert len(seen) == 1


def test_the_index_never_points_at_a_bar_that_had_not_finished():
    """The bar the context hands out must end at or before the minute asking."""
    s = _tape(12)
    ctx = MtfContext(s)
    for i in range(0, len(s), 211):
        day, minute = int(s.day[i]), int(s.minute[i])
        for tf in (H1, H4):
            v = ctx.view(tf, day, minute)
            if v is not None:
                assert int(v.ts_ms[-1]) <= int(s.ts_ms[i])


def test_the_precomputed_view_equals_one_built_from_a_truncated_tape():
    """The attack that matters: rebuild the higher timeframe from bars that stop
    at the decision minute, and demand the same answer."""
    s = _tape(12)
    ctx = MtfContext(s)
    for i in range(2000, len(s), 733):
        day, minute = int(s.day[i]), int(s.minute[i])
        for tf in (H1, H4):
            streamed = session_resample(s.view(i), tf)
            v = ctx.view(tf, day, minute)
            if v is None:
                assert len(streamed) == 0
                continue
            assert v.n == len(streamed)
            assert list(v.close) == list(streamed.close)
            assert list(v.high) == list(streamed.high)
            assert list(v.low) == list(streamed.low)


def test_the_trend_matches_reading_the_structure_directly():
    s = _tape(30)
    ctx = MtfContext(s)
    for day in sorted(set(int(d) for d in s.day))[10::7]:
        for tf in (H1, H4):
            v = ctx.view(tf, day, 9 * 60 + 49)
            expect = daily_structure(v, 2, 120).direction if v is not None else "none"
            assert ctx.trend(tf, day, 9 * 60 + 49) == expect


def test_alignment_needs_both_charts_and_forgives_nothing():
    class _Fake(MtfContext):
        def __init__(self, a, b):
            self._a, self._b = a, b

        def trend(self, tf, day, minute):
            return self._a if tf == H1 else self._b

    assert _Fake("up", "up").aligned(1, 2) == "up"
    assert _Fake("down", "down").aligned(1, 2) == "down"
    assert _Fake("up", "down").aligned(1, 2) == "none"
    assert _Fake("up", "none").aligned(1, 2) == "none"
    assert _Fake("none", "none").aligned(1, 2) == "none"


def test_poisoning_the_future_does_not_move_the_reading():
    """Multiply every bar after the decision minute by three and rebuild the
    whole context. The 1h and 4h trend, and the bars behind them, must not
    budge — if they do, something downstream of `closed_index` is reading
    forward."""
    s = _tape(20)
    ctx = MtfContext(s)
    cut = len(s) // 2
    day, minute = int(s.day[cut]), int(s.minute[cut])
    poisoned = _poison(s, cut)
    ctx2 = MtfContext(poisoned)
    for tf in (H1, H4):
        a, b = ctx.view(tf, day, minute), ctx2.view(tf, day, minute)
        assert (a is None) == (b is None)
        if a is not None:
            assert list(a.close) == list(b.close)
            assert list(a.high) == list(b.high)
        assert ctx.trend(tf, day, minute) == ctx2.trend(tf, day, minute)


def _poison(s, cut: int, factor: float = 3.0):
    from engine.series import BarSeries
    o, h, l, c, v = (np.array(x, dtype="float64") for x in
                     (s.open, s.high, s.low, s.close, s.volume))
    for arr in (o, h, l, c):
        arr[cut + 1:] *= factor
    return BarSeries(s.symbol, s.timeframe, np.array(s.ts_ms), o, h, l, c, v,
                     np.array(s.day), np.array(s.minute))
