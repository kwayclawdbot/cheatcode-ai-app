"""PHASE 1b — the owner's three discretionary filters, measured as gradients.

    .venv/bin/python run_gradient_study2.py

The owner, 2026-08-31, on what makes him SKIP a 15-minute ORB breakout:

    "if the stock was already extremely overbought... if the overall market is
     bearish... if it's near a major resistance area"

and then the product question: can a SCORE be built on top of the base breakout
and graded A-F for users.

**A grade only means something if some variable actually separates outcomes.**
Four attempts have now failed to find one: ENGINE-9 (Kai's own score, worse than
a coin toss), ENGINE-11 (continuous trend strength, flat across ten deciles),
and the Phase 1 study here (range expansion, gap and location all flat). So this
asks the gradient question FIRST for the owner's three filters, exactly as
Phase 1 did, and a score is only built if something here has a slope.

THE READING RULE, FIXED BEFORE THE RUN, unchanged from Phase 1:

  1. strong half minus weak half, PAIRED WITHIN THE DAY, 95% interval excludes
     zero;
  2. it survives in CENTS PER SHARE as well as in R (R divides by the stop, so
     a gradient in R alone can be the denominator moving);
  3. the Bonferroni interval for three variables is printed beside every one.

Measured on the INCUMBENT's trades — orb_sip.v2 on ENGINE-6's selection,
unchanged. Everything is as of the PRIOR CLOSE or the opening candle; nothing
reaches into the session being traded.

The three variables, defined before anything was computed:

  overbought   how far the daily chart is already extended IN THE DIRECTION OF
               THE TRADE. (close - EMA20) / ATR14 as of the prior close, signed
               by side. HIGH = a long into an already-stretched-up chart, which
               is the thing the owner says he skips.

  market       the market's own trend, signed by side. SPY's (close - EMA20) /
               ATR14 as of the prior close, times +1 long / -1 short. HIGH = the
               trade is with the market, LOW = a long in a bearish tape.
               NOTE: ENGINE-13 tested INTRADAY SPY confluence and it made things
               worse. This is the DAILY regime, which is a different variable.

  room         distance from the entry to the nearest overhead level, in ATRs -
               for a long, the highest of the prior day's high and the prior
               20-day high that still sits ABOVE the entry; mirrored for a
               short. LOW = breaking out straight into resistance. Trades with
               no level above (already clear of everything) get the maximum and
               are counted separately, because "no resistance" is not the same
               measurement as "far from resistance".
"""

from __future__ import annotations

import gzip
import json
import sys
from pathlib import Path

import duckdb
import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from engine.backtest.engine import run_symbol  # noqa: E402
from engine.cache import load as cache_load  # noqa: E402
from engine.models.orb_sip_v2 import OrbStocksInPlayV2  # noqa: E402
from engine.run_engine6 import ARM_SIP, COSTS, _atr_map  # noqa: E402
from engine.sip import config as scfg  # noqa: E402

ROOT = Path(__file__).resolve().parent
OUT = ROOT / "reports" / f"gradient_study2.{scfg.SNAPSHOT}.json"
RISK = 1_000.0
Z_BONF = 2.3940                 # two-sided 0.05/3
VARS = ("overbought", "market", "room")
DESC = {
    "overbought": "(close - EMA20)/ATR14 as of the prior close, signed by the "
                  "trade's direction. HIGH = already stretched the way you are "
                  "trading it.",
    "market": "SPY's (close - EMA20)/ATR14 as of the prior close, signed by the "
              "trade's direction. LOW = a long in a bearish tape.",
    "room": "ATRs from the entry to the nearest level overhead (prior day high "
            "/ 20-day high), mirrored for shorts. LOW = breaking into "
            "resistance.",
}


def _ema_last(x: np.ndarray, period: int) -> np.ndarray:
    """EMA as a full series, so any as-of index can be read off it."""
    a = 2.0 / (period + 1.0)
    out = np.empty_like(x, dtype="float64")
    out[0] = x[0]
    for i in range(1, len(x)):
        out[i] = a * x[i] + (1 - a) * out[i - 1]
    return out


def _atr_series(h, l, c, period=14):
    pc = np.concatenate(([c[0]], c[:-1]))
    tr = np.maximum(h - l, np.maximum(np.abs(h - pc), np.abs(l - pc)))
    out = np.full(len(tr), np.nan)
    if len(tr) >= period:
        cs = np.cumsum(tr, dtype="float64")
        out[period - 1] = cs[period - 1] / period
        for i in range(period, len(tr)):
            out[i] = (out[i - 1] * (period - 1) + tr[i]) / period
    return out


