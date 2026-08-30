# `orb_sip.v4_trigger` and `orb_sip.v4_prior` — the owner's candle stop, both readings of it

**Two readings of one sentence, one held-back year, and both verdicts are printed here before anything else.**

| model | the stop | held-back trades | mean net R | per $1,000 risked | stopped out | verdict |
|---|---|---|---|---|---|---|
| `orb_sip.v4_trigger` | the five-minute candle the fill happened in | 3,969 | -0.6047 | -605 | 85.8% | **FAILED** |
| `orb_sip.v4_prior` | the five-minute candle BEFORE the one the fill happened in | 3,967 | 0.0154 | +15 | 44.3% | **PARTIAL** |
| `orb_sip.v2` — for comparison, same trades, replayed here | the opposite extreme of the opening range | 3,969 | 0.0166 | +17 | 31.3% | ENGINE-7's PARTIAL |

Decided on 2025-08-29 → 2026-08-28 and on nothing else. Snapshot `polygon-sip-v1`, unchanged and not re-downloaded; selection reused byte for byte from ENGINE-6; nothing was fetched. Gate: [`../models/orb_sip.v4_trigger/GATE.md`](../models/orb_sip.v4_trigger/GATE.md), which governs both arms and was committed before any number below existed.

## In plain English

**What the owner asked for.** *"we should only take an entry on the breakout of orb, stop at the low of 5min candle before the entry candle (if bullish) and top if bearish. if stopped out we take the loss"*. Everything about ENGINE-7's model stays as it was — each morning take the twenty US stocks whose first five minutes traded the most abnormal volume against their own recent mornings, draw the 09:30-09:35 range, buy a break above its high if that candle closed up, sell short a break below its low if it closed down, hold to the bell — and **only the stop changes**. "If stopped out we take the loss" was already how this model behaved: one trade a morning, no second attempt, no move to breakeven, no partial. That was confirmed rather than built.

**Why there are two answers below instead of one.** The sentence is ambiguous and it has already cost this programme two rounds. The entry is a resting order at the edge of the range, so the five-minute candle the order fills in is BOTH the candle that broke out and the candle the entry happened in — the two words name the same bar. So both readings were written down in advance and both were run:

- **`orb_sip.v4_trigger`** stops at the low (long) or high (short) of **the candle the fill happened in**. This is the literal reading of the owner's words if "the entry candle" means the next candle along — which is what a trader who enters at the open of the bar after the breakout bar closes means by it. It is the tighter of the two.
- **`orb_sip.v4_prior`** stops at the low or high of **the candle before that one**. This is the owner's earlier phrasing, *"previous 5min h/l"*, and it is the reading ENGINE-5 measured and preferred.

One consequence has to be said out loud: most breakouts happen in the first five minutes after the range closes, so for **62%** of its held-back trades the prior arm's "candle before" IS the 09:30-09:35 opening range, and on those trades **the prior arm is exactly `orb_sip.v2`**. It is a different model only on the minority of mornings where the break came later.

**The thing to read before the results, because this lane is walking back toward a known failure.** ENGINE-6 built the published version of this strategy with a very tight stop — a tenth of the stock's average daily range, about 12 cents. **It was hit on 90.1% of trades and lost $635 for every $1,000 risked.** The post-mortem then moved that one number and nothing else, and the whole result changed sign with it: at a tenth of the range it lost $635 per $1,000, at a quarter it lost $73, at a half it made $5, at a full range it made $12. ENGINE-7's stop — the opposite end of the opening range, about three quarters of a daily range, a median $1.34 a share — is the only reason that model stopped losing badly. **Both of the owner's readings put the stop closer to the entry than ENGINE-7's.** A candle on the chart is a real trader's rule and is not the same thing as a fraction of an average range, so it could still work — but the direction of travel is back toward the setting that failed, and the numbers to watch are how often each arm gets stopped out and how wide its stop actually is.

### What each reading made or lost

| | held-back year (the verdict) | all five years | stopped out, held back | stop width, held back |
|---|---|---|---|---|
| **`orb_sip.v4_trigger`** | **−$605** per $1,000 risked, over 3,969 trades | **−$658** per $1,000, over 20,141 trades | **85.8%** | 37¢ a share (median) |
| **`orb_sip.v4_prior`** | **+$15** per $1,000 risked, over 3,967 trades | **+$17** per $1,000, over 20,126 trades | **44.3%** | 118¢ a share (median) |
| `orb_sip.v2`, the same trades | +$17 per $1,000, over 3,969 trades | +$18 per $1,000, over 20,141 trades | 31.3% | 164¢ a share (median) |
| ENGINE-6's published stop, for scale | — | −$635 per $1,000 | 90.1% | 12¢ |

