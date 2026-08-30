# Pre-registered gate — `orb_sip.v4_trigger` and `orb_sip.v4_prior` (ENGINE-10)

**Written and committed before the first evaluation was run.** This file, its
twin in `../orb_sip.v4_prior/`, the model in `engine/models/orb_sip_v4.py`, the
runner in `engine/backtest/candle_stop.py`, the gate code in
`engine/models/gates_v4.py` and the tests in
`engine/tests/test_orb_sip_v4.py` all land in the same commit, and that commit
is earlier in `git log` than the commit carrying any number produced by them.
ENGINE-1 did it (`2b448ef` before `f70576b`), ENGINE-2 (`b065f88` before
`1662c03`), ENGINE-3 (`1021168`), ENGINE-4 (`a06611d`), ENGINE-5 (`d8e592b`),
ENGINE-6 (`2eed597` before `5fb757f`), ENGINE-7 (`6598f47` before `b14e879`),
ENGINE-8 (`6dc2a50` before `2435728`). The ordering is the receipt and it is
the only part of this programme that cannot be faked afterwards.

Both arms are gated by this one file. They are two readings of one sentence,
they are run once, together, and neither may be dropped after a number exists.

## The owner's rule, verbatim

> *"we should only take an entry on the breakout of orb, stop at the low of
> 5min candle before the entry candle (if bullish) and top if bearish. if
> stopped out we take the loss"* — 2026-08-29

`orb_sip.v4` is `orb_sip.v2` with **one rule changed**: the stop. Universe,
selection, opening range, direction, entry mechanics, hold-to-the-close exit,
1% sizing, 4x leverage cap, cost model and data snapshot are untouched, and
ENGINE-6's `selection.json.gz` is reused byte for byte so v2 and both v4 arms
trade the same candidate symbol-days.

**No daily-trend filter.** That is ENGINE-8's variable, it returned a null, and
mixing it in here would make this lane a measurement of two changes at once.

**"If stopped out we take the loss" is CONFIRMED, not implemented.** It is
already v2's behaviour: one decision a day, one stop, no re-entry, no move to
breakeven, no partial, no second attempt. Nothing was added for it.

## The ambiguity, and why two arms rather than a guess

"the 5min candle before the entry candle" has cost this programme two rounds
already — ENGINE-4 read it as the trigger candle, the owner corrected it to the
one before, and ENGINE-5 measured both. It is ambiguous again here, because
under v2's mechanics the entry is a resting stop order filled INTRABAR, so the
five-minute candle the fill happens in is both "the breakout candle" and "the
entry candle". Both readings are therefore pre-registered as arms and both are
reported, whatever they say:

| arm | stop |
|---|---|
| **`orb_sip.v4_trigger`** | the extreme of the five-minute candle the fill happened in — **the literal reading** if "the entry candle" is the next candle along, which is what a trader entering at the open of the bar after the breakout bar closes means |
| **`orb_sip.v4_prior`** | the extreme of the five-minute candle immediately BEFORE the one the fill happened in — the owner's earlier *"previous 5min h/l"* reading, the one ENGINE-5 measured and preferred |

Long stops at the low of that candle, short at its high, per the spec.

**There is no third reading.** No sweep, no tuning, no candle length other than
five minutes, no floor or cap on the resulting stop distance however small it
turns out to be. If both arms fail, the answer is not `v5` at a third reading.

### The causality call, recorded as a call

The breakout candle is still forming at the moment of the fill, so its final
low is in the future. The trigger arm's stop is therefore **that candle's
extreme as it stood at the fill minute** — the low over the candle's one-minute
bars from the candle's start through and including the bar the order filled on.
That is what a trader can see when the order is placed; it is fixed then and
never moved. It is enforced structurally: the resolver receives a `BarView`
truncated at the fill bar, which holds no reference to the parent series.

The alternative — waiting for the breakout candle to close and using its final
low — is a DIFFERENT ENTRY (close confirmation, not a resting stop), and this
lane holds the entry fixed on purpose. No number here speaks to it.

The prior arm's candle is complete by construction. The earliest possible fill
minute is 09:35, so its candle is at worst the 09:30-09:35 opening range
itself. **On the ~62% of v2 trades that fill inside 09:35-09:40, the prior arm
is therefore identical to v2**; the report must state the realised share.

## The prior this lane is running against, which must be in the summary

ENGINE-6 replicated the published stocks-in-play ORB with a stop at 10% of the
14-day ATR — a median 12.4 cents, about a sixth of the width of the very candle
the trade is defined by. **It was hit on 90.1% of trades and returned
-0.635R.** The [post-mortem](../../reports/orb_sip.v1.polygon-sip-v1.diagnostics.md)
swept that one number and the sign of the entire result moves with it:

| stop | mean gross R | stopped |
|---|---|---|
| 0.10x ATR (the published stocks-paper reading) | **-0.635** | 90.1% |
| 0.25x ATR | -0.073 | 70.5% |
| 0.50x ATR | +0.005 | 46.3% |
| 1.00x ATR | +0.012 | 19.0% |

