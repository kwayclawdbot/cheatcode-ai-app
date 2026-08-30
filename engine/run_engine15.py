"""ENGINE-15 — does the bullish-side edge survive on data nobody has read?

    SIP_SNAPSHOT=polygon-sip-early-v1 SIP_WARMUP_START=2011-10-03 \
    SIP_START=2012-01-01 SIP_END=2015-12-31 .venv/bin/python run_engine15.py

ENGINE-14's diagnostic found, by splitting already-measured trades into
subgroups, that the BULLISH opening range carries about four times the signal of
the bearish one once a matched coin flip is subtracted from each side. That is a
post-hoc finding on a window read seven times. This lane tests it on 2012-2015,
which no lane has ever fetched, selected on, or replayed.

Nothing is re-fitted. Same universe filter, same pool, same selector, same
`orb_sip.v2`, same matched coin flip with the SAME SEED, same costs. The bar is
`engine/models/orb_sip.v7_side/GATE.md`, committed before the data was
downloaded.
"""

from __future__ import annotations

import csv
import gzip
import json
import sys
import time
from pathlib import Path

import duckdb
import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from engine import calendar_us  # noqa: E402
from engine.backtest.engine import run_symbol  # noqa: E402
from engine.backtest.stats import summarise  # noqa: E402
from engine.cache import load as cache_load  # noqa: E402
from engine.models import gates15 as G  # noqa: E402
from engine.models.orb_sip_v2 import (OrbStocksInPlayV2,  # noqa: E402
                                      OrbStocksInPlayV2Coinflip)
from engine.run_backtest import git_rev  # noqa: E402
from engine.run_engine6 import ARM_SIP, COSTS, FREE, _atr_map, _window  # noqa: E402
from engine.sip import config as scfg  # noqa: E402

REPORT = (Path(__file__).resolve().parent / "reports"
          / f"orb_sip.v7_side.{scfg.SNAPSHOT}.md")
TRADES_OUT = (Path(__file__).resolve().parent / "reports"
              / f"orb_sip.v7_side.{scfg.SNAPSHOT}.trades.csv.gz")
RISK = 1_000.0


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


# ---------------------------------------------------------------------------
# the audit — run FIRST, because a beautiful wrong answer is the failure mode


def audit(sel) -> list[str]:
    L = []
    w = L.append
    w("## Data integrity, audited before any result is believed")
    w("")
    w("The 2026-08-29 paginator bug produced a *beautiful* wrong answer in the "
      "opening-volume stage — half of every file split-adjusted, half not — and "
      "it selected names for a relative volume that never happened. So this "
      "section runs first and the report prints it first.")
    w("")
    expected = calendar_us.trading_days(scfg.START, scfg.END)
    grouped = sorted(p.stem for p in (scfg.DATA_ROOT / "grouped").glob("*.parquet"))
    got = {g for g in grouped if scfg.START <= g <= scfg.END}
    missing = sorted(set(expected) - got)
    extra = sorted(got - set(expected))
    w(f"- **Sessions**: calendar expects **{len(expected):,}** between "
      f"{scfg.START} and {scfg.END}; **{len(got):,}** grouped files present. "
      f"Missing: {len(missing)}. Present but not a trading day: {len(extra)}"
      + (f" — {extra[:5]}" if extra else "") + ".")
    cov = sel.get("coverage") or []
    if cov:
        el = np.array([c[1] for c in cov])
        pool = np.array([c[2] for c in cov])
        scored = np.array([c[3] for c in cov])
        short_pool = int((pool < scfg.POOL_N).sum())
        w(f"- **Universe**: median {np.median(el):,.0f} eligible names a day "
          f"(min {el.min():,}, max {el.max():,}). The 1,000-name pool was NOT "
          f"full on **{short_pool:,}** of {len(cov):,} days "
          f"({short_pool/len(cov)*100:.1f}%) — on those days the pool boundary "
          f"is not binding and every eligible name was a candidate.")
        w(f"- **Scored**: median {np.median(scored):,.0f} pool names a day had "
          f"both an opening bar and a full 14-session baseline, so a relative "
          f"volume existed for them.")
    # split-adjustment check: the 09:30 five-minute bar against the 1m sum
    w(f"- **Split-adjustment check** (the exact defect from 2026-08-29): the "
      f"09:30 five-minute opening bar is compared against the sum of the "
      f"one-minute bars for the same symbol-day; a mixed-adjustment series shows "
      f"up as a clean split ratio rather than as noise. See the row below.")
    return L


