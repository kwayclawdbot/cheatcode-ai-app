# Pre-registered gate — `orb_1h_unmanaged.v1`

**Written and committed before the first evaluation was run**, in the same
commit as [`../orb_1h_managed.v1/GATE.md`](../orb_1h_managed.v1/GATE.md), which
this file inherits in full and does not restate.

## The one change

**No management.** The position is not reduced at +1R and the stop never moves.
It runs to the 1-hour level target, to the original stop, or to the 15:55 flat.
Everything else is identical to the primary, including the trade set: same
1-hour trend, same range, same trigger, same entry, same stop at the candle
BEFORE the trigger candle, same target.

## Why this exists — the value of the management rule is measured, not assumed

The primary model banks half at +1R and moves the stop to breakeven because the
owner asked for the 1R to count for something. Whether that rule HELPS is a
separate question from whether the setup has an edge, and answering it by
inspection is how a report ends up recommending a rule that costs money.

Taking half off at +1R and moving to breakeven does two opposite things at once:

* it converts trades that reached +1R and then reversed from full losses into
  small wins — the reason the rule is attractive;
* it caps the winners at half size, so every trade that would have run to a
  distant level now collects half of it, and it converts some trades that would
  have reached the target into breakeven scratches by putting a stop exactly
  where intraday noise lives.

Which effect is bigger is arithmetic on this tape, not an opinion. This control
is that arithmetic. It is reported **paired trade for trade against the
primary**, on the same entries, so the difference is the rule and nothing else.

`run_symbol_managed(manage=False)` is asserted to reproduce
`engine/backtest/engine.run_symbol` trade for trade on the real tape
(`tests/test_managed.py`), and the management rule is asserted not to move a
single entry. Without both, this would be a second implementation of a similar
idea rather than the same trade measured without the rule.

## The bar

Identical to the primary's: G1–G5, ENGINE-1's thresholds, ENGINE-4's
single-symbol floor, evaluated on **SPY** on `polygon-deep-v1` after costs, with
QQQ and IWM separate and the 32-symbol `polygon-v1` basket its own labelled
result. Same three-way verdict rule. Same gross-first ordering.

**The +1R touch rate is reported off this run** — it is the unmanaged trade's
best excursion, uncapped by a partial — and it is a **diagnostic that enters no
gate**. Beside it the report must state what "count every 1R touch as a win"
would have claimed on exactly these trades, next to what was realised.
`gates.naive_1r_scoring` computes both and is defined in this commit.

**This is model ten.**
