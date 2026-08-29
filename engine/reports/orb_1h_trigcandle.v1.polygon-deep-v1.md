# orb_1h_trigcandle.v1 — measured on `polygon-deep-v1`

**SPY: FAIL.** Against the bar in [`../models/orb_1h_trigcandle.v1/GATE.md`](../models/orb_1h_trigcandle.v1/GATE.md), committed at `d8e592b` before this evaluation existed. one change: ENGINE-4's **trigger-candle** stop instead of the candle before it.

**2,081 SPY trades, 2012-01-11 → 2026-08-28** — 1,583 in-sample and 498 in the held-back window.
**Before costs the model made -0.018R a trade against the matched coin flip's -0.003R; paired trade for trade the gap is -0.016R (95%: -0.072 to +0.041, n=2,072).**
**After costs the average trade returned -0.282R and the MIDDLE trade -1.022R.** Realised stop width: median 29.4¢, mean 43.1¢. Cost drag 0.257R.

Run 2026-08-29T21:27:19+00:00 at `d8e592b`. Snapshot `polygon-deep-v1`, commission $0.005/share/side, slippage 1.0bp on market and stop fills.

## Gross versus the matched control — read this before anything else

ENGINE-1's decisive finding, restated by ENGINE-4: **every model this programme has measured was at or below a coin flip BEFORE costs.** A model that cannot beat a random entry on free trades cannot be rescued by a management rule, a target choice or a stop reading, so this table is computed first and read first. The control takes the same symbol, the same days, the same decision minutes, the same stop distances AND the same target distances, runs them through the same managed runner, and flips only the direction. Anything the model earns over it, it earned by knowing which way to point.

| symbol | run | n | gross mean R | gross median R | net mean R | net median R | hit | PF (net) |
|---|---|---|---|---|---|---|---|---|
| SPY | `orb_1h_trigcandle.v1` | 2,081 | -0.018 | +0.214 | -0.282 | -1.022 | 46.9% | 0.55 |
| SPY | `null_coinflip.v1.matched` | 2,080 | -0.003 | +0.270 | -0.271 | -0.117 | 48.0% | 0.56 |
| QQQ | `orb_1h_trigcandle.v1` | 1,979 | -0.056 | +0.133 | -0.306 | -0.520 | 46.0% | 0.51 |
| QQQ | `null_coinflip.v1.matched` | 1,979 | -0.058 | +0.167 | -0.321 | -0.268 | 46.8% | 0.49 |
| IWM | `orb_1h_trigcandle.v1` | 2,071 | -0.055 | +0.219 | -0.244 | +0.000 | 50.1% | 0.56 |
| IWM | `null_coinflip.v1.matched` | 2,071 | -0.069 | +0.168 | -0.278 | -0.026 | 48.9% | 0.52 |

Paired trade by trade on the same symbol, day and minute, **gross of costs** — did knowing which way to point pay for itself?

| symbol | window | pairs | model − control, gross mean R | 95% interval | reading |
|---|---|---|---|---|---|
| SPY | all | 2,072 | -0.016 | -0.072 to +0.041 | contains zero — nothing measurable |
| SPY | in-sample | 1,577 | -0.027 | -0.091 to +0.037 | contains zero — nothing measurable |
| SPY | out-of-sample | 495 | +0.022 | -0.098 to +0.141 | contains zero — nothing measurable |
| QQQ | all | 1,972 | +0.001 | -0.054 to +0.057 | contains zero — nothing measurable |
| QQQ | in-sample | 1,500 | -0.018 | -0.080 to +0.044 | contains zero — nothing measurable |
| QQQ | out-of-sample | 472 | +0.064 | -0.056 to +0.183 | contains zero — nothing measurable |
| IWM | all | 2,066 | +0.014 | -0.039 to +0.066 | contains zero — nothing measurable |
| IWM | in-sample | 1,569 | +0.052 | -0.007 to +0.111 | contains zero — nothing measurable |
| IWM | out-of-sample | 497 | -0.108 | -0.217 to +0.001 | contains zero — nothing measurable |

