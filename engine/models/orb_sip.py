"""orb_sip.v1 — the published opening-range breakout, replicated, nothing added.

Zarattini, Barbon & Aziz, on 7,000+ US stocks over 2016-2023: the same ORB rules
return 29% with a 0.48 Sharpe on an unfiltered universe and 1,637% with a 2.81
Sharpe when restricted to the day's "stocks in play". Their summary is that
abnormal opening volume did almost all the work. ENGINE-1 through ENGINE-5 built
the unfiltered version seven different ways and produced seven nulls, which is a
replication of their null case rather than a refutation of the strategy.

This model is a REPLICATION. It is not an improvement, and no part of it is
ours:

    preconditions  regular hours; the 09:30-09:35 five-minute candle has closed;
                   the symbol is one of the day's twenty stocks in play, chosen
                   at 09:35 by `sip/selection.py`.
    trigger        a resting stop order beyond the five-minute opening range, on
                   the side the first candle closed — above the high if that
                   candle was bullish, below the low if it was bearish. The
                   other side is not traded, whatever price does.
    stop           10% of the 14-day ATR from the FILL. The ATR is computed from
                   daily bars through the prior close and comes in from
                   `sip/universe.py`; the model never computes it from the tape
                   it is trading.
    target         NONE. The published spec exits at the end of the day, and the
                   whole argument of the paper's QQQ variant is that a 24% hit
                   rate still returns 676% because the winners run to the close.
                   Our 2R cap is exactly what amputated that tail.
    horizon        flat at 15:59 ET, or the early close on a half day.

Everything the owner asked for on top of this — a 15-minute range, 1-hour trend
confirmation, the prior-candle stop, a 2R target, half off at 1R — is Phase 2 and
is deliberately absent here. Phase 2 does not run unless Phase 1 reproduces.
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
ATR_STOP_FRACTION = 0.10          # "stop at 10% of the 14-day ATR"
NO_TARGET = 1e9


class OrbStocksInPlay(Model):
    id = "orb_sip.v1"
    description = ("5-minute opening range, breakout on the side the first "
                   "candle closed, stop at 10% of the 14-day ATR from the fill, "
                   "no target, flat at the close")

    def __init__(self, atr: dict[tuple[str, int], float]) -> None:
        # atr: {(symbol, yyyymmdd) -> 14-day ATR as of the PRIOR close}
        self.atr = atr
        self.census: Counter = Counter()
        self._day = -1
        self._done = False

    def params(self) -> dict:
        return {
            "opening_range_minutes": 5,
            "direction": "sign of the 09:30-09:35 candle",
            "entry": "resting stop order at the range edge",
            "stop": "10% of the 14-day ATR from the fill",
            "target": "none — exit at the close",
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

    # -- the opening candle -------------------------------------------------
    @staticmethod
    def _opening_candle(view: BarView) -> tuple[float, float, float, float] | None:
        """(open, high, low, close) of the 09:30-09:35 five-minute candle,
        assembled from the one-minute bars that have already printed."""
        today = view.today_slice()
        m = view.minute[today]
        keep = np.flatnonzero((m >= OPEN_MIN) & (m < RANGE_END_MIN))
        if len(keep) == 0:
            return None
        a = today.start + int(keep[0])
        b = today.start + int(keep[-1]) + 1
        return (float(view.open[a]), float(np.max(view.high[a:b])),
                float(np.min(view.low[a:b])), float(view.close[b - 1]))

    def evaluate(self, view: BarView, day: int) -> Signal | None:
        self._roll(day)
        if self._done:
            return None
        last = view.last
        minute = int(last.minute)
        if minute < DECIDE_FROM:
            return None
        self._done = True                     # one decision a day, taken at 09:35

        cndl = self._opening_candle(view)
        if cndl is None:
            self.census["skip_no_opening_candle"] += 1
            return None
        o, hi, lo, c = cndl
        if not (hi > lo):
            self.census["skip_zero_width_range"] += 1
            return None
        if c > o:
            side, entry = "long", hi
        elif c < o:
            side, entry = "short", lo
        else:
            self.census["skip_doji_opening_candle"] += 1
            return None

        atr = self.atr.get((view.symbol, int(day)))
        if atr is None or not (atr > 0):
            self.census["skip_no_atr"] += 1
            return None
        stop_dist = ATR_STOP_FRACTION * float(atr)
        if not (stop_dist > 0):
            self.census["skip_zero_stop"] += 1
            return None

        stop = entry - stop_dist if side == "long" else entry + stop_dist
        target = NO_TARGET if side == "long" else -NO_TARGET
        self.census["signals"] += 1
        self.census[f"signals_{side}"] += 1
        return Signal(
            self.id, view.symbol, int(day), view.i, minute, side, "stop",
            entry, stop, target, FLATTEN_MIN + 1, FLATTEN_MIN,
            {"or_high": hi, "or_low": lo, "or_open": o, "or_close": c,
             "or_size": hi - lo, "atr14": float(atr),
             "stop_dist": stop_dist, "ref_price": c},
            stop_from_fill=stop_dist,
        )


class OrbStocksInPlayCoinflip(OrbStocksInPlay):
    """The matched control: `orb_sip.v1` with the direction call replaced.

    Same symbols, same days, same 09:35 decision, same opening range, same
    entry mechanics (a resting stop order at the range edge on the chosen
    side), same 10%-of-ATR stop distance, same end-of-day exit. The ONLY
    difference is that the side comes from a deterministic hash instead of from
    the sign of the opening candle.

    So anything the model earns over this control it earned by knowing which
    way to point on a day it had already been told was in play. The two trade
    sets are not identical — a coin-flip long can sit under a high that never
    breaks while the model's short broke the low — so the report pairs on the
    (symbol, day) intersection and also gives both unpaired means.
    """

    id = "orb_sip.v1.coinflip"
    description = "control: the same days and geometry, direction by coin flip"

    SEED = "engine-6-matched-control"

    def _side(self, symbol: str, day: int) -> str:
        h = hashlib.sha256(f"{self.SEED}|{symbol}|{day}".encode()).digest()
        return "long" if int.from_bytes(h[:8], "big") % 2 else "short"

    def evaluate(self, view: BarView, day: int) -> Signal | None:
        self._roll(day)
        if self._done:
            return None
        last = view.last
        minute = int(last.minute)
        if minute < DECIDE_FROM:
            return None
        self._done = True

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

        side = self._side(view.symbol, int(day))
        entry = hi if side == "long" else lo
        atr = self.atr.get((view.symbol, int(day)))
        if atr is None or not (atr > 0):
            self.census["skip_no_atr"] += 1
            return None
        stop_dist = ATR_STOP_FRACTION * float(atr)
        stop = entry - stop_dist if side == "long" else entry + stop_dist
        target = NO_TARGET if side == "long" else -NO_TARGET
        self.census["signals"] += 1
        self.census[f"signals_{side}"] += 1
        return Signal(
            self.id, view.symbol, int(day), view.i, minute, side, "stop",
            entry, stop, target, FLATTEN_MIN + 1, FLATTEN_MIN,
            {"or_high": hi, "or_low": lo, "or_open": o, "or_close": c,
             "or_size": hi - lo, "atr14": float(atr),
             "stop_dist": stop_dist, "ref_price": c, "matched": True},
            stop_from_fill=stop_dist,
        )
