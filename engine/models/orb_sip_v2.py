"""orb_sip.v2 — the same published ORB, with the OTHER published stop.

`orb_sip.v1` implemented the stocks paper's stop: 10% of the 14-day ATR. It
came back NOT REPRODUCED at -0.635R over 32,392 trades, and the post-mortem
localised the cause to that one number. A tenth of an ATR is a median 12.4
cents on these names — about 16% of the width of the very 09:30-09:35 candle
the trade is defined by — and it was hit on 90.1% of trades. The trade was
being stopped out inside the noise of its own setup.

The brief's own comparison table records TWO readings of the published stop:

    stop at a prior 5m candle / structural level  (ours, ENGINE-1..5)
    10% of 14-day ATR (stocks paper); opposite extreme of the first candle
    (ETF paper)

This model is the second reading. **Long stops at the 09:30-09:35 LOW; short
stops at its HIGH.** Nothing else changes — not the range, not the universe,
not the selection, not the direction rule, not the entry, not the end-of-day
exit, not the sizing, not the costs, not the data snapshot. The selection is
literally the same file on disk that ENGINE-6 wrote, so the two models trade
the same symbol-days and differ only in where the stop sits.

    preconditions  regular hours; the 09:30-09:35 five-minute candle has closed;
                   the symbol is one of the day's twenty stocks in play, chosen
                   at 09:35 by `sip/selection.py` — the SAME selection ENGINE-6
                   made, reused, not recomputed.
    trigger        a resting stop order beyond the five-minute opening range, on
                   the side the first candle closed — above the high if that
                   candle was bullish, below the low if it was bearish. The
                   other side is not traded, whatever price does.
    stop           the OPPOSITE EXTREME of that same five-minute candle. It is a
                   PRICE, fixed by the setup, not a distance carried along from
                   the fill: a long that gaps through the high fills higher and
                   therefore risks more, which is what actually happens to a
                   trader whose stop is a level on the chart.
    target         NONE. Exit at the end of the day, exactly as v1.
    horizon        flat at 15:59 ET, or the early close on a half day.

**The honest caveat, stated in the code as well as the report.** The stop width
was not chosen blind. The ENGINE-6 post-mortem swept the stop as a fraction of
ATR on the 2016-2023 replication window and found the sign of the result flips
between 0.25x and 0.5x; the opening candle is a median 0.63 ATR wide here, so
this rule lands on the winning side of that sweep. We cannot separate "the
companion paper's other reading" from "the number the sweep pointed at". The
2016-2023 window is therefore CONTAMINATED for this model and is reported as a
disclosure rather than as a verdict. The verdict is the held-back window,
2024-01-01 to 2026-08-28, which was never swept. See
`engine/models/orb_sip.v2/GATE.md`, committed before any number below existed.
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


class OrbStocksInPlayV2(Model):
    id = "orb_sip.v2"
    description = ("5-minute opening range, breakout on the side the first "
                   "candle closed, stop at the opposite extreme of that same "
                   "candle, no target, flat at the close")

    def __init__(self, atr: dict[tuple[str, int], float] | None = None) -> None:
        # `atr` is carried for REPORTING ONLY — so the report can say how wide
        # this stop is in ATR units and be compared with v1's 0.10x. The model
        # never reads it to make a decision, and a missing ATR is not a reason
        # to skip a trade, because the trade does not depend on one.
        self.atr = atr or {}
        self.census: Counter = Counter()
        self._day = -1
        self._done = False

    def params(self) -> dict:
        return {
            "opening_range_minutes": 5,
            "direction": "sign of the 09:30-09:35 candle",
            "entry": "resting stop order at the range edge",
            "stop": "the opposite extreme of the 09:30-09:35 candle",
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

    @staticmethod
    def _opening_candle(view: BarView) -> tuple[float, float, float, float] | None:
        """(open, high, low, close) of the 09:30-09:35 five-minute candle,
        assembled from the one-minute bars that have already printed.

        Byte-identical to `orb_sip.v1._opening_candle`. It is duplicated rather
        than imported so that v1 cannot be changed by an edit made for v2; the
        two models are meant to be comparable forever, and a shared helper is a
        shared way for that to stop being true.
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

    def _side(self, o: float, c: float) -> str | None:
        if c > o:
            return "long"
        if c < o:
            return "short"
        return None

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
        side = self._side(o, c)
        if side is None:
            self.census["skip_doji_opening_candle"] += 1
            return None

        # The whole of v2, in two lines: enter at one extreme of the opening
        # candle, stop at the other. The risk the position carries is the
        # distance from the FILL to that fixed level, which the engine computes
        # in `_close` — so a gap through the entry costs the trader more, as it
        # does in life.
        entry, stop = (hi, lo) if side == "long" else (lo, hi)
        target = NO_TARGET if side == "long" else -NO_TARGET
        atr = self.atr.get((view.symbol, int(day)))
        self.census["signals"] += 1
        self.census[f"signals_{side}"] += 1
        if atr is None:
            self.census["no_atr_reported"] += 1
        return Signal(
            self.id, view.symbol, int(day), view.i, minute, side, "stop",
            entry, stop, target, FLATTEN_MIN + 1, FLATTEN_MIN,
            {"or_high": hi, "or_low": lo, "or_open": o, "or_close": c,
             "or_size": hi - lo, "atr14": float(atr) if atr else float("nan"),
             "stop_dist": hi - lo, "ref_price": c},
            stop_from_fill=None,      # the stop is a LEVEL, not a distance
        )


class OrbStocksInPlayV2Coinflip(OrbStocksInPlayV2):
    """The matched control: `orb_sip.v2` with the direction call replaced.

    Same symbols, same days, same 09:35 decision, same opening range, same
    entry mechanics, same stop geometry — enter at one extreme, stop at the
    other — same end-of-day exit. The ONLY difference is that the side comes
    from a deterministic hash instead of from the sign of the opening candle.
    The seed is v1's, unchanged, so the two lanes' controls flip the same way
    on the same symbol-days and the comparison between ENGINE-6 and ENGINE-7 is
    not confounded by a different random draw.

    So anything the model earns over this control it earned by knowing which
    way to point on a day it had already been told was in play. The two trade
    sets are not identical — a coin-flip long can sit under a high that never
    breaks while the model's short broke the low — so the report pairs on the
    (symbol, day) intersection and also gives both unpaired means.
    """

    id = "orb_sip.v2.coinflip"
    description = "control: the same days and geometry, direction by coin flip"

    SEED = "engine-6-matched-control"

    def _flip(self, symbol: str, day: int) -> str:
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

        side = self._flip(view.symbol, int(day))
        entry, stop = (hi, lo) if side == "long" else (lo, hi)
        target = NO_TARGET if side == "long" else -NO_TARGET
        atr = self.atr.get((view.symbol, int(day)))
        self.census["signals"] += 1
        self.census[f"signals_{side}"] += 1
        return Signal(
            self.id, view.symbol, int(day), view.i, minute, side, "stop",
            entry, stop, target, FLATTEN_MIN + 1, FLATTEN_MIN,
            {"or_high": hi, "or_low": lo, "or_open": o, "or_close": c,
             "or_size": hi - lo, "atr14": float(atr) if atr else float("nan"),
             "stop_dist": hi - lo, "ref_price": c, "matched": True},
            stop_from_fill=None,
        )
