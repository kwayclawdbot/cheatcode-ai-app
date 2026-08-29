"""ENGINE-6 — replicate the published stocks-in-play ORB, and say honestly
whether this harness can see it.

    .venv/bin/python run_engine6.py --stage plan       # selection, then pairs.json
    .venv/bin/python sip/fetch_days.py --pairs <path>  # stage B download
    .venv/bin/python run_engine6.py --stage run        # backtest + report

`plan` is deliberately separate from `run`. The selection is decided from
grouped daily bars through the prior close and the 09:30-09:35 volume, written
to disk, and only then are one-minute bars requested for the sessions it named.
The download therefore cannot influence the selection, and the intermediate
file is the receipt.
"""

from __future__ import annotations

import argparse
import gzip
import json
import sys
from collections import Counter
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from engine import calendar_us  # noqa: E402
from engine.backtest.engine import run_symbol  # noqa: E402
from engine.backtest.stats import (SUMMARY_HEADER, fmt, split_by,  # noqa: E402
                                   summarise, summary_row)
from engine.backtest.types import Costs  # noqa: E402
from engine.cache import load as cache_load  # noqa: E402
from engine.models import gates  # noqa: E402
from engine.models.orb_sip import OrbStocksInPlay, OrbStocksInPlayCoinflip  # noqa: E402
from engine.sip import config as scfg  # noqa: E402
from engine.sip import universe  # noqa: E402
from engine.sip.control import select_day_random  # noqa: E402
from engine.sip.portfolio import run_portfolio  # noqa: E402
from engine.sip.selection import select_day  # noqa: E402
from engine.sip.store import load_open_store  # noqa: E402

SELECTION_PATH = scfg.DATA_ROOT / "selection.json.gz"
PAIRS_PATH = scfg.DATA_ROOT / "pairs.json"
REPORT = Path(__file__).resolve().parent / "reports" / f"orb_sip.v1.{scfg.SNAPSHOT}.md"
COSTS = Costs()
# Sensitivities, clearly labelled and never a result. ENGINE-4 measured that
# a proportional slippage model overcharges a cheap instrument with a tight
# stop; a tenth of an ATR is the tightest stop this programme has traded, so
# the same disclosure is owed here.
FREE = Costs(commission_per_share=0.0, slippage_bps=0.0)
CHEAP = Costs(commission_per_share=0.005, slippage_bps=0.25)

ARM_SIP = "sip"
ARM_UNFILTERED = "unfiltered"


def _d(s: str) -> int:
    return int(s.replace("-", ""))


# ---------------------------------------------------------------------------
# plan