def _daily_book(symbols: set[str]) -> dict:
    """{sym: dict of day-ascending arrays} from the grouped tree already on disk."""
    con = duckdb.connect()
    con.execute("SET TimeZone='UTC'")
    g = str(scfg.GROUPED_DIR / "*.parquet")
    con.execute("CREATE TEMP TABLE want(t VARCHAR)")
    con.executemany("INSERT INTO want VALUES (?)", [(s,) for s in sorted(symbols)])
    rows = con.execute(f"""
        SELECT ticker, day, high, low, close FROM (
          SELECT ticker,
                 CAST(strftime(strptime(regexp_extract(filename,'([0-9]{{4}}-[0-9]{{2}}-[0-9]{{2}})',1),'%Y-%m-%d'),'%Y%m%d') AS INTEGER) AS day,
                 high, low, close
          FROM read_parquet('{g}', filename=true))
        WHERE ticker IN (SELECT t FROM want)
        ORDER BY ticker, day
    """).fetchall()
    con.close()
    book = {}
    for tk, day, hi, lo, cl in rows:
        b = book.setdefault(tk, {"day": [], "h": [], "l": [], "c": []})
        b["day"].append(int(day)); b["h"].append(float(hi))
        b["l"].append(float(lo)); b["c"].append(float(cl))
    for tk, b in book.items():
        for k in ("day", "h", "l", "c"):
            b[k] = np.asarray(b[k], dtype="float64" if k != "day" else "int64")
        b["ema20"] = _ema_last(b["c"], 20)
        b["atr14"] = _atr_series(b["h"], b["l"], b["c"])
    return book


def _asof(book_sym, day):
    """Index of the last daily bar STRICTLY BEFORE `day`."""
    d = book_sym["day"]
    j = int(np.searchsorted(d, int(day), side="left")) - 1
    return j if j >= 0 else None


def _paired(strong, weak):
    days = sorted(set(strong) & set(weak))
    return [float(np.mean(strong[d])) - float(np.mean(weak[d])) for d in days]


def _ci(xs, z=1.96):
    xs = np.asarray(xs, dtype="float64")
    if len(xs) < 2:
        return (float("nan"),) * 2
    se = float(np.std(xs, ddof=1) / np.sqrt(len(xs)))
    return (float(xs.mean()) - z * se, float(xs.mean()) + z * se)


