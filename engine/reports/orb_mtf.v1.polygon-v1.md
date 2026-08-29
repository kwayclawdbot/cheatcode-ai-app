# orb_mtf.v1 — measured on `polygon-v1`

**Exit A (day trade): INCONCLUSIVE (sample). Exit B (swing): INCONCLUSIVE (sample).** Against the bar in [`../models/orb_mtf.v1/GATE.md`](../models/orb_mtf.v1/GATE.md), which was committed before this evaluation ran.

Run 2026-08-29T19:39:23+00:00 at `1021168`. 32 symbols, snapshot `polygon-v1`, commission $0.005/share/side, slippage 1.0bp on market and stop fills.

## In plain language

**The one number this whole model exists to move.**

ENGINE-2 lost because the setup earned 4.63 cents a share and cost 5.61 cents a share to trade. Subtract, and it loses about a cent a share, every time. The owner's correction was to put the stop and the target on the 1-hour and 4-hour charts instead of the 5-minute one, so the move being aimed at is bigger while the round trip stays the same. So the first table in this report is that subtraction, done again.

| per share, average trade | Exit A (flat at 15:55) | Exit B (held up to 5 days) |
|---|---|---|
| what the setup earned, before costs | +7.08¢ | +6.67¢ |
| what it paid to get in and out | −5.55¢ | −5.46¢ |
| **what was left, on the average trade** | **+1.53¢** | **+1.21¢** |
| what was left, on the MIDDLE trade | -25.0¢ | -28.2¢ |
| for comparison, ENGINE-2 | +4.63¢ earned, −5.61¢ paid, −0.98¢ left | — |

Average share price in this sample: $258.

**Read the second row before the first one.** The average trade finished +1.53¢ ahead and the middle trade finished -25¢ behind. That gap is the result. Across all 448 trades the model made $6.85 per share in total, and three of those trades contributed $36.52 between them. Which means the other 445 lost $29.67 between them. Take the best three away and it is a clearly losing model. Measured the way a position-sized trader actually experiences it, weighting every trade by its own risk rather than by the price of the share, it IS a losing model: mean net -0.044R on Exit A and -0.046R on Exit B. **The two views disagree in sign, and that disagreement is itself the finding** — a positive average carried by three outliers out of 448 is not an edge, it is a fat tail.

**Did it work?**

- **Exit A: we cannot tell, and that is the honest answer.** The double trend filter and the skip rules left only 448 trades (338 older, 110 in the held-back window), below the count we said in advance we would need before believing a good number or a bad one. Not a pass, and not a proven failure.
- **Exit B: we cannot tell, and that is the honest answer.** The double trend filter and the skip rules left only 448 trades (338 older, 110 in the held-back window), below the count we said in advance we would need before believing a good number or a bad one. Not a pass, and not a proven failure.

**What the numbers mean, without the jargon.** One "R" is one unit of the money you agreed to lose if the trade goes wrong — the distance from your entry to your stop. +0.10R means that, on average, every trade made a tenth of what it was risking. The bar was +0.10R on the older data and +0.05R on the held-back 2026 data, after costs.

**How sure are we?**

- **Exit A.** 110 trades in the held-back 2026 window, averaging +0.070R; the honest range around that is -0.271R to +0.410R. On the older data, 338 trades averaging -0.081R, range -0.271R to +0.109R.
- **Exit B.** 110 trades in the held-back 2026 window, averaging +0.009R; the honest range around that is -0.340R to +0.359R. On the older data, 338 trades averaging -0.064R, range -0.267R to +0.140R.

This is the **fourth** day-trading model measured on exactly the same three years of bars, and it is not an independent fourth: it shares the opening range, the trigger window, the range band, the stop buffer, the risk floor and the reward floor with `orb_htf_structural.v1`, the model that just failed. It is a variant of a variant. Every extra attempt makes it likelier that one of them looks good by luck alone, which is why the held-back 2026 window is the verdict rather than the older data.

**Was it better than guessing?**

- **Exit A.** Before costs the model made +0.079R a trade; a coin flip on the same days, in the same names, at the same minute, with the same stop and target made +0.026R. Paired trade for trade the gap is **+0.052R** (95%: -0.139R to +0.244R, n=448). The interval contains zero, so the gap is suggestive rather than established.
- **Exit B.** Before costs the model made +0.076R a trade; a coin flip on the same days, in the same names, at the same minute, with the same stop and target made +0.067R. Paired trade for trade the gap is **+0.009R** (95%: -0.225R to +0.244R, n=448). The interval contains zero, so the gap is suggestive rather than established.

