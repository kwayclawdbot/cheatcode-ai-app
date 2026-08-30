"""orb_sip.v4 — the owner's stop: a candle-relative stop near the entry.

The owner's spec, verbatim (2026-08-29):

    "we should only take an entry on the breakout of orb, stop at the low of
     5min candle before the entry candle (if bullish) and top if bearish. if
     stopped out we take the loss"

`orb_sip.v4` is `orb_sip.v2` with ONE rule changed. The stop moves from the
opposite extreme of the 09:30-09:35 opening range — a median 134 cents, about
0.75 ATR, hit on 31.6% of ENGINE-7's held-back trades — to a stop taken from a
five-minute candle at the breakout. Universe, selection, opening range,
direction, entry mechanics, end-of-day exit, sizing, costs and snapshot are
untouched, and ENGINE-6's `selection.json.gz` is reused byte for byte, so v2
and both v4 arms trade the same candidate symbol-days and differ only in where
the stop sits.

"if stopped out we take the loss" is v2's behaviour already: no re-entry, no
move to breakeven, no partial, no second attempt. It is CONFIRMED here rather
than implemented — one decision a day (`self._done`), one stop, one exit.

## The ambiguity, and why there are two arms

"the 5min candle before the entry candle" has cost this programme two rounds
already (ENGINE-4 read it one way, ENGINE-5 measured both and found the wider
reading better on average). It is ambiguous again here, and it is settled with
numbers rather than with a guess: BOTH readings are pre-registered as arms and
both are reported.

v2's entry is a resting stop order at the range edge, filled INTRABAR on a
one-minute bar. So the five-minute candle in which the fill happens is both
"the breakout candle" and "the entry candle" — the two words the owner used
name the same bar under these mechanics, which is exactly why the sentence is
ambiguous. Written as candles:

    orb_sip.v4_trigger   stop at the extreme of the BREAKOUT candle itself —
                         the five-minute candle the fill happened in. THE
                         LITERAL READING of the owner's words if "the entry
                         candle" is the next candle along, which is what a
                         trader who enters at the open of the bar after the
                         breakout bar closes would mean.

    orb_sip.v4_prior     stop at the extreme of the five-minute candle
                         IMMEDIATELY PRECEDING the breakout candle. This is the
                         owner's earlier "previous 5min h/l" reading, the one
                         ENGINE-5 measured and preferred.

Long stops at the low of that candle, short stops at its high, per the spec.

## Causality: the trigger arm's candle is not finished when the trade is put on

The breakout candle is still forming at the moment of the fill. Its final low
is in the future. A stop placed from it would be lookahead, and this programme
does not do that, so **the trigger arm's stop is that candle's extreme AS IT
STOOD AT THE FILL MINUTE** — the low over the candle's one-minute bars from the
candle's start through and including the bar the order filled on. That is what
a trader looking at the chart at the moment of the fill can actually see, it is
fixed when the order is placed and never moved, and it is enforced structurally:
the resolver is handed a `BarView` truncated at the fill bar and there is no
attribute on it that reaches bar j+1.

The prior arm's candle is complete by construction, so no such question arises
for it. The earliest possible fill minute is 09:35 (the decision is taken on
the 09:34-09:35 bar and can first act on the next one), so the prior arm's
candle is at worst the 09:30-09:35 opening range itself — which means that on
the ~62% of v2 trades that fill inside 09:35-09:40, **the prior arm IS v2**.
That is a property of the reading, not a bug, and the report states what share
of trades it applies to.

## The prior that matters, stated in the code as well as the report

ENGINE-6 replicated the published stocks-in-play ORB with a stop at 10% of the
14-day ATR — a median 12.4 cents. It was hit on **90.1%** of trades and returned
**-0.635R**. The ENGINE-6 post-mortem swept that one number and the sign of the
whole result moves with it: -0.635R at 0.10x ATR, -0.073R at 0.25x, +0.005R at
0.50x, +0.012R at 1x. v2's opening-range stop is about 0.75 ATR and is what
turned the model from badly losing to roughly breakeven.

**Both of these arms are TIGHTER than v2's.** This lane is therefore moving back
toward the setting that failed. A candle-relative stop is a real trader's rule
and is not the same object as a fraction of an ATR, so it may still work — but
the report is required to print the realised stop width and the stop-out share
of each arm beside v2's on the same trades, and to say so loudly if the stop-out
share climbs back toward 90%.
"""

from __future__ import annotations

import hashlib
from collections import Counter

import numpy as np

from engine.backtest.types import Signal
from engine.models.base import Model
from engine.series import BarView

