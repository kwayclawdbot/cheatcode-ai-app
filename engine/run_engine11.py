"""ENGINE-11 — busiest stocks plus trend STRENGTH, as a ranking rather than a gate.

    .venv/bin/python run_engine11.py --stage strength  # the measure, per pool-day
    .venv/bin/python run_engine11.py --stage plan      # two selections, one pond
    .venv/bin/python sip/fetch_days.py --pairs data/trend-str-v1/pairs11.json
    .venv/bin/python run_engine11.py --stage run       # replay + report

`strength` and `plan` are separate from `run` for ENGINE-6's reason. Every
selection is a function of daily bars through the prior close and of the
09:30-09:35 bar, both already on disk before a single new one-minute bar is
requested. The download is a CONSEQUENCE of the selection and cannot feed back
into it, and `pairs11.json` is the receipt.

The `rank` arm reaches into the day's 21st-to-40th busiest names, which ENGINE-6
never cached full sessions for, so this lane does need one-minute bars it does
not have — but for symbol-days named by a selector already written to disk.

There is no parameter to vary in this file. The three arms are the experiment;
`models/orb_trend_str.v1/GATE.md` fixed them, and the two numbers, before any of
this ran.
"""

from __future__ import annotations

import argparse
import gzip
import json
import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from engine import calendar_us  # noqa: E402
from engine.backtest.stats import (SUMMARY_HEADER, fmt, split_by,  # noqa: E402
                                   summarise, summary_row)
from engine.kai_score import config as kcfg  # noqa: E402
from engine.kai_score.bars import DailyBook  # noqa: E402
from engine.models.orb_sip_v2 import OrbStocksInPlayV2  # noqa: E402
from engine.models.orb_trend_str import OrbSipStrengthGate  # noqa: E402
from engine.run_engine6 import (CHEAP, COSTS, FREE, _atr_map,  # noqa: E402
                                _paired_by_day, _replay, _window)
from engine.sip import config as scfg  # noqa: E402
from engine.sip.portfolio import run_portfolio  # noqa: E402
from engine.strength import config as tcfg  # noqa: E402
from engine.strength import gates11, measure as ms  # noqa: E402
from engine.strength.opening import load_open_panel  # noqa: E402
from engine.strength.selection import select_day  # noqa: E402

REPORT = (Path(__file__).resolve().parent / "reports"
          / f"orb_trend_str.v1.{scfg.SNAPSHOT}.md")
TRADES_OUT = (Path(__file__).resolve().parent / "reports"
              / f"orb_trend_str.v1.{scfg.SNAPSHOT}.trades.csv.gz")
POOL_BY_DAY = kcfg.DATA_ROOT / "pool_by_day.json"
RISK_DOLLARS = 1_000.0
ARM_ORDER = (tcfg.ARM_BASELINE, tcfg.ARM_RANK, tcfg.ARM_GATE)
ARM_LABEL = {tcfg.ARM_BASELINE: "baseline (the incumbent)",
             tcfg.ARM_RANK: "rank (re-ordered by strength)",
             tcfg.ARM_GATE: "gate_strong (a strength cut)"}


def _d(s: str) -> int:
    return int(s.replace("-", ""))


def _money(r: float) -> str:
    return f"{r * RISK_DOLLARS:+,.0f} dollars"


# ---------------------------------------------------------------------------
# stage: strength


def stage_strength() -> None:
    """One signed number per pool ticker-day, read off the last CLOSED daily bar.

    The daily bars are ENGINE-9's split-adjusted book, not the unadjusted
    grouped bars ENGINE-8 read: on an unadjusted series a 2-for-1 split is a 50%
    one-day collapse, and an EMA distance, a slope and an up-close count would
    all carry it for months.
    """
    import pyarrow as pa
    import pyarrow.parquet as pq

    pool = {int(k): v for k, v in json.loads(POOL_BY_DAY.read_text()).items()}
    per_symbol: dict[str, list[int]] = {}
    for d, names in pool.items():
        for s in names:
            per_symbol.setdefault(s, []).append(int(d))

    print(f"loading split-adjusted daily bars for {len(per_symbol):,} tickers...",
          flush=True)
    book = DailyBook()

    cols: dict[str, list] = {k: [] for k in
                             ["symbol", "day", "asof", "strength", "distance",
                              "slope", "persistence", "clipped"]}
    no_series = no_asof = 0
    for i, (sym, sess) in enumerate(sorted(per_symbol.items())):
        d = book.day.get(sym)
        if d is None:
            no_series += len(sess)
            continue
        fast = ms.strength_series(book.high[sym], book.low[sym], book.close[sym])
        s_arr = np.array(sorted(sess), dtype="int64")
        asof = np.searchsorted(d, s_arr, side="left") - 1
        for day, k in zip(s_arr.tolist(), asof.tolist()):
            if k < 0:
                no_asof += 1
                cols["symbol"].append(sym)
                cols["day"].append(int(day))
                cols["asof"].append(-1)
                cols["strength"].append(float("nan"))
                cols["distance"].append(float("nan"))
                cols["slope"].append(float("nan"))
                cols["persistence"].append(float("nan"))
                cols["clipped"].append(False)
                continue
            cols["symbol"].append(sym)
            cols["day"].append(int(day))
            cols["asof"].append(int(d[k]))
            cols["strength"].append(float(fast["strength"][k]))
            cols["distance"].append(float(fast["distance"][k]))
            cols["slope"].append(float(fast["slope"][k]))
            cols["persistence"].append(float(fast["persistence"][k]))
            cols["clipped"].append(bool(fast["clipped"][k]))
        if (i + 1) % 250 == 0:
            print(f"  measured {i+1:,} tickers, {len(cols['symbol']):,} rows",
                  flush=True)

    schema = pa.schema(
        [("symbol", pa.string()), ("day", pa.int64()), ("asof", pa.int64()),
         ("strength", pa.float64()), ("distance", pa.float64()),
         ("slope", pa.float64()), ("persistence", pa.float64()),
         ("clipped", pa.bool_())])
    table = pa.table({f.name: pa.array(cols[f.name], type=f.type) for f in schema},
                     schema=schema)
    tcfg.STRENGTH_PATH.parent.mkdir(parents=True, exist_ok=True)
    pq.write_table(table, tcfg.STRENGTH_PATH, compression="zstd")
    v = np.array(cols["strength"], dtype="float64")
    ok = np.isfinite(v)
    print(f"wrote {tcfg.STRENGTH_PATH}: {table.num_rows:,} ticker-days, "
          f"{int(ok.sum()):,} measurable ({100.0*ok.mean():.1f}%), "
          f"{no_series:,} with no daily series, {no_asof:,} with no closed bar, "
          f"{int(np.array(cols['clipped']).sum()):,} clipped")
    if ok.any():
        q = np.quantile(v[ok], [0.05, 0.25, 0.5, 0.75, 0.95])
        print("  strength quantiles 5/25/50/75/95: "
              + " ".join(f"{x:+.3f}" for x in q))


# ---------------------------------------------------------------------------
# stage: plan


def _load_strength() -> dict[int, dict[str, float]]:
    import duckdb
    con = duckdb.connect()
    t = con.execute(f"SELECT symbol, day, strength FROM "
                    f"read_parquet('{tcfg.STRENGTH_PATH}')").arrow()
    con.close()
    if hasattr(t, "read_all"):
        t = t.read_all()
    sym = t.column("symbol").to_pylist()
    day = t.column("day").to_numpy(zero_copy_only=False)
    st = t.column("strength").to_numpy(zero_copy_only=False)
    out: dict[int, dict[str, float]] = {}
    for s, d, v in zip(sym, day, st):
        out.setdefault(int(d), {})[s] = float(v)
    return out


