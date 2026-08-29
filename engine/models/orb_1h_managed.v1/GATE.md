# Pre-registered gate — `orb_1h_managed.v1`

**Written and committed before the first evaluation was run.** This file lands
in the same commit as `engine/models/orb_managed.py`,
`engine/backtest/managed.py`, the other three variants' `GATE.md` files, the
ENGINE-5 additions to `engine/models/gates.py`, and their tests. That commit is
earlier in `git log` than the commit carrying any number produced by them.
ENGINE-1 did it (`2b448ef` before `f70576b`), ENGINE-2 (`b065f88` before
`1662c03`), ENGINE-3 (`1021168` before `a43595d`), ENGINE-4 (`a06611d` before
`19d3234`). The ordering is the receipt, and it is the only part of this
programme that cannot be faked afterwards.

If this model misses the bar it is recorded as measured-and-failed. It is not
retuned until it passes.

## The owner's words, and the one thing translated rather than copied

Owner, 2026-08-29, verbatim: *"use 1hr h/l or key level as target. trend
confirmation on 1hr.. enter on 5min use previous 5min h/l as stop-loss, target
2rr.. even if it doesnt hit 2rr mark any trade that moves up at least 1rr as a
win"*.

**"Mark any trade that moves up at least 1R as a win" is not implemented as
written, and this section is why.** It is a SCORING change. Taken literally it
is the exact error that made the SMS engine look profitable while it lost money:
`alert_performance_honest` records average PEAK +11.93% on 141 long alerts whose
realised 5-day return was **+0.41%**, with 47.5% of them 8%+ underwater first
(17 §1). A price nobody sold at is not income, and a scoring rule that counts it
turns a losing engine into a winning report.

It is implemented instead as a rule that **banks** it: at +1R, half the position
comes off and the stop on the remainder moves to breakeven. That is tradeable,
it is almost certainly what was meant, and it can be measured honestly.

Two consequences, fixed here before any number exists:

1. **The share of trades that touched +1R is a DIAGNOSTIC.** It is reported in
   its own clearly-labelled section, it answers a real question — does this
   setup have any push in it — and **it appears in no gate**. G1–G5 below do not
   reference it, and no verdict may be reached by way of it.
2. **The report must show what the naive rule would have claimed.** Beside the
   diagnostic, the report states the win rate and the R that "count every 1R
   touch as a +1R win" would have produced on exactly these trades, next to what
   was actually realised. `gates.naive_1r_scoring` computes it, and it is
   defined in this commit so it cannot be reshaped after the fact.

## The model

- **Trend** the 1-HOUR chart is in a confirmed trend, read on its last fully
  closed bar. 1-hour only: the 4-hour filter bought nothing measurable in
  ENGINE-4 and ENGINE-3 showed the double gate cost sample without adding
  accuracy. Structure definition and RTH bar convention reused verbatim from
  ENGINE-3 (`primitives/htf.daily_structure`, 2-bar confirmed fractals over 120
  bars; `primitives/timeframe.session_series` anchored at 09:30, regular hours
  only, a bucket closed only once a bar in a later bucket has printed).
- **Range** 09:30–09:45 ET, high and low.
- **Trigger** a 5-minute candle CLOSING beyond the range in the trend's
  direction, between the close of the 09:45–09:50 candle and the close of the
  15:40–15:45 candle.
- **Entry** the open of the next 5-minute bar, market.
- **Stop** the high/low of the candle immediately **PRECEDING** the trigger
  candle. This is the primary reading. See "the ambiguity" below.
- **Target** the nearest major level above (long) / below (short) the decision
  close, drawn from the **1-hour series and the session reference levels**:
  confirmed 1-hour pivots (2-bar fractals, 120 closed hours, ≥2 touches within
  8bp) plus prior-day RTH high/low, premarket extremes and overnight extremes.
  Clustered at 25bp. Every one of those numbers is `primitives/htf_levels.py`'s,
  unchanged, so none can have been retuned for this model. **No 4-hour and no
  daily pivots** — the brief says 1-hour.
- **Management** at +1R, half off at the level (a resting limit), stop on the
  remainder to breakeven.
- **Exit** flat at 15:55 ET. Day trade only; nothing held overnight.
- **Frequency** at most one trade per direction per day, one position at a time.

## The ambiguity the owner has now stated twice, settled with a number

ENGINE-4 implemented *"previous 5min candlestick high/low"* as the TRIGGER
candle's own extreme and said in its report that the other reading was the
single most informative re-run available. The owner has since repeated
*"previous 5min h/l"*. So both readings run here: **prior candle is primary**
(this file), **trigger candle is `orb_1h_trigcandle.v1`**, and the comparison is
a primary result of this lane rather than a footnote.

