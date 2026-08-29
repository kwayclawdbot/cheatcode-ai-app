# null_coinflip.v1 — measured on `polygon-v1`

**Verdict: FAIL** against the bar pre-registered in `engine/models/GATES.md`, which was committed before this evaluation ran.

Run 2026-08-29T18:21:18+00:00 at `bac49b2`. 32 symbols, snapshot `polygon-v1`, commission $0.0/share/side, slippage 0.0bp on market and stop fills.

## The gate

| gate | | bar | observed | |
|---|---|---|---|---|
| G1 | sample size | IS>=400, OOS>=100 | IS=18422, OOS=5280 | **PASS** |
| G2 | expectancy after costs (mean net R) | IS>=+0.10, OOS>=+0.05 | IS=+0.045, OOS=+0.073 | **FAIL** |
| G3 | profit factor after costs | IS>=1.20, OOS>=1.10 | IS=1.07, OOS=1.11 | **FAIL** |
| G4 | winners first going >=0.75R against | <=40% | 15.9% | **PASS** |
| G5 | mean net R > 0 in both regimes (in-sample) | both > 0 | bear (SPY < 50dma)=+0.002 (n=3164), bull (SPY > 50dma)=+0.060 (n=13820) | **PASS** |

## Headline

| slice | n | hit | mean R | median R | mean % | payoff | PF | total R | maxDD R | max losing run |
|---|---|---|---|---|---|---|---|---|---|---|
| all | 23702 | 34.0% | 0.051 | -1.000 | 0.002% | 2.09 | 1.08 | 1218.3 | 116.2 | 19 |
| in-sample 2023-09-01..2025-12-31 | 18422 | 33.5% | 0.045 | -1.000 | 0.000% | 2.11 | 1.07 | 831.1 | 150.6 | 18 |
| out-of-sample 2026-01-01..2026-08-28 | 5280 | 35.4% | 0.073 | -1.000 | 0.008% | 2.03 | 1.11 | 387.1 | 37.2 | 19 |

## Maximum adverse excursion — the headline statistic

The existing SMS engine's +11.93% average peak concealed a −10.49% average drawdown, with 47.5% of alerts going 8%+ underwater first. Distribution, not mean.

**All trades**

- MAE deciles (R): 0.17 | 0.45 | 0.81 | 1.04 | 1.12 | 1.22 | 1.34 | 1.51 | 1.81
- all trades reaching that far against: >=0.25R 87.0% · >=0.5R 78.4% · >=0.75R 71.5% · >=1.0R 65.9%
- **winners** that first went that far against: >=0.25R 61.9% · >=0.5R 36.7% · >=0.75R 16.5% · >=1.0R 0.0%

**In-sample**

- MAE deciles (R): 0.17 | 0.45 | 0.82 | 1.04 | 1.13 | 1.22 | 1.35 | 1.52 | 1.82
- all trades reaching that far against: >=0.25R 86.7% · >=0.5R 78.3% · >=0.75R 71.6% · >=1.0R 66.3%
- **winners** that first went that far against: >=0.25R 60.8% · >=0.5R 35.7% · >=0.75R 15.9% · >=1.0R 0.0%

**Out-of-sample**

- MAE deciles (R): 0.20 | 0.47 | 0.79 | 1.03 | 1.11 | 1.20 | 1.32 | 1.48 | 1.76
- all trades reaching that far against: >=0.25R 87.8% · >=0.5R 78.7% · >=0.75R 71.1% · >=1.0R 64.5%
- **winners** that first went that far against: >=0.25R 65.5% · >=0.5R 40.0% · >=0.75R 18.6% · >=1.0R 0.0%

## By regime (in-sample)

| slice | n | hit | mean R | median R | mean % | payoff | PF | total R | maxDD R | max losing run |
|---|---|---|---|---|---|---|---|---|---|---|
| bear (SPY < 50dma) | 3164 | 33.5% | 0.002 | -1.000 | -0.001% | 1.99 | 1.00 | 6.1 | 107.0 | 16 |
| bull (SPY > 50dma) | 13820 | 33.6% | 0.060 | -1.000 | 0.001% | 2.15 | 1.09 | 827.4 | 103.5 | 18 |

## By session, side, and year (all trades)

| slice | n | hit | mean R | median R | mean % | payoff | PF | total R | maxDD R | max losing run |
|---|---|---|---|---|---|---|---|---|---|---|
| close 14:00-16:00 | 4545 | 34.0% | 0.017 | -1.000 | -0.000% | 1.99 | 1.03 | 77.8 | 114.6 | 28 |
| mid 10:30-14:00 | 15858 | 33.7% | 0.061 | -1.000 | 0.001% | 2.15 | 1.09 | 960.2 | 111.7 | 22 |
| open 09:30-10:30 | 3299 | 35.2% | 0.055 | -1.000 | 0.010% | 2.00 | 1.08 | 180.3 | 50.5 | 20 |
| long | 11835 | 34.0% | 0.043 | -1.000 | 0.003% | 2.07 | 1.07 | 512.7 | 176.2 | 20 |
| short | 11867 | 34.0% | 0.059 | -1.000 | 0.001% | 2.12 | 1.09 | 705.6 | 96.4 | 18 |
| 2023 | 2479 | 33.1% | -0.012 | -1.000 | -0.003% | 1.99 | 0.98 | -30.8 | 98.3 | 17 |
| 2024 | 8000 | 34.0% | 0.072 | -1.000 | 0.002% | 2.15 | 1.11 | 577.4 | 77.9 | 18 |
| 2025 | 7943 | 33.2% | 0.036 | -1.000 | -0.001% | 2.12 | 1.05 | 284.5 | 94.5 | 18 |
| 2026 | 5280 | 35.4% | 0.073 | -1.000 | 0.008% | 2.03 | 1.11 | 387.1 | 37.2 | 19 |

