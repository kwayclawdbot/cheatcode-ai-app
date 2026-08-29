# orb_1h_managed_2r.v1 — measured on `polygon-v1`

**BASKET(32): FAIL.** Against the bar in [`../models/orb_1h_managed_2r.v1/GATE.md`](../models/orb_1h_managed_2r.v1/GATE.md), committed at `d8e592b` before this evaluation existed. one change: a fixed **2R** target instead of the 1-hour level.

**11,591 BASKET(32) trades, 2023-09-11 → 2026-08-28** — 9,041 in-sample and 2,550 in the held-back window.
**Before costs the model made -0.012R a trade against the matched coin flip's -0.023R; paired trade for trade the gap is +0.012R (95%: -0.013 to +0.038, n=11,560).**
**After costs the average trade returned -0.170R and the MIDDLE trade -0.793R.** Realised stop width: median 63.0¢, mean 111.1¢. Cost drag 0.153R.

Run 2026-08-29T21:27:21+00:00 at `d8e592b`. Snapshot `polygon-v1`, commission $0.005/share/side, slippage 1.0bp on market and stop fills.

## Gross versus the matched control — read this before anything else

ENGINE-1's decisive finding, restated by ENGINE-4: **every model this programme has measured was at or below a coin flip BEFORE costs.** A model that cannot beat a random entry on free trades cannot be rescued by a management rule, a target choice or a stop reading, so this table is computed first and read first. The control takes the same symbol, the same days, the same decision minutes, the same stop distances AND the same target distances, runs them through the same managed runner, and flips only the direction. Anything the model earns over it, it earned by knowing which way to point.

| symbol | run | n | gross mean R | gross median R | net mean R | net median R | hit | PF (net) |
|---|---|---|---|---|---|---|---|---|
| BASKET(32) | `orb_1h_managed_2r.v1` | 11,591 | -0.012 | +0.000 | -0.170 | -0.793 | 47.0% | 0.71 |
| BASKET(32) | `null_coinflip.v1.matched` | 11,581 | -0.023 | -0.046 | -0.173 | -0.857 | 46.8% | 0.71 |

Paired trade by trade on the same symbol, day and minute, **gross of costs** — did knowing which way to point pay for itself?

| symbol | window | pairs | model − control, gross mean R | 95% interval | reading |
|---|---|---|---|---|---|
| BASKET(32) | all | 11,560 | +0.012 | -0.013 to +0.038 | contains zero — nothing measurable |
| BASKET(32) | in-sample | 9,017 | +0.003 | -0.025 to +0.032 | contains zero — nothing measurable |
| BASKET(32) | out-of-sample | 2,543 | +0.045 | -0.009 to +0.098 | contains zero — nothing measurable |

### The lane was pre-authorised to stop here, and what it did instead

The gate committed at `d8e592b` says: if the primary model is not better than this control gross, report that plainly and stop, rather than running every variant to completion. **It is not better than the control gross.** The point estimate is at or below zero and every interval contains zero.

The four variants were nevertheless run to completion, and the reason is stated rather than left to be assumed: on this cache a full variant takes about ten seconds, so completing the set cost minutes of machine time and no judgement. What the pre-authorisation was protecting against — spending the lane's attention hunting for a variant that looks good — did not happen: **no variant was added, no threshold was moved, and no parameter was changed after a number was seen.** The three variants that follow the primary were all pre-registered in the same commit as the primary, and each carries exactly one change.

What the completed set buys is the two comparisons the brief owes regardless of the verdict — the stop reading, and whether the management rule pays — and both are measured below on the same trades rather than argued.

## In plain language

**Did it work?** No. It missed G2, G3, G5 of the five gates that were written down before it ran.

**The subtraction that decides everything.** A setup only survives if what it earns is bigger than what it costs to trade. Here is that sum, on BASKET(32), per share.

| per share, average BASKET(32) trade | this model |
|---|---|
| what the setup earned, before costs | +0.54¢ |
| what it paid to get in and out | -4.98¢ |
| **what was left, on the average trade** | **-4.45¢** |
| what was left, on the MIDDLE trade | -6.2¢ |
| median money risked per trade | 63.0¢ |
| mean money risked per trade | 111.1¢ |
| average share price | $260 |

