# `orb_trend_str.v1` — busiest stocks, re-ordered by how hard they were already trending

**Verdict: BASELINE HOLDS.** Decided on the held-back year 2025-08-29 → 2026-08-28 and on nothing else.

Snapshot `polygon-sip-v1` for the tape, the universe and the pool, unchanged and not re-downloaded. Trend strength is computed from the split-adjusted daily bars ENGINE-9 built, on the last fully closed daily bar. Gate: [`../models/orb_trend_str.v1/GATE.md`](../models/orb_trend_str.v1/GATE.md), committed before any number below existed.

## In plain English

**What was compared.** Every trading day, pick twenty US stocks and trade each of them the same way: buy a break above the high of the 09:30-09:35 candle if that candle closed up, sell short a break below its low if it closed down, get out at the other end of the same candle if price comes back through it, otherwise hold to the closing bell. Nothing about that changes between the three arms.

- **baseline** — the twenty whose first five minutes traded the most abnormal volume against their own recent mornings. This is what already works, and it is the thing to beat.
- **rank** — the day's 40 busiest by the same measure, re-ordered by how hard the daily chart was already going the way the range broke, top twenty traded. Same number of trades a day; a different twenty. **This is the owner's idea in its most faithful form.**
- **gate_strong** — the baseline's twenty, taken only when that strength is at least +0.20 on a scale running from −1 to +1. A cut, so it trades fewer.

**What 'trend strength' is, in words.** Three readings off the daily chart as of the previous close: how far above or below its 20-day moving average the stock closed, which way and how fast that average is moving, and how many of the last twenty days closed up. Each is put on a −1 to +1 scale and the three are averaged. The sign says which way, the size says how hard. **Signed by the break direction**, so a stock falling hard that breaks DOWN scores exactly as well as one rising hard that breaks UP.

**The prior this lane has to beat, stated before the result.** ENGINE-8 put a trend filter on this exact model and it failed. That one was a yes/no — is the daily chart in a confirmed uptrend, downtrend, or neither — and about half of all stock-days answered 'neither', so it was mostly a sit-out rule. It threw away 75% of trades, and on the four build years **the trades it threw away beat the ones it kept by $47 per $1,000 risked**. On the two-way-break mornings it was built for, it kept trades returning −$723 and removed trades returning −$729: no discrimination at all. **This lane is the graded version of the same question** — not 'is it trending' but 'how hard, and which way' — and the whole point is to find out whether measuring the strength rescues an idea that failed as a switch.

**This is the held-back year's FIFTH reading.** ENGINE-7, ENGINE-8, ENGINE-9 and ENGINE-10 all touched windows containing 2025-08-29 → 2026-08-28. Nothing here was fitted on it — no parameter is swept, and the two free numbers (a pond of 40, a cut at +0.20) were written into the gate before anything ran — but four lanes have looked at this year already, and every look costs some of what makes a held-back window worth holding back. **Treat anything positive below as suggestive, never as conclusive.**

**Three arms on one held-back year is three chances to look good by luck.** Two comparisons against the incumbent plus the gradient test is three 95% intervals; the chance at least one clears by chance alone is nearer 14% than 5%. The gate stays the 95% interval, as it has in every lane; the stricter interval that corrects for taking three shots is printed beside every comparison.

### The answer to the owner's question: the curve

Every trade the incumbent took in the held-back year, sorted by how hard its daily chart was going in the direction it broke, and cut into ten equal piles from weakest to strongest. **If trend strength picks better trades, the piles should get better from left to right.**

- The weakest tenth returned **+19 dollars** a trade per $1,000 risked; the strongest tenth returned **-5 dollars**. The spread across the whole curve is -24 dollars.
- Measured properly — inside each day, the stronger half of that morning's picks minus the weaker half, so the day itself cannot flatter either side — the difference is **+33 dollars** a trade, with a 95% range of -41 dollars to +107 dollars over 251 days.
- **That range contains zero. On this year, under these rules, how hard a stock was already trending told you nothing measurable about how its opening-range break would go.** That is the answer to the question, and it does not depend on which of the arms below won.

