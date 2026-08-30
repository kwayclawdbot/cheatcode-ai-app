# `orb_sip.v8_us500` — the top 10 of a large-cap universe, against the incumbent's top 20

**Verdict: INCUMBENT HOLDS.** Decided on the primary window 2021-08-30 → 2026-08-28 and on nothing else; the confirmation window 2012-01-01 → 2015-12-31 is reported beside it.

Gate: [`../models/orb_sip.v8_us500/GATE.md`](../models/orb_sip.v8_us500/GATE.md), committed before this file produced a number. Git rev `f9d2600`. Run took 1.4 minutes.

## It is NOT the S&P 500, and that is not a technicality

True point-in-time index membership is not available here, and using **today's** constituent list for a 2021 session would be the worst lookahead in this project: companies are added to the index *after* they perform well, so back-projecting membership hands the strategy a hindsight-picked list of winners and manufactures an edge out of nothing.

So this is a **large-cap liquidity proxy**: the 500 most liquid US common stocks by 20-day average dollar volume as of the prior close, drawn from the same survivorship-free universe (every ticker that actually traded that day, delisted names included), with foreign depositary receipts, funds, notes, warrants, units, preferreds and test tickers removed.

**Two ways it differs from the real index**: it will include a heavily-traded non-index name having a moment (AMC in 2021), and it will miss a genuine index member that trades quietly.

Type mix of the proxy universe (primary window): CS 94.1%, UNKNOWN 5.9%. `UNKNOWN` is kept — a ticker the reference API no longer knows is usually a delisted company, and dropping it would reintroduce the survivorship this universe exists to avoid.

## In plain English

**What changed.** The incumbent picks the **top 20 by opening relative volume from the 1,000 most liquid names of any kind**. This lane picks the **top 10 from the 500 most liquid US common stocks**. Two changes at once — a narrower universe and a smaller count — so a third arm, `us500_top20`, holds the count at 20 and changes only the universe, which is the only way to say which of the two did the work.

**This is the eighth reading of 2016–2026.** Every lane from ENGINE-6 onward has looked at part of the primary window. No correction is applied because none exists. The confirmation window was read once, by ENGINE-15, testing a different hypothesis — so it is **weak out-of-sample evidence, stronger than the primary window and weaker than a virgin one**, and it is not a clean hold-out. Three comparisons is nearer a 14% false-positive rate than 5%; the corrected interval is printed beside every one.

**The prior, written into the gate before the run.** ENGINE-12 put this spec on SPY and it lost $208 per $1,000 risked, negative in all fifteen years, because **the stop is the width of the opening five-minute candle and SPY's is a median 0.16 of a 14-day ATR against 0.72 on the stocks the strategy picks**. Large caps sit between the two, so the prediction was a narrower stop, a higher knock-out rate and a worse result. The stop-width table below is the first thing to read.

- **`incumbent`** — 20,141 trades over 1,255 days. **+18 dollars a trade** per $1,000 risked (+0.0178R); median -152 dollars; 44.1% green; 34.0% stopped. 95% range +1 dollars to +34 dollars, which excludes zero.
- **`us500_top10`** — 10,085 trades over 1,255 days. **+18 dollars a trade** per $1,000 risked (+0.0175R); median -136 dollars; 45.0% green; 33.3% stopped. 95% range -5 dollars to +40 dollars, which contains zero.
- **`us500_top20`** — 20,245 trades over 1,255 days. **+17 dollars a trade** per $1,000 risked (+0.0166R); median -164 dollars; 44.3% green; 35.6% stopped. 95% range +0 dollars to +33 dollars, which excludes zero.
- **`flip_us500_top10`** — 8,148 trades over 1,255 days. **+8 dollars a trade** per $1,000 risked (+0.0080R); median -134 dollars; 45.0% green; 33.5% stopped. 95% range -17 dollars to +33 dollars, which contains zero.

- **`us500_top10` minus the incumbent (primary)**, paired by day: **-3 dollars** a trade (-0.0029R), 95% -23 dollars to +17 dollars over 1,255 days. Contains zero, so nothing is established. Corrected for three shots: -27 dollars to +21 dollars.
- **`us500_top10` minus its own coin flip (primary)**, paired by day: **-1 dollars** a trade (-0.0010R), 95% -23 dollars to +21 dollars over 1,255 days. Contains zero, so nothing is established. Corrected for three shots: -28 dollars to +26 dollars.
- **`us500_top10` minus the incumbent (confirmation)**, paired by day: **-1 dollars** a trade (-0.0010R), 95% -23 dollars to +21 dollars over 1,006 days. Contains zero, so nothing is established. Corrected for three shots: -27 dollars to +25 dollars.

- **Verdict**: **INCUMBENT HOLDS**.

**Which gates carried the verdict, in words.** Z1 passed (sample (both windows)). Z2 FAILED (it beats the incumbent (primary, paired by day)). Z3 FAILED (the selector still works in this universe (primary, minus its own coin flip, paired by day)). Z4 FAILED (it beats the incumbent out of sample too (confirmation window)). Z5 passed (sign (primary)). Z6 passed (not a one-window result).

## Realised stop width — the pre-registered mechanism, read first

| arm | trades | median stop | % of price | **in 14-day ATRs** | **stopped out** |
|---|---|---|---|---|---|
| `incumbent` | 20,141 | 111¢ | 2.73% | **0.68** | **34.0%** |
| `us500_top10` | 10,085 | 189¢ | 2.45% | **0.69** | **33.3%** |
| `us500_top20` | 20,245 | 159¢ | 2.07% | **0.59** | **35.6%** |
| `flip_us500_top10` | 8,148 | 181¢ | 2.35% | **0.66** | **33.5%** |
| *ENGINE-12 reference: SPY* | — | — | — | *0.16* | *76.2%* |
| *ENGINE-12 reference: stocks in play* | — | — | — | *0.72* | *31.6%* |

