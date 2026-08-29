# Pre-registered gate — `orb_1h_managed_2r.v1`

**Written and committed before the first evaluation was run**, in the same
commit as [`../orb_1h_managed.v1/GATE.md`](../orb_1h_managed.v1/GATE.md), which
this file inherits in full and does not restate.

## The one change

**The target.** A fixed **2R measured from the fill**, instead of the nearest
1-hour level. Everything else is identical: 1-hour trend, 09:30–09:45 range, a
5-minute close beyond it, entry at the next 5-minute open, stop at the candle
BEFORE the trigger candle, half off at +1R with the stop to breakeven, flat at
15:55.

The owner named both targets in the same sentence — *"use 1hr h/l or key level
as target ... target 2rr"* — so this measures which is better instead of
guessing. It is one change, run separately, judged separately.

## Why this variant answers something the primary cannot

A level target has no fixed reward. The nearest 1-hour level can be 0.3R away or
4R away, and where it lands is not under the model's control. A fixed 2R has a
constant reward and a constant relationship to the +1R partial: the managed
trade is exactly "half at +1R, half at +2R", so its best case is +1.5R and its
worst is −1R. That makes the payoff geometry legible in a way the level target
is not, and it is directly comparable to `orb_simple_1h.v1`, which was the same
2R target with the same trend filter and no management.

**Consequence, stated in advance:** this variant differs from `orb_simple_1h.v1`
in exactly two things — the stop reading and the management rule — so the pair
of comparisons (this vs `orb_simple_1h.v1`, and this vs `orb_1h_unmanaged.v1`)
isolates both. That is the reason this variant exists, and it does not entitle
it to an easier bar.

## The bar

Identical to the primary's: G1–G5, ENGINE-1's thresholds, ENGINE-4's
single-symbol floor, evaluated on **SPY** on `polygon-deep-v1` after costs, with
QQQ and IWM reported separately and the 32-symbol `polygon-v1` basket reported
as its own labelled result. Same three-way verdict rule. Same
gross-versus-matched-control-first ordering. Same rule that the +1R touch rate
is a diagnostic and enters no gate.

**This is model eight.** A variant that passes while the primary fails is a
lead, not a result.
