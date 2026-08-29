# orb_1h_managed.v1 — measured on `polygon-v1`

**BASKET(32): FAIL.** Against the bar in [`../models/orb_1h_managed.v1/GATE.md`](../models/orb_1h_managed.v1/GATE.md), committed at `d8e592b` before this evaluation existed. the primary — prior-candle stop, 1-hour level target, half off at +1R.

**11,591 BASKET(32) trades, 2023-09-11 → 2026-08-28** — 9,041 in-sample and 2,550 in the held-back window.
**Before costs the model made -0.041R a trade against the matched coin flip's -0.036R; paired trade for trade the gap is -0.005R (95%: -0.027 to +0.016, n=11,568).**
**After costs the average trade returned -0.191R and the MIDDLE trade +0.067R.** Realised stop width: median 63.0¢, mean 111.1¢. Cost drag 0.144R.

Run 2026-08-29T21:27:20+00:00 at `d8e592b`. Snapshot `polygon-v1`, commission $0.005/share/side, slippage 1.0bp on market and stop fills.

## Gross versus the matched control — read this before anything else

ENGINE-1's decisive finding, restated by ENGINE-4: **every model this programme has measured was at or below a coin flip BEFORE costs.** A model that cannot beat a random entry on free trades cannot be rescued by a management rule, a target choice or a stop reading, so this table is computed first and read first. The control takes the same symbol, the same days, the same decision minutes, the same stop distances AND the same target distances, runs them through the same managed runner, and flips only the direction. Anything the model earns over it, it earned by knowing which way to point.

| symbol | run | n | gross mean R | gross median R | net mean R | net median R | hit | PF (net) |
|---|---|---|---|---|---|---|---|---|
| BASKET(32) | `orb_1h_managed.v1` | 11,591 | -0.041 | +0.156 | -0.191 | +0.067 | 53.6% | 0.63 |
| BASKET(32) | `null_coinflip.v1.matched` | 11,590 | -0.036 | +0.165 | -0.182 | +0.073 | 53.9% | 0.64 |

Paired trade by trade on the same symbol, day and minute, **gross of costs** — did knowing which way to point pay for itself?

| symbol | window | pairs | model − control, gross mean R | 95% interval | reading |
|---|---|---|---|---|---|
| BASKET(32) | all | 11,568 | -0.005 | -0.027 to +0.016 | contains zero — nothing measurable |
| BASKET(32) | in-sample | 9,023 | -0.011 | -0.036 to +0.013 | contains zero — nothing measurable |
| BASKET(32) | out-of-sample | 2,545 | +0.016 | -0.030 to +0.061 | contains zero — nothing measurable |

### The lane was pre-authorised to stop here, and what it did instead

The gate committed at `d8e592b` says: if the primary model is not better than this control gross, report that plainly and stop, rather than running every variant to completion. **It is not better than the control gross.** The point estimate is at or below zero and every interval contains zero.

The four variants were nevertheless run to completion, and the reason is stated rather than left to be assumed: on this cache a full variant takes about ten seconds, so completing the set cost minutes of machine time and no judgement. What the pre-authorisation was protecting against — spending the lane's attention hunting for a variant that looks good — did not happen: **no variant was added, no threshold was moved, and no parameter was changed after a number was seen.** The three variants that follow the primary were all pre-registered in the same commit as the primary, and each carries exactly one change.

What the completed set buys is the two comparisons the brief owes regardless of the verdict — the stop reading, and whether the management rule pays — and both are measured below on the same trades rather than argued.

## In plain language

**Did it work?** No. It missed G2, G3, G5 of the five gates that were written down before it ran.

**The subtraction that decides everything.** A setup only survives if what it earns is bigger than what it costs to trade. Here is that sum, on BASKET(32), per share.

