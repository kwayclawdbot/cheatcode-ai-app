# orb_1h_managed_2r.v1 — measured on `polygon-deep-v1`

**SPY: FAIL.** Against the bar in [`../models/orb_1h_managed_2r.v1/GATE.md`](../models/orb_1h_managed_2r.v1/GATE.md), committed at `d8e592b` before this evaluation existed. one change: a fixed **2R** target instead of the 1-hour level.

**2,074 SPY trades, 2012-01-11 → 2026-08-28** — 1,580 in-sample and 494 in the held-back window.
**Before costs the model made -0.038R a trade against the matched coin flip's -0.019R; paired trade for trade the gap is -0.020R (95%: -0.081 to +0.041, n=2,068).**
**After costs the average trade returned -0.246R and the MIDDLE trade -1.038R.** Realised stop width: median 41.9¢, mean 61.1¢. Cost drag 0.206R.

Run 2026-08-29T21:27:18+00:00 at `d8e592b`. Snapshot `polygon-deep-v1`, commission $0.005/share/side, slippage 1.0bp on market and stop fills.

## Gross versus the matched control — read this before anything else

ENGINE-1's decisive finding, restated by ENGINE-4: **every model this programme has measured was at or below a coin flip BEFORE costs.** A model that cannot beat a random entry on free trades cannot be rescued by a management rule, a target choice or a stop reading, so this table is computed first and read first. The control takes the same symbol, the same days, the same decision minutes, the same stop distances AND the same target distances, runs them through the same managed runner, and flips only the direction. Anything the model earns over it, it earned by knowing which way to point.

| symbol | run | n | gross mean R | gross median R | net mean R | net median R | hit | PF (net) |
|---|---|---|---|---|---|---|---|---|
| SPY | `orb_1h_managed_2r.v1` | 2,074 | -0.038 | -0.868 | -0.246 | -1.038 | 43.0% | 0.62 |
| SPY | `null_coinflip.v1.matched` | 2,072 | -0.019 | -0.333 | -0.234 | -1.035 | 43.6% | 0.64 |
| QQQ | `orb_1h_managed_2r.v1` | 1,974 | -0.026 | -0.356 | -0.190 | -1.024 | 45.4% | 0.69 |
| QQQ | `null_coinflip.v1.matched` | 1,972 | -0.038 | -0.528 | -0.199 | -1.022 | 45.2% | 0.67 |
| IWM | `orb_1h_managed_2r.v1` | 2,069 | -0.005 | -0.100 | -0.163 | -1.021 | 46.5% | 0.72 |
| IWM | `null_coinflip.v1.matched` | 2,069 | -0.002 | +0.239 | -0.150 | -1.017 | 47.1% | 0.74 |

Paired trade by trade on the same symbol, day and minute, **gross of costs** — did knowing which way to point pay for itself?

| symbol | window | pairs | model − control, gross mean R | 95% interval | reading |
|---|---|---|---|---|---|
| SPY | all | 2,068 | -0.020 | -0.081 to +0.041 | contains zero — nothing measurable |
| SPY | in-sample | 1,576 | -0.048 | -0.118 to +0.022 | contains zero — nothing measurable |
| SPY | out-of-sample | 492 | +0.070 | -0.056 to +0.196 | contains zero — nothing measurable |
| QQQ | all | 1,967 | +0.012 | -0.051 to +0.074 | contains zero — nothing measurable |
| QQQ | in-sample | 1,496 | -0.006 | -0.077 to +0.066 | contains zero — nothing measurable |
| QQQ | out-of-sample | 471 | +0.068 | -0.060 to +0.195 | contains zero — nothing measurable |
| IWM | all | 2,063 | -0.002 | -0.062 to +0.058 | contains zero — nothing measurable |
| IWM | in-sample | 1,568 | +0.039 | -0.030 to +0.107 | contains zero — nothing measurable |
| IWM | out-of-sample | 495 | -0.130 | -0.252 to -0.008 | **excludes zero AGAINST the model** |

### The lane was pre-authorised to stop here, and what it did instead

The gate committed at `d8e592b` says: if the primary model is not better than this control gross, report that plainly and stop, rather than running every variant to completion. **It is not better than the control gross.** The point estimate is at or below zero and every interval contains zero.

