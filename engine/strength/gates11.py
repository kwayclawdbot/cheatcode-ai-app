"""ENGINE-11's bar, in code, so the verdict is a function and not an opinion.

Thresholds and verdict names come from `models/orb_trend_str.v1/GATE.md`, which
lands in the same commit. Nothing here reads a result before deciding what would
count as one.

`mean_ci95` is a normal-approximation interval, copied rather than imported for
ENGINE-9's reason: a comparison across lanes has to be arithmetic that cannot
have moved underneath it. The formula is identical to `models/gates.py`'s and to
`kai_score/gates9.py`'s, so the numbers are comparable with ENGINE-6 through -9
by construction.
"""

from __future__ import annotations

import math
from dataclasses import dataclass

HELD_BACK = ("2025-08-29", "2026-08-28")
BUILD = ("2021-08-29", "2025-08-28")

# A twenty-a-day arm over ~251 sessions tops out near 5,000 trades, so 3,000 is
# the same floor ENGINE-9 used for the same shape of arm. `gate_strong` removes
# trades by construction and carries ENGINE-8's floor, which was set from power:
# at n=750 the 95% half-width is about +/-0.086R, enough to separate a per-trade
# edge worth trading (>=0.10R) from zero and deliberately not enough to resolve
# a v2-sized +0.02R.
MIN_TRADES_FULL = 3_000
MIN_TRADES_GATED = 750
MIN_SHARPE = 1.0

# G2, G3 and G4 are three intervals on one held-back year.
N_COMPARISONS = 3
Z_BONFERRONI = 2.3940            # two-sided 0.05/3

BASELINE = "baseline"
RANK = "rank"
GATE = "gate_strong"
ARMS = (BASELINE, RANK, GATE)

RANK_WINS = "RANK WINS"
GATE_WINS = "GATE WINS"
BASELINE_HOLDS = "BASELINE HOLDS"
INCONCLUSIVE = "INCONCLUSIVE (sample)"


@dataclass
class GateResult:
    id: str
    name: str
    threshold: str
    observed: str
    passed: bool


def mean_ci95(values) -> tuple[float, float]:
    n = len(values)
    if n < 2:
        return (float("nan"), float("nan"))
    m = sum(values) / n
    var = sum((v - m) ** 2 for v in values) / (n - 1)
    se = math.sqrt(var / n)
    return (m - 1.96 * se, m + 1.96 * se)


def mean_ci(values, z: float) -> tuple[float, float]:
    n = len(values)
    if n < 2:
        return (float("nan"), float("nan"))
    m = sum(values) / n
    var = sum((v - m) ** 2 for v in values) / (n - 1)
    se = math.sqrt(var / n)
    return (m - z * se, m + z * se)


def min_trades(arm: str) -> int:
    return MIN_TRADES_GATED if arm == GATE else MIN_TRADES_FULL


def evaluate(summaries: dict, gross: dict, paired: dict, gradient: list,
             portfolios: dict) -> list[GateResult]:
    """`summaries`/`gross`/`portfolios` keyed by arm; `paired` keyed by the
    challenger arm and holding the per-day net-R difference against `baseline`;
    `gradient` is the per-day (strong half minus weak half) difference inside
    the baseline arm."""
    out: list[GateResult] = []

    counts = ", ".join(f"{a}={summaries[a].n:,}" for a in ARMS)
    out.append(GateResult(
        "G1", "sample, per arm (held back)",
        f">={MIN_TRADES_FULL:,} for baseline and rank, "
        f">={MIN_TRADES_GATED:,} for gate_strong", counts,
        all(summaries[a].n >= min_trades(a) for a in ARMS)))

    for gid, arm in (("G2", RANK), ("G3", GATE)):
        d = paired.get(arm) or []
        m = (sum(d) / len(d)) if d else float("nan")
        lo, hi = mean_ci95(d)
        out.append(GateResult(
            gid, f"`{arm}` beats `baseline` (held back, paired by day, net R)",
            "95% interval excludes zero, in the challenger's favour",
            f"{m:+.4f} (95%: {lo:+.4f} to {hi:+.4f}, n={len(d):,})",
            bool(d) and lo > 0.0))

    m = (sum(gradient) / len(gradient)) if gradient else float("nan")
    lo, hi = mean_ci95(gradient)
    out.append(GateResult(
        "G4", "the gradient (held back, baseline trades, paired by day)",
        "strong half minus weak half by directional strength, "
        "95% interval excludes zero",
        f"{m:+.4f} (95%: {lo:+.4f} to {hi:+.4f}, n={len(gradient):,})",
        bool(gradient) and (lo > 0.0 or hi < 0.0)))

    signs = ", ".join(
        f"{a}: gross={gross[a]:+.4f}/net={summaries[a].mean_r:+.4f}" for a in ARMS)
    out.append(GateResult(
        "G5", "sign, per arm (held back)", "mean gross R > 0 AND mean net R > 0",
        signs,
        all(gross[a] > 0 and summaries[a].mean_r > 0 for a in ARMS)))

    pf = ", ".join(f"{a}: {portfolios[a].total_return:+.1%} @ "
                   f"{portfolios[a].sharpe:.2f}" for a in ARMS)
    out.append(GateResult(
        "G6", "portfolio, per arm (held back)",
        f"total return > 0 AND Sharpe >= {MIN_SHARPE:.1f}", pf,
        all(portfolios[a].total_return > 0 and portfolios[a].sharpe >= MIN_SHARPE
            for a in ARMS)))
    return out


def verdict(rows: list[GateResult], summaries: dict, paired: dict) -> str:
    """G4 decides no arm. It is the finding, not the contest."""
    by_id = {g.id: g for g in rows}
    thin = [a for a in ARMS if summaries[a].n < min_trades(a)]
    rank_ok = by_id["G2"].passed and RANK not in thin
    gate_ok = by_id["G3"].passed and GATE not in thin
    if rank_ok and gate_ok:
        mr = sum(paired[RANK]) / len(paired[RANK])
        mg = sum(paired[GATE]) / len(paired[GATE])
        return RANK_WINS if mr >= mg else GATE_WINS
    if rank_ok:
        return RANK_WINS
    if gate_ok:
        return GATE_WINS
    if thin:
        return INCONCLUSIVE
    return BASELINE_HOLDS
