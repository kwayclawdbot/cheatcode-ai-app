# orb_1h_managed.v1 — measured on `polygon-deep-v1`

**SPY: FAIL.** Against the bar in [`../models/orb_1h_managed.v1/GATE.md`](../models/orb_1h_managed.v1/GATE.md), committed at `d8e592b` before this evaluation existed. the primary — prior-candle stop, 1-hour level target, half off at +1R.

**2,074 SPY trades, 2012-01-11 → 2026-08-28** — 1,580 in-sample and 494 in the held-back window.
**Before costs the model made -0.008R a trade against the matched coin flip's -0.004R; paired trade for trade the gap is -0.004R (95%: -0.058 to +0.050, n=2,068).**
**After costs the average trade returned -0.201R and the MIDDLE trade +0.003R.** Realised stop width: median 41.9¢, mean 61.1¢. Cost drag 0.191R.

Run 2026-08-29T21:27:18+00:00 at `d8e592b`. Snapshot `polygon-deep-v1`, commission $0.005/share/side, slippage 1.0bp on market and stop fills.

## Gross versus the matched control — read this before anything else

ENGINE-1's decisive finding, restated by ENGINE-4: **every model this programme has measured was at or below a coin flip BEFORE costs.** A model that cannot beat a random entry on free trades cannot be rescued by a management rule, a target choice or a stop reading, so this table is computed first and read first. The control takes the same symbol, the same days, the same decision minutes, the same stop distances AND the same target distances, runs them through the same managed runner, and flips only the direction. Anything the model earns over it, it earned by knowing which way to point.

| symbol | run | n | gross mean R | gross median R | net mean R | net median R | hit | PF (net) |
|---|---|---|---|---|---|---|---|---|
| SPY | `orb_1h_managed.v1` | 2,074 | -0.008 | +0.215 | -0.201 | +0.003 | 50.3% | 0.63 |
| SPY | `null_coinflip.v1.matched` | 2,072 | -0.004 | +0.209 | -0.214 | +0.006 | 50.5% | 0.61 |
| QQQ | `orb_1h_managed.v1` | 1,975 | -0.031 | +0.145 | -0.195 | +0.025 | 51.0% | 0.63 |
| QQQ | `null_coinflip.v1.matched` | 1,975 | -0.039 | +0.174 | -0.199 | +0.032 | 51.6% | 0.61 |
| IWM | `orb_1h_managed.v1` | 2,069 | -0.027 | +0.195 | -0.171 | +0.074 | 54.2% | 0.64 |
| IWM | `null_coinflip.v1.matched` | 2,069 | -0.024 | +0.203 | -0.165 | +0.074 | 54.4% | 0.66 |

Paired trade by trade on the same symbol, day and minute, **gross of costs** — did knowing which way to point pay for itself?

| symbol | window | pairs | model − control, gross mean R | 95% interval | reading |
|---|---|---|---|---|---|
| SPY | all | 2,068 | -0.004 | -0.058 to +0.050 | contains zero — nothing measurable |
| SPY | in-sample | 1,576 | -0.039 | -0.101 to +0.023 | contains zero — nothing measurable |
| SPY | out-of-sample | 492 | +0.108 | -0.004 to +0.219 | contains zero — nothing measurable |
| QQQ | all | 1,970 | +0.007 | -0.047 to +0.060 | contains zero — nothing measurable |
| QQQ | in-sample | 1,498 | -0.005 | -0.066 to +0.056 | contains zero — nothing measurable |
| QQQ | out-of-sample | 472 | +0.044 | -0.069 to +0.156 | contains zero — nothing measurable |
| IWM | all | 2,063 | -0.003 | -0.053 to +0.047 | contains zero — nothing measurable |
| IWM | in-sample | 1,568 | +0.026 | -0.031 to +0.083 | contains zero — nothing measurable |
| IWM | out-of-sample | 495 | -0.095 | -0.200 to +0.009 | contains zero — nothing measurable |

### The lane was pre-authorised to stop here, and what it did instead

The gate committed at `d8e592b` says: if the primary model is not better than this control gross, report that plainly and stop, rather than running every variant to completion. **It is not better than the control gross.** The point estimate is at or below zero and every interval contains zero.

