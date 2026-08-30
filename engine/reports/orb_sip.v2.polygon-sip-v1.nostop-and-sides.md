# DIAGNOSTIC — `orb_sip.v2` with the stop removed, and the two sides split

**This file has no gate and decides nothing.** It is a post-mortem, in the shape of ENGINE-6's. Both questions are asked of a window that has now been read seven times, and the second is a post-hoc subgroup split — the single most reliable way to manufacture a false positive. Nothing here may be used to authorise a model or claim an edge.

## Question 1 — no stop at all, verdict window 2024-01-01 → 2026-08-28

Both arms take the identical entry on the identical symbol-days. The no-stop arm never exits early, so every one of its trades is resolved at the 15:59 bell. Its R is measured against the ORIGINAL opening-range stop distance so the two columns are the same unit.

| | with the stop | **no stop** |
|---|---|---|
| trades | 10,545 | 10,545 |
| **finished positive** | **45.0%** | **49.6%** |
| mean net R | +0.0199 | +0.0101 |
| **money per $1,000 risked** | **+20 dollars** | **+10 dollars** |
| 95% range | -2 dollars to +42 dollars | -19 dollars to +39 dollars |
| median net R | -0.1180 | -0.0086 |
| mean net % of price | +0.082% | +0.093% |
| worst single trade | -1.74R | -57.60R |
| best single trade | +30.98R | +30.98R |

**No stop minus the stop, paired by day: -9 dollars a trade** (95%: -29 dollars to +10 dollars, 667 days). The range contains zero, so no difference is established.

**Of the 3,331 trades the stop actually closed, 493 (14.8%) would have finished POSITIVE had it not been there** — and 1,670 (50.1%) would have finished worse than the 1R the stop capped them at.

Those rescued trades averaged +901 dollars each. Across ALL stopped trades, letting them run averaged -1,059 dollars against the -1,028 dollars the stop booked. **So on the trades it fired, the stop SAVED money.**

## Question 1 — no stop at all, the whole tape 2016-01-01 → 2026-08-28

Both arms take the identical entry on the identical symbol-days. The no-stop arm never exits early, so every one of its trades is resolved at the 15:59 bell. Its R is measured against the ORIGINAL opening-range stop distance so the two columns are the same unit.

| | with the stop | **no stop** |
|---|---|---|
| trades | 42,937 | 42,937 |
| **finished positive** | **43.4%** | **49.3%** |
| mean net R | +0.0201 | +0.0106 |
| **money per $1,000 risked** | **+20 dollars** | **+11 dollars** |
| 95% range | +8 dollars to +32 dollars | -5 dollars to +26 dollars |
| median net R | -0.1836 | -0.0169 |
| mean net % of price | +0.077% | +0.081% |
| worst single trade | -20.62R | -57.60R |
| best single trade | +30.98R | +30.98R |

**No stop minus the stop, paired by day: -10 dollars a trade** (95%: -20 dollars to +0 dollars, 2,679 days). The range contains zero, so no difference is established.

**Of the 15,461 trades the stop actually closed, 2,528 (16.4%) would have finished POSITIVE had it not been there** — and 7,778 (50.3%) would have finished worse than the 1R the stop capped them at.

Those rescued trades averaged +1,027 dollars each. Across ALL stopped trades, letting them run averaged -1,061 dollars against the -1,035 dollars the stop booked. **So on the trades it fired, the stop SAVED money.**

## Question 2 — with the stop, bullish ORB against bearish ORB

The model's side IS the sign of the opening candle, so a bullish opening range is a long and a bearish one is a short. **The matched coin-flip control is split the same way and printed beside it**, because the market rose a great deal over this period: a long/short gap in the model means nothing unless the control does not show the same gap.

### verdict window 2024-01-01 → 2026-08-28

| arm | side | trades | positive | mean net R | money per $1,000 | 95% range | stopped |
|---|---|---|---|---|---|---|---|
| model | bullish (long) | 5,429 | 44.6% | +0.0148 | +15 dollars | -16 dollars to +45 dollars | 32.3% |
| model | bearish (short) | 5,116 | 45.3% | +0.0252 | +25 dollars | -7 dollars to +58 dollars | 30.8% |
| coin flip | bullish (long) | 4,262 | 44.2% | +0.0030 | +3 dollars | -31 dollars to +37 dollars | 32.1% |
| coin flip | bearish (short) | 4,209 | 45.5% | +0.0194 | +19 dollars | -16 dollars to +55 dollars | 31.0% |

