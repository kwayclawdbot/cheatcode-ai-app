# orb_1h_unmanaged.v1 — measured on `polygon-deep-v1`

**SPY: FAIL.** Against the bar in [`../models/orb_1h_unmanaged.v1/GATE.md`](../models/orb_1h_unmanaged.v1/GATE.md), committed at `d8e592b` before this evaluation existed. one change: **no management** — no partial at +1R, the stop never moves.

**2,074 SPY trades, 2012-01-11 → 2026-08-28** — 1,580 in-sample and 494 in the held-back window.
**Before costs the model made -0.013R a trade against the matched coin flip's -0.013R; paired trade for trade the gap is +0.002R (95%: -0.073 to +0.076, n=2,068).**
**After costs the average trade returned -0.224R and the MIDDLE trade -1.039R.** Realised stop width: median 41.9¢, mean 61.1¢. Cost drag 0.210R.

Run 2026-08-29T21:27:19+00:00 at `d8e592b`. Snapshot `polygon-deep-v1`, commission $0.005/share/side, slippage 1.0bp on market and stop fills.

## Gross versus the matched control — read this before anything else

ENGINE-1's decisive finding, restated by ENGINE-4: **every model this programme has measured was at or below a coin flip BEFORE costs.** A model that cannot beat a random entry on free trades cannot be rescued by a management rule, a target choice or a stop reading, so this table is computed first and read first. The control takes the same symbol, the same days, the same decision minutes, the same stop distances AND the same target distances, runs them through the same managed runner, and flips only the direction. Anything the model earns over it, it earned by knowing which way to point.

| symbol | run | n | gross mean R | gross median R | net mean R | net median R | hit | PF (net) |
|---|---|---|---|---|---|---|---|---|
| SPY | `orb_1h_unmanaged.v1` | 2,074 | -0.013 | -1.000 | -0.224 | -1.039 | 41.4% | 0.65 |
| SPY | `null_coinflip.v1.matched` | 2,072 | -0.013 | -1.000 | -0.231 | -1.035 | 41.9% | 0.65 |
| QQQ | `orb_1h_unmanaged.v1` | 1,975 | -0.030 | -1.000 | -0.212 | -1.025 | 43.0% | 0.66 |
| QQQ | `null_coinflip.v1.matched` | 1,975 | +0.017 | -1.000 | -0.172 | -1.019 | 43.7% | 0.72 |
| IWM | `orb_1h_unmanaged.v1` | 2,069 | -0.021 | -0.459 | -0.185 | -0.599 | 45.6% | 0.68 |
| IWM | `null_coinflip.v1.matched` | 2,069 | -0.018 | -0.203 | -0.182 | -0.322 | 46.4% | 0.68 |

Paired trade by trade on the same symbol, day and minute, **gross of costs** — did knowing which way to point pay for itself?

| symbol | window | pairs | model − control, gross mean R | 95% interval | reading |
|---|---|---|---|---|---|
| SPY | all | 2,068 | +0.002 | -0.073 to +0.076 | contains zero — nothing measurable |
| SPY | in-sample | 1,576 | -0.054 | -0.139 to +0.032 | contains zero — nothing measurable |
| SPY | out-of-sample | 492 | +0.179 | +0.025 to +0.334 | **excludes zero in the model's favour** |
| QQQ | all | 1,970 | -0.049 | -0.123 to +0.026 | contains zero — nothing measurable |
| QQQ | in-sample | 1,498 | -0.085 | -0.172 to +0.002 | contains zero — nothing measurable |
| QQQ | out-of-sample | 472 | +0.066 | -0.076 to +0.208 | contains zero — nothing measurable |
| IWM | all | 2,063 | -0.003 | -0.068 to +0.061 | contains zero — nothing measurable |
| IWM | in-sample | 1,568 | +0.026 | -0.047 to +0.099 | contains zero — nothing measurable |
| IWM | out-of-sample | 495 | -0.096 | -0.233 to +0.041 | contains zero — nothing measurable |

### The lane was pre-authorised to stop here, and what it did instead

The gate committed at `d8e592b` says: if the primary model is not better than this control gross, report that plainly and stop, rather than running every variant to completion. **It is not better than the control gross.** The point estimate is at or below zero and every interval contains zero.

