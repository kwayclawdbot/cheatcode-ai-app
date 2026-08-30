# `orb_sip.v2` — the same ORB, stopped at the other end of the opening candle

**Verdict: PARTIAL.** Decided on the held-back window 2024-01-01 → 2026-08-28 and on nothing else.

Snapshot `polygon-sip-v1`, unchanged and not re-downloaded. Selection reused byte for byte from ENGINE-6. Gate: [`../models/orb_sip.v2/GATE.md`](../models/orb_sip.v2/GATE.md), committed before any number below existed.

## In plain English

**What this is.** One model, changed in one place from the model ENGINE-6 ran and lost with. Pick the twenty US stocks each morning whose first five minutes traded the most abnormal volume against their own recent mornings. Buy a break above the 09:30-09:35 high if that candle closed up, sell short a break below its low if it closed down. Then hold until the closing bell unless the price comes all the way back through the other end of that same five-minute candle, which is where the stop-loss sits. ENGINE-6 put the stop a tenth of an average day's range from the entry — about twelve cents — and got knocked out of nine trades in ten. This one puts it about six times further away.

**⚠ The stop width was chosen after looking at the answer on 2016-2023, and that matters.** The ENGINE-6 post-mortem tried several stop widths on the 2016-2023 years and found the strategy stops losing somewhere between a quarter and a half of an average day's range. This model's stop lands on the winning side of that line. It is also, independently, the rule the companion published paper uses — but we cannot prove which of the two reasons actually drove the choice. **So the 2016-2023 result below is not evidence.** It is printed in full, because hiding it would be worse, but the only honest verdict is the held-back years, 2024-01-01 to 2026-08-28, which no sweep ever touched.

- **Trade count**: **10,545** trades in the held-back years (2024-01-01 → 2026-08-28), 32,392 in the contaminated 2016-2023 window, 42,937 across the whole 2016-2026 tape.
- **Date range**: 2016-01-01 → 2026-08-28, 2,679 sessions; the verdict uses the last 667 of them.
- **Did it make money on the held-back years**: **yes**. After commission and slippage the average trade returned **+0.0199** times what was risked on it — for a trader risking $1,000 a trade, that is **+20 dollars a trade** on average, over 10,545 trades. The middle trade returned -0.1180 (-118 dollars), and 45.0% of trades finished green.
- **Most trades lose.** 55% of them finish red and the middle trade loses 118 dollars. The average winner is 1.28 times the average loser, so whatever the average trade earns it earns from the tail and not from being right often. That is a shape which pays out slowly and feels bad continuously. It is also the shape the published paper describes; its own headline variant wins 24% of its trades.
- **How much of that is luck**: the 95% range around the average is -0.0025 to +0.0422 times risk, i.e. -2 to +42 dollars a trade. **That range contains zero**, so the average trade is NOT distinguishable from breaking even at this sample size, whatever the sign of the middle number.
- **Against just picking twenty names at random** from the same eligible universe and trading them identically: those returned -0.0547 times risk a trade (-55 dollars) over 11,118 trades. The published claim is that the abnormal-opening-volume filter is where essentially all of the return comes from, so the gap between those two rows is the claim under test.
- **As a portfolio** — risking 1% of the account on each of the day's twenty names, capped at 4x gross, compounded daily from $100,000 — the held-back years returned **+223.9%** ($323,881 at the end), at a Sharpe of 1.27 with a worst drawdown of 31.0%.
- **Stopped out**: 31.6% of trades, against ENGINE-6's 90.1%.
- **Verdict**: **PARTIAL**.

The stop is doing what the post-mortem said it would: the knock-out rate falls from 90.1% to 31.6%, which is the change the widening was supposed to buy. That is a consistency check on the ENGINE-6 diagnosis, not evidence for this model.

**Which gates carried the verdict, in words.** H1 passed (sample (held back)). H2 passed (sign (held back)). H3 FAILED (direction beats a coin flip (held back, paired, gross)). H4 passed (the filter is the thing (held back, net R, in play minus random 20)). H5 passed (portfolio (held back)).

**PARTIAL is not a pass.** H3 failed, so this is NOT established: direction beats a coin flip (held back, paired, gross). The gate said in advance that this outcome does not authorise shipping anything, and it does not.

## The bar, and what it observed

All five gates are read on the held-back window only. Thresholds are ENGINE-6's R1-R5 carried over unchanged in kind and in number.

