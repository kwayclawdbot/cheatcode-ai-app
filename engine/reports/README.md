# engine/ — what was measured, and what happened

**Twenty models have now been measured against bars written down before each
test was run. Eleven failed, one came back inconclusive on both of its exits, one —
a replication of a published, peer-reviewed result — came back NOT REPRODUCED,
and four came back PARTIAL, which the gates defined in advance as not a pass.
The last four were challengers to the one component this programme has ever
measured as working, and all four lost to it.**
None ships. Nothing here touches the app, and no alert has been produced.

**Twelve lanes in, the same sentence keeps coming back: this programme has never
once measured a directional filter worth anything.** ENGINE-2 (daily structure),
ENGINE-3 (1h and 4h agreeing), ENGINE-5 (1h), ENGINE-8 (daily structure again, on
the one base that clears zero) and now ENGINE-11 (the same daily trend as a
CONTINUOUS strength, used to rank rather than to gate) have all returned nulls.
ENGINE-8's was the cleanest of them because it was aimed at a failure that had
already been located precisely and it missed anyway; ENGINE-11's is the most
complete, because it does not merely report that a filter failed — it reports the
whole curve of outcome against trend strength and finds no gradient in it.

**Read [ENGINE-6](orb_sip.v1.polygon-sip-v1.md) and
[ENGINE-7](orb_sip.v2.polygon-sip-v1.md) together if you read only one thing.**
They are the only entries in this table that were not our idea: Zarattini, Barbon
& Aziz's stocks-in-play ORB, built to their spec on a survivorship-free universe
of every US stock that traded between 2016 and 2026. ENGINE-6 used the stocks
paper's stop — 10% of the 14-day ATR — and returned −0.72R a trade, losing more
the higher the opening relative volume, which is the opposite sign to the
published claim. Its [post-mortem](orb_sip.v1.polygon-sip-v1.diagnostics.md)
shows the harness is not the reason — remove the stop and the whole thing returns
within 0.02 ATR of zero, exactly as a straight replay must — and isolates the one
parameter that decides the sign. ENGINE-7 changed that one parameter to the
companion ETF paper's reading, the opposite extreme of the opening candle, and
judged it on the years the sweep never touched. [ENGINE-10](orb_sip.v4.polygon-sip-v1.md)
then measured that same parameter a third and fourth time, from a rule the owner
supplied rather than from the sweep, and both readings landed exactly where the
sweep said they would — which makes stop width the only parameter this programme
has ever found that decides what a model earns, and it does so out of sample.

**[ENGINE-9](orb_kai_sel.v1.polygon-sip-v1.md) is the first lane to put the
company's own shipped number on the stand.** ENGINE-7 established that the
SELECTOR is what makes the stocks-in-play ORB work, so ENGINE-9 asked whether
Kai's breakout score — ported bar for bar from `cheatcode_scanner.py`, defects
included — picks a better twenty than abnormal opening volume does. It does not.
It loses to the incumbent by $73 a trade on $1,000 of risk with an interval
entirely below zero, and against ENGINE-6's random-20 coin toss it is $19 behind
with an interval that spans zero. **As a day-trade selector the score is not
distinguishable from drawing names out of a hat.** That is a good outcome for the
programme and a bad one for the alert engine, and the report says both.

**[ENGINE-11](orb_trend_str.v1.polygon-sip-v1.md) is the answer to "does the
strength of the trend matter, rather than just its direction".** It builds a
continuous daily-chart strength — distance from a 20-day EMA in ATRs, that EMA's
ten-session slope, and the twenty-day up-close share — signs it by the break
direction, and reports what happens across its ten deciles. **The curve is flat
and not monotonic**: the weakest tenth of the incumbent's trades returned +$19
per $1,000 risked and the strongest tenth −$5, and measured properly — the
stronger half of each morning's picks against the weaker half of the same morning
— the difference is +$33 with a 95% range of −$41 to +$107, which contains zero.
Re-ordering the day's forty busiest names by strength returned $22 a trade LESS
than leaving them alone (95%: −$60 to +$16, so not a measured loss, but the
evidence points the wrong way), and it did so through the mechanism that has
explained every result here: it narrowed the median stop from 164 to 145 cents
and tilted the book long, into the weaker of the two sides.

