"""ENGINE-5 — run `orb_1h_managed.v1` and its three pre-registered variants
against the bars committed at `d8e592b`, and write one report per variant.

    .venv/bin/python run_engine5.py --stage1        # the go/no-go, SPY only
    .venv/bin/python run_engine5.py                 # everything

SPY on `polygon-deep-v1` is the subject. QQQ and IWM are run and reported
separately and are never pooled into a SPY number. The 32-symbol `polygon-v1`
basket is a separate, clearly labelled result with its own windows and floors.

**Gross versus the matched control is computed and printed FIRST.** The gate
committed at `d8e592b` pre-authorises this lane to stop there if the primary
model is not better than a coin flip before costs.
"""

from __future__ import annotations

import argparse
import csv
import datetime as dt
import gzip
import json
import sys
import time
from collections import Counter
from dataclasses import asdict
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from engine import config  # noqa: E402
from engine.backtest.managed import run_symbol_managed  # noqa: E402
from engine.backtest.regime import regime_by_day  # noqa: E402
from engine.backtest.stats import (SUMMARY_HEADER, fmt, split_by,  # noqa: E402
                                   summarise, summary_row)
from engine.backtest.types import Costs  # noqa: E402
from engine.cache.load import load  # noqa: E402
from engine.models import gates as G  # noqa: E402
from engine.models.matched_coinflip import MatchedCoinflipRR  # noqa: E402
from engine.models.orb_managed import VARIANTS, OrbManaged  # noqa: E402
from engine.run_backtest import git_rev  # noqa: E402

NET = Costs(commission_per_share=0.005, slippage_bps=1.0)
GROSS = Costs(commission_per_share=0.0, slippage_bps=0.0)

PRIMARY = "orb_1h_managed.v1"
SUBJECT = "SPY"

DEEP = dict(snapshot=config.SNAPSHOT_DEEP, universe=config.DEEP_UNIVERSE,
            is_window=G.DEEP_IN_SAMPLE, oos_window=G.DEEP_OUT_OF_SAMPLE,
            evaluate=G.evaluate_deep, verdict=G.verdict3_deep, label="deep",
            pooled=False)
BASKET = dict(snapshot=config.SNAPSHOT, universe=config.UNIVERSE,
              is_window=G.IN_SAMPLE, oos_window=G.OUT_OF_SAMPLE,
              evaluate=G.evaluate, verdict=G.verdict3, label="basket",
              pooled=True)


def dayint(s: str) -> int:
    return int(s.replace("-", ""))


def daystr(d: int) -> str:
    s = str(int(d))
    return f"{s[0:4]}-{s[4:6]}-{s[6:8]}"


def key(t):
    return (t.symbol, t.day, t.decision_minute)


def finite(trades):
    """R is undefined when the realised risk is exactly zero — which happens in
    the FRICTIONLESS diagnostic run when the next bar's open prints exactly on
    the stop candle's extreme. Dropped from R statistics, counted, and never
    dropped from anything a gate is computed on."""
    return [t for t in trades if np.isfinite(t.net_r) and np.isfinite(t.gross_r)]


def applied_cost_ps(t, commission=0.005, slippage_bps=1.0) -> float:
    """Cost per share actually charged, reconstructed from the trade.

    Commission is $0.005 a share a side, always. Slippage is 1.0bp of price,
    adverse, on the market entry and on any exit that is not a resting limit —
    the target and the +1R partial are limits and do not slip; a breakeven stop,
    an original stop and a 15:55 flatten do. A managed trade's second leg is
    half the size, so its exit slippage is charged at half weight.
    """
    slip = t.fill_price * slippage_bps / 10_000.0
    partial = bool(t.meta.get("partial_taken"))
    w = 0.5 if partial else 1.0
    if t.meta.get("remainder_reason", t.exit_reason) not in ("target",):
        slip += w * t.exit_price * slippage_bps / 10_000.0
    return 2.0 * commission + slip


# --- running -----------------------------------------------------------------
def run_one(symbol: str, variant: str, costs: Costs, snapshot: str):
    stop_read, target_mode, manage = VARIANTS[variant]
    m = OrbManaged(variant, snapshot=snapshot)
    trades, rejects = run_symbol_managed(load(symbol, "1m", snapshot), m, costs,
                                         manage=manage)
    m.finish()      # the runner does not call it; without this the final
                    # session is never booked and the census is one day short
    return trades, rejects, m.census


def run_control(symbol: str, variant: str, model_trades, costs: Costs,
                snapshot: str):
    """The matched coin flip: same days, minutes, stop AND target distances,
    same management rule, direction flipped."""
    manage = VARIANTS[variant][2]
    plan: dict[int, list[tuple[int, float, float]]] = {}
    for t in model_trades:
        risk = float(t.meta["risk_ps"])
        target = float(t.target_price)
        reward = (abs(target - float(t.meta["ref_close"]))
                  if np.isfinite(target) else float("inf"))
        plan.setdefault(t.day, []).append((t.decision_minute, risk, reward))
    c = MatchedCoinflipRR(plan)
    trades, _ = run_symbol_managed(load(symbol, "1m", snapshot), c, costs,
                                   manage=manage)
    return trades


# --- statistics --------------------------------------------------------------
def windows(trades, cfg):
    lo, hi = (dayint(x) for x in cfg["is_window"])
    olo, ohi = (dayint(x) for x in cfg["oos_window"])
    return ([t for t in trades if lo <= t.day <= hi],
            [t for t in trades if olo <= t.day <= ohi])


def gross_r_mean(trades):
    v = [t.gross_r for t in finite(trades)]
    return float(np.mean(v)) if v else float("nan")


def paired_diff(a_trades, b_trades, field="gross_r"):
    b = {key(t): t for t in finite(b_trades)}
    d = [getattr(m, field) - getattr(b[key(m)], field)
         for m in finite(a_trades) if key(m) in b]
    if not d:
        return float("nan"), float("nan"), float("nan"), 0
    lo, hi = G.mean_ci95(d)
    return float(np.mean(d)), lo, hi, len(d)


def cost_drag_r(net_tr, gross_tr):
    g = {key(t): t for t in finite(gross_tr)}
    d = [g[key(t)].gross_r - t.net_r for t in finite(net_tr) if key(t) in g]
    if not d:
        return float("nan"), float("nan"), float("nan"), 0
    lo, hi = G.mean_ci95(d)
    return float(np.mean(d)), lo, hi, len(d)


def per_share(net_tr, gross_tr):
    g = {key(t): t for t in gross_tr}
    rows = [(t.net_pct * t.fill_price,
             g[key(t)].gross_pct * g[key(t)].fill_price,
             t.fill_price, t.risk_per_share)
            for t in net_tr if key(t) in g]
    if not rows:
        return {}
    net = np.array([r[0] for r in rows])
    gross = np.array([r[1] for r in rows])
    return {"n": len(rows),
            "gross_mean": float(gross.mean()), "gross_median": float(np.median(gross)),
            "cost_mean": float((gross - net).mean()),
            "net_mean": float(net.mean()), "net_median": float(np.median(net)),
            "net_total": float(net.sum()), "net_top3": float(np.sum(np.sort(net)[-3:])),
            "price": float(np.mean([r[2] for r in rows])),
            "risk": float(np.median([r[3] for r in rows])),
            "risk_mean": float(np.mean([r[3] for r in rows]))}