The four variants were nevertheless run to completion, and the reason is stated rather than left to be assumed: on this cache a full variant takes about ten seconds, so completing the set cost minutes of machine time and no judgement. What the pre-authorisation was protecting against — spending the lane's attention hunting for a variant that looks good — did not happen: **no variant was added, no threshold was moved, and no parameter was changed after a number was seen.** The three variants that follow the primary were all pre-registered in the same commit as the primary, and each carries exactly one change.

What the completed set buys is the two comparisons the brief owes regardless of the verdict — the stop reading, and whether the management rule pays — and both are measured below on the same trades rather than argued.

## In plain language

**Did it work?** No. It missed G2, G3, G5 of the five gates that were written down before it ran.

**The subtraction that decides everything.** A setup only survives if what it earns is bigger than what it costs to trade. Here is that sum, on SPY, per share.

| per share, average SPY trade | this model |
|---|---|
| what the setup earned, before costs | +0.29¢ |
| what it paid to get in and out | -6.52¢ |
| **what was left, on the average trade** | **-6.24¢** |
| what was left, on the MIDDLE trade | +0.1¢ |
| median money risked per trade | 41.9¢ |
| mean money risked per trade | 61.1¢ |
| average share price | $334 |

Across all 2,074 SPY trades the model made $-129.32 per share in total; the best three trades contributed $12.09 of that, leaving $-141.41 for the other 2,071. **Read the middle trade beside the average.**

**How sure are we?**

- **SPY.** Held-back window: 494 trades averaging -0.135R, middle trade +0.037R, honest range -0.234R to -0.036R. In-sample: 1,580 trades averaging -0.222R, middle trade -0.000R, range -0.270R to -0.173R.
- **QQQ.** Held-back window: 473 trades averaging -0.090R, middle trade +0.118R, honest range -0.181R to +0.002R. In-sample: 1,502 trades averaging -0.228R, middle trade -0.003R, range -0.277R to -0.178R.
- **IWM.** Held-back window: 497 trades averaging -0.211R, middle trade +0.016R, honest range -0.292R to -0.130R. In-sample: 1,572 trades averaging -0.158R, middle trade +0.092R, range -0.204R to -0.113R.

**One R is one unit of the money you agreed to lose if the trade goes wrong** — here, the distance from the entry to whichever 5-minute candle's extreme this variant stops behind. +0.10R means the average trade made a tenth of what it risked. The bar was +0.10R in-sample and +0.05R out-of-sample, after costs.

**These are models seven through ten.** `orb_reclaim.v1`, `sweep_displacement_fvg.v1`, `orb_htf_structural.v1`, `orb_mtf.v1`, `orb_simple_1h.v1` and `orb_simple_4h.v1` were all measured on this programme's data; five failed and one was inconclusive. These four are run as a set, which is four more chances for one of them to look good by luck. **Out-of-sample is the verdict and it was read once.** A variant that passes while the primary fails is a lead, not a result.

**What would change the answer?**

- **Cost drag, which ENGINE-4 established is `cost per share ÷ stop distance`.** This variant's realised drag is 0.191R (95%: 0.175 to 0.208) — 19.1% of the money risked on every trade. The stop width sets that hurdle, not the instrument. See the stop-reading section for both readings side by side.
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

## All four variants, side by side

Each is judged separately against the same bar and none borrows another's result. This table is a summary of four verdicts, not a fifth verdict.

| model | one change | trades | gross mean R | control gross | gap vs control | net mean R | **net MEDIAN R** | hit | PF | drag | verdict |
|---|---|---|---|---|---|---|---|---|---|---|---|
| `orb_1h_managed.v1` | prior-candle stop, 1-hour level target, half off at +1R | 2,074 | -0.008 | -0.004 | -0.004 | -0.201 | **+0.003** | 50.3% | 0.63 | 0.191R | **FAIL** |
| `orb_1h_managed_2r.v1` | a fixed **2R** target instead of the 1-hour level | 2,074 | -0.038 | -0.019 | -0.020 | -0.246 | **-1.038** | 43.0% | 0.62 | 0.206R | **FAIL** |
| `orb_1h_trigcandle.v1` | ENGINE-4's **trigger-candle** stop instead of the candle before it | 2,081 | -0.018 | -0.003 | -0.016 | -0.282 | **-1.022** | 46.9% | 0.55 | 0.257R | **FAIL** |
| `orb_1h_unmanaged.v1` | **no management** — no partial at +1R, the stop never moves | 2,074 | -0.013 | -0.013 | +0.002 | -0.224 | **-1.039** | 41.4% | 0.65 | 0.210R | **FAIL** |

