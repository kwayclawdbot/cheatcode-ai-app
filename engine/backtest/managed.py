"""Event-driven replay with one management rule: half off at +1R, stop to
breakeven.

`engine/backtest/engine.py` books a position as one entry and one exit. The
owner's ENGINE-5 rule needs two exits on one entry at different sizes, so this
runner exists. Everything else about it is `run_symbol` line for line — same
order of operations, same fill arithmetic, same one-position-at-a-time
constraint:

  1. a pending order placed on an EARLIER bar is offered bar j's range;
  2. an open position updates its excursions on bar j and may exit on bar j;
  3. only then does the model see `view(j)` and may place an order — which can
     first act on bar j+1.

**With `manage=False` this runner is `run_symbol`.** Not approximately: the same
trade, the same fill, the same exit, the same R, to the last bit.
`tests/test_managed.py` asserts that trade for trade on the real tape, which is
what makes the unmanaged control an honest control rather than a second
implementation of a similar idea.

## What the management rule does, and every ambiguity resolved against the trade

Let `P1` be the +1R price and `T` the target. Within a bar, before the partial:

* if the bar reached the STOP, the whole position is stopped — even if the same
  bar also reached `P1` or `T`. That is `fills.exit_on_bar`'s existing
  convention, extended: a bar containing both is booked as the loss;
* else if `T` is no further away than `P1`, the whole position exits at `T`,
  because price cannot reach `P1` without passing `T` first. Those trades never
  partial, and they are counted;
* else if the bar reached `P1`, half comes off at `P1` (a resting limit: no
  slippage) and the stop on the remainder moves to the fill price. Then, ON THE
  SAME BAR: if the bar also reached `T` the remainder exits at `T`; otherwise if
  the bar's adverse extreme also reached the new breakeven stop, the remainder
  is stopped at breakeven on that same bar. Whether the excursion to `P1`
  happened before or after the excursion back to the fill is unknowable from
  OHLC, so it is assumed to have happened in the order that costs money. Those
  trades are flagged and counted.

After the partial the remainder carries stop = fill and target = `T`, and is
resolved by the unchanged `exit_on_bar`.

## The arithmetic, and why the commission comes out right

Costs are charged per share. The entry pays commission on the WHOLE position;
each exit pays commission on the fraction it closes. `r_multiples` charges two
commissions per share on whatever it is handed, so charging it once per half and
weighting the halves 0.5/0.5 charges exactly `2 x commission` per unit of
position — one entry, two half exits. The entry's slippage is already inside the
fill price and is shared by both halves. The +1R partial and the target are
resting limits and do not slip; a breakeven stop and a 15:55 flatten do.

**A breakeven stop is not free.** It fills at the entry price plus adverse
slippage, and it still pays its half of the commission, so "breakeven" is a
small realised loss. That is what a real one does.
"""

from __future__ import annotations

import math
from dataclasses import dataclass

from engine.backtest.fills import (entry_fill, exit_on_bar, resolved_target,
                                   time_exit)
from engine.backtest.types import Costs, Rejection, Signal, Trade
from engine.primitives.session import rth_close_minute
from engine.series import BarSeries

PARTIAL_R = 1.0
PARTIAL_FRACTION = 0.5


@dataclass
class _Open:
    signal: Signal
    fill_price: float
    entry_idx: int
    entry_minute: int
    target: float = float("nan")
    partial_level: float = float("nan")
    mae_price: float = 0.0
    mfe_price: float = 0.0
    ambiguous: bool = False
    partial_done: bool = False
    partial_price: float = float("nan")
    partial_minute: int = -1
    same_bar_be: bool = False
    manage: bool = False


