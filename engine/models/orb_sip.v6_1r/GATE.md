# Pre-registered gate — `orb_sip.v6_1r` and `orb_sip.v6_15c_1r` (ENGINE-14)

**Written and committed before the first evaluation was run.** This file lands in
the same commit as `engine/models/orb_sip_1r.py`, `engine/models/gates14.py`,
their tests, and the runner `engine/run_engine14.py`. That commit is earlier in
`git log` than the commit carrying any number produced by them. Every lane from
ENGINE-1 onward has done this; the ordering is the receipt, and it is the only
part of this programme that cannot be faked afterwards.

## The question

The owner, 2026-08-30: *"If theres no target then theres no trade add a 1r take
profit"*.

Add a take-profit at **1R** — one unit of risk from the fill — to the two entry
rules already measured, and see whether a capped winner is worth more than an
uncapped one.

## The prior, written down before the run, because it is strong and specific

This lane is expected to FAIL, and saying so in advance is the only way that
prediction is worth anything.

1. **ENGINE-6's own spec says the tail is the strategy.** Its docstring: the
   published QQQ variant returns 676% on a 24% hit rate *because the winners run
   to the close*, and "our 2R cap is exactly what amputated that tail."
2. **The distribution says the same thing.** `orb_sip.v2` on the verdict window
   has a mean net R of **+0.0199** and a median of **−0.1180**. A positive mean
   sitting on a negative median means a minority of large winners carries the
   entire result. **A 1R cap removes the right-hand tail by construction** — it
   is the single most direct way to delete the thing that makes this family work.
3. ENGINE-5 measured a fixed 2R target on the ETF family (`orb_1h_managed_2r.v1`)
   and it FAILED. A 1R cap is tighter than the cap that already failed.

**If this lane returns a null it is a CONFIRMATION, not a discovery**, and the
report must say so rather than presenting a predicted failure as an insight. If
it returns a WIN it overturns the reading above, and the report must say that at
least as loudly.

## Read this before the numbers

### 1. This is the seventh reading of this window

ENGINE-6 read the whole 2016–2026 tape; the stop sweep contaminated 2016–2023;
ENGINE-7, -8, -9, -10, -11 and now -13 all read windows inside 2024–2026. **There
is no un-looked-at span left in any cached snapshot**, and fetching one means
paid Polygon calls, which this lane is forbidden. No correction is applied and
none is available. The era table (X6) is the declared substitute, exactly as in
ENGINE-13. **The honest framing, fixed here in advance, is "suggestive, not
conclusive", and the plain-English summary must say the words "seventh reading".**

### 2. Four intervals on one window is four chances to look good by luck

X2, X3, X4 and X5 are four 95% intervals. With four shots at a 5% test the
chance that at least one clears by chance alone is nearer 19% than 5%. **The gate
stays the 95% interval**, unchanged in kind and in number from ENGINE-6 onward.
The Bonferroni-corrected 98.75% interval is printed beside every comparison. That
is not a second gate; it is the size of the multiplicity problem, printed where
it cannot be missed.

### 3. The stop-before-target assumption now bites, and it did not before

Every model in this family so far had NO target, so `fills.py`'s rule — when one
bar's range contains both the stop and the target, assume the STOP was hit first
— could never fire. With a 1R target it fires often, because a 1R move and the
stop are close together in time on a fast bar. **The assumption is pessimistic
and it is not being changed for this lane.** The report must print how many
trades were resolved by it, per arm, as a share of all trades. If that share is
large, the arm's result carries a known downward bias and the report must say so
in those words rather than leaving it in a footnote.

## The change, exactly, before it was run on anything

    take-profit    a resting limit order at ONE UNIT OF RISK from the FILL.
                   R is measured from the fill to the stop level, so the target
                   is resolved AFTER the position exists, not from the
                   decision-time estimate. `Signal.target_r = 1.0`, resolved in
                   `backtest/fills.py::resolved_target`, which is the same
                   machinery ENGINE-4's 2R target used. A decision is priced at
                   one bar's close and filled at the next bar's open, so booking
                   a target off the earlier price would quietly make a 1R model
                   a 0.8R-to-1.3R model, trade by trade, in a direction
                   correlated with the gap.

    fill           a target is a resting LIMIT and fills AT the level with no
                   slippage. The stop remains a market order and still slips.
                   That asymmetry is real and it is unchanged from every prior
                   lane.

    everything else is untouched — the range, the direction rule, the entry, the
    stop level, the 15:59 flatten, the selection, the costs.

**It is a FULL exit at 1R, not a partial.** That is the literal reading of the
owner's words. "Half off at 1R and let the rest run" is a DIFFERENT rule, it was
measured in ENGINE-5 on the ETF family, and it belongs to its own lane with its
own bar. It may not be added to this one after a number exists.

## The four arms

