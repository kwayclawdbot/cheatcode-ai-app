# `orb_sip.v5_15c` — a 15-minute opening range, entered on a five-minute close

**Verdict: INCUMBENT HOLDS.** Decided on the window 2024-01-01 → 2026-08-28 and on nothing else.

Traded snapshot `polygon-sip-v1`, unchanged. SPY reference from `polygon-deep-v1`, unchanged — no statistic mixes prices from the two, the reference returns a sign and nothing else. Selection is ENGINE-6's `selection.json.gz`, byte for byte. Gate: [`../models/orb_sip.v5_15c/GATE.md`](../models/orb_sip.v5_15c/GATE.md), committed before any number below existed. Git rev `7d4f2be`. Nothing was downloaded; the run took 2.5 minutes.

## In plain English

**What was compared.** Every trading day, take the same twenty US stocks — the ones whose first five minutes traded the most abnormal volume, which is the only selector this programme has ever measured as doing work — and trade each of them three different ways.

- **baseline** — the incumbent. The 09:30–09:35 candle is the range; a resting order sits at the edge the candle closed toward; the stop is the other end of that candle; hold to the closing bell.
- **orb15c** — the owner's change. The range is 09:30–**09:45**; nothing is taken until a **five-minute candle CLOSES** outside it; the side is whichever side it closed through; the stop is the other end of the fifteen-minute range; hold to the closing bell.
- **orb15c_spy** — the same as orb15c, but the trade is skipped unless SPY moved the same way over the same window (from 09:45 to the close of the confirming candle).

**This is the sixth reading of this window.** ENGINE-6 read the whole 2016–2026 tape, the ENGINE-6 stop sweep contaminated 2016–2023, and ENGINE-7, -8, -9, -10 and -11 all read windows inside 2024–2026. There is no un-looked-at data left in any snapshot on disk, and fetching some would mean paid Polygon calls, which this lane was forbidden. No correction is applied because none is available. **Everything below is suggestive, not conclusive**, and the era table is the substitute for a window nobody had seen.

**The wider stop is not free, and part of it was chosen with hindsight.** The one thing every earlier lane taught this programme is that wider stops did better on this tape. A fifteen-minute range is wider than a five-minute one by construction, so **orb15c starts with an advantage borrowed from a window it is being judged on**. That is exactly why the comparison here is against the incumbent — which carries the same advantage — and never against zero.

**Three comparisons on one window is three chances to look good by luck.** With three shots at a 5% test the chance that at least one clears by chance alone is nearer 14% than 5%. The gate stays the 95% interval, unchanged from ENGINE-6 onward; the stricter interval that corrects for three shots is printed beside every comparison.

- **baseline (orb_sip.v2, the incumbent)** — 10,545 trades over 667 trading days. After commission and slippage the average trade returned **+0.0199** times what was risked on it, i.e. **+20 dollars a trade** for a trader risking $1,000. The middle trade returned -0.1180 (-118 dollars), 45.0% finished green and 31.6% were stopped out. The 95% range around the average is -2 dollars to +42 dollars**, which contains zero**.

- **orb15c (15-min range, 5-min close)** — 11,476 trades over 667 trading days. After commission and slippage the average trade returned **-0.0128** times what was risked on it, i.e. **-13 dollars a trade** for a trader risking $1,000. The middle trade returned -0.0363 (-36 dollars), 47.0% finished green and 14.2% were stopped out. The 95% range around the average is -26 dollars to -0 dollars**, which excludes zero**.

- **orb15c_spy (the same, plus SPY confluence)** — 6,839 trades over 667 trading days. After commission and slippage the average trade returned **-0.0159** times what was risked on it, i.e. **-16 dollars a trade** for a trader risking $1,000. The middle trade returned -0.0389 (-39 dollars), 46.8% finished green and 14.2% were stopped out. The 95% range around the average is -33 dollars to +1 dollars**, which contains zero**.