| id | gate | threshold | observed | |
|---|---|---|---|---|
| **H1** | sample (held back) | >=5000 trades in 2024-01-01..2026-08-28 | n=10545 | PASS |
| **H2** | sign (held back) | mean gross R > 0 AND mean net R > 0 | gross=+0.0324, net=+0.0199 | PASS |
| **H3** | direction beats a coin flip (held back, paired, gross) | 95% interval excludes zero, in the model's favour | -0.1317 (95%: -0.1493 to -0.1141, n=7322) | FAIL |
| **H4** | the filter is the thing (held back, net R, in play minus random 20) | 95% interval excludes zero, in the model's favour | +0.0773 (95%: +0.0410 to +0.1136, n=667) | PASS |
| **H5** | portfolio (held back) | total return > 0 AND Sharpe >= 1.0 | total=+223.9%, Sharpe=1.27, maxDD=31.0% | PASS |

**H2 asks for a positive mean, not for a mean distinguishable from zero — and the distinction bites here.** The 95% interval on the held-back mean net R is -0.0025 to +0.0422 and it spans zero. H2 is passed as it was written, and it was written before the number existed so it is not being reinterpreted now; but a reader should not take a passed H2 as evidence that the per-trade edge is real. What clears its own interval here is H4 — the filter — and H5.

## The held-back window, 2024-01-01 → 2026-08-28 — gross before net, median beside mean

| arm | n | mean gross R | median gross R | mean net R | median net R | hit | PF | stopped |
|---|---|---|---|---|---|---|---|---|
| stocks in play | 10545 | 0.0324 | -0.1081 | 0.0199 | -0.1180 | 45.0% | 1.05 | 31.6% |
| random 20 control | 11118 | -0.0296 | -0.6958 | -0.0547 | -0.7185 | 38.2% | 0.90 | 48.5% |
| matched coin flip | 8471 | 0.0243 | -0.1044 | 0.0111 | -0.1151 | 44.8% | 1.03 | 31.6% |

All three arms use the same rules, the same costs and the same fills. The random-20 control differs from the stocks-in-play arm in the ranking key and in nothing else; the coin flip differs in the direction call and in nothing else.

**Against the coin flip, paired, gross:** -0.1317R (95%: -0.1493 to -0.1141) over 7,322 (symbol, day) pairs where both arms traded. This is H3 — whether knowing which way the first candle closed is worth anything once the day has already been chosen.

*Diagnostic, and it changes nothing.* The coin flip only trades when the side it drew actually broke, so the paired set splits in two. Where the flip drew the SAME side the two arms are literally the same trade and contribute exactly zero to the difference. **The whole of the H3 number therefore comes from the pairs where the flip drew the other side — which are, by construction, days on which BOTH extremes of the opening range broke.**

Of the 7,322 pairs, **5,241 agree** (identical trades, zero difference) and **2,081 disagree** — both ends of the range broke that morning. On those 2,081 days the model's side returned -0.7349R gross and the opposite side returned -0.2714R. Read plainly: **on a day that whipsaws through both ends of its opening range, the end the first candle pointed at is the losing end.** That is a real statement about the tape and not an artefact of the control.

It is also a NARROWER statement than "the direction call is worthless", because on the days only one side broke, the control did not trade at all and contributes nothing to the pairing. Unpaired across the whole held-back window the model returns +0.0324R gross against the control's +0.0243R on a different and unmatched set of trades. **The gate is the paired number, because that is what was written down, and the paired number failed.** Fixing the control so that it draws a side without conditioning on that side having broken is a NEW control and belongs to a NEW pre-registered run, not to this one.

**Against the random-20 control, paired by day, net:** +0.0773R (95%: +0.0410 to +0.1136) over 667 days both arms traded. This is H4 — the paper's claim that abnormal opening volume does almost all the work.

*Diagnostic, not a gate:* the same comparison unpaired at trade level is +0.0745R (95%: +0.0400 to +0.1090), n=10,545 against 11,118. The gate is the paired one, because that is what was written down.

### Held back, by year

| slice | n | hit | mean R | median R | mean % | payoff | PF | total R | maxDD R | max losing run |
|---|---|---|---|---|---|---|---|---|---|---|
| 2024 | 3968 | 44.0% | 0.026 | -0.143 | 0.091% | 1.35 | 1.06 | 102.1 | 41.2 | 13 |
| 2025 | 3942 | 44.5% | 0.006 | -0.134 | 0.031% | 1.27 | 1.01 | 22.9 | 32.6 | 14 |
| 2026 | 2635 | 47.1% | 0.032 | -0.059 | 0.143% | 1.22 | 1.08 | 84.3 | 41.4 | 14 |

