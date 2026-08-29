# orb_htf_structural.v1 — measured on `polygon-v1`

**Verdict: FAIL** against the bar in [`../models/orb_htf_structural.v1/GATE.md`](../models/orb_htf_structural.v1/GATE.md), which was committed before this evaluation ran.

Run 2026-08-29T19:02:07+00:00 at `b065f88`. 32 symbols, snapshot `polygon-v1`, commission $0.005/share/side, slippage 1.0bp on market and stop fills.

## In plain language

**Did it work?**

No. Over 1,140 trades it missed the bar that was written down before it ran, and the miss is bigger than the uncertainty.

**What the numbers mean, without the jargon.** One "R" is one unit of the money you agreed to lose if the trade goes wrong — the distance from your entry to your stop. A result of +0.10R means that, on average, every trade made a tenth of what it was risking. −0.10R means every trade lost a tenth of what it risked. The bar was +0.10R on the older data and +0.05R on the held-back 2026 data, after costs.

This model averaged **-0.113R** per trade on the older data and **+0.039R** on the held-back 2026 data. In plain money terms, risking $100 a trade, that is about $-11 per trade before 2026 and about $4 per trade during 2026.

**How sure are we?**

The 2026 window is the one that counts: it was held back and read once. There are 244 trades in it. The average could plausibly be anywhere from -0.232R to +0.309R and we would not be able to tell the difference — that is the honest width of the answer. On the older data the range is -0.228R to +0.001R.

This is the **third** day-trading model measured on exactly the same three years of bars. Every extra attempt makes it more likely that one of them looks good by luck alone, which is why the held-back 2026 window is the verdict rather than the older data.

**Was it better than guessing?**

Before costs, the model made +0.063R per trade. A coin flip taken on the same days, in the same names, at the same minute, with the same stop and the same target — differing only in which way it pointed — made -0.036R. Trade for trade the model beat that coin flip by **+0.099R**, though the honest range around that gap is -0.014R to +0.212R. That is the first sign of real direction-picking any model in this programme has shown — and it is still smaller than what the trading costs take out.

Which is the whole story in one line: the model finds about +0.099R of direction, and pays 0.144R to the broker and the spread. The costs are larger, so it loses money.

**What would change the answer?**

- **Cheaper trading, or bigger moves.** The gap between what the direction call earns and what the round trip costs is a number in cents a share, and it is the whole result. Halve the cost, or find setups whose average move is twice as large, and the sign flips. Nothing about where the stop goes changes it by itself.
- **A bigger sample.** The filter is strict by design and the interval around the direction edge still touches zero. More symbols and more years are both available and are the only honest way to narrow it.
- **A different definition of "major level".** The stop rule is only as good as what counts as a level, and this definition was chosen for plausibility, not performance. Taking the nearest level of a fairly dense set puts the stop close, which is why risk came out narrower than the brief expected — a sparser definition would place it behind the swing that actually invalidates the idea, and would change which trades survive rather than merely rescaling them.
- **Holding past the close.** Everything here is flat at 15:55. A daily trend filter argues for a multi-day horizon, and this test never lets the trend pay.

## The headline number this run existed to produce

ENGINE-1 measured risk per trade at 0.18–0.29% of price, so a $0.01/share round trip plus 2bp of slippage ate 9–14% of the risk on every trade, and the whole day-trade family needed about **+0.15R of gross edge just to break even**. The owner's structural stop was the mechanism that was supposed to move that floor.

| | ENGINE-1 (`orb_reclaim.v1`) | this model |
|---|---|---|
| median risk per trade, % of price | 0.287% | **0.187%** |
| interquartile range | — | 0.137% – 0.289% |
| costs as a fraction of risk (measured) | ≈0.09 R | **0.144 R** |
| gross edge needed to break even | ≈+0.15 R | **≈+0.14 R** |

The structural stop did **not** widen risk the way the brief expected. At 0.187% of price it sits in the same band ENGINE-1 measured, so costs still take 0.144R out of every trade and the family still needs roughly +0.14R of gross edge before it earns anything. That is a finding about the nearest-major-level rule itself: the nearest level is usually close, because a liquid stock in a trend has structure just underneath it.

### The same argument in cents a share

R-multiples divide by the stop distance, so a wider stop makes the cost ratio look better and the edge look smaller by exactly the same factor. That is why the brief's arithmetic — wider stop, smaller cost drag, lower break-even — is only half true: **widening the stop rescales both sides of the ratio and cannot on its own change the sign.** What changes the sign is earning more cents a share, which a wider stop does only insofar as it stops the trade being knocked out of moves that eventually worked.

