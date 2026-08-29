# orb_simple_1h.v1 — measured on `polygon-deep-v1`

**SPY: FAIL.** Against the bar in [`../models/orb_simple_1h.v1/GATE.md`](../models/orb_simple_1h.v1/GATE.md), committed at `a06611d` before this evaluation existed.

**2,081 SPY trades, 2012-01-11 → 2026-08-28** — 3,685 sessions of one-minute bars, 1,583 trades in-sample and 498 in the held-back window.
**On the average SPY trade the setup earned -0.37¢ a share and paid -5.66¢ to trade; the middle trade finished -19.3¢.**
**SPY's realised cost drag is 0.265R — 26.5% of the money risked on every trade**, against 9–14% on the mixed baskets this programme measured before. It is HIGHER, not lower, and the reason is the stop, not the spread: see the cost section.

Run 2026-08-29T20:11:24+00:00 at `19d3234`. Snapshot `polygon-deep-v1`, commission $0.005/share/side, slippage 1.0bp on market and stop fills.

## Read this before anything else — one ambiguity in the spec

The owner's words were *"stop at the previous 5min candlestick high/low"*. This run implements that as **the TRIGGER candle's own low (long) / high (short)** — the last 5-minute candle that closed before entry, which is also the candle whose close broke the range.

The other available reading is *the candle before that one*, which would put the stop further away and make every trade smaller in R terms. If that is what was meant, it is a one-line change to `OrbSimple._trigger_candle` and a re-run — every number below would move. The reading was fixed in `GATE.md` before the run so it could not be chosen after seeing which one looked better.

## In plain language

**Did it work?** No. It missed G2, G3, G5 of the five gates that were written down before it ran, and the miss on expectancy is outside the range chance can explain.

**The subtraction that decides everything.** A setup only survives if what it earns is bigger than what it costs to trade. Here is that sum, on SPY, per share.

| per share, average SPY trade | this model |
|---|---|
| what the setup earned, before costs | -0.37¢ |
| what it paid to get in and out | -5.66¢ |
| **what was left, on the average trade** | **-6.03¢** |
| what was left, on the MIDDLE trade | -19.3¢ |
| median money risked per trade | 29¢ |
| average share price | $334 |

Across all 2,081 SPY trades the model made $-125.55 per share in total; the best three trades contributed $13.85 of that, leaving $-139.41 for the other 2,078. **Read the middle trade beside the average.** `orb_mtf.v1` averaged +1.53¢ while its middle trade lost 25¢, and that gap was the real result.

**What the 1-hour filter was doing.** The trade is only taken when the 1-hour chart is in a confirmed trend in the same direction as the breakout. Trend here means higher high and higher low with the swing low still standing, read on the last 1-hour bar that had actually closed — the same definition ENGINE-3 used, reused rather than re-argued.

**How sure are we?**

- **SPY.** Held-back window: 498 trades averaging -0.154R, middle trade -1.077R, honest range -0.284R to -0.023R. In-sample: 1,583 trades averaging -0.359R, middle trade -1.101R, range -0.427R to -0.291R.
- **QQQ.** Held-back window: 473 trades averaging -0.152R, middle trade -1.054R, honest range -0.280R to -0.023R. In-sample: 1,506 trades averaging -0.357R, middle trade -1.088R, range -0.429R to -0.285R.
- **IWM.** Held-back window: 497 trades averaging -0.306R, middle trade -1.060R, honest range -0.425R to -0.186R. In-sample: 1,574 trades averaging -0.186R, middle trade -1.072R, range -0.257R to -0.115R.

**Was it better than guessing?** This is the question the whole gate rests on, and it is asked before costs, because a model that cannot beat a coin flip on free trades is settled without arguing about the spread.