**THE ENGINE-6 DIAGNOSIS IS REPEATING, and this is the headline of the lane.** `orb_sip.v4_trigger` is stopped out on 85.8% of its trades. The gate drew the line at 85% before the run, and the reason it drew it there is that this is the same failure mode the published 10%-of-ATR stop had at 90.1%: the stop sits inside the normal noise of the very candle the trade is defined by, so the trade is knocked out before the idea it is based on has had a chance to be right or wrong. The stop is not protecting the position from a bad idea; it is preventing the idea from happening. This paragraph was required by the gate whatever the verdicts say.

**And the sentence that has to sit beside every held-back number in this family — with one correction this lane owes the brief that commissioned it.** ENGINE-8 reported that across the full five years its model returns about −$7 per $1,000 risked, is positive in only 2 of the 6 calendar years it touches, and that the held-back year is the good year. **That is true of `orb_sip.v3`, the TREND-FILTERED model, and it is not true of `orb_sip.v2`.** Measured here over the same five years, `orb_sip.v2` returns +$18 per $1,000 risked, is positive in 6 of the 6 calendar years it touches, and its held-back year (+$17 a trade) is ordinary rather than exceptional. So for the reading that survives below, the "one good year" warning is weaker than the brief assumed, and the five-year column is printed beside the held-back one anyway. **What has not changed is the SIZE.** An average trade worth a few tens of dollars per $1,000 risked, with an error bar that spans zero, is not an edge anybody can stand behind — and it is the same few tens of dollars whether you read one year or five.

### `orb_sip.v4_trigger` — stop at the five-minute candle the fill happened in

- **Trades**: **3,969** in the held-back year, 16,172 in the four-year build window, 20,141 over the whole five. `orb_sip.v2` took 3,969 in the same held-back year, and every trade here is one of those trades with a different stop on it.
- **Did it make money**: **no**. Gross of costs the average trade returned -0.5265 times what was risked (-527 per $1,000); after commission and slippage, -0.6047 — **-605 per $1,000 risked**. The middle trade returned -1.0402 (-1,040) and 12.9% finished green.
- **How much of that is luck**: the 95% range around the average is -0.6607 to -0.5488 times risk — -661 to -549 a trade. That range does not contain zero, so the sign of the average is not an artefact of the sample size.
- **Stopped out**: 85.8% of trades, against 31.3% for `orb_sip.v2` on the same trades and 90.1% for ENGINE-6's published stop.
- **The stop it actually placed**: a median **36.8¢** a share (7¢ at the 10th percentile, 180¢ at the 90th), **0.646%** of price, **0.17×** the 14-day ATR. Commission alone is 0.0272 of the risk on the middle trade (-27 per $1,000).
- **Against twenty random eligible names** traded under identical rules with the identical stop reading: -0.8141R (-814 per $1,000) over 4,160 trades.
- **Against a coin flip on the same mornings** — same symbols, same days, same 09:35 decision, same stop reading, direction flipped — gross, paired: **-0.1238R** (95%: -0.1646 to -0.0831, n=2,772), i.e. -124 a trade per $1,000.
- **As a portfolio** — 1% of the account risked per position, gross exposure capped at 4×, compounded daily from $100,000 — the held-back year returned **-87.3%** ($12,718) at a Sharpe of -15.83, worst drawdown 87.2%, with the leverage cap binding on 251 of 251 sessions.
- **And the four years before it, which the verdict does not read**: -0.6707R a trade (-671 per $1,000) over 16,172 trades, portfolio **-100.0%** at a Sharpe of -13.70. **Over the whole five years**: -0.6577R (-658 per $1,000) over 20,141 trades, portfolio **-100.0%** at a Sharpe of -14.08.
- **Verdict**: **FAILED**. S1 passed (sample (held back)). S2 FAILED (sign (held back)). S3 FAILED (direction beats a coin flip (held back, paired, gross)). S4 passed (the filter is the thing (held back, net R, in play minus random 20)). S5 FAILED (portfolio (held back)).

### `orb_sip.v4_prior` — stop at the five-minute candle BEFORE the one the fill happened in

