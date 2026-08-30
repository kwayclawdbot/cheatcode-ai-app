# `orb_spy.v1` — the working spec on SPY alone, every session, no selection

**Verdict year 2025-08-29 → 2026-08-28: FAILED.** **Untouched span 2012-01-01 → 2021-08-28: FAILED.** Two windows, five pre-registered gates each, neither able to overwrite the other.

Snapshot `polygon-deep-v1`, already on disk and not re-downloaded. Gate: [`../models/orb_spy.v1/GATE.md`](../models/orb_spy.v1/GATE.md), committed before any number below existed. Run 2026-08-30T04:16:43+00:00 at `dcd3048`.

## The stop width, before any performance number

The gate required this paragraph first and required it in the summary rather than in a footnote, because stop width is the only parameter this programme has ever found that decides the sign of this family. ENGINE-6's sweep put the flip between 0.25x and 0.50x of the 14-day ATR.

| | median stop | as % of price | in 14-day ATRs | stopped out |
|---|---|---|---|---|
| **`orb_spy.v1` on SPY** (this lane, 3,445 trades) | 52.7 cents | 0.171% | **0.164** | 76.2% |
| ENGINE-4 on SPY (trigger-candle stop, 2,081 trades) | 29.4 cents | 0.104% | **0.096** | — |
| `orb_sip.v2` on stocks in play (ENGINE-7 held-back window, 10,545 trades) | 133.9 cents | 2.840% | **0.749** | 31.6% |
| the same model's baseline (ENGINE-9/ENGINE-11 baseline, held-back year) | 164.2 cents | 2.931% | **0.719** | 31.3% |

ENGINE-4's ATR figure is recomputed here from the same daily bars this lane uses, off its committed trade dump. Nothing of ENGINE-4's is re-run and none of its numbers change; only the unit is made common.

> **The disclosure trigger fired.** SPY's opening five-minute candle is a median **0.164 of a 14-day ATR** wide, which is BELOW the 0.50 floor written into the gate. **This lane did not put the wide stop on SPY.** It put a narrower one, inside the zone ENGINE-6's sweep measured as losing, and on the evidence of every previous lane that is likely the whole answer to the owner's question. The stocks the strategy actually selects are chosen for abnormal opening activity, and an abnormally active stock has a wide opening range; SPY, traded every day whatever it is doing, does not.

## In plain English

**What this is.** One model, on one instrument, with no picking. Every session, look at SPY's first five minutes. If that candle closed up, leave a buy order just above its high; if it closed down, leave a sell order just below its low. Whichever way it goes, the stop-loss sits at the OTHER end of that same five-minute candle. There is no profit target: whatever is left is sold at the closing bell.

**Why it was worth asking.** The stocks-in-play version of this — the one ENGINE-7 measured — picks the twenty US stocks each morning whose first five minutes were most abnormally busy. It has **never once picked SPY**: 0 trades out of 42,937. So nothing measured so far says anything about the most widely traded instrument in the world, and the owner asked directly.

- **Trades**: **240** in the verdict year (2025-08-29 → 2026-08-28), **2,267** in the untouched span (2012-01-01 → 2021-08-28), 938 in the owner's build years, **3,445** across the whole cache (3,685 sessions, 2012-01-03 → 2026-08-28).
- **The verdict year**: the average trade returned **-0.2002** times what was risked on it after costs — for a trader risking $1,000 a trade, **-200 dollars a trade**. The middle trade returned -1.0502 (-1,050 dollars) and 25.8% finished green. The 95% range around that average is -411 to +11 dollars a trade.
- **The untouched span** — the stronger evidence, because no lane has ever read it for this spec: the average trade returned **-0.2359** (**-236 dollars** per $1,000 risked), middle trade -1.0785 (-1,079 dollars), 21.1% green, 95% range -317 to -155 dollars.
- **The whole cache, fifteen years**: 3,445 trades averaging -0.2080 (-208 dollars per $1,000 risked), middle trade -1.0666, 21.8% green, profit factor 0.75.
- **Against a coin flip on the same sessions with the same geometry**, before costs: -0.1699 a trade in the verdict year and -0.1916 in the untouched span. Full detail in the gate tables.
- **Stopped out**: 76.2% of trades across the whole cache, against `orb_sip.v2`'s 31.6% on stocks.
- **Compared with the stocks-in-play version**: that model returned +0.0199R (**+20 dollars** per $1,000 risked) over 10,545 held-back trades with a 95% range of -2 to +42 dollars — an interval that also contains zero. This lane's numbers are printed beside it below.
- **Compared with ENGINE-4**, which traded SPY every day on this same cache with a 15-minute range, a trend filter, a 2R target and a much tighter stop: it lost -0.359R in sample and -0.154R out of sample. This lane, with the stop that rescued the stocks model, lost -0.208R. **Two different specs, the same sign, on the same instrument, fifteen years apart in construction** — and both of them carrying a stop far inside the losing zone of ENGINE-6's sweep.

