# `orb_sip.v3` and `orb_sip.v3_15m` — the daily trend has to agree

**Two models, one held-back year, and both verdicts are printed here before anything else.**

| model | opening range | held-back trades | mean net R | per $1,000 risked | verdict |
|---|---|---|---|---|---|
| `orb_sip.v3` | 5-minute | 996 | 0.0356 | +36 | **PARTIAL** |
| `orb_sip.v3_15m` | 15-minute | 892 | 0.0062 | +6 | **PARTIAL** |

Decided on 2025-08-29 → 2026-08-28 and on nothing else. Snapshot `polygon-sip-v1`, unchanged and not re-downloaded; selection reused byte for byte from ENGINE-6; daily bars read from the grouped files already in it. Gates: [`../models/orb_sip.v3/GATE.md`](../models/orb_sip.v3/GATE.md) and [`../models/orb_sip.v3_15m/GATE.md`](../models/orb_sip.v3_15m/GATE.md), both committed before any number below existed.

## In plain English

**What this is.** ENGINE-7's model, plus one rule. Each morning, take the twenty US stocks whose first five minutes traded the most abnormal volume against their own recent mornings. Draw the opening range — the first five minutes for one model, the first fifteen for the other. Buy a break above its high if that candle closed up, sell short a break below its low if it closed down, hold to the bell, and stop out if price comes back through the other end of the range. **The new rule: only take the long if the stock's DAILY chart is already in a confirmed uptrend, and only take the short if it is in a confirmed downtrend. If the daily chart is sideways, or pointing the other way, do not trade — not a smaller trade, no trade.** The daily chart is read on the last fully closed daily bar, never on the day being traded.

**Why it was worth trying.** ENGINE-7 made about $20 per $1,000 risked a trade and could not tell that apart from zero — but it found exactly where its losses lived. On the mornings when price broke BOTH ends of the opening range, the end the first candle pointed at was the losing end: -0.735R against the other side's -0.271R. The model had no rule for choosing between two breaks. A daily trend filter is precisely such a rule, so this lane asks one question above all the others: **does the daily trend pick the right side of a two-way break?**

**Three things about the evidence, said before the numbers rather than after them.**

1. **The held-back year is not virgin data.** ENGINE-7's diagnosis was measured on 2024-01-01 → 2026-08-28, and the verdict window here sits inside that span. No parameter was fitted on it and the trend definition is ENGINE-2's, reused without a number changed — but the decision to try a trend filter at all was taken after looking at data that includes this year. **Suggestive, not conclusive**, and nothing below may be read more strongly than that.
2. **Two models, one year.** With two 95% intervals the chance that at least one clears zero by luck is about 10%, not 5%. No correction is applied to the intervals; instead both outcomes are printed above, in the order they were specified, and neither is led with.
3. **Five years was the owner's choice and it is not widened.** Everything before 2021-08-29 stays in the cache and is not the subject. If a variant comes in thin, the answer is INCONCLUSIVE, never a wider window.

### `orb_sip.v3` — the 5-minute range

- **Trades**: **996** in the held-back year, 4,152 in the four-year build window. Its ungated base took 3,969 in the same held-back year, so the filter removed **2,973** of them (75%).
- **Did it make money**: **yes**. After commission and slippage the average trade returned +0.0356 times what was risked on it — **+36 dollars per $1,000 risked**, over 996 trades. The middle trade returned -0.1003 (-100 dollars) and 45.7% finished green.
- **How much of that is luck**: the 95% range around the average is -0.0324 to +0.1035 times risk — -32 to +104 dollars a trade. **That range contains zero**, so the average trade is NOT distinguishable from breaking even at this sample size, whatever the sign of the middle number.
- **Stopped out**: 30.6% of trades, against 31.3% for the same model without the filter.
- **Against twenty random eligible names** traded under identical rules, trend gate included: -0.1070R (-107 dollars) over 1,075 trades.
- **As a portfolio** — 1% of the account risked per position, gross exposure capped at 4x, compounded daily from $100,000 — the held-back year returned **+18.8%** ($118,772) at a Sharpe of 0.69 with a worst drawdown of 19.0%.
- **And the four years before it, which the verdict does not read**: -0.0168R a trade (-17 per $1,000) over 4,152 trades, and a portfolio of **-67.3%** at a Sharpe of -0.57. The gate is the held-back year and it stays the gate — but a reader who sees only the held-back column is seeing one year in five, and the other four are on the page for that reason.
- **Verdict**: **PARTIAL**. T1 passed (sample (held back)). T2 passed (sign (held back)). T3 FAILED (direction beats a coin flip (held back, paired, gross)). T4 FAILED (the filter is the thing (held back, net R, in play minus random 20)). T5 FAILED (portfolio (held back)).

### `orb_sip.v3_15m` — the 15-minute range