## By symbol (all trades)

| slice | n | hit | mean R | median R | mean % | payoff | PF | total R | maxDD R | max losing run |
|---|---|---|---|---|---|---|---|---|---|---|
| XLF | 742 | 35.3% | 0.637 | -1.000 | 0.002% | 3.63 | 1.98 | 472.6 | 26.9 | 16 |
| GS | 723 | 32.8% | 0.302 | -1.000 | -0.003% | 2.95 | 1.44 | 218.5 | 60.2 | 15 |
| COST | 723 | 38.0% | 0.167 | -1.000 | 0.007% | 2.06 | 1.26 | 120.7 | 26.5 | 10 |
| PLTR | 743 | 37.1% | 0.117 | -1.000 | 0.027% | 2.01 | 1.19 | 87.1 | 30.1 | 18 |
| BAC | 740 | 36.2% | 0.095 | -1.000 | 0.009% | 2.02 | 1.15 | 70.1 | 38.7 | 11 |
| GOOGL | 743 | 36.3% | 0.092 | -1.000 | 0.013% | 2.01 | 1.14 | 68.5 | 21.6 | 11 |
| IWM | 742 | 36.3% | 0.082 | -1.000 | 0.004% | 1.98 | 1.13 | 60.9 | 40.1 | 13 |
| MSFT | 741 | 35.9% | 0.082 | -1.000 | 0.007% | 2.01 | 1.13 | 60.6 | 36.1 | 13 |
| UBER | 743 | 35.5% | 0.077 | -1.000 | 0.013% | 2.03 | 1.12 | 57.4 | 43.4 | 15 |
| AVGO | 736 | 34.4% | 0.073 | -1.000 | 0.009% | 2.12 | 1.11 | 53.6 | 44.2 | 11 |
| QQQ | 743 | 34.9% | 0.053 | -1.000 | 0.005% | 2.02 | 1.08 | 39.1 | 27.3 | 19 |
| AMD | 742 | 34.5% | 0.051 | -1.000 | 0.005% | 2.05 | 1.08 | 37.7 | 28.1 | 14 |
| META | 742 | 34.5% | 0.046 | -1.000 | -0.000% | 2.03 | 1.07 | 34.5 | 21.1 | 11 |
| JPM | 744 | 34.0% | 0.026 | -1.000 | 0.005% | 2.02 | 1.04 | 19.5 | 37.8 | 17 |
| XOM | 740 | 34.3% | 0.025 | -1.000 | 0.003% | 1.98 | 1.04 | 18.2 | 30.4 | 10 |
| BA | 743 | 33.6% | 0.018 | -1.000 | -0.003% | 2.02 | 1.03 | 13.1 | 37.3 | 11 |
| MU | 742 | 33.8% | 0.014 | -1.000 | 0.002% | 2.00 | 1.02 | 10.5 | 48.2 | 18 |
| SMH | 743 | 33.9% | 0.012 | -1.000 | 0.001% | 1.98 | 1.02 | 9.0 | 27.4 | 14 |
| AMZN | 744 | 34.0% | 0.011 | -1.000 | 0.004% | 1.97 | 1.02 | 8.3 | 46.8 | 14 |
| DIA | 737 | 32.7% | 0.011 | -1.000 | -0.001% | 2.09 | 1.02 | 7.9 | 57.5 | 12 |
| XLE | 742 | 33.4% | 0.002 | -1.000 | -0.003% | 2.00 | 1.00 | 1.5 | 33.6 | 15 |
| SPY | 742 | 33.4% | 0.001 | -1.000 | -0.001% | 2.00 | 1.00 | 0.8 | 40.2 | 16 |
| DIS | 741 | 33.1% | -0.002 | -1.000 | -0.007% | 2.02 | 1.00 | -1.2 | 43.1 | 12 |
| NFLX | 738 | 32.9% | -0.005 | -1.000 | -0.002% | 2.02 | 0.99 | -3.4 | 40.9 | 13 |
| AAPL | 743 | 33.0% | -0.014 | -1.000 | 0.001% | 1.99 | 0.98 | -10.2 | 39.2 | 18 |
| QCOM | 743 | 32.6% | -0.027 | -1.000 | 0.005% | 1.99 | 0.96 | -20.2 | 66.3 | 15 |
| WMT | 744 | 32.1% | -0.029 | -1.000 | 0.001% | 2.02 | 0.96 | -21.8 | 48.3 | 11 |
| INTC | 743 | 31.9% | -0.030 | -1.000 | -0.002% | 2.04 | 0.96 | -22.2 | 36.6 | 16 |
| TSLA | 740 | 32.2% | -0.035 | -1.000 | -0.008% | 2.00 | 0.95 | -25.8 | 83.3 | 15 |
| COIN | 744 | 32.5% | -0.036 | -1.000 | -0.008% | 1.97 | 0.95 | -26.5 | 57.9 | 15 |
| CRM | 743 | 32.0% | -0.052 | -1.000 | -0.001% | 1.96 | 0.92 | -38.4 | 54.6 | 15 |
| NVDA | 743 | 29.7% | -0.111 | -1.000 | -0.023% | 1.99 | 0.84 | -82.2 | 94.0 | 16 |

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
