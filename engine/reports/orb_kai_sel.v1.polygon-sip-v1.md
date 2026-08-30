# `orb_kai_sel.v1` — three selectors, one set of rules, one honest comparison

**Verdict: RELVOL HOLDS.** Decided on the held-back year 2025-08-29 → 2026-08-28 and on nothing else.

Snapshot `polygon-sip-v1` for the tape and the universe, unchanged. Kai's score is computed from the same grouped daily bars, split-adjusted to match what the live scanner reads. Gate: [`../models/orb_kai_sel.v1/GATE.md`](../models/orb_kai_sel.v1/GATE.md), committed before any number below existed.

## In plain English

**What was compared.** Every trading day, pick twenty US stocks and trade each of them the same way: buy a break above the high of the 09:30-09:35 candle if that candle closed up, sell short a break below its low if it closed down, get out at the other end of the same candle if it comes back through, otherwise hold to the closing bell. Nothing about that changes between the three arms. **The only thing that changes is how the twenty names are picked.**

- **relvol** — the twenty whose first five minutes traded the most abnormal volume against their own recent mornings. This is what already works, and it is the thing to beat.
- **kai** — the twenty with the highest Kai breakout score, computed from the daily chart as of the previous close.
- **both** — the twenty that rank best on the two put together.

**The honest prior, up front.** Kai's score has a measured track record and it is poor. On the project's own grading of 167 alerts (2026-05-15 → 07-14), the A band (score 80+, n=126) returned **−0.56%** over five days and won 47.6% of the time, while the D band (under 60, n=12) returned −0.63% and won **58.3%**. There is no monotonic relationship and the top band underperformed the bottom one. That measured the score as a SWING selector over five to ten days, which is a different job from choosing what to day-trade — so it is a prior, not a prediction, and it is printed here whichever way the result goes.

**Three arms on one held-back year is three chances to look good by luck.** Two of them are compared against the incumbent, so with two shots at a 5% test the chance that at least one clears by chance alone is nearer 10% than 5%. The gate is the 95% interval, as it has been in every lane; the stricter interval that corrects for taking two shots is printed beside every comparison below.

- **relvol (the incumbent)** — 3,969 trades in the held-back year. After commission and slippage the average trade returned **+0.0166** times what was risked on it, i.e. **+17 dollars a trade** for a trader risking $1,000. The middle trade returned -0.1058 (-106 dollars), 45.1% finished green and 31.3% were stopped out. The 95% range around the average is -17 dollars to +51 dollars**, which contains zero**, so that average is not distinguishable from breaking even at this sample size.
- **kai (the score)** — 4,225 trades in the held-back year. After commission and slippage the average trade returned **-0.0542** times what was risked on it, i.e. **-54 dollars a trade** for a trader risking $1,000. The middle trade returned -0.5861 (-586 dollars), 39.0% finished green and 46.8% were stopped out. The 95% range around the average is -94 dollars to -14 dollars, which is entirely below zero — this arm lost money by more than the sample noise.
- **both (score and volume)** — 4,079 trades in the held-back year. After commission and slippage the average trade returned **-0.0151** times what was risked on it, i.e. **-15 dollars a trade** for a trader risking $1,000. The middle trade returned -0.2433 (-243 dollars), 42.6% finished green and 38.6% were stopped out. The 95% range around the average is -51 dollars to +21 dollars**, which contains zero**, so that average is not distinguishable from breaking even at this sample size.

- **kai minus relvol**, paired day by day: **-73 dollars** a trade on $1,000 of risk (-0.0731R), with a 95% range of -133 dollars to -14 dollars, over 251 days both arms traded. **That range lies entirely below zero: the challenger did not merely fail to beat the incumbent, it lost to it by more than the sample noise.** It still does once corrected for taking two shots (-141 dollars to -5 dollars).
- **both minus relvol**, paired day by day: **-33 dollars** a trade on $1,000 of risk (-0.0334R), with a 95% range of -79 dollars to +12 dollars, over 251 days both arms traded. That range contains zero, so no difference is established — though the middle number is negative, so what evidence there is points the wrong way for the challenger.

