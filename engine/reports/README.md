# engine/ — what was measured, and what happened

**Three models have now been measured against bars written down before each
test was run. All three failed.** None ships. Nothing here touches the app, and
no alert has been produced.

That is the intended kind of outcome. It cost a week; the alternative — the one
the existing SMS engine took — costs a paying customer.

| phase | model | verdict |
|---|---|---|
| ENGINE-1 | [`orb_reclaim.v1`](orb_reclaim.v1.polygon-v1.md) | FAIL |
| ENGINE-1 | [`sweep_displacement_fvg.v1`](sweep_displacement_fvg.v1.polygon-v1.md) | FAIL |
| ENGINE-2 | [`orb_htf_structural.v1`](orb_htf_structural.v1.polygon-v1.md) | FAIL — but the first to beat its control before costs |

Read [ENGINE-2's report](orb_htf_structural.v1.polygon-v1.md) for the newest and
most useful finding: the setup earns about 4.6 cents a share before costs and
pays about 5.6 cents to trade, and no choice of stop placement changes that
subtraction.

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
