# `orb_sip.v1` — the published stocks-in-play ORB, replicated

**Verdict: NOT REPRODUCED.**

Snapshot `polygon-sip-v1`. Replication window 2016-01-01 → 2023-12-31 — the paper's own window — with 2024-01-01 → 2026-08-28 held back and reported separately. Gate: [`../models/orb_sip.v1/GATE.md`](../models/orb_sip.v1/GATE.md), committed before any number below existed.

## In plain English

- **Pool size**: a median **891 names a day** were scored and rankable at 09:35, against a median **892** that passed the paper's universe filter — **100% of the eligible universe was visible to the selector**. The pool is not the binding constraint: `POOL_N` is at or above the eligible count on the typical day, so the selector saw essentially the whole universe the paper defines.
- **Universe**: 892 names on the median day; the distinct set over the whole window is reported under 'the data' below. The paper's is 7,000+ US stocks over 2016-2023.
- **Date range**: 2016-01-01 → 2026-08-28, 2,679 sessions.
- **Trade count**: 32,392 in the replication window, 10,545 held back, 42,937 in total.
- **Did it reproduce**: **NOT REPRODUCED**.

## This harness did not reproduce a published result — and the harness is not the reason

That first clause is the one the gate said to lead with, so it leads. The second is what the post-mortem measured, and it is the more useful half.

**The machinery is straight.** Run the identical entries with the stop removed — 100x the ATR, a level that can essentially never be hit, so every trade runs to the close — and the model returns **+0.017 ATR** of signed move and its coin-flip control **+0.011 ATR**, over 32,392 and 26,959 trades. A replay with a directional bias, a lookahead leak or a fill model that quietly paid or charged the trader does not land within two hundredths of an ATR of zero. That is the same test ENGINE-1 used to certify this instrument, and it gives the same answer on this snapshot. See [the post-mortem](orb_sip.v1.polygon-sip-v1.diagnostics.md).

**What failed is the configuration as the brief specifies it, and one number in it decides everything.** A stop at 10% of the 14-day ATR is a median **12.4 cents** here, 0.35% of price. It is hit on **90.1%** of trades. The 09:30-09:35 candle of a stock in play is a median **0.63 ATR** wide, so the specified stop is about **16%** of the range of the very bar the trade is defined by — it is inside the noise of its own setup. Sweeping only that number: -0.635R at 0.1x, -0.073R at 0.25x, +0.005R at 0.5x, +0.012R at 1x, +0.008R at 2x. Nothing else moves.

**The filter's sign flips with it, and that is the finding worth keeping.** At the specified stop, stocks in play are **0.456R WORSE** than the unfiltered control — the exact opposite of the published claim.

At a 0.5x-ATR stop the same comparison is **+0.0184R** (95%: +0.0002 to +0.0366) and at 1x **+0.0171R** (95%: +0.0065 to +0.0277) — in the paper's direction, with intervals that exclude zero, and about **a hundredth of an R**. The mechanism is not subtle: the filter selects days whose true range dwarfs the trailing ATR the stop is scaled by, so the more abnormal the day, the more certainly the stop is noise.

**The direction call is worth nothing.** Paired against a coin flip on the same symbols, days and stop distances, the model is negative at every stop width tested, including the widest (-0.0564R at the specified stop, -0.0008R unstopped).

### The candidate explanations, enumerated and measured

| candidate | measured | verdict |
|---|---|---|
| the pool was too small | 891 of a median 892 eligible names scored at 09:35; 100% coverage on the median day | **not it** |
| the cost model | zero cost gives -0.553R against -0.723R net | **not it** — costs are 0.170R of a 0.723R loss |
| the fill model | unstopped, hold-to-close control returns within 0.02 ATR of zero | **not it** |
| the window | every calendar year negative, both sides negative, held-back window negative | **not it** |
| the selection definition | the relative-volume gradient is steep and monotone, so the ranking separates days powerfully — in the wrong direction at this stop | **the mechanism, not the fault** |
| **the stop reading** | the brief's own table records the companion ETF paper stopping at the **opposite extreme of the first candle**, a median 0.63 ATR here — about **6x** the 10%-of-ATR reading, and squarely where this shape stops losing | **the live candidate** |
| the entry timing | the published rule may enter at the 09:35 open rather than on a breakout beyond the range; not tested, because testing it is a change to the model and Phase 1 did not reproduce | **untested — the second candidate** |

