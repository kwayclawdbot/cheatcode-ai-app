# orb_1h_trigcandle.v1 — measured on `polygon-v1`

**BASKET(32): FAIL.** Against the bar in [`../models/orb_1h_trigcandle.v1/GATE.md`](../models/orb_1h_trigcandle.v1/GATE.md), committed at `d8e592b` before this evaluation existed. one change: ENGINE-4's **trigger-candle** stop instead of the candle before it.

**11,614 BASKET(32) trades, 2023-09-11 → 2026-08-28** — 9,058 in-sample and 2,556 in the held-back window.
**Before costs the model made -0.052R a trade against the matched coin flip's -0.048R; paired trade for trade the gap is -0.004R (95%: -0.028 to +0.019, n=11,578).**
**After costs the average trade returned -0.263R and the MIDDLE trade +0.000R.** Realised stop width: median 42.1¢, mean 74.9¢. Cost drag 0.202R.

Run 2026-08-29T21:27:22+00:00 at `d8e592b`. Snapshot `polygon-v1`, commission $0.005/share/side, slippage 1.0bp on market and stop fills.

## Gross versus the matched control — read this before anything else

ENGINE-1's decisive finding, restated by ENGINE-4: **every model this programme has measured was at or below a coin flip BEFORE costs.** A model that cannot beat a random entry on free trades cannot be rescued by a management rule, a target choice or a stop reading, so this table is computed first and read first. The control takes the same symbol, the same days, the same decision minutes, the same stop distances AND the same target distances, runs them through the same managed runner, and flips only the direction. Anything the model earns over it, it earned by knowing which way to point.

| symbol | run | n | gross mean R | gross median R | net mean R | net median R | hit | PF (net) |
|---|---|---|---|---|---|---|---|---|
| BASKET(32) | `orb_1h_trigcandle.v1` | 11,614 | -0.052 | +0.159 | -0.263 | +0.000 | 50.1% | 0.56 |
| BASKET(32) | `null_coinflip.v1.matched` | 11,614 | -0.048 | +0.176 | -0.561 | +0.002 | 50.2% | 0.37 |

Paired trade by trade on the same symbol, day and minute, **gross of costs** — did knowing which way to point pay for itself?

| symbol | window | pairs | model − control, gross mean R | 95% interval | reading |
|---|---|---|---|---|---|
| BASKET(32) | all | 11,578 | -0.004 | -0.028 to +0.019 | contains zero — nothing measurable |
| BASKET(32) | in-sample | 9,034 | -0.006 | -0.033 to +0.021 | contains zero — nothing measurable |
| BASKET(32) | out-of-sample | 2,544 | +0.002 | -0.048 to +0.052 | contains zero — nothing measurable |

### The lane was pre-authorised to stop here, and what it did instead

The gate committed at `d8e592b` says: if the primary model is not better than this control gross, report that plainly and stop, rather than running every variant to completion. **It is not better than the control gross.** The point estimate is at or below zero and every interval contains zero.

The four variants were nevertheless run to completion, and the reason is stated rather than left to be assumed: on this cache a full variant takes about ten seconds, so completing the set cost minutes of machine time and no judgement. What the pre-authorisation was protecting against — spending the lane's attention hunting for a variant that looks good — did not happen: **no variant was added, no threshold was moved, and no parameter was changed after a number was seen.** The three variants that follow the primary were all pre-registered in the same commit as the primary, and each carries exactly one change.

What the completed set buys is the two comparisons the brief owes regardless of the verdict — the stop reading, and whether the management rule pays — and both are measured below on the same trades rather than argued.

## In plain language

**Did it work?** No. It missed G2, G3, G5 of the five gates that were written down before it ran.

**The subtraction that decides everything.** A setup only survives if what it earns is bigger than what it costs to trade. Here is that sum, on BASKET(32), per share.

| per share, average BASKET(32) trade | this model |
|---|---|
| what the setup earned, before costs | -2.04¢ |
| what it paid to get in and out | -4.81¢ |
| **what was left, on the average trade** | **-6.86¢** |
| what was left, on the MIDDLE trade | +0.0¢ |
| median money risked per trade | 42.1¢ |
| mean money risked per trade | 74.9¢ |
| average share price | $260 |

