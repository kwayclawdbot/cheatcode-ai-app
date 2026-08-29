"""orb_1h_managed.v1 — the owner's rule with the 1R actually banked, plus three
pre-registered one-change variants.

Owner, 2026-08-29, verbatim: *"use 1hr h/l or key level as target. trend
confirmation on 1hr.. enter on 5min use previous 5min h/l as stop-loss, target
2rr.. even if it doesnt hit 2rr mark any trade that moves up at least 1rr as a
win"*.

    preconditions  regular hours; the 15-minute opening range (09:30-09:45 ET)
                   is complete; the 1-HOUR chart is in a confirmed trend, read
                   on its last fully closed bar.
    trigger        a 5-minute candle CLOSING beyond the range in that direction.
    entry          the open of the next 5-minute bar, market.
    stop           the high/low of the candle immediately PRECEDING the trigger
                   candle (`stop_read="prior"`), or the trigger candle's own
                   extreme (`stop_read="trigger"`, ENGINE-4's reading).
    target         the nearest major level ABOVE (long) / BELOW (short) the
                   decision close, drawn from the 1-hour series and the session
                   reference levels (`target_mode="level"`); or a fixed 2R
                   measured from the fill (`target_mode="2r"`).
    management     at +1R take half off and move the stop on the remainder to
                   breakeven. Implemented in `engine/backtest/managed.py`, not
                   here, because it is an exit rule and the model is a decision.
    horizon        flat at 15:55 ET. At most one trade per direction per day.

## The one thing translated rather than copied

*"mark any trade that moves up at least 1rr as a win"* is a SCORING change, and
taken literally it is the error that made the SMS engine look profitable while
it lost money: `alert_performance_honest` records average PEAK +11.93% against a
realised +0.41% (17 §1). A price nobody sold at is not income.

So the 1R is implemented as a rule that BANKS it — half off at +1R, stop to
breakeven — which is tradeable and can be measured honestly. The share of trades
that TOUCHED +1R is reported separately as a diagnostic and appears in no gate.
The `orb_1h_unmanaged.v1` control exists so that the management rule's value is
measured rather than assumed.

## What is deliberately absent

No opening-range size band, no minimum reward, no risk cap, no risk floor, no
clustering, no "strong anyway" exception, no 4-hour agreement rule. Those screens
cut `orb_mtf.v1` down to 448 trades. Their absence is inherited from
`orb_simple.py` on purpose and must not be reintroduced after seeing a number.

Four things are mechanical rather than discretionary, and each is written down
here so it cannot later be mistaken for a filter:

* **A trigger needs a next bar to enter on.** Triggers run from the close of the
  09:45-09:50 candle (ET minute 589) to the close of the 15:40-15:45 candle
  (minute 944). Nothing about price or setup quality is consulted. Verbatim from
  `orb_simple.py`.
* **A stop must be a distance, on the right side of the entry.** The prior
  candle can sit on the wrong side of the trigger close when the trend flips
  onto a range edge price has already left. That is not a trade anyone can take
  and not a number this harness can divide by. Counted as
  `skip_invalid_stop`, never silently dropped — and counted for BOTH stop
  readings so the two are compared on a stated, not an assumed, trade set.
* **No level in the trade's direction is NOT a skip.** It is a trade with no
  price target, which runs to the breakeven stop or the 15:55 flat. Making it a
  skip would be a filter, and filters are what this family keeps dying of. The
  census counts it (`signals_no_target_level`) and the report gives the
  level-target trades as a labelled subset so both readings are visible.
* **One position at a time.** A day's second direction can only start once the
  first has closed. A real account constraint, and the census counts it.
"""

from __future__ import annotations

import math
from collections import Counter

from engine.backtest.htf import prior_daily_view  # noqa: F401  (see _levels)
from engine.backtest.mtf import H1
from engine.backtest.mtf import context as mtf_context
from engine.backtest.types import Signal
from engine.models.base import Model
from engine.primitives import htf_levels as hl
from engine.primitives import levels as lv
from engine.primitives import session as ses
from engine.series import BarView

# --- session and range — every number here is orb_simple.py's ----------------
OR_MINUTES = 15
ENTRY_TF_MINUTES = 5
WINDOW_OPEN = 9 * 60 + 49         # close of the 09:45-09:50 candle
WINDOW_CLOSE = 15 * 60 + 44       # close of the 15:40-15:45 candle
FLATTEN_MIN = 15 * 60 + 55        # the owner's 3:55

# --- the two axes the four variants move along ------------------------------
STOP_PRIOR = "prior"              # the candle BEFORE the trigger candle
STOP_TRIGGER = "trigger"          # ENGINE-4's reading
TARGET_LEVEL = "level"            # nearest 1h/reference level in the direction
TARGET_2R = "2r"                  # a fixed 2R from the fill

TARGET_R_FIXED = 2.0
PARTIAL_R = 1.0                   # where half comes off
PARTIAL_FRACTION = 0.5            # how much of it