### The lane was pre-authorised to stop here, and what it did instead

The gate committed at `d8e592b` says: if the primary model is not better than this control gross, report that plainly and stop, rather than running every variant to completion. **It is not better than the control gross.** The point estimate is at or below zero and every interval contains zero.

The four variants were nevertheless run to completion, and the reason is stated rather than left to be assumed: on this cache a full variant takes about ten seconds, so completing the set cost minutes of machine time and no judgement. What the pre-authorisation was protecting against — spending the lane's attention hunting for a variant that looks good — did not happen: **no variant was added, no threshold was moved, and no parameter was changed after a number was seen.** The three variants that follow the primary were all pre-registered in the same commit as the primary, and each carries exactly one change.

What the completed set buys is the two comparisons the brief owes regardless of the verdict — the stop reading, and whether the management rule pays — and both are measured below on the same trades rather than argued.

## In plain language

**Did it work?** No. It missed G2, G3, G5 of the five gates that were written down before it ran.

**The subtraction that decides everything.** A setup only survives if what it earns is bigger than what it costs to trade. Here is that sum, on SPY, per share.

| per share, average SPY trade | this model |
|---|---|
| what the setup earned, before costs | +0.76¢ |
| what it paid to get in and out | -6.12¢ |
| **what was left, on the average trade** | **-5.36¢** |
| what was left, on the MIDDLE trade | -5.9¢ |
| median money risked per trade | 29.4¢ |
| mean money risked per trade | 43.1¢ |
| average share price | $334 |

Across all 2,081 SPY trades the model made $-111.49 per share in total; the best three trades contributed $11.62 of that, leaving $-123.11 for the other 2,078. **Read the middle trade beside the average.**

**How sure are we?**

- **SPY.** Held-back window: 498 trades averaging -0.220R, middle trade -0.131R, honest range -0.324R to -0.117R. In-sample: 1,583 trades averaging -0.301R, middle trade -1.026R, range -0.355R to -0.248R.
- **QQQ.** Held-back window: 473 trades averaging -0.187R, middle trade +0.018R, honest range -0.284R to -0.090R. In-sample: 1,506 trades averaging -0.343R, middle trade -1.021R, range -0.398R to -0.287R.
- **IWM.** Held-back window: 497 trades averaging -0.271R, middle trade -0.097R, honest range -0.357R to -0.185R. In-sample: 1,574 trades averaging -0.235R, middle trade +0.016R, range -0.286R to -0.185R.

**One R is one unit of the money you agreed to lose if the trade goes wrong** — here, the distance from the entry to whichever 5-minute candle's extreme this variant stops behind. +0.10R means the average trade made a tenth of what it risked. The bar was +0.10R in-sample and +0.05R out-of-sample, after costs.

**These are models seven through ten.** `orb_reclaim.v1`, `sweep_displacement_fvg.v1`, `orb_htf_structural.v1`, `orb_mtf.v1`, `orb_simple_1h.v1` and `orb_simple_4h.v1` were all measured on this programme's data; five failed and one was inconclusive. These four are run as a set, which is four more chances for one of them to look good by luck. **Out-of-sample is the verdict and it was read once.** A variant that passes while the primary fails is a lead, not a result.

**What would change the answer?**

- **Cost drag, which ENGINE-4 established is `cost per share ÷ stop distance`.** This variant's realised drag is 0.257R (95%: 0.236 to 0.278) — 25.7% of the money risked on every trade. The stop width sets that hurdle, not the instrument. See the stop-reading section for both readings side by side.
- **The stop distance.** The median trade risks 29.4¢ on a $334 share — 0.088% of price.
- **Nothing in the management rule.** The unmanaged control is measured on the same entries, so the rule's contribution is a number in this report rather than an assumption.
- **More symbols, and different ones.** Index ETFs are among the most efficiently priced instruments in the market; the 32-name basket is reported separately for exactly that reason. A null result on one does not transfer to the other in either direction.
## DIAGNOSTIC — the share of trades that touched +1R