- **baseline (the incumbent)** — 3,969 trades in the held-back year. After commission and slippage the average trade returned **+0.0166** times what was risked on it, i.e. **+17 dollars a trade** for a trader risking $1,000. The middle trade returned -0.1058 (-106 dollars), 45.1% finished green and 31.3% were stopped out. The 95% range around the average is -17 dollars to +51 dollars**, which contains zero**, so that average is not distinguishable from breaking even at this sample size.
- **rank (re-ordered by strength)** — 3,995 trades in the held-back year. After commission and slippage the average trade returned **-0.0014** times what was risked on it, i.e. **-1 dollars a trade** for a trader risking $1,000. The middle trade returned -0.1492 (-149 dollars), 43.6% finished green and 33.8% were stopped out. The 95% range around the average is -37 dollars to +34 dollars**, which contains zero**, so that average is not distinguishable from breaking even at this sample size.
- **gate_strong (a strength cut)** — 1,265 trades in the held-back year. After commission and slippage the average trade returned **+0.0464** times what was risked on it, i.e. **+46 dollars a trade** for a trader risking $1,000. The middle trade returned -0.0727 (-73 dollars), 46.3% finished green and 30.1% were stopped out. The 95% range around the average is -14 dollars to +107 dollars**, which contains zero**, so that average is not distinguishable from breaking even at this sample size.

- **rank minus baseline**, paired day by day: **-22 dollars** a trade on $1,000 of risk (-0.0220R), with a 95% range of -60 dollars to +16 dollars, over 251 days both arms traded. That range contains zero, so no difference is established — though the middle number is negative, so what evidence there is points the wrong way for the challenger.
- **gate_strong minus baseline**, paired day by day: **-7 dollars** a trade on $1,000 of risk (-0.0073R), with a 95% range of -59 dollars to +45 dollars, over 248 days both arms traded. That range contains zero, so no difference is established — though the middle number is negative, so what evidence there is points the wrong way for the challenger.

- **Verdict**: **BASELINE HOLDS**.

**The incumbent held.** Neither the re-ordering nor the cut beat abnormal opening volume by a margin that clears its own error bar, so nothing changes and the one component this programme has measured as working stays as it is. That is a useful result rather than an empty one: the cheapest way to break a working system is to bolt a second idea onto its one measured part.

**Which gates carried the verdict, in words.** G1 passed (sample, per arm (held back)). G2 FAILED (`rank` beats `baseline` (held back, paired by day, net R)). G3 FAILED (`gate_strong` beats `baseline` (held back, paired by day, net R)). G4 FAILED (the gradient (held back, baseline trades, paired by day)). G5 FAILED (sign, per arm (held back)). G6 FAILED (portfolio, per arm (held back)).

**G4 decides no arm.** It is the gradient test, it is two-sided on purpose, and it is the line the owner's question actually turns on: a gradient pointing the wrong way is as much of an answer as one pointing the right way, and no gradient at all is a third answer worth more than any verdict.

**G5 and G6 are read across all three arms, so read them per arm before concluding anything.** `baseline` made money gross (+0.0274R) and money net (+0.0166R, +17 dollars a trade) and returned +23.9% as a portfolio at a Sharpe of 0.75. `rank` made money gross (+0.0101R) and a loss net (-0.0014R, -1 dollars a trade) and returned +11.0% as a portfolio at a Sharpe of 0.45. `gate_strong` made money gross (+0.0569R) and money net (+0.0464R, +46 dollars a trade) and returned +49.2% as a portfolio at a Sharpe of 1.25.

**One arm's portfolio row will catch the eye and it must be read with its own error bar and its own leverage.** `gate_strong` returned +49.2% at a Sharpe of 1.25 on the held-back year — the only arm here that clears the Sharpe the gate asks for. A portfolio Sharpe above 1.0 has not been enough before: `orb_sip.v2` returned +223.9% at a Sharpe of 1.27 on ENGINE-7's held-back window and still came back PARTIAL. Three things stop this one being a result. **First, its own per-trade interval contains zero** (-14 dollars to +107 dollars), so the edge underneath the portfolio is not distinguishable from breaking even. **Second, it did not beat the incumbent**: paired day by day the difference is -7 dollars a trade with an interval spanning zero, which is the comparison G3 asks for and the reason the verdict is what it is. **Third, and mechanically, it is a less levered portfolio**: it takes 5.0 positions a day against the baseline's 15.8, so the 4x gross cap bound on 42 of 251 days against 227 — a portfolio whose positions are almost never scaled down is not comparable, on this line, with one whose positions are scaled down on nine days in ten. The per-trade table is the comparison; the portfolio table is a consequence of it and of the cap.

## The bar, and what it observed

All six gates are read on the held-back year only.

