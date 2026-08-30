# Pre-registered gate — `orb_sip.v3` (ENGINE-8)

**Written and committed before the first evaluation was run.** This file lands
in the same commit as `engine/models/orb_sip_v3.py`, `engine/sip/daily.py`,
their tests, the gate code in `engine/models/gates.py`, the sibling gate
[`../orb_sip.v3_15m/GATE.md`](../orb_sip.v3_15m/GATE.md), and the runner
`engine/run_engine8.py`. That commit is earlier in `git log` than the commit
carrying any number produced by them. ENGINE-1 did it (`2b448ef` before
`f70576b`), ENGINE-2 (`b065f88` before `1662c03`), ENGINE-3 (`1021168` before
`a43595d`), ENGINE-4 (`a06611d` before `19d3234`), ENGINE-5 (`d8e592b` before
its report), ENGINE-6 (`2eed597` before `5fb757f`), ENGINE-7 (`6598f47` before
`b14e879`). The ordering is the receipt, and it is the only part of this
programme that cannot be faked afterwards.

## Read this before the numbers: the held-back year is not virgin data

Three things must be said before a single result exists, because after one
exists they will sound like excuses.

**1. The idea was formed by looking at a window that overlaps the verdict
window.** ENGINE-7's diagnosis — that its whole deficit against the coin flip
came from the mornings on which both ends of the opening range broke — was
measured on 2024-01-01 → 2026-08-28. The verdict window here,
2025-08-29 → 2026-08-28, sits **inside** that span. The filter was not fitted on
it: no parameter was swept, no threshold was chosen by looking, and the trend
definition is ENGINE-2's, written in 2026-08 for a different model on a
different universe with different numbers, and reused without a single change.
But the *decision to try a trend filter at all* was taken after looking at data
that includes this year. That is a weaker form of contamination than a swept
parameter and it is not nothing. **The honest framing, fixed here in advance, is
"suggestive, not conclusive", and no result in this lane may be reported more
strongly than that.**

**2. The window was chosen by the owner, deliberately, and is not to be
widened.** *"only use data from past 5 years."* Everything before 2021-08-29 is
out. The cache still holds 2016 onward and it is simply not the subject. If the
held-back year turns out too thin to conclude, the answer is **INCONCLUSIVE**;
it is never a wider window.

**3. This is the third look at data overlapping the ENGINE-6/7 held-back
window.** `orb_sip.v1` spent one, `orb_sip.v2` spent a second, and this spends a
third on the last twelve months of it. Every look costs some of what makes a
held-back window worth holding back. No correction is applied. It is stated.

## One spec, one gate, one verdict — and two models, disclosed

The owner added a 15-minute variant after this lane opened, so ENGINE-8
evaluates **two** models on **one** held-back year:

| model | opening range | everything else |
|---|---|---|
| `orb_sip.v3` | 09:30-09:35 | identical |
| [`orb_sip.v3_15m`](../orb_sip.v3_15m/GATE.md) | 09:30-09:45 | identical |

With two models and two 95% intervals, the chance that at least one clears zero
by luck is about **10%, not 5%**. No multiplicity correction is applied to the
intervals. Instead: **both outcomes are reported whatever they are, the report
does not lead with whichever did better, and a pass on one beside a fail on the
other is to be read as weak evidence rather than as a discovery.**

Beyond that there is no sweeping and no tuning. One trend definition, taken as
already written. No second trend definition, no stop change, no target, no
timeframe sweep, no variant added to rescue a miss. `run_engine8.py` contains no
parameter to vary, by construction, exactly as `run_engine7.py` did not.

## The model

`orb_sip.v2` in every respect — same snapshot, same survivorship-free universe,
same pool, same selection reused byte for byte from ENGINE-6, same 5-minute
opening range, same entry on the breakout in the direction of the first candle,
same stop at the opposite extreme of that candle, same hold-to-close exit, same
costs, same 1% sizing and 4x gross cap — **plus one gate**:

> **The daily trend must agree with the breakout direction.** Long breakouts
> only when the daily trend is up, short breakouts only when it is down.
> Sideways, or opposing, is **NO TRADE** — not a smaller trade.

- **The trend definition is `primitives/htf.py`'s `daily_structure`**, at
  ENGINE-2's numbers: `pivot_n=2`, `lookback=120`. Confirmed higher high AND
  higher low with the defining swing low unbroken; the mirror for down;
  everything else is "none". Reused, not rewritten, and not re-parameterised.
- **It is read on the LAST FULLY CLOSED DAILY BAR** before the session — the
  prior session's daily bar. Never the forming bar. This is enforced by
  construction rather than by care: `sip/daily.py` builds the label for day *D*
  from `view(k-1)`, and a `BarView` cannot reach past its own index.
- **The daily bars come from the grouped files already in the snapshot** —
  every ticker that traded, unadjusted, the same tape the eligibility filter was
  built from. Nothing is downloaded.

### The one known defect in the trend input, stated in advance