Full reports: [`orb_1h_managed_2r.v1`](orb_1h_managed_2r.v1.polygon-deep-v1.md) · [`orb_1h_trigcandle.v1`](orb_1h_trigcandle.v1.polygon-deep-v1.md) · [`orb_1h_unmanaged.v1`](orb_1h_unmanaged.v1.polygon-deep-v1.md)

## The stop reading, settled with a number

The owner has said *"previous 5min h/l"* twice. ENGINE-4 implemented it as the TRIGGER candle's own extreme and called the other reading *"the single most informative re-run available"*. Both readings are run here. Everything else about the two models is identical.

**The brief assumed the prior-candle stop is the wider of the two. As a RULE that is false, and it was falsified by a unit test before any performance number existed** (`test_neither_stop_reading_is_always_the_wider_one`). The trigger candle is the breakout bar: often large, often long-wicked, and its extreme can sit far further from the close than the quieter bar before it. SPY 2012-11-19 at 10:44 risks $2.11 on the trigger reading and $0.24 on the prior reading. What follows is the realised distribution rather than the assumption.

| symbol | reading | trades | stop, median | stop, mean | stop, IQR | % of price, median | % of price, mean | **cost drag, R** | 95% |
|---|---|---|---|---|---|---|---|---|---|
| SPY | prior candle (primary) | 2,074 | 41.9¢ | 61.1¢ | 22.4–80.9¢ | 0.146% | 0.183% | **0.191R** | 0.175 to 0.208 |
| SPY | trigger candle (ENGINE-4) | 2,081 | 29.4¢ | 43.1¢ | 15.2–56.8¢ | 0.104% | 0.129% | **0.257R** | 0.236 to 0.278 |
| QQQ | prior candle (primary) | 1,975 | 35.7¢ | 65.9¢ | 15.8–89.3¢ | 0.203% | 0.247% | **0.157R** | 0.141 to 0.172 |
| QQQ | trigger candle (ENGINE-4) | 1,979 | 24.0¢ | 45.9¢ | 10.7–58.8¢ | 0.134% | 0.172% | **0.241R** | 0.218 to 0.263 |
| IWM | prior candle (primary) | 2,069 | 35.1¢ | 46.6¢ | 18.8–63.2¢ | 0.248% | 0.286% | **0.140R** | 0.127 to 0.153 |
| IWM | trigger candle (ENGINE-4) | 2,071 | 23.1¢ | 31.2¢ | 12.9–40.9¢ | 0.160% | 0.192% | **0.183R** | 0.165 to 0.201 |

### The same comparison on the INTERSECTION

The two readings do not produce identical trade sets: a prior candle can sit on the wrong side of the trigger close when the 1-hour trend flips onto a range edge price has already left, which is a stop that is not a distance. Those are counted as `skip_invalid_stop` and are the reason the counts differ. So the comparison is repeated on the (symbol, day, minute) triples where BOTH readings produced a trade, which is the only version of it that is not contaminated by a different sample.

| symbol | pairs | stop width, prior | stop width, trigger | prior ÷ trigger | drag, prior | drag, trigger | net mean R, prior | net mean R, trigger | paired net difference | 95% |
|---|---|---|---|---|---|---|---|---|---|---|
| SPY | 1,986 | 43.0¢ | 31.0¢ | 1.38x | 0.182R | 0.240R | -0.179 | -0.252 | +0.073 | +0.040 to +0.107 |
| QQQ | 1,883 | 37.0¢ | 25.8¢ | 1.43x | 0.147R | 0.219R | -0.176 | -0.263 | +0.087 | +0.055 to +0.120 |
| IWM | 1,954 | 36.2¢ | 24.4¢ | 1.48x | 0.130R | 0.162R | -0.146 | -0.204 | +0.058 | +0.026 to +0.090 |

