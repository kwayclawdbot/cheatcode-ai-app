"""1% risk a position, 4x gross leverage, compounded daily.

The published number is a PORTFOLIO return and is not comparable to a per-trade
mean R. 1,637% over eight years is what 20 positions a day at 1% risk each,
capped at 4x gross, compound into; the same trades expressed as a mean R could
be a few hundredths. Both are reported, and neither is allowed to stand in for
the other.

The rules, stated rather than buried:

* every position is sized to risk 1% of the equity at the START of the day,
  measured on the distance from the fill to the stop actually carried;
* if the day's positions together want more than 4x equity of gross exposure,
  every one of them is scaled down by the same factor. The cap is a portfolio
  constraint, not a per-position one, and with a stop of a tenth of an ATR it
  binds on nearly every day — which is itself a result worth printing;
* all of a day's positions are treated as simultaneous. They enter within
  minutes of each other in the morning, so this is close to true, and it is the
  pessimistic direction for the leverage cap;
* the day's profit and loss is added to equity at the close. There is no
  intraday compounding and no interest on cash or on margin.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np

TRADING_DAYS = 252.0


@dataclass
class PortfolioResult:
    days: list[int]
    equity: list[float]
    daily_return: list[float]
    exposure_ratio: list[float]      # gross notional / equity, after the cap
    capped_days: int
    start_equity: float
    total_return: float
    cagr: float
    sharpe: float
    max_drawdown: float
    n_days: int
    n_trades: int


def run_portfolio(trades, all_days: list[int], start_equity: float = 100_000.0,
                  risk_frac: float = 0.01, leverage_cap: float = 4.0) -> PortfolioResult:
    by_day: dict[int, list] = {}
    for t in trades:
        by_day.setdefault(int(t.day), []).append(t)

    equity = start_equity
    days, curve, rets, expo = [], [], [], []
    capped = 0
    for d in all_days:
        todays = by_day.get(int(d), [])
        pnl = 0.0
        gross = 0.0
        if todays:
            budget = risk_frac * equity
            shares = []
            for t in todays:
                risk = float(t.risk_per_share)
                shares.append(budget / risk if risk > 0 else 0.0)
            notional = [s * float(t.fill_price) for s, t in zip(shares, todays)]
            total = sum(notional)
            cap = leverage_cap * equity
            if total > cap and total > 0:
                scale = cap / total
                shares = [s * scale for s in shares]
                notional = [n * scale for n in notional]
                capped += 1
            gross = sum(notional)
            for s, t in zip(shares, todays):
                pnl += s * float(t.net_r) * float(t.risk_per_share)
        prev = equity
        equity = max(equity + pnl, 1e-9)
        days.append(int(d))
        curve.append(equity)
        rets.append(pnl / prev if prev > 0 else 0.0)
        expo.append(gross / prev if prev > 0 else 0.0)

    r = np.array(rets, dtype="float64")
    eq = np.array(curve, dtype="float64")
    years = len(days) / TRADING_DAYS if days else 0.0
    total_return = (eq[-1] / start_equity - 1.0) if len(eq) else 0.0
    cagr = ((eq[-1] / start_equity) ** (1.0 / years) - 1.0) if years > 0 and len(eq) else 0.0
    sd = float(np.std(r, ddof=1)) if len(r) > 1 else 0.0
    sharpe = (float(np.mean(r)) / sd * np.sqrt(TRADING_DAYS)) if sd > 0 else 0.0
    peak = np.maximum.accumulate(eq) if len(eq) else np.array([1.0])
    mdd = float(np.max(1.0 - eq / peak)) if len(eq) else 0.0
    return PortfolioResult(days, list(eq), list(r), list(expo), capped,
                           start_equity, total_return, cagr, sharpe, mdd,
                           len(days), len(trades))