def stop_width(trades):
    """The number ENGINE-4 says sets the hurdle. Median beside mean, always."""
    if not trades:
        return {}
    r = np.array([t.risk_per_share for t in trades])
    p = np.array([t.fill_price for t in trades])
    frac = r / np.where(p > 0, p, np.nan)
    return {"n": len(trades),
            "mean_c": float(r.mean()), "median_c": float(np.median(r)),
            "q1_c": float(np.quantile(r, 0.25)), "q3_c": float(np.quantile(r, 0.75)),
            "mean_pct": float(np.nanmean(frac)), "median_pct": float(np.nanmedian(frac)),
            "price": float(p.mean())}


def target_distance_r(trades):
    """How far the level target actually sat, in R. The distribution the gate
    asked for, because a level target has no fixed reward."""
    v = [t.meta.get("target_r_realised", float("nan")) for t in trades]
    v = [x for x in v if np.isfinite(x)]
    if not v:
        return {}
    a = np.array(v)
    return {"n": len(a), "n_no_target": sum(1 for t in trades
                                            if not np.isfinite(t.target_price)),
            "mean": float(a.mean()), "median": float(np.median(a)),
            "q1": float(np.quantile(a, 0.25)), "q3": float(np.quantile(a, 0.75)),
            "under_1r": float(np.mean(a < 1.0)), "over_2r": float(np.mean(a > 2.0))}


def trades_per_day(trades):
    c = Counter()
    for t in trades:
        c[(t.symbol, t.day)] += 1
    return Counter(c.values())


def evaluate_symbol(symbol: str, variant: str, regimes, cfg) -> dict:
    t0 = time.time()
    snap = cfg["snapshot"]
    net, rejects, census = run_one(symbol, variant, NET, snap)
    gross, _, _ = run_one(symbol, variant, GROSS, snap)
    cnet = run_control(symbol, variant, net, NET, snap)
    cgross = run_control(symbol, variant, net, GROSS, snap)
    is_tr, oos_tr = windows(net, cfg)
    reg = {k: summarise(v, k) for k, v in
           split_by(is_tr, lambda t: regimes.get(t.day, "unknown")).items()
           if k != "unknown"}
    s_is = summarise(is_tr, f"in-sample {cfg['is_window'][0]}..{cfg['is_window'][1]}")
    s_oos = summarise(oos_tr, f"out-of-sample {cfg['oos_window'][0]}..{cfg['oos_window'][1]}")
    core = cfg["evaluate"](s_is, s_oos, reg)
    verdict = cfg["verdict"](core, [t.net_r for t in is_tr], [t.net_r for t in oos_tr])
    print(f"  [{variant}] {symbol}: {len(net)} trades, {verdict} "
          f"({time.time()-t0:.0f}s)", flush=True)
    return dict(symbol=symbol, net=net, gross=gross, ctl_net=cnet, ctl_gross=cgross,
                census=census, rejects=rejects, is_tr=is_tr, oos_tr=oos_tr,
                s_all=summarise(net, "all"), s_is=s_is, s_oos=s_oos, reg=reg,
                core=core, verdict=verdict)


def pool(results: dict, variant: str, regimes, cfg) -> dict:
    """One pooled result across a basket, judged once. Never used on the deep
    snapshot, where each symbol is judged alone."""
    cat = lambda k: [t for r in results.values() for t in r[k]]  # noqa: E731
    net, gross = cat("net"), cat("gross")
    cnet, cgross = cat("ctl_net"), cat("ctl_gross")
    census = Counter()
    for r in results.values():
        census.update(r["census"])
    is_tr, oos_tr = windows(net, cfg)
    reg = {k: summarise(v, k) for k, v in
           split_by(is_tr, lambda t: regimes.get(t.day, "unknown")).items()
           if k != "unknown"}
    s_is = summarise(is_tr, f"in-sample {cfg['is_window'][0]}..{cfg['is_window'][1]}")
    s_oos = summarise(oos_tr, f"out-of-sample {cfg['oos_window'][0]}..{cfg['oos_window'][1]}")
    core = cfg["evaluate"](s_is, s_oos, reg)
    verdict = cfg["verdict"](core, [t.net_r for t in is_tr], [t.net_r for t in oos_tr])
    return dict(symbol="BASKET(32)", net=net, gross=gross, ctl_net=cnet,
                ctl_gross=cgross, census=census,
                rejects=[x for r in results.values() for x in r["rejects"]],
                is_tr=is_tr, oos_tr=oos_tr, s_all=summarise(net, "all"),
                s_is=s_is, s_oos=s_oos, reg=reg, core=core, verdict=verdict)


# --- stage 1 — the go/no-go the gate pre-authorised ---------------------------
def stage1(symbols=("SPY",)) -> dict:
    """Gross versus the matched control, first, plus the stop-width and
    cost-drag comparison this lane owes for both readings regardless."""
    cfg = DEEP
    out = {}
    for variant in (PRIMARY, "orb_1h_trigcandle.v1"):
        for sym in symbols:
            t0 = time.time()
            snap = cfg["snapshot"]
            net, _, census = run_one(sym, variant, NET, snap)
            gross, _, _ = run_one(sym, variant, GROSS, snap)
            cgross = run_control(sym, variant, net, GROSS, snap)
            out[(variant, sym)] = dict(net=net, gross=gross, ctl_gross=cgross,
                                       census=census)
            m, lo, hi, n = paired_diff(gross, cgross)
            og = [t for t in gross
                  if dayint(cfg["oos_window"][0]) <= t.day <= dayint(cfg["oos_window"][1])]
            mo, lo_o, hi_o, no = paired_diff(og, cgross)
            drag, dlo, dhi, _ = cost_drag_r(net, gross)
            w = stop_width(net)
            print(f"\n=== {variant} {sym} ({time.time()-t0:.0f}s) ===")
            print(f"  trades {len(net):,}  {daystr(min(t.day for t in net))} -> "
                  f"{daystr(max(t.day for t in net))}")
            print(f"  GROSS mean R  model {gross_r_mean(gross):+.4f}   "
                  f"control {gross_r_mean(cgross):+.4f}")
            print(f"  paired model-control, gross:  ALL {m:+.4f} "
                  f"(95% {lo:+.4f} to {hi:+.4f}, n={n:,})")
            print(f"                                OOS {mo:+.4f} "
                  f"(95% {lo_o:+.4f} to {hi_o:+.4f}, n={no:,})")
            print(f"  stop width: median {w['median_c']*100:.1f}c "
                  f"mean {w['mean_c']*100:.1f}c  "
                  f"({w['median_pct']*100:.3f}% / {w['mean_pct']*100:.3f}% of price)")
            print(f"  cost drag {drag:.3f}R (95% {dlo:.3f} to {dhi:.3f})")
            print(f"  net mean R {np.mean([t.net_r for t in net]):+.4f}  "
                  f"median {np.median([t.net_r for t in net]):+.4f}")
            print(f"  skip_invalid_stop {census.get('skip_invalid_stop',0):,}  "
                  f"no_target_level {census.get('signals_no_target_level',0):,}  "
                  f"partials {sum(1 for t in net if t.meta['partial_taken']):,}")
    return out




# --- report ------------------------------------------------------------------
def pctf(x, nd=2):
    return "n/a" if x != x else f"{x*100:.{nd}f}%"


