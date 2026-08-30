"""orb_spy.v1 — `orb_sip.v2`, with the selection step removed.

ENGINE-7 established that the stocks-in-play ORB makes its money from being in
the day's twenty most abnormally active names (H4 cleared its own interval) and
that the per-trade edge inside that twenty is small and not distinguishable
from zero. ENGINE-9 then measured the selector itself. Neither lane could say
anything about SPY, for a mechanical reason: **the pool is single stocks and SPY
never ranks as abnormally active, so the strategy has never once selected it.**
Verified on ENGINE-6's own selection file — 0 SPY trades out of 42,937.

So the owner's question is open and cheap to answer: does the same rule work on
SPY alone, traded every session, with no selection step at all?

This model is that question and nothing else. It is `orb_sip.v2` — the same
5-minute opening range, the same direction rule, the same resting-stop entry,
the same **stop at the opposite extreme of the opening candle**, the same
absence of a target, the same flat-at-the-bell exit, the same one-decision-a-day
discipline. It is implemented as a SUBCLASS that overrides nothing but its name,
so the two cannot silently drift apart; `tests/test_orb_spy_v1.py` asserts that
the subclass adds no behaviour and that the trades it produces on a fixture are
identical to v2's, field for field, save the model id.

**Why this is not ENGINE-4 again.** ENGINE-4 also traded SPY every day, and lost
in all fifteen years. It used a 15-minute range, a 1-hour or 4-hour trend
confirmation, a 2R target — and a stop at the TRIGGER CANDLE's own extreme,
which came out at a median 29 cents on a $334 share. ENGINE-6's sweep and
ENGINE-10's out-of-sample confirmation both say stop width is the only parameter
this programme has ever found that decides the sign of this family, and 29 cents
is deep in the losing zone. This lane is the first time the WIDE stop has been
put on SPY.

    preconditions  regular hours; the 09:30-09:35 five-minute candle has closed.
                   There is NO selection: every session of the instrument is
                   traded, which is the whole of the change from `orb_sip.v2`.
    trigger        a resting stop order beyond the five-minute opening range, on
                   the side the first candle closed — above the high if that
                   candle was bullish, below the low if it was bearish. The
                   other side is not traded, whatever price does.
    stop           the OPPOSITE EXTREME of that same five-minute candle, as a
                   PRICE and not a distance carried from the fill.
    target         NONE. Exit at the end of the day.
    horizon        flat at 15:59 ET, or the early close on a half day.

SPY is the subject. QQQ and IWM are in the same cache and are run and reported
SEPARATELY; they are never pooled into a SPY number and cannot change the SPY
verdict. See `engine/models/orb_spy.v1/GATE.md`, committed before any number
produced by this file existed.
"""

from __future__ import annotations

from engine.models.orb_sip_v2 import (OrbStocksInPlayV2,
                                      OrbStocksInPlayV2Coinflip)


class OrbSpyV1(OrbStocksInPlayV2):
    """`orb_sip.v2` on one instrument, every session, no selection.

    Nothing is overridden but the name and the parameter block. The trade logic
    — the opening candle, the direction rule, the entry, the stop level, the
    absence of a target, the flatten minute — is inherited unchanged, which is
    the strongest available guarantee that this is the same spec.
    """

    id = "orb_spy.v1"
    description = ("5-minute opening range on one instrument every session, "
                   "breakout on the side the first candle closed, stop at the "
                   "opposite extreme of that same candle, no target, flat at "
                   "the close")

    def params(self) -> dict:
        p = super().params()
        p["selection"] = "none — every session of the instrument is traded"
        return p


class OrbSpyV1Coinflip(OrbStocksInPlayV2Coinflip):
    """The matched control: `orb_spy.v1` with the direction call replaced.

    Same instrument, same sessions, same 09:35 decision, same opening range,
    same entry mechanics, same stop geometry — enter at one extreme, stop at the
    other — same end-of-day exit. The ONLY difference is that the side comes
    from a deterministic hash instead of from the sign of the opening candle.
    The seed is ENGINE-6's, unchanged, so a symbol-day flips the same way here as
    it would have in the stocks lane.
    """

    id = "orb_spy.v1.coinflip"
    description = ("control: the same sessions and geometry, direction by coin "
                   "flip")

    def params(self) -> dict:
        p = super().params()
        p["selection"] = "none — every session of the instrument is traded"
        p["direction"] = "deterministic coin flip"
        return p
