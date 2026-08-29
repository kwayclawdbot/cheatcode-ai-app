# null_coinflip.v1 — measured on `polygon-v1`

**Verdict: FAIL** against the bar pre-registered in `engine/models/GATES.md`, which was committed before this evaluation ran.

Run 2026-08-29T18:20:45+00:00 at `bac49b2`. 32 symbols, snapshot `polygon-v1`, commission $0.005/share/side, slippage 1.0bp on market and stop fills.

## The gate

| gate | | bar | observed | |
|---|---|---|---|---|
| G1 | sample size | IS>=400, OOS>=100 | IS=18422, OOS=5280 | **PASS** |
| G2 | expectancy after costs (mean net R) | IS>=+0.10, OOS>=+0.05 | IS=-0.344, OOS=-0.200 | **FAIL** |
| G3 | profit factor after costs | IS>=1.20, OOS>=1.10 | IS=0.60, OOS=0.74 | **FAIL** |
| G4 | winners first going >=0.75R against | <=40% | 18.6% | **PASS** |
| G5 | mean net R > 0 in both regimes (in-sample) | both > 0 | bear (SPY < 50dma)=-0.276 (n=3164), bull (SPY > 50dma)=-0.359 (n=13820) | **FAIL** |

## Headline

| slice | n | hit | mean R | median R | mean % | payoff | PF | total R | maxDD R | max losing run |
|---|---|---|---|---|---|---|---|---|---|---|
| all | 23702 | 33.9% | -0.312 | -1.113 | -0.023% | 1.22 | 0.63 | -7392.1 | 7391.4 | 19 |
| in-sample 2023-09-01..2025-12-31 | 18422 | 33.5% | -0.344 | -1.122 | -0.026% | 1.18 | 0.60 | -6337.8 | 6341.3 | 18 |
| out-of-sample 2026-01-01..2026-08-28 | 5280 | 35.4% | -0.200 | -1.088 | -0.015% | 1.35 | 0.74 | -1054.3 | 1056.3 | 19 |

## Maximum adverse excursion — the headline statistic

The existing SMS engine's +11.93% average peak concealed a −10.49% average drawdown, with 47.5% of alerts going 8%+ underwater first. Distribution, not mean.

**All trades**

- MAE deciles (R): 0.28 | 0.52 | 0.84 | 1.04 | 1.11 | 1.19 | 1.30 | 1.44 | 1.70
- all trades reaching that far against: >=0.25R 91.2% · >=0.5R 80.8% · >=0.75R 72.5% · >=1.0R 66.0%
- **winners** that first went that far against: >=0.25R 74.0% · >=0.5R 43.7% · >=0.75R 19.2% · >=1.0R 0.0%

**In-sample**

- MAE deciles (R): 0.27 | 0.52 | 0.85 | 1.04 | 1.11 | 1.19 | 1.30 | 1.45 | 1.71
- all trades reaching that far against: >=0.25R 91.0% · >=0.5R 80.8% · >=0.75R 72.6% · >=1.0R 66.4%
- **winners** that first went that far against: >=0.25R 73.3% · >=0.5R 42.9% · >=0.75R 18.6% · >=1.0R 0.0%

**Out-of-sample**

- MAE deciles (R): 0.29 | 0.52 | 0.81 | 1.03 | 1.10 | 1.18 | 1.28 | 1.43 | 1.68
- all trades reaching that far against: >=0.25R 91.6% · >=0.5R 80.9% · >=0.75R 72.1% · >=1.0R 64.5%
- **winners** that first went that far against: >=0.25R 76.4% · >=0.5R 46.2% · >=0.75R 21.3% · >=1.0R 0.0%

## By regime (in-sample)

| slice | n | hit | mean R | median R | mean % | payoff | PF | total R | maxDD R | max losing run |
|---|---|---|---|---|---|---|---|---|---|---|
| bear (SPY < 50dma) | 3164 | 33.5% | -0.276 | -1.086 | -0.027% | 1.32 | 0.66 | -873.0 | 892.8 | 16 |
| bull (SPY > 50dma) | 13820 | 33.5% | -0.359 | -1.131 | -0.024% | 1.15 | 0.58 | -4960.4 | 4960.9 | 18 |