- **orb15c minus the incumbent**, paired day by day: **-34 dollars** a trade on $1,000 of risk (-0.0340R), with a 95% range of -53 dollars to -15 dollars, over 667 days both arms traded. **That range lies entirely below zero**. Corrected for taking three shots: -58 dollars to -11 dollars.

- **orb15c_spy minus the incumbent**, paired day by day: **-44 dollars** a trade on $1,000 of risk (-0.0436R), with a 95% range of -67 dollars to -20 dollars, over 667 days both arms traded. **That range lies entirely below zero**. Corrected for taking three shots: -73 dollars to -15 dollars.

- **orb15c_spy minus orb15c (what the SPY filter alone did)**, paired day by day: **-10 dollars** a trade on $1,000 of risk (-0.0096R), with a 95% range of -23 dollars to +4 dollars, over 667 days both arms traded. That range contains zero, so no difference is established. Corrected for taking three shots: -26 dollars to +7 dollars.


- **Verdict**: **INCUMBENT HOLDS**.

**Which gates carried the verdict, in words.** W1 passed (sample (verdict window)). W2 FAILED (`orb15c` beats `baseline` (verdict, paired by day, net R)). W3 FAILED (`orb15c_spy` beats `baseline` (verdict, paired by day, net R)). W4 FAILED (does SPY confluence add anything (verdict, paired by day, net R, spy minus A)). W5 FAILED (sign, per arm (verdict)). W6 FAILED (era sign agreement (2016-2019, 2020-2023, 2024-2026)).

**The incumbent held.** Neither change beat the five-minute range by a margin that clears its own error bar, so nothing is displaced. That is a useful result: the cheapest way to break a working system is to replace a measured component with an unmeasured one.

Gates passed: W1. Gates failed: W2, W3, W4, W5, W6.

## The pre-registered bar, and what it read

| id | gate | threshold | observed | |
|---|---|---|---|---|
| **W1** | sample (verdict window) | >=3,000 for orb15c, >=1,000 for orb15c_spy | orb15c=11,476, orb15c_spy=6,839 | PASS |
| **W2** | `orb15c` beats `baseline` (verdict, paired by day, net R) | 95% interval excludes zero, in the challenger's favour | -0.0340 (95%: -0.0533 to -0.0148, days=667) | **FAIL** |
| **W3** | `orb15c_spy` beats `baseline` (verdict, paired by day, net R) | 95% interval excludes zero, in the challenger's favour | -0.0436 (95%: -0.0673 to -0.0200, days=667) | **FAIL** |
| **W4** | does SPY confluence add anything (verdict, paired by day, net R, spy minus A) | 95% interval excludes zero, in EITHER direction | -0.0096 (95%: -0.0232 to +0.0040, days=667) | **FAIL** |
| **W5** | sign, per arm (verdict) | mean gross R > 0 AND mean net R > 0 | baseline: gross=+0.0324/net=+0.0199, orb15c: gross=-0.0038/net=-0.0128, orb15c_spy: gross=-0.0068/net=-0.0159 | **FAIL** |
| **W6** | era sign agreement (2016-2019, 2020-2023, 2024-2026) | for any arm clearing W2 or W3, mean net R > 0 in all three eras | orb15c: 2016-2019=-0.0097, 2020-2023=-0.0066, 2024-2026=-0.0128; orb15c_spy: 2016-2019=-0.0074, 2020-2023=-0.0059, 2024-2026=-0.0159 | **FAIL** |

## The verdict window, 2024-01-01 → 2026-08-28

Gross before net; the median beside the mean; the day count beside the trade count, because trades on the same morning are not independent of each other and the day count is the honest sample size.