**ENGINE-4's law holds and is now measured twice.** Cost as a fraction of risk is `cost per share ÷ stop distance`: the numerator is set by the instrument's price, the denominator by the model. The wider reading pays proportionally less to trade and is stopped out less often; the tighter reading pays more and is stopped out more. Neither of those is the same thing as making money, which is what the net columns above are for.

## Did the management rule pay for itself?

Half off at +1R with the stop to breakeven does two opposite things at once. It converts trades that reached +1R and then reversed from full losses into small wins. It also caps every winner at half size and puts a stop exactly where intraday noise lives, so some trades that would have reached the target become breakeven scratches instead. Which effect is bigger is arithmetic on this tape, not an opinion.

**The two runs share every entry, stop and target.** The rule is an exit rule and is asserted not to move a single trade (`test_managing_never_changes_which_trades_were_taken`), and `run_symbol_managed(manage=False)` is asserted to reproduce the older runner trade for trade. So the difference below is the rule and nothing else.

| symbol | trades | managed, mean R | managed, median R | unmanaged, mean R | unmanaged, median R | paired difference | 95% | managed hit | unmanaged hit | PF managed | PF unmanaged |
|---|---|---|---|---|---|---|---|---|---|---|---|
| SPY | 2,074 | -0.201 | +0.003 | -0.224 | -1.039 | +0.023 | -0.006 to +0.053 | 50.3% | 41.4% | 0.63 | 0.65 |
| QQQ | 1,975 | -0.195 | +0.025 | -0.212 | -1.025 | +0.017 | -0.011 to +0.045 | 51.0% | 43.0% | 0.63 | 0.66 |
| IWM | 2,069 | -0.171 | +0.074 | -0.185 | -0.599 | +0.014 | -0.023 to +0.051 | 54.2% | 45.6% | 0.64 | 0.68 |

How the managed trades ended, and how often the partial was even reached:

| symbol | partial taken | partial + target | partial + breakeven | partial + 15:55 | stopped before any partial | target without a partial | 15:55 without a partial | same-bar partial-and-breakeven |
|---|---|---|---|---|---|---|---|---|
| SPY | 513 (24.7%) | 178 | 247 | 88 | 947 | 557 | 57 | 34 |
| QQQ | 478 (24.2%) | 167 | 228 | 83 | 873 | 571 | 53 | 14 |
| IWM | 475 (23.0%) | 141 | 257 | 77 | 863 | 680 | 51 | 37 |

## The target: the nearest 1-hour level, or a fixed 2R

The owner named both in one sentence, so both are measured. A level target has no fixed reward: the nearest 1-hour high or key level can be a third of a stop away or four stops away, and where it lands is not under the model's control. That distribution is the first table.

| symbol | trades with a level | no level in the direction | target distance, median R | mean R | IQR | under 1R | over 2R |
|---|---|---|---|---|---|---|---|
| SPY | 1,720 | 354 | 1.04 | 1.96 | 0.43–2.12 | 48.1% | 26.6% |
| QQQ | 1,607 | 368 | 0.94 | 1.79 | 0.40–2.01 | 52.3% | 25.1% |
| IWM | 1,720 | 349 | 0.84 | 1.78 | 0.35–1.86 | 56.3% | 23.5% |

**A target closer than 1R cannot partial at 1R** — price would have to pass through the target to reach the partial — so on those trades the management rule is inert by construction. That is a consequence of the spec, was written into the gate before the run, and is why the share under 1R is in the table.

Paired against the fixed-2R variant, on the trades both took:

| symbol | pairs | level target, mean R | median R | 2R target, mean R | median R | paired difference | 95% |
|---|---|---|---|---|---|---|---|
| SPY | 2,074 | -0.201 | +0.003 | -0.246 | -1.038 | +0.044 | +0.018 to +0.071 |
| QQQ | 1,974 | -0.194 | +0.025 | -0.190 | -1.024 | -0.004 | -0.030 to +0.022 |
| IWM | 2,069 | -0.171 | +0.074 | -0.163 | -1.021 | -0.008 | -0.035 to +0.018 |

## Cost drag as a fraction of risk

