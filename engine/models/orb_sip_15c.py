"""orb_sip.v5_15c — a 15-minute opening range, entered on a five-minute CLOSE.

The owner, 2026-08-30: *"instead of first 5 min do the 15orb with 5min candle
break close. Then add spy confluence going same direction as break"*.

Two changes to `orb_sip.v2`, the incumbent, and nothing else changes — not the
universe, not the selection, not the end-of-day exit, not the sizing, not the
costs, not the traded snapshot:

    range      09:30-09:45 instead of 09:30-09:35.

    trigger    the first five-minute block from 09:45 whose CLOSE is strictly
               outside the range. The incumbent rests a stop order at the range
               edge and is filled by a wick; this model requires the candle to
               finish there. A touch arms nothing.

    direction  the side that was closed through. The incumbent takes its side
               from the sign of the opening candle, which a 15-minute range
               with three candles does not have; and the owner's rule names the
               break itself as the trigger. So the break decides the side, and
               this model and the incumbent CAN take opposite sides on the same
               name on the same morning. `run_engine13.py` counts how often.

    entry      a MARKET order at the open of the next one-minute bar. Not the
               confirming close: that price is gone by the time the candle is
               known to have closed there.

    stop       the OPPOSITE EXTREME of the 09:30-09:45 range — the incumbent's
               rule, read on the wider range. A PRICE, not a distance carried
               from the fill.

    target     NONE. Flat at 15:59, or the early close on a half day.

**The stop is WIDER than the incumbent's by construction, and R divides by it.**
A 15-minute range is wider than a 5-minute one and the confirming close puts the
fill further from the far side again, so this model can earn more cents a share
than the incumbent and still report a smaller R. That is why the gate is decided
in dollars per $1,000 risked and why the report prints realised stop width for
every arm. See `engine/models/orb_sip.v5_15c/GATE.md`, committed before any
number this file produces existed.

`OrbSip15CloseSpy` is the same model with one gate added: SPY must have moved
the same way as the break, measured from the 09:45 range close to the confirming
block's close. The SPY reads go through `SpyPanel`, which cannot reach a minute
later than the one it is asked for, and this model asserts the same thing again
at the call site.
"""

from __future__ import annotations

from collections import Counter

import numpy as np

from engine.backtest.types import Signal
from engine.models.base import Model
from engine.models.spy_ref import SpyPanel
from engine.series import BarView

OPEN_MIN = 9 * 60 + 30             # 09:30
RANGE_END_MIN = 9 * 60 + 45        # 09:45, exclusive bound of the range window
BLOCK_MINUTES = 5
# The 09:45-09:50 block completes at the close of the one-minute bar labelled
# 09:49 (bars are labelled by the minute they open). That is the first minute a
# decision can be taken.
FIRST_DECIDE = RANGE_END_MIN + BLOCK_MINUTES - 1        # 589
# The last block that may confirm ends at 15:30, so the last entry bar is
# 15:30-15:31 and every trade has at least 28 minutes before the flatten.
LAST_CONFIRM_MIN = 15 * 60 + 30                         # 930
LAST_DECIDE = LAST_CONFIRM_MIN - 1                      # 929
FLATTEN_MIN = 15 * 60 + 59
NO_TARGET = 1e9


def is_block_close(minute: int) -> bool:
    """True when `minute` is the last one-minute bar of a five-minute block
    measured from 09:45. 589, 594, 599, ... — and nothing else."""
    if minute < FIRST_DECIDE or minute > LAST_DECIDE:
        return False
    return (minute + 1 - RANGE_END_MIN) % BLOCK_MINUTES == 0


