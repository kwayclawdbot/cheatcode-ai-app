# Pre-registered gate — `orb_sip.v2` (ENGINE-7)

**Written and committed before the first evaluation was run.** This file lands
in the same commit as `engine/models/orb_sip_v2.py`, its tests, the gate code in
`engine/models/gates.py`, and the runner `engine/run_engine7.py`. That commit is
earlier in `git log` than the commit carrying any number produced by them.
ENGINE-1 did it (`2b448ef` before `f70576b`), ENGINE-2 (`b065f88` before
`1662c03`), ENGINE-3 (`1021168` before `a43595d`), ENGINE-4 (`a06611d` before
`19d3234`), ENGINE-5 (`d8e592b` before its report), ENGINE-6 (`2eed597` before
`5fb757f`). The ordering is the receipt, and it is the only part of this
programme that cannot be faked afterwards.

## Read this before the numbers: the stop width was CHOSEN, and that contaminates the in-sample window

`orb_sip.v2` differs from `orb_sip.v1` in exactly one thing — the stop moves
from 10% of the 14-day ATR to the opposite extreme of the 09:30-09:35 candle.
Two things pointed at that change, and only one of them is clean:

1. **Clean.** The build brief's own comparison table records the companion ETF
   paper stopping at *"the opposite extreme of the first candle"*. This is a
   published rule, not one of ours, and reading it instead of the stocks
   paper's 10%-of-ATR is a reading of the source material.
2. **Not clean.** The ENGINE-6 post-mortem swept the stop as a fraction of ATR
   **on the 2016-2023 replication window** and found the sign of the result
   flips between 0.25x and 0.5x ATR (-0.635R · -0.073R · +0.005R · +0.012R).
   The opening candle is a median 0.63 ATR wide on these names, so this rule
   lands on the winning side of a sweep we ran and read.

We cannot separate those two. Anyone who says they can is describing an
intention, not a procedure. So:

> **The 2016-01-01 → 2023-12-31 window is CONTAMINATED for this model.** It is
> reported in full, and it is a disclosure, not a verdict. No result on it can
> raise the verdict by one step.
>
> **The verdict is the held-back window, 2024-01-01 → 2026-08-28.** The sweep
> that motivated this change was computed on the replication window only; the
> held-back years have been evaluated exactly once ever — by `orb_sip.v1`, at
> the 10%-of-ATR stop — and never at any other stop width.

The held-back window is not virgin either: this is its second use in this lane,
and every use of a held-back window costs some of what makes it worth holding
back. That is stated as a limitation and is not corrected for. There is no third
use. **If `orb_sip.v2` fails, the answer is not `orb_sip.v3` at a third stop
width.**

## One spec, one gate, one verdict

No sweeping. No tuning. No second stop width. No variant added to rescue a
miss. The stop is the opposite extreme of the opening candle, the run happens
once, and whatever comes back is what is reported. `run_engine7.py` contains no
parameter to vary, by construction.

## The model

Identical to `orb_sip.v1` in every respect except the stop, and it reuses
ENGINE-6's `selection.json.gz` byte for byte rather than recomputing it, so the
two models trade the same symbol-days.

- **Universe**, as of the PRIOR close: price > $5, 20-day average volume > 1M
  shares, 14-day ATR > $0.50. From grouped daily bars for every ticker that
  traded that session — no survivorship bias, unadjusted prices.
- **Selection**: the day's top 20 by opening relative volume, measured **as of
  09:35** as the 09:30-09:35 volume over the mean of the same five minutes
  across the previous 14 sessions, floor 1.0. Ties broken by symbol.
- **Range**: 09:30-09:35, high and low.
- **Direction**: the sign of that five-minute candle. Bullish → long only, on a
  break above its high. Bearish → short only, below its low. The other side is
  not traded whatever price does.
- **Entry**: a resting stop order at the range edge, working from 09:35 to the
  close. Filled at the worse of the level and the bar's open, plus slippage.
