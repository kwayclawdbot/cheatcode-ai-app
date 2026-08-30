# Pre-registered gate — `orb_sip.v8_us500` (ENGINE-16)

**Written and committed before the evaluation ran and before the missing bars
were downloaded.** This file lands in the same commit as `engine/sip/us500.py`,
`engine/models/gates16.py`, `engine/run_engine16.py` and their tests. That commit
is earlier in `git log` than the commit carrying any number produced by them.

## The question

The owner, 2026-08-30: *"And this is on top 20 unusual vol stocks? What if we
narrow it to top 10 s&p500 stocks only for the past 5years"*.

Yes — the incumbent selects the **top 20 by opening relative volume from the
1,000 most liquid US names**. This lane narrows both dimensions at once:

    universe   the 500 most liquid US COMMON stocks (large-cap proxy)
               instead of the 1,000 most liquid names of any kind
    count      the top 10 by opening relative volume instead of the top 20
    window     2021-08-30 -> 2026-08-28, the owner's "past 5 years", 1,255 sessions

## It is NOT the S&P 500, and that is not a technicality

True point-in-time index membership is not available here. **Using today's
constituent list for a 2021 session would be the worst lookahead available in
this project**: companies are added to the index AFTER they perform well, so
back-projecting membership hands the strategy a hindsight-picked list of winners
and would manufacture an edge out of nothing.

So the universe is a **liquidity proxy**, defined in `engine/sip/us500.py`, built
from the same survivorship-free grouped-daily universe ENGINE-6 uses (every
ticker that actually traded that day, delisted names included), ranked by 20-day
average dollar volume as of the prior close, with foreign depositary receipts,
funds, notes, warrants, units, preferreds and test tickers removed. The report
must call it a large-cap proxy and never "the S&P 500", and must state the two
ways it differs: it will include a heavily-traded non-index name having a moment
(AMC in 2021) and will miss a quiet genuine index member.

## The prior, written down before the run

**This lane is expected to underperform the incumbent**, and the mechanism is
the one that has explained every result in this programme.

ENGINE-12 put the working spec on SPY and it lost $208 per $1,000 risked, was
negative in all fifteen calendar years, and the report located the cause exactly:
**the stop is the width of the opening five-minute candle, and SPY's is a median
0.16 of a 14-day ATR against 0.72 on the stocks the strategy picks.** A narrow
opening range is a tight stop, a tight stop is a high knock-out rate, and the
knock-out rate followed: 76.2% against 31.6%.

Large-cap names sit between SPY and a small-cap on that axis. **The prediction
is therefore a narrower median stop, a higher stop-out share, and a worse result
than the incumbent** — not as bad as SPY, because the relative-volume selector
still requires an abnormal morning, but in that direction.

Second prior, pointing the other way and weaker: ENGINE-7 found that being in
the top twenty **at all** is what pays, and that ranking more finely *within* the
twenty bought nothing (the more-abnormal half returned +0.0230R against +0.0167R,
interval spanning zero). **So top-10-instead-of-top-20 is expected to be roughly
neutral on its own**, and any difference this lane measures should be attributed
to the universe change rather than the count change. The report must separate
the two with the third arm below.

**If this lane fails as predicted it is a CONFIRMATION, not a discovery**, and
the report must say so.

## The four arms

All four use `orb_sip.v2` unchanged, the same costs, the same fills, the same
09:30-09:35 relative-volume rule with the same floor of 1.0. **Only the
candidate list and the count differ.**

| arm | universe | count |
|---|---|---|
| **`incumbent`** | the 1,000 most liquid names, any type | top 20 |
| **`us500_top10`** | the 500 most liquid US common stocks | top 10 |
| **`us500_top20`** | the 500 most liquid US common stocks | top 20 |
| **`flip_us500_top10`** | matched coin flip on `us500_top10`'s picks | top 10 |

`us500_top20` exists **solely to separate the universe change from the count
change**, which is the confound the owner's question contains. Without it a
difference could be attributed to either. It is not a candidate to ship and no
verdict names it.

The coin flip is `OrbStocksInPlayV2Coinflip` with the **same seed** as every
prior lane, so a direction control here is comparable with ENGINE-6 onward.

## The windows

| | |
|---|---|
| **primary** | **2021-08-30 → 2026-08-28** — the owner's "past 5 years", 1,255 sessions, snapshot `polygon-sip-v1` |
| **confirmation** | **2012-01-01 → 2015-12-31** — 1,006 sessions, snapshot `polygon-sip-early-v1` |

