"""orb_sip.v9_15c_prior — the owner's stop on the 15-minute close-confirmed break.

The owner, 2026-08-30, with a worked example:

    "the stop should be the bottom of five minute candlestick preceding the
     trigger candle. So the trigger candle was 105 to 106, and the five minute
     candlestick before that was 103 to 105, then the stop should be at 103."

This is `orb_sip.v5_15c` (ENGINE-13) with ONE rule changed — the stop — and it
is aimed at the precise reason ENGINE-13 failed.

ENGINE-13 kept the incumbent's stop rule ("the opposite extreme of the range")
and read it on the wider 15-minute range, which put the stop a median 177 cents
away, 0.99 ATR, against the incumbent's 134 cents. Its report's conclusion was
that the confirmation "buys a better stop and sells a worse price, and the price
is the bigger number": waiting for a five-minute close moves the ENTRY further
from the far side of the range, so the risk denominator inflates and the same
dollar move reports as a smaller R. It lost $13 per $1,000 risked.

The owner's rule attacks exactly that. The break is still confirmed by a
five-minute CLOSE outside the 15-minute range, but the stop is no longer the far
side of that range — it is the extreme of the five-minute candle immediately
BEFORE the one that triggered. Long stops at that candle's low, short at its
high. The entry stays where it was and the stop comes to meet it.

## What is already known about this stop, and it is not nothing

ENGINE-10 measured the same rule on the FIVE-minute opening range with a
resting-order entry, and pre-registered both readings of "the candle before the
entry candle" because the phrase was ambiguous under those mechanics:

    orb_sip.v4_trigger   the breakout candle itself   0.17 ATR   85.8% stopped   -$605
    orb_sip.v4_prior     the candle BEFORE it         0.51 ATR   44.3% stopped   +$15
    orb_sip.v2           opposite extreme of range    0.72 ATR   31.3% stopped   +$17

**The owner's example removes the ambiguity this time.** 105->106 is the trigger
candle and 103->105 is "the five minute candlestick before that", so the stop is
the PRECEDING candle's extreme — v4_prior's reading, the one that did not fail.
Only that reading is built here. The trigger-candle reading is not resurrected.

## Causality — this stop is knowable, and that is not automatic

ENGINE-10's trigger arm had a real problem: the breakout candle is still forming
when a resting order fills inside it, so its final low is in the future and had
to be taken "as it stood at the fill minute". **No such problem exists here.**
The trigger is a five-minute CLOSE, so at the decision moment both the trigger
candle and the candle before it are fully closed and fixed. The stop is a
published fact about the past.

## The edges, decided before the run rather than discovered

* **the first block.** If the trigger is 09:45-09:50, the preceding candle is
  09:40-09:45, which sits INSIDE the opening range. That is well defined and it
  is traded; it is not a special case and it is not skipped.
* **an inverted stop.** A gap between the preceding candle and the fill can put
  the preceding candle's low ABOVE a long's fill. Risk would be zero or
  negative. Those are SKIPPED and counted, never clamped to something tradeable.
* **a missing candle.** No one-minute bars in the preceding five-minute window
  means no stop. Skipped and counted. "Not measured" is not "no stop".
"""

from __future__ import annotations

import numpy as np

from engine.backtest.types import Signal
from engine.models.orb_sip_15c import (BLOCK_MINUTES, FLATTEN_MIN,  # noqa: F401
                                       NO_TARGET, OrbSip15Close, is_block_close)
from engine.series import BarView


class OrbSip15ClosePriorStop(OrbSip15Close):
    """15-minute range, five-minute close confirmation, stop on the PRECEDING
    five-minute candle."""

    id = "orb_sip.v9_15c_prior"
    description = ("15-minute opening range, entry on the first 5-minute close "
                   "outside it, stop at the extreme of the 5-minute candle "
                   "BEFORE the trigger candle, no target, flat at the close")

    def params(self) -> dict:
        p = super().params()
        p["stop"] = ("the extreme of the 5-minute candle immediately preceding "
                     "the trigger candle (low if long, high if short)")
        return p

    @staticmethod
    def _preceding_candle(view: BarView, minute: int) -> tuple[float, float] | None:
        """(high, low) of the five-minute block that closed just before this one.

        The trigger block occupies minutes [m-4, m]; the one before it occupies
        [m-9, m-5]. Both are fully closed at the close of bar `m`, so nothing
        here reaches forward — and it could not, because the view is truncated
        at `m` and holds no reference to its parent series.
        """
        lo_min, hi_min = minute - 2 * BLOCK_MINUTES + 1, minute - BLOCK_MINUTES
        today = view.today_slice()
        m = view.minute[today]
        keep = np.flatnonzero((m >= lo_min) & (m <= hi_min))
        if len(keep) == 0:
            return None
        a = today.start + int(keep[0])
        b = today.start + int(keep[-1]) + 1
        return (float(np.max(view.high[a:b])), float(np.min(view.low[a:b])))

    def evaluate(self, view: BarView, day: int) -> Signal | None:
        sig = super().evaluate(view, day)
        if sig is None:
            return None
        prev = self._preceding_candle(view, int(sig.decision_minute))
        if prev is None:
            self.census["skip_no_preceding_candle"] += 1
            return None
        p_high, p_low = prev
        stop = p_low if sig.side == "long" else p_high
        # An inverted stop is not clamped into something tradeable. A long whose
        # protective level sits above its own entry is not a trade.
        if sig.side == "long" and not (stop < sig.entry_price):
            self.census["skip_inverted_stop"] += 1
            return None
        if sig.side == "short" and not (stop > sig.entry_price):
            self.census["skip_inverted_stop"] += 1
            return None
        meta = dict(sig.meta)
        meta.update({"prev_high": p_high, "prev_low": p_low,
                     "range_stop": sig.stop_price,     # what ENGINE-13 would have used
                     "stop_dist": abs(sig.entry_price - stop)})
        self.census["prior_stop_signals"] += 1
        return Signal(
            self.id, sig.symbol, sig.day, sig.decision_idx, sig.decision_minute,
            sig.side, sig.entry_type, sig.entry_price, stop, sig.target_price,
            sig.expiry_minute, sig.exit_minute, meta, stop_from_fill=None)
