"""`orb_sip.v2` plus a STRENGTH cut — ENGINE-11's `gate_strong` arm.

ENGINE-8 put a structure gate on this same base: long only in a confirmed daily
uptrend, short only in a confirmed downtrend, sideways is no trade. It came back
PARTIAL twice. Roughly half of all stock-days had no confirmed structure at all,
so it was mostly a sit-out rule; it removed 75% of trades and on the build
window the removed trades beat the kept ones by $47 per $1,000 risked, with the
interval excluding zero the wrong way.

This is not that gate. The difference is the whole point of the lane:

    ENGINE-8   is the daily trend UP, DOWN or NONE — a three-state label
    ENGINE-11  HOW HARD is it going, on a continuous scale, and which way

so a name whose daily chart is drifting the right way but has no confirmed
higher-high/higher-low structure is available to this gate and was invisible to
that one, and a name with textbook structure but no momentum left in it is
demoted here and was waved through there.

    preconditions  regular hours; the 09:30-09:35 candle has closed; the symbol
                   is one of the day's twenty stocks in play.
    NEW            directional trend strength — `strength/measure.py`'s number
                   at the last fully closed daily bar, signed by the side the
                   opening candle closed — must be at least the threshold in
                   `strength/config.py`. Below it is NO TRADE, not a smaller one.
    trigger        a resting stop order beyond the opening range, on the side
                   the opening candle closed. Unchanged.
    stop           the OPPOSITE EXTREME of that same candle. A price, not a
                   distance carried from the fill. Unchanged.
    target         NONE. Flat at 15:59, or the early close on a half day.

Every trade this model takes is a trade `orb_sip.v2` also took, on the same
symbol-day, at the same level, with the same stop — there is one extra reason to
skip and no new reason to enter. The runner asserts that subset relation before
it writes a number, so "what the gate removed" is an exact set and not an
inference.
"""

from __future__ import annotations

import numpy as np

from engine.backtest.types import Signal
from engine.models.orb_sip_v2 import (DECIDE_FROM, FLATTEN_MIN,  # noqa: F401
                                      NO_TARGET, OrbStocksInPlayV2)
from engine.series import BarView
from engine.strength import config as tcfg


class OrbSipStrengthGate(OrbStocksInPlayV2):
    id = "orb_sip.v2+strength"
    description = ("orb_sip.v2, taken only when the daily chart was already "
                   "trending hard in the direction the opening range broke")

    def __init__(self, atr: dict[tuple[str, int], float] | None = None,
                 strength: dict[tuple[str, int], float] | None = None,
                 threshold: float = tcfg.GATE_STRENGTH) -> None:
        super().__init__(atr)
        # The strength map IS the model. An empty one would silently degrade to
        # "no trades ever", which would read as a filter that removed
        # everything rather than as the wiring failure it is.
        if not strength:
            raise ValueError(f"{self.id}: the strength map is the model, "
                             "and it is empty")
        self.strength = strength
        self.threshold = float(threshold)

    def params(self) -> dict:
        p = super().params()
        p["directional_strength_at_least"] = self.threshold
        p["strength"] = ("(close - EMA20)/ATR14, EMA20 slope over 10 sessions "
                         "/ATR14, and 20-day up-close share, each squashed to "
                         "[-1,1] and averaged, at the last fully closed daily "
                         "bar, signed by the break direction")
        return p

    def evaluate(self, view: BarView, day: int) -> Signal | None:
        self._roll(day)
        if self._done:
            return None
        minute = int(view.last.minute)
        if minute < DECIDE_FROM:
            return None
        self._done = True

        cndl = self._opening_candle(view)
        if cndl is None:
            self.census["skip_no_opening_candle"] += 1
            return None
        o, hi, lo, c = cndl
        if not (hi > lo):
            self.census["skip_zero_width_range"] += 1
            return None
        side = self._side(o, c)
        if side is None:
            self.census["skip_doji_opening_candle"] += 1
            return None

        key = (view.symbol, int(day))
        s = self.strength.get(key)
        if s is None or not np.isfinite(s):
            self.census["skip_no_strength"] += 1
            return None
        directional = float(s) * (1.0 if side == "long" else -1.0)
        if directional < self.threshold:
            self.census["skip_weak_trend"] += 1
            return None

        entry, stop = (hi, lo) if side == "long" else (lo, hi)
        target = NO_TARGET if side == "long" else -NO_TARGET
        atr = self.atr.get(key)
        self.census["signals"] += 1
        self.census[f"signals_{side}"] += 1
        return Signal(
            self.id, view.symbol, int(day), view.i, minute, side, "stop",
            entry, stop, target, FLATTEN_MIN + 1, FLATTEN_MIN,
            {"or_high": hi, "or_low": lo, "or_open": o, "or_close": c,
             "or_size": hi - lo, "atr14": float(atr) if atr else float("nan"),
             "stop_dist": hi - lo, "ref_price": c,
             "strength": float(s), "directional_strength": directional},
            stop_from_fill=None,
        )