# The level family. 1-hour pivots plus the session reference levels (prior-day
# RTH high/low, premarket extremes, overnight extremes) — "1hr h/l or key
# level". No 4-hour and no daily pivots: those are not 1-hour levels, and
# ENGINE-3 already measured what happens when the family is widened. Every
# parameter is `htf_levels.py`'s, unchanged, so none of them can have been
# retuned for this model.

# {model id: (stop reading, target mode, managed)}
VARIANTS: dict[str, tuple[str, str, bool]] = {
    "orb_1h_managed.v1":     (STOP_PRIOR,   TARGET_LEVEL, True),
    "orb_1h_managed_2r.v1":  (STOP_PRIOR,   TARGET_2R,    True),
    "orb_1h_trigcandle.v1":  (STOP_TRIGGER, TARGET_LEVEL, True),
    "orb_1h_unmanaged.v1":   (STOP_PRIOR,   TARGET_LEVEL, False),
}


class OrbManaged(Model):
    """`variant` is a key of `VARIANTS`; nothing else differs between them."""

    description = ("15-minute opening range, a 5-minute close beyond it in the "
                   "direction the 1-hour chart confirms, stop on a 5-minute "
                   "candle, target a 1-hour level, half off at +1R")

    def __init__(self, variant: str = "orb_1h_managed.v1",
                 snapshot: str | None = None, ctx_factory=None) -> None:
        if variant not in VARIANTS:
            raise ValueError(f"variant must be one of {sorted(VARIANTS)}")
        self.id = variant
        self.stop_read, self.target_mode, self.managed = VARIANTS[variant]
        self.snapshot = snapshot
        self._ctx_factory = ctx_factory or (lambda sym: mtf_context(sym, snapshot))
        self._ctx = None
        self.census: Counter = Counter()
        self._day = -1
        self._range = None
        self._used: set[str] = set()
        self._trend_seen = False
        self._triggered = False

    def params(self) -> dict:
        return {
            "or_minutes": OR_MINUTES, "entry_tf_minutes": ENTRY_TF_MINUTES,
            "window": [WINDOW_OPEN, WINDOW_CLOSE], "flatten_min": FLATTEN_MIN,
            "trend_timeframe_minutes": H1, "trend_pivot_n": 2,
            "trend_lookback": 120,
            "stop": ("the candle BEFORE the trigger candle"
                     if self.stop_read == STOP_PRIOR
                     else "the trigger candle itself (ENGINE-4's reading)"),
            "target": ("nearest 1h pivot / session reference level"
                       if self.target_mode == TARGET_LEVEL else "fixed 2R from fill"),
            "h1_pivot_n": hl.H1_PIVOT_N, "h1_lookback": hl.H1_LOOKBACK,
            "h1_min_touches": hl.H1_MIN_TOUCHES,
            "touch_bps": hl.TOUCH_BPS, "cluster_bps": hl.CLUSTER_BPS,
            "managed": self.managed,
            "partial_r": PARTIAL_R if self.managed else None,
            "partial_fraction": PARTIAL_FRACTION if self.managed else None,
            "skips": "invalid stop only",
        }

    # -- gating -------------------------------------------------------------
    def wants_bar(self, minute: int, day: int) -> bool:
        """5-minute closes only. A 1-minute bar ending at :49 IS the close of
        the 09:45-09:50 candle, so the decision uses 5-minute information while
        fills keep 1-minute resolution. Verbatim from `orb_simple.py`."""
        return (WINDOW_OPEN <= minute <= WINDOW_CLOSE
                and minute % ENTRY_TF_MINUTES == ENTRY_TF_MINUTES - 1)

    def ctx(self, symbol: str):
        if self._ctx is None:
            self._ctx = self._ctx_factory(symbol)
        return self._ctx

    def _roll_day(self, view: BarView, day: int):
        if self._day != day:
            self._book_day()
            self._day = day
            self._range = None
            self._used = set()
            self._trend_seen = False
            self._triggered = False
            self.census["days_seen"] += 1
        if self._range is None:
            self._range = ses.opening_range(view, OR_MINUTES)
        return self._range

    def _book_day(self) -> None:
        """One line per day, so 'where did the days go' adds up to days_seen."""
        if self._day == -1:
            return
        n = len(self._used)
        if n:
            self.census[f"days_with_{n}_trade_direction(s)"] += 1
        elif self._triggered:
            self.census["days_trigger_but_no_signal"] += 1
        elif self._trend_seen:
            self.census["days_trend_ok_no_break"] += 1
        else:
            self.census["days_no_htf_trend"] += 1

    def finish(self) -> None:
        self._book_day()
        self._day = -1

    # -- the model ----------------------------------------------------------
    def evaluate(self, view: BarView, day: int) -> Signal | None:
        rng = self._roll_day(view, day)
        last = view.last
        minute = int(last.minute)
        self.census["bars_evaluated"] += 1

        if not rng.complete or not (rng.size > 0):
            self.census["bars_no_opening_range"] += 1
            return None

        trend = self.ctx(view.symbol).trend(H1, day, minute)
        if trend == "none":
            self.census["bars_no_htf_trend"] += 1
            return None
        self._trend_seen = True

        c = float(last.close)
        if trend == "up" and c > rng.high:
            side = "long"
        elif trend == "down" and c < rng.low:
            side = "short"
        else:
            self.census["bars_no_break_on_trend_side"] += 1
            return None

        self._triggered = True
        self.census["triggers"] += 1
        if side in self._used:
            self.census["bars_direction_already_traded"] += 1
            return None

        # -- the stop, under whichever reading this variant carries ----------
        candle = (self._prior_candle(view, day, minute) if self.stop_read == STOP_PRIOR
                  else self._trigger_candle(view, day, minute))
        if candle is None:
            self.census["skip_no_prior_candle"] += 1
            return None
        hi, lo = candle
        stop = lo if side == "long" else hi
        risk = c - stop if side == "long" else stop - c
        if not (risk > 0):
            self.census["skip_invalid_stop"] += 1
            return None

        # -- the target ------------------------------------------------------
        target_r = None
        target_lv = None
        if self.target_mode == TARGET_2R:
            target_r = TARGET_R_FIXED
            target = c + TARGET_R_FIXED * risk if side == "long" else c - TARGET_R_FIXED * risk
        else:
            levels = self._levels(view, day, minute)
            target_lv = (lv.nearest_above(levels, c) if side == "long"
                         else lv.nearest_below(levels, c))
            if target_lv is None:
                # NOT a skip. A trade with no price target, which runs to the
                # breakeven stop or the 15:55 flat. See the module docstring.
                self.census["signals_no_target_level"] += 1
                target = math.inf if side == "long" else -math.inf
            else:
                target = float(target_lv.price)

        self._used.add(side)
        self.census["signals"] += 1
        self.census[f"signals_{side}"] += 1
        meta = {
            "trend": trend, "trend_tf": H1,
            "or_high": rng.high, "or_low": rng.low, "or_size": rng.size,
            "or_pct": rng.size / c if c > 0 else 0.0,
            "ref_close": c, "stop_candle_high": hi, "stop_candle_low": lo,
            "risk_ps": risk, "risk_pct": risk / c if c > 0 else 0.0,
            "stop_read": self.stop_read, "target_mode": self.target_mode,
            "has_target_level": target_lv is not None,
            "target_level": (float(target_lv.price) if target_lv else float("nan")),
            "target_label": (target_lv.label if target_lv else ""),
            "target_touches": (int(target_lv.touches) if target_lv else 0),
            "target_r_at_decision": (abs(target - c) / risk
                                     if target_lv is not None else float("inf")),
        }
        if self.target_mode == TARGET_2R:
            meta["target_r_at_decision"] = TARGET_R_FIXED
        return Signal(
            self.id, view.symbol, day, view.i, minute, side, "market",
            c, stop, target, minute + 5, FLATTEN_MIN, meta, target_r=target_r,
        )

    # -- levels -------------------------------------------------------------
    def _levels(self, view: BarView, day: int, minute: int):
        """1-hour pivots plus the session reference levels, as of this close.

        `ctx.view` hands back a 1-hour series truncated at the last bucket that
        had definitely closed, so nothing downstream can read a forming hour.
        No 4-hour view and no daily view are passed: this brief says 1-hour.
        """
        ctx = self.ctx(view.symbol)
        return hl.htf_major_levels(view, ctx.view(H1, day, minute), None, None)

    # -- the two candle readings -------------------------------------------
    @staticmethod
    def _bucket(view: BarView, day: int, first_min: int, last_min: int
                ) -> tuple[float, float] | None:
        """High and low of the 1-minute bars in [first_min, last_min] on `day`.

        Walked backwards from the last visible bar, so it can only ever read
        minutes that have already printed. Returns None when the bucket has no
        bars at all — a halted or truncated session — rather than inventing one.
        """
        hi, lo = -math.inf, math.inf
        seen = 0
        for j in range(view.n - 1, -1, -1):
            if int(view.day[j]) != day:
                break
            m = int(view.minute[j])
            if m > last_min:
                continue
            if m < first_min:
                break
            hi = max(hi, float(view.high[j]))
            lo = min(lo, float(view.low[j]))
            seen += 1
        return (hi, lo) if seen else None

    @classmethod
    def _trigger_candle(cls, view: BarView, day: int, minute: int
                        ) -> tuple[float, float] | None:
        """The 5-minute candle that just closed. ENGINE-4's reading."""
        return cls._bucket(view, day, minute - (ENTRY_TF_MINUTES - 1), minute)

    @classmethod
    def _prior_candle(cls, view: BarView, day: int, minute: int
                      ) -> tuple[float, float] | None:
        """The 5-minute candle immediately BEFORE the trigger candle.

        Its final minute is `minute - 5`, five minutes before the decision, so
        this reads strictly less of the tape than `_trigger_candle` does.
        """
        end = minute - ENTRY_TF_MINUTES
        return cls._bucket(view, day, end - (ENTRY_TF_MINUTES - 1), end)