| per share, average trade (mean price $262) | |
|---|---|
| the model's result before costs | +4.63¢ |
| commission and slippage | −5.61¢ |
| **the model's result after costs** | **-0.98¢** |
| for reference: the matched coin flip, before costs | -4.27¢ |
| what pointing the right way was worth | +8.90¢ (95%: -2.39¢ to +20.19¢) |

Read it in that order. On a $262 share the setup earns about 4.6 cents before costs and pays about 5.6 cents to get in and out, so it loses roughly 1.0 cents a share. Choosing the direction on purpose was worth about 8.9 cents against a coin flip with the same stop and target — so the direction call is not nothing — but the coin flip's own baseline is well below zero with this geometry, and beating it is not the same as making money.

Two caveats on this table, because it is easy to over-read. Cents a share weights an expensive stock's trade more heavily than a cheap one's, whereas the R table above weights every trade by its own risk, which is what a position-sized trader actually experiences. The two views disagree about how far the model sits above the coin flip; they agree that after costs it is below zero.

## The gate

| gate | | bar | observed | |
|---|---|---|---|---|
| G1 | sample size | IS>=400, OOS>=100 | IS=896, OOS=244 | **PASS** |
| G2 | expectancy after costs (mean net R) | IS>=+0.10, OOS>=+0.05 | IS=-0.113, OOS=+0.039 | **FAIL** |
| G3 | profit factor after costs | IS>=1.20, OOS>=1.10 | IS=0.85, OOS=1.05 | **FAIL** |
| G4 | winners first going >=0.75R against | <=40% | 15.0% | **PASS** |
| G5 | mean net R > 0 in both regimes (in-sample) | both > 0 | bear (SPY < 50dma)=-0.021 (n=185), bull (SPY > 50dma)=-0.124 (n=679) | **FAIL** |

## Headline

| slice | n | hit | mean R | median R | mean % | payoff | PF | total R | maxDD R | max losing run |
|---|---|---|---|---|---|---|---|---|---|---|
| all | 1140 | 30.3% | -0.081 | -1.059 | -0.008% | 2.06 | 0.89 | -92.1 | 116.9 | 22 |
| in-sample 2023-09-01..2025-12-31 | 896 | 29.8% | -0.113 | -1.062 | -0.019% | 2.01 | 0.85 | -101.6 | 116.5 | 17 |
| out-of-sample 2026-01-01..2026-08-28 | 244 | 32.0% | 0.039 | -1.049 | 0.030% | 2.24 | 1.05 | 9.4 | 29.8 | 12 |

## Maximum adverse excursion — the headline statistic

The existing SMS engine's +11.93% average peak concealed a −10.49% average drawdown, with 47.5% of alerts going 8%+ underwater first. Distribution, not mean.

**All trades**

- MAE deciles (R): 0.27 | 0.55 | 0.92 | 1.03 | 1.08 | 1.16 | 1.25 | 1.39 | 1.70
- all trades reaching that far against: >=0.25R 90.8% · >=0.5R 82.1% · >=0.75R 74.2% · >=1.0R 68.6%
- **winners** that first went that far against: >=0.25R 69.6% · >=0.5R 41.7% · >=0.75R 16.5% · >=1.0R 0.0%

**In-sample**

- MAE deciles (R): 0.26 | 0.52 | 0.94 | 1.03 | 1.08 | 1.16 | 1.25 | 1.38 | 1.69
- all trades reaching that far against: >=0.25R 90.7% · >=0.5R 80.9% · >=0.75R 74.0% · >=1.0R 68.9%
- **winners** that first went that far against: >=0.25R 68.9% · >=0.5R 37.1% · >=0.75R 15.0% · >=1.0R 0.0%

**Out-of-sample**

- MAE deciles (R): 0.29 | 0.67 | 0.91 | 1.03 | 1.07 | 1.16 | 1.27 | 1.42 | 1.75
- all trades reaching that far against: >=0.25R 91.0% · >=0.5R 86.5% · >=0.75R 75.0% · >=1.0R 67.6%
- **winners** that first went that far against: >=0.25R 71.8% · >=0.5R 57.7% · >=0.75R 21.8% · >=1.0R 0.0%

## By regime (in-sample)

