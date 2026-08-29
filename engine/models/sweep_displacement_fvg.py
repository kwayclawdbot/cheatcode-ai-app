"""sweep_displacement_fvg.v1 — the canonical ICT day model.

541 Inner Circle Trader videos and JadeCap's ICT material in `coach_kb_chunks`
describe one shape more than any other: a resting pool of liquidity is taken,
price displaces away from it, and the imbalance left behind by that displacement
is where the entry goes.

    preconditions  RTH, 09:45 to 15:00; the previous session's high and low and
                   today's premarket high and low are known
    trigger        (1) one of those four levels was swept within the last 30
                       bars — traded through, not merely approached;
                   (2) the bar just closed displaced back through it by at least
                       1.5 average ranges, away from the swept side;
                   (3) that displacement left an unfilled three-bar fair value
                       gap in the same direction
    levels         entry  limit at the midpoint of the fair value gap
                          (consequent encroachment)
                   stop   beyond the sweep extreme — the price that says the
                          liquidity grab was real
                   target the NEAREST opposing pool above/below the entry among
                          {today's session extreme, prior day extreme, premarket
                          extreme}. Nearest, not furthest: the far one would
                          flatter every reward:risk figure in the report.
    invalidation   the stop
    horizon        the limit order expires 45 minutes after the signal; an open
                   position is flattened at 15:55
    filter         reward:risk at least 1.5 — this family is asymmetric by
                   construction and a 1:1 version of it is a different model

Every number above was fixed before the first evaluation ran.
"""

from __future__ import annotations

import numpy as np

from engine.backtest.types import Signal
from engine.models.base import Model
from engine.primitives import imbalance as im
from engine.primitives import liquidity as lq
from engine.primitives import session as ses
from engine.primitives import structure as st
from engine.series import BarView

WINDOW_OPEN = 9 * 60 + 45
WINDOW_CLOSE = 15 * 60
SWEEP_LOOKBACK = 30
DISPLACEMENT_MULT = 1.5
AVG_WINDOW = 20
ORDER_LIFE_MIN = 45
FLATTEN_MIN = 15 * 60 + 55
MIN_RR = 1.5


class SweepDisplacementFvg(Model):
    id = "sweep_displacement_fvg.v1"
    description = "liquidity swept, displacement away, entry in the fair value gap it left"

    def __init__(self) -> None:
        self._cache: dict[tuple[str, int], dict] = {}

    def params(self) -> dict:
        return {
            "window": [WINDOW_OPEN, WINDOW_CLOSE], "sweep_lookback": SWEEP_LOOKBACK,
            "displacement_mult": DISPLACEMENT_MULT, "avg_window": AVG_WINDOW,
            "order_life_min": ORDER_LIFE_MIN, "flatten_min": FLATTEN_MIN,
            "min_rr": MIN_RR,
        }

    def wants_bar(self, minute: int, day: int) -> bool:
        return WINDOW_OPEN <= minute <= WINDOW_CLOSE

    def _levels(self, view: BarView, day: int) -> dict:
        key = (view.symbol, day)
        hit = self._cache.get(key)
        if hit is not None:
            return hit
        pools: dict[str, tuple[float, str]] = {}
        for lv in lq.prior_day_levels(view):
            pools[lv.label] = (lv.price, lv.side)
        pm = ses.premarket_range(view)
        if pm.bars:
            pools["PMH"] = (pm.high, lq.BUYSIDE)
            pools["PML"] = (pm.low, lq.SELLSIDE)
        self._cache[key] = pools
        if len(self._cache) > 8:
            self._cache.pop(next(iter(self._cache)))
        return pools

    def evaluate(self, view: BarView, day: int) -> Signal | None:
        # cheapest gate first: did the bar that just closed actually displace?
        disp = st.displacement(view, lookback=AVG_WINDOW)
        if abs(disp) < DISPLACEMENT_MULT:
            return None

        pools = self._levels(view, day)
        if not pools:
            return None
        last = view.last
        want_side = lq.SELLSIDE if disp > 0 else lq.BUYSIDE
        direction = "bull" if disp > 0 else "bear"

        swept: tuple[str, float, float] | None = None
        for label, (price, side) in pools.items():
            if side != want_side or not np.isfinite(price):
                continue
            sw = lq.sweep_state(view, price, side, lookback=SWEEP_LOOKBACK)
            if not sw.swept:
                continue
            # the displacement must be back through the level, not still beyond it
            if direction == "bull" and last.close <= price:
                continue
            if direction == "bear" and last.close >= price:
                continue
            if swept is None or (direction == "bull" and sw.extreme < swept[2]) \
                    or (direction == "bear" and sw.extreme > swept[2]):
                swept = (label, price, sw.extreme)
        if swept is None:
            return None

        gaps = [g for g in im.fair_value_gaps(view, lookback=5) if g.direction == direction]
        if not gaps:
            return None
        gap = gaps[-1]
        entry = gap.mid
        stop = swept[2]

        session = ses.session_range(view, ses.RTH)
        candidates: list[float] = []
        if direction == "bull":
            for price, side in list(pools.values()):
                if side == lq.BUYSIDE and price > entry:
                    candidates.append(price)
            if np.isfinite(session.high) and session.high > entry:
                candidates.append(session.high)
            if not candidates:
                return None
            target = min(candidates)
            if not (entry > stop and target > entry):
                return None
            if (target - entry) < MIN_RR * (entry - stop):
                return None
            side_name, entry_type = "long", "limit"
        else:
            for price, side in list(pools.values()):
                if side == lq.SELLSIDE and price < entry:
                    candidates.append(price)
            if np.isfinite(session.low) and session.low < entry:
                candidates.append(session.low)
            if not candidates:
                return None
            target = max(candidates)
            if not (entry < stop and target < entry):
                return None
            if (entry - target) < MIN_RR * (stop - entry):
                return None
            side_name, entry_type = "short", "limit"

        return Signal(self.id, view.symbol, day, view.i, last.minute,
                      side_name, entry_type, entry, stop, target,
                      min(last.minute + ORDER_LIFE_MIN, WINDOW_CLOSE + ORDER_LIFE_MIN),
                      FLATTEN_MIN,
                      {"pool": swept[0], "pool_price": swept[1],
                       "sweep_extreme": swept[2], "displacement": disp,
                       "fvg_top": gap.top, "fvg_bottom": gap.bottom})