| per share, average BASKET(32) trade | this model |
|---|---|
| what the setup earned, before costs | -2.25¢ |
| what it paid to get in and out | -4.71¢ |
| **what was left, on the average trade** | **-6.97¢** |
| what was left, on the MIDDLE trade | +2.3¢ |
| median money risked per trade | 63.0¢ |
| mean money risked per trade | 111.1¢ |
| average share price | $260 |

Across all 11,591 BASKET(32) trades the model made $-807.32 per share in total; the best three trades contributed $62.36 of that, leaving $-869.68 for the other 11,588. **Read the middle trade beside the average.**

**How sure are we?**

- **BASKET(32).** Held-back window: 2,550 trades averaging -0.134R, middle trade +0.109R, honest range -0.171R to -0.097R. In-sample: 9,041 trades averaging -0.207R, middle trade +0.057R, range -0.239R to -0.174R.

**One R is one unit of the money you agreed to lose if the trade goes wrong** — here, the distance from the entry to whichever 5-minute candle's extreme this variant stops behind. +0.10R means the average trade made a tenth of what it risked. The bar was +0.10R in-sample and +0.05R out-of-sample, after costs.

**These are models seven through ten.** `orb_reclaim.v1`, `sweep_displacement_fvg.v1`, `orb_htf_structural.v1`, `orb_mtf.v1`, `orb_simple_1h.v1` and `orb_simple_4h.v1` were all measured on this programme's data; five failed and one was inconclusive. These four are run as a set, which is four more chances for one of them to look good by luck. **Out-of-sample is the verdict and it was read once.** A variant that passes while the primary fails is a lead, not a result.

**What would change the answer?**

- **Cost drag, which ENGINE-4 established is `cost per share ÷ stop distance`.** This variant's realised drag is 0.144R (95%: 0.123 to 0.165) — 14.4% of the money risked on every trade. The stop width sets that hurdle, not the instrument. See the stop-reading section for both readings side by side.
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

## All four variants, side by side

Each is judged separately against the same bar and none borrows another's result. This table is a summary of four verdicts, not a fifth verdict.

| model | one change | trades | gross mean R | control gross | gap vs control | net mean R | **net MEDIAN R** | hit | PF | drag | verdict |
|---|---|---|---|---|---|---|---|---|---|---|---|
| `orb_1h_managed.v1` | prior-candle stop, 1-hour level target, half off at +1R | 11,591 | -0.041 | -0.036 | -0.005 | -0.191 | **+0.067** | 53.6% | 0.63 | 0.144R | **FAIL** |
| `orb_1h_managed_2r.v1` | a fixed **2R** target instead of the 1-hour level | 11,591 | -0.012 | -0.023 | +0.012 | -0.170 | **-0.793** | 47.0% | 0.71 | 0.153R | **FAIL** |
| `orb_1h_trigcandle.v1` | ENGINE-4's **trigger-candle** stop instead of the candle before it | 11,614 | -0.052 | -0.048 | -0.004 | -0.263 | **+0.000** | 50.1% | 0.56 | 0.202R | **FAIL** |
| `orb_1h_unmanaged.v1` | **no management** — no partial at +1R, the stop never moves | 11,591 | -0.032 | -0.033 | +0.001 | -0.201 | **-1.008** | 44.8% | 0.67 | 0.162R | **FAIL** |

Full reports: [`orb_1h_managed_2r.v1`](orb_1h_managed_2r.v1.polygon-v1.md) · [`orb_1h_trigcandle.v1`](orb_1h_trigcandle.v1.polygon-v1.md) · [`orb_1h_unmanaged.v1`](orb_1h_unmanaged.v1.polygon-v1.md)

## The stop reading, settled with a number

The owner has said *"previous 5min h/l"* twice. ENGINE-4 implemented it as the TRIGGER candle's own extreme and called the other reading *"the single most informative re-run available"*. Both readings are run here. Everything else about the two models is identical.

