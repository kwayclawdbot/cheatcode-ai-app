"""ENGINE-9's bar, in code, so the verdict is a function and not an opinion.

Thresholds and verdict names come from `models/orb_kai_sel.v1/GATE.md`, which
lands in the same commit. Nothing here reads a result before deciding what would
count as one.

`mean_ci95` is a normal-approximation interval, and it is copied rather than
imported from `models/gates.py` for one reason: that file belongs to another lane
that is editing it right now, and a comparison across lanes has to be arithmetic
that cannot have moved underneath it. The formula is identical, so the numbers
are comparable with ENGINE-6 and ENGINE-7 by construction.
"""

from __future__ import annotations

import math
from dataclasses import dataclass

HELD_BACK = ("2025-08-29", "2026-08-28")
BUILD = ("2021-08-29", "2025-08-28")

MIN_TRADES_PER_ARM = 3_000
MIN_SHARPE = 1.0
N_COMPARISONS = 2                      # K2 and K3, both against the incumbent

KAI_WINS = "KAI WINS"
BOTH_WINS = "BOTH WINS"
RELVOL_HOLDS = "RELVOL HOLDS"
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


# Bonferroni over two comparisons: a two-sided 97.5% interval.
Z_BONFERRONI = 2.2414


def evaluate(summaries: dict, gross: dict, paired: dict,
             portfolios: dict) -> list[GateResult]:
    """`summaries`/`gross`/`portfolios` keyed by arm; `paired` keyed by the
    challenger arm and holding the per-day difference against `relvol`."""
    out: list[GateResult] = []

    counts = ", ".join(f"{a}={summaries[a].n:,}" for a in ("relvol", "kai", "both"))
    out.append(GateResult(
        "K1", "sample, per arm (held back)",
        f">={MIN_TRADES_PER_ARM:,} trades in each arm", counts,
        all(summaries[a].n >= MIN_TRADES_PER_ARM for a in ("relvol", "kai", "both"))))

    for gid, arm in (("K2", "kai"), ("K3", "both")):
        d = paired.get(arm) or []
        m = (sum(d) / len(d)) if d else float("nan")
        lo, hi = mean_ci95(d)
        out.append(GateResult(
            gid, f"`{arm}` beats `relvol` (held back, paired by day, net R)",
            "95% interval excludes zero, in the challenger's favour",
            f"{m:+.4f} (95%: {lo:+.4f} to {hi:+.4f}, n={len(d):,})",
            bool(d) and lo > 0.0))

    signs = ", ".join(
        f"{a}: gross={gross[a]:+.4f}/net={summaries[a].mean_r:+.4f}"
        for a in ("relvol", "kai", "both"))
    out.append(GateResult(
        "K4", "sign, per arm (held back)", "mean gross R > 0 AND mean net R > 0",
        signs,
        all(gross[a] > 0 and summaries[a].mean_r > 0
            for a in ("relvol", "kai", "both"))))

    pf = ", ".join(f"{a}: {portfolios[a].total_return:+.1%} @ {portfolios[a].sharpe:.2f}"
                   for a in ("relvol", "kai", "both"))
    out.append(GateResult(
        "K5", "portfolio, per arm (held back)",
        f"total return > 0 AND Sharpe >= {MIN_SHARPE:.1f}", pf,
        all(portfolios[a].total_return > 0 and portfolios[a].sharpe >= MIN_SHARPE
            for a in ("relvol", "kai", "both"))))
    return out


def verdict(rows: list[GateResult], summaries: dict, paired: dict) -> str:
    by_id = {g.id: g for g in rows}
    thin = [a for a in ("relvol", "kai", "both")
            if summaries[a].n < MIN_TRADES_PER_ARM]
    kai_ok = by_id["K2"].passed and "kai" not in thin
    both_ok = by_id["K3"].passed and "both" not in thin
    if kai_ok and both_ok:
        mk = sum(paired["kai"]) / len(paired["kai"])
        mb = sum(paired["both"]) / len(paired["both"])
        return KAI_WINS if mk >= mb else BOTH_WINS
    if kai_ok:
        return KAI_WINS
    if both_ok:
        return BOTH_WINS
    if thin:
        return INCONCLUSIVE
    return RELVOL_HOLDS
