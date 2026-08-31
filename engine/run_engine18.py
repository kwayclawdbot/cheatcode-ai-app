"""ENGINE-18 — the owner's FULL spec: preceding-candle stop AND a 1R/2R target.

    .venv/bin/python run_engine18.py

ENGINE-17 measured the owner's stop with no target and it lost $66 per $1,000
risked. The owner said the specification included "targeting one to two r", and
he is right that ENGINE-17 left it out. This lane puts it back and also reports
the number that decides whether his experience and this tape can both be true:
**how often a trade ever reaches +1R and +2R at all.**

Arms, in fixed order:

    v2              the incumbent, for scale
    prior_notgt     ENGINE-17 exactly — the owner's stop, no target
    prior_1r        the owner's stop + 1R target
    prior_2r        the owner's stop + 2R target

Nothing is downloaded. ENGINE-6's selection reused byte for byte.
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
from engine.models.orb_sip_15c_prior import OrbSip15ClosePriorStop  # noqa: E402
from engine.models.orb_sip_15c_prior_target import OrbSip15ClosePriorTarget  # noqa: E402
from engine.models.orb_sip_v2 import OrbStocksInPlayV2  # noqa: E402
from engine.run_backtest import git_rev  # noqa: E402
from engine.run_engine6 import ARM_SIP, COSTS, _atr_map, _window  # noqa: E402
from engine.sip import config as scfg  # noqa: E402

ROOT = Path(__file__).resolve().parent
REPORT = ROOT / "reports" / f"orb_sip.v10_prior_target.{scfg.SNAPSHOT}.md"
TRADES = ROOT / "reports" / f"orb_sip.v10_prior_target.{scfg.SNAPSHOT}.trades.csv.gz"
RISK = 1_000.0
VERDICT = ("2024-01-01", "2026-08-28")

V2, NOTGT, R1, R2 = "v2", "prior_notgt", "prior_1r", "prior_2r"
ARMS = (V2, NOTGT, R1, R2)
LABEL = {V2: "v2 — the incumbent (5-min range, wide stop, no target)",
         NOTGT: "prior_notgt — ENGINE-17: owner's stop, NO target",
         R1: "prior_1r — owner's stop + 1R target",
         R2: "prior_2r — owner's stop + 2R target"}
MFE_LEVELS = (0.5, 1.0, 1.5, 2.0, 3.0)


def _d(s):
    return int(str(s).replace("-", ""))


def _money(r):
    return f"{r * RISK:+,.0f} dollars"


def _mean(xs):
    return float(np.mean(xs)) if len(xs) else float("nan")


def _ci(xs):
    xs = np.asarray(xs, dtype="float64")
    if len(xs) < 2:
        return (float("nan"),) * 2
    se = float(np.std(xs, ddof=1) / np.sqrt(len(xs)))
    return (float(xs.mean()) - 1.96 * se, float(xs.mean()) + 1.96 * se)


def _share(ts, reason):
    return (sum(1 for t in ts if t.exit_reason == reason) / len(ts)) if ts else float("nan")


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
    print("ENGINE-18 — the owner's stop WITH his target", flush=True)
    with gzip.open(scfg.DATA_ROOT / "selection.json.gz", "rt") as f:
        sel = json.load(f)
    rows = [r for r in sel["rows"] if r["arm"] == ARM_SIP]
    pairs = {(r["symbol"], int(r["day"])) for r in rows}
    dbs = {}
    for s, d in pairs:
        dbs.setdefault(s, set()).add(d)
    atr = _atr_map(pairs)

    factories = {V2: lambda: OrbStocksInPlayV2(atr),
                 NOTGT: lambda: OrbSip15ClosePriorStop(atr),
                 R1: lambda: OrbSip15ClosePriorTarget(atr, 1.0),
                 R2: lambda: OrbSip15ClosePriorTarget(atr, 2.0)}
    net = {a: [] for a in ARMS}
    census = Counter()
    for i, (sym, days) in enumerate(sorted(dbs.items())):
        try:
            series = cache_load.load(sym, "1m", scfg.SNAPSHOT)
        except FileNotFoundError:
            continue
        for a in ARMS:
            m = factories[a]()
            t, _ = run_symbol(series, m, COSTS, warmup_days=0,
                              day_filter=lambda d, days=days: int(d) in days)
            m.finish()
            net[a].extend(t)
            if a == NOTGT:
                census.update(m.census)
        cache_load.load.cache_clear()
        if (i + 1) % 800 == 0:
            print(f"  replayed {i+1:,}/{len(dbs):,}, {(time.time()-t0)/60:.1f} min",
                  flush=True)

    lo, hi = _d(VERDICT[0]), _d(VERDICT[1])
    v = {a: _window(net[a], lo, hi) for a in ARMS}
    print(f"\n  replay done in {(time.time()-t0)/60:.1f} min\n", flush=True)
    for a in ARMS:
        s = summarise(v[a], a)
        print(f"   {a:<12s} n={s.n:>6,}  win={s.hit_rate*100:5.1f}%  "
              f"net={s.mean_r:+.4f}  {_money(s.mean_r):>14s}  "
              f"stop={_share(v[a],'stop')*100:5.1f}%  "
              f"target={_share(v[a],'target')*100:5.1f}%  "
              f"bell={_share(v[a],'time')*100:5.1f}%", flush=True)

    # the number that decides whether both stories can be true
    base = v[NOTGT]
    mfe = np.array([t.mfe_r for t in base])
    print("\n  How far the owner's setup actually travels, before any exit rule:",
          flush=True)
    for lv in MFE_LEVELS:
        print(f"    reached +{lv:.1f}R at some point: {float(np.mean(mfe>=lv))*100:5.1f}%",
              flush=True)

    _write(v, census, mfe, time.time() - t0)
    with gzip.open(TRADES, "wt", newline="") as f:
        wr = csv.writer(f)
        wr.writerow(["arm", "symbol", "day", "side", "fill_price", "stop_price",
                     "target_price", "exit_price", "exit_reason", "ambiguous",
                     "risk_per_share", "atr14", "mfe_r", "mae_r", "gross_r",
                     "net_r"])
        for a in ARMS:
            for t in v[a]:
                wr.writerow([a, t.symbol, t.day, t.side, f"{t.fill_price:.4f}",
                             f"{t.stop_price:.4f}", f"{t.target_price:.4f}",
                             f"{t.exit_price:.4f}", t.exit_reason,
                             int(t.ambiguous_bar), f"{t.risk_per_share:.4f}",
                             t.meta.get("atr14", ""), f"{t.mfe_r:.6f}",
                             f"{t.mae_r:.6f}", f"{t.gross_r:.6f}", f"{t.net_r:.6f}"])
    print(f"\n  wrote {REPORT}\n  wrote {TRADES}", flush=True)
    return 0


def _write(v, census, mfe, elapsed):
    L = []
    w = L.append
    w("# `orb_sip.v10_prior_target` — the owner's stop WITH his target")
    w("")
    w("**ENGINE-17 tested half a strategy.** It took the owner's stop — the low "
      "of the five-minute candle before the trigger — and paired it with "
      "ENGINE-13's exit, which holds to the 15:59 bell. The specification said "
      "*\"targeting one to two r\"*. Leaving the target out was an error in "
      "translating the spec, not a finding about it.")
    w("")
    w("A stop and an exit are a matched pair. A WIDE stop with no target is "
      "coherent — that is the incumbent, and ENGINE-14 showed its whole profit "
      "lives above +1R. A TIGHT stop with a target is coherent — small R, banked "
      "often. **A tight stop with no target is the worst of both**: every "
      "knock-out of a close stop and none of the banking. ENGINE-17 measured "
      "that third thing.")
    w("")
    w(f"Snapshot `{scfg.SNAPSHOT}`, ENGINE-6's selection byte for byte, nothing "
      f"downloaded. Verdict window {VERDICT[0]} → {VERDICT[1]}. Git rev "
      f"`{git_rev()}`. Run took {elapsed/60:.1f} minutes.")
    w("")
    w("## The four arms")
    w("")
    w("| arm | trades | win rate | mean net R | money per $1,000 | 95% range | "
      "stopped | target hit | bell |")
    w("|---|---|---|---|---|---|---|---|---|")
    for a in ARMS:
        ts = v[a]
        s = summarise(ts, a)
        clo, chi = _ci([t.net_r for t in ts])
        w(f"| `{a}` | {s.n:,} | {s.hit_rate*100:.1f}% | {s.mean_r:+.4f} | "
          f"**{_money(s.mean_r)}** | {_money(clo)} to {_money(chi)} | "
          f"{_share(ts,'stop')*100:.1f}% | {_share(ts,'target')*100:.1f}% | "
          f"{_share(ts,'time')*100:.1f}% |")
    w("")
    for a in (R1, R2):
        d = _paired(v[a], v[NOTGT])
        m, (clo, chi) = _mean(d), _ci(d)
        w(f"- **`{a}` minus `prior_notgt`** (what the target alone did), paired "
          f"by day: **{_money(m)}** a trade, 95% {_money(clo)} to {_money(chi)}, "
          f"{len(d):,} days.")
        d2 = _paired(v[a], v[V2])
        m2, (c2, c3) = _mean(d2), _ci(d2)
        w(f"- **`{a}` minus the incumbent `v2`**, paired by day: "
          f"**{_money(m2)}** a trade, 95% {_money(c2)} to {_money(c3)}, "
          f"{len(d2):,} days.")
    w("")
    w("## The number that decides whether both stories can be true")
    w("")
    w("The owner's report is that this setup *\"typically\"* yields one to two R. "
      "That is a claim about how far the trade travels, and it is measurable "
      "independently of any exit rule — maximum favourable excursion, on the "
      "owner's own entry and stop, before any target exists.")
    w("")
    w("| ever reached | share of trades |")
    w("|---|---|")
    for lv in MFE_LEVELS:
        w(f"| +{lv:.1f}R | **{float(np.mean(mfe >= lv))*100:.1f}%** |")
    w("")
    w(f"Median MFE is **{float(np.median(mfe)):.2f}R**.")
    w("")
    w("**Read that table against the claim.** If a large share of trades reach "
      "+1R, the owner's experience and this tape agree about the setup and "
      "disagree only about the exit — and the 1R arm above is the arbiter. If "
      "few do, then the disagreement is about something else entirely: the "
      "universe being traded, which breakouts a human takes and which he skips, "
      "or the sample of days he remembers.")
    w("")
    w("## The stop-before-target assumption, which now decides real trades")
    w("")
    w("When one bar's range holds both the stop and the target, `fills.py` "
      "assumes the STOP was hit first. It is pessimistic and it is unchanged "
      "for this lane. With a stop this tight and a target this near, it decides "
      "more trades than in any previous lane, so the count is printed rather "
      "than buried.")
    w("")
    w("| arm | ambiguous trades | share |")
    w("|---|---|---|")
    for a in ARMS:
        n = sum(1 for t in v[a] if t.ambiguous_bar)
        w(f"| `{a}` | {n:,} | {n/max(len(v[a]),1)*100:.1f}% |")
    w("")
    w("## What this still does NOT model, and it matters for the disagreement")
    w("")
    w("- **It takes every breakout.** Twenty names a morning, every session, "
      "11,000+ trades. A human takes a handful and skips the ones that look "
      "wrong. This measures the rule, not the trader applying it.")
    w("- **The universe is the day's twenty most abnormal-volume names** from "
      "the 1,000 most liquid US stocks — mostly mid-cap movers, not a watchlist.")
    w("- **No re-entry.** One attempt per name per day. A failed break that "
      "re-breaks is not taken.")
    w("- **Fills come from one-minute OHLC** and cannot see inside a bar.")
    w("")
    REPORT.parent.mkdir(parents=True, exist_ok=True)
    REPORT.write_text("\n".join(L) + "\n")


if __name__ == "__main__":
    raise SystemExit(main())