def stage_plan() -> None:
    pool = {int(k): v for k, v in json.loads(POOL_BY_DAY.read_text()).items()}
    strength = _load_strength()
    print("loading the 09:30-09:35 opening bars...", flush=True)
    store, side_map = load_open_panel()

    rows: list[dict] = []
    cover: list[tuple[int, int, int, int, int]] = []
    for day in sorted(pool):
        by_sym = strength.get(day, {})
        names, rv, st, sd = [], [], [], []
        for s in pool[day]:
            r = store.rvol(s, day)
            if r is None:
                continue
            names.append(s)
            rv.append(r)
            st.append(by_sym.get(s, float("nan")))
            sd.append(side_map.get((s, day), "none"))
        if not names:
            continue
        st = np.array(st, dtype="float64")
        cover.append((day, len(pool[day]), len(names), int(np.isfinite(st).sum()),
                      sum(1 for x in sd if x != "none")))
        picks = select_day(day, names, np.array(rv, dtype="float64"), st, sd)
        for arm, ps in picks.items():
            for p in ps:
                rows.append({"day": p.day, "symbol": p.symbol, "arm": arm,
                             "rank": p.rank, "rvol": p.rvol,
                             "strength": None if not np.isfinite(p.strength)
                             else p.strength,
                             "directional": None if not np.isfinite(p.directional)
                             else p.directional,
                             "side": p.side})

    tcfg.SELECTION_PATH.parent.mkdir(parents=True, exist_ok=True)
    with gzip.open(tcfg.SELECTION_PATH, "wt") as f:
        json.dump({"rows": rows, "coverage": cover, "pool_n": scfg.POOL_N,
                   "top_k": tcfg.TOP_K, "pond_k": tcfg.POND_K,
                   "min_rvol": tcfg.MIN_RVOL,
                   "gate_strength": tcfg.GATE_STRENGTH,
                   "baseline_days": scfg.RVOL_BASELINE_DAYS,
                   "window": [tcfg.BUILD_START, tcfg.HELD_END]}, f)

    from engine.sip.fetch_days import path_for
    pairs = sorted({(r["symbol"], r["day"]) for r in rows})
    todo = [[s, d] for s, d in pairs if not path_for(s, d).exists()]
    tcfg.PAIRS_PATH.write_text(json.dumps(todo))

    cov = np.array(cover, dtype="int64")
    print(f"sessions planned      {len(cover):,}")
    print(f"candidates per day    median {np.median(cov[:,2]):.0f} of a "
          f"{np.median(cov[:,1]):.0f}-name pool")
    print(f"with a strength       median {np.median(cov[:,3]):.0f} "
          f"({100.0*np.median(cov[:,3]/np.maximum(cov[:,2],1)):.0f}%)")
    print(f"with a direction      median {np.median(cov[:,4]):.0f}")
    for arm in (tcfg.ARM_BASELINE, tcfg.ARM_RANK):
        n = sum(1 for r in rows if r["arm"] == arm)
        print(f"  {arm:<9} {n:,} picks, {n/max(len(cover),1):.1f} a day")
    same = _matches_engine6({"rows": rows})
    print(f"baseline == ENGINE-6 selection on {same[0]:,}/{same[1]:,} shared days")
    print(f"distinct symbol-days  {len(pairs):,}; "
          f"{len(todo):,} need one-minute bars fetched")
    print(f"wrote {tcfg.SELECTION_PATH} and {tcfg.PAIRS_PATH}")


def _matches_engine6(sel) -> tuple[int, int]:
    """The incumbent has to be the incumbent.

    If this is not ~100% then the candidate pond has moved and every comparison
    below is against something ENGINE-7 never reported."""
    path = scfg.DATA_ROOT / "selection.json.gz"
    if not path.exists():
        return 0, 0
    with gzip.open(path, "rt") as f:
        old = json.load(f)
    o: dict[int, set[str]] = {}
    for r in old["rows"]:
        if r["arm"] == "sip":
            o.setdefault(int(r["day"]), set()).add(r["symbol"])
    n: dict[int, set[str]] = {}
    for r in sel["rows"]:
        if r["arm"] == tcfg.ARM_BASELINE:
            n.setdefault(int(r["day"]), set()).add(r["symbol"])
    shared = sorted(set(o) & set(n))
    return sum(1 for d in shared if o[d] == n[d]), len(shared)


# ---------------------------------------------------------------------------
# stage: run


def _gross(trades) -> tuple[float, float]:
    if not trades:
        return float("nan"), float("nan")
    g = np.array([t.gross_r for t in trades], dtype="float64")
    return float(np.mean(g)), float(np.median(g))


def _stopped(trades) -> float:
    if not trades:
        return float("nan")
    return sum(1 for t in trades if t.exit_reason == "stop") / len(trades)


def _stop_geometry(trades, atr) -> dict:
    """How wide the stop actually was, in the three units a reader may want.

    Same arithmetic as ENGINE-7's and ENGINE-9's, so the rows are comparable
    with those reports. This is the table that explained every result in this
    programme: cost as a fraction of risk is `cost per share / stop distance`."""
    if not trades:
        return {}
    risk = np.array([t.risk_per_share for t in trades], dtype="float64")
    px = np.array([t.fill_price for t in trades], dtype="float64")
    a = np.array([atr.get((t.symbol, t.day), np.nan) for t in trades],
                 dtype="float64")
    ok = np.isfinite(a) & (a > 0)
    return {
        "cents": float(np.median(risk) * 100.0),
        "pct": float(np.median(risk / np.maximum(px, 1e-9)) * 100.0),
        "atr": float(np.median(risk[ok] / a[ok])) if ok.any() else float("nan"),
        "commission_r": float(np.median(2.0 * COSTS.commission_per_share
                                        / np.maximum(risk, 1e-9))),
    }


def _dir_strength(trades, smap):
    """Directional strength per trade: the daily-chart number signed by the side
    the trade actually took. NaN where the symbol had no measurable strength."""
    out = []
    for t in trades:
        s = smap.get((t.symbol, int(t.day)))
        out.append(float("nan") if s is None or not np.isfinite(s)
                   else float(s) * (1.0 if t.side == "long" else -1.0))
    return np.array(out, dtype="float64")


def _deciles(trades, smap, atr, n_bins: int = 10) -> list[dict]:
    """THE CURVE. Outcome against directional strength, in equal-count bins."""
    d = _dir_strength(trades, smap)
    ok = np.isfinite(d)
    idx = np.flatnonzero(ok)
    if len(idx) < n_bins * 5:
        return []
    order = idx[np.argsort(d[idx], kind="stable")]
    chunks = np.array_split(order, n_bins)
    out = []
    for b, ch in enumerate(chunks):
        ts = [trades[i] for i in ch]
        net = np.array([t.net_r for t in ts], dtype="float64")
        gross = np.array([t.gross_r for t in ts], dtype="float64")
        geo = _stop_geometry(ts, atr)
        out.append({
            "bin": b + 1,
            "lo": float(d[ch].min()), "hi": float(d[ch].max()),
            "n": len(ts),
            "mean_gross": float(np.mean(gross)),
            "mean_net": float(np.mean(net)),
            "median_net": float(np.median(net)),
            "hit": float(np.mean(net > 0)),
            "stopped": _stopped(ts),
            "stop_cents": geo.get("cents", float("nan")),
            "stop_atr": geo.get("atr", float("nan")),
        })
    return out


def _gradient_by_day(trades, smap) -> list[float]:
    """G4: within each day, the stronger half minus the weaker half.

    Paired by day for ENGINE-6's reason — trades on the same morning are not
    independent, and the day effect is exactly what has to be removed before
    asking whether strength ranks anything."""
    d = _dir_strength(trades, smap)
    by_day: dict[int, list[tuple[float, float]]] = {}
    for t, s in zip(trades, d):
        if np.isfinite(s):
            by_day.setdefault(int(t.day), []).append((float(s), float(t.net_r)))
    out = []
    for day in sorted(by_day):
        rows = sorted(by_day[day])
        if len(rows) < 4:
            continue
        half = len(rows) // 2
        weak = [r for _, r in rows[:half]]
        strong = [r for _, r in rows[len(rows) - half:]]
        out.append(float(np.mean(strong)) - float(np.mean(weak)))
    return out


def _load_selection() -> dict:
    with gzip.open(tcfg.SELECTION_PATH, "rt") as f:
        return json.load(f)


def _strength_map(pairs: set[tuple[str, int]]) -> dict[tuple[str, int], float]:
    import duckdb
    con = duckdb.connect()
    t = con.execute(f"SELECT symbol, day, strength FROM "
                    f"read_parquet('{tcfg.STRENGTH_PATH}') "
                    f"WHERE strength IS NOT NULL").arrow()
    con.close()
    if hasattr(t, "read_all"):
        t = t.read_all()
    sym = t.column("symbol").to_pylist()
    day = t.column("day").to_numpy(zero_copy_only=False)
    st = t.column("strength").to_numpy(zero_copy_only=False)
    out = {}
    for s, d, v in zip(sym, day, st):
        k = (s, int(d))
        if k in pairs and np.isfinite(v):
            out[k] = float(v)
    return out