- **Verdict**: **RELVOL HOLDS**.

**The incumbent held.** Neither challenger beat abnormal opening volume by a margin that clears its own error bar, so nothing changes and the selector that ENGINE-7 measured stays as it is. That is a useful result: the cheapest way to break a working system is to replace its one measured component with a number that has never been measured.

**Which gates carried the verdict, in words.** K1 passed (sample, per arm (held back)). K2 FAILED (`kai` beats `relvol` (held back, paired by day, net R)). K3 FAILED (`both` beats `relvol` (held back, paired by day, net R)). K4 FAILED (sign, per arm (held back)). K5 FAILED (portfolio, per arm (held back)).

**K4 and K5 are read across all three arms, so read them per arm before concluding anything about the incumbent.** On its own, `relvol` made money gross (+0.0274R) and net (+0.0166R, +17 dollars a trade) and returned +23.9% as a portfolio at a Sharpe of 0.75 — below the 1.0 the gate asked for, so K5 misses on the incumbent too. The challengers lost money on both measures. K4 and K5 failing is therefore mostly a statement about the challengers, and it is printed as one number per arm in the table below rather than as a single verdict a reader could misread.

## The bar, and what it observed

All five gates are read on the held-back year only.

| id | gate | threshold | observed | |
|---|---|---|---|---|
| **K1** | sample, per arm (held back) | >=3,000 trades in each arm | relvol=3,969, kai=4,225, both=4,079 | PASS |
| **K2** | `kai` beats `relvol` (held back, paired by day, net R) | 95% interval excludes zero, in the challenger's favour | -0.0731 (95%: -0.1326 to -0.0137, n=251) | FAIL |
| **K3** | `both` beats `relvol` (held back, paired by day, net R) | 95% interval excludes zero, in the challenger's favour | -0.0334 (95%: -0.0793 to +0.0124, n=251) | FAIL |
| **K4** | sign, per arm (held back) | mean gross R > 0 AND mean net R > 0 | relvol: gross=+0.0274/net=+0.0166, kai: gross=-0.0354/net=-0.0542, both: gross=-0.0005/net=-0.0151 | FAIL |
| **K5** | portfolio, per arm (held back) | total return > 0 AND Sharpe >= 1.0 | relvol: +23.9% @ 0.75, kai: -48.6% @ -2.49, both: -33.7% @ -1.20 | FAIL |

## The held-back year, 2025-08-29 → 2026-08-28 — gross before net, median beside mean

| arm | n | mean gross R | median gross R | mean net R | median net R | $ per $1,000 risked | hit | PF | stopped |
|---|---|---|---|---|---|---|---|---|---|
| relvol | 3,969 | 0.0274 | -0.0975 | 0.0166 | -0.1058 | +17 | 45.1% | 1.04 | 31.3% |
| kai | 4,225 | -0.0354 | -0.5701 | -0.0542 | -0.5861 | -54 | 39.0% | 0.90 | 46.8% |
| both | 4,079 | -0.0005 | -0.2326 | -0.0151 | -0.2433 | -15 | 42.6% | 0.97 | 38.6% |

Same rules, same costs, same fills, same candidate pond. The arms differ in the ranking key and in nothing else.

### The reference point that makes a losing arm readable

**Diagnostic, not a gate and not a fourth arm.** ENGINE-6 built a control that picks twenty names a day out of the same eligible pool by a deterministic hash — a coin toss with the ranking key removed — and ENGINE-7 reported it. Replayed here on the same held-back year, under the same rules, it is the row a losing selector has to be read against: a selector that ranks worse than this is doing something actively wrong, and one that ranks the same as it is doing nothing.

| arm | n | mean gross R | mean net R | median net R | $ per $1,000 risked | hit | PF | stopped |
|---|---|---|---|---|---|---|---|---|
| relvol | 3,969 | 0.0274 | 0.0166 | -0.1058 | +17 | 45.1% | 1.04 | 31.3% |
| kai | 4,225 | -0.0354 | -0.0542 | -0.5861 | -54 | 39.0% | 0.90 | 46.8% |
| both | 4,079 | -0.0005 | -0.0151 | -0.2433 | -15 | 42.6% | 0.97 | 38.6% |
| **random 20 (the coin toss)** | 4,160 | -0.0174 | -0.0372 | -0.5647 | -37 | 39.6% | 0.93 | 46.8% |

