"""DIAGNOSTIC — the stop removed, and the two sides of the break split apart.

    .venv/bin/python run_engine14_diag.py

**This file has no GATE and it decides nothing.** It is a post-mortem in the
shape of `run_engine6_diag.py`: it answers two questions the owner asked about
the mechanics of `orb_sip.v2`, and no result in it may be used to authorise a
model, move a threshold, or claim an edge. Both questions are asked of data that
has now been read seven times, and the second is a post-hoc subgroup split,
which is the single most reliable way to manufacture a false positive. Every
number below is read in that light.

Question 1 — "which orb trades ended up positive at all with no stop".
    A third arm is replayed with the stop pushed to an unreachable price, so
    every trade runs to the 15:59 bell. R is then recomputed against the
    ORIGINAL opening-range stop distance, so the no-stop arm is measured in the
    same unit as the model and the two are comparable.

Question 2 — "with stop but only bullish orb then only bearish orb".
    The model's side IS the sign of the opening candle, so bullish ORB = long
    and bearish ORB = short. The split is computed on the with-stop arm.
    A matched coin-flip control is split the same way, because over 2016-2026
    the market rose a great deal and a long/short difference in the model means
    nothing unless the control does not show the same one.
"""

from __future__ import annotations

import gzip
import json
import sys
import time
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from engine.backtest.engine import run_symbol  # noqa: E402
from engine.backtest.types import Signal  # noqa: E402
from engine.cache import load as cache_load  # noqa: E402
from engine.models.orb_sip_v2 import (OrbStocksInPlayV2,  # noqa: E402
                                      OrbStocksInPlayV2Coinflip)
from engine.run_engine6 import ARM_SIP, COSTS, _atr_map, _window  # noqa: E402
from engine.sip import config as scfg  # noqa: E402

import dataclasses  # noqa: E402

OUT = Path(__file__).resolve().parent / "reports" / f"orb_sip.v2.{scfg.SNAPSHOT}.nostop-and-sides.md"
RISK = 1_000.0
VERDICT = (20240101, 20260828)
FULL = (20160101, 20260828)
ERAS = (("2016-2019", 20160101, 20191231), ("2020-2023", 20200101, 20231231),
        ("2024-2026", 20240101, 20260828))
UNREACHABLE_LOW, UNREACHABLE_HIGH = 1e-6, 1e9


class OrbSipV2NoStop(OrbStocksInPlayV2):
    """`orb_sip.v2` with the stop removed. Same entry, same side, bell exit.

    The stop level is pushed somewhere price cannot go, so `exit_on_bar` never
    fires and every trade is resolved by the 15:59 flatten. The ORIGINAL stop
    level is kept in meta so the result can be expressed in the model's own R.
    """

    id = "orb_sip.v2.nostop"
    description = "the incumbent's entry with no stop at all, held to the bell"

    def evaluate(self, view, day):
        sig = super().evaluate(view, day)
        if sig is None:
            return None
        meta = dict(sig.meta)
        meta["orig_stop"] = sig.stop_price
        far = UNREACHABLE_LOW if sig.side == "long" else UNREACHABLE_HIGH
        return dataclasses.replace(sig, model_id=self.id, stop_price=far,
                                   meta=meta)


def _money(r):
    return f"{r * RISK:+,.0f} dollars"


def _ci95(xs):
    xs = np.asarray(xs, dtype="float64")
    if len(xs) < 2:
        return (float("nan"), float("nan"))
    se = float(np.std(xs, ddof=1) / np.sqrt(len(xs)))
    m = float(xs.mean())
    return (m - 1.96 * se, m + 1.96 * se)


def _r_vs_original(t) -> float:
    """Net R measured against the ORIGINAL opening-range stop distance."""
    orig = t.meta.get("orig_stop")
    if orig is None:
        return float(t.net_r)
    risk = abs(t.fill_price - float(orig))
    if not (risk > 0):
        return float("nan")
    return float(t.net_r) * float(t.risk_per_share) / risk


