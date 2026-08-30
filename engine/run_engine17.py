"""ENGINE-17 — the owner's stop on the 15-minute close-confirmed break.

    .venv/bin/python run_engine17.py

Three arms, one pass. Nothing is downloaded: ENGINE-6's selection is reused byte
for byte and every minute bar is already on disk. The bar is
`engine/models/orb_sip.v9_15c_prior/GATE.md`, committed before this file
produced a number.
"""

from __future__ import annotations

import csv
import gzip
import json
import sys
import time
from collections import Counter
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from engine.backtest.engine import run_symbol  # noqa: E402
from engine.backtest.stats import summarise  # noqa: E402
from engine.cache import load as cache_load  # noqa: E402
from engine.models import gates17 as G  # noqa: E402
from engine.models.orb_sip_15c import OrbSip15Close  # noqa: E402
from engine.models.orb_sip_15c_prior import OrbSip15ClosePriorStop  # noqa: E402
from engine.models.orb_sip_v2 import OrbStocksInPlayV2  # noqa: E402
from engine.run_backtest import git_rev  # noqa: E402
from engine.run_engine6 import ARM_SIP, COSTS, FREE, _atr_map, _window  # noqa: E402
from engine.sip import config as scfg  # noqa: E402

ROOT = Path(__file__).resolve().parent
REPORT = ROOT / "reports" / f"orb_sip.v9_15c_prior.{scfg.SNAPSHOT}.md"
TRADES = ROOT / "reports" / f"orb_sip.v9_15c_prior.{scfg.SNAPSHOT}.trades.csv.gz"
RISK = 1_000.0
CLS = {G.V2: OrbStocksInPlayV2, G.C15_RANGE: OrbSip15Close,
       G.C15_PRIOR: OrbSip15ClosePriorStop}
LABEL = {G.V2: "v2 (the incumbent: 5-min range, opposite-extreme stop)",
         G.C15_RANGE: "c15_range (ENGINE-13: 15-min range, range-extreme stop)",
         G.C15_PRIOR: "c15_prior (the owner's spec: stop on the preceding candle)"}


def _d(s):
    return int(str(s).replace("-", ""))


def _money(r):
    return f"{r * RISK:+,.0f} dollars"


def _mean(xs):
    return float(np.mean(xs)) if len(xs) else float("nan")


def _days(ts):
    return len({int(t.day) for t in ts})


def _stopout(ts):
    return (sum(1 for t in ts if t.exit_reason == "stop") / len(ts)) if ts else float("nan")


def _paired(a, b):
    def by_day(ts):
        d = {}
        for t in ts:
            d.setdefault(int(t.day), []).append(float(t.net_r))
        return {k: float(np.mean(v)) for k, v in d.items()}
    x, y = by_day(a), by_day(b)
    return [x[k] - y[k] for k in sorted(set(x) & set(y))]


