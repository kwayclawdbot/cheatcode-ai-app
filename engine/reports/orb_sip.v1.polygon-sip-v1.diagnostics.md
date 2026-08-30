# ENGINE-6 post-mortem — diagnostics, and not a result

`orb_sip.v1` is **NOT REPRODUCED**; that verdict is in [`orb_sip.v1.polygon-sip-v1.md`](orb_sip.v1.polygon-sip-v1.md) and was decided by R1-R5 alone. Nothing on this page enters a gate, changes a threshold or is a result. It exists because the gate required the candidate explanations to be enumerated and, where cheap, measured — and because a replication that fails in the OPPOSITE sign to the published claim is either a finding about the market, about our machinery, or about our reading of the spec, and those three have to be separated.

## The sweep

One number moves: the stop, as a fraction of the 14-day ATR. The published spec is 10%, which is the first row and is the only row that was evaluated. The last row's stop is 100x the ATR and can essentially never be hit, so every trade runs to the close.

The identity that makes this readable: **signed move from entry to the close, in ATR = mean gross R x stop fraction**. The last column applies it, so the bottom row is the pure directional edge of the entry rule with the stop taken out of the question.

| stop | arm | n | stopped | hit | mean gross R | median gross R | mean winner R | mean net R | signed move, ATR |
|---|---|---|---|---|---|---|---|---|---|
| 0.1x ATR | stocks in play | 32,392 | 90.1% | 9.2% | -0.6351 | -1.0396 | 6.68 | -0.7229 | -0.0635 |
| 0.1x ATR | coin flip | 26,959 | 89.2% | 9.8% | -0.6940 | -1.0403 | 5.92 | -0.7816 | -0.0694 |
| 0.1x ATR | unfiltered | 33,893 | 84.0% | 15.2% | -0.1795 | -1.0331 | 4.91 | -0.2636 | -0.0180 |
| 0.25x ATR | stocks in play | 32,392 | 70.5% | 25.6% | -0.0733 | -1.0089 | 2.67 | -0.1084 | -0.0183 |
| 0.25x ATR | coin flip | 26,959 | 68.5% | 26.4% | -0.0974 | -1.0086 | 2.45 | -0.1325 | -0.0244 |
| 0.25x ATR | unfiltered | 33,893 | 59.1% | 33.9% | -0.0221 | -1.0073 | 1.77 | -0.0557 | -0.0055 |
| 0.5x ATR | stocks in play | 32,392 | 46.3% | 39.6% | 0.0045 | -0.4822 | 1.30 | -0.0130 | 0.0023 |
| 0.5x ATR | coin flip | 26,959 | 43.6% | 40.0% | -0.0058 | -0.3681 | 1.21 | -0.0233 | -0.0029 |
| 0.5x ATR | unfiltered | 33,893 | 29.9% | 44.9% | -0.0139 | -0.1028 | 0.82 | -0.0307 | -0.0069 |
| 1x ATR | stocks in play | 32,392 | 19.0% | 47.3% | 0.0121 | -0.0314 | 0.65 | 0.0034 | 0.0121 |
| 1x ATR | coin flip | 26,959 | 17.4% | 47.1% | 0.0058 | -0.0290 | 0.61 | -0.0029 | 0.0058 |
| 1x ATR | unfiltered | 33,893 | 6.1% | 47.7% | -0.0050 | -0.0145 | 0.40 | -0.0134 | -0.0050 |
| 2x ATR | stocks in play | 32,392 | 3.8% | 49.0% | 0.0084 | -0.0031 | 0.33 | 0.0040 | 0.0167 |
| 2x ATR | coin flip | 26,959 | 3.4% | 48.5% | 0.0055 | -0.0049 | 0.31 | 0.0011 | 0.0110 |
| 2x ATR | unfiltered | 33,893 | 0.4% | 47.9% | -0.0019 | -0.0064 | 0.20 | -0.0062 | -0.0039 |
| 100x ATR | stocks in play | 32,392 | 0.0% | 49.2% | 0.0002 | -0.0000 | 0.01 | 0.0001 | 0.0174 |
| 100x ATR | coin flip | 26,959 | 0.0% | 48.7% | 0.0001 | -0.0001 | 0.01 | 0.0000 | 0.0105 |
| 100x ATR | unfiltered | 33,893 | 0.0% | 47.9% | -0.0000 | -0.0001 | 0.00 | -0.0001 | -0.0036 |

## Model minus coin flip, paired, gross, at each stop width

Same symbols, same days, same 09:35 decision, same stop distance. Only the direction call differs.

| stop | pairs | model − control | 95% |
|---|---|---|---|
| 0.1x ATR | 23,649 | -0.0564 | -0.0776 to -0.0351 |
| 0.25x ATR | 23,649 | -0.1062 | -0.1205 to -0.0919 |
| 0.5x ATR | 23,649 | -0.1108 | -0.1221 to -0.0995 |
| 1x ATR | 23,649 | -0.0758 | -0.0840 to -0.0676 |
| 2x ATR | 23,649 | -0.0419 | -0.0473 to -0.0366 |
| 100x ATR | 23,649 | -0.0008 | -0.0010 to -0.0007 |

## Stocks in play minus unfiltered, at each stop width

Unpaired, gross, replication window. The paper's claim is that this difference is where the entire result comes from.

| stop | in play | unfiltered | difference | 95% |
|---|---|---|---|---|
| 0.1x ATR | -0.6351 | -0.1795 | -0.4556 | -0.4995 to -0.4116 |
| 0.25x ATR | -0.0733 | -0.0221 | -0.0512 | -0.0794 to -0.0230 |
| 0.5x ATR | 0.0045 | -0.0139 | 0.0184 | 0.0002 to 0.0366 |
| 1x ATR | 0.0121 | -0.0050 | 0.0171 | 0.0065 to 0.0277 |
| 2x ATR | 0.0084 | -0.0019 | 0.0103 | 0.0046 to 0.0160 |
| 100x ATR | 0.0002 | -0.0000 | 0.0002 | 0.0001 to 0.0003 |

## How wide is the opening candle, in ATR?

The brief's own table records that the companion ETF paper stops at the **opposite extreme of the first candle** rather than at a fraction of the ATR. Those two readings are the same rule only if the opening candle happens to be a tenth of an ATR wide. It is not, and the difference is the whole result — so here is the number.

Over 40,226 selected symbol-days in the replication window, the 09:30-09:35 candle's high-to-low range is a median **0.63x the 14-day ATR** (p10 0.26x, p90 1.41x).

So a stop at the opposite extreme of the opening candle is about **6x wider** than a stop at 10% of the ATR, and it lands in the part of the sweep above where this shape stops losing. Which of the two readings the published spec meant is not a detail; it decides the sign of the answer.

## Costs

| stop | with costs | zero cost | cost drag |
|---|---|---|---|
| 0.1x ATR | -0.7229 | -0.5531 | 0.1697 |
| 0.25x ATR | -0.1084 | -0.0453 | 0.0631 |
| 0.5x ATR | -0.0130 | 0.0180 | 0.0310 |
| 1x ATR | 0.0034 | 0.0187 | 0.0153 |
| 2x ATR | 0.0040 | 0.0116 | 0.0076 |
| 100x ATR | 0.0001 | 0.0002 | 0.0002 |