- **Trades**: **892** in the held-back year, 3,683 in the four-year build window. Its ungated base took 3,576 in the same held-back year, so the filter removed **2,684** of them (75%).
- **Did it make money**: **yes**. After commission and slippage the average trade returned +0.0062 times what was risked on it — **+6 dollars per $1,000 risked**, over 892 trades. The middle trade returned -0.0334 (-33 dollars) and 47.5% finished green.
- **How much of that is luck**: the 95% range around the average is -0.0482 to +0.0606 times risk — -48 to +61 dollars a trade. **That range contains zero**, so the average trade is NOT distinguishable from breaking even at this sample size, whatever the sign of the middle number.
- **Stopped out**: 19.3% of trades, against 19.7% for the same model without the filter.
- **Against twenty random eligible names** traded under identical rules, trend gate included: -0.0286R (-29 dollars) over 965 trades.
- **As a portfolio** — 1% of the account risked per position, gross exposure capped at 4x, compounded daily from $100,000 — the held-back year returned **-6.5%** ($93,468) at a Sharpe of -0.16 with a worst drawdown of 24.9%.
- **And the four years before it, which the verdict does not read**: -0.0137R a trade (-14 per $1,000) over 3,683 trades, and a portfolio of **-50.0%** at a Sharpe of -0.51. The gate is the held-back year and it stays the gate — but a reader who sees only the held-back column is seeing one year in five, and the other four are on the page for that reason.
- **Verdict**: **PARTIAL**. U1 passed (sample (held back)). U2 passed (sign (held back)). U3 FAILED (direction beats a coin flip (held back, paired, gross)). U4 FAILED (the filter is the thing (held back, net R, in play minus random 20)). U5 FAILED (portfolio (held back)).

## The two-way-break mornings — the thing the filter was brought in for

ENGINE-7 located its whole deficit against a coin flip in the mornings on which price broke BOTH ends of the opening range, and could only see those mornings indirectly — as the pairs where its coin happened to draw the other side, which is a random half of them. This lane identifies them from the tape: a resting stop order is placed at each end of the range under the same fill model, and a morning on which both filled is a morning on which both ends broke. Every such morning is counted, not half of them.

### `orb_sip.v3`

**Held back, 2025-08-29 → 2026-08-28.** Of 3,969 mornings the ungated 5-minute model traded, **1,565 broke BOTH ends of the opening range** (39.4%) and 2,404 broke only one.

| subset | n | mean gross R | mean net R | per $1,000 risked | median net R | hit | stopped |
|---|---|---|---|---|---|---|---|
| both ends broke — the candle's side (this is v2) | 1,565 | -0.7141 | -0.7277 | -728 | -1.0104 | 12.9% | 79.5% |
| both ends broke — the OTHER side | 1,565 | -0.2943 | -0.3080 | -308 | -0.7089 | 31.1% | 48.6% |
| both ends broke — kept by the trend filter | 373 | -0.7095 | -0.7228 | -723 | -1.0106 | 12.3% | 81.8% |
| both ends broke — removed by the trend filter | 1,192 | -0.7155 | -0.7293 | -729 | -1.0103 | 13.1% | 78.8% |
| only one end broke — the candle's side | 2,404 | 0.5101 | 0.5012 | +501 | 0.2746 | 66.1% | 0.0% |

On the two-way-break mornings the filter kept 373 of 1,565 and removed 1,192. Kept minus removed is **+0.0065R** (95%: -0.0903 to +0.1033), i.e. +6 dollars a trade on $1,000 of risk. **The interval contains zero**, so on the subset this filter was brought in to fix, it is not measurably telling the two apart.

*Diagnostic, fenced: not a gate, and trading it would be a NEW model needing its own pre-registration.* On a two-way-break morning the trend has three states, and the question is whether it knows which end of the whipsaw pays. Where the trend AGREED with the candle, the candle's side returned -0.7228R net (-723 per $1,000, n=373). Where it OPPOSED the candle — the mornings the model sits out — the side the trend pointed at instead returned -0.2688R (-269, n=400). **The number to compare that against is not the first one, it is -0.3080R — what the other end of the range returned on ALL two-way-break mornings, trend or no trend.** The two are close, so what is being measured is that the other end of a two-way break is less bad than the candle's end — which ENGINE-7 already knew — and NOT that the daily trend can tell which end that is.

**Build window, 2021-08-29 → 2025-08-28.** Of 16,172 mornings the ungated 5-minute model traded, **6,799 broke BOTH ends of the opening range** (42.0%) and 9,373 broke only one.

| subset | n | mean gross R | mean net R | per $1,000 risked | median net R | hit | stopped |
|---|---|---|---|---|---|---|---|
| both ends broke — the candle's side (this is v2) | 6,799 | -0.7366 | -0.7560 | -756 | -1.0147 | 11.3% | 82.6% |
| both ends broke — the OTHER side | 6,799 | -0.3114 | -0.3309 | -331 | -1.0053 | 30.4% | 52.3% |
| both ends broke — kept by the trend filter | 1,758 | -0.7467 | -0.7658 | -766 | -1.0139 | 11.5% | 82.0% |
| both ends broke — removed by the trend filter | 5,041 | -0.7331 | -0.7526 | -753 | -1.0150 | 11.3% | 82.8% |
| only one end broke — the candle's side | 9,373 | 0.5922 | 0.5797 | +580 | 0.3299 | 67.5% | 0.0% |

On the two-way-break mornings the filter kept 1,758 of 6,799 and removed 5,041. Kept minus removed is **-0.0132R** (95%: -0.0526 to +0.0262), i.e. -13 dollars a trade on $1,000 of risk. **The interval contains zero**, so on the subset this filter was brought in to fix, it is not measurably telling the two apart.

*Diagnostic, fenced: not a gate, and trading it would be a NEW model needing its own pre-registration.* On a two-way-break morning the trend has three states, and the question is whether it knows which end of the whipsaw pays. Where the trend AGREED with the candle, the candle's side returned -0.7658R net (-766 per $1,000, n=1,758). Where it OPPOSED the candle — the mornings the model sits out — the side the trend pointed at instead returned -0.3308R (-331, n=1,593). **The number to compare that against is not the first one, it is -0.3309R — what the other end of the range returned on ALL two-way-break mornings, trend or no trend.** The two are close, so what is being measured is that the other end of a two-way break is less bad than the candle's end — which ENGINE-7 already knew — and NOT that the daily trend can tell which end that is.

