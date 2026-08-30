"""ENGINE-6 post-mortem — why the replication failed, measured rather than argued.

`orb_sip.v1` came back NOT REPRODUCED and in the OPPOSITE sign to the published
result: the higher the opening relative volume, the worse the trade, monotonely
across ten deciles. A number that wrong is either a finding about the market, a
finding about our machinery, or a finding about our reading of the spec, and the
gate says the candidate explanations must be enumerated and, where cheap,
measured. This measures them.

Everything here is a DIAGNOSTIC. It changes no threshold, it is not a result,
and no verdict may be reached by way of it. The verdict is in
`reports/orb_sip.v1.polygon-sip-v1.md` and was decided by R1-R5 alone.

The sweep is over ONE number: the stop, as a fraction of the 14-day ATR. The
published spec says 10%. The arithmetic that makes that number decisive is:

    signed move from entry to the close, in ATR = mean R x stop fraction

so running the same entries with a stop 1,000x wider than the spec's — one that
can essentially never be hit — reads off the pure directional edge of the entry
rule in ATR units, with the stop taken out of the question entirely. If that
number is positive for the model and zero for the coin flip, the entry rule
works and the stop is what kills it. If it is negative, the entry rule itself is
anti-predictive on this data and no stop could have saved it.
"""

from __future__ import annotations

import gzip
import json
import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from engine.backtest.stats import fmt  # noqa: E402
from engine.models import gates  # noqa: E402
from engine.models.orb_sip import (OrbStocksInPlay,  # noqa: E402
                                   OrbStocksInPlayCoinflip)
from engine.sip import config as scfg  # noqa: E402
from engine.run_engine6 import (ARM_SIP, ARM_UNFILTERED, COSTS,  # noqa: E402
                                FREE, SELECTION_PATH, _atr_map, _replay,
                                _window)

OUT = Path(__file__).resolve().parent / "reports" / "orb_sip.v1.polygon-sip-v1.diagnostics.md"
# The main report quotes this sweep. It reads the numbers from here rather
# than carrying transcribed copies of them, so a re-run cannot leave a stale
# figure standing in prose.
OUT_JSON = Path(__file__).resolve().parent.parent / "engine" / "data" / "polygon-sip-v1" / "diagnostics.json"
FRACTIONS = [0.10, 0.25, 0.50, 1.00, 2.00, 100.0]


def _stats(trades) -> dict:
    if not trades:
        return {"n": 0}
    g = np.array([t.gross_r for t in trades], dtype="float64")
    n = np.array([t.net_r for t in trades], dtype="float64")
    pct = np.array([t.gross_pct for t in trades], dtype="float64")
    stops = sum(1 for t in trades if t.exit_reason == "stop")
    win = g[g > 0]
    return {
        "n": len(trades),
        "hit": float((n > 0).mean()),
        "gross_mean": float(g.mean()),
        "gross_median": float(np.median(g)),
        "net_mean": float(n.mean()),
        "net_median": float(np.median(n)),
        "mean_winner": float(win.mean()) if len(win) else float("nan"),
        "stopped": stops / len(trades),
        "mean_pct": float(pct.mean()),
    }


def _or_size(store, symbol: str, day: int) -> float:
    """High minus low of the 09:30-09:35 five-minute bar."""
    import duckdb
    return _OR_CACHE.get((symbol, day), float("nan"))


_OR_CACHE: dict[tuple[str, int], float] = {}


def _load_or_sizes() -> None:
    import duckdb
    con = duckdb.connect()
    q = f"""
      SELECT regexp_extract(filename, '([^/]+)/[^/]+\\.parquet$', 1) AS symbol,
             day, max(high) - min(low) AS size
      FROM read_parquet('{scfg.OPEN5_DIR}/*/*.parquet', filename=true)
      WHERE minute = 570
      GROUP BY 1, 2
    """
    t = con.execute(q).arrow()
    con.close()
    if hasattr(t, "read_all"):
        t = t.read_all()
    for sym, d, sz in zip(t.column("symbol").to_pylist(),
                          t.column("day").to_pylist(),
                          t.column("size").to_pylist()):
        _OR_CACHE[(str(sym), int(d))] = float(sz)


def _paired(a, b) -> tuple[float, float, float, int]:
    idx = {(t.symbol, t.day): t for t in b}
    d = [t.gross_r - idx[(t.symbol, t.day)].gross_r for t in a
         if (t.symbol, t.day) in idx]
    if len(d) < 2:
        return float("nan"), float("nan"), float("nan"), len(d)
    lo, hi = gates.mean_ci95(d)
    return float(np.mean(d)), lo, hi, len(d)


