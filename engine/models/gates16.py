"""ENGINE-16's bar, in code, so the verdict is a function and not an opinion.

Thresholds and verdict names come from `models/orb_sip.v8_us500/GATE.md`, which
lands in the same commit. `mean_ci95` is the same normal-approximation interval
every lane since ENGINE-6 has used, copied rather than imported so a comparison
across lanes cannot have moved underneath it.
"""

from __future__ import annotations

import math
from dataclasses import dataclass

PRIMARY = ("2021-08-30", "2026-08-28")
CONFIRM = ("2012-01-01", "2015-12-31")

MIN_TRADES = 3_000
N_COMPARISONS = 3
Z_BONFERRONI = 2.3940            # two-sided 0.05/3

INCUMBENT = "incumbent"
TOP10 = "us500_top10"
TOP20 = "us500_top20"
FLIP = "flip_us500_top10"
ARMS = (INCUMBENT, TOP10, TOP20, FLIP)

# ENGINE-12's two reference points for the stop-width mechanism, printed beside
# this lane's numbers. Disclosure, not thresholds.
SPY_ATR_STOP, SPY_KNOCKOUT = 0.16, 0.762
SIP_ATR_STOP, SIP_KNOCKOUT = 0.72, 0.316

WINS = "US500 TOP10 WINS"
IN_SAMPLE_ONLY = "WINS IN SAMPLE ONLY"
WORKS_NOT_BEATS = "WORKS BUT DOES NOT BEAT"
INCUMBENT_HOLDS = "INCUMBENT HOLDS"
FAILED = "FAILED"
INCONCLUSIVE = "INCONCLUSIVE (sample)"


@dataclass
class GateResult:
    id: str
    name: str
    threshold: str
    observed: str
    passed: bool


def _mean(xs):
    return (sum(xs) / len(xs)) if len(xs) else float("nan")


def mean_ci95(xs) -> tuple[float, float]:
    n = len(xs)
    if n < 2:
        return (float("nan"), float("nan"))
    m = _mean(xs)
    var = sum((v - m) ** 2 for v in xs) / (n - 1)
    se = math.sqrt(var / n)
    return (m - 1.96 * se, m + 1.96 * se)


def mean_ci(xs, z: float) -> tuple[float, float]:
    n = len(xs)
    if n < 2:
        return (float("nan"), float("nan"))
    m = _mean(xs)
    var = sum((v - m) ** 2 for v in xs) / (n - 1)
    se = math.sqrt(var / n)
    return (m - z * se, m + z * se)


def _m(r):
    return f"{r * 1000:+,.0f} dol"


def evaluate(n_primary, n_confirm, vs_inc, vs_flip, vs_inc_confirm,
             gross_top10, net_top10_primary, net_top10_confirm) -> list[GateResult]:
    out: list[GateResult] = []

    out.append(GateResult(
        "Z1", "sample (both windows)",
        f">={MIN_TRADES:,} us500_top10 trades in each window",
        f"primary={n_primary:,}, confirmation={n_confirm:,}",
        n_primary >= MIN_TRADES and n_confirm >= MIN_TRADES))

    m, (lo, hi) = _mean(vs_inc), mean_ci95(vs_inc)
    out.append(GateResult(
        "Z2", "it beats the incumbent (primary, paired by day)",
        "95% interval excludes zero, in the challenger's favour",
        f"{m:+.4f} ({_m(m)}) (95%: {lo:+.4f} to {hi:+.4f}, days={len(vs_inc):,})",
        bool(vs_inc) and lo > 0.0))

    m, (lo, hi) = _mean(vs_flip), mean_ci95(vs_flip)
    out.append(GateResult(
        "Z3", "the selector still works in this universe "
              "(primary, minus its own coin flip, paired by day)",
        "95% interval excludes zero, in the model's favour",
        f"{m:+.4f} ({_m(m)}) (95%: {lo:+.4f} to {hi:+.4f}, days={len(vs_flip):,})",
        bool(vs_flip) and lo > 0.0))

    m, (lo, hi) = _mean(vs_inc_confirm), mean_ci95(vs_inc_confirm)
    out.append(GateResult(
        "Z4", "it beats the incumbent out of sample too (confirmation window)",
        "95% interval excludes zero, in the challenger's favour",
        f"{m:+.4f} ({_m(m)}) (95%: {lo:+.4f} to {hi:+.4f}, "
        f"days={len(vs_inc_confirm):,})",
        bool(vs_inc_confirm) and lo > 0.0))

    out.append(GateResult(
        "Z5", "sign (primary)", "mean gross R > 0 AND mean net R > 0",
        f"gross={gross_top10:+.4f}, net={net_top10_primary:+.4f}",
        gross_top10 > 0 and net_top10_primary > 0))

    out.append(GateResult(
        "Z6", "not a one-window result", "mean net R > 0 in BOTH windows",
        f"primary={net_top10_primary:+.4f}, confirmation={net_top10_confirm:+.4f}",
        net_top10_primary > 0 and net_top10_confirm > 0))
    return out


def verdict(rows: list[GateResult], vs_inc) -> str:
    by = {g.id: g for g in rows}
    if not by["Z1"].passed:
        return INCONCLUSIVE
    if by["Z2"].passed:
        return WINS if by["Z4"].passed else IN_SAMPLE_ONLY
    # An interval lying entirely the wrong way is its own answer.
    if vs_inc and mean_ci95(vs_inc)[1] < 0.0:
        return FAILED
    if by["Z3"].passed:
        return WORKS_NOT_BEATS
    return INCUMBENT_HOLDS