- **SPY.** Before costs the model made -0.039R a trade; a coin flip on the same days, at the same minutes, with the same stop distance and the same 2R target made -0.005R. Paired trade for trade the gap is **-0.035R** (95%: -0.107 to +0.038, n=2,070); in the held-back window +0.050R (95%: -0.102 to +0.202, n=495). Over the whole sample the interval contains zero, so the filter bought nothing measurable.
- **QQQ.** Before costs the model made -0.040R a trade; a coin flip on the same days, at the same minutes, with the same stop distance and the same 2R target made -0.050R. Paired trade for trade the gap is **+0.010R** (95%: -0.063 to +0.084, n=1,972); in the held-back window +0.069R (95%: -0.083 to +0.222, n=472). Over the whole sample the interval contains zero, so the filter bought nothing measurable.
- **IWM.** Before costs the model made +0.026R a trade; a coin flip on the same days, at the same minutes, with the same stop distance and the same 2R target made -0.034R. Paired trade for trade the gap is **+0.058R** (95%: -0.014 to +0.130, n=2,066); in the held-back window -0.110R (95%: -0.256 to +0.036, n=497). Over the whole sample the interval contains zero, so the filter bought nothing measurable.

**One R is one unit of the money you agreed to lose if the trade goes wrong** — here, the distance from the entry to the trigger candle's extreme. +0.10R means the average trade made a tenth of what it risked. The bar was +0.10R in-sample and +0.05R out-of-sample, after costs.

**These are models five and six.** `orb_reclaim.v1`, `sweep_displacement_fvg.v1`, `orb_htf_structural.v1` and `orb_mtf.v1` were all measured and all failed. The two `orb_simple` variants are run as a pair, which is two more chances for one of them to look good by luck. The held-back window is the verdict and was read once. The in-sample decade (2012–2022) is data this programme had never seen before today; the held-back window overlaps the tape the earlier four models ran on, which is disclosed rather than engineered away — this model has no fitted parameter to have overfitted with.

**What would change the answer?**

- **The cost fraction, which came out the opposite way to the brief's expectation.** SPY's realised drag is 0.265R per trade (95%: 0.239 to 0.290), i.e. 26.5% of the money risked — HIGHER than the 9–14% the earlier mixed baskets paid, not lower. Cost as a fraction of risk is set by the STOP DISTANCE, not by the price of the instrument, and this model's stop is the tightest in the programme. Trading the cheapest instrument in the world with a 29-cent stop is more expensive, proportionally, than trading a $50 name with a wide one.
- **The stop distance.** The median SPY trade risks 29¢ on a $334 share — 0.088% of price. A trigger-candle stop is a tight stop by construction, which is what makes the cost fraction small and also what makes the stop easy to hit. Widening it is a different model and needs its own gate.
- **The other reading of the stop.** See the top of this report. Using the candle BEFORE the trigger candle would widen every stop, shrink the cost fraction further, and lower the hit rate. It is a one-line change and it is the single most informative re-run available.
- **A different target.** 2R is the owner's number and is fixed here. The MAE tables below say how far trades travelled the wrong way before resolving, which is the evidence for whether a nearer target would have paid.
- **More symbols.** Three index ETFs are three of the most efficiently priced instruments in the market. A null result here does not transfer to single names in either direction.
## SPY's cost drag as a fraction of risk — the number the brief asked for

The brief's hypothesis was that SPY should be cheap to trade relative to the move, because a penny of spread on a ~$770 instrument is roughly fifteen times cheaper than the same penny on a $50 stock, and that every earlier model in this programme was measuring a mixed basket at 9–14% of risk. **The measurement says the opposite, and the reason is worth more than the model.**

Cost as a fraction of risk is `cost per share / stop distance`. The numerator scales with the PRICE of the instrument. The denominator is set by the MODEL. This model's stop is the trigger candle's own extreme, which on SPY is a few tens of cents — so the fraction is large no matter how cheap the instrument is. Being the most liquid ETF in the world does not help a stop that tight.

Paired trade by trade, so it is the same trades gross and net.

| symbol | trades | median risk, % of price | median risk | avg price | **cost drag, R** | 95% interval |
|---|---|---|---|---|---|---|
| SPY | 2,074 | 0.104% | 29¢ | $334 | **0.265R** | 0.239 to 0.290 |
| QQQ | 1,973 | 0.134% | 24¢ | $248 | **0.260R** | 0.233 to 0.286 |
| IWM | 2,066 | 0.160% | 23¢ | $159 | **0.234R** | 0.210 to 0.259 |

For comparison, on `polygon-v1`'s 32-name basket with a structural stop several times wider: `orb_reclaim.v1` ≈0.09R, `orb_htf_structural.v1` 0.144R, `orb_mtf.v1` 0.122R. Those models risked 0.19–0.29% of price. This one risks about a third of that, and pays about twice the fraction.

