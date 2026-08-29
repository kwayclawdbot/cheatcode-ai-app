# orb_simple_4h.v1 — measured on `polygon-deep-v1`

**SPY: FAIL.** Against the bar in [`../models/orb_simple_4h.v1/GATE.md`](../models/orb_simple_4h.v1/GATE.md), committed at `a06611d` before this evaluation existed.

**1,547 SPY trades, 2012-01-25 → 2026-08-25** — 3,685 sessions of one-minute bars, 1,132 trades in-sample and 415 in the held-back window.
**On the average SPY trade the setup earned -4.09¢ a share and paid -6.29¢ to trade; the middle trade finished -24.2¢.**
**SPY's realised cost drag is 0.221R — 22.1% of the money risked on every trade**, against 9–14% on the mixed baskets this programme measured before. It is HIGHER, not lower, and the reason is the stop, not the spread: see the cost section.

Run 2026-08-29T20:11:45+00:00 at `19d3234`. Snapshot `polygon-deep-v1`, commission $0.005/share/side, slippage 1.0bp on market and stop fills.

## Read this before anything else — one ambiguity in the spec

The owner's words were *"stop at the previous 5min candlestick high/low"*. This run implements that as **the TRIGGER candle's own low (long) / high (short)** — the last 5-minute candle that closed before entry, which is also the candle whose close broke the range.

The other available reading is *the candle before that one*, which would put the stop further away and make every trade smaller in R terms. If that is what was meant, it is a one-line change to `OrbSimple._trigger_candle` and a re-run — every number below would move. The reading was fixed in `GATE.md` before the run so it could not be chosen after seeing which one looked better.

## In plain language

**Did it work?** No. It missed G2, G3, G5 of the five gates that were written down before it ran, and the miss on expectancy is outside the range chance can explain.

**The subtraction that decides everything.** A setup only survives if what it earns is bigger than what it costs to trade. Here is that sum, on SPY, per share.

| per share, average SPY trade | this model |
|---|---|
| what the setup earned, before costs | -4.09¢ |
| what it paid to get in and out | -6.29¢ |
| **what was left, on the average trade** | **-10.38¢** |
| what was left, on the MIDDLE trade | -24.2¢ |
| median money risked per trade | 35¢ |
| average share price | $337 |

Across all 1,547 SPY trades the model made $-160.55 per share in total; the best three trades contributed $14.11 of that, leaving $-174.66 for the other 1,544. **Read the middle trade beside the average.** `orb_mtf.v1` averaged +1.53¢ while its middle trade lost 25¢, and that gap was the real result.

**What the 4-hour filter was doing.** The trade is only taken when the 4-hour chart is in a confirmed trend in the same direction as the breakout. Trend here means higher high and higher low with the swing low still standing, read on the last 4-hour bar that had actually closed — the same definition ENGINE-3 used, reused rather than re-argued.

**How sure are we?**

- **SPY.** Held-back window: 415 trades averaging -0.185R, middle trade -1.069R, honest range -0.323R to -0.047R. In-sample: 1,132 trades averaging -0.361R, middle trade -1.088R, range -0.440R to -0.283R.
- **QQQ.** Held-back window: 374 trades averaging -0.031R, middle trade -1.042R, honest range -0.179R to +0.118R. In-sample: 1,167 trades averaging -0.275R, middle trade -1.078R, range -0.355R to -0.195R.
- **IWM.** Held-back window: 378 trades averaging -0.316R, middle trade -1.052R, honest range -0.451R to -0.182R. In-sample: 1,063 trades averaging -0.240R, middle trade -1.067R, range -0.322R to -0.158R.

**Was it better than guessing?** This is the question the whole gate rests on, and it is asked before costs, because a model that cannot beat a coin flip on free trades is settled without arguing about the spread.