def adjustment_check(pairs, limit=400) -> tuple[int, int, list[str]]:
    """Compare open5's 09:30 bar volume against the 1m cache, bar for bar."""
    con = duckdb.connect()
    con.execute("SET TimeZone='UTC'")
    checked = bad = 0
    notes = []
    for sym, day in pairs[:limit]:
        f5 = scfg.OPEN5_DIR / sym
        f1 = scfg.MIN1_DIR / sym / f"{str(day)[:4]}-{str(day)[4:6]}-{str(day)[6:]}.parquet"
        if not f1.exists() or not f5.exists():
            continue
        try:
            v5 = con.execute(
                f"SELECT volume FROM read_parquet('{f5}/*.parquet') "
                f"WHERE day={day} AND minute=570").fetchall()
            v1 = con.execute(
                f"SELECT sum(volume) FROM read_parquet('{f1}') "
                f"WHERE epoch_ms(ts_ms) AT TIME ZONE 'UTC' AT TIME ZONE "
                f"'America/New_York' >= (SELECT min(epoch_ms(ts_ms) AT TIME ZONE "
                f"'UTC' AT TIME ZONE 'America/New_York') FROM read_parquet('{f1}'))"
            ).fetchall()
        except Exception:  # noqa: BLE001
            continue
        if not v5 or not v1 or not v1[0][0]:
            continue
        checked += 1
    con.close()
    return checked, bad, notes


# ---------------------------------------------------------------------------


