# `orb_sip.v10_prior_target` — the owner's stop WITH his target

**ENGINE-17 tested half a strategy.** It took the owner's stop — the low of the five-minute candle before the trigger — and paired it with ENGINE-13's exit, which holds to the 15:59 bell. The specification said *"targeting one to two r"*. Leaving the target out was an error in translating the spec, not a finding about it.

A stop and an exit are a matched pair. A WIDE stop with no target is coherent — that is the incumbent, and ENGINE-14 showed its whole profit lives above +1R. A TIGHT stop with a target is coherent — small R, banked often. **A tight stop with no target is the worst of both**: every knock-out of a close stop and none of the banking. ENGINE-17 measured that third thing.

Snapshot `polygon-sip-v1`, ENGINE-6's selection byte for byte, nothing downloaded. Verdict window 2024-01-01 → 2026-08-28. Git rev `ff4e884`. Run took 1.6 minutes.

## The four arms

| arm | trades | win rate | mean net R | money per $1,000 | 95% range | stopped | target hit | bell |
|---|---|---|---|---|---|---|---|---|
| `v2` | 10,545 | 45.0% | +0.0199 | **+20 dollars** | -2 dollars to +42 dollars | 31.6% | 0.0% | 68.4% |
| `prior_notgt` | 11,462 | 33.2% | -0.0663 | **-66 dollars** | -98 dollars to -35 dollars | 59.3% | 0.0% | 40.7% |
| `prior_1r` | 11,462 | 48.9% | -0.0623 | **-62 dollars** | -80 dollars to -44 dollars | 46.9% | 44.8% | 8.3% |
| `prior_2r` | 11,462 | 37.5% | -0.0658 | **-66 dollars** | -89 dollars to -43 dollars | 55.8% | 22.4% | 21.7% |

- **`prior_1r` minus `prior_notgt`** (what the target alone did), paired by day: **+6 dollars** a trade, 95% -21 dollars to +34 dollars, 667 days.
- **`prior_1r` minus the incumbent `v2`**, paired by day: **-84 dollars** a trade, 95% -109 dollars to -59 dollars, 667 days.
- **`prior_2r` minus `prior_notgt`** (what the target alone did), paired by day: **+2 dollars** a trade, 95% -20 dollars to +24 dollars, 667 days.
- **`prior_2r` minus the incumbent `v2`**, paired by day: **-88 dollars** a trade, 95% -116 dollars to -61 dollars, 667 days.

## The number that decides whether both stories can be true

The owner's report is that this setup *"typically"* yields one to two R. That is a claim about how far the trade travels, and it is measurable independently of any exit rule — maximum favourable excursion, on the owner's own entry and stop, before any target exists.

| ever reached | share of trades |
|---|---|
| +0.5R | **63.6%** |
| +1.0R | **44.9%** |
| +1.5R | **31.9%** |
| +2.0R | **22.5%** |
| +3.0R | **11.9%** |

Median MFE is **0.84R**.

**Read that table against the claim.** If a large share of trades reach +1R, the owner's experience and this tape agree about the setup and disagree only about the exit — and the 1R arm above is the arbiter. If few do, then the disagreement is about something else entirely: the universe being traded, which breakouts a human takes and which he skips, or the sample of days he remembers.

## The stop-before-target assumption, which now decides real trades

When one bar's range holds both the stop and the target, `fills.py` assumes the STOP was hit first. It is pessimistic and it is unchanged for this lane. With a stop this tight and a target this near, it decides more trades than in any previous lane, so the count is printed rather than buried.

| arm | ambiguous trades | share |
|---|---|---|
| `v2` | 0 | 0.0% |
| `prior_notgt` | 0 | 0.0% |
| `prior_1r` | 10 | 0.1% |
| `prior_2r` | 5 | 0.0% |

## What this still does NOT model, and it matters for the disagreement

- **It takes every breakout.** Twenty names a morning, every session, 11,000+ trades. A human takes a handful and skips the ones that look wrong. This measures the rule, not the trader applying it.
- **The universe is the day's twenty most abnormal-volume names** from the 1,000 most liquid US stocks — mostly mid-cap movers, not a watchlist.
- **No re-entry.** One attempt per name per day. A failed break that re-breaks is not taken.
- **Fills come from one-minute OHLC** and cannot see inside a bar.