### The pre-registered cost model is itself proportional, and on SPY that overstates the spread

The bar committed at `a06611d` charges $0.005 per share per side plus **1.0 basis point of price**, adverse, on the market entry and on any exit that is not the resting-limit target. One basis point of SPY is 3.3¢ in 2012 and 7.7¢ in 2026 — but SPY's actual quoted spread is about a penny, so half of it is half a cent. A proportional slippage model is calibrated for $50–$300 single names; on a $770 index ETF it charges several times the real cost. That is the pre-registered bar and the verdict above stands on it. Below is what the same trades cost under an absolute half-cent half-spread, reconstructed from each trade rather than re-run, and clearly labelled as a **sensitivity, not a result**.

| symbol | cost per share, 1bp (as gated) | cost per share, ½¢ spread | drag, R (as gated) | drag, R (½¢) | mean net R (as gated) | mean net R (½¢, first order) |
|---|---|---|---|---|---|---|
| SPY | 6.75¢ | 1.87¢ | 0.303R | 0.098R | -0.310 | -0.135 |
| QQQ | 5.27¢ | 1.87¢ | 0.288R | 0.153R | -0.308 | -0.187 |
| IWM | 3.73¢ | 1.86¢ | 0.238R | 0.128R | -0.215 | -0.099 |

**Even trading for a half-cent the model does not reach its bar**, and the sensitivity is first-order only: it prices the same fills differently, it does not re-simulate what a tighter spread would have done to which bar hit the stop. The honest reading is that cost is a large part of this model's loss and is not the whole of it — the gross comparison against the coin flip, in the next section, is what settles that.

## Gross versus the matched control, before net

ENGINE-1's decisive finding was that both its models were below a coin flip *before* costs, which settles the net number without further argument. So this table is read first. The control takes the same symbol, the same days, the same decision minutes and the same stop distances, flips only the direction, and targets the same 2R from its own fill.

| symbol | run | n | gross mean R | gross median R | net mean R | net median R | hit | PF (net) |
|---|---|---|---|---|---|---|---|---|
| SPY | `orb_simple` | 2,081 | -0.039 | -1.000 | -0.310 | -1.093 | 29.1% | 0.63 |
| SPY | `null_coinflip.v1.matched` | 2,078 | -0.005 | -1.000 | -0.291 | -1.090 | 29.9% | 0.65 |
| QQQ | `orb_simple` | 1,979 | -0.040 | -1.000 | -0.308 | -1.077 | 29.8% | 0.64 |
| QQQ | `null_coinflip.v1.matched` | 1,979 | -0.050 | -1.000 | -0.328 | -1.076 | 29.4% | 0.62 |
| IWM | `orb_simple` | 2,071 | +0.026 | -1.000 | -0.215 | -1.068 | 31.6% | 0.73 |
| IWM | `null_coinflip.v1.matched` | 2,071 | -0.034 | -1.000 | -0.261 | -1.070 | 30.5% | 0.68 |

Paired trade by trade on the same symbol, day and minute, **gross of costs** — did knowing which way to point pay for itself?

| symbol | window | pairs | model − control, gross mean R | 95% interval |
|---|---|---|---|---|
| SPY | all | 2,070 | -0.035 | -0.107 to +0.038 |
| SPY | in-sample | 1,575 | -0.061 | -0.144 to +0.022 |
| SPY | out-of-sample | 495 | +0.050 | -0.102 to +0.202 |
| QQQ | all | 1,972 | +0.010 | -0.063 to +0.084 |
| QQQ | in-sample | 1,500 | -0.008 | -0.092 to +0.076 |
| QQQ | out-of-sample | 472 | +0.069 | -0.083 to +0.222 |
| IWM | all | 2,066 | +0.058 | -0.014 to +0.130 |
| IWM | in-sample | 1,569 | +0.112 | +0.029 to +0.194 |
| IWM | out-of-sample | 497 | -0.110 | -0.256 to +0.036 |

## The gate — evaluated on SPY — **FAIL**

