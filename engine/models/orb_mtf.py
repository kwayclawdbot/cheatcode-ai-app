"""orb_mtf.v1 — the owner's correction, taken literally.

Owner, 2026-08-29, verbatim: *"it should be 1hr trend, 15m orb, 5min
confirmation and entry. The stop and targets should be based on the 1hr or 4hr
levels not 5min. Trade should be taken only if 1hr and 4hr is in the trend
confirmation."* And on the exit: *"if it doesnt hit by 3:55 close (daytrade
only) or give user option to swing."*

    preconditions  regular hours; the 1-HOUR and 4-HOUR charts are BOTH in a
                   confirmed trend, each read on its own last fully closed bar,
                   and both pointing the same way — higher high AND higher low
                   with the swing low unbroken, or the mirror. Disagreement is a
                   day off; so is either chart being sideways. There is no
                   "strong anyway" exception. Then: the 15-minute opening range
                   is complete and is between 0.15% and 3.0% of price.
    trigger        the FIRST 5-minute close beyond the opening-range edge on the
                   aligned side, between 09:49 and 10:59 ET. Only that edge is
                   watched: an aligned-up day that breaks down is not a short.
    direction      the aligned trend's.
    levels         entry   market, at the next bar's open
                   stop    the nearest major level from the 1h/4h family that
                           lies beyond entry, plus a 5bp buffer, so a touch is
                           not a violation. Never a 5-minute level — that is the
                           whole correction (see primitives/htf_levels.py).
                   target  the next opposing major level from the same family
    skips          no qualifying level -> no trade. Risk beyond 3.00% of price
                   -> no trade. Risk under 0.10% of price -> no trade. Reward
                   under 1.5R -> no trade.
    horizon        one trade per symbol per day, first trigger only, no re-entry.
                   Exit A flat at 15:55; Exit B held to target or stop for at
                   most 5 sessions. The model emits ONE signal and the runner
                   books it both ways — see engine/backtest/two_exit.py.

Everything reused rather than re-chosen is marked as such below. The opening
range, its sanity band, the trigger window, the buffer, the risk floor, the
reward floor, the touch tolerance and the clustering distance all come across
verbatim from `orb_htf_structural.v1`, so they cannot have been retuned for
this model. The three genuinely new numbers are the 1h and 4h pivot lookbacks
and the risk cap, and each is justified in the GATE without reference to any
result.
"""

from __future__ import annotations

from collections import Counter

from engine.backtest.htf import prior_daily_view
from engine.backtest.mtf import H1, H4
from engine.backtest.mtf import context as mtf_context
from engine.backtest.types import Signal
from engine.models.base import Model
from engine.primitives import htf_levels as hl
from engine.primitives import levels as lv
from engine.primitives import session as ses
from engine.series import BarView

# --- session and range — every number here is orb_htf_structural.v1's --------
OR_MINUTES = 15
ENTRY_TF_MINUTES = 5
WINDOW_OPEN = 9 * 60 + 49        # close of the 09:45-09:50 bar
WINDOW_CLOSE = 10 * 60 + 59
FLATTEN_MIN = 15 * 60 + 55       # the owner's 3:55, and Exit A's whole rule
MIN_OR_PCT = 0.0015
MAX_OR_PCT = 0.03

# --- risk --------------------------------------------------------------------
STOP_BUFFER_BPS = 5.0            # reused
MIN_RISK_PCT = 0.0010            # reused
MAX_RISK_PCT = 0.0300            # NEW — see the GATE for why, and why not 1.5%
MIN_RR = 1.5                     # from the brief

# --- which level family the stop and target come from ------------------------
HTF = "htf"                      # the spec: 1h + 4h pivots
M5 = "m5"                        # the ablation: orb_htf_structural.v1's 5m pivots

# orb_htf_structural.v1's 5-minute level parameters, for the ablation only
M5_PIVOT_N = 6
M5_PIVOT_LOOKBACK = 480
M5_TOUCH_BPS = 8.0
M5_MIN_TOUCHES = 2
M5_CLUSTER_BPS = 25.0
M5_DAILY_PIVOT_N = 3
M5_DAILY_LOOKBACK = 60


