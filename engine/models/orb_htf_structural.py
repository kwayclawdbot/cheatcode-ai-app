"""orb_htf_structural.v1 — the owner's three rules, taken literally.

Owner, 2026-08-29, verbatim: *"build trade strategy with ORB, only triggered if
HTF trend confirmation, and stop loss should be at most recent major S/R line or
pivot that invalidates the setup."*

    preconditions  RTH; the daily chart is in a CONFIRMED trend as of the last
                   fully closed daily bar (higher high AND higher low, last
                   swing low unbroken — or the mirror); the 15-minute opening
                   range is complete and is between 0.15% and 3.0% of price
    trigger        the FIRST 5-minute close beyond the opening-range edge that
                   sits in the direction of the daily trend, between 09:49 and
                   10:59 ET. Only the trend-side edge is watched: an uptrend day
                   that breaks down is not a short, it is a day off.
    direction      the daily trend's. There is no counter-trend exception.
    levels         entry   market, at the next bar's open
                   stop    the nearest MAJOR level beyond entry, plus a 5bp
                           buffer — the price whose violation says the setup was
                           wrong (see primitives/levels.py for what "major"
                           means, which is the whole argument)
                   target  the next opposing major level by the same definition
    skips          no qualifying level -> no trade. Risk beyond 1.50% of price
                   -> no trade, the level is too far to define a risk today.
                   Risk under 0.10% of price -> no trade: ENGINE-1 measured
                   round-trip costs at 9-14% of a 0.18-0.29% risk, so below
                   0.10% the frictions own the trade before it starts. Reward
                   under 1.5R -> no trade.
    horizon        one trade per symbol per day, first trigger only, no
                   re-entry; flat at 15:55.

Every number here was fixed before the first evaluation was run. The level
definition was chosen by looking at how SPARSE the level set is on five names
and three dates — whether it draws a chart a trader would recognise — and at
nothing else. No PnL was consulted. See the report's disclosure section.
"""

from __future__ import annotations

from collections import Counter

from engine import config
from engine.backtest.htf import daily_trend_cached, prior_daily_view
from engine.backtest.types import Signal
from engine.models.base import Model
from engine.primitives import levels as lv
from engine.primitives import session as ses
from engine.series import BarView

# --- session and range -------------------------------------------------------
OR_MINUTES = 15
ENTRY_TF_MINUTES = 5
WINDOW_OPEN = 9 * 60 + 49        # close of the 09:45-09:50 bar, the first 5m
WINDOW_CLOSE = 10 * 60 + 59      # bar wholly after the range; window matches
FLATTEN_MIN = 15 * 60 + 55       # orb_reclaim.v1's 09:45-11:00, reused not invented
MIN_OR_PCT = 0.0015              # both reused verbatim from orb_reclaim.v1
MAX_OR_PCT = 0.03

# --- higher timeframe confirmation ------------------------------------------
DAILY_PIVOT_N = 2
DAILY_LOOKBACK = 120

# --- what counts as a major level -------------------------------------------
PIVOT_N = 6                      # 30 minutes either side on a 5-minute chart
PIVOT_LOOKBACK = 480             # ~2.5 sessions of 5-minute bars
TOUCH_BPS = 8.0
MIN_TOUCHES = 2
CLUSTER_BPS = 25.0               # levels within 0.25% are one level
LEVEL_DAILY_PIVOT_N = 3
LEVEL_DAILY_LOOKBACK = 60

# --- risk -------------------------------------------------------------------
STOP_BUFFER_BPS = 5.0            # the stop sits just BEYOND the level: a touch
MIN_RISK_PCT = 0.0010            # is not a violation
MAX_RISK_PCT = 0.0150
MIN_RR = 1.5

STRUCTURAL = "structural"
RANGE_EDGE = "range_edge"