**Close it, or let it run?**

The entry is identical, so the difference between the two exits IS the value of letting it run. Over 448 paired trades, holding was worth **-0.002R** a trade against closing at 15:55 (95%: -0.061R to +0.057R).

That average is small for a reason that matters more than the average: **408 of the 448 trades are the same trade either way.** The stop or the target was reached before 15:55, so there was nothing left to hold. Only 40 trades were still live at the bell; of those, holding helped 17 and hurt 23. Sessions held, counting the entry day: 1: 409, 2: 25, 3: 6, 4: 5, 5: 3.

So the honest answer to "close it or let it run" for THIS setup is that the question rarely comes up, and when it does the evidence does not favour holding. A 1h/4h target 1.5R away is usually resolved inside the session the trade was taken in: Exit A ended 40 trades on the clock at 15:55, and Exit B carried 39 of them past a closing bell and resolved all but 3 of those at a stop or a target within five sessions.

**And the overnight risk is real even when the average hides it.** Of the 39 trades that did go overnight, 22 were resolved by a session opening straight through the stop — filled at that open, not at the stop price, which cost an extra 0.02R on each of them beyond the risk that was agreed. 0 trades (0.0%) finished worse than −2R, against a pre-registered ceiling of 5%; the worst single trade lost -1.81R. A stop that can be gapped through is not a stop, and any 'let it run' control has to say so.

**What would change the answer?**

- **Whether the stop actually moved.** The correction only bites when the nearest level beyond entry is a 1-hour or 4-hour pivot. It was on 19% of trades; on the rest the nearest level was a prior-day, overnight or daily level that `orb_htf_structural.v1` also had, so the stop landed exactly where it landed before. This was written down as the likely quiet failure before the run, and the number is above.
- **A sparser definition of "major".** Dropping the shared reference levels from the family would force every stop onto 1h/4h structure. That is a different model and it needs its own gate; it is not a parameter to be nudged inside this one.
- **Cheaper trading, or bigger moves.** The subtraction at the top of this report is the whole result. Halve the cost or double the average move and the sign flips; nothing else does.
- **A bigger sample.** The double gate is strict by design — 23,904 symbol-days produced 448 signals. More symbols and more years are both available and are the only honest way to narrow the intervals.

## Gross versus the matched control, before net

ENGINE-1's decisive finding was that both of its models were below a coin flip *before* costs, which settles the net number without further argument. ENGINE-2 was the first to beat its control gross, by +0.099R with an interval containing zero. So this table is read first.

| run | n | gross mean R | net mean R | hit | PF (net) |
|---|---|---|---|---|---|
| `orb_mtf.v1` — Exit A — flat at 15:55 | 448 | +0.079 | -0.044 | 30.6% | 0.94 |
| `null_coinflip.v1.matched` — same exit | 448 | +0.026 | -0.093 | 29.0% | 0.88 |
| `orb_mtf.v1` — Exit B — held to target or stop, at most 5 sessions | 448 | +0.076 | -0.046 | 27.0% | 0.94 |
| `null_coinflip.v1.matched` — same exit | 448 | +0.067 | -0.053 | 25.7% | 0.94 |

Paired trade by trade on the same symbol-day, **gross of costs**:

| exit | window | pairs | model − control, gross mean R | 95% interval |
|---|---|---|---|---|
| A | all | 448 | +0.052 | -0.139 to +0.244 |
| A | in-sample | 338 | +0.082 | -0.130 to +0.293 |
| A | out-of-sample | 110 | -0.038 | -0.471 to +0.395 |
| B | all | 448 | +0.009 | -0.225 to +0.244 |
| B | in-sample | 338 | +0.063 | -0.206 to +0.333 |
| B | out-of-sample | 110 | -0.157 | -0.632 to +0.319 |

The control is not the ENGINE-1 whole-tape coin flip. It takes the same symbols, the same days, the same decision minute and the same risk and reward distances as the trades the model actually took, flips only the direction, and is booked under both exits. It is the like-for-like question: **did knowing which way to point pay for itself?**

## Realised risk per trade — the direct test of the owner's correction

ENGINE-1 measured risk at 0.18–0.29% of price; ENGINE-2's structural stop came out at 0.187%, *narrower* than ENGINE-1, because the nearest major level on a 5-minute chart is usually close. Moving to 1-hour and 4-hour levels was supposed to fix that. Here is whether it did.