ENGINE-4's finding, which this lane inherits and re-measures: **cost as a fraction of risk is `cost per share ÷ stop distance`.** The numerator scales with the PRICE of the instrument. The denominator is chosen by the MODEL. The stop width sets the hurdle; the instrument does not.

Paired trade by trade, so it is the same trades gross and net.

| symbol | trades | median risk, % of price | median risk | mean risk | avg price | **cost drag, R** | 95% interval |
|---|---|---|---|---|---|---|---|
| SPY | 2,072 | 0.146% | 41.9¢ | 61.1¢ | $334 | **0.191R** | 0.175 to 0.208 |
| QQQ | 1,970 | 0.203% | 35.7¢ | 65.9¢ | $248 | **0.157R** | 0.141 to 0.172 |
| IWM | 2,066 | 0.248% | 35.1¢ | 46.6¢ | $159 | **0.140R** | 0.127 to 0.153 |

For comparison, from earlier phases: `orb_reclaim.v1` ≈0.09R, `orb_htf_structural.v1` 0.144R, `orb_mtf.v1` 0.122R on the 32-name basket; `orb_simple_1h.v1` 0.265R on SPY with a trigger-candle stop.

## The gate — evaluated on SPY — **FAIL**

| gate | | bar | observed | |
|---|---|---|---|---|
| G1 | sample size (this symbol alone) | IS>=500, OOS>=150 | IS=1580, OOS=494 | **PASS** |
| G2 | expectancy after costs (mean net R) | IS>=+0.10, OOS>=+0.05 | IS=-0.222, OOS=-0.135 | **FAIL** |
| G3 | profit factor after costs | IS>=1.20, OOS>=1.10 | IS=0.59, OOS=0.74 | **FAIL** |
| G4 | winners first going >=0.75R against | <=40% | 17.6% | **PASS** |
| G5 | mean net R > 0 in both regimes (in-sample) | both > 0 | bear (SPY < 50dma)=-0.123 (n=458), bull (SPY > 50dma)=-0.259 (n=1096) | **FAIL** |

## SPY, in full

| slice | n | hit | mean R | median R | mean % | payoff | PF | total R | maxDD R | max losing run |
|---|---|---|---|---|---|---|---|---|---|---|
| all | 2074 | 50.3% | -0.201 | 0.003 | -0.020% | 0.62 | 0.63 | -417.1 | 417.3 | 8 |
| in-sample 2012-01-01..2022-12-31 | 1580 | 49.9% | -0.222 | -0.000 | -0.021% | 0.59 | 0.59 | -350.2 | 352.4 | 8 |
| out-of-sample 2023-01-01..2026-08-28 | 494 | 51.4% | -0.135 | 0.037 | -0.013% | 0.70 | 0.74 | -66.8 | 69.2 | 8 |

**Maximum adverse excursion — All SPY trades.** How far a trade travelled the wrong way before it resolved. Distribution, not mean.

- MAE deciles (R): 0.13 | 0.26 | 0.41 | 0.60 | 0.89 | 1.00 | 1.06 | 1.13 | 1.30
- all trades reaching that far against: >=0.25R 80.4% · >=0.5R 64.5% · >=0.75R 55.1% · >=1.0R 46.6%
- **winners** that first went that far against: >=0.25R 64.4% · >=0.5R 34.1% · >=0.75R 16.4% · >=1.0R 1.7%

**Maximum adverse excursion — SPY, held-back window.** How far a trade travelled the wrong way before it resolved. Distribution, not mean.

- MAE deciles (R): 0.13 | 0.22 | 0.35 | 0.54 | 0.83 | 1.01 | 1.07 | 1.15 | 1.34
- all trades reaching that far against: >=0.25R 77.1% · >=0.5R 62.1% · >=0.75R 52.6% · >=1.0R 45.7%
- **winners** that first went that far against: >=0.25R 58.7% · >=0.5R 29.9% · >=0.75R 12.6% · >=1.0R 0.8%

By regime (in-sample), then side and year:

| slice | n | hit | mean R | median R | mean % | payoff | PF | total R | maxDD R | max losing run |
|---|---|---|---|---|---|---|---|---|---|---|
| bear (SPY < 50dma) | 458 | 53.5% | -0.123 | 0.079 | -0.025% | 0.65 | 0.75 | -56.2 | 55.6 | 7 |
| bull (SPY > 50dma) | 1096 | 48.8% | -0.259 | -0.031 | -0.020% | 0.57 | 0.54 | -283.6 | 286.1 | 8 |
| long | 1197 | 48.9% | -0.219 | -0.034 | -0.022% | 0.64 | 0.61 | -262.7 | 267.0 | 8 |
| short | 877 | 52.2% | -0.176 | 0.057 | -0.017% | 0.60 | 0.65 | -154.4 | 154.1 | 12 |
| 2012 | 156 | 47.4% | -0.207 | -0.026 | -0.009% | 0.69 | 0.62 | -32.3 | 37.0 | 7 |
| 2013 | 147 | 47.6% | -0.337 | -1.036 | -0.031% | 0.50 | 0.46 | -49.5 | 51.0 | 7 |
| 2014 | 143 | 49.7% | -0.253 | -0.000 | -0.020% | 0.53 | 0.52 | -36.1 | 36.2 | 8 |
| 2015 | 145 | 51.7% | -0.182 | 0.046 | -0.014% | 0.59 | 0.63 | -26.3 | 29.9 | 8 |
| 2016 | 137 | 51.1% | -0.132 | 0.024 | -0.013% | 0.70 | 0.73 | -18.1 | 20.7 | 6 |
| 2017 | 134 | 52.2% | -0.207 | 0.086 | -0.011% | 0.58 | 0.63 | -27.8 | 27.9 | 4 |
| 2018 | 145 | 48.3% | -0.288 | -1.018 | -0.031% | 0.55 | 0.51 | -41.8 | 43.0 | 6 |
| 2019 | 146 | 45.2% | -0.340 | -1.038 | -0.021% | 0.56 | 0.46 | -49.6 | 53.4 | 7 |
| 2020 | 138 | 48.6% | -0.236 | -0.024 | -0.057% | 0.59 | 0.56 | -32.5 | 32.7 | 8 |
| 2021 | 148 | 55.4% | -0.126 | 0.152 | 0.002% | 0.60 | 0.74 | -18.6 | 25.2 | 5 |
| 2022 | 141 | 52.5% | -0.125 | 0.080 | -0.034% | 0.66 | 0.73 | -17.6 | 23.6 | 7 |
| 2023 | 134 | 54.5% | -0.112 | 0.140 | -0.007% | 0.65 | 0.78 | -15.0 | 17.3 | 4 |
| 2024 | 134 | 47.8% | -0.180 | -0.549 | -0.018% | 0.75 | 0.69 | -24.1 | 23.4 | 8 |
| 2025 | 135 | 52.6% | -0.128 | 0.046 | -0.012% | 0.67 | 0.74 | -17.3 | 22.7 | 6 |
| 2026 | 91 | 50.5% | -0.115 | 0.027 | -0.018% | 0.77 | 0.78 | -10.5 | 17.4 | 7 |

- exits: {'target': 557, 'stop': 947, 'partial+be': 247, 'time': 57, 'partial+target': 178, 'partial+time': 88}
- trades resolved by the pessimistic same-bar assumption: 44 (2.1%)
- mean 1-minute bars held: 44.9
- trades per session, where at least one was taken: 1: 1,978, 2: 48

## The other symbols — reported separately, never pooled into SPY

These are not evidence about the subject. They are the same model on other instruments, judged against the same bar, so a reader can see whether the subject's result is peculiar to it.

### QQQ — **FAIL**

| slice | n | hit | mean R | median R | mean % | payoff | PF | total R | maxDD R | max losing run |
|---|---|---|---|---|---|---|---|---|---|---|
| all | 1975 | 51.0% | -0.195 | 0.025 | -0.021% | 0.60 | 0.63 | -384.6 | 390.2 | 9 |
| in-sample 2012-01-01..2022-12-31 | 1502 | 49.8% | -0.228 | -0.003 | -0.029% | 0.58 | 0.58 | -342.1 | 343.1 | 9 |
| out-of-sample 2023-01-01..2026-08-28 | 473 | 55.0% | -0.090 | 0.118 | 0.003% | 0.67 | 0.81 | -42.5 | 49.5 | 8 |

