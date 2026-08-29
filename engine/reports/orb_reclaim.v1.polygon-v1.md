# orb_reclaim.v1 — measured on `polygon-v1`

**Verdict: FAIL** against the bar pre-registered in `engine/models/GATES.md`, which was committed before this evaluation ran.

Run 2026-08-29T18:16:02+00:00 at `99a84d3`. 32 symbols, snapshot `polygon-v1`, commission $0.005/share/side, slippage 1.0bp on market and stop fills.

## The gate

| gate | | bar | observed | |
|---|---|---|---|---|
| G1 | sample size | IS>=400, OOS>=100 | IS=6398, OOS=1668 | **PASS** |
| G2 | expectancy after costs (mean net R) | IS>=+0.10, OOS>=+0.05 | IS=-0.116, OOS=-0.074 | **FAIL** |
| G3 | profit factor after costs | IS>=1.20, OOS>=1.10 | IS=0.85, OOS=0.90 | **FAIL** |
| G4 | winners first going >=0.75R against | <=40% | 18.5% | **PASS** |
| G5 | mean net R > 0 in both regimes (in-sample) | both > 0 | bear (SPY < 50dma)=-0.070 (n=1037), bull (SPY > 50dma)=-0.126 (n=4774) | **FAIL** |

## Headline

| slice | n | hit | mean R | median R | mean % | payoff | PF | total R | maxDD R | max losing run |
|---|---|---|---|---|---|---|---|---|---|---|
| all | 8066 | 29.0% | -0.107 | -1.041 | -0.021% | 2.10 | 0.86 | -866.7 | 869.8 | 20 |
| in-sample 2023-09-01..2025-12-31 | 6398 | 28.8% | -0.116 | -1.045 | -0.023% | 2.10 | 0.85 | -742.6 | 744.2 | 20 |
| out-of-sample 2026-01-01..2026-08-28 | 1668 | 29.9% | -0.074 | -1.033 | -0.010% | 2.11 | 0.90 | -124.2 | 162.3 | 18 |

## Maximum adverse excursion — the headline statistic

The existing SMS engine's +11.93% average peak concealed a −10.49% average drawdown, with 47.5% of alerts going 8%+ underwater first. Distribution, not mean.

**All trades**

- MAE deciles (R): 0.33 | 0.61 | 0.97 | 1.01 | 1.05 | 1.10 | 1.16 | 1.24 | 1.40
- all trades reaching that far against: >=0.25R 93.1% · >=0.5R 84.0% · >=0.75R 75.6% · >=1.0R 69.5%
- **winners** that first went that far against: >=0.25R 76.1% · >=0.5R 45.2% · >=0.75R 18.2% · >=1.0R 0.0%

**In-sample**

- MAE deciles (R): 0.33 | 0.61 | 0.99 | 1.01 | 1.05 | 1.10 | 1.16 | 1.24 | 1.40
- all trades reaching that far against: >=0.25R 92.9% · >=0.5R 83.9% · >=0.75R 75.9% · >=1.0R 69.8%
- **winners** that first went that far against: >=0.25R 75.5% · >=0.5R 44.6% · >=0.75R 18.5% · >=1.0R 0.0%

**Out-of-sample**

- MAE deciles (R): 0.33 | 0.60 | 0.92 | 1.02 | 1.05 | 1.09 | 1.15 | 1.23 | 1.36
- all trades reaching that far against: >=0.25R 93.6% · >=0.5R 84.2% · >=0.75R 74.6% · >=1.0R 68.5%
- **winners** that first went that far against: >=0.25R 78.5% · >=0.5R 47.6% · >=0.75R 17.3% · >=1.0R 0.0%

## By regime (in-sample)

| slice | n | hit | mean R | median R | mean % | payoff | PF | total R | maxDD R | max losing run |
|---|---|---|---|---|---|---|---|---|---|---|
| bear (SPY < 50dma) | 1037 | 29.6% | -0.070 | -1.036 | 0.011% | 2.16 | 0.91 | -72.5 | 112.5 | 17 |
| bull (SPY > 50dma) | 4774 | 28.9% | -0.126 | -1.046 | -0.029% | 2.06 | 0.84 | -599.5 | 607.4 | 17 |

