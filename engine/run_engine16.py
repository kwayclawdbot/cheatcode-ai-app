"""ENGINE-16 — the top 10 of a large-cap universe, against the incumbent's top 20.

    .venv/bin/python run_engine16.py --stage plan     # both windows' selections
    .venv/bin/python run_engine16.py --stage fetch    # the missing minute bars
    .venv/bin/python run_engine16.py --stage run      # replay + report

The owner: "What if we narrow it to top 10 s&p500 stocks only for the past
5years". It is NOT the S&P 500 — see `engine/sip/us500.py` for why that is not
available without lookahead, and what is built instead.

Four arms, one selector rule, one model. Only the candidate list and the count
differ. `us500_top20` exists solely to separate the universe change from the
count change. The bar is `engine/models/orb_sip.v8_us500/GATE.md`, committed
before this file produced a number.
"""

from __future__ import annotations

import argparse
import csv
import gzip
import json
import os
import subprocess
import sys
import time
from collections import Counter
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from engine import calendar_us  # noqa: E402
from engine.backtest.engine import run_symbol  # noqa: E402
from engine.backtest.stats import summarise  # noqa: E402
from engine.cache import load as cache_load  # noqa: E402
from engine.models import gates16 as G  # noqa: E402
from engine.models.orb_sip_v2 import (OrbStocksInPlayV2,  # noqa: E402
                                      OrbStocksInPlayV2Coinflip)
from engine.run_backtest import git_rev  # noqa: E402
from engine.run_engine6 import ARM_SIP, COSTS, FREE, _atr_map, _window  # noqa: E402
from engine.sip import config as scfg, universe  # noqa: E402
from engine.sip.fetch_types import load_types  # noqa: E402
from engine.sip.selection import select_day  # noqa: E402
from engine.sip.store import load_open_store  # noqa: E402
from engine.sip.us500 import EXCLUDE_TYPES, UNIVERSE_N, us500_universe  # noqa: E402

ROOT = Path(__file__).resolve().parent
REPORT = ROOT / "reports" / "orb_sip.v8_us500.md"
TRADES_OUT = ROOT / "reports" / "orb_sip.v8_us500.trades.csv.gz"
RISK = 1_000.0

# (label, snapshot, env for that snapshot, window)
PRIMARY = ("primary", "polygon-sip-v1",
           {"SIP_SNAPSHOT": "polygon-sip-v1", "SIP_WARMUP_START": "2015-10-01",
            "SIP_START": "2016-01-01", "SIP_END": "2026-08-28"}, G.PRIMARY)
CONFIRM = ("confirmation", "polygon-sip-early-v1",
           {"SIP_SNAPSHOT": "polygon-sip-early-v1",
            "SIP_WARMUP_START": "2011-10-03", "SIP_START": "2012-01-01",
            "SIP_END": "2015-12-31"}, G.CONFIRM)
WINDOWS = (PRIMARY, CONFIRM)


def _d(s):
    return int(str(s).replace("-", ""))


def _money(r):
    return f"{r * RISK:+,.0f} dollars"


def _mean(xs):
    return float(np.mean(xs)) if len(xs) else float("nan")


def _days(ts):
    return len({int(t.day) for t in ts})


def _stop_share(ts):
    return (sum(1 for t in ts if t.exit_reason == "stop") / len(ts)) if ts else float("nan")


def _paired_by_day(a, b):
    def by_day(ts):
        d = {}
        for t in ts:
            d.setdefault(int(t.day), []).append(float(t.net_r))
        return {k: float(np.mean(v)) for k, v in d.items()}
    x, y = by_day(a), by_day(b)
    return [x[k] - y[k] for k in sorted(set(x) & set(y))]


def _atr_for(pairs, snapshot):
    """ATR keyed per snapshot, not per environment.

    `run_engine6._atr_map` reads `universe.eligible_table()`, which resolves via
    `scfg.DATA_ROOT` — the snapshot named in the ENVIRONMENT. This lane replays
    two snapshots in one process, so that would silently attach one window's ATR
    to the other window's trades. ATR is reporting-only in `orb_sip.v2`, so it
    could not change a trade — but the "in 14-day ATRs" column IS this lane's
    pre-registered mechanism, so a wrong one would corrupt the table the verdict
    is explained by.
    """
    tab = universe.eligible_table(
        str(ROOT / "data" / snapshot / "eligible.parquet"))
    want = {}
    for sym, day in pairs:
        want.setdefault(int(day), set()).add(sym)
    out = {}
    for day, syms in want.items():
        row = tab.get(day)
        if row is None:
            continue
        for t, a in zip(row["ticker"], row["atr"]):
            t = str(t)
            if t in syms:
                out[(t, day)] = float(a)
    return out