- **Trades**: **3,967** in the held-back year, 16,159 in the four-year build window, 20,126 over the whole five. `orb_sip.v2` took 3,969 in the same held-back year, and every trade here is one of those trades with a different stop on it.
- **Did it make money**: **yes**. Gross of costs the average trade returned +0.0326 times what was risked (+33 per $1,000); after commission and slippage, +0.0154 — **+15 per $1,000 risked**. The middle trade returned -0.3955 (-395) and 40.6% finished green.
- **How much of that is luck**: the 95% range around the average is -0.0295 to +0.0604 times risk — -30 to +60 a trade. **That range contains zero**, so the average trade is NOT distinguishable from breaking even at this sample size, whatever the sign of the middle number.
- **Stopped out**: 44.3% of trades, against 31.3% for `orb_sip.v2` on the same trades and 90.1% for ENGINE-6's published stop.
- **The stop it actually placed**: a median **118.0¢** a share (25¢ at the 10th percentile, 555¢ at the 90th), **2.072%** of price, **0.51×** the 14-day ATR. Commission alone is 0.0085 of the risk on the middle trade (-8 per $1,000).
- **Against twenty random eligible names** traded under identical rules with the identical stop reading: -0.0398R (-40 per $1,000) over 4,157 trades.
- **Against a coin flip on the same mornings** — same symbols, same days, same 09:35 decision, same stop reading, direction flipped — gross, paired: **-0.1520R** (95%: -0.1902 to -0.1137, n=2,770), i.e. -152 a trade per $1,000.
- **As a portfolio** — 1% of the account risked per position, gross exposure capped at 4×, compounded daily from $100,000 — the held-back year returned **+30.0%** ($130,021) at a Sharpe of 0.93, worst drawdown 26.7%, with the leverage cap binding on 250 of 251 sessions.
- **And the four years before it, which the verdict does not read**: +0.0180R a trade (+18 per $1,000) over 16,159 trades, portfolio **+263.9%** at a Sharpe of 1.06. **Over the whole five years**: +0.0175R (+17 per $1,000) over 20,126 trades, portfolio **+373.1%** at a Sharpe of 1.03.
- **Verdict**: **PARTIAL**. P1 passed (sample (held back)). P2 passed (sign (held back)). P3 FAILED (direction beats a coin flip (held back, paired, gross)). P4 FAILED (the filter is the thing (held back, net R, in play minus random 20)). P5 FAILED (portfolio (held back)).

## The pre-registered gates

**`orb_sip.v4_trigger` — FAILED**

| id | gate | threshold | observed | |
|---|---|---|---|---|
| **S1** | sample (held back) | >=750 trades in 2025-08-29..2026-08-28 | n=3969 | PASS |
| **S2** | sign (held back) | mean gross R > 0 AND mean net R > 0 | gross=-0.5265, net=-0.6047 | **FAIL** |
| **S3** | direction beats a coin flip (held back, paired, gross) | 95% interval excludes zero, in the model's favour | -0.1238 (95%: -0.1646 to -0.0831, n=2772) | **FAIL** |
| **S4** | the filter is the thing (held back, net R, in play minus random 20) | 95% interval excludes zero, in the model's favour | +0.2078 (95%: +0.1235 to +0.2920, n=251) | PASS |
| **S5** | portfolio (held back) | total return > 0 AND Sharpe >= 1.0 | total=-87.3%, Sharpe=-15.83, maxDD=87.2% | **FAIL** |

**`orb_sip.v4_prior` — PARTIAL**

| id | gate | threshold | observed | |
|---|---|---|---|---|
| **P1** | sample (held back) | >=750 trades in 2025-08-29..2026-08-28 | n=3967 | PASS |
| **P2** | sign (held back) | mean gross R > 0 AND mean net R > 0 | gross=+0.0326, net=+0.0154 | PASS |
| **P3** | direction beats a coin flip (held back, paired, gross) | 95% interval excludes zero, in the model's favour | -0.1520 (95%: -0.1902 to -0.1137, n=2770) | **FAIL** |
| **P4** | the filter is the thing (held back, net R, in play minus random 20) | 95% interval excludes zero, in the model's favour | +0.0552 (95%: -0.0146 to +0.1249, n=251) | **FAIL** |
| **P5** | portfolio (held back) | total return > 0 AND Sharpe >= 1.0 | total=+30.0%, Sharpe=0.93, maxDD=26.7% | **FAIL** |

## The stop, which is the only thing that changed

Same trades, same fills, three stops. Everything in this table is measured on the held-back year's trades that all three readings took, so the comparison is not confounded by a different trade set.