v2's opening-range stop is a median 134 cents, about **0.75 ATR**, stopped on
**31.6%** of held-back trades, and it is what turned this model from badly
losing to roughly breakeven. **Both v4 arms are TIGHTER than v2's.** A
candle-relative stop is a real trader's rule and is not the same object as a
fraction of an ATR, so it may still work — but this lane is moving back toward
the setting that failed and the report says so before it says anything else.

## Windows

| | |
|---|---|
| snapshot | `polygon-sip-v1`, unchanged, **not re-downloaded** |
| build | **2021-08-29 → 2025-08-28** — four years, nothing tuned on it |
| verdict | **2025-08-29 → 2026-08-28** — twelve months, read once |

ENGINE-8's window, unchanged and **not widened**. If an arm comes in thin the
answer is INCONCLUSIVE, never a longer window.

**This held-back year is not virgin data and no correction is applied for it.**
ENGINE-7 measured on 2024-01-01 → 2026-08-28, which contains it; ENGINE-8
evaluated on it directly. **Two arms on an already-used held-back year** is
about a 10% chance that one clears zero by luck rather than 5%. Both are
reported regardless and neither is led with.

## The bar — S1-S5 (trigger) and P1-P5 (prior), on the HELD-BACK window, after costs

Gross reported before net. Median printed beside every mean. Money per $1,000
risked printed beside every R, because the owner reads money.

| id | gate | threshold |
|---|---|---|
| **S1 / P1** | sample | >= **750** trades in the held-back year |
| **S2 / P2** | sign | mean **gross** R > 0 **and** mean **net** R > 0 |
| **S3 / P3** | direction beats a coin flip | paired against the matched control — same symbols, days, decision minute and stop reading, direction flipped — gross, 95% interval **excludes zero** in the model's favour |
| **S4 / P4** | the filter is the thing | mean net R of the stocks-in-play arm minus the identical rules on a random 20 eligible names a day, paired by day, 95% interval **excludes zero** in the model's favour |
| **S5 / P5** | portfolio | the 1%-risk / 4x-capped portfolio has positive total return **and** an annualised Sharpe >= **1.0**, net of costs |

Every threshold is ENGINE-7's H1-H5 and ENGINE-8's T1-T5, unchanged in kind and
in number. The 750 floor is ENGINE-8's, carried over for its arithmetic reason
(twenty picks over ~251 sessions caps the year near 5,000 trades) and fixed
before any count is known. It buys a 95% half-width near +/-0.086R: enough to
see an edge worth trading, deliberately not enough to resolve v2's +0.02R.
**A passed S2/P2 whose interval spans zero settles nothing and the report must
say so.**

### The verdict, fixed before any count is known

- **CONFIRMED OUT OF SAMPLE** — all five pass.
- **PARTIAL** — 1 and 2 pass (it makes money out of sample, gross and net) but
  at least one of 3, 4, 5 fails. The headline must name which failed and say
  what is therefore NOT established. **PARTIAL is not a pass and authorises
  shipping nothing.**
- **FAILED** — 2 fails. It did not make money out of sample. Report it plainly
  and stop.
- **INCONCLUSIVE (sample)** — 1 missed and nothing else is read.

## What the report must contain, whatever the verdicts

Pre-registered so a good number cannot quietly drop the awkward parts.

1. **The plain-English summary comes first and carries no R-multiples or ATR
   units without a plain-money gloss.** Money per $1,000 risked, and the share
   of trades stopped out, for each arm.
2. **The ENGINE-6 prior, in the summary and not in a footnote**: 10% of ATR was
   hit on 90.1% of trades and lost -0.635R; the sign flips with stop width;
   these arms are tighter than v2's. **If an arm's stop-out share is >= 85%,
   the report must say IN THE SUMMARY that the ENGINE-6 diagnosis is
   repeating.**
3. **Which arm is the literal reading of the owner's words**, stated plainly,
   and the realised stop width of each **in cents, in percent of price and in
   ATR units**, beside v2's on the same trades — so the ambiguity is closed
   permanently and the geometry is comparable.
4. **The full five-year figure beside the held-back one, for both arms.**
   Across the full window v2 and v3 return about -$7 per $1,000 risked and are
   positive in only 2 of 6 calendar years, and the held-back year is the good
   one. A reader who sees only the verdict year must be told that in the same
   breath.
5. Gross before net; median beside mean; the matched coin flip; the random-20
   control; the share of prior-arm trades on which the arm is identical to v2;
   trade counts and date ranges for both windows.
6. **How confident we actually are, and what would change the answer.** Not a
   number dressed as certainty.

## What may not happen after a number exists

No threshold in this file moves. No parameter of either model changes. No third
stop reading is added. No candle length is swept. No arm is dropped. If the
held-back year disagrees with the build window, the held-back year is the
answer and the disagreement is reported as the finding it is.