class OrbHtfStructural(Model):
    id = "orb_htf_structural.v1"
    description = ("15-minute ORB, taken only with a confirmed daily trend, "
                   "stopped behind the nearest major level")

    def __init__(self, require_htf: bool = True, stop_mode: str = STRUCTURAL,
                 snapshot: str | None = None) -> None:
        self.require_htf = require_htf
        self.stop_mode = stop_mode
        self.snapshot = snapshot
        self.census: Counter = Counter()
        self._day = -1
        self._done_day = -1
        self._ctx: tuple | None = None

    # -- identity -----------------------------------------------------------
    def variant(self) -> str:
        if self.require_htf and self.stop_mode == STRUCTURAL:
            return "full spec"
        if not self.require_htf:
            return "ablation: HTF filter removed"
        return "ablation: range-edge stop"

    def params(self) -> dict:
        return {
            "or_minutes": OR_MINUTES, "entry_tf_minutes": ENTRY_TF_MINUTES,
            "window": [WINDOW_OPEN, WINDOW_CLOSE], "flatten_min": FLATTEN_MIN,
            "min_or_pct": MIN_OR_PCT, "max_or_pct": MAX_OR_PCT,
            "daily_pivot_n": DAILY_PIVOT_N, "daily_lookback": DAILY_LOOKBACK,
            "pivot_n": PIVOT_N, "pivot_lookback": PIVOT_LOOKBACK,
            "touch_bps": TOUCH_BPS, "min_touches": MIN_TOUCHES,
            "cluster_bps": CLUSTER_BPS,
            "level_daily_pivot_n": LEVEL_DAILY_PIVOT_N,
            "level_daily_lookback": LEVEL_DAILY_LOOKBACK,
            "stop_buffer_bps": STOP_BUFFER_BPS, "min_risk_pct": MIN_RISK_PCT,
            "max_risk_pct": MAX_RISK_PCT, "min_rr": MIN_RR,
            "require_htf": self.require_htf, "stop_mode": self.stop_mode,
        }

    # -- gating -------------------------------------------------------------
    def wants_bar(self, minute: int, day: int) -> bool:
        """Only 5-minute closes. A 1-minute bar ending at 09:49 IS the close of
        the 09:45-09:50 bar, so the entry timeframe costs nothing in fill
        resolution: the decision is made on 5-minute information and the replay
        still walks the tape a minute at a time."""
        return (WINDOW_OPEN <= minute <= WINDOW_CLOSE
                and minute % ENTRY_TF_MINUTES == ENTRY_TF_MINUTES - 1)

    def _day_context(self, view: BarView, day: int):
        if self._day == day and self._ctx is not None:
            return self._ctx
        rng = ses.opening_range(view, OR_MINUTES)
        trend = "none"
        if self.require_htf:
            trend = daily_trend_cached(view.symbol, self.snapshot,
                                       DAILY_PIVOT_N, DAILY_LOOKBACK).get(day, "none")
        self.census["days_seen"] += 1
        self._day, self._ctx = day, (rng, trend)
        return self._ctx

    # -- the model ----------------------------------------------------------
    def evaluate(self, view: BarView, day: int) -> Signal | None:
        if self._done_day == day:
            return None
        rng, trend = self._day_context(view, day)
        if self.require_htf and trend == "none":
            self._mark(day, "skip_no_daily_trend")
            return None
        if not rng.complete or rng.size <= 0:
            self._mark(day, "skip_no_opening_range")
            return None
        last = view.last
        or_pct = rng.size / last.close if last.close > 0 else 0.0
        if not (MIN_OR_PCT <= or_pct <= MAX_OR_PCT):
            self._mark(day, "skip_opening_range_size")
            return None

        c = float(last.close)
        if self.require_htf:
            if trend == "up":
                side = "long" if c > rng.high else None
            else:
                side = "short" if c < rng.low else None
        else:
            side = "long" if c > rng.high else ("short" if c < rng.low else None)
        if side is None:
            return None            # no break yet; the day stays live

        # a break has happened: this day gets exactly this one chance
        self._done_day = day
        self.census["triggers"] += 1

        dv = prior_daily_view(view.symbol, day, self.snapshot)
        all_levels = lv.major_levels(
            view, dv, ENTRY_TF_MINUTES, PIVOT_N, PIVOT_LOOKBACK, TOUCH_BPS,
            MIN_TOUCHES, CLUSTER_BPS, LEVEL_DAILY_PIVOT_N, LEVEL_DAILY_LOOKBACK)

        if side == "long":
            stop_lv = lv.nearest_below(all_levels, c)
            targ_lv = lv.nearest_above(all_levels, c)
        else:
            stop_lv = lv.nearest_above(all_levels, c)
            targ_lv = lv.nearest_below(all_levels, c)

        if stop_lv is None:
            self.census["skip_no_stop_level"] += 1
            return None
        buf = c * STOP_BUFFER_BPS / 10_000.0
        stop = stop_lv.price - buf if side == "long" else stop_lv.price + buf
        risk = abs(c - stop)
        risk_pct = risk / c if c > 0 else 0.0
        if risk_pct > MAX_RISK_PCT:
            self.census["skip_risk_too_wide"] += 1
            return None
        if risk_pct < MIN_RISK_PCT:
            self.census["skip_risk_too_tight"] += 1
            return None
        if targ_lv is None:
            self.census["skip_no_target_level"] += 1
            return None
        reward = abs(targ_lv.price - c)
        if reward < MIN_RR * risk:
            self.census["skip_reward_under_min_rr"] += 1
            return None

        if self.stop_mode == RANGE_EDGE:
            # ENGINE-1's geometry: the stop goes just back inside the broken
            # range edge. Selection above is untouched, so the trade SET is
            # identical to the full spec and only the stop moves.
            edge = rng.high if side == "long" else rng.low
            stop = edge * (1 - STOP_BUFFER_BPS / 10_000.0) if side == "long" \
                else edge * (1 + STOP_BUFFER_BPS / 10_000.0)
            if (side == "long" and stop >= c) or (side == "short" and stop <= c):
                self.census["skip_range_edge_degenerate"] += 1
                return None
            risk = abs(c - stop)

        self.census["signals"] += 1
        return Signal(
            self.id, view.symbol, day, view.i, last.minute, side, "market",
            c, stop, targ_lv.price, last.minute + 5, FLATTEN_MIN,
            {"daily_trend": trend, "or_high": rng.high, "or_low": rng.low,
             "or_pct": or_pct, "ref_close": c,
             "stop_level": stop_lv.price, "stop_label": stop_lv.label,
             "stop_touches": stop_lv.touches,
             "target_level": targ_lv.price, "target_label": targ_lv.label,
             "target_touches": targ_lv.touches,
             "risk_ps": risk, "reward_ps": reward, "risk_pct": risk / c,
             "n_levels": len(all_levels)},
        )

    def _mark(self, day: int, reason: str) -> None:
        if self._done_day != day:
            self._done_day = day
            self.census[reason] += 1