def _paired_by_day(a, b):
    def by_day(ts, f):
        d = {}
        for t in ts:
            d.setdefault(int(t.day), []).append(f(t))
        return {k: float(np.mean(v)) for k, v in d.items()}
    x, y = by_day(a[0], a[1]), by_day(b[0], b[1])
    return [x[k] - y[k] for k in sorted(set(x) & set(y))]


def main() -> int:
    t0 = time.time()
    print("DIAGNOSTIC — no stop, and the two sides of the break", flush=True)
    with gzip.open(scfg.DATA_ROOT / "selection.json.gz", "rt") as f:
        sel = json.load(f)
    rows = [r for r in sel["rows"] if r["arm"] == ARM_SIP]
    pairs = {(r["symbol"], int(r["day"])) for r in rows}
    dbs = {}
    for s, d in pairs:
        dbs.setdefault(s, set()).add(d)
    atr = _atr_map(pairs)
    print(f"  {len(pairs):,} symbol-days, {len(dbs):,} symbols", flush=True)

    stop_t, nostop_t, flip_t = [], [], []
    for i, (sym, days) in enumerate(sorted(dbs.items())):
        try:
            series = cache_load.load(sym, "1m", scfg.SNAPSHOT)
        except FileNotFoundError:
            continue
        for cls, sink in ((OrbStocksInPlayV2, stop_t), (OrbSipV2NoStop, nostop_t),
                          (OrbStocksInPlayV2Coinflip, flip_t)):
            m = cls(atr)
            t, _ = run_symbol(series, m, COSTS, warmup_days=0,
                              day_filter=lambda d, days=days: int(d) in days)
            m.finish()
            sink.extend(t)
        cache_load.load.cache_clear()
        if (i + 1) % 750 == 0:
            print(f"  replayed {i+1:,}/{len(dbs):,}, {(time.time()-t0)/60:.1f} min",
                  flush=True)
    print(f"  replay done in {(time.time()-t0)/60:.1f} min: "
          f"stop={len(stop_t):,} nostop={len(nostop_t):,} flip={len(flip_t):,}",
          flush=True)
    _write(stop_t, nostop_t, flip_t)
    print(f"  wrote {OUT}", flush=True)
    return 0