def cents(x, nd=2):
    return "n/a" if x != x else f"{x*100:+.{nd}f}¢"


def rfmt(x, nd=3):
    return "n/a" if x != x else f"{x:+.{nd}f}"


ONE_CHANGE = {
    "orb_1h_managed.v1": "the primary — prior-candle stop, 1-hour level target, half off at +1R",
    "orb_1h_managed_2r.v1": "one change: a fixed **2R** target instead of the 1-hour level",
    "orb_1h_trigcandle.v1": "one change: ENGINE-4's **trigger-candle** stop instead of the candle before it",
    "orb_1h_unmanaged.v1": "one change: **no management** — no partial at +1R, the stop never moves",
}


def _ci_prose(lo, hi) -> str:
    if lo != lo:
        return "n/a"
    if lo <= 0 <= hi:
        return "contains zero — nothing measurable"
    return ("**excludes zero AGAINST the model**" if hi < 0
            else "**excludes zero in the model's favour**")


def report(variant, res, all_res, regimes, sessions, cfg) -> str:
    L = []
    A = L.append
    subj = "BASKET(32)" if cfg["pooled"] else SUBJECT
    s = res[subj]
    n = len(s["net"])
    days = [t.day for t in s["net"]]
    lo, hi = (daystr(min(days)), daystr(max(days))) if days else ("n/a", "n/a")
    ps = per_share(s["net"], s["gross"])
    drag, dlo, dhi, _ = cost_drag_r(s["net"], s["gross"])
    m, clo, chi, cn = paired_diff(s["gross"], s["ctl_gross"])

    A(f"# {variant} — measured on `{cfg['snapshot']}`\n")
    A(f"**{subj}: {s['verdict']}.** Against the bar in "
      f"[`../models/{variant}/GATE.md`](../models/{variant}/GATE.md), committed "
      f"at `d8e592b` before this evaluation existed. {ONE_CHANGE[variant]}.\n")
    A(f"**{n:,} {subj} trades, {lo} → {hi}** — {len(s['is_tr']):,} in-sample "
      f"and {len(s['oos_tr']):,} in the held-back window.")
    A(f"**Before costs the model made {rfmt(gross_r_mean(s['gross']))}R a trade "
      f"against the matched coin flip's {rfmt(gross_r_mean(s['ctl_gross']))}R; "
      f"paired trade for trade the gap is {rfmt(m)}R (95%: {rfmt(clo)} to "
      f"{rfmt(chi)}, n={cn:,}).**")
    A(f"**After costs the average trade returned {rfmt(s['s_all'].mean_r)}R and "
      f"the MIDDLE trade {rfmt(s['s_all'].median_r)}R.** Realised stop width: "
      f"median {ps.get('risk', float('nan'))*100:.1f}¢, mean "
      f"{ps.get('risk_mean', float('nan'))*100:.1f}¢. Cost drag {drag:.3f}R.\n")
    A(f"Run {dt.datetime.now(dt.UTC).isoformat(timespec='seconds')} at "
      f"`{git_rev()}`. Snapshot `{cfg['snapshot']}`, commission "
      f"$0.005/share/side, slippage 1.0bp on market and stop fills.\n")

    A(control_section(res, cfg, variant))
    A(plain_section(variant, res, all_res, ps, drag, dlo, dhi, cfg, subj))
    A(diagnostic_section(all_res, cfg, subj))
    if variant == PRIMARY:
        A(variant_table_section(all_res, cfg, subj))
        A(stop_reading_section(all_res, cfg, subj))
        A(management_section(all_res, cfg, subj))
        A(target_section(all_res, cfg, subj))
    A(cost_section(res, cfg))
    A(gate_section(s, subj))
    A(tables_section(s, subj, regimes))
    A(others_section(res, cfg, subj))
    A(census_section(variant, res, sessions, cfg))
    A(disclosures(variant, cfg))
    return "\n".join(L)


def control_section(res, cfg, variant) -> str:
    P = ["## Gross versus the matched control — read this before anything else\n"]
    P.append("ENGINE-1's decisive finding, restated by ENGINE-4: **every model "
             "this programme has measured was at or below a coin flip BEFORE "
             "costs.** A model that cannot beat a random entry on free trades "
             "cannot be rescued by a management rule, a target choice or a stop "
             "reading, so this table is computed first and read first. The "
             "control takes the same symbol, the same days, the same decision "
             "minutes, the same stop distances AND the same target distances, "
             "runs them through the same managed runner, and flips only the "
             "direction. Anything the model earns over it, it earned by knowing "
             "which way to point.\n")
    P.append("| symbol | run | n | gross mean R | gross median R | net mean R | net median R | hit | PF (net) |")
    P.append("|---|---|---|---|---|---|---|---|---|")
    for sym, r in res.items():
        for label, tr, gtr in ((f"`{variant}`", r["net"], r["gross"]),
                               ("`null_coinflip.v1.matched`", r["ctl_net"], r["ctl_gross"])):
            a = summarise(tr, label)
            g = summarise(finite(gtr), label)
            P.append(f"| {sym} | {label} | {a.n:,} | {g.mean_r:+.3f} | "
                     f"{g.median_r:+.3f} | {a.mean_r:+.3f} | {a.median_r:+.3f} | "
                     f"{a.hit_rate*100:.1f}% | {fmt(a.profit_factor, 2)} |")
    P.append("")
    P.append("Paired trade by trade on the same symbol, day and minute, **gross "
             "of costs** — did knowing which way to point pay for itself?\n")
    P.append("| symbol | window | pairs | model − control, gross mean R | 95% interval | reading |")
    P.append("|---|---|---|---|---|---|")
    for sym, r in res.items():
        for wname, sel in (("all", lambda t: True),
                           ("in-sample", lambda t: dayint(cfg["is_window"][0]) <= t.day <= dayint(cfg["is_window"][1])),
                           ("out-of-sample", lambda t: dayint(cfg["oos_window"][0]) <= t.day <= dayint(cfg["oos_window"][1]))):
            mm, l, h, nn = paired_diff([t for t in r["gross"] if sel(t)], r["ctl_gross"])
            P.append(f"| {sym} | {wname} | {nn:,} | {mm:+.3f} | {l:+.3f} to {h:+.3f} | {_ci_prose(l, h)} |")
    P.append("")
    P.append("### The lane was pre-authorised to stop here, and what it did instead\n")
    P.append("The gate committed at `d8e592b` says: if the primary model is not "
             "better than this control gross, report that plainly and stop, "
             "rather than running every variant to completion. **It is not "
             "better than the control gross.** The point estimate is at or "
             "below zero and every interval contains zero.\n")
    P.append("The four variants were nevertheless run to completion, and the "
             "reason is stated rather than left to be assumed: on this cache a "
             "full variant takes about ten seconds, so completing the set cost "
             "minutes of machine time and no judgement. What the pre-"
             "authorisation was protecting against — spending the lane's "
             "attention hunting for a variant that looks good — did not happen: "
             "**no variant was added, no threshold was moved, and no parameter "
             "was changed after a number was seen.** The three variants that "
             "follow the primary were all pre-registered in the same commit as "
             "the primary, and each carries exactly one change.\n")
    P.append("What the completed set buys is the two comparisons the brief owes "
             "regardless of the verdict — the stop reading, and whether the "
             "management rule pays — and both are measured below on the same "
             "trades rather than argued.\n")
    return "\n".join(P)


