"""Fill arithmetic, isolated so it can be tested without a tape.

Rules, all pessimistic where the truth is unknowable from OHLC:

* a market order fills at the NEXT bar's open, plus adverse slippage;
* a stop order fills only if the bar's range actually reached the level, at the
  worse of the level and the bar's open, plus adverse slippage;
* a limit order fills only if the bar's range strictly PENETRATED the level —
  a touch is not a fill, because we have no queue position — at the level, with
  no slippage;
* when a bar's range contains both the stop and the target, the STOP is assumed
  to have been hit first. That bar is flagged, and the report says how many
  trades were resolved by that assumption.
"""

from __future__ import annotations

from engine.backtest.types import Costs, EntryType, Side


def entry_fill(side: Side, entry_type: EntryType, level: float,
               bar_open: float, bar_high: float, bar_low: float,
               costs: Costs) -> float | None:
    """Price the order fills at on this bar, or None if it does not fill."""
    if entry_type == "market":
        return costs.slip(bar_open, adverse_up=(side == "long"))

    if entry_type == "stop":
        if side == "long":
            if bar_high < level:
                return None
            return costs.slip(max(level, bar_open), adverse_up=True)
        if bar_low > level:
            return None
        return costs.slip(min(level, bar_open), adverse_up=False)

    if entry_type == "limit":
        if side == "long":
            if bar_low >= level:      # touch is not a fill
                return None
            return min(level, bar_open)
        if bar_high <= level:
            return None
        return max(level, bar_open)

    raise ValueError(entry_type)


def exit_on_bar(side: Side, stop: float, target: float,
                bar_open: float, bar_high: float, bar_low: float,
                costs: Costs) -> tuple[str, float, bool] | None:
    """(reason, price, ambiguous) or None if the bar resolves nothing."""
    if side == "long":
        hit_stop = bar_low <= stop
        hit_target = bar_high >= target
    else:
        hit_stop = bar_high >= stop
        hit_target = bar_low <= target

    if hit_stop and hit_target:
        # unknowable from OHLC alone; assume the loss
        px = costs.slip(min(stop, bar_open) if side == "long" else max(stop, bar_open),
                        adverse_up=(side == "short"))
        return ("stop", px, True)
    if hit_stop:
        px = costs.slip(min(stop, bar_open) if side == "long" else max(stop, bar_open),
                        adverse_up=(side == "short"))
        return ("stop", px, False)
    if hit_target:
        # a target is a resting limit; it fills at the level, no slippage
        return ("target", target, False)
    return None


def time_exit(side: Side, bar_close: float, costs: Costs) -> float:
    return costs.slip(bar_close, adverse_up=(side == "short"))


def r_multiples(side: Side, fill: float, exit_px: float, risk: float,
                mae_price: float, mfe_price: float,
                costs: Costs) -> tuple[float, float, float, float, float, float]:
    """(gross_r, net_r, gross_pct, net_pct, mae_r, mfe_r).

    Slippage is already inside the fill prices. Commission is charged per share
    on both sides and converted into R here, so a model with a tight stop is
    correctly penalised for it.
    """
    sign = 1.0 if side == "long" else -1.0
    gross_ps = sign * (exit_px - fill)
    commission_ps = 2.0 * costs.commission_per_share
    net_ps = gross_ps - commission_ps
    gross_r = gross_ps / risk if risk > 0 else float("nan")
    net_r = net_ps / risk if risk > 0 else float("nan")
    gross_pct = gross_ps / fill if fill > 0 else float("nan")
    net_pct = net_ps / fill if fill > 0 else float("nan")
    mae_r = mae_price / risk if risk > 0 else float("nan")
    mfe_r = mfe_price / risk if risk > 0 else float("nan")
    return gross_r, net_r, gross_pct, net_pct, mae_r, mfe_r


def exit_on_bar_gapped(side: Side, stop: float, target: float,
                       bar_open: float, bar_high: float, bar_low: float,
                       costs: Costs) -> tuple[str, float, bool] | None:
    """`exit_on_bar`, with the open treated as the first price of the bar.

    ENGINE-3 is the first model in the programme that holds overnight, and a
    backtest that fills a gapped stop AT the stop price is fiction. If a
    session opens below a long's stop, the stop became a market order at the
    open and it filled there — worse than the level, sometimes far worse. The
    mirror is also true and is modelled: a session that opens above a long's
    target fills the resting limit at the open, which is better than the level.

    Intraday this differs from `exit_on_bar` only in that second clause, and by
    a tick. Across a weekend it is the whole difference between an honest number
    and a flattering one.
    """
    if side == "long":
        if bar_open <= stop:
            return ("stop", costs.slip(bar_open, adverse_up=False), False)
        if bar_open >= target:
            return ("target", bar_open, False)
    else:
        if bar_open >= stop:
            return ("stop", costs.slip(bar_open, adverse_up=True), False)
        if bar_open <= target:
            return ("target", bar_open, False)
    return exit_on_bar(side, stop, target, bar_open, bar_high, bar_low, costs)