def run_symbol_managed(series: BarSeries, model, costs: Costs,
                       manage: bool = True,
                       partial_r: float = PARTIAL_R,
                       fraction: float = PARTIAL_FRACTION,
                       warmup_days: int = 5,
                       day_filter=None) -> tuple[list[Trade], list[Rejection]]:
    """Replay every eligible day for one symbol. `manage=False` == `run_symbol`."""
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
                        pos = _open(pending, fp, j, minute, manage, partial_r)
                        pending = None
                        _update_excursions(pos, h, l)
                        if _step(pos, o, h, l, c, minute, close_min, costs,
                                 manage, trades, j, fraction):
                            pos = None
                        continue

            # 2 — an open position meets this bar
            if pos is not None:
                _update_excursions(pos, h, l)
                if _step(pos, o, h, l, c, minute, close_min, costs, manage,
                         trades, j, fraction):
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
            px = time_exit(pos.signal.side, float(win.close[j]), costs)
            trades.append(_close(pos, j, int(win.minute[j]), "time", px, False,
                                 costs, fraction))
        if pending is not None:
            rejections.append(Rejection(series.symbol, day, "expired"))

    return trades, rejections


def _open(sig: Signal, fill: float, j: int, minute: int, manage: bool,
          partial_r: float) -> _Open:
    target = resolved_target(sig, fill)
    risk = abs(fill - sig.stop_price)
    p1 = (fill + partial_r * risk if sig.side == "long"
          else fill - partial_r * risk) if manage else float("nan")
    return _Open(sig, fill, j, minute, target, p1, manage=manage)


def _update_excursions(pos: _Open, high: float, low: float) -> None:
    if pos.signal.side == "long":
        pos.mae_price = max(pos.mae_price, pos.fill_price - low)
        pos.mfe_price = max(pos.mfe_price, high - pos.fill_price)
    else:
        pos.mae_price = max(pos.mae_price, high - pos.fill_price)
        pos.mfe_price = max(pos.mfe_price, pos.fill_price - low)


def _reached(side: str, level: float, high: float, low: float) -> bool:
    """Did this bar's range reach `level` in the favourable direction?"""
    if not math.isfinite(level):
        return False
    return high >= level if side == "long" else low <= level


def _hit_stop(side: str, stop: float, high: float, low: float) -> bool:
    return low <= stop if side == "long" else high >= stop


def _step(pos: _Open, o: float, h: float, l: float, c: float, minute: int,
          close_min: int, costs: Costs, manage: bool, trades: list, j: int,
          fraction: float) -> bool:
    """Resolve bar `j` for an open position. True if the position is now flat.

    The managed branch below is the ONLY thing this runner adds to
    `engine/backtest/engine.py`. When `manage` is False, or once the partial is
    already done, the bar is resolved by the unchanged `fills.exit_on_bar`.
    """
    side = pos.signal.side

    if manage and not pos.partial_done:
        stop = pos.signal.stop_price
        risk = abs(pos.fill_price - stop)
        target_dist = abs(pos.target - pos.fill_price)
        partial_dist = abs(pos.partial_level - pos.fill_price)

        if _hit_stop(side, stop, h, l):
            # the whole position is stopped, even if this bar also reached +1R
            # or the target. Unknowable from OHLC; booked as the loss.
            ambiguous = (_reached(side, pos.partial_level, h, l)
                         or _reached(side, pos.target, h, l))
            px = costs.slip(min(stop, o) if side == "long" else max(stop, o),
                            adverse_up=(side == "short"))
            trades.append(_close(pos, j, minute, "stop", px, ambiguous, costs,
                                 fraction))
            return True

        if target_dist <= partial_dist:
            # the target is no further than +1R, so price cannot reach the
            # partial without passing the target first. No partial is possible.
            if _reached(side, pos.target, h, l):
                trades.append(_close(pos, j, minute, "target", pos.target,
                                     False, costs, fraction))
                return True
        elif _reached(side, pos.partial_level, h, l):
            pos.partial_done = True
            pos.partial_price = pos.partial_level
            pos.partial_minute = minute
            if _reached(side, pos.target, h, l):
                # price went through +1R and on to the target inside one bar
                trades.append(_close(pos, j, minute, "target", pos.target,
                                     False, costs, fraction))
                return True
            if (l <= pos.fill_price if side == "long" else h >= pos.fill_price):
                # ...and the same bar also came back through breakeven. Which
                # excursion happened first is unknowable, so it is assumed to
                # be the one that costs money.
                pos.same_bar_be = True
                px = costs.slip(pos.fill_price, adverse_up=(side == "short"))
                trades.append(_close(pos, j, minute, "be", px, True, costs,
                                     fraction))
                return True
    else:
        stop = pos.fill_price if pos.partial_done else pos.signal.stop_price
        res = exit_on_bar(side, stop, pos.target, o, h, l, costs)
        if res is not None:
            reason = res[0]
            if reason == "stop" and pos.partial_done:
                reason = "be"
            trades.append(_close(pos, j, minute, reason, res[1], res[2], costs,
                                 fraction))
            return True

    if minute >= min(pos.signal.exit_minute, close_min - 1):
        trades.append(_close(pos, j, minute, "time", time_exit(side, c, costs),
                             False, costs, fraction))
        return True
    return False