| slice | n | hit | mean R | median R | mean % | payoff | PF | total R | maxDD R | max losing run |
|---|---|---|---|---|---|---|---|---|---|---|
| bear (SPY < 50dma) | 185 | 29.7% | -0.021 | -1.055 | 0.027% | 2.30 | 0.97 | -3.8 | 21.9 | 11 |
| bull (SPY > 50dma) | 679 | 30.2% | -0.124 | -1.061 | -0.029% | 1.93 | 0.84 | -84.5 | 98.5 | 18 |

## By session, side, and year (all trades)

| slice | n | hit | mean R | median R | mean % | payoff | PF | total R | maxDD R | max losing run |
|---|---|---|---|---|---|---|---|---|---|---|
| mid 10:30-14:00 | 194 | 28.9% | -0.112 | -1.076 | -0.028% | 2.11 | 0.86 | -21.7 | 38.2 | 13 |
| open 09:30-10:30 | 946 | 30.5% | -0.074 | -1.057 | -0.004% | 2.05 | 0.90 | -70.4 | 93.6 | 19 |
| long | 684 | 29.5% | -0.147 | -1.061 | -0.029% | 1.93 | 0.81 | -100.5 | 110.3 | 22 |
| short | 456 | 31.4% | 0.018 | -1.054 | 0.024% | 2.24 | 1.02 | 8.4 | 50.3 | 13 |
| 2023 | 88 | 27.3% | -0.240 | -1.079 | -0.052% | 1.87 | 0.70 | -21.1 | 30.3 | 9 |
| 2024 | 374 | 28.9% | -0.124 | -1.064 | -0.036% | 2.07 | 0.84 | -46.5 | 57.2 | 15 |
| 2025 | 434 | 31.1% | -0.078 | -1.058 | 0.003% | 1.98 | 0.89 | -33.9 | 58.3 | 11 |
| 2026 | 244 | 32.0% | 0.039 | -1.049 | 0.030% | 2.24 | 1.05 | 9.4 | 29.8 | 12 |

## By symbol (all trades)

| slice | n | hit | mean R | median R | mean % | payoff | PF | total R | maxDD R | max losing run |
|---|---|---|---|---|---|---|---|---|---|---|
| MSFT | 30 | 33.3% | 0.523 | -1.054 | 0.055% | 3.46 | 1.73 | 15.7 | 8.3 | 5 |
| WMT | 36 | 44.4% | 0.409 | -1.068 | 0.123% | 2.06 | 1.65 | 14.7 | 5.8 | 5 |
| QQQ | 34 | 50.0% | 0.379 | 0.008 | 0.079% | 1.71 | 1.71 | 12.9 | 3.2 | 3 |
| UBER | 40 | 37.5% | 0.311 | -1.068 | 0.050% | 2.41 | 1.44 | 12.4 | 7.9 | 7 |
| CRM | 38 | 44.7% | 0.207 | -1.022 | 0.095% | 1.68 | 1.36 | 7.9 | 3.6 | 3 |
| DIS | 32 | 40.6% | 0.200 | -1.063 | 0.083% | 1.91 | 1.31 | 6.4 | 9.0 | 7 |
| JPM | 27 | 37.0% | 0.181 | -1.042 | 0.024% | 2.16 | 1.27 | 4.9 | 6.4 | 7 |
| DIA | 30 | 23.3% | 0.142 | -1.058 | -0.063% | 3.86 | 1.17 | 4.3 | 15.4 | 12 |
| INTC | 28 | 42.9% | 0.152 | -1.067 | 0.086% | 1.63 | 1.22 | 4.3 | 8.8 | 6 |
| COST | 27 | 29.6% | 0.131 | -1.066 | 0.046% | 2.78 | 1.17 | 3.5 | 6.5 | 5 |
| TSLA | 44 | 29.5% | -0.019 | -1.035 | 0.143% | 2.32 | 0.97 | -0.8 | 10.9 | 8 |
| AMZN | 37 | 32.4% | -0.042 | -1.057 | -0.066% | 1.96 | 0.94 | -1.6 | 15.6 | 7 |
| AVGO | 34 | 26.5% | -0.055 | -1.073 | 0.149% | 2.58 | 0.93 | -1.9 | 8.3 | 8 |
| SPY | 33 | 30.3% | -0.094 | -1.067 | -0.007% | 2.00 | 0.87 | -3.1 | 10.0 | 10 |
| PLTR | 27 | 25.9% | -0.118 | -1.080 | -0.112% | 2.46 | 0.86 | -3.2 | 13.5 | 12 |
| MU | 32 | 37.5% | -0.101 | -1.041 | -0.020% | 1.41 | 0.84 | -3.2 | 7.4 | 5 |
| META | 51 | 37.3% | -0.068 | -1.028 | 0.012% | 1.51 | 0.90 | -3.5 | 7.0 | 5 |
| QCOM | 38 | 34.2% | -0.101 | -1.061 | -0.029% | 1.65 | 0.86 | -3.8 | 6.8 | 6 |
| NFLX | 28 | 25.0% | -0.166 | -1.131 | -0.035% | 2.41 | 0.80 | -4.6 | 8.4 | 6 |
| NVDA | 31 | 25.8% | -0.171 | -1.093 | 0.024% | 2.27 | 0.79 | -5.3 | 9.8 | 9 |
| GS | 38 | 26.3% | -0.144 | -1.057 | -0.042% | 2.28 | 0.81 | -5.5 | 18.7 | 17 |
| BAC | 33 | 30.3% | -0.171 | -1.140 | 0.005% | 1.83 | 0.79 | -5.7 | 9.4 | 6 |
| XLF | 23 | 30.4% | -0.306 | -1.186 | -0.047% | 1.45 | 0.64 | -7.0 | 10.0 | 5 |
| SMH | 38 | 21.1% | -0.287 | -1.052 | -0.069% | 2.44 | 0.65 | -10.9 | 13.9 | 13 |
| IWM | 58 | 29.3% | -0.192 | -1.063 | -0.051% | 1.79 | 0.74 | -11.2 | 19.9 | 8 |
| AMD | 47 | 21.3% | -0.251 | -1.064 | -0.031% | 2.61 | 0.70 | -11.8 | 19.1 | 10 |
| BA | 36 | 22.2% | -0.329 | -1.050 | -0.118% | 2.13 | 0.61 | -11.9 | 13.8 | 8 |
| AAPL | 27 | 18.5% | -0.445 | -1.076 | -0.105% | 2.18 | 0.50 | -12.0 | 13.1 | 9 |
| XLE | 40 | 30.0% | -0.354 | -1.142 | -0.080% | 1.28 | 0.55 | -14.2 | 14.7 | 11 |
| COIN | 52 | 17.3% | -0.277 | -1.065 | -0.106% | 3.31 | 0.69 | -14.4 | 26.8 | 16 |
| GOOGL | 24 | 12.5% | -0.812 | -1.078 | -0.144% | 1.00 | 0.14 | -19.5 | 20.0 | 8 |
| XOM | 47 | 23.4% | -0.512 | -1.089 | -0.089% | 1.30 | 0.40 | -24.1 | 23.0 | 9 |