**[ENGINE-12](orb_spy.v1.polygon-deep-v1.md) answers the owner's question about
SPY, and the answer is a clean no.** The stocks-in-play strategy has never once
selected SPY — 0 trades out of 42,937 — so ENGINE-6 through ENGINE-11 are silent
about it. ENGINE-12 deletes the selection step, keeps every other rule byte for
byte (a subclass that overrides nothing but its name, with tests asserting it),
and trades SPY every session for fifteen years. It lost **$208 per $1,000
risked** across 3,445 trades and was negative in **all fifteen calendar years**,
on the owner's verdict year and on the 2012–2021 span no lane had ever read.
**The reason is the same one parameter as always, and it was written into the
gate as a disclosure trigger before the run:** the stop here is the width of the
opening five-minute candle, and SPY's is a median **0.16 of a 14-day ATR** —
against 0.72 on the stocks the strategy picks. Putting the wide stop on SPY is
not possible, because SPY does not have a wide opening range; a stock selected
for abnormal opening activity does, and that is what the selection is buying.
The knock-out rate follows exactly: 76.2% against 31.6%. So does the one
statistic that had been stable everywhere else — of the trades that ever get a
full unit of risk ahead, 78–83% finish green on stocks in play and **45.6%** on
SPY.

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
| ENGINE-6 | [`orb_sip.v1`](orb_sip.v1.polygon-sip-v1.md) — the published stocks-in-play ORB, 32,434 trades | **NOT REPRODUCED** |
| ENGINE-7 | [`orb_sip.v2`](orb_sip.v2.polygon-sip-v1.md) — the same model, stopped at the opposite extreme of the opening candle, 10,545 held-back trades | **PARTIAL** — money and the filter, but the direction call lost to a coin flip |
| ENGINE-8 | [`orb_sip.v3`](orb_sip.v3.polygon-sip-v1.md) — the same model again, with a daily-trend-agreement gate, 996 held-back trades | **PARTIAL** — and the filter did not fix the failure it was aimed at |
| ENGINE-8 | [`orb_sip.v3_15m`](orb_sip.v3.polygon-sip-v1.md) — the same gate on a 15-minute opening range, 892 held-back trades | **PARTIAL** — same three gates failed |
| ENGINE-9 | [`orb_kai_sel.v1`](orb_kai_sel.v1.polygon-sip-v1.md) — `relvol`, the incumbent selector, 3,969 held-back trades | **RELVOL HOLDS** — +$17 per $1,000 risked |
| ENGINE-9 | [`orb_kai_sel.v1`](orb_kai_sel.v1.polygon-sip-v1.md) — `kai`, Kai's own breakout score, 4,225 held-back trades | **LOST to the incumbent** — −$54 per $1,000, and not distinguishable from a coin toss |
| ENGINE-9 | [`orb_kai_sel.v1`](orb_kai_sel.v1.polygon-sip-v1.md) — `both`, the score and the volume together, 4,079 held-back trades | **LOST to the incumbent** — −$15 per $1,000, interval spans zero |
| ENGINE-10 | [`orb_sip.v4_trigger`](orb_sip.v4.polygon-sip-v1.md) — the owner's candle stop, literal reading, 3,969 held-back trades | **FAILED** — stopped out on 85.8% of trades, −$605 per $1,000 risked |
| ENGINE-10 | [`orb_sip.v4_prior`](orb_sip.v4.polygon-sip-v1.md) — the owner's candle stop, the other reading, 3,967 held-back trades | **PARTIAL** — +$15 per $1,000, indistinguishable from v2 and from zero |
| ENGINE-11 | [`orb_trend_str.v1`](orb_trend_str.v1.polygon-sip-v1.md) — `rank`, the forty busiest re-ordered by trend strength, 3,995 held-back trades | **LOST to the incumbent** — −$1 per $1,000, −$22 a trade against the baseline |
| ENGINE-11 | [`orb_trend_str.v1`](orb_trend_str.v1.polygon-sip-v1.md) — `gate_strong`, the same twenty cut at +0.20 strength, 1,265 held-back trades | **LOST to the incumbent** — +$46 per $1,000 but an interval spanning zero, and it discards winners over the four build years |
| ENGINE-11 | [`orb_trend_str.v1`](orb_trend_str.v1.polygon-sip-v1.md) — **the gradient**, across ten strength deciles | **NO GRADIENT** — +$33 a trade strong-half-minus-weak-half, 95%: −$41 to +$107 |
| ENGINE-12 | [`orb_spy.v1`](orb_spy.v1.polygon-deep-v1.md) — the working spec on SPY alone, 240 trades in the owner's verdict year | **FAILED** — −$200 per $1,000 risked |
| ENGINE-12 | [`orb_spy.v1`](orb_spy.v1.polygon-deep-v1.md) — the same, on the untouched 2012–2021 span, 2,267 trades | **FAILED** — −$236 per $1,000 risked, 0 of 15 calendar years positive |

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


---

# ENGINE-6 — the published result, replicated faithfully, and it did not come back

