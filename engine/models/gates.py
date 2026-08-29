"""The pre-registered bar, as code, so PASS/FAIL is mechanical.

See engine/models/GATES.md for the reasoning. These numbers were committed
before the first evaluation was run; git history is the receipt.
"""

from __future__ import annotations

from dataclasses import dataclass

IN_SAMPLE = ("2023-09-01", "2025-12-31")
OUT_OF_SAMPLE = ("2026-01-01", "2026-08-28")

MIN_TRADES_IS = 400
MIN_TRADES_OOS = 100
MIN_EXPECTANCY_IS = 0.10
MIN_EXPECTANCY_OOS = 0.05
MIN_PF_IS = 1.20
MIN_PF_OOS = 1.10
MAX_WINNER_MAE_TAIL = 0.40      # fraction of winners with MAE >= 0.75R
WINNER_MAE_LEVEL = ">=0.75R"


@dataclass
class GateResult:
    id: str
    name: str
    threshold: str
    observed: str
    passed: bool


def evaluate(is_summary, oos_summary, regime_summaries) -> list[GateResult]:
    g = []
    g.append(GateResult(
        "G1", "sample size",
        f"IS>={MIN_TRADES_IS}, OOS>={MIN_TRADES_OOS}",
        f"IS={is_summary.n}, OOS={oos_summary.n}",
        is_summary.n >= MIN_TRADES_IS and oos_summary.n >= MIN_TRADES_OOS))
    g.append(GateResult(
        "G2", "expectancy after costs (mean net R)",
        f"IS>=+{MIN_EXPECTANCY_IS:.2f}, OOS>=+{MIN_EXPECTANCY_OOS:.2f}",
        f"IS={is_summary.mean_r:+.3f}, OOS={oos_summary.mean_r:+.3f}",
        is_summary.mean_r >= MIN_EXPECTANCY_IS and oos_summary.mean_r >= MIN_EXPECTANCY_OOS))
    g.append(GateResult(
        "G3", "profit factor after costs",
        f"IS>={MIN_PF_IS:.2f}, OOS>={MIN_PF_OOS:.2f}",
        f"IS={is_summary.profit_factor:.2f}, OOS={oos_summary.profit_factor:.2f}",
        is_summary.profit_factor >= MIN_PF_IS and oos_summary.profit_factor >= MIN_PF_OOS))
    tail = is_summary.mae_tail_winners.get(WINNER_MAE_LEVEL, float("nan"))
    g.append(GateResult(
        "G4", f"winners first going {WINNER_MAE_LEVEL} against",
        f"<={MAX_WINNER_MAE_TAIL:.0%}",
        f"{tail:.1%}" if tail == tail else "n/a",
        tail == tail and tail <= MAX_WINNER_MAE_TAIL))
    ok = bool(regime_summaries) and all(
        s.n > 0 and s.mean_r > 0 for s in regime_summaries.values())
    g.append(GateResult(
        "G5", "mean net R > 0 in both regimes (in-sample)",
        "both > 0",
        ", ".join(f"{k}={s.mean_r:+.3f} (n={s.n})" for k, s in sorted(regime_summaries.items())),
        ok))
    return g


def verdict(gates: list[GateResult]) -> str:
    return "PASS" if all(x.passed for x in gates) else "FAIL"


# ---------------------------------------------------------------------------
# ENGINE-2 addendum. Written before `orb_htf_structural.v1` was evaluated; see
# engine/models/orb_htf_structural.v1/GATE.md for the reasoning.
#
# A filtered model can be too small to judge. Calling that a failure of edge is
# as dishonest as calling a fluke a success, so the verdict has three outcomes
# and the rule for choosing between them is fixed here rather than after the
# count is known.

INCONCLUSIVE_SAMPLE = "INCONCLUSIVE (sample)"
INCONCLUSIVE_POWER = "INCONCLUSIVE (power)"


def mean_ci95(values) -> tuple[float, float]:
    """Normal-approximation 95% interval for the mean. Trade R is not normal,
    but n is large enough for the CLT to carry the mean, and the interval is
    used only to ask whether a threshold is excluded."""
    import math

    n = len(values)
    if n < 2:
        return (float("nan"), float("nan"))
    m = sum(values) / n
    var = sum((v - m) ** 2 for v in values) / (n - 1)
    se = math.sqrt(var / n)
    return (m - 1.96 * se, m + 1.96 * se)


def verdict3(gates: list[GateResult], is_r, oos_r) -> str:
    """PASS / FAIL / INCONCLUSIVE, per the pre-registered rule."""
    by_id = {g.id: g for g in gates}
    if all(g.passed for g in gates):
        return "PASS"
    if not by_id["G1"].passed:
        return INCONCLUSIVE_SAMPLE
    if not by_id["G2"].passed:
        is_hi = mean_ci95(is_r)[1]
        oos_hi = mean_ci95(oos_r)[1]
        decisive = (is_hi == is_hi and is_hi < MIN_EXPECTANCY_IS) or \
                   (oos_hi == oos_hi and oos_hi < MIN_EXPECTANCY_OOS)
        return "FAIL" if decisive else INCONCLUSIVE_POWER
    return "FAIL"