**The brief assumed the prior-candle stop is the wider of the two. As a RULE that is false, and it was falsified by a unit test before any performance number existed** (`test_neither_stop_reading_is_always_the_wider_one`). The trigger candle is the breakout bar: often large, often long-wicked, and its extreme can sit far further from the close than the quieter bar before it. SPY 2012-11-19 at 10:44 risks $2.11 on the trigger reading and $0.24 on the prior reading. What follows is the realised distribution rather than the assumption.

| symbol | reading | trades | stop, median | stop, mean | stop, IQR | % of price, median | % of price, mean | **cost drag, R** | 95% |
|---|---|---|---|---|---|---|---|---|---|
| BASKET(32) | prior candle (primary) | 11,591 | 63.0¢ | 111.1¢ | 25.0–135.0¢ | 0.335% | 0.462% | **0.144R** | 0.123 to 0.165 |
| BASKET(32) | trigger candle (ENGINE-4) | 11,614 | 42.1¢ | 74.9¢ | 16.4–91.3¢ | 0.218% | 0.311% | **0.202R** | 0.142 to 0.261 |

### The same comparison on the INTERSECTION

The two readings do not produce identical trade sets: a prior candle can sit on the wrong side of the trigger close when the 1-hour trend flips onto a range edge price has already left, which is a stop that is not a distance. Those are counted as `skip_invalid_stop` and are the reason the counts differ. So the comparison is repeated on the (symbol, day, minute) triples where BOTH readings produced a trade, which is the only version of it that is not contaminated by a different sample.

| symbol | pairs | stop width, prior | stop width, trigger | prior ÷ trigger | drag, prior | drag, trigger | net mean R, prior | net mean R, trigger | paired net difference | 95% |
|---|---|---|---|---|---|---|---|---|---|---|
| BASKET(32) | 10,917 | 67.5¢ | 45.6¢ | 1.48x | 0.131R | 0.149R | -0.167 | -0.190 | +0.023 | -0.002 to +0.049 |

**ENGINE-4's law holds and is now measured twice.** Cost as a fraction of risk is `cost per share ÷ stop distance`: the numerator is set by the instrument's price, the denominator by the model. The wider reading pays proportionally less to trade and is stopped out less often; the tighter reading pays more and is stopped out more. Neither of those is the same thing as making money, which is what the net columns above are for.

## Did the management rule pay for itself?

Half off at +1R with the stop to breakeven does two opposite things at once. It converts trades that reached +1R and then reversed from full losses into small wins. It also caps every winner at half size and puts a stop exactly where intraday noise lives, so some trades that would have reached the target become breakeven scratches instead. Which effect is bigger is arithmetic on this tape, not an opinion.

**The two runs share every entry, stop and target.** The rule is an exit rule and is asserted not to move a single trade (`test_managing_never_changes_which_trades_were_taken`), and `run_symbol_managed(manage=False)` is asserted to reproduce the older runner trade for trade. So the difference below is the rule and nothing else.

| symbol | trades | managed, mean R | managed, median R | unmanaged, mean R | unmanaged, median R | paired difference | 95% | managed hit | unmanaged hit | PF managed | PF unmanaged |
|---|---|---|---|---|---|---|---|---|---|---|---|
| BASKET(32) | 11,591 | -0.191 | +0.067 | -0.201 | -1.008 | +0.010 | -0.004 to +0.024 | 53.6% | 44.8% | 0.63 | 0.67 |

How the managed trades ended, and how often the partial was even reached:

| symbol | partial taken | partial + target | partial + breakeven | partial + 15:55 | stopped before any partial | target without a partial | 15:55 without a partial | same-bar partial-and-breakeven |
|---|---|---|---|---|---|---|---|---|
| BASKET(32) | 2,863 (24.7%) | 766 | 1,549 | 548 | 4,880 | 3,506 | 342 | 235 |

## The target: the nearest 1-hour level, or a fixed 2R

The owner named both in one sentence, so both are measured. A level target has no fixed reward: the nearest 1-hour high or key level can be a third of a stop away or four stops away, and where it lands is not under the model's control. That distribution is the first table.