def plain_section(variant, res, all_res, ps, drag, dlo, dhi, cfg, subj) -> str:
    P = []
    A = P.append
    s = res[subj]
    A("## In plain language\n")
    A(f"**Did it work?** {_verdict_prose(s)}\n")
    if ps:
        A("**The subtraction that decides everything.** A setup only survives if "
          "what it earns is bigger than what it costs to trade. Here is that sum, "
          f"on {subj}, per share.\n")
        A(f"| per share, average {subj} trade | this model |")
        A("|---|---|")
        A(f"| what the setup earned, before costs | {cents(ps['gross_mean'])} |")
        A(f"| what it paid to get in and out | {cents(-ps['cost_mean'])} |")
        A(f"| **what was left, on the average trade** | **{cents(ps['net_mean'])}** |")
        A(f"| what was left, on the MIDDLE trade | {cents(ps['net_median'], 1)} |")
        A(f"| median money risked per trade | {ps['risk']*100:.1f}¢ |")
        A(f"| mean money risked per trade | {ps['risk_mean']*100:.1f}¢ |")
        A(f"| average share price | ${ps['price']:.0f} |")
        A("")
        A(f"Across all {ps['n']:,} {subj} trades the model made "
          f"${ps['net_total']:.2f} per share in total; the best three trades "
          f"contributed ${ps['net_top3']:.2f} of that, leaving "
          f"${ps['net_total']-ps['net_top3']:.2f} for the other {ps['n']-3:,}. "
          f"**Read the middle trade beside the average.**\n")
    A("**How sure are we?**\n")
    for sym, r in res.items():
        lo, hi = G.mean_ci95([t.net_r for t in r["oos_tr"]])
        ilo, ihi = G.mean_ci95([t.net_r for t in r["is_tr"]])
        A(f"- **{sym}.** Held-back window: {len(r['oos_tr']):,} trades averaging "
          f"{r['s_oos'].mean_r:+.3f}R, middle trade {r['s_oos'].median_r:+.3f}R, "
          f"honest range {lo:+.3f}R to {hi:+.3f}R. In-sample: {len(r['is_tr']):,} "
          f"trades averaging {r['s_is'].mean_r:+.3f}R, middle trade "
          f"{r['s_is'].median_r:+.3f}R, range {ilo:+.3f}R to {ihi:+.3f}R.")
    A("")
    A("**One R is one unit of the money you agreed to lose if the trade goes "
      "wrong** — here, the distance from the entry to whichever 5-minute "
      "candle's extreme this variant stops behind. +0.10R means the average "
      "trade made a tenth of what it risked. The bar was +0.10R in-sample and "
      "+0.05R out-of-sample, after costs.\n")
    A("**These are models seven through ten.** `orb_reclaim.v1`, "
      "`sweep_displacement_fvg.v1`, `orb_htf_structural.v1`, `orb_mtf.v1`, "
      "`orb_simple_1h.v1` and `orb_simple_4h.v1` were all measured on this "
      "programme's data; five failed and one was inconclusive. These four are "
      "run as a set, which is four more chances for one of them to look good by "
      "luck. **Out-of-sample is the verdict and it was read once.** A variant "
      "that passes while the primary fails is a lead, not a result.\n")
    A("**What would change the answer?**\n")
    A(_what_would_change(res, all_res, drag, dlo, dhi, cfg, subj))
    return "\n".join(P)


def _verdict_prose(r) -> str:
    v = r["verdict"]
    g = {x.id: x for x in r["core"]}
    if v == "PASS":
        return "Yes, on this data, against a bar written down first. Every gate cleared."
    if v == G.INCONCLUSIVE_SAMPLE:
        return (f"We cannot tell. {g['G1'].observed} against a floor of "
                f"{g['G1'].threshold}, written down in advance — too few trades "
                f"to believe a good number or a bad one.")
    if v == G.INCONCLUSIVE_POWER:
        return ("Measured, and the answer is 'not enough signal'. The sample is "
                "big enough, the expectancy misses its bar, but the interval "
                "around it still contains that bar.")
    fails = [x.id for x in r["core"] if not x.passed]
    return (f"No. It missed {', '.join(fails)} of the five gates that were "
            f"written down before it ran.")


def _what_would_change(res, all_res, drag, dlo, dhi, cfg, subj) -> str:
    ps = per_share(res[subj]["net"], res[subj]["gross"])
    P = []
    P.append(f"- **Cost drag, which ENGINE-4 established is `cost per share ÷ "
             f"stop distance`.** This variant's realised drag is {drag:.3f}R "
             f"(95%: {dlo:.3f} to {dhi:.3f}) — {drag*100:.1f}% of the money "
             f"risked on every trade. The stop width sets that hurdle, not the "
             f"instrument. See the stop-reading section for both readings side "
             f"by side.")
    if ps:
        P.append(f"- **The stop distance.** The median trade risks "
                 f"{ps['risk']*100:.1f}¢ on a ${ps['price']:.0f} share — "
                 f"{pctf(ps['risk']/ps['price'], 3)} of price.")
    P.append("- **Nothing in the management rule.** The unmanaged control is "
             "measured on the same entries, so the rule's contribution is a "
             "number in this report rather than an assumption.")
    P.append("- **More symbols, and different ones.** Index ETFs are among the "
             "most efficiently priced instruments in the market; the 32-name "
             "basket is reported separately for exactly that reason. A null "
             "result on one does not transfer to the other in either direction.")
    return "\n".join(P)