| stop reading | n | median width | % of price | × 14-day ATR | commission as share of risk | stopped out | mean net R | per $1,000 |
|---|---|---|---|---|---|---|---|---|
| `orb_sip.v4_trigger` | 3,967 | 36.6¢ | 0.646% | 0.17 | 0.0273 | 85.8% | -0.6045 | -605 |
| `orb_sip.v4_prior` | 3,967 | 118.0¢ | 2.072% | 0.51 | 0.0085 | 44.3% | 0.0154 | +15 |
| `orb_sip.v2` (ENGINE-7) | 3,967 | 164.2¢ | 2.931% | 0.72 | 0.0061 | 31.3% | 0.0170 | +17 |
| ENGINE-6's published 10%-of-ATR stop | 32,392 | 12.4¢ | 0.35% | 0.10 | 0.0590 | 90.1% | −0.7229 | −723 |

Paired trade for trade on those same mornings, net of costs:

| comparison | n | difference | 95% | per $1,000 |
|---|---|---|---|---|
| `orb_sip.v4_trigger` minus `orb_sip.v2` | 3,967 | **-0.6216R** | -0.6750 to -0.5682 | -622 |
| `orb_sip.v4_prior` minus `orb_sip.v2` | 3,967 | **-0.0016R** | -0.0262 to +0.0230 | -2 |
| `orb_sip.v4_trigger` minus `orb_sip.v4_prior` | 3,967 | **-0.6200R** | -0.6677 to -0.5723 | -620 |

**Both readings land where the ENGINE-6 stop sweep said they would, and that is the one genuinely new piece of evidence in this lane.** That sweep was computed on 2016-2023 and predicted the sign of this whole family from stop width alone: −0.635R at 0.10× the 14-day average range, −0.073R at 0.25×, +0.005R at 0.50×, +0.012R at 1×. Neither of the owner's readings was taken from that sweep — both come from his own words — so where they land on it is an out-of-sample test of the sweep as much as of them. `orb_sip.v4_trigger` places a 0.17× stop and returns −$605 per $1,000 risked; `orb_sip.v4_prior` places a 0.51× stop and returns +$15; `orb_sip.v2` places a 0.72× stop and returns +$17. **Stop width, and not the direction call, is still the parameter that decides what this family earns** — now confirmed on a later window, by a rule nobody derived from the sweep.

**The ambiguity, closed.** The literal reading of *"the 5min candle before the entry candle"*, taken as the candle that broke out with the entry at the open of the next one, is **`orb_sip.v4_trigger`** — and its realised stop is a median 36.8¢, against 118.0¢ for the other reading and 164.2¢ for ENGINE-7's. Nobody has to guess which was meant again: both were run, and both numbers are on this page.

On **62.5%** of its held-back trades `orb_sip.v4_prior` places the SAME stop as `orb_sip.v2`, because the break came inside 09:35-09:40 and the candle before it is the opening range itself. Any difference between those two rows is therefore produced by a minority of the trades.

### When the break happened, which is what decides the stop

| five-minute candle the fill landed in | trades | share |
|---|---|---|
| 09:35-09:40 | 2,474 | 62.3% (cumulative 62.3%) |
| 09:40-09:45 | 362 | 9.1% (cumulative 71.5%) |
| 09:45-09:50 | 213 | 5.4% (cumulative 76.8%) |
| 09:50-09:55 | 114 | 2.9% (cumulative 79.7%) |
| 09:55-10:00 | 79 | 2.0% (cumulative 81.7%) |
| 10:00-10:05 | 90 | 2.3% (cumulative 84.0%) |
| 10:05-10:10 | 50 | 1.3% (cumulative 85.2%) |
| 10:10-10:15 | 47 | 1.2% (cumulative 86.4%) |
| later than 10:15 | 540 | 13.6% |

## Every calendar year, both arms and v2

| year | `orb_sip.v4_trigger` | `orb_sip.v4_prior` | `orb_sip.v2` |
|---|---|---|---|
| 2021 | -0.6104 (-610, n=1,452) | 0.0670 (+67, n=1,451) | 0.0227 (+23, n=1,452) |
| 2022 | -0.7053 (-705, n=4,082) | 0.0193 (+19, n=4,079) | 0.0285 (+28, n=4,082) |
| 2023 | -0.7416 (-742, n=4,062) | -0.0070 (-7, n=4,056) | 0.0001 (+0, n=4,062) |
| 2024 | -0.6415 (-642, n=3,968) | 0.0263 (+26, n=3,965) | 0.0257 (+26, n=3,968) |
| 2025 | -0.6106 (-611, n=3,942) | 0.0007 (+1, n=3,942) | 0.0058 (+6, n=3,942) |
| 2026 | -0.5755 (-575, n=2,635) | 0.0368 (+37, n=2,633) | 0.0320 (+32, n=2,635) |

