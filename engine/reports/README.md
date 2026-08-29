# engine/ — what was measured, and what happened

**Four models have now been measured against bars written down before each test
was run. Three failed and the fourth came back inconclusive.** None ships.
Nothing here touches the app, and no alert has been produced.

That is the intended kind of outcome. It cost a week; the alternative — the one
the existing SMS engine took — costs a paying customer.

| phase | model | verdict |
|---|---|---|
| ENGINE-1 | [`orb_reclaim.v1`](orb_reclaim.v1.polygon-v1.md) | FAIL |
| ENGINE-1 | [`sweep_displacement_fvg.v1`](sweep_displacement_fvg.v1.polygon-v1.md) | FAIL |
| ENGINE-2 | [`orb_htf_structural.v1`](orb_htf_structural.v1.polygon-v1.md) | FAIL — but the first to beat its control before costs |
| ENGINE-3 | [`orb_mtf.v1`](orb_mtf.v1.polygon-v1.md) — Exit A, day trade | INCONCLUSIVE (sample) |
| ENGINE-3 | [`orb_mtf.v1`](orb_mtf.v1.polygon-v1.md) — Exit B, swing | INCONCLUSIVE (sample) |

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