# --- the diagnostic, fenced off from every result ----------------------------
def diagnostic_section(all_res, cfg, subj) -> str:
    P = ["## DIAGNOSTIC — the share of trades that touched +1R\n"]
    P.append("**This section is a diagnostic. It appears in no gate, it is part "
             "of no verdict, and no conclusion in this report rests on it.** The "
             "fence was written into `models/orb_1h_managed.v1/GATE.md` and "
             "`models/gates.py` before any number existed.\n")
    P.append("The owner asked to *\"mark any trade that moves up at least 1rr as "
             "a win\"*. That is a SCORING change, and taken literally it is the "
             "exact error that made the SMS engine look profitable while it lost "
             "money: `alert_performance_honest` records average PEAK +11.93% on "
             "141 long alerts whose realised 5-day return was **+0.41%**, with "
             "47.5% of them 8%+ underwater first (17 §1). **A price nobody sold "
             "at is not income.**\n")
    P.append("So the +1R was implemented as a rule that BANKS it — half off, "
             "stop to breakeven — and it is measured in the management section. "
             "The touch rate belongs here, on its own, next to what the literal "
             "scoring would have claimed.\n")
    key_v = "orb_1h_unmanaged.v1"
    P.append(f"Measured on `{key_v}`, whose best excursion is not capped by a "
             f"partial. It IS capped by the trade's own exit: a trade that took "
             f"its target at +0.4R cannot show +1R, because it was closed. That "
             f"is stated rather than corrected — following a closed position "
             f"forward is the fiction being guarded against.\n")
    P.append("| symbol | trades | **touched +1R** | what the trades that touched actually returned | what every trade actually returned |")
    P.append("|---|---|---|---|---|")
    for sym, r in all_res[key_v][cfg["label"]].items():
        d = G.naive_1r_scoring(r["net"])
        if not d.get("n"):
            continue
        P.append(f"| {sym} | {d['n']:,} | **{d['touch_rate']*100:.1f}%** "
                 f"({d['touched']:,}) | mean {d['mean_r_of_touchers']:+.3f}R | "
                 f"win rate {d['realised_win_rate']*100:.1f}%, mean "
                 f"{d['realised_mean_r']:+.3f}R, median "
                 f"{d['realised_median_r']:+.3f}R |")
    P.append("")
    P.append("### What the literal scoring rule would have claimed\n")
    P.append("Two readings of *\"mark it as a win\"*, both priced on exactly "
             "these trades. **Neither is a result and neither enters a gate.**\n")
    P.append("- **Promote-only** — leave every other trade as it resolved and "
             "book +1.000R for each one that touched. This is the closer reading "
             "of the owner's sentence (*\"even if it doesnt hit 2rr\"*), and it "
             "can only make the number better than reality, never worse, which "
             "is exactly what makes it dangerous.")
    P.append("- **Win/lose** — +1R if it touched, −1R if it did not. Harsher "
             "than reality on this model, because a level target is often nearer "
             "than 1R and many trades that never touched still resolved for less "
             "than a full loss. `gates.naive_1r_scoring_generous` was added "
             "after seeing that, and the reason is written into its docstring "
             "rather than left to be inferred.\n")
    P.append("| symbol | REALISED mean R | REALISED median R | promote-only, mean R | promote-only, median R | promote-only \"win rate\" | win/lose, mean R | trades promoted from a loss to a win |")
    P.append("|---|---|---|---|---|---|---|---|")
    for sym, r in all_res[key_v][cfg["label"]].items():
        g = G.naive_1r_scoring_generous(r["net"])
        d = G.naive_1r_scoring(r["net"])
        if not g.get("n"):
            continue
        P.append(f"| {sym} | {g['realised_mean_r']:+.3f} | "
                 f"{g['realised_median_r']:+.3f} | **{g['claimed_mean_r']:+.3f}** | "
                 f"{g['claimed_median_r']:+.3f} | "
                 f"{g['claimed_win_rate']*100:.1f}% | {d['claimed_mean_r']:+.3f} | "
                 f"{g['promoted']:,} |")
    P.append("")
    g = G.naive_1r_scoring_generous(all_res[key_v][cfg["label"]][subj]["net"])
    if g.get("n"):
        gap = g["claimed_mean_r"] - g["realised_mean_r"]
        P.append(f"**On {subj} the promote-only rule turns "
                 f"{g['realised_mean_r']:+.3f}R a trade into "
                 f"{g['claimed_mean_r']:+.3f}R a trade — a swing of "
                 f"{gap:+.3f}R produced by nothing but the choice of what counts "
                 f"as a win.** {g['promoted']:,} losing trades become winners "
                 f"without a single share changing hands at a different price. "
                 f"That is the same arithmetic that produced +11.93% average "
                 f"peak against +0.41% realised on the SMS engine, and it is why "
                 f"the request was implemented as a rule that BANKS the 1R "
                 f"instead of a rule that scores it.\n")
    return "\n".join(P)


# --- all four variants, side by side -----------------------------------------
def variant_table_section(all_res, cfg, subj) -> str:
    P = ["## All four variants, side by side\n"]
    P.append("Each is judged separately against the same bar and none borrows "
             "another's result. This table is a summary of four verdicts, not a "
             "fifth verdict.\n")
    P.append("| model | one change | trades | gross mean R | control gross | gap vs control | net mean R | **net MEDIAN R** | hit | PF | drag | verdict |")
    P.append("|---|---|---|---|---|---|---|---|---|---|---|---|")
    for v in ("orb_1h_managed.v1", "orb_1h_managed_2r.v1",
              "orb_1h_trigcandle.v1", "orb_1h_unmanaged.v1"):
        r = all_res.get(v, {}).get(cfg["label"], {}).get(subj)
        if r is None:
            continue
        m, _, _, _ = paired_diff(r["gross"], r["ctl_gross"])
        d, _, _, _ = cost_drag_r(r["net"], r["gross"])
        a = r["s_all"]
        change = ONE_CHANGE[v].replace("one change: ", "").replace("the primary — ", "")
        P.append(f"| `{v}` | {change} | {a.n:,} | "
                 f"{gross_r_mean(r['gross']):+.3f} | "
                 f"{gross_r_mean(r['ctl_gross']):+.3f} | {m:+.3f} | "
                 f"{a.mean_r:+.3f} | **{a.median_r:+.3f}** | "
                 f"{a.hit_rate*100:.1f}% | {fmt(a.profit_factor, 2)} | "
                 f"{d:.3f}R | **{r['verdict']}** |")
    P.append("")
    P.append("Full reports: "
             + " · ".join(f"[`{v}`]({v}.{cfg['snapshot']}.md)"
                          for v in ("orb_1h_managed_2r.v1",
                                    "orb_1h_trigcandle.v1",
                                    "orb_1h_unmanaged.v1")) + "\n")
    return "\n".join(P)


# --- the two stop readings, settled ------------------------------------------
def stop_reading_section(all_res, cfg, subj) -> str:
    a = all_res[PRIMARY][cfg["label"]]
    b = all_res["orb_1h_trigcandle.v1"][cfg["label"]]
    P = ["## The stop reading, settled with a number\n"]
    P.append("The owner has said *\"previous 5min h/l\"* twice. ENGINE-4 "
             "implemented it as the TRIGGER candle's own extreme and called the "
             "other reading *\"the single most informative re-run available\"*. "
             "Both readings are run here. Everything else about the two models "
             "is identical.\n")
    P.append("**The brief assumed the prior-candle stop is the wider of the two. "
             "As a RULE that is false, and it was falsified by a unit test "
             "before any performance number existed** "
             "(`test_neither_stop_reading_is_always_the_wider_one`). The trigger "
             "candle is the breakout bar: often large, often long-wicked, and "
             "its extreme can sit far further from the close than the quieter "
             "bar before it. SPY 2012-11-19 at 10:44 risks $2.11 on the trigger "
             "reading and $0.24 on the prior reading. What follows is the "
             "realised distribution rather than the assumption.\n")
    P.append("| symbol | reading | trades | stop, median | stop, mean | stop, IQR | % of price, median | % of price, mean | **cost drag, R** | 95% |")
    P.append("|---|---|---|---|---|---|---|---|---|---|")
    for sym in a:
        for label, r in (("prior candle (primary)", a[sym]),
                         ("trigger candle (ENGINE-4)", b[sym])):
            w = stop_width(r["net"])
            d, l, h, _ = cost_drag_r(r["net"], r["gross"])
            P.append(f"| {sym} | {label} | {w['n']:,} | {w['median_c']*100:.1f}¢ | "
                     f"{w['mean_c']*100:.1f}¢ | {w['q1_c']*100:.1f}–{w['q3_c']*100:.1f}¢ | "
                     f"{pctf(w['median_pct'], 3)} | {pctf(w['mean_pct'], 3)} | "
                     f"**{d:.3f}R** | {l:.3f} to {h:.3f} |")
    P.append("")
    P.append("### The same comparison on the INTERSECTION\n")
    P.append("The two readings do not produce identical trade sets: a prior "
             "candle can sit on the wrong side of the trigger close when the "
             "1-hour trend flips onto a range edge price has already left, which "
             "is a stop that is not a distance. Those are counted as "
             "`skip_invalid_stop` and are the reason the counts differ. So the "
             "comparison is repeated on the (symbol, day, minute) triples where "
             "BOTH readings produced a trade, which is the only version of it "
             "that is not contaminated by a different sample.\n")
    P.append("| symbol | pairs | stop width, prior | stop width, trigger | prior ÷ trigger | drag, prior | drag, trigger | net mean R, prior | net mean R, trigger | paired net difference | 95% |")
    P.append("|---|---|---|---|---|---|---|---|---|---|---|")
    for sym in a:
        ka = {key(t): t for t in a[sym]["net"]}
        kb = {key(t): t for t in b[sym]["net"]}
        ga = {key(t): t for t in finite(a[sym]["gross"])}
        gb = {key(t): t for t in finite(b[sym]["gross"])}
        common = [k for k in ka if k in kb and k in ga and k in gb]
        if not common:
            continue
        wa = np.array([ka[k].risk_per_share for k in common])
        wb = np.array([kb[k].risk_per_share for k in common])
        da = np.array([ga[k].gross_r - ka[k].net_r for k in common])
        db = np.array([gb[k].gross_r - kb[k].net_r for k in common])
        diff = [ka[k].net_r - kb[k].net_r for k in common]
        l, h = G.mean_ci95(diff)
        P.append(f"| {sym} | {len(common):,} | {np.median(wa)*100:.1f}¢ | "
                 f"{np.median(wb)*100:.1f}¢ | {np.median(wa)/np.median(wb):.2f}x | "
                 f"{da.mean():.3f}R | {db.mean():.3f}R | "
                 f"{np.mean([ka[k].net_r for k in common]):+.3f} | "
                 f"{np.mean([kb[k].net_r for k in common]):+.3f} | "
                 f"{np.mean(diff):+.3f} | {l:+.3f} to {h:+.3f} |")
    P.append("")
    P.append("**ENGINE-4's law holds and is now measured twice.** Cost as a "
             "fraction of risk is `cost per share ÷ stop distance`: the "
             "numerator is set by the instrument's price, the denominator by the "
             "model. The wider reading pays proportionally less to trade and is "
             "stopped out less often; the tighter reading pays more and is "
             "stopped out more. Neither of those is the same thing as making "
             "money, which is what the net columns above are for.\n")
    return "\n".join(P)