| arm | trades | days | mean gross R | true zero cost | mean net R | median net R | money per $1,000 | 95% range | hit | stopped out |
|---|---|---|---|---|---|---|---|---|---|---|
| `baseline` | 10,545 | 667 | +0.0324 | +0.0437 | +0.0199 | -0.1180 | +20 dollars | -2 dollars to +42 dollars | 45.0% | 31.6% |
| `orb15c` | 11,476 | 667 | -0.0038 | +0.0041 | -0.0128 | -0.0363 | -13 dollars | -26 dollars to -0 dollars | 47.0% | 14.2% |
| `orb15c_spy` | 6,839 | 667 | -0.0068 | +0.0010 | -0.0159 | -0.0389 | -16 dollars | -33 dollars to +1 dollars | 46.8% | 14.2% |

| *random 20 (reference, not an arm)* | 11,118 | 667 | — | — | -0.0547 | -0.7185 | -55 dollars | -81 dollars to -28 dollars | 38.2% | 48.5% |

| slice | n | hit | mean R | median R | mean % | payoff | PF | total R | maxDD R | max losing run |
|---|---|---|---|---|---|---|---|---|---|---|
| baseline | 10545 | 45.0% | 0.020 | -0.118 | 0.082% | 1.28 | 1.05 | 209.4 | 66.9 | 20 |
| orb15c | 11476 | 47.0% | -0.013 | -0.036 | -0.034% | 1.07 | 0.95 | -147.4 | 149.8 | 12 |
| orb15c_spy | 6839 | 46.8% | -0.016 | -0.039 | -0.044% | 1.07 | 0.94 | -108.8 | 125.8 | 11 |
| random 20 | 11118 | 38.2% | -0.055 | -0.718 | -0.018% | 1.46 | 0.90 | -607.8 | 626.8 | 16 |

### Proof that the baseline arm IS the incumbent

ENGINE-7 decided its PARTIAL on this exact window. If the `baseline` arm here does not reproduce those figures, this lane's comparison is against something that is not the incumbent and no number below means anything. **The first run of this lane failed this check** — it replayed both arms of ENGINE-6's selection file, blending the stocks-in-play picks with the random-20 control, and returned a baseline of −0.0192R. That run was discarded, the selection filter was fixed, and this is the re-run.

| | ENGINE-7 reported | this run | |
|---|---|---|---|
| trades | 10,545 | 10,545 | match |
| mean gross R | +0.0324 | +0.0324 | match |
| mean net R | +0.0199 | +0.0199 | match |
| median net R | -0.1180 | -0.1180 | match |
| hit rate | 45.0% | 45.0% | match |
| stopped out | 31.6% | 31.6% | match |

## Realised stop width — the parameter that has explained every result here

| arm | trades | median stop | % of price | in 14-day ATRs | commission as share of risk | stopped out |
|---|---|---|---|---|---|---|
| baseline | 10,545 | 134¢ | 2.84% | 0.75 | 0.7% | 31.6% |
| orb15c | 11,476 | 177¢ | 3.65% | 0.99 | 0.6% | 14.2% |
| orb15c_spy | 6,839 | 175¢ | 3.62% | 0.97 | 0.6% | 14.2% |

The fifteen-minute range plus the confirming close widened the median stop from **134¢ to 177¢**, a factor of **1.32x**. R divides by that, so the same dollar move reports as a smaller R in the orb15c arms. **The money-per-$1,000 column is the one the gate is decided on, and it already accounts for this.**

## Taking direction from the break instead of the opening candle's sign

orb15c and the incumbent both traded **9,316** of the same symbol-days in the verdict window. They took **opposite sides** on **2,289** of them (24.6%). On those symbol-days orb15c returned -178 dollars a trade and the incumbent -850 dollars.

## What the close-confirmation rule never opens, and what it cost

The incumbent traded **1,229** symbol-days in the verdict window on which orb15c never took a trade — the range never closed through by 15:30, or the range itself was unusable. On exactly those symbol-days the incumbent returned **-343 dollars** a trade over 555 days. **Those are trades the confirmation rule declined to take, and they lost money, so the rule's selectivity saved something.**

Census, orb15c (per symbol-day seen):