def _leg_r(side: str, fill: float, exit_px: float, risk: float,
           costs: Costs) -> tuple[float, float, float, float]:
    """(gross_r, net_r, gross_pct, net_pct) for one leg, per share of that leg."""
    sign = 1.0 if side == "long" else -1.0
    gross_ps = sign * (exit_px - fill)
    net_ps = gross_ps - 2.0 * costs.commission_per_share
    return (gross_ps / risk if risk > 0 else float("nan"),
            net_ps / risk if risk > 0 else float("nan"),
            gross_ps / fill if fill > 0 else float("nan"),
            net_ps / fill if fill > 0 else float("nan"))


def _close(pos: _Open, j: int, minute: int, reason: str, px: float,
           ambiguous: bool, costs: Costs, fraction: float) -> Trade:
    s = pos.signal
    risk = abs(pos.fill_price - s.stop_price)
    legs = [(1.0, px)]
    if pos.partial_done:
        legs = [(fraction, pos.partial_price), (1.0 - fraction, px)]

    gross_r = net_r = gross_pct = net_pct = 0.0
    for w, exit_px in legs:
        g, n, gp, np_ = _leg_r(s.side, pos.fill_price, exit_px, risk, costs)
        gross_r += w * g
        net_r += w * n
        gross_pct += w * gp
        net_pct += w * np_

    meta = dict(s.meta)
    meta.update({
        "managed": pos.manage,
        "partial_taken": pos.partial_done,
        "partial_price": pos.partial_price,
        "partial_minute": pos.partial_minute,
        "same_bar_partial_and_breakeven": pos.same_bar_be,
        "remainder_reason": reason,
        "target_price_used": pos.target,
        "target_r_realised": (abs(pos.target - pos.fill_price) / risk
                              if risk > 0 and math.isfinite(pos.target)
                              else float("inf")),
    })
    return Trade(
        model_id=s.model_id, symbol=s.symbol, day=s.day, side=s.side,
        decision_minute=s.decision_minute, entry_minute=pos.entry_minute,
        exit_minute=minute, signal_entry=s.entry_price,
        fill_price=pos.fill_price, stop_price=s.stop_price,
        target_price=pos.target, exit_price=px,
        exit_reason=(f"partial+{reason}" if pos.partial_done else reason),
        bars_held=j - pos.entry_idx, risk_per_share=risk,
        mae_price=pos.mae_price, mfe_price=pos.mfe_price,
        gross_r=gross_r, net_r=net_r, gross_pct=gross_pct, net_pct=net_pct,
        mae_r=pos.mae_price / risk if risk > 0 else float("nan"),
        mfe_r=pos.mfe_price / risk if risk > 0 else float("nan"),
        ambiguous_bar=ambiguous or pos.ambiguous, meta=meta,
    )