## Mechanics

- exits: {'stop': 782, 'time': 86, 'target': 272}
- trades resolved by the pessimistic same-bar assumption (stop and target both inside one bar): 0 (0.0%)
- mean bars held: 48.9
- orders that never filled and expired: 0 (fill rate 100.0%)
- model parameters: `{"or_minutes": 15, "entry_tf_minutes": 5, "window": [589, 659], "flatten_min": 955, "min_or_pct": 0.0015, "max_or_pct": 0.03, "daily_pivot_n": 2, "daily_lookback": 120, "pivot_n": 6, "pivot_lookback": 480, "touch_bps": 8.0, "min_touches": 2, "cluster_bps": 25.0, "level_daily_pivot_n": 3, "level_daily_lookback": 60, "stop_buffer_bps": 5.0, "min_risk_pct": 0.001, "max_risk_pct": 0.015, "min_rr": 1.5, "require_htf": true, "stop_mode": "structural"}`

## Caveats

- **Survivorship.** The 32 symbols are liquid *today*. None was chosen on performance and none dropped after seeing a result, but the universe is selected with hindsight and contains no delisted or since-illiquid name. Expect the honest numbers to be modestly worse.
- **Fills are modelled, not observed.** OHLC cannot say what happened inside a bar. Every ambiguity here is resolved against the trade.
- **One position at a time per symbol per day.** A second signal while one is working is dropped, not stacked.
- **No borrow, locate, or halt modelling.** Shorts assume a locate was available and no circuit breaker intervened.
- **Adjusted prices.** Splits are adjusted; the tape a trader saw on the day was the unadjusted one.

## Gross of costs, against the matched control

ENGINE-1's decisive finding was that both of its models were below a coin flip *before* costs, which settles the net number without further argument. So this table is read first.

