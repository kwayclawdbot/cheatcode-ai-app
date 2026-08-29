"""One entry, two exits, measured on the same trade.

The owner's words: *"if it doesnt hit by 3:55 close (daytrade only) or give user
option to swing."* That is a product control, so both sides of it have to be
real numbers rather than one number and an estimate.

    Exit A — day trade  flat at 15:55 ET, whatever the position. What ENGINE-2
                        did, so A is comparable to it line for line.
    Exit B — swing      hold to target or stop, capped at 5 trading sessions
                        counting the entry day, then flat at 15:55 on the last
                        of them.

The entry, the stop, the target and the fill price are IDENTICAL. The two lists
this returns are the same trades keyed by the same (symbol, day); the only thing
that differs is when the position was allowed to end. So the difference between
them is the value of letting it run, and nothing else.

**Overnight is modelled, not assumed away.** A position is only ever exited
during regular hours, because that is when a retail stop is live and when a
print can be trusted. Everything that happens between 16:00 and 09:30 is
therefore realised at the next session's open, through `exit_on_bar_gapped`: if
the session opens beyond the stop, the fill is that open, not the stop price. On
a name that gapped 4% against the trade, that is the difference between a
−1.0R loss and a −4R one, and only one of the two happened.

Two consequences of that choice, both stated because they cut the other way:

* the excursion figures for Exit B are measured on regular-hours bars only, so a
  position that went badly underwater at 04:00 and recovered by 09:30 does not
  show that in its MAE. The realised PnL is unaffected — nothing could have been
  done at 04:00 — but the risk statistic understates the fright.
* a target that gaps THROUGH in the good direction fills at the open, which is
  better than the level. That is what a resting limit does, and modelling it as
  a fill at the level would be a different fiction.

The decision path is unchanged from `engine/backtest/engine.py`: the model sees
`view(j)` and its order first acts on bar j+1, so a decision never touches the
bar it was made on. `test_two_exit.py` asserts Exit A reproduces the older
engine trade for trade rather than taking that on trust.
"""

from __future__ import annotations

import numpy as np

from engine.backtest.fills import (entry_fill, exit_on_bar_gapped, r_multiples,
                                   time_exit)
from engine.backtest.types import Costs, Rejection, Signal, Trade
from engine.primitives.session import rth_close_minute
from engine.primitives.timeframe import RTH_OPEN_MIN
from engine.series import BarSeries

MAX_HOLD_SESSIONS = 5


class _Rth:
    """The regular-hours spine of one symbol: which bars are tradeable, and
    which session each of them belongs to. Built once per symbol."""

    def __init__(self, series: BarSeries) -> None:
        day, minute = np.asarray(series.day), np.asarray(series.minute)
        uniq, inv = np.unique(day, return_inverse=True)
        closes = np.array([rth_close_minute(int(d)) for d in uniq], dtype="int32")
        self.close_of_day = {int(d): int(c) for d, c in zip(uniq, closes)}
        keep = (minute >= RTH_OPEN_MIN) & (minute < closes[inv])
        self.idx = np.flatnonzero(keep)
        d = day[self.idx]
        self.session = (np.concatenate(([0], np.cumsum(np.diff(d) != 0)))
                        if len(d) else np.zeros(0, dtype="int64"))
        self.day = d
        self.minute = minute[self.idx]

    def position_of(self, global_idx: int) -> int | None:
        p = int(np.searchsorted(self.idx, global_idx))
        if p >= len(self.idx) or int(self.idx[p]) != int(global_idx):
            return None
        return p