| | ENGINE-1 | ENGINE-2 | this model |
|---|---|---|---|
| median risk per trade, % of price | 0.287% | 0.187% | **0.229%** |
| interquartile range | — | 0.137% – 0.289% | 0.159% – 0.380% |
| costs as a fraction of risk | ≈0.09 R | 0.144 R | **0.122 R** |
| gross edge needed to break even | ≈+0.15 R | ≈+0.14 R | **≈+0.12 R** |

**Where the stop actually came from.** On 19% of trades (83 of 448) the nearest level beyond entry was a 1-hour or 4-hour pivot — the levels this model added. On the rest it was a prior-day, premarket, overnight or daily level, all of which `orb_htf_structural.v1` also had, so on those trades the stop sits exactly where ENGINE-2 put it. The gate named this as the way the correction could fail quietly, before the run.

| level the stop sat behind | trades |
|---|---|
| `ONH` | 83 |
| `PDH` | 77 |
| `ONL` | 71 |
| `PDL` | 60 |
| `H4L` | 25 |
| `DPH` | 24 |
| `H4H` | 24 |
| `PML` | 21 |
| `DPL` | 18 |
| `H1H` | 17 |
| `H1L` | 17 |
| `PMH` | 11 |

## The gate

### Exit A — flat at 15:55 — **INCONCLUSIVE (sample)**

| gate | | bar | observed | |
|---|---|---|---|---|
| G1 | sample size | IS>=400, OOS>=100 | IS=338, OOS=110 | **FAIL** |
| G2 | expectancy after costs (mean net R) | IS>=+0.10, OOS>=+0.05 | IS=-0.081, OOS=+0.070 | **FAIL** |
| G3 | profit factor after costs | IS>=1.20, OOS>=1.10 | IS=0.89, OOS=1.10 | **FAIL** |
| G4 | winners first going >=0.75R against | <=40% | 24.0% | **PASS** |
| G5 | mean net R > 0 in both regimes (in-sample) | both > 0 | bear (SPY < 50dma)=-0.224 (n=68), bull (SPY > 50dma)=-0.069 (n=244) | **FAIL** |

### Exit B — held to target or stop, at most 5 sessions — **INCONCLUSIVE (sample)**

| gate | | bar | observed | |
|---|---|---|---|---|
| G1 | sample size | IS>=400, OOS>=100 | IS=338, OOS=110 | **FAIL** |
| G2 | expectancy after costs (mean net R) | IS>=+0.10, OOS>=+0.05 | IS=-0.064, OOS=+0.009 | **FAIL** |
| G3 | profit factor after costs | IS>=1.20, OOS>=1.10 | IS=0.92, OOS=1.01 | **FAIL** |
| G4 | winners first going >=0.75R against | <=40% | 21.3% | **PASS** |
| G5 | mean net R > 0 in both regimes (in-sample) | both > 0 | bear (SPY < 50dma)=-0.314 (n=68), bull (SPY > 50dma)=-0.019 (n=244) | **FAIL** |
| G6 | trades closing worse than -2.0R | <5% | 0.0% (0/448) | **PASS** |
| G7 | holding beats closing at 15:55 (out-of-sample, paired) | B >= A | B=+0.009 vs A=+0.070 (n=110) | **FAIL** |

## Exit A — flat at 15:55

| slice | n | hit | mean R | median R | mean % | payoff | PF | total R | maxDD R | max losing run |
|---|---|---|---|---|---|---|---|---|---|---|
| all | 448 | 30.6% | -0.044 | -1.050 | -0.007% | 2.14 | 0.94 | -19.7 | 35.5 | 12 |
| in-sample 2023-09-01..2025-12-31 | 338 | 29.6% | -0.081 | -1.053 | -0.017% | 2.13 | 0.89 | -27.3 | 48.6 | 11 |
| out-of-sample 2026-01-01..2026-08-28 | 110 | 33.6% | 0.070 | -1.035 | 0.022% | 2.17 | 1.10 | 7.7 | 12.7 | 9 |

**Maximum adverse excursion.** The existing SMS engine's +11.93% average peak concealed a −10.49% average drawdown, with 47.5% of alerts going 8%+ underwater first. Distribution, not mean.

All trades

- MAE deciles (R): 0.24 | 0.64 | 0.95 | 1.03 | 1.07 | 1.12 | 1.21 | 1.34 | 1.49
- all trades reaching that far against: >=0.25R 89.5% · >=0.5R 84.2% · >=0.75R 75.9% · >=1.0R 67.9%
- **winners** that first went that far against: >=0.25R 65.7% · >=0.5R 48.9% · >=0.75R 22.6% · >=1.0R 0.0%