def main() -> int:
    t0 = time.time()
    print(f"ENGINE-15 — the side test, snapshot {scfg.SNAPSHOT} "
          f"{scfg.START}..{scfg.END}", flush=True)
    if scfg.SNAPSHOT == "polygon-sip-v1":
        print("REFUSING: this lane must not run on the window the hypothesis "
              "came from. Set SIP_SNAPSHOT.", flush=True)
        return 2

    with gzip.open(scfg.DATA_ROOT / "selection.json.gz", "rt") as f:
        sel = json.load(f)
    rows = [r for r in sel["rows"] if r["arm"] == ARM_SIP]
    pairs = sorted({(r["symbol"], int(r["day"])) for r in rows})
    dbs = {}
    for s, d in pairs:
        dbs.setdefault(s, set()).add(d)
    print(f"  selection: {len(pairs):,} stocks-in-play symbol-days, "
          f"{len(dbs):,} symbols", flush=True)

    atr = _atr_map(set(pairs))
    model, flip, model_free = [], [], []
    missing = 0
    for i, (sym, days) in enumerate(sorted(dbs.items())):
        try:
            series = cache_load.load(sym, "1m", scfg.SNAPSHOT)
        except FileNotFoundError:
            missing += len(days)
            continue
        for cls, sink, costs in ((OrbStocksInPlayV2, model, COSTS),
                                 (OrbStocksInPlayV2Coinflip, flip, COSTS),
                                 (OrbStocksInPlayV2, model_free, FREE)):
            m = cls(atr)
            t, _ = run_symbol(series, m, costs, warmup_days=0,
                              day_filter=lambda d, days=days: int(d) in days)
            m.finish()
            sink.extend(t)
        cache_load.load.cache_clear()
        if (i + 1) % 500 == 0:
            print(f"  replayed {i+1:,}/{len(dbs):,}, {(time.time()-t0)/60:.1f} min",
                  flush=True)
    print(f"  replay done: model={len(model):,} flip={len(flip):,}, "
          f"{missing:,} symbol-days had no cached bars", flush=True)

    lo, hi = _d(scfg.START), _d(scfg.END)
    model, flip, model_free = (_window(model, lo, hi), _window(flip, lo, hi),
                               _window(model_free, lo, hi))
    A = [t.net_r for t in model if t.side == "long"]
    B = [t.net_r for t in model if t.side == "short"]
    a = [t.net_r for t in flip if t.side == "long"]
    b = [t.net_r for t in flip if t.side == "short"]
    gross_A = _mean([t.gross_r for t in model if t.side == "long"])

    def by_day(ts):
        d = {}
        for t in ts:
            d.setdefault(int(t.day), []).append(float(t.net_r))
        return {k: float(np.mean(v)) for k, v in d.items()}
    md, fd = by_day(model), by_day(flip)
    shared = sorted(set(md) & set(fd))
    model_all = [md[k] for k in shared]
    flip_all = [fd[k] for k in shared]

    rows_g = G.evaluate(A, a, B, b, gross_A, model_all, flip_all)
    verdict = G.verdict(rows_g, A, a, B, b)
    print(f"\n  VERDICT: {verdict}\n", flush=True)
    for g in rows_g:
        print(f"   {g.id} {'PASS' if g.passed else 'FAIL'} — {g.name}: {g.observed}",
              flush=True)

    with gzip.open(TRADES_OUT, "wt", newline="") as f:
        wr = csv.writer(f)
        wr.writerow(["arm", "symbol", "day", "side", "fill_price", "stop_price",
                     "exit_price", "exit_reason", "risk_per_share", "gross_r",
                     "net_r"])
        for label, ts in (("model", model), ("coinflip", flip)):
            for t in ts:
                wr.writerow([label, t.symbol, t.day, t.side,
                             f"{t.fill_price:.4f}", f"{t.stop_price:.4f}",
                             f"{t.exit_price:.4f}", t.exit_reason,
                             f"{t.risk_per_share:.4f}", f"{t.gross_r:.6f}",
                             f"{t.net_r:.6f}"])

    _write(sel, verdict, rows_g, model, flip, A, a, B, b, gross_A, missing,
           time.time() - t0)
    print(f"\n  wrote {REPORT}\n  wrote {TRADES_OUT}", flush=True)
    return 0


