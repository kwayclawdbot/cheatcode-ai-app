# engine/ — setup detection, measured before it is believed

Phase ENGINE-1 of [`docs/17_ENGINE_ARCHITECTURE.md`](../docs/17_ENGINE_ARCHITECTURE.md),
scoped by [`docs/BUILD-BRIEF-engine-1-primitives-backtest.md`](../docs/BUILD-BRIEF-engine-1-primitives-backtest.md).

This directory ships **no alerts**. It exists to build the gate that the current
SMS engine never had, and to run two day-trade models through it. It does not
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
primitives/      structure, liquidity, imbalance, session, trend — pure, as-of
backtest/        types, fills, engine (event replay), stats, regime
models/          model specs + GATES.md, the pre-registered bar
reports/         measured results, per-trade dumps, equity curves
tests/           196 tests
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
.venv/bin/python run_backtest.py --model orb_reclaim
```

The Polygon key is read from `apps/api/.env.local` and never written anywhere.
It is **shared with `~/breakout-alert-system`'s Railway crons**: the fetcher runs
four concurrent requests and backs off hard on 429. The cache
(`engine/data/`, ~400 MB) is not committed — it is reproducible from the manifest.

## Rules of this directory

1. A result names the data snapshot it ran against, or it is not a result.
2. The bar is written down, in the repo, in the same commit as the model spec,
   before the evaluation runs. Moving it afterwards is the failure mode the
   whole phase exists to prevent.
3. A model that misses its bar is recorded as measured-and-failed. It is not
   retuned until it passes.
4. Distribution before mean. The MAE tail is the headline statistic.
