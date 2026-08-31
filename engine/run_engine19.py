"""ENGINE-19 — the owner's hourly-RSI filter, fetched live, nothing cached.

    .venv/bin/python run_engine19.py --stage rsi     # fetch + compute, store floats
    .venv/bin/python run_engine19.py --stage run     # join to existing trades, report

The owner: "add filter for extreme overbought setups on the hourly (rsi > 70) at
market open. Overbought on daily ok (could be a parabolic runner)."

**Nothing is replayed and no bars are cached.** A filter does not change entries,
stops or exits - it only decides which of an existing set of trades are taken.
The incumbent's 10,545 verdict-window trades are already committed in
`reports/orb_sip.v6_1r.polygon-sip-v1.trades.csv.gz`. This lane fetches hourly
bars from Polygon, reduces each symbol to one RSI number per traded day,
discards the bars, and splits the trades that already exist.

The bar was committed before the fetch: `models/orb_sip.v11_hrsi/GATE.md`.
"""

from __future__ import annotations

import argparse
import asyncio
import csv
import gzip
import json
import sys
from collections import defaultdict
from pathlib import Path

import httpx
import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from engine import config as ecfg  # noqa: E402
from engine.sip.poly import BASE, paginate  # noqa: E402

ROOT = Path(__file__).resolve().parent
TRADES_IN = ROOT / "reports" / "orb_sip.v6_1r.polygon-sip-v1.trades.csv.gz"
RSI_OUT = ROOT / "reports" / "hourly_rsi.v11.json.gz"
REPORT = ROOT / "reports" / "orb_sip.v11_hrsi.md"
RISK = 1_000.0

WINDOW = (20240101, 20260828)
WARMUP_FROM = "2023-10-01"          # ~14 hourly bars needs only days, this is ample
FETCH_TO = "2026-08-28"
RSI_PERIOD = 14
LONG_MAX, SHORT_MIN = 70.0, 30.0
CONCURRENCY = 24
Z_BONF = 2.3940


def _money(r):
    return f"{r * RISK:+,.0f} dollars"


def _mean(xs):
    return float(np.mean(xs)) if len(xs) else float("nan")


def _ci(xs, z=1.96):
    xs = np.asarray(xs, dtype="float64")
    if len(xs) < 2:
        return (float("nan"),) * 2
    se = float(np.std(xs, ddof=1) / np.sqrt(len(xs)))
    return (float(xs.mean()) - z * se, float(xs.mean()) + z * se)


def _two_sample(x, y, z=1.96):
    x, y = np.asarray(x, dtype="float64"), np.asarray(y, dtype="float64")
    if len(x) < 2 or len(y) < 2:
        return (float("nan"),) * 3
    d = float(x.mean() - y.mean())
    se = float(np.sqrt(x.var(ddof=1) / len(x) + y.var(ddof=1) / len(y)))
    return (d, d - z * se, d + z * se)


def _paired(a, b):
    """a and b are {day: [net_r,...]}."""
    days = sorted(set(a) & set(b))
    return [float(np.mean(a[d])) - float(np.mean(b[d])) for d in days]


def _load_trades():
    rows = []
    with gzip.open(TRADES_IN, "rt") as f:
        for r in csv.DictReader(f):
            if r["arm"] != "v2":
                continue
            d = int(r["day"])
            if not (WINDOW[0] <= d <= WINDOW[1]):
                continue
            rows.append({"symbol": r["symbol"], "day": d, "side": r["side"],
                         "net_r": float(r["net_r"]),
                         "risk": float(r["risk_per_share"]),
                         "mfe_r": float(r["mfe_r"])})
    return rows


def _rsi_wilder(close: np.ndarray, period: int = RSI_PERIOD) -> np.ndarray:
    """Wilder's RSI as a full series; index i is the RSI at bar i."""
    n = len(close)
    out = np.full(n, np.nan)
    if n <= period:
        return out
    delta = np.diff(close)
    gain = np.clip(delta, 0, None)
    loss = np.clip(-delta, 0, None)
    ag = gain[:period].mean()
    al = loss[:period].mean()
    out[period] = 100.0 if al == 0 else 100.0 - 100.0 / (1.0 + ag / al)
    for i in range(period + 1, n):
        ag = (ag * (period - 1) + gain[i - 1]) / period
        al = (al * (period - 1) + loss[i - 1]) / period
        out[i] = 100.0 if al == 0 else 100.0 - 100.0 / (1.0 + ag / al)
    return out


