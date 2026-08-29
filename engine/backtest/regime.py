"""Market regime, knowable on the morning of the trade.

SPY's daily close versus its own 50-day simple moving average, evaluated **as of
the previous session's close**. A regime label computed from the same day's
close would be a slow and very effective way to smuggle the future into every
statistic in the report.
"""

from __future__ import annotations

import numpy as np

from engine.cache.load import load

BULL = "bull (SPY > 50dma)"
BEAR = "bear (SPY < 50dma)"


def regime_from_closes(close: np.ndarray, days: np.ndarray,
                       period: int = 50) -> dict[int, str]:
    """The label for day k is built entirely from closes strictly before day k."""
    out: dict[int, str] = {}
    for k in range(len(close)):
        if k < period:          # no average yet
            continue
        prior = close[k - period:k]         # ends at the PREVIOUS session
        sma = float(np.mean(prior))
        out[int(days[k])] = BULL if float(close[k - 1]) > sma else BEAR
    return out


def regime_by_day(benchmark: str = "SPY", period: int = 50,
                  snapshot: str | None = None) -> dict[int, str]:
    d = load(benchmark, "day", snapshot)
    return regime_from_closes(d.close, d.day, period)