Kai's score returned -54 dollars a trade against the coin toss's -37 dollars, and stopped out on 46.8% of trades against the coin toss's 46.8%. Paired day by day, `kai` minus the coin toss is -19 dollars a trade (95%: -81 dollars to +43 dollars, n=251). **Its interval contains zero: on this year and under these rules, ranking the pool by Kai's breakout score was worth nothing measurable against not ranking it at all.**

That is the finding underneath the verdict, and it is the one worth remembering: the failure is not that Kai's score picks a slightly less good twenty than relative volume does. It is that, as a day-trade selector, it is not distinguishable from drawing names out of a hat — while relative volume is.

### The two comparisons against the incumbent, paired by day

| comparison | n days | mean diff R | $ per $1,000 | 95% interval | 97.5% (two comparisons) | clears 95% |
|---|---|---|---|---|---|---|
| kai − relvol | 251 | -0.0731 | -73 | -0.1326 to -0.0137 | -0.1411 to -0.0051 | no |
| both − relvol | 251 | -0.0334 | -33 | -0.0793 to +0.0124 | -0.0859 to +0.0190 | no |

Paired by day rather than by trade because trades taken on the same morning are not independent of each other; the day effect is exactly what a comparison of selectors has to remove.

*Diagnostic, not a gate:* kai minus relvol unpaired at trade level is -0.0709R (95%: -0.1234 to -0.0184), n=4,225 against 3,969.
*Diagnostic, not a gate:* both minus relvol unpaired at trade level is -0.0317R (95%: -0.0814 to +0.0180), n=4,079 against 3,969.

### Held back, by arm and side

| slice | n | hit | mean R | median R | mean % | payoff | PF | total R | maxDD R | max losing run |
|---|---|---|---|---|---|---|---|---|---|---|
| relvol long | 2059 | 44.4% | 0.003 | -0.126 | 0.054% | 1.26 | 1.01 | 6.9 | 53.9 | 12 |
| relvol short | 1910 | 45.9% | 0.031 | -0.083 | 0.041% | 1.27 | 1.08 | 59.2 | 28.8 | 11 |
| kai long | 2215 | 39.1% | -0.074 | -0.608 | -0.070% | 1.35 | 0.86 | -163.6 | 211.8 | 13 |
| kai short | 2010 | 39.0% | -0.033 | -0.566 | 0.021% | 1.47 | 0.94 | -65.5 | 81.8 | 12 |
| both long | 2113 | 42.5% | -0.010 | -0.242 | -0.022% | 1.32 | 0.98 | -20.2 | 58.1 | 13 |
| both short | 1966 | 42.7% | -0.021 | -0.245 | -0.014% | 1.28 | 0.95 | -41.4 | 72.2 | 12 |

### How different are the three lists, actually

| | picks a day | overlap with relvol | overlap with kai |
|---|---|---|---|
| relvol | 20.0 | 20.0 | 0.9 |
| kai | 20.0 | 0.9 | 20.0 |
| both | 19.8 | 3.7 | 6.7 |

If two selectors pick mostly the same names, the comparison between them is a comparison of the few names they disagree about, whatever the trade count says.

### And what kind of name does each one pick

| arm | median relative volume | median Kai score | share with a Kai score |
|---|---|---|---|
| relvol | 5.27x | 52 | 23% |
| kai | 0.96x | 71 | 100% |
| both | 2.11x | 61 | 100% |

The two keys are measuring different things, and this is the table that says so: a name can be the busiest stock of the morning and have no Kai score at all, because Kai's score requires a fresh trend-cloud flip on the DAILY chart and most busy mornings do not come with one.

**The incumbent arm is not a re-implementation of ENGINE-6's selector; it is the same one.** On the 1,255 sessions the two lanes share, the `relvol` picks here are identical to the names ENGINE-6 wrote to `selection.json.gz` on **1,255** of them (100.00%). Anything the challengers gain or lose is measured against the thing ENGINE-7 actually reported.

