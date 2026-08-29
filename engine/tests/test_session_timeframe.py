"""The 1h/4h session convention, checked against numbers read off the fixture.

An ambiguous 4-hour boundary silently changes every trend reading in ENGINE-3,
so the convention is asserted here rather than described in a comment.
"""

from __future__ import annotations

import numpy as np
import pytest

from engine.primitives.timeframe import (RTH_OPEN_MIN, session_bucket_key,
                                         session_resample, session_series)
from engine.tests.fixtures import make, make_multiday


def _day(day: int, lo: int = 240, hi: int = 1200, base: float = 100.0):
    """One session, 04:00-20:00, one bar a minute, price = base + minute/1000."""
    return [(m, base + m / 1000.0, base + m / 1000.0 + 0.4,
             base + m / 1000.0 - 0.4, base + m / 1000.0 + 0.1, 10.0)
            for m in range(lo, hi)]


def test_a_normal_session_makes_seven_hourly_bars_the_last_one_short():
    s = make_multiday({20240102: _day(20240102)})
    r = session_series(s, 60)
    assert list(r.minute) == [570, 630, 690, 750, 810, 870, 930]
    assert list(r.day) == [20240102] * 7


def test_a_normal_session_makes_two_four_hour_bars():
    """09:30-13:30 and 13:30-16:00. The second is 2.5 hours and it still counts:
    dropping the partial would delete every afternoon from the 4h series."""
    s = make_multiday({20240102: _day(20240102)})
    r = session_series(s, 240)
    assert list(r.minute) == [570, 810]
    assert float(r.open[0]) == pytest.approx(100.0 + 570 / 1000.0)
    assert float(r.close[-1]) == pytest.approx(100.0 + 959 / 1000.0 + 0.1)


def test_premarket_and_postmarket_are_not_in_the_bars():
    """A 04:12 print must never set the high of an opening 4-hour bar."""
    bars = _day(20240102)
    bars[0] = (240, 100.0, 999.0, 1.0, 100.0, 10.0)        # a wild 04:00 print
    bars[-1] = (1199, 100.0, 998.0, 2.0, 100.0, 10.0)      # and a wild 19:59 one
    s = make_multiday({20240102: bars})
    for tf in (60, 240):
        r = session_series(s, tf)
        assert float(np.max(r.high)) < 200.0
        assert float(np.min(r.low)) > 50.0


def test_an_early_close_gives_one_four_hour_bar():
    """2024-11-29 closes at 13:00. 09:30-13:00 is 3.5 hours and is the whole
    session's 4-hour history; there is no 13:30 bucket to open."""
    s = make_multiday({20241129: _day(20241129)})
    assert list(session_series(s, 240).minute) == [570]
    assert list(session_series(s, 60).minute) == [570, 630, 690, 750]


def test_a_bucket_is_closed_only_once_a_later_bar_has_printed():
    s = make_multiday({20240102: _day(20240102)})
    idx = {int(m): k for k, m in enumerate(s.minute)}
    # 10:29 — the 09:30 hourly bar has not been proven finished yet
    assert len(session_resample(s.view(idx[629]), 60)) == 0
    # 10:30 — a bar in the next bucket exists, so the 09:30 bar is a fact
    r = session_resample(s.view(idx[630]), 60)
    assert list(r.minute) == [570]
    assert float(r.close[0]) == pytest.approx(100.0 + 629 / 1000.0 + 0.1)


def test_the_final_partial_bucket_closes_at_the_session_close():
    """15:30-16:00 is not a full hour, so "the clock minute printed" can never
    close it. Seeing a post-market bar can, and does."""
    s = make_multiday({20240102: _day(20240102)})
    idx = {int(m): k for k, m in enumerate(s.minute)}
    assert list(session_resample(s.view(idx[959]), 60).minute) == \
        [570, 630, 690, 750, 810, 870]          # 15:30 still forming at 15:59
    assert list(session_resample(s.view(idx[960]), 60).minute) == \
        [570, 630, 690, 750, 810, 870, 930]     # 16:00 print proves it closed


def test_streaming_and_precomputed_agree_bar_for_bar():
    """`session_series` is built once from the whole tape; `session_resample`
    is built from a truncated view. If those two ever disagree, the ENGINE-3
    context is reading a bar that had not closed."""
    days = {20240102 + k: _day(20240102 + k, base=100.0 + k) for k in range(4)}
    s = make_multiday(days)
    full60 = session_series(s, 60)
    keys = full60.day.astype("int64") * 10_000 + full60.minute.astype("int64")
    for i in range(0, len(s), 37):
        k = int(np.searchsorted(
            keys, session_bucket_key(int(s.day[i]), int(s.minute[i]), 60),
            side="left")) - 1
        streamed = session_resample(s.view(i), 60)
        assert len(streamed) == k + 1, f"bar {i} ({int(s.minute[i])})"
        if k >= 0:
            assert list(streamed.close) == list(full60.close[:k + 1])
            assert list(streamed.high) == list(full60.high[:k + 1])
            assert list(streamed.minute) == list(full60.minute[:k + 1])


def test_a_premarket_minute_closes_nothing_of_today():
    key = session_bucket_key(20240102, 8 * 60, 240)
    assert key == 20240102 * 10_000 + RTH_OPEN_MIN


def test_after_the_close_every_bucket_of_the_day_is_closed():
    assert session_bucket_key(20240102, 16 * 60, 240) > 20240102 * 10_000 + 810