| count | n |
|---|---|
| block_inside_range | 875,399 |
| day_never_confirmed | 6,786 |
| days_seen | 53,573 |
| signals | 46,784 |
| signals_long | 23,276 |
| signals_short | 23,508 |
| skip_zero_width_range | 3 |

## What the SPY filter removed, and what those trades did

The filter removed **4,637** of orb15c's 11,476 verdict-window trades (40.4%). The **removed** trades returned **-8 dollars** a trade; the **kept** trades returned **-16 dollars**.

**The trades the filter removed did BETTER than the trades it kept.** That is ENGINE-8's failure mode, reproduced: the filter is not discriminating in the direction it was supposed to, and it is throwing away the better half.

Census, orb15c_spy:

| count | n |
|---|---|
| block_inside_range | 875,399 |
| day_never_confirmed | 6,786 |
| days_seen | 53,573 |
| signals | 28,577 |
| signals_long | 14,715 |
| signals_short | 13,862 |
| skip_confluence | 18,207 |
| skip_confluence_long | 8,561 |
| skip_confluence_short | 9,646 |
| skip_zero_width_range | 3 |
| spy_agrees | 28,577 |
| spy_disagrees | 17,961 |
| spy_flat | 246 |

## The era table — the substitute for a window nobody had seen

There is no un-looked-at span left on disk. The next best check available without paid downloads is whether a result keeps its sign across three eras that were never used to choose anything in this lane.

| arm | 2016-2019 | 2020-2023 | 2024-2026 |
|---|---|---|---|
| `baseline` | +22 dollars (n=15,937) | +18 dollars (n=16,455) | +20 dollars (n=10,545) |
| `orb15c` | -10 dollars (n=17,456) | -7 dollars (n=17,851) | -13 dollars (n=11,476) |
| `orb15c_spy` | -7 dollars (n=10,498) | -6 dollars (n=11,240) | -16 dollars (n=6,839) |

## The contaminated window, 2016-01-01 → 2023-12-31 — a disclosure, not a verdict

This is the window the ENGINE-6 stop-width sweep was run on. Nothing here can raise or lower the verdict.

| arm | trades | days | mean net R | money per $1,000 | hit | stopped out |
|---|---|---|---|---|---|---|
| `baseline` | 32,392 | 2,012 | +0.0202 | +20 dollars | 42.9% | 37.4% |
| `orb15c` | 35,307 | 2,012 | -0.0081 | -8 dollars | 46.9% | 16.5% |
| `orb15c_spy` | 21,738 | 2,012 | -0.0066 | -7 dollars | 47.1% | 16.6% |

## Caveats, and what would change the answer

- **The sixth reading.** Every session in this snapshot has been looked at by an earlier lane. No correction is applied and none exists. The only honest next step for any result here is forward, on sessions that have not happened yet.
- **The wide stop was not chosen blind.** orb15c's stop is wider because the range is wider, and 'wider is better' is knowledge taken from this same tape. The incumbent comparison controls for it; a comparison against zero would not.
- **The SPY confluence is one reading of many.** Sign of SPY's move from 09:45 to the confirming close. It could equally have been SPY's own opening range, its candle sign, a VWAP, or a magnitude threshold. One definition was written down and tested once. Trying a second after seeing this number would make the result meaningless.
- **The selector is not this lane's variable.** The twenty names come from a 09:30–09:35 relative-volume rule. A 15-minute selector would name different symbol-days and would need paid downloads, so it is out of scope and its absence is a declared limit.
- **0 symbol-days had no cached one-minute bars** and were skipped by every arm equally.
- **SPY reference unavailable** on 0 confirmed breaks, which were declined rather than guessed.
- Fills are modelled from one-minute OHLC and cannot see inside a bar. No live-execution question — borrow, halts, locked markets, partial fills on twenty simultaneous orders — has been touched.
- **No leveraged portfolio figure appears anywhere in this report**, by pre-registration. ENGINE-7's +223.9% came from four-times-levered exposure on a near-zero per-trade edge and was misread as a result.

