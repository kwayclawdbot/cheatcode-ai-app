"""Daily bars per symbol, and the daily trend label for a trading day.

ENGINE-8 needs one thing ENGINE-6 and ENGINE-7 did not: the state of each
selected name's DAILY chart as of the last fully closed daily bar before the
session being traded. The snapshot already holds every daily bar it needs —
`data/polygon-sip-v1/grouped/*.parquet`, one file a session, every ticker that
traded — so nothing is downloaded here. This module reshapes those files into a
per-symbol `BarSeries` and asks `primitives/htf.py` the same question ENGINE-2
asked, with the same numbers.

Two properties are structural rather than remembered:

* **The label for day D is computed from `view(k-1)`**, where `k` is D's own
  index in that symbol's daily series. A `BarView` cannot reach past its own
  index, so day D's open, high, low and close are not merely unused — they are
  unreachable from the object the trend function is handed. This is the same
  construction `engine/backtest/htf.py` uses; it is repeated here rather than
  imported because that module loads from a per-symbol `day/` cache tree which
  the SIP snapshot does not have.
* **Prices are UNADJUSTED**, like everything else in this snapshot, and for the
  reason `sip/config.py` gives: a split-adjusted price would back-promote names
  into a "price > $5" universe at prices they never traded at. The cost lands
  here rather than there. A stock that split inside the 120-day lookback shows
  a step in its own unadjusted history, and swing structure read across that
  step is wrong until the step falls out of the window. `split_suspects` counts
  the exposure — an UPPER bound, because a real 40% overnight move is counted
  too — so the report can state the size of the problem instead of ignoring it.
"""

from __future__ import annotations

import gzip
import json
from pathlib import Path

import duckdb
import numpy as np

from engine.primitives.htf import daily_structure
from engine.series import BarSeries
from engine.sip import config as scfg

# ENGINE-2's numbers, unchanged. `orb_htf_structural.py` used pivot_n=2 and a
# 120-bar lookback and its GATE.md documented them; this lane is not entitled to
# a second definition of "confirmed daily trend", and does not have one.
DAILY_PIVOT_N = 2
DAILY_LOOKBACK = 120

# Not a parameter of the model. A single session whose close moved this far from
# the one before it is either a corporate action the unadjusted tape does not
# know about or a genuine 40% day; either way the swing structure computed over
# a window containing it is worth flagging. Used ONLY to count and disclose.
SPLIT_SUSPECT_MOVE = 0.40

TREND_CACHE = scfg.DATA_ROOT / "daily_trend.json.gz"


def _con() -> duckdb.DuckDBPyConnection:
    con = duckdb.connect()
    con.execute("SET TimeZone='UTC'")
    return con


def daily_frames(symbols: set[str]) -> dict[str, BarSeries]:
    """One `BarSeries` of daily bars per symbol, ascending, unadjusted.

    Read straight out of the grouped files the universe was built from, so the
    daily chart the trend is read off is the same tape the eligibility filter
    used.
    """
    if not symbols:
        return {}
    con = _con()
    con.execute("CREATE TEMP TABLE want (ticker VARCHAR)")
    con.executemany("INSERT INTO want VALUES (?)", [(s,) for s in sorted(symbols)])
    q = f"""
      SELECT g.ticker, g.day, g.open, g.high, g.low, g.close, g.volume
      FROM (
        SELECT ticker, open, high, low, close, volume,
               CAST(replace(regexp_extract(filename, '(\\d{{4}}-\\d{{2}}-\\d{{2}})', 1),
                            '-', '') AS INTEGER) AS day
        FROM read_parquet('{scfg.GROUPED_DIR / "*.parquet"}', filename=true)
        WHERE close > 0 AND volume > 0 AND high >= low
      ) g
      JOIN want w ON w.ticker = g.ticker
      ORDER BY g.ticker, g.day
    """
    t = con.execute(q).arrow()
    con.close()
    if hasattr(t, "read_all"):
        t = t.read_all()
    tick = np.array(t.column("ticker").to_pylist(), dtype=object)
    day = t.column("day").to_numpy(zero_copy_only=False).astype("int32")
    cols = {c: t.column(c).to_numpy(zero_copy_only=False).astype("float64")
            for c in ("open", "high", "low", "close", "volume")}

    out: dict[str, BarSeries] = {}
    if len(tick) == 0:
        return out
    change = np.flatnonzero(tick[1:] != tick[:-1]) + 1
    starts = np.concatenate(([0], change))
    stops = np.concatenate((change, [len(tick)]))
    for a, b in zip(starts, stops):
        sym = str(tick[a])
        d = day[a:b]
        # A daily bar carries no minute. The timestamp only has to be strictly
        # ascending and to order the bars the way the calendar does.
        ts = np.arange(a, b, dtype="int64") * 0 + np.arange(b - a, dtype="int64")
        ts = (d.astype("int64")) * 1_000_000 + ts
        out[sym] = BarSeries(
            symbol=sym, timeframe="day", ts_ms=ts,
            open=np.ascontiguousarray(cols["open"][a:b]),
            high=np.ascontiguousarray(cols["high"][a:b]),
            low=np.ascontiguousarray(cols["low"][a:b]),
            close=np.ascontiguousarray(cols["close"][a:b]),
            volume=np.ascontiguousarray(cols["volume"][a:b]),
            day=np.ascontiguousarray(d),
            minute=np.zeros(b - a, dtype="int32"),
        )
    return out


