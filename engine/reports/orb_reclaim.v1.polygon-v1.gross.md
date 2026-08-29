# orb_reclaim.v1 — measured on `polygon-v1`

**Verdict: FAIL** against the bar pre-registered in `engine/models/GATES.md`, which was committed before this evaluation ran.

Run 2026-08-29T18:19:12+00:00 at `bac49b2`. 32 symbols, snapshot `polygon-v1`, commission $0.0/share/side, slippage 0.0bp on market and stop fills.

## The gate

| gate | | bar | observed | |
|---|---|---|---|---|
| G1 | sample size | IS>=400, OOS>=100 | IS=6398, OOS=1668 | **PASS** |
| G2 | expectancy after costs (mean net R) | IS>=+0.10, OOS>=+0.05 | IS=+0.001, OOS=+0.012 | **FAIL** |
| G3 | profit factor after costs | IS>=1.20, OOS>=1.10 | IS=1.00, OOS=1.02 | **FAIL** |
| G4 | winners first going >=0.75R against | <=40% | 17.7% | **PASS** |
| G5 | mean net R > 0 in both regimes (in-sample) | both > 0 | bear (SPY < 50dma)=+0.021 (n=1037), bull (SPY > 50dma)=-0.003 (n=4774) | **FAIL** |

## Headline

| slice | n | hit | mean R | median R | mean % | payoff | PF | total R | maxDD R | max losing run |
|---|---|---|---|---|---|---|---|---|---|---|
| all | 8066 | 29.2% | 0.004 | -1.000 | 0.005% | 2.44 | 1.01 | 29.6 | 134.3 | 20 |
| in-sample 2023-09-01..2025-12-31 | 6398 | 29.0% | 0.001 | -1.000 | 0.003% | 2.46 | 1.00 | 8.9 | 144.6 | 20 |
| out-of-sample 2026-01-01..2026-08-28 | 1668 | 29.9% | 0.012 | -1.000 | 0.013% | 2.38 | 1.02 | 20.8 | 88.4 | 18 |

## Maximum adverse excursion — the headline statistic

The existing SMS engine's +11.93% average peak concealed a −10.49% average drawdown, with 47.5% of alerts going 8%+ underwater first. Distribution, not mean.

**All trades**

- MAE deciles (R): 0.30 | 0.60 | 0.97 | 1.01 | 1.06 | 1.10 | 1.17 | 1.25 | 1.42
- all trades reaching that far against: >=0.25R 92.0% · >=0.5R 83.3% · >=0.75R 75.4% · >=1.0R 69.5%
- **winners** that first went that far against: >=0.25R 72.5% · >=0.5R 43.0% · >=0.75R 17.6% · >=1.0R 0.0%

**In-sample**

- MAE deciles (R): 0.30 | 0.60 | 0.99 | 1.01 | 1.06 | 1.11 | 1.17 | 1.26 | 1.43
- all trades reaching that far against: >=0.25R 91.9% · >=0.5R 83.2% · >=0.75R 75.6% · >=1.0R 69.8%
- **winners** that first went that far against: >=0.25R 72.2% · >=0.5R 42.4% · >=0.75R 17.7% · >=1.0R 0.0%

**Out-of-sample**

- MAE deciles (R): 0.31 | 0.59 | 0.92 | 1.02 | 1.06 | 1.09 | 1.16 | 1.24 | 1.38
- all trades reaching that far against: >=0.25R 92.1% · >=0.5R 83.5% · >=0.75R 74.5% · >=1.0R 68.5%
- **winners** that first went that far against: >=0.25R 73.5% · >=0.5R 45.3% · >=0.75R 17.0% · >=1.0R 0.0%

## By regime (in-sample)

| slice | n | hit | mean R | median R | mean % | payoff | PF | total R | maxDD R | max losing run |
|---|---|---|---|---|---|---|---|---|---|---|
| bear (SPY < 50dma) | 1037 | 29.8% | 0.021 | -1.000 | 0.037% | 2.43 | 1.03 | 21.6 | 49.5 | 17 |
| bull (SPY > 50dma) | 4774 | 29.0% | -0.003 | -1.000 | -0.002% | 2.44 | 1.00 | -15.4 | 126.1 | 17 |

## By session, side, and year (all trades)

| slice | n | hit | mean R | median R | mean % | payoff | PF | total R | maxDD R | max losing run |
|---|---|---|---|---|---|---|---|---|---|---|
| mid 10:30-14:00 | 1289 | 28.2% | -0.003 | -1.000 | 0.005% | 2.53 | 1.00 | -4.0 | 69.2 | 19 |
| open 09:30-10:30 | 6777 | 29.3% | 0.005 | -1.000 | 0.005% | 2.43 | 1.01 | 33.6 | 96.3 | 22 |
| long | 4030 | 29.9% | 0.035 | -1.000 | 0.016% | 2.46 | 1.05 | 139.2 | 97.6 | 19 |
| short | 4036 | 28.4% | -0.027 | -1.000 | -0.005% | 2.42 | 0.96 | -109.6 | 143.7 | 20 |
| 2023 | 956 | 26.7% | -0.040 | -1.000 | -0.019% | 2.60 | 0.95 | -38.0 | 68.7 | 15 |
| 2024 | 2760 | 29.3% | -0.020 | -1.000 | 0.003% | 2.34 | 0.97 | -54.3 | 117.5 | 19 |
| 2025 | 2682 | 29.4% | 0.038 | -1.000 | 0.012% | 2.53 | 1.05 | 101.3 | 81.3 | 24 |
| 2026 | 1668 | 29.9% | 0.012 | -1.000 | 0.013% | 2.38 | 1.02 | 20.8 | 88.4 | 18 |