- **SPY.** Before costs the model made -0.092R a trade; a coin flip on the same days, at the same minutes, with the same stop distance and the same 2R target made -0.010R. Paired trade for trade the gap is **-0.082R** (95%: -0.164 to +0.001, n=1,546); in the held-back window -0.048R (95%: -0.206 to +0.109, n=415). Over the whole sample the interval contains zero, so the filter bought nothing measurable.
- **QQQ.** Before costs the model made -0.009R a trade; a coin flip on the same days, at the same minutes, with the same stop distance and the same 2R target made -0.005R. Paired trade for trade the gap is **-0.003R** (95%: -0.088 to +0.081, n=1,540); in the held-back window +0.072R (95%: -0.099 to +0.244, n=374). Over the whole sample the interval contains zero, so the filter bought nothing measurable.
- **IWM.** Before costs the model made -0.078R a trade; a coin flip on the same days, at the same minutes, with the same stop distance and the same 2R target made -0.027R. Paired trade for trade the gap is **-0.052R** (95%: -0.139 to +0.034, n=1,440); in the held-back window -0.203R (95%: -0.370 to -0.036, n=377). Over the whole sample the interval contains zero, so the filter bought nothing measurable. In the held-back window it excludes zero on the WRONG side, which is a measured result against the filter.

**One R is one unit of the money you agreed to lose if the trade goes wrong** — here, the distance from the entry to the trigger candle's extreme. +0.10R means the average trade made a tenth of what it risked. The bar was +0.10R in-sample and +0.05R out-of-sample, after costs.

**These are models five and six.** `orb_reclaim.v1`, `sweep_displacement_fvg.v1`, `orb_htf_structural.v1` and `orb_mtf.v1` were all measured and all failed. The two `orb_simple` variants are run as a pair, which is two more chances for one of them to look good by luck. The held-back window is the verdict and was read once. The in-sample decade (2012–2022) is data this programme had never seen before today; the held-back window overlaps the tape the earlier four models ran on, which is disclosed rather than engineered away — this model has no fitted parameter to have overfitted with.

**What would change the answer?**

- **The cost fraction, which came out the opposite way to the brief's expectation.** SPY's realised drag is 0.221R per trade (95%: 0.194 to 0.248), i.e. 22.1% of the money risked — HIGHER than the 9–14% the earlier mixed baskets paid, not lower. Cost as a fraction of risk is set by the STOP DISTANCE, not by the price of the instrument, and this model's stop is the tightest in the programme. Trading the cheapest instrument in the world with a 29-cent stop is more expensive, proportionally, than trading a $50 name with a wide one.
- **The stop distance.** The median SPY trade risks 35¢ on a $337 share — 0.105% of price. A trigger-candle stop is a tight stop by construction, which is what makes the cost fraction small and also what makes the stop easy to hit. Widening it is a different model and needs its own gate.
- **The other reading of the stop.** See the top of this report. Using the candle BEFORE the trigger candle would widen every stop, shrink the cost fraction further, and lower the hit rate. It is a one-line change and it is the single most informative re-run available.
- **A different target.** 2R is the owner's number and is fixed here. The MAE tables below say how far trades travelled the wrong way before resolving, which is the evidence for whether a nearer target would have paid.
- **More symbols.** Three index ETFs are three of the most efficiently priced instruments in the market. A null result here does not transfer to single names in either direction.
## SPY's cost drag as a fraction of risk — the number the brief asked for

The brief's hypothesis was that SPY should be cheap to trade relative to the move, because a penny of spread on a ~$770 instrument is roughly fifteen times cheaper than the same penny on a $50 stock, and that every earlier model in this programme was measuring a mixed basket at 9–14% of risk. **The measurement says the opposite, and the reason is worth more than the model.**

Cost as a fraction of risk is `cost per share / stop distance`. The numerator scales with the PRICE of the instrument. The denominator is set by the MODEL. This model's stop is the trigger candle's own extreme, which on SPY is a few tens of cents — so the fraction is large no matter how cheap the instrument is. Being the most liquid ETF in the world does not help a stop that tight.

