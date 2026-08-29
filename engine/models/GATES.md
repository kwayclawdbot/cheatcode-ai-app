# Pre-registered gates — ENGINE-1

**Written before any evaluation was run.** This file and the model specs it
governs land in the same commit, and that commit is earlier in `git log` than
the commit that adds any result. That ordering is the whole point: the failure
mode this phase exists to prevent is moving the bar after seeing the numbers.

If a model misses its bar it is recorded as measured-and-failed and it does not
ship. It is not retuned until it passes. The existing SMS engine has a flagship
BREAKOUT setup returning −4.05% over 55 alerts and a score whose A-band
underperforms its D-band precisely because no such bar existed.

## Data

| | |
|---|---|
| snapshot | `polygon-v1` |
| symbols | 32 — 4 index ETFs, 3 sector ETFs, 25 liquid names (`engine/config.py`) |
| bars | 15,113,095 one-minute bars |
| range | 2023-09-01 → 2026-08-28, 750 sessions per symbol, zero missing days |
| in-sample | 2023-09-01 → 2025-12-31 |
| **out-of-sample (held back, touched once)** | **2026-01-01 → 2026-08-28** |

## Costs, stated

| | |
|---|---|
| commission | $0.005 per share, charged on entry and on exit, no minimum |
| slippage | 1.0 bp of price, adverse, on market and stop fills |
| limit fills | no slippage, but the level must be strictly penetrated, not touched |
| ambiguous bars | a bar containing both stop and target is booked as the stop |

## The bar — identical for both intraday models

| id | gate | threshold |
|---|---|---|
| **G1** | sample size | ≥ 400 trades in-sample AND ≥ 100 trades out-of-sample |
| **G2** | expectancy after costs | mean net R ≥ **+0.10** in-sample AND ≥ **+0.05** out-of-sample |
| **G3** | profit factor after costs | ≥ **1.20** in-sample AND ≥ **1.10** out-of-sample |
| **G4** | MAE tail | of the trades that closed **profitable**, ≤ **40%** first went ≥ 0.75R against |
| **G5** | regime robustness | mean net R > 0 in **both** regime slices in-sample |

All five must pass. Four out of five is a failure.

### Why these five

**G1** — a day model on 32 names over 585 sessions should produce hundreds of
instances. If it does not, the model is rare rather than good and the statistics
are not interpretable either way.

**G2** — expectancy per unit of risk, after costs, is the only number that
survives position sizing. +0.10R in-sample is a modest ask; the out-of-sample
floor is deliberately lower than the in-sample one because a held-out tail of
~165 sessions is one market, not many.

**G3** — profit factor catches the model that makes its expectancy from three
outliers.

**G4** — this is the gate the existing engine fails. Its alerts averaged
+11.93% at peak and −10.49% at trough, and 47.5% went 8% underwater first. A
winner that first travels most of the way to its stop is a winner nobody holds.
Reported against R rather than a fixed percentage because these are intraday
trades with structural stops.

**G5** — regime is SPY's close versus its own 50-day simple moving average **as
of the prior session's close**, so it is knowable on the morning of the trade.
A model that only works in one of the two is a bet on the regime, not a setup.

## Survivorship, stated

The 32 names were chosen because they are liquid **today**. None was chosen on
performance, and no name was dropped after seeing a result — but the universe is
still selected with hindsight, and no delisted or since-illiquid name is in it.
Expect the true numbers to be modestly worse than these on a universe chosen in
2023. This is not corrected for; it is disclosed.

## Walk-forward

Parameters are fixed a priori from the corpus and from the structural logic of
each model — nothing was fitted on the in-sample window. The out-of-sample tail
is evaluated once, in the same run, and both windows are reported side by side.