Out-of-sample

- MAE deciles (R): 0.24 | 0.63 | 0.79 | 1.05 | 1.07 | 1.15 | 1.23 | 1.38 | 1.54
- all trades reaching that far against: >=0.25R 89.1% · >=0.5R 83.6% · >=0.75R 71.8% · >=1.0R 64.5%
- **winners** that first went that far against: >=0.25R 67.6% · >=0.5R 54.1% · >=0.75R 18.9% · >=1.0R 0.0%

By regime (in-sample), then session, side and year:

| slice | n | hit | mean R | median R | mean % | payoff | PF | total R | maxDD R | max losing run |
|---|---|---|---|---|---|---|---|---|---|---|
| bear (SPY < 50dma) | 68 | 27.9% | -0.224 | -1.059 | -0.045% | 1.84 | 0.72 | -15.2 | 15.8 | 8 |
| bull (SPY > 50dma) | 244 | 29.9% | -0.069 | -1.050 | -0.019% | 2.13 | 0.91 | -16.8 | 35.2 | 12 |
| mid 10:30-14:00 | 84 | 32.1% | -0.098 | -1.049 | -0.042% | 1.82 | 0.86 | -8.2 | 12.8 | 10 |
| open 09:30-10:30 | 364 | 30.2% | -0.031 | -1.051 | 0.001% | 2.21 | 0.96 | -11.5 | 33.1 | 12 |
| long | 244 | 34.4% | 0.024 | -1.037 | 0.006% | 1.97 | 1.03 | 5.8 | 25.8 | 10 |
| short | 204 | 26.0% | -0.125 | -1.058 | -0.023% | 2.41 | 0.84 | -25.5 | 29.4 | 22 |
| 2023 | 45 | 37.8% | 0.249 | -1.071 | 0.061% | 2.23 | 1.36 | 11.2 | 6.5 | 5 |
| 2024 | 138 | 26.1% | -0.122 | -1.057 | -0.031% | 2.41 | 0.85 | -16.8 | 30.3 | 9 |
| 2025 | 155 | 30.3% | -0.140 | -1.046 | -0.027% | 1.87 | 0.81 | -21.7 | 29.2 | 9 |
| 2026 | 110 | 33.6% | 0.070 | -1.035 | 0.022% | 2.17 | 1.10 | 7.7 | 12.7 | 9 |

By symbol:

| slice | n | hit | mean R | median R | mean % | payoff | PF | total R | maxDD R | max losing run |
|---|---|---|---|---|---|---|---|---|---|---|
| TSLA | 15 | 53.3% | 1.195 | 0.439 | 0.509% | 3.01 | 3.44 | 17.9 | 2.1 | 2 |
| AVGO | 14 | 42.9% | 1.087 | -1.020 | 0.142% | 3.57 | 2.67 | 15.2 | 4.1 | 4 |
| WMT | 14 | 57.1% | 0.836 | 0.711 | 0.161% | 2.07 | 2.75 | 11.7 | 2.2 | 2 |
| QQQ | 15 | 40.0% | 0.390 | -1.037 | 0.057% | 2.41 | 1.61 | 5.9 | 3.2 | 3 |
| GOOGL | 11 | 45.5% | 0.405 | -1.023 | 0.056% | 2.05 | 1.71 | 4.5 | 3.1 | 3 |
| NVDA | 15 | 40.0% | 0.246 | -1.062 | 0.300% | 2.04 | 1.36 | 3.7 | 4.3 | 4 |
| DIS | 15 | 40.0% | 0.246 | -1.020 | -0.039% | 2.11 | 1.41 | 3.7 | 3.2 | 3 |
| QCOM | 19 | 36.8% | 0.118 | -1.018 | -0.029% | 2.03 | 1.18 | 2.2 | 3.1 | 3 |
| COIN | 13 | 23.1% | 0.110 | -1.029 | 0.049% | 3.79 | 1.14 | 1.4 | 7.3 | 7 |
| CRM | 14 | 42.9% | 0.089 | -1.031 | 0.076% | 1.51 | 1.14 | 1.2 | 3.1 | 2 |
| JPM | 12 | 41.7% | -0.022 | -1.050 | 0.005% | 1.35 | 0.96 | -0.3 | 5.4 | 5 |
| SPY | 10 | 30.0% | -0.029 | -1.078 | 0.018% | 2.24 | 0.96 | -0.3 | 4.3 | 4 |
| BA | 17 | 23.5% | -0.045 | -1.037 | -0.085% | 3.07 | 0.94 | -0.8 | 9.5 | 9 |
| AAPL | 14 | 21.4% | -0.066 | -1.054 | -0.075% | 3.36 | 0.92 | -0.9 | 8.9 | 6 |
| COST | 16 | 37.5% | -0.072 | -1.038 | 0.026% | 1.48 | 0.89 | -1.2 | 7.5 | 7 |
| MU | 7 | 28.6% | -0.166 | -1.038 | -0.081% | 1.96 | 0.78 | -1.2 | 3.2 | 3 |
| SMH | 8 | 25.0% | -0.180 | -1.028 | -0.022% | 2.28 | 0.76 | -1.4 | 2.1 | 3 |
| IWM | 29 | 31.0% | -0.052 | -1.053 | -0.054% | 2.06 | 0.93 | -1.5 | 12.7 | 8 |
| DIA | 12 | 33.3% | -0.223 | -1.074 | -0.005% | 1.39 | 0.69 | -2.7 | 5.5 | 5 |
| MSFT | 13 | 30.8% | -0.212 | -1.028 | -0.145% | 1.60 | 0.71 | -2.7 | 7.4 | 7 |
| AMD | 15 | 26.7% | -0.236 | -1.043 | 0.144% | 1.92 | 0.70 | -3.5 | 6.0 | 6 |
| NFLX | 11 | 18.2% | -0.360 | -1.089 | 0.109% | 2.77 | 0.62 | -4.0 | 7.9 | 7 |
| XLF | 10 | 20.0% | -0.413 | -1.217 | -0.055% | 2.34 | 0.59 | -4.1 | 7.4 | 6 |
| BAC | 10 | 20.0% | -0.439 | -1.109 | -0.113% | 1.89 | 0.47 | -4.4 | 3.8 | 4 |
| META | 17 | 23.5% | -0.317 | -1.052 | -0.062% | 1.97 | 0.61 | -5.4 | 6.3 | 6 |
| GS | 13 | 23.1% | -0.423 | -1.043 | -0.068% | 1.59 | 0.48 | -5.5 | 5.9 | 5 |
| UBER | 13 | 23.1% | -0.503 | -1.042 | -0.252% | 1.29 | 0.39 | -6.5 | 6.1 | 5 |
| PLTR | 12 | 16.7% | -0.554 | -1.079 | -0.167% | 1.95 | 0.39 | -6.6 | 8.5 | 7 |
| AMZN | 16 | 18.8% | -0.419 | -1.069 | -0.140% | 2.27 | 0.52 | -6.7 | 11.4 | 6 |
| INTC | 15 | 20.0% | -0.469 | -1.155 | -0.084% | 1.99 | 0.50 | -7.0 | 7.7 | 5 |
| XLE | 16 | 25.0% | -0.560 | -1.075 | -0.242% | 1.01 | 0.34 | -9.0 | 9.7 | 6 |
| XOM | 17 | 11.8% | -0.670 | -1.118 | -0.159% | 2.38 | 0.32 | -11.4 | 10.3 | 7 |

- exits: {'stop': 304, 'target': 104, 'time': 40}
- trades resolved by the pessimistic same-bar assumption (stop and target both inside one bar): 0 (0.0%)
- mean regular-hours bars held: 62.8

## Exit B — held to target or stop, at most 5 sessions

| slice | n | hit | mean R | median R | mean % | payoff | PF | total R | maxDD R | max losing run |
|---|---|---|---|---|---|---|---|---|---|---|
| all | 448 | 27.0% | -0.046 | -1.053 | -0.001% | 2.55 | 0.94 | -20.5 | 37.9 | 13 |
| in-sample 2023-09-01..2025-12-31 | 338 | 26.3% | -0.064 | -1.056 | 0.010% | 2.58 | 0.92 | -21.5 | 46.0 | 12 |
| out-of-sample 2026-01-01..2026-08-28 | 110 | 29.1% | 0.009 | -1.035 | -0.038% | 2.47 | 1.01 | 1.0 | 18.4 | 8 |

**Maximum adverse excursion.** The existing SMS engine's +11.93% average peak concealed a −10.49% average drawdown, with 47.5% of alerts going 8%+ underwater first. Distribution, not mean.

All trades

- MAE deciles (R): 0.29 | 0.69 | 1.01 | 1.05 | 1.07 | 1.13 | 1.22 | 1.35 | 1.50
- all trades reaching that far against: >=0.25R 90.4% · >=0.5R 85.7% · >=0.75R 79.0% · >=1.0R 73.0%
- **winners** that first went that far against: >=0.25R 64.5% · >=0.5R 47.1% · >=0.75R 22.3% · >=1.0R 0.0%