def main() -> int:
    with gzip.open(SELECTION_PATH, "rt") as f:
        sel = json.load(f)
    _load_or_sizes()
    rows = sel["rows"]
    atr = _atr_map({(r["symbol"], int(r["day"])) for r in rows})
    sip_days: dict[str, set[int]] = {}
    unf_days: dict[str, set[int]] = {}
    for r in rows:
        (sip_days if r["arm"] == ARM_SIP else unf_days).setdefault(
            r["symbol"], set()).add(int(r["day"]))

    configs = []
    for f_ in FRACTIONS:
        configs.append((f"sip@{f_}", lambda a, f_=f_: OrbStocksInPlay(a, f_), COSTS))
        configs.append((f"flip@{f_}", lambda a, f_=f_: OrbStocksInPlayCoinflip(a, f_), COSTS))
        configs.append((f"sipfree@{f_}", lambda a, f_=f_: OrbStocksInPlay(a, f_), FREE))
    print(f"sweeping {len(FRACTIONS)} stop widths over the stocks-in-play days...",
          flush=True)
    got, _, _ = _replay(sip_days, atr, configs)

    print("the same sweep on the unfiltered control...", flush=True)
    ucfg = [(f"unf@{f_}", lambda a, f_=f_: OrbStocksInPlay(a, f_), COSTS)
            for f_ in FRACTIONS]
    ugot, _, _ = _replay(unf_days, atr, ucfg)

    lo, hi = (int(x.replace("-", "")) for x in gates.SIP_REPLICATION_WINDOW)
    L: list[str] = []
    A = L.append
    A("# ENGINE-6 post-mortem — diagnostics, and not a result")
    A("")
    A("`orb_sip.v1` is **NOT REPRODUCED**; that verdict is in "
      "[`orb_sip.v1.polygon-sip-v1.md`](orb_sip.v1.polygon-sip-v1.md) and was "
      "decided by R1-R5 alone. Nothing on this page enters a gate, changes a "
      "threshold or is a result. It exists because the gate required the "
      "candidate explanations to be enumerated and, where cheap, measured — and "
      "because a replication that fails in the OPPOSITE sign to the published "
      "claim is either a finding about the market, about our machinery, or "
      "about our reading of the spec, and those three have to be separated.")
    A("")
    A("## The sweep")
    A("")
    A("One number moves: the stop, as a fraction of the 14-day ATR. The "
      "published spec is 10%, which is the first row and is the only row that "
      "was evaluated. The last row's stop is 100x the ATR and can essentially "
      "never be hit, so every trade runs to the close.")
    A("")
    A("The identity that makes this readable: **signed move from entry to the "
      "close, in ATR = mean gross R x stop fraction**. The last column applies "
      "it, so the bottom row is the pure directional edge of the entry rule "
      "with the stop taken out of the question.")
    A("")
    A("| stop | arm | n | stopped | hit | mean gross R | median gross R | mean winner R | mean net R | signed move, ATR |")
    A("|---|---|---|---|---|---|---|---|---|---|")
    for f_ in FRACTIONS:
        for label, key, src in (("stocks in play", f"sip@{f_}", got),
                                ("coin flip", f"flip@{f_}", got),
                                ("unfiltered", f"unf@{f_}", ugot)):
            s = _stats(_window(src[key], lo, hi))
            if not s["n"]:
                continue
            A(f"| {f_:g}x ATR | {label} | {s['n']:,} | {s['stopped']:.1%} | "
              f"{s['hit']:.1%} | {fmt(s['gross_mean'],4)} | "
              f"{fmt(s['gross_median'],4)} | {fmt(s['mean_winner'],2)} | "
              f"{fmt(s['net_mean'],4)} | {fmt(s['gross_mean']*f_,4)} |")
    A("")
    A("## Model minus coin flip, paired, gross, at each stop width")
    A("")
    A("Same symbols, same days, same 09:35 decision, same stop distance. Only "
      "the direction call differs.")
    A("")
    A("| stop | pairs | model − control | 95% |")
    A("|---|---|---|---|")
    for f_ in FRACTIONS:
        m, l, h, n = _paired(_window(got[f"sip@{f_}"], lo, hi),
                             _window(got[f"flip@{f_}"], lo, hi))
        A(f"| {f_:g}x ATR | {n:,} | {fmt(m,4)} | {fmt(l,4)} to {fmt(h,4)} |")
    A("")
    A("## Stocks in play minus unfiltered, at each stop width")
    A("")
    A("Unpaired, gross, replication window. The paper's claim is that this "
      "difference is where the entire result comes from.")
    A("")
    A("| stop | in play | unfiltered | difference | 95% |")
    A("|---|---|---|---|---|")
    for f_ in FRACTIONS:
        a = np.array([t.gross_r for t in _window(got[f"sip@{f_}"], lo, hi)])
        b = np.array([t.gross_r for t in _window(ugot[f"unf@{f_}"], lo, hi)])
        if len(a) < 2 or len(b) < 2:
            continue
        d = float(a.mean() - b.mean())
        se = float(np.sqrt(a.var(ddof=1) / len(a) + b.var(ddof=1) / len(b)))
        A(f"| {f_:g}x ATR | {fmt(float(a.mean()),4)} | {fmt(float(b.mean()),4)} | "
          f"{fmt(d,4)} | {fmt(d-1.96*se,4)} to {fmt(d+1.96*se,4)} |")
    A("")
    A("## How wide is the opening candle, in ATR?")
    A("")
    A("The brief's own table records that the companion ETF paper stops at the "
      "**opposite extreme of the first candle** rather than at a fraction of "
      "the ATR. Those two readings are the same rule only if the opening "
      "candle happens to be a tenth of an ATR wide. It is not, and the "
      "difference is the whole result — so here is the number.")
    A("")
    from engine.sip.store import load_open_store
    from engine.sip import universe as _u
    store = load_open_store()
    tab = _u.eligible_table()
    ratios = []
    for r in rows:
        if r["arm"] != ARM_SIP:
            continue
        d = int(r["day"])
        if not (lo <= d <= hi):
            continue
        row = tab.get(d)
        if row is None:
            continue
        j = store._at(r["symbol"], d)  # noqa: SLF001
        if j is None:
            continue
        a = atr.get((r["symbol"], d))
        if not a:
            continue
        ratios.append(float(_or_size(store, r["symbol"], d)) / a)
    ratios = np.array([x for x in ratios if np.isfinite(x) and x > 0])
    if len(ratios):
        A(f"Over {len(ratios):,} selected symbol-days in the replication window, "
          f"the 09:30-09:35 candle's high-to-low range is a median "
          f"**{np.median(ratios):.2f}x the 14-day ATR** "
          f"(p10 {np.quantile(ratios,0.1):.2f}x, p90 {np.quantile(ratios,0.9):.2f}x).")
        A("")
        A(f"So a stop at the opposite extreme of the opening candle is about "
          f"**{np.median(ratios)/0.10:.0f}x wider** than a stop at 10% of the "
          "ATR, and it lands in the part of the sweep above where this shape "
          "stops losing. Which of the two readings the published spec meant is "
          "not a detail; it decides the sign of the answer.")
        A("")
    A("## Costs")
    A("")
    A("| stop | with costs | zero cost | cost drag |")
    A("|---|---|---|---|")
    for f_ in FRACTIONS:
        a = _stats(_window(got[f"sip@{f_}"], lo, hi))
        b = _stats(_window(got[f"sipfree@{f_}"], lo, hi))
        if not a["n"] or not b["n"]:
            continue
        A(f"| {f_:g}x ATR | {fmt(a['net_mean'],4)} | {fmt(b['net_mean'],4)} | "
          f"{fmt(b['net_mean']-a['net_mean'],4)} |")
    A("")
    payload = {"or_atr_median": float(np.median(ratios)) if len(ratios) else None,
               "sweep": {}}
    for f_ in FRACTIONS:
        sp = _stats(_window(got[f"sip@{f_}"], lo, hi))
        fl = _stats(_window(got[f"flip@{f_}"], lo, hi))
        un = _stats(_window(ugot[f"unf@{f_}"], lo, hi))
        fr = _stats(_window(got[f"sipfree@{f_}"], lo, hi))
        a = np.array([t.gross_r for t in _window(got[f"sip@{f_}"], lo, hi)])
        b = np.array([t.gross_r for t in _window(ugot[f"unf@{f_}"], lo, hi)])
        d = float(a.mean() - b.mean()) if len(a) and len(b) else float("nan")
        se = (float(np.sqrt(a.var(ddof=1) / len(a) + b.var(ddof=1) / len(b)))
              if len(a) > 1 and len(b) > 1 else float("nan"))
        m, l_, h_, n_ = _paired(_window(got[f"sip@{f_}"], lo, hi),
                                _window(got[f"flip@{f_}"], lo, hi))
        payload["sweep"][str(f_)] = {
            "sip": sp, "flip": fl, "unfiltered": un, "sip_zero_cost": fr,
            "vs_unfiltered": d, "vs_unfiltered_lo": d - 1.96 * se,
            "vs_unfiltered_hi": d + 1.96 * se,
            "paired_vs_flip": m, "paired_lo": l_, "paired_hi": h_, "pairs": n_,
        }
    OUT_JSON.parent.mkdir(parents=True, exist_ok=True)
    OUT_JSON.write_text(json.dumps(payload, indent=1))
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text("\n".join(L) + "\n")
    print("\n".join(L))
    print(f"\nwrote {OUT}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
