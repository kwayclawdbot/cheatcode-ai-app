"""What counts as a major level — the piece the stop rule stands on."""

from __future__ import annotations

import numpy as np
import pytest

from engine.primitives.levels import (MajorLevel, _touch_count, major_levels,
                                      nearest_above, nearest_below,
                                      reference_levels)
from engine.series import BarSeries
from engine.tests.fixtures import make_multiday

# Two days. Prior day has RTH bars at 09:30 and 10:00 and a post-market bar at
# 16:01; today has a premarket bar at 05:00 and one RTH bar at 09:31.
#
#   PDH/PDL come from the prior day's RTH only  -> 106 / 98
#   PMH/PML come from today's premarket         -> 112 / 107
#   ONH/ONL span 16:01 yesterday .. 09:30 today -> max(110,112) / min(104,107)
DAY1 = [(240, 100.0, 101.0, 99.0, 100.5, 10.0),
        (570, 100.0, 105.0, 98.0, 104.0, 10.0),
        (600, 104.0, 106.0, 103.0, 105.0, 10.0),
        (961, 105.0, 110.0, 104.0, 109.0, 10.0)]
DAY2 = [(300, 109.0, 112.0, 107.0, 111.0, 10.0),
        (571, 111.0, 113.0, 110.0, 112.0, 10.0)]


def _two_day():
    return make_multiday({20240102: DAY1, 20240103: DAY2})


def test_reference_levels_are_the_session_boundaries():
    v = _two_day().view(5)
    got = {lv.label: lv.price for lv in reference_levels(v)}
    assert got["PDH"] == 106.0
    assert got["PDL"] == 98.0
    assert got["PMH"] == 112.0
    assert got["PML"] == 107.0
    assert got["ONH"] == 112.0
    assert got["ONL"] == 104.0


def test_a_touch_is_a_visit_not_a_bar():
    """Three consecutive bars stalling at a level is one touch, not three."""
    prices = np.array([10.0, 10.0, 10.0, 5.0, 5.0, 5.0, 5.0, 10.0])
    assert _touch_count(prices, 10.0, 0.01, min_sep=3) == 2
    assert _touch_count(prices, 10.0, 0.01, min_sep=10) == 1
    assert _touch_count(prices, 7.0, 0.01, min_sep=3) == 0


def test_levels_within_the_cluster_band_are_one_level():
    from engine.primitives.levels import _cluster
    got = _cluster([MajorLevel(100.0, "low", "PL", 2, 5),
                    MajorLevel(100.10, "low", "PDL", 1, -1),
                    MajorLevel(101.0, "high", "PH", 3, 9)], cluster_bps=25.0)
    assert len(got) == 2
    # the reference level outranks the pivot inside the cluster, and the
    # cluster keeps the best touch count it saw
    assert got[0].label == "PDL"
    assert got[0].touches == 2
    assert got[1].label == "PH"


def test_nearest_either_side():
    ls = [MajorLevel(98.0, "low", "PDL", 2, -1),
          MajorLevel(104.0, "low", "ONL", 2, -1),
          MajorLevel(112.0, "high", "PMH", 2, -1)]
    assert nearest_below(ls, 110.0).price == 104.0
    assert nearest_above(ls, 110.0).price == 112.0
    assert nearest_below(ls, 98.0) is None
    assert nearest_above(ls, 112.0) is None


def test_a_daily_view_carrying_todays_date_is_refused():
    """A daily bar stamped with today is today's forming bar. Reading its high
    is reading the rest of the session, so it raises rather than returning."""
    v = _two_day().view(5)
    today = BarSeries(
        "FIX", "day", np.array([1, 2], dtype="int64"),
        np.array([100.0, 110.0]), np.array([101.0, 115.0]),
        np.array([99.0, 105.0]), np.array([100.0, 112.0]), np.array([1.0, 1.0]),
        np.array([20240102, 20240103], dtype="int32"), np.zeros(2, dtype="int32"))
    with pytest.raises(ValueError):
        major_levels(v, today.view(1))
    # the day before is fine
    major_levels(v, today.view(0))


def test_a_pivot_needs_more_than_one_wiggle():
    """A fractal price has visited once does not become a level."""
    from engine.primitives.levels import pivot_levels
    bars = []
    for k in range(40):
        px = 100.0 + (1.0 if k == 20 else 0.0)
        bars.append((570 + k, px, px + 0.05, px - 0.05, px, 10.0))
    s = make_multiday({20240102: bars})
    assert pivot_levels(s.view(39), pivot_n=3, lookback=40, touch_bps=1.0,
                        min_touches=2) == []