The four variants were nevertheless run to completion, and the reason is stated rather than left to be assumed: on this cache a full variant takes about ten seconds, so completing the set cost minutes of machine time and no judgement. What the pre-authorisation was protecting against — spending the lane's attention hunting for a variant that looks good — did not happen: **no variant was added, no threshold was moved, and no parameter was changed after a number was seen.** The three variants that follow the primary were all pre-registered in the same commit as the primary, and each carries exactly one change.

What the completed set buys is the two comparisons the brief owes regardless of the verdict — the stop reading, and whether the management rule pays — and both are measured below on the same trades rather than argued.

## In plain language

**Did it work?** No. It missed G2, G3, G5 of the five gates that were written down before it ran.

**The subtraction that decides everything.** A setup only survives if what it earns is bigger than what it costs to trade. Here is that sum, on SPY, per share.

| per share, average SPY trade | this model |
|---|---|
| what the setup earned, before costs | -0.83¢ |
| what it paid to get in and out | -6.43¢ |
| **what was left, on the average trade** | **-7.26¢** |
| what was left, on the MIDDLE trade | -13.6¢ |
| median money risked per trade | 41.9¢ |
| mean money risked per trade | 61.1¢ |
| average share price | $334 |

Across all 2,074 SPY trades the model made $-150.50 per share in total; the best three trades contributed $20.70 of that, leaving $-171.19 for the other 2,071. **Read the middle trade beside the average.**

**How sure are we?**

- **SPY.** Held-back window: 494 trades averaging -0.070R, middle trade -1.029R, honest range -0.209R to +0.070R. In-sample: 1,580 trades averaging -0.273R, middle trade -1.042R, range -0.335R to -0.211R.
- **QQQ.** Held-back window: 473 trades averaging -0.053R, middle trade -0.479R, honest range -0.176R to +0.070R. In-sample: 1,502 trades averaging -0.262R, middle trade -1.028R, range -0.323R to -0.200R.
- **IWM.** Held-back window: 497 trades averaging -0.243R, middle trade -1.026R, honest range -0.344R to -0.143R. In-sample: 1,572 trades averaging -0.167R, middle trade -0.219R, range -0.234R to -0.100R.

**One R is one unit of the money you agreed to lose if the trade goes wrong** — here, the distance from the entry to whichever 5-minute candle's extreme this variant stops behind. +0.10R means the average trade made a tenth of what it risked. The bar was +0.10R in-sample and +0.05R out-of-sample, after costs.

**These are models seven through ten.** `orb_reclaim.v1`, `sweep_displacement_fvg.v1`, `orb_htf_structural.v1`, `orb_mtf.v1`, `orb_simple_1h.v1` and `orb_simple_4h.v1` were all measured on this programme's data; five failed and one was inconclusive. These four are run as a set, which is four more chances for one of them to look good by luck. **Out-of-sample is the verdict and it was read once.** A variant that passes while the primary fails is a lead, not a result.

**What would change the answer?**

- **Cost drag, which ENGINE-4 established is `cost per share ÷ stop distance`.** This variant's realised drag is 0.210R (95%: 0.185 to 0.234) — 21.0% of the money risked on every trade. The stop width sets that hurdle, not the instrument. See the stop-reading section for both readings side by side.
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
| SPY | 2,072 | 0.146% | 41.9¢ | 61.1¢ | $334 | **0.210R** | 0.185 to 0.234 |
| QQQ | 1,970 | 0.203% | 35.7¢ | 65.9¢ | $248 | **0.175R** | 0.163 to 0.186 |
| IWM | 2,066 | 0.248% | 35.1¢ | 46.6¢ | $159 | **0.161R** | 0.142 to 0.179 |

For comparison, from earlier phases: `orb_reclaim.v1` ≈0.09R, `orb_htf_structural.v1` 0.144R, `orb_mtf.v1` 0.122R on the 32-name basket; `orb_simple_1h.v1` 0.265R on SPY with a trigger-candle stop.

## The gate — evaluated on SPY — **FAIL**