**This section is a diagnostic. It appears in no gate, it is part of no verdict, and no conclusion in this report rests on it.** The fence was written into `models/orb_1h_managed.v1/GATE.md` and `models/gates.py` before any number existed.

The owner asked to *"mark any trade that moves up at least 1rr as a win"*. That is a SCORING change, and taken literally it is the exact error that made the SMS engine look profitable while it lost money: `alert_performance_honest` records average PEAK +11.93% on 141 long alerts whose realised 5-day return was **+0.41%**, with 47.5% of them 8%+ underwater first (17 §1). **A price nobody sold at is not income.**

So the +1R was implemented as a rule that BANKS it — half off, stop to breakeven — and it is measured in the management section. The touch rate belongs here, on its own, next to what the literal scoring would have claimed.

Measured on `orb_1h_unmanaged.v1`, whose best excursion is not capped by a partial. It IS capped by the trade's own exit: a trade that took its target at +0.4R cannot show +1R, because it was closed. That is stated rather than corrected — following a closed position forward is the fiction being guarded against.

| symbol | trades | **touched +1R** | what the trades that touched actually returned | what every trade actually returned |
|---|---|---|---|---|
| SPY | 2,074 | **26.9%** (558) | mean +0.823R | win rate 41.4%, mean -0.224R, median -1.039R |
| QQQ | 1,975 | **26.3%** (519) | mean +0.823R | win rate 43.0%, mean -0.212R, median -1.025R |
| IWM | 2,069 | **24.9%** (516) | mean +0.748R | win rate 45.6%, mean -0.185R, median -0.599R |

### What the literal scoring rule would have claimed

Two readings of *"mark it as a win"*, both priced on exactly these trades. **Neither is a result and neither enters a gate.**

- **Promote-only** — leave every other trade as it resolved and book +1.000R for each one that touched. This is the closer reading of the owner's sentence (*"even if it doesnt hit 2rr"*), and it can only make the number better than reality, never worse, which is exactly what makes it dangerous.
- **Win/lose** — +1R if it touched, −1R if it did not. Harsher than reality on this model, because a level target is often nearer than 1R and many trades that never touched still resolved for less than a full loss. `gates.naive_1r_scoring_generous` was added after seeing that, and the reason is written into its docstring rather than left to be inferred.

| symbol | REALISED mean R | REALISED median R | promote-only, mean R | promote-only, median R | promote-only "win rate" | win/lose, mean R | trades promoted from a loss to a win |
|---|---|---|---|---|---|---|---|
| SPY | -0.224 | -1.039 | **-0.177** | +0.015 | 50.8% | -0.462 | 281 |
| QQQ | -0.212 | -1.025 | **-0.165** | +0.034 | 51.6% | -0.474 | 252 |
| IWM | -0.185 | -0.599 | **-0.122** | +0.092 | 54.6% | -0.501 | 266 |

**On SPY the promote-only rule turns -0.224R a trade into -0.177R a trade — a swing of +0.048R produced by nothing but the choice of what counts as a win.** 281 losing trades become winners without a single share changing hands at a different price. That is the same arithmetic that produced +11.93% average peak against +0.41% realised on the SMS engine, and it is why the request was implemented as a rule that BANKS the 1R instead of a rule that scores it.

## Cost drag as a fraction of risk

ENGINE-4's finding, which this lane inherits and re-measures: **cost as a fraction of risk is `cost per share ÷ stop distance`.** The numerator scales with the PRICE of the instrument. The denominator is chosen by the MODEL. The stop width sets the hurdle; the instrument does not.

Paired trade by trade, so it is the same trades gross and net.

| symbol | trades | median risk, % of price | median risk | mean risk | avg price | **cost drag, R** | 95% interval |
|---|---|---|---|---|---|---|---|
| SPY | 2,074 | 0.104% | 29.4¢ | 43.1¢ | $334 | **0.257R** | 0.236 to 0.278 |
| QQQ | 1,973 | 0.134% | 24.0¢ | 45.9¢ | $248 | **0.241R** | 0.218 to 0.263 |
| IWM | 2,066 | 0.160% | 23.1¢ | 31.2¢ | $159 | **0.183R** | 0.165 to 0.201 |