| id | gate | threshold | observed | |
|---|---|---|---|---|
| **G1** | sample, per arm (held back) | >=3,000 for baseline and rank, >=750 for gate_strong | baseline=3,969, rank=3,995, gate_strong=1,265 | PASS |
| **G2** | `rank` beats `baseline` (held back, paired by day, net R) | 95% interval excludes zero, in the challenger's favour | -0.0220 (95%: -0.0597 to +0.0157, n=251) | FAIL |
| **G3** | `gate_strong` beats `baseline` (held back, paired by day, net R) | 95% interval excludes zero, in the challenger's favour | -0.0073 (95%: -0.0593 to +0.0447, n=248) | FAIL |
| **G4** | the gradient (held back, baseline trades, paired by day) | strong half minus weak half by directional strength, 95% interval excludes zero | +0.0328 (95%: -0.0411 to +0.1068, n=251) | FAIL |
| **G5** | sign, per arm (held back) | mean gross R > 0 AND mean net R > 0 | baseline: gross=+0.0274/net=+0.0166, rank: gross=+0.0101/net=-0.0014, gate_strong: gross=+0.0569/net=+0.0464 | FAIL |
| **G6** | portfolio, per arm (held back) | total return > 0 AND Sharpe >= 1.0 | baseline: +23.9% @ 0.75, rank: +11.0% @ 0.45, gate_strong: +49.2% @ 1.25 | FAIL |

## The held-back year, 2025-08-29 → 2026-08-28 — gross before net, median beside mean

| arm | n | mean gross R | median gross R | mean net R | median net R | $ per $1,000 risked | hit | PF | stopped |
|---|---|---|---|---|---|---|---|---|---|
| baseline | 3,969 | 0.0274 | -0.0975 | 0.0166 | -0.1058 | +17 | 45.1% | 1.04 | 31.3% |
| rank | 3,995 | 0.0101 | -0.1417 | -0.0014 | -0.1492 | -1 | 43.6% | 1.00 | 33.8% |
| gate_strong | 1,265 | 0.0569 | -0.0655 | 0.0464 | -0.0727 | +46 | 46.3% | 1.12 | 30.1% |

Same rules, same costs, same fills, same candidate pond. The arms differ in which names they trade and in nothing else.

### The reference point that makes a losing arm readable

**Diagnostic, not a gate and not a fourth arm.** ENGINE-6 built a control that picks twenty names a day out of the same eligible pool by a deterministic hash — a coin toss with the ranking key removed. Replayed here on the same held-back year under the same rules, it is the row a losing selector has to be read against.

| arm | n | mean gross R | mean net R | median net R | $ per $1,000 | hit | PF | stopped |
|---|---|---|---|---|---|---|---|---|
| baseline | 3,969 | 0.0274 | 0.0166 | -0.1058 | +17 | 45.1% | 1.04 | 31.3% |
| rank | 3,995 | 0.0101 | -0.0014 | -0.1492 | -1 | 43.6% | 1.00 | 33.8% |
| gate_strong | 1,265 | 0.0569 | 0.0464 | -0.0727 | +46 | 46.3% | 1.12 | 30.1% |
| **random 20 (the coin toss)** | 4,160 | -0.0174 | -0.0372 | -0.5647 | -37 | 39.6% | 0.93 | 46.8% |

*Paired day by day, `rank` minus the coin toss is +32 dollars a trade (95%: -28 dollars to +92 dollars, n=251).*
*Paired day by day, `gate_strong` minus the coin toss is +50 dollars a trade (95%: -26 dollars to +127 dollars, n=248).*

## THE CURVE — outcome against trend strength, in deciles

The `baseline` arm's trades, sorted by directional trend strength and cut into ten equal piles. This is the most useful single output of the lane: it does not depend on any threshold, any pond size, or which arm won.

### Held back

| decile | strength range | n | mean gross R | mean net R | median net R | $ per $1,000 | hit | stopped | median stop |
|---|---|---|---|---|---|---|---|---|---|
| 1 | -0.867 to -0.454 | 396 | 0.0316 | 0.0192 | -0.1288 | +19 | 42.4% | 32.8% | 144.1c / 0.64 ATR |
| 2 | -0.454 to -0.310 | 396 | -0.0705 | -0.0838 | -0.2587 | -84 | 41.9% | 35.4% | 144.7c / 0.65 ATR |
| 3 | -0.310 to -0.199 | 396 | -0.0671 | -0.0780 | -0.1488 | -78 | 43.2% | 31.8% | 161.0c / 0.75 ATR |
| 4 | -0.198 to -0.096 | 396 | 0.0536 | 0.0427 | -0.0851 | +43 | 47.2% | 29.5% | 165.0c / 0.75 ATR |
| 5 | -0.096 to +0.003 | 396 | 0.0541 | 0.0453 | -0.0912 | +45 | 44.9% | 33.3% | 182.2c / 0.76 ATR |
| 6 | +0.003 to +0.113 | 396 | 0.0948 | 0.0853 | -0.0255 | +85 | 48.7% | 25.8% | 176.4c / 0.80 ATR |
| 7 | +0.114 to +0.219 | 395 | -0.0250 | -0.0349 | -0.1586 | -35 | 42.0% | 34.4% | 167.5c / 0.75 ATR |
| 8 | +0.220 to +0.341 | 395 | 0.1334 | 0.1208 | 0.0149 | +121 | 50.6% | 27.1% | 143.2c / 0.67 ATR |
| 9 | +0.341 to +0.488 | 395 | 0.0638 | 0.0547 | -0.0900 | +55 | 45.6% | 29.1% | 179.4c / 0.73 ATR |
| 10 | +0.488 to +0.897 | 395 | 0.0050 | -0.0052 | -0.1416 | -5 | 45.1% | 33.7% | 151.0c / 0.69 ATR |

