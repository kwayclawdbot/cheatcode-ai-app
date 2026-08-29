# Pre-registered gate — `orb_simple_4h.v1`

**Written and committed before the first evaluation was run.** This file lands
in the same commit as `engine/models/orb_simple.py`, the other variant's
`GATE.md`, and the ENGINE-4 additions to `engine/models/gates.py`. That commit
is earlier in `git log` than the commit carrying any number produced by them.
ENGINE-1 did it (`2b448ef` before `f70576b`), ENGINE-2 did it (`b065f88` before
`1662c03`), ENGINE-3 did it (`1021168` before `a43595d`). The ordering is the
receipt, and it is the only part of this programme that cannot be faked
afterwards.

If this model misses the bar it is recorded as measured-and-failed. It is not
retuned until it passes.

## The one ambiguity in the spec, recorded before the run

The owner's words are *"stop at the previous 5min candlestick high/low"*. That
is implemented as **the trigger candle's own low (long) / high (short)** — the
last 5-minute candle that closed before the entry, which is also the candle
whose close broke the range. The other available reading is the candle BEFORE
that one. This gate names the reading used so that the result cannot be quietly
re-attributed later; the report repeats it at the top; and if the other reading
was meant it is a one-line change to `OrbSimple._trigger_candle` and a re-run.

## The model, and what is deliberately absent

- **Range** 09:30–09:45 ET, high and low.
- **Trigger** a 5-minute candle CLOSING above the high (long) or below the low
  (short).
- **Filter** the 4-hour chart is in a confirmed trend, in that direction.
- **Entry** the open of the next 5-minute bar, as a market order.
- **Stop** the trigger candle's low (long) / high (short).
- **Target** a fixed 2R, measured from the FILL, not from the decision price.
- **Exit** flat at 15:55 ET. Day trade only; nothing is held overnight.
- **Frequency** at most one trade per direction per day.

**Absent, on purpose:** no opening-range size band, no minimum reward, no risk
cap, no risk floor, no structural level requirement, no clustering, no
"strong anyway" exception, no both-timeframes-must-agree rule. Those screens are
why `orb_mtf.v1` produced 448 trades from 23,904 symbol-days and 20 of them on
SPY. Their absence is the point of this model and it must not be reintroduced
after seeing a number.

Three rules are mechanical rather than discretionary, and are stated now so they
cannot later be mistaken for filters:

1. Triggers run from the close of the 09:45–09:50 candle (the first candle that
   can close beyond a 09:45 range) to the close of the 15:40–15:45 candle. A
   later trigger has no bar left to enter on before the 15:55 flat.
2. A trigger candle whose extreme equals its close gives a zero-width stop. It
   is counted in the census and not traded, because it is not a trade.
3. The runner holds one position at a time, so a day's second direction can only
   start after the first has closed. That is an account constraint, not a
   modelling choice, and the census counts what it cost.

## Target measured from the fill — a harness change, declared

"2R" means twice the risk the position actually carries, and the risk it carries
is `|fill − stop|`, not `|decision close − stop|`. `Signal.target_r` and
`fills.resolved_target` were added for this. When `target_r` is None — every
model written before ENGINE-4 — behaviour is byte-identical to before, and
`tests/test_backtest.py` and `tests/test_two_exit.py` still hold.

## The data — a NEW snapshot, not the old one extended

| | |
|---|---|
| snapshot | `polygon-deep-v1` — separate directory, separate manifest |
| symbols | SPY, QQQ, IWM |
| range | 2012-01-01 → 2026-08-28, 3,685 sessions per symbol |
| bars | 7,801,725 one-minute bars; zero missing days, zero extra days |
| known thin day | QQQ 2013-08-22, 216 RTH minutes — the Nasdaq trading halt. Real, kept. |
| in-sample | 2012-01-01 → 2022-12-31 (~2,769 sessions) |
| **out-of-sample (the verdict)** | **2023-01-01 → 2026-08-28 (~916 sessions)** |
| costs | $0.005/share/side commission; 1.0 bp adverse slippage on market and stop fills |

`polygon-v1` is untouched and no report may mix the two. The start date is
2012-01-01 because the Nasdaq-100 ETF traded as QQQQ from 2004-12 to 2011-03 and
Polygon returns nothing for the ticker "QQQ" across that window — starting after
the rename buys an unspliced tape for all three symbols.

**The out-of-sample window overlaps the tape four earlier models were measured
on** (2023-09 → 2026-08). That is disclosed rather than engineered away: this
model has no fitted parameter to have overfitted with, its in-sample decade is
data this programme has never seen, and the alternative split — verdict on the
old decade, fit on the new — would judge a day-trading model on a market
structure that no longer exists.

## SPY is the subject

SPY, QQQ and IWM are reported **separately**. No number in this report pools
them, and no SPY conclusion is supported by a QQQ or IWM trade. The gate below
is evaluated **on SPY**. QQQ and IWM are reported against the same bar for
context and are not the verdict.

The reason SPY deserves isolating is arithmetic. Its spread is about a penny on
a ~$770 instrument; the same penny on a $50 stock is roughly fifteen times more
expensive relative to the move. Every model in this programme so far measured a
mixed basket whose cost drag ran 9–14% of risk. **The report must state SPY's
realised cost drag as a fraction of risk explicitly**, in-sample and out, before
any conclusion is drawn from the net numbers.

## The 4-hour convention, reused verbatim from ENGINE-3

