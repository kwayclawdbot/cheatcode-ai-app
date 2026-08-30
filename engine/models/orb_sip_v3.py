"""orb_sip.v3 — the published ORB, the ETF paper's stop, and one gate added.

`orb_sip.v2` (ENGINE-7) came back PARTIAL on a held-back window: it made money
(+0.0199R, an interval spanning zero) and the stocks-in-play filter beat a
random twenty, but the direction call lost to a coin flip. The post-mortem
localised that loss precisely: of the 7,322 paired (symbol, day) observations,
5,241 were the same trade in both arms and contributed exactly nothing, and the
whole of the deficit came from the **2,081 mornings on which BOTH ends of the
opening range broke**. On those, the side the first candle pointed at returned
-0.735R and the other side -0.271R. The model had no rule for choosing between
two breaks, and the sign of the first candle turned out to be the wrong one.

The owner's rule is exactly such a rule:

    "adding a filter for trades that are already in momentum going in the
     direction of the breakout.. so bullish orb + bullish trend. If daily trend
     bearish and bullish orb dont take the trade"

So `orb_sip.v3` is `orb_sip.v2` plus ONE gate, and nothing else moves:

    preconditions  regular hours; the opening range candle has closed; the
                   symbol is one of the day's twenty stocks in play, chosen at
                   09:35 by `sip/selection.py` — the SAME selection ENGINE-6
                   wrote, reused byte for byte, never recomputed.
    NEW            the DAILY trend, read on the last fully closed daily bar
                   before this session, must agree with the breakout side.
                   Long only in a confirmed daily uptrend, short only in a
                   confirmed daily downtrend. Sideways or opposing is NO TRADE,
                   not a smaller one. The definition is `primitives/htf.py`'s
                   `daily_structure` at ENGINE-2's numbers (pivot_n=2,
                   lookback=120): confirmed higher high AND higher low with the
                   defining swing low unbroken, mirrored for down.
    trigger        a resting stop order beyond the opening range, on the side
                   the opening candle closed. The other side is not traded.
    stop           the OPPOSITE EXTREME of that same opening candle. A PRICE,
                   fixed by the setup, not a distance carried from the fill.
    target         NONE. Exit at the end of the day.
    horizon        flat at 15:59 ET, or the early close on a half day.

## The 15-minute variant, and the judgement call inside it

The owner added a second variant after the brief was written: the same model on
a **15-minute** opening range, 09:30-09:45, identical in every other respect.
That makes "the opposite extreme of the opening candle" ambiguous, because on a
15-minute range there are two candles it could mean:

* the opposite extreme of the WHOLE 09:30-09:45 range, or
* the opposite extreme of the LAST five-minute candle inside it.

**We take the first**, and the reason is what made `orb_sip.v2` work at all.
v2's entry and its stop are the two ends of one object: the trade is defined by
the opening candle, it is armed by a break of one edge of it, and it is dead
when price returns through the other edge. The bar that defines the trade on a
15-minute range is the 15-minute range. Reading the stop off the last five
minutes inside it would put the stop somewhere the setup does not point at, and
would also make the 15-minute variant's R a different-sized unit from the
range it is breaking out of. The other reading is a DIFFERENT model; it is not
tested here and no number in this lane speaks to it.

The direction rule is read the same way: the sign of the whole 09:30-09:45
candle, its close against its open.

## What is reused, and what that costs

The selection is ENGINE-6's, at 09:35, for BOTH variants. For the 5-minute
model that is the spec. For the 15-minute model the faithful reading would
re-rank the universe on 09:30-09:45 volume — but the one-minute cache exists
only for the symbol-days the 09:35 selection named, and re-selecting would
require a new download the brief forbids. Reusing it is not lookahead (09:35
is strictly less information than 09:45) and it has one virtue: the two
variants trade the same candidate symbol-days, so the comparison between them
is a comparison of range length and of nothing else. It is still a deviation
and every report says so.
"""

from __future__ import annotations

import hashlib
from collections import Counter

import numpy as np

from engine.backtest.types import Signal
from engine.models.base import Model
from engine.series import BarView

OPEN_MIN = 9 * 60 + 30
DECIDE_UNTIL = 10 * 60 + 30
FLATTEN_MIN = 15 * 60 + 59
NO_TARGET = 1e9


