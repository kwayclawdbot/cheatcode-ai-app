"""Statistics, with the distribution ahead of the mean.

The existing SMS engine reported +11.93% average peak on alerts whose average
drawdown was −10.49% and 47.5% of which went 8%+ underwater first. A mean is
not a result. The MAE distribution here is the headline number.
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field

import numpy as np

from engine.backtest.types import Trade

MAE_THRESHOLDS = (0.25, 0.5, 0.75, 1.0)


@dataclass
class Summary:
    label: str
    n: int
    hit_rate: float
    mean_r: float
    median_r: float
    mean_pct: float
    median_pct: float
    payoff: float
    profit_factor: float
    total_r: float
    max_drawdown_r: float
    longest_losing_run: int
    mae_deciles: list[float] = field(default_factory=list)
    mae_tail: dict[str, float] = field(default_factory=dict)
    mae_tail_winners: dict[str, float] = field(default_factory=dict)
    exit_mix: dict[str, int] = field(default_factory=dict)
    ambiguous_bars: int = 0
    mean_bars_held: float = 0.0


def _drawdown(curve: np.ndarray) -> float:
    if len(curve) == 0:
        return 0.0
    peak = np.maximum.accumulate(curve)
    return float(np.max(peak - curve))


def _longest_losing_run(rs: np.ndarray) -> int:
    best = run = 0
    for r in rs:
        run = run + 1 if r <= 0 else 0
        best = max(best, run)
    return best


def summarise(trades: list[Trade], label: str = "all") -> Summary:
    if not trades:
        return Summary(label, 0, *([float("nan")] * 8), 0)
    r = np.array([t.net_r for t in trades], dtype="float64")
    pct = np.array([t.net_pct for t in trades], dtype="float64")
    mae = np.array([t.mae_r for t in trades], dtype="float64")
    wins, losses = r[r > 0], r[r <= 0]
    curve = np.cumsum(r)
    mae_win = mae[r > 0]

    exits: dict[str, int] = {}
    for t in trades:
        exits[t.exit_reason] = exits.get(t.exit_reason, 0) + 1

    return Summary(
        label=label,
        n=len(trades),
        hit_rate=float(len(wins) / len(r)),
        mean_r=float(np.mean(r)),
        median_r=float(np.median(r)),
        mean_pct=float(np.mean(pct)),
        median_pct=float(np.median(pct)),
        payoff=float(np.mean(wins) / abs(np.mean(losses))) if len(wins) and len(losses) and np.mean(losses) != 0 else float("nan"),
        profit_factor=float(wins.sum() / abs(losses.sum())) if len(losses) and losses.sum() != 0 else float("inf"),
        total_r=float(r.sum()),
        max_drawdown_r=_drawdown(curve),
        longest_losing_run=_longest_losing_run(r),
        mae_deciles=[float(np.quantile(mae, q / 10.0)) for q in range(1, 10)],
        mae_tail={f">={x}R": float(np.mean(mae >= x)) for x in MAE_THRESHOLDS},
        mae_tail_winners={f">={x}R": (float(np.mean(mae_win >= x)) if len(mae_win) else float("nan"))
                          for x in MAE_THRESHOLDS},
        exit_mix=exits,
        ambiguous_bars=sum(1 for t in trades if t.ambiguous_bar),
        mean_bars_held=float(np.mean([t.bars_held for t in trades])),
    )


def split_by(trades: list[Trade], key) -> dict[str, list[Trade]]:
    out: dict[str, list[Trade]] = {}
    for t in trades:
        out.setdefault(str(key(t)), []).append(t)
    return out


def session_bucket(t: Trade) -> str:
    m = t.entry_minute
    if m < 10 * 60 + 30:
        return "open 09:30-10:30"
    if m < 14 * 60:
        return "mid 10:30-14:00"
    return "close 14:00-16:00"


def fmt(x: float, nd: int = 3) -> str:
    if x is None or (isinstance(x, float) and (math.isnan(x) or math.isinf(x))):
        return "n/a"
    return f"{x:.{nd}f}"


def summary_row(s: Summary) -> str:
    return (f"| {s.label} | {s.n} | {fmt(s.hit_rate*100,1)}% | {fmt(s.mean_r)} | "
            f"{fmt(s.median_r)} | {fmt(s.mean_pct*100,3)}% | {fmt(s.payoff,2)} | "
            f"{fmt(s.profit_factor,2)} | {fmt(s.total_r,1)} | {fmt(s.max_drawdown_r,1)} | "
            f"{s.longest_losing_run} |")


SUMMARY_HEADER = (
    "| slice | n | hit | mean R | median R | mean % | payoff | PF | total R | maxDD R | max losing run |\n"
    "|---|---|---|---|---|---|---|---|---|---|---|"
)
