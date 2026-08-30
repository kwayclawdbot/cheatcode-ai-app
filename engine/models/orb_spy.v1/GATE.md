# Pre-registered gate — `orb_spy.v1` (ENGINE-12)

**Written and committed before the first evaluation was run.** This file lands
in the same commit as `engine/models/orb_spy_v1.py`, its tests, the gate code in
`engine/models/gates.py` and the runner `engine/run_engine12.py`. That commit is
earlier in `git log` than the commit carrying any number produced by them.
ENGINE-1 did it (`2b448ef` before `f70576b`), ENGINE-2 (`b065f88` before
`1662c03`), ENGINE-3 (`1021168` before `a43595d`), ENGINE-4 (`a06611d` before
`19d3234`), ENGINE-5 (`d8e592b` before its report), ENGINE-6 (`2eed597` before
`5fb757f`), ENGINE-7, ENGINE-8, ENGINE-9, ENGINE-10 and ENGINE-11 the same. The
ordering is the receipt, and it is the only part of this programme that cannot
be faked afterwards.

## The question

The stocks-in-play ORB **never selects SPY**. Verified on ENGINE-6's own
selection file: 0 SPY trades out of 42,937. The pool is single stocks, the rank
key is abnormal opening volume, and the most heavily traded instrument in the
world is never abnormally active against its own recent mornings. So every
result in ENGINE-6 through ENGINE-11 is silent about SPY, and the owner's
question — *does the current working spec work on SPY alone, traded every day,
with no selection step?* — has never been asked.

## The model

`orb_sip.v2`, with the selection deleted and nothing else touched. It is
implemented as a subclass that overrides nothing but its name, and
`engine/tests/test_orb_spy_v1.py` asserts both that it adds no behaviour and
that its trades are identical to `orb_sip.v2`'s field for field on a fixture
tape. That is the strongest available guarantee that a different answer on SPY
is a statement about SPY rather than about a rule that drifted on the way over.

- **Universe**: one instrument at a time. **SPY is the subject.** QQQ and IWM
  are run and reported SEPARATELY, never pooled into a SPY number, and cannot
  raise or lower the SPY verdict.
- **Selection**: NONE. Every session in the snapshot is traded.
- **Range**: 09:30–09:35, high and low.
- **Direction**: the sign of that five-minute candle. Bullish → long only, on a
  break above its high. Bearish → short only, below its low. The other side is
  not traded whatever price does. A doji opening candle is skipped.
- **Entry**: a resting stop order at the range edge, working from 09:35 to the
  close. Filled at the worse of the level and the bar's open, plus slippage.
- **Stop**: **the opposite extreme of the 09:30–09:35 candle** — the low for a
  long, the high for a short. A PRICE, not a distance carried from the fill, so
  a gap through the entry level costs the trader more risk, as it does in life.
- **Target**: NONE. Flat at 15:59 ET, or at the early close on a half day.
- **One trade per session per side, no re-entry.** One decision, taken at 09:35.
- **Sizing** (portfolio arm only): 1% of equity risked per position, gross
  exposure capped at 4x equity, compounded daily from $100,000 — `orb_sip.v2`'s
  convention unchanged, so the two are comparable.
- **Costs**: $0.005/share/side commission; 1.0 bp adverse slippage on market and
  stop fills — ENGINE-1's model, unchanged for the twelfth time.
- **Data**: snapshot `polygon-deep-v1`, already on disk, **not re-downloaded and
  not extended**. 2012-01-03 → 2026-08-28, 3,685 sessions on each of SPY, QQQ
  and IWM, zero missing days. No report mixes it with `polygon-v1` or
  `polygon-sip-v1`.

There is no parameter to vary. `run_engine12.py` has no knob on it, by
construction, and no variant will be added to rescue a miss.

## Why this is not ENGINE-4 run again

ENGINE-4 traded SPY every day on this same cache and lost in all fifteen years.
It is a **different model**: a 15-minute opening range, a 1-hour or 4-hour trend
confirmation, a fixed 2R target, and — the part that matters — a stop at the
**trigger candle's own extreme**, which realised a median 29 cents on a $334
share. ENGINE-6's stop-width sweep and ENGINE-10's two out-of-sample readings
agree that stop width is the only parameter this programme has ever found that
decides the sign of this family, and that the sign flips somewhere between 0.25x
and 0.50x of the 14-day ATR. ENGINE-4's stop is well inside the losing zone.
**This lane is the first time the wide stop has been put on SPY.**

Whether it actually IS a wide stop on SPY is an open empirical question, and it
is the first thing the report must answer — see the disclosure triggers below.

## The windows — TWO, read separately, neither able to overwrite the other

| | |
|---|---|
| **the owner's build years** | 2021-08-29 → 2025-08-28. Nothing is tuned on it. Reported. |
| **the owner's verdict year** | 2025-08-29 → 2026-08-28. ~251 sessions, so ~230 trades. |
| **the untouched span** | 2012-01-01 → 2021-08-28. ~2,400 trades. **No lane has ever put this spec on it.** |
| **the whole cache** | 2012-01-01 → 2026-08-28, as context. |

Both the verdict year and the untouched span get the same five gates, in the
same order, with thresholds of the same kind. **Both verdicts are printed in the
headline. The report may not lead with whichever did better**, and if they
disagree in sign that disagreement is the finding.