## By session, side, and year (all trades)

| slice | n | hit | mean R | median R | mean % | payoff | PF | total R | maxDD R | max losing run |
|---|---|---|---|---|---|---|---|---|---|---|
| close 14:00-16:00 | 4545 | 33.9% | -0.384 | -1.146 | -0.025% | 1.08 | 0.56 | -1746.0 | 1747.7 | 28 |
| mid 10:30-14:00 | 15858 | 33.7% | -0.331 | -1.122 | -0.024% | 1.20 | 0.61 | -5242.0 | 5240.8 | 22 |
| open 09:30-10:30 | 3299 | 35.2% | -0.123 | -1.063 | -0.014% | 1.53 | 0.83 | -404.2 | 417.5 | 20 |
| long | 11835 | 33.9% | -0.315 | -1.114 | -0.022% | 1.21 | 0.62 | -3732.9 | 3731.7 | 20 |
| short | 11867 | 33.9% | -0.308 | -1.112 | -0.024% | 1.23 | 0.63 | -3659.3 | 3660.8 | 18 |
| 2023 | 2479 | 33.0% | -0.425 | -1.159 | -0.032% | 1.08 | 0.53 | -1054.0 | 1054.4 | 17 |
| 2024 | 8000 | 34.0% | -0.350 | -1.128 | -0.024% | 1.15 | 0.59 | -2801.2 | 2806.2 | 18 |
| 2025 | 7943 | 33.2% | -0.313 | -1.109 | -0.026% | 1.25 | 0.62 | -2482.6 | 2486.2 | 18 |
| 2026 | 5280 | 35.4% | -0.200 | -1.088 | -0.015% | 1.35 | 0.74 | -1054.3 | 1056.3 | 19 |

## By symbol (all trades)

