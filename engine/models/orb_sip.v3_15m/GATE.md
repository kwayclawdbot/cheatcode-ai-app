# Pre-registered gate — `orb_sip.v3_15m` (ENGINE-8, second variant)

**Written and committed before the first evaluation was run**, in the same
commit as [`../orb_sip.v3/GATE.md`](../orb_sip.v3/GATE.md), the two models, the
data layer, the tests and the runner. That commit is earlier in `git log` than
the commit carrying any number produced by them.

This file is deliberately short. **Everything in `orb_sip.v3`'s gate applies
here unchanged** — the window, the contamination disclosure, the trend
definition, the sample-floor reasoning, the required report contents, the "no
threshold moves afterwards" clause. Only two things are specific to this
variant, and they are both stated before any number exists.

## The model

`orb_sip.v3` with the opening range extended from **09:30-09:35** to
**09:30-09:45**, and with nothing else touched: same universe, same pool, same
selection, same entry on the breakout in the direction of the opening candle,
same stop at the opposite extreme of that candle, same hold-to-close exit, same
daily-trend-agreement gate on the last fully closed daily bar, same costs, same
1% sizing and 4x gross cap, same build and held-back windows.

## The judgement call, made before the run and stated as a choice

"The opposite extreme of the opening candle" is unambiguous on a 5-minute range
and ambiguous on a 15-minute one, because there are two candles it could mean.

**We take the opposite extreme of the WHOLE 09:30-09:45 range**, not of the last
five-minute candle inside it.

The reason is what made `orb_sip.v2` work at all. In v2 the entry and the stop
are the two ends of one object: the trade is *defined* by the opening candle, it
is armed by a break of one edge, and it is dead when price returns through the
other. The faithful analogue on a 15-minute range is the 15-minute range. Taking
the stop off the last five minutes inside it would place the stop somewhere the
setup does not point at, and would divide the result by an R that is not the
range being broken out of.

**The other reading is a different model. It is not tested in this lane and no
number here speaks to it.** If it is ever tested it needs its own pre-registered
gate, reported beside this one rather than in place of it.

The direction rule is read the same way: the sign of the whole 09:30-09:45
candle, its close against its open.

## The deviation this variant carries, and why

The stocks-in-play selection is ENGINE-6's, taken **as of 09:35**, for this
variant as well as for the 5-minute one. The faithful reading would re-rank the
universe on 09:30-09:45 volume; the one-minute cache exists only for the
symbol-days the 09:35 selection named, and re-selecting would require a download
the brief forbids.

This is **not lookahead** — 09:35 is strictly less information than 09:45 — and
it has one virtue: both variants trade the same candidate symbol-days, so the
comparison between them is a comparison of range length and of nothing else. It
is still a deviation from the spec and every report says so.

## The bar — U1 to U5, on the HELD-BACK window, after costs

Identical in kind and in number to `orb_sip.v3`'s T1-T5, read on the same
held-back window, 2025-08-29 → 2026-08-28.

| id | gate | threshold |
|---|---|---|
| **U1** | sample | ≥ **750** trades in the held-back window |
| **U2** | sign | mean **gross** R > 0 **and** mean **net** R > 0 |
| **U3** | direction beats a coin flip | paired against the matched control at the same 15-minute geometry, gross, 95% interval **excludes zero** in the model's favour |
| **U4** | the filter is the thing | in play minus twenty random eligible names under identical rules, paired by day, net, 95% interval **excludes zero** in the model's favour |
| **U5** | portfolio | positive total return **and** annualised Sharpe ≥ **1.0**, net of costs |

**A wider range takes fewer trades**: it consumes more of the morning before it
arms, its breakouts fill less often, and the trend gate then cuts what is left.
The 750-trade floor is stated here in advance for exactly that reason. **If this
variant comes in thin, the verdict is INCONCLUSIVE (sample) and nothing else is
read** — a small number is not to be talked up into a result, and the window is
not widened to fix it.

## The verdict

The same four outcomes, mapped the same way, fixed before any count is known:
CONFIRMED OUT OF SAMPLE, PARTIAL, FAILED, INCONCLUSIVE (sample). See
[`../orb_sip.v3/GATE.md`](../orb_sip.v3/GATE.md).

**Both models are reported regardless of what either does.** The report does not
lead with whichever came out better, and it states that two models on one
held-back year carries about a 10% chance that one of them clears zero by luck.