Paired trade by trade, so it is the same trades gross and net.

| symbol | trades | median risk, % of price | median risk | avg price | **cost drag, R** | 95% interval |
|---|---|---|---|---|---|---|
| SPY | 1,546 | 0.120% | 35¢ | $337 | **0.221R** | 0.194 to 0.248 |
| QQQ | 1,540 | 0.152% | 28¢ | $246 | **0.205R** | 0.179 to 0.231 |
| IWM | 1,440 | 0.188% | 28¢ | $162 | **0.180R** | 0.155 to 0.205 |

For comparison, on `polygon-v1`'s 32-name basket with a structural stop several times wider: `orb_reclaim.v1` ≈0.09R, `orb_htf_structural.v1` 0.144R, `orb_mtf.v1` 0.122R. Those models risked 0.19–0.29% of price. This one risks about a third of that, and pays about twice the fraction.

### The pre-registered cost model is itself proportional, and on SPY that overstates the spread

The bar committed at `a06611d` charges $0.005 per share per side plus **1.0 basis point of price**, adverse, on the market entry and on any exit that is not the resting-limit target. One basis point of SPY is 3.3¢ in 2012 and 7.7¢ in 2026 — but SPY's actual quoted spread is about a penny, so half of it is half a cent. A proportional slippage model is calibrated for $50–$300 single names; on a $770 index ETF it charges several times the real cost. That is the pre-registered bar and the verdict above stands on it. Below is what the same trades cost under an absolute half-cent half-spread, reconstructed from each trade rather than re-run, and clearly labelled as a **sensitivity, not a result**.

| symbol | cost per share, 1bp (as gated) | cost per share, ½¢ spread | drag, R (as gated) | drag, R (½¢) | mean net R (as gated) | mean net R (½¢, first order) |
|---|---|---|---|---|---|---|
| SPY | 6.87¢ | 1.87¢ | 0.238R | 0.077R | -0.314 | -0.168 |
| QQQ | 5.18¢ | 1.86¢ | 0.215R | 0.111R | -0.216 | -0.119 |
| IWM | 3.81¢ | 1.87¢ | 0.177R | 0.093R | -0.260 | -0.171 |

**Even trading for a half-cent the model does not reach its bar**, and the sensitivity is first-order only: it prices the same fills differently, it does not re-simulate what a tighter spread would have done to which bar hit the stop. The honest reading is that cost is a large part of this model's loss and is not the whole of it — the gross comparison against the coin flip, in the next section, is what settles that.

## Gross versus the matched control, before net

ENGINE-1's decisive finding was that both its models were below a coin flip *before* costs, which settles the net number without further argument. So this table is read first. The control takes the same symbol, the same days, the same decision minutes and the same stop distances, flips only the direction, and targets the same 2R from its own fill.

| symbol | run | n | gross mean R | gross median R | net mean R | net median R | hit | PF (net) |
|---|---|---|---|---|---|---|---|---|
| SPY | `orb_simple` | 1,547 | -0.092 | -1.000 | -0.314 | -1.083 | 28.1% | 0.62 |
| SPY | `null_coinflip.v1.matched` | 1,547 | -0.010 | -1.000 | -0.251 | -1.079 | 30.1% | 0.69 |
| QQQ | `orb_simple` | 1,541 | -0.009 | -1.000 | -0.216 | -1.069 | 31.2% | 0.73 |
| QQQ | `null_coinflip.v1.matched` | 1,541 | -0.005 | -1.000 | -0.231 | -1.068 | 30.8% | 0.71 |
| IWM | `orb_simple` | 1,441 | -0.078 | -1.000 | -0.260 | -1.063 | 28.9% | 0.67 |
| IWM | `null_coinflip.v1.matched` | 1,441 | -0.027 | -1.000 | -0.200 | -1.062 | 30.8% | 0.74 |