## Why the losing arms lose: the stop is the opening range, and a quiet name has a narrow one

The stop in `orb_sip.v2` is the far end of the 09:30-09:35 candle, so the risk on a trade IS the width of that candle. Relative volume selects names whose first five minutes were abnormally busy, and a busy five minutes is a WIDE five minutes. Kai's score selects names that are coiled on the daily chart, and most of them open quietly. Same rule, different geometry — and cost as a fraction of risk is `cost per share / stop distance`, which is the law ENGINE-4 and ENGINE-5 measured twice.

| arm | median stop distance | as % of price | in 14-day ATRs | commission as a share of risk | stopped out |
|---|---|---|---|---|---|
| relvol | 164.2 cents | 2.931% | 0.719 | 0.0061R | 31.3% |
| kai | 84.4 cents | 1.257% | 0.355 | 0.0118R | 46.8% |
| both | 113.6 cents | 1.809% | 0.464 | 0.0088R | 38.6% |
| **random 20** | 76.8 cents | 1.192% | 0.476 | 0.0130R | 46.8% |

This is a mechanism, not an excuse. A selector has to be judged on the trade it produces under the rules that are actually being traded, and these are the rules ENGINE-7 measured. But it does say where a fix would have to start if anyone wanted the score to work: not by re-weighting the components, but by pairing it with an entry whose risk is not the width of a candle the score never looked at.

## The portfolio

1% of equity risked a position, gross exposure capped at 4x, a day's positions scaled down together when the cap binds, compounded daily from $100,000. **The held-back column is the one that counts.**

| arm | total return (held back) | CAGR | Sharpe | max drawdown | days the 4x cap bound | total return (build window) |
|---|---|---|---|---|---|---|
| relvol | +23.9% | +24.0% | 0.75 | 25.8% | 227/251 | +344.8% |
| kai | -48.6% | -48.8% | -2.49 | 53.0% | 251/251 | -91.4% |
| both | -33.7% | -33.8% | -1.20 | 46.9% | 250/251 | -82.5% |

**Read the leverage before the return.** A portfolio number here is a statement about four-times-levered intraday exposure across twenty concurrent positions, not about the per-trade edge. The per-trade edge is the table above it.

## The build window, 2021-08-29 → 2025-08-28 — a disclosure, not a verdict

Nothing here can raise or lower the verdict. It is printed so a reader can see whether the held-back year looks like the four before it, and because `orb_sip.v2`'s stop width was chosen by reading a sweep of 2016-2023 — which overlaps 2021-2023 inside this window.

| arm | n | mean gross R | mean net R | median net R | $ per $1,000 | hit | PF | stopped |
|---|---|---|---|---|---|---|---|---|
| relvol | 16,172 | 0.0335 | 0.0181 | -0.1651 | +18 | 43.9% | 1.04 | 34.7% |
| kai | 17,026 | -0.0348 | -0.0613 | -1.0069 | -61 | 36.8% | 0.89 | 50.8% |
| both | 16,487 | -0.0038 | -0.0244 | -0.3560 | -24 | 40.5% | 0.95 | 42.9% |

| comparison (build window) | n days | mean diff R | 95% interval |
|---|---|---|---|
| kai − relvol | 1,004 | -0.0803 | -0.1107 to -0.0499 |
| both − relvol | 1,004 | -0.0448 | -0.0688 to -0.0209 |

### By calendar year, all three arms

