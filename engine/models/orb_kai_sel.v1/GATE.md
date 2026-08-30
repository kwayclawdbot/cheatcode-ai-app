# Pre-registered gate — `orb_kai_sel.v1` (ENGINE-9)

**Written and committed before the first evaluation was run.** This file lands in
the same commit as `engine/kai_score/gates9.py` and `engine/run_engine9.py`, and
that commit is earlier in `git log` than the commit carrying any number produced
by them. ENGINE-1 did it (`2b448ef` before `f70576b`), ENGINE-2 (`b065f88` before
`1662c03`), ENGINE-3 (`1021168` before `a43595d`), ENGINE-4 (`a06611d` before
`19d3234`), ENGINE-5 (`d8e592b` before its report), ENGINE-6 (`2eed597` before
`5fb757f`), ENGINE-7 (`6598f47` before `b14e879`). The ordering is the receipt,
and it is the only part of this programme that cannot be faked afterwards.

## The question

ENGINE-7 established that the SELECTOR is what makes the stocks-in-play ORB
work: picking the day's twenty most abnormally active names beat twenty random
eligible names by +0.0773R a day (95%: +0.0410 to +0.1136), the one gate in that
lane that cleared its own interval by a comfortable margin.

So: **is Kai's existing breakout score a better selector than relative volume?**

Three arms, one candidate pond, identical rules downstream, judged head to head.

## The honest prior, which goes in the report's plain-English summary

Kai's score has a measured track record and it is poor. From
`alert_performance_honest` — the project's own grading of 167 alerts,
2026-05-15 → 07-14 — grouped by `breakout_score`:

| band | n | avg 5d | win 5d |
|---|---|---|---|
| A (80+) | 126 | **−0.56%** | 47.6% |
| B (70-79) | 20 | +2.42% | 35.0% |
| C (60-69) | 9 | −2.74% | 44.4% |
| D (<60) | 12 | −0.63% | **58.3%** |

No monotonic relationship; the top band underperformed the bottom one. **That
measured it as a SWING selector over 5-10 day horizons**, and choosing which
names to day-trade is a different job. The prior is reported, it does not
prejudge the result, and if the new result is also negative it is not buried.

There is a real mechanism by which the score could help: relative volume picks
stocks that are BUSY TODAY, Kai's score picks stocks that are COILED — trend
alignment, squeeze, compression, room to a level. Different properties, possibly
complementary, which is why the third arm exists.

## The three arms

The candidate set is identical for all three: the day's **pool** — the top 1,000
of the eligible universe by 20-day average dollar volume as of the prior close,
ENGINE-6's pool unchanged — narrowed to names with an opening five-minute bar
today and a full 14-session baseline, so that a relative volume exists.

| arm | ranking key |
|---|---|
| **`relvol`** | top 20 by 09:30-09:35 volume over the mean of the same five minutes across the previous 14 sessions, floor 1.0. **The incumbent, and the thing to beat.** |
| **`kai`** | top 20 by Kai's breakout score on the last fully closed daily bar |
| **`both`** | among names with a score AND relative volume ≥ 1.0, rank by each separately and take the 20 smallest rank sums |

Ties broken by symbol. `both` is parameter-free by construction: any "top N by
volume then rank by score" rule needs an N, and an N chosen by us would be a
third variable in a two-variable experiment.

A name with no fresh CheatCode Trend Clouds flip in its last three daily bars has
no Kai score — in production and here — so it cannot be picked by `kai` or
`both`. That is a property of the selector under test, not a handicap applied
to it.

## The model downstream, held fixed

`orb_sip.v2` exactly, unchanged, not re-tuned, and **not** given ENGINE-8's
daily-trend filter, which is a different lane's variable:

- **Range**: 09:30-09:35, high and low.
- **Direction**: the sign of that five-minute candle. Bullish → long only on a
  break above its high; bearish → short only below its low.
- **Entry**: a resting stop order at the range edge, filled at the worse of the
  level and the bar's open, plus slippage.
- **Stop**: the OPPOSITE EXTREME of the same candle. A price, not a distance
  carried from the fill.
- **Target**: none. Flat at 15:59, or the early close on a half day.
- **Sizing** (portfolio arm only): 1% of equity a position, gross capped at 4x,
  a day's positions scaled together when the cap binds, compounded from $100,000.
- **Costs**: $0.005/share/side commission, 1.0 bp adverse slippage. Unchanged for
  the ninth time.

## The window, and it does not move

- **Build**: 2021-08-29 → 2025-08-28. Reported in full, and it is not a verdict.
- **Held back**: 2025-08-29 → 2026-08-28. **The verdict, and nothing else.**

### What is already contaminated about it, stated up front

