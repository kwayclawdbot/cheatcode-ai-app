"""ENGINE-15's bar, in code, so the verdict is a function and not an opinion.

Thresholds and verdict names come from `models/orb_sip.v7_side/GATE.md`, which
lands in the same commit — and before the test data was downloaded, not merely
before it was read.

`mean_ci95` is the same normal-approximation interval every lane since ENGINE-6
has used, copied rather than imported so a comparison across lanes cannot have
moved underneath it. `two_sample_ci` is new here because A-minus-a is unpaired:
once split by side, the model and the control no longer trade the same
symbol-days.
"""

from __future__ import annotations

import math
from dataclasses import dataclass

TEST = ("2012-01-01", "2015-12-31")
ERAS = (("2012-2013", "2012-01-01", "2013-12-31"),
        ("2014-2015", "2014-01-01", "2015-12-31"))

MIN_TRADES_PER_SIDE = 3_000

N_COMPARISONS = 4
Z_BONFERRONI = 2.4977            # two-sided 0.05/4

REPLICATES = "BULLISH EDGE REPLICATES"
SIGNAL_ONLY = "SIGNAL REPLICATES, ASYMMETRY DOES NOT"
NOT_REPLICATED = "NOT REPLICATED"
REVERSED = "REVERSED"
INCONCLUSIVE = "INCONCLUSIVE (sample)"

# What ENGINE-14 found on 2016-2026, in net R, printed beside the test so the
# reader sees the finding and its test together. These are DISCLOSURE, not a
# threshold: no gate reads them.
PRIOR_2016_2026 = {"A": 0.0141, "a": -0.0103, "B": 0.0263, "b": 0.0207}


@dataclass
class GateResult:
    id: str
    name: str
    threshold: str
    observed: str
    passed: bool


def _mean(xs):
    return (sum(xs) / len(xs)) if len(xs) else float("nan")


def _var(xs):
    n = len(xs)
    if n < 2:
        return float("nan")
    m = _mean(xs)
    return sum((v - m) ** 2 for v in xs) / (n - 1)


def mean_ci95(xs) -> tuple[float, float]:
    n = len(xs)
    if n < 2:
        return (float("nan"), float("nan"))
    se = math.sqrt(_var(xs) / n)
    m = _mean(xs)
    return (m - 1.96 * se, m + 1.96 * se)


def mean_ci(xs, z: float) -> tuple[float, float]:
    n = len(xs)
    if n < 2:
        return (float("nan"), float("nan"))
    se = math.sqrt(_var(xs) / n)
    m = _mean(xs)
    return (m - z * se, m + z * se)


def two_sample(x, y, z: float = 1.96) -> tuple[float, float, float, float]:
    """(difference, lo, hi, se) for mean(x) - mean(y), unpaired."""
    if len(x) < 2 or len(y) < 2:
        return (float("nan"),) * 4
    d = _mean(x) - _mean(y)
    se = math.sqrt(_var(x) / len(x) + _var(y) / len(y))
    return (d, d - z * se, d + z * se, se)


def asymmetry(A, a, B, b, z: float = 1.96) -> tuple[float, float, float]:
    """((A-a) - (B-b), lo, hi). Four independent groups, so the variances add."""
    if min(len(A), len(a), len(B), len(b)) < 2:
        return (float("nan"),) * 3
    d = (_mean(A) - _mean(a)) - (_mean(B) - _mean(b))
    se = math.sqrt(_var(A) / len(A) + _var(a) / len(a)
                   + _var(B) / len(B) + _var(b) / len(b))
    return (d, d - z * se, d + z * se)


def _m(r):
    return f"{r * 1000:+,.0f} dol"


def evaluate(A, a, B, b, gross_A, model_all, flip_all) -> list[GateResult]:
    """A/B: model long/short net R. a/b: coin-flip long/short net R.
    `model_all`/`flip_all`: per-day net-R means for the paired Y6 comparison."""
    out: list[GateResult] = []

    out.append(GateResult(
        "Y1", "sample, per side (test window)",
        f">={MIN_TRADES_PER_SIDE:,} model trades on each side",
        f"bullish={len(A):,}, bearish={len(B):,}",
        len(A) >= MIN_TRADES_PER_SIDE and len(B) >= MIN_TRADES_PER_SIDE))

    d, lo, hi, _ = two_sample(A, a)
    out.append(GateResult(
        "Y2", "the bullish signal is real (A - a, unpaired)",
        "95% interval excludes zero, in the model's favour",
        f"{d:+.4f} ({_m(d)}) (95%: {lo:+.4f} to {hi:+.4f})", lo > 0.0))

    d, lo, hi, _ = two_sample(B, b)
    out.append(GateResult(
        "Y3", "the bearish signal is real (B - b, unpaired)",
        "95% interval excludes zero, in the model's favour",
        f"{d:+.4f} ({_m(d)}) (95%: {lo:+.4f} to {hi:+.4f})", lo > 0.0))

    d, lo, hi = asymmetry(A, a, B, b)
    out.append(GateResult(
        "Y4", "the ASYMMETRY replicates ((A-a) - (B-b))",
        "95% interval excludes zero with the BULLISH side larger",
        f"{d:+.4f} ({_m(d)}) (95%: {lo:+.4f} to {hi:+.4f})", lo > 0.0))

    out.append(GateResult(
        "Y5", "the bullish arm stands on its own",
        "mean gross R > 0 AND mean net R > 0 for A",
        f"gross={gross_A:+.4f}, net={_mean(A):+.4f}",
        gross_A > 0 and _mean(A) > 0))

    diff = [x - y for x, y in zip(model_all, flip_all)]
    m, (l2, h2) = _mean(diff), mean_ci95(diff)
    out.append(GateResult(
        "Y6", "the strategy transfers at all (model minus coin flip, paired by day)",
        "95% interval excludes zero, in the model's favour",
        f"{m:+.4f} ({_m(m)}) (95%: {l2:+.4f} to {h2:+.4f}, days={len(diff):,})",
        bool(diff) and l2 > 0.0))
    return out


def verdict(rows: list[GateResult], A, a, B, b) -> str:
    by = {g.id: g for g in rows}
    if not by["Y1"].passed:
        return INCONCLUSIVE
    d, lo, hi = asymmetry(A, a, B, b)
    if hi < 0.0:
        return REVERSED
    if by["Y4"].passed and by["Y2"].passed:
        return REPLICATES
    if by["Y6"].passed and (by["Y2"].passed or by["Y3"].passed):
        return SIGNAL_ONLY
    return NOT_REPLICATED