**The primary window is the EIGHTH reading of 2016–2026.** Every lane from
ENGINE-6 onward has looked at part of it. No correction is applied because none
exists. The confirmation window has been read once, by ENGINE-15 — but ENGINE-15
tested a side-asymmetry hypothesis, not this one, and this lane's universe and
count were never involved. It is therefore weak out-of-sample evidence, stronger
than the primary window and weaker than a virgin one, and the report must
describe it in exactly those terms and never as a clean hold-out.

## The bar — Z1 to Z6, after costs, money per $1,000 risked

Gross before net. Median beside every mean. **Trade count AND independent-day
count beside every interval.**

| id | gate | threshold |
|---|---|---|
| **Z1** | sample | ≥ **3,000** trades for `us500_top10` in each window |
| **Z2** | **it beats the incumbent** | `us500_top10` minus `incumbent`, **paired by day**, primary window, 95% interval **excludes zero in the challenger's favour** |
| **Z3** | **the selector still works in this universe** | `us500_top10` minus `flip_us500_top10`, paired by day, primary window, 95% interval excludes zero in the model's favour |
| **Z4** | **it beats the incumbent out of sample too** | the Z2 comparison, on the confirmation window |
| **Z5** | sign | mean **gross** R > 0 **and** mean **net** R > 0 for `us500_top10`, primary window |
| **Z6** | it is not a one-window result | mean net R > 0 for `us500_top10` in **both** windows |

Z2, Z3 and Z4 are three intervals: with three shots at a 5% test the chance one
clears by luck is nearer 14% than 5%. **The gate stays the 95% interval**,
unchanged in kind and number from ENGINE-6 onward; the Bonferroni-corrected
98.33% interval is printed beside every comparison as a disclosure, not a second
gate.

**Pairing is by day**, for ENGINE-6's reason: trades on the same morning are not
independent, and the day effect is what a comparison of selectors has to remove.

## The verdict, fixed before any count is known

- **US500 TOP10 WINS** — Z1, Z2 and Z4 clear. It beats the incumbent in the
  owner's window and does not fall apart on the older one.
- **WINS IN SAMPLE ONLY** — Z2 clears, Z4 does not.
- **WORKS BUT DOES NOT BEAT** — Z3 clears (the selector still picks direction in
  this universe) but Z2 does not (it is not better than what we already have).
- **INCUMBENT HOLDS** — Z2 and Z3 both fail to clear.
- **FAILED** — the Z2 interval lies entirely the WRONG way: the narrower
  universe measurably LOSES to the incumbent.
- **INCONCLUSIVE (sample)** — Z1 misses.

## What the report must contain, whatever the verdict

1. **REALISED STOP WIDTH, PER ARM** — median cents, percent of price, **in
   14-day ATRs**, and the stop-out share. This is the pre-registered mechanism
   and it is the first table after the verdict. ENGINE-12's numbers (0.16 ATR
   and 76.2% on SPY, 0.72 ATR and 31.6% on stocks in play) must be printed
   beside it as the two reference points.
2. **The universe change separated from the count change**, using `us500_top20`.
   The report must state, in words, which of the two is responsible for whatever
   difference is measured.
3. **What the narrowed universe actually selects** — overlap with the
   incumbent's picks, median relative volume, median price, median 14-day ATR,
   and the ten most-selected names in each arm. If the arms pick largely the
   same names the comparison is weaker than its interval suggests and the report
   must say so.
4. **The type mix of the proxy universe** and how many `UNKNOWN` types it keeps,
   so the size of that compromise is visible rather than assumed.
5. **Both windows, side by side**, with the confirmation window described as
   weak out-of-sample evidence and never as a clean hold-out.
6. **The eighth-reading disclosure and the multiplicity paragraph**, both in the
   plain-English summary, not a footnote.
7. **The prior restated with the outcome against it**, and if it fails as
   predicted, the words "this confirms a prior rather than discovering
   something".
8. **It is not the S&P 500** — in the plain-English summary, with the two ways
   it differs.
9. All arms in the fixed order `incumbent`, `us500_top10`, `us500_top20`,
   `flip_us500_top10`, in every table.
10. Gross before net; median beside mean; **money per $1,000 risked**; no
    R-multiple in the plain-English section without a money gloss; **no
    leveraged portfolio figure anywhere**.
11. **How confident we actually are, and what would change the answer.**

## What may not happen after a number exists

The universe size is not re-tried at 300, 400 or 750. The count is not re-tried
at 5, 15 or 25. The relative-volume floor, the stop, the costs and the coin-flip
seed are not touched. No sector, price or volatility sub-split is added to
rescue a miss. Neither window is widened, shortened or shifted. If the two
windows disagree, **both are reported at equal length and the disagreement is
the finding**.