1. `orb_sip.v2`'s stop width was chosen by reading a sweep of 2016-2023. The
   build window above overlaps that sweep for 2021-2023, so the build window
   inherits the contamination even though nothing in ENGINE-9 was swept.
2. **The held-back year is not virgin.** ENGINE-7's held-back window
   (2024-01-01 → 2026-08-28) contains all of it, and ENGINE-8's did too. This is
   its third reading. Every reading costs some of what makes a held-back window
   worth holding back, and no correction is applied for it here. What is new in
   this lane is ONLY the selector; the downstream rules have been read on this
   year before, and the report must say so.

## The bar — K1 to K5, on the HELD-BACK year, after costs

Gross reported before net. Median printed beside every mean. The money figure per
$1,000 risked printed beside every R.

| id | gate | threshold |
|---|---|---|
| **K1** | sample, per arm | ≥ **3,000** trades in the held-back year |
| **K2** | `kai` beats the incumbent | mean net R of `kai` minus `relvol`, **paired by day**, 95% interval **excludes zero in `kai`'s favour** |
| **K3** | `both` beats the incumbent | the same comparison for `both` |
| **K4** | sign, per arm | mean **gross** R > 0 **and** mean **net** R > 0 |
| **K5** | portfolio, per arm | positive total return **and** annualised Sharpe ≥ **1.0**, net of costs |

K2 and K3 are paired by day, not by trade, for ENGINE-6's reason: trades on the
same day are not independent of each other, and the day effect is exactly what a
selector comparison must remove. K4 and K5 are recorded for all three arms and
decide nothing on their own — an arm can make money and still lose the
comparison, and that is the result, not a technicality.

## Three arms on one held-back year is three chances to look good by luck

Two comparisons are made against the incumbent (K2, K3). With two shots at a 5%
test the chance that at least one clears by chance alone is nearer 10% than 5%.

**The gate is the 95% interval**, carried over from ENGINE-6's R1-R5 unchanged in
kind and in number, because a lane that awards itself an easier or a harder bar
than the ones before it has not been measured against anything. **In addition,
the Bonferroni-corrected 97.5% interval is reported beside every comparison, and
if a comparison clears 95% but not 97.5% the verdict line must say so in the
headline sentence.** That is not a second gate; it is the size of the multiplicity
problem, printed where it cannot be missed.

## The verdict, fixed before any count is known

- **KAI WINS** — `kai` clears K1 and K2.
- **BOTH WINS** — `both` clears K1 and K3, and `kai` does not clear K2 (or clears
  it by a smaller margin).
- **RELVOL HOLDS** — neither K2 nor K3 clears. The incumbent is not displaced.
  **This is a good outcome and is reported as one**: it protects the thing that
  already works from being replaced by a number with no measured edge.
- **INCONCLUSIVE (sample)** — an arm misses K1. That arm is reported
  INCONCLUSIVE and cannot win; the other comparisons still stand on their own.

If both K2 and K3 clear, the arm with the larger paired mean is named and the
other is reported at equal length in the same table.

## What the report must contain, whatever the verdict

Pre-registered so that a good result cannot quietly drop the awkward parts:

1. **The honest prior above, in the plain-English summary, not in a footnote.**
2. **All three arms, in the fixed order `relvol`, `kai`, `both`**, in every
   table. The winner is not moved to the top and the losers are not shortened.
3. The multiplicity paragraph, in the plain-English summary.
4. Gross before net; median beside mean; stop-out share; **the money figure per
   $1,000 risked** — the owner reads money, not R-multiples, and no R-multiple
   or ATR unit appears in the plain-English section without a money gloss.
5. **The porting fidelity statement.** What was reproduced exactly, what could
   not be, and why — specifically: the live scanner's data vendor and adjustment,
   its top-25-by-volume-ratio truncation, its score ≥ 55 floor, its CHOPPY-regime
   gate, its 7-day per-ticker cooldown, and the two defects found in the live code
   (a dead EMA-cloud component, and a scanner that cannot currently run at all).
6. **Which Kai score this is.** `score_cheatcode` is not the number that produced
   the graded alerts in the honest prior; that is a different composite in
   `kai_morning_alerts.py`. The report must say so and must say why that one is
   not reproducible on history.
7. Trade count and date range for both windows, per arm.
8. **How confident we actually are, and what would change the answer.** Not a
   number dressed as certainty.

## What may not happen after a number exists

No threshold in this file moves. No arm is redefined. No fourth arm is added to
rescue a miss. `both` is not re-specified at a different weighting. The score is
not re-ported "more favourably". If the held-back year disagrees with the build
window, the held-back year is the answer and the disagreement is reported as the
finding it is.