For comparison, from earlier phases: `orb_reclaim.v1` ≈0.09R, `orb_htf_structural.v1` 0.144R, `orb_mtf.v1` 0.122R on the 32-name basket; `orb_simple_1h.v1` 0.265R on SPY with a trigger-candle stop.

## The gate — evaluated on SPY — **FAIL**

| gate | | bar | observed | |
|---|---|---|---|---|
| G1 | sample size (this symbol alone) | IS>=500, OOS>=150 | IS=1583, OOS=498 | **PASS** |
| G2 | expectancy after costs (mean net R) | IS>=+0.10, OOS>=+0.05 | IS=-0.301, OOS=-0.220 | **FAIL** |
| G3 | profit factor after costs | IS>=1.20, OOS>=1.10 | IS=0.52, OOS=0.64 | **FAIL** |
| G4 | winners first going >=0.75R against | <=40% | 17.1% | **PASS** |
| G5 | mean net R > 0 in both regimes (in-sample) | both > 0 | bear (SPY < 50dma)=-0.149 (n=459), bull (SPY > 50dma)=-0.362 (n=1098) | **FAIL** |

## SPY, in full

| slice | n | hit | mean R | median R | mean % | payoff | PF | total R | maxDD R | max losing run |
|---|---|---|---|---|---|---|---|---|---|---|
| all | 2081 | 46.9% | -0.282 | -1.022 | -0.019% | 0.62 | 0.55 | -586.6 | 586.9 | 10 |
| in-sample 2012-01-01..2022-12-31 | 1583 | 46.6% | -0.301 | -1.026 | -0.021% | 0.60 | 0.52 | -477.0 | 486.9 | 9 |
| out-of-sample 2023-01-01..2026-08-28 | 498 | 47.8% | -0.220 | -0.131 | -0.011% | 0.70 | 0.64 | -109.6 | 110.7 | 10 |

**Maximum adverse excursion — All SPY trades.** How far a trade travelled the wrong way before it resolved. Distribution, not mean.

- MAE deciles (R): 0.19 | 0.32 | 0.51 | 0.70 | 1.00 | 1.03 | 1.10 | 1.19 | 1.41
- all trades reaching that far against: >=0.25R 85.4% · >=0.5R 70.2% · >=0.75R 58.0% · >=1.0R 51.4%
- **winners** that first went that far against: >=0.25R 71.5% · >=0.5R 40.8% · >=0.75R 16.1% · >=1.0R 2.4%

**Maximum adverse excursion — SPY, held-back window.** How far a trade travelled the wrong way before it resolved. Distribution, not mean.

- MAE deciles (R): 0.18 | 0.31 | 0.46 | 0.67 | 1.00 | 1.04 | 1.11 | 1.24 | 1.48
- all trades reaching that far against: >=0.25R 85.1% · >=0.5R 68.3% · >=0.75R 56.2% · >=1.0R 50.0%
- **winners** that first went that far against: >=0.25R 71.4% · >=0.5R 38.2% · >=0.75R 13.0% · >=1.0R 0.8%

By regime (in-sample), then side and year:

| slice | n | hit | mean R | median R | mean % | payoff | PF | total R | maxDD R | max losing run |
|---|---|---|---|---|---|---|---|---|---|---|
| bear (SPY < 50dma) | 459 | 51.9% | -0.149 | 0.021 | -0.024% | 0.67 | 0.72 | -68.4 | 67.2 | 8 |
| bull (SPY > 50dma) | 1098 | 44.7% | -0.362 | -1.060 | -0.020% | 0.56 | 0.46 | -397.4 | 407.7 | 9 |
| long | 1200 | 45.3% | -0.315 | -1.050 | -0.020% | 0.62 | 0.52 | -377.5 | 383.0 | 11 |
| short | 881 | 48.9% | -0.237 | -0.042 | -0.017% | 0.62 | 0.59 | -209.0 | 207.6 | 9 |
| 2012 | 156 | 42.3% | -0.367 | -1.078 | -0.035% | 0.61 | 0.44 | -57.2 | 58.7 | 7 |
| 2013 | 147 | 45.6% | -0.359 | -1.073 | -0.025% | 0.55 | 0.46 | -52.8 | 54.3 | 7 |
| 2014 | 144 | 44.4% | -0.379 | -1.055 | -0.029% | 0.51 | 0.41 | -54.5 | 55.3 | 7 |
| 2015 | 145 | 46.9% | -0.270 | -0.140 | -0.016% | 0.62 | 0.55 | -39.2 | 41.2 | 8 |
| 2016 | 138 | 47.1% | -0.274 | -0.164 | -0.015% | 0.63 | 0.56 | -37.7 | 36.7 | 9 |
| 2017 | 134 | 43.3% | -0.458 | -1.120 | -0.019% | 0.51 | 0.39 | -61.3 | 59.9 | 5 |
| 2018 | 145 | 49.0% | -0.281 | -0.131 | -0.010% | 0.57 | 0.54 | -40.7 | 41.2 | 8 |
| 2019 | 147 | 42.2% | -0.367 | -1.077 | -0.018% | 0.64 | 0.46 | -54.0 | 58.6 | 7 |
| 2020 | 138 | 46.4% | -0.259 | -1.014 | -0.046% | 0.64 | 0.55 | -35.7 | 35.9 | 8 |
| 2021 | 148 | 52.7% | -0.200 | 0.064 | -0.002% | 0.58 | 0.65 | -29.7 | 33.7 | 6 |
| 2022 | 141 | 52.5% | -0.099 | 0.094 | -0.017% | 0.73 | 0.81 | -14.0 | 29.2 | 7 |
| 2023 | 136 | 51.5% | -0.188 | 0.113 | -0.013% | 0.63 | 0.67 | -25.6 | 26.5 | 5 |
| 2024 | 134 | 41.8% | -0.285 | -1.072 | -0.013% | 0.81 | 0.58 | -38.2 | 37.0 | 10 |
| 2025 | 136 | 50.7% | -0.160 | 0.033 | -0.005% | 0.69 | 0.71 | -21.7 | 27.8 | 6 |
| 2026 | 92 | 46.7% | -0.262 | -1.036 | -0.014% | 0.67 | 0.59 | -24.1 | 24.9 | 6 |

- exits: {'target': 420, 'stop': 1045, 'partial+be': 347, 'partial+target': 193, 'partial+time': 62, 'time': 14}
- trades resolved by the pessimistic same-bar assumption: 94 (4.5%)
- mean 1-minute bars held: 28.2
- trades per session, where at least one was taken: 1: 1,985, 2: 48

## The other symbols — reported separately, never pooled into SPY

These are not evidence about the subject. They are the same model on other instruments, judged against the same bar, so a reader can see whether the subject's result is peculiar to it.

### QQQ — **FAIL**

| slice | n | hit | mean R | median R | mean % | payoff | PF | total R | maxDD R | max losing run |
|---|---|---|---|---|---|---|---|---|---|---|
| all | 1979 | 46.0% | -0.306 | -0.520 | -0.027% | 0.60 | 0.51 | -604.8 | 609.8 | 13 |
| in-sample 2012-01-01..2022-12-31 | 1506 | 44.6% | -0.343 | -1.021 | -0.032% | 0.59 | 0.47 | -516.4 | 516.4 | 13 |
| out-of-sample 2023-01-01..2026-08-28 | 473 | 50.5% | -0.187 | 0.018 | -0.010% | 0.65 | 0.66 | -88.4 | 96.5 | 9 |

