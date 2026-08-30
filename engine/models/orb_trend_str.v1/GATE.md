# Pre-registered gate — `orb_trend_str.v1` (ENGINE-11)

**Written and committed before the first evaluation was run.** This file lands in
the same commit as `engine/strength/` (the measure, the selector, the gate code),
`engine/models/orb_trend_str.py`, their tests, and the runner
`engine/run_engine11.py`. That commit is earlier in `git log` than the commit
carrying any number produced by them. ENGINE-1 did it (`2b448ef` before
`f70576b`), ENGINE-2 (`b065f88` before `1662c03`), ENGINE-3 (`1021168` before
`a43595d`), ENGINE-4 (`a06611d` before `19d3234`), ENGINE-5 (`d8e592b` before its
report), ENGINE-6 (`2eed597` before `5fb757f`), ENGINE-7 (`6598f47` before
`b14e879`), ENGINE-8 (`6dc2a50` before `2435728`), ENGINE-9 (`6f19f50` before
`69c7efc`). The ordering is the receipt, and it is the only part of this
programme that cannot be faked afterwards.

## The question

The owner, 2026-08-29: *"what about busiest stocks + trend strength. If stock is
trending in the direction of the orb"*.

Keep the selector that has actually been measured to work — opening relative
volume, which won ENGINE-9 decisively against Kai's own score (+$17 a trade vs
−$54, with the coin toss at −$37) — and add **trend strength**: prefer names
already going hard the way the opening range broke.

## Read this before the numbers

### 1. ENGINE-8 already tested a trend filter on this exact base, and it failed

It must be said here rather than in a footnote, because it is the prior this
lane has to beat and the failure mode it has to be checked against.

- The gate discarded **75%** of trades.
- On the build window the **discarded trades beat the kept ones by $47 per
  $1,000 risked** (−0.0470R, 95%: −0.0884 to −0.0057) — the interval excluded
  zero the wrong way.
- On the two-way-break mornings it was aimed at, it kept trades returning
  −$723 per $1,000 and removed trades returning −$729. No discrimination at all.
- Roughly half of all stock-days had no confirmed daily structure, so the filter
  was mostly a sit-out rule.

**This lane is not that.** ENGINE-8's trend was BINARY — up, down, or none — and
was used as a gate. This one is a CONTINUOUS strength measure and its primary
use is to RANK. The report must compare the two explicitly and say whether a
graded measure succeeds where the binary gate failed, or reproduces the null.

### 2. This is the held-back year's FIFTH reading

ENGINE-7 (held-back window 2024-01-01 → 2026-08-28), ENGINE-8, ENGINE-9 and
ENGINE-10 all touched windows containing 2025-08-29 → 2026-08-28. Nothing in
this lane was fitted on it — no parameter is swept and the two free numbers are
fixed in this file before any evaluation — but four previous lanes have looked at
it, and every look costs some of what makes a held-back window worth holding
back. No correction is applied. **The honest framing, fixed here in advance, is
"suggestive, not conclusive", and no result in this lane may be reported more
strongly than that.** The plain-English summary must say the words "fifth
reading".

### 3. Three arms on one held-back year is three chances to look good by luck

G2, G3 and G4 are three 95% intervals. With three shots at a 5% test the chance
that at least one clears by chance alone is nearer 14% than 5%. **The gate stays
the 95% interval**, unchanged in kind and in number from ENGINE-6 through -9,
because a lane that awards itself an easier or a harder bar than the ones before
it has not been measured against anything. The Bonferroni-corrected 98.33%
interval is printed beside every comparison. That is not a second gate; it is the
size of the multiplicity problem, printed where it cannot be missed.

### 4. The window is the owner's five years and it is not widened

*"only use data from past 5 years."* Build 2021-08-29 → 2025-08-28, verdict
2025-08-29 → 2026-08-28. If an arm comes in thin the answer is **INCONCLUSIVE**,
never a wider window.

