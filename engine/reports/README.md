# engine/ — what was measured, and what happened

**Ten models have now been measured against bars written down before each test
was run. Nine failed and one came back inconclusive.** None ships. Nothing here
touches the app, and no alert has been produced.

That is the intended kind of outcome. It cost a week; the alternative — the one
the existing SMS engine took — costs a paying customer.

| phase | model | verdict |
|---|---|---|
| ENGINE-1 | [`orb_reclaim.v1`](orb_reclaim.v1.polygon-v1.md) | FAIL |
| ENGINE-1 | [`sweep_displacement_fvg.v1`](sweep_displacement_fvg.v1.polygon-v1.md) | FAIL |
| ENGINE-2 | [`orb_htf_structural.v1`](orb_htf_structural.v1.polygon-v1.md) | FAIL — but the first to beat its control before costs |
| ENGINE-3 | [`orb_mtf.v1`](orb_mtf.v1.polygon-v1.md) — Exit A, day trade | INCONCLUSIVE (sample) |
| ENGINE-3 | [`orb_mtf.v1`](orb_mtf.v1.polygon-v1.md) — Exit B, swing | INCONCLUSIVE (sample) |
| ENGINE-4 | [`orb_simple_1h.v1`](orb_simple_1h.v1.polygon-deep-v1.md) — SPY, 2,081 trades | FAIL |
| ENGINE-4 | [`orb_simple_4h.v1`](orb_simple_4h.v1.polygon-deep-v1.md) — SPY, 1,547 trades | FAIL |
| ENGINE-5 | [`orb_1h_managed.v1`](orb_1h_managed.v1.polygon-deep-v1.md) — SPY, 2,074 trades · [basket, 11,591](orb_1h_managed.v1.polygon-v1.md) | FAIL |
| ENGINE-5 | [`orb_1h_managed_2r.v1`](orb_1h_managed_2r.v1.polygon-deep-v1.md) — fixed 2R target | FAIL |
| ENGINE-5 | [`orb_1h_trigcandle.v1`](orb_1h_trigcandle.v1.polygon-deep-v1.md) — ENGINE-4's stop reading | FAIL |
| ENGINE-5 | [`orb_1h_unmanaged.v1`](orb_1h_unmanaged.v1.polygon-deep-v1.md) — no 1R partial | FAIL |