| slice | n | hit | mean R | median R | mean % | payoff | PF | total R | maxDD R | max losing run |
|---|---|---|---|---|---|---|---|---|---|---|
| relvol 2021 | 1452 | 43.2% | 0.023 | -0.176 | 0.133% | 1.38 | 1.05 | 33.0 | 38.0 | 11 |
| relvol 2022 | 4082 | 43.8% | 0.028 | -0.208 | 0.113% | 1.36 | 1.06 | 116.3 | 57.7 | 14 |
| relvol 2023 | 4062 | 42.6% | 0.000 | -0.196 | -0.018% | 1.35 | 1.00 | 0.6 | 86.7 | 13 |
| relvol 2024 | 3968 | 44.0% | 0.026 | -0.143 | 0.091% | 1.35 | 1.06 | 102.1 | 41.2 | 13 |
| relvol 2025 | 3942 | 44.5% | 0.006 | -0.134 | 0.031% | 1.27 | 1.01 | 22.9 | 32.6 | 14 |
| relvol 2026 | 2635 | 47.1% | 0.032 | -0.059 | 0.143% | 1.22 | 1.08 | 84.3 | 41.4 | 14 |
| kai 2021 | 1506 | 38.0% | -0.062 | -0.709 | -0.145% | 1.45 | 0.89 | -93.2 | 106.2 | 15 |
| kai 2022 | 4302 | 35.3% | -0.049 | -1.011 | -0.048% | 1.68 | 0.92 | -211.5 | 280.7 | 16 |
| kai 2023 | 4222 | 36.9% | -0.036 | -1.010 | 0.006% | 1.60 | 0.94 | -153.2 | 201.5 | 15 |
| kai 2024 | 4264 | 37.7% | -0.069 | -0.707 | -0.047% | 1.45 | 0.88 | -293.4 | 318.9 | 17 |
| kai 2025 | 4150 | 37.5% | -0.075 | -0.732 | -0.060% | 1.44 | 0.87 | -312.2 | 324.8 | 13 |
| kai 2026 | 2807 | 39.3% | -0.075 | -0.558 | -0.058% | 1.33 | 0.86 | -209.7 | 223.8 | 13 |
| both 2021 | 1462 | 41.2% | -0.032 | -0.310 | -0.075% | 1.33 | 0.94 | -46.3 | 100.7 | 13 |
| both 2022 | 4158 | 38.0% | -0.041 | -0.634 | -0.080% | 1.51 | 0.93 | -168.9 | 219.2 | 16 |
| both 2023 | 4120 | 40.8% | 0.004 | -0.333 | -0.038% | 1.46 | 1.01 | 18.4 | 123.0 | 15 |
| both 2024 | 4085 | 41.6% | -0.012 | -0.285 | 0.016% | 1.37 | 0.97 | -50.9 | 114.5 | 13 |
| both 2025 | 4027 | 42.1% | -0.027 | -0.263 | 0.005% | 1.30 | 0.94 | -110.2 | 119.8 | 12 |
| both 2026 | 2714 | 42.5% | -0.039 | -0.235 | -0.089% | 1.24 | 0.91 | -106.3 | 125.4 | 13 |

## Does the score rank, within the names it picked?

The comparison above asks whether Kai's score picks a better twenty. This asks the narrower question the honest prior failed: inside the twenty it did pick, does a higher score mean a better trade?

| slice | n | hit | mean R | median R | mean % | payoff | PF | total R | maxDD R | max losing run |
|---|---|---|---|---|---|---|---|---|---|---|
| D (<60) | 67 | 43.3% | 0.041 | -0.788 | 0.126% | 1.41 | 1.08 | 2.7 | 11.0 | 6 |
| C (60-69) | 1712 | 36.7% | -0.102 | -0.863 | 0.020% | 1.41 | 0.82 | -174.7 | 180.1 | 11 |
| B (70-79) | 1883 | 40.4% | -0.025 | -0.472 | -0.063% | 1.41 | 0.95 | -46.4 | 87.8 | 14 |
| A (80+) | 563 | 40.9% | -0.019 | -0.457 | -0.065% | 1.39 | 0.96 | -10.7 | 37.5 | 9 |

Split at the median score (71): the higher half returned -0.0220R net (n=2,303), the lower half -0.0929R (n=1,922), a difference of +0.0710R (95%: -0.0092 to +0.1511).

The live scanner only sends an alert at a score of 55 or better. 4,221 of 4,225 held-back `kai` picks (100%) would have cleared that floor.

## What was ported, and what could not be