A mean carried by one calendar year is a different object from a mean spread across three. This table is here so a reader can tell which it is without asking.

### Held back, by side

| slice | n | hit | mean R | median R | mean % | payoff | PF | total R | maxDD R | max losing run |
|---|---|---|---|---|---|---|---|---|---|---|
| long | 5429 | 44.6% | 0.015 | -0.133 | 0.057% | 1.29 | 1.04 | 80.6 | 79.1 | 13 |
| short | 5116 | 45.3% | 0.025 | -0.103 | 0.107% | 1.28 | 1.06 | 128.8 | 48.4 | 13 |

## The portfolio

1% of equity risked a position, gross exposure capped at 4x, all of a day's positions scaled down together when the cap binds, compounded daily from $100,000. **The held-back column is the one that counts.**

| | held back (the verdict) | contaminated 2016-2023 | whole tape | random 20, held back |
|---|---|---|---|---|
| total return | +223.9% | +1173.5% | +4024.6% | -71.3% |
| CAGR | +55.9% | +37.5% | +41.9% | -37.6% |
| Sharpe | 1.27 | 0.97 | 1.04 | -1.82 |
| max drawdown | 31.0% | 47.2% | 48.9% | 75.0% |
| days the 4x cap bound | 618/667 | 1968/2012 | 2586/2679 | 667/667 |

ENGINE-6's stop was so tight that the 4x cap bound on every single day; a six-times-wider stop buys six times fewer shares for the same 1% risk, so the row above is a different portfolio, not a rescaled one.

**Read the leverage before the return.** The 4x gross cap still binds on 618 of 667 held-back sessions (93%), which means the strategy wants more exposure than it is allowed on almost every day and the headline return is a statement about four-times-levered intraday exposure across twenty concurrent positions, not about the per-trade edge. The per-trade edge is +0.0199R (+20 dollars on $1,000 of risk) and its 95% interval is -0.0025 to +0.0422. A number near zero, levered four times and compounded over 667 sessions, is what produces a figure in the hundreds of percent — and the same arithmetic works in reverse if the sign is wrong.

## The contaminated window, 2016-01-01 → 2023-12-31 — a disclosure, not a verdict

This is the window the stop-width sweep was run on. Nothing here can raise or lower the verdict, and it is printed only so that the reader can see the size of the gap between a number chosen on a window and a number measured off it.

| arm | n | mean gross R | median gross R | mean net R | median net R | hit | PF | stopped |
|---|---|---|---|---|---|---|---|---|
| stocks in play | 32392 | 0.0386 | -0.2013 | 0.0202 | -0.2150 | 42.9% | 1.04 | 37.4% |
| random 20 control | 33893 | -0.0145 | -1.0038 | -0.0480 | -1.0131 | 36.1% | 0.92 | 52.6% |
| matched coin flip | 26959 | 0.0226 | -0.2036 | 0.0033 | -0.2189 | 42.3% | 1.01 | 37.4% |

### The whole tape, by year

| slice | n | hit | mean R | median R | mean % | payoff | PF | total R | maxDD R | max losing run |
|---|---|---|---|---|---|---|---|---|---|---|
| 2016 | 3987 | 43.3% | 0.042 | -0.195 | 0.112% | 1.43 | 1.09 | 166.3 | 56.7 | 14 |
| 2017 | 3928 | 42.2% | 0.010 | -0.216 | 0.072% | 1.40 | 1.02 | 38.6 | 59.2 | 15 |
| 2018 | 3985 | 43.2% | 0.026 | -0.214 | 0.126% | 1.39 | 1.06 | 102.5 | 63.5 | 13 |
| 2019 | 4037 | 42.3% | 0.011 | -0.226 | 0.052% | 1.39 | 1.02 | 44.3 | 59.9 | 13 |
| 2020 | 4127 | 42.1% | 0.017 | -0.269 | -0.031% | 1.43 | 1.04 | 68.6 | 55.0 | 11 |
| 2021 | 4184 | 43.8% | 0.028 | -0.194 | 0.173% | 1.36 | 1.06 | 118.4 | 45.7 | 13 |
| 2022 | 4082 | 43.8% | 0.028 | -0.208 | 0.113% | 1.36 | 1.06 | 116.3 | 57.7 | 14 |
| 2023 | 4062 | 42.6% | 0.000 | -0.196 | -0.018% | 1.35 | 1.00 | 0.6 | 86.7 | 13 |
| 2024 | 3968 | 44.0% | 0.026 | -0.143 | 0.091% | 1.35 | 1.06 | 102.1 | 41.2 | 13 |
| 2025 | 3942 | 44.5% | 0.006 | -0.134 | 0.031% | 1.27 | 1.01 | 22.9 | 32.6 | 14 |
| 2026 | 2635 | 47.1% | 0.032 | -0.059 | 0.143% | 1.22 | 1.08 | 84.3 | 41.4 | 14 |

