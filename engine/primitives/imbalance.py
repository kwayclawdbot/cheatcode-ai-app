"""Fair value gaps, order blocks, breakers.

A three-bar fair value gap is only knowable once the third bar has closed, so
every FVG here is stamped with the bar that confirmed it and is invisible before
that bar. Fill state is evaluated only over bars after confirmation.
"""

from __future__ import annotations

from typing import Literal, NamedTuple

import numpy as np

from engine.series import BarView


class FVG(NamedTuple):
    idx: int              # bar that confirmed the gap (the third bar)
    top: float
    bottom: float
    direction: Literal["bull", "bear"]
    filled: bool          # traded fully through
    touched: bool         # traded into at all
    fill_idx: int
    size: float

    @property
    def mid(self) -> float:
        return (self.top + self.bottom) / 2.0


def fair_value_gaps(view: BarView, lookback: int = 120, min_size: float = 0.0,
                    include_filled: bool = False) -> list[FVG]:
    """Three-bar imbalances in the last `lookback` bars, oldest first.

    Bullish: low[k] > high[k-2]  -> unfilled buy-side gap between them.
    Bearish: high[k] < low[k-2].
    """
    n = view.n
    start = max(2, n - lookback)
    h, l = view.high, view.low
    out: list[FVG] = []
    for k in range(start, n):
        for direction, top, bottom in (
            ("bull", float(l[k]), float(h[k - 2])),
            ("bear", float(l[k - 2]), float(h[k])),
        ):
            if top - bottom <= min_size:
                continue
            # fill state uses only bars strictly after the confirming bar
            after_l, after_h = l[k + 1:n], h[k + 1:n]
            filled, touched, fill_idx = False, False, -1
            if len(after_l):
                if direction == "bull":
                    tin = np.flatnonzero(after_l <= top)
                    tfull = np.flatnonzero(after_l <= bottom)
                else:
                    tin = np.flatnonzero(after_h >= bottom)
                    tfull = np.flatnonzero(after_h >= top)
                touched = len(tin) > 0
                filled = len(tfull) > 0
                if filled:
                    fill_idx = k + 1 + int(tfull[0])
            if filled and not include_filled:
                continue
            out.append(FVG(k, top, bottom, direction, filled, touched, fill_idx,
                           top - bottom))
    return out


class OrderBlock(NamedTuple):
    idx: int
    top: float
    bottom: float
    direction: Literal["bull", "bear"]
    mitigated: bool
    broken: bool  # traded fully through -> candidate breaker


def order_blocks(view: BarView, lookback: int = 120, disp_mult: float = 1.5,
                 avg_window: int = 20) -> list[OrderBlock]:
    """The last opposite-colour candle before a displacement leg.

    A bullish order block is the last down candle before a bar that ran more
    than `disp_mult` average ranges up and left a gap behind it.
    """
    n = view.n
    o, h, l, c = view.open, view.high, view.low, view.close
    start = max(avg_window + 2, n - lookback)
    out: list[OrderBlock] = []
    for k in range(start, n):
        rng = h[k - avg_window: k] - l[k - avg_window: k]
        avg = float(np.mean(rng)) if len(rng) else 0.0
        if avg <= 0:
            continue
        body = float(c[k] - o[k])
        if abs(body) < disp_mult * avg:
            continue
        direction = "bull" if body > 0 else "bear"
        j = k - 1
        while j >= max(1, k - 10):
            opposite = (c[j] < o[j]) if direction == "bull" else (c[j] > o[j])
            if opposite:
                break
            j -= 1
        else:
            continue
        top, bottom = float(h[j]), float(l[j])
        after_l, after_h = l[k + 1:n], h[k + 1:n]
        mitigated = broken = False
        if len(after_l):
            if direction == "bull":
                mitigated = bool(np.any(after_l <= top))
                broken = bool(np.any(after_l < bottom))
            else:
                mitigated = bool(np.any(after_h >= bottom))
                broken = bool(np.any(after_h > top))
        out.append(OrderBlock(j, top, bottom, direction, mitigated, broken))
    return out


def breaker_blocks(view: BarView, **kw) -> list[OrderBlock]:
    """Order blocks price traded fully through: they flip and act as the
    opposite kind of level on retest."""
    return [ob._replace(direction="bear" if ob.direction == "bull" else "bull")
            for ob in order_blocks(view, **kw) if ob.broken]