### `orb_sip.v3_15m`

**Held back, 2025-08-29 → 2026-08-28.** Of 3,576 mornings the ungated 15-minute model traded, **895 broke BOTH ends of the opening range** (25.0%) and 2,681 broke only one.

| subset | n | mean gross R | mean net R | per $1,000 risked | median net R | hit | stopped |
|---|---|---|---|---|---|---|---|
| both ends broke — the candle's side (this is v2) | 895 | -0.7198 | -0.7318 | -732 | -1.0088 | 13.1% | 78.7% |
| both ends broke — the OTHER side | 895 | -0.2695 | -0.2815 | -282 | -0.3188 | 34.0% | 37.7% |
| both ends broke — kept by the trend filter | 213 | -0.7404 | -0.7507 | -751 | -1.0087 | 11.7% | 80.8% |
| both ends broke — removed by the trend filter | 682 | -0.7133 | -0.7259 | -726 | -1.0088 | 13.5% | 78.0% |
| only one end broke — the candle's side | 2,681 | 0.2594 | 0.2518 | +252 | 0.1184 | 58.0% | 0.0% |

On the two-way-break mornings the filter kept 213 of 895 and removed 682. Kept minus removed is **-0.0248R** (95%: -0.1314 to +0.0818), i.e. -25 dollars a trade on $1,000 of risk. **The interval contains zero**, so on the subset this filter was brought in to fix, it is not measurably telling the two apart.

*Diagnostic, fenced: not a gate, and trading it would be a NEW model needing its own pre-registration.* On a two-way-break morning the trend has three states, and the question is whether it knows which end of the whipsaw pays. Where the trend AGREED with the candle, the candle's side returned -0.7507R net (-751 per $1,000, n=213). Where it OPPOSED the candle — the mornings the model sits out — the side the trend pointed at instead returned -0.3075R (-308, n=205). **The number to compare that against is not the first one, it is -0.2815R — what the other end of the range returned on ALL two-way-break mornings, trend or no trend.** The two are close, so what is being measured is that the other end of a two-way break is less bad than the candle's end — which ENGINE-7 already knew — and NOT that the daily trend can tell which end that is.

**Build window, 2021-08-29 → 2025-08-28.** Of 14,616 mornings the ungated 15-minute model traded, **3,844 broke BOTH ends of the opening range** (26.3%) and 10,772 broke only one.

| subset | n | mean gross R | mean net R | per $1,000 risked | median net R | hit | stopped |
|---|---|---|---|---|---|---|---|
| both ends broke — the candle's side (this is v2) | 3,844 | -0.7125 | -0.7289 | -729 | -1.0118 | 13.4% | 77.3% |
| both ends broke — the OTHER side | 3,844 | -0.2784 | -0.2948 | -295 | -0.4073 | 32.8% | 42.3% |
| both ends broke — kept by the trend filter | 980 | -0.7156 | -0.7322 | -732 | -1.0110 | 13.6% | 77.0% |
| both ends broke — removed by the trend filter | 2,864 | -0.7115 | -0.7278 | -728 | -1.0121 | 13.4% | 77.4% |
| only one end broke — the candle's side | 10,772 | 0.2766 | 0.2662 | +266 | 0.1203 | 59.3% | 0.0% |

On the two-way-break mornings the filter kept 980 of 3,844 and removed 2,864. Kept minus removed is **-0.0043R** (95%: -0.0512 to +0.0425), i.e. -4 dollars a trade on $1,000 of risk. **The interval contains zero**, so on the subset this filter was brought in to fix, it is not measurably telling the two apart.

*Diagnostic, fenced: not a gate, and trading it would be a NEW model needing its own pre-registration.* On a two-way-break morning the trend has three states, and the question is whether it knows which end of the whipsaw pays. Where the trend AGREED with the candle, the candle's side returned -0.7322R net (-732 per $1,000, n=980). Where it OPPOSED the candle — the mornings the model sits out — the side the trend pointed at instead returned -0.2986R (-299, n=946). **The number to compare that against is not the first one, it is -0.2948R — what the other end of the range returned on ALL two-way-break mornings, trend or no trend.** The two are close, so what is being measured is that the other end of a two-way break is less bad than the candle's end — which ENGINE-7 already knew — and NOT that the daily trend can tell which end that is.

## What the filter removed, and what those trades did

A filter that discards winners is not helping even if the average of what is left improves. The gated model is a strict subset of its own ungated base — same range, same side, same levels, one extra reason to skip — and the runner asserts that before it writes anything, so every trade in the base is either kept or removed and there is no third category.

### `orb_sip.v3`

| held back, 5-minute | n | mean net R | per $1,000 risked | median net R | hit | stopped |
|---|---|---|---|---|---|---|
| kept by the filter (the model) | 996 | 0.0356 | +36 | -0.1003 | 45.7% | 30.6% |
| REMOVED by the filter | 2,973 | 0.0103 | +10 | -0.1081 | 45.0% | 31.6% |

The filter removed **2,973 of 3,969 trades** (75%). Kept minus removed is **+0.0253R** (95%: -0.0532 to +0.1038) — +25 dollars a trade on $1,000 of risk.

| build window, 5-minute | n | mean net R | per $1,000 risked | median net R | hit | stopped |
|---|---|---|---|---|---|---|
| kept by the filter (the model) | 4,152 | -0.0168 | -17 | -0.1780 | 43.3% | 34.7% |
| REMOVED by the filter | 12,020 | 0.0302 | +30 | -0.1600 | 44.1% | 34.7% |

The filter removed **12,020 of 16,172 trades** (74%). Kept minus removed is **-0.0470R** (95%: -0.0884 to -0.0057) — -47 dollars a trade on $1,000 of risk.