def run_symbol_two_exits(series: BarSeries, model, costs: Costs,
                         warmup_days: int = 3,
                         max_hold_sessions: int = MAX_HOLD_SESSIONS,
                         ) -> tuple[list[Trade], list[Trade], list[Rejection]]:
    """Replay every eligible day for one symbol; return (exit_A, exit_B, rejects)."""
    rth = _Rth(series)
    bounds = series.day_bounds()
    days = sorted(bounds)
    a_trades: list[Trade] = []
    b_trades: list[Trade] = []
    rejects: list[Rejection] = []

    o, h, l, c = (np.asarray(series.open), np.asarray(series.high),
                  np.asarray(series.low), np.asarray(series.close))

    for t in range(warmup_days, len(days)):
        day = days[t]
        win_start = bounds[days[t - warmup_days]][0]
        win_end = bounds[day][1]
        win = series.subrange(win_start, win_end)
        first = bounds[day][0] - win_start
        close_min = rth.close_of_day.get(day, 16 * 60)

        for j in range(first, len(win)):
            minute = int(win.minute[j])
            if minute < RTH_OPEN_MIN or minute >= close_min:
                continue
            if not model.wants_bar(minute, day):
                continue
            sig = model.evaluate(win.view(j), day)
            if sig is None:
                continue
            if sig.risk_per_share <= 0:
                rejects.append(Rejection(series.symbol, day, "zero_risk"))
                break

            gj = win_start + j
            if gj + 1 >= len(series):
                rejects.append(Rejection(series.symbol, day, "no_next_bar"))
                break
            entry_idx = gj + 1
            fill = entry_fill(sig.side, sig.entry_type, sig.entry_price,
                              float(o[entry_idx]), float(h[entry_idx]),
                              float(l[entry_idx]), costs)
            if fill is None:
                rejects.append(Rejection(series.symbol, day, "unfilled"))
                break
            p0 = rth.position_of(entry_idx)
            if p0 is None:
                rejects.append(Rejection(series.symbol, day, "entry_outside_rth"))
                break

            a_trades.append(_simulate(rth, o, h, l, c, sig, fill, p0, costs, 1, "A"))
            b_trades.append(_simulate(rth, o, h, l, c, sig, fill, p0, costs,
                                      max_hold_sessions, "B"))
            break              # one trade per symbol per day, first trigger only

    finish = getattr(model, "finish", None)
    if callable(finish):
        finish()
    return a_trades, b_trades, rejects


def _simulate(rth: _Rth, o, h, l, c, sig: Signal, fill: float, p0: int,
              costs: Costs, sessions: int, label: str) -> Trade:
    """Walk regular-hours bars from the fill until the position ends."""
    side, stop, target = sig.side, sig.stop_price, sig.target_price
    last_session = int(rth.session[p0]) + sessions - 1
    mae = mfe = 0.0
    ambiguous = False
    res = None
    p = p_last = p0
    n = len(rth.idx)

    while p < n and int(rth.session[p]) <= last_session:
        p_last = p
        g = int(rth.idx[p])
        bo, bh, bl, bc = float(o[g]), float(h[g]), float(l[g]), float(c[g])
        if side == "long":
            mae = max(mae, fill - bl)
            mfe = max(mfe, bh - fill)
        else:
            mae = max(mae, bh - fill)
            mfe = max(mfe, fill - bl)

        hit = exit_on_bar_gapped(side, stop, target, bo, bh, bl, costs)
        if hit is not None:
            res, ambiguous = hit, hit[2]
            break

        day = int(rth.day[p])
        minute = int(rth.minute[p])
        flat_at = min(sig.exit_minute, rth.close_of_day.get(day, 16 * 60) - 1)
        if int(rth.session[p]) == last_session and minute >= flat_at:
            res = ("time", time_exit(side, bc, costs), False)
            break
        p += 1

    if res is None:
        # the horizon ran past the end of the cache, or past the last session
        # the tape has. Flatten on the last regular-hours bar actually walked.
        p = p_last
        g = int(rth.idx[p])
        res = ("time", time_exit(side, float(c[g]), costs), False)

    reason, px, _ = res
    g = int(rth.idx[p])
    risk = abs(fill - stop)
    gross_r, net_r, gross_pct, net_pct, mae_r, mfe_r = r_multiples(
        side, fill, px, risk, mae, mfe, costs)
    meta = dict(sig.meta)
    meta.update({"exit": label, "exit_day": int(rth.day[p]),
                 "sessions_held": int(rth.session[p]) - int(rth.session[p0]) + 1,
                 "overnight": int(rth.day[p]) != int(rth.day[p0])})
    return Trade(
        model_id=sig.model_id, symbol=sig.symbol, day=sig.day, side=side,
        decision_minute=sig.decision_minute, entry_minute=int(rth.minute[p0]),
        exit_minute=int(rth.minute[p]), signal_entry=sig.entry_price,
        fill_price=fill, stop_price=stop, target_price=target, exit_price=px,
        exit_reason=reason, bars_held=p - p0, risk_per_share=risk,
        mae_price=mae, mfe_price=mfe, gross_r=gross_r, net_r=net_r,
        gross_pct=gross_pct, net_pct=net_pct, mae_r=mae_r, mfe_r=mfe_r,
        ambiguous_bar=ambiguous, meta=meta,
    )