Paired trade by trade on the same symbol, day and minute, **gross of costs** — did knowing which way to point pay for itself?

| symbol | window | pairs | model − control, gross mean R | 95% interval |
|---|---|---|---|---|
| SPY | all | 1,546 | -0.082 | -0.164 to +0.001 |
| SPY | in-sample | 1,131 | -0.094 | -0.191 to +0.003 |
| SPY | out-of-sample | 415 | -0.048 | -0.206 to +0.109 |
| QQQ | all | 1,540 | -0.003 | -0.088 to +0.081 |
| QQQ | in-sample | 1,166 | -0.028 | -0.125 to +0.069 |
| QQQ | out-of-sample | 374 | +0.072 | -0.099 to +0.244 |
| IWM | all | 1,440 | -0.052 | -0.139 to +0.034 |
| IWM | in-sample | 1,063 | +0.001 | -0.100 to +0.102 |
| IWM | out-of-sample | 377 | -0.203 | -0.370 to -0.036 |

## The gate — evaluated on SPY — **FAIL**

| gate | | bar | observed | |
|---|---|---|---|---|
| G1 | sample size (this symbol alone) | IS>=500, OOS>=150 | IS=1132, OOS=415 | **PASS** |
| G2 | expectancy after costs (mean net R) | IS>=+0.10, OOS>=+0.05 | IS=-0.361, OOS=-0.185 | **FAIL** |
| G3 | profit factor after costs | IS>=1.20, OOS>=1.10 | IS=0.57, OOS=0.76 | **FAIL** |
| G4 | winners first going >=0.75R against | <=40% | 21.2% | **PASS** |
| G5 | mean net R > 0 in both regimes (in-sample) | both > 0 | bear (SPY < 50dma)=-0.293 (n=311), bull (SPY > 50dma)=-0.377 (n=803) | **FAIL** |

## SPY, in full

| slice | n | hit | mean R | median R | mean % | payoff | PF | total R | maxDD R | max losing run |
|---|---|---|---|---|---|---|---|---|---|---|
| all | 1547 | 28.1% | -0.314 | -1.083 | -0.035% | 1.59 | 0.62 | -485.9 | 486.8 | 20 |
| in-sample 2012-01-01..2022-12-31 | 1132 | 27.0% | -0.361 | -1.088 | -0.042% | 1.55 | 0.57 | -409.1 | 408.0 | 20 |
| out-of-sample 2023-01-01..2026-08-28 | 415 | 31.1% | -0.185 | -1.069 | -0.015% | 1.69 | 0.76 | -76.8 | 91.7 | 18 |

**Maximum adverse excursion — All SPY trades.** How far a trade travelled the wrong way before it resolved. Distribution, not mean.

- MAE deciles (R): 0.34 | 0.65 | 1.00 | 1.01 | 1.05 | 1.10 | 1.16 | 1.25 | 1.46
- all trades reaching that far against: >=0.25R 93.4% · >=0.5R 85.1% · >=0.75R 77.8% · >=1.0R 71.3%
- **winners** that first went that far against: >=0.25R 76.6% · >=0.5R 47.1% · >=0.75R 22.1% · >=1.0R 0.0%

**Maximum adverse excursion — SPY, held-back window.** How far a trade travelled the wrong way before it resolved. Distribution, not mean.

- MAE deciles (R): 0.32 | 0.62 | 0.95 | 1.02 | 1.06 | 1.11 | 1.19 | 1.31 | 1.53
- all trades reaching that far against: >=0.25R 93.3% · >=0.5R 83.6% · >=0.75R 76.1% · >=1.0R 68.2%
- **winners** that first went that far against: >=0.25R 78.3% · >=0.5R 47.3% · >=0.75R 24.0% · >=1.0R 0.0%

By regime (in-sample), then side and year:

| slice | n | hit | mean R | median R | mean % | payoff | PF | total R | maxDD R | max losing run |
|---|---|---|---|---|---|---|---|---|---|---|
| bear (SPY < 50dma) | 311 | 27.3% | -0.293 | -1.055 | -0.078% | 1.68 | 0.63 | -91.3 | 93.2 | 16 |
| bull (SPY > 50dma) | 803 | 27.3% | -0.377 | -1.109 | -0.028% | 1.50 | 0.56 | -302.5 | 307.8 | 22 |
| long | 1011 | 27.7% | -0.350 | -1.102 | -0.032% | 1.53 | 0.59 | -354.0 | 354.9 | 18 |
| short | 536 | 28.9% | -0.246 | -1.063 | -0.040% | 1.70 | 0.69 | -131.9 | 133.6 | 14 |
| 2012 | 92 | 22.8% | -0.502 | -1.103 | -0.066% | 1.50 | 0.44 | -46.2 | 45.1 | 10 |
| 2013 | 118 | 27.1% | -0.383 | -1.122 | -0.044% | 1.49 | 0.55 | -45.2 | 48.4 | 15 |
| 2014 | 99 | 26.3% | -0.376 | -1.113 | -0.021% | 1.57 | 0.56 | -37.2 | 40.8 | 13 |
| 2015 | 110 | 29.1% | -0.287 | -1.088 | -0.021% | 1.59 | 0.65 | -31.6 | 37.1 | 20 |
| 2016 | 98 | 33.7% | -0.150 | -1.073 | -0.018% | 1.58 | 0.80 | -14.7 | 22.3 | 10 |
| 2017 | 107 | 21.5% | -0.636 | -1.175 | -0.043% | 1.32 | 0.36 | -68.0 | 74.6 | 16 |
| 2018 | 111 | 21.6% | -0.500 | -1.075 | -0.077% | 1.62 | 0.45 | -55.5 | 58.1 | 13 |
| 2019 | 120 | 30.0% | -0.352 | -1.115 | -0.012% | 1.34 | 0.57 | -42.3 | 48.7 | 13 |
| 2020 | 97 | 27.8% | -0.252 | -1.062 | -0.063% | 1.77 | 0.68 | -24.4 | 30.7 | 9 |
| 2021 | 95 | 34.7% | -0.117 | -1.070 | -0.000% | 1.59 | 0.85 | -11.1 | 36.9 | 15 |
| 2022 | 85 | 22.4% | -0.387 | -1.045 | -0.115% | 1.86 | 0.53 | -32.9 | 31.8 | 13 |
| 2023 | 130 | 33.8% | -0.095 | -1.058 | -0.013% | 1.71 | 0.87 | -12.3 | 25.2 | 7 |
| 2024 | 118 | 28.0% | -0.282 | -1.091 | -0.010% | 1.71 | 0.66 | -33.2 | 39.4 | 18 |
| 2025 | 96 | 29.2% | -0.245 | -1.060 | -0.035% | 1.68 | 0.69 | -23.5 | 32.2 | 12 |
| 2026 | 71 | 33.8% | -0.109 | -1.059 | 0.002% | 1.66 | 0.85 | -7.8 | 16.8 | 9 |

- exits: {'stop': 1103, 'target': 389, 'time': 55}
- trades resolved by the pessimistic same-bar assumption (stop and target both inside one bar): 1 (0.1%)
- mean 1-minute bars held: 43.8
- trades per SPY session, where at least one was taken: 1: 1,547

## QQQ and IWM — reported separately, never pooled into SPY

These are not evidence about SPY. They are the same model on two other instruments, judged against the same bar, so a reader can see whether the SPY result is peculiar to SPY.

### QQQ — **FAIL**