**The filter is discarding winners.** The trades it removed returned +0.0302R and the ones it kept returned -0.0168R. The gate required this sentence in these words if it happened, whatever the verdict says: a filter that skips trades which would have won is not helping, even if the average of what is left improves.

### `orb_sip.v3_15m`

| held back, 15-minute | n | mean net R | per $1,000 risked | median net R | hit | stopped |
|---|---|---|---|---|---|---|
| kept by the filter (the model) | 892 | 0.0062 | +6 | -0.0334 | 47.5% | 19.3% |
| REMOVED by the filter | 2,684 | 0.0055 | +5 | -0.0485 | 46.5% | 19.8% |

The filter removed **2,684 of 3,576 trades** (75%). Kept minus removed is **+0.0007R** (95%: -0.0624 to +0.0639) — +1 dollars a trade on $1,000 of risk.

| build window, 15-minute | n | mean net R | per $1,000 risked | median net R | hit | stopped |
|---|---|---|---|---|---|---|
| kept by the filter (the model) | 3,683 | -0.0137 | -14 | -0.0396 | 47.1% | 20.5% |
| REMOVED by the filter | 10,933 | 0.0106 | +11 | -0.0433 | 47.3% | 20.3% |

The filter removed **10,933 of 14,616 trades** (75%). Kept minus removed is **-0.0243R** (95%: -0.0557 to +0.0071) — -24 dollars a trade on $1,000 of risk.

**The filter is discarding winners.** The trades it removed returned +0.0106R and the ones it kept returned -0.0137R. The gate required this sentence in these words if it happened, whatever the verdict says: a filter that skips trades which would have won is not helping, even if the average of what is left improves.

## Does any benefit survive once the two-way-break mornings are removed?

If the filter only sorts out which end of a whipsaw to take, it is a tie-breaker. If it also helps on the mornings where only one end broke and there was never a choice to make, it is a directional edge. These are the same kept-minus-removed comparisons as above, restricted to the mornings on which only ONE end of the range broke.

### `orb_sip.v3`

| held back, one-way breaks only, 5-minute | n | mean net R | per $1,000 risked | median net R | hit | stopped |
|---|---|---|---|---|---|---|
| kept by the filter (the model) | 623 | 0.4896 | +490 | 0.2772 | 65.7% | 0.0% |
| REMOVED by the filter | 1,781 | 0.5053 | +505 | 0.2679 | 66.3% | 0.0% |

The filter removed **1,781 of 2,404 trades** (74%). Kept minus removed is **-0.0157R** (95%: -0.1046 to +0.0732) — -16 dollars a trade on $1,000 of risk.

**The filter is discarding winners.** The trades it removed returned +0.5053R and the ones it kept returned +0.4896R. The gate required this sentence in these words if it happened, whatever the verdict says: a filter that skips trades which would have won is not helping, even if the average of what is left improves.

| build window, one-way breaks only, 5-minute | n | mean net R | per $1,000 risked | median net R | hit | stopped |
|---|---|---|---|---|---|---|
| kept by the filter (the model) | 2,394 | 0.5331 | +533 | 0.2930 | 66.5% | 0.0% |
| REMOVED by the filter | 6,979 | 0.5956 | +596 | 0.3417 | 67.8% | 0.0% |

The filter removed **6,979 of 9,373 trades** (74%). Kept minus removed is **-0.0625R** (95%: -0.1147 to -0.0103) — -63 dollars a trade on $1,000 of risk.

**The filter is discarding winners.** The trades it removed returned +0.5956R and the ones it kept returned +0.5331R. The gate required this sentence in these words if it happened, whatever the verdict says: a filter that skips trades which would have won is not helping, even if the average of what is left improves.

### `orb_sip.v3_15m`

| held back, one-way breaks only, 15-minute | n | mean net R | per $1,000 risked | median net R | hit | stopped |
|---|---|---|---|---|---|---|
| kept by the filter (the model) | 679 | 0.2436 | +244 | 0.1377 | 58.8% | 0.0% |
| REMOVED by the filter | 2,002 | 0.2546 | +255 | 0.1092 | 57.7% | 0.0% |

The filter removed **2,002 of 2,681 trades** (75%). Kept minus removed is **-0.0110R** (95%: -0.0742 to +0.0522) — -11 dollars a trade on $1,000 of risk.

**The filter is discarding winners.** The trades it removed returned +0.2546R and the ones it kept returned +0.2436R. The gate required this sentence in these words if it happened, whatever the verdict says: a filter that skips trades which would have won is not helping, even if the average of what is left improves.

| build window, one-way breaks only, 15-minute | n | mean net R | per $1,000 risked | median net R | hit | stopped |
|---|---|---|---|---|---|---|
| kept by the filter (the model) | 2,703 | 0.2468 | +247 | 0.1115 | 59.3% | 0.0% |
| REMOVED by the filter | 8,069 | 0.2727 | +273 | 0.1235 | 59.3% | 0.0% |

The filter removed **8,069 of 10,772 trades** (75%). Kept minus removed is **-0.0259R** (95%: -0.0583 to +0.0066) — -26 dollars a trade on $1,000 of risk.

**The filter is discarding winners.** The trades it removed returned +0.2727R and the ones it kept returned +0.2468R. The gate required this sentence in these words if it happened, whatever the verdict says: a filter that skips trades which would have won is not helping, even if the average of what is left improves.

## The prior: ENGINE-3 and ENGINE-5 already tested trend filters, and found nothing

This is not the first trend filter this programme has measured, and the earlier answer was a null.

