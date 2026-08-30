# Pre-registered gate — `orb_sip.v9_15c_prior` (ENGINE-17)

**Written and committed before the evaluation ran.** This file lands in the same
commit as `engine/models/orb_sip_15c_prior.py`, `engine/models/gates17.py`,
`engine/run_engine17.py` and their tests, and that commit is earlier in
`git log` than the commit carrying any number they produce.

## The question

The owner, 2026-08-30, with a worked example:

> "the stop should be the bottom of five minute candlestick preceding the
> trigger candle. So the trigger candle was 105 to 106, and the five minute
> candlestick before that was 103 to 105, then the stop should be at 103."

`orb_sip.v5_15c` (ENGINE-13) with **one rule changed** — the stop — and it is
aimed at the exact reason ENGINE-13 failed.

## Why this is not simply a repeat, and where it IS one

**The stop rule itself is not new.** ENGINE-10 measured it on the FIVE-minute
opening range with a resting-order entry and pre-registered both readings of
"the candle before the entry candle":

| model | the stop | × ATR | stopped out | per $1,000 | verdict |
|---|---|---|---|---|---|
| `orb_sip.v4_trigger` | the breakout candle itself | 0.17 | **85.8%** | **−$605** | FAILED |
| `orb_sip.v4_prior` | the candle BEFORE it | 0.51 | 44.3% | +$15 | PARTIAL |
| `orb_sip.v2` | opposite extreme of the range | 0.72 | 31.3% | +$17 | ENGINE-7's PARTIAL |

**The owner's worked example settles the ambiguity in favour of the reading that
did not fail** — 105→106 is the trigger candle, 103→105 is "the candle before
that", so the stop is the PRECEDING candle's extreme. Only that reading is built.
The trigger-candle reading is not resurrected and no arm here carries it.

**What IS new is the combination.** ENGINE-13 paired the 15-minute range and the
five-minute close confirmation with the incumbent's *range-extreme* stop, which
put the stop a median 177 cents away — 0.99 ATR against the incumbent's 0.72 —
and it lost $13 per $1,000. Its report's diagnosis: the confirmation "buys a
better stop and sells a worse price, and the price is the bigger number".
Waiting for a close moves the ENTRY further from the far side of the range, so
the risk denominator inflates. **This lane keeps the confirmed entry and brings
the stop to meet it.** That pairing has never been measured.

## The prior, written down before the run

Two forces point in opposite directions and the gate does not pretend to know
which wins.

**For it**: it attacks ENGINE-13's measured failure directly. If the diagnosis
was right, shrinking the risk denominator without changing the entry should
recover most of the gap to the incumbent.

**Against it**: every tightening of the stop in this programme has cost money.
ENGINE-6 at 0.10 ATR lost $723 with 90.1% stopped out; ENGINE-10's trigger arm
at 0.17 ATR lost $605 with 85.8% stopped out; ENGINE-10's prior arm at 0.51 ATR
made $15 against the incumbent's $17. **The direction of travel is again toward
the setting that has failed twice**, and the number to watch is the stop-out
share.

**The pre-registered expectation is therefore a stop between 0.4 and 0.7 ATR and
a result statistically indistinguishable from the incumbent** — a third PARTIAL
in the same family — rather than either a win or a blow-up. If the stop lands
below 0.3 ATR or the stop-out share exceeds 60%, ENGINE-6's diagnosis is
repeating and the report must say so in those words.

## The three arms

All use ENGINE-6's `selection.json.gz` byte for byte, the same twenty names a
day, the same costs, the same fills, the same end-of-day exit. Nothing is
re-fitted and nothing is downloaded.

| arm | opening range | trigger | stop |
|---|---|---|---|
| **`v2`** | 09:30–09:35 | resting order at the range edge | opposite extreme of that range |
| **`c15_range`** | 09:30–09:45 | first 5-min CLOSE outside | opposite extreme of the 15-min range |
| **`c15_prior`** | 09:30–09:45 | first 5-min CLOSE outside | **the extreme of the 5-min candle BEFORE the trigger** |

`v2` is the incumbent and the thing to beat. `c15_range` is ENGINE-13's model,
replayed here so the comparison to what this fixes is exact rather than quoted.
`c15_prior` is the owner's spec.

## Mechanics fixed in advance

* **Direction** is the side the range was closed through, as in ENGINE-13.
* **Entry** is a market order at the open of the next one-minute bar after the
  trigger candle closes. Not the confirming close — that price is gone.
* **The stop is knowable.** Both the trigger candle and the one before it are
  fully closed at the decision, so unlike ENGINE-10's trigger arm there is no
  forming-candle problem and no as-of compromise.