The score here is `CheatCodeScanner.score_cheatcode` from `~/breakout-alert-system`, with the CCA V5 indicators from `cheatcode_engine.py` — CheatCode Trend Clouds, the swing oscillator, squeeze momentum, the EMA cloud — plus the `AlertBase` helpers (Wilder RSI, Bollinger %B) and `pattern_engine`'s pivot-cluster support and resistance. `engine/kai_score/reference_cca.py` holds a verbatim copy of all of it, and `tests/test_kai_score.py` requires the fast port to return the identical integer score, component by component, on hundreds of ticker-days. `engine/kai_score/verify_port.py` runs the same comparison against the REAL tape — halted sessions, one-cent ranges, week-long gaps, names that listed inside the window — and reported **720 ticker-days checked, 157 of them scored, 0 mismatches** on 2026-08-29.

**Reproduced exactly:** all ten components and their arithmetic; the two-stage funnel (a 100-calendar-day fetch to find a fresh trend-cloud flip and set the direction, then a 190-calendar-day fetch to score); the $5 price and 500,000-share floors; the window-dependent Wilder RSI seed; the fact that the '52-week' proximity is measured over the ~180 calendar days actually fetched and not over 52 weeks.

**Two defects in the live code, reproduced rather than fixed:**

1. `ema_cloud` writes `ema_fast_bullish` / `ema_slow_bullish`; the scorer reads `ema_fast_bull` / `ema_slow_bull`. The keys do not match, so the **EMA-cloud component — a tenth of the score, nominally 0-10 — has never contributed a single point.** It contributes none here either.
2. `CheatCodeScanner` calls `engine.supertrend(...)` on a `CheatCodeEngine` instance, and that class defines no such method — the indicators are module-level functions. Every call raises inside the scanner's own `try/except`, so **`CheatCodeScanner.scan_market()` returns an empty list today, for every ticker.** This lane scores what the scanner was written to compute, not the nothing it currently returns.

**Not reproducible, and why:**

- **The score in the honest prior is a different number.** The graded alerts in `alert_performance_honest` come from the V5 composite in `kai_morning_alerts.py`, not from `score_cheatcode`. That composite reads market capitalisation from a fundamentals API as of the scan, a sector stance from a live market-bias call, premarket volume, a hand-maintained popular-ticker list and a news-catalyst lookup. Several of those are not recoverable as of a past date, and the ones that are would be lookahead. **It cannot be backtested honestly, and this report does not claim to have tested it.** The brief names `score_cheatcode`, and that is what was ported.
- **Data vendor.** The live scanner reads Polygon daily aggregates with `adjusted=true` per ticker. The cache here holds unadjusted grouped bars, deliberately, because the universe filter is 'price over $5 as a trader saw it'. Polygon's splits reference table was fetched once and used to back-adjust the price and volume series to the state a scan on that date would have seen — splits strictly at or before the as-of date, never after. Every component of the score is scale-invariant, so this is exact up to the two absolute floors, which are applied in as-of-date money. It matters for **18,946 of 1,181,973 pool ticker-days (1.60%) across 477 distinct names** — the ones whose scoring window contained a split. Without the adjustment each of those would have been scored on a chart with a one-day collapse or spike in it that never happened.
- **The funnel caps.** The live scanner truncates to the 25 highest volume ratios before scoring — an API budget — and drops anything under a score of 55. Neither is applied. Applying the first would smuggle relative volume into the `kai` arm and confound the two things this lane is trying to separate; the second is a floor on how many alerts to send, not a ranking rule. The share of picks that would have cleared 55 is reported above.
- **The regime gate and the cooldown.** The live scanner skips the whole scan when the market regime is CHOPPY, and suppresses a ticker alerted in the last seven days. The first needs a live market-bias call; the second is an alert-hygiene rule, not a selector. Neither is applied.
- **As of when.** The live scanner runs during the session and reads today's partial daily bar as the last bar. Doing that here would be reading the bar of the session being traded. The as-of bar is the last FULLY CLOSED daily bar, so the score for a Monday is a function of Friday's close and is knowable at 09:30.

## Census and coverage

- sessions planned: **1,255**
- candidates a day: median **985** of a 987-name pool — pool names with an opening bar and a full 14-session baseline
- of those, **185** on the median day had a Kai score at all (20% — the rest had no fresh trend-cloud flip in their last three daily bars, so the live scanner would never have scored them)

