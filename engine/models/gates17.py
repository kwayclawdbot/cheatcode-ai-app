"""ENGINE-17's bar, in code. Thresholds and verdict names come from
`models/orb_sip.v9_15c_prior/GATE.md`, which lands in the same commit."""

from __future__ import annotations

import math
from dataclasses import dataclass

VERDICT = ("2024-01-01", "2026-08-28")
DISCLOSURE = ("2016-01-01", "2023-12-31")
HALVES = (("first half", "2024-01-01", "2025-04-30"),
          ("second half", "2025-05-01", "2026-08-28"))

MIN_TRADES = 3_000
MAX_STOPOUT = 0.60
N_COMPARISONS = 3
Z_BONFERRONI = 2.3940

V2 = "v2"
C15_RANGE = "c15_range"
C15_PRIOR = "c15_prior"
ARMS = (V2, C15_RANGE, C15_PRIOR)

# Reference rows for the stop-geometry table. Disclosure, not thresholds.
REFERENCE_STOPS = (
    ("ENGINE-10 `v4_trigger` (the breakout candle)", 0.17, 0.858, -0.6047),
    ("ENGINE-10 `v4_prior` (the candle before it, 5-min range)", 0.51, 0.443, 0.0154),
    ("ENGINE-6 published 10%-of-ATR stop", 0.10, 0.901, -0.7229),
)

WINS = "OWNER'S STOP WINS"
FIXES_NOT_BEATS = "FIXES THE 15-MINUTE RULE, NOT THE INCUMBENT"
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


def mean_ci95(xs):
    n = len(xs)
    if n < 2:
        return (float("nan"), float("nan"))
    m = _mean(xs)
    var = sum((v - m) ** 2 for v in xs) / (n - 1)
    se = math.sqrt(var / n)
    return (m - 1.96 * se, m + 1.96 * se)


def mean_ci(xs, z):
    n = len(xs)
    if n < 2:
        return (float("nan"), float("nan"))
    m = _mean(xs)
    var = sum((v - m) ** 2 for v in xs) / (n - 1)
    se = math.sqrt(var / n)
    return (m - z * se, m + z * se)


def _m(r):
    return f"{r * 1000:+,.0f} dol"


def evaluate(n_prior, vs_v2, vs_range, gross, net, stopout, halves):
    out = []
    out.append(GateResult(
        "Q1", "sample (verdict window)",
        f">={MIN_TRADES:,} c15_prior trades", f"{n_prior:,}",
        n_prior >= MIN_TRADES))

    m, (lo, hi) = _mean(vs_v2), mean_ci95(vs_v2)
    out.append(GateResult(
        "Q2", "it beats the incumbent (paired by day, net R)",
        "95% interval excludes zero, in the challenger's favour",
        f"{m:+.4f} ({_m(m)}) (95%: {lo:+.4f} to {hi:+.4f}, days={len(vs_v2):,})",
        bool(vs_v2) and lo > 0.0))

    m, (lo, hi) = _mean(vs_range), mean_ci95(vs_range)
    out.append(GateResult(
        "Q3", "it fixes ENGINE-13 (c15_prior minus c15_range, paired by day)",
        "95% interval excludes zero, in the challenger's favour",
        f"{m:+.4f} ({_m(m)}) (95%: {lo:+.4f} to {hi:+.4f}, days={len(vs_range):,})",
        bool(vs_range) and lo > 0.0))

    out.append(GateResult(
        "Q4", "sign", "mean gross R > 0 AND mean net R > 0",
        f"gross={gross:+.4f}, net={net:+.4f}", gross > 0 and net > 0))

    out.append(GateResult(
        "Q5", "the knock-out guard", f"stop-out share < {MAX_STOPOUT:.0%}",
        f"{stopout:.1%}", stopout < MAX_STOPOUT))

    out.append(GateResult(
        "Q6", "not a half-window artefact", "mean net R > 0 in BOTH halves",
        ", ".join(f"{k}={v:+.4f}" for k, v in halves.items()),
        all(v > 0 for v in halves.values())))
    return out


def verdict(rows, vs_v2):
    by = {g.id: g for g in rows}
    if not by["Q1"].passed:
        return INCONCLUSIVE
    if not by["Q5"].passed:
        return FAILED
    if by["Q2"].passed:
        return WINS
    if vs_v2 and mean_ci95(vs_v2)[1] < 0.0:
        return FAILED
    if by["Q3"].passed:
        return FIXES_NOT_BEATS
    return INCUMBENT_HOLDS