class _OrbSipRange(Model):
    """The shared mechanics of every arm in this lane.

    Subclasses declare three things as CLASS attributes, not as constructor
    arguments: how long the opening range is, whether the daily trend gates the
    trade, and where the direction comes from. There is deliberately no runtime
    parameter to vary — the same property `run_engine7.py` had, kept, because
    two models on one held-back year is already as much multiplicity as this
    lane can afford.
    """

    RANGE_END_MIN: int = 9 * 60 + 35
    TREND_GATED: bool = True
    DIRECTION: str = "candle"     # "candle" | "coinflip" | "opposite"
    SEED = "engine-6-matched-control"      # v1's and v2's seed, unchanged

    def __init__(self, atr: dict[tuple[str, int], float] | None = None,
                 trend: dict[tuple[str, int], str] | None = None) -> None:
        # `atr` is REPORTING ONLY, exactly as in v2 — the model never reads it
        # to make a decision and a missing ATR is not a reason to skip a trade.
        # `trend` is a decision input when TREND_GATED and reporting-only
        # otherwise; the ungated arms carry it so that the report can say what
        # the filter would have removed and what those trades did.
        self.atr = atr or {}
        self.trend = trend or {}
        if self.TREND_GATED and not self.trend:
            raise ValueError(f"{self.id}: the daily trend map is the model, "
                             "and it is empty")
        self.census: Counter = Counter()
        self._day = -1
        self._done = False

    @property
    def decide_from(self) -> int:
        return self.RANGE_END_MIN - 1

    def params(self) -> dict:
        return {
            "opening_range_minutes": self.RANGE_END_MIN - OPEN_MIN,
            "direction": {"candle": "sign of the opening range candle",
                          "coinflip": "coin flip",
                          "opposite": "the side the candle did NOT point at",
                          }[self.DIRECTION],
            "daily_trend_must_agree": self.TREND_GATED,
            "entry": "resting stop order at the range edge",
            "stop": "the opposite extreme of the opening range candle",
            "target": "none — exit at the close",
            "flatten_min": FLATTEN_MIN,
            "selection": "top 20 of the pool by 09:35 relative volume",
        }

    def wants_bar(self, minute: int, day: int) -> bool:
        return self.decide_from <= minute <= DECIDE_UNTIL

    def _roll(self, day: int) -> None:
        if self._day != day:
            self._day = day
            self._done = False
            self.census["days_seen"] += 1

    def finish(self) -> None:
        self._day = -1

    def _opening_candle(self, view: BarView) -> tuple[float, float, float, float] | None:
        """(open, high, low, close) of the opening range, assembled from the
        one-minute bars that have already printed. Identical in shape to
        `orb_sip.v2._opening_candle`; the only difference is where the window
        ends, which is the whole of what separates the two variants."""
        today = view.today_slice()
        m = view.minute[today]
        keep = np.flatnonzero((m >= OPEN_MIN) & (m < self.RANGE_END_MIN))
        if len(keep) == 0:
            return None
        a = today.start + int(keep[0])
        b = today.start + int(keep[-1]) + 1
        return (float(view.open[a]), float(np.max(view.high[a:b])),
                float(np.min(view.low[a:b])), float(view.close[b - 1]))

    def _flip(self, symbol: str, day: int) -> str:
        h = hashlib.sha256(f"{self.SEED}|{symbol}|{day}".encode()).digest()
        return "long" if int.from_bytes(h[:8], "big") % 2 else "short"

    def evaluate(self, view: BarView, day: int) -> Signal | None:
        self._roll(day)
        if self._done:
            return None
        minute = int(view.last.minute)
        if minute < self.decide_from:
            return None
        self._done = True                 # one decision a day, at the range close

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

        key = (view.symbol, int(day))
        trend = self.trend.get(key, "none")
        candle_side = "long" if c > o else "short"
        if self.DIRECTION == "coinflip":
            side = self._flip(*key)
        elif self.DIRECTION == "opposite":
            side = "short" if candle_side == "long" else "long"
        else:
            side = candle_side

        if self.TREND_GATED:
            # The whole of ENGINE-8, in four lines. Sideways is not a smaller
            # trade and opposing is not a smaller trade; both are no trade.
            if trend == "none":
                self.census["skip_trend_none"] += 1
                return None
            want = "up" if side == "long" else "down"
            if trend != want:
                self.census["skip_trend_opposes"] += 1
                return None

        entry, stop = (hi, lo) if side == "long" else (lo, hi)
        target = NO_TARGET if side == "long" else -NO_TARGET
        atr = self.atr.get(key)
        self.census["signals"] += 1
        self.census[f"signals_{side}"] += 1
        self.census[f"trend_{trend}"] += 1
        return Signal(
            self.id, view.symbol, int(day), view.i, minute, side, "stop",
            entry, stop, target, FLATTEN_MIN + 1, FLATTEN_MIN,
            {"or_high": hi, "or_low": lo, "or_open": o, "or_close": c,
             "or_size": hi - lo, "atr14": float(atr) if atr else float("nan"),
             "stop_dist": hi - lo, "ref_price": c, "daily_trend": trend,
             "candle_side": candle_side,
             "range_minutes": self.RANGE_END_MIN - OPEN_MIN},
            stop_from_fill=None,          # the stop is a LEVEL, not a distance
        )


# --- the two models this lane pre-registered --------------------------------

