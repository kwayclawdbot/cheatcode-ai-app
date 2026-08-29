# sweep_displacement_fvg.v1 — measured on `polygon-v1`

**Verdict: FAIL** against the bar pre-registered in `engine/models/GATES.md`, which was committed before this evaluation ran.

Run 2026-08-29T18:19:51+00:00 at `bac49b2`. 32 symbols, snapshot `polygon-v1`, commission $0.0/share/side, slippage 0.0bp on market and stop fills.

## The gate

| gate | | bar | observed | |
|---|---|---|---|---|
| G1 | sample size | IS>=400, OOS>=100 | IS=5545, OOS=1299 | **PASS** |
| G2 | expectancy after costs (mean net R) | IS>=+0.10, OOS>=+0.05 | IS=+0.013, OOS=+0.030 | **FAIL** |
| G3 | profit factor after costs | IS>=1.20, OOS>=1.10 | IS=1.02, OOS=1.04 | **FAIL** |
| G4 | winners first going >=0.75R against | <=40% | 16.6% | **PASS** |
| G5 | mean net R > 0 in both regimes (in-sample) | both > 0 | bear (SPY < 50dma)=+0.058 (n=864), bull (SPY > 50dma)=+0.002 (n=4186) | **PASS** |

## Headline

| slice | n | hit | mean R | median R | mean % | payoff | PF | total R | maxDD R | max losing run |
|---|---|---|---|---|---|---|---|---|---|---|
| all | 6844 | 28.4% | 0.016 | -1.000 | 0.008% | 2.58 | 1.02 | 110.6 | 180.1 | 28 |
| in-sample 2023-09-01..2025-12-31 | 5545 | 28.3% | 0.013 | -1.000 | 0.007% | 2.58 | 1.02 | 71.8 | 187.3 | 28 |
| out-of-sample 2026-01-01..2026-08-28 | 1299 | 29.0% | 0.030 | -1.000 | 0.013% | 2.55 | 1.04 | 38.8 | 59.9 | 16 |

## Maximum adverse excursion — the headline statistic

The existing SMS engine's +11.93% average peak concealed a −10.49% average drawdown, with 47.5% of alerts going 8%+ underwater first. Distribution, not mean.

**All trades**

- MAE deciles (R): 0.27 | 0.57 | 0.93 | 1.00 | 1.05 | 1.09 | 1.15 | 1.26 | 1.46
- all trades reaching that far against: >=0.25R 90.5% · >=0.5R 82.2% · >=0.75R 74.7% · >=1.0R 68.4%
- **winners** that first went that far against: >=0.25R 66.7% · >=0.5R 38.9% · >=0.75R 16.1% · >=1.0R 0.0%

**In-sample**

- MAE deciles (R): 0.27 | 0.57 | 0.93 | 1.00 | 1.05 | 1.09 | 1.16 | 1.26 | 1.47
- all trades reaching that far against: >=0.25R 90.6% · >=0.5R 82.2% · >=0.75R 74.9% · >=1.0R 68.5%
- **winners** that first went that far against: >=0.25R 66.7% · >=0.5R 38.5% · >=0.75R 16.6% · >=1.0R 0.0%

**Out-of-sample**

- MAE deciles (R): 0.25 | 0.56 | 0.93 | 1.00 | 1.04 | 1.08 | 1.13 | 1.24 | 1.40
- all trades reaching that far against: >=0.25R 90.2% · >=0.5R 82.2% · >=0.75R 73.7% · >=1.0R 67.9%
- **winners** that first went that far against: >=0.25R 66.6% · >=0.5R 40.6% · >=0.75R 14.3% · >=1.0R 0.0%

## By regime (in-sample)

| slice | n | hit | mean R | median R | mean % | payoff | PF | total R | maxDD R | max losing run |
|---|---|---|---|---|---|---|---|---|---|---|
| bear (SPY < 50dma) | 864 | 30.2% | 0.058 | -1.000 | 0.011% | 2.50 | 1.08 | 49.7 | 43.7 | 14 |
| bull (SPY > 50dma) | 4186 | 28.1% | 0.002 | -1.000 | 0.007% | 2.56 | 1.00 | 8.4 | 140.5 | 32 |