- **model: bullish minus bearish = -10 dollars a trade** (95%: -55 dollars to +34 dollars). **Contains zero.**
- **coin flip: bullish minus bearish = -16 dollars a trade** (95%: -66 dollars to +33 dollars). **Contains zero.**

**The comparison that actually answers the question — how much each side beats a coin flip taking the SAME side.** The raw rows above conflate two different things: how well the ORB signal picks, and how well that side did in this period regardless of signal. Subtracting the control on each side separates them. (Unpaired two-sample: the model and the control do not trade the same symbol-days once split by side, so these are two populations over the same universe and period, not matched trades.)

| side | model | coin flip, same side | **the signal is worth** | 95% range |
|---|---|---|---|---|
| bullish (long) | +15 dollars | +3 dollars | **+12 dollars** | -34 dollars to +57 dollars |
| bearish (short) | +25 dollars | +19 dollars | **+6 dollars** | -43 dollars to +54 dollars |

**On this window the bullish ORB is the side where the signal adds more** — +12 dollars over a coin flip on the bullish side against +6 dollars on the bearish side. Note this is the OPPOSITE of what the raw rows suggest: shorts look better in absolute terms because shorting these names paid in this period whatever you did, and the coin flip collects most of that.

### the whole tape 2016-01-01 → 2026-08-28

| arm | side | trades | positive | mean net R | money per $1,000 | 95% range | stopped |
|---|---|---|---|---|---|---|---|
| model | bullish (long) | 21,572 | 42.8% | +0.0141 | +14 dollars | -2 dollars to +30 dollars | 36.2% |
| model | bearish (short) | 21,365 | 44.0% | +0.0263 | +26 dollars | +9 dollars to +43 dollars | 35.8% |
| coin flip | bullish (long) | 17,718 | 41.9% | -0.0103 | -10 dollars | -28 dollars to +8 dollars | 36.6% |
| coin flip | bearish (short) | 17,712 | 43.9% | +0.0207 | +21 dollars | +2 dollars to +39 dollars | 35.4% |

- **model: bullish minus bearish = -12 dollars a trade** (95%: -36 dollars to +11 dollars). **Contains zero.**
- **coin flip: bullish minus bearish = -31 dollars a trade** (95%: -57 dollars to -5 dollars). Excludes zero.

**The comparison that actually answers the question — how much each side beats a coin flip taking the SAME side.** The raw rows above conflate two different things: how well the ORB signal picks, and how well that side did in this period regardless of signal. Subtracting the control on each side separates them. (Unpaired two-sample: the model and the control do not trade the same symbol-days once split by side, so these are two populations over the same universe and period, not matched trades.)

| side | model | coin flip, same side | **the signal is worth** | 95% range |
|---|---|---|---|---|
| bullish (long) | +14 dollars | -10 dollars | **+24 dollars** | +0 dollars to +49 dollars |
| bearish (short) | +26 dollars | +21 dollars | **+6 dollars** | -19 dollars to +30 dollars |

**On this window the bullish ORB is the side where the signal adds more** — +24 dollars over a coin flip on the bullish side against +6 dollars on the bearish side. Note this is the OPPOSITE of what the raw rows suggest: shorts look better in absolute terms because shorting these names paid in this period whatever you did, and the coin flip collects most of that.

### The same split by era, model only, money per $1,000 risked

| era | bullish (long) | bearish (short) | difference |
|---|---|---|---|
| 2016-2019 | +16 dollars (n=7,938) | +28 dollars (n=7,999) | -13 dollars |
| 2020-2023 | +12 dollars (n=8,205) | +25 dollars (n=8,250) | -13 dollars |
| 2024-2026 | +15 dollars (n=5,429) | +25 dollars (n=5,116) | -10 dollars |

## What this diagnostic does NOT establish

- **It has no pre-registered bar.** Nothing here was written down before the numbers existed, so nothing here is a result in the sense the rest of this directory uses the word.
- **The side split is post-hoc.** Splitting an already-measured set of trades into two subgroups and reporting the better one is how false positives are made. The coin-flip rows are the only reason the model's split can be read at all, and even then a difference that survives them would need its own pre-registered lane on data nobody has looked at.
- **Seventh reading of this window**, no correction applied.
- The no-stop arm carries unbounded single-trade risk. A per-trade average says nothing about the size of the worst day, and no position sizing, margin or overnight-gap question has been modelled.