| gate | | bar | observed | |
|---|---|---|---|---|
| G1 | sample size (this symbol alone) | IS>=500, OOS>=150 | IS=1580, OOS=494 | **PASS** |
| G2 | expectancy after costs (mean net R) | IS>=+0.10, OOS>=+0.05 | IS=-0.273, OOS=-0.070 | **FAIL** |
| G3 | profit factor after costs | IS>=1.20, OOS>=1.10 | IS=0.58, OOS=0.88 | **FAIL** |
| G4 | winners first going >=0.75R against | <=40% | 15.7% | **PASS** |
| G5 | mean net R > 0 in both regimes (in-sample) | both > 0 | bear (SPY < 50dma)=-0.113 (n=458), bull (SPY > 50dma)=-0.336 (n=1096) | **FAIL** |

## SPY, in full

| slice | n | hit | mean R | median R | mean % | payoff | PF | total R | maxDD R | max losing run |
|---|---|---|---|---|---|---|---|---|---|---|
| all | 2074 | 41.4% | -0.224 | -1.039 | -0.024% | 0.92 | 0.65 | -465.5 | 472.1 | 13 |
| in-sample 2012-01-01..2022-12-31 | 1580 | 40.3% | -0.273 | -1.042 | -0.029% | 0.87 | 0.58 | -431.2 | 435.3 | 13 |
| out-of-sample 2023-01-01..2026-08-28 | 494 | 45.1% | -0.070 | -1.029 | -0.011% | 1.07 | 0.88 | -34.4 | 45.7 | 8 |

**Maximum adverse excursion — All SPY trades.** How far a trade travelled the wrong way before it resolved. Distribution, not mean.

- MAE deciles (R): 0.15 | 0.29 | 0.49 | 0.80 | 1.00 | 1.04 | 1.09 | 1.17 | 1.36
- all trades reaching that far against: >=0.25R 82.4% · >=0.5R 69.6% · >=0.75R 61.8% · >=1.0R 54.1%
- **winners** that first went that far against: >=0.25R 61.8% · >=0.5R 32.6% · >=0.75R 14.9% · >=1.0R 0.0%

**Maximum adverse excursion — SPY, held-back window.** How far a trade travelled the wrong way before it resolved. Distribution, not mean.

- MAE deciles (R): 0.13 | 0.24 | 0.42 | 0.67 | 1.00 | 1.04 | 1.10 | 1.17 | 1.39
- all trades reaching that far against: >=0.25R 78.7% · >=0.5R 66.8% · >=0.75R 58.1% · >=1.0R 51.4%
- **winners** that first went that far against: >=0.25R 56.5% · >=0.5R 30.5% · >=0.75R 12.6% · >=1.0R 0.0%

By regime (in-sample), then side and year:

| slice | n | hit | mean R | median R | mean % | payoff | PF | total R | maxDD R | max losing run |
|---|---|---|---|---|---|---|---|---|---|---|
| bear (SPY < 50dma) | 458 | 46.5% | -0.113 | -0.535 | -0.035% | 0.92 | 0.80 | -51.6 | 51.4 | 9 |
| bull (SPY > 50dma) | 1096 | 38.0% | -0.336 | -1.068 | -0.026% | 0.84 | 0.52 | -367.8 | 372.2 | 13 |
| long | 1197 | 40.1% | -0.219 | -1.057 | -0.021% | 1.00 | 0.67 | -262.2 | 289.9 | 9 |
| short | 877 | 43.2% | -0.232 | -1.024 | -0.029% | 0.81 | 0.62 | -203.3 | 203.2 | 12 |
| 2012 | 156 | 38.5% | -0.255 | -1.065 | -0.015% | 0.97 | 0.60 | -39.8 | 46.9 | 8 |
| 2013 | 147 | 38.8% | -0.353 | -1.079 | -0.035% | 0.78 | 0.50 | -51.8 | 53.2 | 7 |
| 2014 | 143 | 42.0% | -0.327 | -1.043 | -0.028% | 0.66 | 0.48 | -46.8 | 46.9 | 8 |
| 2015 | 145 | 46.2% | -0.136 | -0.075 | -0.005% | 0.88 | 0.76 | -19.8 | 28.7 | 9 |
| 2016 | 137 | 38.7% | -0.211 | -1.034 | -0.028% | 1.06 | 0.67 | -28.8 | 31.5 | 7 |
| 2017 | 134 | 39.6% | -0.308 | -1.087 | -0.017% | 0.87 | 0.57 | -41.3 | 45.5 | 8 |
| 2018 | 145 | 38.6% | -0.347 | -1.056 | -0.033% | 0.81 | 0.51 | -50.4 | 49.5 | 8 |
| 2019 | 146 | 32.2% | -0.486 | -1.078 | -0.035% | 0.80 | 0.38 | -71.0 | 76.7 | 13 |
| 2020 | 138 | 34.8% | -0.316 | -1.031 | -0.082% | 1.02 | 0.54 | -43.6 | 44.4 | 12 |
| 2021 | 148 | 48.0% | -0.122 | -0.095 | 0.001% | 0.85 | 0.79 | -18.1 | 29.6 | 5 |
| 2022 | 141 | 45.4% | -0.141 | -0.641 | -0.040% | 0.90 | 0.74 | -19.9 | 27.5 | 9 |
| 2023 | 134 | 47.8% | -0.084 | -0.539 | -0.009% | 0.93 | 0.85 | -11.2 | 17.1 | 5 |
| 2024 | 134 | 41.8% | -0.056 | -1.054 | -0.013% | 1.27 | 0.91 | -7.5 | 16.4 | 8 |
| 2025 | 135 | 46.7% | -0.118 | -0.070 | -0.012% | 0.91 | 0.80 | -15.9 | 22.4 | 7 |
| 2026 | 91 | 44.0% | 0.004 | -1.037 | -0.011% | 1.28 | 1.01 | 0.3 | 16.1 | 8 |

- exits: {'target': 760, 'stop': 1122, 'time': 192}
- trades resolved by the pessimistic same-bar assumption: 5 (0.2%)
- mean 1-minute bars held: 51.5
- trades per session, where at least one was taken: 1: 1,978, 2: 48

## The other symbols — reported separately, never pooled into SPY

These are not evidence about the subject. They are the same model on other instruments, judged against the same bar, so a reader can see whether the subject's result is peculiar to it.

### QQQ — **FAIL**

| slice | n | hit | mean R | median R | mean % | payoff | PF | total R | maxDD R | max losing run |
|---|---|---|---|---|---|---|---|---|---|---|
| all | 1975 | 43.0% | -0.212 | -1.025 | -0.025% | 0.87 | 0.66 | -417.9 | 424.3 | 12 |
| in-sample 2012-01-01..2022-12-31 | 1502 | 41.7% | -0.262 | -1.028 | -0.033% | 0.82 | 0.59 | -392.9 | 393.6 | 12 |
| out-of-sample 2023-01-01..2026-08-28 | 473 | 47.1% | -0.053 | -0.479 | 0.003% | 1.01 | 0.91 | -25.0 | 34.8 | 8 |

| gate | bar | observed | |
|---|---|---|---|
| G1 sample size (this symbol alone) | IS>=500, OOS>=150 | IS=1502, OOS=473 | PASS |
| G2 expectancy after costs (mean net R) | IS>=+0.10, OOS>=+0.05 | IS=-0.262, OOS=-0.053 | FAIL |
| G3 profit factor after costs | IS>=1.20, OOS>=1.10 | IS=0.59, OOS=0.91 | FAIL |
| G4 winners first going >=0.75R against | <=40% | 11.8% | PASS |
| G5 mean net R > 0 in both regimes (in-sample) | both > 0 | bear (SPY < 50dma)=-0.054 (n=438), bull (SPY > 50dma)=-0.335 (n=1033) | FAIL |

### IWM — **FAIL**

| slice | n | hit | mean R | median R | mean % | payoff | PF | total R | maxDD R | max losing run |
|---|---|---|---|---|---|---|---|---|---|---|
| all | 2069 | 45.6% | -0.185 | -0.599 | -0.023% | 0.81 | 0.68 | -383.2 | 383.0 | 10 |
| in-sample 2012-01-01..2022-12-31 | 1572 | 46.3% | -0.167 | -0.219 | -0.017% | 0.82 | 0.71 | -262.3 | 261.2 | 10 |
| out-of-sample 2023-01-01..2026-08-28 | 497 | 43.3% | -0.243 | -1.026 | -0.043% | 0.78 | 0.60 | -120.9 | 120.9 | 10 |