async def _one(client, key, sym, days_needed, sem, out, prog):
    """Fetch hourly bars for one symbol, keep ONE RSI per needed day, drop bars."""
    async with sem:
        try:
            res = await paginate(
                client, key,
                f"{BASE}/v2/aggs/ticker/{sym}/range/1/hour/{WARMUP_FROM}/{FETCH_TO}",
                {"adjusted": "true", "sort": "asc"})
        except Exception:  # noqa: BLE001
            prog["fail"] += 1
            return
    if not res:
        prog["empty"] += 1
        return
    ts = np.array([r["t"] for r in res], dtype="int64")
    close = np.array([r["c"] for r in res], dtype="float64")
    # ET calendar day of each bar, and regular-hours only
    import pandas as pd
    idx = pd.to_datetime(ts, unit="ms", utc=True).tz_convert("America/New_York")
    minute = (idx.hour * 60 + idx.minute).to_numpy()
    day = np.array([int(x) for x in idx.strftime("%Y%m%d")], dtype="int64")
    keep = (minute >= 9 * 60 + 30) & (minute < 16 * 60)
    ts, close, day = ts[keep], close[keep], day[keep]
    if len(close) <= RSI_PERIOD:
        prog["short"] += 1
        return
    rsi = _rsi_wilder(close)
    # as of the last bar STRICTLY BEFORE the traded day
    for d in days_needed:
        j = int(np.searchsorted(day, d, side="left")) - 1
        if j < 0 or not np.isfinite(rsi[j]):
            continue
        out[f"{sym}|{d}"] = round(float(rsi[j]), 3)
    prog["ok"] += 1
    if prog["ok"] % 200 == 0:
        print(f"  {prog['ok']:,} symbols, {len(out):,} RSI values", flush=True)


async def stage_rsi_async():
    trades = _load_trades()
    need = defaultdict(set)
    for t in trades:
        need[t["symbol"]].add(t["day"])
    print(f"  {len(trades):,} incumbent trades, {len(need):,} symbols to fetch",
          flush=True)
    key = ecfg.polygon_api_key()
    out, prog = {}, defaultdict(int)
    sem = asyncio.Semaphore(CONCURRENCY)
    async with httpx.AsyncClient(headers={"User-Agent": "cheatcode-engine19/1"}) as c:
        await asyncio.gather(*[
            _one(c, key, s, sorted(d), sem, out, prog) for s, d in sorted(need.items())])
    print(f"  done: ok={prog['ok']:,} fail={prog['fail']:,} empty={prog['empty']:,} "
          f"short={prog['short']:,}; {len(out):,} RSI values", flush=True)
    with gzip.open(RSI_OUT, "wt") as f:
        json.dump(out, f)
    print(f"  wrote {RSI_OUT} ({RSI_OUT.stat().st_size/1e6:.1f} MB) — no bars kept",
          flush=True)


