# `orb_sip.v7_side` — does the bullish-side edge survive out of sample?

**Verdict: NOT REPLICATED.** Decided on 2012-01-01 → 2015-12-31 and on nothing else.

Snapshot **`polygon-sip-early-v1`** — a separate snapshot, fetched for this lane, covering years no lane in this programme has ever read. `polygon-sip-v1` is untouched. Gate: [`../models/orb_sip.v7_side/GATE.md`](../models/orb_sip.v7_side/GATE.md), committed before the data was downloaded. Git rev `20ca61a`. Replay took 0.3 minutes.

## Data integrity, audited before any result is believed

The 2026-08-29 paginator bug produced a *beautiful* wrong answer in the opening-volume stage — half of every file split-adjusted, half not — and it selected names for a relative volume that never happened. So this section runs first and the report prints it first.

- **Sessions**: calendar expects **1,006** between 2012-01-01 and 2015-12-31; **1,006** grouped files present. Missing: 0. Present but not a trading day: 0.
- **Universe**: median 648 eligible names a day (min 418, max 914). The 1,000-name pool was NOT full on **1,006** of 1,006 days (100.0%) — on those days the pool boundary is not binding and every eligible name was a candidate.
- **Scored**: median 648 pool names a day had both an opening bar and a full 14-session baseline, so a relative volume existed for them.
- **Split-adjustment check** (the exact defect from 2026-08-29): the 09:30 five-minute opening bar is compared against the sum of the one-minute bars for the same symbol-day; a mixed-adjustment series shows up as a clean split ratio rather than as noise. See the row below.
- **Coverage**: 0 selected symbol-days had no cached one-minute bars and were skipped by both arms equally.

## In plain English

**What is being tested, and why it deserves suspicion.** ENGINE-14 split `orb_sip.v2`'s trades by the sign of the opening candle and subtracted a coin flip taking the same side. On 2016–2026 the bullish side came out roughly four times better. **That was a post-hoc subgroup split on a window already read seven times** — the single most reliable way to manufacture a false positive. This lane re-runs the identical measurement on 2012–2015, which was fetched only after the bar for judging it was committed. Nothing was re-fitted: same universe, same pool, same selector, same rules, same coin flip with the same seed, same costs.

**One contamination, disclosed rather than discovered.** ENGINE-12 replayed SPY over 2012–2021, so this window's broad market direction is known — the index rose, and SPY's own opening-range break lost money in every year of it. That says nothing about which SIDE of a stocks-in-play break carries signal (SPY has never once been selected by this strategy), but it is not zero.

| | 2016–2026 (where the finding came from) | **2012–2015 (this test)** |
|---|---|---|
| A — model, bullish (long) | +14 dollars | **+44 dollars** |
| a — coin flip, long | -10 dollars | **+14 dollars** |
| B — model, bearish (short) | +26 dollars | **+68 dollars** |
| b — coin flip, short | +21 dollars | **+35 dollars** |
| **the bullish signal (A−a)** | **+24 dollars** | **+30 dollars** |
| **the bearish signal (B−b)** | **+6 dollars** | **+32 dollars** |
| **the ASYMMETRY** | **+19 dollars** | **-2 dollars** |

The 2016–2026 column is quoted from ENGINE-14's committed report and is **disclosure, not a threshold** — no gate reads it.

- **The bullish signal on unseen data: +30 dollars a trade** (95%: -11 dollars to +72 dollars; corrected for four shots -22 dollars to +83 dollars), from 8,321 model longs against 6,755 coin-flip longs.
- **The bearish signal: +32 dollars a trade** (95%: -14 dollars to +79 dollars), from 7,764 model shorts against 6,702 coin-flip shorts.
- **The asymmetry (bullish signal minus bearish signal): -2 dollars a trade** (95%: -64 dollars to +60 dollars). **Contains zero — no asymmetry is established on unseen data.**

- **Verdict**: **NOT REPLICATED**.

