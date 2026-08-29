# sweep_displacement_fvg.v1 — measured on `polygon-v1`

**Verdict: FAIL** against the bar pre-registered in `engine/models/GATES.md`, which was committed before this evaluation ran.

Run 2026-08-29T18:16:43+00:00 at `bac49b2`. 32 symbols, snapshot `polygon-v1`, commission $0.005/share/side, slippage 1.0bp on market and stop fills.

## The gate

| gate | | bar | observed | |
|---|---|---|---|---|
| G1 | sample size | IS>=400, OOS>=100 | IS=5545, OOS=1299 | **PASS** |
| G2 | expectancy after costs (mean net R) | IS>=+0.10, OOS>=+0.05 | IS=-0.116, OOS=-0.064 | **FAIL** |
| G3 | profit factor after costs | IS>=1.20, OOS>=1.10 | IS=0.86, OOS=0.92 | **FAIL** |
| G4 | winners first going >=0.75R against | <=40% | 16.5% | **PASS** |
| G5 | mean net R > 0 in both regimes (in-sample) | both > 0 | bear (SPY < 50dma)=-0.036 (n=864), bull (SPY > 50dma)=-0.135 (n=4186) | **FAIL** |

## Headline

| slice | n | hit | mean R | median R | mean % | payoff | PF | total R | maxDD R | max losing run |
|---|---|---|---|---|---|---|---|---|---|---|
| all | 6844 | 28.1% | -0.106 | -1.064 | -0.008% | 2.22 | 0.87 | -728.6 | 765.7 | 28 |
| in-sample 2023-09-01..2025-12-31 | 5545 | 27.9% | -0.116 | -1.069 | -0.010% | 2.21 | 0.86 | -646.0 | 686.3 | 28 |
| out-of-sample 2026-01-01..2026-08-28 | 1299 | 28.6% | -0.064 | -1.049 | -0.001% | 2.29 | 0.92 | -82.7 | 122.2 | 16 |

## Maximum adverse excursion — the headline statistic

The existing SMS engine's +11.93% average peak concealed a −10.49% average drawdown, with 47.5% of alerts going 8%+ underwater first. Distribution, not mean.

**All trades**

- MAE deciles (R): 0.27 | 0.57 | 0.93 | 1.00 | 1.05 | 1.09 | 1.15 | 1.26 | 1.46
- all trades reaching that far against: >=0.25R 90.5% · >=0.5R 82.2% · >=0.75R 74.7% · >=1.0R 68.4%
- **winners** that first went that far against: >=0.25R 66.4% · >=0.5R 38.7% · >=0.75R 16.0% · >=1.0R 0.0%

**In-sample**

- MAE deciles (R): 0.27 | 0.57 | 0.93 | 1.00 | 1.05 | 1.09 | 1.16 | 1.26 | 1.47
- all trades reaching that far against: >=0.25R 90.6% · >=0.5R 82.2% · >=0.75R 74.9% · >=1.0R 68.5%
- **winners** that first went that far against: >=0.25R 66.5% · >=0.5R 38.3% · >=0.75R 16.5% · >=1.0R 0.0%

**Out-of-sample**

- MAE deciles (R): 0.25 | 0.56 | 0.93 | 1.00 | 1.04 | 1.08 | 1.13 | 1.24 | 1.40
- all trades reaching that far against: >=0.25R 90.2% · >=0.5R 82.2% · >=0.75R 73.7% · >=1.0R 67.9%
- **winners** that first went that far against: >=0.25R 66.1% · >=0.5R 40.1% · >=0.75R 14.0% · >=1.0R 0.0%

## By regime (in-sample)

| slice | n | hit | mean R | median R | mean % | payoff | PF | total R | maxDD R | max losing run |
|---|---|---|---|---|---|---|---|---|---|---|
| bear (SPY < 50dma) | 864 | 29.9% | -0.036 | -1.049 | -0.006% | 2.24 | 0.95 | -31.1 | 65.8 | 14 |
| bull (SPY > 50dma) | 4186 | 27.7% | -0.135 | -1.072 | -0.010% | 2.18 | 0.84 | -564.5 | 598.6 | 32 |

## By session, side, and year (all trades)

| slice | n | hit | mean R | median R | mean % | payoff | PF | total R | maxDD R | max losing run |
|---|---|---|---|---|---|---|---|---|---|---|
| close 14:00-16:00 | 1666 | 31.6% | -0.095 | -1.063 | 0.001% | 1.90 | 0.88 | -158.2 | 192.4 | 24 |
| mid 10:30-14:00 | 4805 | 27.1% | -0.109 | -1.065 | -0.013% | 2.33 | 0.87 | -525.9 | 600.5 | 25 |
| open 09:30-10:30 | 373 | 25.5% | -0.120 | -1.062 | 0.009% | 2.50 | 0.85 | -44.6 | 80.7 | 15 |
| long | 2882 | 28.0% | -0.103 | -1.061 | -0.007% | 2.24 | 0.87 | -298.3 | 300.9 | 26 |
| short | 3962 | 28.1% | -0.109 | -1.067 | -0.009% | 2.21 | 0.86 | -430.4 | 499.2 | 22 |
| 2023 | 820 | 27.9% | -0.100 | -1.075 | -0.008% | 2.26 | 0.88 | -81.9 | 115.4 | 28 |
| 2024 | 2475 | 27.5% | -0.135 | -1.071 | -0.019% | 2.20 | 0.83 | -334.1 | 384.1 | 23 |
| 2025 | 2250 | 28.4% | -0.102 | -1.064 | 0.000% | 2.20 | 0.87 | -229.9 | 242.5 | 20 |
| 2026 | 1299 | 28.6% | -0.064 | -1.049 | -0.001% | 2.29 | 0.92 | -82.7 | 122.2 | 16 |