class OrbMtf(Model):
    id = "orb_mtf.v1"
    description = ("15-minute ORB, taken only when the 1-hour and 4-hour charts "
                   "agree, stopped and targeted on 1h/4h levels")

    def __init__(self, level_mode: str = HTF, require_mtf: bool = True,
                 snapshot: str | None = None, ctx_factory=None) -> None:
        self.level_mode = level_mode
        self.require_mtf = require_mtf
        self.snapshot = snapshot
        self._ctx_factory = ctx_factory or (lambda sym: mtf_context(sym, snapshot))
        self._ctx = None
        self.census: Counter = Counter()
        self._day = -1
        self._range = None
        self._reason = ""
        self._done_day = -1

    # -- identity -----------------------------------------------------------
    def variant(self) -> str:
        if self.require_mtf and self.level_mode == HTF:
            return "full spec"
        if not self.require_mtf:
            return "ablation: 1h/4h alignment removed"
        return "ablation: orb_htf_structural.v1's 5-minute levels"

    def params(self) -> dict:
        return {
            "or_minutes": OR_MINUTES, "entry_tf_minutes": ENTRY_TF_MINUTES,
            "window": [WINDOW_OPEN, WINDOW_CLOSE], "flatten_min": FLATTEN_MIN,
            "min_or_pct": MIN_OR_PCT, "max_or_pct": MAX_OR_PCT,
            "trend_timeframes": [H1, H4],
            "h1_pivot_n": hl.H1_PIVOT_N, "h1_lookback": hl.H1_LOOKBACK,
            "h1_min_touches": hl.H1_MIN_TOUCHES,
            "h4_pivot_n": hl.H4_PIVOT_N, "h4_lookback": hl.H4_LOOKBACK,
            "h4_min_touches": hl.H4_MIN_TOUCHES,
            "touch_bps": hl.TOUCH_BPS, "cluster_bps": hl.CLUSTER_BPS,
            "daily_pivot_n": hl.DAILY_PIVOT_N, "daily_lookback": hl.DAILY_LOOKBACK,
            "stop_buffer_bps": STOP_BUFFER_BPS, "min_risk_pct": MIN_RISK_PCT,
            "max_risk_pct": MAX_RISK_PCT, "min_rr": MIN_RR,
            "level_mode": self.level_mode, "require_mtf": self.require_mtf,
        }

    # -- gating -------------------------------------------------------------
    def wants_bar(self, minute: int, day: int) -> bool:
        """5-minute closes inside the window, and nothing else. A 1-minute bar
        ending at :49 IS the close of the 09:45-09:50 bar, so the decision is
        made on 5-minute information while fills keep 1-minute resolution."""
        return (WINDOW_OPEN <= minute <= WINDOW_CLOSE
                and minute % ENTRY_TF_MINUTES == ENTRY_TF_MINUTES - 1)

    def ctx(self, symbol: str):
        if self._ctx is None:
            self._ctx = self._ctx_factory(symbol)
        return self._ctx

    def _roll_day(self, view: BarView, day: int):
        """Start a day, and book the previous one's outcome.

        The 1-hour trend is NOT constant across the window — the 09:30-10:30 bar
        closes at 10:30 and can change the reading — so alignment is re-checked
        at every candidate bar rather than judged once at 09:49. That means a
        day's outcome is only known when the day ends, which is what this does.
        """
        if self._day != day:
            if self._day != -1:
                self.census[self._reason or "no_trigger"] += 1
            self._day, self._range, self._reason = day, None, ""
            self.census["days_seen"] += 1
        if self._range is None:
            self._range = ses.opening_range(view, OR_MINUTES)
        return self._range

    def finish(self) -> None:
        """Book the final day. The runner calls this when the symbol is done."""
        if self._day != -1:
            self.census[self._reason or "no_trigger"] += 1
            self._day = -1

    # -- the model ----------------------------------------------------------
    def evaluate(self, view: BarView, day: int) -> Signal | None:
        if self._done_day == day:
            return None
        rng = self._roll_day(view, day)
        last = view.last
        minute = int(last.minute)

        trend = "none"
        if self.require_mtf:
            trend = self.ctx(view.symbol).aligned(day, minute)
            if trend == "none":
                self._reason = "skip_no_aligned_trend"
                return None
        if not rng.complete or rng.size <= 0:
            self._reason = "skip_no_opening_range"
            return None
        c = float(last.close)
        or_pct = rng.size / c if c > 0 else 0.0
        if not (MIN_OR_PCT <= or_pct <= MAX_OR_PCT):
            self._reason = "skip_opening_range_size"
            return None

        if self.require_mtf:
            side = ("long" if c > rng.high else None) if trend == "up" \
                else ("short" if c < rng.low else None)
        else:
            side = "long" if c > rng.high else ("short" if c < rng.low else None)
        if side is None:
            self._reason = "no_break_in_window"
            return None                    # the day stays live

        self._done_day = day               # one chance per day, spent here
        self.census["triggers"] += 1

        levels = self._levels(view, day, minute, HTF)
        if not levels:
            self._reason = "skip_no_levels"
            return None
        stop_lv = (lv.nearest_below(levels, c) if side == "long"
                   else lv.nearest_above(levels, c))
        targ_lv = (lv.nearest_above(levels, c) if side == "long"
                   else lv.nearest_below(levels, c))
        if stop_lv is None:
            self._reason = "skip_no_stop_level"
            return None
        buf = c * STOP_BUFFER_BPS / 10_000.0
        stop = stop_lv.price - buf if side == "long" else stop_lv.price + buf
        risk = abs(c - stop)
        risk_pct = risk / c if c > 0 else 0.0
        if risk_pct > MAX_RISK_PCT:
            self._reason = "skip_risk_too_wide"
            return None
        if risk_pct < MIN_RISK_PCT:
            self._reason = "skip_risk_too_tight"
            return None
        if targ_lv is None:
            self._reason = "skip_no_target_level"
            return None
        reward = abs(targ_lv.price - c)
        if reward < MIN_RR * risk:
            self._reason = "skip_reward_under_min_rr"
            return None

        if self.level_mode == M5:
            # The ablation. Selection above is untouched — every screen was
            # applied to the 1h/4h levels — so the trade SET is the full spec's
            # and only the stop and the target move onto the 5-minute chart.
            swapped = self._swap_to_m5(view, day, minute, side, c)
            if swapped is None:
                self._reason = "skip_m5_degenerate"
                return None
            stop, target_price, stop_lv, targ_lv, risk, reward = swapped
        else:
            target_price = targ_lv.price

        self._reason = ""
        self.census["signals"] += 1
        return Signal(
            self.id, view.symbol, day, view.i, minute, side, "market",
            c, stop, target_price, minute + 5, FLATTEN_MIN,
            {"trend": trend, "or_high": rng.high, "or_low": rng.low,
             "or_pct": or_pct, "ref_close": c,
             "stop_level": stop_lv.price, "stop_label": stop_lv.label,
             "stop_touches": stop_lv.touches,
             "target_level": targ_lv.price, "target_label": targ_lv.label,
             "target_touches": targ_lv.touches,
             "risk_ps": risk, "reward_ps": reward, "risk_pct": risk / c,
             "n_levels": len(levels), "level_mode": self.level_mode},
        )

    def _swap_to_m5(self, view, day, minute, side, c):
        m5 = self._levels(view, day, minute, M5)
        if not m5:
            return None
        s_lv = lv.nearest_below(m5, c) if side == "long" else lv.nearest_above(m5, c)
        t_lv = lv.nearest_above(m5, c) if side == "long" else lv.nearest_below(m5, c)
        if s_lv is None or t_lv is None:
            return None
        buf = c * STOP_BUFFER_BPS / 10_000.0
        stop = s_lv.price - buf if side == "long" else s_lv.price + buf
        if (side == "long" and stop >= c) or (side == "short" and stop <= c):
            return None
        return stop, t_lv.price, s_lv, t_lv, abs(c - stop), abs(t_lv.price - c)

    # -- levels -------------------------------------------------------------
    def _levels(self, view: BarView, day: int, minute: int, mode: str):
        dv = prior_daily_view(view.symbol, day, self.snapshot)
        if mode == M5:
            # orb_htf_structural.v1's level family, unchanged, for the ablation
            return lv.major_levels(view, dv, ENTRY_TF_MINUTES, M5_PIVOT_N,
                                   M5_PIVOT_LOOKBACK, M5_TOUCH_BPS,
                                   M5_MIN_TOUCHES, M5_CLUSTER_BPS,
                                   M5_DAILY_PIVOT_N, M5_DAILY_LOOKBACK)
        ctx = self.ctx(view.symbol)
        return hl.htf_major_levels(view, ctx.view(H1, day, minute),
                                   ctx.view(H4, day, minute), dv)