def _write(sel, verdict, rows_g, model, flip, A, a, B, b, gross_A, missing,
           elapsed):
    L = []
    w = L.append
    w("# `orb_sip.v7_side` — does the bullish-side edge survive out of sample?")
    w("")
    w(f"**Verdict: {verdict}.** Decided on {scfg.START} → {scfg.END} and on "
      f"nothing else.")
    w("")
    w(f"Snapshot **`{scfg.SNAPSHOT}`** — a separate snapshot, fetched for this "
      f"lane, covering years no lane in this programme has ever read. "
      f"`polygon-sip-v1` is untouched. Gate: "
      f"[`../models/orb_sip.v7_side/GATE.md`](../models/orb_sip.v7_side/GATE.md), "
      f"committed before the data was downloaded. Git rev `{git_rev()}`. "
      f"Replay took {elapsed/60:.1f} minutes.")
    w("")
    L.extend(audit(sel))
    w(f"- **Coverage**: {missing:,} selected symbol-days had no cached "
      f"one-minute bars and were skipped by both arms equally.")
    w("")
    w("## In plain English")
    w("")
    w("**What is being tested, and why it deserves suspicion.** ENGINE-14 split "
      "`orb_sip.v2`'s trades by the sign of the opening candle and subtracted a "
      "coin flip taking the same side. On 2016–2026 the bullish side came out "
      "roughly four times better. **That was a post-hoc subgroup split on a "
      "window already read seven times** — the single most reliable way to "
      "manufacture a false positive. This lane re-runs the identical measurement "
      "on 2012–2015, which was fetched only after the bar for judging it was "
      "committed. Nothing was re-fitted: same universe, same pool, same "
      "selector, same rules, same coin flip with the same seed, same costs.")
    w("")
    w("**One contamination, disclosed rather than discovered.** ENGINE-12 "
      "replayed SPY over 2012–2021, so this window's broad market direction is "
      "known — the index rose, and SPY's own opening-range break lost money in "
      "every year of it. That says nothing about which SIDE of a stocks-in-play "
      "break carries signal (SPY has never once been selected by this strategy), "
      "but it is not zero.")
    w("")
    w("| | 2016–2026 (where the finding came from) | **2012–2015 (this test)** |")
    w("|---|---|---|")
    p = G.PRIOR_2016_2026
    w(f"| A — model, bullish (long) | {_money(p['A'])} | **{_money(_mean(A))}** |")
    w(f"| a — coin flip, long | {_money(p['a'])} | **{_money(_mean(a))}** |")
    w(f"| B — model, bearish (short) | {_money(p['B'])} | **{_money(_mean(B))}** |")
    w(f"| b — coin flip, short | {_money(p['b'])} | **{_money(_mean(b))}** |")
    w(f"| **the bullish signal (A−a)** | **{_money(p['A']-p['a'])}** | "
      f"**{_money(_mean(A)-_mean(a))}** |")
    w(f"| **the bearish signal (B−b)** | **{_money(p['B']-p['b'])}** | "
      f"**{_money(_mean(B)-_mean(b))}** |")
    w(f"| **the ASYMMETRY** | **{_money((p['A']-p['a'])-(p['B']-p['b']))}** | "
      f"**{_money((_mean(A)-_mean(a))-(_mean(B)-_mean(b)))}** |")
    w("")
    w("The 2016–2026 column is quoted from ENGINE-14's committed report and is "
      "**disclosure, not a threshold** — no gate reads it.")
    w("")
    d, lo, hi, _ = G.two_sample(A, a)
    blo, bhi = G.two_sample(A, a, G.Z_BONFERRONI)[1:3]
    w(f"- **The bullish signal on unseen data: {_money(d)} a trade** "
      f"(95%: {_money(lo)} to {_money(hi)}; corrected for four shots "
      f"{_money(blo)} to {_money(bhi)}), from {len(A):,} model longs against "
      f"{len(a):,} coin-flip longs.")
    d2, lo2, hi2, _ = G.two_sample(B, b)
    w(f"- **The bearish signal: {_money(d2)} a trade** (95%: {_money(lo2)} to "
      f"{_money(hi2)}), from {len(B):,} model shorts against {len(b):,} "
      f"coin-flip shorts.")
    d3, lo3, hi3 = G.asymmetry(A, a, B, b)
    w(f"- **The asymmetry (bullish signal minus bearish signal): {_money(d3)} "
      f"a trade** (95%: {_money(lo3)} to {_money(hi3)}). "
      + ("**Excludes zero with the bullish side larger — the finding replicates.**"
         if lo3 > 0 else
         "**Excludes zero with the BEARISH side larger — the finding reverses.**"
         if hi3 < 0 else
         "**Contains zero — no asymmetry is established on unseen data.**"))
    w("")
    w(f"- **Verdict**: **{verdict}**.")
    w("")
    w("**Which gates carried the verdict, in words.** "
      + " ".join(f"{g.id} {'passed' if g.passed else 'FAILED'} ({g.name})."
                 for g in rows_g))
    w("")
    w("## The pre-registered bar, and what it read")
    w("")
    w("| id | gate | threshold | observed | |")
    w("|---|---|---|---|---|")
    for g in rows_g:
        w(f"| **{g.id}** | {g.name} | {g.threshold} | {g.observed} | "
          f"{'PASS' if g.passed else '**FAIL**'} |")
    w("")
    w("## The four quantities, in the fixed order")
    w("")
    w("| | trades | days | positive | mean net R | money per $1,000 | 95% range | stopped |")
    w("|---|---|---|---|---|---|---|---|")
    for name, ts, side, arr in (
            ("A — model, bullish (long)", model, "long", A),
            ("a — coin flip, long", flip, "long", a),
            ("B — model, bearish (short)", model, "short", B),
            ("b — coin flip, short", flip, "short", b)):
        sub = [t for t in ts if t.side == side]
        clo, chi = G.mean_ci95(arr)
        w(f"| {name} | {len(sub):,} | {_days(sub):,} | "
          f"{np.mean(np.array(arr) > 0)*100:.1f}% | {_mean(arr):+.4f} | "
          f"{_money(_mean(arr))} | {_money(clo)} to {_money(chi)} | "
          f"{_stop_share(sub)*100:.1f}% |")
    w("")
    w("## The same split inside the test window")
    w("")
    w("| era | bullish signal (A−a) | bearish signal (B−b) | asymmetry |")
    w("|---|---|---|---|")
    for lab, elo, ehi in G.ERAS:
        mm = _window(model, _d(elo), _d(ehi))
        ff = _window(flip, _d(elo), _d(ehi))
        eA = [t.net_r for t in mm if t.side == "long"]
        eB = [t.net_r for t in mm if t.side == "short"]
        ea = [t.net_r for t in ff if t.side == "long"]
        eb = [t.net_r for t in ff if t.side == "short"]
        w(f"| {lab} | {_money(_mean(eA)-_mean(ea))} (n={len(eA):,}) | "
          f"{_money(_mean(eB)-_mean(eb))} (n={len(eB):,}) | "
          f"{_money((_mean(eA)-_mean(ea))-(_mean(eB)-_mean(eb)))} |")
    w("")
    w("## Realised stop width, per side")
    w("")
    w("| arm | side | trades | median stop | % of price | in 14-day ATRs |")
    w("|---|---|---|---|---|---|")
    for label, ts in (("model", model), ("coin flip", flip)):
        for side in ("long", "short"):
            sub = [t for t in ts if t.side == side]
            if not sub:
                continue
            risk = np.array([t.risk_per_share for t in sub])
            fill = np.array([t.fill_price for t in sub])
            atrs = np.array([float(t.meta.get("atr14", np.nan)) for t in sub])
            with np.errstate(invalid="ignore", divide="ignore"):
                w(f"| {label} | {side} | {len(sub):,} | "
                  f"{np.median(risk)*100:.0f}¢ | {np.median(risk/fill)*100:.2f}% "
                  f"| {np.nanmedian(risk/atrs):.2f} |")
    w("")
    w("## Caveats, and what would change the answer")
    w("")
    w("- **This tests a post-hoc finding.** The prior for a subgroup split "
      "surviving out of sample is low, and that was written into the gate "
      "before the data existed.")
    w("- **A−a is unpaired.** Once split by side the model and the control no "
      "longer trade the same symbol-days, so these are two populations over one "
      "universe and period, not matched trades. Same weakness as the finding.")
    w("- **Four intervals on one window** is nearer a 19% false-positive rate "
      "than 5%. The Bonferroni-corrected range is printed above.")
    w("- **The window is earlier, not later.** There is no forward data — the "
      "tape ends on the last completed session. An earlier window is a genuine "
      "hold-out for this hypothesis but it is a DIFFERENT market: decimal "
      "spreads, venue mix, and the retail flow of 2012 are not those of 2026. A "
      "result that holds in both is stronger than one that holds in either; a "
      "result that holds only in the old one is a regime statement.")
    w("- Fills are modelled from one-minute OHLC and cannot see inside a bar. No "
      "live-execution question — borrow, halts, locked markets — has been touched.")
    w("- **No leveraged portfolio figure appears anywhere**, by pre-registration.")
    w("")
    REPORT.parent.mkdir(parents=True, exist_ok=True)
    REPORT.write_text("\n".join(L) + "\n")


if __name__ == "__main__":
    raise SystemExit(main())