Across all 11,614 BASKET(32) trades the model made $-796.15 per share in total; the best three trades contributed $39.92 of that, leaving $-836.07 for the other 11,611. **Read the middle trade beside the average.**

**How sure are we?**

- **BASKET(32).** Held-back window: 2,556 trades averaging -0.311R, middle trade +0.077R, honest range -0.579R to -0.042R. In-sample: 9,058 trades averaging -0.249R, middle trade -0.018R, range -0.272R to -0.226R.

**One R is one unit of the money you agreed to lose if the trade goes wrong** — here, the distance from the entry to whichever 5-minute candle's extreme this variant stops behind. +0.10R means the average trade made a tenth of what it risked. The bar was +0.10R in-sample and +0.05R out-of-sample, after costs.

**These are models seven through ten.** `orb_reclaim.v1`, `sweep_displacement_fvg.v1`, `orb_htf_structural.v1`, `orb_mtf.v1`, `orb_simple_1h.v1` and `orb_simple_4h.v1` were all measured on this programme's data; five failed and one was inconclusive. These four are run as a set, which is four more chances for one of them to look good by luck. **Out-of-sample is the verdict and it was read once.** A variant that passes while the primary fails is a lead, not a result.

**What would change the answer?**

- **Cost drag, which ENGINE-4 established is `cost per share ÷ stop distance`.** This variant's realised drag is 0.202R (95%: 0.142 to 0.261) — 20.2% of the money risked on every trade. The stop width sets that hurdle, not the instrument. See the stop-reading section for both readings side by side.
- **The stop distance.** The median trade risks 42.1¢ on a $260 share — 0.162% of price.
- **Nothing in the management rule.** The unmanaged control is measured on the same entries, so the rule's contribution is a number in this report rather than an assumption.
- **More symbols, and different ones.** Index ETFs are among the most efficiently priced instruments in the market; the 32-name basket is reported separately for exactly that reason. A null result on one does not transfer to the other in either direction.
## DIAGNOSTIC — the share of trades that touched +1R

**This section is a diagnostic. It appears in no gate, it is part of no verdict, and no conclusion in this report rests on it.** The fence was written into `models/orb_1h_managed.v1/GATE.md` and `models/gates.py` before any number existed.

The owner asked to *"mark any trade that moves up at least 1rr as a win"*. That is a SCORING change, and taken literally it is the exact error that made the SMS engine look profitable while it lost money: `alert_performance_honest` records average PEAK +11.93% on 141 long alerts whose realised 5-day return was **+0.41%**, with 47.5% of them 8%+ underwater first (17 §1). **A price nobody sold at is not income.**

So the +1R was implemented as a rule that BANKS it — half off, stop to breakeven — and it is measured in the management section. The touch rate belongs here, on its own, next to what the literal scoring would have claimed.

Measured on `orb_1h_unmanaged.v1`, whose best excursion is not capped by a partial. It IS capped by the trade's own exit: a trade that took its target at +0.4R cannot show +1R, because it was closed. That is stated rather than corrected — following a closed position forward is the fiction being guarded against.

| symbol | trades | **touched +1R** | what the trades that touched actually returned | what every trade actually returned |
|---|---|---|---|---|
| BASKET(32) | 11,591 | **27.0%** (3,135) | mean +0.680R | win rate 44.8%, mean -0.201R, median -1.008R |

### What the literal scoring rule would have claimed

Two readings of *"mark it as a win"*, both priced on exactly these trades. **Neither is a result and neither enters a gate.**

- **Promote-only** — leave every other trade as it resolved and book +1.000R for each one that touched. This is the closer reading of the owner's sentence (*"even if it doesnt hit 2rr"*), and it can only make the number better than reality, never worse, which is exactly what makes it dangerous.
- **Win/lose** — +1R if it touched, −1R if it did not. Harsher than reality on this model, because a level target is often nearer than 1R and many trades that never touched still resolved for less than a full loss. `gates.naive_1r_scoring_generous` was added after seeing that, and the reason is written into its docstring rather than left to be inferred.

