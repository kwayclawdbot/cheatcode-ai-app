# BUILD BRIEF — ENGINE-5: `orb_1h_managed` — 1h trend, 1h-level target, 1R management

Owner, 2026-08-29, verbatim: *"use 1hr h/l or key level as target. trend
confirmation on 1hr.. enter on 5min use previous 5min h/l as stop-loss, target
2rr.. even if it doesnt hit 2rr mark any trade that moves up at least 1rr as a
win"*.

## The one thing translated rather than copied, and why

"Mark any trade that moves up at least 1R as a win" is a SCORING change, and taken
literally it is the exact error that made the SMS engine look profitable while it
lost money: `alert_performance_honest` shows average peak +11.93% against a
realised +0.41% (17 §1). A price you did not sell at is not money.

So it is implemented as a **rule that actually banks it**: at +1R, take half off
and move the stop to breakeven; the remainder runs to target. That is tradeable,
it is almost certainly what was meant, and it can be measured honestly.

Separately, report **"share of trades that touched +1R"** as a clearly-labelled
DIAGNOSTIC, never as a result and never inside a gate. It answers a real question
— does this setup have any push in it — without pretending an untaken price was
income.

## Primary model — `orb_1h_managed.v1`

- **Trend:** 1-hour only (the 4h filter bought nothing measurable in ENGINE-4;
  ENGINE-3 showed the double gate cost sample and added no accuracy). Same
  structure definition and RTH bar convention already documented — reuse verbatim.
- **Range:** 09:30–09:45 ET high and low.
- **Trigger:** a 5-minute candle CLOSING beyond the range in the 1h trend's
  direction. Entry at the next 5m bar's open.
- **Stop:** the high/low of the **candle immediately preceding the trigger
  candle**. The owner has now said "previous 5min h/l" twice; ENGINE-4 used the
  trigger candle itself. **Run BOTH readings** — prior-candle as primary,
  trigger-candle as a labelled variant — and settle this ambiguity permanently
  with a number instead of another round trip.
- **Target:** the nearest **1-hour high/low or key level** in the trade's
  direction, taken from the 1h series. Levels definition as already built; report
  the realised distribution of target distance in R.
- **Management:** at +1R, exit half and move the stop on the remainder to
  breakeven. Remainder exits at target or breakeven stop.
- **Exit:** flat at 15:55 ET.

## Variants — pre-registered, run separately, ONE change each

1. `orb_1h_managed_2r.v1` — identical, but the target is a fixed **2R** instead of
   the 1h level. (The owner named both; measure which is better rather than
   guessing.)
2. `orb_1h_trigcandle.v1` — identical to primary, but the ENGINE-4 stop reading.
3. **Unmanaged control** — primary with NO 1R partial, so the value of the
   management rule is isolated rather than assumed.

No other sweeps. Each gets its own `GATE.md`, all committed before evaluation.

## Universe

SPY primary on `polygon-deep-v1` (2012–2026, 3,685 sessions, zero gaps). QQQ and
IWM reported separately, never pooled. Also run the 32-symbol `polygon-v1` basket
as a separate, clearly-labelled result — ENGINE-4 established that index ETFs are
not representative of single names, and the cost arithmetic differs by stop width.

## What ENGINE-4 established that this must respect

**Cost drag = cost per share ÷ stop distance.** The instrument does not set the
hurdle; the stop width does. SPY with a trigger-candle stop paid 22–27% of risk in
costs — worse than the mixed basket. A prior-candle stop is wider, so report
realised stop width and cost drag for BOTH readings; that comparison is a primary
result of this lane, not a footnote.

And the finding that overshadows all six models so far: they were at or below a
coin flip **before costs**. **Check gross versus the matched control FIRST.** If
this model is not better than random before costs, no management rule, target
choice or stop reading can save it — say that plainly and stop, rather than
running every variant to completion.

## Gate

Pre-register all gates before evaluation, as `a06611d` preceded `19d3234`. These
are models seven through ten on this data — **say so, and treat out-of-sample as
the verdict.** Report the median beside every mean. Anti-lookahead treatment for
anything new, and extend the amputated-session proof.

## Report

`engine/reports/orb_1h_managed*.md`, opening with plain English: trade count and
date range in the first three lines, did it work, how sure are we, what would
change the answer. No R-multiples in that section without a plain gloss.
