"""ENGINE-9 — is Kai's own score a better selector than relative volume?

    .venv/bin/python run_engine9.py --stage score   # Kai's score, per pool-day
    .venv/bin/python run_engine9.py --stage plan    # three selections, one pond
    .venv/bin/python sip/fetch_days.py --pairs data/kai-sel-v1/pairs9.json
    .venv/bin/python run_engine9.py --stage run     # replay + report

`score` and `plan` are separate from `run` for ENGINE-6's reason and it matters
more here, not less. Every selection is a function of daily bars through the
prior close and of the 09:30-09:35 volume, both already on disk before a single
new one-minute bar is requested. The download is a CONSEQUENCE of the selection
and cannot feed back into it, and `pairs9.json` is the receipt.

The `kai` and `both` arms pick names the relative-volume arm never picked, and
ENGINE-6 only ever cached full sessions for the names IT picked. So this lane
does need one-minute bars it does not have — but for symbol-days chosen by a
selector that had already been written to disk, which is the same two-stage
discipline, not a loophole in it.

There is no parameter to vary in this file. The three arms are the experiment;
`models/orb_kai_sel.v1/GATE.md` fixed them, and the thresholds, before any of
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
from engine.kai_score import gates9, score as kscore  # noqa: E402
from engine.kai_score.bars import DailyBook  # noqa: E402
from engine.kai_score.selection import select_day  # noqa: E402
from engine.models.orb_sip_v2 import OrbStocksInPlayV2  # noqa: E402
from engine.run_engine6 import (CHEAP, COSTS, FREE, _atr_map,  # noqa: E402
                                _paired_by_day, _replay, _window)
from engine.sip import config as scfg  # noqa: E402
from engine.sip.portfolio import run_portfolio  # noqa: E402
from engine.sip.store import load_open_store  # noqa: E402

REPORT = Path(__file__).resolve().parent / "reports" / f"orb_kai_sel.v1.{scfg.SNAPSHOT}.md"
POOL_BY_DAY = kcfg.DATA_ROOT / "pool_by_day.json"
RISK_DOLLARS = 1_000.0
ARM_ORDER = (kcfg.ARM_RELVOL, kcfg.ARM_KAI, kcfg.ARM_BOTH)
ARM_LABEL = {kcfg.ARM_RELVOL: "relvol (the incumbent)",
             kcfg.ARM_KAI: "kai (the score)",
             kcfg.ARM_BOTH: "both (score and volume)"}


def _d(s: str) -> int:
    return int(s.replace("-", ""))


# ---------------------------------------------------------------------------
# stage: score


def stage_score() -> None:
    pool = {int(k): v for k, v in json.loads(POOL_BY_DAY.read_text()).items()}
    days = np.array(sorted(pool), dtype="int64")
    per_symbol: dict[str, list[int]] = {}
    for d in days:
        for s in pool[int(d)]:
            per_symbol.setdefault(s, []).append(int(d))
    print(f"loading daily bars for {len(per_symbol):,} tickers...", flush=True)
    book = DailyBook()

    import pyarrow as pa
    import pyarrow.parquet as pq

    cols: dict[str, list] = {k: [] for k in
                             ["symbol", "day", "asof", "candidate", "bullish",
                              "score", "rsi_value", "vol_ratio"]
                             + list(kscore.COMPONENTS)}
    missing = 0
    for i, (sym, sess) in enumerate(sorted(per_symbol.items())):
        got = kscore.score_symbol(book, sym, np.array(sess, dtype="int64"))
        if got is None:
            missing += len(sess)
            continue
        n = len(got["session"])
        cols["symbol"].extend([sym] * n)
        cols["day"].extend(got["session"].tolist())
        cols["asof"].extend(np.asarray(got["asof"]).tolist())
        cols["candidate"].extend(np.asarray(got["candidate"], dtype=bool).tolist())
        cols["bullish"].extend(np.asarray(got["bullish"], dtype=bool).tolist())
        cols["score"].extend(np.asarray(got["score"], dtype="int64").tolist())
        # NOT "rsi": that is also the name of the SCORE component, and one
        # dict key cannot hold both the reading and the points it earned.
        cols["rsi_value"].extend(np.asarray(got["rsi"], dtype="float64").tolist())
        cols["vol_ratio"].extend(np.asarray(got["vol_ratio"], dtype="float64").tolist())
        for c in kscore.COMPONENTS:
            cols[c].extend(np.asarray(got["components"][c], dtype="int64").tolist())
        if (i + 1) % 250 == 0:
            print(f"  scored {i+1:,} tickers, {len(cols['symbol']):,} rows", flush=True)

    schema = pa.schema(
        [("symbol", pa.string()), ("day", pa.int64()), ("asof", pa.int64()),
         ("candidate", pa.bool_()), ("bullish", pa.bool_()), ("score", pa.int64()),
         ("rsi_value", pa.float64()), ("vol_ratio", pa.float64())]
        + [(c, pa.int64()) for c in kscore.COMPONENTS])
    table = pa.table({f.name: pa.array(cols[f.name], type=f.type) for f in schema},
                     schema=schema)
    kcfg.SCORES_PATH.parent.mkdir(parents=True, exist_ok=True)
    pq.write_table(table, kcfg.SCORES_PATH, compression="zstd")
    cand = int(np.asarray(cols["candidate"]).sum())
    print(f"wrote {kcfg.SCORES_PATH}: {table.num_rows:,} ticker-days, "
          f"{cand:,} scored ({100.0*cand/max(table.num_rows,1):.1f}%), "
          f"{missing:,} with no daily bars")


# ---------------------------------------------------------------------------
# stage: plan


def _load_scores() -> dict[int, dict[str, tuple[bool, int, bool]]]:
    import duckdb
    con = duckdb.connect()
    t = con.execute(
        f"SELECT symbol, day, candidate, score, bullish FROM "
        f"read_parquet('{kcfg.SCORES_PATH}')").arrow()
    con.close()
    if hasattr(t, "read_all"):
        t = t.read_all()
    sym = t.column("symbol").to_pylist()
    day = t.column("day").to_numpy(zero_copy_only=False)
    cand = t.column("candidate").to_pylist()
    sc = t.column("score").to_numpy(zero_copy_only=False)
    bl = t.column("bullish").to_pylist()
    out: dict[int, dict[str, tuple[bool, int, bool]]] = {}
    for s, d, c, v, b in zip(sym, day, cand, sc, bl):
        out.setdefault(int(d), {})[s] = (bool(c), int(v), bool(b))
    return out


def stage_plan() -> None:
    pool = {int(k): v for k, v in json.loads(POOL_BY_DAY.read_text()).items()}
    scores = _load_scores()
    print("loading the 09:30-09:35 opening bars...", flush=True)
    store = load_open_store()

    rows: list[dict] = []
    cover: list[tuple[int, int, int, int]] = []
    for day in sorted(pool):
        names, rv, scored, sc, bull = [], [], [], [], []
        by_sym = scores.get(day, {})
        for s in pool[day]:
            r = store.rvol(s, day)
            if r is None:
                continue
            c, v, b = by_sym.get(s, (False, -1, False))
            names.append(s)
            rv.append(r)
            scored.append(c)
            sc.append(v)
            bull.append(b)
        if not names:
            continue
        cover.append((day, len(pool[day]), len(names), int(np.sum(scored))))
        picks = select_day(day, names, np.array(rv), np.array(scored, dtype=bool),
                           np.array(sc), np.array(bull, dtype=bool))
        for arm, ps in picks.items():
            for p in ps:
                rows.append({"day": p.day, "symbol": p.symbol, "arm": arm,
                             "rank": p.rank, "rvol": p.rvol, "score": p.score,
                             "bullish": p.bullish})

    kcfg.SELECTION_PATH.parent.mkdir(parents=True, exist_ok=True)
    with gzip.open(kcfg.SELECTION_PATH, "wt") as f:
        json.dump({"rows": rows, "coverage": cover, "pool_n": scfg.POOL_N,
                   "top_k": kcfg.TOP_K, "min_rvol": kcfg.MIN_RVOL,
                   "baseline_days": scfg.RVOL_BASELINE_DAYS,
                   "window": [kcfg.BUILD_START, kcfg.HELD_END]}, f)

    from engine.sip.fetch_days import path_for
    pairs = sorted({(r["symbol"], r["day"]) for r in rows})
    todo = [[s, d] for s, d in pairs if not path_for(s, d).exists()]
    kcfg.PAIRS_PATH.write_text(json.dumps(todo))

    cov = np.array(cover, dtype="int64")
    print(f"sessions planned      {len(cover):,}")
    print(f"candidates per day    median {np.median(cov[:,2]):.0f} of a "
          f"{np.median(cov[:,1]):.0f}-name pool")
    print(f"kai-scorable per day  median {np.median(cov[:,3]):.0f} "
          f"({100.0*np.median(cov[:,3]/np.maximum(cov[:,2],1)):.0f}% of candidates)")
    for arm in ARM_ORDER:
        n = sum(1 for r in rows if r["arm"] == arm)
        print(f"  {arm:<7} {n:,} picks, "
              f"{n/max(len(cover),1):.1f} a day")
    print(f"distinct symbol-days  {len(pairs):,}; "
          f"{len(todo):,} need one-minute bars fetched")
    print(f"wrote {kcfg.SELECTION_PATH} and {kcfg.PAIRS_PATH}")


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


def _money(r: float) -> str:
    return f"{r * RISK_DOLLARS:+,.0f} dollars"


def _split_exposure() -> str:
    """How much of the score would have been wrong without the adjustment.

    On an unadjusted series a 2-for-1 split is a 50% one-day collapse that drives
    the trend clouds, the squeeze and the swing oscillator for the next six
    months. This counts the ticker-days where that would have happened."""
    import datetime

    from engine.kai_score import splits as ksplits
    events = ksplits.load()
    if not events or not POOL_BY_DAY.exists():
        return ""
    pool = {int(k): v for k, v in json.loads(POOL_BY_DAY.read_text()).items()}
    total = hit = 0
    names: set[str] = set()
    for d in sorted(pool):
        dd = datetime.date(d // 10000, (d // 100) % 100, d % 100)
        start = int((dd - datetime.timedelta(
            days=kcfg.SCORE_LOOKBACK_CALENDAR_DAYS)).strftime("%Y%m%d"))
        for s in pool[d]:
            total += 1
            if any(start <= ex <= d for ex, _ in events.get(s, ())):
                hit += 1
                names.add(s)
    if not total:
        return ""
    return (f"It matters for **{hit:,} of {total:,} pool ticker-days "
            f"({100.0*hit/total:.2f}%) across {len(names)} distinct names** — "
            "the ones whose scoring window contained a split. Without the "
            "adjustment each of those would have been scored on a chart with a "
            "one-day collapse or spike in it that never happened.")


def _matches_engine6(sel) -> tuple[int, int]:
    """How often the `relvol` arm picks exactly the names ENGINE-6 picked.

    The incumbent has to be the incumbent. If this is not ~100% then the
    candidate pond has moved and the comparison is against something ENGINE-7
    never reported."""
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
        if r["arm"] == kcfg.ARM_RELVOL:
            n.setdefault(int(r["day"]), set()).add(r["symbol"])
    shared = sorted(set(o) & set(n))
    return sum(1 for d in shared if o[d] == n[d]), len(shared)


def stage_run() -> None:
    with gzip.open(kcfg.SELECTION_PATH, "rt") as f:
        sel = json.load(f)
    rows = sel["rows"]
    pairs = {(r["symbol"], int(r["day"])) for r in rows}
    atr = _atr_map(pairs)
    print(f"selection: {len(rows):,} rows, {len(pairs):,} symbol-days", flush=True)

    arms: dict[str, dict[str, set[int]]] = {a: {} for a in ARM_ORDER}
    for r in rows:
        arms[r["arm"]].setdefault(r["symbol"], set()).add(int(r["day"]))

    trades: dict[str, list] = {}
    census: dict[str, dict] = {}
    missing: dict[str, int] = {}
    extra: dict[str, list] = {}
    for arm in ARM_ORDER:
        print(f"replaying the {arm} arm...", flush=True)
        cfgs = [(arm, OrbStocksInPlayV2, COSTS)]
        if arm == kcfg.ARM_KAI:
            cfgs += [("kai_nocost", OrbStocksInPlayV2, FREE),
                     ("kai_cheap", OrbStocksInPlayV2, CHEAP)]
        if arm == kcfg.ARM_RELVOL:
            cfgs += [("relvol_nocost", OrbStocksInPlayV2, FREE),
                     ("relvol_cheap", OrbStocksInPlayV2, CHEAP)]
        t, c, m = _replay(arms[arm], atr, cfgs)
        trades[arm] = t[arm]
        census[arm] = c[arm]
        missing[arm] = m
        for k, v in t.items():
            if k != arm:
                extra[k] = v
        print(f"  {len(trades[arm]):,} trades", flush=True)

    write_report(sel, trades, census, missing, extra, atr)


def write_report(sel, trades, census, missing, extra, atr) -> None:
    hb_lo, hb_hi = (_d(x) for x in gates9.HELD_BACK)
    bd_lo, bd_hi = (_d(x) for x in gates9.BUILD)

    hb = {a: _window(trades[a], hb_lo, hb_hi) for a in ARM_ORDER}
    bd = {a: _window(trades[a], bd_lo, bd_hi) for a in ARM_ORDER}
    s_hb = {a: summarise(hb[a], a) for a in ARM_ORDER}
    s_bd = {a: summarise(bd[a], a) for a in ARM_ORDER}
    g_hb = {a: _gross(hb[a]) for a in ARM_ORDER}
    g_bd = {a: _gross(bd[a]) for a in ARM_ORDER}

    paired = {a: _paired_by_day(hb[a], hb[kcfg.ARM_RELVOL])
              for a in (kcfg.ARM_KAI, kcfg.ARM_BOTH)}
    paired_bd = {a: _paired_by_day(bd[a], bd[kcfg.ARM_RELVOL])
                 for a in (kcfg.ARM_KAI, kcfg.ARM_BOTH)}

    days_hb = [_d(x) for x in calendar_us.trading_days(*gates9.HELD_BACK)]
    days_bd = [_d(x) for x in calendar_us.trading_days(*gates9.BUILD)]
    pf_hb = {a: run_portfolio(hb[a], days_hb) for a in ARM_ORDER}
    pf_bd = {a: run_portfolio(bd[a], days_bd) for a in ARM_ORDER}

    rows = gates9.evaluate(s_hb, {a: g_hb[a][0] for a in ARM_ORDER}, paired, pf_hb)
    verdict = gates9.verdict(rows, s_hb, paired)

    L: list[str] = []
    A = L.append
    A("# `orb_kai_sel.v1` — three selectors, one set of rules, one honest comparison")
    A("")
    A(f"**Verdict: {verdict}.** Decided on the held-back year "
      f"{gates9.HELD_BACK[0]} → {gates9.HELD_BACK[1]} and on nothing else.")
    A("")
    A(f"Snapshot `{scfg.SNAPSHOT}` for the tape and the universe, unchanged. "
      "Kai's score is computed from the same grouped daily bars, split-adjusted "
      "to match what the live scanner reads. Gate: "
      "[`../models/orb_kai_sel.v1/GATE.md`](../models/orb_kai_sel.v1/GATE.md), "
      "committed before any number below existed.")
    A("")

    # --- plain English -----------------------------------------------------
    A("## In plain English")
    A("")
    A("**What was compared.** Every trading day, pick twenty US stocks and trade "
      "each of them the same way: buy a break above the high of the 09:30-09:35 "
      "candle if that candle closed up, sell short a break below its low if it "
      "closed down, get out at the other end of the same candle if it comes back "
      "through, otherwise hold to the closing bell. Nothing about that changes "
      "between the three arms. **The only thing that changes is how the twenty "
      "names are picked.**")
    A("")
    A("- **relvol** — the twenty whose first five minutes traded the most "
      "abnormal volume against their own recent mornings. This is what already "
      "works, and it is the thing to beat.")
    A("- **kai** — the twenty with the highest Kai breakout score, computed from "
      "the daily chart as of the previous close.")
    A("- **both** — the twenty that rank best on the two put together.")
    A("")
    A("**The honest prior, up front.** Kai's score has a measured track record "
      "and it is poor. On the project's own grading of 167 alerts "
      "(2026-05-15 → 07-14), the A band (score 80+, n=126) returned **−0.56%** "
      "over five days and won 47.6% of the time, while the D band (under 60, "
      "n=12) returned −0.63% and won **58.3%**. There is no monotonic "
      "relationship and the top band underperformed the bottom one. That "
      "measured the score as a SWING selector over five to ten days, which is a "
      "different job from choosing what to day-trade — so it is a prior, not a "
      "prediction, and it is printed here whichever way the result goes.")
    A("")
    A("**Three arms on one held-back year is three chances to look good by luck.** "
      "Two of them are compared against the incumbent, so with two shots at a "
      "5% test the chance that at least one clears by chance alone is nearer 10% "
      "than 5%. The gate is the 95% interval, as it has been in every lane; the "
      "stricter interval that corrects for taking two shots is printed beside "
      "every comparison below.")
    A("")
    for a in ARM_ORDER:
        s, g = s_hb[a], g_hb[a]
        lo, hi = gates9.mean_ci95([t.net_r for t in hb[a]])
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
             if lo <= 0 <= hi else ", which excludes zero."))
    A("")
    for a in (kcfg.ARM_KAI, kcfg.ARM_BOTH):
        d = paired[a]
        m = float(np.mean(d)) if d else float("nan")
        lo, hi = gates9.mean_ci95(d)
        blo, bhi = gates9.mean_ci(d, gates9.Z_BONFERRONI)
        A(f"- **{a} minus relvol**, paired day by day: **{_money(m)}** a trade "
          f"on $1,000 of risk ({m:+.4f}R), with a 95% range of "
          f"{_money(lo)} to {_money(hi)}, over {len(d):,} days both arms "
          "traded. "
          + ("That range excludes zero, in the challenger's favour"
             + ("; and it still does once corrected for taking two shots "
                f"({_money(blo)} to {_money(bhi)})."
                if blo > 0 else
                " — but NOT once corrected for taking two shots "
                f"({_money(blo)} to {_money(bhi)}), so this margin sits inside "
                "the multiplicity problem.")
             if lo > 0 else
             "That range contains zero" + (
                 ", and the challenger's middle number is negative — it did "
                 "worse, and by more than a rounding error." if m < 0 else
                 ", so no difference is established either way.")))
    A("")
    A(f"- **Verdict**: **{verdict}**.")
    A("")
    if verdict == gates9.RELVOL_HOLDS:
        A("**The incumbent held.** Neither challenger beat abnormal opening "
          "volume by a margin that clears its own error bar, so nothing changes "
          "and the selector that ENGINE-7 measured stays as it is. That is a "
          "useful result: the cheapest way to break a working system is to "
          "replace its one measured component with a number that has never been "
          "measured.")
        A("")
    A("**Which gates carried the verdict, in words.** " + " ".join(
        f"{g.id} {'passed' if g.passed else 'FAILED'} ({g.name})." for g in rows))
    A("")

    # --- the bar -----------------------------------------------------------
    A("## The bar, and what it observed")
    A("")
    A("All five gates are read on the held-back year only.")
    A("")
    A("| id | gate | threshold | observed | |")
    A("|---|---|---|---|---|")
    for g in rows:
        A(f"| **{g.id}** | {g.name} | {g.threshold} | {g.observed} | "
          f"{'PASS' if g.passed else 'FAIL'} |")
    A("")

    # --- the held-back year ------------------------------------------------
    A(f"## The held-back year, {gates9.HELD_BACK[0]} → {gates9.HELD_BACK[1]} — "
      "gross before net, median beside mean")
    A("")
    A("| arm | n | mean gross R | median gross R | mean net R | median net R | "
      "$ per $1,000 risked | hit | PF | stopped |")
    A("|---|---|---|---|---|---|---|---|---|---|")
    for a in ARM_ORDER:
        s, g = s_hb[a], g_hb[a]
        A(f"| {a} | {s.n:,} | {fmt(g[0],4)} | {fmt(g[1],4)} | {fmt(s.mean_r,4)} | "
          f"{fmt(s.median_r,4)} | {s.mean_r*RISK_DOLLARS:+,.0f} | "
          f"{fmt(s.hit_rate*100,1)}% | {fmt(s.profit_factor,2)} | "
          f"{fmt(_stopped(hb[a])*100,1)}% |")
    A("")
    A("Same rules, same costs, same fills, same candidate pond. The arms differ "
      "in the ranking key and in nothing else.")
    A("")
    A("### The two comparisons against the incumbent, paired by day")
    A("")
    A("| comparison | n days | mean diff R | $ per $1,000 | 95% interval | "
      "97.5% (two comparisons) | clears 95% |")
    A("|---|---|---|---|---|---|---|")
    for a in (kcfg.ARM_KAI, kcfg.ARM_BOTH):
        d = paired[a]
        m = float(np.mean(d)) if d else float("nan")
        lo, hi = gates9.mean_ci95(d)
        blo, bhi = gates9.mean_ci(d, gates9.Z_BONFERRONI)
        A(f"| {a} − relvol | {len(d):,} | {m:+.4f} | {m*RISK_DOLLARS:+,.0f} | "
          f"{lo:+.4f} to {hi:+.4f} | {blo:+.4f} to {bhi:+.4f} | "
          f"{'yes' if lo > 0 else 'no'} |")
    A("")
    A("Paired by day rather than by trade because trades taken on the same "
      "morning are not independent of each other; the day effect is exactly what "
      "a comparison of selectors has to remove.")
    A("")
    for a in (kcfg.ARM_KAI, kcfg.ARM_BOTH):
        x = np.array([t.net_r for t in hb[a]], dtype="float64")
        y = np.array([t.net_r for t in hb[kcfg.ARM_RELVOL]], dtype="float64")
        if len(x) > 1 and len(y) > 1:
            dd = float(x.mean() - y.mean())
            se = float(np.sqrt(x.var(ddof=1) / len(x) + y.var(ddof=1) / len(y)))
            A(f"*Diagnostic, not a gate:* {a} minus relvol unpaired at trade "
              f"level is {dd:+.4f}R (95%: {dd-1.96*se:+.4f} to {dd+1.96*se:+.4f}), "
              f"n={len(x):,} against {len(y):,}.")
    A("")
    A("### Held back, by arm and side")
    A("")
    A(SUMMARY_HEADER)
    for a in ARM_ORDER:
        for k, v in sorted(split_by(hb[a], lambda t: t.side).items()):
            A(summary_row(summarise(v, f"{a} {k}")))
    A("")

    # --- overlap -----------------------------------------------------------
    A("### How different are the three lists, actually")
    A("")
    A("| | picks a day | overlap with relvol | overlap with kai |")
    A("|---|---|---|---|")
    sets: dict[str, dict[int, set[str]]] = {a: {} for a in ARM_ORDER}
    for r in sel["rows"]:
        if hb_lo <= int(r["day"]) <= hb_hi:
            sets[r["arm"]].setdefault(int(r["day"]), set()).add(r["symbol"])
    for a in ARM_ORDER:
        n_days = len(sets[a]) or 1
        per = sum(len(v) for v in sets[a].values()) / n_days
        def ov(other):
            days = set(sets[a]) & set(sets[other])
            if not days:
                return float("nan")
            return float(np.mean([len(sets[a][d] & sets[other][d]) for d in days]))
        A(f"| {a} | {per:.1f} | {ov(kcfg.ARM_RELVOL):.1f} | {ov(kcfg.ARM_KAI):.1f} |")
    A("")
    A("If two selectors pick mostly the same names, the comparison between them "
      "is a comparison of the few names they disagree about, whatever the trade "
      "count says.")
    A("")
    A("### And what kind of name does each one pick")
    A("")
    A("| arm | median relative volume | median Kai score | share with a Kai score |")
    A("|---|---|---|---|")
    for a in ARM_ORDER:
        rs = [float(r["rvol"]) for r in sel["rows"]
              if r["arm"] == a and hb_lo <= int(r["day"]) <= hb_hi]
        sc = [int(r["score"]) for r in sel["rows"]
              if r["arm"] == a and hb_lo <= int(r["day"]) <= hb_hi]
        scored_only = [x for x in sc if x >= 0]
        A(f"| {a} | {np.median(rs) if rs else float('nan'):.2f}x | "
          + (f"{np.median(scored_only):.0f}" if scored_only else "n/a")
          + f" | {100.0*len(scored_only)/max(len(sc),1):.0f}% |")
    A("")
    A("The two keys are measuring different things, and this is the table that "
      "says so: a name can be the busiest stock of the morning and have no Kai "
      "score at all, because Kai's score requires a fresh trend-cloud flip on "
      "the DAILY chart and most busy mornings do not come with one.")
    A("")
    ident, total = _matches_engine6(sel)
    if total:
        A(f"**The incumbent arm is not a re-implementation of ENGINE-6's "
          f"selector; it is the same one.** On the {total:,} sessions the two "
          f"lanes share, the `relvol` picks here are identical to the names "
          f"ENGINE-6 wrote to `selection.json.gz` on **{ident:,}** of them "
          f"({100.0*ident/total:.2f}%). Anything the challengers gain or lose is "
          "measured against the thing ENGINE-7 actually reported.")
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

    # --- build window ------------------------------------------------------
    A(f"## The build window, {gates9.BUILD[0]} → {gates9.BUILD[1]} — a "
      "disclosure, not a verdict")
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
        A(f"| {a} | {s.n:,} | {fmt(g[0],4)} | {fmt(s.mean_r,4)} | "
          f"{fmt(s.median_r,4)} | {s.mean_r*RISK_DOLLARS:+,.0f} | "
          f"{fmt(s.hit_rate*100,1)}% | {fmt(s.profit_factor,2)} | "
          f"{fmt(_stopped(bd[a])*100,1)}% |")
    A("")
    A("| comparison (build window) | n days | mean diff R | 95% interval |")
    A("|---|---|---|---|")
    for a in (kcfg.ARM_KAI, kcfg.ARM_BOTH):
        d = paired_bd[a]
        m = float(np.mean(d)) if d else float("nan")
        lo, hi = gates9.mean_ci95(d)
        A(f"| {a} − relvol | {len(d):,} | {m:+.4f} | {lo:+.4f} to {hi:+.4f} |")
    A("")
    A("### By calendar year, all three arms")
    A("")
    A(SUMMARY_HEADER)
    for a in ARM_ORDER:
        for k, v in sorted(split_by(trades[a], lambda t: str(t.day)[:4]).items()):
            A(summary_row(summarise(v, f"{a} {k}")))
    A("")

    # --- does the score rank at all ----------------------------------------
    A("## Does the score rank, within the names it picked?")
    A("")
    A("The comparison above asks whether Kai's score picks a better twenty. This "
      "asks the narrower question the honest prior failed: inside the twenty it "
      "did pick, does a higher score mean a better trade?")
    A("")
    score_of = {(r["symbol"], int(r["day"])): int(r["score"])
                for r in sel["rows"] if r["arm"] == kcfg.ARM_KAI}
    vals = np.array([score_of.get((t.symbol, t.day), -1) for t in hb[kcfg.ARM_KAI]])
    ok = vals >= 0
    if ok.sum() > 50:
        bands = [(0, 60, "D (<60)"), (60, 70, "C (60-69)"), (70, 80, "B (70-79)"),
                 (80, 101, "A (80+)")]
        A(SUMMARY_HEADER)
        for lo_b, hi_b, name in bands:
            grp = [t for t, v in zip(hb[kcfg.ARM_KAI], vals)
                   if lo_b <= v < hi_b]
            if grp:
                A(summary_row(summarise(grp, name)))
        A("")
        med = float(np.median(vals[ok]))
        hi_g = [t.net_r for t, v in zip(hb[kcfg.ARM_KAI], vals) if v >= med]
        lo_g = [t.net_r for t, v in zip(hb[kcfg.ARM_KAI], vals) if 0 <= v < med]
        if len(hi_g) > 1 and len(lo_g) > 1:
            xh, xl = np.array(hi_g), np.array(lo_g)
            dd = float(xh.mean() - xl.mean())
            se = float(np.sqrt(xh.var(ddof=1) / len(xh) + xl.var(ddof=1) / len(xl)))
            A(f"Split at the median score ({med:.0f}): the higher half returned "
              f"{float(xh.mean()):+.4f}R net (n={len(xh):,}), the lower half "
              f"{float(xl.mean()):+.4f}R (n={len(xl):,}), a difference of "
              f"{dd:+.4f}R (95%: {dd-1.96*se:+.4f} to {dd+1.96*se:+.4f}).")
            A("")
        n55 = int((vals >= 55).sum())
        A(f"The live scanner only sends an alert at a score of 55 or better. "
          f"{n55:,} of {int(ok.sum()):,} held-back `kai` picks ({100.0*n55/max(int(ok.sum()),1):.0f}%) "
          "would have cleared that floor.")
        A("")

    # --- the port ----------------------------------------------------------
    A("## What was ported, and what could not be")
    A("")
    A("The score here is `CheatCodeScanner.score_cheatcode` from "
      "`~/breakout-alert-system`, with the CCA V5 indicators from "
      "`cheatcode_engine.py` — CheatCode Trend Clouds, the swing oscillator, "
      "squeeze momentum, the EMA cloud — plus the `AlertBase` helpers (Wilder "
      "RSI, Bollinger %B) and `pattern_engine`'s pivot-cluster support and "
      "resistance. `engine/kai_score/reference_cca.py` holds a verbatim copy of "
      "all of it, and `tests/test_kai_score.py` requires the fast port to return "
      "the identical integer score, component by component, on hundreds of "
      "ticker-days. `engine/kai_score/verify_port.py` runs the same comparison "
      "against the REAL tape — halted sessions, one-cent ranges, week-long gaps, "
      "names that listed inside the window — and reported **720 ticker-days "
      "checked, 157 of them scored, 0 mismatches** on 2026-08-29.")
    A("")
    A("**Reproduced exactly:** all ten components and their arithmetic; the "
      "two-stage funnel (a 100-calendar-day fetch to find a fresh trend-cloud "
      "flip and set the direction, then a 190-calendar-day fetch to score); the "
      "$5 price and 500,000-share floors; the window-dependent Wilder RSI seed; "
      "the fact that the '52-week' proximity is measured over the ~180 calendar "
      "days actually fetched and not over 52 weeks.")
    A("")
    A("**Two defects in the live code, reproduced rather than fixed:**")
    A("")
    A("1. `ema_cloud` writes `ema_fast_bullish` / `ema_slow_bullish`; the scorer "
      "reads `ema_fast_bull` / `ema_slow_bull`. The keys do not match, so the "
      "**EMA-cloud component — a tenth of the score, nominally 0-10 — has never "
      "contributed a single point.** It contributes none here either.")
    A("2. `CheatCodeScanner` calls `engine.supertrend(...)` on a "
      "`CheatCodeEngine` instance, and that class defines no such method — the "
      "indicators are module-level functions. Every call raises inside the "
      "scanner's own `try/except`, so **`CheatCodeScanner.scan_market()` returns "
      "an empty list today, for every ticker.** This lane scores what the "
      "scanner was written to compute, not the nothing it currently returns.")
    A("")
    A("**Not reproducible, and why:**")
    A("")
    A("- **The score in the honest prior is a different number.** The graded "
      "alerts in `alert_performance_honest` come from the V5 composite in "
      "`kai_morning_alerts.py`, not from `score_cheatcode`. That composite reads "
      "market capitalisation from a fundamentals API as of the scan, a sector "
      "stance from a live market-bias call, premarket volume, a hand-maintained "
      "popular-ticker list and a news-catalyst lookup. Several of those are not "
      "recoverable as of a past date, and the ones that are would be lookahead. "
      "**It cannot be backtested honestly, and this report does not claim to "
      "have tested it.** The brief names `score_cheatcode`, and that is what was "
      "ported.")
    A("- **Data vendor.** The live scanner reads Polygon daily aggregates with "
      "`adjusted=true` per ticker. The cache here holds unadjusted grouped bars, "
      "deliberately, because the universe filter is 'price over $5 as a trader "
      "saw it'. Polygon's splits reference table was fetched once and used to "
      "back-adjust the price and volume series to the state a scan on that date "
      "would have seen — splits strictly at or before the as-of date, never "
      "after. Every component of the score is scale-invariant, so this is exact "
      "up to the two absolute floors, which are applied in as-of-date money. "
      + _split_exposure())
    A("- **The funnel caps.** The live scanner truncates to the 25 highest "
      "volume ratios before scoring — an API budget — and drops anything under a "
      "score of 55. Neither is applied. Applying the first would smuggle "
      "relative volume into the `kai` arm and confound the two things this lane "
      "is trying to separate; the second is a floor on how many alerts to send, "
      "not a ranking rule. The share of picks that would have cleared 55 is "
      "reported above.")
    A("- **The regime gate and the cooldown.** The live scanner skips the whole "
      "scan when the market regime is CHOPPY, and suppresses a ticker alerted in "
      "the last seven days. The first needs a live market-bias call; the second "
      "is an alert-hygiene rule, not a selector. Neither is applied.")
    A("- **As of when.** The live scanner runs during the session and reads "
      "today's partial daily bar as the last bar. Doing that here would be "
      "reading the bar of the session being traded. The as-of bar is the last "
      "FULLY CLOSED daily bar, so the score for a Monday is a function of "
      "Friday's close and is knowable at 09:30.")
    A("")

    # --- census and coverage ------------------------------------------------
    A("## Census and coverage")
    A("")
    cov = np.array(sel["coverage"], dtype="int64")
    A(f"- sessions planned: **{len(cov):,}**")
    A(f"- candidates a day: median **{np.median(cov[:,2]):.0f}** of a "
      f"{np.median(cov[:,1]):.0f}-name pool — pool names with an opening bar and "
      "a full 14-session baseline")
    A(f"- of those, **{np.median(cov[:,3]):.0f}** on the median day had a Kai "
      f"score at all ({100.0*np.median(cov[:,3]/np.maximum(cov[:,2],1)):.0f}% — "
      "the rest had no fresh trend-cloud flip in their last three daily bars, "
      "so the live scanner would never have scored them)")
    A("")
    A("| | " + " | ".join(ARM_ORDER) + " |")
    A("|---|" + "---|" * len(ARM_ORDER))
    keys = sorted(set().union(*[set(census[a]) for a in ARM_ORDER]))
    for k in keys:
        A(f"| {k} | " + " | ".join(f"{census[a].get(k,0):,}" for a in ARM_ORDER) + " |")
    A("| symbol-days with no cached bars | "
      + " | ".join(f"{missing[a]:,}" for a in ARM_ORDER) + " |")
    A("")

    # --- cost sensitivity ---------------------------------------------------
    A("## Cost sensitivity — disclosed, and not a result")
    A("")
    A("The pre-registered cost model is $0.005/share/side plus 1.0 bp of adverse "
      "slippage, unchanged for the ninth time. **The gate is after the "
      "pre-registered costs and does not move.**")
    A("")
    A("| arm | cost model | n | mean R | median R | hit | PF |")
    A("|---|---|---|---|---|---|---|")
    for a, key in ((kcfg.ARM_RELVOL, "relvol"), (kcfg.ARM_KAI, "kai")):
        for lbl, ts in (("pre-registered (the result)", hb[a]),
                        ("quarter-bp slippage", _window(extra.get(f"{key}_cheap", []), hb_lo, hb_hi)),
                        ("zero cost (true gross)", _window(extra.get(f"{key}_nocost", []), hb_lo, hb_hi))):
            if not ts:
                continue
            ss = summarise(ts, lbl)
            A(f"| {a} | {lbl} | {ss.n:,} | {fmt(ss.mean_r,4)} | "
              f"{fmt(ss.median_r,4)} | {fmt(ss.hit_rate*100,1)}% | "
              f"{fmt(ss.profit_factor,2)} |")
    A("")

    # --- confidence ---------------------------------------------------------
    A("## How sure we actually are, and what would change the answer")
    A("")
    A(f"- The verdict rests on ONE calendar year — {len(days_hb):,} sessions — "
      "and on the trade counts in the table above. One year is one regime.")
    A("- **This is the held-back year's third reading.** ENGINE-7's held-back "
      "window (2024-01-01 → 2026-08-28) contained all of it, and ENGINE-8's did "
      "too. Every reading costs some of what makes a held-back window worth "
      "holding back, and no correction is applied. What is new in this lane is "
      "only the selector; the rules downstream have been read on this year "
      "before.")
    A("- **`orb_sip.v2`'s stop width was chosen by looking at a sweep of "
      "2016-2023.** That does not touch the held-back year, but it does mean the "
      "build window above inherits the contamination for 2021-2023.")
    A("- **Two comparisons, one year.** The Bonferroni column in the comparison "
      "table is the size of that problem, printed rather than argued about.")
    A("- **What would change the answer, in order of how much it would move it:** "
      "(1) the fill model — every entry is a resting stop order filled at the "
      "worse of the level and the bar's open, and real fills on the morning's "
      "most volatile names are worse than that; (2) borrow on the short side, "
      "which this harness does not model at all; (3) the pool, which is the top "
      f"{sel['pool_n']:,} of the eligible universe by dollar volume rather than "
      "all of it, and which bites the `kai` arm differently from the `relvol` "
      "arm because a coiled small-cap is exactly what the pool boundary removes; "
      "(4) the 4x leverage cap, which decides how much of any per-trade edge "
      "survives into a portfolio number.")
    A("- **What this report does NOT establish**: that any of these three "
      "selectors is worth trading. It establishes which of them ranked better on "
      "one held-back year, under one set of downstream rules that has itself "
      "only ever come back PARTIAL.")
    A("")
    A("## Selection, and the lookahead treatment")
    A("")
    A(f"- pool: top {sel['pool_n']:,} of the eligible set by 20-day average "
      "dollar volume as of the prior close — ENGINE-6's pool, unchanged")
    A(f"- candidates: pool names with a 09:30-09:35 bar today and a full "
      f"{sel['baseline_days']}-session baseline, so a relative volume exists. "
      "All three arms rank the same list.")
    A(f"- `relvol`: top {sel['top_k']} by that relative volume, floor "
      f"{sel['min_rvol']:.1f}")
    A(f"- `kai`: top {sel['top_k']} by Kai's breakout score on the last fully "
      "closed daily bar")
    A(f"- `both`: among names with both keys, the {sel['top_k']} smallest sums "
      "of the two within-day ranks")
    A("- the opening-bar parquet holds only 09:30-10:30, so the afternoon of the "
      "day being selected for was never written; the daily bars stop at the "
      "prior close by construction. `tests/test_kai_score.py` runs the poisoned-"
      "future and amputated-future attacks against the score and catches a "
      "deliberately cheating scorer with the same harness; "
      "`tests/test_sip_selection.py` does the same for the relative-volume "
      "ranking.")
    A("")
    A("## Costs and fills")
    A("")
    A(f"- ${COSTS.commission_per_share:.3f}/share/side commission, "
      f"{COSTS.slippage_bps:.1f} bp adverse slippage on market and stop fills")
    A("- entry is a resting stop order, filled at the worse of the level and the "
      "bar's open, plus slippage")
    A("- the stop is a LEVEL, not a distance carried from the fill")
    A("")

    REPORT.parent.mkdir(parents=True, exist_ok=True)
    REPORT.write_text("\n".join(L) + "\n")
    print("\n".join(L[:70]))
    print(f"\nwrote {REPORT}")

    dump = REPORT.with_suffix(".trades.csv.gz")
    with gzip.open(dump, "wt") as f:
        f.write("arm,symbol,day,side,entry_minute,exit_minute,fill_price,"
                "stop_price,exit_price,exit_reason,risk_per_share,gross_r,net_r\n")
        for a in ARM_ORDER:
            for t in trades[a]:
                f.write(f"{a},{t.symbol},{t.day},{t.side},{t.entry_minute},"
                        f"{t.exit_minute},{t.fill_price:.4f},{t.stop_price:.4f},"
                        f"{t.exit_price:.4f},{t.exit_reason},"
                        f"{t.risk_per_share:.4f},{t.gross_r:.5f},{t.net_r:.5f}\n")
    print(f"wrote {dump}")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--stage", choices=["score", "plan", "run"], required=True)
    a = ap.parse_args()
    {"score": stage_score, "plan": stage_plan, "run": stage_run}[a.stage]()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
