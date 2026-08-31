"""The owner's FULL spec: preceding-candle stop AND a 1R/2R target.

ENGINE-17 tested the owner's stop with ENGINE-13's exit — hold to the 15:59
bell — and it lost $66 per $1,000 risked at a 59.3% knock-out rate. The owner's
reply, and it is a fair one:

    "Typically, I can get a two r, if not at least a one r, out of a trade set
     up on a fifteen minute orb breakout with a five minute candlestick close
     using the previous candlestick low as a stop loss targeting one to two r."

**The target was in the specification and ENGINE-17 left it out.** That is not a
detail. A stop and an exit are a matched pair, and this one was mismatched:

* a WIDE stop with no target is coherent — that is the incumbent, and ENGINE-14
  showed its entire profit lives above +1R, so capping it destroys it;
* a TIGHT stop with a target is coherent — small R, banked often;
* a TIGHT stop with NO target is the worst of both — every knock-out of a close
  stop and none of the banking. A trade runs +2R, is not taken, round-trips,
  and pays the stop anyway.

ENGINE-17 measured the third thing. This module measures the second.

`target_r` is resolved from the FILL in `backtest/fills.py::resolved_target`,
not from the decision price, for the reason ENGINE-4 established: a decision is
priced at one bar's close and filled at the next bar's open, so booking the
target off the earlier number would quietly make a 2R model a 1.6R-to-2.5R model
in a direction correlated with the gap.

A target is a resting LIMIT and fills AT the level with no slippage; the stop is
a market order and still slips. When one bar's range holds both, `fills.py`
assumes the STOP was hit first. That assumption is pessimistic, it is unchanged
for this lane, and the runner counts how often it decides a trade — with a stop
this tight and a target this near, it will decide more of them than in any
previous lane.
"""

from __future__ import annotations

import dataclasses

from engine.models.orb_sip_15c_prior import OrbSip15ClosePriorStop


class OrbSip15ClosePriorTarget(OrbSip15ClosePriorStop):
    """The owner's stop, plus a fixed R-multiple target measured from the fill."""

    def __init__(self, atr=None, target_r: float = 1.0) -> None:
        super().__init__(atr)
        self.target_r = float(target_r)
        self.id = f"orb_sip.v10_15c_prior_{self.target_r:g}r".replace(".", "p", 1) \
            if False else f"orb_sip.v10_15c_prior_{self.target_r:g}r"

    description = ("15-minute opening range, entry on the first 5-minute close "
                   "outside it, stop at the preceding 5-minute candle's "
                   "extreme, fixed R-multiple target from the fill")

    def params(self) -> dict:
        p = super().params()
        p["target"] = f"{self.target_r:g}R from the fill (full exit)"
        return p

    def evaluate(self, view, day):
        sig = super().evaluate(view, day)
        if sig is None:
            return None
        r = abs(sig.entry_price - sig.stop_price)
        est = (sig.entry_price + self.target_r * r if sig.side == "long"
               else sig.entry_price - self.target_r * r)
        meta = dict(sig.meta)
        meta["target_r"] = self.target_r
        return dataclasses.replace(sig, model_id=self.id, target_price=est,
                                   target_r=self.target_r, meta=meta)