OPEN_MIN = 9 * 60 + 30            # 09:30
RANGE_END_MIN = 9 * 60 + 35       # 09:35, exclusive bound of the range window
DECIDE_FROM = RANGE_END_MIN - 1   # the 09:34-09:35 one-minute bar closes here
DECIDE_UNTIL = 10 * 60 + 30       # give up if the tape never printed 09:35
FLATTEN_MIN = 15 * 60 + 59
NO_TARGET = 1e9
CANDLE_MIN = 5                    # the owner's chart is a five-minute chart


def candle_start(minute: int) -> int:
    """The start minute of the five-minute candle containing `minute`.

    The grid is anchored at 09:30, so it is the grid a trader looking at a
    five-minute chart of the regular session sees: 09:30-09:35, 09:35-09:40,
    and so on. Bars carry their START minute, so the 09:30-09:35 candle is the
    bars at minutes 570..574 inclusive.
    """
    return OPEN_MIN + CANDLE_MIN * ((minute - OPEN_MIN) // CANDLE_MIN)


class _OrbSipV4(Model):
    """The shared mechanics. Subclasses declare two CLASS attributes and
    nothing else: which candle the stop comes from, and where the direction
    comes from. There is deliberately no runtime parameter to vary."""

    STOP_READING: str = "trigger"     # "trigger" | "prior"
    DIRECTION: str = "candle"         # "candle" | "coinflip"
    SEED = "engine-6-matched-control"  # v1's and v2's seed, unchanged
    CANDLE_STOP = True                 # the runner's contract; see backtest/candle_stop.py

    def __init__(self, atr: dict[tuple[str, int], float] | None = None) -> None:
        # `atr` is REPORTING ONLY, exactly as in v2 and v3 — the model never
        # reads it to make a decision and a missing ATR is not a reason to skip.
        self.atr = atr or {}
        self.census: Counter = Counter()
        self._day = -1
        self._done = False

    def params(self) -> dict:
        return {
            "opening_range_minutes": 5,
            "direction": {"candle": "sign of the 09:30-09:35 candle",
                          "coinflip": "coin flip"}[self.DIRECTION],
            "entry": "resting stop order at the range edge",
            "stop": {
                "trigger": "the extreme of the five-minute candle the fill "
                           "happened in, as it stood at the fill minute",
                "prior": "the extreme of the five-minute candle immediately "
                         "before the one the fill happened in",
            }[self.STOP_READING],
            "stop_candle_minutes": CANDLE_MIN,
            "target": "none — exit at the close",
            "on_stop_out": "take the loss — no re-entry, no breakeven, no partial",
            "flatten_min": FLATTEN_MIN,
            "selection": "top 20 of the pool by 09:35 relative volume",
        }

    def wants_bar(self, minute: int, day: int) -> bool:
        return DECIDE_FROM <= minute <= DECIDE_UNTIL

    def _roll(self, day: int) -> None:
        if self._day != day:
            self._day = day
            self._done = False
            self.census["days_seen"] += 1

    def finish(self) -> None:
        self._day = -1

    @staticmethod
    def _opening_candle(view: BarView) -> tuple[float, float, float, float] | None:
        """(open, high, low, close) of the 09:30-09:35 five-minute candle.

        Byte-identical in behaviour to `orb_sip.v2._opening_candle`, and
        duplicated rather than imported for the reason v2 gave when it
        duplicated v1's: the two models are meant to be comparable forever, and
        a shared helper is a shared way for that to stop being true.
        `tests/test_orb_sip_v4.py` asserts the two agree on the same tape.
        """
        today = view.today_slice()
        m = view.minute[today]
        keep = np.flatnonzero((m >= OPEN_MIN) & (m < RANGE_END_MIN))
        if len(keep) == 0:
            return None
        a = today.start + int(keep[0])
        b = today.start + int(keep[-1]) + 1
        return (float(view.open[a]), float(np.max(view.high[a:b])),
                float(np.min(view.low[a:b])), float(view.close[b - 1]))

    def _flip(self, symbol: str, day: int) -> str:
        h = hashlib.sha256(f"{self.SEED}|{symbol}|{day}".encode()).digest()
        return "long" if int.from_bytes(h[:8], "big") % 2 else "short"

    # -- the decision, taken at 09:35 and identical to v2's -----------------

    def evaluate(self, view: BarView, day: int) -> Signal | None:
        self._roll(day)
        if self._done:
            return None
        minute = int(view.last.minute)
        if minute < DECIDE_FROM:
            return None
        self._done = True                 # one decision a day, taken at 09:35

        cndl = self._opening_candle(view)
        if cndl is None:
            self.census["skip_no_opening_candle"] += 1
            return None
        o, hi, lo, c = cndl
        if not (hi > lo):
            self.census["skip_zero_width_range"] += 1
            return None
        if c == o:
            self.census["skip_doji_opening_candle"] += 1
            return None

        side = (self._flip(view.symbol, int(day)) if self.DIRECTION == "coinflip"
                else ("long" if c > o else "short"))
        entry = hi if side == "long" else lo
        # The stop in the Signal is v2's — the opposite extreme of the opening
        # range. It is a DECISION-TIME PLACEHOLDER and never the stop that runs:
        # the runner replaces it at the fill with `stop_at_fill` below. It is
        # carried for two reasons: the replay's `risk_per_share > 0` guard needs
        # a number at decision time, and printing v2's stop beside the one that
        # actually ran is how the report compares the two readings on the same
        # trade. `CANDLE_STOP = True` is the runner's contract that it WILL be
        # replaced; `run_engine10.py` asserts every trade carries a stop that
        # differs from it, or counts the ones that do not.
        placeholder = lo if side == "long" else hi
        target = NO_TARGET if side == "long" else -NO_TARGET
        atr = self.atr.get((view.symbol, int(day)))
        self.census["signals"] += 1
        self.census[f"signals_{side}"] += 1
        return Signal(
            self.id, view.symbol, int(day), view.i, minute, side, "stop",
            entry, placeholder, target, FLATTEN_MIN + 1, FLATTEN_MIN,
            {"or_high": hi, "or_low": lo, "or_open": o, "or_close": c,
             "or_size": hi - lo, "atr14": float(atr) if atr else float("nan"),
             "v2_stop": placeholder, "v2_risk": abs(entry - placeholder),
             "ref_price": c, "stop_reading": self.STOP_READING},
            stop_from_fill=None,
        )

    # -- the stop, resolved at the fill -------------------------------------

    def stop_at_fill(self, view: BarView, signal: Signal,
                     fill_price: float) -> float | None:
        """The stop level for a position just filled on bar `view.i`.

        `view` is truncated at the fill bar. There is no bar j+1 in here, so
        the trigger arm cannot read the rest of its own candle even by mistake.

        Returns None if the required candle is not on the tape, which the
        runner counts as a rejection rather than silently substituting
        something else.
        """
        m = int(view.minute[-1])
        cs = candle_start(m)
        today = view.today_slice()
        mins = view.minute[today]

        if self.STOP_READING == "trigger":
            keep = np.flatnonzero(mins >= cs)          # ... through the fill bar
        elif self.STOP_READING == "prior":
            keep = np.flatnonzero((mins >= cs - CANDLE_MIN) & (mins < cs))
        else:                                          # pragma: no cover
            raise ValueError(self.STOP_READING)

        if len(keep) == 0:
            self.census[f"no_{self.STOP_READING}_candle"] += 1
            return None
        a = today.start + int(keep[0])
        b = today.start + int(keep[-1]) + 1
        self.census[f"stop_from_{self.STOP_READING}_candle"] += 1
        if signal.side == "long":
            return float(np.min(view.low[a:b]))
        return float(np.max(view.high[a:b]))


# --- the two arms this lane pre-registered ----------------------------------

class OrbSipV4Trigger(_OrbSipV4):
    id = "orb_sip.v4_trigger"
    description = ("5-minute opening range, breakout on the side the first "
                   "candle closed, stop at the extreme of the five-minute "
                   "candle the fill happened in, no target, flat at the close")
    STOP_READING = "trigger"
    DIRECTION = "candle"


class OrbSipV4Prior(_OrbSipV4):
    id = "orb_sip.v4_prior"
    description = ("5-minute opening range, breakout on the side the first "
                   "candle closed, stop at the extreme of the five-minute "
                   "candle BEFORE the one the fill happened in, no target, "
                   "flat at the close")
    STOP_READING = "prior"
    DIRECTION = "candle"


class OrbSipV4TriggerCoinflip(OrbSipV4Trigger):
    """The matched control: same symbols, same days, same 09:35 decision, same
    opening range, same entry mechanics, same STOP READING — direction by a
    deterministic hash instead of by the sign of the opening candle. The seed
    is v1's and v2's, unchanged, so every lane in this family flips the same
    way on the same symbol-days."""

    id = "orb_sip.v4_trigger.coinflip"
    description = "control: the same days and stop reading, direction by coin flip"
    DIRECTION = "coinflip"


class OrbSipV4PriorCoinflip(OrbSipV4Prior):
    id = "orb_sip.v4_prior.coinflip"
    description = "control: the same days and stop reading, direction by coin flip"
    DIRECTION = "coinflip"