*3,956 of 3,969 trades had a measurable strength; the rest had too little daily history and are not in the curve.*

### Build window

| decile | strength range | n | mean gross R | mean net R | median net R | $ per $1,000 | hit | stopped | median stop |
|---|---|---|---|---|---|---|---|---|---|
| 1 | -0.900 to -0.462 | 1,611 | 0.0021 | -0.0157 | -0.2083 | -16 | 42.6% | 36.5% | 97.0c / 0.63 ATR |
| 2 | -0.462 to -0.313 | 1,611 | 0.0480 | 0.0319 | -0.1749 | +32 | 43.5% | 35.3% | 92.4c / 0.65 ATR |
| 3 | -0.313 to -0.191 | 1,611 | 0.0515 | 0.0368 | -0.1412 | +37 | 44.6% | 33.9% | 103.2c / 0.69 ATR |
| 4 | -0.191 to -0.079 | 1,611 | 0.0802 | 0.0655 | -0.1238 | +66 | 45.3% | 33.3% | 108.6c / 0.68 ATR |
| 5 | -0.079 to +0.022 | 1,611 | 0.0340 | 0.0197 | -0.1536 | +20 | 44.3% | 33.1% | 108.9c / 0.70 ATR |
| 6 | +0.022 to +0.127 | 1,611 | 0.0509 | 0.0358 | -0.1565 | +36 | 44.6% | 33.3% | 101.5c / 0.69 ATR |
| 7 | +0.127 to +0.231 | 1,611 | -0.0208 | -0.0354 | -0.1834 | -35 | 42.6% | 34.8% | 103.7c / 0.70 ATR |
| 8 | +0.231 to +0.346 | 1,611 | 0.0491 | 0.0345 | -0.1316 | +35 | 45.1% | 32.7% | 103.5c / 0.69 ATR |
| 9 | +0.347 to +0.493 | 1,611 | 0.0619 | 0.0461 | -0.1657 | +46 | 43.6% | 36.3% | 98.1c / 0.65 ATR |
| 10 | +0.493 to +0.900 | 1,610 | -0.0202 | -0.0364 | -0.2086 | -36 | 42.6% | 37.8% | 96.6c / 0.64 ATR |

*16,109 of 16,172 trades had a measurable strength; the rest had too little daily history and are not in the curve.*

**The gradient, paired within the day** — the stronger half of a morning's picks minus the weaker half, which removes the day effect that a raw decile table cannot:

| window | n days | mean diff R | $ per $1,000 | 95% interval | 97.5%+ (three comparisons) |
|---|---|---|---|---|---|
| held back | 251 | +0.0328 | +33 | -0.0411 to +0.1068 | -0.0575 to +0.1232 |
| build window | 1,004 | +0.0051 | +5 | -0.0363 to +0.0466 | -0.0455 to +0.0558 |

## Stop width, the mechanism that has explained every result in this programme

The stop in `orb_sip.v2` is the far end of the 09:30-09:35 candle, so the risk on a trade IS the width of that candle, and cost as a fraction of risk is `cost per share / stop distance`. ENGINE-9's Kai arm lost for exactly this reason: it selected coiled names, coiled names open quietly, a quiet five minutes is a NARROW five minutes, and a narrow stop is a stop that gets hit. **Strongly-trending names can do the same thing, so the question is asked here before any conclusion is drawn.**

| arm | median stop distance | as % of price | in 14-day ATRs | commission as a share of risk | stopped out |
|---|---|---|---|---|---|
| baseline | 164.2 cents | 2.931% | 0.719 | 0.0061R | 31.3% |
| rank | 145.4 cents | 2.497% | 0.616 | 0.0069R | 33.8% |
| gate_strong | 159.7 cents | 2.896% | 0.704 | 0.0063R | 30.1% |
| **random 20** | 76.8 cents | 1.192% | 0.611 | 0.0130R | 46.8% |