Across all 11,591 BASKET(32) trades the model made $-515.55 per share in total; the best three trades contributed $80.83 of that, leaving $-596.39 for the other 11,588. **Read the middle trade beside the average.**

**How sure are we?**

- **BASKET(32).** Held-back window: 2,550 trades averaging -0.114R, middle trade -0.185R, honest range -0.156R to -0.072R. In-sample: 9,041 trades averaging -0.186R, middle trade -1.008R, range -0.220R to -0.152R.

**One R is one unit of the money you agreed to lose if the trade goes wrong** — here, the distance from the entry to whichever 5-minute candle's extreme this variant stops behind. +0.10R means the average trade made a tenth of what it risked. The bar was +0.10R in-sample and +0.05R out-of-sample, after costs.

**These are models seven through ten.** `orb_reclaim.v1`, `sweep_displacement_fvg.v1`, `orb_htf_structural.v1`, `orb_mtf.v1`, `orb_simple_1h.v1` and `orb_simple_4h.v1` were all measured on this programme's data; five failed and one was inconclusive. These four are run as a set, which is four more chances for one of them to look good by luck. **Out-of-sample is the verdict and it was read once.** A variant that passes while the primary fails is a lead, not a result.

**What would change the answer?**

- **Cost drag, which ENGINE-4 established is `cost per share ÷ stop distance`.** This variant's realised drag is 0.153R (95%: 0.132 to 0.173) — 15.3% of the money risked on every trade. The stop width sets that hurdle, not the instrument. See the stop-reading section for both readings side by side.
- **The stop distance.** The median trade risks 63.0¢ on a $260 share — 0.243% of price.
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
| BASKET(32) | 11,571 | 0.335% | 63.0¢ | 111.1¢ | $260 | **0.153R** | 0.132 to 0.173 |

For comparison, from earlier phases: `orb_reclaim.v1` ≈0.09R, `orb_htf_structural.v1` 0.144R, `orb_mtf.v1` 0.122R on the 32-name basket; `orb_simple_1h.v1` 0.265R on SPY with a trigger-candle stop.

## The gate — evaluated on BASKET(32) — **FAIL**

| gate | | bar | observed | |
|---|---|---|---|---|
| G1 | sample size | IS>=400, OOS>=100 | IS=9041, OOS=2550 | **PASS** |
| G2 | expectancy after costs (mean net R) | IS>=+0.10, OOS>=+0.05 | IS=-0.186, OOS=-0.114 | **FAIL** |
| G3 | profit factor after costs | IS>=1.20, OOS>=1.10 | IS=0.70, OOS=0.79 | **FAIL** |
| G4 | winners first going >=0.75R against | <=40% | 14.9% | **PASS** |
| G5 | mean net R > 0 in both regimes (in-sample) | both > 0 | bear (SPY < 50dma)=-0.074 (n=1510), bull (SPY > 50dma)=-0.211 (n=6749) | **FAIL** |

## BASKET(32), in full

| slice | n | hit | mean R | median R | mean % | payoff | PF | total R | maxDD R | max losing run |
|---|---|---|---|---|---|---|---|---|---|---|
| all | 11591 | 47.0% | -0.170 | -0.793 | -0.018% | 0.81 | 0.71 | -1971.3 | 1984.1 | 12 |
| in-sample 2023-09-01..2025-12-31 | 9041 | 46.5% | -0.186 | -1.008 | -0.022% | 0.80 | 0.70 | -1680.7 | 1685.9 | 13 |
| out-of-sample 2026-01-01..2026-08-28 | 2550 | 48.9% | -0.114 | -0.185 | -0.006% | 0.83 | 0.79 | -290.7 | 298.7 | 8 |

**Maximum adverse excursion — All BASKET(32) trades.** How far a trade travelled the wrong way before it resolved. Distribution, not mean.

- MAE deciles (R): 0.16 | 0.30 | 0.48 | 0.70 | 1.00 | 1.02 | 1.06 | 1.12 | 1.26
- all trades reaching that far against: >=0.25R 83.5% · >=0.5R 69.1% · >=0.75R 58.3% · >=1.0R 50.1%
- **winners** that first went that far against: >=0.25R 65.2% · >=0.5R 35.3% · >=0.75R 14.7% · >=1.0R 0.5%

**Maximum adverse excursion — BASKET(32), held-back window.** How far a trade travelled the wrong way before it resolved. Distribution, not mean.