| lane | filter | measured | result |
|---|---|---|---|
| ENGINE-2 | confirmed DAILY structure, the same definition used here | 1,140 trades, 32 names | removing it changed the gross mean by +0.019R, well inside the noise |
| ENGINE-3 | 1-hour AND 4-hour structure must both agree | 448 trades from 23,904 symbol-days | the second filter mostly removed trades; the edge over the control SHRANK from +0.099R to +0.052R |
| ENGINE-5 | 1-hour structure | 11,568 paired trades, 32 names | **-0.005R against the coin flip, 95%: -0.027 to +0.016** — the tightest null in the programme |

**That null does not settle this and it is not irrelevant either, and both halves of that sentence are meant.** It does not settle it because all three ran on a fixed 32-name basket — chosen for today's liquidity, so carrying survivorship — with a stop ENGINE-6 later showed was wrong, and none of them had the stocks-in-play selection that is the only claim ENGINE-7 established. A filter measured on a broken base measures the base. It is not irrelevant because it is three independent looks at the same idea, at two other timeframes, and all three came back at or below zero. **The prior on trend filters in this programme is a null, and this lane's job is to say whether the fourth look changes it.**

## The bar, and what it observed

All gates are read on the held-back window only. Every threshold is ENGINE-7's H1-H5 unchanged in kind and in number except the sample floor, which moved from 5,000 to 750 — twenty picks a session over ~251 sessions is a ceiling of about 5,000 trades before any filter is applied, so carrying 5,000 across would have returned INCONCLUSIVE by arithmetic rather than by evidence. The new floor is set from power and is stated in the gate: at n=750 the 95% half-width is about ±0.086R, enough to separate an edge worth trading (≥0.10R, ≥$100 per $1,000 risked) from zero and deliberately not enough to resolve a v2-sized +0.02R.

**`orb_sip.v3` — PARTIAL**

| id | gate | threshold | observed | |
|---|---|---|---|---|
| **T1** | sample (held back) | >=750 trades in 2025-08-29..2026-08-28 | n=996 | PASS |
| **T2** | sign (held back) | mean gross R > 0 AND mean net R > 0 | gross=+0.0457, net=+0.0356 | PASS |
| **T3** | direction beats a coin flip (held back, paired, gross) | 95% interval excludes zero, in the model's favour | -0.1502 (95%: -0.2058 to -0.0946, n=702) | FAIL |
| **T4** | the filter is the thing (held back, net R, in play minus random 20) | 95% interval excludes zero, in the model's favour | +0.0719 (95%: -0.0383 to +0.1821, n=243) | FAIL |
| **T5** | portfolio (held back) | total return > 0 AND Sharpe >= 1.0 | total=+18.8%, Sharpe=0.69, maxDD=19.0% | FAIL |

T2 asks for a positive mean, not for a mean distinguishable from zero. The 95% interval on the held-back mean net R is -0.0324 to +0.1035 and it spans zero, so a passed T2 is not evidence that the per-trade edge is real. The gate said this in advance.

**PARTIAL is not a pass.** T3 failed, so this is NOT established: direction beats a coin flip (held back, paired, gross). T4 failed, so this is NOT established: the filter is the thing (held back, net R, in play minus random 20). T5 failed, so this is NOT established: portfolio (held back).

**`orb_sip.v3_15m` — PARTIAL**

| id | gate | threshold | observed | |
|---|---|---|---|---|
| **U1** | sample (held back) | >=750 trades in 2025-08-29..2026-08-28 | n=892 | PASS |
| **U2** | sign (held back) | mean gross R > 0 AND mean net R > 0 | gross=+0.0143, net=+0.0062 | PASS |
| **U3** | direction beats a coin flip (held back, paired, gross) | 95% interval excludes zero, in the model's favour | -0.0699 (95%: -0.1122 to -0.0276, n=574) | FAIL |
| **U4** | the filter is the thing (held back, net R, in play minus random 20) | 95% interval excludes zero, in the model's favour | +0.0324 (95%: -0.0644 to +0.1292, n=238) | FAIL |
| **U5** | portfolio (held back) | total return > 0 AND Sharpe >= 1.0 | total=-6.5%, Sharpe=-0.16, maxDD=24.9% | FAIL |

U2 asks for a positive mean, not for a mean distinguishable from zero. The 95% interval on the held-back mean net R is -0.0482 to +0.0606 and it spans zero, so a passed U2 is not evidence that the per-trade edge is real. The gate said this in advance.

**PARTIAL is not a pass.** U3 failed, so this is NOT established: direction beats a coin flip (held back, paired, gross). U4 failed, so this is NOT established: the filter is the thing (held back, net R, in play minus random 20). U5 failed, so this is NOT established: portfolio (held back).

## The arms, held back, 2025-08-29 → 2026-08-28 — the verdict

Gross before net, median beside mean.