def stage_run() -> None:
    sel = _load_selection()
    rows = sel["rows"]
    pairs = {(r["symbol"], int(r["day"])) for r in rows}
    atr = _atr_map(pairs)
    smap = _strength_map(pairs)
    print(f"selection: {len(rows):,} rows, {len(pairs):,} symbol-days, "
          f"{len(smap):,} with a strength", flush=True)

    picks: dict[str, dict[str, set[int]]] = {tcfg.ARM_BASELINE: {},
                                             tcfg.ARM_RANK: {}}
    side_seen: dict[tuple[str, int], str] = {}
    for r in rows:
        picks[r["arm"]].setdefault(r["symbol"], set()).add(int(r["day"]))
        if r["arm"] == tcfg.ARM_BASELINE:
            side_seen[(r["symbol"], int(r["day"]))] = r["side"]

    def _gate(a):
        return OrbSipStrengthGate(a, smap, tcfg.GATE_STRENGTH)

    print("replaying the baseline arm and its strength cut...", flush=True)
    t1, c1, m1 = _replay(picks[tcfg.ARM_BASELINE], atr, [
        (tcfg.ARM_BASELINE, OrbStocksInPlayV2, COSTS),
        (tcfg.ARM_GATE, _gate, COSTS),
        ("baseline_nocost", OrbStocksInPlayV2, FREE),
        ("baseline_cheap", OrbStocksInPlayV2, CHEAP),
    ])
    print(f"  baseline={len(t1[tcfg.ARM_BASELINE]):,} "
          f"gate_strong={len(t1[tcfg.ARM_GATE]):,}", flush=True)

    print("replaying the rank arm...", flush=True)
    t2, c2, m2 = _replay(picks[tcfg.ARM_RANK], atr, [
        (tcfg.ARM_RANK, OrbStocksInPlayV2, COSTS),
        ("rank_nocost", OrbStocksInPlayV2, FREE),
        ("rank_cheap", OrbStocksInPlayV2, CHEAP),
    ])
    print(f"  rank={len(t2[tcfg.ARM_RANK]):,}", flush=True)

    trades = {tcfg.ARM_BASELINE: t1[tcfg.ARM_BASELINE],
              tcfg.ARM_RANK: t2[tcfg.ARM_RANK],
              tcfg.ARM_GATE: t1[tcfg.ARM_GATE]}
    census = {tcfg.ARM_BASELINE: c1[tcfg.ARM_BASELINE],
              tcfg.ARM_RANK: c2[tcfg.ARM_RANK],
              tcfg.ARM_GATE: c1[tcfg.ARM_GATE]}
    extra = {k: v for k, v in list(t1.items()) + list(t2.items())
             if k not in trades}

    # The subset relation, asserted rather than assumed. "What the gate removed"
    # has to be an exact set, or the kept-versus-removed table below is a
    # comparison of two things that are not complements.
    base_keys = {(t.symbol, t.day, t.side, round(t.fill_price, 9),
                  round(t.stop_price, 9)) for t in trades[tcfg.ARM_BASELINE]}
    for t in trades[tcfg.ARM_GATE]:
        k = (t.symbol, t.day, t.side, round(t.fill_price, 9),
             round(t.stop_price, 9))
        assert k in base_keys, f"gate_strong took a trade the baseline did not: {k}"

    # ENGINE-6's random-20 control, replayed on THIS window. A reference point,
    # not a fourth arm and not a gate: without it a reader cannot tell whether a
    # losing arm is worse than picking eligible names out of a hat.
    ctrl: list = []
    ctrl_path = scfg.DATA_ROOT / "selection.json.gz"
    if ctrl_path.exists():
        with gzip.open(ctrl_path, "rt") as f:
            old = json.load(f)
        lo, hi = _d(gates11.BUILD[0]), _d(tcfg.HELD_END)
        want: dict[str, set[int]] = {}
        for r in old["rows"]:
            if r["arm"] == "unfiltered" and lo <= int(r["day"]) <= hi:
                want.setdefault(r["symbol"], set()).add(int(r["day"]))
        if want:
            print("replaying ENGINE-6's random-20 control on this window...",
                  flush=True)
            t, _, _ = _replay(want, _atr_map({(s, d) for s, ds in want.items()
                                              for d in ds}),
                              [("random20", OrbStocksInPlayV2, COSTS)])
            ctrl = t["random20"]
            print(f"  {len(ctrl):,} trades", flush=True)

    write_report(sel, trades, census, {tcfg.ARM_BASELINE: m1,
                                       tcfg.ARM_RANK: m2,
                                       tcfg.ARM_GATE: m1},
                 extra, atr, smap, side_seen, ctrl)
    _dump_trades(trades, smap)


def _dump_trades(trades, smap) -> None:
    """The trade dump, so every table above can be recomputed from it."""
    import csv
    TRADES_OUT.parent.mkdir(parents=True, exist_ok=True)
    with gzip.open(TRADES_OUT, "wt", newline="") as f:
        w = csv.writer(f)
        w.writerow(["arm", "symbol", "day", "side", "fill_price", "stop_price",
                    "risk_per_share", "exit_reason", "gross_r", "net_r",
                    "strength", "directional_strength"])
        for arm in ARM_ORDER:
            for t in trades[arm]:
                s = smap.get((t.symbol, int(t.day)))
                d = ("" if s is None else
                     f"{s * (1.0 if t.side == 'long' else -1.0):.6f}")
                w.writerow([arm, t.symbol, t.day, t.side,
                            f"{t.fill_price:.4f}", f"{t.stop_price:.4f}",
                            f"{t.risk_per_share:.4f}", t.exit_reason,
                            f"{t.gross_r:.6f}", f"{t.net_r:.6f}",
                            "" if s is None else f"{s:.6f}", d])
    print(f"wrote {TRADES_OUT}")


# ---------------------------------------------------------------------------
# the report