**The mechanism, in one sentence.** Entry sits at one end of the opening five-minute candle and the stop at the other, so a stop-out needs a move of only one candle width — 53 cents, 0.171% of price, 0.16 of a 14-day ATR — and SPY delivers that many times an ordinary morning. It duly happens on 76.2% of trades, against 31.6% on the stocks the strategy actually picks, whose opening candles are four and a half times wider in ATR terms.

> **The verdict year's 95% interval contains zero** (-411 to +11 dollars per $1,000 risked). Whatever the sign of the middle number, the average trade is NOT distinguishable from breaking even at this sample size. The gate required this sentence wherever it happens.

## The verdict year, 2025-08-29 → 2026-08-28 — **FAILED**

| id | gate | threshold | observed | |
|---|---|---|---|---|
| **S1** | sample (2025-08-29..2026-08-28) | >=200 trades | n=240 | PASS |
| **S2** | sign | mean gross R > 0 AND mean net R > 0 | gross=-0.0790, net=-0.2002 | **FAIL** |
| **S3** | direction beats a coin flip (paired, gross) | 95% interval excludes zero, in the model's favour | -0.1699 (95%: -0.3215 to -0.0183, n=211) | **FAIL** |
| **S4** | the edge is distinguishable from zero (net R) | 95% interval on the mean net R excludes zero, in the model's favour | -0.2002 (95%: -0.4111 to +0.0106, n=240) | **FAIL** |
| **S5** | portfolio | total return > 0 AND Sharpe >= 1.0 | total=-31.0%, Sharpe=-1.89, maxDD=34.5% | **FAIL** |

**Not established on this window**: sign; direction beats a coin flip (paired, gross); the edge is distinguishable from zero (net R); portfolio.

| arm | n | mean gross R | median gross R | mean net R | median net R | per $1,000 risked | hit | PF | stopped |
|---|---|---|---|---|---|---|---|---|---|
| orb_spy.v1 | 240 | -0.0790 | -1.0000 | -0.2002 | -1.0502 | -200 | 25.8% | 0.74 | 72.1% |
| matched coin flip | 215 | -0.1805 | -1.0000 | -0.2946 | -1.0514 | -295 | 21.4% | 0.64 | 74.9% |

*The pairing, unpacked — ENGINE-7's diagnostic, inherited.* Of the 211 paired sessions, **115 agree** — the flip drew the same side, the two arms are literally the same trade, and they contribute exactly zero to the difference. The whole of it comes from the **96 that disagree**, which are by construction the mornings on which BOTH ends of the opening range broke: on those the model's side returned -0.8460 gross and the opposite side -0.4725. That is why the unpaired means in the table above and the paired number in the gate can point different ways, and the gate is the paired one because that is what was written down.

## The untouched span, 2012-01-01 → 2021-08-28 — **FAILED**