def stage_plan() -> None:
    if not (scfg.DATA_ROOT / "eligible.parquet").exists():
        print("building the eligible universe from grouped daily bars...", flush=True)
        universe.build_eligible()
    tab = universe.eligible_table()
    print("loading the 09:30-09:35 opening bars...", flush=True)
    store = load_open_store()
    print(f"  {len(store.symbols()):,} symbols in the opening store", flush=True)

    days = [_d(x) for x in calendar_us.trading_days(scfg.START, scfg.END)]
    rows: list[dict] = []
    cover: list[tuple[int, int, int, int]] = []
    for day in days:
        row = tab.get(day)
        if row is None:
            continue
        eligible = [str(x) for x in row["ticker"]]
        pool = eligible[:scfg.POOL_N]
        have = [s for s in pool if store.has(s)]
        picks = select_day(day, have, store)
        ctrl = select_day_random(day, have, store)
        # "Visible to the selector" is the number of the day's ELIGIBLE names
        # that actually got a relative-volume score — an opening bar today and a
        # full 14-session baseline. Counting symbols present in the store would
        # overstate it, because the store holds every name that was ever in the
        # pool, not the ones that traded on this date.
        scored = sum(1 for s in have if store.rvol(s, day) is not None)
        cover.append((day, len(eligible), len(pool), scored))
        # Where in the liquidity list a selected name sits. If the picks cluster
        # against the bottom of the pool, the pool boundary is binding and a
        # bigger one would change the answer; if they are spread through it, the
        # boundary is not what decides. Free to record, and it is the first
        # thing to read if Phase 1 misses.
        dv_rank = {s: i + 1 for i, s in enumerate(eligible)}
        for p in picks:
            rows.append({"day": day, "symbol": p.symbol, "arm": ARM_SIP,
                         "rvol": p.rvol, "rank": p.rank,
                         "dv_rank": dv_rank.get(p.symbol, -1),
                         "open_volume": p.open_volume, "baseline": p.baseline})
        for p in ctrl:
            rows.append({"day": day, "symbol": p.symbol, "arm": ARM_UNFILTERED,
                         "rvol": p.rvol, "rank": p.rank,
                         "open_volume": 0.0, "baseline": 0.0})

    SELECTION_PATH.parent.mkdir(parents=True, exist_ok=True)
    with gzip.open(SELECTION_PATH, "wt") as f:
        json.dump({"rows": rows, "coverage": cover,
                   "pool_n": scfg.POOL_N, "top_k": scfg.TOP_K,
                   "baseline_days": scfg.RVOL_BASELINE_DAYS,
                   "min_rvol": scfg.MIN_RVOL,
                   "window": [scfg.START, scfg.END]}, f)

    pairs = sorted({(r["symbol"], r["day"]) for r in rows})
    PAIRS_PATH.write_text(json.dumps([[s, d] for s, d in pairs]))
    el = np.array([c[1] for c in cover])
    hv = np.array([c[3] for c in cover])
    print(f"days planned            {len(cover):,}")
    print(f"eligible per day        median {np.median(el):.0f} (min {el.min()}, max {el.max()})")
    print(f"pool with opening bars  median {np.median(hv):.0f} "
          f"= {100.0 * np.median(hv / np.maximum(el, 1)):.0f}% of eligible")
    print(f"selections              {len(rows):,} rows, {len(pairs):,} distinct symbol-days")
    print(f"wrote {SELECTION_PATH} and {PAIRS_PATH}")


# ---------------------------------------------------------------------------
# run


def _load_selection() -> dict:
    with gzip.open(SELECTION_PATH, "rt") as f:
        return json.load(f)


def _atr_map(pairs: set[tuple[str, int]]) -> dict[tuple[str, int], float]:
    tab = universe.eligible_table()
    want: dict[int, set[str]] = {}
    for s, d in pairs:
        want.setdefault(d, set()).add(s)
    out: dict[tuple[str, int], float] = {}
    for day, syms in want.items():
        row = tab.get(day)
        if row is None:
            continue
        for t, a in zip(row["ticker"], row["atr"]):
            t = str(t)
            if t in syms:
                out[(t, day)] = float(a)
    return out


def _replay(days_by_symbol: dict[str, set[int]], atr: dict,
            configs: list[tuple[str, object, Costs]]) -> tuple[dict, dict, int]:
    """One pass over the tape, several models on it.

    Loading a symbol is the expensive part, so the model, its matched control
    and the cost sensitivities all see the same series in the same pass. They
    are independent replays sharing a read, not a shared replay.
    """
    trades: dict[str, list] = {name: [] for name, _, _ in configs}
    census: dict[str, Counter] = {name: Counter() for name, _, _ in configs}
    missing = 0
    for i, (sym, days) in enumerate(sorted(days_by_symbol.items())):
        try:
            series = cache_load.load(sym, "1m", scfg.SNAPSHOT)
        except FileNotFoundError:
            missing += len(days)
            continue
        for name, model_cls, costs in configs:
            model = model_cls(atr)
            t, _ = run_symbol(series, model, costs, warmup_days=0,
                              day_filter=lambda d, days=days: int(d) in days)
            model.finish()
            trades[name].extend(t)
            census[name].update(model.census)
        if (i + 1) % 500 == 0:
            print(f"  replayed {i+1:,} symbols, "
                  f"{len(trades[configs[0][0]]):,} trades", flush=True)
    return trades, census, missing


def _window(trades, lo: int, hi: int):
    return [t for t in trades if lo <= t.day <= hi]


def _paired_gross(model_trades, control_trades):
    ctl = {(t.symbol, t.day): t for t in control_trades}
    out = []
    for t in model_trades:
        c = ctl.get((t.symbol, t.day))
        if c is not None:
            out.append(t.gross_r - c.gross_r)
    return out