- MAE deciles (R): 0.15 | 0.29 | 0.45 | 0.67 | 0.94 | 1.02 | 1.06 | 1.11 | 1.25
- all trades reaching that far against: >=0.25R 82.2% · >=0.5R 67.5% · >=0.75R 56.2% · >=1.0R 48.1%
- **winners** that first went that far against: >=0.25R 63.9% · >=0.5R 34.7% · >=0.75R 14.0% · >=1.0R 0.6%

By regime (in-sample), then side and year:

| slice | n | hit | mean R | median R | mean % | payoff | PF | total R | maxDD R | max losing run |
|---|---|---|---|---|---|---|---|---|---|---|
| bear (SPY < 50dma) | 1510 | 50.6% | -0.074 | 0.156 | 0.015% | 0.84 | 0.86 | -111.9 | 142.2 | 8 |
| bull (SPY > 50dma) | 6749 | 45.4% | -0.211 | -1.012 | -0.027% | 0.80 | 0.66 | -1425.9 | 1428.9 | 12 |
| long | 6291 | 47.0% | -0.177 | -0.874 | -0.024% | 0.79 | 0.70 | -1110.6 | 1117.9 | 17 |
| short | 5300 | 47.1% | -0.162 | -0.740 | -0.011% | 0.82 | 0.73 | -860.7 | 868.3 | 14 |
| 2023 | 1307 | 47.7% | -0.187 | -0.861 | -0.031% | 0.77 | 0.70 | -244.3 | 252.0 | 9 |
| 2024 | 3861 | 45.6% | -0.186 | -1.012 | -0.018% | 0.83 | 0.69 | -719.3 | 728.2 | 12 |
| 2025 | 3873 | 47.0% | -0.185 | -0.788 | -0.022% | 0.78 | 0.70 | -717.1 | 728.5 | 11 |
| 2026 | 2550 | 48.9% | -0.114 | -0.185 | -0.006% | 0.83 | 0.79 | -290.7 | 298.7 | 8 |

- exits: {'time': 651, 'stop': 5779, 'partial+target': 2246, 'partial+be': 2372, 'partial+time': 543}
- trades resolved by the pessimistic same-bar assumption: 321 (2.8%)
- mean 1-minute bars held: 69.3
- trades per session, where at least one was taken: 1: 11,283, 2: 154


## Where the days went

Every session the model looked at and the rule that ended it.

`triggers` counts BARS, not days: once price is beyond the range on the trend side, every later 5-minute close that session counts again. `signals` is the number of trades. `signals_no_target_level` is a SUBSET of `signals` — a trade with no price target, not a skip.

| outcome | BASKET(32) |
|---|---|
| `days_seen` | 23,840 |
| `days_no_htf_trend` | 3,320 |
| `days_trend_ok_no_break` | 9,055 |
| `days_trigger_but_no_signal` | 28 |
| `days_with_1_trade_direction(s)` | 11,283 |
| `days_with_2_trade_direction(s)` | 154 |
| `triggers` | 196,765 |
| `signals` | 11,591 |
| `signals_long` | 6,291 |
| `signals_short` | 5,300 |
| `signals_no_target_level` | 0 |
| `skip_invalid_stop` | 934 |
| `skip_no_prior_candle` | 0 |
| `bars_evaluated` | 1,549,131 |
| `bars_no_opening_range` | 0 |
| `bars_no_htf_trend` | 773,147 |
| `bars_no_break_on_trend_side` | 579,219 |
| `bars_direction_already_traded` | 184,240 |

Every session is booked under exactly one outcome, and the `days_*` rows below `days_seen` sum to it.

- **BASKET(32)**: 11,437 of 23,840 sessions produced at least one trade (48.0%); 3,320 lost to the 1-hour chart having no confirmed trend at any point; 9,055 had a trend but no 5-minute close beyond the range on that side. Orders that never became a trade: Counter()

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
- **The 32-name basket is a separate result on a separate snapshot.** `polygon-v1` runs 2023-09-01 to 2026-08-28 with ENGINE-1's windows and pooled floors. It is not evidence about SPY and no number here is pooled with the deep snapshot. The names were chosen because they are liquid TODAY, which is a survivorship choice and is stated in every report of this programme.
