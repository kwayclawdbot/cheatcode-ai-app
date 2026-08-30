"""Trend strength — one signed number per symbol per day, and nothing novel in it.

ENGINE-8 asked whether the daily trend AGREES with the breakout, as a yes/no.
Half of all stock-days answered "no structure", so the filter was mostly a
sit-out rule; it discarded 75% of trades and the discarded ones came back ahead.
This module is the graded version of the same question, built to RANK rather
than to gate: **how hard, and which way**, on a continuous scale.

## The definition, written out because a report has to be able to quote it

Read at the LAST FULLY CLOSED daily bar before the session — index `k` in that
symbol's daily series, where the session's own bar is `k+1` or later. Three
components, each already in this codebase, each scaled to about [-1, +1] so no
one of them silently dominates the average:

    d  distance   clip( (close_k - EMA20_k) / ATR14_k , -3, +3 ) / 3
    s  slope      clip( (EMA20_k - EMA20_{k-10}) / ATR14_k , -3, +3 ) / 3
    p  persistence  2 * (share of the last 20 closed bars that closed up) - 1

    STRENGTH = (d + s + p) / 3        in [-1, +1]

* **EMA20** is `primitives/trend.py`'s `ema` at period 20 — the fast leg of the
  same `trend_state` this programme has used since ENGINE-1, and the shortest of
  the two lines that file calls a trend. "A medium daily EMA" is what the brief
  asked for and this is the one already written down.
* **ATR14** is `primitives/structure.py`'s `atr` at period 14 — the same 14-day
  true-range average `sip/universe.py` computes for the eligibility filter, and
  the unit ENGINE-6 and ENGINE-7 reported stop widths in. Dividing by it makes
  every component scale-free, so a $400 stock and a $6 stock are comparable.
* **The 10-session slope window** is the one number here that is not inherited:
  half the EMA's own span, two trading weeks. Declared in `GATE.md` before
  running and not swept.
* **The clip at ±3 ATR** stops one gapping name from swamping the average. It
  binds rarely and the report says how often.

Sign is direction, magnitude is strength. **Directional strength** for a trade
is `STRENGTH * (+1 long, -1 short)`: how hard the daily chart was already going
the way the opening range broke.

## Why there are two implementations of the same arithmetic

`strength_at(view)` takes a `BarView` and is the definition. A `BarView` holds
read-only slices truncated at its own index and no reference to its parent, so
it cannot reach the bar being traded — the same guarantee `sip/daily.py` relies
on, and `tests/test_trend_strength.py` runs the poisoned-future and
amputated-future attacks against it.

`strength_series(...)` computes the same numbers for every index of a series in
one pass, because the panel is ~1.2 million ticker-days and the scalar form is
O(n) per call. It is not a second definition: the test suite requires the two to
agree to 1e-12 at every index of a random tape, and a deliberately-cheating fast
path is run through the same comparison and must be caught.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np

from engine.primitives.structure import atr as _atr_view
from engine.primitives.trend import ema as _ema_view
from engine.series import BarView

EMA_PERIOD = 20
SLOPE_DAYS = 10
ATR_PERIOD = 14
PERSIST_DAYS = 20
CLIP = 3.0

# The earliest index at which all three components exist:
#   slope       EMA20 at k-10 needs k-10 >= EMA_PERIOD-1   ->  k >= 29
#   persistence 20 up/down decisions need close[k-20]      ->  k >= 20
#   ATR14       14 true ranges need close[k-14]            ->  k >= 14
MIN_INDEX = EMA_PERIOD - 1 + SLOPE_DAYS          # 29
MIN_BARS = MIN_INDEX + 1                         # 30


@dataclass(frozen=True)
class Strength:
    """The number, and the three parts it was made of, so a report can show its
    working rather than assert a total."""

    strength: float
    distance: float
    slope: float
    persistence: float
    clipped: bool

    def directional(self, side: str) -> float:
        """Strength in the direction the opening range broke."""
        return self.strength * (1.0 if side == "long" else -1.0)


def _squash(x: float) -> tuple[float, bool]:
    c = max(-CLIP, min(CLIP, x))
    return c / CLIP, (c != x)


def strength_at(view: BarView) -> Strength | None:
    """THE definition. `None` when the symbol has too little closed history —
    which is the honest answer, and never a zero pretending to be neutral."""
    if view.n < MIN_BARS:
        return None
    c = np.asarray(view.close, dtype="float64")
    a = _atr_view(view, ATR_PERIOD)
    if not np.isfinite(a) or a <= 0:
        return None
    e = _ema_view(c, EMA_PERIOD)
    e_prev = _ema_view(c[:-SLOPE_DAYS], EMA_PERIOD)
    if not (np.isfinite(e) and np.isfinite(e_prev)):
        return None
    d, d_clip = _squash(float(c[-1] - e) / a)
    s, s_clip = _squash(float(e - e_prev) / a)
    up = c[-PERSIST_DAYS:] > c[-PERSIST_DAYS - 1:-1]
    p = 2.0 * float(np.mean(up)) - 1.0
    return Strength((d + s + p) / 3.0, d, s, p, bool(d_clip or s_clip))


# ---------------------------------------------------------------------------
# the same arithmetic, once per series instead of once per bar


def ema_series(values: np.ndarray, period: int) -> np.ndarray:
    """`out[k] == ema(values[:k+1], period)` for every k, NaN before the seed.

    `primitives.trend.ema` seeds on the SMA of the first `period` values of the
    array it is handed. That array always starts at index 0, so successive calls
    trace one recursion and this is that recursion, computed once.
    """
    v = np.asarray(values, dtype="float64")
    n = len(v)
    out = np.full(n, np.nan)
    if n < period:
        return out
    k = 2.0 / (period + 1.0)
    e = float(np.mean(v[:period]))
    out[period - 1] = e
    for i in range(period, n):
        e = float(v[i]) * k + e * (1.0 - k)
        out[i] = e
    return out


def atr_series(high: np.ndarray, low: np.ndarray, close: np.ndarray,
               period: int = ATR_PERIOD) -> np.ndarray:
    """`out[k] == atr(view(k), period)` — a simple mean of the last `period`
    true ranges, which is what `primitives.structure.atr` computes."""
    h = np.asarray(high, dtype="float64")
    l = np.asarray(low, dtype="float64")
    c = np.asarray(close, dtype="float64")
    n = len(c)
    out = np.full(n, np.nan)
    if n < period + 1:
        return out
    pc = c[:-1]
    tr = np.maximum(h[1:] - l[1:], np.maximum(np.abs(h[1:] - pc),
                                              np.abs(l[1:] - pc)))
    # tr[j] is the true range of bar j+1. atr[k] averages bars k-period+1..k.
    csum = np.concatenate(([0.0], np.cumsum(tr)))
    for k in range(period, n):
        out[k] = (csum[k] - csum[k - period]) / period
    return out


def strength_series(high: np.ndarray, low: np.ndarray, close: np.ndarray,
                    ) -> dict[str, np.ndarray]:
    """Every index of one symbol's daily series, in one pass.

    Returns arrays of the same length as the input; entries before `MIN_INDEX`,
    and any index whose ATR is not usable, are NaN — the vectorised spelling of
    `strength_at` returning `None`.
    """
    c = np.asarray(close, dtype="float64")
    n = len(c)
    nan = np.full(n, np.nan)
    if n < MIN_BARS:
        return {"strength": nan.copy(), "distance": nan.copy(),
                "slope": nan.copy(), "persistence": nan.copy(),
                "clipped": np.zeros(n, dtype=bool)}

    e = ema_series(c, EMA_PERIOD)
    a = atr_series(high, low, c, ATR_PERIOD)
    e_prev = np.full(n, np.nan)
    e_prev[SLOPE_DAYS:] = e[:-SLOPE_DAYS]

    with np.errstate(invalid="ignore", divide="ignore"):
        ok = np.isfinite(a) & (a > 0) & np.isfinite(e) & np.isfinite(e_prev)
        raw_d = np.where(ok, (c - e) / np.where(ok, a, 1.0), np.nan)
        raw_s = np.where(ok, (e - e_prev) / np.where(ok, a, 1.0), np.nan)
    d = np.clip(raw_d, -CLIP, CLIP)
    s = np.clip(raw_s, -CLIP, CLIP)
    clipped = (d != raw_d) | (s != raw_s)
    d = d / CLIP
    s = s / CLIP

    up = np.zeros(n, dtype="float64")
    up[1:] = (c[1:] > c[:-1]).astype("float64")
    cum = np.concatenate(([0.0], np.cumsum(up)))
    p = np.full(n, np.nan)
    for k in range(PERSIST_DAYS, n):
        p[k] = 2.0 * (cum[k + 1] - cum[k + 1 - PERSIST_DAYS]) / PERSIST_DAYS - 1.0

    strength = (d + s + p) / 3.0
    strength[:MIN_INDEX] = np.nan
    return {"strength": strength, "distance": d, "slope": s,
            "persistence": p, "clipped": np.nan_to_num(clipped).astype(bool)}