| | relvol | kai | both |
|---|---|---|---|
| days_seen | 25,100 | 25,100 | 24,790 |
| signals | 24,956 | 24,821 | 24,592 |
| signals_long | 12,634 | 12,666 | 12,500 |
| signals_short | 12,322 | 12,155 | 12,092 |
| skip_doji_opening_candle | 142 | 249 | 196 |
| skip_zero_width_range | 2 | 30 | 2 |
| symbol-days with no cached bars | 0 | 0 | 0 |

## Cost sensitivity — disclosed, and not a result

The pre-registered cost model is $0.005/share/side plus 1.0 bp of adverse slippage, unchanged for the ninth time. **The gate is after the pre-registered costs and does not move.**

| arm | cost model | n | mean R | median R | hit | PF |
|---|---|---|---|---|---|---|
| relvol | pre-registered (the result) | 3,969 | 0.0166 | -0.1058 | 45.1% | 1.04 |
| relvol | quarter-bp slippage | 3,969 | 0.0253 | -0.0992 | 45.3% | 1.06 |
| relvol | zero cost (true gross) | 3,969 | 0.0391 | -0.0904 | 45.7% | 1.10 |
| kai | pre-registered (the result) | 4,225 | -0.0542 | -0.5861 | 39.0% | 0.90 |
| kai | quarter-bp slippage | 4,225 | -0.0393 | -0.5761 | 39.3% | 0.93 |
| kai | zero cost (true gross) | 4,225 | -0.0151 | -0.5577 | 39.7% | 0.97 |

## How sure we actually are, and what would change the answer

- The verdict rests on ONE calendar year — 251 sessions — and on the trade counts in the table above. One year is one regime.
- **This is the held-back year's third reading.** ENGINE-7's held-back window (2024-01-01 → 2026-08-28) contained all of it, and ENGINE-8's did too. Every reading costs some of what makes a held-back window worth holding back, and no correction is applied. What is new in this lane is only the selector; the rules downstream have been read on this year before.
- **`orb_sip.v2`'s stop width was chosen by looking at a sweep of 2016-2023.** That does not touch the held-back year, but it does mean the build window above inherits the contamination for 2021-2023.
- **Two comparisons, one year.** The Bonferroni column in the comparison table is the size of that problem, printed rather than argued about.
- **What would change the answer, in order of how much it would move it:** (1) the fill model — every entry is a resting stop order filled at the worse of the level and the bar's open, and real fills on the morning's most volatile names are worse than that; (2) borrow on the short side, which this harness does not model at all; (3) the pool, which is the top 1,000 of the eligible universe by dollar volume rather than all of it, and which bites the `kai` arm differently from the `relvol` arm because a coiled small-cap is exactly what the pool boundary removes; (4) the 4x leverage cap, which decides how much of any per-trade edge survives into a portfolio number.
- **What this report does NOT establish**: that any of these three selectors is worth trading. It establishes which of them ranked better on one held-back year, under one set of downstream rules that has itself only ever come back PARTIAL.

## Selection, and the lookahead treatment

- pool: top 1,000 of the eligible set by 20-day average dollar volume as of the prior close — ENGINE-6's pool, unchanged
- candidates: pool names with a 09:30-09:35 bar today and a full 14-session baseline, so a relative volume exists. All three arms rank the same list.
- `relvol`: top 20 by that relative volume, floor 1.0
- `kai`: top 20 by Kai's breakout score on the last fully closed daily bar
- `both`: among names with both keys, the 20 smallest sums of the two within-day ranks
- the opening-bar parquet holds only 09:30-10:30, so the afternoon of the day being selected for was never written; the daily bars stop at the prior close by construction. `tests/test_kai_score.py` runs the poisoned-future and amputated-future attacks against the score and catches a deliberately cheating scorer with the same harness; `tests/test_sip_selection.py` does the same for the relative-volume ranking.

## Costs and fills

- $0.005/share/side commission, 1.0 bp adverse slippage on market and stop fills
- entry is a resting stop order, filled at the worse of the level and the bar's open, plus slippage
- the stop is a LEVEL, not a distance carried from the fill