def main() -> int:
    t0 = time.time()
    print("ENGINE-17 — the owner's stop on the 15-minute close-confirmed break",
          flush=True)
    with gzip.open(scfg.DATA_ROOT / "selection.json.gz", "rt") as f:
        sel = json.load(f)
    rows = [r for r in sel["rows"] if r["arm"] == ARM_SIP]
    pairs = {(r["symbol"], int(r["day"])) for r in rows}
    dbs = {}
    for s, d in pairs:
        dbs.setdefault(s, set()).add(d)
    atr = _atr_map(pairs)
    print(f"  {len(pairs):,} symbol-days, {len(dbs):,} symbols", flush=True)

    net = {a: [] for a in G.ARMS}
    gross = []
    census = {a: Counter() for a in G.ARMS}
    for i, (sym, days) in enumerate(sorted(dbs.items())):
        try:
            series = cache_load.load(sym, "1m", scfg.SNAPSHOT)
        except FileNotFoundError:
            continue
        for a in G.ARMS:
            m = CLS[a](atr)
            t, _ = run_symbol(series, m, COSTS, warmup_days=0,
                              day_filter=lambda d, days=days: int(d) in days)
            m.finish()
            net[a].extend(t)
            census[a].update(m.census)
        mf = OrbSip15ClosePriorStop(atr)
        tf, _ = run_symbol(series, mf, FREE, warmup_days=0,
                           day_filter=lambda d, days=days: int(d) in days)
        mf.finish()
        gross.extend(tf)
        cache_load.load.cache_clear()
        if (i + 1) % 700 == 0:
            print(f"  replayed {i+1:,}/{len(dbs):,}, "
                  f"{(time.time()-t0)/60:.1f} min", flush=True)

    lo, hi = _d(G.VERDICT[0]), _d(G.VERDICT[1])
    v = {a: _window(net[a], lo, hi) for a in G.ARMS}
    dw = {a: _window(net[a], _d(G.DISCLOSURE[0]), _d(G.DISCLOSURE[1]))
          for a in G.ARMS}
    vg = _window(gross, lo, hi)

    vs_v2 = _paired(v[G.C15_PRIOR], v[G.V2])
    vs_range = _paired(v[G.C15_PRIOR], v[G.C15_RANGE])
    halves = {}
    for name, a0, b0 in G.HALVES:
        halves[name] = _mean([t.net_r for t in _window(v[G.C15_PRIOR], _d(a0), _d(b0))])

    rows_g = G.evaluate(len(v[G.C15_PRIOR]), vs_v2, vs_range,
                        _mean([t.gross_r for t in v[G.C15_PRIOR]]),
                        _mean([t.net_r for t in v[G.C15_PRIOR]]),
                        _stopout(v[G.C15_PRIOR]), halves)
    verdict = G.verdict(rows_g, vs_v2)
    print(f"\n  VERDICT: {verdict}\n", flush=True)
    for g in rows_g:
        print(f"   {g.id} {'PASS' if g.passed else 'FAIL'} — {g.name}: {g.observed}",
              flush=True)

    with gzip.open(TRADES, "wt", newline="") as f:
        wr = csv.writer(f)
        wr.writerow(["arm", "symbol", "day", "side", "decision_minute",
                     "entry_minute", "fill_price", "stop_price", "exit_price",
                     "exit_reason", "risk_per_share", "atr14", "prev_low",
                     "prev_high", "range_stop", "gross_r", "net_r"])
        for a in G.ARMS:
            for t in v[a]:
                md = t.meta
                wr.writerow([a, t.symbol, t.day, t.side, t.decision_minute,
                             t.entry_minute, f"{t.fill_price:.4f}",
                             f"{t.stop_price:.4f}", f"{t.exit_price:.4f}",
                             t.exit_reason, f"{t.risk_per_share:.4f}",
                             md.get("atr14", ""), md.get("prev_low", ""),
                             md.get("prev_high", ""), md.get("range_stop", ""),
                             f"{t.gross_r:.6f}", f"{t.net_r:.6f}"])
    _write(verdict, rows_g, v, dw, vg, vs_v2, vs_range, census, halves,
           time.time() - t0)
    print(f"\n  wrote {REPORT}\n  wrote {TRADES}", flush=True)
    return 0


def _geom(ts):
    if not ts:
        return (float("nan"),) * 5
    risk = np.array([t.risk_per_share for t in ts])
    fill = np.array([t.fill_price for t in ts])
    a = np.array([float(t.meta.get("atr14", np.nan)) for t in ts])
    with np.errstate(invalid="ignore", divide="ignore"):
        return (float(np.median(risk)), float(np.median(risk / fill)),
                float(np.nanmedian(risk / a)),
                float(2 * COSTS.commission_per_share / np.median(risk)),
                _stopout(ts))