## By session, side, and year (all trades)

| slice | n | hit | mean R | median R | mean % | payoff | PF | total R | maxDD R | max losing run |
|---|---|---|---|---|---|---|---|---|---|---|
| mid 10:30-14:00 | 1289 | 27.9% | -0.133 | -1.044 | -0.022% | 2.14 | 0.83 | -172.0 | 183.5 | 19 |
| open 09:30-10:30 | 6777 | 29.2% | -0.103 | -1.041 | -0.020% | 2.09 | 0.86 | -694.8 | 699.4 | 22 |
| long | 4030 | 29.7% | -0.078 | -1.041 | -0.010% | 2.12 | 0.90 | -313.4 | 327.1 | 19 |
| short | 4036 | 28.3% | -0.137 | -1.041 | -0.031% | 2.08 | 0.82 | -553.3 | 556.4 | 20 |
| 2023 | 956 | 26.5% | -0.174 | -1.059 | -0.049% | 2.17 | 0.78 | -166.7 | 171.2 | 15 |
| 2024 | 2760 | 29.2% | -0.139 | -1.046 | -0.024% | 1.99 | 0.82 | -384.0 | 389.1 | 19 |
| 2025 | 2682 | 29.3% | -0.072 | -1.039 | -0.014% | 2.18 | 0.91 | -191.9 | 211.4 | 24 |
| 2026 | 1668 | 29.9% | -0.074 | -1.033 | -0.010% | 2.11 | 0.90 | -124.2 | 162.3 | 18 |

## By symbol (all trades)

