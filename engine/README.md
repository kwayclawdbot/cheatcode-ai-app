# engine/ — setup detection, measured before it is believed

Phases ENGINE-1 and ENGINE-2 of [`docs/17_ENGINE_ARCHITECTURE.md`](../docs/17_ENGINE_ARCHITECTURE.md),
scoped by [`docs/BUILD-BRIEF-engine-1-primitives-backtest.md`](../docs/BUILD-BRIEF-engine-1-primitives-backtest.md)
and [`docs/BUILD-BRIEF-engine-2-orb-htf-structural-stop.md`](../docs/BUILD-BRIEF-engine-2-orb-htf-structural-stop.md).

This directory ships **no alerts**. It exists to build the gate that the current
SMS engine never had, and to run day-trade models through it. It does not
import from `apps/`, `apps/` does not import from it, and it never touches the
app's database.

**Start here: [`reports/README.md`](reports/README.md)** — what was measured and
what happened.

## Layout

```
config.py        universe, snapshot id, session constants, key lookup
calendar_us.py   NYSE holidays and early closes, checked against the tape
series.py        BarSeries and BarView — the as-of contract
cache/           fetch.py (Polygon -> parquet), load.py (DuckDB), manifest.py (audit)
primitives/      structure, liquidity, imbalance, session, trend, timeframe,
                 levels, htf — pure, as-of
backtest/        types, fills, engine (event replay), stats, regime, htf
models/          model specs + GATES.md and per-model GATE.md, the bars
reports/         measured results, per-trade dumps, equity curves
sip/             ENGINE-6 only: the market-wide universe, the stocks-in-play
                 selection, and the three fetch stages behind them
tests/           434 tests
```

## The as-of contract

`BarView(series, i)` is everything known at the close of bar `i`. It holds no
reference to the parent series — only numpy slices truncated at `i` and marked
read-only. A primitive receives a `BarView` and nothing else, so there is no
attribute it can walk to reach bar `i+1`. Lookahead is not a rule primitives are
asked to follow; it is a shape they cannot express.

`tests/test_no_lookahead.py` keeps that true across refactors. It attacks every
primitive twice — recompute with all bars after `i` replaced by nonsense, and
recompute against a series in which those bars do not exist — and requires an
identical answer both times. A deliberately cheating function is run through the
same detector and must be caught, because a test that cannot fail proves nothing.

## Running it

```bash
python3.14 -m venv .venv && .venv/bin/pip install -r requirements.txt
.venv/bin/python cache/fetch.py                  # resumable; skips what it has
.venv/bin/python cache/manifest.py               # audit: gaps, thin days, calendar
.venv/bin/python -m pytest                       # from engine/
.venv/bin/python run_backtest.py --model orb_reclaim     # ENGINE-1 models
.venv/bin/python run_engine2.py                          # ENGINE-2: model,
                                                         # control, ablations
.venv/bin/python run_engine3.py                          # ENGINE-3: two exits
.venv/bin/python cache/fetch.py --snapshot polygon-deep-v1 \
    --symbols SPY,QQQ,IWM --start 2012-01-01 --end 2026-08-28
.venv/bin/python run_engine4.py                          # ENGINE-4: both
                                                         # orb_simple variants
.venv/bin/python run_engine5.py                          # ENGINE-5: four
                                                         # managed variants

# ENGINE-6 replicates a published result and needs its own market-wide
# snapshot. Every stage is resumable and skips what is already on disk.
.venv/bin/python sip/fetch_grouped.py    # every ticker that traded, daily
.venv/bin/python sip/fetch_types.py      # security type, so it is stocks
.venv/bin/python sip/fetch_open5.py      # 09:30-10:30 for the pool
.venv/bin/python run_engine6.py --stage plan             # the selection
.venv/bin/python sip/fetch_days.py --pairs data/polygon-sip-v1/pairs.json
.venv/bin/python sip/manifest.py         # audit before believing anything
.venv/bin/python run_engine6.py --stage run              # ENGINE-6
.venv/bin/python run_engine6_diag.py                     # its post-mortem

# ENGINE-7 changes ONE rule of ENGINE-6 — the stop moves to the opposite
# extreme of the opening candle — and reuses ENGINE-6's selection file byte
# for byte. Nothing is re-downloaded and there is no parameter to vary.
.venv/bin/python run_engine7.py                          # ENGINE-7
```

The Polygon key is read from `apps/api/.env.local` and never written anywhere.
It is **shared with `~/breakout-alert-system`'s Railway crons**: the fetcher runs
four concurrent requests and backs off hard on 429. The cache (`engine/data/`, ~4.2 GB across three snapshots) is not committed — it is
reproducible from the manifests. There are three snapshots and **no report may mix
them**: `polygon-v1` (32 symbols, 2023-09 → 2026-08) is ENGINE-1 through
ENGINE-3, `polygon-deep-v1` (SPY/QQQ/IWM, 2012-01 → 2026-08) is ENGINE-4 and
ENGINE-5, and `polygon-sip-v1` (every US ticker's daily bars 2015-10 → 2026-08,
opening 5-minute bars for a 1,000-name rolling pool, and one-minute bars for the
105,690 symbol-days the selector chose) is ENGINE-6.

## Rules of this directory

1. A result names the data snapshot it ran against, or it is not a result.
2. The bar is written down, in the repo, in the same commit as the model spec,
   before the evaluation runs. Moving it afterwards is the failure mode the
   whole phase exists to prevent.
3. A model that misses its bar is recorded as measured-and-failed. It is not
   retuned until it passes.
4. Distribution before mean. The MAE tail is the headline statistic.