Out-of-sample

- MAE deciles (R): 0.32 | 0.68 | 1.01 | 1.05 | 1.08 | 1.16 | 1.23 | 1.38 | 1.54
- all trades reaching that far against: >=0.25R 90.9% · >=0.5R 87.3% · >=0.75R 78.2% · >=1.0R 70.9%
- **winners** that first went that far against: >=0.25R 68.8% · >=0.5R 56.2% · >=0.75R 25.0% · >=1.0R 0.0%

By regime (in-sample), then session, side and year:

| slice | n | hit | mean R | median R | mean % | payoff | PF | total R | maxDD R | max losing run |
|---|---|---|---|---|---|---|---|---|---|---|
| bear (SPY < 50dma) | 68 | 22.1% | -0.314 | -1.061 | -0.091% | 2.22 | 0.63 | -21.4 | 20.3 | 15 |
| bull (SPY > 50dma) | 244 | 27.0% | -0.019 | -1.052 | 0.032% | 2.63 | 0.98 | -4.8 | 33.2 | 12 |
| mid 10:30-14:00 | 84 | 29.8% | -0.072 | -1.049 | -0.053% | 2.13 | 0.90 | -6.1 | 13.7 | 10 |
| open 09:30-10:30 | 364 | 26.4% | -0.040 | -1.054 | 0.011% | 2.65 | 0.95 | -14.4 | 33.1 | 13 |
| long | 244 | 29.9% | 0.027 | -1.046 | 0.022% | 2.42 | 1.04 | 6.5 | 26.4 | 10 |
| short | 204 | 23.5% | -0.132 | -1.061 | -0.029% | 2.73 | 0.84 | -27.0 | 33.7 | 22 |
| 2023 | 45 | 35.6% | 0.371 | -1.074 | 0.100% | 2.73 | 1.51 | 16.7 | 5.8 | 5 |
| 2024 | 138 | 23.9% | -0.093 | -1.059 | 0.016% | 2.83 | 0.89 | -12.9 | 29.3 | 9 |
| 2025 | 155 | 25.8% | -0.164 | -1.053 | -0.021% | 2.29 | 0.80 | -25.3 | 30.8 | 10 |
| 2026 | 110 | 29.1% | 0.009 | -1.035 | -0.038% | 2.47 | 1.01 | 1.0 | 18.4 | 8 |

By symbol:

| slice | n | hit | mean R | median R | mean % | payoff | PF | total R | maxDD R | max losing run |
|---|---|---|---|---|---|---|---|---|---|---|
| AVGO | 14 | 42.9% | 1.087 | -1.020 | 0.142% | 3.57 | 2.67 | 15.2 | 4.1 | 4 |
| TSLA | 15 | 33.3% | 0.894 | -1.014 | 0.410% | 4.58 | 2.29 | 13.4 | 5.3 | 5 |
| NVDA | 15 | 33.3% | 0.543 | -1.062 | 0.632% | 3.46 | 1.73 | 8.1 | 4.3 | 4 |
| WMT | 14 | 35.7% | 0.522 | -1.069 | -0.007% | 3.13 | 1.74 | 7.3 | 3.3 | 3 |
| QQQ | 15 | 40.0% | 0.390 | -1.037 | 0.057% | 2.41 | 1.61 | 5.9 | 3.2 | 3 |
| COST | 16 | 43.8% | 0.347 | -1.038 | 0.243% | 2.02 | 1.57 | 5.5 | 7.5 | 7 |
| COIN | 13 | 23.1% | 0.365 | -1.029 | 0.274% | 4.84 | 1.45 | 4.7 | 7.3 | 7 |
| JPM | 12 | 41.7% | 0.262 | -1.050 | 0.146% | 1.99 | 1.42 | 3.1 | 5.4 | 5 |
| GOOGL | 11 | 36.4% | 0.260 | -1.024 | -0.046% | 2.44 | 1.39 | 2.9 | 4.2 | 4 |
| QCOM | 19 | 36.8% | 0.086 | -1.018 | -0.083% | 1.93 | 1.13 | 1.6 | 3.2 | 3 |
| SPY | 10 | 20.0% | 0.054 | -1.078 | 0.028% | 4.25 | 1.06 | 0.5 | 6.5 | 6 |
| CRM | 14 | 35.7% | -0.014 | -1.036 | 0.009% | 1.76 | 0.98 | -0.2 | 4.5 | 5 |
| BA | 17 | 23.5% | -0.045 | -1.037 | -0.085% | 3.07 | 0.94 | -0.8 | 9.5 | 9 |
| MU | 7 | 28.6% | -0.166 | -1.038 | -0.081% | 1.96 | 0.78 | -1.2 | 3.2 | 3 |
| DIS | 15 | 20.0% | -0.101 | -1.070 | -0.199% | 3.53 | 0.88 | -1.5 | 4.3 | 4 |
| BAC | 10 | 30.0% | -0.153 | -1.109 | 0.014% | 1.88 | 0.81 | -1.5 | 3.4 | 4 |
| SMH | 8 | 25.0% | -0.202 | -1.035 | -0.028% | 2.23 | 0.74 | -1.6 | 2.1 | 3 |
| IWM | 29 | 31.0% | -0.060 | -1.053 | -0.056% | 2.04 | 0.92 | -1.7 | 12.9 | 8 |
| AMD | 15 | 26.7% | -0.188 | -1.043 | 0.216% | 2.09 | 0.76 | -2.8 | 6.0 | 6 |
| AMZN | 16 | 18.8% | -0.198 | -1.069 | -0.071% | 3.35 | 0.77 | -3.2 | 7.9 | 6 |
| NFLX | 11 | 18.2% | -0.330 | -1.089 | 0.129% | 2.91 | 0.65 | -3.6 | 7.9 | 7 |
| AAPL | 14 | 14.3% | -0.261 | -1.054 | -0.190% | 4.28 | 0.71 | -3.6 | 11.6 | 11 |
| DIA | 12 | 25.0% | -0.333 | -1.074 | -0.038% | 1.78 | 0.59 | -4.0 | 5.5 | 5 |
| XLF | 10 | 20.0% | -0.413 | -1.217 | -0.055% | 2.34 | 0.59 | -4.1 | 7.4 | 6 |
| GS | 13 | 23.1% | -0.366 | -1.043 | -0.035% | 1.82 | 0.55 | -4.8 | 5.2 | 5 |
| MSFT | 13 | 23.1% | -0.379 | -1.028 | -0.267% | 1.77 | 0.53 | -4.9 | 8.4 | 8 |
| UBER | 13 | 23.1% | -0.459 | -1.042 | -0.222% | 1.46 | 0.44 | -6.0 | 5.5 | 5 |
| PLTR | 12 | 16.7% | -0.554 | -1.079 | -0.167% | 1.95 | 0.39 | -6.6 | 8.5 | 7 |
| INTC | 15 | 20.0% | -0.469 | -1.155 | -0.084% | 1.99 | 0.50 | -7.0 | 7.7 | 5 |
| META | 17 | 17.6% | -0.478 | -1.052 | -0.149% | 2.09 | 0.45 | -8.1 | 8.4 | 6 |
| XLE | 16 | 18.8% | -0.632 | -1.075 | -0.275% | 1.32 | 0.31 | -10.1 | 10.8 | 7 |
| XOM | 17 | 11.8% | -0.670 | -1.118 | -0.159% | 2.38 | 0.32 | -11.4 | 10.3 | 7 |

- exits: {'stop': 327, 'target': 118, 'time': 3}
- trades resolved by the pessimistic same-bar assumption (stop and target both inside one bar): 0 (0.0%)
- mean regular-hours bars held: 93.3
- held past a closing bell: 39 (8.7%)
- stopped out on a session's opening print rather than at the stop price: 22, costing on average an extra 0.02R each
- targets filled on a favourable opening gap, above the level: 1
- worst single trade: -1.81R; trades past −2R: 0

## The ablation — one run, a diagnostic

The pre-registered gate applies to the full spec alone. This run exists to answer one question and cannot be promoted into the result: **what was moving the stop and the target onto the 1-hour and 4-hour charts actually worth?** Selection is untouched — every screen was applied to the 1h/4h levels first — so the trade set is held fixed and the only thing that moves is where the stop and the target sit.

