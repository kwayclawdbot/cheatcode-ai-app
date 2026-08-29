"""ENGINE-2 — run `orb_htf_structural.v1` against its pre-registered gate, with
its matched control and its two ablations, and write the one report.

    .venv/bin/python run_engine2.py                  # everything
    .venv/bin/python run_engine2.py --symbols AAPL   # smoke

The gate this is measured against was committed before this file produced a
number: see engine/models/orb_htf_structural.v1/GATE.md and the git log.
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
from engine.backtest.engine import run_symbol  # noqa: E402
from engine.backtest.regime import regime_by_day  # noqa: E402
from engine.backtest.stats import (SUMMARY_HEADER, fmt, session_bucket,  # noqa: E402
                                   split_by, summarise, summary_row)
from engine.backtest.types import Costs  # noqa: E402
from engine.cache.load import load  # noqa: E402
from engine.models import gates as G  # noqa: E402
from engine.models.matched_coinflip import MatchedCoinflip  # noqa: E402
from engine.models.orb_htf_structural import (RANGE_EDGE, STRUCTURAL,  # noqa: E402
                                              OrbHtfStructural)
from engine.run_backtest import git_rev, render  # noqa: E402

NET = Costs(commission_per_share=0.005, slippage_bps=1.0)
GROSS = Costs(commission_per_share=0.0, slippage_bps=0.0)


def dayint(s: str) -> int:
    return int(s.replace("-", ""))


def run(make_model, symbols, costs, label=""):
    trades, rejects = [], []
    census: Counter = Counter()
    t0 = time.time()
    for k, sym in enumerate(symbols, 1):
        m = make_model(sym)
        tr, rj = run_symbol(load(sym, "1m"), m, costs)
        trades.extend(tr)
        rejects.extend(rj)
        census.update(getattr(m, "census", {}))
        print(f"  [{label}] [{k}/{len(symbols)}] {sym:<6} {len(tr):>4} trades "
              f"({time.time()-t0:.0f}s)", flush=True)
    return trades, rejects, census


def windows(trades):
    is_lo, is_hi = (dayint(x) for x in G.IN_SAMPLE)
    oos_lo, oos_hi = (dayint(x) for x in G.OUT_OF_SAMPLE)
    return ([t for t in trades if is_lo <= t.day <= is_hi],
            [t for t in trades if oos_lo <= t.day <= oos_hi])


def block(trades, label):
    """(all, in-sample, out-of-sample) summaries."""
    is_tr, oos_tr = windows(trades)
    return (summarise(trades, label),
            summarise(is_tr, f"in-sample {G.IN_SAMPLE[0]}..{G.IN_SAMPLE[1]}"),
            summarise(oos_tr, f"out-of-sample {G.OUT_OF_SAMPLE[0]}..{G.OUT_OF_SAMPLE[1]}"))


def gross_r_mean(trades):
    return float(np.mean([t.gross_r for t in trades])) if trades else float("nan")


def risk_pct_stats(trades):
    v = [t.risk_per_share / t.fill_price for t in trades if t.fill_price > 0]
    if not v:
        return float("nan"), float("nan"), float("nan")
    return (float(np.median(v)), float(np.quantile(v, 0.25)), float(np.quantile(v, 0.75)))


def cost_drag(net_trades, gross_trades):
    """Mean R lost to commission and slippage, measured by re-running the same
    model with both set to zero."""
    a = float(np.mean([t.net_r for t in net_trades])) if net_trades else float("nan")
    b = float(np.mean([t.net_r for t in gross_trades])) if gross_trades else float("nan")
    return b - a


def matched_plan(trades):
    """{symbol -> {day -> (minute, risk_ps, reward_ps)}} from the model's own
    signals, so the control gets exactly the geometry the model used."""
    out: dict[str, dict[int, tuple[int, float, float]]] = {}
    for t in trades:
        m = t.meta or {}
        r, w = m.get("risk_ps"), m.get("reward_ps")
        if r is None or w is None:
            continue
        out.setdefault(t.symbol, {})[t.day] = (t.decision_minute, float(r), float(w))
    return out


def pct(x, nd=2):
    return "n/a" if x != x else f"{x*100:.{nd}f}%"


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--symbols", default=",".join(config.UNIVERSE))
    ap.add_argument("--snapshot", default=None)
    ap.add_argument("--out", default=None)
    a = ap.parse_args()
    symbols = [s.strip().upper() for s in a.symbols.split(",") if s.strip()]
    snapshot = a.snapshot or config.SNAPSHOT

    full = lambda s: OrbHtfStructural(True, STRUCTURAL, a.snapshot)          # noqa: E731
    no_htf = lambda s: OrbHtfStructural(False, STRUCTURAL, a.snapshot)       # noqa: E731
    edge = lambda s: OrbHtfStructural(True, RANGE_EDGE, a.snapshot)          # noqa: E731

    net_tr, net_rj, census = run(full, symbols, NET, "net")
    gross_tr, _, _ = run(full, symbols, GROSS, "gross")
    a1_net, _, a1_census = run(no_htf, symbols, NET, "A1 net")
    a1_gross, _, _ = run(no_htf, symbols, GROSS, "A1 gross")
    a2_net, _, _ = run(edge, symbols, NET, "A2 net")
    a2_gross, _, _ = run(edge, symbols, GROSS, "A2 gross")

    plan = matched_plan(net_tr)
    ctl = lambda s: MatchedCoinflip(plan.get(s, {}))                          # noqa: E731
    ctl_net, _, _ = run(ctl, symbols, NET, "control net")
    ctl_gross, _, _ = run(ctl, symbols, GROSS, "control gross")

    # --- the gate ----------------------------------------------------------
    regimes = regime_by_day(config.BENCHMARK, 50, a.snapshot)
    is_tr, oos_tr = windows(net_tr)
    s_all, s_is, s_oos = block(net_tr, "all")
    reg_is = {k: summarise(v, k) for k, v in
              split_by(is_tr, lambda t: regimes.get(t.day, "unknown")).items()
              if k != "unknown"}
    gate_rows = G.evaluate(s_is, s_oos, reg_is)
    verdict = G.verdict3(gate_rows, [t.net_r for t in is_tr], [t.net_r for t in oos_tr])

    sess = {k: summarise(v, k) for k, v in split_by(net_tr, session_bucket).items()}
    side = {k: summarise(v, k) for k, v in split_by(net_tr, lambda t: t.side).items()}
    per_sym = {k: summarise(v, k) for k, v in split_by(net_tr, lambda t: t.symbol).items()}
    per_year = {k: summarise(v, k) for k, v in
                split_by(net_tr, lambda t: str(t.day)[:4]).items()}

    model = OrbHtfStructural(True, STRUCTURAL, a.snapshot)
    body = render(model, snapshot, symbols, NET, s_all, s_is, s_oos, reg_is, sess,
                  side, per_sym, per_year, gate_rows, verdict, net_rj, len(net_tr))
    body = body[body.index("## The gate"):]

    head = preamble(model, snapshot, symbols, verdict, gate_rows, net_tr, gross_tr,
                    ctl_net, ctl_gross, is_tr, oos_tr, census)
    tail = appendix(net_tr, gross_tr, a1_net, a1_gross, a2_net, a2_gross,
                    ctl_net, ctl_gross, census, a1_census)

    out = Path(a.out) if a.out else config.REPORTS_ROOT / f"{model.id}.{snapshot}.md"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(head + "\n" + body + "\n" + tail)

    stem = out.with_suffix("").name
    with gzip.open(config.REPORTS_ROOT / f"{stem}.trades.csv.gz", "wt", newline="") as fh:
        w = csv.writer(fh)
        if net_tr:
            keys = [k for k in asdict(net_tr[0]) if k != "meta"]
            w.writerow(keys + ["meta"])
            for t in net_tr:
                d = asdict(t)
                w.writerow([d[k] for k in keys] + [json.dumps(d["meta"])])
    run_r = 0.0
    eq = []
    for t in sorted(net_tr, key=lambda x: (x.day, x.entry_minute)):
        run_r += t.net_r
        eq.append((t.day, round(run_r, 4)))
    (config.REPORTS_ROOT / f"{stem}.equity.csv").write_text(
        "day,cum_net_r\n" + "\n".join(f"{d},{r}" for d, r in eq))

    print(f"\n{verdict}  -> {out}")
    for g in gate_rows:
        print(f"  {'PASS' if g.passed else 'FAIL'} {g.id} {g.name}: {g.observed}")
    return 0


# ---------------------------------------------------------------------------
def preamble(model, snapshot, symbols, verdict, gate_rows, net_tr, gross_tr,
             ctl_net, ctl_gross, is_tr, oos_tr, census) -> str:
    med, q1, q3 = risk_pct_stats(net_tr)
    drag = cost_drag(net_tr, gross_tr)
    g_model = gross_r_mean(gross_tr)
    g_ctl = gross_r_mean(ctl_gross)
    n_ctl = len(ctl_gross)
    is_lo, is_hi = G.mean_ci95([t.net_r for t in is_tr])
    oos_lo, oos_hi = G.mean_ci95([t.net_r for t in oos_tr])
    beats = g_model - g_ctl

    L = []
    A = L.append
    A(f"# {model.id} — measured on `{snapshot}`\n")
    A(f"**Verdict: {verdict}** against the bar in "
      f"[`../models/orb_htf_structural.v1/GATE.md`](../models/orb_htf_structural.v1/GATE.md), "
      f"which was committed before this evaluation ran.\n")
    A(f"Run {dt.datetime.now(dt.UTC).isoformat(timespec='seconds')} at `{git_rev()}`. "
      f"{len(symbols)} symbols, snapshot `{snapshot}`, commission "
      f"$0.005/share/side, slippage 1.0bp on market and stop fills.\n")

    A("## In plain language\n")
    A(_plain(verdict, net_tr, is_tr, oos_tr, med, drag, g_model, g_ctl, beats,
             is_lo, is_hi, oos_lo, oos_hi, census))

    A("## The headline number this run existed to produce\n")
    A("ENGINE-1 measured risk per trade at 0.18–0.29% of price, so a "
      "$0.01/share round trip plus 2bp of slippage ate 9–14% of the risk on "
      "every trade, and the whole day-trade family needed about **+0.15R of "
      "gross edge just to break even**. The owner's structural stop was the "
      "mechanism that was supposed to move that floor.\n")
    A("| | ENGINE-1 (`orb_reclaim.v1`) | this model |")
    A("|---|---|---|")
    A(f"| median risk per trade, % of price | 0.287% | **{pct(med, 3)}** |")
    A(f"| interquartile range | — | {pct(q1,3)} – {pct(q3,3)} |")
    A(f"| costs as a fraction of risk (measured) | ≈0.09 R | **{drag:.3f} R** |")
    A(f"| gross edge needed to break even | ≈+0.15 R | **≈+{drag:.2f} R** |")
    A("")
    A(_drag_prose(med, drag))
    return "\n".join(L)


def _plain(verdict, net_tr, is_tr, oos_tr, med, drag, g_model, g_ctl, beats,
           is_lo, is_hi, oos_lo, oos_hi, census) -> str:
    n, nis, noos = len(net_tr), len(is_tr), len(oos_tr)
    mis = float(np.mean([t.net_r for t in is_tr])) if is_tr else float("nan")
    moos = float(np.mean([t.net_r for t in oos_tr])) if oos_tr else float("nan")
    P = []
    A = P.append

    A("**Did it work?**\n")
    if verdict == "PASS":
        A(f"Yes, on this data. The model cleared every one of the five tests "
          f"written down before it ran, on {n:,} trades.\n")
    elif verdict.startswith("INCONCLUSIVE (sample)"):
        A(f"We cannot tell, and that is the honest answer. The daily-trend "
          f"filter and the skip rules left only {n:,} trades "
          f"({nis:,} in the older data, {noos:,} in the held-back 2026 window), "
          f"which is below the count we said in advance we would need before "
          f"believing either a good or a bad number. It is not a pass and it is "
          f"not a proven failure; there is not enough of it to say.\n")
    elif verdict.startswith("INCONCLUSIVE (power)"):
        A(f"Probably not, but the sample cannot close the argument. Over "
          f"{n:,} trades the average result was below the bar, yet the "
          f"uncertainty around that average is still wide enough to reach it.\n")
    else:
        A(f"No. Over {n:,} trades it missed the bar that was written down "
          f"before it ran, and the miss is bigger than the uncertainty.\n")

    A("**What the numbers mean, without the jargon.** One \"R\" is one unit of "
      "the money you agreed to lose if the trade goes wrong — the distance from "
      "your entry to your stop. A result of +0.10R means that, on average, "
      "every trade made a tenth of what it was risking. −0.10R means every "
      "trade lost a tenth of what it risked. The bar was +0.10R on the older "
      "data and +0.05R on the held-back 2026 data, after costs.\n")
    A(f"This model averaged **{mis:+.3f}R** per trade on the older data and "
      f"**{moos:+.3f}R** on the held-back 2026 data. In plain money terms, "
      f"risking $100 a trade, that is "
      f"{'about $%.0f' % (mis*100) if mis == mis else 'n/a'} per trade before "
      f"2026 and {'about $%.0f' % (moos*100) if moos == moos else 'n/a'} per "
      f"trade during 2026.\n")

    A("**How sure are we?**\n")
    A(f"The 2026 window is the one that counts: it was held back and read once. "
      f"There are {noos:,} trades in it. The average could plausibly be anywhere "
      f"from {oos_lo:+.3f}R to {oos_hi:+.3f}R and we would not be able to tell "
      f"the difference — that is the honest width of the answer. On the older "
      f"data the range is {is_lo:+.3f}R to {is_hi:+.3f}R.\n")
    A("This is the **third** day-trading model measured on exactly the same "
      "three years of bars. Every extra attempt makes it more likely that one "
      "of them looks good by luck alone, which is why the held-back 2026 window "
      "is the verdict rather than the older data.\n")

    A("**Was it better than guessing?**\n")
    A(f"Before costs, the model made {g_model:+.3f}R per trade. A coin flip "
      f"taken on the same days, in the same names, at the same minute, with the "
      f"same stop and the same target — differing only in which way it pointed —"
      f" made {g_ctl:+.3f}R. The difference is **{beats:+.3f}R**, "
      f"{'in the model' if beats > 0 else 'against the model'}"
      f"{'' if beats > 0 else ', which means picking the direction on purpose did worse than picking it at random'}"
      f". Costs come off both equally, so this comparison settles most of the "
      f"argument before the cost table is even read.\n")

    A("**What would change the answer?**\n")
    A("- A bigger sample. The filter is strict by design; more symbols or more "
      "years is the only honest way to get more trades out of it, and both are "
      "available.\n"
      "- A different definition of \"major level\". The stop rule is only as "
      "good as what counts as a level, and that definition was chosen for "
      "plausibility rather than performance. A stricter one would place stops "
      "further away and cut the cost drag further.\n"
      "- Costs. If the risk per trade is small, the broker takes a large slice "
      "of it. The table below is the number to watch: it is the difference "
      "between a setup that has to be brilliant and one that only has to be "
      "slightly right.\n")
    return "\n".join(P)


def _drag_prose(med, drag) -> str:
    if med != med:
        return "No trades were taken, so there is no risk distribution to report.\n"
    if drag < 0.09:
        return (f"The structural stop did what the brief hoped it would: at "
                f"{pct(med,3)} of price the stop is far enough away that the "
                f"round trip costs {drag:.3f}R instead of ENGINE-1's ~0.09R. "
                f"The break-even hurdle for this family drops accordingly.\n")
    return (f"The structural stop did **not** widen risk the way the brief "
            f"expected. At {pct(med,3)} of price it sits in the same band "
            f"ENGINE-1 measured, so costs still take {drag:.3f}R out of every "
            f"trade and the family still needs roughly +{drag:.2f}R of gross "
            f"edge before it earns anything. That is a finding about the "
            f"nearest-major-level rule itself: the nearest level is usually "
            f"close, because a liquid stock in a trend has structure just "
            f"underneath it.\n")


def appendix(net_tr, gross_tr, a1_net, a1_gross, a2_net, a2_gross,
             ctl_net, ctl_gross, census, a1_census) -> str:
    L = []
    A = L.append
    A("## Gross of costs, against the matched control\n")
    A("ENGINE-1's decisive finding was that both of its models were below a "
      "coin flip *before* costs, which settles the net number without further "
      "argument. So this table is read first.\n")
    A("| run | n | gross mean R | net mean R | hit | PF (net) |")
    A("|---|---|---|---|---|---|")
    for name, netl, grossl in (
            ("`orb_htf_structural.v1` (full spec)", net_tr, gross_tr),
            ("`null_coinflip.v1.matched` (control)", ctl_net, ctl_gross)):
        s = summarise(netl, name) if netl else None
        A(f"| {name} | {len(netl)} | {gross_r_mean(grossl):+.3f} | "
          f"{s.mean_r:+.3f} | {s.hit_rate*100:.1f}% | {s.profit_factor:.2f} |"
          if s else f"| {name} | 0 | n/a | n/a | n/a | n/a |")
    A("")
    A("The control is not the ENGINE-1 whole-tape coin flip. It takes the same "
      "symbols, the same days, the same decision minute and the same risk and "
      "reward distances as the trades the model actually took, and flips only "
      "the direction. It is the like-for-like question: **did knowing which way "
      "to point pay for itself?**\n")

    A("## Ablations — two runs, clearly diagnostics\n")
    A("The pre-registered gate applies to the full spec alone. These two runs "
      "exist to say whether the owner's two changes did anything, and neither "
      "can be promoted into the result.\n")
    A("| run | n | gross mean R | net mean R | median risk % | hit |")
    A("|---|---|---|---|---|---|")
    rows = (("full spec", net_tr, gross_tr),
            ("A1 — HTF filter removed", a1_net, a1_gross),
            ("A2 — structural stop replaced by a range-edge stop, same trades",
             a2_net, a2_gross))
    for name, netl, grossl in rows:
        if not netl:
            A(f"| {name} | 0 | n/a | n/a | n/a | n/a |")
            continue
        s = summarise(netl, name)
        m, _, _ = risk_pct_stats(netl)
        A(f"| {name} | {len(netl)} | {gross_r_mean(grossl):+.3f} | {s.mean_r:+.3f} | "
          f"{pct(m,3)} | {s.hit_rate*100:.1f}% |")
    A("")
    A(_ablation_prose(net_tr, gross_tr, a1_net, a1_gross, a2_net, a2_gross))

    A("## Where the days went\n")
    A("Every symbol-day the model looked at, and the rule that ended it. This "
      "is the honest picture of how hard the filter bites.\n")
    A("| outcome | symbol-days |\n|---|---|")
    order = ["days_seen", "skip_no_daily_trend", "skip_no_opening_range",
             "skip_opening_range_size", "triggers", "skip_no_stop_level",
             "skip_risk_too_wide", "skip_risk_too_tight", "skip_no_target_level",
             "skip_reward_under_min_rr", "skip_range_edge_degenerate", "signals"]
    for k in order:
        if census.get(k):
            A(f"| {k} | {census[k]:,} |")
    for k in sorted(set(census) - set(order)):
        A(f"| {k} | {census[k]:,} |")
    A("")
    A(f"Days that reached the opening-range checks but never closed beyond the "
      f"trend-side edge inside the window: "
      f"{census.get('days_seen',0) - sum(census.get(k,0) for k in order[1:4]) - census.get('triggers',0):,}. "
      f"With the daily-trend filter removed the trigger count is "
      f"{a1_census.get('triggers',0):,} against {census.get('triggers',0):,} — "
      f"the filter is doing most of the cutting, exactly as the brief expected.\n")

    A("## Disclosures specific to this run\n")
    A("- **Third model, same bars.** `orb_reclaim.v1` and "
      "`sweep_displacement_fvg.v1` were measured on this identical cache. "
      "Testing variants makes an in-sample winner likelier by chance; the "
      "out-of-sample window is treated as the verdict and is read once.\n"
      "- **The level definition was chosen by eye, on sparsity only.** Six-bar "
      "pivots on 5-minute bars, two touches within 8bp, 25bp clustering, plus "
      "prior-day / premarket / overnight extremes and 3-bar daily pivots. The "
      "choice was made by checking that the level set looks like a chart a "
      "trader would mark, across five symbols and three dates. No backtest was "
      "run and no PnL was seen before those numbers were frozen. A different "
      "definition is a different model and needs its own gate.\n"
      "- **The 0.10%-of-price risk floor is an addition beyond the owner's "
      "words.** It is justified by ENGINE-1's cost arithmetic, not by a result. "
      "Its effect is reported in the day census above.\n"
      "- **The entry timeframe is 5 minutes; the replay is 1 minute.** A "
      "1-minute bar ending at :49 IS the close of the 09:45–09:50 bar, so the "
      "model decides on 5-minute information while fills keep 1-minute "
      "resolution.\n"
      "- **Only the trend-side edge of the opening range is watched.** An "
      "uptrend day that breaks down is not a short, it is a day off. That is "
      "the brief's rule, not an optimisation.\n")
    return "\n".join(L)


def _ablation_prose(net_tr, gross_tr, a1_net, a1_gross, a2_net, a2_gross) -> str:
    if not net_tr:
        return "No trades in the full spec, so the ablations have nothing to be compared against.\n"
    g0, g1 = gross_r_mean(gross_tr), gross_r_mean(a1_gross)
    n0 = float(np.mean([t.net_r for t in net_tr]))
    n1 = float(np.mean([t.net_r for t in a1_net])) if a1_net else float("nan")
    n2 = float(np.mean([t.net_r for t in a2_net])) if a2_net else float("nan")
    g2 = gross_r_mean(a2_gross)
    P = []
    P.append(
        f"**A1 — did the daily-trend filter earn its cost in trade count?** "
        f"Removing it takes the sample from {len(net_tr):,} to {len(a1_net):,} "
        f"trades and moves gross expectancy from {g0:+.3f}R to {g1:+.3f}R "
        f"(net {n0:+.3f}R to {n1:+.3f}R). "
        + ("The filter is adding expectancy, and paying for the trades it costs."
           if g0 > g1 else
           "The filter is not adding expectancy: the unfiltered version is at "
           "least as good gross, on a much larger sample. On this evidence the "
           "trend confirmation is costing trades without buying accuracy.") + "\n")
    P.append(
        f"**A2 — did the structural stop do anything?** Holding the trade set "
        f"fixed and moving only the stop to just inside the broken range edge "
        f"gives {g2:+.3f}R gross and {n2:+.3f}R net, against the structural "
        f"stop's {g0:+.3f}R and {n0:+.3f}R. "
        + ("The structural stop is the better of the two." if n0 > n2 else
           "The range-edge stop is at least as good, which means the owner's "
           "stop rule is not where the difference lives.") + "\n")
    return "\n".join(P)


if __name__ == "__main__":
    raise SystemExit(main())
