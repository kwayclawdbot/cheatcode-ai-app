"""Higher-timeframe aggregation, built only out of bars the view can already see.

A model that reads a 5-minute chart must not be handed the 5-minute bar that is
still forming. `resample` therefore returns **closed buckets only**: the bucket
containing the last visible 1-minute bar is dropped unless that bar is the last
minute of the bucket.

The result is a plain `BarSeries` assembled from the view's own arrays, so a
`BarView` taken on it inherits the same as-of guarantee — there is nothing in it
that was not already visible.
"""

from __future__ import annotations

import numpy as np

from engine.series import BarSeries, BarView


def _bucket_ids(day: np.ndarray, minute: np.ndarray, minutes: int) -> np.ndarray:
    return day.astype("int64") * 10_000 + (minute.astype("int64") // minutes)


def resample(view: BarView, minutes: int = 5) -> BarSeries:
    """Aggregate the visible 1-minute bars into closed `minutes`-bars.

    Buckets are anchored on the ET midnight grid; 09:30 is a multiple of 5, 15
    and 30, so the regular-session grid lines up with the clock a trader reads.
    A bucket whose final minute is not visible is not closed and is not
    returned, which is conservative in exactly the direction that matters.
    """
    n = view.n
    if n == 0 or minutes <= 0:
        return _empty(view, minutes)
    b = _bucket_ids(view.day, view.minute, minutes)
    edges = np.flatnonzero(np.diff(b)) + 1
    starts = np.concatenate(([0], edges))
    stops = np.concatenate((edges, [n]))

    # the last bucket only counts if its final clock minute has printed
    if int(view.minute[-1]) % minutes != minutes - 1:
        starts, stops = starts[:-1], stops[:-1]
    if len(starts) == 0:
        return _empty(view, minutes)

    last = stops - 1
    hi, lo, vol = np.asarray(view.high), np.asarray(view.low), np.asarray(view.volume)
    o = np.asarray(view.open)[starts].astype("float64")
    c = np.asarray(view.close)[last].astype("float64")
    h = np.maximum.reduceat(hi, starts).astype("float64")
    l = np.minimum.reduceat(lo, starts).astype("float64")
    v = np.add.reduceat(vol, starts).astype("float64")
    # `reduceat` runs its final segment to the end of the array. When the
    # forming bucket was dropped, that segment would silently absorb it, so the
    # last kept bucket is always recomputed from its own explicit bounds.
    k = len(starts) - 1
    s0, e0 = int(starts[k]), int(stops[k])
    h[k] = float(np.max(hi[s0:e0]))
    l[k] = float(np.min(lo[s0:e0]))
    v[k] = float(np.sum(vol[s0:e0]))

    return BarSeries(
        view.symbol, f"{minutes}m",
        np.asarray(view.ts_ms)[last].astype("int64").copy(),
        o.astype("float64").copy(), h.astype("float64").copy(),
        l.astype("float64").copy(), c.astype("float64").copy(),
        v.astype("float64").copy(),
        np.asarray(view.day)[starts].astype("int32").copy(),
        (np.asarray(view.minute)[starts].astype("int64") // minutes * minutes).astype("int32").copy(),
    )


def _empty(view: BarView, minutes: int) -> BarSeries:
    z64 = np.zeros(0, dtype="int64")
    zf = np.zeros(0, dtype="float64")
    return BarSeries(view.symbol, f"{minutes}m", z64, zf, zf, zf, zf, zf,
                     np.zeros(0, dtype="int32"), np.zeros(0, dtype="int32"))


def resampled_view(view: BarView, minutes: int = 5) -> BarView | None:
    """The as-of view on the last CLOSED higher-timeframe bar, or None."""
    s = resample(view, minutes)
    if len(s) == 0:
        return None
    return s.view(len(s) - 1)