class OrbSip15Close(Model):
    id = "orb_sip.v5_15c"
    description = ("15-minute opening range, entry on the first 5-minute close "
                   "outside it, stop at the opposite extreme of the range, "
                   "no target, flat at the close")

    def __init__(self, atr: dict[tuple[str, int], float] | None = None) -> None:
        # `atr` is carried for REPORTING ONLY, exactly as in `orb_sip.v2` — so
        # the report can state this stop's width in ATR units beside the
        # incumbent's. The model never reads it to make a decision and a missing
        # ATR is not a reason to skip a trade.
        self.atr = atr or {}
        self.census: Counter = Counter()
        self._day = -1
        self._done = False
        self._range: tuple[float, float] | None = None
        self._range_day = -1

    def params(self) -> dict:
        return {
            "opening_range_minutes": 15,
            "trigger": "first 5-minute block CLOSING outside the range",
            "direction": "the side that was closed through",
            "entry": "market, at the open of the next 1-minute bar",
            "stop": "the opposite extreme of the 09:30-09:45 range",
            "target": "none — exit at the close",
            "last_confirm_min": LAST_CONFIRM_MIN,
            "flatten_min": FLATTEN_MIN,
            "selection": "ENGINE-6's selection.json.gz, unchanged",
        }

    def wants_bar(self, minute: int, day: int) -> bool:
        return is_block_close(minute)

    def _roll(self, day: int) -> None:
        if self._day != day:
            if self._day != -1 and not self._done:
                self.census["day_never_confirmed"] += 1
            self._day = day
            self._done = False
            self._range = None
            self._range_day = -1
            self.census["days_seen"] += 1

    def finish(self) -> None:
        if self._day != -1 and not self._done:
            self.census["day_never_confirmed"] += 1
        self._day = -1

    # -- the opening range --------------------------------------------------
    @staticmethod
    def _opening_range(view: BarView) -> tuple[float, float] | None:
        """(high, low) of 09:30-09:45, from the one-minute bars that printed.

        Deliberately NOT shared with `orb_sip.v2._opening_candle`: the two
        models are meant to stay comparable forever, and a shared helper is a
        shared way for that to stop being true.
        """
        today = view.today_slice()
        m = view.minute[today]
        keep = np.flatnonzero((m >= OPEN_MIN) & (m < RANGE_END_MIN))
        if len(keep) == 0:
            return None
        a = today.start + int(keep[0])
        b = today.start + int(keep[-1]) + 1
        return (float(np.max(view.high[a:b])), float(np.min(view.low[a:b])))

    def _cached_range(self, view: BarView, day: int) -> tuple[float, float] | None:
        if self._range_day != day:
            self._range = self._opening_range(view)
            self._range_day = day
        return self._range

    # -- the confluence hook, a no-op here ----------------------------------
    def _confluence_ok(self, view: BarView, day: int, minute: int,
                       side: str) -> bool:
        return True

    def evaluate(self, view: BarView, day: int) -> Signal | None:
        self._roll(day)
        if self._done:
            return None
        last = view.last
        minute = int(last.minute)
        if not is_block_close(minute):
            return None

        rng = self._cached_range(view, day)
        if rng is None:
            self.census["skip_no_opening_range"] += 1
            self._done = True
            return None
        hi, lo = rng
        if not (hi > lo):
            self.census["skip_zero_width_range"] += 1
            self._done = True
            return None

        # The close of the five-minute block IS the close of its last
        # one-minute bar, which is the bar this view ends on.
        block_close = float(last.close)
        if block_close > hi:
            side, stop = "long", lo
        elif block_close < lo:
            side, stop = "short", hi
        else:
            self.census["block_inside_range"] += 1
            return None                       # wait for the next block

        if not self._confluence_ok(view, day, minute, side):
            self.census["skip_confluence"] += 1
            self.census[f"skip_confluence_{side}"] += 1
            self._done = True                 # the break happened and was declined
            return None

        self._done = True
        target = NO_TARGET if side == "long" else -NO_TARGET
        atr = self.atr.get((view.symbol, int(day)))
        self.census["signals"] += 1
        self.census[f"signals_{side}"] += 1
        return Signal(
            self.id, view.symbol, int(day), view.i, minute, side, "market",
            block_close, stop, target, FLATTEN_MIN + 1, FLATTEN_MIN,
            {"or_high": hi, "or_low": lo, "or_size": hi - lo,
             "confirm_close": block_close,
             "atr14": float(atr) if atr else float("nan"),
             "stop_dist": abs(block_close - stop), "ref_price": block_close},
            stop_from_fill=None,              # the stop is a LEVEL, not a distance
        )


class OrbSip15CloseSpy(OrbSip15Close):
    """`orb_sip.v5_15c` plus SPY confluence.

    The trade is taken only if SPY moved the same way as the break over the
    window in which the break formed: from SPY's close at 09:45 — the moment the
    stock's opening range finished — to SPY's close at the confirming block's
    end.

    Both SPY reads are at minutes <= the decision minute, and the position fills
    on the stock's NEXT bar, so every SPY input closed strictly before the fill.
    That is asserted here as well as enforced inside `SpyPanel`, and attacked in
    `tests/test_orb_sip_15c.py`.

    One reading of "same direction" was chosen, written into
    `models/orb_sip.v5_15c/GATE.md` before this ran, and tested once. There is
    no parameter here to vary and none may be added afterwards.
    """

    id = "orb_sip.v5_15c_spy"
    description = ("the same 15-minute close-confirmed ORB, taken only when SPY "
                   "moved the same way over the same window")

    REF_MINUTE = RANGE_END_MIN - 1     # the 09:44 bar closes at 09:45

    def __init__(self, atr: dict[tuple[str, int], float] | None = None,
                 spy: SpyPanel | None = None) -> None:
        super().__init__(atr)
        if spy is None:
            raise ValueError("orb_sip.v5_15c_spy requires a SpyPanel")
        self.spy = spy

    def params(self) -> dict:
        p = super().params()
        p["confluence"] = ("sign(SPY close at the confirming block's end minus "
                           "SPY close at 09:45) must match the break side")
        p["confluence_reference"] = self.spy.symbol
        return p

    def _confluence_ok(self, view: BarView, day: int, minute: int,
                       side: str) -> bool:
        # Both reads are as-of `minute`; the fill is on a bar after `minute`.
        assert self.REF_MINUTE <= minute, "reference minute is after the decision"
        d = self.spy.direction(int(day), int(minute), self.REF_MINUTE)
        if d is None:
            self.census["spy_reference_missing"] += 1
            return False
        if d == 0:
            self.census["spy_flat"] += 1
            return False
        want = 1 if side == "long" else -1
        if d == want:
            self.census["spy_agrees"] += 1
            return True
        self.census["spy_disagrees"] += 1
        return False
