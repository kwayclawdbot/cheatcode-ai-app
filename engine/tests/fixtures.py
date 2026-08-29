"""Hand-built tapes. Every expected value in the tests is derived by reading
these numbers off the page, not by running the code and pasting the output."""

from __future__ import annotations

import numpy as np

from engine.series import BarSeries


def make(bars: list[tuple], day: int = 20240102, symbol: str = "FIX",
         timeframe: str = "1m") -> BarSeries:
    """bars: list of (minute, open, high, low, close, volume)."""
    minute = np.array([b[0] for b in bars], dtype="int32")
    ts = (np.arange(len(bars), dtype="int64") + 1) * 60_000
    days = np.full(len(bars), day, dtype="int32")
    return BarSeries(
        symbol, timeframe, ts,
        np.array([b[1] for b in bars], dtype="float64"),
        np.array([b[2] for b in bars], dtype="float64"),
        np.array([b[3] for b in bars], dtype="float64"),
        np.array([b[4] for b in bars], dtype="float64"),
        np.array([b[5] for b in bars], dtype="float64"),
        days, minute,
    )


def make_multiday(days_bars: dict[int, list[tuple]], symbol: str = "FIX") -> BarSeries:
    o = h = l = c = v = None
    minutes, days = [], []
    ohlcv = [[], [], [], [], []]
    for day in sorted(days_bars):
        for b in days_bars[day]:
            minutes.append(b[0])
            days.append(day)
            for k in range(5):
                ohlcv[k].append(b[1 + k])
    n = len(minutes)
    _ = (o, h, l, c, v)
    return BarSeries(
        symbol, "1m", (np.arange(n, dtype="int64") + 1) * 60_000,
        *[np.array(x, dtype="float64") for x in ohlcv],
        np.array(days, dtype="int32"), np.array(minutes, dtype="int32"),
    )