| arm | what it is |
|---|---|
| **`v2`** | `orb_sip.v2`, no target. The incumbent, and the thing to beat. |
| **`v2_1r`** | the same, with a 1R take-profit. |
| **`c15`** | `orb_sip.v5_15c`, the 15-minute range on a five-minute close, no target. ENGINE-13 measured this at −$13 a trade. |
| **`c15_1r`** | the same, with a 1R take-profit. |

Both entry rules get the target, because "does a 1R cap help" is a question about
the target and not about the entry, and testing it on one entry rule only would
confound the two.

## The bar — X1 to X6, on the verdict window, after costs

Verdict window **2024-01-01 → 2026-08-28**, ENGINE-7's held-back window, so the
comparison is against the incumbent on the incumbent's own ground. Disclosure
window 2016-01-01 → 2023-12-31, contaminated, decides nothing.

Gross before net. Median beside every mean. **Trade count AND independent-day
count beside every interval.** Money per $1,000 risked beside every R.

| id | gate | threshold |
|---|---|---|
| **X1** | sample | ≥ **3,000** trades for every arm |
| **X2** | **the 1R cap helps the incumbent** | mean net R of `v2_1r` minus `v2`, **paired by day**, 95% interval **excludes zero in the challenger's favour** |
| **X3** | **the 1R cap helps the 15-minute rule** | the same for `c15_1r` minus `c15` |
| **X4** | **the best capped arm beats the incumbent outright** | the better of `v2_1r`/`c15_1r` minus `v2`, paired by day, 95% interval excludes zero in the challenger's favour |
| **X5** | sign, per arm | mean **gross** R > 0 **and** mean **net** R > 0 |
| **X6** | era sign agreement | for any arm that clears X2 or X3, mean net R > 0 in **all three** eras (2016-2019, 2020-2023, 2024-2026) |

"Gross" means what it has meant since ENGINE-6 — `gross_r` off the cost-laden
replay, commission excluded and slippage still inside the fills — so the number
is comparable across lanes. The true zero-cost figure is printed beside it and no
gate reads it.

**X2 and X3 are paired by day**, for ENGINE-6's reason: trades on the same
morning are not independent, and the day effect is what a comparison of exit
rules has to remove.

**No leveraged portfolio figure appears in this report**, by pre-registration.

## The verdict, fixed before any count is known

- **1R HELPS** — a capped arm clears X1 and its comparison (X2 or X3) and X4.
- **1R HELPS THE ENTRY, NOT THE STRATEGY** — a capped arm clears X2 or X3 (it
  beats its own uncapped twin) but fails X4 (it still does not beat the
  incumbent). This is a real and distinct outcome and it is named in advance.
- **TARGET HURTS** — a comparison's interval lies entirely the WRONG way, i.e.
  the capped arm measurably loses to its uncapped twin.
- **NO EFFECT** — no interval excludes zero in either direction.
- **INCONCLUSIVE (sample)** — an arm misses X1.

## What the report must contain, whatever the verdict

1. **THE AMPUTATION TABLE, and it is the point of this lane.** For every
   uncapped arm, the distribution of maximum favourable excursion: what share of
   trades ever reached +0.5R, +1R, +2R, +3R, +5R, and **how much of the uncapped
   arm's total profit was earned beyond +1R**. That single number decides whether
   a 1R cap could ever have worked, and it must appear in the plain-English
   summary in one sentence.
2. **Hit rate before and after the cap, per arm.** A 1R target buys a much higher
   win rate. If the win rate rises and the money falls, the report must say so in
   those words — that is the exact trap a target is attractive for.
3. **How many trades were resolved by the stop-before-target assumption**, per
   arm, as a count and a share, with the downward-bias caveat stated if it is
   large.
4. **Exit mix per arm** — stop / target / bell — so the reader can see how often
   the target actually fired.
5. **Realised stop width per arm** — median cents, % of price, ATR units — to
   confirm the cap changed the exit and nothing else.
6. **The era table**, whether or not X6 is reached.
7. **The seventh-reading disclosure and the multiplicity paragraph**, both in the
   plain-English summary, not in a footnote.
8. **The prior, restated, with the outcome against it** — and if the lane fails
   as predicted, the words "this confirms a prior rather than discovering
   something".
9. All four arms in the fixed order `v2`, `v2_1r`, `c15`, `c15_1r`, in every
   table. The winner is not moved to the top and the losers are not shortened.
10. **Proof that the `v2` arm is the incumbent** — it must reproduce ENGINE-7's
    held-back figures (10,545 trades, +0.0324 gross, +0.0199 net, −0.1180 median,
    45.0% hit, 31.6% stopped) and the report must print that table rather than
    assert it.
11. Gross before net; median beside mean; **money per $1,000 risked**; and no
    R-multiple in the plain-English section without a money gloss.
12. **How confident we actually are, and what would change the answer.**

## What may not happen after a number exists

The multiple is not re-tried at 1.5R, 2R, 0.75R, or anything else. No partial
exit is added. No trailing stop, no break-even move, no time-based exit is added.
The window is not widened. The stop-before-target assumption is not relaxed. If
the verdict window disagrees with the disclosure window, the verdict window is
the answer.