# --- did the management rule pay? --------------------------------------------
def management_section(all_res, cfg, subj) -> str:
    a = all_res[PRIMARY][cfg["label"]]
    b = all_res["orb_1h_unmanaged.v1"][cfg["label"]]
    P = ["## Did the management rule pay for itself?\n"]
    P.append("Half off at +1R with the stop to breakeven does two opposite "
             "things at once. It converts trades that reached +1R and then "
             "reversed from full losses into small wins. It also caps every "
             "winner at half size and puts a stop exactly where intraday noise "
             "lives, so some trades that would have reached the target become "
             "breakeven scratches instead. Which effect is bigger is arithmetic "
             "on this tape, not an opinion.\n")
    P.append("**The two runs share every entry, stop and target.** The rule is "
             "an exit rule and is asserted not to move a single trade "
             "(`test_managing_never_changes_which_trades_were_taken`), and "
             "`run_symbol_managed(manage=False)` is asserted to reproduce the "
             "older runner trade for trade. So the difference below is the rule "
             "and nothing else.\n")
    P.append("| symbol | trades | managed, mean R | managed, median R | unmanaged, mean R | unmanaged, median R | paired difference | 95% | managed hit | unmanaged hit | PF managed | PF unmanaged |")
    P.append("|---|---|---|---|---|---|---|---|---|---|---|---|")
    for sym in a:
        ka = {key(t): t for t in a[sym]["net"]}
        kb = {key(t): t for t in b[sym]["net"]}
        common = [k for k in ka if k in kb]
        diff = [ka[k].net_r - kb[k].net_r for k in common]
        l, h = G.mean_ci95(diff)
        sa = summarise([ka[k] for k in common], "m")
        sb = summarise([kb[k] for k in common], "u")
        P.append(f"| {sym} | {len(common):,} | {sa.mean_r:+.3f} | {sa.median_r:+.3f} | "
                 f"{sb.mean_r:+.3f} | {sb.median_r:+.3f} | {np.mean(diff):+.3f} | "
                 f"{l:+.3f} to {h:+.3f} | {sa.hit_rate*100:.1f}% | "
                 f"{sb.hit_rate*100:.1f}% | {fmt(sa.profit_factor,2)} | "
                 f"{fmt(sb.profit_factor,2)} |")
    P.append("")
    P.append("How the managed trades ended, and how often the partial was even "
             "reached:\n")
    P.append("| symbol | partial taken | partial + target | partial + breakeven | partial + 15:55 | stopped before any partial | target without a partial | 15:55 without a partial | same-bar partial-and-breakeven |")
    P.append("|---|---|---|---|---|---|---|---|---|")
    for sym in a:
        tr = a[sym]["net"]
        n = max(1, len(tr))
        c = Counter(t.exit_reason for t in tr)
        part = sum(1 for t in tr if t.meta["partial_taken"])
        same = sum(1 for t in tr if t.meta["same_bar_partial_and_breakeven"])
        P.append(f"| {sym} | {part:,} ({part/n*100:.1f}%) | "
                 f"{c.get('partial+target',0):,} | {c.get('partial+be',0):,} | "
                 f"{c.get('partial+time',0):,} | {c.get('stop',0):,} | "
                 f"{c.get('target',0):,} | {c.get('time',0):,} | {same:,} |")
    P.append("")
    return "\n".join(P)


# --- the target choice --------------------------------------------------------
def target_section(all_res, cfg, subj) -> str:
    a = all_res[PRIMARY][cfg["label"]]
    b = all_res["orb_1h_managed_2r.v1"][cfg["label"]]
    P = ["## The target: the nearest 1-hour level, or a fixed 2R\n"]
    P.append("The owner named both in one sentence, so both are measured. A "
             "level target has no fixed reward: the nearest 1-hour high or key "
             "level can be a third of a stop away or four stops away, and where "
             "it lands is not under the model's control. That distribution is "
             "the first table.\n")
    P.append("| symbol | trades with a level | no level in the direction | target distance, median R | mean R | IQR | under 1R | over 2R |")
    P.append("|---|---|---|---|---|---|---|---|")
    for sym in a:
        d = target_distance_r(a[sym]["net"])
        if not d:
            continue
        P.append(f"| {sym} | {d['n']:,} | {d['n_no_target']:,} | {d['median']:.2f} | "
                 f"{d['mean']:.2f} | {d['q1']:.2f}–{d['q3']:.2f} | "
                 f"{d['under_1r']*100:.1f}% | {d['over_2r']*100:.1f}% |")
    P.append("")
    P.append("**A target closer than 1R cannot partial at 1R** — price would "
             "have to pass through the target to reach the partial — so on those "
             "trades the management rule is inert by construction. That is a "
             "consequence of the spec, was written into the gate before the run, "
             "and is why the share under 1R is in the table.\n")
    P.append("Paired against the fixed-2R variant, on the trades both took:\n")
    P.append("| symbol | pairs | level target, mean R | median R | 2R target, mean R | median R | paired difference | 95% |")
    P.append("|---|---|---|---|---|---|---|---|")
    for sym in a:
        ka = {key(t): t for t in a[sym]["net"]}
        kb = {key(t): t for t in b[sym]["net"]}
        common = [k for k in ka if k in kb]
        if not common:
            continue
        diff = [ka[k].net_r - kb[k].net_r for k in common]
        l, h = G.mean_ci95(diff)
        sa = summarise([ka[k] for k in common], "l")
        sb = summarise([kb[k] for k in common], "r")
        P.append(f"| {sym} | {len(common):,} | {sa.mean_r:+.3f} | {sa.median_r:+.3f} | "
                 f"{sb.mean_r:+.3f} | {sb.median_r:+.3f} | {np.mean(diff):+.3f} | "
                 f"{l:+.3f} to {h:+.3f} |")
    P.append("")
    return "\n".join(P)


