"""Major support and resistance — the levels a stop can honestly sit behind.

"Recent major level" is the single easiest thing in this repo to compute with
bars that had not printed yet. Everything here is therefore built from a
`BarView` and, optionally, a **strictly prior** daily view whose date is
asserted to be earlier than the view's own day. A daily bar stamped with today
is today's forming bar and is refused, not silently used.

What counts as major, and nothing else counts:

* **reference levels** — prior-day RTH high/low, today's premarket high/low, and
  the overnight extremes. These are admitted without a touch count: they are the
  session's own boundaries, which is what makes them reference points.
* **confirmed pivots on the entry timeframe or above** — a fractal with
  `pivot_n` bars either side, all of them closed, that price has respected at
  least `min_touches` times. One wiggle is not a level.
* **confirmed daily pivots** — admitted on confirmation. A daily swing is major
  by construction; requiring two daily touches inside a 60-bar window would
  discard levels every trader on the tape is looking at. This is the brief's
  "where practical" clause, spent here and stated.

Levels within `cluster_bps` of one another are one level, because they are one
level on a chart.
"""

from __future__ import annotations

from typing import Literal, NamedTuple

import numpy as np

from engine.primitives import session as ses
from engine.primitives import structure as st
from engine.primitives.liquidity import prior_day_levels
from engine.primitives.timeframe import resampled_view
from engine.series import BarView

# label -> how much authority it carries when two levels collapse into one
PRIORITY = {"PDH": 3, "PDL": 3, "PMH": 3, "PML": 3, "ONH": 3, "ONL": 3,
            "DPH": 2, "DPL": 2, "H4H": 2, "H4L": 2,
            "H1H": 1, "H1L": 1, "PH": 1, "PL": 1}


class MajorLevel(NamedTuple):
    price: float
    kind: Literal["high", "low"]   # the side of price it was formed on
    label: str
    touches: int
    idx: int                        # bar index on its own timeframe, -1 if aggregate

    @property
    def priority(self) -> int:
        return PRIORITY.get(self.label, 0)


def _touch_count(prices: np.ndarray, level: float, tol: float, min_sep: int) -> int:
    """Distinct visits to a level. Bars closer together than `min_sep` are one
    visit — otherwise a single three-bar stall would score three touches."""
    if len(prices) == 0 or tol <= 0:
        return 0
    hits = np.flatnonzero(np.abs(prices - level) <= tol)
    if len(hits) == 0:
        return 0
    count, last = 1, int(hits[0])
    for k in hits[1:]:
        if int(k) - last > min_sep:
            count += 1
            last = int(k)
    return count


def reference_levels(view: BarView) -> list[MajorLevel]:
    """Prior-day RTH, premarket and overnight extremes, as of this view."""
    out: list[MajorLevel] = []
    for lv in prior_day_levels(view, rth_only=True):
        out.append(MajorLevel(lv.price, "high" if lv.label == "PDH" else "low",
                              lv.label, 1, -1))
    pm = ses.premarket_range(view)
    if pm.bars and np.isfinite(pm.high):
        out.append(MajorLevel(float(pm.high), "high", "PMH", 1, pm.high_idx))
        out.append(MajorLevel(float(pm.low), "low", "PML", 1, pm.low_idx))
    on = ses.overnight_range(view)
    if on.bars and np.isfinite(on.high):
        out.append(MajorLevel(float(on.high), "high", "ONH", 1, on.high_idx))
        out.append(MajorLevel(float(on.low), "low", "ONL", 1, on.low_idx))
    return out


def pivot_levels(view: BarView, pivot_n: int = 3, lookback: int = 480,
                 touch_bps: float = 10.0, min_touches: int = 2,
                 label_high: str = "PH", label_low: str = "PL") -> list[MajorLevel]:
    """Confirmed fractals on whatever timeframe `view` is, screened by touches."""
    swings = st.swing_points(view, pivot_n, pivot_n, lookback)
    if not swings:
        return []
    lo = max(0, view.n - lookback)
    highs, lows = view.high[lo:], view.low[lo:]
    out: list[MajorLevel] = []
    for s in swings:
        prices = highs if s.kind == "high" else lows
        tol = s.price * touch_bps / 10_000.0
        t = _touch_count(np.asarray(prices), s.price, tol, pivot_n)
        if t < min_touches:
            continue
        out.append(MajorLevel(float(s.price), s.kind,
                              label_high if s.kind == "high" else label_low, t, s.idx))
    return out


def _cluster(levels: list[MajorLevel], cluster_bps: float) -> list[MajorLevel]:
    if not levels:
        return []
    ordered = sorted(levels, key=lambda x: (x.price, -x.priority, -x.touches, x.label))
    out: list[MajorLevel] = []
    group: list[MajorLevel] = [ordered[0]]
    for lv in ordered[1:]:
        base = group[0].price
        if base > 0 and (lv.price - base) / base * 10_000.0 <= cluster_bps:
            group.append(lv)
        else:
            out.append(_pick(group))
            group = [lv]
    out.append(_pick(group))
    return out


def _pick(group: list[MajorLevel]) -> MajorLevel:
    best = max(group, key=lambda x: (x.priority, x.touches, -x.idx))
    return best._replace(touches=max(g.touches for g in group))


def major_levels(view: BarView, daily_view: BarView | None = None,
                 tf_minutes: int = 5, pivot_n: int = 3, lookback: int = 480,
                 touch_bps: float = 10.0, min_touches: int = 2,
                 cluster_bps: float = 10.0, daily_pivot_n: int = 2,
                 daily_lookback: int = 60) -> list[MajorLevel]:
    """Every major level knowable at the close of `view`, ascending by price.

    `daily_view` must end on a day strictly before this view's day. That is
    checked, not assumed: a daily bar carrying today's date is today's forming
    bar, and reading its high is reading the rest of the session.
    """
    levels = reference_levels(view)

    v_tf = resampled_view(view, tf_minutes)
    if v_tf is not None:
        levels += pivot_levels(v_tf, pivot_n, lookback, touch_bps, min_touches)

    if daily_view is not None and daily_view.n:
        if int(daily_view.day[-1]) >= int(view.day[-1]):
            raise ValueError(
                f"major_levels: daily view ends {int(daily_view.day[-1])} which is "
                f"not strictly before {int(view.day[-1])} — that is today's forming bar")
        levels += pivot_levels(daily_view, daily_pivot_n, daily_lookback,
                               touch_bps, 1, "DPH", "DPL")

    levels = [lv for lv in levels if np.isfinite(lv.price) and lv.price > 0]
    return _cluster(levels, cluster_bps)


def nearest_below(levels: list[MajorLevel], price: float) -> MajorLevel | None:
    below = [lv for lv in levels if lv.price < price]
    return max(below, key=lambda x: x.price) if below else None


def nearest_above(levels: list[MajorLevel], price: float) -> MajorLevel | None:
    above = [lv for lv in levels if lv.price > price]
    return min(above, key=lambda x: x.price) if above else None