**`rank` narrows the stop.** Its median stop is 145.4 cents against the baseline's 164.2, 11% tighter, and it is stopped out on 33.8% of trades against 31.3%. **That is the explanation, and it is stated here rather than left for the reader to spot:** where this arm differs from the incumbent, it is trading a quieter opening candle, and a quieter opening candle is a tighter stop, and a tighter stop is a worse trade under these rules.

**`gate_strong` leaves the stop width alone** — 159.7 cents against the baseline's 164.2. The ENGINE-9 mechanism is not in play for this arm, in either direction.

### The second mechanism: which side of the book the ranking fills

A strength ranking is not side-neutral in a year when most charts point one way. In a rising market more names carry positive strength, so a ranking that prefers strength in the break direction quietly buys more and shorts less — and in this model the two sides do not pay the same.

| arm | long share of trades (held back) | mean net R, long | mean net R, short |
|---|---|---|---|
| baseline | 51.9% | +0.0033 (+3) | +0.0310 (+31) |
| rank | 57.8% | -0.0317 (-32) | +0.0401 (+40) |
| gate_strong | 58.9% | +0.0509 (+51) | +0.0400 (+40) |

**The `rank` arm tilts the book long** — 57.8% of its trades against the incumbent's 51.9% — and on this year the long side was the weaker of the two for the incumbent as well. So the re-ordering does two things at once: it narrows the stop, and it moves trades onto the side that paid less. Neither was the intention and both are consequences of ranking on a number that is mostly positive in a rising market.

## What `gate_strong` removed, and what those trades did

A filter that discards winners is not helping even if the average of what is left improves. The gated arm is a strict subset of the baseline — same symbol-days, same levels, same stops, one extra reason to skip — and the runner asserts that before it writes anything, so every baseline trade is either kept or removed and there is no third category.

| held back | n | mean net R | per $1,000 risked | median net R | hit | stopped |
|---|---|---|---|---|---|---|
| kept by the cut (the model) | 1,265 | 0.0464 | +46 | -0.0727 | 46.3% | 30.1% |
| REMOVED by the cut | 2,704 | 0.0027 | +3 | -0.1169 | 44.6% | 31.9% |

The cut removed **2,704 of 3,969 trades** (68%). Kept minus removed is **+0.0437R** (95%: -0.0295 to +0.1168) — +44 dollars a trade on $1,000 of risk.

| build window | n | mean net R | per $1,000 risked | median net R | hit | stopped |
|---|---|---|---|---|---|---|
| kept by the cut (the model) | 5,327 | 0.0131 | +13 | -0.1648 | 43.8% | 35.6% |
| REMOVED by the cut | 10,845 | 0.0206 | +21 | -0.1659 | 43.9% | 34.3% |

The cut removed **10,845 of 16,172 trades** (67%). Kept minus removed is **-0.0074R** (95%: -0.0472 to +0.0323) — -7 dollars a trade on $1,000 of risk.

**The cut is discarding winners.** The trades it removed returned +0.0206R and the ones it kept returned +0.0131R. The gate required this sentence in these words if it happened, whatever the verdict says: a filter that skips trades which would have won is not helping, even if the average of what is left improves.

## Against ENGINE-8: does grading the trend rescue it?

| | ENGINE-8 (`orb_sip.v3`) | ENGINE-11 (`gate_strong`) |
|---|---|---|
| what the trend was | a three-state label: up, down, none | a continuous number on [−1, +1] |
| how it was used | a gate, and only a gate | a ranking first, a gate second |
| daily bars | unadjusted, splits disclosed as an upper bound | split-adjusted |
| trades kept (held back) | 996 of 3,969 (25%) | 1,265 of 3,969 (32%) |
| mean net R, kept (held back) | +0.0356 (+36 per $1,000) | +0.0464 (+46 per $1,000) |
| mean net R, removed (held back) | +0.0103 (+10 per $1,000) | +0.0027 (+3 per $1,000) |
| kept minus removed (build) | −0.0470 (95%: −0.0884 to −0.0057) — the filter discarded winners | -0.0074 |

## How different are the two lists, actually

| | picks a day | names shared with `baseline` |
|---|---|---|
| baseline | 20.0 | 20.0 |
| rank | 20.0 | 10.0 |

If two selectors pick mostly the same names, the comparison between them is a comparison of the few names they disagree about, whatever the trade count says.

### And what kind of name each one picks