**ENGINE-5's brief assumed the prior-candle stop is the wider of the two. That
assumption is already known to be false as a rule, and it was falsified by a
unit test before any performance number existed** — see
`tests/test_no_lookahead_end_to_end.py::test_neither_stop_reading_is_always_the_wider_one`.
The trigger candle is the breakout bar; it is frequently large with a long wick,
and its extreme can sit far further from the close than the quieter bar before
it. SPY 2012-11-19 at 10:44 risks $2.11 on the trigger reading and $0.24 on the
prior reading. Both directions occur. **Which reading is wider, and by how much,
is therefore a measurement this lane owes, and the report must give the realised
distribution of stop width and of cost drag for BOTH readings.**

The two readings do not always produce the same trade set, and the report must
say so rather than assume it. The prior candle can sit on the wrong side of the
trigger close when the 1-hour trend flips onto a range edge price has already
left; that gives a stop that is not a distance, and it is counted as
`skip_invalid_stop` rather than silently dropped. **The stop-width and cost-drag
comparison is additionally reported on the INTERSECTION** — the (symbol, day,
minute) triples where both readings produced a trade — so the comparison is not
contaminated by a different trade set.

## What is deliberately absent

No opening-range size band, no minimum reward, no risk cap, no risk floor, no
clustering rule, no "strong anyway" exception, no 4-hour agreement requirement.
Those screens are why `orb_mtf.v1` produced 448 trades from 23,904 symbol-days.
Their absence is inherited from `orb_simple.py` on purpose and **must not be
reintroduced after seeing a number.**

Four rules are mechanical rather than discretionary, and are stated now so they
cannot later be mistaken for filters:

1. Triggers run from the close of the 09:45–09:50 candle to the close of the
   15:40–15:45 candle. A later trigger has no bar left to enter on before the
   15:55 flat.
2. A stop that is not a positive distance on the correct side of the entry is
   not a trade. Counted as `skip_invalid_stop`, in both readings, and reported.
3. **No level in the trade's direction is NOT a skip.** It is a trade with no
   price target that runs to the breakeven stop or the 15:55 flat. Making it a
   skip would be a filter. It is counted as `signals_no_target_level`, and the
   report gives the level-target trades as a labelled subset so both readings of
   that choice are visible.
4. The runner holds one position at a time, so a day's second direction can only
   start after the first has closed.

## The management rule's arithmetic, and every ambiguity resolved against it

Implemented in `engine/backtest/managed.py`. Let `P1` be the +1R price and `T`
the target. Before the partial, within a bar:

* if the bar reached the STOP, the whole position is stopped — even if the same
  bar also reached `P1` or `T`. Flagged as ambiguous and counted;
* else if `T` is no further than `P1`, the whole position exits at `T`. Price
  cannot reach `P1` without passing `T` first, so those trades never partial;
* else if the bar reached `P1`, half comes off at `P1` (a resting limit, no
  slippage) and the stop moves to the fill. Then on the SAME bar: if it also
  reached `T` the remainder exits at `T`; otherwise if the bar's adverse extreme
  also reached breakeven, the remainder is stopped at breakeven on that bar.
  Which excursion came first is unknowable from OHLC, so it is assumed to be the
  one that costs money. Flagged and counted.

Costs: the entry pays commission on the whole position, each exit on the
fraction it closes, so a managed trade pays exactly `2 × commission` per unit —
the same as an unmanaged one. **A breakeven stop is not free**: it fills at the
entry price plus adverse slippage and pays its half of the commission, so
"breakeven" is a small realised loss, which is what a real one does.

**`run_symbol_managed(manage=False)` is `run_symbol`.** Asserted trade for trade
on the real tape in `tests/test_managed.py`, which is what makes
`orb_1h_unmanaged.v1` an honest control rather than a second implementation of a
similar idea. The management rule is an EXIT rule and may not move a single
entry; that too is asserted.

## The data

| | |
|---|---|
| snapshot | `polygon-deep-v1` — SPY, QQQ, IWM, 2012-01-01 → 2026-08-28, 3,685 sessions each |
| in-sample | 2012-01-01 → 2022-12-31 |
| **out-of-sample (the verdict)** | **2023-01-01 → 2026-08-28** |
| second, separate run | `polygon-v1` — 32 symbols, 2023-09-01 → 2026-08-28, in-sample to 2025-12-31, out-of-sample 2026 |
| costs | $0.005/share/side commission; 1.0 bp adverse slippage on market and stop fills |