Brief: [`docs/BUILD-BRIEF-engine-6-orb-stocks-in-play.md`](../../docs/BUILD-BRIEF-engine-6-orb-stocks-in-play.md).
Gate: [`../models/orb_sip.v1/GATE.md`](../models/orb_sip.v1/GATE.md), committed
at `2eed597` and `3db0a28`, before any number existed.

ENGINE-1 through ENGINE-5 tested seven ORB variants and all seven failed. The
literature then gave the failure a name: Zarattini, Barbon & Aziz measured ORB
across 7,000+ US stocks over 2016–2023 and reported **29% at a 0.48 Sharpe
unfiltered** against **1,637% at a 2.81 Sharpe** restricted to the day's *stocks
in play*, with abnormal opening volume doing almost all the work. We had built
the unfiltered version seven times. **Our nulls replicated their null.**

So ENGINE-6 is not a model of ours. It is their spec, as the brief states it:
5-minute opening range, universe of price >$5 / 20-day volume >1M / ATR >$0.50,
the day's top 20 by opening relative volume measured at 09:35, entry on the
breakout in the direction of the first candle, **stop at 10% of the 14-day ATR**,
**no target — exit at the close**, 1% risk with a 4× leverage cap.

## The answer, in one line

**32,392 trades in the paper's own window, and it lost 0.72R a trade — and it
lost MORE the higher the relative volume, monotonely across ten deciles, which is
the opposite sign to the published claim.**

| | |
|---|---|
| snapshot | `polygon-sip-v1` — a third snapshot; no report mixes it with the other two |
| universe | every US ticker that traded, 2,743 grouped-daily sessions, 26.5M ticker-days, survivorship-free; 892 names a day pass the filter, 6,589 distinct over the window against the paper's 7,000+ |
| pool | top 1,000 by prior-close dollar volume — **which turned out not to bind**: 100% of the eligible universe was scored and rankable at 09:35 on the median day, 95% at the 10th percentile |
| replication window | 2016-01-01 → 2023-12-31, the paper's own |
| held back | 2024-01-01 → 2026-08-28, evaluated once |
| trades | 32,392 / 10,545 |
| verdict | **NOT REPRODUCED** (R2, R3, R4, R5) |

| arm | n | mean gross R | median gross R | mean net R | hit | PF |
|---|---|---|---|---|---|---|
| stocks in play | 32,392 | **−0.635** | −1.040 | **−0.723** | 9.2% | 0.46 |
| unfiltered control, same rules | 33,893 | −0.180 | −1.033 | −0.264 | 15.2% | 0.74 |
| matched coin flip | 26,959 | −0.694 | −1.040 | −0.782 | 9.8% | 0.43 |

## Four findings, and the third is the one to keep

**1. The harness is not the reason, and this is the first thing the brief asked
for.** Run the identical entries with the stop removed — 100× ATR, which can
essentially never be hit, so every trade runs to the close — and the model
returns **+0.017 ATR** of signed move and its coin flip **+0.011 ATR**, over
32,392 and 26,959 trades. A replay with a directional bias, a lookahead leak or a
fill model that quietly paid or charged the trader does not land within two
hundredths of an ATR of zero. It is the same certification ENGINE-1 ran, and it
gives the same answer on this snapshot.

**2. One parameter decides the sign, and it is the stop.** 10% of the 14-day ATR
is a median **12.4 cents**, 0.35% of price, and it is hit on **90.1%** of trades.
The 09:30–09:35 candle of a stock in play is a median **0.63 ATR** wide — so the
specified stop is about **16%** of the range of the very bar the trade is defined
by. It is inside the noise of its own setup. Sweeping only that number: −0.635R
at 0.10×, −0.073R at 0.25×, **+0.005R at 0.50×**, +0.012R at 1×.

**3. Abnormal opening volume carries something real, and the specified stop turns
it upside down.** At the specified stop, stocks in play are **0.456R WORSE** than
the unfiltered control. At a 0.5× stop the same comparison is **+0.018R**
(95%: +0.000 to +0.037) and at 1× **+0.017R** (95%: +0.007 to +0.028) — in the
paper's direction, with intervals that exclude zero, and about **a hundredth of
an R**. The mechanism is not subtle: the filter selects days whose true range
dwarfs the trailing ATR the stop is scaled by, so the more abnormal the day, the
more certainly the stop is noise. That is why the relative-volume deciles run
monotonely from −0.27R in the lowest to −1.25R in the highest.

**4. The direction call is worth nothing.** Paired against a coin flip on the
same symbols, days and stop distances, the model is negative at every stop width
tested, including the widest. Eight models into this programme, "which way to
point" has never once been worth a measurable amount.

## What was ruled out, and what was not