| arm | median relative volume | median strength | median strength in the break direction |
|---|---|---|---|
| baseline | 5.41x | +0.028 | +0.018 |
| rank | 3.70x | +0.041 | +0.286 |

**The `baseline` arm is not a re-implementation of ENGINE-6's selector; it is the same one.** On the 1,255 sessions the two lanes share, the `baseline` picks here are identical to the names ENGINE-6 wrote to `selection.json.gz` on **1,255** of them (100.00%). Anything the challengers gain or lose is measured against the thing ENGINE-7 actually reported.

## The portfolio

1% of equity risked a position, gross exposure capped at 4x, a day's positions scaled down together when the cap binds, compounded daily from $100,000. **The held-back column is the one that counts.**

| arm | total return (held back) | CAGR | Sharpe | max drawdown | days the 4x cap bound | total return (build window) |
|---|---|---|---|---|---|---|
| baseline | +23.9% | +24.0% | 0.75 | 25.8% | 227/251 | +344.8% |
| rank | +11.0% | +11.0% | 0.45 | 24.5% | 241/251 | -72.9% |
| gate_strong | +49.2% | +49.5% | 1.25 | 19.0% | 42/251 | +24.5% |

**Read the leverage before the return.** A portfolio number here is a statement about four-times-levered intraday exposure across twenty concurrent positions, not about the per-trade edge. The per-trade edge is the table above it.

**And read the cap-binding column before comparing two rows.** An arm that trades fewer names a day asks for less gross exposure, so the 4x cap scales it down on fewer days, so more of its per-trade edge — whatever sign that edge has — reaches the equity curve. `baseline` took 15.8 positions a day and was capped on 227 of 251 days. `rank` took 15.9 positions a day and was capped on 241 of 251 days. `gate_strong` took 5.0 positions a day and was capped on 42 of 251 days. Two rows of this table are only comparable to the extent those numbers are, which is why the verdict is decided on the per-trade comparison and not here.

## The build window, 2021-08-29 → 2025-08-28 — a disclosure, not a verdict

Nothing here can raise or lower the verdict. It is printed so a reader can see whether the held-back year looks like the four before it, and because `orb_sip.v2`'s stop width was chosen by reading a sweep of 2016-2023 — which overlaps 2021-2023 inside this window.

| arm | n | mean gross R | mean net R | median net R | $ per $1,000 | hit | PF | stopped |
|---|---|---|---|---|---|---|---|---|
| baseline | 16,172 | 0.0335 | 0.0181 | -0.1651 | +18 | 43.9% | 1.04 | 34.7% |
| rank | 16,379 | 0.0062 | -0.0108 | -0.2197 | -11 | 42.6% | 0.98 | 37.8% |
| gate_strong | 5,327 | 0.0285 | 0.0131 | -0.1648 | +13 | 43.8% | 1.03 | 35.6% |

| comparison (build window) | n days | mean diff R | 95% interval |
|---|---|---|---|
| rank − baseline | 1,004 | -0.0357 | -0.0573 to -0.0141 |
| gate_strong − baseline | 998 | -0.0230 | -0.0580 to +0.0120 |

### By calendar year, all three arms