| gate | | bar | observed | |
|---|---|---|---|---|
| G1 | sample size (this symbol alone) | IS>=500, OOS>=150 | IS=1583, OOS=498 | **PASS** |
| G2 | expectancy after costs (mean net R) | IS>=+0.10, OOS>=+0.05 | IS=-0.359, OOS=-0.154 | **FAIL** |
| G3 | profit factor after costs | IS>=1.20, OOS>=1.10 | IS=0.59, OOS=0.81 | **FAIL** |
| G4 | winners first going >=0.75R against | <=40% | 21.1% | **PASS** |
| G5 | mean net R > 0 in both regimes (in-sample) | both > 0 | bear (SPY < 50dma)=-0.214 (n=459), bull (SPY > 50dma)=-0.414 (n=1098) | **FAIL** |

## SPY, in full

| slice | n | hit | mean R | median R | mean % | payoff | PF | total R | maxDD R | max losing run |
|---|---|---|---|---|---|---|---|---|---|---|
| all | 2081 | 29.1% | -0.310 | -1.093 | -0.023% | 1.54 | 0.63 | -645.1 | 643.9 | 16 |
| in-sample 2012-01-01..2022-12-31 | 1583 | 27.9% | -0.359 | -1.101 | -0.029% | 1.52 | 0.59 | -568.6 | 571.9 | 16 |
| out-of-sample 2023-01-01..2026-08-28 | 498 | 33.1% | -0.154 | -1.077 | -0.004% | 1.63 | 0.81 | -76.5 | 80.5 | 11 |

**Maximum adverse excursion — All SPY trades.** How far a trade travelled the wrong way before it resolved. Distribution, not mean.

- MAE deciles (R): 0.35 | 0.64 | 0.99 | 1.00 | 1.05 | 1.10 | 1.16 | 1.29 | 1.54
- all trades reaching that far against: >=0.25R 94.0% · >=0.5R 84.5% · >=0.75R 75.7% · >=1.0R 69.9%
- **winners** that first went that far against: >=0.25R 79.5% · >=0.5R 47.9% · >=0.75R 19.1% · >=1.0R 0.0%

**Maximum adverse excursion — SPY, held-back window.** How far a trade travelled the wrong way before it resolved. Distribution, not mean.

- MAE deciles (R): 0.30 | 0.54 | 0.81 | 1.02 | 1.06 | 1.10 | 1.19 | 1.32 | 1.63
- all trades reaching that far against: >=0.25R 93.2% · >=0.5R 81.3% · >=0.75R 71.3% · >=1.0R 66.1%
- **winners** that first went that far against: >=0.25R 79.4% · >=0.5R 44.2% · >=0.75R 13.9% · >=1.0R 0.0%

By regime (in-sample), then side and year:

| slice | n | hit | mean R | median R | mean % | payoff | PF | total R | maxDD R | max losing run |
|---|---|---|---|---|---|---|---|---|---|---|
| bear (SPY < 50dma) | 459 | 30.7% | -0.214 | -1.055 | -0.040% | 1.64 | 0.73 | -98.3 | 97.1 | 14 |
| bull (SPY > 50dma) | 1098 | 26.9% | -0.414 | -1.127 | -0.024% | 1.47 | 0.54 | -455.0 | 461.9 | 16 |
| long | 1200 | 29.2% | -0.328 | -1.115 | -0.019% | 1.50 | 0.62 | -393.6 | 395.2 | 15 |
| short | 881 | 28.9% | -0.286 | -1.072 | -0.029% | 1.61 | 0.66 | -251.5 | 253.4 | 15 |
| 2012 | 156 | 26.3% | -0.410 | -1.120 | -0.050% | 1.51 | 0.54 | -63.9 | 65.4 | 13 |
| 2013 | 147 | 28.6% | -0.383 | -1.133 | -0.031% | 1.41 | 0.56 | -56.2 | 61.8 | 16 |
| 2014 | 144 | 25.0% | -0.468 | -1.137 | -0.029% | 1.46 | 0.49 | -67.4 | 69.6 | 13 |
| 2015 | 145 | 31.7% | -0.258 | -1.086 | -0.022% | 1.47 | 0.68 | -37.4 | 43.1 | 8 |
| 2016 | 138 | 31.9% | -0.248 | -1.090 | -0.022% | 1.51 | 0.70 | -34.2 | 36.1 | 11 |
| 2017 | 134 | 21.6% | -0.644 | -1.219 | -0.035% | 1.33 | 0.37 | -86.2 | 86.2 | 15 |
| 2018 | 145 | 26.2% | -0.416 | -1.105 | -0.033% | 1.50 | 0.53 | -60.4 | 61.8 | 9 |
| 2019 | 147 | 27.2% | -0.401 | -1.118 | -0.014% | 1.46 | 0.55 | -59.0 | 65.5 | 16 |
| 2020 | 138 | 29.7% | -0.217 | -1.056 | -0.021% | 1.71 | 0.72 | -29.9 | 36.5 | 13 |
| 2021 | 148 | 27.0% | -0.352 | -1.092 | -0.031% | 1.60 | 0.59 | -52.1 | 56.1 | 15 |
| 2022 | 141 | 31.2% | -0.155 | -1.044 | -0.030% | 1.75 | 0.79 | -21.9 | 35.1 | 9 |
| 2023 | 136 | 35.3% | -0.074 | -1.066 | -0.006% | 1.65 | 0.90 | -10.0 | 19.4 | 9 |
| 2024 | 134 | 29.1% | -0.292 | -1.101 | -0.019% | 1.59 | 0.65 | -39.2 | 39.8 | 9 |
| 2025 | 136 | 37.5% | -0.027 | -1.066 | 0.019% | 1.61 | 0.96 | -3.6 | 26.5 | 11 |
| 2026 | 92 | 29.3% | -0.258 | -1.082 | -0.011% | 1.67 | 0.69 | -23.7 | 25.7 | 7 |