**Phase 2 does not run.** The gate pre-authorised exactly this: if Phase 1 does not reproduce, the owner's variations are not tested against a baseline that is not a baseline, and no parameter is tuned to rescue the miss. The stop sweep above is a diagnostic and is fenced as one; **it is not a result and no verdict was reached by way of it.** A re-run at a different stop is a NEW model with a NEW pre-registered gate, reported beside this one rather than in place of it.

## The bar, and what it observed

| id | gate | threshold | observed | |
|---|---|---|---|---|
| **R1** | sample | >=5000 trades in the replication window | n=32392 | PASS |
| **R2** | sign | mean gross R > 0 AND mean net R > 0 | gross=-0.6351, net=-0.7229 | FAIL |
| **R3** | direction beats a coin flip (paired, gross) | 95% interval excludes zero, in the model's favour | -0.0564 (95%: -0.0776 to -0.0351, n=23649) | FAIL |
| **R4** | the filter is the thing (net R, in play minus unfiltered) | 95% interval excludes zero, in the model's favour | -0.4631 (95%: -0.5101 to -0.4160, n=2012) | FAIL |
| **R5** | portfolio, directionally consistent with the published result | total return > 0 AND Sharpe >= 1.0 | total=-100.0%, Sharpe=-10.38, maxDD=100.0% | FAIL |

## Gross before net, median beside mean

| arm | n | mean gross R | median gross R | mean net R | median net R | hit | PF |
|---|---|---|---|---|---|---|---|
| stocks in play | 32392 | -0.6351 | -1.0396 | -0.7229 | -1.1488 | 9.2% | 0.46 |
| unfiltered control | 33893 | -0.1795 | -1.0331 | -0.2636 | -1.1128 | 15.2% | 0.74 |
| matched coin flip | 26959 | -0.6940 | -1.0403 | -0.7816 | -1.1501 | 9.8% | 0.43 |

All three arms use the same rules, the same costs and the same fills. The unfiltered control differs from the stocks-in-play arm in the ranking key and in nothing else; the coin flip differs in the direction call and in nothing else.

### The two controls, read properly

**Against the coin flip, paired, gross:** -0.0564R (95%: -0.0776 to -0.0351) over 23,649 (symbol, day) pairs where both arms traded. This is R3, and it is the number that says whether the direction call is worth anything once the day has already been chosen.

**Against the unfiltered control, paired by day, net:** -0.4631R (95%: -0.5101 to -0.4160) over 2,012 days both arms traded. This is R4, and it is the number the whole lane exists for: the paper's claim is that the relative-volume filter does almost all the work.

*Diagnostic, not a gate:* the same comparison unpaired at trade level is -0.4592R (95%: -0.5032 to -0.4153), n=32,392 against 33,893. It is reported because the day-level pairing in R4 spends power to remove a day effect, and a reader should be able to see both. The gate is the paired one, because that is what was written down.

## The portfolio, which is what the published number is

1% of equity risked a position, gross exposure capped at 4x, all of a day's positions scaled down together when the cap binds, compounded daily from $100,000.

| | in play (replication) | in play (whole window) | unfiltered (replication) |
|---|---|---|---|
| total return | -100.0% | -100.0% | -99.8% |
| CAGR | -90.3% | -91.4% | -54.5% |
| Sharpe | -10.38 | -11.45 | -5.00 |
| max drawdown | 100.0% | 100.0% | 99.8% |
| days the 4x cap bound | 2012/2012 | 2679/2679 | 2012/2012 |

**Published, for comparison: 1,637% and a 2.81 Sharpe on stocks in play, 29% and 0.48 unfiltered.** The rows above are on our pool, our window and our cost model, and are not claimed to be the same experiment.

## Slices

