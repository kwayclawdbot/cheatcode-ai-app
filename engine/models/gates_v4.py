"""Pre-registered bar for ENGINE-10 — `orb_sip.v4_trigger` and `orb_sip.v4_prior`.

Written and committed before either arm produced a number. It lives in its own
module rather than being appended to `models/gates.py` for a mundane reason —
another lane is editing that file in the same working tree — and for a better
one: nothing here may relax G1-G5, R1-R5, H1-H5 or T1-T5 for any other model,
and a module that does not import them cannot.

The five questions are ENGINE-7's H1-H5 and ENGINE-8's T1-T5, in the same
order, with the same kinds of threshold and the same numbers. Only the prefix
changes. A model handed an easier bar than the one that failed before it has
not been measured against anything.
"""

from __future__ import annotations

from engine.models.gates import (CONFIRMED_OOS, FAILED_OOS, GateResult,
                                 INCONCLUSIVE_SAMPLE, PARTIAL_OOS,
                                 SIP_MIN_SHARPE, mean_ci95)

# The owner's window, unchanged from ENGINE-8 and deliberately not widened.
SIPV4_BUILD = ("2021-08-29", "2025-08-28")        # four years; nothing is tuned on it
SIPV4_HELD_BACK = ("2025-08-29", "2026-08-28")    # twelve months; the verdict

# ENGINE-8's floor, carried over unchanged and for the same arithmetic reason:
# twenty picks a session over ~251 sessions is a ceiling of ~5,000 trades, so
# ENGINE-7's 5,000 would make this INCONCLUSIVE by construction. 750 buys a
# 95% half-width near +/-0.086R at this family's dispersion — enough to see a
# per-trade edge worth trading (>= 0.10R = >= $100 per $1,000 risked) and
# deliberately NOT enough to resolve v2's +0.02R. A passed S2/P2 whose interval
# spans zero therefore settles nothing and the report must say so.
SIPV4_MIN_TRADES = 750
SIPV4_MIN_SHARPE = SIP_MIN_SHARPE     # 1.0, carried over unchanged

# Two arms are evaluated on one held-back year, and that year has now been read
# by ENGINE-7 (inside its 2024-2026 window) and by ENGINE-8. With two 95%
# intervals the chance that at least one clears zero by luck is about 10%, not
# 5%. No correction is applied — instead the report must state this plainly,
# must print BOTH outcomes whatever they are, and must not lead with whichever
# arm did better.
SIPV4_ARMS = 2

# --- disclosure triggers. Not gates: if the condition holds, the report must
# --- say so in these words whatever the verdict says.
#
# 1. ENGINE-6 ran this family with a stop of 10% of the 14-day ATR. It was hit
#    on 90.1% of trades and returned -0.635R. The ENGINE-6 post-mortem showed
#    the sign of the whole result moves with that one number, and v2's much
#    wider opening-range stop (0.75 ATR, 31.6% stopped) is what turned it from
#    badly losing to roughly breakeven. BOTH v4 arms are TIGHTER than v2's, so
#    this lane is moving back toward the setting that failed. If an arm's
#    stop-out share climbs to or above this threshold, the report must say that
#    the ENGINE-6 diagnosis is repeating, loudly and in the summary.
SIPV4_DIAGNOSIS_REPEATS_IF_STOPPED_AT_OR_ABOVE = 0.85
#
# 2. The tighter stop is also the cheaper-looking one per trade and the more
#    expensive one per share: cost drag is `cost per share / stop distance`.
#    The report must print realised stop width in cents, in percent of price
#    and in ATR units for every arm and for v2 on the SAME trades, and the
#    commission share of risk beside it.
SIPV4_MUST_PRINT_STOP_GEOMETRY_VS_V2 = True
#
# 3. Across the full five years v2 and v3 return about -$7 per $1,000 risked
#    and are positive in only 2 of 6 calendar years; the held-back year is the
#    good year. The report must print each arm's FULL FIVE-YEAR figure beside
#    the held-back one so a single good year cannot be mistaken for an edge.
SIPV4_MUST_PRINT_FULL_WINDOW_BESIDE_HELD_BACK = True


def evaluate_sip_v4(summary, gross_mean_r, control_paired_diff,
                    random20_diff, portfolio, prefix: str) -> list[GateResult]:
    """S1-S5 (trigger arm) or P1-P5 (prior arm), read on the HELD-BACK window
    and nowhere else.

    `control_paired_diff` is the per-pair gross R difference against the
    matched coin flip — same symbols, same days, same 09:35 decision, same stop
    reading, direction flipped — on the mornings both traded.
    `random20_diff` is the per-day net R difference between the stocks-in-play
    arm and the identical rules on twenty random eligible names.
    """
    g = []
    g.append(GateResult(
        f"{prefix}1", "sample (held back)",
        f">={SIPV4_MIN_TRADES} trades in {SIPV4_HELD_BACK[0]}..{SIPV4_HELD_BACK[1]}",
        f"n={summary.n}", summary.n >= SIPV4_MIN_TRADES))
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

    lo2, hi2 = mean_ci95(random20_diff)
    m2 = (sum(random20_diff) / len(random20_diff)) if random20_diff else float("nan")
    g.append(GateResult(
        f"{prefix}4", "the filter is the thing (held back, net R, in play minus random 20)",
        "95% interval excludes zero, in the model's favour",
        f"{m2:+.4f} (95%: {lo2:+.4f} to {hi2:+.4f}, n={len(random20_diff)})",
        len(random20_diff) > 1 and lo2 > 0))

    g.append(GateResult(
        f"{prefix}5", "portfolio (held back)",
        f"total return > 0 AND Sharpe >= {SIPV4_MIN_SHARPE:.1f}",
        f"total={portfolio.total_return:+.1%}, Sharpe={portfolio.sharpe:.2f}, "
        f"maxDD={portfolio.max_drawdown:.1%}",
        portfolio.total_return > 0 and portfolio.sharpe >= SIPV4_MIN_SHARPE))
    return g


def verdict_sip_v4(gates: list[GateResult]) -> str:
    """The same four outcomes ENGINE-7 and ENGINE-8 used, fixed before any
    count was known. A thin sample is INCONCLUSIVE and nothing else is read."""
    by_id = {g.id[1:]: g for g in gates}
    if not by_id["1"].passed:
        return INCONCLUSIVE_SAMPLE
    if not by_id["2"].passed:
        return FAILED_OOS
    if all(x.passed for x in gates):
        return CONFIRMED_OOS
    return PARTIAL_OOS
