"""A replay whose stop is decided at the FILL, from the bars up to it.

Every model this programme has run so far knows its stop when it makes its
decision: a price on the chart (`stop_price`), or a distance carried from the
fill (`stop_from_fill`). `orb_sip.v4` knows neither. Its stop is the extreme of
a five-minute candle at the breakout, and which candle that is depends on WHEN
the resting order filled, which is not known at 09:35.

So this runner is `engine/backtest/engine.py:run_symbol` with exactly one thing
added: at the moment a pending order fills, a model that declares
`CANDLE_STOP = True` is asked

    model.stop_at_fill(view_truncated_at_the_fill_bar, signal, fill_price)

and whatever it returns is the stop the position carries. Everything else —
the order of operations inside a bar, the fill arithmetic, the excursion
tracking, the exit rules, the R arithmetic — is the same code, imported rather
than copied, so the two runners cannot drift apart.

Two properties are load-bearing and both are tested in
`engine/tests/test_orb_sip_v4.py`:

1. **It is the same runner.** Given a model with no `stop_at_fill`, this
   function reproduces `run_symbol` trade for trade, field for field. That is
   what makes v2 replayed through here a control for v4 replayed through here.
2. **It cannot see the future.** The resolver is handed a `BarView` truncated
   at the fill bar, which holds no reference to the parent series. A stop taken
   from "the candle the fill happened in" therefore uses that candle's bars up
   to and including the fill and cannot reach the ones after it, however the
   resolver is written.
"""

from __future__ import annotations

from engine.backtest.engine import _close, _Open, _update_excursions
from engine.backtest.fills import (entry_fill, exit_on_bar, resolved_stop,
                                   resolved_target, time_exit)
from engine.backtest.types import Costs, Rejection, Signal, Trade
from engine.primitives.session import rth_close_minute
from engine.series import BarSeries

NO_CANDLE = "no_stop_candle"
ZERO_RISK_AT_FILL = "zero_risk_at_fill"


def run_symbol_candle_stop(series: BarSeries, model, costs: Costs,
                           warmup_days: int = 5,
                           day_filter=None) -> tuple[list[Trade], list[Rejection]]:
    bounds = series.day_bounds()
    days = sorted(bounds)
    trades: list[Trade] = []
    rejections: list[Rejection] = []
    hook = getattr(model, "stop_at_fill", None) if getattr(
        model, "CANDLE_STOP", False) else None

    for t in range(warmup_days, len(days)):
        day = days[t]
        if day_filter is not None and not day_filter(day):
            continue
        win_start = bounds[days[t - warmup_days]][0]
        win_end = bounds[day][1]
        win = series.subrange(win_start, win_end)
        local_day_start = bounds[day][0] - win_start
        close_min = rth_close_minute(day)

        pending: Signal | None = None
        pending_from: int = -1
        pos: _Open | None = None

        for j in range(local_day_start, len(win)):
            minute = int(win.minute[j])
            o, h, l, c = (float(win.open[j]), float(win.high[j]),
                          float(win.low[j]), float(win.close[j]))

            # 1 — a pending order meets this bar
            if pending is not None and j > pending_from:
                if minute >= pending.expiry_minute:
                    rejections.append(Rejection(series.symbol, day, "expired"))
                    pending = None
                else:
                    fp = entry_fill(pending.side, pending.entry_type,
                                    pending.entry_price, o, h, l, costs)
                    if fp is not None:
                        if hook is None:
                            stop = resolved_stop(pending, fp)
                        else:
                            stop = hook(win.view(j), pending, fp)
                            if stop is None:
                                rejections.append(
                                    Rejection(series.symbol, day, NO_CANDLE))
                                pending = None
                                continue
                        if not (abs(fp - stop) > 0):
                            rejections.append(
                                Rejection(series.symbol, day, ZERO_RISK_AT_FILL))
                            pending = None
                            continue
                        pos = _Open(pending, fp, j, minute,
                                    resolved_target(pending, fp), stop)
                        pending = None
                        # the entry bar can also resolve the trade
                        _update_excursions(pos, h, l)
                        res = exit_on_bar(pos.signal.side, pos.stop,
                                          pos.target, o, h, l, costs)
                        if res is not None:
                            trades.append(_close(pos, j, minute, res, costs))
                            pos = None
                        continue

            # 2 — an open position meets this bar
            if pos is not None:
                _update_excursions(pos, h, l)
                res = exit_on_bar(pos.signal.side, pos.stop,
                                  pos.target, o, h, l, costs)
                if res is None and minute >= min(pos.signal.exit_minute, close_min - 1):
                    res = ("time", time_exit(pos.signal.side, c, costs), False)
                if res is not None:
                    trades.append(_close(pos, j, minute, res, costs))
                    pos = None
                continue

            # 3 — the model may act, effective next bar
            if pending is not None:
                continue
            if not model.wants_bar(minute, day):
                continue
            sig = model.evaluate(win.view(j), day)
            if sig is None:
                continue
            if sig.risk_per_share <= 0:
                rejections.append(Rejection(series.symbol, day, "zero_risk"))
                continue
            pending, pending_from = sig, j

        if pos is not None:
            j = len(win) - 1
            trades.append(_close(pos, j, int(win.minute[j]),
                                 ("time", time_exit(pos.signal.side,
                                                    float(win.close[j]), costs), False),
                                 costs))
        if pending is not None:
            rejections.append(Rejection(series.symbol, day, "expired"))

    return trades, rejections