| symbol | trades with a level | no level in the direction | target distance, median R | mean R | IQR | under 1R | over 2R |
|---|---|---|---|---|---|---|---|
| BASKET(32) | 9,174 | 2,417 | 0.85 | 3.53 | 0.34–2.08 | 54.8% | 25.9% |

**A target closer than 1R cannot partial at 1R** — price would have to pass through the target to reach the partial — so on those trades the management rule is inert by construction. That is a consequence of the spec, was written into the gate before the run, and is why the share under 1R is in the table.

Paired against the fixed-2R variant, on the trades both took:

| symbol | pairs | level target, mean R | median R | 2R target, mean R | median R | paired difference | 95% |
|---|---|---|---|---|---|---|---|
| BASKET(32) | 11,591 | -0.191 | +0.067 | -0.170 | -0.793 | -0.021 | -0.031 to -0.010 |

## Cost drag as a fraction of risk

ENGINE-4's finding, which this lane inherits and re-measures: **cost as a fraction of risk is `cost per share ÷ stop distance`.** The numerator scales with the PRICE of the instrument. The denominator is chosen by the MODEL. The stop width sets the hurdle; the instrument does not.

Paired trade by trade, so it is the same trades gross and net.

| symbol | trades | median risk, % of price | median risk | mean risk | avg price | **cost drag, R** | 95% interval |
|---|---|---|---|---|---|---|---|
| BASKET(32) | 11,571 | 0.335% | 63.0¢ | 111.1¢ | $260 | **0.144R** | 0.123 to 0.165 |

For comparison, from earlier phases: `orb_reclaim.v1` ≈0.09R, `orb_htf_structural.v1` 0.144R, `orb_mtf.v1` 0.122R on the 32-name basket; `orb_simple_1h.v1` 0.265R on SPY with a trigger-candle stop.

## The gate — evaluated on BASKET(32) — **FAIL**

| gate | | bar | observed | |
|---|---|---|---|---|
| G1 | sample size | IS>=400, OOS>=100 | IS=9041, OOS=2550 | **PASS** |
| G2 | expectancy after costs (mean net R) | IS>=+0.10, OOS>=+0.05 | IS=-0.207, OOS=-0.134 | **FAIL** |
| G3 | profit factor after costs | IS>=1.20, OOS>=1.10 | IS=0.61, OOS=0.71 | **FAIL** |
| G4 | winners first going >=0.75R against | <=40% | 12.0% | **PASS** |
| G5 | mean net R > 0 in both regimes (in-sample) | both > 0 | bear (SPY < 50dma)=-0.122 (n=1510), bull (SPY > 50dma)=-0.224 (n=6749) | **FAIL** |

## BASKET(32), in full

| slice | n | hit | mean R | median R | mean % | payoff | PF | total R | maxDD R | max losing run |
|---|---|---|---|---|---|---|---|---|---|---|
| all | 11591 | 53.6% | -0.191 | 0.067 | -0.031% | 0.54 | 0.63 | -2211.3 | 2220.8 | 11 |
| in-sample 2023-09-01..2025-12-31 | 9041 | 52.8% | -0.207 | 0.057 | -0.034% | 0.54 | 0.61 | -1868.8 | 1871.9 | 11 |
| out-of-sample 2026-01-01..2026-08-28 | 2550 | 56.4% | -0.134 | 0.109 | -0.020% | 0.55 | 0.71 | -342.5 | 356.1 | 8 |

**Maximum adverse excursion — All BASKET(32) trades.** How far a trade travelled the wrong way before it resolved. Distribution, not mean.

- MAE deciles (R): 0.09 | 0.19 | 0.31 | 0.48 | 0.73 | 1.00 | 1.04 | 1.10 | 1.24
- all trades reaching that far against: >=0.25R 74.3% · >=0.5R 59.2% · >=0.75R 49.4% · >=1.0R 42.3%
- **winners** that first went that far against: >=0.25R 55.4% · >=0.5R 28.4% · >=0.75R 11.8% · >=1.0R 0.4%

