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


def naive_1r_scoring_generous(trades, level: float = ONE_R) -> dict:
    """The SAME literal request, read the other way — and the flattering way.

    Added AFTER the first evaluation, and the reason is stated so the addition
    cannot be mistaken for tuning. `naive_1r_scoring` books -1R for every trade
    that did not touch, which on a model whose target is often nearer than 1R
    turns out to be HARSHER than what actually happened. That understates the
    danger the fence exists to guard against.

    The owner's words were *"even if it doesnt hit 2rr mark any trade that moves
    up at least 1rr as a win"* — i.e. leave every other trade exactly as it
    resolved and only PROMOTE the ones that touched. That reading can only make
    the number better than reality, never worse, which is precisely why it is
    the dangerous one and why it belongs in the report.

    NOTHING here enters a gate. See DIAGNOSTICS_NEVER_GATED.
    """
    import math

    rows = [t for t in trades if math.isfinite(t.mfe_r) and math.isfinite(t.net_r)]
    n = len(rows)
    if not n:
        return {"n": 0}
    promoted = [level if t.mfe_r >= level else t.net_r for t in rows]
    realised = sorted(t.net_r for t in rows)
    return {
        "n": n,
        "claimed_win_rate": sum(1 for x in promoted if x > 0) / n,
        "claimed_mean_r": sum(promoted) / n,
        "claimed_median_r": (sorted(promoted)[n // 2] if n % 2
                             else 0.5 * (sorted(promoted)[n // 2 - 1]
                                         + sorted(promoted)[n // 2])),
        "realised_win_rate": sum(1 for t in rows if t.net_r > 0) / n,
        "realised_mean_r": sum(realised) / n,
        "realised_median_r": (realised[n // 2] if n % 2
                              else 0.5 * (realised[n // 2 - 1] + realised[n // 2])),
        "promoted": sum(1 for t in rows if t.mfe_r >= level and t.net_r < level),
    }


# ---------------------------------------------------------------------------
# ENGINE-6 addendum. Written before `orb_sip.v1` produced a number; see
# engine/models/orb_sip.v1/GATE.md for the reasoning and the git log for the
# ordering.
#
# This is a REPLICATION bar, not an expectancy bar, and it is deliberately a
# different KIND of thing from G1-G7. Those ask "does this model have edge".
# R1-R5 ask "can this harness see an edge somebody else has already
# documented" — Zarattini, Barbon & Aziz's 1,637% / 2.81 Sharpe on stocks in
# play against 29% / 0.48 unfiltered. A miss here is a finding about the
# machinery, and the verdict names it as such rather than filing an eighth
# failed model.
#
# NOTHING in this block relaxes G1-G5 for any other model. They are not
# referenced by it and are not reachable from it.

SIP_REPLICATION_WINDOW = ("2016-01-01", "2023-12-31")   # the paper's own window
SIP_HELD_BACK = ("2024-01-01", "2026-08-28")

SIP_MIN_TRADES = 5_000
SIP_MIN_SHARPE = 1.0

REPRODUCED = "REPRODUCED"
PARTIALLY_REPRODUCED = "PARTIALLY REPRODUCED"
NOT_REPRODUCED = "NOT REPRODUCED"


def evaluate_sip(summary, gross_mean_r, control_paired_diff,
                 unfiltered_diff, portfolio) -> list[GateResult]:
    """R1-R5 on the replication window.

    `control_paired_diff` is the per-pair gross R difference against the
    matched coin flip (same symbol, day, geometry, direction flipped).
    `unfiltered_diff` is the per-day net R difference between the
    stocks-in-play arm and the same rules on twenty random eligible names.
    Both are lists of numbers, and both are judged by whether their 95%
    interval excludes zero in the model's favour.
    """
    g = []
    g.append(GateResult(
        "R1", "sample", f">={SIP_MIN_TRADES} trades in the replication window",
        f"n={summary.n}", summary.n >= SIP_MIN_TRADES))
    g.append(GateResult(
        "R2", "sign", "mean gross R > 0 AND mean net R > 0",
        f"gross={gross_mean_r:+.4f}, net={summary.mean_r:+.4f}",
        gross_mean_r > 0 and summary.mean_r > 0))

    lo, hi = mean_ci95(control_paired_diff)
    m = (sum(control_paired_diff) / len(control_paired_diff)) if control_paired_diff else float("nan")
    g.append(GateResult(
        "R3", "direction beats a coin flip (paired, gross)",
        "95% interval excludes zero, in the model's favour",
        f"{m:+.4f} (95%: {lo:+.4f} to {hi:+.4f}, n={len(control_paired_diff)})",
        len(control_paired_diff) > 1 and lo > 0))

    lo2, hi2 = mean_ci95(unfiltered_diff)
    m2 = (sum(unfiltered_diff) / len(unfiltered_diff)) if unfiltered_diff else float("nan")
    g.append(GateResult(
        "R4", "the filter is the thing (net R, in play minus unfiltered)",
        "95% interval excludes zero, in the model's favour",
        f"{m2:+.4f} (95%: {lo2:+.4f} to {hi2:+.4f}, n={len(unfiltered_diff)})",
        len(unfiltered_diff) > 1 and lo2 > 0))

    g.append(GateResult(
        "R5", "portfolio, directionally consistent with the published result",
        f"total return > 0 AND Sharpe >= {SIP_MIN_SHARPE:.1f}",
        f"total={portfolio.total_return:+.1%}, Sharpe={portfolio.sharpe:.2f}, "
        f"maxDD={portfolio.max_drawdown:.1%}",
        portfolio.total_return > 0 and portfolio.sharpe >= SIP_MIN_SHARPE))
    return g


def verdict_sip(gates: list[GateResult]) -> str:
    """The four-way verdict, fixed before any count was known."""
    by_id = {g.id: g for g in gates}
    if not by_id["R1"].passed:
        return INCONCLUSIVE_SAMPLE
    if not (by_id["R2"].passed and by_id["R3"].passed and by_id["R4"].passed):
        return NOT_REPRODUCED
    return REPRODUCED if by_id["R5"].passed else PARTIALLY_REPRODUCED


# ---------------------------------------------------------------------------
# ENGINE-7 addendum. Written before `orb_sip.v2` produced a number; see
# engine/models/orb_sip.v2/GATE.md for the reasoning and the git log for the
# ordering.
#
# `orb_sip.v2` is `orb_sip.v1` with one change — the stop moves from 10% of the
# 14-day ATR to the opposite extreme of the 09:30-09:35 candle. That change was
# pointed at by TWO things: the companion ETF paper's own wording, which is
# clean, and a stop-width sweep the ENGINE-6 post-mortem ran on the 2016-2023
# replication window, which is not. The two cannot be separated after the fact.
#
# So the windows swap roles. The replication window is CONTAMINATED for this
# model and is a disclosure; the verdict is the held-back window, which the
# sweep never touched. H1-H5 are R1-R5 unchanged in kind and in number — the
# only thing that moves is which window they are read on, and it moves to the
# harder one.

SIPV2_HELD_BACK = ("2024-01-01", "2026-08-28")        # the verdict window
SIPV2_CONTAMINATED = ("2016-01-01", "2023-12-31")     # disclosed, never a verdict

SIPV2_MIN_TRADES = SIP_MIN_TRADES     # 5,000, carried over unchanged
SIPV2_MIN_SHARPE = SIP_MIN_SHARPE     # 1.0, carried over unchanged

# Not a gate. ENGINE-6 was stopped out on 90.1% of trades and the post-mortem
# blamed the stop for the result. If v2's stopped share is still at or above
# this level, that diagnosis was wrong and the report is required to say so in
# those words regardless of what the verdict says. It is a DISCLOSURE TRIGGER.
SIPV2_DIAGNOSIS_WRONG_IF_STOPPED_ABOVE = 0.85

CONFIRMED_OOS = "CONFIRMED OUT OF SAMPLE"
PARTIAL_OOS = "PARTIAL"
FAILED_OOS = "FAILED"


def evaluate_sip_v2(summary, gross_mean_r, control_paired_diff,
                    unfiltered_diff, portfolio) -> list[GateResult]:
    """H1-H5, read on the HELD-BACK window and nowhere else.

    Arguments have the same meanings as `evaluate_sip`; the caller is
    responsible for handing in held-back trades, and `run_engine7.py` does that
    in one place so the two cannot drift.
    """
    g = []
    g.append(GateResult(
        "H1", "sample (held back)",
        f">={SIPV2_MIN_TRADES} trades in {SIPV2_HELD_BACK[0]}..{SIPV2_HELD_BACK[1]}",
        f"n={summary.n}", summary.n >= SIPV2_MIN_TRADES))
    g.append(GateResult(
        "H2", "sign (held back)", "mean gross R > 0 AND mean net R > 0",
        f"gross={gross_mean_r:+.4f}, net={summary.mean_r:+.4f}",
        gross_mean_r > 0 and summary.mean_r > 0))

    lo, hi = mean_ci95(control_paired_diff)
    m = (sum(control_paired_diff) / len(control_paired_diff)) if control_paired_diff else float("nan")
    g.append(GateResult(
        "H3", "direction beats a coin flip (held back, paired, gross)",
        "95% interval excludes zero, in the model's favour",
        f"{m:+.4f} (95%: {lo:+.4f} to {hi:+.4f}, n={len(control_paired_diff)})",
        len(control_paired_diff) > 1 and lo > 0))

    lo2, hi2 = mean_ci95(unfiltered_diff)
    m2 = (sum(unfiltered_diff) / len(unfiltered_diff)) if unfiltered_diff else float("nan")
    g.append(GateResult(
        "H4", "the filter is the thing (held back, net R, in play minus random 20)",
        "95% interval excludes zero, in the model's favour",
        f"{m2:+.4f} (95%: {lo2:+.4f} to {hi2:+.4f}, n={len(unfiltered_diff)})",
        len(unfiltered_diff) > 1 and lo2 > 0))

    g.append(GateResult(
        "H5", "portfolio (held back)",
        f"total return > 0 AND Sharpe >= {SIPV2_MIN_SHARPE:.1f}",
        f"total={portfolio.total_return:+.1%}, Sharpe={portfolio.sharpe:.2f}, "
        f"maxDD={portfolio.max_drawdown:.1%}",
        portfolio.total_return > 0 and portfolio.sharpe >= SIPV2_MIN_SHARPE))
    return g


def verdict_sip_v2(gates: list[GateResult]) -> str:
    """The four-way verdict, fixed before any count was known.

    PARTIAL is NOT a pass. It means the money is there out of sample but at
    least one claim about WHERE it comes from is not established, and the report
    is required to name which.
    """
    by_id = {g.id: g for g in gates}
    if not by_id["H1"].passed:
        return INCONCLUSIVE_SAMPLE
    if not by_id["H2"].passed:
        return FAILED_OOS
    if all(x.passed for x in gates):
        return CONFIRMED_OOS
    return PARTIAL_OOS


# ---------------------------------------------------------------------------
# ENGINE-8 addendum. Written before `orb_sip.v3` or `orb_sip.v3_15m` produced a
# number; see engine/models/orb_sip.v3/GATE.md and
# engine/models/orb_sip.v3_15m/GATE.md for the reasoning, and the git log for
# the ordering.
#
# `orb_sip.v3` is `orb_sip.v2` plus one gate: the daily trend, read on the last
# fully closed daily bar, must agree with the breakout side. `orb_sip.v3_15m`
# is the same model on a 15-minute opening range. Two models, one held-back
# year, and that multiplicity is disclosed rather than corrected for — see
# SIPV3_MODELS below.
#
# NOTHING in this block relaxes G1-G5, R1-R5 or H1-H5 for any other model. They
# are not referenced by it and are not reachable from it.

# The owner's window, chosen as a trading judgement rather than a statistical
# one: a model that has to work in today's market is judged on today's market.
SIPV3_BUILD = ("2021-08-29", "2025-08-28")        # four years; nothing is tuned on it
SIPV3_HELD_BACK = ("2025-08-29", "2026-08-28")    # twelve months; the verdict

# ENGINE-7's floor was 5,000 trades. It CANNOT be carried over here and the
# reason is arithmetic, not preference: twenty picks a session over ~251
# sessions is a ceiling of ~5,000 trades before a single filter is applied, so
# 5,000 would make the verdict INCONCLUSIVE by construction rather than by
# evidence. The floor below is set from power instead. Per-trade net R on this
# family has a standard deviation near 1.2R (ENGINE-7: a +/-0.0224 half-width
# on n=10,545). At n=750 the 95% half-width is about +/-0.086R — enough to
# separate a per-trade edge worth trading (>= 0.10R, i.e. >= $100 per $1,000
# risked) from zero, and deliberately NOT enough to resolve v2's +0.02R. A
# passed T2 whose interval spans zero therefore settles nothing, and the report
# is required to say so.
SIPV3_MIN_TRADES = 750
SIPV3_MIN_SHARPE = SIP_MIN_SHARPE     # 1.0, carried over unchanged

# Two models are evaluated on one held-back year. With two independent 95%
# intervals the chance that at least one clears zero by luck is about 10%, not
# 5%. No correction is applied to the intervals — instead the report must state
# this, must report BOTH outcomes whatever they are, and must not lead with
# whichever did better.
SIPV3_MODELS = 2

# Not gates. Disclosure triggers, in the ENGINE-7 sense: if the condition
# holds, the report must say so in those words whatever the verdict says.
#
# 1. A filter that removes trades which would have WON is not helping, however
#    much the average of what is left improves.
# 2. The filter was proposed to fix one diagnosed failure — the mornings on
#    which both ends of the opening range broke. If the model still loses on
#    that subset, the filter did not do the job it was brought in for, and that
#    sentence belongs in the summary even if every gate passes.
SIPV3_FILTER_DISCARDS_WINNERS_IF_REMOVED_MEAN_ABOVE_KEPT = True
SIPV3_TWO_WAY_BREAK_STILL_LOSES_IF_MEAN_BELOW = 0.0


def evaluate_sip_v3(summary, gross_mean_r, control_paired_diff,
                    unfiltered_diff, portfolio, prefix: str = "T") -> list[GateResult]:
    """T1-T5 (or U1-U5 for the 15-minute variant), read on the HELD-BACK window
    and nowhere else.

    Same five questions as ENGINE-7's H1-H5, in the same order, with the same
    kinds of threshold. Only the sample floor moves, for the arithmetic reason
    recorded above, and it moves before any count is known.

    `control_paired_diff` is the per-pair gross R difference against the matched
    coin flip on the mornings the model traded. `unfiltered_diff` is the per-day
    net R difference between the stocks-in-play arm and the same rules — trend
    gate included — on twenty random eligible names.
    """
    g = []
    g.append(GateResult(
        f"{prefix}1", "sample (held back)",
        f">={SIPV3_MIN_TRADES} trades in {SIPV3_HELD_BACK[0]}..{SIPV3_HELD_BACK[1]}",
        f"n={summary.n}", summary.n >= SIPV3_MIN_TRADES))
    g.append(GateResult(
        f"{prefix}2", "sign (held back)", "mean gross R > 0 AND mean net R > 0",
        f"gross={gross_mean_r:+.4f}, net={summary.mean_r:+.4f}",
        gross_mean_r > 0 and summary.mean_r > 0))

    lo, hi = mean_ci95(control_paired_diff)
    m = (sum(control_paired_diff) / len(control_paired_diff)) if control_paired_diff else float("nan")
    g.append(GateResult(
        f"{prefix}3", "direction beats a coin flip (held back, paired, gross)",
        "95% interval excludes zero, in the model's favour",
        f"{m:+.4f} (95%: {lo:+.4f} to {hi:+.4f}, n={len(control_paired_diff)})",
        len(control_paired_diff) > 1 and lo > 0))

    lo2, hi2 = mean_ci95(unfiltered_diff)
    m2 = (sum(unfiltered_diff) / len(unfiltered_diff)) if unfiltered_diff else float("nan")
    g.append(GateResult(
        f"{prefix}4", "the filter is the thing (held back, net R, in play minus random 20)",
        "95% interval excludes zero, in the model's favour",
        f"{m2:+.4f} (95%: {lo2:+.4f} to {hi2:+.4f}, n={len(unfiltered_diff)})",
        len(unfiltered_diff) > 1 and lo2 > 0))

    g.append(GateResult(
        f"{prefix}5", "portfolio (held back)",
        f"total return > 0 AND Sharpe >= {SIPV3_MIN_SHARPE:.1f}",
        f"total={portfolio.total_return:+.1%}, Sharpe={portfolio.sharpe:.2f}, "
        f"maxDD={portfolio.max_drawdown:.1%}",
        portfolio.total_return > 0 and portfolio.sharpe >= SIPV3_MIN_SHARPE))
    return g


def verdict_sip_v3(gates: list[GateResult]) -> str:
    """The four-way verdict, fixed before any count was known, and the same
    four ENGINE-7 used.

    A thin sample is INCONCLUSIVE and nothing else is read — the brief is
    explicit that a small number must not be read as a verdict, and that the
    window must not be widened to manufacture one.
    """
    by_id = {g.id[1:]: g for g in gates}
    if not by_id["1"].passed:
        return INCONCLUSIVE_SAMPLE
    if not by_id["2"].passed:
        return FAILED_OOS
    if all(x.passed for x in gates):
        return CONFIRMED_OOS
    return PARTIAL_OOS


# ---------------------------------------------------------------------------
# ENGINE-12 addendum. Written before `orb_spy.v1` produced a number; see
# engine/models/orb_spy.v1/GATE.md for the reasoning and the git log for the
# ordering.
#
# `orb_spy.v1` is `orb_sip.v2` with the selection step deleted: one instrument,
# every session, no ranking, no pool. The stocks-in-play strategy has never once
# selected SPY — 0 trades out of 42,937 — so nothing measured in ENGINE-6..11
# says anything about it, and the owner's question is genuinely open.
#
# NOTHING in this block relaxes any earlier gate. They are not referenced by it
# and are not reachable from it.

# TWO windows are read, and they are read separately, with the same gates in the
# same order and thresholds of the same kind. Neither can overwrite the other.
#
#   the owner's year   the window every recent lane has used. It is ~251
#                      sessions of ONE instrument, so ~230 trades — thin by
#                      construction, and it has now been looked at repeatedly by
#                      earlier lanes on other models.
#   the untouched span everything before the owner's build window. No lane has
#                      ever put this spec on it, and it is nine and a half years
#                      deep. It is the stronger evidence and it is labelled as
#                      such in advance, so that a reader cannot be told after
#                      the fact which window "really" counted.
SPYV1_BUILD = ("2021-08-29", "2025-08-28")        # the owner's build years
SPYV1_HELD_BACK = ("2025-08-29", "2026-08-28")    # the owner's verdict year
SPYV1_UNTOUCHED = ("2012-01-01", "2021-08-28")    # never read for this spec
SPYV1_FULL = ("2012-01-01", "2026-08-28")         # the whole deep cache

# One trade a session on one instrument. ~251 sessions in the owner's year and
# ~2,400 in the untouched span, before doji opening candles and unfilled
# breakouts are subtracted. The floors are set from what the tape can physically
# supply, not from what would be convenient.
SPYV1_MIN_TRADES_HELD_BACK = 200
SPYV1_MIN_TRADES_UNTOUCHED = 1_500
SPYV1_MIN_SHARPE = SIP_MIN_SHARPE     # 1.0, carried over unchanged

# Two windows, each with its own 95% interval, so the chance that at least one
# clears zero by luck is about 10% rather than 5%. No correction is applied;
# instead the report must state this, must print both outcomes whatever they
# are, and must not lead with whichever did better.
SPYV1_WINDOWS = 2

# Disclosure triggers, in the ENGINE-7 sense: if the condition holds, the report
# must say so in those words, whatever the verdict says.
#
# 1. Stop width is the only parameter this programme has ever found that decides
#    the sign of this family. ENGINE-6's sweep put the flip between 0.25x and
#    0.50x of the 14-day ATR; `orb_sip.v2` on stocks realised 0.72x, and
#    ENGINE-4's SPY trigger-candle stop realised far less. If SPY's opening
#    candle does not deliver a stop at or above 0.50 ATR, then this lane has NOT
#    put the wide stop on SPY at all — it has put a narrower one — and that is
#    likely the whole answer. It must be said plainly and early.
# 2. An interval that contains zero settles nothing about the SIZE of the edge,
#    whatever the sign of the middle number. A passed sign gate is not evidence
#    that the per-trade edge is real.
# 3. If the two windows disagree in sign, the disagreement is the finding and
#    the report may not resolve it by preferring one.
SPYV1_WIDE_STOP_FLOOR_ATR = 0.50
SPYV1_SIGN_DISAGREEMENT_IS_THE_FINDING = True


def evaluate_spy_v1(summary, gross_mean_r, control_paired_diff, net_r_values,
                    portfolio, prefix: str, window: tuple[str, str],
                    min_trades: int) -> list[GateResult]:
    """Five gates on one window, in ENGINE-7's order and of ENGINE-7's kinds.

    The fourth differs from H4 and it has to: H4 asked whether the SELECTION was
    the source of the return, and this model has no selection to ask about. In
    its place stands the question the owner actually needs answered — whether
    the per-trade edge is distinguishable from zero at all — which ENGINE-7's
    own report flagged as the thing a passed H2 does NOT establish.
    """
    g = []
    g.append(GateResult(
        f"{prefix}1", f"sample ({window[0]}..{window[1]})",
        f">={min_trades} trades", f"n={summary.n}", summary.n >= min_trades))
    g.append(GateResult(
        f"{prefix}2", "sign", "mean gross R > 0 AND mean net R > 0",
        f"gross={gross_mean_r:+.4f}, net={summary.mean_r:+.4f}",
        gross_mean_r > 0 and summary.mean_r > 0))

    lo, hi = mean_ci95(control_paired_diff)
    m = (sum(control_paired_diff) / len(control_paired_diff)) if control_paired_diff else float("nan")
    g.append(GateResult(
        f"{prefix}3", "direction beats a coin flip (paired, gross)",
        "95% interval excludes zero, in the model's favour",
        f"{m:+.4f} (95%: {lo:+.4f} to {hi:+.4f}, n={len(control_paired_diff)})",
        len(control_paired_diff) > 1 and lo > 0))

    lo2, hi2 = mean_ci95(list(net_r_values))
    m2 = (sum(net_r_values) / len(net_r_values)) if len(net_r_values) else float("nan")
    g.append(GateResult(
        f"{prefix}4", "the edge is distinguishable from zero (net R)",
        "95% interval on the mean net R excludes zero, in the model's favour",
        f"{m2:+.4f} (95%: {lo2:+.4f} to {hi2:+.4f}, n={len(net_r_values)})",
        len(net_r_values) > 1 and lo2 > 0))

    g.append(GateResult(
        f"{prefix}5", "portfolio",
        f"total return > 0 AND Sharpe >= {SPYV1_MIN_SHARPE:.1f}",
        f"total={portfolio.total_return:+.1%}, Sharpe={portfolio.sharpe:.2f}, "
        f"maxDD={portfolio.max_drawdown:.1%}",
        portfolio.total_return > 0 and portfolio.sharpe >= SPYV1_MIN_SHARPE))
    return g


def verdict_spy_v1(gates: list[GateResult]) -> str:
    """The same four-way verdict ENGINE-7 and ENGINE-8 used, one per window.

    A thin sample is INCONCLUSIVE and nothing else in that window is read. The
    window is never widened to manufacture a verdict; the second window is a
    SEPARATE pre-registered reading, not a rescue.
    """
    by_id = {g.id[len(g.id) - 1:]: g for g in gates}
    if not by_id["1"].passed:
        return INCONCLUSIVE_SAMPLE
    if not by_id["2"].passed:
        return FAILED_OOS
    if all(x.passed for x in gates):
        return CONFIRMED_OOS
    return PARTIAL_OOS