## By session, side, and year (all trades)

| slice | n | hit | mean R | median R | mean % | payoff | PF | total R | maxDD R | max losing run |
|---|---|---|---|---|---|---|---|---|---|---|
| close 14:00-16:00 | 1666 | 32.2% | 0.052 | -1.000 | 0.018% | 2.27 | 1.08 | 87.1 | 52.4 | 24 |
| mid 10:30-14:00 | 4805 | 27.3% | 0.007 | -1.000 | 0.003% | 2.68 | 1.01 | 35.0 | 154.3 | 25 |
| open 09:30-10:30 | 373 | 25.5% | -0.031 | -1.000 | 0.024% | 2.80 | 0.96 | -11.5 | 62.0 | 15 |
| long | 2882 | 28.5% | 0.015 | -1.000 | 0.010% | 2.57 | 1.02 | 42.5 | 104.2 | 26 |
| short | 3962 | 28.4% | 0.017 | -1.000 | 0.007% | 2.58 | 1.02 | 68.1 | 127.3 | 18 |
| 2023 | 820 | 28.3% | 0.037 | -1.000 | 0.011% | 2.67 | 1.05 | 30.5 | 53.7 | 28 |
| 2024 | 2475 | 28.0% | -0.004 | -1.000 | -0.003% | 2.55 | 0.99 | -8.9 | 125.6 | 23 |
| 2025 | 2250 | 28.6% | 0.022 | -1.000 | 0.016% | 2.58 | 1.03 | 50.2 | 73.0 | 20 |
| 2026 | 1299 | 29.0% | 0.030 | -1.000 | 0.013% | 2.55 | 1.04 | 38.8 | 59.9 | 16 |

## By symbol (all trades)

