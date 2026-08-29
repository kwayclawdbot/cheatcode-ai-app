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
    con = duckdb.connect()
    q = f"""
      SELECT day, count(*) AS n
      FROM read_parquet('{scfg.OPEN5_DIR}/*/*.parquet')
      WHERE minute = 570
      GROUP BY 1 ORDER BY 1
    """
    t = con.execute(q).arrow()
    con.close()
    if hasattr(t, "read_all"):
        t = t.read_all()
    days = t.column("day").to_numpy(zero_copy_only=False)
    n = t.column("n").to_numpy(zero_copy_only=False)
    win = (days >= _d(scfg.START)) & (days <= _d(scfg.END))
    tab = universe.eligible_table()
    eligible = np.array([len(tab[int(d)]["ticker"]) if int(d) in tab else 0
                         for d in days[win]], dtype="float64")
    have = n[win].astype("float64")
    cover = have / np.maximum(eligible, 1.0)
    expected = {_d(x) for x in calendar_us.trading_days(scfg.START, scfg.END)}
    return {
        "sessions_with_opening_bars": int(win.sum()),
        "expected_sessions": len(expected),
        "missing_sessions": sorted(expected - {int(d) for d in days[win]}),
        "symbols_with_an_opening_bar_median": float(np.median(have)) if win.any() else 0.0,
        "symbols_with_an_opening_bar_min": float(have.min()) if win.any() else 0.0,
        "eligible_median": float(np.median(eligible)) if win.any() else 0.0,
        "coverage_of_eligible_median": float(np.median(cover)) if win.any() else 0.0,
        "coverage_of_eligible_min": float(cover.min()) if win.any() else 0.0,
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