## By symbol (all trades)

| slice | n | hit | mean R | median R | mean % | payoff | PF | total R | maxDD R | max losing run |
|---|---|---|---|---|---|---|---|---|---|---|
| DIA | 339 | 32.7% | 0.163 | -1.000 | 0.024% | 2.55 | 1.24 | 55.1 | 19.5 | 14 |
| COIN | 213 | 37.6% | 0.231 | -1.000 | 0.195% | 2.28 | 1.37 | 49.3 | 13.2 | 8 |
| AMD | 250 | 35.6% | 0.175 | -1.000 | 0.091% | 2.31 | 1.28 | 43.8 | 13.8 | 8 |
| XLF | 287 | 30.3% | 0.089 | -1.000 | 0.019% | 2.59 | 1.13 | 25.5 | 17.3 | 12 |
| SPY | 243 | 35.4% | 0.096 | -1.000 | 0.027% | 2.10 | 1.15 | 23.4 | 14.0 | 10 |
| COST | 261 | 28.7% | 0.089 | -1.000 | 0.031% | 2.79 | 1.12 | 23.3 | 16.2 | 10 |
| CRM | 221 | 32.6% | 0.085 | -1.000 | 0.024% | 2.33 | 1.13 | 18.7 | 25.4 | 13 |
| NFLX | 236 | 31.4% | 0.071 | -1.000 | 0.059% | 2.42 | 1.11 | 16.9 | 29.1 | 17 |
| AAPL | 243 | 30.0% | 0.066 | -1.000 | 0.015% | 2.56 | 1.10 | 16.1 | 17.7 | 12 |
| AVGO | 228 | 29.8% | 0.061 | -1.000 | -0.011% | 2.56 | 1.09 | 13.8 | 17.7 | 12 |
| BAC | 288 | 29.9% | 0.044 | -1.000 | 0.019% | 2.50 | 1.06 | 12.7 | 36.0 | 12 |
| PLTR | 215 | 29.8% | 0.055 | -1.000 | 0.006% | 2.55 | 1.08 | 11.9 | 32.7 | 10 |
| IWM | 301 | 30.2% | 0.032 | -1.000 | 0.024% | 2.41 | 1.05 | 9.7 | 36.7 | 12 |
| WMT | 259 | 27.0% | 0.034 | -1.000 | -0.015% | 2.83 | 1.05 | 8.9 | 47.4 | 13 |
| GOOGL | 226 | 28.3% | 0.037 | -1.000 | 0.038% | 2.66 | 1.05 | 8.4 | 26.4 | 10 |
| XOM | 245 | 30.2% | 0.034 | -1.000 | 0.013% | 2.42 | 1.05 | 8.3 | 24.8 | 14 |
| QQQ | 285 | 30.2% | 0.007 | -1.000 | 0.003% | 2.34 | 1.01 | 2.1 | 30.1 | 13 |
| GS | 253 | 29.6% | 0.006 | -1.000 | 0.005% | 2.39 | 1.01 | 1.5 | 27.2 | 11 |
| MU | 194 | 29.9% | -0.009 | -1.000 | 0.002% | 2.32 | 0.99 | -1.6 | 32.7 | 11 |
| META | 262 | 28.6% | -0.013 | -1.000 | -0.000% | 2.45 | 0.98 | -3.4 | 31.0 | 20 |
| SMH | 293 | 29.7% | -0.032 | -1.000 | 0.010% | 2.26 | 0.95 | -9.4 | 36.8 | 15 |
| AMZN | 247 | 25.5% | -0.041 | -1.000 | -0.019% | 2.76 | 0.94 | -10.0 | 27.0 | 13 |
| XLE | 273 | 27.5% | -0.049 | -1.000 | 0.004% | 2.46 | 0.93 | -13.5 | 34.2 | 12 |
| DIS | 267 | 23.2% | -0.070 | -1.000 | -0.034% | 3.00 | 0.91 | -18.6 | 39.8 | 19 |
| INTC | 209 | 28.2% | -0.094 | -1.000 | -0.004% | 2.21 | 0.87 | -19.6 | 43.6 | 13 |
| JPM | 255 | 27.1% | -0.083 | -1.000 | -0.007% | 2.38 | 0.88 | -21.2 | 42.9 | 13 |
| MSFT | 244 | 26.6% | -0.123 | -1.000 | -0.018% | 2.29 | 0.83 | -30.0 | 39.0 | 14 |
| TSLA | 232 | 27.6% | -0.139 | -1.000 | -0.074% | 2.13 | 0.81 | -32.3 | 34.1 | 12 |
| QCOM | 260 | 23.8% | -0.134 | -1.000 | -0.056% | 2.63 | 0.82 | -34.8 | 50.7 | 16 |
| UBER | 249 | 25.3% | -0.147 | -1.000 | -0.074% | 2.37 | 0.80 | -36.6 | 62.3 | 20 |
| BA | 213 | 26.3% | -0.199 | -1.000 | -0.011% | 2.03 | 0.72 | -42.4 | 42.5 | 18 |
| NVDA | 275 | 25.1% | -0.169 | -1.000 | -0.088% | 2.30 | 0.77 | -46.6 | 53.5 | 19 |

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