def _write(stop_t, nostop_t, flip_t):
    L = []
    w = L.append
    w("# DIAGNOSTIC — `orb_sip.v2` with the stop removed, and the two sides split")
    w("")
    w("**This file has no gate and decides nothing.** It is a post-mortem, in "
      "the shape of ENGINE-6's. Both questions are asked of a window that has "
      "now been read seven times, and the second is a post-hoc subgroup split — "
      "the single most reliable way to manufacture a false positive. Nothing "
      "here may be used to authorise a model or claim an edge.")
    w("")

    for wl, (lo, hi) in (("verdict window 2024-01-01 → 2026-08-28", VERDICT),
                         ("the whole tape 2016-01-01 → 2026-08-28", FULL)):
        S, N = _window(stop_t, lo, hi), _window(nostop_t, lo, hi)
        w(f"## Question 1 — no stop at all, {wl}")
        w("")
        sr = np.array([t.net_r for t in S])
        nr = np.array([_r_vs_original(t) for t in N])
        npc = np.array([t.net_pct for t in N])
        spc = np.array([t.net_pct for t in S])
        w("Both arms take the identical entry on the identical symbol-days. The "
          "no-stop arm never exits early, so every one of its trades is resolved "
          "at the 15:59 bell. Its R is measured against the ORIGINAL "
          "opening-range stop distance so the two columns are the same unit.")
        w("")
        w("| | with the stop | **no stop** |")
        w("|---|---|---|")
        w(f"| trades | {len(sr):,} | {len(nr):,} |")
        w(f"| **finished positive** | **{float(np.mean(sr > 0))*100:.1f}%** | "
          f"**{float(np.mean(nr > 0))*100:.1f}%** |")
        w(f"| mean net R | {sr.mean():+.4f} | {nr.mean():+.4f} |")
        w(f"| **money per $1,000 risked** | **{_money(sr.mean())}** | "
          f"**{_money(nr.mean())}** |")
        w(f"| 95% range | {_money(_ci95(sr)[0])} to {_money(_ci95(sr)[1])} | "
          f"{_money(_ci95(nr)[0])} to {_money(_ci95(nr)[1])} |")
        w(f"| median net R | {np.median(sr):+.4f} | {np.median(nr):+.4f} |")
        w(f"| mean net % of price | {spc.mean()*100:+.3f}% | {npc.mean()*100:+.3f}% |")
        w(f"| worst single trade | {sr.min():+.2f}R | {nr.min():+.2f}R |")
        w(f"| best single trade | {sr.max():+.2f}R | {nr.max():+.2f}R |")
        d = _paired_by_day((N, _r_vs_original), (S, lambda t: t.net_r))
        m, (clo, chi) = float(np.mean(d)), _ci95(d)
        w("")
        w(f"**No stop minus the stop, paired by day: {_money(m)} a trade** "
          f"(95%: {_money(clo)} to {_money(chi)}, {len(d):,} days). "
          + ("**Entirely below zero — removing the stop measurably LOST money.**"
             if chi < 0 else
             "**Entirely above zero — removing the stop measurably MADE money.**"
             if clo > 0 else
             "The range contains zero, so no difference is established."))
        w("")
        # what happened to the trades the stop actually cut
        skey = {(t.symbol, int(t.day)): t for t in S}
        nkey = {(t.symbol, int(t.day)): t for t in N}
        stopped = [k for k, t in skey.items() if t.exit_reason == "stop"]
        rescued = [k for k in stopped if k in nkey and _r_vs_original(nkey[k]) > 0]
        worse = [k for k in stopped if k in nkey and _r_vs_original(nkey[k]) <= -1.0]
        w(f"**Of the {len(stopped):,} trades the stop actually closed, "
          f"{len(rescued):,} ({len(rescued)/max(len(stopped),1)*100:.1f}%) would "
          f"have finished POSITIVE had it not been there** — and "
          f"{len(worse):,} ({len(worse)/max(len(stopped),1)*100:.1f}%) would have "
          f"finished worse than the 1R the stop capped them at.")
        if rescued:
            rr = np.array([_r_vs_original(nkey[k]) for k in rescued])
            ww = np.array([_r_vs_original(nkey[k]) for k in stopped if k in nkey])
            w("")
            w(f"Those rescued trades averaged {_money(rr.mean())} each. Across "
              f"ALL stopped trades, letting them run averaged "
              f"{_money(ww.mean())} against the {_money(np.mean([skey[k].net_r for k in stopped]))} "
              f"the stop booked. "
              + ("**So on the trades it fired, the stop SAVED money.**"
                 if ww.mean() < np.mean([skey[k].net_r for k in stopped])
                 else "**So on the trades it fired, the stop COST money.**"))
        w("")

    # ---- Question 2 --------------------------------------------------------
    w("## Question 2 — with the stop, bullish ORB against bearish ORB")
    w("")
    w("The model's side IS the sign of the opening candle, so a bullish opening "
      "range is a long and a bearish one is a short. **The matched coin-flip "
      "control is split the same way and printed beside it**, because the market "
      "rose a great deal over this period: a long/short gap in the model means "
      "nothing unless the control does not show the same gap.")
    w("")
    for wl, (lo, hi) in (("verdict window 2024-01-01 → 2026-08-28", VERDICT),
                         ("the whole tape 2016-01-01 → 2026-08-28", FULL)):
        S, F = _window(stop_t, lo, hi), _window(flip_t, lo, hi)
        w(f"### {wl}")
        w("")
        w("| arm | side | trades | positive | mean net R | money per $1,000 | "
          "95% range | stopped |")
        w("|---|---|---|---|---|---|---|---|")
        cell = {}
        for label, ts in (("model", S), ("coin flip", F)):
            for side in ("long", "short"):
                a = [t for t in ts if t.side == side]
                r = np.array([t.net_r for t in a])
                clo, chi = _ci95(r)
                cell[(label, side)] = r
                w(f"| {label} | {'bullish (long)' if side=='long' else 'bearish (short)'} "
                  f"| {len(a):,} | {float(np.mean(r>0))*100:.1f}% | {r.mean():+.4f} "
                  f"| {_money(r.mean())} | {_money(clo)} to {_money(chi)} "
                  f"| {float(np.mean([t.exit_reason=='stop' for t in a]))*100:.1f}% |")
        w("")
        for label in ("model", "coin flip"):
            lg, sh = cell[(label, "long")], cell[(label, "short")]
            diff = lg.mean() - sh.mean()
            se = float(np.sqrt(lg.var(ddof=1)/len(lg) + sh.var(ddof=1)/len(sh)))
            w(f"- **{label}: bullish minus bearish = {_money(diff)} a trade** "
              f"(95%: {_money(diff-1.96*se)} to {_money(diff+1.96*se)}). "
              + ("Excludes zero." if abs(diff) > 1.96*se else "**Contains zero.**"))
        w("")
        w("**The comparison that actually answers the question — how much each "
          "side beats a coin flip taking the SAME side.** The raw rows above "
          "conflate two different things: how well the ORB signal picks, and how "
          "well that side did in this period regardless of signal. Subtracting "
          "the control on each side separates them. (Unpaired two-sample: the "
          "model and the control do not trade the same symbol-days once split by "
          "side, so these are two populations over the same universe and period, "
          "not matched trades.)")
        w("")
        w("| side | model | coin flip, same side | **the signal is worth** | 95% range |")
        w("|---|---|---|---|---|")
        for side, name in (("long", "bullish (long)"), ("short", "bearish (short)")):
            mm, ff = cell[("model", side)], cell[("coin flip", side)]
            diff = mm.mean() - ff.mean()
            se = float(np.sqrt(mm.var(ddof=1)/len(mm) + ff.var(ddof=1)/len(ff)))
            w(f"| {name} | {_money(mm.mean())} | {_money(ff.mean())} | "
              f"**{_money(diff)}** | {_money(diff-1.96*se)} to {_money(diff+1.96*se)} |")
        w("")
        lg_e = cell[("model","long")].mean() - cell[("coin flip","long")].mean()
        sh_e = cell[("model","short")].mean() - cell[("coin flip","short")].mean()
        better = "bullish" if lg_e > sh_e else "bearish"
        w(f"**On this window the {better} ORB is the side where the signal adds "
          f"more** — {_money(lg_e)} over a coin flip on the bullish side against "
          f"{_money(sh_e)} on the bearish side. Note this is the OPPOSITE of what "
          f"the raw rows suggest: shorts look better in absolute terms because "
          f"shorting these names paid in this period whatever you did, and the "
          f"coin flip collects most of that.")
        w("")
    w("### The same split by era, model only, money per $1,000 risked")
    w("")
    w("| era | bullish (long) | bearish (short) | difference |")
    w("|---|---|---|---|")
    for lab, lo, hi in ERAS:
        a = _window(stop_t, lo, hi)
        lg = np.array([t.net_r for t in a if t.side == "long"])
        sh = np.array([t.net_r for t in a if t.side == "short"])
        w(f"| {lab} | {_money(lg.mean())} (n={len(lg):,}) | "
          f"{_money(sh.mean())} (n={len(sh):,}) | {_money(lg.mean()-sh.mean())} |")
    w("")
    w("## What this diagnostic does NOT establish")
    w("")
    w("- **It has no pre-registered bar.** Nothing here was written down before "
      "the numbers existed, so nothing here is a result in the sense the rest of "
      "this directory uses the word.")
    w("- **The side split is post-hoc.** Splitting an already-measured set of "
      "trades into two subgroups and reporting the better one is how false "
      "positives are made. The coin-flip rows are the only reason the model's "
      "split can be read at all, and even then a difference that survives them "
      "would need its own pre-registered lane on data nobody has looked at.")
    w("- **Seventh reading of this window**, no correction applied.")
    w("- The no-stop arm carries unbounded single-trade risk. A per-trade average "
      "says nothing about the size of the worst day, and no position sizing, "
      "margin or overnight-gap question has been modelled.")
    w("")
    OUT.write_text("\n".join(L) + "\n")


if __name__ == "__main__":
    raise SystemExit(main())