**The verdict year is thin and it has been read before.** ~230 trades of one
instrument gives a 95% half-width near ±0.16R — about ±$160 per $1,000 risked —
so it can separate a large edge from nothing and can resolve nothing smaller.
It has also been read repeatedly by ENGINE-8, ENGINE-9, ENGINE-10 and ENGINE-11
on other models over the same calendar dates, so a positive there is
**suggestive at best**. The untouched span is nine and a half years deep and has
never been read for this spec; it is the stronger evidence and is labelled so
here, in advance, so nobody can be told afterwards which window "really"
counted.

**Two windows means two 95% intervals**, so the chance at least one clears zero
by luck is about 10%, not 5%. No correction is applied to the intervals. The
report must state this instead.

## The bar — five gates, on EACH window, after costs

Gross reported before net. Median printed beside every mean.

| id | gate | threshold |
|---|---|---|
| **1** | sample | ≥ **200** trades (verdict year) / ≥ **1,500** trades (untouched span) |
| **2** | sign | mean **gross** R > 0 **and** mean **net** R > 0 |
| **3** | direction beats a coin flip | paired against the matched control (same sessions, same decision minute, same entry and stop geometry, direction flipped), gross, 95% interval **excludes zero** in the model's favour |
| **4** | the edge is distinguishable from zero | 95% interval on the mean **net** R **excludes zero**, in the model's favour |
| **5** | portfolio | the 1%-risk / 4x-capped portfolio has positive total return **and** an annualised Sharpe ≥ **1.0**, net of costs |

Gates 1, 2, 3 and 5 are ENGINE-7's H1, H2, H3 and H5 unchanged in kind. **Gate 4
differs from H4 and has to**: H4 asked whether the SELECTION was the source of
the return, and this model has no selection to ask about. In its place stands
the question ENGINE-7's own report named as the thing a passed H2 does not
establish — whether the per-trade edge is distinguishable from zero at all. It
is a HARDER gate than H4 was, not an easier one, and it is written down here
before any number exists.

The sample floors are set from what the tape can physically supply. One
instrument, one trade a session: 5,000 trades — ENGINE-7's floor — is
unreachable in a year and would make the verdict INCONCLUSIVE by construction
rather than by evidence.

### The verdict, fixed before any count is known — one per window

- **CONFIRMED** — all five gates pass on that window.
- **PARTIAL** — 1 and 2 pass (it made money on that window, gross and net) but at
  least one of 3, 4 or 5 fails. The report headline must name which failed and
  must say plainly what is therefore NOT established. **PARTIAL is not a pass
  and does not authorise shipping anything.**
- **FAILED** — gate 2 fails. It did not make money on that window. Report it
  plainly and stop.
- **INCONCLUSIVE (sample)** — gate 1 missed and nothing else in that window is
  read. The window is NOT widened to manufacture a verdict.

## Disclosure triggers — say it in these words, whatever the verdict says

1. **The stop width, first, before any performance number.** If SPY's realised
   median stop — the width of the 09:30–09:35 candle — is **below 0.50 of the
   14-day ATR**, then this lane did NOT put the wide stop on SPY. It put a
   narrower one, inside the zone ENGINE-6's sweep measured as losing, and that
   is likely the whole answer. It must be stated plainly and early, in the
   plain-English summary and not in a footnote.
2. **An interval that contains zero settles nothing about the size of the
   edge**, whatever the sign of the middle number. A passed gate 2 is not
   evidence that the per-trade edge is real, and the report must say so wherever
   it happens.
3. **If the two windows disagree in sign, the disagreement is the finding** and
   the report may not resolve it by preferring one.
4. **The verdict year has been read repeatedly by earlier lanes.** A positive
   there is suggestive, not evidence.

## What the report must contain, whatever the verdict

Pre-registered so that a good result cannot quietly drop the awkward parts, and
so that a bad one is legible to someone who does not read backtests.

1. **Plain English first, and money before ratios.** Every R figure carries its
   dollar gloss — what the average trade made or lost per $1,000 risked. No
   R-multiple or ATR unit appears without one.
2. **The realised stop width in cents, in percent of price, and in ATR units**,
   placed beside **ENGINE-4's SPY stop** (median 29¢ / 0.104% of price, its ATR
   figure recomputed here from the same daily bars so the two are on one scale)
   and beside **`orb_sip.v2`'s stocks-in-play stop** (164¢ / 0.72 ATR on the
   ENGINE-9/11 baseline; 133.9¢ / 2.840% / 0.749 ATR on ENGINE-7's own
   held-back window). If SPY's candle gives a much narrower stop in ATR terms,
   that is the answer and it must be said so.
3. **Gross before net. Median beside mean. The matched coin-flip control before
   any statement about the model.**
4. **The share of trades stopped out**, beside `orb_sip.v2`'s 31.6%.
5. **The share of trades that reach 1R in their favour before resolving, and of
   those, the share that finish winners.** That figure has sat at 78–81% in
   every version of this family measured so far; whether it holds on SPY is
   informative in itself and must be printed whichever way it comes out.
6. **Trade count and date range for every window**, and the per-year table, so a
   reader can see whether a mean is carried by one calendar year.
7. **QQQ and IWM in their own tables**, never pooled into SPY's.
8. **How confident we actually are, and what would change the answer.** Not a
   number dressed as certainty. If the sample or the interval cannot support a
   verdict, the report says **INCONCLUSIVE** and does not reach for one.

## What may not happen after a number exists

No threshold in this file moves. No parameter of the model changes. No variant
is added to rescue a miss. The stop is not swept. The windows are not widened,
narrowed or re-cut. If the two windows disagree, both are reported and the
disagreement is the result.