| slice | n | hit | mean R | median R | mean % | payoff | PF | total R | maxDD R | max losing run |
|---|---|---|---|---|---|---|---|---|---|---|
| baseline 2021 | 1452 | 43.2% | 0.023 | -0.176 | 0.133% | 1.38 | 1.05 | 33.0 | 38.0 | 11 |
| baseline 2022 | 4082 | 43.8% | 0.028 | -0.208 | 0.113% | 1.36 | 1.06 | 116.3 | 57.7 | 14 |
| baseline 2023 | 4062 | 42.6% | 0.000 | -0.196 | -0.018% | 1.35 | 1.00 | 0.6 | 86.7 | 13 |
| baseline 2024 | 3968 | 44.0% | 0.026 | -0.143 | 0.091% | 1.35 | 1.06 | 102.1 | 41.2 | 13 |
| baseline 2025 | 3942 | 44.5% | 0.006 | -0.134 | 0.031% | 1.27 | 1.01 | 22.9 | 32.6 | 14 |
| baseline 2026 | 2635 | 47.1% | 0.032 | -0.059 | 0.143% | 1.22 | 1.08 | 84.3 | 41.4 | 14 |
| rank 2021 | 1467 | 42.1% | -0.018 | -0.271 | 0.089% | 1.33 | 0.96 | -26.3 | 90.2 | 13 |
| rank 2022 | 4165 | 41.3% | -0.020 | -0.291 | -0.042% | 1.36 | 0.96 | -81.6 | 117.9 | 14 |
| rank 2023 | 4108 | 42.9% | 0.007 | -0.213 | -0.057% | 1.35 | 1.01 | 27.9 | 81.4 | 12 |
| rank 2024 | 4029 | 42.6% | -0.013 | -0.198 | 0.036% | 1.31 | 0.97 | -51.5 | 135.2 | 22 |
| rank 2025 | 3956 | 43.3% | -0.021 | -0.170 | -0.028% | 1.25 | 0.95 | -82.1 | 100.0 | 14 |
| rank 2026 | 2649 | 44.7% | 0.012 | -0.118 | 0.104% | 1.27 | 1.03 | 30.6 | 61.1 | 11 |
| gate_strong 2021 | 495 | 43.6% | 0.035 | -0.165 | 0.046% | 1.39 | 1.08 | 17.4 | 19.3 | 12 |
| gate_strong 2022 | 1291 | 43.4% | 0.005 | -0.225 | -0.107% | 1.32 | 1.01 | 6.3 | 46.3 | 12 |
| gate_strong 2023 | 1361 | 42.6% | 0.007 | -0.175 | -0.097% | 1.37 | 1.02 | 8.9 | 40.5 | 11 |
| gate_strong 2024 | 1330 | 44.2% | 0.032 | -0.124 | 0.155% | 1.36 | 1.08 | 42.1 | 36.2 | 12 |
| gate_strong 2025 | 1280 | 44.5% | 0.005 | -0.121 | -0.034% | 1.26 | 1.01 | 6.7 | 33.3 | 15 |
| gate_strong 2026 | 835 | 48.3% | 0.056 | -0.037 | 0.219% | 1.24 | 1.16 | 47.1 | 13.0 | 9 |

### Held back, by arm and side

| slice | n | hit | mean R | median R | mean % | payoff | PF | total R | maxDD R | max losing run |
|---|---|---|---|---|---|---|---|---|---|---|
| baseline long | 2059 | 44.4% | 0.003 | -0.126 | 0.054% | 1.26 | 1.01 | 6.9 | 53.9 | 12 |
| baseline short | 1910 | 45.9% | 0.031 | -0.083 | 0.041% | 1.27 | 1.08 | 59.2 | 28.8 | 11 |
| rank long | 2311 | 42.7% | -0.032 | -0.181 | 0.005% | 1.25 | 0.93 | -73.2 | 80.5 | 12 |
| rank short | 1684 | 45.0% | 0.040 | -0.111 | 0.175% | 1.35 | 1.10 | 67.6 | 34.0 | 14 |
| gate_strong long | 745 | 46.6% | 0.051 | -0.072 | 0.156% | 1.30 | 1.13 | 37.9 | 23.1 | 10 |
| gate_strong short | 520 | 46.0% | 0.040 | -0.080 | 0.213% | 1.30 | 1.10 | 20.8 | 20.0 | 10 |

## Census and coverage

- sessions planned: **1,255**
- candidates a day: median **985** of a 987-name pool
- of those, **983** on the median day had a measurable trend strength (100%) — the rest had fewer than 30 closed daily bars in the adjusted book, or no usable ATR
- and **971** had a break direction at all; the rest opened on a doji five-minute candle, which the model skips anyway

**Direction, five-minute aggregate against one-minute reconstruction.** The selector reads the break direction off Polygon's 09:30 five-minute bar; the model rebuilds the same candle from one-minute prints when it trades. They disagree on **0 of 20,141** baseline trades (0.00%). The selector is not allowed the one-minute tape for names it has not picked yet, so this residual is a property of the design and is printed rather than assumed away.

| | baseline | rank | gate_strong |
|---|---|---|---|
| days_seen | 25,100 | 25,100 | 25,100 |
| signals | 24,956 | 25,100 | 8,154 |
| signals_long | 12,634 | 13,566 | 4,403 |
| signals_short | 12,322 | 11,534 | 3,751 |
| skip_doji_opening_candle | 142 | 0 | 142 |
| skip_no_strength | 0 | 0 | 94 |
| skip_weak_trend | 0 | 0 | 16,708 |
| skip_zero_width_range | 2 | 0 | 2 |
| symbol-days with no cached bars | 0 | 0 | 0 |

**Why `rank` skips no doji candles.** A name whose opening candle closed exactly where it opened has no break direction, so the ranking puts it at the back of the pond by construction — and with forty names competing for twenty places it never reaches the front. That is not the arm dodging a bad trade with information it should not have: the model would have skipped those names anyway, and the count of them is the `skip_doji_opening_candle` row in the baseline column.