| exit | run | n | gross mean R | net mean R | median risk % | hit |
|---|---|---|---|---|---|---|
| A | 1h/4h levels (the spec) | 448 | +0.079 | -0.044 | 0.229% | 30.6% |
| A | 5-minute levels (ENGINE-2's) | 444 | +0.121 | -0.010 | 0.227% | 39.4% |
| B | 1h/4h levels (the spec) | 448 | +0.076 | -0.046 | 0.229% | 27.0% |
| B | 5-minute levels (ENGINE-2's) | 444 | +0.059 | -0.069 | 0.227% | 34.7% |

**What the move to higher-timeframe levels was worth.** Paired on 444 trades that both versions took (4 of the spec's trades had no qualifying 5-minute level and drop out of the pairing), the 5-minute stop and target scored +0.024R against the 1h/4h ones (95%: -0.092R to +0.140R) on Exit A. Median risk moved from 0.227% on the 5-minute levels to 0.231% on the 1h/4h ones — a difference of 0.004 percentage points, which is not a widening in any sense that matters. The two level families put the stop in almost the same place, because on four trades in five the nearest level is one they share. On this evidence the move to higher-timeframe levels bought nothing: the interval on the difference contains zero and the 5-minute version is nominally ahead.

## Where the days went

Every symbol-day the model looked at, and the rule that ended it. This is the honest picture of how hard the double filter bites.

| outcome | symbol-days |
|---|---|
| days_seen | 23,904 |
| skip_no_aligned_trend | 19,878 |
| skip_opening_range_size | 192 |
| no_break_in_window | 1,833 |
| triggers | 2,001 |
| skip_risk_too_wide | 9 |
| skip_risk_too_tight | 180 |
| skip_no_target_level | 302 |
| skip_reward_under_min_rr | 1,062 |
| signals | 448 |

- orders that never became a trade: 0
- model parameters: `{"or_minutes": 15, "entry_tf_minutes": 5, "window": [589, 659], "flatten_min": 955, "min_or_pct": 0.0015, "max_or_pct": 0.03, "trend_timeframes": [60, 240], "h1_pivot_n": 2, "h1_lookback": 120, "h1_min_touches": 2, "h4_pivot_n": 2, "h4_lookback": 60, "h4_min_touches": 1, "touch_bps": 8.0, "cluster_bps": 25.0, "daily_pivot_n": 3, "daily_lookback": 60, "stop_buffer_bps": 5.0, "min_risk_pct": 0.001, "max_risk_pct": 0.03, "min_rr": 1.5, "level_mode": "htf", "require_mtf": true}`

## Disclosures specific to this run

- **Fourth model, same bars, and a variant of the third.** `orb_reclaim.v1`, `sweep_displacement_fvg.v1` and `orb_htf_structural.v1` were measured on this identical cache and all three failed. This model reuses six of ENGINE-2's parameters verbatim, so it is not an independent fourth draw. The out-of-sample window is treated as the verdict and was read once.
- **The 1h/4h session convention is RTH-only, anchored at 09:30, with the day's short final bucket kept.** Seven hourly bars a day, the last of them 30 minutes; two 4-hour bars, the last of them 2.5 hours. A bucket is closed only once a bar in a later bucket has printed. The full reasoning is in the gate, which was committed first.
- **The 4-hour reading cannot change inside the trigger window**; the 1-hour reading can change once, at 10:30. Alignment is therefore re-checked at every candidate bar rather than judged at 09:49.
- **The level definition was chosen by eye, on sparsity and nearest-level distance only**, across five symbols and three dates, before any backtest ran. No PnL, trade count or expectancy was seen first. That check produced the warning in the gate about shared reference levels; no parameter was changed because of it.
- **The risk cap moved from 1.50% of price to 3.00%**, because a 4-hour level is by construction further away and a tight cap would silently convert this model back into ENGINE-2 by skipping. 3.00% is the upper edge of the opening-range band already in use since `orb_reclaim.v1`. The 0.10% risk floor is unchanged and is still an addition beyond the owner's words.
- **Overnight risk is modelled, not assumed away.** Positions are exited only in regular hours; a session opening beyond the stop fills at that open. Two consequences that cut opposite ways: Exit B's excursion figures are measured on regular-hours bars only, so a position that went underwater at 04:00 and recovered by 09:30 does not show it; and a target that gaps through in the good direction fills at the open, which is better than the level.
- **No borrow, locate, halt, dividend or earnings modelling.** Exit B holds through earnings reports and dividend dates with neither flagged. On a five-session horizon that is a real omission, and it flatters nothing in particular — it simply adds variance the numbers here do not name.
- **Survivorship.** The 32 symbols are liquid *today*. None was chosen on performance and none dropped after seeing a result, but the universe is selected with hindsight and contains no delisted name.
- **Fills are modelled, not observed.** OHLC cannot say what happened inside a bar; every ambiguity is resolved against the trade, and a bar holding both stop and target is booked as the stop.
