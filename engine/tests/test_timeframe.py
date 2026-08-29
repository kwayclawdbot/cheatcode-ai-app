"""Higher-timeframe aggregation. Every expected number below is read off the
fixture by hand, not pasted from a run."""

from __future__ import annotations

import numpy as np

from engine.primitives.timeframe import resample, resampled_view
from engine.tests.fixtures import make

# minutes 570..584, fifteen 1-minute bars, three whole 5-minute buckets
BARS = [(570 + k, 100.0 + k, 100.5 + k, 99.5 + k, 100.2 + k, 10.0) for k in range(15)]


def test_three_closed_buckets():
    s = make(BARS)
    r = resample(s.view(14), 5)
    assert len(r) == 3
    assert list(r.minute) == [570, 575, 580]
    assert list(r.open) == [100.0, 105.0, 110.0]
    assert list(r.close) == [104.2, 109.2, 114.2]
    assert list(r.high) == [104.5, 109.5, 114.5]
    assert list(r.low) == [99.5, 104.5, 109.5]
    assert list(r.volume) == [50.0, 50.0, 50.0]


def test_a_forming_bucket_is_not_returned():
    """As of 09:42 the 09:40 bar has not closed, and must not exist."""
    s = make(BARS)
    r = resample(s.view(12), 5)          # minute 582
    assert len(r) == 2
    assert list(r.minute) == [570, 575]
    # and the dropped bucket's bars must not leak into the last kept one
    assert r.high[-1] == 109.5
    assert r.low[-1] == 104.5
    assert r.volume[-1] == 50.0


def test_the_last_closed_bar_is_the_view():
    s = make(BARS)
    v = resampled_view(s.view(14), 5)
    assert v is not None
    assert float(v.close[-1]) == 114.2
    assert v.n == 3


def test_a_five_minute_close_equals_the_minute_close_that_ends_it():
    """The whole entry-timeframe argument rests on this."""
    s = make(BARS)
    for i in (4, 9, 14):
        r = resample(s.view(i), 5)
        assert float(r.close[-1]) == float(s.close[i])


def test_no_closed_bucket_yet():
    s = make(BARS[:3])
    assert len(resample(s.view(2), 5)) == 0
    assert resampled_view(s.view(2), 5) is None


def test_buckets_do_not_straddle_days():
    from engine.tests.fixtures import make_multiday
    s = make_multiday({20240102: BARS[:5], 20240103: BARS[:5]})
    r = resample(s.view(9), 5)
    assert len(r) == 2
    assert list(r.day) == [20240102, 20240103]
    assert np.all(np.diff(r.ts_ms) > 0)