class OrbStocksInPlayV3(_OrbSipRange):
    id = "orb_sip.v3"
    description = ("5-minute opening range, breakout on the side the first "
                   "candle closed, ONLY when the daily trend agrees, stop at "
                   "the opposite extreme of that candle, no target, flat at "
                   "the close")
    RANGE_END_MIN = 9 * 60 + 35
    TREND_GATED = True


class OrbStocksInPlayV3M15(_OrbSipRange):
    id = "orb_sip.v3_15m"
    description = ("15-minute opening range, breakout on the side that candle "
                   "closed, ONLY when the daily trend agrees, stop at the "
                   "opposite extreme of the whole 15-minute range, no target, "
                   "flat at the close")
    RANGE_END_MIN = 9 * 60 + 45
    TREND_GATED = True


# --- the arms every gate is read against ------------------------------------
#
# For the 5-minute variant the ungated base and the matched coin flip already
# exist as `orb_sip.v2` and `orb_sip.v2.coinflip` and are imported unchanged —
# ENGINE-7's published numbers must stay reproducible from the same classes.
# The 15-minute variant has no published ancestor, so its two are here.

class OrbSipV2M15(_OrbSipRange):
    """The 15-minute model WITHOUT the trend gate — `orb_sip.v3_15m`'s base.

    This is what the filter is subtracted from: every trade it takes that
    `orb_sip.v3_15m` does not is a trade the filter removed, and the report is
    required to say what those trades did.
    """

    id = "orb_sip.v2_15m"
    description = "15-minute opening range, no trend gate — the base the filter cuts"
    RANGE_END_MIN = 9 * 60 + 45
    TREND_GATED = False


class OrbSipV2M15Coinflip(_OrbSipRange):
    """The matched control for the 15-minute variant.

    Same symbols, same days, same 09:45 decision, same range, same entry
    mechanics, same stop geometry, same end-of-day exit. The side comes from
    the same deterministic hash `orb_sip.v1.coinflip` and `orb_sip.v2.coinflip`
    use, with the same seed, so the controls across ENGINE-6, -7 and -8 flip
    the same way on the same symbol-days and no comparison between lanes is
    confounded by a different random draw.

    It is NOT trend-gated, and that is deliberate rather than an oversight. A
    coin flip that must agree with the daily trend IS the daily trend: it would
    take the trend's side on every day it traded, which is also the side the
    model takes, so the paired difference would be exactly zero on every pair by
    construction and the gate would be unreadable. The control this lane needs
    is the one ENGINE-7 used — a random side on the same mornings — which asks
    the question that actually failed there: on the mornings this model chooses
    to trade, is its side better than a coin's?
    """

    id = "orb_sip.v3_15m.coinflip"
    description = "control: the same 15-minute mornings and geometry, direction by coin flip"
    RANGE_END_MIN = 9 * 60 + 45
    TREND_GATED = False
    DIRECTION = "coinflip"


class OrbSipV2M5(_OrbSipRange):
    """`orb_sip.v2` re-expressed on this lane's shared base, 5 minutes, ungated.

    Not a model and never evaluated as one. It exists so that
    `tests/test_orb_sip_v3.py` can assert, signal for signal on real cached
    bars, that the base these two new models are built on reproduces ENGINE-7's
    published class exactly. If that assertion ever fails, the 15-minute
    variant's numbers are not comparable with the 5-minute ones and the report
    is wrong before it is written.
    """

    id = "orb_sip.v2_m5_shadow"
    description = "internal: the shared base at 5 minutes, asserted equal to orb_sip.v2"
    RANGE_END_MIN = 9 * 60 + 35
    TREND_GATED = False


# --- two diagnostic arms, fenced as diagnostics -----------------------------
#
# These are NOT models, no gate reads them, and neither is pre-registered as
# anything to be traded. They exist to answer the question the brief puts at the
# centre of this lane, and they answer it from the tape rather than by
# inference: ENGINE-7 could only identify the "both ends of the range broke"
# mornings indirectly, as the pairs on which its coin flip happened to draw the
# other side. Running the opposite side unconditionally identifies EVERY such
# morning exactly — a symbol-day on which both the candle side and the opposite
# side filled is a symbol-day on which both extremes broke — and it prints, for
# each one, what the other end actually paid.

class OrbSipV2M5Opposite(_OrbSipRange):
    id = "orb_sip.v2.opposite"
    description = ("diagnostic: the 5-minute range taken on the side the "
                   "candle did NOT point at")
    RANGE_END_MIN = 9 * 60 + 35
    TREND_GATED = False
    DIRECTION = "opposite"


class OrbSipV2M15Opposite(_OrbSipRange):
    id = "orb_sip.v2_15m.opposite"
    description = ("diagnostic: the 15-minute range taken on the side the "
                   "candle did NOT point at")
    RANGE_END_MIN = 9 * 60 + 45
    TREND_GATED = False
    DIRECTION = "opposite"