def _paired_by_day(a_trades, b_trades):
    """Per-day mean net R of arm A minus arm B, on days both arms traded."""
    def by_day(ts):
        d: dict[int, list[float]] = {}
        for t in ts:
            d.setdefault(int(t.day), []).append(float(t.net_r))
        return {k: float(np.mean(v)) for k, v in d.items()}
    a, b = by_day(a_trades), by_day(b_trades)
    return [a[d] - b[d] for d in sorted(set(a) & set(b))]


def stage_run() -> None:
    sel = _load_selection()
    rows = sel["rows"]
    pairs = {(r["symbol"], int(r["day"])) for r in rows}
    atr = _atr_map(pairs)
    print(f"selection: {len(rows):,} rows, {len(pairs):,} symbol-days, "
          f"{len(atr):,} with an ATR", flush=True)

    arms: dict[str, dict[str, set[int]]] = {ARM_SIP: {}, ARM_UNFILTERED: {}}
    for r in rows:
        arms[r["arm"]].setdefault(r["symbol"], set()).add(int(r["day"]))

    print("replaying the stocks-in-play arm and its matched control...", flush=True)
    a, ac, sip_missing = _replay(arms[ARM_SIP], atr, [
        ("sip", OrbStocksInPlay, COSTS),
        ("flip", OrbStocksInPlayCoinflip, COSTS),
        ("sip_nocost", OrbStocksInPlay, FREE),
        ("sip_cheap", OrbStocksInPlay, CHEAP),
    ])
    print("replaying the unfiltered control...", flush=True)
    b, bc, unf_missing = _replay(arms[ARM_UNFILTERED], atr, [
        ("unfiltered", OrbStocksInPlay, COSTS),
    ])
    print(f"trades: sip={len(a['sip']):,} flip={len(a['flip']):,} "
          f"unfiltered={len(b['unfiltered']):,}", flush=True)

    write_report(sel, a["sip"], a["flip"], b["unfiltered"],
                 ac["sip"], bc["unfiltered"], sip_missing, unf_missing,
                 a["sip_nocost"], a["sip_cheap"])


# ---------------------------------------------------------------------------
# report


def _gross_summary(trades):
    """Mean/median GROSS R — reported before the net numbers, every time."""
    if not trades:
        return float("nan"), float("nan")
    g = np.array([t.gross_r for t in trades], dtype="float64")
    return float(np.mean(g)), float(np.median(g))


