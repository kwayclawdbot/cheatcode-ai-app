"""orb_simple_1h.v1 / orb_simple_4h.v1 — the owner's rule, with nothing added.

Owner, 2026-08-29, verbatim: *"15min h/l, a breakout in either direction on 5min
candle close above or below the h/l + htf trend confirmation for the entry. Stop
at the previous 5min candlestick high/low and tp at 2rr"*, and earlier: *"it
should be testing on spy... lets test both 1hr confirmation and 4hr confirmation
strats"*.

    preconditions  regular hours; the 15-minute opening range (09:30-09:45 ET)
                   is complete; the higher-timeframe chart is in a confirmed
                   trend, read on its last fully closed bar.
    trigger        a 5-minute candle CLOSING above the range high (long) or
                   below the range low (short), in the direction the higher
                   timeframe confirms.
    entry          the open of the next 5-minute bar.
    stop           the trigger candle's own low (long) / high (short).
    target         a fixed 2R, measured from the fill.
    horizon        flat at 15:55 ET. At most one trade per direction per day.

**There are no skip rules.** No opening-range size band, no minimum reward, no
risk cap, no risk floor, no structural level requirement, no "strong anyway"
exception and no clustering. Every one of those existed in `orb_htf_structural.v1`
and `orb_mtf.v1`, and between them they cut 23,904 symbol-days down to 448
trades. The one thing this model keeps from those two is the definition of a
confirmed trend and the RTH bar convention it is read on, which the brief says
to reuse verbatim rather than re-litigate.

Three things are mechanical rather than discretionary, and each is written down
here so a reader can see it was not a filter in disguise:

* **A trigger needs a next bar to enter on and some session to trade in.**
  Triggers are taken from the close of the 09:45-09:50 candle (ET minute 589,
  the first candle that can close beyond a 09:45 range) through the close of the
  15:40-15:45 candle (minute 944). A trigger at 15:49 would enter at 15:50 and
  be flattened at 15:55 by the same rule; a trigger after that could not be
  entered at all. Nothing about price or setup quality is consulted.
* **A stop must be a distance.** A trigger candle whose low equals its close
  (long) gives a zero-width stop, which is not a trade anyone can take and not a
  number this harness can divide by. Counted in the census, not silently dropped.
* **One position at a time.** The runner holds at most one open position, so a
  day's second trade can only start after the first has closed. That is a real
  constraint on a real account, not a modelling choice, but it does mean a short
  that triggers while a long is still open is never taken. The census counts it.

The two variants differ in exactly one number — the timeframe the trend is read
on — and are pre-registered, run and judged separately.
"""

from __future__ import annotations

from collections import Counter

from engine.backtest.mtf import H1, H4
from engine.backtest.mtf import context as mtf_context
from engine.backtest.types import Signal
from engine.models.base import Model
from engine.primitives import session as ses
from engine.series import BarView

OR_MINUTES = 15
ENTRY_TF_MINUTES = 5
WINDOW_OPEN = 9 * 60 + 49         # close of the 09:45-09:50 candle
WINDOW_CLOSE = 15 * 60 + 44       # close of the 15:40-15:45 candle
FLATTEN_MIN = 15 * 60 + 55        # the owner's 3:55
TARGET_R = 2.0                    # "tp at 2rr"

TREND_TF = {"1h": H1, "4h": H4}


class OrbSimple(Model):
    """`variant` is "1h" or "4h" and is the only difference between the two."""

    description = ("15-minute opening range, a 5-minute close beyond it in the "
                   "direction the higher timeframe confirms, stop at the "
                   "trigger candle's own extreme, target a fixed 2R")

    def __init__(self, variant: str = "1h", snapshot: str | None = None,
                 ctx_factory=None) -> None:
        if variant not in TREND_TF:
            raise ValueError(f"variant must be one of {sorted(TREND_TF)}")
        self.variant = variant
        self.tf = TREND_TF[variant]
        self.id = f"orb_simple_{variant}.v1"
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
            "trend_timeframe_minutes": self.tf,
            "trend_pivot_n": 2, "trend_lookback": 120,
            "target_r": TARGET_R,
            "stop": "trigger candle low (long) / high (short)",
            "skips": "none",
        }

    # -- gating -------------------------------------------------------------
    def wants_bar(self, minute: int, day: int) -> bool:
        """5-minute closes only. A 1-minute bar ending at :49 IS the close of
        the 09:45-09:50 candle, so the decision uses 5-minute information while
        fills keep 1-minute resolution."""
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

        trend = self.ctx(view.symbol).trend(self.tf, day, minute)
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

        hi, lo = self._trigger_candle(view, day, minute)
        stop = lo if side == "long" else hi
        risk = c - stop if side == "long" else stop - c
        if not (risk > 0):
            self.census["skip_zero_width_stop"] += 1
            return None

        self._used.add(side)
        self.census["signals"] += 1
        self.census[f"signals_{side}"] += 1
        target = c + TARGET_R * risk if side == "long" else c - TARGET_R * risk
        return Signal(
            self.id, view.symbol, day, view.i, minute, side, "market",
            c, stop, target, minute + 5, FLATTEN_MIN,
            {"trend": trend, "trend_tf": self.tf,
             "or_high": rng.high, "or_low": rng.low,
             "or_size": rng.size, "or_pct": rng.size / c if c > 0 else 0.0,
             "ref_close": c, "trigger_high": hi, "trigger_low": lo,
             "risk_ps": risk, "risk_pct": risk / c if c > 0 else 0.0,
             "variant": self.variant},
            target_r=TARGET_R,
        )

    # -- the one new primitive ----------------------------------------------
    @staticmethod
    def _trigger_candle(view: BarView, day: int, minute: int) -> tuple[float, float]:
        """High and low of the 5-minute candle that just closed.

        Walked backwards from the last visible bar, which by construction is the
        candle's final minute, so it can only ever read minutes that have
        already printed. A halted or thin candle with fewer than five 1-minute
        bars is summarised from the bars it actually has.
        """
        start = minute - (ENTRY_TF_MINUTES - 1)
        j = view.n - 1
        hi, lo = float(view.high[j]), float(view.low[j])
        j -= 1
        while (j >= 0 and int(view.day[j]) == day
               and int(view.minute[j]) >= start):
            hi = max(hi, float(view.high[j]))
            lo = min(lo, float(view.low[j]))
            j -= 1
        return hi, lo