| slice | n | hit | mean R | median R | mean % | payoff | PF | total R | maxDD R | max losing run |
|---|---|---|---|---|---|---|---|---|---|---|
| in play, replication window | 32392 | 9.2% | -0.723 | -1.149 | -0.280% | 4.52 | 0.46 | -23415.1 | 23420.5 | 86 |
| in play, held back | 10545 | 8.1% | -0.834 | -1.136 | -0.328% | 4.51 | 0.40 | -8792.6 | 8789.3 | 98 |
| unfiltered, replication window | 33893 | 15.2% | -0.264 | -1.113 | -0.081% | 4.12 | 0.74 | -8934.7 | 8960.5 | 63 |
| unfiltered, held back | 11118 | 14.9% | -0.314 | -1.093 | -0.092% | 3.92 | 0.69 | -3494.1 | 3511.4 | 50 |
| coin flip, replication window | 26959 | 9.8% | -0.782 | -1.150 | -0.312% | 3.90 | 0.43 | -21070.6 | 21075.0 | 96 |

### By year, stocks in play, net R

| slice | n | hit | mean R | median R | mean % | payoff | PF | total R | maxDD R | max losing run |
|---|---|---|---|---|---|---|---|---|---|---|
| 2016 | 3987 | 10.8% | -0.648 | -1.162 | -0.177% | 4.23 | 0.51 | -2583.2 | 2596.1 | 60 |
| 2017 | 3928 | 7.8% | -0.926 | -1.186 | -0.262% | 4.36 | 0.37 | -3639.2 | 3636.1 | 108 |
| 2018 | 3985 | 8.9% | -0.727 | -1.157 | -0.246% | 4.74 | 0.46 | -2898.9 | 2897.4 | 61 |
| 2019 | 4037 | 9.4% | -0.745 | -1.162 | -0.245% | 4.35 | 0.45 | -3007.5 | 3003.8 | 73 |
| 2020 | 4127 | 9.6% | -0.664 | -1.117 | -0.324% | 4.53 | 0.48 | -2738.7 | 2799.7 | 68 |
| 2021 | 4184 | 8.3% | -0.771 | -1.134 | -0.416% | 4.70 | 0.43 | -3226.0 | 3241.7 | 53 |
| 2022 | 4082 | 10.9% | -0.483 | -1.106 | -0.245% | 4.84 | 0.59 | -1971.2 | 1990.9 | 61 |
| 2023 | 4062 | 8.1% | -0.825 | -1.152 | -0.319% | 4.58 | 0.40 | -3350.4 | 3349.3 | 61 |
| 2024 | 3968 | 7.2% | -0.954 | -1.164 | -0.357% | 4.41 | 0.34 | -3786.8 | 3783.5 | 69 |
| 2025 | 3942 | 8.1% | -0.788 | -1.130 | -0.316% | 4.80 | 0.43 | -3104.7 | 3103.7 | 81 |
| 2026 | 2635 | 9.2% | -0.721 | -1.098 | -0.303% | 4.32 | 0.44 | -1901.1 | 1907.1 | 71 |

### By side, replication window

| slice | n | hit | mean R | median R | mean % | payoff | PF | total R | maxDD R | max losing run |
|---|---|---|---|---|---|---|---|---|---|---|
| long | 16143 | 9.1% | -0.728 | -1.149 | -0.274% | 4.51 | 0.45 | -11747.7 | 11753.8 | 73 |
| short | 16249 | 9.3% | -0.718 | -1.148 | -0.286% | 4.52 | 0.46 | -11667.3 | 11663.9 | 106 |

### By relative-volume decile, replication window

| slice | n | hit | mean R | median R | mean % | payoff | PF | total R | maxDD R | max losing run |
|---|---|---|---|---|---|---|---|---|---|---|
| rvol 1.0-3.0 | 3240 | 14.5% | -0.273 | -1.121 | -0.101% | 4.36 | 0.74 | -885.0 | 903.7 | 44 |
| rvol 3.0-3.5 | 3239 | 12.1% | -0.393 | -1.131 | -0.150% | 4.71 | 0.65 | -1273.8 | 1302.4 | 61 |
| rvol 3.5-3.9 | 3239 | 10.5% | -0.495 | -1.131 | -0.218% | 4.92 | 0.58 | -1602.1 | 1611.7 | 62 |
| rvol 3.9-4.5 | 3239 | 10.0% | -0.561 | -1.135 | -0.214% | 4.87 | 0.54 | -1816.2 | 1841.3 | 92 |
| rvol 4.5-5.1 | 3239 | 9.2% | -0.658 | -1.147 | -0.249% | 4.79 | 0.49 | -2130.8 | 2144.2 | 60 |
| rvol 5.1-5.9 | 3239 | 8.6% | -0.729 | -1.153 | -0.271% | 4.83 | 0.46 | -2362.4 | 2377.8 | 71 |
| rvol 5.9-7.1 | 3239 | 7.8% | -0.806 | -1.162 | -0.330% | 4.99 | 0.42 | -2610.4 | 2608.1 | 69 |
| rvol 7.1-9.3 | 3239 | 6.6% | -0.942 | -1.165 | -0.347% | 5.08 | 0.36 | -3050.0 | 3054.3 | 74 |
| rvol 9.3-14.9 | 3239 | 6.2% | -1.118 | -1.186 | -0.411% | 4.53 | 0.30 | -3620.1 | 3619.7 | 71 |
| rvol 14.9-1527.7 | 3240 | 6.5% | -1.254 | -1.195 | -0.511% | 3.73 | 0.26 | -4064.3 | 4071.1 | 82 |