Not re-litigated. Implemented once in `engine/primitives/timeframe.py`
(`session_series`) and read as-of through `engine/backtest/mtf.py`.

* Regular hours only; buckets built from `09:30 <= minute < the session's own
  close` (13:00 on a half day). Premarket and post-market prints are excluded.
* Anchored at 09:30, not midnight.
* The day's final bucket is short and still counts. Two bars a session — 09:30–13:30 and 13:30–close, the last of them 2.5 hours long.
* A bucket is closed only once a bar in a LATER bucket has printed.

Structure is ENGINE-3's, unchanged: 2-bar confirmed fractals over the last 120
bars of that timeframe (`primitives/htf.daily_structure`). Up = higher high AND
higher low with the defining swing low unbroken; down is the mirror; everything
else is "none" and means no trade.

The 4-hour reading changes once a day, at 13:30, when the morning bucket closes. Before 13:30 the newest 4-hour bar available is YESTERDAY's afternoon bar, so the whole morning trades on an overnight-stale reading. That is the honest consequence of a 4-hour filter on a day trade and it is not worked around.

The 4-hour chart is slower and, on a lookback of 120 bars, reaches back about 60 sessions. It should produce a steadier, more persistent trend label and therefore longer runs of same-direction days. Whether that is worth more than the 1-hour reading's responsiveness is the entire question this pair of runs exists to answer, and it is answered symbol by symbol, not pooled.

## The bar

Evaluated on **SPY**, on `polygon-deep-v1`, after costs. All five must pass;
four out of five is a failure.

| id | gate | threshold |
|---|---|---|
| **G1** | sample size, SPY alone | ≥ **500** trades in-sample AND ≥ **150** out-of-sample |
| **G2** | expectancy after costs | mean net R ≥ **+0.10** in-sample AND ≥ **+0.05** out-of-sample |
| **G3** | profit factor after costs | ≥ **1.20** in-sample AND ≥ **1.10** out-of-sample |
| **G4** | MAE tail | of the trades that closed **profitable**, ≤ **40%** first went ≥ 0.75R against |
| **G5** | regime robustness | mean net R > 0 in **both** regime slices in-sample |

G2–G5 are ENGINE-1's thresholds, carried over unchanged. A model that is handed
an easier bar than the four that failed before it has not been measured against
anything.

G1 is the only number that moved, because this bar judges ONE symbol rather than
32. 500 and 150 are roughly 18% and 16% of the available sessions. They are set
deliberately low: with no skip rules, a large fraction of sessions should
produce a trade, so **missing G1 is a statement about the implementation, not
about the market**, and the report is required to investigate rather than file
the count as a finding.

### The three-way verdict, and when each applies

Fixed here, before the count is known, exactly as ENGINE-2 fixed it:

- **PASS** — all five.
- **INCONCLUSIVE (sample)** — G1 missed. Too few trades to believe a good number
  or a bad one.
- **INCONCLUSIVE (power)** — G1 met, G2 missed, but the 95% interval on the mean
  still contains the threshold. Measured, and the answer is "not enough signal".
- **FAIL** — anything else, including a G2 miss whose interval excludes the
  threshold.

## The control, and the order the numbers are reported in

`null_coinflip.v1.matched` runs on the same symbols, the same days, the same
decision minutes and the same stop distances, with the direction chosen by a
deterministic coin flip and the same 2R-from-fill target. It answers the only
question that matters about the filter: **did knowing which way to point pay for
itself?**

**Gross versus the control is reported BEFORE net.** ENGINE-1's decisive finding
was that both its models were below a coin flip before costs, which settles the
net number without further argument.

## Median beside mean, always

`orb_mtf.v1` returned a mean of +1.53¢ a share and a median of −25¢: three
trades out of 448 carried the whole positive number and the other 445 lost
money. A mean-only report is incomplete and misleading. Every headline figure in
the ENGINE-4 report carries its median next to it, and the report states what
the top three trades contributed.

## Models five and six

`orb_reclaim.v1`, `sweep_displacement_fvg.v1`, `orb_htf_structural.v1` and
`orb_mtf.v1` were all measured and all failed. These two are the fifth and sixth
in the family, and they are run as a PAIR, which is two more chances for one of
them to look good by luck. Consequences, fixed here:

1. The out-of-sample window is the verdict and is read once.
2. The two variants are judged separately and neither borrows the other's
   result.
3. The report says all of this in plain language, near the top, not in a
   footnote.

## Survivorship and scope, stated

Three index ETFs, all of which exist today. No delisted instrument is involved
and none can be — but SPY, QQQ and IWM are also the three most liquid, most
arbitraged, most efficiently priced day-trading vehicles in the market. A result
here does not transfer to single names, and a null result here does not prove a
null result on them either.

No borrow, locate, halt, dividend or corporate-action modelling. Prices are
Polygon's split- and dividend-adjusted series, which is the honest choice for a
14-year backtest and does mean the dollar prices in older years are not the
prices printed on the tape that day. Per-share cost figures are therefore
expressed against the ADJUSTED price and the report says so.

## Anti-lookahead

Everything new is subject to the same treatment as everything old:
`tests/test_no_lookahead.py` attacks the primitives, `test_no_lookahead_mtf.py`
attacks the higher-timeframe context, and `test_no_lookahead_end_to_end.py` is
extended to both of these variants — the whole model is re-run against a tape
whose future has been amputated and must produce identical signals.