* **The first block.** If the trigger is 09:45–09:50 the preceding candle is
  09:40–09:45, inside the range. Well defined, traded, not a special case.
* **A fill that gaps THROUGH the stop** is an immediate stop-out, not a skip and
  not a moved stop. The report must count them, because a tiny fill-to-stop
  distance makes R meaningless and the reader must see the size of that.
* **No re-entry, no move to breakeven, no partial, no second attempt.**

## The windows

Verdict window **2024-01-01 → 2026-08-28**, ENGINE-7's held-back window and the
one ENGINE-13 was decided on, so the three arms are compared on identical
ground. Disclosure window 2016-01-01 → 2023-12-31, contaminated by the ENGINE-6
stop sweep, decides nothing.

**This is the ninth reading of 2016–2026.** No correction is applied because
none exists. The owner has set the 2012–2015 snapshot aside, so no
cross-era replication is available in this lane and the report must say so
rather than implying the result has been checked elsewhere.

## The bar — Q1 to Q6, after costs, money per $1,000 risked

Gross before net. Median beside every mean. **Trade count AND independent-day
count beside every interval.**

| id | gate | threshold |
|---|---|---|
| **Q1** | sample | ≥ **3,000** `c15_prior` trades in the verdict window |
| **Q2** | **it beats the incumbent** | `c15_prior` minus `v2`, **paired by day**, 95% interval **excludes zero in the challenger's favour** |
| **Q3** | **it fixes ENGINE-13** | `c15_prior` minus `c15_range`, paired by day, 95% interval **excludes zero in the challenger's favour** |
| **Q4** | sign | mean **gross** R > 0 **and** mean **net** R > 0 |
| **Q5** | **the knock-out guard** | stop-out share **< 60%** |
| **Q6** | not a half-window artefact | mean net R > 0 in **both halves** of the verdict window |

Q2, Q3 and Q6 are three readings on one window: with three shots at a 5% test
the chance one clears by luck is nearer 14% than 5%. **The gate stays the 95%
interval**, unchanged in kind and number since ENGINE-6; the Bonferroni-corrected
98.33% interval is printed beside every comparison as a disclosure, not a second
gate.

**Q5 is a guard, not an achievement.** Clearing it means only that the trade is
not being knocked out inside the noise of its own setup. It cannot make a losing
arm a winner and the report must not present it as evidence of anything.

## The verdict, fixed before any count is known

- **OWNER'S STOP WINS** — Q1 and Q2 clear.
- **FIXES THE 15-MINUTE RULE, NOT THE INCUMBENT** — Q3 clears, Q2 does not. The
  diagnosis of ENGINE-13 was right and the repair works, but the result is still
  not better than what already exists. Named in advance because it is the
  outcome the prior considers most likely.
- **INCUMBENT HOLDS** — neither Q2 nor Q3 clears.
- **FAILED** — the Q2 interval lies entirely the wrong way, or Q5 fails.
- **INCONCLUSIVE (sample)** — Q1 misses.

## What the report must contain, whatever the verdict

1. **STOP GEOMETRY FIRST**, all three arms plus ENGINE-10's two readings and
   ENGINE-6's published stop as reference rows: median cents, % of price, **×
   14-day ATR**, commission as a share of risk, stop-out share.
2. **The ENGINE-13 repair, quantified**: how much of the gap between `c15_range`
   and `v2` the new stop closed, in dollars, with an interval.
3. **How often the fill gapped through the stop**, as a count and a share, and
   the median fill-to-stop distance for those trades.
4. **How many trades each arm skipped and why** — the census, per arm.
5. **The three arms' overlap**: how often `c15_prior` and `v2` take the same
   side on the same symbol-day, and what each earned when they disagreed.
6. **The ninth-reading disclosure and the no-cross-era-check disclosure**, both
   in the plain-English summary, not a footnote.
7. **The prior restated with the outcome against it.**
8. All arms in the fixed order `v2`, `c15_range`, `c15_prior` in every table.
9. Gross before net; median beside mean; **money per $1,000 risked**; no
   R-multiple in the plain-English section without a money gloss; **no leveraged
   portfolio figure anywhere**.
10. **How confident we actually are, and what would change the answer.**

## What may not happen after a number exists

The stop is not re-read, re-anchored, or padded by a tick. The opening range is
not re-timed. The confirmation is not relaxed to a wick. No re-entry, breakeven
move or partial is added. The window is not widened. If `c15_prior` misses, the
answer is that it missed.