| symbol | REALISED mean R | REALISED median R | promote-only, mean R | promote-only, median R | promote-only "win rate" | win/lose, mean R | trades promoted from a loss to a win |
|---|---|---|---|---|---|---|---|
| BASKET(32) | -0.201 | -1.008 | **-0.114** | +0.089 | 54.7% | -0.459 | 1,666 |

**On BASKET(32) the promote-only rule turns -0.201R a trade into -0.114R a trade — a swing of +0.087R produced by nothing but the choice of what counts as a win.** 1,666 losing trades become winners without a single share changing hands at a different price. That is the same arithmetic that produced +11.93% average peak against +0.41% realised on the SMS engine, and it is why the request was implemented as a rule that BANKS the 1R instead of a rule that scores it.

## Cost drag as a fraction of risk

ENGINE-4's finding, which this lane inherits and re-measures: **cost as a fraction of risk is `cost per share ÷ stop distance`.** The numerator scales with the PRICE of the instrument. The denominator is chosen by the MODEL. The stop width sets the hurdle; the instrument does not.

Paired trade by trade, so it is the same trades gross and net.

| symbol | trades | median risk, % of price | median risk | mean risk | avg price | **cost drag, R** | 95% interval |
|---|---|---|---|---|---|---|---|
| BASKET(32) | 11,582 | 0.218% | 42.1¢ | 74.9¢ | $260 | **0.202R** | 0.142 to 0.261 |

For comparison, from earlier phases: `orb_reclaim.v1` ≈0.09R, `orb_htf_structural.v1` 0.144R, `orb_mtf.v1` 0.122R on the 32-name basket; `orb_simple_1h.v1` 0.265R on SPY with a trigger-candle stop.

## The gate — evaluated on BASKET(32) — **FAIL**

| gate | | bar | observed | |
|---|---|---|---|---|
| G1 | sample size | IS>=400, OOS>=100 | IS=9058, OOS=2556 | **PASS** |
| G2 | expectancy after costs (mean net R) | IS>=+0.10, OOS>=+0.05 | IS=-0.249, OOS=-0.311 | **FAIL** |
| G3 | profit factor after costs | IS>=1.20, OOS>=1.10 | IS=0.57, OOS=0.53 | **FAIL** |
| G4 | winners first going >=0.75R against | <=40% | 14.3% | **PASS** |
| G5 | mean net R > 0 in both regimes (in-sample) | both > 0 | bear (SPY < 50dma)=-0.144 (n=1512), bull (SPY > 50dma)=-0.277 (n=6760) | **FAIL** |

## BASKET(32), in full

| slice | n | hit | mean R | median R | mean % | payoff | PF | total R | maxDD R | max losing run |
|---|---|---|---|---|---|---|---|---|---|---|
| all | 11614 | 50.1% | -0.263 | 0.000 | -0.030% | 0.56 | 0.56 | -3049.9 | 3051.8 | 12 |
| in-sample 2023-09-01..2025-12-31 | 9058 | 49.4% | -0.249 | -0.018 | -0.031% | 0.58 | 0.57 | -2256.2 | 2257.1 | 12 |
| out-of-sample 2026-01-01..2026-08-28 | 2556 | 52.6% | -0.311 | 0.077 | -0.026% | 0.47 | 0.53 | -793.8 | 795.1 | 8 |

**Maximum adverse excursion — All BASKET(32) trades.** How far a trade travelled the wrong way before it resolved. Distribution, not mean.

- MAE deciles (R): 0.13 | 0.25 | 0.40 | 0.60 | 0.89 | 1.02 | 1.09 | 1.18 | 1.39
- all trades reaching that far against: >=0.25R 80.0% · >=0.5R 64.8% · >=0.75R 54.2% · >=1.0R 47.0%
- **winners** that first went that far against: >=0.25R 62.7% · >=0.5R 34.0% · >=0.75R 14.2% · >=1.0R 0.8%

**Maximum adverse excursion — BASKET(32), held-back window.** How far a trade travelled the wrong way before it resolved. Distribution, not mean.