def stage_run():
    trades = _load_trades()
    with gzip.open(RSI_OUT, "rt") as f:
        rsi = json.load(f)
    for t in trades:
        t["rsi"] = rsi.get(f"{t['symbol']}|{t['day']}")
    have = [t for t in trades if t["rsi"] is not None]
    missing = len(trades) - len(have)
    print(f"  {len(have):,} trades with an hourly RSI; {missing:,} without "
          f"({missing/max(len(trades),1)*100:.1f}%)", flush=True)

    def removed(t):
        return (t["side"] == "long" and t["rsi"] > LONG_MAX) or \
               (t["side"] == "short" and t["rsi"] < SHORT_MIN)

    kept = [t for t in have if not removed(t)]
    drop = [t for t in have if removed(t)]
    print(f"  kept {len(kept):,}, removed {len(drop):,} "
          f"({len(drop)/max(len(have),1)*100:.1f}%)", flush=True)

    kr = [t["net_r"] for t in kept]
    dr = [t["net_r"] for t in drop]
    kp = [t["net_r"] * t["risk"] for t in kept]
    dp = [t["net_r"] * t["risk"] for t in drop]

    d_r, lo_r, hi_r = _two_sample(kr, dr)
    b_lo, b_hi = _two_sample(kr, dr, Z_BONF)[1:]
    d_p, lo_p, hi_p = _two_sample(kp, dp)

    def by_day(ts):
        o = {}
        for t in ts:
            o.setdefault(t["day"], []).append(t["net_r"])
        return o
    paired = _paired(by_day(kept), by_day(have))

    rows = []
    rows.append(("R1", "sample",
                 f">=3,000 kept and >=500 removed",
                 f"kept={len(kept):,}, removed={len(drop):,}",
                 len(kept) >= 3000 and len(drop) >= 500))
    rows.append(("R2", "the removed trades are worse (kept minus removed, unpaired)",
                 "95% excludes zero in the filter's favour",
                 f"{d_r:+.4f} ({_money(d_r)}) (95%: {lo_r:+.4f} to {hi_r:+.4f})",
                 lo_r > 0))
    m_p, (plo, phi) = _mean(paired), _ci(paired)
    rows.append(("R3", "the filter improves the book (kept minus unfiltered, paired by day)",
                 "95% excludes zero in the filter's favour",
                 f"{m_p:+.4f} ({_money(m_p)}) (95%: {plo:+.4f} to {phi:+.4f}, days={len(paired):,})",
                 plo > 0))
    rows.append(("R4", "sign", "mean net R of kept > 0",
                 f"{_mean(kr):+.4f} ({_money(_mean(kr))})", _mean(kr) > 0))
    rows.append(("R5", "not the stop denominator", "R2 holds in cents per share",
                 f"{d_p*100:+.2f}c (95%: {lo_p*100:+.2f} to {hi_p*100:+.2f})",
                 lo_p > 0))

    passed = {r[0]: r[4] for r in rows}
    if not passed["R1"]:
        verdict = "INCONCLUSIVE (sample)"
    elif hi_r < 0:
        verdict = "FILTER HURTS"
    elif passed["R2"] and passed["R3"]:
        verdict = "FILTER WORKS"
    elif passed["R2"]:
        verdict = "DISCRIMINATES BUT DOES NOT PAY"
    else:
        verdict = "NO EFFECT"

    print(f"\n  VERDICT: {verdict}\n", flush=True)
    for i, n, th, ob, ok in rows:
        print(f"   {i} {'PASS' if ok else 'FAIL'} — {n}: {ob}", flush=True)

    _write(verdict, rows, have, kept, drop, paired, missing, b_lo, b_hi)
    print(f"\n  wrote {REPORT}", flush=True)