def trend_for_pairs(pairs: set[tuple[str, int]],
                    pivot_n: int = DAILY_PIVOT_N,
                    lookback: int = DAILY_LOOKBACK,
                    frames: dict[str, BarSeries] | None = None,
                    ) -> tuple[dict[tuple[str, int], str], dict[str, int]]:
    """{(symbol, day) -> "up"|"down"|"none"} plus a census.

    A pair whose day is not in that symbol's daily series, or which is that
    symbol's first ever daily bar, gets "none" — the honest answer when there is
    no closed bar to read a trend off, and the same answer the model treats as
    "do not trade".
    """
    frames = frames if frames is not None else daily_frames({s for s, _ in pairs})
    idx: dict[str, dict[int, int]] = {
        s: {int(v): k for k, v in enumerate(f.day)} for s, f in frames.items()}
    out: dict[tuple[str, int], str] = {}
    census: dict[str, int] = {"up": 0, "down": 0, "none": 0,
                              "no_daily_series": 0, "no_prior_bar": 0,
                              "split_suspect_window": 0}
    for sym, dy in sorted(pairs):
        f = frames.get(sym)
        if f is None:
            out[(sym, dy)] = "none"
            census["no_daily_series"] += 1
            census["none"] += 1
            continue
        k = idx[sym].get(int(dy))
        if k is None or k == 0:
            out[(sym, dy)] = "none"
            census["no_prior_bar"] += 1
            census["none"] += 1
            continue
        d = daily_structure(f.view(k - 1), pivot_n, lookback).direction
        out[(sym, dy)] = d
        census[d] += 1
        c = f.close[max(0, k - lookback):k]
        if len(c) > 1 and np.any(np.abs(c[1:] / np.maximum(c[:-1], 1e-9) - 1.0)
                                 >= SPLIT_SUSPECT_MOVE):
            census["split_suspect_window"] += 1
    return out, census


def load_or_build(pairs: set[tuple[str, int]], path: Path | None = None,
                  ) -> tuple[dict[tuple[str, int], str], dict[str, int]]:
    """The trend map, cached on disk so a re-run of the report is free.

    The cache is keyed on the pivot/lookback numbers as well as the pairs, so a
    file written under one definition can never be read under another.
    """
    p = path or TREND_CACHE
    key = f"pivot={DAILY_PIVOT_N},lookback={DAILY_LOOKBACK}"
    if p.exists():
        with gzip.open(p, "rt") as f:
            blob = json.load(f)
        if blob.get("key") == key:
            m = {(k.split("|")[0], int(k.split("|")[1])): v
                 for k, v in blob["trend"].items()}
            if pairs <= set(m):
                return m, blob["census"]
    m, census = trend_for_pairs(pairs)
    p.parent.mkdir(parents=True, exist_ok=True)
    with gzip.open(p, "wt") as f:
        json.dump({"key": key,
                   "trend": {f"{s}|{d}": v for (s, d), v in m.items()},
                   "census": census}, f)
    return m, census
