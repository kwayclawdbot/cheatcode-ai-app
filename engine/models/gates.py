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


# ---------------------------------------------------------------------------
# ENGINE-3 addendum. Written before `orb_mtf.v1` was evaluated; see
# engine/models/orb_mtf.v1/GATE.md for the reasoning.
#
# Exit A (flat at 15:55) is judged on G1-G5 exactly as ENGINE-2 was. Exit B
# holds overnight, which is a hazard the day trade does not have at all, so it
# carries two more gates. One bar cannot serve both.

MAX_GAP_TAIL = 0.05          # share of Exit B trades allowed to close past -2R
GAP_TAIL_LEVEL = -2.0


def evaluate_swing(b_trades, a_by_key, oos_window) -> list[GateResult]:
    """G6 and G7 — the two gates that exist only because Exit B holds overnight.

    `a_by_key` maps (symbol, day) to the Exit A trade for the same entry, so G7
    is a paired comparison rather than two distributions side by side.
    """
    g = []
    n = len(b_trades)
    tail = sum(1 for t in b_trades if t.net_r < GAP_TAIL_LEVEL)
    frac = tail / n if n else float("nan")
    g.append(GateResult(
        "G6", f"trades closing worse than {GAP_TAIL_LEVEL:.1f}R",
        f"<{MAX_GAP_TAIL:.0%}",
        f"{frac:.1%} ({tail}/{n})" if n else "n/a",
        n > 0 and frac < MAX_GAP_TAIL))

    lo, hi = (int(x.replace("-", "")) for x in oos_window)
    pairs = [(t.net_r, a_by_key[(t.symbol, t.day)].net_r)
             for t in b_trades if lo <= t.day <= hi
             and (t.symbol, t.day) in a_by_key]
    if pairs:
        mb = sum(p[0] for p in pairs) / len(pairs)
        ma = sum(p[1] for p in pairs) / len(pairs)
        ok = mb >= ma
        obs = f"B={mb:+.3f} vs A={ma:+.3f} (n={len(pairs)})"
    else:
        ok, obs = False, "n/a"
    g.append(GateResult(
        "G7", "holding beats closing at 15:55 (out-of-sample, paired)",
        "B >= A", obs, ok))
    return g


def verdict_swing(core: list[GateResult], extra: list[GateResult],
                  is_r, oos_r) -> str:
    """Exit B's verdict: the five carried-forward gates plus G6 and G7."""
    v = verdict3(core, is_r, oos_r)
    if v == "PASS" and not all(x.passed for x in extra):
        return "FAIL"
    return v


# ---------------------------------------------------------------------------
# ENGINE-4 addendum. Written before `orb_simple_1h.v1` or `orb_simple_4h.v1`
# produced a number; see each model's own GATE.md for the reasoning, and the
# git log for the ordering.
#
# ENGINE-4 runs on a DIFFERENT data snapshot (`polygon-deep-v1`, 2012-2026,
# three index ETFs) and judges ONE symbol at a time, so it needs its own windows
# and its own sample floor. Every other threshold is carried over from
# ENGINE-1's bar unchanged, because a model that gets an easier bar than the
# four that failed before it has not been measured against anything.

DEEP_IN_SAMPLE = ("2012-01-01", "2022-12-31")
DEEP_OUT_OF_SAMPLE = ("2023-01-01", "2026-08-28")

# Single-symbol floors. SPY has ~2,769 sessions in-sample and ~916 out. A model
# with no skip rules should trade a large fraction of them; 500 and 150 are
# roughly 18% and 16%. Set deliberately low so that missing them is a signal
# about the IMPLEMENTATION rather than a statement about the market.
MIN_TRADES_IS_DEEP = 500
MIN_TRADES_OOS_DEEP = 150


def evaluate_deep(is_summary, oos_summary, regime_summaries) -> list[GateResult]:
    """G1-G5 for one symbol on `polygon-deep-v1`. Only G1's numbers differ."""
    g = evaluate(is_summary, oos_summary, regime_summaries)
    g[0] = GateResult(
        "G1", "sample size (this symbol alone)",
        f"IS>={MIN_TRADES_IS_DEEP}, OOS>={MIN_TRADES_OOS_DEEP}",
        f"IS={is_summary.n}, OOS={oos_summary.n}",
        is_summary.n >= MIN_TRADES_IS_DEEP and oos_summary.n >= MIN_TRADES_OOS_DEEP)
    return g


def verdict3_deep(gates: list[GateResult], is_r, oos_r) -> str:
    """`verdict3`, with ENGINE-4's sample floor. Same three outcomes, same rule."""
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


# ---------------------------------------------------------------------------
# ENGINE-5 addendum. Written before `orb_1h_managed.v1` or any of its three
# variants produced a number; see each model's own GATE.md and the git log.
#
# ENGINE-5 adds NO gate and moves NO threshold. G1-G5 are ENGINE-1's, the deep
# windows and single-symbol floors are ENGINE-4's, and the `polygon-v1` basket
# uses ENGINE-1's windows and pooled floors. A model handed an easier bar than
# the six that failed before it has not been measured against anything.
#
# What ENGINE-5 adds is a DIAGNOSTIC and an explicit fence around it.

ONE_R = 1.0

# The gate functions above reference `Summary.mean_r`, `.profit_factor`, `.n`
# and `.mae_tail_winners`. None of them references an MFE statistic, a peak, a
# touch rate or a partial rate, and none of them may be changed to. This
# constant exists so the fence is greppable.
DIAGNOSTICS_NEVER_GATED = ("one_r_touch_rate", "partial_rate", "mfe",
                           "peak", "naive_win_rate")


def naive_1r_scoring(trades, level: float = ONE_R) -> dict:
    """The owner's literal request, priced — and never used as a result.

    *"even if it doesnt hit 2rr mark any trade that moves up at least 1rr as a
    win"*. This computes what that scoring rule would have CLAIMED on exactly
    these trades, beside what they actually returned, so the two can be printed
    next to each other.

    `touch_rate` is the share of trades whose best excursion reached `level` R
    before the trade resolved. It is capped by the trade's own exit: a trade
    that took its target at +0.4R cannot show an MFE of +1R, because it was
    closed. That is stated rather than corrected, because the alternative —
    following a closed position forward — is exactly the fiction being guarded
    against.

    `claimed_mean_r` books +1R for every trade that touched and -1R for every
    trade that did not, which is what "mark it as a win" means if it is to be
    arithmetic rather than a feeling. `realised_mean_r` is what the trades
    actually paid, after costs.

    NOTHING here enters a gate. See DIAGNOSTICS_NEVER_GATED.
    """
    import math

    rows = [t for t in trades if math.isfinite(t.mfe_r) and math.isfinite(t.net_r)]
    n = len(rows)
    if not n:
        return {"n": 0}
    touched = [t for t in rows if t.mfe_r >= level]
    realised = [t.net_r for t in rows]
    realised.sort()
    return {
        "n": n,
        "touched": len(touched),
        "touch_rate": len(touched) / n,
        "claimed_win_rate": len(touched) / n,
        "claimed_mean_r": (len(touched) * level - (n - len(touched)) * 1.0) / n,
        "realised_win_rate": sum(1 for t in rows if t.net_r > 0) / n,
        "realised_mean_r": sum(realised) / n,
        "realised_median_r": (realised[n // 2] if n % 2
                              else 0.5 * (realised[n // 2 - 1] + realised[n // 2])),
        "mean_r_of_touchers": (sum(t.net_r for t in touched) / len(touched)
                               if touched else float("nan")),
    }