| slice | n | hit | mean R | median R | mean % | payoff | PF | total R | maxDD R | max losing run |
|---|---|---|---|---|---|---|---|---|---|---|
| BA | 235 | 35.3% | 0.364 | -1.000 | 0.057% | 2.90 | 1.59 | 85.4 | 14.0 | 10 |
| JPM | 213 | 33.8% | 0.302 | -1.000 | 0.035% | 2.87 | 1.46 | 64.4 | 16.4 | 12 |
| SPY | 241 | 29.0% | 0.188 | -1.000 | 0.015% | 3.10 | 1.27 | 45.3 | 19.3 | 10 |
| TSLA | 112 | 39.3% | 0.343 | -1.000 | 0.146% | 2.45 | 1.59 | 38.4 | 14.7 | 12 |
| NFLX | 259 | 30.1% | 0.125 | -1.000 | 0.029% | 2.75 | 1.19 | 32.3 | 22.7 | 12 |
| QCOM | 281 | 33.8% | 0.095 | -1.000 | 0.075% | 2.25 | 1.15 | 26.6 | 28.3 | 17 |
| XLF | 186 | 32.8% | 0.135 | -1.000 | 0.009% | 2.47 | 1.21 | 25.1 | 23.4 | 8 |
| BAC | 180 | 31.7% | 0.136 | -1.000 | 0.033% | 2.60 | 1.20 | 24.5 | 17.2 | 9 |
| INTC | 130 | 33.8% | 0.179 | -1.000 | 0.153% | 2.53 | 1.29 | 23.2 | 14.7 | 12 |
| AMZN | 181 | 26.5% | 0.100 | -1.000 | 0.008% | 3.17 | 1.14 | 18.0 | 21.2 | 10 |
| AVGO | 198 | 26.8% | 0.080 | -1.000 | -0.031% | 3.04 | 1.11 | 15.8 | 40.4 | 14 |
| UBER | 223 | 31.4% | 0.044 | -1.000 | 0.028% | 2.33 | 1.07 | 9.7 | 13.1 | 11 |
| NVDA | 127 | 33.1% | 0.076 | -1.000 | 0.060% | 2.27 | 1.12 | 9.7 | 15.3 | 11 |
| AAPL | 167 | 27.5% | 0.037 | -1.000 | 0.009% | 2.76 | 1.05 | 6.1 | 25.1 | 14 |
| PLTR | 123 | 34.1% | 0.047 | -1.000 | 0.076% | 2.07 | 1.07 | 5.8 | 16.8 | 6 |
| GS | 313 | 28.1% | 0.009 | -1.000 | -0.014% | 2.59 | 1.01 | 2.9 | 32.5 | 13 |
| IWM | 188 | 29.3% | 0.012 | -1.000 | 0.013% | 2.46 | 1.02 | 2.2 | 28.0 | 16 |
| DIS | 266 | 30.1% | 0.008 | -1.000 | 0.024% | 2.35 | 1.01 | 2.1 | 23.5 | 10 |
| AMD | 146 | 30.8% | 0.006 | -1.000 | -0.020% | 2.27 | 1.01 | 0.9 | 21.1 | 9 |
| QQQ | 230 | 27.0% | -0.017 | -1.000 | 0.007% | 2.64 | 0.98 | -3.9 | 41.9 | 11 |
| WMT | 229 | 24.9% | -0.037 | -1.000 | -0.008% | 2.87 | 0.95 | -8.4 | 27.7 | 17 |
| MSFT | 175 | 25.1% | -0.050 | -1.000 | -0.010% | 2.77 | 0.93 | -8.8 | 23.9 | 15 |
| GOOGL | 176 | 29.5% | -0.076 | -1.000 | 0.002% | 2.13 | 0.89 | -13.3 | 24.3 | 19 |
| XOM | 218 | 23.4% | -0.066 | -1.000 | -0.026% | 2.98 | 0.91 | -14.4 | 43.7 | 17 |
| META | 160 | 23.8% | -0.104 | -1.000 | -0.035% | 2.77 | 0.86 | -16.6 | 30.1 | 16 |
| CRM | 268 | 26.1% | -0.070 | -1.000 | -0.007% | 2.55 | 0.90 | -18.7 | 47.5 | 14 |
| MU | 168 | 27.4% | -0.135 | -1.000 | -0.041% | 2.14 | 0.81 | -22.7 | 44.0 | 9 |
| COST | 427 | 25.3% | -0.058 | -1.000 | -0.017% | 2.73 | 0.92 | -24.6 | 74.4 | 20 |
| COIN | 169 | 24.9% | -0.148 | -1.000 | -0.100% | 2.42 | 0.80 | -25.0 | 24.3 | 12 |
| SMH | 232 | 25.4% | -0.116 | -1.000 | -0.016% | 2.46 | 0.84 | -26.9 | 33.9 | 12 |
| XLE | 222 | 24.3% | -0.295 | -1.000 | -0.027% | 1.87 | 0.60 | -65.4 | 72.9 | 13 |
| DIA | 401 | 22.4% | -0.198 | -1.000 | -0.018% | 2.56 | 0.74 | -79.3 | 100.0 | 28 |

## Mechanics

- exits: {'stop': 4683, 'target': 1020, 'time': 1141}
- trades resolved by the pessimistic same-bar assumption (stop and target both inside one bar): 12 (0.2%)
- mean bars held: 56.7
- orders that never filled and expired: 4117 (fill rate 62.4%)
- model parameters: `{"window": [585, 900], "sweep_lookback": 30, "displacement_mult": 1.5, "avg_window": 20, "order_life_min": 45, "flatten_min": 955, "min_rr": 1.5}`

## Caveats

- **Survivorship.** The 32 symbols are liquid *today*. None was chosen on performance and none dropped after seeing a result, but the universe is selected with hindsight and contains no delisted or since-illiquid name. Expect the honest numbers to be modestly worse.
- **Fills are modelled, not observed.** OHLC cannot say what happened inside a bar. Every ambiguity here is resolved against the trade.
- **One position at a time per symbol per day.** A second signal while one is working is dropped, not stacked.
- **No borrow, locate, or halt modelling.** Shorts assume a locate was available and no circuit breaker intervened.
- **Adjusted prices.** Splits are adjusted; the tape a trader saw on the day was the unadjusted one.