| id | gate | threshold | observed | |
|---|---|---|---|---|
| **F1** | sample (2012-01-01..2021-08-28) | >=1500 trades | n=2267 | PASS |
| **F2** | sign | mean gross R > 0 AND mean net R > 0 | gross=-0.0784, net=-0.2359 | **FAIL** |
| **F3** | direction beats a coin flip (paired, gross) | 95% interval excludes zero, in the model's favour | -0.1916 (95%: -0.2507 to -0.1326, n=2050) | **FAIL** |
| **F4** | the edge is distinguishable from zero (net R) | 95% interval on the mean net R excludes zero, in the model's favour | -0.2359 (95%: -0.3169 to -0.1548, n=2267) | **FAIL** |
| **F5** | portfolio | total return > 0 AND Sharpe >= 1.0 | total=-96.4%, Sharpe=-1.56, maxDD=96.6% | **FAIL** |

**Not established on this window**: sign; direction beats a coin flip (paired, gross); the edge is distinguishable from zero (net R); portfolio.

| arm | n | mean gross R | median gross R | mean net R | median net R | per $1,000 risked | hit | PF | stopped |
|---|---|---|---|---|---|---|---|---|---|
| orb_spy.v1 | 2267 | -0.0784 | -1.0000 | -0.2359 | -1.0785 | -236 | 21.1% | 0.72 | 76.4% |
| matched coin flip | 2102 | -0.1615 | -1.0000 | -0.3137 | -1.0793 | -314 | 21.1% | 0.64 | 76.2% |

*The pairing, unpacked — ENGINE-7's diagnostic, inherited.* Of the 2,050 paired sessions, **1,175 agree** — the flip drew the same side, the two arms are literally the same trade, and they contribute exactly zero to the difference. The whole of it comes from the **875 that disagree**, which are by construction the mornings on which BOTH ends of the opening range broke: on those the model's side returned -0.8631 gross and the opposite side -0.4142. That is why the unpaired means in the table above and the paired number in the gate can point different ways, and the gate is the paired one because that is what was written down.

## Every window, side by side — gross before net, median beside mean

| window | n | mean gross R | median gross R | mean net R | median net R | per $1,000 risked | hit | PF | stopped |
|---|---|---|---|---|---|---|---|---|---|
| untouched 2012-01-01..2021-08-28 | 2267 | -0.0784 | -1.0000 | -0.2359 | -1.0785 | -236 | 21.1% | 0.72 | 76.4% |
| build 2021-08-29..2025-08-28 | 938 | -0.0268 | -1.0000 | -0.1425 | -1.0503 | -143 | 22.5% | 0.83 | 76.5% |
| held_back 2025-08-29..2026-08-28 | 240 | -0.0790 | -1.0000 | -0.2002 | -1.0502 | -200 | 25.8% | 0.74 | 72.1% |
| full 2012-01-01..2026-08-28 | 3445 | -0.0644 | -1.0000 | -0.2080 | -1.0666 | -208 | 21.8% | 0.75 | 76.2% |

The build window overlaps neither of the two gated windows and is printed because the owner's five years are build-plus-verdict; the full row is the untouched span, the build years and the verdict year together.

### SPY by calendar year

| slice | n | hit | mean R | median R | mean % | payoff | PF | total R | maxDD R | max losing run |
|---|---|---|---|---|---|---|---|---|---|---|
| 2012 | 232 | 19.4% | -0.307 | -1.096 | -0.043% | 2.76 | 0.66 | -71.2 | 90.4 | 37 |
| 2013 | 230 | 20.4% | -0.193 | -1.104 | -0.029% | 3.02 | 0.78 | -44.4 | 57.3 | 19 |
| 2014 | 240 | 23.8% | -0.126 | -1.084 | -0.008% | 2.73 | 0.85 | -30.3 | 41.3 | 16 |
| 2015 | 237 | 21.5% | -0.206 | -1.065 | -0.044% | 2.77 | 0.76 | -48.9 | 73.9 | 14 |
| 2016 | 234 | 21.4% | -0.209 | -1.086 | -0.036% | 2.78 | 0.76 | -48.8 | 72.3 | 26 |
| 2017 | 235 | 21.7% | -0.440 | -1.120 | -0.041% | 1.78 | 0.49 | -103.4 | 109.9 | 17 |
| 2018 | 238 | 17.6% | -0.270 | -1.067 | -0.039% | 3.21 | 0.69 | -64.2 | 82.9 | 18 |
| 2019 | 234 | 23.5% | -0.145 | -1.072 | -0.026% | 2.67 | 0.82 | -34.0 | 56.6 | 17 |
| 2020 | 236 | 18.2% | -0.301 | -1.044 | -0.106% | 2.96 | 0.66 | -71.1 | 72.4 | 18 |
| 2021 | 231 | 24.7% | -0.148 | -1.060 | -0.024% | 2.48 | 0.81 | -34.2 | 54.3 | 16 |
| 2022 | 233 | 24.5% | -0.072 | -1.032 | -0.009% | 2.80 | 0.91 | -16.8 | 23.2 | 12 |
| 2023 | 234 | 20.5% | -0.039 | -1.059 | -0.029% | 3.69 | 0.95 | -9.2 | 34.7 | 13 |
| 2024 | 235 | 17.0% | -0.431 | -1.074 | -0.057% | 2.58 | 0.53 | -101.2 | 111.2 | 23 |
| 2025 | 239 | 28.0% | -0.026 | -1.049 | -0.023% | 2.48 | 0.97 | -6.2 | 39.6 | 15 |
| 2026 | 157 | 26.1% | -0.208 | -1.047 | -0.040% | 2.07 | 0.73 | -32.6 | 38.2 | 13 |

