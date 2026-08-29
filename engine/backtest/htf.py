"""Daily-timeframe context for a trading day, built from the day before it.

The one rule this file exists to enforce: the label for trading day *D* is
computed from the daily view ending on the last daily bar **before** D. Nothing
about day D's own session — not its open, not its high, not its close — is
visible to the filter that decides whether day D may be traded at all.

`engine/backtest/regime.py` does the same thing for SPY's 50-day average. Same
reasoning, applied per symbol.
"""

from __future__ import annotations

import functools

from engine.cache.load import load
from engine.primitives.htf import daily_structure
from engine.series import BarView


@functools.lru_cache(maxsize=64)
def _daily(symbol: str, snapshot: str | None):
    return load(symbol, "day", snapshot)


@functools.lru_cache(maxsize=64)
def _index(symbol: str, snapshot: str | None) -> dict[int, int]:
    d = _daily(symbol, snapshot)
    return {int(v): k for k, v in enumerate(d.day)}


def prior_daily_view(symbol: str, day: int, snapshot: str | None = None) -> BarView | None:
    """The daily view as of the last fully closed daily bar before `day`."""
    k = _index(symbol, snapshot).get(int(day))
    if k is None or k == 0:
        return None
    return _daily(symbol, snapshot).view(k - 1)


def daily_trend_by_day(symbol: str, snapshot: str | None = None,
                       pivot_n: int = 2, lookback: int = 120) -> dict[int, str]:
    """{trading day -> "up" | "down" | "none"}, each entry built only from bars
    that closed strictly before that day."""
    d = _daily(symbol, snapshot)
    out: dict[int, str] = {}
    for k in range(1, len(d)):
        out[int(d.day[k])] = daily_structure(d.view(k - 1), pivot_n, lookback).direction
    return out


@functools.lru_cache(maxsize=8)
def daily_trend_cached(symbol: str, snapshot: str | None = None,
                       pivot_n: int = 2, lookback: int = 120) -> dict[int, str]:
    return daily_trend_by_day(symbol, snapshot, pivot_n, lookback)