Read [ENGINE-2's report](orb_htf_structural.v1.polygon-v1.md) for the finding the
whole family turns on: the setup earns about 4.6 cents a share before costs and
pays about 5.6 cents to trade, and no choice of stop placement changes that
subtraction. Read [ENGINE-3's](orb_mtf.v1.polygon-v1.md) for what happened when
the stop and target were moved onto the 1-hour and 4-hour charts to make the move
bigger: they barely moved at all, because four stops in five landed on a
prior-day or overnight level that the 5-minute version was already using.

---

## ENGINE-1

## What was tested, over what data

| | |
|---|---|
| snapshot | `polygon-v1` — 32 symbols, 15,113,095 one-minute bars |
| range | 2023-09-01 → 2026-08-28, **750/750 sessions on every symbol**, zero missing days, zero bars on a day the market was shut |
| in-sample | 2023-09-01 → 2025-12-31 |
| out-of-sample | 2026-01-01 → 2026-08-28, evaluated once |
| costs | $0.005/share/side commission, 1.0 bp adverse slippage on market and stop fills |
| pre-registered bar | [`../models/GATES.md`](../models/GATES.md), committed at `2b448ef`, before any result existed |

## Results

| model | trades | hit | mean net R | PF | verdict |
|---|---|---|---|---|---|
| [`orb_reclaim.v1`](orb_reclaim.v1.polygon-v1.md) | 8,066 | 29.0% | **−0.107** | 0.86 | **FAIL** (G2, G3, G5) |
| [`sweep_displacement_fvg.v1`](sweep_displacement_fvg.v1.polygon-v1.md) | 6,844 | 29.8% | **−0.116** | 0.87 | **FAIL** (G2, G3, G5) |
| [`null_coinflip.v1`](null_coinflip.v1.polygon-v1.md) — control, not a model | 23,702 | 24.9% | −0.301 | 0.63 | control |

`daily_bias_po3.v1` was not built. The brief said two well-measured models beat
three rushed ones, and the first two produced a clear enough answer that a third
variation on the same family was not the next useful thing to spend the budget on.

## The decomposition, and why it matters more than the verdict

Running the identical models with commission and slippage set to zero separates
"this has no edge" from "this has edge smaller than its frictions":

| model | gross mean R (IS / OOS) | net mean R (IS / OOS) | median risk per trade | cost as fraction of R |
|---|---|---|---|---|
| `orb_reclaim.v1` | +0.001 / +0.012 | −0.116 / −0.074 | 0.287% of price | ≈0.09 R |
| `sweep_displacement_fvg.v1` | +0.013 / +0.030 | −0.116 / −0.064 | 0.182% of price | ≈0.14 R |
| `null_coinflip.v1` (control) | +0.045 / +0.073 | −0.344 / −0.200 | 0.081% of price | ≈0.30 R |

Two things fall out of that table.

**1. The harness is straight.** A coin flip with 1:2 ATR geometry pays
approximately zero before costs (+0.045R over 23,702 trades). If the replay had
a directional bias, a lookahead leak, or a fill model that quietly paid or
charged the trader, the control would not land near zero. It does. So the
negative results below belong to the models, not to the instrument.

**2. Neither model beat the coin flip, gross.** `orb_reclaim.v1` returned +0.001R
gross in-sample across 6,398 trades. `sweep_displacement_fvg.v1` returned
+0.013R. The control returned +0.045R. On this data, over three years and 32
liquid names, the structural signal in both models is statistically
indistinguishable from nothing — and *slightly worse* than a random entry with
the same risk geometry.

Both models are shaped correctly in one respect the old engine was not: their
losers are cut at 1R and their winners pay 2.1x, so the MAE profile is healthy
(**G4 passed for both** — only 18.5% and 16.5% of winners first travelled 0.75R
against, versus the SMS engine's 47.5% of alerts going 8%+ underwater). They
just do not pick direction better than chance.

## The finding that is worth more than either model

Median risk per trade was 0.29% of price for `orb_reclaim` and 0.18% for
`sweep_displacement_fvg`. At those stop distances, a $0.01/share round trip plus
2 bp of slippage costs **9–14% of the risk on every trade**.

That sets a floor for the whole day-trade family: an intraday model with
structural stops of this size needs roughly **+0.15R of genuine gross edge just
to break even**, before it earns anything. The tighter the structural stop, the
higher that hurdle. Any future day model should be measured gross against the
coin-flip control first; if it cannot clear +0.15R gross, the net number is
already decided and the rest of the work is wasted.

## Files

- `<model>.v1.polygon-v1.md` — full report: gate table, MAE distribution, splits
  by regime, session, side, year and symbol, mechanics, caveats
- `<model>.v1.polygon-v1.trades.csv.gz` — every trade, one row each
- `<model>.v1.polygon-v1.equity.csv` — cumulative net R
- `*.gross.*` — the same run with costs set to zero, diagnostic only. It is
  **not** a result: the pre-registered bar is explicitly after costs.

The null control's per-trade dump is not committed; it is deterministic from its
seed and regenerates exactly with
`.venv/bin/python run_backtest.py --model null_coinflip`.

## What this does not prove

It does not prove these setups never work. It proves that **these
implementations of them, on this universe, over this period, with these fills,
have no measurable edge** — and that shipping either one as a graded alert would
be selling a number nobody can stand behind. That is the same sentence the
architecture document wrote about the existing engine, now written about our own
first attempt, on evidence we generated ourselves.

Honest limits: three years is one broad regime with one correction inside it; 32
names chosen for today's liquidity carry survivorship the report does not
correct for; fills are modelled from OHLC and cannot see inside a bar; and each
model is one specific reading of a family that the corpus describes loosely. A
different entry inside the same family — the gap edge rather than its midpoint,
a 5-minute chart rather than a 1-minute one, a bias filter from a higher
timeframe — is a different model and would need its own pre-registered bar.


---

# ENGINE-2 — the owner's ORB, with a trend filter and a structural stop

Brief: [`docs/BUILD-BRIEF-engine-2-orb-htf-structural-stop.md`](../../docs/BUILD-BRIEF-engine-2-orb-htf-structural-stop.md).
Gate: [`../models/orb_htf_structural.v1/GATE.md`](../models/orb_htf_structural.v1/GATE.md),
committed at `b065f88`, before the evaluation ran.

`orb_htf_structural.v1` changed the two things that plausibly sank ENGINE-1's
ORB: it trades only with a confirmed daily trend, and its stop sits behind the
nearest major level rather than a fixed distance. 1,140 trades over the same 32
names and the same three years.

| | in-sample | out-of-sample |
|---|---|---|
| trades | 896 | 244 |
| mean net R | −0.113 | **+0.039** |
| profit factor | 0.85 | 1.05 |

**Verdict: FAIL.** G1 and G4 pass; G2, G3 and G5 do not. The out-of-sample
window — the one the gate says is the verdict — is the best any model in this
programme has produced, and it is still short of the +0.05R bar with an interval
(−0.232R to +0.309R) that comfortably contains zero.

Three things came out of it that are worth more than the verdict:

1. **The structural stop is NARROWER, not wider.** Median risk per trade was
   0.187% of price against ENGINE-1's 0.287%, so costs took 0.144R out of every
   trade instead of 0.09R. "The nearest major level" is usually close, because a
   liquid stock in a trend has structure just underneath it. The brief's hoped-for
   ~1% stop did not appear.
2. **Widening the stop could not have fixed it anyway.** R-multiples divide by
   the stop distance, so a wider stop shrinks the measured edge by exactly the
   factor it shrinks the cost ratio. In cents a share — the unit where the stop
   cancels — the setup earns 4.63¢ before costs and pays 5.61¢ to trade.
3. **This is the first model to beat its control before costs.** Paired trade for
   trade against a coin flip on the same days with the same stop and target, the
   model is +0.099R (95%: −0.014R to +0.212R). ENGINE-1's two models were both
   *below* their control. The direction call has something in it; it is smaller
   than the frictions, and the interval still touches zero.

Ablations, diagnostics only: removing the daily-trend filter gives 4,662 trades
at +0.044R gross against the filtered +0.063R — a hint that the filter buys
accuracy, well inside the noise. Swapping the structural stop for a range-edge
stop on an identical trade set costs 0.042R a trade, which is the direction the
owner's rule predicted and the largest single improvement either change made.

---

# ENGINE-3 — two charts must agree, and both exits measured

Brief: [`docs/BUILD-BRIEF-engine-3-orb-multi-tf.md`](../../docs/BUILD-BRIEF-engine-3-orb-multi-tf.md).
Gate: [`../models/orb_mtf.v1/GATE.md`](../models/orb_mtf.v1/GATE.md), committed
at `1021168`, before the evaluation ran.

`orb_mtf.v1` is the owner's correction to ENGINE-2, taken literally: the 1-hour
and 4-hour charts must both be in confirmed structure and must point the same
way, and the stop and target come from 1h/4h levels rather than 5-minute ones —
because ENGINE-2 proved that only a bigger move, not a wider stop, can change
the sign. One entry, two exits, measured on the same trades: flat at 15:55, or
held to target or stop for at most five sessions with overnight gaps filled at
the next session's open.

| | Exit A (15:55) | Exit B (swing) |
|---|---|---|
| trades | 448 (338 IS / 110 OOS) | the same 448 |
| mean net R, in-sample | −0.081 | −0.064 |
| mean net R, out-of-sample | +0.070 | +0.009 |
| verdict | **INCONCLUSIVE (sample)** | **INCONCLUSIVE (sample)** |

The double trend gate cut 23,904 symbol-days to 448 trades — 338 in-sample
against a pre-registered floor of 400. G1 fails on the low side, which the gate
defined in advance as inconclusive rather than failure. **Exit A's out-of-sample
+0.070R clears the +0.05R expectancy bar and this is deliberately not reported
as a pass**, because the sample rule was written down first and a 110-trade tail
whose interval runs from −0.271R to +0.410R decides nothing.

Four findings worth more than the verdict:

1. **The correction did not move the stop.** Median risk went from ENGINE-2's
   0.187% of price to 0.229% — wider, but nowhere near the 1%-ish the argument
   needed. On only **19% of trades** was the nearest level beyond entry actually
   a 1-hour or 4-hour pivot; on the other 81% it was a prior-day, premarket,
   overnight or daily level that ENGINE-2's family already contained, so the
   stop landed exactly where it landed before. The gate named this as the way
   the correction could fail quietly, before the run.
2. **The ablation agrees.** Holding the trade set fixed and swapping in
   ENGINE-2's 5-minute levels moves median risk by 0.004 percentage points and
   scores +0.024R (95%: −0.092R to +0.140R) *in favour of the 5-minute version*.
   Moving to higher-timeframe levels bought nothing measurable.
3. **The cents-per-share view and the R view now disagree in sign, and that is
   the finding.** The average trade finishes +1.53¢ ahead; the middle trade
   finishes 25¢ behind. Three trades out of 448 contributed $36.52 a share
   between them while the other 445 lost $29.67. Mean net R — the unit a
   position-sized trader actually lives in — is −0.044R. A positive average
   carried by three outliers is a fat tail, not an edge.
4. **"Close it or let it run" is nearly a no-op for this setup.** 408 of the 448
   trades are the same trade either way: the stop or the target was reached
   before 15:55. Of the 40 still live at the bell, holding helped 17 and hurt 23.
   Overnight gaps are modelled honestly — 22 trades were stopped at a session's
   opening print rather than at the stop price — and cost about 0.02R extra
   each. No trade finished worse than −2R.

The direction edge over the matched control shrank rather than grew: +0.052R
gross on Exit A (95%: −0.139R to +0.244R) against ENGINE-2's +0.099R, and it is
negative out-of-sample. Adding the second trend filter did not sharpen the
direction call; it mostly removed trades.


---

# ENGINE-4 — the owner's rule with nothing added, on fourteen years of SPY

Brief: [`docs/BUILD-BRIEF-engine-4-orb-spy.md`](../../docs/BUILD-BRIEF-engine-4-orb-spy.md).
Gates: [`../models/orb_simple_1h.v1/GATE.md`](../models/orb_simple_1h.v1/GATE.md)
and [`../models/orb_simple_4h.v1/GATE.md`](../models/orb_simple_4h.v1/GATE.md),
both committed at `a06611d`, before either evaluation ran.

ENGINE-3 produced 20 SPY trades in three years, and that was the spec's fault.
`orb_simple_*.v1` removes every skip rule — no range band, no minimum reward, no
risk cap, no risk floor, no structural level, no both-charts-must-agree — and
runs on a new, deeper snapshot. **The sample problem is solved: 2,081 SPY trades
over 14.7 years for the 1-hour variant, 1,547 for the 4-hour, from 3,680
sessions. And the answer is a clean, unambiguous failure.**

| | 1h — SPY | 4h — SPY |
|---|---|---|
| trades (in-sample / held back) | 2,081 (1,583 / 498) | 1,547 (1,132 / 415) |
| sessions producing a trade | 55.2% | 42.0% |
| mean net R, in-sample | **−0.359** | **−0.361** |
| mean net R, held back | **−0.154** | **−0.185** |
| **median** net R | −1.093 | −1.093 |
| profit factor | 0.63 | 0.61 |
| gross mean R vs matched coin flip | −0.039 vs −0.005 | −0.092 vs −0.010 |
| verdict | **FAIL** (G2, G3, G5) | **FAIL** (G2, G3, G5) |

Every single one of the fifteen calendar years is negative on SPY. There is no
slice of this that works.

Three findings worth more than the verdict:

1. **The brief's cost hypothesis came out backwards, and this is the most
   useful number in the report.** SPY's realised drag is **0.265R — 26.5% of the
   money risked on every trade** — against the 9–14% the earlier mixed baskets
   paid. Cost as a fraction of risk is `cost per share ÷ stop distance`. The
   numerator scales with the price of the instrument; the denominator is chosen
   by the model. A trigger-candle stop on SPY is about 29¢, roughly a third of
   what ENGINE-1/2/3 risked, so the fraction roughly doubles. **Trading the
   cheapest instrument in the world with a very tight stop is proportionally
   more expensive than trading an ordinary name with a wide one.** Liquidity
   does not rescue a stop that tight.
2. **The pre-registered cost model is itself proportional, and on SPY that
   overcharges.** 1.0 bp of a $770 ETF is 7.7¢ when the real spread is about a
   penny. Repricing the same trades at an absolute half-cent half-spread — a
   disclosed sensitivity, not a result — takes SPY's drag from 0.303R to 0.098R
   and its mean net R from −0.310 to −0.135. **Still nowhere near the bar.**
   Cost is a large part of the loss and is not the whole of it.
3. **Before costs the model is at or below its own coin flip.** Same days, same
   minutes, same stop distances, same 2R target, direction flipped: SPY 1h is
   −0.035R against the control (95%: −0.107 to +0.038) and SPY 4h is −0.082R
   (95%: −0.164 to +0.001). The higher-timeframe trend filter bought nothing
   measurable in either variant. On IWM's 4h held-back window the model is
   −0.203R against the control with an interval that excludes zero — measured,
   and against the filter.

The one ambiguity, recorded in both gates before the run and repeated at the top
of both reports: *"stop at the previous 5min candlestick high/low"* is
implemented as the **trigger** candle's own extreme. If the candle before it was
meant, it is a one-line change and a re-run, and it is the single most
informative variation still available — a wider stop lowers the cost fraction
and lowers the hit rate at the same time.

## The data, and why it is a separate snapshot

| | |
|---|---|
| snapshot | `polygon-deep-v1` — SPY, QQQ, IWM |
| range | 2012-01-01 → 2026-08-28, **3,685/3,685 sessions on every symbol**, zero missing, zero extra |
| bars | 7,801,725 one-minute |
| in-sample | 2012-01-01 → 2022-12-31 — never touched by this programme before |
| out-of-sample | 2023-01-01 → 2026-08-28, evaluated once |

It starts in 2012 because the Nasdaq-100 ETF traded as QQQQ until 2011-03 and
Polygon returns nothing for the ticker "QQQ" across 2005–2011; starting after
the rename buys an unspliced tape for all three. `polygon-v1` is untouched and
no report mixes them. The NYSE holiday and early-close table was extended back
to 2012 and the manifest audit finds it agrees with the tape on all 3,685 days —
the only anomaly is QQQ's 216-minute session on 2013-08-22, the Nasdaq halt,
which is real and kept.


---

## ENGINE-5 — the 1R banked instead of scored, and the stop ambiguity settled

**Four models, both snapshots, all FAIL.** SPY: 2,074 trades, 2012-01-11 →
2026-08-28. The 32-name basket: 11,591 trades, 2023-09-11 → 2026-08-28.

**Gross against the matched control, which is read first and settles it.** Same
days, same minutes, same stop distances, same target distances, same management
rule, direction flipped:

| run | pairs | model − control, gross mean R | 95% |
|---|---|---|---|
| SPY, all | 2,068 | **−0.004** | −0.058 to +0.050 |
| SPY, out-of-sample | 492 | +0.108 | −0.004 to +0.219 |
| 32-name basket, all | 11,568 | **−0.005** | −0.027 to +0.016 |
| 32-name basket, out-of-sample | 2,545 | +0.016 | −0.030 to +0.061 |

The basket interval is the tightest null this programme has produced: over
11,568 paired trades, knowing which way to point is worth −0.005R with an
interval 4.3 hundredths of an R wide. **The 1-hour trend filter buys nothing
measurable.** SPY's out-of-sample +0.108R is the one number that flirts with
significance, and after ten models an interval that just fails to exclude zero
in one window of one symbol is what luck looks like, not what edge looks like.

### Three things worth more than the verdict

**1. The stop ambiguity is settled, and the owner's reading is the better one.**
The owner said *"previous 5min h/l"* twice; ENGINE-4 used the trigger candle.
Both readings were run. The brief's assumption that the prior candle is wider is
false as a RULE — the trigger candle is the breakout bar and is often the bigger
one; SPY 2012-11-19 risks $2.11 on one reading and $0.24 on the other — but it
is true on average, and the averages are what matter:

| | stop, median | vs price | cost drag | net mean R |
|---|---|---|---|---|
| SPY, prior candle (the owner's reading) | 43.0¢ | 0.146% | **0.182R** | −0.179 |
| SPY, trigger candle (ENGINE-4's) | 31.0¢ | 0.104% | **0.240R** | −0.252 |
| basket, prior candle | 67.5¢ | 0.335% | **0.131R** | −0.167 |
| basket, trigger candle | 45.6¢ | 0.218% | **0.149R** | −0.190 |

Measured on the intersection of the two trade sets, so it is the same trades.
Paired, the prior-candle reading is worth **+0.073R** on SPY (95%: +0.040 to
+0.107 — excludes zero) and +0.023R on the basket (95%: −0.002 to +0.049).
**Use the prior candle.** ENGINE-4's law is confirmed twice over: cost drag is
`cost per share ÷ stop distance`, the wider stop is proportionally cheaper, and
1.4× the stop width buys back about a quarter of the cost drag. It does not buy
an edge — both readings still lose.

**2. The management rule makes the equity curve look transformed and changes
what it earns by nothing measurable.** Half off at +1R with the stop to
breakeven, measured against the identical trades with the rule switched off:

| | median net R | hit rate | mean net R | paired difference |
|---|---|---|---|---|
| SPY, unmanaged | −1.039 | 41.4% | −0.224 | |
| SPY, managed | **+0.003** | **50.3%** | −0.201 | +0.023 (95%: −0.006 to +0.053) |
| basket, unmanaged | −1.008 | 44.8% | −0.201 | |
| basket, managed | **+0.067** | **53.6%** | −0.191 | +0.010 (95%: −0.004 to +0.024) |

The middle trade goes from a full loss to a small win and the hit rate gains
nine points, and the mean moves by two hundredths of an R with an interval
containing zero. **Profit factor gets slightly WORSE** (0.65 → 0.63 on SPY),
because the rule caps every winner at half size. A report that led with hit rate
and median would call this a transformation. It is not one, and this is the
clearest example in the programme of why the median and the mean have to be
printed next to each other.

**3. The scoring rule the owner asked for was not implemented, and here is what
it would have bought.** *"Mark any trade that moves up at least 1rr as a win"* is
the exact error behind the SMS engine's +11.93% average peak against +0.41%
realised. **26.9%** of SPY trades touched +1R. Promoting every one of those to a
+1.000R win and leaving everything else as it resolved turns −0.201R a trade
into −0.114R on the basket, and converts **1,666 losing trades into winners
without a single share changing hands at a different price.** It is reported as
a diagnostic in its own fenced section, it enters no gate, and the fence was
written into `models/gates.py` and all four `GATE.md` files before any number
existed.

### What the four models were

Each pre-registered in `d8e592b`, before any evaluation, with one change each:
`orb_1h_managed.v1` (1-hour trend, 09:30–09:45 range, 5-minute close beyond it,
stop at the candle before the trigger, target the nearest 1-hour level, half off
at +1R, flat at 15:55); `orb_1h_managed_2r.v1` (fixed 2R target);
`orb_1h_trigcandle.v1` (ENGINE-4's stop); `orb_1h_unmanaged.v1` (no partial).
The management runner is asserted to reproduce the older runner trade for trade
when the rule is switched off, which is what makes the unmanaged control a
control.

The gate pre-authorised this lane to stop as soon as gross-versus-control came
back null. It did come back null. The set was completed anyway because a variant
costs about ten seconds on this cache — no variant was added, no threshold moved
and no parameter changed after a number was seen.