| slice | n | hit | mean R | median R | mean % | payoff | PF | total R | maxDD R | max losing run |
|---|---|---|---|---|---|---|---|---|---|---|
| all | 1541 | 31.2% | -0.216 | -1.069 | -0.025% | 1.60 | 0.73 | -332.3 | 344.1 | 20 |
| in-sample 2012-01-01..2022-12-31 | 1167 | 29.7% | -0.275 | -1.078 | -0.034% | 1.57 | 0.66 | -320.9 | 321.6 | 20 |
| out-of-sample 2023-01-01..2026-08-28 | 374 | 35.8% | -0.031 | -1.042 | 0.003% | 1.71 | 0.96 | -11.4 | 32.1 | 12 |

| gate | bar | observed | |
|---|---|---|---|
| G1 sample size (this symbol alone) | IS>=500, OOS>=150 | IS=1167, OOS=374 | PASS |
| G2 expectancy after costs (mean net R) | IS>=+0.10, OOS>=+0.05 | IS=-0.275, OOS=-0.031 | FAIL |
| G3 profit factor after costs | IS>=1.20, OOS>=1.10 | IS=0.66, OOS=0.96 | FAIL |
| G4 winners first going >=0.75R against | <=40% | 22.5% | PASS |
| G5 mean net R > 0 in both regimes (in-sample) | both > 0 | bear (SPY < 50dma)=-0.099 (n=306), bull (SPY > 50dma)=-0.330 (n=834) | FAIL |

### IWM — **FAIL**

| slice | n | hit | mean R | median R | mean % | payoff | PF | total R | maxDD R | max losing run |
|---|---|---|---|---|---|---|---|---|---|---|
| all | 1441 | 28.9% | -0.260 | -1.063 | -0.049% | 1.65 | 0.67 | -374.7 | 373.6 | 23 |
| in-sample 2012-01-01..2022-12-31 | 1063 | 30.0% | -0.240 | -1.067 | -0.046% | 1.62 | 0.69 | -255.1 | 261.6 | 15 |
| out-of-sample 2023-01-01..2026-08-28 | 378 | 25.9% | -0.316 | -1.052 | -0.059% | 1.74 | 0.61 | -119.6 | 119.8 | 23 |

| gate | bar | observed | |
|---|---|---|---|
| G1 sample size (this symbol alone) | IS>=500, OOS>=150 | IS=1063, OOS=378 | PASS |
| G2 expectancy after costs (mean net R) | IS>=+0.10, OOS>=+0.05 | IS=-0.240, OOS=-0.316 | FAIL |
| G3 profit factor after costs | IS>=1.20, OOS>=1.10 | IS=0.69, OOS=0.61 | FAIL |
| G4 winners first going >=0.75R against | <=40% | 20.1% | PASS |
| G5 mean net R > 0 in both regimes (in-sample) | both > 0 | bear (SPY < 50dma)=-0.199 (n=300), bull (SPY > 50dma)=-0.252 (n=748) | FAIL |

## Where the days went

Every session the model looked at and the rule that ended it. This is the check on the brief's central worry — that a spec, not the market, is what produces a small trade count.

`triggers` counts BARS, not days: once price is beyond the range on the trend side, every later 5-minute close that session counts again. Almost all of them are the same day still qualifying after its trade was taken, which is what `bars_direction_already_traded` is. `signals` is the number of trades.

| outcome | SPY | QQQ | IWM |
|---|---|---|---|
| `days_seen` | 3,680 | 3,680 | 3,680 |
| `days_no_htf_trend` | 1,470 | 1,411 | 1,442 |
| `days_trend_ok_no_break` | 663 | 728 | 798 |
| `days_trigger_but_no_signal` | 0 | 0 | 0 |
| `days_with_1_trade_direction(s)` | 1,547 | 1,541 | 1,439 |
| `days_with_2_trade_direction(s)` | 0 | 0 | 1 |
| `triggers` | 39,346 | 40,448 | 37,368 |
| `signals` | 1,547 | 1,541 | 1,441 |
| `signals_long` | 1,011 | 1,023 | 811 |
| `signals_short` | 536 | 518 | 630 |
| `skip_zero_width_stop` | 2 | 6 | 2 |
| `bars_evaluated` | 250,766 | 250,542 | 251,888 |
| `bars_no_opening_range` | 0 | 0 | 0 |
| `bars_no_htf_trend` | 125,713 | 122,255 | 125,587 |
| `bars_no_break_on_trend_side` | 85,707 | 87,839 | 88,933 |
| `bars_direction_already_traded` | 37,797 | 38,901 | 35,925 |

