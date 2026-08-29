"""null_coinflip.v1.matched — the control, restricted to the model's own tape.

ENGINE-1's control took a coin flip on every symbol-day with 1:2 ATR geometry.
That answers "is the harness straight". It does not answer "is THIS model's
direction call better than a coin flip", because the model trades a hand-picked
subset of days with a stop geometry of its own.

So this control is matched: same symbols, same days, same decision minute, same
risk and reward distances in price as the trade the model actually took — and a
direction chosen by a deterministic coin flip. Anything the model earns over
this control it earned by knowing which way to point.
"""

from __future__ import annotations

import hashlib

from engine.backtest.types import Signal
from engine.models.base import Model
from engine.series import BarView

SEED = "engine-2-matched-control"


def _hash(*parts) -> int:
    h = hashlib.sha256((SEED + "|" + "|".join(str(p) for p in parts)).encode())
    return int.from_bytes(h.digest()[:8], "big")


class MatchedCoinflip(Model):
    id = "null_coinflip.v1.matched"
    description = "control: the model's own days and stop geometry, direction by coin flip"

    def __init__(self, plan: dict[int, tuple[int, float, float]],
                 flatten_min: int = 15 * 60 + 55) -> None:
        # plan: {day -> (decision_minute, risk_per_share, reward_per_share)}
        self.plan = plan
        self.flatten_min = flatten_min

    def params(self) -> dict:
        return {"seed": SEED, "planned_days": len(self.plan),
                "flatten_min": self.flatten_min}

    def wants_bar(self, minute: int, day: int) -> bool:
        p = self.plan.get(day)
        return p is not None and p[0] == minute

    def evaluate(self, view: BarView, day: int) -> Signal | None:
        p = self.plan.get(day)
        if p is None:
            return None
        minute, risk, reward = p
        last = view.last
        if last.minute != minute or risk <= 0 or reward <= 0:
            return None
        px = float(last.close)
        long = bool(_hash(view.symbol, day, "side") % 2)
        if long:
            return Signal(self.id, view.symbol, day, view.i, last.minute, "long",
                          "market", px, px - risk, px + reward,
                          last.minute + 5, self.flatten_min, {"matched": True})
        return Signal(self.id, view.symbol, day, view.i, last.minute, "short",
                      "market", px, px + risk, px - reward,
                      last.minute + 5, self.flatten_min, {"matched": True})