| gate | bar | observed | |
|---|---|---|---|
| G1 sample size (this symbol alone) | IS>=500, OOS>=150 | IS=1506, OOS=473 | PASS |
| G2 expectancy after costs (mean net R) | IS>=+0.10, OOS>=+0.05 | IS=-0.343, OOS=-0.187 | FAIL |
| G3 profit factor after costs | IS>=1.20, OOS>=1.10 | IS=0.47, OOS=0.66 | FAIL |
| G4 winners first going >=0.75R against | <=40% | 18.3% | PASS |
| G5 mean net R > 0 in both regimes (in-sample) | both > 0 | bear (SPY < 50dma)=-0.144 (n=439), bull (SPY > 50dma)=-0.412 (n=1036) | FAIL |

### IWM — **FAIL**

| slice | n | hit | mean R | median R | mean % | payoff | PF | total R | maxDD R | max losing run |
|---|---|---|---|---|---|---|---|---|---|---|
| all | 2071 | 50.1% | -0.244 | 0.000 | -0.023% | 0.56 | 0.56 | -505.0 | 503.6 | 8 |
| in-sample 2012-01-01..2022-12-31 | 1574 | 50.6% | -0.235 | 0.016 | -0.020% | 0.56 | 0.57 | -370.4 | 369.1 | 8 |
| out-of-sample 2023-01-01..2026-08-28 | 497 | 48.3% | -0.271 | -0.097 | -0.032% | 0.57 | 0.53 | -134.6 | 135.0 | 8 |

| gate | bar | observed | |
|---|---|---|---|
| G1 sample size (this symbol alone) | IS>=500, OOS>=150 | IS=1574, OOS=497 | PASS |
| G2 expectancy after costs (mean net R) | IS>=+0.10, OOS>=+0.05 | IS=-0.235, OOS=-0.271 | FAIL |
| G3 profit factor after costs | IS>=1.20, OOS>=1.10 | IS=0.57, OOS=0.53 | FAIL |
| G4 winners first going >=0.75R against | <=40% | 13.7% | PASS |
| G5 mean net R > 0 in both regimes (in-sample) | both > 0 | bear (SPY < 50dma)=-0.243 (n=461), bull (SPY > 50dma)=-0.228 (n=1093) | FAIL |

## Where the days went

Every session the model looked at and the rule that ended it.

`triggers` counts BARS, not days: once price is beyond the range on the trend side, every later 5-minute close that session counts again. `signals` is the number of trades. `signals_no_target_level` is a SUBSET of `signals` — a trade with no price target, not a skip.

| outcome | SPY | QQQ | IWM |
|---|---|---|---|
| `days_seen` | 3,680 | 3,680 | 3,680 |
| `days_no_htf_trend` | 598 | 622 | 539 |
| `days_trend_ok_no_break` | 1,049 | 1,125 | 1,110 |
| `days_trigger_but_no_signal` | 0 | 0 | 1 |
| `days_with_1_trade_direction(s)` | 1,985 | 1,887 | 1,989 |
| `days_with_2_trade_direction(s)` | 48 | 46 | 41 |
| `triggers` | 45,694 | 44,697 | 49,757 |
| `signals` | 2,081 | 1,979 | 2,071 |
| `signals_long` | 1,200 | 1,179 | 1,094 |
| `signals_short` | 881 | 800 | 977 |
| `signals_no_target_level` | 355 | 368 | 347 |
| `skip_invalid_stop` | 5 | 11 | 22 |
| `skip_no_prior_candle` | 0 | 0 | 0 |
| `bars_evaluated` | 252,695 | 253,360 | 255,420 |
| `bars_no_opening_range` | 0 | 0 | 0 |
| `bars_no_htf_trend` | 125,168 | 128,951 | 123,526 |
| `bars_no_break_on_trend_side` | 81,833 | 79,712 | 82,137 |
| `bars_direction_already_traded` | 43,608 | 42,707 | 47,664 |

Every session is booked under exactly one outcome, and the `days_*` rows below `days_seen` sum to it.