Every session is booked under exactly one outcome, and the four `days_*` rows below `days_seen` sum to it.

- **SPY**: 1,547 of 3,680 sessions produced at least one trade (42.0%); 1,470 were lost to the higher timeframe having no confirmed trend at any point in the session (39.9%); 663 had a trend but no 5-minute close beyond the range on that side.
  Orders that never became a trade: Counter()
- **QQQ**: 1,541 of 3,680 sessions produced at least one trade (41.9%); 1,411 were lost to the higher timeframe having no confirmed trend at any point in the session (38.3%); 728 had a trend but no 5-minute close beyond the range on that side.
  Orders that never became a trade: Counter()
- **IWM**: 1,440 of 3,680 sessions produced at least one trade (39.1%); 1,442 were lost to the higher timeframe having no confirmed trend at any point in the session (39.2%); 798 had a trend but no 5-minute close beyond the range on that side.
  Orders that never became a trade: Counter()

- model parameters: `{"or_minutes": 15, "entry_tf_minutes": 5, "window": [589, 944], "flatten_min": 955, "trend_timeframe_minutes": 240, "trend_pivot_n": 2, "trend_lookback": 120, "target_r": 2.0, "stop": "trigger candle low (long) / high (short)", "skips": "none"}`

## Disclosures specific to this run

- **Fifth and sixth models on this programme's data, and the first on this
  snapshot.** `orb_reclaim.v1`, `sweep_displacement_fvg.v1`,
  `orb_htf_structural.v1` and `orb_mtf.v1` were measured on `polygon-v1` and all
  four failed. `orb_simple_1h.v1` and `orb_simple_4h.v1` are run as a pair on
  `polygon-deep-v1` and judged separately; neither borrows the other's result.
- **The in-sample decade is new data; the held-back window is not entirely.**
  2012-01-01 → 2022-12-31 had never been touched by this programme.
  2023-01-01 → 2026-08-28 overlaps the tape the earlier four models ran on. This
  model has no fitted parameter, so there is nothing that could have been tuned
  on it, but the overlap is real and is stated rather than hidden.
- **Prices are split- and dividend-adjusted.** Over fourteen years that is the
  only defensible choice, and it means the dollar prices in the older years are
  not the prices that printed on the tape that day. Every per-share cent figure
  in this report is measured against the ADJUSTED price, so the cost-drag
  fraction is the number to trust and the cents are the illustration.
- **Fills are modelled, not observed.** OHLC cannot say what happened inside a
  bar. Every ambiguity is resolved against the trade, and a bar containing both
  the stop and the target is booked as the stop.
- **The 2R target is measured from the fill**, not from the close the decision
  was made on, so it is genuinely 2R on every trade. See `fills.resolved_target`.
- **One position at a time.** A day's second direction can only be taken after
  the first has closed. The census shows how often the second direction was
  wanted and unavailable.
- **The higher-timeframe reading is stale by construction on the 4-hour
  variant** in the way described in its gate, and that staleness is the filter,
  not a bug in it.
- **Three index ETFs is not a universe.** SPY, QQQ and IWM are among the most
  efficiently priced instruments available. A null result here does not transfer
  to single names, and neither would a positive one.
- **No borrow, locate, halt, dividend or corporate-action modelling.** QQQ's
  2013-08-22 session is 216 minutes long because the Nasdaq halted; it is kept
  as it is.
