"""ENGINE-14 — a 1R take-profit on the two entry rules already measured.

    .venv/bin/python run_engine14.py

The owner: "If theres no target then theres no trade add a 1r take profit".

Four arms, one pass over the tape. Nothing is downloaded: the selection is
ENGINE-6's `selection.json.gz` (the `sip` arm only) and every one-minute bar is
already on disk.

    v2       orb_sip.v2, no target. The incumbent, and the thing to beat.
    v2_1r    the same, capped at 1R from the fill.
    c15      orb_sip.v5_15c, the 15-minute range on a 5-minute close, no target.
    c15_1r   the same, capped at 1R from the fill.

The bar is `engine/models/orb_sip.v6_1r/GATE.md`, committed before this file
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
from engine.backtest.stats import (SUMMARY_HEADER, summarise,  # noqa: E402
                                   summary_row)
from engine.cache import load as cache_load  # noqa: E402
from engine.models import gates14 as G  # noqa: E402
from engine.models.orb_sip_15c import OrbSip15Close  # noqa: E402
from engine.models.orb_sip_1r import OrbSip15Close1R, OrbSipV2Target1R  # noqa: E402
from engine.models.orb_sip_v2 import OrbStocksInPlayV2  # noqa: E402
from engine.run_backtest import git_rev  # noqa: E402
from engine.run_engine6 import ARM_SIP, COSTS, FREE, _atr_map, _window  # noqa: E402
from engine.sip import config as scfg  # noqa: E402

REPORT = (Path(__file__).resolve().parent / "reports"
          / f"orb_sip.v6_1r.{scfg.SNAPSHOT}.md")
TRADES_OUT = (Path(__file__).resolve().parent / "reports"
              / f"orb_sip.v6_1r.{scfg.SNAPSHOT}.trades.csv.gz")
SELECTION_PATH = scfg.DATA_ROOT / "selection.json.gz"
RISK = 1_000.0

LABEL = {G.V2: "v2 (the incumbent, no target)",
         G.V2_1R: "v2_1r (the incumbent, capped at 1R)",
         G.C15: "c15 (15-min range on a 5-min close, no target)",
         G.C15_1R: "c15_1r (the same, capped at 1R)"}
MFE_LEVELS = (0.5, 1.0, 2.0, 3.0, 5.0)


def _d(s):
    return int(s.replace("-", ""))


def _money(r):
    return f"{r * RISK:+,.0f} dollars"


def _mean(xs):
    return float(np.mean(xs)) if len(xs) else float("nan")


def _days(ts):
    return len({int(t.day) for t in ts})


def _gross(ts):
    return _mean([t.gross_r for t in ts])


def _share(ts, reason):
    return (sum(1 for t in ts if t.exit_reason == reason) / len(ts)) if ts else float("nan")


def _paired_by_day(a, b):
    def by_day(ts):
        d = {}
        for t in ts:
            d.setdefault(int(t.day), []).append(float(t.net_r))
        return {k: float(np.mean(v)) for k, v in d.items()}
    x, y = by_day(a), by_day(b)
    return [x[k] - y[k] for k in sorted(set(x) & set(y))]


def _replay(days_by_symbol, atr):
    factories = [
        (G.V2, "net", lambda: OrbStocksInPlayV2(atr), COSTS),
        (G.V2, "zero", lambda: OrbStocksInPlayV2(atr), FREE),
        (G.V2_1R, "net", lambda: OrbSipV2Target1R(atr), COSTS),
        (G.V2_1R, "zero", lambda: OrbSipV2Target1R(atr), FREE),
        (G.C15, "net", lambda: OrbSip15Close(atr), COSTS),
        (G.C15, "zero", lambda: OrbSip15Close(atr), FREE),
        (G.C15_1R, "net", lambda: OrbSip15Close1R(atr), COSTS),
        (G.C15_1R, "zero", lambda: OrbSip15Close1R(atr), FREE),
    ]
    trades = {(a, c): [] for a, c, _, _ in factories}
    census = {a: Counter() for a in G.ARMS}
    t0 = time.time()
    for i, (sym, days) in enumerate(sorted(days_by_symbol.items())):
        try:
            series = cache_load.load(sym, "1m", scfg.SNAPSHOT)
        except FileNotFoundError:
            continue
        for arm, cost, make_model, costs in factories:
            m = make_model()
            t, _ = run_symbol(series, m, costs, warmup_days=0,
                              day_filter=lambda d, days=days: int(d) in days)
            m.finish()
            trades[(arm, cost)].extend(t)
            if cost == "net":
                census[arm].update(m.census)
        cache_load.load.cache_clear()
        if (i + 1) % 500 == 0:
            print(f"  replayed {i+1:,}/{len(days_by_symbol):,} symbols, "
                  f"{(time.time()-t0)/60:.1f} min", flush=True)
    return trades, census


def _amputation(ts):
    """What a 1R cap deletes: the MFE profile, and the share of all profit that
    was earned beyond +1R. This is the number the lane turns on."""
    if not ts:
        return {}, float("nan")
    mfe = np.array([t.mfe_r for t in ts])
    reach = {lv: float(np.mean(mfe >= lv)) for lv in MFE_LEVELS}
    net = np.array([t.net_r for t in ts])
    n = len(net)
    # Split each trade's result at the +1R line: what a 1R cap would have KEPT
    # (everything up to +1R) and what it would have GIVEN AWAY (the part above).
    # Reported per trade, not as a ratio - the ratio explodes when the total is
    # near zero and is meaningless when it is negative.
    beyond = float(np.clip(net - 1.0, 0, None).sum()) / n
    kept = float(net.sum()) / n - beyond
    return reach, (kept, beyond)


def main() -> int:
    t0 = time.time()
    print("ENGINE-14 — a 1R take-profit on the two measured entry rules", flush=True)
    with gzip.open(SELECTION_PATH, "rt") as f:
        sel = json.load(f)
    rows = [r for r in sel["rows"] if r["arm"] == ARM_SIP]
    pairs = {(r["symbol"], int(r["day"])) for r in rows}
    dbs = {}
    for s, d in pairs:
        dbs.setdefault(s, set()).add(d)
    print(f"  selection: {len(pairs):,} stocks-in-play symbol-days, "
          f"{len(dbs):,} symbols (ENGINE-6's file, unchanged)", flush=True)
    atr = _atr_map(pairs)

    trades, census = _replay(dbs, atr)
    print(f"  replay done in {(time.time()-t0)/60:.1f} min", flush=True)

    net = {a: trades[(a, "net")] for a in G.ARMS}
    v_lo, v_hi = _d(G.VERDICT[0]), _d(G.VERDICT[1])
    d_lo, d_hi = _d(G.DISCLOSURE[0]), _d(G.DISCLOSURE[1])
    v = {a: _window(net[a], v_lo, v_hi) for a in G.ARMS}
    vz = {a: _window(trades[(a, "zero")], v_lo, v_hi) for a in G.ARMS}
    dw = {a: _window(net[a], d_lo, d_hi) for a in G.ARMS}

    summaries = {a: summarise(v[a], a) for a in G.ARMS}
    gross = {a: _gross(v[a]) for a in G.ARMS}
    zero = {a: _gross(vz[a]) for a in G.ARMS}
    paired = {G.V2_1R: _paired_by_day(v[G.V2_1R], v[G.V2]),
              G.C15_1R: _paired_by_day(v[G.C15_1R], v[G.C15])}
    best = max((G.V2_1R, G.C15_1R), key=lambda a: summaries[a].mean_r)
    paired["best_vs_v2"] = _paired_by_day(v[best], v[G.V2])
    eras = {a: {lab: _mean([t.net_r for t in _window(net[a], _d(lo), _d(hi))])
                for lab, lo, hi in G.ERAS} for a in G.ARMS}

    rows_g = G.evaluate(summaries, gross, paired, eras)
    verdict = G.verdict(rows_g, summaries, paired)
    print(f"\n  VERDICT: {verdict}   (best capped arm: {best})\n", flush=True)
    for g in rows_g:
        print(f"   {g.id} {'PASS' if g.passed else 'FAIL'} — {g.name}: {g.observed}",
              flush=True)

    with gzip.open(TRADES_OUT, "wt", newline="") as f:
        wr = csv.writer(f)
        wr.writerow(["arm", "model_id", "symbol", "day", "side", "entry_minute",
                     "exit_minute", "fill_price", "stop_price", "target_price",
                     "exit_price", "exit_reason", "ambiguous_bar",
                     "risk_per_share", "gross_r", "net_r", "mae_r", "mfe_r"])
        for a in G.ARMS:
            for t in v[a]:
                wr.writerow([a, t.model_id, t.symbol, t.day, t.side,
                             t.entry_minute, t.exit_minute, f"{t.fill_price:.4f}",
                             f"{t.stop_price:.4f}", f"{t.target_price:.4f}",
                             f"{t.exit_price:.4f}", t.exit_reason,
                             int(t.ambiguous_bar), f"{t.risk_per_share:.4f}",
                             f"{t.gross_r:.6f}", f"{t.net_r:.6f}",
                             f"{t.mae_r:.6f}", f"{t.mfe_r:.6f}"])

    _report(verdict, best, rows_g, summaries, gross, zero, paired, eras, v, dw,
            net, census, time.time() - t0)
    print(f"\n  wrote {REPORT}\n  wrote {TRADES_OUT}", flush=True)
    return 0


def _report(verdict, best, rows_g, summaries, gross, zero, paired, eras, v, dw,
            all_net, census, elapsed):
    L = []
    w = L.append
    w("# `orb_sip.v6_1r` — a 1R take-profit on the two measured entry rules")
    w("")
    w(f"**Verdict: {verdict}.** Decided on {G.VERDICT[0]} → {G.VERDICT[1]} and "
      f"on nothing else. Best capped arm: `{best}`.")
    w("")
    w(f"Snapshot `{scfg.SNAPSHOT}`, unchanged. Selection is ENGINE-6's "
      f"`selection.json.gz`, `sip` arm, byte for byte. Gate: "
      f"[`../models/orb_sip.v6_1r/GATE.md`](../models/orb_sip.v6_1r/GATE.md), "
      f"committed before any number below existed. Git rev `{git_rev()}`. "
      f"Nothing was downloaded; the run took {elapsed/60:.1f} minutes.")
    w("")
    w("## In plain English")
    w("")
    w("**What changed.** One thing: a resting limit order to take profit at one "
      "unit of risk from the fill. If a trade risks $1,000, it now closes for "
      "+$1,000 the moment it gets there, instead of holding to the 15:59 bell. "
      "Everything else — the range, the direction rule, the entry, the stop "
      "level, the twenty names, the costs — is untouched.")
    w("")
    w("**This is the seventh reading of this window.** Every session on disk has "
      "been looked at by an earlier lane; there is no un-looked-at data left, "
      "and fetching some would mean paid Polygon calls, which this lane was "
      "forbidden. No correction is applied because none is available. Four "
      "comparisons on one window is four chances to look good by luck — nearer "
      "19% than 5% — so the Bonferroni-corrected interval is printed beside "
      "every comparison. **Everything below is suggestive, not conclusive.**")
    w("")
    for a in G.ARMS:
        s, ts = summaries[a], v[a]
        lo, hi = G.mean_ci95([t.net_r for t in ts])
        w(f"- **{LABEL[a]}** — {s.n:,} trades over {_days(ts):,} days. "
          f"Average **{_money(s.mean_r)} a trade** per $1,000 risked "
          f"({s.mean_r:+.4f}R); middle trade {_money(s.median_r)}; "
          f"**{s.hit_rate*100:.1f}% finished green**; "
          f"{_share(ts,'stop')*100:.1f}% stopped, "
          f"{_share(ts,'target')*100:.1f}% hit the 1R target, "
          f"{_share(ts,'time')*100:.1f}% ran to the bell. "
          f"95% range {_money(lo)} to {_money(hi)}"
          f"{', which contains zero' if lo <= 0 <= hi else ', which excludes zero'}.")
    w("")
    for arm in (G.V2_1R, G.C15_1R):
        d = paired[arm]
        m, (lo, hi) = _mean(d), G.mean_ci95(d)
        blo, bhi = G.mean_ci(d, G.Z_BONFERRONI)
        w(f"- **`{arm}` minus `{G.CAPPED[arm]}`** (the cap against its own "
          f"uncapped twin), paired day by day: **{_money(m)}** a trade "
          f"({m:+.4f}R), 95% range {_money(lo)} to {_money(hi)} over "
          f"{len(d):,} days. "
          + ("**Entirely below zero — the cap measurably LOST.**" if hi < 0
             else "**Entirely above zero — the cap measurably won.**" if lo > 0
             else "The range contains zero, so no effect is established.")
          + f" Corrected for four shots: {_money(blo)} to {_money(bhi)}.")
    d = paired["best_vs_v2"]
    m, (lo, hi) = _mean(d), G.mean_ci95(d)
    w(f"- **`{best}` minus the incumbent `v2`**, paired day by day: "
      f"**{_money(m)}** a trade ({m:+.4f}R), 95% range {_money(lo)} to "
      f"{_money(hi)} over {len(d):,} days.")
    w("")
    w(f"- **Verdict**: **{verdict}**.")
    w("")
    w("**Which gates carried the verdict, in words.** "
      + " ".join(f"{g.id} {'passed' if g.passed else 'FAILED'} ({g.name})."
                 for g in rows_g))
    w("")

    # -- the amputation table, the point of the lane -----------------------
    w("## The amputation table — what a 1R cap deletes")
    w("")
    w("A cap can only ever help if there is little profit above the cap. This "
      "table is computed on the UNCAPPED arms, so it says what was there to "
      "lose before anything was cut.")
    w("")
    w("| uncapped arm | reached +0.5R | +1R | +2R | +3R | +5R | a cap KEEPS "
      "(up to +1R) | a cap GIVES AWAY (above +1R) | net |")
    w("|---|---|---|---|---|---|---|---|---|")
    split, reach_v2 = {}, 0.0
    for a in (G.V2, G.C15):
        reach, (kept, beyond) = _amputation(v[a])
        split[a] = (kept, beyond)
        if a == G.V2:
            reach_v2 = reach[1.0] * 100
        w(f"| `{a}` | " + " | ".join(f"{reach[lv]*100:.1f}%" for lv in MFE_LEVELS)
          + f" | {_money(kept)} | **{_money(beyond)}** | "
            f"{_money(kept + beyond)} |")
    w("")
    kept, beyond = split[G.V2]
    w(f"**Read the incumbent's row across.** Everything up to the +1R mark is a "
      f"net LOSS of {_money(kept)} a trade. The part of its winners ABOVE +1R "
      f"earns {_money(beyond)} a trade. Those two sum to the "
      f"{_money(kept + beyond)} the strategy actually makes. **The entire result "
      f"lives above the +1R line, which is precisely what a 1R cap deletes** — "
      f"only {reach_v2:.1f}% of trades ever get there, and they carry all of it. "
      f"That is the mechanism, stated before the run in the GATE, and X2 is "
      f"whether the higher win rate pays for it.")
    w("")

    # -- the gate table ----------------------------------------------------
    w("## The pre-registered bar, and what it read")
    w("")
    w("| id | gate | threshold | observed | |")
    w("|---|---|---|---|---|")
    for g in rows_g:
        w(f"| **{g.id}** | {g.name} | {g.threshold} | {g.observed} | "
          f"{'PASS' if g.passed else '**FAIL**'} |")
    w("")

    # -- the numbers -------------------------------------------------------
    w(f"## The verdict window, {G.VERDICT[0]} → {G.VERDICT[1]}")
    w("")
    w("| arm | trades | days | gross R | true zero cost | net R | median | "
      "money per $1,000 | 95% range | hit | stop | target | bell |")
    w("|---|---|---|---|---|---|---|---|---|---|---|---|---|")
    for a in G.ARMS:
        s, ts = summaries[a], v[a]
        lo, hi = G.mean_ci95([t.net_r for t in ts])
        w(f"| `{a}` | {s.n:,} | {_days(ts):,} | {gross[a]:+.4f} | "
          f"{zero[a]:+.4f} | {s.mean_r:+.4f} | {s.median_r:+.4f} | "
          f"{_money(s.mean_r)} | {_money(lo)} to {_money(hi)} | "
          f"{s.hit_rate*100:.1f}% | {_share(ts,'stop')*100:.1f}% | "
          f"{_share(ts,'target')*100:.1f}% | {_share(ts,'time')*100:.1f}% |")
    w("")
    w(SUMMARY_HEADER)
    for a in G.ARMS:
        w(summary_row(summaries[a]))
    w("")
    w("### The win-rate trap, stated explicitly")
    w("")
    for cap, plain in G.CAPPED.items():
        dh = summaries[cap].hit_rate - summaries[plain].hit_rate
        dm = summaries[cap].mean_r - summaries[plain].mean_r
        w(f"- `{plain}` → `{cap}`: win rate "
          f"{summaries[plain].hit_rate*100:.1f}% → "
          f"{summaries[cap].hit_rate*100:.1f}% ({dh*100:+.1f} points), money "
          f"{_money(summaries[plain].mean_r)} → {_money(summaries[cap].mean_r)} "
          f"({_money(dm)} a trade). "
          + ("**The win rate went UP and the money went DOWN. That is the exact "
             "trap a take-profit is attractive for.**" if dh > 0 and dm < 0 else ""))
    w("")

    # -- ambiguity ---------------------------------------------------------
    w("### Trades resolved by the stop-before-target assumption")
    w("")
    w("When one bar's range holds both the stop and the target, `fills.py` "
      "assumes the STOP was hit first. That rule was dormant in every prior lane "
      "because no model had a target. It is live here, it is pessimistic, and it "
      "was not relaxed for this lane.")
    w("")
    w("| arm | ambiguous trades | share |")
    w("|---|---|---|")
    for a in G.ARMS:
        n = sum(1 for t in v[a] if t.ambiguous_bar)
        w(f"| `{a}` | {n:,} | {n/max(len(v[a]),1)*100:.1f}% |")
    w("")

    # -- stop width --------------------------------------------------------
    w("## Realised stop width — unchanged by the cap, as it must be")
    w("")
    w("| arm | trades | median stop | % of price | in 14-day ATRs |")
    w("|---|---|---|---|---|")
    for a in G.ARMS:
        ts = v[a]
        if not ts:
            continue
        risk = np.array([t.risk_per_share for t in ts])
        fill = np.array([t.fill_price for t in ts])
        atrs = np.array([float(t.meta.get("atr14", np.nan)) for t in ts])
        with np.errstate(invalid="ignore", divide="ignore"):
            w(f"| `{a}` | {len(ts):,} | {np.median(risk)*100:.0f}¢ | "
              f"{np.median(risk/fill)*100:.2f}% | {np.nanmedian(risk/atrs):.2f} |")
    w("")

    # -- reproduction ------------------------------------------------------
    s = summaries[G.V2]
    w("## Proof that the `v2` arm is the incumbent")
    w("")
    w("| | ENGINE-7 reported | this run | |")
    w("|---|---|---|---|")
    for name, want, got in (
            ("trades", "10,545", f"{s.n:,}"),
            ("mean gross R", "+0.0324", f"{gross[G.V2]:+.4f}"),
            ("mean net R", "+0.0199", f"{s.mean_r:+.4f}"),
            ("median net R", "-0.1180", f"{s.median_r:+.4f}"),
            ("hit rate", "45.0%", f"{s.hit_rate*100:.1f}%"),
            ("stopped out", "31.6%", f"{_share(v[G.V2],'stop')*100:.1f}%")):
        ok = want.replace(",", "").lstrip("+") == got.replace(",", "").lstrip("+")
        w(f"| {name} | {want} | {got} | {'match' if ok else '**differs**'} |")
    w("")

    # -- eras --------------------------------------------------------------
    w("## The era table — the substitute for a window nobody had seen")
    w("")
    w("| arm | " + " | ".join(lab for lab, _, _ in G.ERAS) + " |")
    w("|---|" + "---|" * len(G.ERAS))
    for a in G.ARMS:
        cells = []
        for lab, lo, hi in G.ERAS:
            wnd = _window(all_net[a], _d(lo), _d(hi))
            cells.append(f"{_money(_mean([t.net_r for t in wnd]))} (n={len(wnd):,})")
        w(f"| `{a}` | " + " | ".join(cells) + " |")
    w("")
    w(f"## The contaminated window, {G.DISCLOSURE[0]} → {G.DISCLOSURE[1]} — "
      f"a disclosure, not a verdict")
    w("")
    w("| arm | trades | days | net R | money per $1,000 | hit | target hit |")
    w("|---|---|---|---|---|---|---|")
    for a in G.ARMS:
        ss = summarise(dw[a], a)
        w(f"| `{a}` | {ss.n:,} | {_days(dw[a]):,} | {ss.mean_r:+.4f} | "
          f"{_money(ss.mean_r)} | {ss.hit_rate*100:.1f}% | "
          f"{_share(dw[a],'target')*100:.1f}% |")
    w("")
    w("## Caveats, and what would change the answer")
    w("")
    w("- **The prior was written down before the run.** The GATE predicted this "
      "lane would fail, on the grounds that the incumbent's positive mean sits "
      "on a negative median and a 1R cap deletes the tail that produces it. "
      "The amputation table above is the mechanism. If the verdict is a null, "
      "**this confirms a prior rather than discovering something.**")
    w("- **Seventh reading of this window.** No correction applied because none "
      "exists. The only honest next step for any result here is forward, on "
      "sessions that have not happened yet.")
    w("- **The multiple was not swept.** 1R was tested once because that is what "
      "was asked for. 1.5R, 2R and a partial exit are different rules and each "
      "needs its own pre-registered bar; trying them now, after seeing this "
      "number, would make the result meaningless.")
    w("- **A full exit at 1R, not a partial.** 'Half off at 1R and let the rest "
      "run' is a different rule. ENGINE-5 measured it on the ETF family and it "
      "FAILED there; it has never been measured on this one.")
    w("- Fills are modelled from one-minute OHLC and cannot see inside a bar. A "
      "target fills at the level with no slippage; a stop slips. That asymmetry "
      "flatters the capped arms slightly and is unchanged from every prior lane.")
    w("- **No leveraged portfolio figure appears anywhere**, by pre-registration.")
    w("")
    REPORT.parent.mkdir(parents=True, exist_ok=True)
    REPORT.write_text("\n".join(L) + "\n")


if __name__ == "__main__":
    raise SystemExit(main())