def main() -> int:
    print(f"gradient study 2 — the owner's three filters, {scfg.SNAPSHOT}",
          flush=True)
    with gzip.open(scfg.DATA_ROOT / "selection.json.gz", "rt") as f:
        sel = json.load(f)
    rows = [r for r in sel["rows"] if r["arm"] == ARM_SIP]
    pairs = {(r["symbol"], int(r["day"])) for r in rows}
    dbs = {}
    for s, d in pairs:
        dbs.setdefault(s, set()).add(d)
    atr = _atr_map(pairs)

    print("  building daily book from the grouped tree...", flush=True)
    book = _daily_book(set(dbs))
    print(f"  daily book: {len(book):,} tickers", flush=True)

    # SPY daily regime, from the deep snapshot's own daily bars
    spy1 = cache_load.load("SPY", "1m", "polygon-deep-v1")
    sb = {}
    for day, (a, b) in spy1.day_bounds().items():
        sb.setdefault("day", []).append(int(day))
        sb.setdefault("h", []).append(float(np.max(spy1.high[a:b])))
        sb.setdefault("l", []).append(float(np.min(spy1.low[a:b])))
        sb.setdefault("c", []).append(float(spy1.close[b - 1]))
    order = np.argsort(np.asarray(sb["day"]))
    spy = {k: np.asarray(v, dtype="float64" if k != "day" else "int64")[order]
           for k, v in sb.items()}
    spy["ema20"] = _ema_last(spy["c"], 20)
    spy["atr14"] = _atr_series(spy["h"], spy["l"], spy["c"])
    print(f"  SPY daily regime: {len(spy['day']):,} sessions", flush=True)

    recs = []
    no_room = 0
    for i, (sym, days) in enumerate(sorted(dbs.items())):
        try:
            series = cache_load.load(sym, "1m", scfg.SNAPSHOT)
        except FileNotFoundError:
            continue
        m = OrbStocksInPlayV2(atr)
        trades, _ = run_symbol(series, m, COSTS, warmup_days=0,
                               day_filter=lambda d, days=days: int(d) in days)
        m.finish()
        bs = book.get(sym)
        for t in trades:
            if bs is None:
                continue
            j = _asof(bs, t.day)
            if j is None or j < 20 or not np.isfinite(bs["atr14"][j]) or bs["atr14"][j] <= 0:
                continue
            sgn = 1.0 if t.side == "long" else -1.0
            a14 = float(bs["atr14"][j])
            ob = float((bs["c"][j] - bs["ema20"][j]) / a14) * sgn
            k = _asof(spy, t.day)
            if k is None or k < 20 or not np.isfinite(spy["atr14"][k]) or spy["atr14"][k] <= 0:
                continue
            mk = float((spy["c"][k] - spy["ema20"][k]) / float(spy["atr14"][k])) * sgn
            # nearest level in the direction of the trade
            lo20 = max(0, j - 19)
            if t.side == "long":
                cands = [bs["h"][j], float(np.max(bs["h"][lo20:j + 1]))]
                above = [x for x in cands if x > t.fill_price]
                room = (min(above) - t.fill_price) / a14 if above else np.nan
            else:
                cands = [bs["l"][j], float(np.min(bs["l"][lo20:j + 1]))]
                below = [x for x in cands if x < t.fill_price]
                room = (t.fill_price - max(below)) / a14 if below else np.nan
            if not np.isfinite(room):
                no_room += 1
            recs.append({"day": int(t.day), "net_r": float(t.net_r),
                         "net_ps": float(t.net_r) * float(t.risk_per_share),
                         "overbought": ob, "market": mk, "room": room})
        cache_load.load.cache_clear()
        if (i + 1) % 700 == 0:
            print(f"  replayed {i+1:,}/{len(dbs):,}, {len(recs):,} trades", flush=True)

    print(f"\n  {len(recs):,} trades; {no_room:,} had NO level in the way "
          f"({no_room/max(len(recs),1)*100:.1f}%) and are excluded from `room`",
          flush=True)
    result = {"snapshot": scfg.SNAPSHOT, "n": len(recs), "no_room": no_room,
              "vars": {}}
    for v in VARS:
        vals = np.array([r[v] for r in recs], dtype="float64")
        ok = np.isfinite(vals)
        sub = [r for r, k in zip(recs, ok) if k]
        x = vals[ok]
        q = np.quantile(x, np.arange(0, 1.01, 0.1))
        dec = np.clip(np.searchsorted(q[1:-1], x, side="right"), 0, 9)
        table = []
        for d in range(10):
            msk = dec == d
            if not msk.any():
                continue
            table.append({"decile": d + 1, "n": int(msk.sum()),
                          "lo": float(x[msk].min()), "hi": float(x[msk].max()),
                          "mean_r": float(np.mean([s["net_r"] for s, kk in zip(sub, msk) if kk])),
                          "mean_ps": float(np.mean([s["net_ps"] for s, kk in zip(sub, msk) if kk])),
                          "hit": float(np.mean([s["net_r"] > 0 for s, kk in zip(sub, msk) if kk]))})
        perday = {}
        for s, xi in zip(sub, x):
            perday.setdefault(s["day"], []).append((xi, s))
        bs_, bw_, bsp, bwp = {}, {}, {}, {}
        for day, items in perday.items():
            if len(items) < 4:
                continue
            items.sort(key=lambda t: t[0])
            h = len(items) // 2
            bw_[day] = [s["net_r"] for _, s in items[:h]]
            bs_[day] = [s["net_r"] for _, s in items[-h:]]
            bwp[day] = [s["net_ps"] for _, s in items[:h]]
            bsp[day] = [s["net_ps"] for _, s in items[-h:]]
        dr, dps = _paired(bs_, bw_), _paired(bsp, bwp)
        lo, hi = _ci(dr)
        blo, bhi = _ci(dr, Z_BONF)
        plo, phi = _ci(dps)
        result["vars"][v] = {"n": len(sub), "desc": DESC[v], "deciles": table,
                             "smw_r": float(np.mean(dr)), "ci_r": [lo, hi],
                             "ci_r_bonf": [blo, bhi], "days": len(dr),
                             "smw_ps": float(np.mean(dps)), "ci_ps": [plo, phi]}
        verdict = ("CLEARS 95%" if lo > 0 or hi < 0 else "flat")
        print(f"\n  {v}", flush=True)
        print(f"    strong-half minus weak-half: {np.mean(dr)*RISK:+.0f} $/1k "
              f"(95%: {lo*RISK:+.0f} to {hi*RISK:+.0f})  [{verdict}]", flush=True)
        print(f"    cents/share:                 {np.mean(dps)*100:+.2f}c "
              f"(95%: {plo*100:+.2f} to {phi*100:+.2f})", flush=True)
        print(f"    Bonferroni(3):               {blo*RISK:+.0f} to {bhi*RISK:+.0f}",
              flush=True)
        print("    decile mean R: "
              + " ".join(f"{t['mean_r']:+.3f}" for t in table), flush=True)

    OUT.write_text(json.dumps(result, indent=1))
    print(f"\n  wrote {OUT}", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