- exits: {'stop': 1455, 'time': 77, 'target': 549}
- trades resolved by the pessimistic same-bar assumption (stop and target both inside one bar): 9 (0.4%)
- mean 1-minute bars held: 37.9
- trades per SPY session, where at least one was taken: 1: 1,985, 2: 48

## QQQ and IWM — reported separately, never pooled into SPY

These are not evidence about SPY. They are the same model on two other instruments, judged against the same bar, so a reader can see whether the SPY result is peculiar to SPY.

### QQQ — **FAIL**

| slice | n | hit | mean R | median R | mean % | payoff | PF | total R | maxDD R | max losing run |
|---|---|---|---|---|---|---|---|---|---|---|
| all | 1979 | 29.8% | -0.308 | -1.077 | -0.027% | 1.50 | 0.64 | -609.3 | 623.6 | 16 |
| in-sample 2012-01-01..2022-12-31 | 1506 | 28.8% | -0.357 | -1.088 | -0.032% | 1.46 | 0.59 | -537.6 | 538.1 | 16 |
| out-of-sample 2023-01-01..2026-08-28 | 473 | 33.0% | -0.152 | -1.054 | -0.009% | 1.63 | 0.80 | -71.7 | 87.7 | 15 |

| gate | bar | observed | |
|---|---|---|---|
| G1 sample size (this symbol alone) | IS>=500, OOS>=150 | IS=1506, OOS=473 | PASS |
| G2 expectancy after costs (mean net R) | IS>=+0.10, OOS>=+0.05 | IS=-0.357, OOS=-0.152 | FAIL |
| G3 profit factor after costs | IS>=1.20, OOS>=1.10 | IS=0.59, OOS=0.80 | FAIL |
| G4 winners first going >=0.75R against | <=40% | 21.2% | PASS |
| G5 mean net R > 0 in both regimes (in-sample) | both > 0 | bear (SPY < 50dma)=-0.115 (n=439), bull (SPY > 50dma)=-0.446 (n=1036) | FAIL |

### IWM — **FAIL**

| slice | n | hit | mean R | median R | mean % | payoff | PF | total R | maxDD R | max losing run |
|---|---|---|---|---|---|---|---|---|---|---|
| all | 2071 | 31.6% | -0.215 | -1.068 | -0.019% | 1.58 | 0.73 | -444.6 | 443.2 | 16 |
| in-sample 2012-01-01..2022-12-31 | 1574 | 32.8% | -0.186 | -1.072 | -0.010% | 1.56 | 0.76 | -292.7 | 317.6 | 13 |
| out-of-sample 2023-01-01..2026-08-28 | 497 | 27.8% | -0.306 | -1.060 | -0.045% | 1.63 | 0.63 | -151.9 | 154.8 | 16 |