| gate | bar | observed | |
|---|---|---|---|
| G1 sample size (this symbol alone) | IS>=500, OOS>=150 | IS=1502, OOS=473 | PASS |
| G2 expectancy after costs (mean net R) | IS>=+0.10, OOS>=+0.05 | IS=-0.228, OOS=-0.090 | FAIL |
| G3 profit factor after costs | IS>=1.20, OOS>=1.10 | IS=0.58, OOS=0.81 | FAIL |
| G4 winners first going >=0.75R against | <=40% | 13.4% | PASS |
| G5 mean net R > 0 in both regimes (in-sample) | both > 0 | bear (SPY < 50dma)=-0.078 (n=438), bull (SPY > 50dma)=-0.280 (n=1033) | FAIL |

### IWM — **FAIL**

| slice | n | hit | mean R | median R | mean % | payoff | PF | total R | maxDD R | max losing run |
|---|---|---|---|---|---|---|---|---|---|---|
| all | 2069 | 54.2% | -0.171 | 0.074 | -0.023% | 0.55 | 0.64 | -354.1 | 353.1 | 9 |
| in-sample 2012-01-01..2022-12-31 | 1572 | 55.1% | -0.158 | 0.092 | -0.018% | 0.54 | 0.66 | -249.1 | 249.8 | 9 |
| out-of-sample 2023-01-01..2026-08-28 | 497 | 51.3% | -0.211 | 0.016 | -0.037% | 0.56 | 0.59 | -105.0 | 106.1 | 6 |

| gate | bar | observed | |
|---|---|---|---|
| G1 sample size (this symbol alone) | IS>=500, OOS>=150 | IS=1572, OOS=497 | PASS |
| G2 expectancy after costs (mean net R) | IS>=+0.10, OOS>=+0.05 | IS=-0.158, OOS=-0.211 | FAIL |
| G3 profit factor after costs | IS>=1.20, OOS>=1.10 | IS=0.66, OOS=0.59 | FAIL |
| G4 winners first going >=0.75R against | <=40% | 10.2% | PASS |
| G5 mean net R > 0 in both regimes (in-sample) | both > 0 | bear (SPY < 50dma)=-0.129 (n=459), bull (SPY > 50dma)=-0.168 (n=1093) | FAIL |

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
| `triggers` | 41,343 | 40,654 | 45,034 |
| `signals` | 2,074 | 1,975 | 2,069 |
| `signals_long` | 1,197 | 1,177 | 1,094 |
| `signals_short` | 877 | 798 | 975 |
| `signals_no_target_level` | 354 | 368 | 349 |
| `skip_invalid_stop` | 116 | 128 | 158 |
| `skip_no_prior_candle` | 1 | 0 | 1 |
| `bars_evaluated` | 245,912 | 247,325 | 248,396 |
| `bars_no_opening_range` | 0 | 0 | 0 |
| `bars_no_htf_trend` | 124,569 | 128,385 | 122,964 |
| `bars_no_break_on_trend_side` | 80,000 | 78,286 | 80,398 |
| `bars_direction_already_traded` | 39,152 | 38,551 | 42,806 |

Every session is booked under exactly one outcome, and the `days_*` rows below `days_seen` sum to it.

- **SPY**: 2,026 of 3,680 sessions produced at least one trade (55.1%); 598 lost to the 1-hour chart having no confirmed trend at any point; 1,049 had a trend but no 5-minute close beyond the range on that side. Orders that never became a trade: Counter()
- **QQQ**: 1,929 of 3,680 sessions produced at least one trade (52.4%); 622 lost to the 1-hour chart having no confirmed trend at any point; 1,125 had a trend but no 5-minute close beyond the range on that side. Orders that never became a trade: Counter()
- **IWM**: 2,028 of 3,680 sessions produced at least one trade (55.1%); 539 lost to the 1-hour chart having no confirmed trend at any point; 1,110 had a trend but no 5-minute close beyond the range on that side. Orders that never became a trade: Counter()

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
- **Three index ETFs is not a universe.** SPY, QQQ and IWM are among the most efficiently priced instruments available. A null result here does not transfer to single names, and neither would a positive one. The 32-name `polygon-v1` basket is reported separately for that reason.