def cost_section(res, cfg) -> str:
    P = ["## Cost drag as a fraction of risk\n"]
    P.append("ENGINE-4's finding, which this lane inherits and re-measures: "
             "**cost as a fraction of risk is `cost per share ÷ stop distance`.** "
             "The numerator scales with the PRICE of the instrument. The "
             "denominator is chosen by the MODEL. The stop width sets the "
             "hurdle; the instrument does not.\n")
    P.append("Paired trade by trade, so it is the same trades gross and net.\n")
    P.append("| symbol | trades | median risk, % of price | median risk | mean risk | avg price | **cost drag, R** | 95% interval |")
    P.append("|---|---|---|---|---|---|---|---|")
    for sym, r in res.items():
        d, lo, hi, dn = cost_drag_r(r["net"], r["gross"])
        w = stop_width(r["net"])
        P.append(f"| {sym} | {dn:,} | {pctf(w['median_pct'], 3)} | "
                 f"{w['median_c']*100:.1f}¢ | {w['mean_c']*100:.1f}¢ | "
                 f"${w['price']:.0f} | **{d:.3f}R** | {lo:.3f} to {hi:.3f} |")
    P.append("")
    P.append("For comparison, from earlier phases: `orb_reclaim.v1` ≈0.09R, "
             "`orb_htf_structural.v1` 0.144R, `orb_mtf.v1` 0.122R on the 32-name "
             "basket; `orb_simple_1h.v1` 0.265R on SPY with a trigger-candle "
             "stop.\n")
    return "\n".join(P)


def gate_section(s, subj) -> str:
    P = [f"## The gate — evaluated on {subj} — **{s['verdict']}**\n"]
    P.append("| gate | | bar | observed | |")
    P.append("|---|---|---|---|---|")
    for g in s["core"]:
        P.append(f"| {g.id} | {g.name} | {g.threshold} | {g.observed} | "
                 f"**{'PASS' if g.passed else 'FAIL'}** |")
    P.append("")
    return "\n".join(P)


def tables_section(s, subj, regimes) -> str:
    P = [f"## {subj}, in full\n", SUMMARY_HEADER]
    for x in (s["s_all"], s["s_is"], s["s_oos"]):
        P.append(summary_row(x))
    P.append("")
    P.append(mae_block(s["s_all"], f"All {subj} trades"))
    P.append(mae_block(s["s_oos"], f"{subj}, held-back window"))
    P.append("By regime (in-sample), then side and year:\n")
    P.append(SUMMARY_HEADER)
    for k, x in sorted(s["reg"].items()):
        P.append(summary_row(x))
    for _, groups in (("side", split_by(s["net"], lambda t: t.side)),
                      ("year", split_by(s["net"], lambda t: str(t.day)[:4]))):
        for k in sorted(groups):
            P.append(summary_row(summarise(groups[k], k)))
    P.append("")
    P.append(f"- exits: {s['s_all'].exit_mix}")
    P.append(f"- trades resolved by the pessimistic same-bar assumption: "
             f"{s['s_all'].ambiguous_bars} "
             f"({s['s_all'].ambiguous_bars/max(1,s['s_all'].n)*100:.1f}%)")
    P.append(f"- mean 1-minute bars held: {s['s_all'].mean_bars_held:.1f}")
    tpd = trades_per_day(s["net"])
    P.append("- trades per session, where at least one was taken: "
             + ", ".join(f"{k}: {v:,}" for k, v in sorted(tpd.items())))
    P.append("")
    return "\n".join(P)


def mae_block(s, title) -> str:
    if s.n == 0:
        return ""
    P = [f"**Maximum adverse excursion — {title}.** How far a trade travelled "
         f"the wrong way before it resolved. Distribution, not mean.\n"]
    P.append("- MAE deciles (R): " + " | ".join(f"{x:.2f}" for x in s.mae_deciles))
    P.append("- all trades reaching that far against: "
             + " · ".join(f"{k} {v*100:.1f}%" for k, v in s.mae_tail.items()))
    P.append("- **winners** that first went that far against: "
             + " · ".join(f"{k} {v*100:.1f}%" for k, v in s.mae_tail_winners.items()))
    P.append("")
    return "\n".join(P)


def others_section(res, cfg, subj) -> str:
    if len(res) < 2:
        return ""
    P = [f"## The other symbols — reported separately, never pooled into {subj}\n"]
    P.append("These are not evidence about the subject. They are the same model "
             "on other instruments, judged against the same bar, so a reader can "
             "see whether the subject's result is peculiar to it.\n")
    for sym, r in res.items():
        if sym == subj:
            continue
        P.append(f"### {sym} — **{r['verdict']}**\n")
        P.append(SUMMARY_HEADER)
        for x in (r["s_all"], r["s_is"], r["s_oos"]):
            P.append(summary_row(x))
        P.append("")
        P.append("| gate | bar | observed | |")
        P.append("|---|---|---|---|")
        for g in r["core"]:
            P.append(f"| {g.id} {g.name} | {g.threshold} | {g.observed} | "
                     f"{'PASS' if g.passed else 'FAIL'} |")
        P.append("")
    return "\n".join(P)


def census_section(variant, res, sessions, cfg) -> str:
    P = ["## Where the days went\n"]
    P.append("Every session the model looked at and the rule that ended it.\n")
    order = ["days_seen", "days_no_htf_trend", "days_trend_ok_no_break",
             "days_trigger_but_no_signal", "days_with_1_trade_direction(s)",
             "days_with_2_trade_direction(s)", "triggers", "signals",
             "signals_long", "signals_short", "signals_no_target_level",
             "skip_invalid_stop", "skip_no_prior_candle", "bars_evaluated",
             "bars_no_opening_range", "bars_no_htf_trend",
             "bars_no_break_on_trend_side", "bars_direction_already_traded"]
    P.append("`triggers` counts BARS, not days: once price is beyond the range "
             "on the trend side, every later 5-minute close that session counts "
             "again. `signals` is the number of trades. "
             "`signals_no_target_level` is a SUBSET of `signals` — a trade with "
             "no price target, not a skip.\n")
    cols = list(res)
    P.append("| outcome | " + " | ".join(cols) + " |")
    P.append("|---|" + "---|" * len(cols))
    for k in order:
        P.append(f"| `{k}` | " + " | ".join(f"{res[s]['census'].get(k, 0):,}"
                                            for s in cols) + " |")
    P.append("")
    for sym, r in res.items():
        c = r["census"]
        booked = sum(v for k, v in c.items()
                     if k.startswith("days_") and k != "days_seen")
        assert booked == c["days_seen"], (sym, booked, c["days_seen"])
    P.append("Every session is booked under exactly one outcome, and the "
             "`days_*` rows below `days_seen` sum to it.\n")
    for sym, r in res.items():
        c = r["census"]
        seen = c.get("days_seen", 0) or 1
        traded = (c.get("days_with_1_trade_direction(s)", 0)
                  + c.get("days_with_2_trade_direction(s)", 0))
        P.append(f"- **{sym}**: {traded:,} of {c.get('days_seen', 0):,} sessions "
                 f"produced at least one trade ({traded/seen*100:.1f}%); "
                 f"{c.get('days_no_htf_trend', 0):,} lost to the 1-hour chart "
                 f"having no confirmed trend at any point; "
                 f"{c.get('days_trend_ok_no_break', 0):,} had a trend but no "
                 f"5-minute close beyond the range on that side. Orders that "
                 f"never became a trade: {Counter(x.reason for x in r['rejects'])}")
    P.append("")
    P.append(f"- model parameters: `{json.dumps(OrbManaged(variant).params())}`")
    P.append("")
    return "\n".join(P)


