"""Higher-timeframe trend confirmation, expressed as structure rather than a
moving average.

The owner's rule, verbatim: *"only triggered if HTF trend confirmation"*. This
module is the definition of "confirmed", and it is deliberately strict:

* **uptrend** — the last two confirmed daily swing highs ascend, the last two
  confirmed daily swing lows ascend, and the most recent confirmed swing low has
  not since been closed below. Higher high AND higher low, with the low that
  defines the trend still standing.
* **downtrend** — the mirror.
* **anything else is "none"**, which means no trade. There is no third state
  where a strong-looking counter-trend setup is allowed through.

"Confirmed" carries the whole weight: `swing_points` only returns a fractal once
the bars either side of it have closed, so a swing the chart will eventually
draw is invisible here until the day it actually became a fact.
"""

from __future__ import annotations

from typing import Literal, NamedTuple

import numpy as np

from engine.primitives import structure as st
from engine.series import BarView

Direction = Literal["up", "down", "none"]


class DailyStructure(NamedTuple):
    direction: Direction
    swing_high: float
    prior_swing_high: float
    swing_low: float
    prior_swing_low: float
    reason: str


NO_TREND = DailyStructure("none", float("nan"), float("nan"), float("nan"),
                          float("nan"), "insufficient swings")


def daily_structure(view: BarView, pivot_n: int = 2,
                    lookback: int = 120) -> DailyStructure:
    """Trend state of the daily chart as of the close of `view`'s last bar.

    The caller is responsible for handing this a view that ends on the last
    FULLY CLOSED daily bar. Everything downstream of that is enforced here.
    """
    swings = st.swing_points(view, pivot_n, pivot_n, lookback)
    highs = [s for s in swings if s.kind == "high"]
    lows = [s for s in swings if s.kind == "low"]
    if len(highs) < 2 or len(lows) < 2:
        return NO_TREND

    hh = highs[-1].price > highs[-2].price
    lh = highs[-1].price < highs[-2].price
    hl = lows[-1].price > lows[-2].price
    ll = lows[-1].price < lows[-2].price
    after_low = view.close[lows[-1].idx + 1:]
    after_high = view.close[highs[-1].idx + 1:]
    low_intact = not bool(np.any(after_low < lows[-1].price))
    high_intact = not bool(np.any(after_high > highs[-1].price))

    vals = (highs[-1].price, highs[-2].price, lows[-1].price, lows[-2].price)
    if hh and hl and low_intact:
        return DailyStructure("up", *vals, "higher high, higher low, swing low unbroken")
    if lh and ll and high_intact:
        return DailyStructure("down", *vals, "lower high, lower low, swing high unbroken")
    if hh and hl and not low_intact:
        return DailyStructure("none", *vals, "structure was up but the swing low broke")
    if lh and ll and not high_intact:
        return DailyStructure("none", *vals, "structure was down but the swing high broke")
    return DailyStructure("none", *vals, "no higher-high/higher-low agreement")


def daily_trend(view: BarView, pivot_n: int = 2, lookback: int = 120) -> Direction:
    return daily_structure(view, pivot_n, lookback).direction