## By symbol (all trades)

| slice | n | hit | mean R | median R | mean % | payoff | PF | total R | maxDD R | max losing run |
|---|---|---|---|---|---|---|---|---|---|---|
| BA | 235 | 34.5% | 0.284 | -1.046 | 0.043% | 2.69 | 1.42 | 66.8 | 15.0 | 15 |
| JPM | 213 | 33.3% | 0.188 | -1.071 | 0.022% | 2.50 | 1.25 | 40.1 | 21.7 | 12 |
| TSLA | 112 | 39.3% | 0.301 | -1.020 | 0.135% | 2.30 | 1.49 | 33.7 | 15.8 | 12 |
| SPY | 241 | 29.0% | 0.049 | -1.105 | 0.005% | 2.59 | 1.06 | 11.8 | 26.7 | 10 |
| INTC | 130 | 33.8% | 0.025 | -1.077 | 0.112% | 2.02 | 1.03 | 3.2 | 18.5 | 12 |
| AMZN | 181 | 26.0% | 0.015 | -1.057 | -0.005% | 2.91 | 1.02 | 2.7 | 24.8 | 10 |
| QCOM | 281 | 33.1% | 0.006 | -1.049 | 0.060% | 2.04 | 1.01 | 1.8 | 43.5 | 17 |
| NVDA | 127 | 32.3% | 0.004 | -1.040 | 0.043% | 2.11 | 1.01 | 0.5 | 17.9 | 11 |
| AVGO | 198 | 26.8% | -0.002 | -1.048 | -0.047% | 2.73 | 1.00 | -0.5 | 50.3 | 14 |
| PLTR | 123 | 34.1% | -0.041 | -1.041 | 0.045% | 1.82 | 0.94 | -5.0 | 20.6 | 6 |
| AMD | 146 | 30.1% | -0.047 | -1.030 | -0.035% | 2.17 | 0.93 | -6.8 | 24.2 | 9 |
| NFLX | 259 | 30.1% | -0.033 | -1.086 | 0.007% | 2.23 | 0.96 | -8.4 | 43.2 | 12 |
| AAPL | 167 | 26.9% | -0.052 | -1.067 | -0.005% | 2.53 | 0.93 | -8.7 | 31.6 | 14 |
| UBER | 223 | 30.9% | -0.071 | -1.061 | 0.005% | 2.02 | 0.91 | -15.9 | 20.7 | 11 |
| BAC | 180 | 30.6% | -0.101 | -1.131 | 0.001% | 2.00 | 0.88 | -18.1 | 35.6 | 9 |
| IWM | 188 | 29.3% | -0.102 | -1.075 | 0.000% | 2.10 | 0.87 | -19.1 | 44.2 | 16 |
| MSFT | 175 | 25.1% | -0.139 | -1.062 | -0.021% | 2.46 | 0.83 | -24.4 | 32.0 | 15 |
| GS | 313 | 27.8% | -0.078 | -1.049 | -0.025% | 2.34 | 0.90 | -24.5 | 42.1 | 16 |
| META | 160 | 23.1% | -0.168 | -1.045 | -0.046% | 2.64 | 0.79 | -26.9 | 36.5 | 16 |
| GOOGL | 176 | 28.4% | -0.172 | -1.062 | -0.012% | 1.96 | 0.78 | -30.2 | 36.0 | 19 |
| COIN | 169 | 24.9% | -0.180 | -1.022 | -0.113% | 2.32 | 0.77 | -30.4 | 29.4 | 12 |
| QQQ | 230 | 27.0% | -0.134 | -1.079 | -0.004% | 2.26 | 0.83 | -30.9 | 59.6 | 11 |
| XLF | 186 | 30.6% | -0.172 | -1.188 | -0.020% | 1.83 | 0.81 | -32.0 | 49.8 | 10 |
| MU | 168 | 27.4% | -0.210 | -1.037 | -0.058% | 1.93 | 0.73 | -35.2 | 55.5 | 9 |
| DIS | 266 | 30.1% | -0.135 | -1.095 | 0.006% | 1.93 | 0.83 | -35.8 | 56.9 | 10 |
| CRM | 268 | 25.7% | -0.151 | -1.054 | -0.020% | 2.33 | 0.81 | -40.5 | 67.6 | 15 |
| XOM | 218 | 23.4% | -0.204 | -1.093 | -0.043% | 2.50 | 0.76 | -44.5 | 67.0 | 17 |
| SMH | 232 | 25.4% | -0.202 | -1.054 | -0.028% | 2.18 | 0.74 | -47.0 | 48.5 | 12 |
| WMT | 229 | 24.9% | -0.243 | -1.125 | -0.029% | 2.21 | 0.73 | -55.5 | 66.5 | 17 |
| COST | 427 | 25.3% | -0.167 | -1.069 | -0.026% | 2.37 | 0.80 | -71.2 | 105.3 | 20 |
| XLE | 222 | 23.4% | -0.550 | -1.172 | -0.057% | 1.39 | 0.43 | -122.2 | 124.8 | 13 |
| DIA | 401 | 21.9% | -0.388 | -1.129 | -0.029% | 2.09 | 0.59 | -155.5 | 168.3 | 28 |

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