## Trend strength — the exact definition, before it was computed on anything

Read at the **last fully closed daily bar** before the session (index `k`; the
session's own bar is `k+1` or later). Never today's forming bar. Three
components, all already in this codebase, each scaled to about [−1, +1] so that
no one of them silently dominates the average:

| part | definition | where it comes from |
|---|---|---|
| **d** distance | `clip((close_k − EMA20_k) / ATR14_k, −3, +3) / 3` | `primitives/trend.py::ema`, `primitives/structure.py::atr` |
| **s** slope | `clip((EMA20_k − EMA20_{k−10}) / ATR14_k, −3, +3) / 3` | the same EMA, ten sessions apart |
| **p** persistence | `2 × (share of the last 20 closed bars that closed up) − 1` | plain closes |

    STRENGTH = (d + s + p) / 3,  in [−1, +1]

**Sign is direction; magnitude is strength.** **Directional strength** for a
trade is `STRENGTH × (+1 long, −1 short)` — how hard the daily chart was already
going the way the range broke. That is the number every arm in this lane orders,
cuts or bins on.

- **EMA20** is the fast leg of `primitives/trend.py`'s `trend_state`, which this
  programme has used since ENGINE-1. "A medium daily EMA" is what the brief
  asked for and this is the one already written down.
- **ATR14** is the same 14-day true-range average `sip/universe.py` uses for
  eligibility and the unit ENGINE-6 and ENGINE-7 reported stop widths in.
  Dividing by it makes every component scale-free.
- **The 10-session slope window** is the one number not inherited from an
  existing file: half the EMA's own span, two trading weeks. Declared here, not
  swept.
- **The ±3 ATR clip** stops one gapping name swamping the average. The report
  states how often it binds.
- A symbol with fewer than **30** closed daily bars, or no usable ATR, has **no
  strength**. Not a zero. "Not measured" is not "neutral", and the report says
  how many symbol-days that is.

**Lookahead treatment, structural not procedural.** `strength_at()` takes a
`BarView`, which holds read-only slices truncated at its own index and no
reference to its parent series, so the bar being traded is unreachable from
inside it. `tests/test_trend_strength.py` runs the poisoned-future and
amputated-future attacks against it and against a deliberately cheating
implementation, which must be caught.

**The daily bars are the split-adjusted ones ENGINE-9 built** (`kai_score/bars.py`,
`DailyBook`), not the unadjusted grouped bars ENGINE-8 read. A 2-for-1 split on
an unadjusted series is a 50% one-day collapse, which would drive an EMA
distance, a slope and an up-close count for months; ENGINE-8 disclosed that
exposure as an upper bound and this lane removes it instead. Splits strictly at
or before the as-of date, never after.

## The three arms

The candidate set is identical for all three: the day's **pool** — the top 1,000
of the eligible universe by 20-day average dollar volume as of the prior close,
ENGINE-6's pool unchanged — narrowed to names with an opening five-minute bar
today and a full 14-session baseline, so a relative volume exists.

| arm | what it does |
|---|---|
| **`baseline`** | `orb_sip.v2` as-is: the top 20 by opening relative volume, floor 1.0. **The incumbent, and the thing to beat.** |
| **`rank`** | the day's **40** busiest by relative volume, re-ordered by directional trend strength, top 20 traded. A re-ordering, not a reduction: 20 trades a day, same as the baseline. |
| **`gate_strong`** | the baseline's twenty, traded **only** when directional strength ≥ **+0.20**. A strict subset of the baseline's trades. |

### The two free numbers, and why they are these numbers

**`POND_K = 40`.** A pond equal to the pick count makes re-ordering a no-op — the
same twenty names in a different order is the same twenty trades, and the
portfolio scales a day's positions together when the leverage cap binds, so even
that changes nothing. Forty is the smallest pond in which the owner's question
can be answered at all, and it keeps every pick inside the top ~4% of a ~985-name
candidate list, so the busy leg stays hard. **Not swept. One value, tested once.**

**`GATE_STRENGTH = +0.20`.** Directional strength runs on [−1, +1] by
construction. +0.20 is "meaningfully trending the way the range broke", set a
priori rather than read off a distribution — no percentile of the build window
was consulted, because consulting one would make the threshold a fitted
parameter. The decile curve is reported beside it so a reader can see exactly
what every other cut would have done. **Not swept. One value, tested once.**

### Ties and unrankable names, decided in advance

Ties are broken by symbol everywhere. In the `rank` arm two kinds of name cannot
be ordered on directional strength and both fall to the back of the pond in
relative-volume order rather than being dropped — dropping them would change the
trade count, and this arm is specified to hold it:

- **no direction** — the opening candle closed exactly where it opened; the model
  would skip it anyway (`skip_doji_opening_candle`);
- **no strength** — fewer than 30 closed daily bars, or no usable ATR.

### What the `rank` arm is allowed to know at 09:35

Relative volume over the previous fourteen sessions' opening five minutes; the
open and close of today's 09:30-09:35 bar, read from the `open5` tree that holds
only 09:30-10:30 and never the afternoon; and daily bars through the prior close.
Nothing else. The break direction is a 09:35 fact, which is why the selector may
use it. `tests/test_strength_selection.py` runs the poisoned-future and
amputated-future attacks against `select_day`, plus the attack this lane needs —
delete the selection day's own session after 09:35 and require a byte-identical
selection — and a deliberately cheating selector must be caught by all of them.

The model recomputes the same candle from one-minute bars when it trades, and the
five-minute aggregate and the one-minute prints can disagree at the edges. **The
report must count how often the two directions differ.**

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
- **Sizing** (portfolio rows only): 1% of equity a position, gross capped at 4x,
  a day's positions scaled together when the cap binds, compounded from $100,000.
- **Costs**: $0.005/share/side commission, 1.0 bp adverse slippage. Unchanged for
  the eleventh time.

## The bar — G1 to G6, on the HELD-BACK year, after costs

Gross reported before net. Median printed beside every mean. The money figure per
$1,000 risked printed beside every R, because that is the unit the owner reads.

| id | gate | threshold |
|---|---|---|
| **G1** | sample, per arm | ≥ **3,000** trades for `baseline` and `rank`; ≥ **750** for `gate_strong` |
| **G2** | `rank` beats the incumbent | mean net R of `rank` minus `baseline`, **paired by day**, 95% interval **excludes zero in the challenger's favour** |
| **G3** | `gate_strong` beats the incumbent | the same comparison for `gate_strong` |
| **G4** | **the gradient** | inside the `baseline` arm, the mean net R of the day's stronger half by directional strength minus its weaker half, paired by day, 95% interval **excludes zero** — in EITHER direction |
| **G5** | sign, per arm | mean **gross** R > 0 **and** mean **net** R > 0 |
| **G6** | portfolio, per arm | positive total return **and** annualised Sharpe ≥ **1.0**, net of costs |

**G2 and G3 are paired by day, not by trade**, for ENGINE-6's reason: trades on
the same morning are not independent of each other, and the day effect is exactly
what a comparison of selectors has to remove.

**G4 decides no arm and it is the most important line in the report.** It is
two-sided on purpose: a gradient pointing the wrong way is as much of an answer
as one pointing the right way, and "no gradient" is a third answer that is worth
more than any verdict. G4 is the only gate in this programme that can pass on a
negative number, and the report must state its sign in words.

`gate_strong`'s floor is lower than the other two because it removes trades by
construction; 750 is ENGINE-8's number, set from power — at n=750 the 95%
half-width is about ±0.086R, enough to separate a per-trade edge worth trading
(≥0.10R, i.e. ≥$100 per $1,000 risked) from zero, and deliberately not enough to
resolve a v2-sized +0.02R. **A passed G5 whose interval spans zero therefore
settles nothing, and the report must say so rather than let a positive mean stand
in for a measured edge.**

## The verdict, fixed before any count is known

- **RANK WINS** — `rank` clears G1 and G2.
- **GATE WINS** — `gate_strong` clears G1 and G3, and `rank` does not clear G2
  (or clears it by a smaller margin).
- **BASELINE HOLDS** — neither G2 nor G3 clears. The incumbent is not displaced.
  **This is a good outcome and is reported as one**: it protects the one
  component this programme has measured as working from being replaced by a
  number that has never been measured.
- **INCONCLUSIVE (sample)** — an arm misses G1. That arm is reported
  INCONCLUSIVE and cannot win; the other comparisons still stand on their own.

If both G2 and G3 clear, the arm with the larger paired mean is named and the
other is reported at equal length in the same table.

## What the report must contain, whatever the verdict

Pre-registered so that a good result cannot quietly drop the awkward parts, and
so a bad one cannot be padded.

1. **THE CURVE.** The relationship between directional trend strength and outcome
   **across deciles** — n, mean and median net R, money per $1,000, hit rate,
   stop-out share and median stop width for each decile — computed on the
   `baseline` arm's trades. **If there is no gradient the report must say so
   plainly, in the plain-English summary, in one sentence.** That sentence
   answers the owner's question more completely than any verdict.
2. **REALISED STOP WIDTH PER ARM** — median cents, percent of price, ATR units,
   commission as a share of risk, and the stop-out share. ENGINE-9's Kai arm lost
   because coiled names open quietly, giving a narrow opening candle and
   therefore a tight stop, and tight stops lose. Strongly-trending names may do
   the same. **If the strength ranking narrows the stop, that IS the explanation
   and the report must state it in those words**, not leave it for the reader to
   spot.
3. **How many trades `gate_strong` removes, and what those removed trades did.**
   If the removed trades' mean net R is **above** the kept trades', the report
   must say so in those words, whatever the verdict says. That is ENGINE-8's
   failure mode and it is the specific thing to check for.
4. **The ENGINE-8 comparison**, explicitly: does a graded strength measure
   succeed where the binary structure gate failed, or reproduce the null.
5. **The fifth-reading disclosure and the multiplicity paragraph**, both in the
   plain-English summary, not in a footnote.
6. All three arms in the fixed order `baseline`, `rank`, `gate_strong`, in every
   table. The winner is not moved to the top and the losers are not shortened.
7. Gross before net; median beside mean; stop-out share; **money per $1,000
   risked** — and **no R-multiple or ATR unit in the plain-English section without
   a money gloss.**
8. **The random-20 coin toss** replayed on this window, as the reference point
   that makes a losing arm readable.
9. **Proof that the incumbent is the incumbent** — the `baseline` arm's picks
   must be the same names ENGINE-6 wrote to `selection.json.gz`, and the report
   must print the match rate rather than assert it.
10. How different the three lists actually are: picks a day, overlap, and what
    kind of name each arm selects (median relative volume, median strength).
11. The count of symbol-days with no measurable strength, and how often the ±3
    clip binds.
12. The direction-disagreement count between the five-minute aggregate the
    selector reads and the one-minute reconstruction the model trades.
13. Trade count and date range for both windows, per arm.
14. **How confident we actually are, and what would change the answer.** Not a
    number dressed as certainty.

## What may not happen after a number exists

No threshold in this file moves. `POND_K` is not re-tried at another value.
`GATE_STRENGTH` is not re-tried at another value. The strength definition is not
re-weighted, no component is dropped or added, no second definition is tried. No
fourth arm is added to rescue a miss. The window is not widened, in either
direction, for any reason. If the held-back year disagrees with the build window,
the held-back year is the answer and the disagreement is reported as the finding
it is.
