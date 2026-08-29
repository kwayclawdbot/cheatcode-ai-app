"""Higher-timeframe trend, relative strength, volume regime."""

from __future__ import annotations

from typing import Literal

import numpy as np

from engine.series import BarView


def ema(values: np.ndarray, period: int) -> float:
    """EMA of the visible values, seeded on the first `period` as an SMA."""
    if len(values) < period:
        return float("nan")
    k = 2.0 / (period + 1.0)
    e = float(np.mean(values[:period]))
    for v in values[period:]:
        e = float(v) * k + e * (1.0 - k)
    return e


def trend_state(view: BarView, fast: int = 20, slow: int = 50,
                slope_window: int = 5) -> Literal["up", "down", "range"]:
    """EMA relationship plus the slow line's own slope. Deliberately blunt: this
    is a filter, not a signal."""
    c = view.close
    if len(c) < slow + slope_window + 1:
        return "range"
    f, s = ema(c, fast), ema(c, slow)
    s_prev = ema(c[:-slope_window], slow)
    if not (np.isfinite(f) and np.isfinite(s) and np.isfinite(s_prev)):
        return "range"
    rising = s > s_prev
    if f > s and rising:
        return "up"
    if f < s and not rising:
        return "down"
    return "range"


def volume_regime(view: BarView, lookback: int = 20, window: int = 5,
                  dry: float = 0.7, expand: float = 1.5) -> Literal["dryup", "normal", "expansion"]:
    v = view.volume
    if len(v) < lookback + window:
        return "normal"
    base = float(np.median(v[-(lookback + window):-window]))
    recent = float(np.mean(v[-window:]))
    if base <= 0:
        return "normal"
    r = recent / base
    if r <= dry:
        return "dryup"
    if r >= expand:
        return "expansion"
    return "normal"


def pct_change(view: BarView, bars: int) -> float:
    c = view.close
    if len(c) <= bars or c[-1 - bars] == 0:
        return float("nan")
    return float(c[-1] / c[-1 - bars] - 1.0)


def relative_strength(view: BarView, bench: BarView, bars: int = 30) -> float:
    """Return of the symbol minus return of the benchmark over the same bar
    count. Both views must be as-of the same timestamp; that is asserted, not
    assumed, because a benchmark read one bar late is lookahead by proxy."""
    if int(view.ts_ms[-1]) != int(bench.ts_ms[-1]):
        raise ValueError(
            f"relative_strength: {view.symbol}@{int(view.ts_ms[-1])} vs "
            f"{bench.symbol}@{int(bench.ts_ms[-1])} are not the same bar")
    a, b = pct_change(view, bars), pct_change(bench, bars)
    if not (np.isfinite(a) and np.isfinite(b)):
        return float("nan")
    return a - b