## What the stop alone did — `orb_sip.v1` and `orb_sip.v2` on the same tape

Both models were replayed in the same pass over the same bars with the same selection, so this is a paired comparison of one rule change and nothing else. v1's numbers here are a re-run, and they should match [its report](orb_sip.v1.polygon-sip-v1.md); if they do not, one of the two runs is wrong and that is worth more than either result.

| window | model | n | mean gross R | mean net R | median net R | hit | stopped |
|---|---|---|---|---|---|---|---|
| held back | orb_sip.v1 | 10545 | -0.7625 | -0.8338 | -1.1360 | 8.1% | 91.2% |
| held back | orb_sip.v2 | 10545 | 0.0324 | 0.0199 | -0.1180 | 45.0% | 31.6% |
| contaminated 2016-2023 | orb_sip.v1 | 32392 | -0.6351 | -0.7229 | -1.1488 | 9.2% | 90.1% |
| contaminated 2016-2023 | orb_sip.v2 | 32392 | 0.0386 | 0.0202 | -0.2150 | 42.9% | 37.4% |

Paired on the held-back window, v2 minus v1, gross: +0.7949R (95%: +0.7392 to +0.8506) over 10,545 identical entries. **R is not the same unit in the two models** — v1 risks a tenth of an ATR and v2 risks a whole opening range, so v2's R is roughly six times more money. The paired number is a statement about which rule survived its own stop, not about which made more dollars; the portfolio table is where the dollars are.

## Stop geometry, held-back window

| | `orb_sip.v1` (10% of ATR) | `orb_sip.v2` (opposite extreme) |
|---|---|---|
| median stop distance | 17.0 cents | 133.9 cents |
| as % of price | 0.350% | 2.840% |
| in 14-day ATRs | 0.100 | 0.749 |
| commission as a share of risk | 0.0590R | 0.0075R |
| trades stopped out | 91.2% | 31.6% |

- exits, held back: {'stop': 3331, 'time': 7214}
- trades resolved by the stop-before-target assumption: 0

The cost drag is the reason ENGINE-4 and ENGINE-5 kept measuring the same law: cost as a fraction of risk is `cost per share / stop distance`, so a six-times-wider stop pays a sixth of the commission per unit of risk.

### By relative-volume decile, held-back window

| slice | n | hit | mean R | median R | mean % | payoff | PF | total R | maxDD R | max losing run |
|---|---|---|---|---|---|---|---|---|---|---|
| rvol 1.3-3.2 | 1055 | 45.6% | 0.059 | -0.116 | 0.177% | 1.36 | 1.14 | 62.1 | 24.4 | 14 |
| rvol 3.2-3.7 | 1054 | 43.5% | -0.026 | -0.193 | 0.013% | 1.22 | 0.94 | -27.5 | 46.0 | 9 |
| rvol 3.7-4.3 | 1055 | 44.7% | 0.052 | -0.103 | -0.101% | 1.39 | 1.13 | 55.2 | 27.5 | 10 |
| rvol 4.3-4.8 | 1054 | 44.5% | 0.026 | -0.138 | 0.261% | 1.33 | 1.07 | 27.6 | 38.6 | 12 |
| rvol 4.8-5.6 | 1054 | 44.1% | -0.028 | -0.132 | -0.161% | 1.18 | 0.93 | -29.3 | 59.8 | 11 |
| rvol 5.6-6.5 | 1055 | 46.5% | 0.025 | -0.099 | 0.071% | 1.22 | 1.06 | 26.1 | 23.8 | 10 |
| rvol 6.5-7.8 | 1054 | 45.3% | 0.020 | -0.093 | 0.189% | 1.27 | 1.05 | 21.5 | 18.5 | 9 |
| rvol 7.8-10.0 | 1055 | 48.3% | 0.033 | -0.046 | 0.195% | 1.16 | 1.09 | 34.4 | 24.5 | 9 |
| rvol 10.0-15.1 | 1054 | 43.8% | 0.004 | -0.137 | -0.072% | 1.29 | 1.01 | 4.0 | 40.4 | 11 |
| rvol 15.1-29252.9 | 1055 | 43.1% | 0.034 | -0.153 | 0.243% | 1.43 | 1.08 | 35.4 | 35.2 | 10 |