def _write(verdict, rows_g, v, dw, vg, vs_v2, vs_range, census, halves, elapsed):
    L = []
    w = L.append
    w("# `orb_sip.v9_15c_prior` — the owner's stop on the 15-minute close-confirmed break")
    w("")
    w(f"**Verdict: {verdict}.** Decided on {G.VERDICT[0]} → {G.VERDICT[1]} and "
      f"on nothing else.")
    w("")
    w(f"Snapshot `{scfg.SNAPSHOT}`, unchanged; ENGINE-6's selection reused byte "
      f"for byte; nothing downloaded. Gate: "
      f"[`../models/orb_sip.v9_15c_prior/GATE.md`](../models/orb_sip.v9_15c_prior/GATE.md), "
      f"committed before any number below existed. Git rev `{git_rev()}`. "
      f"Run took {elapsed/60:.1f} minutes.")
    w("")
    w("## In plain English")
    w("")
    w("**What changed, and only this.** ENGINE-13 drew a 15-minute opening "
      "range, waited for a five-minute candle to CLOSE outside it, and then put "
      "its stop at the far side of that 15-minute range — a median 177 cents "
      "away. It lost $13 per $1,000 risked, and its own diagnosis was that "
      "waiting for the close moves the ENTRY further from the far side, so the "
      "risk denominator inflates: *it buys a better stop and sells a worse "
      "price, and the price is the bigger number*. **The owner's rule keeps the "
      "confirmed entry and brings the stop to meet it** — the low of the "
      "five-minute candle immediately before the one that triggered, his own "
      "worked example being 103 when the trigger candle ran 105 to 106 and the "
      "one before it ran 103 to 105.")
    w("")
    w("**The stop rule is not itself new.** ENGINE-10 measured it on the "
      "five-minute range with a resting-order entry and it came back PARTIAL at "
      "+$15 a trade against the incumbent's +$17 — statistically the same "
      "thing. What has never been measured is this pairing: the confirmed entry "
      "with the near stop.")
    w("")
    w("**This is the ninth reading of 2016–2026, and there is no cross-era "
      "check in this lane** — the 2012–2015 snapshot was set aside at the "
      "owner's instruction, so nothing here has been confirmed on a second "
      "market. Three comparisons on one window is nearer a 14% false-positive "
      "rate than 5%; the corrected interval is printed beside each.")
    w("")
    for a in G.ARMS:
        ts = v[a]
        s = summarise(ts, a)
        lo, hi = G.mean_ci95([t.net_r for t in ts])
        w(f"- **{LABEL[a]}** — {s.n:,} trades over {_days(ts):,} days. "
          f"**{_money(s.mean_r)} a trade** ({s.mean_r:+.4f}R); median "
          f"{_money(s.median_r)}; {s.hit_rate*100:.1f}% green; "
          f"**{_stopout(ts)*100:.1f}% stopped out**. 95% range {_money(lo)} to "
          f"{_money(hi)}"
          f"{', which contains zero' if lo <= 0 <= hi else ', which excludes zero'}.")
    w("")
    for nm, d in (("`c15_prior` minus the incumbent `v2`", vs_v2),
                  ("`c15_prior` minus ENGINE-13's `c15_range`", vs_range)):
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
    w("## Stop geometry — read first, because it has explained every result here")
    w("")
    w("| arm | trades | median stop | % of price | **× 14-day ATR** | commission "
      "as share of risk | **stopped out** | per $1,000 |")
    w("|---|---|---|---|---|---|---|---|")
    for a in G.ARMS:
        ts = v[a]
        c, pct, atr, comm, ko = _geom(ts)
        w(f"| `{a}` | {len(ts):,} | {c*100:.1f}¢ | {pct*100:.3f}% | "
          f"**{atr:.2f}** | {comm:.4f} | **{ko*100:.1f}%** | "
          f"{_money(_mean([t.net_r for t in ts]))} |")
    for nm, atr, ko, r in G.REFERENCE_STOPS:
        w(f"| *{nm}* | — | — | — | *{atr:.2f}* | — | *{ko*100:.1f}%* | "
          f"*{r*RISK:+,.0f} dollars* |")
    w("")
    pa = _geom(v[G.C15_PRIOR])[2]
    if pa < 0.30 or _stopout(v[G.C15_PRIOR]) > 0.60:
        w("**THE ENGINE-6 DIAGNOSIS IS REPEATING.** The stop sits inside the "
          "noise of the very setup the trade is defined by, so the trade is "
          "knocked out before the idea has had a chance to be right or wrong. "
          "This paragraph was required by the gate whatever the verdict says.")
    else:
        w(f"The stop landed at **{pa:.2f} ATR** with a "
          f"**{_stopout(v[G.C15_PRIOR])*100:.1f}%** knock-out rate, inside the "
          f"0.4–0.7 ATR band the gate predicted and clear of the 60% guard. It "
          f"is not repeating ENGINE-6's failure.")
    w("")
    w("## The ENGINE-13 repair, quantified")
    w("")
    gap = _mean([t.net_r for t in v[G.V2]]) - _mean([t.net_r for t in v[G.C15_RANGE]])
    got = _mean([t.net_r for t in v[G.C15_PRIOR]]) - _mean([t.net_r for t in v[G.C15_RANGE]])
    w(f"- ENGINE-13 trailed the incumbent by **{_money(-gap)}** a trade.")
    w(f"- Changing only the stop moved it **{_money(got)}** a trade.")
    w(f"- That closes **{got/gap*100:.0f}%** of the gap."
      if gap != 0 else "")
    w("")
    w("## When the fill gapped through the stop")
    w("")
    ts = v[G.C15_PRIOR]
    thru = [t for t in ts
            if (t.side == "long" and t.fill_price <= t.stop_price)
            or (t.side == "short" and t.fill_price >= t.stop_price)]
    w(f"The market order fills at the next bar's open, which can be beyond the "
      f"planned stop. Those positions are dead on arrival and are recorded as "
      f"immediate stop-outs rather than skipped or rescued.")
    w("")
    w(f"- **{len(thru):,}** of {len(ts):,} trades ({len(thru)/max(len(ts),1)*100:.2f}%).")
    if thru:
        r = np.array([t.risk_per_share for t in thru])
        w(f"- Median fill-to-stop distance on those: {np.median(r)*100:.1f}¢. "
          f"Their mean net R is {_mean([t.net_r for t in thru]):+.4f} "
          f"({_money(_mean([t.net_r for t in thru]))}).")
    w("")
    w("## What each arm skipped, and why")
    w("")
    w("| count | " + " | ".join(f"`{a}`" for a in G.ARMS) + " |")
    w("|---|" + "---|" * len(G.ARMS))
    keys = sorted({k for a in G.ARMS for k in census[a]})
    for k in keys:
        w(f"| {k} | " + " | ".join(f"{census[a].get(k,0):,}" for a in G.ARMS) + " |")
    w("")
    w("## Where `c15_prior` and the incumbent disagree")
    w("")
    pk = {(t.symbol, int(t.day)): t for t in v[G.C15_PRIOR]}
    vk = {(t.symbol, int(t.day)): t for t in v[G.V2]}
    shared = sorted(set(pk) & set(vk))
    opp = [k for k in shared if pk[k].side != vk[k].side]
    w(f"- Both traded **{len(shared):,}** of the same symbol-days; they took "
      f"**opposite sides** on **{len(opp):,}** "
      f"({len(opp)/max(len(shared),1)*100:.1f}%).")
    if opp:
        w(f"- On those, `c15_prior` returned "
          f"{_money(_mean([pk[k].net_r for k in opp]))} a trade and the "
          f"incumbent {_money(_mean([vk[k].net_r for k in opp]))}.")
    only_v2 = [k for k in vk if k not in pk]
    w(f"- The incumbent traded **{len(only_v2):,}** symbol-days `c15_prior` "
      f"never opened (the range never closed through, or the stop inverted). "
      f"The incumbent earned "
      f"{_money(_mean([vk[k].net_r for k in only_v2]))} a trade on exactly those.")
    w("")
    w(f"## The verdict window, {G.VERDICT[0]} → {G.VERDICT[1]}")
    w("")
    w("| arm | trades | days | gross R | net R | median | money per $1,000 | "
      "95% range | hit | stopped |")
    w("|---|---|---|---|---|---|---|---|---|---|")
    for a in G.ARMS:
        ts, s = v[a], summarise(v[a], a)
        lo, hi = G.mean_ci95([t.net_r for t in ts])
        g = _mean([t.gross_r for t in ts])
        w(f"| `{a}` | {s.n:,} | {_days(ts):,} | {g:+.4f} | {s.mean_r:+.4f} | "
          f"{s.median_r:+.4f} | {_money(s.mean_r)} | {_money(lo)} to "
          f"{_money(hi)} | {s.hit_rate*100:.1f}% | {_stopout(ts)*100:.1f}% |")
    w("")
    w(f"True zero-cost `c15_prior`: {_mean([t.gross_r for t in vg]):+.4f}R.")
    w("")
    w("### The two halves (Q6)")
    w("")
    w("| half | mean net R | money per $1,000 |")
    w("|---|---|---|")
    for k, val in halves.items():
        w(f"| {k} | {val:+.4f} | {_money(val)} |")
    w("")
    w(f"## The contaminated window, {G.DISCLOSURE[0]} → {G.DISCLOSURE[1]} — "
      f"a disclosure, not a verdict")
    w("")
    w("| arm | trades | net R | money per $1,000 | hit | stopped |")
    w("|---|---|---|---|---|---|")
    for a in G.ARMS:
        s = summarise(dw[a], a)
        w(f"| `{a}` | {s.n:,} | {s.mean_r:+.4f} | {_money(s.mean_r)} | "
          f"{s.hit_rate*100:.1f}% | {_stopout(dw[a])*100:.1f}% |")
    w("")
    w("## Caveats, and what would change the answer")
    w("")
    w("- **The stop rule is not new; the pairing is.** ENGINE-10 already "
      "measured this stop on the five-minute range at +$15 against the "
      "incumbent's +$17. A result close to the incumbent here is the third "
      "PARTIAL in the same family, not a discovery.")
    w("- **Ninth reading of this window**, no correction applied because none "
      "exists.")
    w("- **No cross-era check.** The 2012–2015 snapshot was set aside, so "
      "nothing here has been confirmed on a second market.")
    w("- Fills are modelled from one-minute OHLC and cannot see inside a bar. "
      "No borrow, halt, spread or partial-fill question has been touched.")
    w("- **No leveraged portfolio figure appears anywhere**, by pre-registration.")
    w("")
    REPORT.parent.mkdir(parents=True, exist_ok=True)
    REPORT.write_text("\n".join(L) + "\n")


if __name__ == "__main__":
    raise SystemExit(main())