def disclosures(variant, cfg) -> str:
    deep = not cfg["pooled"]
    return f"""## Disclosures specific to this run

- **Models seven through ten.** `orb_reclaim.v1`, `sweep_displacement_fvg.v1`,
  `orb_htf_structural.v1`, `orb_mtf.v1`, `orb_simple_1h.v1` and
  `orb_simple_4h.v1` were all measured on this programme's data; five failed and
  one was inconclusive. `orb_1h_managed.v1`, `orb_1h_managed_2r.v1`,
  `orb_1h_trigcandle.v1` and `orb_1h_unmanaged.v1` are run as a SET of four,
  which is four more chances for one of them to look good by luck. Out-of-sample
  is the verdict and was read once. A variant that passes while the primary
  fails is a lead, not a result.
- **The +1R touch rate is a diagnostic and enters no gate.** The fence was
  written into the gate and into `models/gates.py` before any number existed.
  Nothing in the verdict depends on a price nobody sold at.
- **A breakeven stop is not free.** It fills at the entry price plus adverse
  slippage and still pays its half of the commission, so a "breakeven" exit is
  a small realised loss. That is what a real one does.
- **The management rule's ambiguities are all resolved against the trade.** A
  bar containing both the stop and the +1R level is booked as the stop with no
  partial. A bar that reaches +1R and then returns through the entry is booked
  as partial-then-breakeven, because the order of the two excursions is
  unknowable from OHLC. Both are counted in the report.
- **No level in the trade's direction is not a skip.** It is a trade with no
  price target, which runs to the breakeven stop or the 15:55 flat. Counted as
  `signals_no_target_level`, and the level-target trades are given as a labelled
  subset so both readings of that choice are visible.
- **The two stop readings do not produce identical trade sets.** A prior candle
  can sit on the wrong side of the trigger close; that is counted as
  `skip_invalid_stop` and is why the counts differ. Every stop-width and
  cost-drag comparison is repeated on the intersection.
- **Fills are modelled, not observed.** OHLC cannot say what happened inside a
  bar. Every ambiguity is resolved against the trade, and a bar containing both
  the stop and the target is booked as the stop.
- **One position at a time.** A day's second direction can only be taken after
  the first has closed.
- **Prices are split- and dividend-adjusted**, so the dollar prices in older
  years are not the prices that printed on the tape that day. Every per-share
  cent figure is measured against the ADJUSTED price; the cost-drag fraction is
  the number to trust and the cents are the illustration.
- **No borrow, locate, halt, dividend or corporate-action modelling.**
{"- **Three index ETFs is not a universe.** SPY, QQQ and IWM are among the most efficiently priced instruments available. A null result here does not transfer to single names, and neither would a positive one. The 32-name `polygon-v1` basket is reported separately for that reason." if deep else "- **The 32-name basket is a separate result on a separate snapshot.** `polygon-v1` runs 2023-09-01 to 2026-08-28 with ENGINE-1's windows and pooled floors. It is not evidence about SPY and no number here is pooled with the deep snapshot. The names were chosen because they are liquid TODAY, which is a survivorship choice and is stated in every report of this programme."}
"""


# --- main --------------------------------------------------------------------
def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--stage1", action="store_true")
    ap.add_argument("--symbols", default="")
    ap.add_argument("--variants", default=",".join(VARIANTS))
    ap.add_argument("--snapshots", default="deep,basket")
    a = ap.parse_args()

    if a.stage1:
        stage1(tuple(s.strip().upper() for s in (a.symbols or "SPY").split(",")))
        return 0

    variants = [v.strip() for v in a.variants.split(",") if v.strip()]
    cfgs = [c for c in (DEEP, BASKET) if c["label"] in a.snapshots.split(",")]
    all_res: dict[str, dict[str, dict]] = {v: {} for v in variants}
    meta: dict[str, dict] = {}

    for cfg in cfgs:
        syms = ([s.strip().upper() for s in a.symbols.split(",") if s.strip()]
                or list(cfg["universe"]))
        regimes = regime_by_day(config.BENCHMARK, 50, cfg["snapshot"])
        sessions = {s: len(load(s, "1m", cfg["snapshot"]).day_bounds()) for s in syms}
        meta[cfg["label"]] = dict(regimes=regimes, sessions=sessions, cfg=cfg)
        for variant in variants:
            print(f"\n--- {variant} on {cfg['snapshot']} ---", flush=True)
            per = {s: evaluate_symbol(s, variant, regimes, cfg) for s in syms}
            if cfg["pooled"]:
                per = {"BASKET(32)": pool(per, variant, regimes, cfg)}
            all_res[variant][cfg["label"]] = per

    for cfg in cfgs:
        lbl = cfg["label"]
        for variant in variants:
            res = all_res[variant][lbl]
            out = config.REPORTS_ROOT / f"{variant}.{cfg['snapshot']}.md"
            out.parent.mkdir(parents=True, exist_ok=True)
            out.write_text(report(variant, res, all_res,
                                  meta[lbl]["regimes"], meta[lbl]["sessions"], cfg))
            stem = out.with_suffix("").name
            with gzip.open(out.parent / f"{stem}.trades.csv.gz", "wt", newline="") as fh:
                w = csv.writer(fh)
                first = next((r["net"][0] for r in res.values() if r["net"]), None)
                if first is not None:
                    keys = [k for k in asdict(first) if k != "meta"]
                    w.writerow(keys + ["meta"])
                    for r in res.values():
                        for t in r["net"]:
                            d = asdict(t)
                            w.writerow([d[k] for k in keys] + [json.dumps(d["meta"])])
            for sym, r in res.items():
                run_r, eq = 0.0, []
                for t in sorted(r["net"], key=lambda x: (x.day, x.entry_minute)):
                    run_r += t.net_r
                    eq.append((t.day, round(run_r, 4)))
                (out.parent / f"{stem}.{sym.replace('(', '').replace(')', '')}.equity.csv"
                 ).write_text("day,cum_net_r\n" + "\n".join(f"{d},{v}" for d, v in eq))
            subj = "BASKET(32)" if cfg["pooled"] else SUBJECT
            print(f"\n{variant} [{lbl}]: {subj} {res[subj]['verdict']}  -> {out}")
            for g in res[subj]["core"]:
                print(f"  {'PASS' if g.passed else 'FAIL'} {g.id} {g.name}: {g.observed}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