- `orb_sip.v4_trigger` is positive in **0 of 6** calendar years (none).
- `orb_sip.v4_prior` is positive in **5 of 6** calendar years (2021, 2022, 2024, 2025, 2026).
- `orb_sip.v2` is positive in **6 of 6** (2021, 2022, 2023, 2024, 2025, 2026).

## Full summaries, held-back window

| slice | n | hit | mean R | median R | mean % | payoff | PF | total R | maxDD R | max losing run |
|---|---|---|---|---|---|---|---|---|---|---|
| orb_sip.v4_trigger | 3969 | 12.9% | -0.605 | -1.040 | -0.356% | 2.57 | 0.38 | -2400.2 | 2399.1 | 52 |
| orb_sip.v4_prior | 3967 | 40.6% | 0.015 | -0.395 | 0.064% | 1.51 | 1.03 | 61.3 | 55.1 | 15 |
| orb_sip.v4_trigger.coinflip | 3219 | 15.6% | -0.495 | -1.038 | -0.234% | 2.55 | 0.47 | -1592.1 | 1594.0 | 38 |
| orb_sip.v4_prior.coinflip | 3218 | 39.1% | 0.017 | -0.569 | 0.088% | 1.61 | 1.03 | 53.1 | 50.2 | 12 |
| orb_sip.v4_trigger.random20 | 4160 | 10.3% | -0.814 | -1.084 | -0.204% | 2.66 | 0.30 | -3386.7 | 3388.0 | 62 |
| orb_sip.v4_prior.random20 | 4157 | 35.9% | -0.040 | -1.011 | 0.018% | 1.67 | 0.94 | -165.6 | 190.7 | 17 |
| orb_sip.v2 | 3969 | 45.1% | 0.017 | -0.106 | 0.048% | 1.27 | 1.04 | 66.1 | 65.6 | 15 |
| orb_sip.v2.coinflip | 3219 | 45.3% | 0.006 | -0.102 | 0.075% | 1.23 | 1.02 | 19.4 | 42.1 | 11 |
| orb_sip.v2.random20 | 4160 | 39.6% | -0.037 | -0.565 | 0.011% | 1.42 | 0.93 | -154.8 | 181.8 | 17 |

## Full summaries, the four build years (not a verdict)

| slice | n | hit | mean R | median R | mean % | payoff | PF | total R | maxDD R | max losing run |
|---|---|---|---|---|---|---|---|---|---|---|
| orb_sip.v4_trigger | 16172 | 12.0% | -0.671 | -1.055 | -0.344% | 2.69 | 0.37 | -10846.2 | 10851.4 | 53 |
| orb_sip.v4_prior | 16159 | 39.8% | 0.018 | -0.505 | 0.079% | 1.56 | 1.03 | 290.1 | 168.5 | 20 |
| orb_sip.v2 | 16172 | 43.9% | 0.018 | -0.165 | 0.078% | 1.33 | 1.04 | 293.1 | 118.8 | 20 |

## Cost sensitivity — a disclosure, never a result

The pre-registered cost model is $0.005/share/side plus 1.0 bp of adverse slippage, and it is the one every number above uses. A tighter stop pays the same cents on a smaller denominator, so cost matters more here than it did to ENGINE-7 and the size of that is worth printing.

| arm | zero cost | quarter-bp slippage | the pre-registered model | drag |
|---|---|---|---|---|
| `orb_sip.v4_trigger` | -0.4696R (-470) | -0.6439R (-644) | -0.6047R (-605) | 0.1352R (-135) |
| `orb_sip.v4_prior` | +0.0513R (+51) | +0.0291R (+29) | +0.0154R (+15) | 0.0358R (-36) |

**Read the middle column carefully, because it goes the wrong way and that is not a bug.** Quarter-bp slippage is CHEAPER than the pre-registered model, and the trigger arm still looks worse under it. Slippage moves the fill, and the fill is one end of the stop distance: a fill closer to the breakout level means a narrower stop, which means every dollar won or lost is divided by a smaller number. At a stop this tight the denominator moves more than the numerator does. It is the same arithmetic ENGINE-4 found on SPY running in the other direction, and it is one more way of saying that a stop of a few cents is not a stop, it is a rounding error with a name.