| slice | n | hit | mean R | median R | mean % | payoff | PF | total R | maxDD R | max losing run |
|---|---|---|---|---|---|---|---|---|---|---|
| AMD | 742 | 34.5% | -0.111 | -1.070 | -0.018% | 1.61 | 0.85 | -82.5 | 94.3 | 14 |
| PLTR | 743 | 37.1% | -0.124 | -1.082 | -0.012% | 1.41 | 0.83 | -92.4 | 105.7 | 18 |
| COIN | 744 | 32.5% | -0.135 | -1.048 | -0.030% | 1.69 | 0.81 | -100.2 | 99.2 | 15 |
| AVGO | 736 | 34.4% | -0.143 | -1.077 | -0.013% | 1.55 | 0.81 | -105.0 | 128.9 | 11 |
| META | 742 | 34.5% | -0.149 | -1.079 | -0.019% | 1.51 | 0.80 | -110.3 | 112.0 | 11 |
| TSLA | 740 | 32.2% | -0.160 | -1.060 | -0.028% | 1.65 | 0.78 | -118.5 | 146.6 | 15 |
| MU | 742 | 33.8% | -0.170 | -1.071 | -0.022% | 1.52 | 0.77 | -125.9 | 131.3 | 18 |
| GOOGL | 743 | 36.3% | -0.178 | -1.121 | -0.009% | 1.34 | 0.76 | -132.3 | 140.6 | 11 |
| MSFT | 741 | 35.9% | -0.183 | -1.108 | -0.012% | 1.35 | 0.76 | -135.4 | 152.2 | 13 |
| UBER | 743 | 35.5% | -0.219 | -1.149 | -0.018% | 1.31 | 0.72 | -163.0 | 173.1 | 15 |
| SMH | 743 | 33.9% | -0.226 | -1.102 | -0.019% | 1.38 | 0.71 | -168.1 | 176.8 | 14 |
| BA | 743 | 33.6% | -0.231 | -1.107 | -0.025% | 1.39 | 0.70 | -171.5 | 180.0 | 11 |
| AMZN | 744 | 34.0% | -0.232 | -1.120 | -0.018% | 1.36 | 0.70 | -172.6 | 182.1 | 14 |
| IWM | 742 | 36.3% | -0.248 | -1.144 | -0.017% | 1.20 | 0.68 | -184.0 | 187.9 | 13 |
| QQQ | 743 | 34.9% | -0.265 | -1.139 | -0.013% | 1.24 | 0.66 | -197.0 | 210.1 | 19 |
| QCOM | 743 | 32.6% | -0.276 | -1.115 | -0.018% | 1.36 | 0.66 | -205.2 | 206.5 | 15 |
| CRM | 743 | 32.0% | -0.287 | -1.113 | -0.022% | 1.36 | 0.64 | -213.1 | 213.5 | 15 |
| AAPL | 743 | 33.0% | -0.287 | -1.137 | -0.021% | 1.30 | 0.64 | -213.1 | 213.7 | 18 |
| JPM | 744 | 34.0% | -0.289 | -1.142 | -0.016% | 1.24 | 0.64 | -215.1 | 220.2 | 17 |
| GS | 723 | 32.6% | -0.302 | -1.100 | -0.021% | 1.32 | 0.64 | -218.0 | 220.4 | 15 |
| NVDA | 743 | 29.7% | -0.307 | -1.102 | -0.049% | 1.46 | 0.62 | -228.0 | 235.1 | 16 |
| XOM | 740 | 34.3% | -0.330 | -1.181 | -0.022% | 1.15 | 0.60 | -244.1 | 248.4 | 10 |
| INTC | 743 | 31.9% | -0.369 | -1.180 | -0.050% | 1.24 | 0.58 | -274.3 | 282.4 | 16 |
| DIS | 741 | 33.1% | -0.391 | -1.195 | -0.033% | 1.10 | 0.54 | -289.8 | 288.9 | 12 |
| SPY | 742 | 33.4% | -0.401 | -1.180 | -0.019% | 1.03 | 0.52 | -297.5 | 299.8 | 16 |
| BAC | 740 | 36.2% | -0.451 | -1.316 | -0.031% | 0.90 | 0.51 | -334.0 | 341.1 | 11 |
| WMT | 744 | 32.1% | -0.503 | -1.256 | -0.027% | 0.98 | 0.46 | -374.6 | 372.8 | 11 |
| COST | 723 | 37.9% | -0.536 | -1.113 | -0.010% | 0.82 | 0.50 | -387.2 | 388.8 | 10 |
| DIA | 737 | 32.3% | -0.537 | -1.227 | -0.020% | 0.88 | 0.42 | -395.5 | 397.2 | 12 |
| XLE | 742 | 33.4% | -0.589 | -1.347 | -0.041% | 0.81 | 0.41 | -437.4 | 439.1 | 15 |
| XLF | 742 | 35.2% | -0.664 | -1.422 | -0.036% | 0.67 | 0.36 | -492.3 | 495.0 | 16 |
| NFLX | 738 | 32.7% | -0.696 | -1.178 | -0.032% | 0.87 | 0.42 | -514.0 | 518.5 | 13 |

## Mechanics

- exits: {'stop': 15646, 'target': 8052, 'time': 4}
- trades resolved by the pessimistic same-bar assumption (stop and target both inside one bar): 11 (0.0%)
- mean bars held: 5.0
- orders that never filled and expired: 0 (fill rate 100.0%)
- model parameters: `{"window": [585, 900], "stop_atr": 1.0, "target_atr": 2.0, "flatten_min": 955, "seed": "engine-1-null-control"}`

## Caveats

- **Survivorship.** The 32 symbols are liquid *today*. None was chosen on performance and none dropped after seeing a result, but the universe is selected with hindsight and contains no delisted or since-illiquid name. Expect the honest numbers to be modestly worse.
- **Fills are modelled, not observed.** OHLC cannot say what happened inside a bar. Every ambiguity here is resolved against the trade.
- **One position at a time per symbol per day.** A second signal while one is working is dropped, not stacked.
- **No borrow, locate, or halt modelling.** Shorts assume a locate was available and no circuit breaker intervened.
- **Adjusted prices.** Splits are adjusted; the tape a trader saw on the day was the unadjusted one.
