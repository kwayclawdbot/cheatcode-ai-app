"""Multi-timeframe context: what the 1-hour and 4-hour charts said, as of a minute.

The single easiest way to cheat in ENGINE-3 is to read a 4-hour bar that had not
closed. The defence is one function — `MtfContext.closed_index` — and everything
else in the model goes through it.

`session_series` builds every RTH bucket for the symbol once, which is safe
because a bucket's OHLC is a function of its own minutes alone. `closed_index`
then answers the only question that matters: **as of (day, minute), what is the
index of the last bucket that had definitely finished?** It is the index one
before the bucket the decision minute itself lives in — never the live one, and
on a premarket minute never anything from today at all.

The answer is handed out as a `BarView` truncated at that index, so a primitive
downstream cannot walk past it even if it tried.

`engine/tests/test_no_lookahead_mtf.py` attacks this three ways: it poisons every
bar after the decision, it amputates them, and it rebuilds the whole context from
a truncated tape — the trend and the levels have to come out identical each time.
"""

from __future__ import annotations

import functools

import numpy as np

from engine.cache.load import load
from engine.primitives.htf import Direction, daily_structure
from engine.primitives.timeframe import session_bucket_key, session_series
from engine.series import BarSeries, BarView

# The two higher timeframes the owner named, in minutes.
H1 = 60
H4 = 240

# Structure is read exactly as ENGINE-2 read the daily chart: 2-bar fractals,
# confirmed, over the last 120 bars of that timeframe. On the 1-hour series 120
# bars is about 17 sessions; on the 4-hour series it is about 60. The slower
# chart therefore looks back further in calendar time, which is the point of
# having two of them.
PIVOT_N = 2
LOOKBACK = 120


class MtfContext:
    """The 1h and 4h series for one symbol, with an as-of index for each."""

    def __init__(self, series_1m: BarSeries,
                 timeframes: tuple[int, ...] = (H1, H4)) -> None:
        self.symbol = series_1m.symbol
        self.timeframes = timeframes
        self._series: dict[int, BarSeries] = {}
        self._keys: dict[int, np.ndarray] = {}
        self._trend: dict[tuple[int, int], Direction] = {}
        for tf in timeframes:
            s = session_series(series_1m, tf)
            self._series[tf] = s
            self._keys[tf] = (s.day.astype("int64") * 10_000
                              + s.minute.astype("int64"))

    def series(self, tf: int) -> BarSeries:
        return self._series[tf]

    def closed_index(self, tf: int, day: int, minute: int) -> int:
        """Index of the last bucket that had closed as of (day, minute), or -1.

        Strictly less than the bucket the minute itself falls in. On a
        premarket minute that is the last bucket of the PREVIOUS session.
        """
        live = session_bucket_key(int(day), int(minute), tf)
        return int(np.searchsorted(self._keys[tf], live, side="left")) - 1

    def view(self, tf: int, day: int, minute: int) -> BarView | None:
        k = self.closed_index(tf, day, minute)
        return self._series[tf].view(k) if k >= 0 else None

    def trend(self, tf: int, day: int, minute: int) -> Direction:
        """Confirmed structure on `tf` as of its last fully closed bar.

        Memoised on the bucket index, not on the minute: within one bucket the
        answer cannot change, and there is no cheaper way to say that.
        """
        k = self.closed_index(tf, day, minute)
        if k < PIVOT_N * 2:
            return "none"
        hit = self._trend.get((tf, k))
        if hit is None:
            hit = daily_structure(self._series[tf].view(k), PIVOT_N, LOOKBACK).direction
            self._trend[(tf, k)] = hit
        return hit

    def aligned(self, day: int, minute: int) -> Direction:
        """The direction BOTH timeframes agree on, or "none".

        There is no "strong anyway" exception. Disagreement is a day off, and
        so is either chart being sideways.
        """
        a = self.trend(H1, day, minute)
        b = self.trend(H4, day, minute)
        return a if (a == b and a != "none") else "none"


@functools.lru_cache(maxsize=64)
def context(symbol: str, snapshot: str | None = None) -> MtfContext:
    return MtfContext(load(symbol, "1m", snapshot))