def _write(verdict, rows, have, kept, drop, paired, missing, b_lo, b_hi):
    L = []
    w = L.append
    w("# `orb_sip.v11_hrsi` — the owner's hourly-RSI filter on the incumbent")
    w("")
    w(f"**Verdict: {verdict}.** Decided on 2024-01-01 → 2026-08-28.")
    w("")
    w("Gate: [`../models/orb_sip.v11_hrsi/GATE.md`](../models/orb_sip.v11_hrsi/GATE.md), "
      "committed before the hourly bars were fetched. **Nothing was replayed and "
      "no bars were cached**: the incumbent's trades already existed, hourly bars "
      "were fetched live, reduced to one RSI per symbol-day, and discarded.")
    w("")
    w("## In plain English")
    w("")
    w("**The filter.** Wilder's RSI(14) on regular-hours hourly bars, read at the "
      "last bar before the session opens — what an hourly chart shows at 09:30. "
      "A long is skipped if that RSI is above 70; a short is skipped if it is "
      "below 30. **The 30 is a mirror and a declared choice** — the owner named "
      "the long case, and the symmetric reading of short-term exhaustion is "
      "oversold for a short. Long and short are reported separately below so the "
      "mirror can be judged on its own.")
    w("")
    w("**This is the eleventh reading of this window and the eighth variable "
      "tested across three studies.** No correction exists for that and none is "
      "applied.")
    w("")
    lk, ld = _mean([t["net_r"] for t in kept]), _mean([t["net_r"] for t in drop])
    w(f"- **Unfiltered baseline** — {len(have):,} trades, "
      f"{_money(_mean([t['net_r'] for t in have]))} a trade.")
    w(f"- **Kept** ({len(kept):,} trades, "
      f"{len(kept)/max(len(have),1)*100:.1f}%) — **{_money(lk)}** a trade.")
    w(f"- **Removed** ({len(drop):,} trades, "
      f"{len(drop)/max(len(have),1)*100:.1f}%) — **{_money(ld)}** a trade.")
    w("")
    if ld > lk:
        w("**THE FILTER REMOVED THE BETTER TRADES.** That is ENGINE-8's failure "
          "mode, now seen for the third time in this programme, and it is stated "
          "here whatever the gates say.")
    else:
        w("The removed trades did worse than the kept ones, which is the "
          "direction the filter was aimed at. Whether the difference clears its "
          "own error bar is R2.")
    w("")
    w("## The pre-registered bar")
    w("")
    w("| id | gate | threshold | observed | |")
    w("|---|---|---|---|---|")
    for i, n, th, ob, ok in rows:
        w(f"| **{i}** | {n} | {th} | {ob} | {'PASS' if ok else '**FAIL**'} |")
    w("")
    w(f"R2 corrected for three readings: {_money(b_lo)} to {_money(b_hi)}.")
    w("")
    w("## Long and short, separately")
    w("")
    w("| side | kept | kept $/1k | removed | removed $/1k |")
    w("|---|---|---|---|---|")
    for side in ("long", "short"):
        k = [t["net_r"] for t in kept if t["side"] == side]
        d = [t["net_r"] for t in drop if t["side"] == side]
        w(f"| {side} | {len(k):,} | {_money(_mean(k))} | {len(d):,} | "
          f"{_money(_mean(d))} |")
    w("")
    w("## The RSI curve — printed so a moved threshold would be visible")
    w("")
    w("The gate fixed 70/30 in advance and they do not move. This curve is "
      "required precisely so the temptation to re-cut it is on the page and "
      "refused.")
    w("")
    w("| hourly RSI decile | range | n | $/1k | hit |")
    w("|---|---|---|---|---|")
    x = np.array([t["rsi"] for t in have], dtype="float64")
    q = np.quantile(x, np.arange(0, 1.01, 0.1))
    dec = np.clip(np.searchsorted(q[1:-1], x, side="right"), 0, 9)
    for dd in range(10):
        m = dec == dd
        if not m.any():
            continue
        sub = [t["net_r"] for t, k in zip(have, m) if k]
        w(f"| {dd+1} | {x[m].min():.1f}–{x[m].max():.1f} | {int(m.sum()):,} | "
          f"{_money(_mean(sub))} | "
          f"{np.mean(np.array(sub) > 0)*100:.1f}% |")
    w("")
    w(f"- **Coverage**: {missing:,} of the incumbent's trades had no hourly RSI "
      f"(insufficient history) and are excluded from every number above.")
    w("")
    w("## Caveats")
    w("")
    w("- Eleventh reading of this window; eighth variable across three studies.")
    w("- The short-side threshold of 30 is a mirror, not the owner's words.")
    w("- A filter cannot create edge, only redistribute it. R3 is the question "
      "of whether removing trades leaves a better book, and it is the one that "
      "matters for shipping.")
    w("- **No leveraged portfolio figure appears anywhere.**")
    w("")
    REPORT.write_text("\n".join(L) + "\n")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--stage", required=True, choices=["rsi", "run"])
    a = ap.parse_args()
    if a.stage == "rsi":
        asyncio.run(stage_rsi_async())
    else:
        stage_run()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
