"""Bar series and the as-of view.

The single most expensive bug available in this project is a primitive that can
see the future. This module makes it structurally impossible rather than merely
discouraged.

`BarView(series, i)` does not hold a reference to the series. It holds numpy
slices truncated at `i`, marked read-only. A primitive receives a `BarView` and
nothing else: there is no attribute it can walk to reach bar i+1, and no array
it can write to. Lookahead is not a rule primitives are asked to follow, it is a
shape they cannot express.

`engine/tests/test_no_lookahead.py` keeps that true under refactoring, with a
poisoned-future test that would fail loudly the day someone adds a `parent`
attribute back.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import NamedTuple

import numpy as np


class LookaheadError(RuntimeError):
    """Raised when something asks a view for a bar it is not allowed to see."""


class Bar(NamedTuple):
    i: int
    ts_ms: int
    open: float
    high: float
    low: float
    close: float
    volume: float
    day: int      # ET calendar day as yyyymmdd
    minute: int   # minutes since ET midnight


def _ro(a: np.ndarray) -> np.ndarray:
    v = a.view()
    v.flags.writeable = False
    return v


@dataclass(frozen=True)
class BarSeries:
    """Immutable OHLCV for one symbol at one timeframe, ascending by time."""

    symbol: str
    timeframe: str
    ts_ms: np.ndarray
    open: np.ndarray
    high: np.ndarray
    low: np.ndarray
    close: np.ndarray
    volume: np.ndarray
    day: np.ndarray       # int32 yyyymmdd, US/Eastern
    minute: np.ndarray    # int16 minutes since ET midnight

    def __post_init__(self) -> None:
        n = len(self.ts_ms)
        for name in ("open", "high", "low", "close", "volume", "day", "minute"):
            if len(getattr(self, name)) != n:
                raise ValueError(f"{name} length {len(getattr(self, name))} != {n}")
        if n > 1 and not np.all(np.diff(self.ts_ms) > 0):
            raise ValueError(f"{self.symbol} {self.timeframe}: timestamps not strictly ascending")

    def __len__(self) -> int:
        return len(self.ts_ms)

    def view(self, i: int) -> "BarView":
        return BarView(self, i)

    def subrange(self, start: int, stop: int) -> "BarSeries":
        """A genuinely independent series over [start, stop). Used by tests to
        prove a primitive gives the same answer when the future does not exist."""
        s = slice(start, stop)
        return BarSeries(
            self.symbol, self.timeframe,
            np.array(self.ts_ms[s]), np.array(self.open[s]), np.array(self.high[s]),
            np.array(self.low[s]), np.array(self.close[s]), np.array(self.volume[s]),
            np.array(self.day[s]), np.array(self.minute[s]),
        )

    def day_bounds(self) -> dict[int, tuple[int, int]]:
        """{yyyymmdd: (first_index, last_index_exclusive)}."""
        out: dict[int, tuple[int, int]] = {}
        if len(self) == 0:
            return out
        d = self.day
        edges = np.flatnonzero(np.diff(d)) + 1
        starts = np.concatenate(([0], edges))
        stops = np.concatenate((edges, [len(d)]))
        for a, b in zip(starts, stops):
            out[int(d[a])] = (int(a), int(b))
        return out


class BarView:
    """Everything known as of the close of bar `i`, and nothing else.

    Holds no reference to the parent series. `view.high` is an array of length
    i+1; bar i+1 does not exist from in here.
    """

    __slots__ = ("symbol", "timeframe", "i", "n",
                 "ts_ms", "open", "high", "low", "close", "volume", "day", "minute")

    def __init__(self, series: BarSeries, i: int) -> None:
        n = len(series)
        if not (0 <= i < n):
            raise IndexError(f"as-of bar {i} outside series of length {n}")
        k = i + 1
        self.symbol = series.symbol
        self.timeframe = series.timeframe
        self.i = i
        self.n = k
        self.ts_ms = _ro(series.ts_ms[:k])
        self.open = _ro(series.open[:k])
        self.high = _ro(series.high[:k])
        self.low = _ro(series.low[:k])
        self.close = _ro(series.close[:k])
        self.volume = _ro(series.volume[:k])
        self.day = _ro(series.day[:k])
        self.minute = _ro(series.minute[:k])

    # -- access -------------------------------------------------------------
    def _norm(self, j: int) -> int:
        k = j if j >= 0 else self.n + j
        if k < 0 or k >= self.n:
            raise LookaheadError(
                f"{self.symbol}: bar {j} requested from a view that ends at bar {self.i}")
        return k

    def bar(self, j: int = -1) -> Bar:
        k = self._norm(j)
        return Bar(k, int(self.ts_ms[k]), float(self.open[k]), float(self.high[k]),
                   float(self.low[k]), float(self.close[k]), float(self.volume[k]),
                   int(self.day[k]), int(self.minute[k]))

    @property
    def last(self) -> Bar:
        return self.bar(-1)

    def today_slice(self) -> slice:
        """Indices belonging to the ET day of the last visible bar."""
        d = int(self.day[-1])
        idx = np.flatnonzero(self.day == d)
        return slice(int(idx[0]), self.n)

    def prior_day(self) -> int | None:
        d = int(self.day[-1])
        others = self.day[self.day != d]
        return int(others[-1]) if len(others) else None

    def day_slice(self, yyyymmdd: int) -> slice | None:
        idx = np.flatnonzero(self.day == yyyymmdd)
        if len(idx) == 0:
            return None
        return slice(int(idx[0]), int(idx[-1]) + 1)
