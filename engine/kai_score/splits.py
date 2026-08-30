"""Split factors, so the daily bars the score reads are the ones the live
scanner reads.

The cached grouped bars in `polygon-sip-v1` are UNADJUSTED, and deliberately so:
the universe filter is "price > $5 as a trader saw it on the day", and adjusted
prices would back-promote a name at a price it never traded at.

The live Kai scanner reads a different endpoint with `adjusted=true`. On an
unadjusted series a 2-for-1 split is a 50% single-day collapse, which would
drive the trend clouds, the squeeze and the swing oscillator for the next six
months on a name that did nothing. Scoring unadjusted bars would not be a
faithful port; it would be a port with a large, one-sided bug in it.

So this module fetches Polygon's splits REFERENCE table — not bars, ~2,000 rows
for the whole window, one small paginated call — and builds a cumulative factor
`C[t]` per ticker. The point-in-time adjusted series a scan on date `D` would
have seen is `raw[t] * C[D] / C[t]` for prices and `rawvol[t] * C[t] / C[D]` for
volume. `C[D]` is a constant across the window, and every component of the Kai
score is scale-invariant, so the universal series `raw[t]/C[t]` and
`rawvol[t]*C[t]` give identical scores at every as-of date. The two absolute
floors the live prefilter applies — price > $5 and 20-day average volume >
500,000 — are the only places `C[D]` has to be reinstated, and it is.

No split after the as-of date is ever used: `C` is a running product over
execution dates, so `C[D]/C[t]` for `t <= D` involves only splits that had
already happened.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import httpx
import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from engine import config as ecfg  # noqa: E402
from engine.kai_score import config as kcfg  # noqa: E402

BASE = "https://api.polygon.io"


def fetch(start: str, end: str) -> list[dict]:
    """Page by execution date, not by `next_url`.

    Polygon's `next_url` on this endpoint drops the `execution_date` filters and
    the sort, so following it returns the same tail page forever. Walking the
    date cursor forward is a page per nine months or so and terminates.
    """
    key = ecfg.polygon_api_key()
    url = f"{BASE}/v3/reference/splits"
    seen: dict[str, dict] = {}
    cursor = start
    with httpx.Client(timeout=60.0, headers={"User-Agent": "cheatcode-engine9/1"}) as c:
        for _ in range(200):
            r = c.get(url, params={"execution_date.gte": cursor,
                                   "execution_date.lte": end, "limit": 1000,
                                   "order": "asc", "sort": "execution_date",
                                   "apiKey": key})
            r.raise_for_status()
            rows = r.json().get("results") or []
            fresh = [x for x in rows if x.get("id") not in seen]
            for x in rows:
                seen[str(x.get("id"))] = x
            last = max((str(x["execution_date"]) for x in rows), default=None)
            if not rows or not fresh or last is None or last >= end:
                break
            cursor = last                       # inclusive; the dedupe handles it
    return sorted(seen.values(), key=lambda x: (x["execution_date"], x["ticker"]))


def load() -> dict[str, list[tuple[int, float]]]:
    """{ticker: [(yyyymmdd, ratio), ...]} — ratio = split_to / split_from, so a
    2-for-1 is 2.0 and a 1-for-10 reverse split is 0.1."""
    if not kcfg.SPLITS_PATH.exists():
        return {}
    raw = json.loads(kcfg.SPLITS_PATH.read_text())
    out: dict[str, list[tuple[int, float]]] = {}
    for r in raw:
        try:
            frm = float(r["split_from"])
            to = float(r["split_to"])
            if frm <= 0 or to <= 0:
                continue
            day = int(str(r["execution_date"]).replace("-", ""))
        except (KeyError, TypeError, ValueError):
            continue
        out.setdefault(str(r["ticker"]).upper(), []).append((day, to / frm))
    for v in out.values():
        v.sort()
    return out


def cumulative_factor(days: np.ndarray, events: list[tuple[int, float]]) -> np.ndarray:
    """`C[t]`: the product of every split ratio with an execution date at or
    before `days[t]`. A bar on the execution date is already post-split, which is
    what Polygon's own adjusted series does."""
    c = np.ones(len(days), dtype="float64")
    if not events:
        return c
    for ex_day, ratio in events:
        c[days >= ex_day] *= ratio
    return c


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--start", default="2020-01-01")
    ap.add_argument("--end", default=kcfg.HELD_END)
    a = ap.parse_args()
    rows = fetch(a.start, a.end)
    kcfg.SPLITS_PATH.parent.mkdir(parents=True, exist_ok=True)
    kcfg.SPLITS_PATH.write_text(json.dumps(rows))
    print(f"{len(rows):,} splits {a.start}..{a.end} -> {kcfg.SPLITS_PATH}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