**SPY is the subject.** QQQ and IWM are reported separately and are never pooled
into a SPY number. The 32-symbol `polygon-v1` basket is a **separate, clearly
labelled result** with its own gate — ENGINE-4 established that index ETFs are
not representative of single names, and that the cost arithmetic differs by stop
width. No report mixes the two snapshots.

## The bar

Evaluated on **SPY**, on `polygon-deep-v1`, after costs. All five must pass.

| id | gate | threshold |
|---|---|---|
| **G1** | sample size, SPY alone | ≥ **500** trades in-sample AND ≥ **150** out-of-sample |
| **G2** | expectancy after costs | mean net R ≥ **+0.10** in-sample AND ≥ **+0.05** out-of-sample |
| **G3** | profit factor after costs | ≥ **1.20** in-sample AND ≥ **1.10** out-of-sample |
| **G4** | MAE tail | of the trades that closed **profitable**, ≤ **40%** first went ≥ 0.75R against |
| **G5** | regime robustness | mean net R > 0 in **both** regime slices in-sample |

G2–G5 are ENGINE-1's thresholds, carried over unchanged for the fifth time. A
model handed an easier bar than the six that failed before it has not been
measured against anything. G1 is ENGINE-4's single-symbol floor.

On the `polygon-v1` basket the same five gates apply with ENGINE-1's pooled
floors (≥400 in-sample, ≥100 out-of-sample) and ENGINE-1's windows.

**No gate references the +1R touch rate, the partial rate, or any peak/MFE
statistic.** That is the whole point of §"the one thing translated".

### The three-way verdict, fixed before the count is known

- **PASS** — all five.
- **INCONCLUSIVE (sample)** — G1 missed.
- **INCONCLUSIVE (power)** — G1 met, G2 missed, but the 95% interval on the mean
  still contains the threshold.
- **FAIL** — anything else, including a G2 miss whose interval excludes it.

## Gross versus the matched control is read FIRST, and this lane may stop there

ENGINE-1's decisive finding, restated by ENGINE-4: **all six models so far were
at or below a coin flip BEFORE costs.** If a model cannot beat a random entry on
free trades, no management rule, no target choice and no stop reading can rescue
it, and running every variant to completion is spending budget to decorate an
answer that is already known.

So, fixed here: **the first number computed and the first number reported is the
primary model's gross mean R against `null_coinflip.v1.matched`, paired trade
for trade.** The control takes the same symbol, the same days, the same decision
minutes, the same stop distances **and the same target distances**, run through
**the same managed runner**, with only the direction flipped — so it is a
comparison of direction calls, not of exit rules.

If the primary model is not better than that control gross, the lane reports
that plainly, reports the stop-width and cost-drag comparison it owes regardless,
and **stops** rather than running every variant to completion. Saying so is the
single most valuable thing this lane can conclude, and it is pre-authorised here
so that stopping cannot be mistaken for giving up.

## Median beside mean, always

`orb_mtf.v1` returned a mean of +1.53¢ a share and a median of −25¢: three
trades out of 448 carried the whole positive number. Every headline figure in
the ENGINE-5 report carries its median next to it, and the report states what
the top three trades contributed.

## Models seven through ten

`orb_reclaim.v1`, `sweep_displacement_fvg.v1`, `orb_htf_structural.v1`,
`orb_mtf.v1`, `orb_simple_1h.v1` and `orb_simple_4h.v1` have all been measured
on this programme's data; five failed and one was inconclusive. **These four are
models seven, eight, nine and ten**, and they are run as a set, which is four
more chances for one of them to look good by luck. Consequences, fixed here:

1. The out-of-sample window is the verdict and is read once.
2. The four are judged separately and none borrows another's result.
3. Three of the four are one-change variants of the primary. A variant that
   passes while the primary fails is a **lead, not a result**, and the report
   must say so in those words.
4. The report says all of this in plain language, near the top, not in a
   footnote.

## Anti-lookahead

`tests/test_no_lookahead.py` attacks the primitives, `test_no_lookahead_mtf.py`
the higher-timeframe context, and `test_no_lookahead_end_to_end.py` is extended
to all four variants: the whole model — trend reading, level finder, opening
range, trigger, both stop readings, target — is re-run against a tape whose
future has been physically amputated and a context rebuilt from that truncated
tape, and must produce identical signals field for field, target level included.
`_prior_candle` is the one genuinely new primitive and gets its own test.

## Survivorship and scope, stated

Three index ETFs on the deep snapshot, all of which exist today, and 32 names on
`polygon-v1` chosen because they are liquid today. No delisted instrument is
involved and none can be. Prices are split- and dividend-adjusted. No borrow,
locate, halt, dividend or corporate-action modelling.
