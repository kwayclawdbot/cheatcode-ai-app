"""Swing points, break of structure, change of character.

A swing high at bar j is only a *fact* once `right` bars have closed after it.
Every function here returns confirmed swings only, so a swing that the chart
will eventually show is invisible until the moment it was actually knowable.
"""

from __future__ import annotations

from typing import Literal, NamedTuple

import numpy as np

from engine.series import BarView


class Swing(NamedTuple):
    idx: int
    price: float
    kind: Literal["high", "low"]


def swing_points(view: BarView, left: int = 2, right: int = 2,
                 lookback: int | None = None) -> list[Swing]:
    """Confirmed fractal swings, ascending by index.

    Confirmed means idx + right <= view.i: the bars that prove it are closed.
    """
    n = view.n
    last_confirmable = n - 1 - right
    if last_confirmable < left:
        return []
    start = left if lookback is None else max(left, n - lookback)
    h, l = view.high, view.low
    out: list[Swing] = []
    for j in range(start, last_confirmable + 1):
        wh = h[j - left: j + right + 1]
        wl = l[j - left: j + right + 1]
        if h[j] == wh.max() and np.count_nonzero(wh == h[j]) == 1:
            out.append(Swing(j, float(h[j]), "high"))
        if l[j] == wl.min() and np.count_nonzero(wl == l[j]) == 1:
            out.append(Swing(j, float(l[j]), "low"))
    out.sort(key=lambda s: s.idx)
    return out


def last_swing(swings: list[Swing], kind: str, before: int | None = None) -> Swing | None:
    for s in reversed(swings):
        if s.kind == kind and (before is None or s.idx < before):
            return s
    return None


class StructureState(NamedTuple):
    direction: Literal["bull", "bear", "none"]
    last_break_idx: int
    last_break_level: float
    last_break_kind: Literal["bos", "choch", "none"]
    swing_high: float
    swing_low: float


NO_STRUCTURE = StructureState("none", -1, float("nan"), "none", float("nan"), float("nan"))


def structure_state(view: BarView, left: int = 2, right: int = 2,
                    lookback: int | None = 240) -> StructureState:
    """Walk confirmed swings forward and record breaks.

    A bullish break is a *close* above the most recent confirmed swing high that
    existed before that bar. A break in the direction opposite the prevailing
    one is a change of character; a break in the same direction is a break of
    structure.
    """
    swings = swing_points(view, left, right, lookback)
    if not swings:
        return NO_STRUCTURE
    close = view.close
    direction: str = "none"
    last_idx, last_level, last_kind = -1, float("nan"), "none"

    ref_high: Swing | None = None
    ref_low: Swing | None = None
    si = 0
    first_bar = swings[0].idx + right
    for bar in range(first_bar, view.n):
        # only swings whose confirming bars have already closed are usable
        while si < len(swings) and swings[si].idx + right <= bar:
            s = swings[si]
            if s.kind == "high":
                ref_high = s
            else:
                ref_low = s
            si += 1
        c = close[bar]
        if ref_high is not None and c > ref_high.price and ref_high.idx < bar:
            kind = "choch" if direction == "bear" else "bos"
            direction, last_idx, last_level, last_kind = "bull", bar, ref_high.price, kind
            ref_high = None
        elif ref_low is not None and c < ref_low.price and ref_low.idx < bar:
            kind = "choch" if direction == "bull" else "bos"
            direction, last_idx, last_level, last_kind = "bear", bar, ref_low.price, kind
            ref_low = None

    sh = last_swing(swings, "high")
    sl = last_swing(swings, "low")
    return StructureState(
        direction, last_idx, last_level, last_kind,
        sh.price if sh else float("nan"), sl.price if sl else float("nan"),
    )


def displacement(view: BarView, lookback: int = 20, mult: float = 2.0) -> float:
    """How many average-ranges the last closed bar's body covers, signed.

    Positive = up. Used as the "did price actually leave" test after a sweep;
    `mult` is the caller's threshold, returned unapplied so the model spec owns
    the number.
    """
    n = view.n
    if n < lookback + 2:
        return 0.0
    rng = view.high[n - 1 - lookback: n - 1] - view.low[n - 1 - lookback: n - 1]
    avg = float(np.mean(rng))
    if avg <= 0:
        return 0.0
    body = float(view.close[n - 1] - view.open[n - 1])
    return body / avg


def atr(view: BarView, period: int = 14) -> float:
    """Wilder-style true range average over the last `period` closed bars."""
    n = view.n
    if n < period + 1:
        return float("nan")
    h = view.high[n - period:]
    l = view.low[n - period:]
    pc = view.close[n - period - 1: n - 1]
    tr = np.maximum(h - l, np.maximum(np.abs(h - pc), np.abs(l - pc)))
    return float(np.mean(tr))
