# `orb_sip.v11_hrsi` — the owner's hourly-RSI filter on the incumbent

**Verdict: NO EFFECT.** Decided on 2024-01-01 → 2026-08-28.

Gate: [`../models/orb_sip.v11_hrsi/GATE.md`](../models/orb_sip.v11_hrsi/GATE.md), committed before the hourly bars were fetched. **Nothing was replayed and no bars were cached**: the incumbent's trades already existed, hourly bars were fetched live, reduced to one RSI per symbol-day, and discarded.

## In plain English

**The filter.** Wilder's RSI(14) on regular-hours hourly bars, read at the last bar before the session opens — what an hourly chart shows at 09:30. A long is skipped if that RSI is above 70; a short is skipped if it is below 30. **The 30 is a mirror and a declared choice** — the owner named the long case, and the symmetric reading of short-term exhaustion is oversold for a short. Long and short are reported separately below so the mirror can be judged on its own.

**This is the eleventh reading of this window and the eighth variable tested across three studies.** No correction exists for that and none is applied.

- **Unfiltered baseline** — 10,541 trades, +19 dollars a trade.
- **Kept** (9,200 trades, 87.3%) — **+21 dollars** a trade.
- **Removed** (1,341 trades, 12.7%) — **+8 dollars** a trade.

The removed trades did worse than the kept ones, which is the direction the filter was aimed at. Whether the difference clears its own error bar is R2.

## The pre-registered bar

| id | gate | threshold | observed | |
|---|---|---|---|---|
| **R1** | sample | >=3,000 kept and >=500 removed | kept=9,200, removed=1,341 | PASS |
| **R2** | the removed trades are worse (kept minus removed, unpaired) | 95% excludes zero in the filter's favour | +0.0130 (+13 dollars) (95%: -0.0539 to +0.0799) | **FAIL** |
| **R3** | the filter improves the book (kept minus unfiltered, paired by day) | 95% excludes zero in the filter's favour | +0.0014 (+1 dollars) (95%: -0.0082 to +0.0110, days=667) | **FAIL** |
| **R4** | sign | mean net R of kept > 0 | +0.0207 (+21 dollars) | PASS |
| **R5** | not the stop denominator | R2 holds in cents per share | -3.72c (95%: -24.22 to +16.78) | **FAIL** |

R2 corrected for three readings: -69 dollars to +95 dollars.

## Long and short, separately

| side | kept | kept $/1k | removed | removed $/1k |
|---|---|---|---|---|
| long | 4,601 | +18 dollars | 826 | -5 dollars |
| short | 4,599 | +23 dollars | 515 | +27 dollars |

## The RSI curve — printed so a moved threshold would be visible

The gate fixed 70/30 in advance and they do not move. This curve is required precisely so the temptation to re-cut it is on the page and refused.

| hourly RSI decile | range | n | $/1k | hit |
|---|---|---|---|---|
| 1 | 2.3–30.7 | 1,054 | +32 dollars | 43.5% |
| 2 | 30.7–38.3 | 1,054 | +96 dollars | 45.5% |
| 3 | 38.3–43.5 | 1,055 | -55 dollars | 41.4% |
| 4 | 43.5–48.3 | 1,053 | +8 dollars | 45.4% |
| 5 | 48.3–52.5 | 1,054 | -17 dollars | 43.5% |
| 6 | 52.5–56.8 | 1,054 | -13 dollars | 45.4% |
| 7 | 56.8–61.2 | 1,054 | +57 dollars | 46.6% |
| 8 | 61.2–66.3 | 1,054 | +68 dollars | 47.2% |
| 9 | 66.3–73.0 | 1,054 | +31 dollars | 47.1% |
| 10 | 73.0–99.2 | 1,055 | -17 dollars | 43.6% |

- **Coverage**: 4 of the incumbent's trades had no hourly RSI (insufficient history) and are excluded from every number above.

## Caveats

- Eleventh reading of this window; eighth variable across three studies.
- The short-side threshold of 30 is a mirror, not the owner's words.
- A filter cannot create edge, only redistribute it. R3 is the question of whether removing trades leaves a better book, and it is the one that matters for shipping.
- **No leveraged portfolio figure appears anywhere.**