The daily bars are **unadjusted**, for the reason `sip/config.py` gives. A stock
that split inside the 120-day lookback shows a step in its own history, and
swing structure read across that step is wrong until the step leaves the window.
The report must print the count of selected symbol-days whose lookback window
contains a single-session close-to-close move of 40% or more — an **upper**
bound on the exposure, because genuine 40% days are counted too — so the size of
the problem is on the page rather than left to the reader's imagination.

## The bar — T1 to T5, on the HELD-BACK window, after costs

Gross reported before net. Median printed beside every mean. Money per $1,000
risked printed beside every R, because that is the unit the owner reads.

| id | gate | threshold |
|---|---|---|
| **T1** | sample | ≥ **750** trades in 2025-08-29 → 2026-08-28 |
| **T2** | sign | mean **gross** R > 0 **and** mean **net** R > 0 |
| **T3** | direction beats a coin flip | paired against the matched control (same symbols, days, decision minutes and stop geometry, direction drawn by the same hash ENGINE-6 and -7 used), gross, 95% interval **excludes zero** in the model's favour |
| **T4** | the filter is the thing | mean net R of the stocks-in-play arm minus the same rules — trend gate included — on twenty random eligible names a day, paired by day, 95% interval **excludes zero** in the model's favour |
| **T5** | portfolio | the 1%-risk / 4x-capped portfolio has positive total return **and** an annualised Sharpe ≥ **1.0**, net of costs |

**T3 is the gate this lane exists for.** It is the one `orb_sip.v2` failed
(−0.1317R, 95%: −0.1493 to −0.1141), and the trend filter is precisely a rule
for choosing a side. If the filter works, it shows up here.

### Why the sample floor moved, and why nothing else did

T2 to T5 are ENGINE-7's H2-H5 unchanged in kind and in number. T1 is not, and
the reason is arithmetic rather than preference: twenty picks a session over the
~251 sessions of a twelve-month window is a **ceiling** of about 5,000 trades
before a single filter is applied, so carrying ENGINE-7's 5,000-trade floor
across would return INCONCLUSIVE by construction whatever the model did.

750 is set from power instead. Per-trade net R in this family has a standard
deviation near 1.2R (ENGINE-7's ±0.0224 half-width on n=10,545). At n=750 the
95% half-width is about **±0.086R** — enough to separate a per-trade edge worth
trading (≥0.10R, i.e. ≥$100 per $1,000 risked) from zero, and deliberately **not**
enough to resolve a v2-sized +0.02R. **A passed T2 whose interval spans zero
therefore settles nothing, and the report must say so rather than let a positive
mean stand in for a measured edge.** That is the same trap ENGINE-7 fell into
and disclosed; it is disclosed here before it happens.

Lowering a sample floor is a real weakening and is named as one. It is not
accompanied by a lowering of anything else.

## The verdict, fixed before any count is known

- **CONFIRMED OUT OF SAMPLE** — T1-T5 all pass.
- **PARTIAL** — T1 and T2 pass but at least one of T3, T4, T5 fails. The report
  headline must name which failed and say plainly what is therefore NOT
  established. **PARTIAL is not a pass and does not authorise shipping
  anything.**
- **FAILED** — T2 fails. It did not make money out of sample. Report it plainly
  and stop.
- **INCONCLUSIVE (sample)** — T1 missed and nothing else is read. **The window is
  not widened to escape this outcome.**

## What the report must contain, whatever the verdict

Pre-registered so that a good result cannot quietly drop the awkward parts, and
so that a bad one cannot be padded.

1. **The both-sides-broke subset, reported separately, before and after the
   filter.** That is ENGINE-7's diagnosed failure and the entire reason this
   filter is being tried. The report must say whether the filter picks the right
   side on those mornings. **If it fixes only that, that is still the most
   useful sentence available and it goes in the plain-English summary.**
2. **How many trades the filter removes, and what those removed trades did.** A
   filter that discards winners is not helping even if the average of what is
   left rises. If the removed trades' mean net R is **above** the kept trades',
   the report must say so in those words, whatever the verdict says.
3. **Whether any benefit survives once the both-sides-broke mornings are
   excluded** — a genuine directional edge, or only a tie-breaker.
4. **The comparison with ENGINE-3 and ENGINE-5.** Both tested 1-hour and 4-hour
   trend filters and found nothing measurable — on a fixed 32-name basket with a
   stop now known to be wrong, i.e. a filter on a broken base. That null does
   not settle this and is not irrelevant either. The report states both and does
   not use one to dismiss the other.
5. Gross before net; median beside mean; the stop-out share; the matched coin
   flip; the random-20 control; both windows in full; **and the money figure per
   $1,000 risked next to every headline R.**
6. Trade count and date range for both windows, and the count of trades the
   filter removed.
7. **The multiplicity disclosure**: two models, one held-back year, ~10% chance
   one clears by luck. Both outcomes reported, neither led with.
8. **The unadjusted-daily-bar disclosure** and its upper-bound count.
9. **How confident we actually are, and what would change the answer.** Not a
   number dressed as certainty.

## What may not happen after a number exists

No threshold in this file moves. No parameter of the model changes. No second
trend definition is tried. The window is not widened, in either direction, for
any reason. No variant is added to rescue a miss. If the held-back year
disagrees with the build window, the held-back year is the answer and the
disagreement is reported as the finding it is.