| run | n | gross mean R | net mean R | hit | PF (net) |
|---|---|---|---|---|---|
| `orb_htf_structural.v1` (full spec) | 1140 | +0.063 | -0.081 | 30.3% | 0.89 |
| `null_coinflip.v1.matched` (control) | 1140 | -0.036 | -0.176 | 26.4% | 0.78 |


Paired trade by trade on the same symbol-day, **gross of costs**:

| window | pairs | model − control, gross mean R | 95% interval |
|---|---|---|---|
| all | 1140 | **+0.099** | -0.014 to +0.212 |
| in-sample | 896 | +0.091 | -0.035 to +0.218 |
| out-of-sample | 244 | +0.129 | -0.124 to +0.381 |

This is the one number in the report that is better than anything ENGINE-1 produced: both of its models were *below* their control gross. This one is above it. But read the interval before celebrating — it still contains zero, so the gap is suggestive rather than established. The gap of +0.099R is smaller than the 0.144R that costs remove from every trade, which is why a model that points the right way still finishes behind.

The control is not the ENGINE-1 whole-tape coin flip. It takes the same symbols, the same days, the same decision minute and the same risk and reward distances as the trades the model actually took, and flips only the direction. It is the like-for-like question: **did knowing which way to point pay for itself?**

## Ablations — two runs, clearly diagnostics

The pre-registered gate applies to the full spec alone. These two runs exist to say whether the owner's two changes did anything, and neither can be promoted into the result.

| run | n | gross mean R | net mean R | median risk % | hit |
|---|---|---|---|---|---|
| full spec | 1140 | +0.063 | -0.081 | 0.187% | 30.3% |
| A1 — HTF filter removed | 4662 | +0.044 | -0.096 | 0.194% | 29.0% |
| A2 — structural stop replaced by a range-edge stop, same trades | 1140 | +0.061 | -0.123 | 0.175% | 28.5% |

**A1 — did the daily-trend filter earn the trades it costs?** Removing it takes the sample from 1,140 to 4,662 trades and moves gross expectancy from +0.063R to +0.044R (net -0.081R to -0.096R). The filtered version is the better of the two gross, so the trend confirmation is buying accuracy and not only cutting count — but the gap is 0.020R on samples this size, which is well inside the noise, and both versions are still losers after costs. This is a hint about direction, not a result.

**A2 — did the structural stop do anything?** Holding the trade set fixed and moving only the stop to just inside the broken range edge gives +0.061R gross and -0.123R net, against the structural stop's +0.063R and -0.081R. The structural stop is worth +0.042R a trade over the range-edge stop, which is the direction the owner's rule predicted. It is also the single largest improvement either change produced — and it is not close to enough to reach the bar.

## Where the days went

Every symbol-day the model looked at, and the rule that ended it. This is the honest picture of how hard the filter bites.

| outcome | symbol-days |
|---|---|
| days_seen | 23,840 |
| skip_no_daily_trend | 11,791 |
| skip_opening_range_size | 653 |
| triggers | 5,149 |
| skip_risk_too_wide | 100 |
| skip_risk_too_tight | 663 |
| skip_no_target_level | 473 |
| skip_reward_under_min_rr | 2,773 |
| signals | 1,140 |

Days that reached the opening-range checks but never closed beyond the trend-side edge inside the window: 6,247. With the daily-trend filter removed the trigger count is 18,839 against 5,149 — the filter is doing most of the cutting, exactly as the brief expected.

## Disclosures specific to this run

- **Third model, same bars.** `orb_reclaim.v1` and `sweep_displacement_fvg.v1` were measured on this identical cache. Testing variants makes an in-sample winner likelier by chance; the out-of-sample window is treated as the verdict and is read once.
- **The level definition was chosen by eye, on sparsity only.** Six-bar pivots on 5-minute bars, two touches within 8bp, 25bp clustering, plus prior-day / premarket / overnight extremes and 3-bar daily pivots. The choice was made by checking that the level set looks like a chart a trader would mark, across five symbols and three dates. No backtest was run and no PnL was seen before those numbers were frozen. A different definition is a different model and needs its own gate.
- **The 0.10%-of-price risk floor is an addition beyond the owner's words.** It is justified by ENGINE-1's cost arithmetic, not by a result. Its effect is reported in the day census above.
- **The entry timeframe is 5 minutes; the replay is 1 minute.** A 1-minute bar ending at :49 IS the close of the 09:45–09:50 bar, so the model decides on 5-minute information while fills keep 1-minute resolution.
- **Only the trend-side edge of the opening range is watched.** An uptrend day that breaks down is not a short, it is a day off. That is the brief's rule, not an optimisation.
