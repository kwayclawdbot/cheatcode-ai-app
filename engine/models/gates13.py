"""ENGINE-13's bar, in code, so the verdict is a function and not an opinion.

Thresholds and verdict names come from `models/orb_sip.v5_15c/GATE.md`, which
lands in the same commit. Nothing here reads a result before deciding what would
count as one.

`mean_ci95` is a normal-approximation interval, copied rather than imported for
ENGINE-9's reason: a comparison across lanes has to be arithmetic that cannot
have moved underneath it. The formula is identical to `models/gates.py`'s, to
`kai_score/gates9.py`'s and to `strength/gates11.py`'s, so the numbers are
comparable with ENGINE-6 through -12 by construction.
"""

from __future__ import annotations

import math
from dataclasses import dataclass

# ENGINE-7's held-back window, reused here so the comparison against the
# incumbent is like for like. There is no un-looked-at span left in any cached
# snapshot; GATE.md says so and W6 is the substitute.
VERDICT = ("2024-01-01", "2026-08-28")
DISCLOSURE = ("2016-01-01", "2023-12-31")
ERAS = (("2016-2019", "2016-01-01", "2019-12-31"),
        ("2020-2023", "2020-01-01", "2023-12-31"),
        ("2024-2026", "2024-01-01", "2026-08-28"))

# A twenty-a-day arm over ~667 sessions tops out near 13,000 trades, but this
# one only trades when a block CLOSES outside the range, so 3,000 is the floor
# carried from ENGINE-9 and ENGINE-11 for a full arm. The SPY arm removes trades
# by construction: 1,000 sits between ENGINE-8's power-derived 750 and the
# full-arm 3,000, and at n=1,000 the 95% half-width is about +/-0.075R, enough
# to separate a per-trade edge worth trading (>=0.10R) from zero and
# deliberately not enough to resolve a v2-sized +0.02R.
MIN_TRADES_FULL = 3_000
MIN_TRADES_FILTERED = 1_000

# W2, W3 and W4 are three intervals on one window.
N_COMPARISONS = 3
Z_BONFERRONI = 2.3940            # two-sided 0.05/3

BASELINE = "baseline"
ORB15C = "orb15c"
ORB15C_SPY = "orb15c_spy"
ARMS = (BASELINE, ORB15C, ORB15C_SPY)

A_WINS = "A WINS"
B_WINS = "B WINS"
INCUMBENT_HOLDS = "INCUMBENT HOLDS"
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
    return MIN_TRADES_FILTERED if arm == ORB15C_SPY else MIN_TRADES_FULL


def evaluate(summaries: dict, gross: dict, paired: dict,
             eras: dict) -> list[GateResult]:
    """`summaries`/`gross` keyed by arm on the verdict window; `paired` holds
    the per-day net-R differences keyed by `orb15c`, `orb15c_spy` (each against
    `baseline`) and `spy_vs_a`; `eras` is {arm: {era_label: mean net R}}."""
    out: list[GateResult] = []

    counts = ", ".join(
        f"{a}={summaries[a].n:,}" for a in (ORB15C, ORB15C_SPY))
    out.append(GateResult(
        "W1", "sample (verdict window)",
        f">={MIN_TRADES_FULL:,} for {ORB15C}, "
        f">={MIN_TRADES_FILTERED:,} for {ORB15C_SPY}", counts,
        all(summaries[a].n >= min_trades(a) for a in (ORB15C, ORB15C_SPY))))

    for gid, arm in (("W2", ORB15C), ("W3", ORB15C_SPY)):
        d = paired.get(arm) or []
        m = (sum(d) / len(d)) if d else float("nan")
        lo, hi = mean_ci95(d)
        out.append(GateResult(
            gid, f"`{arm}` beats `baseline` (verdict, paired by day, net R)",
            "95% interval excludes zero, in the challenger's favour",
            f"{m:+.4f} (95%: {lo:+.4f} to {hi:+.4f}, days={len(d):,})",
            bool(d) and lo > 0.0))

    d = paired.get("spy_vs_a") or []
    m = (sum(d) / len(d)) if d else float("nan")
    lo, hi = mean_ci95(d)
    out.append(GateResult(
        "W4", "does SPY confluence add anything "
              "(verdict, paired by day, net R, spy minus A)",
        "95% interval excludes zero, in EITHER direction",
        f"{m:+.4f} (95%: {lo:+.4f} to {hi:+.4f}, days={len(d):,})",
        bool(d) and (lo > 0.0 or hi < 0.0)))

    signs = ", ".join(
        f"{a}: gross={gross[a]:+.4f}/net={summaries[a].mean_r:+.4f}" for a in ARMS)
    out.append(GateResult(
        "W5", "sign, per arm (verdict)", "mean gross R > 0 AND mean net R > 0",
        signs,
        all(gross[a] > 0 and summaries[a].mean_r > 0 for a in ARMS)))

    era_txt = "; ".join(
        f"{a}: " + ", ".join(f"{lab}={eras[a].get(lab, float('nan')):+.4f}"
                             for lab, _, _ in ERAS)
        for a in (ORB15C, ORB15C_SPY))
    era_ok = {a: all(eras[a].get(lab, float("nan")) > 0 for lab, _, _ in ERAS)
              for a in (ORB15C, ORB15C_SPY)}
    out.append(GateResult(
        "W6", "era sign agreement (2016-2019, 2020-2023, 2024-2026)",
        "for any arm clearing W2 or W3, mean net R > 0 in all three eras",
        era_txt,
        # W6 only binds on an arm that actually cleared its comparison; with no
        # winner it is reported as observed and does not block anything.
        any(era_ok.values())))
    return out


def verdict(rows: list[GateResult], summaries: dict, paired: dict,
            eras: dict) -> str:
    """W4 decides no arm. It is the finding, not the contest."""
    by_id = {g.id: g for g in rows}
    thin = [a for a in (ORB15C, ORB15C_SPY) if summaries[a].n < min_trades(a)]

    def era_ok(arm: str) -> bool:
        return all(eras[arm].get(lab, float("nan")) > 0 for lab, _, _ in ERAS)

    a_ok = by_id["W2"].passed and ORB15C not in thin and era_ok(ORB15C)
    b_ok = by_id["W3"].passed and ORB15C_SPY not in thin and era_ok(ORB15C_SPY)
    if a_ok and b_ok:
        ma = sum(paired[ORB15C]) / len(paired[ORB15C])
        mb = sum(paired[ORB15C_SPY]) / len(paired[ORB15C_SPY])
        return A_WINS if ma >= mb else B_WINS
    if a_ok:
        return A_WINS
    if b_ok:
        return B_WINS
    if thin:
        return INCONCLUSIVE
    return INCUMBENT_HOLDS
