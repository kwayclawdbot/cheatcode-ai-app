"""A 1R take-profit on the two entry rules this programme has measured.

The owner, 2026-08-30: *"If theres no target then theres no trade add a 1r take
profit"*.

Both models below are a subclass that changes exactly one thing: the signal
carries `target_r = 1.0`, so a resting limit sits one unit of risk from the
FILL. Nothing else moves — not the range, not the direction rule, not the entry,
not the stop level, not the 15:59 flatten, not the selection, not the costs.

**Why `target_r` and not a price.** A decision is priced at one bar's close and
filled at the next bar's open, so the risk the position actually carries is not
the risk the decision was priced on. Booking a target off the earlier number
would quietly make a 1R model a 0.8R-to-1.3R model, trade by trade, in a
direction correlated with the gap. `backtest/fills.py::resolved_target` measures
it from the fill instead, which is the same machinery ENGINE-4's 2R target used.
`target_price` here is only the decision-time estimate and the engine does not
trade on it.

**The prior, and it is not favourable.** `orb_sip.v2` has a positive mean net R
sitting on a NEGATIVE median, which means a minority of trades that run to the
bell carry the whole result. A 1R cap deletes that tail by construction.
ENGINE-6's own docstring says the published variant works *because* the winners
run, and ENGINE-5 already measured a looser 2R cap as a FAIL. See
`engine/models/orb_sip.v6_1r/GATE.md`, committed before any number these classes
produced existed.

**One thing that was dormant is now live.** With no target, `fills.py`'s
stop-before-target rule — when a single bar's range holds both levels, assume
the stop — could never fire. It fires here. It is pessimistic, it is not being
relaxed for this lane, and the runner counts how often it decides a trade.
"""

from __future__ import annotations

import dataclasses

from engine.backtest.types import Signal
from engine.models.orb_sip_15c import OrbSip15Close
from engine.models.orb_sip_v2 import OrbStocksInPlayV2

TARGET_R = 1.0


def _with_1r_target(sig: Signal, model_id: str) -> Signal:
    """Same signal, plus a 1R limit measured from the fill.

    `target_price` is the decision-time ESTIMATE and exists only so the trade
    dump has a number to print; `target_r` is what the engine resolves against.
    """
    r = abs(sig.entry_price - sig.stop_price)
    est = (sig.entry_price + TARGET_R * r if sig.side == "long"
           else sig.entry_price - TARGET_R * r)
    meta = dict(sig.meta)
    meta["target_r"] = TARGET_R
    meta["target_estimate"] = est
    return dataclasses.replace(sig, model_id=model_id, target_price=est,
                               target_r=TARGET_R, meta=meta)


class OrbSipV2Target1R(OrbStocksInPlayV2):
    """`orb_sip.v2` with a 1R take-profit. The incumbent's entry, capped."""

    id = "orb_sip.v6_1r"
    description = ("5-minute opening range, stop at the opposite extreme, "
                   "take-profit at 1R from the fill")

    def params(self) -> dict:
        p = super().params()
        p["target"] = "1R from the fill (full exit)"
        return p

    def evaluate(self, view, day):
        sig = super().evaluate(view, day)
        return None if sig is None else _with_1r_target(sig, self.id)


class OrbSip15Close1R(OrbSip15Close):
    """`orb_sip.v5_15c` with a 1R take-profit. The 15-minute entry, capped."""

    id = "orb_sip.v6_15c_1r"
    description = ("15-minute opening range entered on a 5-minute close, stop "
                   "at the opposite extreme, take-profit at 1R from the fill")

    def params(self) -> dict:
        p = super().params()
        p["target"] = "1R from the fill (full exit)"
        return p

    def evaluate(self, view, day):
        sig = super().evaluate(view, day)
        return None if sig is None else _with_1r_target(sig, self.id)