| model | arm | n | mean gross R | median gross R | mean net R | per $1,000 | median net R | hit | PF | stopped |
|---|---|---|---|---|---|---|---|---|---|---|
| `orb_sip.v3` | the model (trend gate on) | 996 | 0.0457 | -0.0947 | 0.0356 | +36 | -0.1003 | 45.7% | 1.09 | 30.6% |
| `orb_sip.v3` | its ungated base | 3,969 | 0.0274 | -0.0975 | 0.0166 | +17 | -0.1058 | 45.1% | 1.04 | 31.3% |
| `orb_sip.v3` | random 20, same rules | 1,075 | -0.0876 | -0.8240 | -0.1070 | -107 | -0.8322 | 36.3% | 0.81 | 49.1% |
| `orb_sip.v3` | matched coin flip | 3,219 | 0.0172 | -0.0923 | 0.0060 | +6 | -0.1024 | 45.3% | 1.02 | 31.0% |
| `orb_sip.v3_15m` | the model (trend gate on) | 892 | 0.0143 | -0.0283 | 0.0062 | +6 | -0.0334 | 47.5% | 1.02 | 19.3% |
| `orb_sip.v3_15m` | its ungated base | 3,576 | 0.0143 | -0.0366 | 0.0056 | +6 | -0.0455 | 46.8% | 1.02 | 19.7% |
| `orb_sip.v3_15m` | random 20, same rules | 965 | -0.0142 | -0.1453 | -0.0286 | -29 | -0.1607 | 43.0% | 0.93 | 29.8% |
| `orb_sip.v3_15m` | matched coin flip | 2,745 | 0.0261 | -0.0190 | 0.0170 | +17 | -0.0261 | 48.0% | 1.06 | 18.9% |

## The arms, build window, 2021-08-29 → 2025-08-28 — nothing was decided here, because nothing was tuned

Gross before net, median beside mean.

| model | arm | n | mean gross R | median gross R | mean net R | per $1,000 | median net R | hit | PF | stopped |
|---|---|---|---|---|---|---|---|---|---|---|
| `orb_sip.v3` | the model (trend gate on) | 4,152 | -0.0016 | -0.1680 | -0.0168 | -17 | -0.1780 | 43.3% | 0.96 | 34.7% |
| `orb_sip.v3` | its ungated base | 16,172 | 0.0335 | -0.1549 | 0.0181 | +18 | -0.1651 | 43.9% | 1.04 | 34.7% |
| `orb_sip.v3` | random 20, same rules | 4,459 | -0.0176 | -1.0021 | -0.0468 | -47 | -1.0075 | 37.0% | 0.92 | 50.4% |
| `orb_sip.v3` | matched coin flip | 13,109 | 0.0182 | -0.1590 | 0.0020 | +2 | -0.1696 | 43.3% | 1.00 | 35.1% |
| `orb_sip.v3_15m` | the model (trend gate on) | 3,683 | -0.0017 | -0.0304 | -0.0137 | -14 | -0.0396 | 47.1% | 0.96 | 20.5% |
| `orb_sip.v3_15m` | its ungated base | 14,616 | 0.0165 | -0.0324 | 0.0045 | +4 | -0.0423 | 47.2% | 1.01 | 20.3% |
| `orb_sip.v3_15m` | random 20, same rules | 4,229 | 0.0080 | -0.1755 | -0.0131 | -13 | -0.1879 | 43.4% | 0.97 | 34.7% |
| `orb_sip.v3_15m` | matched coin flip | 11,116 | 0.0172 | -0.0341 | 0.0045 | +4 | -0.0438 | 46.8% | 1.01 | 20.8% |

## The two controls, paired

**`orb_sip.v3`.**
Against the matched coin flip, paired, gross: -0.1502R (95%: -0.2058 to -0.0946) over 702 (symbol, day) pairs where both arms traded. This is T3, the gate ENGINE-7 failed at -0.1317R. The coin flip only trades when the side it drew actually broke, so the pairs where the two arms disagree are, by construction, two-way-break mornings — which is why the section above measures those directly instead of through this number.

Against twenty random eligible names under identical rules, paired by day, net: +0.0719R (95%: -0.0383 to +0.1821) over 243 days both arms traded. This is T4 — the paper's claim that abnormal opening volume does almost all the work, re-asked with the trend gate on both sides of the comparison.

**`orb_sip.v3_15m`.**
Against the matched coin flip, paired, gross: -0.0699R (95%: -0.1122 to -0.0276) over 574 (symbol, day) pairs where both arms traded. This is U3, the gate ENGINE-7 failed at -0.1317R. The coin flip only trades when the side it drew actually broke, so the pairs where the two arms disagree are, by construction, two-way-break mornings — which is why the section above measures those directly instead of through this number.

Against twenty random eligible names under identical rules, paired by day, net: +0.0324R (95%: -0.0644 to +0.1292) over 238 days both arms traded. This is U4 — the paper's claim that abnormal opening volume does almost all the work, re-asked with the trend gate on both sides of the comparison.

## The portfolio

1% of equity risked a position, gross exposure capped at 4x, a day's positions scaled down together when the cap binds, compounded daily from $100,000. **The held-back column is the one that counts, and the leverage is to be read before the return.**

| | `orb_sip.v3` held back | `orb_sip.v3` build | `orb_sip.v3_15m` held back | `orb_sip.v3_15m` build |
|---|---|---|---|---|
| total return | +18.8% | -67.3% | -6.5% | -50.0% |
| CAGR | +18.9% | -24.5% | -6.6% | -16.0% |
| Sharpe | 0.69 | -0.57 | -0.16 | -0.51 |
| max drawdown | 19.0% | 71.3% | 24.9% | 58.3% |
| days the 4x cap bound | 26/251 | 141/1004 | 13/251 | 54/1004 |

A per-trade edge near zero, levered four times across twenty concurrent positions and compounded over a year of sessions, is what produces a large percentage — and the same arithmetic runs in reverse if the sign is wrong. The per-trade number is the one to read.

## Stop geometry, and what the trend gate actually saw

| | `orb_sip.v3` | `orb_sip.v3_15m` |
|---|---|---|
| median stop distance | 164.7 cents | 205.1 cents |
| as % of price | 2.957% | 3.538% |
| in 14-day ATRs | 0.743 | 0.876 |
| commission as a share of risk | 0.0061R | 0.0049R |
| trades stopped out | 30.6% | 19.3% |