def write_report(sel, sip, flip, unf, sip_census, unf_census,
                 sip_missing, unf_missing, sip_free=None,
                 sip_cheap=None) -> None:
    rep_lo, rep_hi = (_d(x) for x in gates.SIP_REPLICATION_WINDOW)
    hb_lo, hb_hi = (_d(x) for x in gates.SIP_HELD_BACK)

    sip_rep, sip_hb = _window(sip, rep_lo, rep_hi), _window(sip, hb_lo, hb_hi)
    flip_rep = _window(flip, rep_lo, rep_hi)
    unf_rep, unf_hb = _window(unf, rep_lo, rep_hi), _window(unf, hb_lo, hb_hi)

    s_rep = summarise(sip_rep, "in play, replication window")
    s_hb = summarise(sip_hb, "in play, held back")
    u_rep = summarise(unf_rep, "unfiltered, replication window")
    u_hb = summarise(unf_hb, "unfiltered, held back")
    f_rep = summarise(flip_rep, "coin flip, replication window")

    g_mean, g_med = _gross_summary(sip_rep)
    ug_mean, ug_med = _gross_summary(unf_rep)
    fg_mean, fg_med = _gross_summary(flip_rep)

    paired_flip = _paired_gross(sip_rep, flip_rep)
    paired_unf = _paired_by_day(sip_rep, unf_rep)

    days_rep = [_d(x) for x in calendar_us.trading_days(*gates.SIP_REPLICATION_WINDOW)]
    days_all = [_d(x) for x in calendar_us.trading_days(scfg.START, scfg.END)]
    pf_rep = run_portfolio(sip_rep, days_rep)
    pf_all = run_portfolio(sip, days_all)
    pf_unf = run_portfolio(unf_rep, days_rep)

    gate_rows = gates.evaluate_sip(s_rep, g_mean, paired_flip, paired_unf, pf_rep)
    verdict = gates.verdict_sip(gate_rows)

    cover = np.array(sel["coverage"], dtype="int64")
    el, pool, have = cover[:, 1], cover[:, 2], cover[:, 3]

    L: list[str] = []
    A = L.append
    A(f"# `orb_sip.v1` — the published stocks-in-play ORB, replicated")
    A("")
    A(f"**Verdict: {verdict}.**")
    A("")
    A(f"Snapshot `{scfg.SNAPSHOT}`. Replication window "
      f"{gates.SIP_REPLICATION_WINDOW[0]} → {gates.SIP_REPLICATION_WINDOW[1]} — "
      f"the paper's own window — with {gates.SIP_HELD_BACK[0]} → "
      f"{gates.SIP_HELD_BACK[1]} held back and reported separately. Gate: "
      "[`../models/orb_sip.v1/GATE.md`](../models/orb_sip.v1/GATE.md), committed "
      "before any number below existed.")
    A("")
    A("## In plain English")
    A("")
    frac = float(np.median(have / np.maximum(el, 1)))
    A(f"- **Pool size**: a median **{int(np.median(have)):,} names a day** were scored "
      f"and rankable at 09:35, against a median **{int(np.median(el)):,}** that passed "
      f"the paper's universe filter — **{100.0*frac:.0f}% of the eligible universe was "
      "visible to the selector**"
      + (". The pool is not the binding constraint: `POOL_N` is at or above the "
         "eligible count on the typical day, so the selector saw essentially the "
         "whole universe the paper defines."
         if frac >= 0.9 else
         ". This is a weaker filter than the paper's and the direction of the "
         "weakness is against us: the names it misses are the smaller, more "
         "volatile ones where a doubling of opening volume is most likely."))
    A(f"- **Universe**: {int(np.median(el)):,} names on the median day; "
      "the distinct set over the whole window is reported under 'the data' below. "
      "The paper's is 7,000+ US stocks over 2016-2023.")
    A(f"- **Date range**: {gates.SIP_REPLICATION_WINDOW[0]} → "
      f"{gates.SIP_HELD_BACK[1]}, {len(days_all):,} sessions.")
    A(f"- **Trade count**: {len(sip_rep):,} in the replication window, "
      f"{len(sip_hb):,} held back, {len(sip):,} in total.")
    A(f"- **Did it reproduce**: **{verdict}**.")
    A("")
    A("## The bar, and what it observed")
    A("")
    A("| id | gate | threshold | observed | |")
    A("|---|---|---|---|---|")
    for g in gate_rows:
        A(f"| **{g.id}** | {g.name} | {g.threshold} | {g.observed} | "
          f"{'PASS' if g.passed else 'FAIL'} |")
    A("")
    A("## Gross before net, median beside mean")
    A("")
    A("| arm | n | mean gross R | median gross R | mean net R | median net R | hit | PF |")
    A("|---|---|---|---|---|---|---|---|")
    A(f"| stocks in play | {s_rep.n} | {fmt(g_mean,4)} | {fmt(g_med,4)} | "
      f"{fmt(s_rep.mean_r,4)} | {fmt(s_rep.median_r,4)} | {fmt(s_rep.hit_rate*100,1)}% | "
      f"{fmt(s_rep.profit_factor,2)} |")
    A(f"| unfiltered control | {u_rep.n} | {fmt(ug_mean,4)} | {fmt(ug_med,4)} | "
      f"{fmt(u_rep.mean_r,4)} | {fmt(u_rep.median_r,4)} | {fmt(u_rep.hit_rate*100,1)}% | "
      f"{fmt(u_rep.profit_factor,2)} |")
    A(f"| matched coin flip | {f_rep.n} | {fmt(fg_mean,4)} | {fmt(fg_med,4)} | "
      f"{fmt(f_rep.mean_r,4)} | {fmt(f_rep.median_r,4)} | {fmt(f_rep.hit_rate*100,1)}% | "
      f"{fmt(f_rep.profit_factor,2)} |")
    A("")
    A("All three arms use the same rules, the same costs and the same fills. The "
      "unfiltered control differs from the stocks-in-play arm in the ranking key "
      "and in nothing else; the coin flip differs in the direction call and in "
      "nothing else.")
    A("")
    A("### The two controls, read properly")
    A("")
    pf_m = float(np.mean(paired_flip)) if paired_flip else float("nan")
    lo_f, hi_f = gates.mean_ci95(paired_flip)
    A(f"**Against the coin flip, paired, gross:** {pf_m:+.4f}R "
      f"(95%: {lo_f:+.4f} to {hi_f:+.4f}) over {len(paired_flip):,} "
      "(symbol, day) pairs where both arms traded. This is R3, and it is the "
      "number that says whether the direction call is worth anything once the "
      "day has already been chosen.")
    A("")
    pu_m = float(np.mean(paired_unf)) if paired_unf else float("nan")
    lo_u, hi_u = gates.mean_ci95(paired_unf)
    A(f"**Against the unfiltered control, paired by day, net:** {pu_m:+.4f}R "
      f"(95%: {lo_u:+.4f} to {hi_u:+.4f}) over {len(paired_unf):,} days both "
      "arms traded. This is R4, and it is the number the whole lane exists for: "
      "the paper's claim is that the relative-volume filter does almost all the "
      "work.")
    A("")
    if sip_rep and unf_rep:
        x = np.array([t.net_r for t in sip_rep], dtype="float64")
        y = np.array([t.net_r for t in unf_rep], dtype="float64")
        d = float(x.mean() - y.mean())
        se = float(np.sqrt(x.var(ddof=1) / len(x) + y.var(ddof=1) / len(y)))
        A(f"*Diagnostic, not a gate:* the same comparison unpaired at trade level "
          f"is {d:+.4f}R (95%: {d - 1.96*se:+.4f} to {d + 1.96*se:+.4f}), "
          f"n={len(x):,} against {len(y):,}. It is reported because the "
          "day-level pairing in R4 spends power to remove a day effect, and a "
          "reader should be able to see both. The gate is the paired one, "
          "because that is what was written down.")
        A("")
    A("## The portfolio, which is what the published number is")
    A("")
    A("1% of equity risked a position, gross exposure capped at 4x, all of a day's "
      "positions scaled down together when the cap binds, compounded daily from "
      "$100,000.")
    A("")
    A("| | in play (replication) | in play (whole window) | unfiltered (replication) |")
    A("|---|---|---|---|")
    A(f"| total return | {pf_rep.total_return:+.1%} | {pf_all.total_return:+.1%} | "
      f"{pf_unf.total_return:+.1%} |")
    A(f"| CAGR | {pf_rep.cagr:+.1%} | {pf_all.cagr:+.1%} | {pf_unf.cagr:+.1%} |")
    A(f"| Sharpe | {pf_rep.sharpe:.2f} | {pf_all.sharpe:.2f} | {pf_unf.sharpe:.2f} |")
    A(f"| max drawdown | {pf_rep.max_drawdown:.1%} | {pf_all.max_drawdown:.1%} | "
      f"{pf_unf.max_drawdown:.1%} |")
    A(f"| days the 4x cap bound | {pf_rep.capped_days}/{pf_rep.n_days} | "
      f"{pf_all.capped_days}/{pf_all.n_days} | {pf_unf.capped_days}/{pf_unf.n_days} |")
    A("")
    A("**Published, for comparison: 1,637% and a 2.81 Sharpe on stocks in play, "
      "29% and 0.48 unfiltered.** The rows above are on our pool, our window and "
      "our cost model, and are not claimed to be the same experiment.")
    A("")
    A("## Slices")
    A("")
    A(SUMMARY_HEADER)
    for s in (s_rep, s_hb, u_rep, u_hb, f_rep):
        A(summary_row(s))
    A("")
    A("### By year, stocks in play, net R")
    A("")
    A(SUMMARY_HEADER)
    for k, v in sorted(split_by(sip, lambda t: str(t.day)[:4]).items()):
        A(summary_row(summarise(v, k)))
    A("")
    A("### By side, replication window")
    A("")
    A(SUMMARY_HEADER)
    for k, v in sorted(split_by(sip_rep, lambda t: t.side).items()):
        A(summary_row(summarise(v, k)))
    A("")
    A("### By relative-volume decile, replication window")
    A("")
    rvol = {(r["symbol"], int(r["day"])): float(r["rvol"])
            for r in sel["rows"] if r["arm"] == ARM_SIP}
    vals = np.array([rvol.get((t.symbol, t.day), np.nan) for t in sip_rep])
    ok = np.isfinite(vals)
    if ok.sum() > 10:
        qs = np.quantile(vals[ok], np.linspace(0, 1, 11))
        A(SUMMARY_HEADER)
        for i in range(10):
            lo_q, hi_q = qs[i], qs[i + 1]
            grp = [t for t, v in zip(sip_rep, vals)
                   if np.isfinite(v) and lo_q <= v < (hi_q if i < 9 else np.inf)]
            if grp:
                A(summary_row(summarise(grp, f"rvol {lo_q:.1f}-{hi_q:.1f}")))
    A("")
    A("### Exit mix and stop geometry, replication window")
    A("")
    if sip_rep:
        risk = np.array([t.risk_per_share for t in sip_rep])
        px = np.array([t.fill_price for t in sip_rep])
        drag = 2.0 * COSTS.commission_per_share / np.maximum(risk, 1e-9)
        A(f"- median stop distance **{np.median(risk)*100:.1f} cents**, "
          f"{np.median(risk/np.maximum(px,1e-9))*100:.3f}% of price")
        A(f"- commission alone is **{np.median(drag):.3f}R** of the median trade; "
          f"a tenth of an ATR is a very tight stop and the cost fraction is "
          "`cost per share / stop distance`, which is the law ENGINE-4 and "
          "ENGINE-5 measured twice")
        A(f"- exits: {dict(sorted(s_rep.exit_mix.items()))}")
        A(f"- trades resolved by the stop-before-target assumption: {s_rep.ambiguous_bars}")
    A("")
    A("## Cost sensitivity — disclosed, and not a result")
    A("")
    A("The pre-registered cost model is $0.005/share/side plus 1.0 bp of adverse "
      "slippage. Cost as a fraction of risk is `cost per share / stop distance`, "
      "and a tenth of an ATR is the tightest stop this programme has traded, so "
      "the fraction is the largest it has been. These rows re-run the identical "
      "selection under two other cost models. **The gate is after the "
      "pre-registered costs and does not move.**")
    A("")
    A("| cost model | n | mean R | median R | hit | PF |")
    A("|---|---|---|---|---|---|")
    for lbl, ts in (("pre-registered (the result)", sip_rep),
                    ("quarter-bp slippage", _window(sip_cheap or [], rep_lo, rep_hi)),
                    ("zero cost (true gross)", _window(sip_free or [], rep_lo, rep_hi))):
        if not ts:
            continue
        ss = summarise(ts, lbl)
        A(f"| {lbl} | {ss.n} | {fmt(ss.mean_r,4)} | {fmt(ss.median_r,4)} | "
          f"{fmt(ss.hit_rate*100,1)}% | {fmt(ss.profit_factor,2)} |")
    A("")
    A("## Census")
    A("")
    A("| | stocks in play | unfiltered |")
    A("|---|---|---|")
    for k in sorted(set(sip_census) | set(unf_census)):
        A(f"| {k} | {sip_census.get(k,0):,} | {unf_census.get(k,0):,} |")
    A(f"| symbol-days with no cached bars | {sip_missing:,} | {unf_missing:,} |")
    A("")
    A("## Selection, and the lookahead treatment")
    A("")
    A(f"- pool: top {sel['pool_n']:,} of the eligible set by 20-day average dollar "
      "volume as of the prior close")
    A(f"- selection: top {sel['top_k']} by 09:30-09:35 volume over the mean of the "
      f"same five minutes across the previous {sel['baseline_days']} sessions, "
      f"floor {sel['min_rvol']:.1f}")
    if ok.sum():
        A(f"- realised relative volume of the selected: median "
          f"{np.median(vals[ok]):.2f}x, p90 {np.quantile(vals[ok],0.9):.2f}x, "
          f"max {vals[ok].max():.1f}x")
    A("- the parquet on disk holds only 09:30-10:30 of each session, so the "
      "afternoon of the day being selected for was never written; "
      "`tests/test_sip_selection.py` runs the poisoned-future and "
      "amputated-future attacks against `select_day`, requires an identical "
      "selection when the rest of the session is deleted from disk, and catches "
      "a deliberately cheating selector with the same harness")
    A("")
    A("## The data, audited")
    A("")
    mp = scfg.DATA_ROOT / "manifest.json"
    if mp.exists():
        m = json.loads(mp.read_text())
        g, o, one = m["grouped"], m["open5"], m["min1"]
        A(f"- grouped daily: **{g['files']:,} of {g['expected_sessions']:,} sessions**, "
          f"{g['rows']:,} ticker-days, {len(g['missing_days'])} missing, "
          f"{len(g['extra_days'])} on a day the market was shut")
        A(f"- opening 5-minute bars: {o['sessions_with_opening_bars']:,} of "
          f"{o['expected_sessions']:,} sessions, {len(o['missing_sessions'])} missing; "
          f"median {o['symbols_with_an_opening_bar_median']:.0f} names a day against "
          f"a median {o['eligible_median']:.0f} eligible — "
          f"**{o['coverage_of_eligible_median']:.0%} coverage, worst day "
          f"{o['coverage_of_eligible_min']:.0%}**")
        A(f"- one-minute sessions: {one.get('symbol_days', 0):,} symbol-days, "
          f"{one.get('bars', 0):,} bars, median "
          f"{one.get('median_bars_per_session', 0):.0f} a session, "
          f"{one.get('empty_sessions', 0)} empty, {one.get('thin_sessions', 0)} thin, "
          f"{len(one.get('days_the_market_was_shut', []))} on a day the market was shut")
    else:
        A("- `sip/manifest.py` has not been run against this snapshot.")
    A("")
    A("### Where the picks sit in the liquidity list")
    A("")
    dvr = np.array([int(r.get("dv_rank", -1)) for r in sel["rows"]
                    if r["arm"] == ARM_SIP and int(r.get("dv_rank", -1)) > 0])
    if len(dvr):
        A(f"Of {len(dvr):,} picks, ranked by 20-day average dollar volume within "
          f"the day's eligible universe (1 = most liquid): median rank "
          f"**{int(np.median(dvr))}**, p90 **{int(np.quantile(dvr, 0.9))}**, "
          f"**{100.0 * float((dvr > sel['pool_n'] * 0.8).mean()):.0f}%** in the "
          f"bottom fifth of the pool.")
        A("")
        A("If the picks crowd the bottom of the pool, the pool boundary is what "
          "is deciding the selection and a larger pool would change the result. "
          "If they are spread through it, the boundary is not the binding "
          "constraint. This is the first number to read if Phase 1 misses.")
        A("")
    A("## Costs and fills")
    A("")
    A(f"- ${COSTS.commission_per_share:.3f}/share/side commission, "
      f"{COSTS.slippage_bps:.1f} bp adverse slippage on market and stop fills")
    A("- entry is a resting stop order, filled at the worse of the level and the "
      "bar's open, plus slippage; a bar containing both the stop and the target "
      "is resolved as the stop")
    A("")
    REPORT.parent.mkdir(parents=True, exist_ok=True)
    REPORT.write_text("\n".join(L) + "\n")
    print("\n".join(L[:40]))
    print(f"\nwrote {REPORT}")

    dump = REPORT.with_suffix(".trades.csv.gz")
    with gzip.open(dump, "wt") as f:
        f.write("arm,model_id,symbol,day,side,entry_minute,exit_minute,fill_price,"
                "stop_price,exit_price,exit_reason,risk_per_share,gross_r,net_r,"
                "mae_r,mfe_r\n")
        for arm, ts in ((ARM_SIP, sip), ("coinflip", flip), (ARM_UNFILTERED, unf)):
            for t in ts:
                f.write(f"{arm},{t.model_id},{t.symbol},{t.day},{t.side},"
                        f"{t.entry_minute},{t.exit_minute},{t.fill_price:.4f},"
                        f"{t.stop_price:.4f},{t.exit_price:.4f},{t.exit_reason},"
                        f"{t.risk_per_share:.4f},{t.gross_r:.5f},{t.net_r:.5f},"
                        f"{t.mae_r:.5f},{t.mfe_r:.5f}\n")
    eq = REPORT.with_suffix(".equity.csv")
    eq.write_text("day,equity,daily_return,exposure_ratio\n" + "\n".join(
        f"{d},{e:.2f},{r:.6f},{x:.4f}"
        for d, e, r, x in zip(pf_all.days, pf_all.equity, pf_all.daily_return,
                              pf_all.exposure_ratio)) + "\n")
    print(f"wrote {dump} and {eq}")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--stage", choices=["plan", "run"], required=True)
    a = ap.parse_args()
    if a.stage == "plan":
        stage_plan()
    else:
        stage_run()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