def _plan_path(snapshot):
    return ROOT / "data" / snapshot / "us500_plan.json"


# ---------------------------------------------------------------------------


def stage_plan() -> None:
    """Both selections, written to disk BEFORE any minute bar is requested.

    The download is a consequence of the selection and cannot feed back into it;
    the plan file on disk is the receipt.
    """
    for label, snap, env, (wlo, whi) in WINDOWS:
        if scfg.SNAPSHOT != snap:
            print(f"  [{label}] skipped — run under SIP_SNAPSHOT={snap}", flush=True)
            continue
        tab, types, store = universe.eligible_table(), load_types(), load_open_store()
        days = [_d(x) for x in calendar_us.trading_days(wlo, whi)]
        top10, top20, sizes, mix = [], [], [], Counter()
        for day in days:
            row = tab.get(day)
            if row is None:
                continue
            big = us500_universe([str(t) for t in row["ticker"]], types)
            sizes.append(len(big))
            mix.update(types.get(t, "UNKNOWN") for t in big)
            have = [t for t in big if store.has(t)]
            for p in select_day(day, have, store, k=10):
                top10.append([p.symbol, int(p.day), float(p.rvol)])
            for p in select_day(day, have, store, k=20):
                top20.append([p.symbol, int(p.day), float(p.rvol)])
        out = {"window": [wlo, whi], "snapshot": snap, "universe_n": UNIVERSE_N,
               "median_universe": int(np.median(sizes)) if sizes else 0,
               "type_mix": dict(mix.most_common(10)),
               "top10": top10, "top20": top20}
        _plan_path(snap).write_text(json.dumps(out))
        print(f"  [{label}] {len(days):,} sessions, median universe "
              f"{out['median_universe']}, top10={len(top10):,} rows, "
              f"top20={len(top20):,} rows -> {_plan_path(snap)}", flush=True)


def stage_fetch() -> None:
    """Only the symbol-days the plan named, and only the ones not already here."""
    for label, snap, env, _ in WINDOWS:
        p = _plan_path(snap)
        if not p.exists():
            print(f"  [{label}] no plan; run --stage plan first", flush=True)
            continue
        plan = json.loads(p.read_text())
        pairs = sorted({(s, d) for s, d, _ in plan["top10"] + plan["top20"]})
        root = ROOT / "data" / snap / "1m"
        need = [[s, d] for s, d in pairs
                if not (root / s / f"{str(d)[:4]}-{str(d)[4:6]}-{str(d)[6:]}.parquet").exists()]
        print(f"  [{label}] {len(pairs):,} symbol-days planned, "
              f"{len(need):,} missing", flush=True)
        if not need:
            continue
        pf = ROOT / "data" / snap / "us500_need.json"
        pf.write_text(json.dumps(need))
        e = dict(os.environ)
        e.update(env)
        subprocess.run([sys.executable, str(ROOT / "sip" / "fetch_days.py"),
                        "--pairs", str(pf)], env=e, check=True)


