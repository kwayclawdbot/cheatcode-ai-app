"""null_coinflip.v1 — the control, not a product.

A measured loss only means something if the measuring instrument is straight.
This model takes one trade per symbol per day: a deterministic pseudo-random
minute, a coin-flip direction, a market entry, a stop one ATR away and a target
two ATR away, flattened at 15:55 like the real models.

It has no thesis and cannot have edge. If the harness pays it roughly zero
before costs, the harness is straight and a real model's negative expectancy is
the model's. If the harness pays it a large negative number, the harness is
biased and every other report is void.

It is also the honest benchmark: a model that scores what a coin flip scores has
told us nothing, whatever its hit rate looks like.
"""

from __future__ import annotations

import hashlib

from engine.backtest.types import Signal
from engine.models.base import Model
from engine.primitives import structure as st
from engine.series import BarView

WINDOW_OPEN = 9 * 60 + 45
WINDOW_CLOSE = 15 * 60
FLATTEN_MIN = 15 * 60 + 55
STOP_ATR = 1.0
TARGET_ATR = 2.0
SEED = "engine-1-null-control"


def _hash(*parts) -> int:
    h = hashlib.sha256((SEED + "|" + "|".join(str(p) for p in parts)).encode())
    return int.from_bytes(h.digest()[:8], "big")


class NullCoinflip(Model):
    id = "null_coinflip.v1"
    description = "control: one coin-flip trade per symbol-day with 1:2 ATR geometry"

    def params(self) -> dict:
        return {"window": [WINDOW_OPEN, WINDOW_CLOSE], "stop_atr": STOP_ATR,
                "target_atr": TARGET_ATR, "flatten_min": FLATTEN_MIN, "seed": SEED}

    def wants_bar(self, minute: int, day: int) -> bool:
        return WINDOW_OPEN <= minute <= WINDOW_CLOSE

    def evaluate(self, view: BarView, day: int) -> Signal | None:
        last = view.last
        fire_at = WINDOW_OPEN + _hash(view.symbol, day, "minute") % (WINDOW_CLOSE - WINDOW_OPEN)
        if last.minute != fire_at:
            return None
        a = st.atr(view, 14)
        if not (a == a) or a <= 0:
            return None
        long = bool(_hash(view.symbol, day, "side") % 2)
        px = last.close
        if long:
            return Signal(self.id, view.symbol, day, view.i, last.minute, "long",
                          "market", px, px - STOP_ATR * a, px + TARGET_ATR * a,
                          last.minute + 5, FLATTEN_MIN, {"atr": a})
        return Signal(self.id, view.symbol, day, view.i, last.minute, "short",
                      "market", px, px + STOP_ATR * a, px - TARGET_ATR * a,
                      last.minute + 5, FLATTEN_MIN, {"atr": a})