**0 of 15 calendar years positive after costs.** A mean carried by a handful of years is a different object from one spread across fifteen, and this table is here so a reader can tell which it is without asking.

### SPY by side, whole cache

| slice | n | hit | mean R | median R | mean % | payoff | PF | total R | maxDD R | max losing run |
|---|---|---|---|---|---|---|---|---|---|---|
| long | 1771 | 23.4% | -0.183 | -1.067 | -0.028% | 2.55 | 0.78 | -324.9 | 332.9 | 18 |
| short | 1674 | 20.1% | -0.234 | -1.066 | -0.046% | 2.89 | 0.73 | -391.6 | 391.9 | 35 |

## The trades that got to 1R

The gate asked for this whichever way it came out. **1R is one unit of the money risked** — here, the width of the opening five-minute candle. Across every earlier version of this family, roughly four trades in five that ever traded 1R in their favour went on to finish winners; it is the most stable statistic in the programme.

| | window | trades | reached 1R in their favour | of those, finished green |
|---|---|---|---|---|
| `orb_spy.v1` on SPY | untouched | 2,267 | 1,089 (48.0%) | **43.5%** |
| `orb_spy.v1` on SPY | build | 938 | 419 (44.7%) | **48.7%** |
| `orb_spy.v1` on SPY | held_back | 240 | 110 (45.8%) | **53.6%** |
| `orb_spy.v1` on SPY | full | 3,445 | 1,618 (47.0%) | **45.6%** |
| `orb_sip.v2` on stocks in play | 2016-2023 | 32,392 | 11,789 (36.4%) | **77.9%** |
| `orb_sip.v2` on stocks in play | 2024-2026 | 10,545 | 3,274 (31.0%) | **83.0%** |

The `orb_sip.v2` rows are computed here from its committed trade dump on the identical definition, not quoted; nothing of ENGINE-7's is re-run. **The statistic does not hold on SPY.** On the stocks the strategy picks, four trades in five that ever traded a full unit of risk in their favour went on to finish green. On SPY it is roughly one in two — a coin toss. A trade that gets 1R ahead on SPY and is then left to run to the bell gives it back about half the time, which is what a stop only 0.16 of an average day's range wide does to a position: the trade is never far enough ahead, in the money that matters, to survive the walk back.

## What it cost to trade

Cost as a fraction of risk is `cost per share / stop distance`. It is the subtraction ENGINE-2 found the whole family turns on, and it is set by the model's stop, not by the price of the instrument.

| | median stop | commission as a share of risk | mean gross R | mean net R | cost drag |
|---|---|---|---|---|---|
| untouched | 35.9 cents | 0.0278R | -0.0784 | -0.2359 | 0.1575R |
| held_back | 132.1 cents | 0.0076R | -0.0790 | -0.2002 | 0.1213R |
| full | 52.7 cents | 0.0190R | -0.0644 | -0.2080 | 0.1436R |