def _replay(pairs_by_arm, atr, snapshot):
    dbs = {}
    for arm, pairs in pairs_by_arm.items():
        for s, d in pairs:
            dbs.setdefault(s, set()).add(d)
    want = {arm: {(s, d) for s, d in p} for arm, p in pairs_by_arm.items()}
    out = {arm: [] for arm in pairs_by_arm}
    out["_gross"] = []
    missing = 0
    for i, (sym, days) in enumerate(sorted(dbs.items())):
        try:
            series = cache_load.load(sym, "1m", snapshot)
        except FileNotFoundError:
            missing += len(days)
            continue
        for arm in pairs_by_arm:
            sel = {d for (s, d) in want[arm] if s == sym}
            if not sel:
                continue
            cls = OrbStocksInPlayV2Coinflip if arm == G.FLIP else OrbStocksInPlayV2
            m = cls(atr)
            t, _ = run_symbol(series, m, COSTS, warmup_days=0,
                              day_filter=lambda d, sel=sel: int(d) in sel)
            m.finish()
            out[arm].extend(t)
            if arm == G.TOP10:
                mf = OrbStocksInPlayV2(atr)
                tf, _ = run_symbol(series, mf, FREE, warmup_days=0,
                                   day_filter=lambda d, sel=sel: int(d) in sel)
                mf.finish()
                out["_gross"].extend(tf)
        cache_load.load.cache_clear()
        if (i + 1) % 400 == 0:
            print(f"    replayed {i+1:,}/{len(dbs):,} symbols", flush=True)
    return out, missing


def stage_run() -> None:
    t0 = time.time()
    results = {}
    for label, snap, env, (wlo, whi) in WINDOWS:
        plan = json.loads(_plan_path(snap).read_text())
        top10 = sorted({(s, d) for s, d, _ in plan["top10"]})
        top20 = sorted({(s, d) for s, d, _ in plan["top20"]})
        with gzip.open(ROOT / "data" / snap / "selection.json.gz", "rt") as f:
            sel = json.load(f)
        inc = sorted({(r["symbol"], int(r["day"])) for r in sel["rows"]
                      if r["arm"] == ARM_SIP and _d(wlo) <= int(r["day"]) <= _d(whi)})
        atr = _atr_for(set(top10) | set(top20) | set(inc), snap)
        print(f"  [{label}] {snap}: incumbent={len(inc):,} top10={len(top10):,} "
              f"top20={len(top20):,} symbol-days", flush=True)
        arms = {G.INCUMBENT: inc, G.TOP10: top10, G.TOP20: top20, G.FLIP: top10}
        got, missing = _replay(arms, atr, snap)
        lo, hi = _d(wlo), _d(whi)
        results[label] = {
            "trades": {a: _window(got[a], lo, hi) for a in G.ARMS},
            "gross": _window(got["_gross"], lo, hi),
            "missing": missing, "plan": plan, "window": (wlo, whi),
            "snapshot": snap,
        }
        print(f"  [{label}] replay done, {missing:,} symbol-days had no bars",
              flush=True)

    P, C = results["primary"], results["confirmation"]
    vs_inc = _paired_by_day(P["trades"][G.TOP10], P["trades"][G.INCUMBENT])
    vs_flip = _paired_by_day(P["trades"][G.TOP10], P["trades"][G.FLIP])
    vs_inc_c = _paired_by_day(C["trades"][G.TOP10], C["trades"][G.INCUMBENT])
    gross_top10 = _mean([t.gross_r for t in P["trades"][G.TOP10]])
    net_p = _mean([t.net_r for t in P["trades"][G.TOP10]])
    net_c = _mean([t.net_r for t in C["trades"][G.TOP10]])

    rows_g = G.evaluate(len(P["trades"][G.TOP10]), len(C["trades"][G.TOP10]),
                        vs_inc, vs_flip, vs_inc_c, gross_top10, net_p, net_c)
    verdict = G.verdict(rows_g, vs_inc)
    print(f"\n  VERDICT: {verdict}\n", flush=True)
    for g in rows_g:
        print(f"   {g.id} {'PASS' if g.passed else 'FAIL'} — {g.name}: {g.observed}",
              flush=True)

    with gzip.open(TRADES_OUT, "wt", newline="") as f:
        wr = csv.writer(f)
        wr.writerow(["window", "arm", "symbol", "day", "side", "fill_price",
                     "stop_price", "exit_price", "exit_reason",
                     "risk_per_share", "atr14", "gross_r", "net_r"])
        for label in ("primary", "confirmation"):
            for a in G.ARMS:
                for t in results[label]["trades"][a]:
                    wr.writerow([label, a, t.symbol, t.day, t.side,
                                 f"{t.fill_price:.4f}", f"{t.stop_price:.4f}",
                                 f"{t.exit_price:.4f}", t.exit_reason,
                                 f"{t.risk_per_share:.4f}",
                                 t.meta.get("atr14", ""), f"{t.gross_r:.6f}",
                                 f"{t.net_r:.6f}"])
    _write(verdict, rows_g, results, vs_inc, vs_flip, vs_inc_c, gross_top10,
           time.time() - t0)
    print(f"\n  wrote {REPORT}\n  wrote {TRADES_OUT}", flush=True)


