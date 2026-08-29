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


# ---------------------------------------------------------------------------
# Session-anchored aggregation — the 1h and 4h convention, written down once.
#
# ENGINE-3 needs 1-hour and 4-hour bars, and an ambiguous boundary silently
# changes every trend reading in the test. So the convention is stated here and
# used everywhere:
#
#   * **Regular hours only.** Buckets are built from bars with
#     09:30 <= minute < the session's own close (13:00 on a half day). Premarket
#     and post-market prints are excluded entirely. They are thin, they gap, and
#     a single 04:12 print would set the high of an "08:00-12:00" bucket on a
#     midnight-anchored grid — a wick no trader has on their chart.
#   * **Anchored at 09:30, not at midnight.** A 4-hour bucket therefore runs
#     09:30-13:30 and 13:30-close, which is what a US-equity chart with extended
#     hours switched off actually draws. On the midnight grid the open would sit
#     in the middle of an 08:00-12:00 bar.
#   * **The day's final bucket is short, and it still counts.** 1h gives
#     09:30, 10:30 ... 15:30, and that last bucket holds 30 minutes. 4h gives
#     09:30 and 13:30, and that last one holds 2.5 hours. Dropping the partial
#     would delete the afternoon from the 4h series entirely, which is a far
#     bigger distortion than a short bar.
#   * **A bucket is closed only once a bar in a LATER bucket has been seen.**
#     Not "once its final clock minute printed" — that rule cannot close a
#     session-final partial bucket, because 15:59 is not the last minute of a
#     4-hour window. Waiting for a bar in the next bucket is strictly
#     conservative and closes the partial correctly.
#
# On an early-close day the 4h series has one bucket (09:30-13:00) and the 1h
# series has four (09:30, 10:30, 11:30, 12:30, the last of them 30 minutes).

RTH_OPEN_MIN = 9 * 60 + 30


def _rth_close_of(days: np.ndarray) -> np.ndarray:
    """Per-bar RTH close minute, honouring half days."""
    from engine.primitives.session import rth_close_minute
    uniq, inv = np.unique(days, return_inverse=True)
    vals = np.array([rth_close_minute(int(d)) for d in uniq], dtype="int32")
    return vals[inv]


def session_bucket_key(day: int, minute: int, minutes: int) -> int:
    """The bucket a single (day, minute) belongs to, as a sortable key.

    Premarket maps to the day's FIRST bucket (nothing of today is closed yet);
    anything at or after the close maps past the day's last bucket (all of
    today's buckets are closed). Both are the conservative answer.
    """
    from engine.primitives.session import rth_close_minute
    if minute < RTH_OPEN_MIN:
        return int(day) * 10_000 + RTH_OPEN_MIN
    if minute >= rth_close_minute(int(day)):
        return int(day) * 10_000 + 9_999
    idx = (int(minute) - RTH_OPEN_MIN) // minutes
    return int(day) * 10_000 + RTH_OPEN_MIN + idx * minutes


def _aggregate(symbol: str, minutes: int, ts_ms, o, h, l, c, v, day, minute) -> BarSeries:
    """RTH-only, 09:30-anchored aggregation of raw 1-minute arrays."""
    day = np.asarray(day)
    minute = np.asarray(minute)
    keep = (minute >= RTH_OPEN_MIN) & (minute < _rth_close_of(day))
    if not np.any(keep):
        return BarSeries(symbol, f"{minutes}m", np.zeros(0, "int64"),
                         *([np.zeros(0, "float64")] * 5),
                         np.zeros(0, "int32"), np.zeros(0, "int32"))
    idx = np.flatnonzero(keep)
    d, m = day[idx], minute[idx]
    start_min = (RTH_OPEN_MIN + ((m - RTH_OPEN_MIN) // minutes) * minutes).astype("int64")
    key = d.astype("int64") * 10_000 + start_min

    edges = np.flatnonzero(np.diff(key)) + 1
    starts = np.concatenate(([0], edges))
    stops = np.concatenate((edges, [len(key)]))
    last = stops - 1

    hi = np.asarray(h)[idx]
    lo = np.asarray(l)[idx]
    vol = np.asarray(v)[idx]
    out_h = np.maximum.reduceat(hi, starts).astype("float64")
    out_l = np.minimum.reduceat(lo, starts).astype("float64")
    out_v = np.add.reduceat(vol, starts).astype("float64")

    return BarSeries(
        symbol, f"{minutes}m",
        np.asarray(ts_ms)[idx][last].astype("int64").copy(),
        np.asarray(o)[idx][starts].astype("float64").copy(),
        out_h.copy(), out_l.copy(),
        np.asarray(c)[idx][last].astype("float64").copy(),
        out_v.copy(),
        d[starts].astype("int32").copy(),
        start_min[starts].astype("int32").copy(),
    )


def session_series(series: BarSeries, minutes: int) -> BarSeries:
    """Every RTH bucket in `series`, including each day's short final one.

    This is the *whole* aggregation, closed and forming alike. It is safe to
    build once per symbol because a bucket's OHLC depends only on its own
    minutes — nothing about bucket k is a function of bucket k+1. Choosing
    which buckets a decision may SEE is a separate job, done by
    `engine/backtest/mtf.py` and attacked by its tests.
    """
    return _aggregate(series.symbol, minutes, series.ts_ms, series.open,
                      series.high, series.low, series.close, series.volume,
                      series.day, series.minute)


def session_resample(view: BarView, minutes: int) -> BarSeries:
    """The CLOSED RTH buckets visible from `view`, streaming-style.

    The bucket containing the last visible bar is dropped, because a later bar
    could still change it. Everything before it is a fact.
    """
    s = _aggregate(view.symbol, minutes, view.ts_ms, view.open, view.high,
                   view.low, view.close, view.volume, view.day, view.minute)
    if len(s) == 0:
        return s
    live = session_bucket_key(int(view.day[-1]), int(view.minute[-1]), minutes)
    keys = s.day.astype("int64") * 10_000 + s.minute.astype("int64")
    n = int(np.searchsorted(keys, live, side="left"))
    if n == len(s):
        return s
    return s.subrange(0, n)


def session_resampled_view(view: BarView, minutes: int) -> BarView | None:
    s = session_resample(view, minutes)
    return s.view(len(s) - 1) if len(s) else None