The stop looks nearly four times wider in the verdict year than in the untouched span, and it is not: SPY is about five times the price it was in 2012, so the same move costs more cents. In ATR units — the unit that decides anything — it is unchanged across every window, which is why the result is too.

### Cost sensitivity — disclosed, and not a result

The pre-registered cost model is $0.005/share/side plus 1.0 bp of adverse slippage, unchanged for the twelfth time. **The gate is after those costs and does not move.** One basis point of a $600 instrument is 6 cents, and SPY's real half-spread is closer to half a cent, so the pre-registered model overcharges this instrument — ENGINE-4 said the same and it did not rescue ENGINE-4.

| cost model | window | n | mean R | per $1,000 risked | median R | hit | PF |
|---|---|---|---|---|---|---|---|
| pre-registered (the result) | held_back | 240 | -0.2002 | -200 | -1.0502 | 25.8% | 0.74 |
| pre-registered (the result) | full | 3445 | -0.2080 | -208 | -1.0666 | 21.8% | 0.75 |
| quarter-bp slippage | held_back | 240 | -0.1176 | -118 | -1.0176 | 26.2% | 0.84 |
| quarter-bp slippage | full | 3445 | -0.1212 | -121 | -1.0292 | 22.1% | 0.85 |
| zero cost (true gross) | held_back | 240 | -0.0790 | -79 | -1.0000 | 26.2% | 0.89 |
| zero cost (true gross) | full | 3445 | -0.0644 | -64 | -1.0000 | 22.2% | 0.92 |

## The portfolio

1% of equity risked on the one position, gross exposure capped at 4x, compounded daily from $100,000 — `orb_sip.v2`'s convention unchanged so the two are comparable. **On one instrument this is one position a day, so it is a far less levered book than the twenty-name version and the returns are not comparable to that model's headline.**

| | verdict year | untouched span | build years | whole cache |
|---|---|---|---|---|
| total return | -31.0% | -96.4% | -64.5% | -99.1% |
| CAGR | -31.1% | -29.2% | -22.9% | -27.7% |
| Sharpe | -1.89 | -1.56 | -0.97 | -1.39 |
| max drawdown | 34.5% | 96.6% | 69.4% | 99.2% |
| days the 4x cap bound | 180/251 | 1876/2430 | 627/1004 | 2683/3685 |

## QQQ and IWM — run separately, never pooled into SPY's numbers

Two more instruments from the same cache, under identical rules. They are context. They cannot raise or lower the SPY verdict and they are not averaged with it.

| symbol | window | n | mean gross R | mean net R | per $1,000 risked | median net R | hit | PF | stopped | median stop, ATRs |
|---|---|---|---|---|---|---|---|---|---|---|
| SPY | held_back | 240 | -0.0790 | -0.2002 | -200 | -1.0502 | 25.8% | 0.74 | 72.1% | 0.168 |
| SPY | untouched | 2267 | -0.0784 | -0.2359 | -236 | -1.0785 | 21.1% | 0.72 | 76.4% | 0.164 |
| SPY | full | 3445 | -0.0644 | -0.2080 | -208 | -1.0666 | 21.8% | 0.75 | 76.2% | 0.164 |
| QQQ | held_back | 238 | 0.1021 | 0.0213 | +21 | -1.0264 | 32.8% | 1.03 | 63.9% | 0.205 |
| QQQ | untouched | 2241 | 0.0934 | -0.0407 | -41 | -1.0550 | 27.4% | 0.95 | 69.3% | 0.187 |
| QQQ | full | 3413 | 0.0999 | -0.0149 | -15 | -1.0395 | 28.4% | 0.98 | 68.6% | 0.190 |
| IWM | held_back | 221 | -0.0538 | -0.1149 | -115 | -1.0281 | 29.4% | 0.83 | 64.7% | 0.240 |
| IWM | untouched | 2241 | 0.1139 | 0.0053 | +5 | -1.0484 | 29.3% | 1.01 | 67.5% | 0.201 |
| IWM | full | 3382 | 0.0820 | -0.0108 | -11 | -1.0355 | 29.8% | 0.98 | 66.1% | 0.211 |