## The pre-registered bar, and what it read

| id | gate | threshold | observed | |
|---|---|---|---|---|
| **Z1** | sample (both windows) | >=3,000 us500_top10 trades in each window | primary=10,085, confirmation=8,027 | PASS |
| **Z2** | it beats the incumbent (primary, paired by day) | 95% interval excludes zero, in the challenger's favour | -0.0029 (-3 dol) (95%: -0.0227 to +0.0168, days=1,255) | **FAIL** |
| **Z3** | the selector still works in this universe (primary, minus its own coin flip, paired by day) | 95% interval excludes zero, in the model's favour | -0.0010 (-1 dol) (95%: -0.0229 to +0.0210, days=1,255) | **FAIL** |
| **Z4** | it beats the incumbent out of sample too (confirmation window) | 95% interval excludes zero, in the challenger's favour | -0.0010 (-1 dol) (95%: -0.0226 to +0.0206, days=1,006) | **FAIL** |
| **Z5** | sign (primary) | mean gross R > 0 AND mean net R > 0 | gross=+0.0266, net=+0.0175 | PASS |
| **Z6** | not a one-window result | mean net R > 0 in BOTH windows | primary=+0.0175, confirmation=+0.0532 | PASS |

## The primary window, 2021-08-30 → 2026-08-28 (`polygon-sip-v1`)

| arm | trades | days | gross R | net R | median | money per $1,000 | 95% range | hit | stopped |
|---|---|---|---|---|---|---|---|---|---|
| `incumbent` | 20,141 | 1,255 | +0.0323 | +0.0178 | -0.1524 | +18 dollars | +1 dollars to +34 dollars | 44.1% | 34.0% |
| `us500_top10` | 10,085 | 1,255 | +0.0266 | +0.0175 | -0.1357 | +18 dollars | -5 dollars to +40 dollars | 45.0% | 33.3% |
| `us500_top20` | 20,245 | 1,255 | +0.0270 | +0.0166 | -0.1641 | +17 dollars | +0 dollars to +33 dollars | 44.3% | 35.6% |
| `flip_us500_top10` | 8,148 | 1,255 | +0.0175 | +0.0080 | -0.1340 | +8 dollars | -17 dollars to +33 dollars | 45.0% | 33.5% |

## The confirmation window, 2012-01-01 → 2015-12-31 (`polygon-sip-early-v1`)

| arm | trades | days | gross R | net R | median | money per $1,000 | 95% range | hit | stopped |
|---|---|---|---|---|---|---|---|---|---|
| `incumbent` | 16,085 | 1,006 | +0.0788 | +0.0553 | -0.2047 | +55 dollars | +35 dollars to +76 dollars | 43.6% | 37.9% |
| `us500_top10` | 8,027 | 1,006 | +0.0722 | +0.0532 | -0.1989 | +53 dollars | +25 dollars to +82 dollars | 43.6% | 37.0% |
| `us500_top20` | 16,064 | 1,006 | +0.0721 | +0.0510 | -0.2029 | +51 dollars | +31 dollars to +71 dollars | 43.6% | 37.9% |
| `flip_us500_top10` | 6,653 | 1,006 | +0.0416 | +0.0219 | -0.1969 | +22 dollars | -8 dollars to +52 dollars | 43.1% | 37.1% |

## Universe change or count change? — what `us500_top20` separates

- **universe change alone (`us500_top20` minus incumbent)**: -3 dollars a trade, 95% -21 dollars to +15 dollars, 1,255 days.
- **count change alone (`us500_top10` minus `us500_top20`)**: -0 dollars a trade, 95% -17 dollars to +16 dollars, 1,255 days.

The two add to -3 dollars against the -3 dollars measured directly (they differ because each is paired on a different set of shared days). **The larger of the two is where the difference comes from** — the UNIVERSE change. ENGINE-7 already found that ranking more finely within the top twenty bought nothing, so a large count effect here would contradict it and a small one confirms it.

## What the narrowed universe actually selects

- **Overlap with the incumbent's picks**: 8,013 of 10,085 `us500_top10` symbol-days (79.5%) were also selected by the incumbent. **The two arms are largely trading the same names, so the comparison is weaker than its interval suggests.**
- **`incumbent`** — median price $42.93, median 14-day ATR $1.55. Most-selected: WMG(50), MDB(44), ZM(43), FUTU(42), HTHT(42), APLS(41), DOCS(41), FSLR(40), GTLB(40), XP(40).
- **`us500_top10`** — median price $83.21, median 14-day ATR $2.66. Most-selected: MDB(51), RIVN(48), ZM(47), CVNA(42), W(41), WDAY(41), CPNG(40), DELL(39), FSLR(39), ROKU(39).

## Caveats, and what would change the answer

- **It is a liquidity proxy, not the S&P 500.** Stated above; it matters for how the result generalises to an index-constrained mandate.
- **Eighth reading of the primary window.** No correction applied because none exists.
- **The confirmation window is weak out-of-sample evidence**, not a clean hold-out: it was read once by ENGINE-15, and it is an older market whose spreads, venue mix and retail flow are not those of 2026.
- **0 primary and 0 confirmation symbol-days had no cached minute bars** and were skipped by every arm equally.
- Fills are modelled from one-minute OHLC and cannot see inside a bar. No live-execution question has been touched.
- **No leveraged portfolio figure appears anywhere**, by pre-registration.