ENGINE-6 found this gradient monotone and pointing the WRONG way — the more abnormal the opening volume, the worse the trade, from -0.27R in the lowest decile to -1.25R in the highest. The paper's claim is that it should point the other way. Here is what it does now.

Splitting the held-back trades at the median relative volume (5.6x): the more-abnormal half returned +0.0230R net (n=5,273) and the less-abnormal half +0.0167R (n=5,272), a difference of +0.0063R (95%: -0.0383 to +0.0510). **The interval spans zero: within the twenty names already selected, ranking them more finely by relative volume buys nothing.** The inversion ENGINE-6 measured is gone, but it has not been replaced by the paper's gradient — it has been replaced by noise. What pays is being in the top twenty at all (H4), not where in the top twenty.

## Cost sensitivity — disclosed, and not a result

The pre-registered cost model is $0.005/share/side plus 1.0 bp of adverse slippage, unchanged for the seventh time. These rows re-run the identical selection under two other cost models on the held-back window. **The gate is after the pre-registered costs and does not move.**

| cost model | n | mean R | median R | hit | PF |
|---|---|---|---|---|---|
| pre-registered (the result) | 10545 | 0.0199 | -0.1180 | 45.0% | 1.05 |
| quarter-bp slippage | 10545 | 0.0282 | -0.1121 | 45.1% | 1.07 |
| zero cost (true gross) | 10545 | 0.0437 | -0.1013 | 45.5% | 1.11 |

## How sure we actually are, and what would change the answer

- The verdict rests on **10,545 trades over 667 sessions** and 3 calendar years, of which **3 of 3** were positive on their own. Three years is a small number of independent regimes, whatever the trade count says: trades on the same day are not independent of each other, which is why H4 is paired by day rather than by trade.
- The 95% interval on the held-back mean net R is -0.0025 to +0.0422 — it CONTAINS zero, so the average trade is not distinguishable from zero at this sample size.
- **This is the held-back window's second use.** `orb_sip.v1` spent one look on it. Every look costs some of what makes a held-back window worth holding back, and there is no correction applied for that here. There is no third look: the gate ruled out a third stop width before this run started.
- **What would change the answer, in order of how much it would move it:** (1) a different fill model — every entry here is a resting stop order filled at the worse of the level and the bar's open, and real fills on the most volatile names of the morning are worse than that; (2) borrow availability and cost on the short side, which this harness does not model at all and which is not free on a stock that just gapped on news; (3) the 4x leverage cap, which decides how much of the per-trade edge survives into the portfolio number; (4) the pool, which is the top 1,000 of the eligible universe by dollar volume rather than all of it.
- **What this report does NOT establish**: that the model is worth trading. A pre-registered gate cleared on a held-back window is the beginning of that conversation, not the end of it. Nothing here has been run forward on unseen data in real time, and no live-execution question — borrow, halts, locked markets, partial fills on twenty simultaneous orders at 09:35 — has been touched.

## Census

| | stocks in play | random 20 |
|---|---|---|
| days_seen | 53,573 | 53,578 |
| signals | 53,183 | 52,578 |
| signals_long | 26,751 | 26,412 |
| signals_short | 26,432 | 26,166 |
| skip_doji_opening_candle | 381 | 831 |
| skip_zero_width_range | 9 | 169 |
| symbol-days with no cached bars | 0 | 0 |

## Selection, and the lookahead treatment

Unchanged from ENGINE-6 and not recomputed — this run reads `selection.json.gz` as ENGINE-6 wrote it.

- pool: top 1,000 of the eligible set by 20-day average dollar volume as of the prior close
- selection: top 20 by 09:30-09:35 volume over the mean of the same five minutes across the previous 14 sessions, floor 1.0
- the parquet on disk holds only 09:30-10:30 of each session, so the afternoon of the day being selected for was never written; `tests/test_sip_selection.py` runs the poisoned-future and amputated-future attacks against `select_day`, requires an identical selection when the rest of the session is deleted from disk, and catches a deliberately cheating selector with the same harness

## Costs and fills

- $0.005/share/side commission, 1.0 bp adverse slippage on market and stop fills
- entry is a resting stop order, filled at the worse of the level and the bar's open, plus slippage
- the stop is a LEVEL, not a distance carried from the fill: a gap through the entry costs the trader more risk, and the R it is divided by is measured from the fill that actually happened