The four variants were nevertheless run to completion, and the reason is stated rather than left to be assumed: on this cache a full variant takes about ten seconds, so completing the set cost minutes of machine time and no judgement. What the pre-authorisation was protecting against — spending the lane's attention hunting for a variant that looks good — did not happen: **no variant was added, no threshold was moved, and no parameter was changed after a number was seen.** The three variants that follow the primary were all pre-registered in the same commit as the primary, and each carries exactly one change.

What the completed set buys is the two comparisons the brief owes regardless of the verdict — the stop reading, and whether the management rule pays — and both are measured below on the same trades rather than argued.

## In plain language

**Did it work?** No. It missed G2, G3, G5 of the five gates that were written down before it ran.

**The subtraction that decides everything.** A setup only survives if what it earns is bigger than what it costs to trade. Here is that sum, on SPY, per share.

| per share, average SPY trade | this model |
|---|---|
| what the setup earned, before costs | -0.98¢ |
| what it paid to get in and out | -6.94¢ |
| **what was left, on the average trade** | **-7.93¢** |
| what was left, on the MIDDLE trade | -15.3¢ |
| median money risked per trade | 41.9¢ |
| mean money risked per trade | 61.1¢ |
| average share price | $334 |

Across all 2,074 SPY trades the model made $-164.43 per share in total; the best three trades contributed $17.00 of that, leaving $-181.43 for the other 2,071. **Read the middle trade beside the average.**

**How sure are we?**

- **SPY.** Held-back window: 494 trades averaging -0.168R, middle trade -1.033R, honest range -0.267R to -0.069R. In-sample: 1,580 trades averaging -0.270R, middle trade -1.040R, range -0.322R to -0.217R.
- **QQQ.** Held-back window: 473 trades averaging -0.082R, middle trade -0.083R, honest range -0.179R to +0.015R. In-sample: 1,501 trades averaging -0.224R, middle trade -1.028R, range -0.280R to -0.168R.
- **IWM.** Held-back window: 497 trades averaging -0.208R, middle trade -1.026R, honest range -0.301R to -0.116R. In-sample: 1,572 trades averaging -0.149R, middle trade -1.018R, range -0.202R to -0.095R.

**One R is one unit of the money you agreed to lose if the trade goes wrong** — here, the distance from the entry to whichever 5-minute candle's extreme this variant stops behind. +0.10R means the average trade made a tenth of what it risked. The bar was +0.10R in-sample and +0.05R out-of-sample, after costs.

**These are models seven through ten.** `orb_reclaim.v1`, `sweep_displacement_fvg.v1`, `orb_htf_structural.v1`, `orb_mtf.v1`, `orb_simple_1h.v1` and `orb_simple_4h.v1` were all measured on this programme's data; five failed and one was inconclusive. These four are run as a set, which is four more chances for one of them to look good by luck. **Out-of-sample is the verdict and it was read once.** A variant that passes while the primary fails is a lead, not a result.

**What would change the answer?**

- **Cost drag, which ENGINE-4 established is `cost per share ÷ stop distance`.** This variant's realised drag is 0.206R (95%: 0.186 to 0.225) — 20.6% of the money risked on every trade. The stop width sets that hurdle, not the instrument. See the stop-reading section for both readings side by side.
- **The stop distance.** The median trade risks 41.9¢ on a $334 share — 0.126% of price.
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
| SPY | 2,072 | 0.146% | 41.9¢ | 61.1¢ | $334 | **0.206R** | 0.186 to 0.225 |
| QQQ | 1,969 | 0.202% | 35.7¢ | 65.9¢ | $248 | **0.158R** | 0.142 to 0.174 |
| IWM | 2,066 | 0.248% | 35.1¢ | 46.6¢ | $159 | **0.155R** | 0.139 to 0.171 |

For comparison, from earlier phases: `orb_reclaim.v1` ≈0.09R, `orb_htf_structural.v1` 0.144R, `orb_mtf.v1` 0.122R on the 32-name basket; `orb_simple_1h.v1` 0.265R on SPY with a trigger-candle stop.

## The gate — evaluated on SPY — **FAIL**