| gate | bar | observed | |
|---|---|---|---|
| G1 sample size (this symbol alone) | IS>=500, OOS>=150 | IS=1572, OOS=497 | PASS |
| G2 expectancy after costs (mean net R) | IS>=+0.10, OOS>=+0.05 | IS=-0.167, OOS=-0.243 | FAIL |
| G3 profit factor after costs | IS>=1.20, OOS>=1.10 | IS=0.71, OOS=0.60 | FAIL |
| G4 winners first going >=0.75R against | <=40% | 9.1% | PASS |
| G5 mean net R > 0 in both regimes (in-sample) | both > 0 | bear (SPY < 50dma)=-0.125 (n=459), bull (SPY > 50dma)=-0.181 (n=1093) | FAIL |

## Where the days went

Every session the model looked at and the rule that ended it.

`triggers` counts BARS, not days: once price is beyond the range on the trend side, every later 5-minute close that session counts again. `signals` is the number of trades. `signals_no_target_level` is a SUBSET of `signals` — a trade with no price target, not a skip.

| outcome | SPY | QQQ | IWM |
|---|---|---|---|
| `days_seen` | 3,680 | 3,680 | 3,680 |
| `days_no_htf_trend` | 598 | 622 | 539 |
| `days_trend_ok_no_break` | 1,049 | 1,125 | 1,110 |
| `days_trigger_but_no_signal` | 7 | 4 | 3 |
| `days_with_1_trade_direction(s)` | 1,978 | 1,883 | 1,987 |
| `days_with_2_trade_direction(s)` | 48 | 46 | 41 |
| `triggers` | 39,378 | 38,526 | 42,493 |
| `signals` | 2,074 | 1,975 | 2,069 |
| `signals_long` | 1,197 | 1,177 | 1,094 |
| `signals_short` | 877 | 798 | 975 |
| `signals_no_target_level` | 354 | 368 | 349 |
| `skip_invalid_stop` | 116 | 128 | 158 |
| `skip_no_prior_candle` | 1 | 0 | 1 |
| `bars_evaluated` | 243,288 | 244,687 | 245,292 |
| `bars_no_opening_range` | 0 | 0 | 0 |
| `bars_no_htf_trend` | 124,233 | 128,136 | 122,646 |
| `bars_no_break_on_trend_side` | 79,677 | 78,025 | 80,153 |
| `bars_direction_already_traded` | 37,187 | 36,423 | 40,265 |

Every session is booked under exactly one outcome, and the `days_*` rows below `days_seen` sum to it.

- **SPY**: 2,026 of 3,680 sessions produced at least one trade (55.1%); 598 lost to the 1-hour chart having no confirmed trend at any point; 1,049 had a trend but no 5-minute close beyond the range on that side. Orders that never became a trade: Counter()
- **QQQ**: 1,929 of 3,680 sessions produced at least one trade (52.4%); 622 lost to the 1-hour chart having no confirmed trend at any point; 1,125 had a trend but no 5-minute close beyond the range on that side. Orders that never became a trade: Counter()
- **IWM**: 2,028 of 3,680 sessions produced at least one trade (55.1%); 539 lost to the 1-hour chart having no confirmed trend at any point; 1,110 had a trend but no 5-minute close beyond the range on that side. Orders that never became a trade: Counter()

- model parameters: `{"or_minutes": 15, "entry_tf_minutes": 5, "window": [589, 944], "flatten_min": 955, "trend_timeframe_minutes": 60, "trend_pivot_n": 2, "trend_lookback": 120, "stop": "the candle BEFORE the trigger candle", "target": "nearest 1h pivot / session reference level", "h1_pivot_n": 2, "h1_lookback": 120, "h1_min_touches": 2, "touch_bps": 8.0, "cluster_bps": 25.0, "managed": false, "partial_r": null, "partial_fraction": null, "skips": "invalid stop only"}`

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