### Exit mix and stop geometry, replication window

- median stop distance **12.4 cents**, 0.346% of price
- commission alone is **0.080R** of the median trade; a tenth of an ATR is a very tight stop and the cost fraction is `cost per share / stop distance`, which is the law ENGINE-4 and ENGINE-5 measured twice
- exits: {'stop': 29188, 'time': 3204}
- trades resolved by the stop-before-target assumption: 0

## Cost sensitivity — disclosed, and not a result

The pre-registered cost model is $0.005/share/side plus 1.0 bp of adverse slippage. Cost as a fraction of risk is `cost per share / stop distance`, and a tenth of an ATR is the tightest stop this programme has traded, so the fraction is the largest it has been. These rows re-run the identical selection under two other cost models. **The gate is after the pre-registered costs and does not move.**

| cost model | n | mean R | median R | hit | PF |
|---|---|---|---|---|---|
| pre-registered (the result) | 32392 | -0.7229 | -1.1488 | 9.2% | 0.46 |
| quarter-bp slippage | 32392 | -0.6620 | -1.1201 | 9.5% | 0.49 |
| zero cost (true gross) | 32392 | -0.5531 | -1.0000 | 9.7% | 0.54 |

## Census

| | stocks in play | unfiltered |
|---|---|---|
| days_seen | 53,573 | 53,578 |
| signals | 53,183 | 52,578 |
| signals_long | 26,751 | 26,412 |
| signals_short | 26,432 | 26,166 |
| skip_doji_opening_candle | 381 | 831 |
| skip_zero_width_range | 9 | 169 |
| symbol-days with no cached bars | 0 | 0 |

## Selection, and the lookahead treatment

- pool: top 1,000 of the eligible set by 20-day average dollar volume as of the prior close
- selection: top 20 by 09:30-09:35 volume over the mean of the same five minutes across the previous 14 sessions, floor 1.0
- realised relative volume of the selected: median 5.08x, p90 14.88x, max 1527.7x
- the parquet on disk holds only 09:30-10:30 of each session, so the afternoon of the day being selected for was never written; `tests/test_sip_selection.py` runs the poisoned-future and amputated-future attacks against `select_day`, requires an identical selection when the rest of the session is deleted from disk, and catches a deliberately cheating selector with the same harness

## The data, audited

- grouped daily: **2,743 of 2,743 sessions**, 26,452,066 ticker-days, 0 missing, 0 on a day the market was shut
- opening 5-minute bars: 2,679 of 2,679 sessions, 0 missing; a median 892 names a day pass the universe filter and **100% of them have a 09:30 bar** (10th percentile 95%, worst day 46%)
- one-minute sessions: 107,304 symbol-days, 40,481,206 bars, median 388 a session, 0 empty, 1605 thin, 0 on a day the market was shut

### Where the picks sit in the liquidity list

Of 53,573 picks, ranked by 20-day average dollar volume within the day's eligible universe (1 = most liquid): median rank **521**, p90 **848**, **14%** in the bottom fifth of the pool.

If the picks crowd the bottom of the pool, the pool boundary is what is deciding the selection and a larger pool would change the result. If they are spread through it, the boundary is not the binding constraint. This is the first number to read if Phase 1 misses.

## Costs and fills

- $0.005/share/side commission, 1.0 bp adverse slippage on market and stop fills
- entry is a resting stop order, filled at the worse of the level and the bar's open, plus slippage; a bar containing both the stop and the target is resolved as the stop