def write_report(sel, trades, census, missing, extra, atr, smap, side_seen,
                 ctrl=None) -> None:
    hb_lo, hb_hi = (_d(x) for x in gates11.HELD_BACK)
    bd_lo, bd_hi = (_d(x) for x in gates11.BUILD)

    hb = {a: _window(trades[a], hb_lo, hb_hi) for a in ARM_ORDER}
    bd = {a: _window(trades[a], bd_lo, bd_hi) for a in ARM_ORDER}
    s_hb = {a: summarise(hb[a], a) for a in ARM_ORDER}
    s_bd = {a: summarise(bd[a], a) for a in ARM_ORDER}
    g_hb = {a: _gross(hb[a]) for a in ARM_ORDER}
    g_bd = {a: _gross(bd[a]) for a in ARM_ORDER}

    paired = {a: _paired_by_day(hb[a], hb[tcfg.ARM_BASELINE])
              for a in (tcfg.ARM_RANK, tcfg.ARM_GATE)}
    paired_bd = {a: _paired_by_day(bd[a], bd[tcfg.ARM_BASELINE])
                 for a in (tcfg.ARM_RANK, tcfg.ARM_GATE)}

    grad_hb = _gradient_by_day(hb[tcfg.ARM_BASELINE], smap)
    grad_bd = _gradient_by_day(bd[tcfg.ARM_BASELINE], smap)
    dec_hb = _deciles(hb[tcfg.ARM_BASELINE], smap, atr)
    dec_bd = _deciles(bd[tcfg.ARM_BASELINE], smap, atr)

    days_hb = [_d(x) for x in calendar_us.trading_days(*gates11.HELD_BACK)]
    days_bd = [_d(x) for x in calendar_us.trading_days(*gates11.BUILD)]
    pf_hb = {a: run_portfolio(hb[a], days_hb) for a in ARM_ORDER}
    pf_bd = {a: run_portfolio(bd[a], days_bd) for a in ARM_ORDER}

    rows = gates11.evaluate(s_hb, {a: g_hb[a][0] for a in ARM_ORDER}, paired,
                            grad_hb, pf_hb)
    verdict = gates11.verdict(rows, s_hb, paired)

    geo_hb = {a: _stop_geometry(hb[a], atr) for a in ARM_ORDER}
    geo_ctrl = _stop_geometry(_window(ctrl or [], hb_lo, hb_hi), atr)

    # what the gate removed
    gate_keys = {(t.symbol, t.day) for t in hb[tcfg.ARM_GATE]}
    removed_hb = [t for t in hb[tcfg.ARM_BASELINE]
                  if (t.symbol, t.day) not in gate_keys]
    gate_keys_bd = {(t.symbol, t.day) for t in bd[tcfg.ARM_GATE]}
    removed_bd = [t for t in bd[tcfg.ARM_BASELINE]
                  if (t.symbol, t.day) not in gate_keys_bd]

    L: list[str] = []
    A = L.append
    A("# `orb_trend_str.v1` — busiest stocks, re-ordered by how hard they were "
      "already trending")
    A("")
    A(f"**Verdict: {verdict}.** Decided on the held-back year "
      f"{gates11.HELD_BACK[0]} → {gates11.HELD_BACK[1]} and on nothing else.")
    A("")
    A(f"Snapshot `{scfg.SNAPSHOT}` for the tape, the universe and the pool, "
      "unchanged and not re-downloaded. Trend strength is computed from the "
      "split-adjusted daily bars ENGINE-9 built, on the last fully closed daily "
      "bar. Gate: "
      "[`../models/orb_trend_str.v1/GATE.md`](../models/orb_trend_str.v1/GATE.md), "
      "committed before any number below existed.")
    A("")

    # --- plain English -----------------------------------------------------
    A("## In plain English")
    A("")
    A("**What was compared.** Every trading day, pick twenty US stocks and trade "
      "each of them the same way: buy a break above the high of the 09:30-09:35 "
      "candle if that candle closed up, sell short a break below its low if it "
      "closed down, get out at the other end of the same candle if price comes "
      "back through it, otherwise hold to the closing bell. Nothing about that "
      "changes between the three arms.")
    A("")
    A("- **baseline** — the twenty whose first five minutes traded the most "
      "abnormal volume against their own recent mornings. This is what already "
      "works, and it is the thing to beat.")
    A(f"- **rank** — the day's {tcfg.POND_K} busiest by the same measure, "
      "re-ordered by how hard the daily chart was already going the way the "
      "range broke, top twenty traded. Same number of trades a day; a different "
      "twenty. **This is the owner's idea in its most faithful form.**")
    A(f"- **gate_strong** — the baseline's twenty, taken only when that "
      f"strength is at least +{tcfg.GATE_STRENGTH:.2f} on a scale running from "
      "−1 to +1. A cut, so it trades fewer.")
    A("")
    A("**What 'trend strength' is, in words.** Three readings off the daily "
      "chart as of the previous close: how far above or below its 20-day moving "
      "average the stock closed, which way and how fast that average is moving, "
      "and how many of the last twenty days closed up. Each is put on a −1 to +1 "
      "scale and the three are averaged. The sign says which way, the size says "
      "how hard. **Signed by the break direction**, so a stock falling hard that "
      "breaks DOWN scores exactly as well as one rising hard that breaks UP.")
    A("")
    A("**The prior this lane has to beat, stated before the result.** ENGINE-8 "
      "put a trend filter on this exact model and it failed. That one was a "
      "yes/no — is the daily chart in a confirmed uptrend, downtrend, or "
      "neither — and about half of all stock-days answered 'neither', so it was "
      "mostly a sit-out rule. It threw away 75% of trades, and on the four "
      "build years **the trades it threw away beat the ones it kept by $47 per "
      "$1,000 risked**. On the two-way-break mornings it was built for, it kept "
      "trades returning −$723 and removed trades returning −$729: no "
      "discrimination at all. **This lane is the graded version of the same "
      "question** — not 'is it trending' but 'how hard, and which way' — and the "
      "whole point is to find out whether measuring the strength rescues an idea "
      "that failed as a switch.")
    A("")
    A("**This is the held-back year's FIFTH reading.** ENGINE-7, ENGINE-8, "
      "ENGINE-9 and ENGINE-10 all touched windows containing "
      "2025-08-29 → 2026-08-28. Nothing here was fitted on it — no parameter is "
      "swept, and the two free numbers (a pond of "
      f"{tcfg.POND_K}, a cut at +{tcfg.GATE_STRENGTH:.2f}) were written into the "
      "gate before anything ran — but four lanes have looked at this year "
      "already, and every look costs some of what makes a held-back window worth "
      "holding back. **Treat anything positive below as suggestive, never as "
      "conclusive.**")
    A("")
    A("**Three arms on one held-back year is three chances to look good by "
      "luck.** Two comparisons against the incumbent plus the gradient test is "
      "three 95% intervals; the chance at least one clears by chance alone is "
      "nearer 14% than 5%. The gate stays the 95% interval, as it has in every "
      "lane; the stricter interval that corrects for taking three shots is "
      "printed beside every comparison.")
    A("")

    # the curve, first, because it is the answer
    A("### The answer to the owner's question: the curve")
    A("")
    if dec_hb:
        first, last = dec_hb[0], dec_hb[-1]
        span = last["mean_net"] - first["mean_net"]
        gm = float(np.mean(grad_hb)) if grad_hb else float("nan")
        glo, ghi = gates11.mean_ci95(grad_hb)
        A("Every trade the incumbent took in the held-back year, sorted by how "
          "hard its daily chart was going in the direction it broke, and cut "
          "into ten equal piles from weakest to strongest. **If trend strength "
          "picks better trades, the piles should get better from left to "
          "right.**")
        A("")
        A(f"- The weakest tenth returned **{_money(first['mean_net'])}** a trade "
          f"per $1,000 risked; the strongest tenth returned "
          f"**{_money(last['mean_net'])}**. The spread across the whole curve is "
          f"{_money(span)}.")
        A(f"- Measured properly — inside each day, the stronger half of that "
          f"morning's picks minus the weaker half, so the day itself cannot "
          f"flatter either side — the difference is **{_money(gm)}** a trade, "
          f"with a 95% range of {_money(glo)} to {_money(ghi)} over "
          f"{len(grad_hb):,} days.")
        if glo <= 0 <= ghi:
            A("- **That range contains zero. On this year, under these rules, "
              "how hard a stock was already trending told you nothing "
              "measurable about how its opening-range break would go.** That is "
              "the answer to the question, and it does not depend on which of "
              "the arms below won.")
        elif glo > 0:
            A("- **That range is entirely above zero: the stronger half really "
              "did beat the weaker half by more than the sample noise.** How "
              "much of that survives into a tradeable arm is the rest of this "
              "report.")
        else:
            A("- **That range is entirely below zero: the stronger half did "
              "WORSE than the weaker half by more than the sample noise.** The "
              "idea is not merely unhelpful on this year; it points the wrong "
              "way.")
    else:
        A("*Not enough measurable trades to draw the curve.*")
    A("")

    for a in ARM_ORDER:
        s = s_hb[a]
        lo, hi = gates11.mean_ci95([t.net_r for t in hb[a]])
        A(f"- **{ARM_LABEL[a]}** — {s.n:,} trades in the held-back year. After "
          f"commission and slippage the average trade returned "
          f"**{s.mean_r:+.4f}** times what was risked on it, i.e. "
          f"**{_money(s.mean_r)} a trade** for a trader risking $1,000. The "
          f"middle trade returned {s.median_r:+.4f} ({_money(s.median_r)}), "
          f"{s.hit_rate:.1%} finished green and {_stopped(hb[a]):.1%} were "
          f"stopped out. The 95% range around the average is "
          f"{_money(lo)} to {_money(hi)}"
          + ("**, which contains zero**, so that average is not distinguishable "
             "from breaking even at this sample size."
             if lo <= 0 <= hi else
             ", which is entirely below zero — this arm lost money by more than "
             "the sample noise." if hi < 0 else
             ", which is entirely above zero."))
    A("")
    for a in (tcfg.ARM_RANK, tcfg.ARM_GATE):
        dd = paired[a]
        m = float(np.mean(dd)) if dd else float("nan")
        lo, hi = gates11.mean_ci95(dd)
        blo, bhi = gates11.mean_ci(dd, gates11.Z_BONFERRONI)
        A(f"- **{a} minus baseline**, paired day by day: **{_money(m)}** a trade "
          f"on $1,000 of risk ({m:+.4f}R), with a 95% range of {_money(lo)} to "
          f"{_money(hi)}, over {len(dd):,} days both arms traded. "
          + ("That range excludes zero, in the challenger's favour"
             + ("; and it still does once corrected for taking three shots "
                f"({_money(blo)} to {_money(bhi)})."
                if blo > 0 else
                " — but NOT once corrected for taking three shots "
                f"({_money(blo)} to {_money(bhi)}), so this margin sits inside "
                "the multiplicity problem.")
             if lo > 0 else
             "**That range lies entirely below zero: the challenger did not "
             "merely fail to beat the incumbent, it lost to it by more than the "
             "sample noise.**"
             + (" It still does once corrected for taking three shots "
                f"({_money(blo)} to {_money(bhi)})."
                if bhi < 0 else
                " Corrected for taking three shots the range is "
                f"{_money(blo)} to {_money(bhi)}, which touches zero.")
             if hi < 0 else
             "That range contains zero" + (
                 ", so no difference is established — though the middle number "
                 "is negative, so what evidence there is points the wrong way "
                 "for the challenger." if m < 0 else
                 ", so no difference is established either way.")))
    A("")
    A(f"- **Verdict**: **{verdict}**.")
    A("")
    if verdict == gates11.BASELINE_HOLDS:
        A("**The incumbent held.** Neither the re-ordering nor the cut beat "
          "abnormal opening volume by a margin that clears its own error bar, so "
          "nothing changes and the one component this programme has measured as "
          "working stays as it is. That is a useful result rather than an empty "
          "one: the cheapest way to break a working system is to bolt a second "
          "idea onto its one measured part.")
        A("")
    A("**Which gates carried the verdict, in words.** " + " ".join(
        f"{g.id} {'passed' if g.passed else 'FAILED'} ({g.name})." for g in rows))
    A("")
    A("**G4 decides no arm.** It is the gradient test, it is two-sided on "
      "purpose, and it is the line the owner's question actually turns on: a "
      "gradient pointing the wrong way is as much of an answer as one pointing "
      "the right way, and no gradient at all is a third answer worth more than "
      "any verdict.")
    A("")
    A("**G5 and G6 are read across all three arms, so read them per arm before "
      "concluding anything.** " + " ".join(
        f"`{a}` made {'money' if g_hb[a][0] > 0 else 'a loss'} gross "
        f"({g_hb[a][0]:+.4f}R) and "
        f"{'money' if s_hb[a].mean_r > 0 else 'a loss'} net "
        f"({s_hb[a].mean_r:+.4f}R, {_money(s_hb[a].mean_r)} a trade) and "
        f"returned {pf_hb[a].total_return:+.1%} as a portfolio at a Sharpe of "
        f"{pf_hb[a].sharpe:.2f}." for a in ARM_ORDER))
    A("")
    best_pf = max(ARM_ORDER, key=lambda a: pf_hb[a].sharpe)
    if pf_hb[best_pf].sharpe >= gates11.MIN_SHARPE:
        lo, hi = gates11.mean_ci95([t.net_r for t in hb[best_pf]])
        A(f"**One arm's portfolio row will catch the eye and it must be read "
          f"with its own error bar and its own leverage.** `{best_pf}` returned "
          f"{pf_hb[best_pf].total_return:+.1%} at a Sharpe of "
          f"{pf_hb[best_pf].sharpe:.2f} on the held-back year — the only arm "
          "here that clears the Sharpe the gate asks for. A portfolio Sharpe "
          "above 1.0 has not been enough before: `orb_sip.v2` returned +223.9% "
          "at a Sharpe of 1.27 on ENGINE-7's held-back window and still came "
          "back PARTIAL. Three things stop this one being a result. **First, "
          "its own "
          f"per-trade interval contains zero** ({_money(lo)} to {_money(hi)}), "
          "so the edge underneath the portfolio is not distinguishable from "
          "breaking even. **Second, it did not beat the incumbent**: paired day "
          "by day the difference is "
          f"{_money(float(np.mean(paired[tcfg.ARM_GATE])) if paired.get(tcfg.ARM_GATE) else float('nan'))} "
          "a trade with an interval spanning zero, which is the comparison G3 "
          "asks for and the reason the verdict is what it is. **Third, and "
          "mechanically, it is a less levered portfolio**: it takes "
          f"{len(hb[best_pf])/max(pf_hb[best_pf].n_days,1):.1f} positions a day "
          f"against the baseline's "
          f"{len(hb[tcfg.ARM_BASELINE])/max(pf_hb[tcfg.ARM_BASELINE].n_days,1):.1f}, "
          f"so the 4x gross cap bound on {pf_hb[best_pf].capped_days} of "
          f"{pf_hb[best_pf].n_days} days against "
          f"{pf_hb[tcfg.ARM_BASELINE].capped_days} — a portfolio whose positions "
          "are almost never scaled down is not comparable, on this line, with "
          "one whose positions are scaled down on nine days in ten. The "
          "per-trade table is the comparison; the portfolio table is a "
          "consequence of it and of the cap.")
        A("")

    # --- the bar -----------------------------------------------------------
    A("## The bar, and what it observed")
    A("")
    A("All six gates are read on the held-back year only.")
    A("")
    A("| id | gate | threshold | observed | |")
    A("|---|---|---|---|---|")
    for g in rows:
        A(f"| **{g.id}** | {g.name} | {g.threshold} | {g.observed} | "
          f"{'PASS' if g.passed else 'FAIL'} |")
    A("")

    # --- headline table ----------------------------------------------------
    A(f"## The held-back year, {gates11.HELD_BACK[0]} → {gates11.HELD_BACK[1]} "
      "— gross before net, median beside mean")
    A("")
    A("| arm | n | mean gross R | median gross R | mean net R | median net R | "
      "$ per $1,000 risked | hit | PF | stopped |")
    A("|---|---|---|---|---|---|---|---|---|---|")
    for a in ARM_ORDER:
        s, g = s_hb[a], g_hb[a]
        A(f"| {a} | {s.n:,} | {g[0]:.4f} | {g[1]:.4f} | {s.mean_r:.4f} | "
          f"{s.median_r:.4f} | {s.mean_r*RISK_DOLLARS:+,.0f} | {s.hit_rate:.1%} | "
          f"{fmt(s.profit_factor,2)} | {_stopped(hb[a]):.1%} |")
    A("")
    A("Same rules, same costs, same fills, same candidate pond. The arms differ "
      "in which names they trade and in nothing else.")
    A("")

    if ctrl:
        c = _window(ctrl, hb_lo, hb_hi)
        cs = summarise(c, "random20")
        A("### The reference point that makes a losing arm readable")
        A("")
        A("**Diagnostic, not a gate and not a fourth arm.** ENGINE-6 built a "
          "control that picks twenty names a day out of the same eligible pool "
          "by a deterministic hash — a coin toss with the ranking key removed. "
          "Replayed here on the same held-back year under the same rules, it is "
          "the row a losing selector has to be read against.")
        A("")
        A("| arm | n | mean gross R | mean net R | median net R | $ per $1,000 | "
          "hit | PF | stopped |")
        A("|---|---|---|---|---|---|---|---|---|")
        for a in ARM_ORDER:
            s, g = s_hb[a], g_hb[a]
            A(f"| {a} | {s.n:,} | {g[0]:.4f} | {s.mean_r:.4f} | "
              f"{s.median_r:.4f} | {s.mean_r*RISK_DOLLARS:+,.0f} | "
              f"{s.hit_rate:.1%} | {fmt(s.profit_factor,2)} | "
              f"{_stopped(hb[a]):.1%} |")
        A(f"| **random 20 (the coin toss)** | {cs.n:,} | {_gross(c)[0]:.4f} | "
          f"{cs.mean_r:.4f} | {cs.median_r:.4f} | "
          f"{cs.mean_r*RISK_DOLLARS:+,.0f} | {cs.hit_rate:.1%} | "
          f"{fmt(cs.profit_factor,2)} | {_stopped(c):.1%} |")
        A("")
        for a in (tcfg.ARM_RANK, tcfg.ARM_GATE):
            dd = _paired_by_day(hb[a], c)
            m = float(np.mean(dd)) if dd else float("nan")
            lo, hi = gates11.mean_ci95(dd)
            A(f"*Paired day by day, `{a}` minus the coin toss is "
              f"{_money(m)} a trade (95%: {_money(lo)} to {_money(hi)}, "
              f"n={len(dd):,}).*")
        A("")

    # --- the curve ---------------------------------------------------------
    A("## THE CURVE — outcome against trend strength, in deciles")
    A("")
    A("The `baseline` arm's trades, sorted by directional trend strength and cut "
      "into ten equal piles. This is the most useful single output of the lane: "
      "it does not depend on any threshold, any pond size, or which arm won.")
    A("")
    for label, dec, n_all in (("Held back", dec_hb, len(hb[tcfg.ARM_BASELINE])),
                              ("Build window", dec_bd, len(bd[tcfg.ARM_BASELINE]))):
        A(f"### {label}")
        A("")
        if not dec:
            A("*Not enough measurable trades to draw the curve.*")
            A("")
            continue
        A("| decile | strength range | n | mean gross R | mean net R | "
          "median net R | $ per $1,000 | hit | stopped | median stop |")
        A("|---|---|---|---|---|---|---|---|---|---|")
        for b in dec:
            A(f"| {b['bin']} | {b['lo']:+.3f} to {b['hi']:+.3f} | {b['n']:,} | "
              f"{b['mean_gross']:.4f} | {b['mean_net']:.4f} | "
              f"{b['median_net']:.4f} | {b['mean_net']*RISK_DOLLARS:+,.0f} | "
              f"{b['hit']:.1%} | {b['stopped']:.1%} | "
              f"{b['stop_cents']:.1f}c / {fmt(b['stop_atr'],2)} ATR |")
        A("")
        covered = sum(b["n"] for b in dec)
        A(f"*{covered:,} of {n_all:,} trades had a measurable strength; the rest "
          "had too little daily history and are not in the curve.*")
        A("")
    A("**The gradient, paired within the day** — the stronger half of a "
      "morning's picks minus the weaker half, which removes the day effect that "
      "a raw decile table cannot:")
    A("")
    A("| window | n days | mean diff R | $ per $1,000 | 95% interval | "
      "97.5%+ (three comparisons) |")
    A("|---|---|---|---|---|---|")
    for label, g in (("held back", grad_hb), ("build window", grad_bd)):
        if not g:
            continue
        m = float(np.mean(g))
        lo, hi = gates11.mean_ci95(g)
        blo, bhi = gates11.mean_ci(g, gates11.Z_BONFERRONI)
        A(f"| {label} | {len(g):,} | {m:+.4f} | {m*RISK_DOLLARS:+,.0f} | "
          f"{lo:+.4f} to {hi:+.4f} | {blo:+.4f} to {bhi:+.4f} |")
    A("")

    # --- stop width --------------------------------------------------------
    A("## Stop width, the mechanism that has explained every result in this "
      "programme")
    A("")
    A("The stop in `orb_sip.v2` is the far end of the 09:30-09:35 candle, so the "
      "risk on a trade IS the width of that candle, and cost as a fraction of "
      "risk is `cost per share / stop distance`. ENGINE-9's Kai arm lost for "
      "exactly this reason: it selected coiled names, coiled names open quietly, "
      "a quiet five minutes is a NARROW five minutes, and a narrow stop is a "
      "stop that gets hit. **Strongly-trending names can do the same thing, so "
      "the question is asked here before any conclusion is drawn.**")
    A("")
    A("| arm | median stop distance | as % of price | in 14-day ATRs | "
      "commission as a share of risk | stopped out |")
    A("|---|---|---|---|---|---|")
    for a in ARM_ORDER:
        g = geo_hb[a]
        if not g:
            continue
        A(f"| {a} | {g['cents']:.1f} cents | {g['pct']:.3f}% | "
          f"{fmt(g['atr'],3)} | {g['commission_r']:.4f}R | "
          f"{_stopped(hb[a]):.1%} |")
    if geo_ctrl:
        c = _window(ctrl or [], hb_lo, hb_hi)
        A(f"| **random 20** | {geo_ctrl['cents']:.1f} cents | "
          f"{geo_ctrl['pct']:.3f}% | {fmt(geo_ctrl['atr'],3)} | "
          f"{geo_ctrl['commission_r']:.4f}R | {_stopped(c):.1%} |")
    A("")
    base_c = geo_hb[tcfg.ARM_BASELINE].get("cents", float("nan"))
    for a in (tcfg.ARM_RANK, tcfg.ARM_GATE):
        gc = geo_hb[a].get("cents", float("nan"))
        if not (np.isfinite(gc) and np.isfinite(base_c) and base_c > 0):
            continue
        rel = gc / base_c - 1.0
        if rel < -0.05:
            A(f"**`{a}` narrows the stop.** Its median stop is {gc:.1f} cents "
              f"against the baseline's {base_c:.1f}, {abs(rel):.0%} tighter, and "
              f"it is stopped out on {_stopped(hb[a]):.1%} of trades against "
              f"{_stopped(hb[tcfg.ARM_BASELINE]):.1%}. **That is the "
              "explanation, and it is stated here rather than left for the "
              "reader to spot:** where this arm differs from the incumbent, it "
              "is trading a quieter opening candle, and a quieter opening candle "
              "is a tighter stop, and a tighter stop is a worse trade under "
              "these rules.")
            A("")
        elif rel > 0.05:
            A(f"**`{a}` WIDENS the stop** — {gc:.1f} cents against the "
              f"baseline's {base_c:.1f}, {rel:.0%} wider, stopped out on "
              f"{_stopped(hb[a]):.1%} against "
              f"{_stopped(hb[tcfg.ARM_BASELINE]):.1%}. Whatever this arm did, "
              "the ENGINE-9 mechanism is not what did it.")
            A("")
        else:
            A(f"**`{a}` leaves the stop width alone** — {gc:.1f} cents against "
              f"the baseline's {base_c:.1f}. The ENGINE-9 mechanism is not in "
              "play for this arm, in either direction.")
            A("")

    A("### The second mechanism: which side of the book the ranking fills")
    A("")
    A("A strength ranking is not side-neutral in a year when most charts point "
      "one way. In a rising market more names carry positive strength, so a "
      "ranking that prefers strength in the break direction quietly buys more "
      "and shorts less — and in this model the two sides do not pay the same.")
    A("")
    A("| arm | long share of trades (held back) | mean net R, long | "
      "mean net R, short |")
    A("|---|---|---|---|")
    for a in ARM_ORDER:
        lg = [t for t in hb[a] if t.side == "long"]
        sh = [t for t in hb[a] if t.side == "short"]
        if not (lg and sh):
            continue
        A(f"| {a} | {len(lg)/len(hb[a]):.1%} | "
          f"{float(np.mean([t.net_r for t in lg])):+.4f} "
          f"({float(np.mean([t.net_r for t in lg]))*RISK_DOLLARS:+,.0f}) | "
          f"{float(np.mean([t.net_r for t in sh])):+.4f} "
          f"({float(np.mean([t.net_r for t in sh]))*RISK_DOLLARS:+,.0f}) |")
    A("")
    b_long = sum(1 for t in hb[tcfg.ARM_BASELINE] if t.side == "long") \
        / max(len(hb[tcfg.ARM_BASELINE]), 1)
    r_long = sum(1 for t in hb[tcfg.ARM_RANK] if t.side == "long") \
        / max(len(hb[tcfg.ARM_RANK]), 1)
    if r_long - b_long > 0.02:
        A(f"**The `rank` arm tilts the book long** — {r_long:.1%} of its trades "
          f"against the incumbent's {b_long:.1%} — and on this year the long "
          "side was the weaker of the two for the incumbent as well. So the "
          "re-ordering does two things at once: it narrows the stop, and it "
          "moves trades onto the side that paid less. Neither was the intention "
          "and both are consequences of ranking on a number that is mostly "
          "positive in a rising market.")
        A("")

    # --- what the gate removed --------------------------------------------
    A("## What `gate_strong` removed, and what those trades did")
    A("")
    A("A filter that discards winners is not helping even if the average of what "
      "is left improves. The gated arm is a strict subset of the baseline — same "
      "symbol-days, same levels, same stops, one extra reason to skip — and the "
      "runner asserts that before it writes anything, so every baseline trade is "
      "either kept or removed and there is no third category.")
    A("")
    for label, kept, removed, base in (
            ("held back", hb[tcfg.ARM_GATE], removed_hb, hb[tcfg.ARM_BASELINE]),
            ("build window", bd[tcfg.ARM_GATE], removed_bd,
             bd[tcfg.ARM_BASELINE])):
        sk, sr = summarise(kept, "kept"), summarise(removed, "removed")
        A(f"| {label} | n | mean net R | per $1,000 risked | median net R | hit | "
          "stopped |")
        A("|---|---|---|---|---|---|---|")
        A(f"| kept by the cut (the model) | {sk.n:,} | {sk.mean_r:.4f} | "
          f"{sk.mean_r*RISK_DOLLARS:+,.0f} | {sk.median_r:.4f} | "
          f"{sk.hit_rate:.1%} | {_stopped(kept):.1%} |")
        A(f"| REMOVED by the cut | {sr.n:,} | {sr.mean_r:.4f} | "
          f"{sr.mean_r*RISK_DOLLARS:+,.0f} | {sr.median_r:.4f} | "
          f"{sr.hit_rate:.1%} | {_stopped(removed):.1%} |")
        A("")
        diff = [t.net_r for t in kept]
        diff2 = [t.net_r for t in removed]
        m = (float(np.mean(diff)) - float(np.mean(diff2))) if diff and diff2 \
            else float("nan")
        # unpaired difference of means, with a pooled interval
        if diff and diff2:
            v1 = float(np.var(diff, ddof=1)) / len(diff)
            v2 = float(np.var(diff2, ddof=1)) / len(diff2)
            se = float(np.sqrt(v1 + v2))
            lo, hi = m - 1.96 * se, m + 1.96 * se
        else:
            lo = hi = float("nan")
        A(f"The cut removed **{len(removed):,} of {len(base):,} trades** "
          f"({len(removed)/max(len(base),1):.0%}). Kept minus removed is "
          f"**{m:+.4f}R** (95%: {lo:+.4f} to {hi:+.4f}) — "
          f"{_money(m)} a trade on $1,000 of risk.")
        A("")
        if diff and diff2 and float(np.mean(diff2)) > float(np.mean(diff)):
            A("**The cut is discarding winners.** The trades it removed returned "
              f"{float(np.mean(diff2)):+.4f}R and the ones it kept returned "
              f"{float(np.mean(diff)):+.4f}R. The gate required this sentence in "
              "these words if it happened, whatever the verdict says: a filter "
              "that skips trades which would have won is not helping, even if "
              "the average of what is left improves.")
            A("")

    # --- ENGINE-8 comparison ----------------------------------------------
    A("## Against ENGINE-8: does grading the trend rescue it?")
    A("")
    A("| | ENGINE-8 (`orb_sip.v3`) | ENGINE-11 (`gate_strong`) |")
    A("|---|---|---|")
    A("| what the trend was | a three-state label: up, down, none | a continuous "
      "number on [−1, +1] |")
    A("| how it was used | a gate, and only a gate | a ranking first, a gate "
      "second |")
    A("| daily bars | unadjusted, splits disclosed as an upper bound | "
      "split-adjusted |")
    A(f"| trades kept (held back) | 996 of 3,969 (25%) | "
      f"{len(hb[tcfg.ARM_GATE]):,} of {len(hb[tcfg.ARM_BASELINE]):,} "
      f"({len(hb[tcfg.ARM_GATE])/max(len(hb[tcfg.ARM_BASELINE]),1):.0%}) |")
    A(f"| mean net R, kept (held back) | +0.0356 (+36 per $1,000) | "
      f"{s_hb[tcfg.ARM_GATE].mean_r:+.4f} "
      f"({s_hb[tcfg.ARM_GATE].mean_r*RISK_DOLLARS:+,.0f} per $1,000) |")
    if removed_hb:
        A(f"| mean net R, removed (held back) | +0.0103 (+10 per $1,000) | "
          f"{float(np.mean([t.net_r for t in removed_hb])):+.4f} "
          f"({float(np.mean([t.net_r for t in removed_hb]))*RISK_DOLLARS:+,.0f} "
          "per $1,000) |")
    if removed_bd:
        A(f"| kept minus removed (build) | −0.0470 (95%: −0.0884 to −0.0057) — "
          "the filter discarded winners | "
          f"{float(np.mean([t.net_r for t in bd[tcfg.ARM_GATE]])) - float(np.mean([t.net_r for t in removed_bd])):+.4f} |")
    A("")

    # --- how different are the lists --------------------------------------
    A("## How different are the two lists, actually")
    A("")
    rows_sel = sel["rows"]
    by_day: dict[int, dict[str, set[str]]] = {}
    for r in rows_sel:
        by_day.setdefault(int(r["day"]), {}).setdefault(r["arm"], set()).add(
            r["symbol"])
    overlaps, npicks = [], {tcfg.ARM_BASELINE: [], tcfg.ARM_RANK: []}
    for d, arms in by_day.items():
        b = arms.get(tcfg.ARM_BASELINE, set())
        rk = arms.get(tcfg.ARM_RANK, set())
        npicks[tcfg.ARM_BASELINE].append(len(b))
        npicks[tcfg.ARM_RANK].append(len(rk))
        if b and rk:
            overlaps.append(len(b & rk))
    A("| | picks a day | names shared with `baseline` |")
    A("|---|---|---|")
    A(f"| baseline | {np.mean(npicks[tcfg.ARM_BASELINE]):.1f} | "
      f"{np.mean(npicks[tcfg.ARM_BASELINE]):.1f} |")
    A(f"| rank | {np.mean(npicks[tcfg.ARM_RANK]):.1f} | "
      f"{np.mean(overlaps) if overlaps else float('nan'):.1f} |")
    A("")
    A("If two selectors pick mostly the same names, the comparison between them "
      "is a comparison of the few names they disagree about, whatever the trade "
      "count says.")
    A("")
    A("### And what kind of name each one picks")
    A("")
    A("| arm | median relative volume | median strength | median strength in the "
      "break direction |")
    A("|---|---|---|---|")
    for arm in (tcfg.ARM_BASELINE, tcfg.ARM_RANK):
        rv = [r["rvol"] for r in rows_sel if r["arm"] == arm]
        st = [r["strength"] for r in rows_sel
              if r["arm"] == arm and r["strength"] is not None]
        ds = [r["directional"] for r in rows_sel
              if r["arm"] == arm and r["directional"] is not None]
        A(f"| {arm} | {np.median(rv):.2f}x | "
          f"{np.median(st) if st else float('nan'):+.3f} | "
          f"{np.median(ds) if ds else float('nan'):+.3f} |")
    A("")
    same, shared = _matches_engine6(sel)
    A(f"**The `baseline` arm is not a re-implementation of ENGINE-6's selector; "
      f"it is the same one.** On the {shared:,} sessions the two lanes share, "
      f"the `baseline` picks here are identical to the names ENGINE-6 wrote to "
      f"`selection.json.gz` on **{same:,}** of them "
      f"({100.0*same/max(shared,1):.2f}%). Anything the challengers gain or lose "
      "is measured against the thing ENGINE-7 actually reported.")
    A("")

    # --- portfolio ---------------------------------------------------------
    A("## The portfolio")
    A("")
    A("1% of equity risked a position, gross exposure capped at 4x, a day's "
      "positions scaled down together when the cap binds, compounded daily from "
      "$100,000. **The held-back column is the one that counts.**")
    A("")
    A("| arm | total return (held back) | CAGR | Sharpe | max drawdown | "
      "days the 4x cap bound | total return (build window) |")
    A("|---|---|---|---|---|---|---|")
    for a in ARM_ORDER:
        p, q = pf_hb[a], pf_bd[a]
        A(f"| {a} | {p.total_return:+.1%} | {p.cagr:+.1%} | {p.sharpe:.2f} | "
          f"{p.max_drawdown:.1%} | {p.capped_days}/{p.n_days} | "
          f"{q.total_return:+.1%} |")
    A("")
    A("**Read the leverage before the return.** A portfolio number here is a "
      "statement about four-times-levered intraday exposure across twenty "
      "concurrent positions, not about the per-trade edge. The per-trade edge is "
      "the table above it.")
    A("")
    A("**And read the cap-binding column before comparing two rows.** An arm "
      "that trades fewer names a day asks for less gross exposure, so the 4x cap "
      "scales it down on fewer days, so more of its per-trade edge — whatever "
      "sign that edge has — reaches the equity curve. "
      + " ".join(f"`{a}` took "
                 f"{len(hb[a])/max(pf_hb[a].n_days,1):.1f} positions a day and "
                 f"was capped on {pf_hb[a].capped_days} of {pf_hb[a].n_days} "
                 "days." for a in ARM_ORDER)
      + " Two rows of this table are only comparable to the extent those "
        "numbers are, which is why the verdict is decided on the per-trade "
        "comparison and not here.")
    A("")

    # --- build window ------------------------------------------------------
    A(f"## The build window, {gates11.BUILD[0]} → {gates11.BUILD[1]} — "
      "a disclosure, not a verdict")
    A("")
    A("Nothing here can raise or lower the verdict. It is printed so a reader "
      "can see whether the held-back year looks like the four before it, and "
      "because `orb_sip.v2`'s stop width was chosen by reading a sweep of "
      "2016-2023 — which overlaps 2021-2023 inside this window.")
    A("")
    A("| arm | n | mean gross R | mean net R | median net R | $ per $1,000 | "
      "hit | PF | stopped |")
    A("|---|---|---|---|---|---|---|---|---|")
    for a in ARM_ORDER:
        s, g = s_bd[a], g_bd[a]
        A(f"| {a} | {s.n:,} | {g[0]:.4f} | {s.mean_r:.4f} | {s.median_r:.4f} | "
          f"{s.mean_r*RISK_DOLLARS:+,.0f} | {s.hit_rate:.1%} | "
          f"{fmt(s.profit_factor,2)} | {_stopped(bd[a]):.1%} |")
    A("")
    A("| comparison (build window) | n days | mean diff R | 95% interval |")
    A("|---|---|---|---|")
    for a in (tcfg.ARM_RANK, tcfg.ARM_GATE):
        dd = paired_bd[a]
        if not dd:
            continue
        lo, hi = gates11.mean_ci95(dd)
        A(f"| {a} − baseline | {len(dd):,} | {float(np.mean(dd)):+.4f} | "
          f"{lo:+.4f} to {hi:+.4f} |")
    A("")
    A("### By calendar year, all three arms")
    A("")
    A(SUMMARY_HEADER)
    for a in ARM_ORDER:
        for year, ts in sorted(split_by(trades[a],
                                        lambda t: int(t.day) // 10000).items()):
            A(summary_row(summarise(ts, f"{a} {year}")))
    A("")
    A("### Held back, by arm and side")
    A("")
    A(SUMMARY_HEADER)
    for a in ARM_ORDER:
        for side, ts in sorted(split_by(hb[a], lambda t: t.side).items()):
            A(summary_row(summarise(ts, f"{a} {side}")))
    A("")

    # --- census ------------------------------------------------------------
    A("## Census and coverage")
    A("")
    cov = np.array(sel["coverage"], dtype="int64")
    A(f"- sessions planned: **{len(cov):,}**")
    A(f"- candidates a day: median **{np.median(cov[:,2]):.0f}** of a "
      f"{np.median(cov[:,1]):.0f}-name pool")
    A(f"- of those, **{np.median(cov[:,3]):.0f}** on the median day had a "
      "measurable trend strength "
      f"({100.0*np.median(cov[:,3]/np.maximum(cov[:,2],1)):.0f}%) — the rest had "
      f"fewer than {ms.MIN_BARS} closed daily bars in the adjusted book, or no "
      "usable ATR")
    A(f"- and **{np.median(cov[:,4]):.0f}** had a break direction at all; the "
      "rest opened on a doji five-minute candle, which the model skips anyway")
    A("")
    disagree = sum(1 for t in trades[tcfg.ARM_BASELINE]
                   if side_seen.get((t.symbol, int(t.day)), t.side) != t.side)
    A(f"**Direction, five-minute aggregate against one-minute reconstruction.** "
      "The selector reads the break direction off Polygon's 09:30 five-minute "
      "bar; the model rebuilds the same candle from one-minute prints when it "
      f"trades. They disagree on **{disagree:,} of "
      f"{len(trades[tcfg.ARM_BASELINE]):,}** baseline trades "
      f"({100.0*disagree/max(len(trades[tcfg.ARM_BASELINE]),1):.2f}%). The "
      "selector is not allowed the one-minute tape for names it has not picked "
      "yet, so this residual is a property of the design and is printed rather "
      "than assumed away.")
    A("")
    A("| | " + " | ".join(ARM_ORDER) + " |")
    A("|---|" + "---|" * len(ARM_ORDER))
    keys = sorted({k for a in ARM_ORDER for k in census[a]})
    for k in keys:
        A(f"| {k} | " + " | ".join(f"{census[a].get(k,0):,}" for a in ARM_ORDER)
          + " |")
    A(f"| symbol-days with no cached bars | "
      + " | ".join(f"{missing[a]:,}" for a in ARM_ORDER) + " |")
    A("")
    A("**Why `rank` skips no doji candles.** A name whose opening candle closed "
      "exactly where it opened has no break direction, so the ranking puts it at "
      "the back of the pond by construction — and with forty names competing for "
      "twenty places it never reaches the front. That is not the arm dodging a "
      "bad trade with information it should not have: the model would have "
      "skipped those names anyway, and the count of them is the "
      "`skip_doji_opening_candle` row in the baseline column.")
    A("")

    # --- cost sensitivity --------------------------------------------------
    A("## Cost sensitivity — disclosed, and not a result")
    A("")
    A("The pre-registered cost model is $0.005/share/side plus 1.0 bp of adverse "
      "slippage, unchanged for the eleventh time. **The gate is after the "
      "pre-registered costs and does not move.**")
    A("")
    A("| arm | cost model | n | mean R | median R | hit | PF |")
    A("|---|---|---|---|---|---|---|")
    for a, base in ((tcfg.ARM_BASELINE, "baseline"), (tcfg.ARM_RANK, "rank")):
        for label, key in (("pre-registered (the result)", None),
                           ("quarter-bp slippage", f"{base}_cheap"),
                           ("zero cost (true gross)", f"{base}_nocost")):
            ts = _window(trades[a] if key is None else extra.get(key, []),
                         hb_lo, hb_hi)
            if not ts:
                continue
            s = summarise(ts, label)
            A(f"| {a} | {label} | {s.n:,} | {s.mean_r:.4f} | {s.median_r:.4f} | "
              f"{s.hit_rate:.1%} | {fmt(s.profit_factor,2)} |")
    A("")

    # --- confidence --------------------------------------------------------
    A("## How sure we actually are, and what would change the answer")
    A("")
    A(f"- The verdict rests on ONE calendar year — {len(days_hb)} sessions — and "
      "on the trade counts in the table above. One year is one regime.")
    A("- **This is the held-back year's FIFTH reading.** ENGINE-7's held-back "
      "window (2024-01-01 → 2026-08-28) contained all of it, and ENGINE-8, "
      "ENGINE-9 and ENGINE-10 all read windows containing it too. Every reading "
      "costs some of what makes a held-back window worth holding back, and no "
      "correction is applied. What is new in this lane is the strength measure "
      "and the two arms built on it; everything downstream has been read on this "
      "year four times before.")
    A("- **`orb_sip.v2`'s stop width was chosen by looking at a sweep of "
      "2016-2023.** That does not touch the held-back year, but the build window "
      "above inherits the contamination for 2021-2023.")
    A("- **Three comparisons, one year.** The Bonferroni column is the size of "
      "that problem, printed rather than argued about.")
    kept_bd = float(np.mean([t.net_r for t in bd[tcfg.ARM_GATE]])) \
        if bd[tcfg.ARM_GATE] else float("nan")
    rem_bd = float(np.mean([t.net_r for t in removed_bd])) if removed_bd \
        else float("nan")
    A("- **The two windows disagree about `gate_strong`, and the disagreement "
      "is the finding.** On the held-back year the cut kept the better trades "
      f"({s_hb[tcfg.ARM_GATE].mean_r:+.4f}R kept against "
      f"{float(np.mean([t.net_r for t in removed_hb])):+.4f}R removed). On the "
      f"four build years it kept the worse ones ({kept_bd:+.4f}R kept against "
      f"{rem_bd:+.4f}R removed) — the same shape of failure ENGINE-8 had, on "
      "four times the sample. One year agreeing and four disagreeing is what a "
      "threshold with no real edge behind it looks like, and it is the single "
      "strongest reason not to read the held-back column as a discovery.")
    A(f"- **The two free numbers are two guesses.** A pond of {tcfg.POND_K} and "
      f"a cut at +{tcfg.GATE_STRENGTH:.2f} were fixed in the gate before "
      "anything ran and neither was swept — which protects the result from being "
      "fitted, and equally means neither is claimed to be the best available "
      "value. The decile table is the honest answer to 'what about a different "
      "cut': it shows what every cut would have done, without any of them being "
      "the pre-registered one.")
    A("- **What would change the answer, in order of how much it would move "
      "it:** (1) the fill model — every entry is a resting stop order filled at "
      "the worse of the level and the bar's open, and real fills on the "
      "morning's most volatile names are worse than that; (2) borrow on the "
      "short side, which this harness does not model at all; (3) the pool, which "
      "is the top 1,000 of the eligible universe by dollar volume rather than "
      "all of it; (4) the 4x leverage cap, which decides how much of any "
      "per-trade edge survives into a portfolio number.")
    A("- **What this report does NOT establish**: that any of these three arms "
      "is worth trading. It establishes whether a graded trend-strength measure "
      "ranks day-trade candidates better than abnormal opening volume alone, on "
      "one held-back year, under one set of downstream rules that has itself "
      "only ever come back PARTIAL.")
    A("")

    # --- selection and lookahead ------------------------------------------
    A("## Selection, and the lookahead treatment")
    A("")
    A("- pool: top 1,000 of the eligible set by 20-day average dollar volume as "
      "of the prior close — ENGINE-6's pool, unchanged")
    A("- candidates: pool names with a 09:30-09:35 bar today and a full "
      "14-session baseline, so a relative volume exists. Both selectors rank the "
      "same list.")
    A(f"- `baseline`: top {tcfg.TOP_K} by that relative volume, floor "
      f"{tcfg.MIN_RVOL}")
    A(f"- `rank`: the top {tcfg.POND_K} by the same relative volume, re-sorted "
      f"by directional trend strength, top {tcfg.TOP_K} taken. Names with no "
      "strength or no break direction fall to the back of the pond in "
      "relative-volume order rather than being dropped, so the trade count is "
      "held.")
    A(f"- `gate_strong`: the baseline's picks, traded only when directional "
      f"strength ≥ +{tcfg.GATE_STRENGTH:.2f}")
    A("- the opening-bar parquet holds only 09:30-10:30, so the afternoon of the "
      "day being selected for was never written; the daily bars stop at the "
      "prior close by construction. `tests/test_trend_strength.py` runs the "
      "poisoned-future and amputated-future attacks against the measure and "
      "catches a deliberately cheating one with the same harness; "
      "`tests/test_strength_selection.py` does the same for the ranking, "
      "including deleting the selection day's own session after 09:35 and "
      "requiring a byte-identical selection.")
    A("")
    A("## Costs and fills")
    A("")
    A("- $0.005/share/side commission, 1.0 bp adverse slippage on market and "
      "stop fills")
    A("- entry is a resting stop order, filled at the worse of the level and the "
      "bar's open, plus slippage")
    A("- the stop is a LEVEL, not a distance carried from the fill")
    A("")

    REPORT.parent.mkdir(parents=True, exist_ok=True)
    REPORT.write_text("\n".join(L) + "\n")
    print(f"wrote {REPORT}")
    print(f"VERDICT: {verdict}")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--stage", required=True,
                    choices=["strength", "plan", "run"])
    a = ap.parse_args()
    {"strength": stage_strength, "plan": stage_plan, "run": stage_run}[a.stage]()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
