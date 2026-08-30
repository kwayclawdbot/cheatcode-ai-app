"""PHASE 1 — is there a gradient at all? Four candidate variables, no gate.

    SIP_SNAPSHOT=polygon-sip-v1 ... .venv/bin/python run_gradient_study.py
    SIP_SNAPSHOT=polygon-sip-early-v1 ... .venv/bin/python run_gradient_study.py

**This builds no model and ships no verdict.** ENGINE-8 and ENGINE-11 both built
a gate first and discovered afterwards that the variable underneath it had no
relationship to outcome. This asks that question first, on trades that are
already cached, before anything is built.

THE READING RULE IS FIXED HERE, BEFORE THE RUN, because four variables times ten
deciles is forty numbers and forty numbers will always contain a pattern.

A variable is worth building on ONLY if all four of these hold:

  1. the strong half minus the weak half, PAIRED BY DAY, has a 95% interval
     excluding zero;
  2. it does so in BOTH eras independently (2012-2015 and 2016-2026), which are
     separate snapshots and effectively separate samples;
  3. the sign agrees between the two eras;
  4. it survives in CENTS PER SHARE as well as in R.

Rule 4 is the circularity check and it is not optional. `range_expansion` IS the
stop width, and R divides by the stop width, so a gradient in R could be nothing
but the denominator moving. Cents per share has no such denominator.

Everything is measured on the INCUMBENT's trades — `orb_sip.v2` on ENGINE-6's
selection, unchanged. No trade is added, removed or re-priced. The variables are
all knowable at 09:35 from data already on disk: the opening candle itself, the
prior close and the prior session's high and low.
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

OUT = Path(__file__).resolve().parent / "reports" / f"gradient_study.{scfg.SNAPSHOT}.json"
RISK = 1_000.0
N_VARS = 4
Z_BONF = 2.4977          # two-sided 0.05/4

VARS = ("range_expansion", "gap", "location", "conviction")
DESC = {
    "range_expansion": "opening range width / 14-day ATR",
    "gap": "(09:30 open - prior close) / ATR, signed by the break direction",
    "location": "how far the opening range already cleared the prior day's "
                "extreme, in ATRs, signed by the break direction",
    "conviction": "where the opening candle closed inside its own range, "
                  "0=against the break, 1=hard into it",
}


def _prior_day_hl(snapshot: str) -> dict:
    """{(ticker, day): (prior_high, prior_low)} from the grouped daily tree."""
    con = duckdb.connect()
    g = str(Path(__file__).resolve().parent / "data" / snapshot / "grouped" / "*.parquet")
    rows = con.execute(f"""
        SELECT ticker, day, high, low FROM (
          SELECT ticker,
                 CAST(strftime(strptime(regexp_extract(filename,'([0-9]{{4}}-[0-9]{{2}}-[0-9]{{2}})',1),'%Y-%m-%d'),'%Y%m%d') AS INTEGER) AS day,
                 high, low
          FROM read_parquet('{g}', filename=true))
        ORDER BY ticker, day
    """).fetchall()
    con.close()
    out, prev = {}, {}
    for tk, day, hi, lo in rows:
        if tk in prev:
            out[(tk, int(day))] = prev[tk]
        prev[tk] = (float(hi), float(lo))
    return out


def _paired_by_day(strong, weak):
    """Per-day mean of the strong half minus the weak half of the SAME day."""
    days = sorted(set(strong) & set(weak))
    return [float(np.mean(strong[d])) - float(np.mean(weak[d])) for d in days]


def _ci95(xs):
    xs = np.asarray(xs, dtype="float64")
    if len(xs) < 2:
        return (float("nan"),) * 2
    se = float(np.std(xs, ddof=1) / np.sqrt(len(xs)))
    return (float(xs.mean()) - 1.96 * se, float(xs.mean()) + 1.96 * se)


def _ci(xs, z):
    xs = np.asarray(xs, dtype="float64")
    if len(xs) < 2:
        return (float("nan"),) * 2
    se = float(np.std(xs, ddof=1) / np.sqrt(len(xs)))
    return (float(xs.mean()) - z * se, float(xs.mean()) + z * se)


def main() -> int:
    print(f"gradient study — snapshot {scfg.SNAPSHOT}", flush=True)
    with gzip.open(scfg.DATA_ROOT / "selection.json.gz", "rt") as f:
        sel = json.load(f)
    rows = [r for r in sel["rows"] if r["arm"] == ARM_SIP]
    pairs = {(r["symbol"], int(r["day"])) for r in rows}
    dbs = {}
    for s, d in pairs:
        dbs.setdefault(s, set()).add(d)
    atr = _atr_map(pairs)
    print(f"  {len(pairs):,} symbol-days; loading prior-day levels...", flush=True)
    phl = _prior_day_hl(scfg.SNAPSHOT)
    print(f"  prior-day levels for {len(phl):,} ticker-days", flush=True)

    recs = []
    for i, (sym, days) in enumerate(sorted(dbs.items())):
        try:
            series = cache_load.load(sym, "1m", scfg.SNAPSHOT)
        except FileNotFoundError:
            continue
        m = OrbStocksInPlayV2(atr)
        trades, _ = run_symbol(series, m, COSTS, warmup_days=0,
                               day_filter=lambda d, days=days: int(d) in days)
        m.finish()
        for t in trades:
            md = t.meta
            a = float(md.get("atr14", np.nan))
            oh, ol = float(md["or_high"]), float(md["or_low"])
            oo, oc = float(md["or_open"]), float(md["or_close"])
            if not (a > 0) or not (oh > ol):
                continue
            key = (t.symbol, int(t.day))
            pc = None
            sgn = 1.0 if t.side == "long" else -1.0
            # prior close comes from the same eligible table the ATR did
            rec = {
                "day": int(t.day), "symbol": t.symbol, "side": t.side,
                "net_r": float(t.net_r),
                # cents per share, the unit with no stop in the denominator
                "net_ps": float(t.net_r) * float(t.risk_per_share),
                "range_expansion": (oh - ol) / a,
                "conviction": ((oc - ol) if t.side == "long" else (oh - oc)) / (oh - ol),
            }
            ph = phl.get(key)
            rec["location"] = (((oh - ph[0]) if t.side == "long"
                                else (ph[1] - ol)) / a) if ph else np.nan
            rec["gap"] = np.nan            # filled below from the eligible table
            rec["_or_open"] = oo
            rec["_atr"] = a
            rec["_sgn"] = sgn
            recs.append(rec)
        cache_load.load.cache_clear()
        if (i + 1) % 600 == 0:
            print(f"  replayed {i+1:,}/{len(dbs):,}, {len(recs):,} trades", flush=True)

    # gap needs the prior close, which the eligible table already carries
    from engine.sip import universe
    tab = universe.eligible_table()
    pcmap = {}
    for day, row in tab.items():
        for tk, pc in zip(row["ticker"], row["prior_close"]):
            pcmap[(str(tk), int(day))] = float(pc)
    for r in recs:
        pc = pcmap.get((r["symbol"], r["day"]))
        r["gap"] = (((r["_or_open"] - pc) / r["_atr"]) * r["_sgn"]
                    if pc and pc > 0 else np.nan)

    print(f"  {len(recs):,} trades with variables computed", flush=True)
    result = {"snapshot": scfg.SNAPSHOT, "window": [scfg.START, scfg.END],
              "n": len(recs), "vars": {}}

    for v in VARS:
        vals = np.array([r[v] for r in recs], dtype="float64")
        ok = np.isfinite(vals)
        sub = [r for r, k in zip(recs, ok) if k]
        x = vals[ok]
        if len(sub) < 100:
            result["vars"][v] = {"n": len(sub), "note": "too few"}
            continue
        q = np.quantile(x, np.arange(0, 1.01, 0.1))
        dec = np.clip(np.searchsorted(q[1:-1], x, side="right"), 0, 9)
        table = []
        for d in range(10):
            m = dec == d
            if not m.any():
                continue
            table.append({
                "decile": d + 1, "n": int(m.sum()),
                "lo": float(x[m].min()), "hi": float(x[m].max()),
                "mean_r": float(np.mean([s["net_r"] for s, k in zip(sub, m) if k])),
                "mean_ps": float(np.mean([s["net_ps"] for s, k in zip(sub, m) if k])),
                "hit": float(np.mean([s["net_r"] > 0 for s, k in zip(sub, m) if k])),
            })
        # strong half vs weak half OF THE SAME DAY, paired
        byday_s, byday_w = {}, {}
        byday_sp, byday_wp = {}, {}
        perday = {}
        for s, xi in zip(sub, x):
            perday.setdefault(s["day"], []).append((xi, s))
        for day, items in perday.items():
            if len(items) < 4:
                continue
            items.sort(key=lambda t: t[0])
            h = len(items) // 2
            byday_w[day] = [s["net_r"] for _, s in items[:h]]
            byday_s[day] = [s["net_r"] for _, s in items[-h:]]
            byday_wp[day] = [s["net_ps"] for _, s in items[:h]]
            byday_sp[day] = [s["net_ps"] for _, s in items[-h:]]
        d_r = _paired_by_day(byday_s, byday_w)
        d_ps = _paired_by_day(byday_sp, byday_wp)
        lo, hi = _ci95(d_r)
        blo, bhi = _ci(d_r, Z_BONF)
        plo, phi = _ci95(d_ps)
        means = [t["mean_r"] for t in table]
        result["vars"][v] = {
            "n": len(sub), "desc": DESC[v], "deciles": table,
            "strong_minus_weak_r": float(np.mean(d_r)), "ci_r": [lo, hi],
            "ci_r_bonf": [blo, bhi], "days": len(d_r),
            "strong_minus_weak_ps": float(np.mean(d_ps)), "ci_ps": [plo, phi],
            "spearman_like": float(np.corrcoef(range(len(means)), means)[0, 1])
            if len(means) > 2 else float("nan"),
        }
        print(f"\n  {v} ({DESC[v]})", flush=True)
        print(f"    strong-half minus weak-half: {np.mean(d_r)*RISK:+.0f} dol/1k "
              f"(95%: {lo*RISK:+.0f} to {hi*RISK:+.0f}) over {len(d_r):,} days",
              flush=True)
        print(f"    in cents/share:              {np.mean(d_ps)*100:+.2f}c "
              f"(95%: {plo*100:+.2f} to {phi*100:+.2f})", flush=True)
        print(f"    decile mean R: "
              + " ".join(f"{m:+.3f}" for m in means), flush=True)

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(result, indent=1))
    print(f"\n  wrote {OUT}", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
