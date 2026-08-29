"""Major levels drawn on the 1-hour and 4-hour charts.

ENGINE-2 put its stop behind the nearest major level found on the **5-minute**
chart and measured the result: median risk 0.187% of price, costs 0.144R a
trade, a real directional edge of +0.099R that the round trip swallowed whole.
The report's own conclusion was that only a bigger move can change the sign, and
the owner's correction says where to find one: *"The stop and targets should be
based on the 1hr or 4hr levels not 5min."*

So this module is `primitives/levels.py` with one substitution, and nothing else
changed:

* **reference levels stay** — prior-day RTH high and low, today's premarket
  extremes, the overnight extremes. The brief names "prior-day and overnight
  extremes" as part of what major means, and they are session boundaries rather
  than 5-minute wiggles.
* **daily pivots stay** — confirmed 3-bar daily fractals, admitted on
  confirmation. Daily is higher than 4-hour; excluding it would be strange.
* **the 5-minute pivots are gone**, replaced by confirmed pivots on the 1-hour
  and 4-hour series.

Touch counts, "where practical": two touches within 8bp on the 1-hour series,
one on the 4-hour. That is ENGINE-2's own clause, spent for the same reason it
was spent on daily pivots — a confirmed 4-hour swing over thirty sessions is
major by construction, and demanding it be retested twice inside 8bp would throw
away the levels every trader on the tape is looking at.

Every view handed in here must already end on a fully closed bar of its own
timeframe. `engine/backtest/mtf.py` is what guarantees that, and its tests are
what prove it.
"""

from __future__ import annotations

import numpy as np

from engine.primitives.levels import (MajorLevel, _cluster, pivot_levels,
                                      reference_levels)
from engine.series import BarView

# 1-hour: 2-bar fractals over the last 120 closed hours, ~17 sessions.
H1_PIVOT_N = 2
H1_LOOKBACK = 120
H1_MIN_TOUCHES = 2

# 4-hour: 2-bar fractals over the last 60 closed 4-hour bars, ~30 sessions.
H4_PIVOT_N = 2
H4_LOOKBACK = 60
H4_MIN_TOUCHES = 1

# both verbatim from orb_htf_structural.v1, so they cannot have been retuned
TOUCH_BPS = 8.0
CLUSTER_BPS = 25.0
DAILY_PIVOT_N = 3
DAILY_LOOKBACK = 60


def htf_major_levels(view_1m: BarView, v_h1: BarView | None,
                     v_h4: BarView | None, daily_view: BarView | None = None,
                     touch_bps: float = TOUCH_BPS,
                     cluster_bps: float = CLUSTER_BPS) -> list[MajorLevel]:
    """Every major 1h/4h-grade level knowable at the close of `view_1m`.

    `daily_view` must end strictly before this view's day — a daily bar carrying
    today's date is today's forming bar, and reading its high is reading the
    rest of the session. The check is the same one `levels.major_levels` makes,
    repeated here rather than assumed.
    """
    levels = reference_levels(view_1m)

    if v_h1 is not None and v_h1.n:
        _assert_not_ahead(v_h1, view_1m, "1h")
        levels += pivot_levels(v_h1, H1_PIVOT_N, H1_LOOKBACK, touch_bps,
                               H1_MIN_TOUCHES, "H1H", "H1L")
    if v_h4 is not None and v_h4.n:
        _assert_not_ahead(v_h4, view_1m, "4h")
        levels += pivot_levels(v_h4, H4_PIVOT_N, H4_LOOKBACK, touch_bps,
                               H4_MIN_TOUCHES, "H4H", "H4L")
    if daily_view is not None and daily_view.n:
        if int(daily_view.day[-1]) >= int(view_1m.day[-1]):
            raise ValueError(
                f"htf_major_levels: daily view ends {int(daily_view.day[-1])}, "
                f"not strictly before {int(view_1m.day[-1])} — that is today's "
                f"forming bar")
        levels += pivot_levels(daily_view, DAILY_PIVOT_N, DAILY_LOOKBACK,
                               touch_bps, 1, "DPH", "DPL")

    levels = [lv for lv in levels if np.isfinite(lv.price) and lv.price > 0]
    return _cluster(levels, cluster_bps)


def _assert_not_ahead(v_htf: BarView, view_1m: BarView, name: str) -> None:
    """A higher-timeframe bar may never carry a timestamp the 1-minute view has
    not reached. This is belt to `mtf.closed_index`'s braces: if the index
    arithmetic there is ever wrong, it stops the run instead of quietly earning
    a better number."""
    if int(v_htf.ts_ms[-1]) > int(view_1m.ts_ms[-1]):
        raise ValueError(
            f"htf_major_levels: the {name} view ends at ts {int(v_htf.ts_ms[-1])}, "
            f"after the 1-minute view's {int(view_1m.ts_ms[-1])}")