| gate | bar | observed | |
|---|---|---|---|
| G1 sample size (this symbol alone) | IS>=500, OOS>=150 | IS=1574, OOS=497 | PASS |
| G2 expectancy after costs (mean net R) | IS>=+0.10, OOS>=+0.05 | IS=-0.186, OOS=-0.306 | FAIL |
| G3 profit factor after costs | IS>=1.20, OOS>=1.10 | IS=0.76, OOS=0.63 | FAIL |
| G4 winners first going >=0.75R against | <=40% | 17.1% | PASS |
| G5 mean net R > 0 in both regimes (in-sample) | both > 0 | bear (SPY < 50dma)=-0.122 (n=461), bull (SPY > 50dma)=-0.203 (n=1093) | FAIL |

## Where the days went

Every session the model looked at and the rule that ended it. This is the check on the brief's central worry — that a spec, not the market, is what produces a small trade count.

`triggers` counts BARS, not days: once price is beyond the range on the trend side, every later 5-minute close that session counts again. Almost all of them are the same day still qualifying after its trade was taken, which is what `bars_direction_already_traded` is. `signals` is the number of trades.

| outcome | SPY | QQQ | IWM |
|---|---|---|---|
| `days_seen` | 3,680 | 3,680 | 3,680 |
| `days_no_htf_trend` | 598 | 622 | 539 |
| `days_trend_ok_no_break` | 1,049 | 1,125 | 1,110 |
| `days_trigger_but_no_signal` | 0 | 0 | 1 |
| `days_with_1_trade_direction(s)` | 1,985 | 1,887 | 1,989 |
| `days_with_2_trade_direction(s)` | 48 | 46 | 41 |
| `triggers` | 43,230 | 41,928 | 45,564 |
| `signals` | 2,081 | 1,979 | 2,071 |
| `signals_long` | 1,200 | 1,179 | 1,094 |
| `signals_short` | 881 | 800 | 977 |
| `skip_zero_width_stop` | 5 | 11 | 22 |
| `bars_evaluated` | 248,717 | 249,229 | 249,487 |
| `bars_no_opening_range` | 0 | 0 | 0 |
| `bars_no_htf_trend` | 124,403 | 128,252 | 122,625 |
| `bars_no_break_on_trend_side` | 81,084 | 79,049 | 81,298 |
| `bars_direction_already_traded` | 41,144 | 39,938 | 43,471 |

Every session is booked under exactly one outcome, and the four `days_*` rows below `days_seen` sum to it.

- **SPY**: 2,033 of 3,680 sessions produced at least one trade (55.2%); 598 were lost to the higher timeframe having no confirmed trend at any point in the session (16.2%); 1,049 had a trend but no 5-minute close beyond the range on that side.
  Orders that never became a trade: Counter()
- **QQQ**: 1,933 of 3,680 sessions produced at least one trade (52.5%); 622 were lost to the higher timeframe having no confirmed trend at any point in the session (16.9%); 1,125 had a trend but no 5-minute close beyond the range on that side.
  Orders that never became a trade: Counter()
- **IWM**: 2,030 of 3,680 sessions produced at least one trade (55.2%); 539 were lost to the higher timeframe having no confirmed trend at any point in the session (14.6%); 1,110 had a trend but no 5-minute close beyond the range on that side.
  Orders that never became a trade: Counter()

- model parameters: `{"or_minutes": 15, "entry_tf_minutes": 5, "window": [589, 944], "flatten_min": 955, "trend_timeframe_minutes": 60, "trend_pivot_n": 2, "trend_lookback": 120, "target_r": 2.0, "stop": "trigger candle low (long) / high (short)", "skips": "none"}`

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
- **The higher-timeframe reading is stale by construction on the 1-hour
  variant** in the way described in its gate, and that staleness is the filter,
  not a bug in it.
- **Three index ETFs is not a universe.** SPY, QQQ and IWM are among the most
  efficiently priced instruments available. A null result here does not transfer
  to single names, and neither would a positive one.
- **No borrow, locate, halt, dividend or corporate-action modelling.** QQQ's
  2013-08-22 session is 216 minutes long because the Nasdaq halted; it is kept
  as it is.
