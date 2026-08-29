# Pre-registered gate — `orb_1h_trigcandle.v1`

**Written and committed before the first evaluation was run**, in the same
commit as [`../orb_1h_managed.v1/GATE.md`](../orb_1h_managed.v1/GATE.md), which
this file inherits in full and does not restate.

## The one change

**The stop reading.** The **TRIGGER candle's own** low (long) / high (short) —
ENGINE-4's reading — instead of the candle immediately preceding it. Everything
else is identical: 1-hour trend, 09:30–09:45 range, a 5-minute close beyond it,
entry at the next 5-minute open, target the nearest 1-hour level, half off at
+1R with the stop to breakeven, flat at 15:55.

## Why this variant exists, and what it settles

The owner has now said *"previous 5min h/l"* twice. ENGINE-4 implemented it as
the trigger candle and flagged the ambiguity at the top of its report as *"the
single most informative re-run available"*. Running both readings settles it
with a number instead of another round trip, and **that comparison is a primary
result of this lane, not a footnote.**

**The brief's assumption about which is wider is already known to be false as a
rule**, and it was falsified by a unit test before any performance number
existed —
`tests/test_no_lookahead_end_to_end.py::test_neither_stop_reading_is_always_the_wider_one`.
The trigger candle is the breakout bar: often large, often long-wicked, and its
extreme can sit far further from the close than the quieter bar before it. SPY
2012-11-19 at 10:44 risks $2.11 on this reading and $0.24 on the prior-candle
reading. Both directions occur.

So the report owes, for BOTH readings:

* the realised distribution of stop width — in cents, and as a percentage of
  price, median beside mean;
* the realised cost drag in R, which ENGINE-4 established is
  `cost per share ÷ stop distance` — the stop width sets the hurdle, not the
  instrument;
* the count of triggers each reading could not trade (`skip_invalid_stop`), and
  the comparison repeated on the **intersection** of the two trade sets so it is
  not contaminated by a different sample.

## The bar

Identical to the primary's: G1–G5, ENGINE-1's thresholds, ENGINE-4's
single-symbol floor, evaluated on **SPY** on `polygon-deep-v1` after costs, with
QQQ and IWM separate and the 32-symbol `polygon-v1` basket its own labelled
result. Same three-way verdict rule. Same gross-first ordering. Same rule that
the +1R touch rate is a diagnostic and enters no gate.

**This is model nine.** A variant that passes while the primary fails is a lead,
not a result.