`orb_sip.v2` on ENGINE-7's held-back window: 133.9 cents, 2.840% of price, 0.749 ATR, 31.6% stopped. If the 5-minute row above differs from that by much, the two are not the same trade set and the comparison in this report is not a comparison.

### The daily trend, across every selected symbol-day in the window

| state | symbol-days | share |
|---|---|---|
| up | 13,527 | 27.2% |
| down | 11,827 | 23.8% |
| none | 24,322 | 49.0% |
| of which: no daily history at all | 0 | |
| of which: the symbol's first daily bar | 0 | |

**The unadjusted-price disclosure.** Every price in this snapshot is unadjusted, deliberately — a split-adjusted price would back-promote names into a 'price > $5' universe at prices they never traded at. The cost lands on this lane: a stock that split inside the 120-day lookback shows a step in its own history, and swing structure read across that step is wrong until the step leaves the window. **2,921 of 49,676 selected symbol-days (5.9%) sit downwind of a single session that moved 40% or more**, which is an UPPER bound on the exposure because a genuine 40% day is counted too. It is not corrected for. It is disclosed.

### `orb_sip.v3` by year, whole window

| slice | n | hit | mean R | median R | mean % | payoff | PF | total R | maxDD R | max losing run |
|---|---|---|---|---|---|---|---|---|---|---|
| 2021 | 380 | 42.4% | -0.047 | -0.216 | -0.138% | 1.22 | 0.90 | -18.0 | 46.6 | 9 |
| 2022 | 1031 | 43.5% | 0.018 | -0.193 | 0.062% | 1.35 | 1.04 | 18.3 | 33.7 | 8 |
| 2023 | 1093 | 41.4% | -0.043 | -0.232 | -0.214% | 1.28 | 0.90 | -47.5 | 68.5 | 13 |
| 2024 | 945 | 43.7% | -0.007 | -0.128 | 0.023% | 1.27 | 0.98 | -6.8 | 26.0 | 11 |
| 2025 | 1053 | 44.4% | -0.012 | -0.130 | -0.025% | 1.21 | 0.97 | -12.7 | 35.6 | 9 |
| 2026 | 646 | 47.8% | 0.050 | -0.057 | 0.216% | 1.24 | 1.14 | 32.2 | 14.8 | 10 |

### `orb_sip.v3` by side, held back

| slice | n | hit | mean R | median R | mean % | payoff | PF | total R | maxDD R | max losing run |
|---|---|---|---|---|---|---|---|---|---|---|
| long | 570 | 44.0% | -0.001 | -0.128 | 0.012% | 1.27 | 1.00 | -0.5 | 31.8 | 8 |
| short | 426 | 47.9% | 0.084 | -0.049 | 0.126% | 1.34 | 1.23 | 35.9 | 14.5 | 10 |

### `orb_sip.v3_15m` by year, whole window

| slice | n | hit | mean R | median R | mean % | payoff | PF | total R | maxDD R | max losing run |
|---|---|---|---|---|---|---|---|---|---|---|
| 2021 | 326 | 47.5% | -0.020 | -0.061 | 0.063% | 1.04 | 0.94 | -6.6 | 17.0 | 7 |
| 2022 | 962 | 46.7% | -0.012 | -0.052 | -0.116% | 1.10 | 0.97 | -11.8 | 33.9 | 9 |
| 2023 | 963 | 45.2% | -0.038 | -0.073 | -0.371% | 1.07 | 0.88 | -36.3 | 44.3 | 14 |
| 2024 | 817 | 48.3% | -0.011 | -0.024 | 0.014% | 1.03 | 0.96 | -8.6 | 30.4 | 6 |
| 2025 | 919 | 47.9% | 0.005 | -0.023 | -0.071% | 1.11 | 1.02 | 4.5 | 19.3 | 10 |
| 2026 | 588 | 48.6% | 0.024 | -0.022 | 0.088% | 1.15 | 1.09 | 14.0 | 14.4 | 6 |

### `orb_sip.v3_15m` by side, held back

| slice | n | hit | mean R | median R | mean % | payoff | PF | total R | maxDD R | max losing run |
|---|---|---|---|---|---|---|---|---|---|---|
| long | 502 | 44.4% | -0.033 | -0.084 | -0.098% | 1.12 | 0.90 | -16.3 | 26.8 | 10 |
| short | 390 | 51.5% | 0.056 | 0.027 | 0.003% | 1.14 | 1.21 | 21.8 | 7.7 | 6 |

## Cost sensitivity — disclosed, and not a result

The pre-registered cost model is $0.005/share/side plus 1.0 bp of adverse slippage, unchanged for the eighth time. These rows re-run the identical trades under two other cost models on the held-back window. **The gate is after the pre-registered costs and does not move.**

| model | cost model | n | mean net R | per $1,000 | median net R | hit | PF |
|---|---|---|---|---|---|---|---|
| `orb_sip.v3` | pre-registered (the result) | 996 | 0.0356 | +36 | -0.1003 | 45.7% | 1.09 |
| `orb_sip.v3` | quarter-bp slippage | 996 | 0.0440 | +44 | -0.0954 | 45.8% | 1.11 |
| `orb_sip.v3` | zero cost (true gross) | 996 | 0.0571 | +57 | -0.0879 | 46.1% | 1.15 |
| `orb_sip.v3_15m` | pre-registered (the result) | 892 | 0.0062 | +6 | -0.0334 | 47.5% | 1.02 |
| `orb_sip.v3_15m` | quarter-bp slippage | 892 | 0.0131 | +13 | -0.0301 | 47.6% | 1.04 |
| `orb_sip.v3_15m` | zero cost (true gross) | 892 | 0.0236 | +24 | -0.0220 | 47.9% | 1.08 |