| candidate | measured | verdict |
|---|---|---|
| pool too small | 891 of a median 892 eligible names scored; picks sit at median liquidity rank 521 of 892, only 14% in the bottom fifth | **not it** |
| cost model | zero cost gives −0.553R against −0.723R net | **not it** |
| fill model | unstopped hold-to-close returns within 0.02 ATR of zero | **not it** |
| window | all eleven calendar years negative, both sides, held-back window too | **not it** |
| selection definition | the relative-volume gradient is steep and monotone — the ranking separates days powerfully, in the wrong direction at this stop | **the mechanism, not the fault** |
| **the stop reading** | the brief's own table records the companion ETF paper stopping at the **opposite extreme of the first candle** — a median 0.63 ATR here, about **6×** the 10%-of-ATR reading, and squarely where this shape stops losing | **the live candidate** |
| entry timing | the published rule may enter at the 09:35 open rather than on a breakout beyond the range | **untested — the second candidate** |

**Phase 2 did not run.** The gate pre-authorised that: the owner's variations —
15-minute range, 1-hour trend, the prior-5m stop, a 2R target, half off at 1R —
are not tested against a baseline that is not a baseline, and no parameter was
tuned to rescue the miss. The stop sweep is a diagnostic, is fenced as one in
[its own file](orb_sip.v1.polygon-sip-v1.diagnostics.md), and no verdict was
reached by way of it. A re-run at a different stop is a NEW model with a NEW
pre-registered gate, reported beside this one rather than in place of it.

## The data work, because it was most of the job

Selecting stocks in play needs broad-market opening volume, and the obvious way
to get it is also the way to manufacture a spectacular fake result: pre-filter
which symbols to download using a full day's volume and you have selected stocks
*because* they turned out busy. So:

1. **Grouped daily bars for every ticker that traded**, 2015-10 → 2026-08, one
   call a session, 2,743 files, 26.5M ticker-days, unadjusted. Unadjusted because
   on split-adjusted prices a stock that later reverse-split 1-for-10 would be
   back-promoted into a "price > $5" universe at a price it never traded at.
2. **The paper's filter as of the prior close** — SQL windows that cannot include
   the current row — plus a security-type resolution so the universe is stocks
   rather than ETFs, funds and exchange test symbols. Unknown types are KEPT, so
   the type lookup cannot reintroduce survivorship.
3. **Opening 5-minute bars for the pool**, keeping only 09:30–10:30 of each
   session. The afternoon of the day being selected for was never written to
   disk.
4. **One-minute bars only for the 105,899 symbol-days the selector picked**, after
   the selection was written to a file. The download is a consequence of the
   selection and cannot feed back into it.

The selection got the full treatment: poisoned-future and amputated-future
attacks, an explicit test that the selection is identical when the rest of the
session is deleted from disk, and a deliberately cheating selector that every
attack must catch. Two data contracts are asserted against the real cache — that
the 09:30 five-minute bar is exactly the first five one-minute bars (the entire
selection stage costs one request per symbol per half-year only because that
alignment holds), and that the eligible universe never contains the day it is
selecting for inside its own 20-day average.

Audit: 2,743 of 2,743 grouped sessions with none missing and none on a day the
market was shut; 2,679 of 2,679 sessions with opening bars; 108,078 one-minute
symbol-days, 40.8M bars, median 388 a session, none on a closed day.

**One bug was found this way, and it was live in a finished snapshot.** Polygon's
`next_url` carries the cursor and not the caller's parameters, and `adjusted`
defaults to TRUE — so every opening-bar request longer than one page came back
unadjusted for its head and split-adjusted for its tail, at the split ratio, in
a *volume* series. `tests/test_sip_data.py` compares the 09:30 five-minute bar
against the one-minute cache bar by bar and failed on AAPL 2016-04-27 at exactly
4.000×. The whole opening-bar tree was refetched and
`tests/test_sip_paginate.py` now pins the mechanism against a mock transport.
The corrected data moved 774 of 105,899 selected symbol-days and changed no
conclusion — but nobody knew that until it was refetched, and the largest
relative volume in the selection fell from 50,594× to 1,528×.

---

# ENGINE-7 — the same published model, the other published stop, judged out of sample

