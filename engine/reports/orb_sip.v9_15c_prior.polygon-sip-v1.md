# `orb_sip.v9_15c_prior` — the owner's stop on the 15-minute close-confirmed break

**Verdict: FAILED.** Decided on 2024-01-01 → 2026-08-28 and on nothing else.

Snapshot `polygon-sip-v1`, unchanged; ENGINE-6's selection reused byte for byte; nothing downloaded. Gate: [`../models/orb_sip.v9_15c_prior/GATE.md`](../models/orb_sip.v9_15c_prior/GATE.md), committed before any number below existed. Git rev `4ae1b70`. Run took 1.5 minutes.

## In plain English

**What changed, and only this.** ENGINE-13 drew a 15-minute opening range, waited for a five-minute candle to CLOSE outside it, and then put its stop at the far side of that 15-minute range — a median 177 cents away. It lost $13 per $1,000 risked, and its own diagnosis was that waiting for the close moves the ENTRY further from the far side, so the risk denominator inflates: *it buys a better stop and sells a worse price, and the price is the bigger number*. **The owner's rule keeps the confirmed entry and brings the stop to meet it** — the low of the five-minute candle immediately before the one that triggered, his own worked example being 103 when the trigger candle ran 105 to 106 and the one before it ran 103 to 105.

**The stop rule is not itself new.** ENGINE-10 measured it on the five-minute range with a resting-order entry and it came back PARTIAL at +$15 a trade against the incumbent's +$17 — statistically the same thing. What has never been measured is this pairing: the confirmed entry with the near stop.

**This is the ninth reading of 2016–2026, and there is no cross-era check in this lane** — the 2012–2015 snapshot was set aside at the owner's instruction, so nothing here has been confirmed on a second market. Three comparisons on one window is nearer a 14% false-positive rate than 5%; the corrected interval is printed beside each.

