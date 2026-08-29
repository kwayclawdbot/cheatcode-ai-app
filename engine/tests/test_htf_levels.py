"""Levels drawn on the 1-hour and 4-hour charts, not the 5-minute one.

The point of ENGINE-3 is that the stop sits further away. These assert that the
level family actually changed, that a higher-timeframe view can never be ahead
of the minute asking for it, and that a daily bar stamped with today is refused.
"""

from __future__ import annotations

import numpy as np
import pytest

from engine.backtest.mtf import H1, H4, MtfContext
from engine.primitives import htf_levels as hl
from engine.primitives import levels as lv
from engine.tests.fixtures import make_multiday


def _weekdays(n: int, start: str = "2024-01-02") -> list[int]:
    import datetime as dt
    d, out = dt.date.fromisoformat(start), []
    while len(out) < n:
        if d.weekday() < 5:
            out.append(int(d.isoformat().replace("-", "")))
        d += dt.timedelta(days=1)
    return out


def _tape(n_days: int = 45, seed: int = 5, vol: float = 0.09):
    rng = np.random.default_rng(seed)
    days, px = {}, 100.0
    for d in _weekdays(n_days):
        bars = []
        for m in range(240, 1200):
            px = max(1.0, px + float(rng.normal(0, vol if 570 <= m < 960 else vol / 3)))
            bars.append((m, px, px + 0.25, px - 0.25, px + 0.03, 10.0))
        days[d] = bars
    return make_multiday(days)


def _at(s, day, minute):
    idx = np.flatnonzero((s.day == day) & (s.minute == minute))
    return s.view(int(idx[0]))


def test_it_draws_levels_and_labels_them_by_timeframe():
    s = _tape()
    ctx = MtfContext(s)
    day, minute = _weekdays(45)[28], 9 * 60 + 49
    v = _at(s, day, minute)
    got = hl.htf_major_levels(v, ctx.view(H1, day, minute), ctx.view(H4, day, minute))
    assert got, "no levels at all — the test would prove nothing"
    labels = {g.label for g in got}
    assert labels & {"H1H", "H1L", "H4H", "H4L"}, labels
    assert not (labels & {"PH", "PL"}), "5-minute pivots must not be in here"
    assert all(a.price < b.price for a, b in zip(got, got[1:])), "must be ascending"


def test_the_nearest_level_is_further_away_than_the_five_minute_one():
    """Not a performance claim — a mechanical one. The whole correction rests on
    it, so it is asserted rather than hoped for."""
    s = _tape()
    ctx = MtfContext(s)
    wider = same = 0
    for day in sorted(set(int(d) for d in s.day))[20::3]:
        minute = 9 * 60 + 49
        v = _at(s, day, minute)
        px = float(v.close[-1])
        htf = hl.htf_major_levels(v, ctx.view(H1, day, minute), ctx.view(H4, day, minute))
        m5 = lv.major_levels(v, None, 5, 6, 480, 8.0, 2, 25.0)
        a = lv.nearest_below(htf, px)
        b = lv.nearest_below(m5, px)
        if a is None or b is None:
            continue
        if a.price < b.price - 1e-9:
            wider += 1
        elif abs(a.price - b.price) <= 1e-9:
            same += 1
    assert wider + same > 0
    assert wider >= same, f"htf wider on {wider}, identical on {same}"


def test_a_higher_timeframe_view_from_the_future_is_refused():
    s = _tape(12)
    ctx = MtfContext(s)
    day, minute = _weekdays(12)[3], 9 * 60 + 49
    v = _at(s, day, minute)
    ahead = ctx.series(H4).view(len(ctx.series(H4)) - 1)     # the very last 4h bar
    with pytest.raises(ValueError, match="after the 1-minute view"):
        hl.htf_major_levels(v, None, ahead)


def test_a_daily_view_stamped_with_today_is_refused():
    s = _tape(12)
    day, minute = _weekdays(12)[3], 9 * 60 + 49
    v = _at(s, day, minute)
    with pytest.raises(ValueError, match="not strictly before"):
        hl.htf_major_levels(v, None, None, v)


def test_poisoning_the_future_leaves_the_level_set_untouched():
    from engine.series import BarSeries
    s = _tape(25)
    day, minute = _weekdays(25)[14], 10 * 60 + 4
    idx = int(np.flatnonzero((s.day == day) & (s.minute == minute))[0])
    o, h, l, c, vv = (np.array(x, dtype="float64") for x in
                      (s.open, s.high, s.low, s.close, s.volume))
    for arr in (o, h, l, c):
        arr[idx + 1:] *= 4.0
    poisoned = BarSeries(s.symbol, s.timeframe, np.array(s.ts_ms), o, h, l, c, vv,
                         np.array(s.day), np.array(s.minute))
    a = hl.htf_major_levels(s.view(idx), MtfContext(s).view(H1, day, minute),
                            MtfContext(s).view(H4, day, minute))
    ctx2 = MtfContext(poisoned)
    b = hl.htf_major_levels(poisoned.view(idx), ctx2.view(H1, day, minute),
                            ctx2.view(H4, day, minute))
    assert [(x.price, x.label) for x in a] == [(y.price, y.label) for y in b]