| gate | | bar | observed | |
|---|---|---|---|---|
| G1 | sample size (this symbol alone) | IS>=500, OOS>=150 | IS=1580, OOS=494 | **PASS** |
| G2 | expectancy after costs (mean net R) | IS>=+0.10, OOS>=+0.05 | IS=-0.270, OOS=-0.168 | **FAIL** |
| G3 | profit factor after costs | IS>=1.20, OOS>=1.10 | IS=0.58, OOS=0.73 | **FAIL** |
| G4 | winners first going >=0.75R against | <=40% | 20.4% | **PASS** |
| G5 | mean net R > 0 in both regimes (in-sample) | both > 0 | bear (SPY < 50dma)=-0.184 (n=458), bull (SPY > 50dma)=-0.300 (n=1096) | **FAIL** |

## SPY, in full

| slice | n | hit | mean R | median R | mean % | payoff | PF | total R | maxDD R | max losing run |
|---|---|---|---|---|---|---|---|---|---|---|
| all | 2074 | 43.0% | -0.246 | -1.038 | -0.026% | 0.82 | 0.62 | -509.3 | 508.7 | 9 |
| in-sample 2012-01-01..2022-12-31 | 1580 | 42.3% | -0.270 | -1.040 | -0.030% | 0.80 | 0.58 | -426.4 | 426.4 | 9 |
| out-of-sample 2023-01-01..2026-08-28 | 494 | 45.3% | -0.168 | -1.033 | -0.013% | 0.88 | 0.73 | -82.9 | 86.5 | 8 |

**Maximum adverse excursion — All SPY trades.** How far a trade travelled the wrong way before it resolved. Distribution, not mean.

- MAE deciles (R): 0.22 | 0.40 | 0.59 | 0.86 | 1.00 | 1.04 | 1.08 | 1.16 | 1.34
- all trades reaching that far against: >=0.25R 88.2% · >=0.5R 73.9% · >=0.75R 64.4% · >=1.0R 55.8%
- **winners** that first went that far against: >=0.25R 72.5% · >=0.5R 40.1% · >=0.75R 19.3% · >=1.0R 2.0%

**Maximum adverse excursion — SPY, held-back window.** How far a trade travelled the wrong way before it resolved. Distribution, not mean.

- MAE deciles (R): 0.19 | 0.34 | 0.52 | 0.79 | 1.00 | 1.04 | 1.09 | 1.17 | 1.36
- all trades reaching that far against: >=0.25R 85.4% · >=0.5R 70.4% · >=0.75R 61.3% · >=1.0R 53.8%
- **winners** that first went that far against: >=0.25R 67.9% · >=0.5R 34.8% · >=0.75R 16.1% · >=1.0R 1.3%

By regime (in-sample), then side and year:

| slice | n | hit | mean R | median R | mean % | payoff | PF | total R | maxDD R | max losing run |
|---|---|---|---|---|---|---|---|---|---|---|
| bear (SPY < 50dma) | 458 | 45.0% | -0.184 | -1.022 | -0.037% | 0.84 | 0.69 | -84.2 | 83.1 | 7 |
| bull (SPY > 50dma) | 1096 | 41.4% | -0.300 | -1.059 | -0.027% | 0.78 | 0.55 | -329.3 | 334.4 | 9 |
| long | 1197 | 42.8% | -0.255 | -1.050 | -0.022% | 0.81 | 0.61 | -304.7 | 306.3 | 10 |
| short | 877 | 43.3% | -0.233 | -1.029 | -0.031% | 0.82 | 0.63 | -204.7 | 205.4 | 12 |
| 2012 | 156 | 39.1% | -0.303 | -1.065 | -0.028% | 0.87 | 0.56 | -47.3 | 48.5 | 8 |
| 2013 | 147 | 39.5% | -0.427 | -1.079 | -0.050% | 0.63 | 0.41 | -62.8 | 65.8 | 9 |
| 2014 | 143 | 42.7% | -0.264 | -1.053 | -0.020% | 0.78 | 0.58 | -37.8 | 38.9 | 8 |
| 2015 | 145 | 44.8% | -0.258 | -1.038 | -0.027% | 0.70 | 0.57 | -37.4 | 42.4 | 9 |
| 2016 | 137 | 46.7% | -0.162 | -1.022 | -0.010% | 0.82 | 0.72 | -22.2 | 26.4 | 6 |
| 2017 | 134 | 44.8% | -0.240 | -1.052 | -0.019% | 0.78 | 0.63 | -32.1 | 31.4 | 5 |
| 2018 | 145 | 37.2% | -0.373 | -1.055 | -0.046% | 0.81 | 0.48 | -54.1 | 56.9 | 8 |
| 2019 | 146 | 39.7% | -0.349 | -1.063 | -0.022% | 0.76 | 0.50 | -51.0 | 57.5 | 7 |
| 2020 | 138 | 42.8% | -0.226 | -1.025 | -0.033% | 0.85 | 0.64 | -31.1 | 32.6 | 8 |
| 2021 | 148 | 43.9% | -0.218 | -1.029 | -0.025% | 0.83 | 0.65 | -32.2 | 33.5 | 6 |
| 2022 | 141 | 44.7% | -0.131 | -1.019 | -0.048% | 0.96 | 0.77 | -18.4 | 22.6 | 7 |
| 2023 | 134 | 46.3% | -0.075 | -1.026 | -0.009% | 1.01 | 0.87 | -10.1 | 13.3 | 5 |
| 2024 | 134 | 41.8% | -0.268 | -1.056 | -0.019% | 0.83 | 0.60 | -35.9 | 36.0 | 8 |
| 2025 | 135 | 48.9% | -0.104 | -0.176 | 0.001% | 0.86 | 0.82 | -14.1 | 25.3 | 6 |
| 2026 | 91 | 44.0% | -0.251 | -1.037 | -0.031% | 0.75 | 0.59 | -22.9 | 23.8 | 7 |

- exits: {'stop': 1139, 'partial+be': 390, 'partial+target': 386, 'time': 85, 'partial+time': 74}
- trades resolved by the pessimistic same-bar assumption: 47 (2.3%)
- mean 1-minute bars held: 58.8
- trades per session, where at least one was taken: 1: 1,978, 2: 48

## The other symbols — reported separately, never pooled into SPY

These are not evidence about the subject. They are the same model on other instruments, judged against the same bar, so a reader can see whether the subject's result is peculiar to it.

### QQQ — **FAIL**

| slice | n | hit | mean R | median R | mean % | payoff | PF | total R | maxDD R | max losing run |
|---|---|---|---|---|---|---|---|---|---|---|
| all | 1974 | 45.4% | -0.190 | -1.024 | -0.018% | 0.83 | 0.69 | -375.2 | 381.0 | 16 |
| in-sample 2012-01-01..2022-12-31 | 1501 | 44.0% | -0.224 | -1.028 | -0.028% | 0.82 | 0.65 | -336.4 | 335.9 | 16 |
| out-of-sample 2023-01-01..2026-08-28 | 473 | 49.9% | -0.082 | -0.083 | 0.013% | 0.85 | 0.85 | -38.8 | 46.1 | 8 |

| gate | bar | observed | |
|---|---|---|---|
| G1 sample size (this symbol alone) | IS>=500, OOS>=150 | IS=1501, OOS=473 | PASS |
| G2 expectancy after costs (mean net R) | IS>=+0.10, OOS>=+0.05 | IS=-0.224, OOS=-0.082 | FAIL |
| G3 profit factor after costs | IS>=1.20, OOS>=1.10 | IS=0.65, OOS=0.85 | FAIL |
| G4 winners first going >=0.75R against | <=40% | 17.2% | PASS |
| G5 mean net R > 0 in both regimes (in-sample) | both > 0 | bear (SPY < 50dma)=-0.066 (n=437), bull (SPY > 50dma)=-0.286 (n=1033) | FAIL |

### IWM — **FAIL**

| slice | n | hit | mean R | median R | mean % | payoff | PF | total R | maxDD R | max losing run |
|---|---|---|---|---|---|---|---|---|---|---|
| all | 2069 | 46.5% | -0.163 | -1.021 | -0.023% | 0.83 | 0.72 | -336.9 | 336.9 | 10 |
| in-sample 2012-01-01..2022-12-31 | 1572 | 47.5% | -0.149 | -1.018 | -0.019% | 0.82 | 0.74 | -233.5 | 245.0 | 10 |
| out-of-sample 2023-01-01..2026-08-28 | 497 | 43.7% | -0.208 | -1.026 | -0.035% | 0.85 | 0.66 | -103.5 | 106.4 | 8 |