- **v2 (the incumbent: 5-min range, opposite-extreme stop)** — 10,545 trades over 667 days. **+20 dollars a trade** (+0.0199R); median -118 dollars; 45.0% green; **31.6% stopped out**. 95% range -2 dollars to +42 dollars, which contains zero.
- **c15_range (ENGINE-13: 15-min range, range-extreme stop)** — 11,476 trades over 667 days. **-13 dollars a trade** (-0.0128R); median -36 dollars; 47.0% green; **14.2% stopped out**. 95% range -26 dollars to -0 dollars, which excludes zero.
- **c15_prior (the owner's spec: stop on the preceding candle)** — 11,462 trades over 667 days. **-66 dollars a trade** (-0.0663R); median -1,013 dollars; 33.2% green; **59.3% stopped out**. 95% range -98 dollars to -35 dollars, which excludes zero.

- **`c15_prior` minus the incumbent `v2`**, paired by day: **-90 dollars** a trade (-0.0901R), 95% -122 dollars to -58 dollars over 667 days. **Entirely below zero — it measurably LOST.** Corrected for three shots: -130 dollars to -51 dollars.
- **`c15_prior` minus ENGINE-13's `c15_range`**, paired by day: **-56 dollars** a trade (-0.0561R), 95% -82 dollars to -30 dollars over 667 days. **Entirely below zero — it measurably LOST.** Corrected for three shots: -88 dollars to -24 dollars.

- **Verdict**: **FAILED**.

**Which gates carried the verdict, in words.** Q1 passed (sample (verdict window)). Q2 FAILED (it beats the incumbent (paired by day, net R)). Q3 FAILED (it fixes ENGINE-13 (c15_prior minus c15_range, paired by day)). Q4 FAILED (sign). Q5 passed (the knock-out guard). Q6 FAILED (not a half-window artefact).

## Stop geometry — read first, because it has explained every result here

| arm | trades | median stop | % of price | **× 14-day ATR** | commission as share of risk | **stopped out** | per $1,000 |
|---|---|---|---|---|---|---|---|
| `v2` | 10,545 | 133.9¢ | 2.840% | **0.75** | 0.0075 | **31.6%** | +20 dollars |
| `c15_range` | 11,476 | 177.0¢ | 3.651% | **0.99** | 0.0056 | **14.2%** | -13 dollars |
| `c15_prior` | 11,462 | 55.4¢ | 1.126% | **0.31** | 0.0180 | **59.3%** | -66 dollars |
| *ENGINE-10 `v4_trigger` (the breakout candle)* | — | — | — | *0.17* | — | *85.8%* | *-605 dollars* |
| *ENGINE-10 `v4_prior` (the candle before it, 5-min range)* | — | — | — | *0.51* | — | *44.3%* | *+15 dollars* |
| *ENGINE-6 published 10%-of-ATR stop* | — | — | — | *0.10* | — | *90.1%* | *-723 dollars* |

**The stop came in TIGHTER than the gate predicted.** It landed at **0.31 ATR**, below the 0.40–0.70 band written down before the run, with a **59.3%** knock-out rate — under the 60% guard, but only just. This is the ENGINE-6 failure mode approached rather than reached: between `v4_prior`'s 0.51 ATR at 44.3% stopped and `v4_trigger`'s 0.17 ATR at 85.8%, this sits closer to the arm that failed than to the one that did not. **The prior was wrong about the magnitude and right about the direction.**

## The ENGINE-13 repair, quantified

- ENGINE-13 trailed the incumbent by **-33 dollars** a trade.
- Changing only the stop moved it **-53 dollars** a trade.
- That closes **-163%** of the gap.

## When the fill gapped through the stop

The market order fills at the next bar's open, which can be beyond the planned stop. Those positions are dead on arrival and are recorded as immediate stop-outs rather than skipped or rescued.

- **5** of 11,462 trades (0.04%).
- Median fill-to-stop distance on those: 0.7¢. Their mean net R is -3.3662 (-3,366 dollars).

## What each arm skipped, and why

| count | `v2` | `c15_range` | `c15_prior` |
|---|---|---|---|
| block_inside_range | 0 | 875,399 | 875,399 |
| day_never_confirmed | 0 | 6,786 | 6,786 |
| days_seen | 53,573 | 53,573 | 53,573 |
| prior_stop_signals | 0 | 0 | 46,717 |
| signals | 53,183 | 46,784 | 46,784 |
| signals_long | 26,751 | 23,276 | 23,276 |
| signals_short | 26,432 | 23,508 | 23,508 |
| skip_doji_opening_candle | 381 | 0 | 0 |
| skip_inverted_stop | 0 | 0 | 8 |
| skip_no_preceding_candle | 0 | 0 | 59 |
| skip_zero_width_range | 9 | 3 | 3 |

## Where `c15_prior` and the incumbent disagree

- Both traded **9,305** of the same symbol-days; they took **opposite sides** on **2,285** (24.6%).
- On those, `c15_prior` returned -182 dollars a trade and the incumbent -850 dollars.
- The incumbent traded **1,240** symbol-days `c15_prior` never opened (the range never closed through, or the stop inverted). The incumbent earned -345 dollars a trade on exactly those.

## The verdict window, 2024-01-01 → 2026-08-28

| arm | trades | days | gross R | net R | median | money per $1,000 | 95% range | hit | stopped |
|---|---|---|---|---|---|---|---|---|---|
| `v2` | 10,545 | 667 | +0.0324 | +0.0199 | -0.1180 | +20 dollars | -2 dollars to +42 dollars | 45.0% | 31.6% |
| `c15_range` | 11,476 | 667 | -0.0038 | -0.0128 | -0.0363 | -13 dollars | -26 dollars to -0 dollars | 47.0% | 14.2% |
| `c15_prior` | 11,462 | 667 | -0.0341 | -0.0663 | -1.0135 | -66 dollars | -98 dollars to -35 dollars | 33.2% | 59.3% |

True zero-cost `c15_prior`: +nanR.

### The two halves (Q6)

| half | mean net R | money per $1,000 |
|---|---|---|
| first half | -0.0563 | -56 dollars |
| second half | -0.0762 | -76 dollars |

## The contaminated window, 2016-01-01 → 2023-12-31 — a disclosure, not a verdict

| arm | trades | net R | money per $1,000 | hit | stopped |
|---|---|---|---|---|---|
| `v2` | 32,392 | +0.0202 | +20 dollars | 42.9% | 37.4% |
| `c15_range` | 35,307 | -0.0081 | -8 dollars | 46.9% | 16.5% |
| `c15_prior` | 35,254 | -0.0669 | -67 dollars | 32.7% | 60.0% |

## Caveats, and what would change the answer

- **The stop rule is not new; the pairing is.** ENGINE-10 already measured this stop on the five-minute range at +$15 against the incumbent's +$17. A result close to the incumbent here is the third PARTIAL in the same family, not a discovery.
- **Ninth reading of this window**, no correction applied because none exists.
- **No cross-era check.** The 2012–2015 snapshot was set aside, so nothing here has been confirmed on a second market.
- Fills are modelled from one-minute OHLC and cannot see inside a bar. No borrow, halt, spread or partial-fill question has been touched.
- **No leveraged portfolio figure appears anywhere**, by pre-registration.