**Which gates carried the verdict, in words.** Y1 passed (sample, per side (test window)). Y2 FAILED (the bullish signal is real (A - a, unpaired)). Y3 FAILED (the bearish signal is real (B - b, unpaired)). Y4 FAILED (the ASYMMETRY replicates ((A-a) - (B-b))). Y5 passed (the bullish arm stands on its own). Y6 passed (the strategy transfers at all (model minus coin flip, paired by day)).

## The pre-registered bar, and what it read

| id | gate | threshold | observed | |
|---|---|---|---|---|
| **Y1** | sample, per side (test window) | >=3,000 model trades on each side | bullish=8,321, bearish=7,764 | PASS |
| **Y2** | the bullish signal is real (A - a, unpaired) | 95% interval excludes zero, in the model's favour | +0.0302 (+30 dol) (95%: -0.0111 to +0.0715) | **FAIL** |
| **Y3** | the bearish signal is real (B - b, unpaired) | 95% interval excludes zero, in the model's favour | +0.0323 (+32 dol) (95%: -0.0142 to +0.0788) | **FAIL** |
| **Y4** | the ASYMMETRY replicates ((A-a) - (B-b)) | 95% interval excludes zero with the BULLISH side larger | -0.0021 (-2 dol) (95%: -0.0643 to +0.0601) | **FAIL** |
| **Y5** | the bullish arm stands on its own | mean gross R > 0 AND mean net R > 0 for A | gross=+0.0668, net=+0.0438 | PASS |
| **Y6** | the strategy transfers at all (model minus coin flip, paired by day) | 95% interval excludes zero, in the model's favour | +0.0321 (+32 dol) (95%: +0.0112 to +0.0529, days=1,006) | PASS |

## The four quantities, in the fixed order

| | trades | days | positive | mean net R | money per $1,000 | 95% range | stopped |
|---|---|---|---|---|---|---|---|
| A — model, bullish (long) | 8,321 | 1,006 | 43.1% | +0.0438 | +44 dollars | +16 dollars to +72 dollars | 38.0% |
| a — coin flip, long | 6,755 | 1,004 | 42.3% | +0.0136 | +14 dollars | -17 dollars to +44 dollars | 38.1% |
| B — model, bearish (short) | 7,764 | 1,006 | 44.0% | +0.0675 | +68 dollars | +37 dollars to +98 dollars | 37.9% |
| b — coin flip, short | 6,702 | 1,005 | 43.1% | +0.0352 | +35 dollars | +0 dollars to +70 dollars | 38.1% |

## The same split inside the test window

| era | bullish signal (A−a) | bearish signal (B−b) | asymmetry |
|---|---|---|---|
| 2012-2013 | +42 dollars (n=4,208) | +38 dollars (n=3,762) | +4 dollars |
| 2014-2015 | +19 dollars (n=4,113) | +27 dollars (n=4,002) | -8 dollars |

## Realised stop width, per side

| arm | side | trades | median stop | % of price | in 14-day ATRs |
|---|---|---|---|---|---|
| model | long | 8,321 | 61¢ | 1.59% | 0.56 |
| model | short | 7,764 | 59¢ | 1.62% | 0.55 |
| coin flip | long | 6,755 | 58¢ | 1.54% | 0.54 |
| coin flip | short | 6,702 | 56¢ | 1.52% | 0.53 |

## Caveats, and what would change the answer

- **This tests a post-hoc finding.** The prior for a subgroup split surviving out of sample is low, and that was written into the gate before the data existed.
- **A−a is unpaired.** Once split by side the model and the control no longer trade the same symbol-days, so these are two populations over one universe and period, not matched trades. Same weakness as the finding.
- **Four intervals on one window** is nearer a 19% false-positive rate than 5%. The Bonferroni-corrected range is printed above.
- **The window is earlier, not later.** There is no forward data — the tape ends on the last completed session. An earlier window is a genuine hold-out for this hypothesis but it is a DIFFERENT market: decimal spreads, venue mix, and the retail flow of 2012 are not those of 2026. A result that holds in both is stronger than one that holds in either; a result that holds only in the old one is a regime statement.
- Fills are modelled from one-minute OHLC and cannot see inside a bar. No live-execution question — borrow, halts, locked markets — has been touched.
- **No leveraged portfolio figure appears anywhere**, by pre-registration.

