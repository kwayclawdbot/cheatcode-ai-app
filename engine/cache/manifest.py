"""Audit the cache and write a manifest. A silent gap is how a backtest lies.

Per symbol this records the first and last bar actually obtained, the trading
days present, and three kinds of gap, each reported loudly:

  missing_days   — a calendar trading day with no bars at all
  thin_days      — a full session with < THIN_RTH_BARS regular-hours minutes
  extra_days     — bars on a day the calendar says the market was shut

It also derives early closes from the tape (last RTH bar at/under 13:00) and
diffs them against engine/calendar_us.EARLY_CLOSES, so the hand-typed table has
to answer to the data.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from engine import calendar_us, config  # noqa: E402
from engine.cache.load import has_symbol, load, snapshot_dir  # noqa: E402

THIN_RTH_BARS = 300  # a full session has ~390; an early close ~210


def day_int(day: str) -> int:
    return int(day.replace("-", ""))


def day_str(d: int) -> str:
    s = str(int(d))
    return f"{s[0:4]}-{s[4:6]}-{s[6:8]}"


def audit_symbol(symbol: str, start: str, end: str, snapshot: str | None = None) -> dict:
    s = load(symbol, "1m", snapshot)
    bounds = s.day_bounds()
    present = sorted(bounds)
    expected = [day_int(d) for d in calendar_us.trading_days(start, end)]
    expected = [d for d in expected if day_int(start) <= d <= day_int(end)]

    rth = (s.minute >= config.RTH_OPEN_MIN) & (s.minute < config.RTH_CLOSE_MIN)
    thin, early_from_tape, rth_counts = [], [], {}
    for d in present:
        a, b = bounds[d]
        n_rth = int(rth[a:b].sum())
        rth_counts[d] = n_rth
        mins = s.minute[a:b][rth[a:b]]
        if len(mins) == 0:
            continue
        last_rth_minute = int(mins.max())
        if last_rth_minute <= config.EARLY_CLOSE_MIN:
            early_from_tape.append(d)
        elif n_rth < THIN_RTH_BARS:
            thin.append(d)

    present_set, expected_set = set(present), set(expected)
    missing = sorted(expected_set - present_set)
    extra = sorted(present_set - expected_set)
    early_table = {day_int(d) for d in calendar_us.EARLY_CLOSES
                   if day_int(start) <= day_int(d) <= day_int(end)}

    return {
        "symbol": symbol,
        "bars_1m": len(s),
        "first_bar_et": f"{day_str(int(s.day[0]))} {int(s.minute[0])//60:02d}:{int(s.minute[0])%60:02d}",
        "last_bar_et": f"{day_str(int(s.day[-1]))} {int(s.minute[-1])//60:02d}:{int(s.minute[-1])%60:02d}",
        "trading_days_present": len(present),
        "trading_days_expected": len(expected),
        "missing_days": [day_str(d) for d in missing],
        "extra_days": [day_str(d) for d in extra],
        "thin_days": [f"{day_str(d)}({rth_counts[d]})" for d in thin],
        "early_closes_from_tape": [day_str(d) for d in early_from_tape],
        "early_closes_table_only": [day_str(d) for d in sorted(early_table - set(early_from_tape))],
        "early_closes_tape_only": [day_str(d) for d in sorted(set(early_from_tape) - early_table)],
        "median_rth_bars": int(np.median(list(rth_counts.values()))) if rth_counts else 0,
    }


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--symbols", default=",".join(config.UNIVERSE))
    ap.add_argument("--start", default=config.CACHE_START)
    ap.add_argument("--end", default=config.CACHE_END)
    ap.add_argument("--snapshot", default=None)
    a = ap.parse_args()
    syms = [x.strip().upper() for x in a.symbols.split(",") if x.strip()]

    rows, absent = [], []
    for sym in syms:
        if not has_symbol(sym, "1m", a.snapshot):
            absent.append(sym)
            continue
        rows.append(audit_symbol(sym, a.start, a.end, a.snapshot))

    man = {
        "snapshot": a.snapshot or config.SNAPSHOT,
        "requested_start": a.start,
        "requested_end": a.end,
        "symbols_absent": absent,
        "total_bars_1m": sum(r["bars_1m"] for r in rows),
        "symbols": rows,
    }
    out = snapshot_dir(a.snapshot) / "manifest.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(man, indent=2))

    print(f"snapshot {man['snapshot']}: {len(rows)} symbols, {man['total_bars_1m']:,} 1m bars")
    if absent:
        print(f"  ABSENT: {', '.join(absent)}")
    for r in rows:
        flags = []
        if r["missing_days"]:
            flags.append(f"MISSING {len(r['missing_days'])}: {r['missing_days'][:6]}")
        if r["extra_days"]:
            flags.append(f"EXTRA {len(r['extra_days'])}: {r['extra_days'][:6]}")
        if r["thin_days"]:
            flags.append(f"THIN {len(r['thin_days'])}: {r['thin_days'][:6]}")
        if r["early_closes_table_only"]:
            flags.append(f"CAL-SAYS-EARLY-TAPE-DISAGREES: {r['early_closes_table_only']}")
        if r["early_closes_tape_only"]:
            flags.append(f"TAPE-SAYS-EARLY-CAL-DISAGREES: {r['early_closes_tape_only']}")
        mark = "!!" if flags else "ok"
        print(f"  {mark} {r['symbol']:<6} {r['bars_1m']:>8,} bars  "
              f"{r['first_bar_et']} .. {r['last_bar_et']}  "
              f"days {r['trading_days_present']}/{r['trading_days_expected']}  "
              f"med RTH {r['median_rth_bars']}")
        for f in flags:
            print(f"       {f}")
    print(f"manifest -> {out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
