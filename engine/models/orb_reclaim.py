"""orb_reclaim.v1 — the opening range is swept, and the sweep fails.

The one empirical hint in the SMS engine's own outcome data was ORB
(kai_orb_bullish, +4.83% / 71.4% on n=14 — suggestive only). It is also the
family FTA teaches. This is not the breakout; it is the failed breakout.

    preconditions  RTH; the 15-minute opening range is complete; the range is
                   between 0.15% and 3.0% of price (a degenerate range has no
                   edges worth sweeping)
    trigger        after 09:45 and before 11:00, price trades beyond one edge of
                   the opening range and then a later bar CLOSES back inside,
                   and that reclaim bar shows displacement of at least 0.5
                   average ranges back into the range
    direction      opposite the sweep — the stop-run failed
    levels         entry  buy/sell stop at the reclaim bar's far extreme
                   stop   the sweep extreme itself
                   target the opposite edge of the opening range
    invalidation   the stop; structural, it is the price that says the sweep was
                   real after all
    horizon        the order expires 30 minutes after the signal or at 11:30,
                   whichever is first; an open position is flattened at 15:55

Every number above is a structural choice made before the first evaluation was
run, and none of them were changed afterwards.
"""

from __future__ import annotations

import numpy as np

from engine import config
from engine.backtest.types import Signal
from engine.models.base import Model
from engine.primitives import liquidity as lq
from engine.primitives import session as ses
from engine.primitives import structure as st
from engine.series import BarView

OR_MINUTES = 15
WINDOW_OPEN = 9 * 60 + 45      # 09:45, the first bar after the range completes
WINDOW_CLOSE = 11 * 60         # 11:00, last minute a signal may be taken
ORDER_LIFE_MIN = 30
HARD_EXPIRY = 11 * 60 + 30
FLATTEN_MIN = 15 * 60 + 55
MIN_OR_PCT = 0.0015
MAX_OR_PCT = 0.03
DISPLACEMENT_MULT = 0.5
MIN_RR = 1.0


class OrbReclaim(Model):
    id = "orb_reclaim.v1"
    description = "opening range swept, reclaimed, entry on displacement back through the edge"

    def __init__(self) -> None:
        self._cache: dict[tuple[str, int], tuple] = {}

    def params(self) -> dict:
        return {
            "or_minutes": OR_MINUTES, "window": [WINDOW_OPEN, WINDOW_CLOSE],
            "order_life_min": ORDER_LIFE_MIN, "hard_expiry": HARD_EXPIRY,
            "flatten_min": FLATTEN_MIN, "min_or_pct": MIN_OR_PCT,
            "max_or_pct": MAX_OR_PCT, "displacement_mult": DISPLACEMENT_MULT,
            "min_rr": MIN_RR,
        }

    def wants_bar(self, minute: int, day: int) -> bool:
        return WINDOW_OPEN <= minute <= WINDOW_CLOSE

    def _day_context(self, view: BarView, day: int):
        key = (view.symbol, day)
        hit = self._cache.get(key)
        if hit is not None:
            return hit
        rng = ses.opening_range(view, OR_MINUTES)
        today = view.today_slice()
        # first index today at or after the end of the opening range
        end_min = config.RTH_OPEN_MIN + OR_MINUTES
        after = np.flatnonzero(view.minute[today] >= end_min)
        or_end = today.start + int(after[0]) if len(after) else view.n
        ctx = (rng, or_end)
        self._cache[key] = ctx
        if len(self._cache) > 8:
            self._cache.pop(next(iter(self._cache)))
        return ctx

    def evaluate(self, view: BarView, day: int) -> Signal | None:
        rng, or_end = self._day_context(view, day)
        if not rng.complete or rng.size <= 0:
            return None
        last = view.last
        or_pct = rng.size / last.close if last.close > 0 else 0.0
        if not (MIN_OR_PCT <= or_pct <= MAX_OR_PCT):
            return None

        disp = st.displacement(view, lookback=20)
        expiry = min(last.minute + ORDER_LIFE_MIN, HARD_EXPIRY)

        lo = lq.sweep_state(view, rng.low, lq.SELLSIDE, since_idx=or_end)
        if (lo.swept and lo.reclaimed and lo.reclaim_idx == view.i
                and disp >= DISPLACEMENT_MULT):
            entry, stop, target = last.high, lo.extreme, rng.high
            if entry > stop and target > entry and (target - entry) >= MIN_RR * (entry - stop):
                return Signal(self.id, view.symbol, day, view.i, last.minute,
                              "long", "stop", entry, stop, target, expiry, FLATTEN_MIN,
                              {"or_high": rng.high, "or_low": rng.low,
                               "or_pct": or_pct, "sweep_extreme": lo.extreme,
                               "displacement": disp})

        hi = lq.sweep_state(view, rng.high, lq.BUYSIDE, since_idx=or_end)
        if (hi.swept and hi.reclaimed and hi.reclaim_idx == view.i
                and disp <= -DISPLACEMENT_MULT):
            entry, stop, target = last.low, hi.extreme, rng.low
            if entry < stop and target < entry and (entry - target) >= MIN_RR * (stop - entry):
                return Signal(self.id, view.symbol, day, view.i, last.minute,
                              "short", "stop", entry, stop, target, expiry, FLATTEN_MIN,
                              {"or_high": rng.high, "or_low": rng.low,
                               "or_pct": or_pct, "sweep_extreme": hi.extreme,
                               "displacement": disp})
        return None
