"""Event-driven replay, one bar at a time.

Order of operations inside bar j, and it matters:

  1. a pending order placed on an EARLIER bar is offered bar j's range;
  2. an open position updates its excursions on bar j and may exit on bar j;
  3. only then does the model see `view(j)` and may place an order — which can
     first act on bar j+1.

A decision therefore never touches the bar it was made on. That, plus a BarView
that cannot reach past j, is the whole no-lookahead argument.
"""

from __future__ import annotations

from dataclasses import dataclass

from engine.backtest.fills import (entry_fill, exit_on_bar, r_multiples,
                                   resolved_target, time_exit)
from engine.backtest.types import Costs, Rejection, Signal, Trade
from engine.primitives.session import rth_close_minute
from engine.series import BarSeries


@dataclass
class _Open:
    signal: Signal
    fill_price: float
    entry_idx: int
    entry_minute: int
    target: float = float("nan")
    mae_price: float = 0.0
    mfe_price: float = 0.0
    ambiguous: bool = False


def run_symbol(series: BarSeries, model, costs: Costs,
               warmup_days: int = 5,
               day_filter=None) -> tuple[list[Trade], list[Rejection]]:
    """Replay every eligible day for one symbol."""
    bounds = series.day_bounds()
    days = sorted(bounds)
    trades: list[Trade] = []
    rejections: list[Rejection] = []

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
                        pos = _Open(pending, fp, j, minute,
                                    resolved_target(pending, fp))
                        pending = None
                        # the entry bar can also resolve the trade
                        _update_excursions(pos, h, l)
                        res = exit_on_bar(pos.signal.side, pos.signal.stop_price,
                                          pos.target, o, h, l, costs)
                        if res is not None:
                            trades.append(_close(pos, j, minute, res, costs))
                            pos = None
                        continue

            # 2 — an open position meets this bar
            if pos is not None:
                _update_excursions(pos, h, l)
                res = exit_on_bar(pos.signal.side, pos.signal.stop_price,
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

        # a position still open at the end of the window is flattened on the
        # last bar of the day, at its close
        if pos is not None:
            j = len(win) - 1
            trades.append(_close(pos, j, int(win.minute[j]),
                                 ("time", time_exit(pos.signal.side, float(win.close[j]), costs), False),
                                 costs))
        if pending is not None:
            rejections.append(Rejection(series.symbol, day, "expired"))

    return trades, rejections


def _update_excursions(pos: _Open, high: float, low: float) -> None:
    if pos.signal.side == "long":
        pos.mae_price = max(pos.mae_price, pos.fill_price - low)
        pos.mfe_price = max(pos.mfe_price, high - pos.fill_price)
    else:
        pos.mae_price = max(pos.mae_price, high - pos.fill_price)
        pos.mfe_price = max(pos.mfe_price, pos.fill_price - low)


def _close(pos: _Open, j: int, minute: int, res: tuple[str, float, bool],
           costs: Costs) -> Trade:
    reason, px, ambiguous = res
    s = pos.signal
    risk = abs(pos.fill_price - s.stop_price)
    gross_r, net_r, gross_pct, net_pct, mae_r, mfe_r = r_multiples(
        s.side, pos.fill_price, px, risk, pos.mae_price, pos.mfe_price, costs)
    return Trade(
        model_id=s.model_id, symbol=s.symbol, day=s.day, side=s.side,
        decision_minute=s.decision_minute, entry_minute=pos.entry_minute,
        exit_minute=minute, signal_entry=s.entry_price, fill_price=pos.fill_price,
        stop_price=s.stop_price, target_price=pos.target, exit_price=px,
        exit_reason=reason, bars_held=j - pos.entry_idx,
        risk_per_share=risk, mae_price=pos.mae_price, mfe_price=pos.mfe_price,
        gross_r=gross_r, net_r=net_r, gross_pct=gross_pct, net_pct=net_pct,
        mae_r=mae_r, mfe_r=mfe_r,
        ambiguous_bar=ambiguous or pos.ambiguous, meta=dict(s.meta),
    )