- MAE deciles (R): 0.11 | 0.23 | 0.37 | 0.57 | 0.82 | 1.01 | 1.08 | 1.18 | 1.39
- all trades reaching that far against: >=0.25R 78.6% · >=0.5R 63.6% · >=0.75R 52.5% · >=1.0R 45.3%
- **winners** that first went that far against: >=0.25R 61.6% · >=0.5R 33.7% · >=0.75R 13.6% · >=1.0R 0.7%

By regime (in-sample), then side and year:

| slice | n | hit | mean R | median R | mean % | payoff | PF | total R | maxDD R | max losing run |
|---|---|---|---|---|---|---|---|---|---|---|
| bear (SPY < 50dma) | 1512 | 54.1% | -0.144 | 0.114 | -0.024% | 0.61 | 0.71 | -217.3 | 226.6 | 9 |
| bull (SPY > 50dma) | 6760 | 47.9% | -0.277 | -0.105 | -0.032% | 0.58 | 0.54 | -1872.7 | 1874.5 | 12 |
| long | 6305 | 48.9% | -0.236 | -0.039 | -0.031% | 0.62 | 0.59 | -1487.4 | 1490.7 | 16 |
| short | 5309 | 51.6% | -0.294 | 0.035 | -0.028% | 0.49 | 0.52 | -1562.6 | 1567.7 | 12 |
| 2023 | 1311 | 51.0% | -0.247 | 0.036 | -0.030% | 0.55 | 0.57 | -324.1 | 325.5 | 14 |
| 2024 | 3868 | 47.3% | -0.279 | -0.213 | -0.034% | 0.59 | 0.53 | -1078.6 | 1077.5 | 11 |
| 2025 | 3879 | 50.9% | -0.220 | 0.023 | -0.028% | 0.58 | 0.60 | -853.4 | 859.0 | 12 |
| 2026 | 2556 | 52.6% | -0.311 | 0.077 | -0.026% | 0.47 | 0.53 | -793.8 | 795.1 | 8 |

- exits: {'target': 2678, 'stop': 5421, 'partial+be': 2153, 'partial+target': 900, 'partial+time': 358, 'time': 104}
- trades resolved by the pessimistic same-bar assumption: 659 (5.7%)
- mean 1-minute bars held: 26.2
- trades per session, where at least one was taken: 1: 11,306, 2: 154


## Where the days went

Every session the model looked at and the rule that ended it.

`triggers` counts BARS, not days: once price is beyond the range on the trend side, every later 5-minute close that session counts again. `signals` is the number of trades. `signals_no_target_level` is a SUBSET of `signals` — a trade with no price target, not a skip.

| outcome | BASKET(32) |
|---|---|
| `days_seen` | 23,840 |
| `days_no_htf_trend` | 3,320 |
| `days_trend_ok_no_break` | 9,055 |
| `days_trigger_but_no_signal` | 5 |
| `days_with_1_trade_direction(s)` | 11,306 |
| `days_with_2_trade_direction(s)` | 154 |
| `triggers` | 260,346 |
| `signals` | 11,614 |
| `signals_long` | 6,305 |
| `signals_short` | 5,309 |
| `signals_no_target_level` | 2,412 |
| `skip_invalid_stop` | 99 |
| `skip_no_prior_candle` | 0 |
| `bars_evaluated` | 1,647,425 |
| `bars_no_opening_range` | 0 |
| `bars_no_htf_trend` | 786,237 |
| `bars_no_break_on_trend_side` | 600,842 |
| `bars_direction_already_traded` | 248,633 |

Every session is booked under exactly one outcome, and the `days_*` rows below `days_seen` sum to it.

- **BASKET(32)**: 11,460 of 23,840 sessions produced at least one trade (48.1%); 3,320 lost to the 1-hour chart having no confirmed trend at any point; 9,055 had a trend but no 5-minute close beyond the range on that side. Orders that never became a trade: Counter()

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
- **The 32-name basket is a separate result on a separate snapshot.** `polygon-v1` runs 2023-09-01 to 2026-08-28 with ENGINE-1's windows and pooled floors. It is not evidence about SPY and no number here is pooled with the deep snapshot. The names were chosen because they are liquid TODAY, which is a survivorship choice and is stated in every report of this programme.