| gate | bar | observed | |
|---|---|---|---|
| G1 sample size (this symbol alone) | IS>=500, OOS>=150 | IS=1572, OOS=497 | PASS |
| G2 expectancy after costs (mean net R) | IS>=+0.10, OOS>=+0.05 | IS=-0.149, OOS=-0.208 | FAIL |
| G3 profit factor after costs | IS>=1.20, OOS>=1.10 | IS=0.74, OOS=0.66 | FAIL |
| G4 winners first going >=0.75R against | <=40% | 13.8% | PASS |
| G5 mean net R > 0 in both regimes (in-sample) | both > 0 | bear (SPY < 50dma)=-0.098 (n=459), bull (SPY > 50dma)=-0.167 (n=1093) | FAIL |

## Where the days went

Every session the model looked at and the rule that ended it.

`triggers` counts BARS, not days: once price is beyond the range on the trend side, every later 5-minute close that session counts again. `signals` is the number of trades. `signals_no_target_level` is a SUBSET of `signals` — a trade with no price target, not a skip.

| outcome | SPY | QQQ | IWM |
|---|---|---|---|
| `days_seen` | 3,680 | 3,680 | 3,680 |
| `days_no_htf_trend` | 598 | 622 | 539 |
| `days_trend_ok_no_break` | 1,049 | 1,125 | 1,110 |
| `days_trigger_but_no_signal` | 7 | 4 | 3 |
| `days_with_1_trade_direction(s)` | 1,978 | 1,884 | 1,987 |
| `days_with_2_trade_direction(s)` | 48 | 45 | 41 |
| `triggers` | 37,575 | 35,733 | 38,236 |
| `signals` | 2,074 | 1,974 | 2,069 |
| `signals_long` | 1,197 | 1,177 | 1,094 |
| `signals_short` | 877 | 797 | 975 |
| `signals_no_target_level` | 0 | 0 | 0 |
| `skip_invalid_stop` | 116 | 128 | 158 |
| `skip_no_prior_candle` | 1 | 0 | 1 |
| `bars_evaluated` | 240,220 | 239,991 | 238,603 |
| `bars_no_opening_range` | 0 | 0 | 0 |
| `bars_no_htf_trend` | 123,564 | 126,992 | 121,330 |
| `bars_no_break_on_trend_side` | 79,081 | 77,266 | 79,037 |
| `bars_direction_already_traded` | 35,384 | 33,631 | 36,008 |

Every session is booked under exactly one outcome, and the `days_*` rows below `days_seen` sum to it.

- **SPY**: 2,026 of 3,680 sessions produced at least one trade (55.1%); 598 lost to the 1-hour chart having no confirmed trend at any point; 1,049 had a trend but no 5-minute close beyond the range on that side. Orders that never became a trade: Counter()
- **QQQ**: 1,929 of 3,680 sessions produced at least one trade (52.4%); 622 lost to the 1-hour chart having no confirmed trend at any point; 1,125 had a trend but no 5-minute close beyond the range on that side. Orders that never became a trade: Counter()
- **IWM**: 2,028 of 3,680 sessions produced at least one trade (55.1%); 539 lost to the 1-hour chart having no confirmed trend at any point; 1,110 had a trend but no 5-minute close beyond the range on that side. Orders that never became a trade: Counter()

- model parameters: `{"or_minutes": 15, "entry_tf_minutes": 5, "window": [589, 944], "flatten_min": 955, "trend_timeframe_minutes": 60, "trend_pivot_n": 2, "trend_lookback": 120, "stop": "the candle BEFORE the trigger candle", "target": "fixed 2R from fill", "h1_pivot_n": 2, "h1_lookback": 120, "h1_min_touches": 2, "touch_bps": 8.0, "cluster_bps": 25.0, "managed": true, "partial_r": 1.0, "partial_fraction": 0.5, "skips": "invalid stop only"}`

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