| symbol | window | verdict |
|---|---|---|
| SPY | held_back | FAILED |
| SPY | untouched | FAILED |
| QQQ | held_back | PARTIAL |
| QQQ | untouched | FAILED |
| IWM | held_back | FAILED |
| IWM | untouched | PARTIAL |

**Read a PARTIAL here for exactly what it is.** It means the first two gates cleared on that window — the arm made money gross and net — and that at least one of the coin-flip, interval and portfolio gates did not. Every PARTIAL in the table above is a mean within a few tens of dollars of zero on $1,000 risked, with a 95% interval that spans it. None of them is a finding, none of them survives the other window, and the gate said in advance that PARTIAL is not a pass. The one thing worth keeping from this table is the last column: the opening candle is a narrow stop on all three index ETFs, and all three behave the same way because of it.

## Mechanics, census and fills

- one decision a session, taken at 09:35 on the close of the 09:34-09:35 one-minute bar; the order works to the close and is not re-placed
- entry is a resting stop order, filled at the worse of the level and the bar's open, plus slippage
- the stop is a LEVEL, not a distance carried from the fill: a gap through the entry costs the trader more risk, and the R it is divided by is measured from the fill that actually happened
- no target; flat at 15:59 ET or at the early close on a half day
- costs: $0.005/share/side commission, 1.0 bp adverse slippage on market and stop fills

| symbol | sessions | signals | long | short | doji opening candle skipped | zero-width range | breakout never filled |
|---|---|---|---|---|---|---|---|
| SPY | 3,685 | 3,641 | 1,873 | 1,768 | 44 | 0 | 196 |
| QQQ | 3,685 | 3,632 | 1,842 | 1,790 | 53 | 0 | 219 |
| IWM | 3,685 | 3,636 | 1,792 | 1,844 | 49 | 0 | 254 |

| symbol | exits, whole cache |
|---|---|
| SPY | {'stop': 2624, 'time': 821} |
| QQQ | {'stop': 2342, 'time': 1071} |
| IWM | {'stop': 2235, 'time': 1147} |

## How sure we actually are, and what would change the answer

- **The verdict year is thin and it is not fresh.** 240 trades of one instrument gives a 95% half-width of about 211 dollars per $1,000 risked. It can separate a large edge from nothing and can resolve nothing smaller. Those same calendar dates have now been read by ENGINE-8, ENGINE-9, ENGINE-10 and ENGINE-11 on other models, so a positive there is **suggestive, not evidence**.
- **The untouched span is the stronger evidence** — 2,267 trades over nine and a half years that no lane has ever read for this spec, with a 95% half-width of about 81 dollars. It was labelled as the stronger window in the gate, before any number existed.
- **Two windows means two 95% intervals**, so the chance at least one clears zero by luck is about 10% rather than 5%. No correction is applied to the intervals; this sentence is the correction.
- **Trades on one instrument are not independent of each other in the way twenty names a day across a thousand stocks are.** Fifteen years of SPY is one instrument's history, not fifteen independent years, and the intervals here do not model that.
- **What would change the answer, in order of how much it would move it:** (1) the stop width, which is not a free parameter here — it is whatever SPY's opening candle happened to be, and it is the first table in this report; (2) the fill model, which fills a resting stop at the worse of the level and the bar's open and cannot see inside a bar; (3) the cost model, which charges a proportional slippage calibrated for $50-$300 single names and therefore overcharges a $600 ETF — the sensitivity table prices that and it does not change the shape; (4) the instrument, since three index ETFs are three of the most efficiently priced things in the market and a result here does not transfer to single names in either direction.
- **What this report does NOT establish**: anything about the stocks-in-play model, whose selection step is the thing this lane deleted. ENGINE-7's H4 — that the selection is where the money comes from — is untouched by this run, and if anything a null on SPY is consistent with it.

## Files

- `orb_spy.v1.polygon-deep-v1.md` — this report
- `orb_spy.v1.polygon-deep-v1.trades.csv.gz` — every trade and every control trade, one row each, all three symbols
- `orb_spy.v1.polygon-deep-v1.<symbol>.equity.csv` — the 1%-risk portfolio curve per symbol