- **Stop**: **the opposite extreme of the 09:30-09:35 candle** — the low for a
  long, the high for a short. A PRICE, not a distance carried from the fill, so
  a gap through the entry level costs the trader more risk, as it does in life.
- **Target**: NONE. Exit at the end of the day.
- **Sizing** (portfolio arm only): 1% of equity risked per position, gross
  exposure capped at 4x equity, a day's positions scaled down together when the
  cap binds, compounded daily from $100,000.
- **Costs**: $0.005/share/side commission; 1.0 bp adverse slippage on market and
  stop fills — ENGINE-1's model, unchanged for the seventh time.
- **Data**: snapshot `polygon-sip-v1`, unchanged and not re-downloaded. No
  report mixes it with `polygon-v1` or `polygon-deep-v1`.

## The bar — H1 to H5, on the HELD-BACK window, after costs

Gross reported before net. Median printed beside every mean.

| id | gate | threshold |
|---|---|---|
| **H1** | sample | ≥ **5,000** trades in the held-back window |
| **H2** | sign | mean **gross** R > 0 **and** mean **net** R > 0 |
| **H3** | direction beats a coin flip | paired against the matched control (same symbols, days, decision minutes and stop geometry, direction flipped), gross, 95% interval **excludes zero** in the model's favour |
| **H4** | the filter is the thing | mean net R of the stocks-in-play arm minus the same rules on a random 20 eligible names a day, paired by day, 95% interval on the difference **excludes zero** in the model's favour |
| **H5** | portfolio | the 1%-risk / 4x-capped portfolio has positive total return **and** an annualised Sharpe ≥ **1.0**, net of costs |

Every threshold is carried over from ENGINE-6's R1-R5 **unchanged in kind and in
number**, and moved from the replication window to the held-back window for the
reason stated at the top. A model handed an easier bar than the one that failed
before it has not been measured against anything.

### The verdict, fixed before any count is known

- **CONFIRMED OUT OF SAMPLE** — H1-H5 all pass.
- **PARTIAL** — H1 and H2 pass (it makes money out of sample, gross and net) but
  at least one of H3, H4, H5 fails. The report headline must name which failed
  and must say plainly what is therefore NOT established. **PARTIAL is not a
  pass and does not authorise shipping anything.** In particular: H3 failing
  means the direction call is not demonstrably better than a coin flip, and H4
  failing means the stocks-in-play filter is not demonstrably the source of the
  result — either would mean the money, if it is there, comes from something
  other than the thing the paper claims.
- **FAILED** — H2 fails. It did not make money out of sample. Report it plainly
  and stop.
- **INCONCLUSIVE (sample)** — H1 missed and nothing else is read.

## What the report must contain, whatever the verdict

Pre-registered so that a good result cannot quietly drop the awkward parts:

1. **The contamination paragraph, in the plain-English summary, not in a
   footnote.** A reader who stops after the first section must already know
   that the stop width was chosen by looking at a sweep of the 2016-2023
   window.
2. **The share of trades stopped.** ENGINE-6's was 90.1%. **If v2's is still
   ≥85%, the ENGINE-6 diagnosis was wrong** — the stop was not what was killing
   it — and the report must say so in those words, whatever the verdict says.
3. Gross before net; median beside mean; the matched coin-flip control; the
   random-20-names control; and both windows in full.
4. The realised stop width in cents, in percent of price, and in ATR units, so
   it can be put beside v1's 12.4 cents / 0.35% / 0.10 ATR.
5. Trade count and date range for both windows.
6. **How confident we actually are, and what would change the answer.** Not a
   number dressed as certainty.

## What may not happen after a number exists

No threshold in this file moves. No parameter of the model changes. No variant
is added to rescue a miss. The stop width is not swept again. If the held-back
window disagrees with the contaminated window, the held-back window is the
answer and the disagreement is reported as the finding it is.