| slice | n | hit | mean R | median R | mean % | payoff | PF | total R | maxDD R | max losing run |
|---|---|---|---|---|---|---|---|---|---|---|
| COIN | 213 | 37.6% | 0.195 | -1.016 | 0.174% | 2.17 | 1.31 | 41.5 | 14.1 | 8 |
| AMD | 250 | 35.6% | 0.121 | -1.023 | 0.067% | 2.14 | 1.18 | 30.3 | 19.0 | 8 |
| CRM | 221 | 32.6% | 0.008 | -1.028 | 0.002% | 2.09 | 1.01 | 1.8 | 27.9 | 13 |
| AVGO | 228 | 29.4% | -0.004 | -1.025 | -0.034% | 2.39 | 0.99 | -1.0 | 21.7 | 12 |
| COST | 261 | 28.7% | -0.014 | -1.042 | 0.012% | 2.44 | 0.98 | -3.6 | 21.1 | 10 |
| PLTR | 215 | 29.8% | -0.028 | -1.030 | -0.035% | 2.27 | 0.96 | -5.9 | 37.8 | 10 |
| AAPL | 243 | 30.0% | -0.033 | -1.046 | -0.008% | 2.22 | 0.95 | -8.0 | 23.7 | 12 |
| NFLX | 236 | 30.9% | -0.034 | -1.054 | 0.027% | 2.13 | 0.95 | -8.0 | 32.6 | 17 |
| GOOGL | 226 | 27.9% | -0.048 | -1.038 | 0.015% | 2.42 | 0.94 | -10.8 | 33.5 | 10 |
| MU | 194 | 29.9% | -0.072 | -1.029 | -0.024% | 2.11 | 0.90 | -14.1 | 40.7 | 11 |
| DIA | 339 | 32.7% | -0.047 | -1.085 | 0.004% | 1.93 | 0.94 | -15.9 | 41.8 | 14 |
| GS | 253 | 29.6% | -0.070 | -1.034 | -0.015% | 2.14 | 0.90 | -17.8 | 37.1 | 11 |
| SPY | 243 | 35.4% | -0.077 | -1.076 | 0.009% | 1.63 | 0.89 | -18.8 | 27.4 | 10 |
| META | 262 | 28.6% | -0.075 | -1.028 | -0.020% | 2.24 | 0.90 | -19.6 | 37.0 | 20 |
| XOM | 245 | 29.4% | -0.092 | -1.061 | -0.013% | 2.11 | 0.88 | -22.4 | 39.9 | 15 |
| IWM | 301 | 30.2% | -0.089 | -1.063 | 0.003% | 2.04 | 0.88 | -26.8 | 55.9 | 12 |
| AMZN | 247 | 25.5% | -0.123 | -1.041 | -0.042% | 2.46 | 0.84 | -30.5 | 37.1 | 13 |
| SMH | 293 | 29.4% | -0.109 | -1.034 | -0.012% | 2.05 | 0.85 | -31.8 | 53.8 | 15 |
| QQQ | 285 | 29.8% | -0.120 | -1.058 | -0.016% | 1.98 | 0.84 | -34.1 | 42.1 | 15 |
| WMT | 259 | 27.0% | -0.141 | -1.077 | -0.045% | 2.23 | 0.83 | -36.4 | 64.4 | 13 |
| BAC | 288 | 29.9% | -0.132 | -1.101 | -0.023% | 1.96 | 0.83 | -38.1 | 55.5 | 12 |
| TSLA | 232 | 27.6% | -0.178 | -1.020 | -0.095% | 2.01 | 0.77 | -41.2 | 42.7 | 12 |
| INTC | 209 | 28.2% | -0.215 | -1.071 | -0.055% | 1.86 | 0.73 | -44.9 | 65.6 | 13 |
| JPM | 255 | 27.1% | -0.182 | -1.047 | -0.029% | 2.06 | 0.76 | -46.3 | 59.9 | 13 |
| MSFT | 244 | 26.2% | -0.206 | -1.040 | -0.038% | 2.06 | 0.73 | -50.3 | 55.9 | 14 |
| DIS | 267 | 23.2% | -0.200 | -1.071 | -0.062% | 2.51 | 0.76 | -53.5 | 63.0 | 19 |
| QCOM | 260 | 23.5% | -0.217 | -1.043 | -0.081% | 2.38 | 0.73 | -56.4 | 69.5 | 16 |
| BA | 213 | 25.8% | -0.267 | -1.038 | -0.034% | 1.87 | 0.65 | -56.8 | 56.1 | 18 |
| XLF | 287 | 30.3% | -0.198 | -1.161 | -0.019% | 1.77 | 0.77 | -56.9 | 64.5 | 12 |
| UBER | 249 | 25.3% | -0.232 | -1.050 | -0.106% | 2.09 | 0.71 | -57.9 | 76.4 | 20 |
| NVDA | 275 | 25.1% | -0.234 | -1.034 | -0.115% | 2.08 | 0.70 | -64.4 | 69.0 | 19 |
| XLE | 273 | 27.5% | -0.250 | -1.128 | -0.036% | 1.86 | 0.71 | -68.3 | 73.8 | 12 |

## Mechanics

- exits: {'stop': 5605, 'target': 1992, 'time': 469}
- trades resolved by the pessimistic same-bar assumption (stop and target both inside one bar): 1 (0.0%)
- mean bars held: 58.6
- orders that never filled and expired: 450 (fill rate 94.7%)
- model parameters: `{"or_minutes": 15, "window": [585, 660], "order_life_min": 30, "hard_expiry": 690, "flatten_min": 955, "min_or_pct": 0.0015, "max_or_pct": 0.03, "displacement_mult": 0.5, "min_rr": 1.0}`

## Caveats

- **Survivorship.** The 32 symbols are liquid *today*. None was chosen on performance and none dropped after seeing a result, but the universe is selected with hindsight and contains no delisted or since-illiquid name. Expect the honest numbers to be modestly worse.
- **Fills are modelled, not observed.** OHLC cannot say what happened inside a bar. Every ambiguity here is resolved against the trade.
- **One position at a time per symbol per day.** A second signal while one is working is dropped, not stacked.
- **No borrow, locate, or halt modelling.** Shorts assume a locate was available and no circuit breaker intervened.
- **Adjusted prices.** Splits are adjusted; the tape a trader saw on the day was the unadjusted one.