def _stopstats(ts):
    if not ts:
        return (float("nan"),) * 4
    risk = np.array([t.risk_per_share for t in ts])
    fill = np.array([t.fill_price for t in ts])
    atrs = np.array([float(t.meta.get("atr14", np.nan)) for t in ts])
    with np.errstate(invalid="ignore", divide="ignore"):
        return (float(np.median(risk)), float(np.median(risk / fill)),
                float(np.nanmedian(risk / atrs)), _stop_share(ts))


def _write(verdict, rows_g, results, vs_inc, vs_flip, vs_inc_c, gross_top10,
           elapsed):
    L = []
    w = L.append
    P, C = results["primary"], results["confirmation"]
    w("# `orb_sip.v8_us500` — the top 10 of a large-cap universe, against the incumbent's top 20")
    w("")
    w(f"**Verdict: {verdict}.** Decided on the primary window "
      f"{P['window'][0]} → {P['window'][1]} and on nothing else; the "
      f"confirmation window {C['window'][0]} → {C['window'][1]} is reported "
      f"beside it.")
    w("")
    w(f"Gate: [`../models/orb_sip.v8_us500/GATE.md`](../models/orb_sip.v8_us500/GATE.md), "
      f"committed before this file produced a number. Git rev `{git_rev()}`. "
      f"Run took {elapsed/60:.1f} minutes.")
    w("")
    w("## It is NOT the S&P 500, and that is not a technicality")
    w("")
    w("True point-in-time index membership is not available here, and using "
      "**today's** constituent list for a 2021 session would be the worst "
      "lookahead in this project: companies are added to the index *after* they "
      "perform well, so back-projecting membership hands the strategy a "
      "hindsight-picked list of winners and manufactures an edge out of nothing.")
    w("")
    w(f"So this is a **large-cap liquidity proxy**: the {UNIVERSE_N} most liquid "
      f"US common stocks by 20-day average dollar volume as of the prior close, "
      f"drawn from the same survivorship-free universe (every ticker that "
      f"actually traded that day, delisted names included), with foreign "
      f"depositary receipts, funds, notes, warrants, units, preferreds and test "
      f"tickers removed.")
    w("")
    w("**Two ways it differs from the real index**: it will include a "
      "heavily-traded non-index name having a moment (AMC in 2021), and it will "
      "miss a genuine index member that trades quietly.")
    w("")
    mix = P["plan"]["type_mix"]
    tot = sum(mix.values()) or 1
    w(f"Type mix of the proxy universe (primary window): "
      + ", ".join(f"{k} {v/tot*100:.1f}%" for k, v in list(mix.items())[:6])
      + f". `UNKNOWN` is kept — a ticker the reference API no longer knows is "
        f"usually a delisted company, and dropping it would reintroduce the "
        f"survivorship this universe exists to avoid.")
    w("")
    w("## In plain English")
    w("")
    w("**What changed.** The incumbent picks the **top 20 by opening relative "
      "volume from the 1,000 most liquid names of any kind**. This lane picks "
      "the **top 10 from the 500 most liquid US common stocks**. Two changes at "
      "once — a narrower universe and a smaller count — so a third arm, "
      "`us500_top20`, holds the count at 20 and changes only the universe, "
      "which is the only way to say which of the two did the work.")
    w("")
    w("**This is the eighth reading of 2016–2026.** Every lane from ENGINE-6 "
      "onward has looked at part of the primary window. No correction is "
      "applied because none exists. The confirmation window was read once, by "
      "ENGINE-15, testing a different hypothesis — so it is **weak "
      "out-of-sample evidence, stronger than the primary window and weaker than "
      "a virgin one**, and it is not a clean hold-out. Three comparisons is "
      "nearer a 14% false-positive rate than 5%; the corrected interval is "
      "printed beside every one.")
    w("")
    w("**The prior, written into the gate before the run.** ENGINE-12 put this "
      "spec on SPY and it lost $208 per $1,000 risked, negative in all fifteen "
      "years, because **the stop is the width of the opening five-minute candle "
      "and SPY's is a median 0.16 of a 14-day ATR against 0.72 on the stocks "
      "the strategy picks**. Large caps sit between the two, so the prediction "
      "was a narrower stop, a higher knock-out rate and a worse result. The "
      "stop-width table below is the first thing to read.")
    w("")
    for a in G.ARMS:
        ts = P["trades"][a]
        if not ts:
            continue
        s = summarise(ts, a)
        lo, hi = G.mean_ci95([t.net_r for t in ts])
        w(f"- **`{a}`** — {s.n:,} trades over {_days(ts):,} days. "
          f"**{_money(s.mean_r)} a trade** per $1,000 risked ({s.mean_r:+.4f}R); "
          f"median {_money(s.median_r)}; {s.hit_rate*100:.1f}% green; "
          f"{_stop_share(ts)*100:.1f}% stopped. 95% range {_money(lo)} to "
          f"{_money(hi)}"
          f"{', which contains zero' if lo <= 0 <= hi else ', which excludes zero'}.")
    w("")
    for nm, d in (("`us500_top10` minus the incumbent (primary)", vs_inc),
                  ("`us500_top10` minus its own coin flip (primary)", vs_flip),
                  ("`us500_top10` minus the incumbent (confirmation)", vs_inc_c)):
        m, (lo, hi) = _mean(d), G.mean_ci95(d)
        blo, bhi = G.mean_ci(d, G.Z_BONFERRONI)
        w(f"- **{nm}**, paired by day: **{_money(m)}** a trade ({m:+.4f}R), 95% "
          f"{_money(lo)} to {_money(hi)} over {len(d):,} days. "
          + ("**Entirely below zero — it measurably LOST.**" if hi < 0 else
             "**Entirely above zero — it measurably won.**" if lo > 0 else
             "Contains zero, so nothing is established.")
          + f" Corrected for three shots: {_money(blo)} to {_money(bhi)}.")
    w("")
    w(f"- **Verdict**: **{verdict}**.")
    w("")
    w("**Which gates carried the verdict, in words.** "
      + " ".join(f"{g.id} {'passed' if g.passed else 'FAILED'} ({g.name})."
                 for g in rows_g))
    w("")
    w("## Realised stop width — the pre-registered mechanism, read first")
    w("")
    w("| arm | trades | median stop | % of price | **in 14-day ATRs** | **stopped out** |")
    w("|---|---|---|---|---|---|")
    for a in G.ARMS:
        ts = P["trades"][a]
        if not ts:
            continue
        c, pct, atr, ko = _stopstats(ts)
        w(f"| `{a}` | {len(ts):,} | {c*100:.0f}¢ | {pct*100:.2f}% | "
          f"**{atr:.2f}** | **{ko*100:.1f}%** |")
    w(f"| *ENGINE-12 reference: SPY* | — | — | — | *{G.SPY_ATR_STOP:.2f}* | "
      f"*{G.SPY_KNOCKOUT*100:.1f}%* |")
    w(f"| *ENGINE-12 reference: stocks in play* | — | — | — | "
      f"*{G.SIP_ATR_STOP:.2f}* | *{G.SIP_KNOCKOUT*100:.1f}%* |")
    w("")
    w("## The pre-registered bar, and what it read")
    w("")
    w("| id | gate | threshold | observed | |")
    w("|---|---|---|---|---|")
    for g in rows_g:
        w(f"| **{g.id}** | {g.name} | {g.threshold} | {g.observed} | "
          f"{'PASS' if g.passed else '**FAIL**'} |")
    w("")
    for label in ("primary", "confirmation"):
        R = results[label]
        w(f"## The {label} window, {R['window'][0]} → {R['window'][1]} "
          f"(`{R['snapshot']}`)")
        w("")
        w("| arm | trades | days | gross R | net R | median | money per $1,000 "
          "| 95% range | hit | stopped |")
        w("|---|---|---|---|---|---|---|---|---|---|")
        for a in G.ARMS:
            ts = R["trades"][a]
            if not ts:
                continue
            s = summarise(ts, a)
            lo, hi = G.mean_ci95([t.net_r for t in ts])
            w(f"| `{a}` | {s.n:,} | {_days(ts):,} | "
              f"{_mean([t.gross_r for t in ts]):+.4f} | {s.mean_r:+.4f} | "
              f"{s.median_r:+.4f} | {_money(s.mean_r)} | {_money(lo)} to "
              f"{_money(hi)} | {s.hit_rate*100:.1f}% | "
              f"{_stop_share(ts)*100:.1f}% |")
        w("")
    w("## Universe change or count change? — what `us500_top20` separates")
    w("")
    t10, t20, inc = (P["trades"][G.TOP10], P["trades"][G.TOP20],
                     P["trades"][G.INCUMBENT])
    d_univ = _paired_by_day(t20, inc)
    d_cnt = _paired_by_day(t10, t20)
    for nm, d in (("universe change alone (`us500_top20` minus incumbent)", d_univ),
                  ("count change alone (`us500_top10` minus `us500_top20`)", d_cnt)):
        m, (lo, hi) = _mean(d), G.mean_ci95(d)
        w(f"- **{nm}**: {_money(m)} a trade, 95% {_money(lo)} to {_money(hi)}, "
          f"{len(d):,} days.")
    w("")
    w(f"The two add to {_money(_mean(d_univ) + _mean(d_cnt))} against the "
      f"{_money(_mean(vs_inc))} measured directly (they differ because each is "
      f"paired on a different set of shared days). **The larger of the two is "
      f"where the difference comes from** — "
      + ("the UNIVERSE change." if abs(_mean(d_univ)) > abs(_mean(d_cnt))
         else "the COUNT change.")
      + " ENGINE-7 already found that ranking more finely within the top twenty "
        "bought nothing, so a large count effect here would contradict it and a "
        "small one confirms it.")
    w("")
    w("## What the narrowed universe actually selects")
    w("")
    inc_keys = {(t.symbol, int(t.day)) for t in inc}
    t10_keys = {(t.symbol, int(t.day)) for t in t10}
    ov = len(inc_keys & t10_keys)
    w(f"- **Overlap with the incumbent's picks**: {ov:,} of {len(t10_keys):,} "
      f"`us500_top10` symbol-days ({ov/max(len(t10_keys),1)*100:.1f}%) were also "
      f"selected by the incumbent. "
      + ("**The two arms are largely trading the same names, so the comparison "
         "is weaker than its interval suggests.**" if ov / max(len(t10_keys), 1) > 0.6
         else "The arms pick substantially different names."))
    for a in (G.INCUMBENT, G.TOP10):
        ts = P["trades"][a]
        px = np.array([t.fill_price for t in ts])
        atr = np.array([float(t.meta.get("atr14", np.nan)) for t in ts])
        top = Counter(t.symbol for t in ts).most_common(10)
        w(f"- **`{a}`** — median price ${np.median(px):.2f}, median 14-day ATR "
          f"${np.nanmedian(atr):.2f}. Most-selected: "
          + ", ".join(f"{s}({n})" for s, n in top) + ".")
    w("")
    w("## Caveats, and what would change the answer")
    w("")
    w("- **It is a liquidity proxy, not the S&P 500.** Stated above; it matters "
      "for how the result generalises to an index-constrained mandate.")
    w("- **Eighth reading of the primary window.** No correction applied because "
      "none exists.")
    w("- **The confirmation window is weak out-of-sample evidence**, not a clean "
      "hold-out: it was read once by ENGINE-15, and it is an older market whose "
      "spreads, venue mix and retail flow are not those of 2026.")
    w(f"- **{P['missing']:,} primary and {C['missing']:,} confirmation "
      f"symbol-days had no cached minute bars** and were skipped by every arm "
      f"equally.")
    w("- Fills are modelled from one-minute OHLC and cannot see inside a bar. No "
      "live-execution question has been touched.")
    w("- **No leveraged portfolio figure appears anywhere**, by pre-registration.")
    w("")
    REPORT.parent.mkdir(parents=True, exist_ok=True)
    REPORT.write_text("\n".join(L) + "\n")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--stage", required=True,
                    choices=["plan", "fetch", "run"])
    a = ap.parse_args()
    {"plan": stage_plan, "fetch": stage_fetch, "run": stage_run}[a.stage]()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