**Maximum adverse excursion — BASKET(32), held-back window.** How far a trade travelled the wrong way before it resolved. Distribution, not mean.

- MAE deciles (R): 0.08 | 0.17 | 0.29 | 0.45 | 0.68 | 1.00 | 1.04 | 1.09 | 1.22
- all trades reaching that far against: >=0.25R 72.8% · >=0.5R 57.6% · >=0.75R 47.3% · >=1.0R 40.2%
- **winners** that first went that far against: >=0.25R 54.3% · >=0.5R 28.4% · >=0.75R 11.3% · >=1.0R 0.5%

By regime (in-sample), then side and year:

| slice | n | hit | mean R | median R | mean % | payoff | PF | total R | maxDD R | max losing run |
|---|---|---|---|---|---|---|---|---|---|---|
| bear (SPY < 50dma) | 1510 | 57.2% | -0.122 | 0.123 | -0.018% | 0.55 | 0.73 | -183.9 | 204.7 | 8 |
| bull (SPY > 50dma) | 6749 | 51.6% | -0.224 | 0.030 | -0.035% | 0.55 | 0.59 | -1511.5 | 1514.5 | 11 |
| long | 6291 | 52.8% | -0.185 | 0.059 | -0.031% | 0.57 | 0.64 | -1163.6 | 1168.1 | 13 |
| short | 5300 | 54.6% | -0.198 | 0.073 | -0.031% | 0.51 | 0.61 | -1047.7 | 1054.8 | 12 |
| 2023 | 1307 | 54.0% | -0.224 | 0.077 | -0.038% | 0.50 | 0.59 | -292.5 | 297.5 | 9 |
| 2024 | 3861 | 51.5% | -0.208 | 0.028 | -0.029% | 0.57 | 0.61 | -803.3 | 805.4 | 9 |
| 2025 | 3873 | 53.8% | -0.200 | 0.072 | -0.037% | 0.53 | 0.62 | -773.1 | 778.8 | 11 |
| 2026 | 2550 | 56.4% | -0.134 | 0.109 | -0.020% | 0.55 | 0.71 | -342.5 | 356.1 | 8 |

- exits: {'target': 3506, 'stop': 4880, 'partial+be': 1549, 'partial+target': 766, 'time': 342, 'partial+time': 548}
- trades resolved by the pessimistic same-bar assumption: 339 (2.9%)
- mean 1-minute bars held: 44.6
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
| `triggers` | 233,690 |
| `signals` | 11,591 |
| `signals_long` | 6,291 |
| `signals_short` | 5,300 |
| `signals_no_target_level` | 2,417 |
| `skip_invalid_stop` | 934 |
| `skip_no_prior_candle` | 0 |
| `bars_evaluated` | 1,605,613 |
| `bars_no_opening_range` | 0 |
| `bars_no_htf_trend` | 783,177 |
| `bars_no_break_on_trend_side` | 588,746 |
| `bars_direction_already_traded` | 221,165 |

Every session is booked under exactly one outcome, and the `days_*` rows below `days_seen` sum to it.

- **BASKET(32)**: 11,437 of 23,840 sessions produced at least one trade (48.0%); 3,320 lost to the 1-hour chart having no confirmed trend at any point; 9,055 had a trend but no 5-minute close beyond the range on that side. Orders that never became a trade: Counter()

- model parameters: `{"or_minutes": 15, "entry_tf_minutes": 5, "window": [589, 944], "flatten_min": 955, "trend_timeframe_minutes": 60, "trend_pivot_n": 2, "trend_lookback": 120, "stop": "the candle BEFORE the trigger candle", "target": "nearest 1h pivot / session reference level", "h1_pivot_n": 2, "h1_lookback": 120, "h1_min_touches": 2, "touch_bps": 8.0, "cluster_bps": 25.0, "managed": true, "partial_r": 1.0, "partial_fraction": 0.5, "skips": "invalid stop only"}`

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