## How sure we actually are, and what would change the answer

- **`orb_sip.v3`** rests on **996 trades over 251 sessions** spanning 2 calendar years, of which 2 of 2 were positive on their own. The 95% interval on the held-back mean net R is -0.0324 to +0.1035 — it CONTAINS zero. Verdict: **PARTIAL**.
- **`orb_sip.v3_15m`** rests on **892 trades over 251 sessions** spanning 2 calendar years, of which 1 of 2 were positive on their own. The 95% interval on the held-back mean net R is -0.0482 to +0.0606 — it CONTAINS zero. Verdict: **PARTIAL**.
- **`orb_sip.v3` across the whole five years**: -0.0067R a trade (-7 per $1,000) over 5,148 trades, positive in 2 of the 6 calendar years it touches (2022, 2026). The held-back year is drawn from the positive end of that spread, which is a fact about this test and not a criticism of it — the window was fixed in advance by the owner and by the calendar, not chosen. It does mean the held-back number should be read as one draw from a distribution whose other draws are printed above.
- **`orb_sip.v3_15m` across the whole five years**: -0.0098R a trade (-10 per $1,000) over 4,575 trades, positive in 2 of the 6 calendar years it touches (2025, 2026). The held-back year is drawn from the positive end of that spread, which is a fact about this test and not a criticism of it — the window was fixed in advance by the owner and by the calendar, not chosen. It does mean the held-back number should be read as one draw from a distribution whose other draws are printed above.
- **Twelve months is one regime.** Trades on the same day are not independent of each other, which is why the random-20 comparison is paired by day rather than by trade. A trade count in the thousands across 251 sessions is not the same evidence as a trade count in the thousands across 251 independent experiments.
- **This is the third look at data overlapping the ENGINE-6/7 held-back window**, and the filter's motivation came from a diagnosis measured partly on it. No correction is applied for either. Both are stated.
- **Two models on one year** carries about a 10% chance that one of them clears zero by luck. Read a single pass beside a single fail as weak evidence, not as a discovery.
- **What would change the answer, in order of how much it would move it:** (1) the fill model — every entry is a resting stop order filled at the worse of the level and the bar's open, which is optimistic for twenty simultaneous orders on the most volatile names of the morning; (2) short borrow, which this harness does not model at all and is not free on a stock that just gapped on news; (3) the 4x leverage cap; (4) the pool, which is the top 1,000 of the eligible universe by dollar volume rather than all of it; (5) the unadjusted daily bars the trend is read off, quantified above.
- **What this report does NOT establish**: that either model is worth trading. Nothing here has been run forward in real time, and no live-execution question — borrow, halts, locked markets, partial fills at the range close — has been touched.

## Census

| | orb_sip.v3 | its ungated base | orb_sip.v3_15m | its ungated base | random 20 (5m) | random 20 (15m) |
|---|---|---|---|---|---|---|
| days_seen | 25,100 | 25,100 | 25,098 | 25,098 | 25,099 | 25,098 |
| signals | 6,421 | 24,956 | 6,327 | 24,963 | 6,432 | 6,468 |
| signals_long | 3,455 | 12,634 | 3,386 | 12,533 | 3,477 | 3,501 |
| signals_short | 2,966 | 12,322 | 2,941 | 12,430 | 2,955 | 2,967 |
| skip_doji_opening_candle | 142 | 142 | 135 | 135 | 337 | 220 |
| skip_trend_none | 12,494 | 0 | 12,503 | 0 | 11,836 | 11,921 |
| skip_trend_opposes | 6,041 | 0 | 6,133 | 0 | 6,426 | 6,481 |
| skip_zero_width_range | 2 | 2 | 0 | 0 | 68 | 8 |
| trend_down | 2,966 | 0 | 2,941 | 5,836 | 2,955 | 2,967 |
| trend_none | 0 | 0 | 0 | 12,503 | 0 | 0 |
| trend_up | 3,455 | 0 | 3,386 | 6,624 | 3,477 | 3,501 |
| symbol-days with no cached bars | 0 | 0 | 0 | 0 | 0 | 0 |

## Selection, costs and fills

- selection: ENGINE-6's, unchanged and not recomputed — pool of the top 1,000 eligible names by prior-close 20-day dollar volume, then the top 20 by 09:30-09:35 volume over the mean of the same five minutes across the previous 14 sessions, floor 1.0. **Used for the 15-minute variant too**, because the one-minute cache exists only for the symbol-days that selection named and re-selecting at 09:45 would need a download this lane is not permitted to make. It is not lookahead — 09:35 is strictly less information than 09:45 — and it makes the two variants a comparison of range length and nothing else. It is still a deviation.
- the daily trend: `primitives/htf.py`'s `daily_structure` at ENGINE-2's numbers (pivot_n=2, lookback=120), read on the last fully closed daily bar. `tests/test_sip_daily.py` poisons the day being traded and amputates everything after it, and requires the label not to move.
- $0.005/share/side commission, 1.0 bp adverse slippage on market and stop fills
- entry is a resting stop order, filled at the worse of the level and the bar's open, plus slippage; the stop is a LEVEL, not a distance carried from the fill, so a gap through the entry costs the trader more risk and the R it is divided by is measured from the fill that actually happened
- the 15-minute stop is the opposite extreme of the WHOLE 09:30-09:45 range, not of the last five-minute candle inside it. That reading was chosen before the run and the reasoning is in [`../models/orb_sip.v3_15m/GATE.md`](../models/orb_sip.v3_15m/GATE.md); **the other reading is a different model and no number here speaks to it.**

