"""Audit `polygon-sip-v1` and write a manifest. A silent gap is how a backtest lies.

Three stores, three different failure modes, each checked against the calendar
rather than against itself:

* **grouped daily** — one file per session, every ticker that traded. Missing
  days and extra days are both fatal: a missing day silently shrinks the
  universe on that date, an extra day means bars on a date the market was shut.
* **open5** — the 09:30-09:35 bars the selector ranks on. What matters is not
  bytes but coverage: how many pool names have an opening bar on a given day,
  because a name absent from this store cannot be selected however busy it was.
* **1m** — the sessions actually traded. A thin session is reported, not
  dropped: a real halt is data, and this is where it shows up.
"""

from __future__ import annotations

import argparse
import json
import sys
from collections import Counter
from pathlib import Path

import duckdb
import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from engine import calendar_us  # noqa: E402
from engine.sip import config as scfg  # noqa: E402
from engine.sip import universe  # noqa: E402

THIN_RTH_BARS = 300     # a full session has 390; an early close 210


def _d(s: str) -> int:
    return int(s.replace("-", ""))


def audit_grouped() -> dict:
    files = sorted(scfg.GROUPED_DIR.glob("*.parquet"))
    present = {f.stem for f in files}
    expected = set(calendar_us.trading_days(scfg.WARMUP_START, scfg.END))
    con = duckdb.connect()
    rows = con.execute(
        f"SELECT count(*) FROM read_parquet('{scfg.GROUPED_DIR}/*.parquet')").fetchone()[0]
    con.close()
    return {
        "files": len(files),
        "rows": int(rows),
        "expected_sessions": len(expected),
        "missing_days": sorted(expected - present),
        "extra_days": sorted(present - expected),
    }


def audit_open5() -> dict:
    """Coverage is an INTERSECTION, not a ratio of counts.

    The store holds every name that was ever in the pool, so on any single day
    it contains far more symbols than that day's eligible universe. The number
    that matters is the share of THAT DAY's eligible names which actually have
    a 09:30 bar, because a name absent from the store cannot be selected
    however busy it was.
    """
    con = duckdb.connect()
    q = f"""
      SELECT day, regexp_extract(filename, '([^/]+)/[^/]+\\.parquet$', 1) AS symbol
      FROM read_parquet('{scfg.OPEN5_DIR}/*/*.parquet', filename=true)
      WHERE minute = 570
    """
    t = con.execute(q).arrow()
    con.close()
    if hasattr(t, "read_all"):
        t = t.read_all()
    days = t.column("day").to_numpy(zero_copy_only=False)
    syms = t.column("symbol").to_pylist()
    lo, hi = _d(scfg.START), _d(scfg.END)
    have: dict[int, set] = {}
    for d, s in zip(days, syms):
        d = int(d)
        if lo <= d <= hi:
            have.setdefault(d, set()).add(s)
    tab = universe.eligible_table()
    cover, pool_cover, sizes = [], [], []
    for d, present in have.items():
        row = tab.get(d)
        if row is None:
            continue
        el = {str(x) for x in row["ticker"]}
        pool = {str(x) for x in row["ticker"][:scfg.POOL_N]}
        sizes.append(len(el))
        cover.append(len(el & present) / max(len(el), 1))
        pool_cover.append(len(pool & present) / max(len(pool), 1))
    expected = {_d(x) for x in calendar_us.trading_days(scfg.START, scfg.END)}
    c = np.array(cover) if cover else np.array([0.0])
    pc = np.array(pool_cover) if pool_cover else np.array([0.0])
    sz = np.array(sizes) if sizes else np.array([0.0])
    return {
        "sessions_with_opening_bars": len(have),
        "expected_sessions": len(expected),
        "missing_sessions": sorted(expected - set(have)),
        "eligible_median": float(np.median(sz)),
        "symbols_in_store_median": float(np.median([len(v) for v in have.values()])),
        "coverage_of_eligible_median": float(np.median(c)),
        "coverage_of_eligible_p10": float(np.quantile(c, 0.10)),
        "coverage_of_eligible_min": float(c.min()),
        "coverage_of_pool_median": float(np.median(pc)),
        "coverage_of_pool_min": float(pc.min()),
    }


def audit_1m() -> dict:
    files = list(scfg.MIN1_DIR.glob("*/*.parquet"))
    if not files:
        return {"files": 0}
    con = duckdb.connect()
    con.execute("SET TimeZone='UTC'")
    q = f"""
      SELECT regexp_extract(filename, '([^/]+)/([^/]+)\\.parquet$', 1) AS symbol,
             regexp_extract(filename, '([^/]+)/([^/]+)\\.parquet$', 2) AS day,
             count(*) AS bars
      FROM read_parquet('{scfg.MIN1_DIR}/*/*.parquet', filename=true)
      GROUP BY 1, 2
    """
    t = con.execute(q).arrow()
    con.close()
    if hasattr(t, "read_all"):
        t = t.read_all()
    days = t.column("day").to_pylist()
    bars = t.column("bars").to_numpy(zero_copy_only=False)
    early = set(calendar_us.EARLY_CLOSES) if hasattr(calendar_us, "EARLY_CLOSES") else set()
    thin = [(d, int(b)) for d, b in zip(days, bars)
            if b < THIN_RTH_BARS and d not in early]
    empty = [d for d, b in zip(days, bars) if b == 0]
    not_a_session = [d for d in set(days) if not calendar_us.is_trading_day(d)]
    return {
        "files": len(files),
        "symbol_days": int(len(days)),
        "bars": int(bars.sum()),
        "median_bars_per_session": float(np.median(bars)),
        "empty_sessions": len(empty),
        "thin_sessions": len(thin),
        "thin_examples": sorted(thin, key=lambda x: x[1])[:20],
        "days_the_market_was_shut": sorted(not_a_session)[:20],
        "bar_count_histogram": dict(Counter(
            int(b) // 50 * 50 for b in bars).most_common(8)),
    }


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default=str(scfg.DATA_ROOT / "manifest.json"))
    a = ap.parse_args()
    m = {"snapshot": scfg.SNAPSHOT,
         "window": [scfg.START, scfg.END],
         "warmup_start": scfg.WARMUP_START,
         "pool_n": scfg.POOL_N,
         "grouped": audit_grouped(),
         "open5": audit_open5(),
         "min1": audit_1m()}
    Path(a.out).write_text(json.dumps(m, indent=2, default=str))
    print(json.dumps(m, indent=2, default=str)[:4000])
    print(f"\nwrote {a.out}")
    bad = (m["grouped"]["missing_days"] or m["grouped"]["extra_days"]
           or m["open5"]["missing_sessions"]
           or m["min1"].get("days_the_market_was_shut"))
    return 1 if bad else 0


if __name__ == "__main__":
    raise SystemExit(main())
