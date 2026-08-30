"""ENGINE-14's bar, in code, so the verdict is a function and not an opinion.

Thresholds and verdict names come from `models/orb_sip.v6_1r/GATE.md`, which
lands in the same commit. Nothing here reads a result before deciding what would
count as one.

`mean_ci95` is a normal-approximation interval, copied rather than imported for
ENGINE-9's reason: a comparison across lanes has to be arithmetic that cannot
have moved underneath it. The formula is identical to every prior lane's, so the
numbers are comparable with ENGINE-6 through -13 by construction.
"""

from __future__ import annotations

import math
from dataclasses import dataclass

VERDICT = ("2024-01-01", "2026-08-28")
DISCLOSURE = ("2016-01-01", "2023-12-31")
ERAS = (("2016-2019", "2016-01-01", "2019-12-31"),
        ("2020-2023", "2020-01-01", "2023-12-31"),
        ("2024-2026", "2024-01-01", "2026-08-28"))

MIN_TRADES = 3_000

# X2, X3, X4 and X5 are four intervals on one window.
N_COMPARISONS = 4
Z_BONFERRONI = 2.4977            # two-sided 0.05/4

V2 = "v2"
V2_1R = "v2_1r"
C15 = "c15"
C15_1R = "c15_1r"
ARMS = (V2, V2_1R, C15, C15_1R)
CAPPED = {V2_1R: V2, C15_1R: C15}

HELPS = "1R HELPS"
HELPS_ENTRY = "1R HELPS THE ENTRY, NOT THE STRATEGY"
HURTS = "TARGET HURTS"
NO_EFFECT = "NO EFFECT"
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


def _mean(xs) -> float:
    return (sum(xs) / len(xs)) if xs else float("nan")


def evaluate(summaries: dict, gross: dict, paired: dict,
             eras: dict) -> list[GateResult]:
    """`summaries`/`gross` keyed by arm on the verdict window; `paired` holds
    per-day net-R differences keyed by `v2_1r` and `c15_1r` (each against its
    own uncapped twin) and by `best_vs_v2`; `eras` is {arm: {label: mean net R}}."""
    out: list[GateResult] = []

    counts = ", ".join(f"{a}={summaries[a].n:,}" for a in ARMS)
    out.append(GateResult(
        "X1", "sample, per arm (verdict)", f">={MIN_TRADES:,} for every arm",
        counts, all(summaries[a].n >= MIN_TRADES for a in ARMS)))

    for gid, arm in (("X2", V2_1R), ("X3", C15_1R)):
        d = paired.get(arm) or []
        m, (lo, hi) = _mean(d), mean_ci95(d)
        out.append(GateResult(
            gid, f"the 1R cap helps `{CAPPED[arm]}` "
                 f"(verdict, paired by day, net R, {arm} minus {CAPPED[arm]})",
            "95% interval excludes zero, in the challenger's favour",
            f"{m:+.4f} (95%: {lo:+.4f} to {hi:+.4f}, days={len(d):,})",
            bool(d) and lo > 0.0))

    d = paired.get("best_vs_v2") or []
    m, (lo, hi) = _mean(d), mean_ci95(d)
    out.append(GateResult(
        "X4", "the best capped arm beats the incumbent outright "
              "(verdict, paired by day, net R)",
        "95% interval excludes zero, in the challenger's favour",
        f"{m:+.4f} (95%: {lo:+.4f} to {hi:+.4f}, days={len(d):,})",
        bool(d) and lo > 0.0))

    signs = ", ".join(
        f"{a}: gross={gross[a]:+.4f}/net={summaries[a].mean_r:+.4f}" for a in ARMS)
    out.append(GateResult(
        "X5", "sign, per arm (verdict)", "mean gross R > 0 AND mean net R > 0",
        signs,
        all(gross[a] > 0 and summaries[a].mean_r > 0 for a in ARMS)))

    era_txt = "; ".join(
        f"{a}: " + ", ".join(f"{lab}={eras[a].get(lab, float('nan')):+.4f}"
                             for lab, _, _ in ERAS)
        for a in (V2_1R, C15_1R))
    era_ok = {a: all(eras[a].get(lab, float("nan")) > 0 for lab, _, _ in ERAS)
              for a in (V2_1R, C15_1R)}
    out.append(GateResult(
        "X6", "era sign agreement (2016-2019, 2020-2023, 2024-2026)",
        "for any arm clearing X2 or X3, mean net R > 0 in all three eras",
        era_txt, any(era_ok.values())))
    return out


def verdict(rows: list[GateResult], summaries: dict, paired: dict) -> str:
    by_id = {g.id: g for g in rows}
    if any(summaries[a].n < MIN_TRADES for a in ARMS):
        return INCONCLUSIVE

    helped = by_id["X2"].passed or by_id["X3"].passed
    if helped and by_id["X4"].passed:
        return HELPS
    if helped:
        return HELPS_ENTRY

    # A capped arm measurably LOSING to its own uncapped twin is its own answer.
    for arm in (V2_1R, C15_1R):
        d = paired.get(arm) or []
        if d and mean_ci95(d)[1] < 0.0:
            return HURTS
    return NO_EFFECT