- **SPY**: 2,033 of 3,680 sessions produced at least one trade (55.2%); 598 lost to the 1-hour chart having no confirmed trend at any point; 1,049 had a trend but no 5-minute close beyond the range on that side. Orders that never became a trade: Counter()
- **QQQ**: 1,933 of 3,680 sessions produced at least one trade (52.5%); 622 lost to the 1-hour chart having no confirmed trend at any point; 1,125 had a trend but no 5-minute close beyond the range on that side. Orders that never became a trade: Counter()
- **IWM**: 2,030 of 3,680 sessions produced at least one trade (55.2%); 539 lost to the 1-hour chart having no confirmed trend at any point; 1,110 had a trend but no 5-minute close beyond the range on that side. Orders that never became a trade: Counter()

- model parameters: `{"or_minutes": 15, "entry_tf_minutes": 5, "window": [589, 944], "flatten_min": 955, "trend_timeframe_minutes": 60, "trend_pivot_n": 2, "trend_lookback": 120, "stop": "the trigger candle itself (ENGINE-4's reading)", "target": "nearest 1h pivot / session reference level", "h1_pivot_n": 2, "h1_lookback": 120, "h1_min_touches": 2, "touch_bps": 8.0, "cluster_bps": 25.0, "managed": true, "partial_r": 1.0, "partial_fraction": 0.5, "skips": "invalid stop only"}`

## Disclosures specific to this run

- **Models seven through ten.** `orb_reclaim.v1`, `sweep_displacement_fvg.v1`,
  `orb_htf_structural.v1`, `orb_mtf.v1`, `orb_simple_1h.v1` and
  `orb_simple_4h.v1` were all measured on this programme's data; five failed and
  one was inconclusive. `orb_1h_managed.v1`, `orb_1h_managed_2r.v1`,
  `orb_1h_trigcandle.v1` and `orb_1h_unmanaged.v1` are run as a SET of four,
  which is four more chances for one of them to look good by luck. Out-of-sample
  is the verdict and was read once. A variant that passes while the primary
  fails is a lead, not a result.
- **The +1R touch rate is a diagnostic and enters no gate.** The fence was
  written into the gate and into `models/gates.py` before any number existed.
  Nothing in the verdict depends on a price nobody sold at.
- **A breakeven stop is not free.** It fills at the entry price plus adverse
  slippage and still pays its half of the commission, so a "breakeven" exit is
  a small realised loss. That is what a real one does.
- **The management rule's ambiguities are all resolved against the trade.** A
  bar containing both the stop and the +1R level is booked as the stop with no
  partial. A bar that reaches +1R and then returns through the entry is booked
  as partial-then-breakeven, because the order of the two excursions is
  unknowable from OHLC. Both are counted in the report.
- **No level in the trade's direction is not a skip.** It is a trade with no
  price target, which runs to the breakeven stop or the 15:55 flat. Counted as
  `signals_no_target_level`, and the level-target trades are given as a labelled
  subset so both readings of that choice are visible.
- **The two stop readings do not produce identical trade sets.** A prior candle
  can sit on the wrong side of the trigger close; that is counted as
  `skip_invalid_stop` and is why the counts differ. Every stop-width and
  cost-drag comparison is repeated on the intersection.
- **Fills are modelled, not observed.** OHLC cannot say what happened inside a
  bar. Every ambiguity is resolved against the trade, and a bar containing both
  the stop and the target is booked as the stop.
- **One position at a time.** A day's second direction can only be taken after
  the first has closed.
- **Prices are split- and dividend-adjusted**, so the dollar prices in older
  years are not the prices that printed on the tape that day. Every per-share
  cent figure is measured against the ADJUSTED price; the cost-drag fraction is
  the number to trust and the cents are the illustration.
- **No borrow, locate, halt, dividend or corporate-action modelling.**
- **Three index ETFs is not a universe.** SPY, QQQ and IWM are among the most efficiently priced instruments available. A null result here does not transfer to single names, and neither would a positive one. The 32-name `polygon-v1` basket is reported separately for that reason.