Brief: this lane exists because of [ENGINE-6's post-mortem](orb_sip.v1.polygon-sip-v1.diagnostics.md).
Gate: [`../models/orb_sip.v2/GATE.md`](../models/orb_sip.v2/GATE.md), committed
at `6598f47`, before any number existed.

`orb_sip.v2` is `orb_sip.v1` with **one rule changed**. The stop moves from 10%
of the 14-day ATR — a median 12.4¢ over 2016–2023, hit on 90.1% of trades, about
a sixth of the width of the very candle the trade is defined by — to **the
opposite extreme of that candle**, which is what the build brief's own table records the companion
ETF paper doing. Range, universe, selection, direction, entry, end-of-day exit,
sizing, costs and snapshot are untouched, and ENGINE-6's `selection.json.gz` is
reused byte for byte, so the two models trade the same 42,937 entries and differ
only in where the stop sits. Both were replayed in the same pass over the same
bars; v1's numbers came back identical to its own report, which is the check that
the two are comparable at all.

## The thing to read before the result

**The stop width was chosen after looking at the answer on 2016–2023.** Two
things pointed at it: the companion paper's wording, which is clean, and a
stop-width sweep the ENGINE-6 post-mortem ran on the replication window and read,
which is not. Those cannot be separated after the fact. So the windows swapped
roles before the run: **2016–2023 is CONTAMINATED and is a disclosure**, and the
verdict is the **held-back 2024-01-01 → 2026-08-28**, which no sweep touched.
H1–H5 are ENGINE-6's R1–R5, unchanged in kind and in number, moved to the harder
window. This is the held-back window's **second** use, and no correction is
applied for that. There is no third: the gate ruled out a third stop width before
the run started.

## The answer, in one line

**10,545 held-back trades. It made money and the filter beat a random selection —
but the average trade is not distinguishable from zero, and the direction call
lost to a coin flip. Verdict: PARTIAL, which the gate defined in advance as not a
pass.**

| id | gate | observed | |
|---|---|---|---|
| **H1** | ≥5,000 held-back trades | n=10,545 | PASS |
| **H2** | mean gross R > 0 and mean net R > 0 | gross **+0.0324**, net **+0.0199** | PASS |
| **H3** | direction beats a coin flip, paired, gross | **−0.1317** (95%: −0.1493 to −0.1141), n=7,322 | **FAIL** |
| **H4** | in play minus a random 20, paired by day, net | **+0.0773** (95%: +0.0410 to +0.1136), n=667 | PASS |
| **H5** | portfolio: return > 0 and Sharpe ≥ 1.0 | **+223.9%**, Sharpe **1.27**, maxDD 31.0% | PASS |

| arm, held back | n | mean gross R | median gross R | mean net R | hit | PF | stopped |
|---|---|---|---|---|---|---|---|
| stocks in play | 10,545 | +0.032 | −0.108 | **+0.020** | 45.0% | 1.05 | **31.6%** |
| random 20, same rules | 11,118 | −0.030 | −0.696 | −0.055 | 38.2% | 0.90 | 48.5% |
| matched coin flip | 8,471 | +0.024 | −0.104 | +0.011 | 44.8% | 1.03 | 31.6% |

## Five findings

**1. The ENGINE-6 diagnosis was right about the mechanism.** The knock-out rate
falls from **90.1% to 31.6%**, the median stop on the held-back window goes from
17¢ to **134¢** (0.10 → 0.75 ATR), and commission as a share of risk falls from
0.059R to 0.0075R. The same entries that returned −0.83R at the tight stop return
+0.02R at this one. **One number was the whole result**, exactly as the
post-mortem said.

**2. The per-trade edge is real-signed and statistically indistinguishable from
zero.** +0.0199R net is **+$20 on $1,000 of risk**, and its 95% interval is
**−0.0025 to +0.0422** — it spans zero. H2 asked for a positive mean and got one;
it did not ask for, and did not get, a mean that clears its own error bar. That
distinction is the single most important line in the report and it is stated
there, not buried.

**3. The filter is the one claim that did clear its interval.** The day's twenty
stocks in play returned **+0.077R a day more** than twenty random eligible names
traded identically (95%: +0.041 to +0.114, 667 days). That is the paper's central
claim, measured on data chosen before the model was, and it held. ENGINE-6 found
the same comparison **0.46R the wrong way** at the tight stop.

**4. But ranking WITHIN the twenty buys nothing.** Split the held-back trades at
the median relative volume and the more-abnormal half returns +0.0230R against
+0.0167R — a difference of +0.006R, 95% −0.038 to +0.051. ENGINE-6's monotone
inversion (−0.27R in the lowest decile to −1.25R in the highest) has not been
replaced by the paper's gradient; it has been replaced by **noise**. What pays is
being in the top twenty at all, not where in it — which is a materially weaker
claim than the published one.

**5. The direction call lost to a coin flip, and the decomposition says something
specific.** Of the 7,322 pairs, 5,241 agree and contribute exactly zero; the
whole of H3 comes from the **2,081 mornings where BOTH ends of the opening range
broke**. On those, the model's side returned −0.735R and the opposite side
−0.271R. Read plainly: **on a day that whipsaws through both ends of its opening
range, the end the first candle pointed at is the losing end.** That is narrower
than "the direction call is worthless" — on days only one side broke, the control
did not trade and contributes nothing — but the gate was the paired number, and
the paired number failed. Nine models in, "which way to point" has still never
been worth a measurable amount.

## Read the leverage before the return

The +223.9% is a **four-times-levered** number: the 4× gross cap binds on 618 of
667 held-back sessions, so the strategy wants more exposure than it is allowed on
93% of days. A per-trade edge near zero, levered four times across twenty
concurrent positions and compounded over 667 sessions, is what produces a figure
in the hundreds of percent — and the same arithmetic runs in reverse if the sign
is wrong. The contaminated window's portfolio (+1,173%, Sharpe 0.97) and the
whole tape's (+4,025%, Sharpe 1.04) are printed for the same reason and carry the
same warning.

## What this does not establish

That the model is worth trading. Nothing here has been run forward in real time;
short borrow is not modelled and is not free on a stock that just gapped on news;
fills are a resting stop order taken at the worse of the level and the bar's
open, which is optimistic for twenty simultaneous orders at 09:35 on the most
volatile names of the morning; and costs already eat more than half the gross
edge (+0.0437R at zero cost against +0.0199R at the pre-registered model). The
honest summary is that **one published claim survived a held-back test at about a
fiftieth of an R a trade, and two others did not.**

---

# ENGINE-8 — the daily trend had to agree, and it did not help

Brief: [`docs/BUILD-BRIEF-engine-8-sip-trend-filter.md`](../../docs/BUILD-BRIEF-engine-8-sip-trend-filter.md).
Gates: [`../models/orb_sip.v3/GATE.md`](../models/orb_sip.v3/GATE.md) and
[`../models/orb_sip.v3_15m/GATE.md`](../models/orb_sip.v3_15m/GATE.md), both
committed at `6dc2a50`, before any number existed.

The owner's rule, verbatim: *"adding a filter for trades that are already in
momentum going in the direction of the breakout.. so bullish orb + bullish
trend. If daily trend bearish and bullish orb dont take the trade"*, on
*"only... data from past 5 years"*. `orb_sip.v3` is `orb_sip.v2` with exactly
that gate added — long only in a confirmed daily uptrend, short only in a
confirmed daily downtrend, sideways or opposing is no trade rather than a
smaller one — read on the last fully closed daily bar, using ENGINE-2's
structure definition without a number changed. `orb_sip.v3_15m` is the same
model on a 15-minute opening range, added by the owner mid-lane. Build window
2021-08-29 → 2025-08-28; verdict window 2025-08-29 → 2026-08-28, held back until
both gates were committed.

## The answer, in one line

**The filter removes three trades in four and does not improve what is left. On
the mornings it was specifically brought in to fix — the ones that break both
ends of the opening range — the trades it keeps return −0.723R and the trades it
removes return −0.729R. It is not telling them apart.**

| | `orb_sip.v3` (5m) | `orb_sip.v3_15m` (15m) |
|---|---|---|
| held-back trades | 996 | 892 |
| mean net R | **+0.0356** (+$36 per $1,000 risked) | **+0.0062** (+$6) |
| 95% interval | −0.0324 to +0.1035 — **contains zero** | −0.0482 to +0.0606 — **contains zero** |
| median net R | −0.1003 | −0.0334 |
| hit rate / stopped | 45.7% / 30.6% | 47.5% / 19.3% |
| portfolio, held back | +18.8%, Sharpe 0.69 | −6.5%, Sharpe −0.16 |
| portfolio, four build years | **−67.3%**, Sharpe −0.57 | **−50.0%**, Sharpe −0.51 |
| verdict | **PARTIAL** (T3, T4, T5 failed) | **PARTIAL** (U3, U4, U5 failed) |

Both cleared the sample floor and both had a positive mean, so neither is a
FAILED. Both lost all three mechanism gates: the direction call against a coin
flip, the stocks-in-play filter against twenty random names, and the portfolio.
**PARTIAL is not a pass and the gate said so before the run.**

## Four findings, and the second is the one to keep

**1. The two-way-break diagnosis is confirmed, and it is enormous.** 1,565 of
the 3,969 held-back mornings (39.4%) broke both ends of the 5-minute opening
range. On those the candle's side returned **−0.728R** and the other end
**−0.308R**. On the 2,404 mornings only one end broke, the candle's side
returned **+0.501R**. The entire model is one good trade and one catastrophic
one, sorted by a fact — whether the range gets whipsawed — that is not knowable
at 09:35. ENGINE-7 saw a random half of these through its coin flip; this lane
put a resting order at each end and counted all of them.

**2. The daily trend cannot tell which end of a whipsaw pays, and that is the
finding.** Of the 1,565 two-way mornings the filter kept 373 and removed 1,192.
Kept **−0.7228R**, removed **−0.7293R**, difference **+0.0065R** (95%: −0.090 to
+0.103). On the build window, over 6,799 such mornings, the difference is
**−0.0132R** (95%: −0.053 to +0.026). Both intervals sit on zero. And the fenced
diagnostic closes the door on the obvious follow-up: on the mornings where the
trend pointed the *other* way, taking the trend's side returned −0.269R against
the −0.308R that the other side returned on **all** two-way mornings regardless
of trend. The other end of a whipsaw is less bad than the candle's end — which
ENGINE-7 already knew — and the daily trend adds nothing to knowing that.

**3. The filter discards winners, and the gate required this sentence.** It
removes **75%** of the base model's trades. Over the four-year build window the
5-minute model kept **−0.0168R** and removed **+0.0302R**, a difference of
**−0.047R** whose 95% interval (−0.088 to −0.006) **excludes zero in the wrong
direction**. Restricted to the mornings where only one end broke — where there
was never a side to choose — it is **−0.0625R** (95%: −0.115 to −0.010), again
excluding zero the wrong way. The held-back year's version of the same numbers
is +0.025R and −0.016R with intervals spanning zero. **Four years say mildly
harmful; one year says nothing. Neither says it helps.**

**4. The held-back year is the good year, and the whole window says so.** Across
the full five years `orb_sip.v3` returns **−0.0067R** over 5,148 trades and is
positive in **2 of the 6** calendar years it touches. The verdict window was
fixed by the owner and by the calendar rather than chosen, so this is not
cherry-picking — but a reader who sees only +$36 a trade is seeing one year in
five, and the other four are printed beside it.

## What was NOT established, and what it cost to find out

The lane cost one run and no new data: ENGINE-6's selection was reused byte for
byte, the daily bars came from grouped files already in the snapshot, and nothing
was downloaded. The trend definition was taken as already written — ENGINE-2's
`daily_structure` at pivot_n=2 and lookback=120 — precisely so that this lane
could not answer a null by inventing a third definition.

Three honest limits, all pre-registered rather than added afterwards. **The
held-back year is not virgin data**: ENGINE-7's diagnosis was measured on
2024-01-01 → 2026-08-28, which contains it, so the *decision to try a trend
filter* was taken after looking at data that includes the verdict window —
suggestive, not conclusive. **Two models on one year** carry about a 10% chance
that one clears zero by luck; both were reported regardless and neither was led
with. **The sample floor moved** from ENGINE-7's 5,000 to 750, for the
arithmetic reason that twenty picks over ~251 sessions is a ceiling of ~5,000
before any filter — 750 is set from power and buys a ±0.086R half-width, which
is enough to see an edge worth trading and deliberately not enough to resolve
v2's +0.02R.

Two judgement calls are recorded as calls. The **15-minute stop** is the
opposite extreme of the whole 09:30-09:45 range rather than of the last
five-minute candle inside it, because the bar that defines the trade is the bar
the stop belongs to; the other reading is a different model and no number here
speaks to it. And the **selection stays ENGINE-6's, at 09:35, for both
variants**, because the one-minute cache exists only for the symbol-days that
selection named — not lookahead, since 09:35 is strictly less information than
09:45, but a deviation, and it makes the two variants a comparison of range
length and nothing else.

## The prior, and whether it moved

| lane | filter | result |
|---|---|---|
| ENGINE-2 | confirmed daily structure, 32 names | removing it moved the gross mean by +0.019R — inside the noise |
| ENGINE-3 | 1h and 4h must both agree | the edge over the control SHRANK, +0.099R → +0.052R |
| ENGINE-5 | 1h structure, 11,568 paired trades | −0.005R (95%: −0.027 to +0.016) — the tightest null in the programme |
| **ENGINE-8** | **daily structure, on the one base that clears zero** | **removes 75% of trades and does not improve what is left** |

ENGINE-3's and ENGINE-5's nulls were measured on a fixed 32-name basket with a
stop ENGINE-6 later showed was wrong — a filter on a broken base measures the
base, so they did not settle this. ENGINE-8 ran the same idea on the base that
does clear zero, with a survivorship-free universe and the stocks-in-play
selection, and got the same answer. **The prior was a null and it did not move.**

---

# ENGINE-10 — the owner's own stop, both readings of it, and one of them is the ENGINE-6 failure again

Brief: the owner's spec of 2026-08-29, verbatim — *"we should only take an entry
on the breakout of orb, stop at the low of 5min candle before the entry candle
(if bullish) and top if bearish. if stopped out we take the loss"*.
Gate: [`../models/orb_sip.v4_trigger/GATE.md`](../models/orb_sip.v4_trigger/GATE.md),
which governs both arms and was committed at `5e30155`, before any number
existed.

`orb_sip.v4` is `orb_sip.v2` with **one rule changed** — the stop moves from the
opposite extreme of the opening range to a five-minute candle at the breakout.
No trend filter, no re-entry, no breakeven move, no partial; *"if stopped out we
take the loss"* was already how the model behaved and was confirmed rather than
built. The sentence is ambiguous for the third time in this programme, so **both
readings were pre-registered as arms and both were run**: `v4_trigger` stops at
the extreme of the candle the fill happened in, `v4_prior` at the one before it.

## The answer, in one line

**One reading is the ENGINE-6 catastrophe rebuilt from the owner's own words —
85.8% stopped out, −$605 per $1,000 risked, negative in all six calendar years.
The other is `orb_sip.v2` with a slightly tighter stop and no measurable
difference from it.**

| | held back | all five years | stopped | median stop | verdict |
|---|---|---|---|---|---|
| `orb_sip.v4_trigger` | **−$605** per $1,000, n=3,969 | −$658, n=20,141 | **85.8%** | 37¢ (0.17× ATR) | **FAILED** |
| `orb_sip.v4_prior` | **+$15** per $1,000, n=3,967 | +$17, n=20,126 | 44.3% | 118¢ (0.51× ATR) | **PARTIAL** |
| `orb_sip.v2`, same trades | +$17 per $1,000 | +$18 | 31.3% | 164¢ (0.72× ATR) | ENGINE-7's PARTIAL |
| ENGINE-6's published stop | — | −$635 | 90.1% | 12¢ (0.10× ATR) | NOT REPRODUCED |

## Four findings

**1. The ENGINE-6 diagnosis reproduced itself out of sample, from a rule nobody
derived from it.** The ENGINE-6 stop sweep was computed on 2016–2023 and
predicted the sign of this whole family from stop width alone: −0.635R at 0.10×
the 14-day range, −0.073R at 0.25×, +0.005R at 0.50×, +0.012R at 1×. The
trigger arm's realised stop is **0.17×** and it returns **−0.605R**; the prior
arm's is 0.51× and it returns +0.015R; v2's is 0.72× and it returns +0.017R.
Three points on a 2021–2026 tape, landing exactly on a curve fitted to nothing,
from a rule that came out of the owner's mouth rather than out of the sweep.
**Stop width, not the direction call, is still the only parameter this
programme has found that decides what this family earns.**

**2. The literal reading is the one that fails, and it fails the way the
published version failed.** A stop at the extreme of the candle you broke out in
is a median 37¢ — a tenth of the width of v2's — and it is hit on 85.8% of
trades against v2's 31.3% on the *same entries*. Paired trade for trade it is
**−0.622R** worse than v2 (95%: −0.675 to −0.568). It is not that the idea is
wrong; it is that the trade is knocked out before the idea has a chance to be
right or wrong.

**3. The other reading is v2 wearing a different hat.** On **62.5%** of its
trades the "candle before" IS the 09:30–09:35 opening range, because 62% of
breakouts happen in the first five minutes after the range closes — so on those
trades `v4_prior` and `orb_sip.v2` are the same model. Paired on the rest, the
difference is **−0.0016R** (95%: −0.026 to +0.023). It is a null, and it is the
tightest null in this lane.

**4. Nothing here changes the size of the thing.** `v4_prior` clears its sign
gate and fails the other three: its direction call loses to a coin flip
(−0.152R paired, interval excluding zero), the stocks-in-play filter is no
longer distinguishable from twenty random names on a single year's 251 days
(+0.055R, 95%: −0.015 to +0.125), and the portfolio makes +30.0% at a Sharpe of
0.93 against a bar of 1.0. **PARTIAL is not a pass and the gate said so before
the run.**

## One correction this lane owes its own brief

The brief said `orb_sip.v2` returns about −$7 per $1,000 over the full five
years and is positive in only 2 of 6 calendar years. **That is `orb_sip.v3` —
the trend-filtered model — not `orb_sip.v2`.** Measured here, v2 returns +$18
per $1,000 over 20,141 trades and is positive in 6 of 6, and its held-back year
(+$17) is ordinary rather than exceptional. The "one good year" warning is real
for ENGINE-8's model and weaker for ENGINE-7's. What has not changed is the
size: a few tens of dollars per $1,000 risked with an error bar that spans zero
is not an edge anybody can stand behind, whether you read one year or five.
