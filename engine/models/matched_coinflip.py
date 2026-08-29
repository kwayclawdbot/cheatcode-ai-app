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


class MatchedCoinflipMulti(Model):
    """The same control, for a model that can take more than one trade a day.

    `orb_simple_*.v1` allows one trade per DIRECTION per day, so a day's plan is
    a list rather than a single entry, and the risk distance is paired with a
    target expressed in R so the control's target is measured from its own fill
    exactly as the model's is. Everything else — symbols, days, decision
    minutes, stop distance in price, market entry on the next bar, flat at 15:55
    — is the model's, and only the direction is flipped.
    """

    id = "null_coinflip.v1.matched"
    description = ("control: the model's own days, minutes and stop distances, "
                   "direction by coin flip")

    def __init__(self, plan: dict[int, list[tuple[int, float]]],
                 target_r: float = 2.0,
                 flatten_min: int = 15 * 60 + 55) -> None:
        # plan: {day -> [(decision_minute, risk_per_share), ...]}
        self.plan = {int(d): {int(m): float(r) for m, r in v}
                     for d, v in plan.items()}
        self.target_r = target_r
        self.flatten_min = flatten_min

    def params(self) -> dict:
        return {"seed": SEED, "planned_days": len(self.plan),
                "planned_entries": sum(len(v) for v in self.plan.values()),
                "target_r": self.target_r, "flatten_min": self.flatten_min}

    def wants_bar(self, minute: int, day: int) -> bool:
        p = self.plan.get(day)
        return p is not None and minute in p

    def evaluate(self, view: BarView, day: int) -> Signal | None:
        risk = (self.plan.get(day) or {}).get(int(view.last.minute))
        if risk is None or risk <= 0:
            return None
        last = view.last
        px = float(last.close)
        minute = int(last.minute)
        long = bool(_hash(view.symbol, day, minute, "side") % 2)
        side = "long" if long else "short"
        stop = px - risk if long else px + risk
        target = (px + self.target_r * risk if long else px - self.target_r * risk)
        return Signal(self.id, view.symbol, day, view.i, minute, side,
                      "market", px, stop, target, minute + 5, self.flatten_min,
                      {"matched": True, "risk_ps": risk},
                      target_r=self.target_r)