## How confident we actually are

- **`orb_sip.v4_trigger`**: FAILED. Held-back year −$605 per $1,000 risked with a 95% range of −$661 to −$549; the whole five years −$658. The interval excludes zero on the held-back year alone.
- **`orb_sip.v4_prior`**: PARTIAL. Held-back year +$15 per $1,000 risked with a 95% range of −$30 to +$60; the whole five years +$17. The interval spans zero, so the held-back number does not establish an edge in either direction.

Honest limits, all of them pre-registered rather than added afterwards:

- **The held-back year is on its fourth reading.** ENGINE-7 measured on 2024-01-01 → 2026-08-28, which contains it; ENGINE-8 evaluated two models on it; this lane evaluates two more. No correction is applied and none is claimed. Every use of a held-back window spends some of what made it worth holding back.
- **Two arms on one year** carries about a 10% chance that one clears zero by luck rather than 5%. Both are printed, in the order they were specified, and neither is led with.
- **The trigger arm's candle was not finished when the trade was put on.** Its stop is that candle's extreme as it stood at the fill minute, because the minutes after the fill are the future and this harness cannot read them. A trader who waits for the breakout candle to CLOSE and then enters is running a different entry rule, and no number here speaks to it. That call was written into the gate before the run.
- **Five years was the owner's choice and it is not widened.** Everything before 2021-08-29 stays in the cache and is not the subject.
- **A disclosure that costs nothing to make and would be dishonest to omit.** Before the full run, this report-writing code was smoke-tested on a two-month slice (2025-06-02 → 2025-10-31) that overlaps the held-back window, to check that the tables and the gate plumbing worked at all. The gate was already committed at that point, no threshold or parameter was changed after it, and no arm was added or dropped — but numbers from inside the verdict window were seen by a human before the verdict run, and that is recorded here rather than left out.
- **What would change the answer, in order of how much it would move it:** (1) the fill model — every entry is a resting stop order filled at the worse of the level and the bar's open, which is optimistic for twenty simultaneous orders on the most volatile names of the morning, and it matters MORE the tighter the stop; (2) short borrow, which this harness does not model and is not free on a stock that just gapped on news; (3) the 4× leverage cap; (4) the pool, the top 1,000 of the eligible universe by dollar volume rather than all of it.
- **What this report does NOT establish**: that either arm is worth trading. Nothing here has been run forward in real time, and no live-execution question — borrow, halts, locked markets, partial fills at the range close — has been touched.

## Census

| | v4_trigger | v4_prior | orb_sip.v2 | random 20 (trigger) | random 20 (prior) |
|---|---|---|---|---|---|
| days_seen | 25,100 | 25,100 | 25,100 | 25,099 | 25,099 |
| no_prior_candle | 0 | 15 | 0 | 0 | 20 |
| signals | 24,956 | 24,956 | 24,956 | 24,694 | 24,694 |
| signals_long | 12,634 | 12,634 | 12,634 | 12,456 | 12,456 |
| signals_short | 12,322 | 12,322 | 12,322 | 12,238 | 12,238 |
| skip_doji_opening_candle | 142 | 142 | 142 | 337 | 337 |
| skip_zero_width_range | 2 | 2 | 2 | 68 | 68 |
| stop_from_prior_candle | 0 | 20,126 | 0 | 0 | 21,143 |
| stop_from_trigger_candle | 20,141 | 0 | 0 | 21,163 | 0 |
| symbol-days with no cached bars | 0 | 0 | 0 | 0 | 0 |

## Selection, costs and fills

- selection: ENGINE-6's, unchanged and not recomputed — pool of the top 1,000 eligible names by prior-close 20-day dollar volume, then the top 20 by 09:30-09:35 volume over the mean of the same five minutes across the previous 14 sessions, floor 1.0.
- $0.005/share/side commission, 1.0 bp adverse slippage on market and stop fills — ENGINE-1's model, unchanged for the tenth time.
- entry is a resting stop order at the range edge, filled at the worse of the level and the bar's open, plus slippage. The stop is a LEVEL read off a five-minute candle at the fill, not a distance carried from it, and the R it is divided by is measured from the fill that actually happened.
- all three stop readings ran through the SAME replay (`backtest/candle_stop.py`), which is asserted in `tests/test_orb_sip_v4.py` to reproduce `backtest/engine.py` trade for trade on a model that does not use the fill-time hook. The report also asserts, before writing a number, that the three readings took the same symbol-days with the same sides at the same fills.