## Cost sensitivity — disclosed, and not a result

The pre-registered cost model is $0.005/share/side plus 1.0 bp of adverse slippage, unchanged for the eleventh time. **The gate is after the pre-registered costs and does not move.**

| arm | cost model | n | mean R | median R | hit | PF |
|---|---|---|---|---|---|---|
| baseline | pre-registered (the result) | 3,969 | 0.0166 | -0.1058 | 45.1% | 1.04 |
| baseline | quarter-bp slippage | 3,969 | 0.0253 | -0.0992 | 45.3% | 1.06 |
| baseline | zero cost (true gross) | 3,969 | 0.0391 | -0.0904 | 45.7% | 1.10 |
| rank | pre-registered (the result) | 3,995 | -0.0014 | -0.1492 | 43.6% | 1.00 |
| rank | quarter-bp slippage | 3,995 | 0.0067 | -0.1438 | 43.8% | 1.02 |
| rank | zero cost (true gross) | 3,995 | 0.0211 | -0.1338 | 44.3% | 1.05 |

## How sure we actually are, and what would change the answer

- The verdict rests on ONE calendar year — 251 sessions — and on the trade counts in the table above. One year is one regime.
- **This is the held-back year's FIFTH reading.** ENGINE-7's held-back window (2024-01-01 → 2026-08-28) contained all of it, and ENGINE-8, ENGINE-9 and ENGINE-10 all read windows containing it too. Every reading costs some of what makes a held-back window worth holding back, and no correction is applied. What is new in this lane is the strength measure and the two arms built on it; everything downstream has been read on this year four times before.
- **`orb_sip.v2`'s stop width was chosen by looking at a sweep of 2016-2023.** That does not touch the held-back year, but the build window above inherits the contamination for 2021-2023.
- **Three comparisons, one year.** The Bonferroni column is the size of that problem, printed rather than argued about.
- **The two windows disagree about `gate_strong`, and the disagreement is the finding.** On the held-back year the cut kept the better trades (+0.0464R kept against +0.0027R removed). On the four build years it kept the worse ones (+0.0131R kept against +0.0206R removed) — the same shape of failure ENGINE-8 had, on four times the sample. One year agreeing and four disagreeing is what a threshold with no real edge behind it looks like, and it is the single strongest reason not to read the held-back column as a discovery.
- **The two free numbers are two guesses.** A pond of 40 and a cut at +0.20 were fixed in the gate before anything ran and neither was swept — which protects the result from being fitted, and equally means neither is claimed to be the best available value. The decile table is the honest answer to 'what about a different cut': it shows what every cut would have done, without any of them being the pre-registered one.
- **What would change the answer, in order of how much it would move it:** (1) the fill model — every entry is a resting stop order filled at the worse of the level and the bar's open, and real fills on the morning's most volatile names are worse than that; (2) borrow on the short side, which this harness does not model at all; (3) the pool, which is the top 1,000 of the eligible universe by dollar volume rather than all of it; (4) the 4x leverage cap, which decides how much of any per-trade edge survives into a portfolio number.
- **What this report does NOT establish**: that any of these three arms is worth trading. It establishes whether a graded trend-strength measure ranks day-trade candidates better than abnormal opening volume alone, on one held-back year, under one set of downstream rules that has itself only ever come back PARTIAL.

## Selection, and the lookahead treatment

- pool: top 1,000 of the eligible set by 20-day average dollar volume as of the prior close — ENGINE-6's pool, unchanged
- candidates: pool names with a 09:30-09:35 bar today and a full 14-session baseline, so a relative volume exists. Both selectors rank the same list.
- `baseline`: top 20 by that relative volume, floor 1.0
- `rank`: the top 40 by the same relative volume, re-sorted by directional trend strength, top 20 taken. Names with no strength or no break direction fall to the back of the pond in relative-volume order rather than being dropped, so the trade count is held.
- `gate_strong`: the baseline's picks, traded only when directional strength ≥ +0.20
- the opening-bar parquet holds only 09:30-10:30, so the afternoon of the day being selected for was never written; the daily bars stop at the prior close by construction. `tests/test_trend_strength.py` runs the poisoned-future and amputated-future attacks against the measure and catches a deliberately cheating one with the same harness; `tests/test_strength_selection.py` does the same for the ranking, including deleting the selection day's own session after 09:35 and requiring a byte-identical selection.

## Costs and fills

- $0.005/share/side commission, 1.0 bp adverse slippage on market and stop fills
- entry is a resting stop order, filled at the worse of the level and the bar's open, plus slippage
- the stop is a LEVEL, not a distance carried from the fill

