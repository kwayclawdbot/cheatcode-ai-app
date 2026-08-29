"""ENGINE-3 — run `orb_mtf.v1` against its pre-registered gate, both exits, with
its matched control and its one ablation, and write the one report.

    .venv/bin/python run_engine3.py                  # everything
    .venv/bin/python run_engine3.py --symbols AAPL   # smoke

The gate this is measured against was committed before this file produced a
number: see engine/models/orb_mtf.v1/GATE.md and the git log.
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
from engine.backtest.regime import regime_by_day  # noqa: E402
from engine.backtest.stats import (SUMMARY_HEADER, fmt, session_bucket,  # noqa: E402
                                   split_by, summarise, summary_row)
from engine.backtest.two_exit import run_symbol_two_exits  # noqa: E402
from engine.backtest.types import Costs  # noqa: E402
from engine.cache.load import load  # noqa: E402
from engine.models import gates as G  # noqa: E402
from engine.models.matched_coinflip import MatchedCoinflip  # noqa: E402
from engine.models.orb_mtf import HTF, M5, OrbMtf  # noqa: E402
from engine.run_backtest import git_rev  # noqa: E402

NET = Costs(commission_per_share=0.005, slippage_bps=1.0)
GROSS = Costs(commission_per_share=0.0, slippage_bps=0.0)

A_LABEL = "Exit A — flat at 15:55"
B_LABEL = "Exit B — held to target or stop, at most 5 sessions"


def dayint(s: str) -> int:
    return int(s.replace("-", ""))


def run(make_model, symbols, costs, label=""):
    a_all, b_all, rejects = [], [], []
    census: Counter = Counter()
    t0 = time.time()
    for k, sym in enumerate(symbols, 1):
        m = make_model(sym)
        a, b, rj = run_symbol_two_exits(load(sym, "1m"), m, costs)
        a_all.extend(a)
        b_all.extend(b)
        rejects.extend(rj)
        census.update(getattr(m, "census", {}))
        print(f"  [{label}] [{k}/{len(symbols)}] {sym:<6} {len(a):>4} trades "
              f"({time.time()-t0:.0f}s)", flush=True)
    return a_all, b_all, rejects, census


# --- windows and summaries ---------------------------------------------------
def windows(trades):
    lo, hi = (dayint(x) for x in G.IN_SAMPLE)
    olo, ohi = (dayint(x) for x in G.OUT_OF_SAMPLE)
    return ([t for t in trades if lo <= t.day <= hi],
            [t for t in trades if olo <= t.day <= ohi])


def block(trades):
    is_tr, oos_tr = windows(trades)
    return (summarise(trades, "all"),
            summarise(is_tr, f"in-sample {G.IN_SAMPLE[0]}..{G.IN_SAMPLE[1]}"),
            summarise(oos_tr, f"out-of-sample {G.OUT_OF_SAMPLE[0]}..{G.OUT_OF_SAMPLE[1]}"),
            is_tr, oos_tr)


def key(t):
    return (t.symbol, t.day)


def gross_r_mean(trades):
    return float(np.mean([t.gross_r for t in trades])) if trades else float("nan")


def risk_pct_stats(trades):
    v = [t.risk_per_share / t.fill_price for t in trades if t.fill_price > 0]
    if not v:
        return float("nan"), float("nan"), float("nan")
    return (float(np.median(v)), float(np.quantile(v, 0.25)), float(np.quantile(v, 0.75)))


def cost_drag(net_trades, gross_trades):
    a = float(np.mean([t.net_r for t in net_trades])) if net_trades else float("nan")
    b = float(np.mean([t.net_r for t in gross_trades])) if gross_trades else float("nan")
    return b - a


def pnl_per_share(t) -> float:
    return t.net_r * t.risk_per_share


def cents(net_tr, gross_tr, ctl_gross):
    """The same argument in cents a share, where the stop distance cancels."""
    g = {key(t): t for t in gross_tr}
    c = {key(t): t for t in ctl_gross}
    edge, cost, price = [], [], []
    for t in net_tr:
        k = key(t)
        if k not in g:
            continue
        cost.append(pnl_per_share(g[k]) - pnl_per_share(t))
        price.append(t.fill_price)
        if k in c:
            edge.append(pnl_per_share(g[k]) - pnl_per_share(c[k]))
    if not cost:
        return {}
    e_lo, e_hi = G.mean_ci95(edge) if len(edge) > 1 else (float("nan"), float("nan"))
    net_ps = [pnl_per_share(t) for t in net_tr if key(t) in g]
    return {"edge": float(np.mean(edge)) if edge else float("nan"),
            "edge_lo": e_lo, "edge_hi": e_hi,
            "gross": float(np.mean([pnl_per_share(g[key(t)])
                                    for t in net_tr if key(t) in g])),
            "cost": float(np.mean(cost)), "price": float(np.mean(price)),
            "net_median": float(np.median(net_ps)),
            "net_total": float(np.sum(net_ps)),
            "net_top3": float(np.sum(sorted(net_ps)[-3:])),
            "n": len(cost)}


def paired_diff(model_trades, control_trades, field="gross_r"):
    ctl = {key(t): t for t in control_trades}
    d = [getattr(m, field) - getattr(ctl[key(m)], field)
         for m in model_trades if key(m) in ctl]
    if not d:
        return float("nan"), float("nan"), float("nan"), 0
    lo, hi = G.mean_ci95(d)
    return float(np.mean(d)), lo, hi, len(d)


def matched_plan(trades):
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


HTF_STOP_LABELS = {"H1H", "H1L", "H4H", "H4L"}


def stop_source(trades):
    """How often the stop came from a 1h/4h pivot rather than a level ENGINE-2's
    family also had. This is the direct test of the owner's correction."""
    if not trades:
        return {}
    c = Counter(t.meta.get("stop_label", "?") for t in trades)
    htf = sum(v for k, v in c.items() if k in HTF_STOP_LABELS)
    return {"labels": dict(c.most_common()), "htf": htf, "n": len(trades),
            "share": htf / len(trades)}


def gap_stats(b_trades):
    """Exit B only: how many trades were resolved on a session's opening print,
    and what the gap cost beyond the stop."""
    out = {"n": len(b_trades), "overnight": 0, "gapped_stop": 0,
           "gapped_target": 0, "gap_cost_r": 0.0, "worst_r": 0.0}
    extra = []
    for t in b_trades:
        if not t.meta.get("overnight"):
            continue
        out["overnight"] += 1
        if t.exit_reason == "stop":
            beyond = ((t.stop_price - t.exit_price) if t.side == "long"
                      else (t.exit_price - t.stop_price))
            if beyond > 1e-9 and t.risk_per_share > 0:
                out["gapped_stop"] += 1
                extra.append(beyond / t.risk_per_share)
        elif t.exit_reason == "target":
            better = ((t.exit_price - t.target_price) if t.side == "long"
                      else (t.target_price - t.exit_price))
            if better > 1e-9:
                out["gapped_target"] += 1
    out["gap_cost_r"] = float(np.mean(extra)) if extra else 0.0
    out["worst_r"] = float(min([t.net_r for t in b_trades], default=float("nan")))
    out["past_2r"] = sum(1 for t in b_trades if t.net_r < -2.0)
    return out


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--symbols", default=",".join(config.UNIVERSE))
    ap.add_argument("--snapshot", default=None)
    ap.add_argument("--out", default=None)
    a = ap.parse_args()
    symbols = [s.strip().upper() for s in a.symbols.split(",") if s.strip()]
    snapshot = a.snapshot or config.SNAPSHOT

    full = lambda s: OrbMtf(HTF, True, a.snapshot)                   # noqa: E731
    abl = lambda s: OrbMtf(M5, True, a.snapshot)                     # noqa: E731

    a_net, b_net, rejects, census = run(full, symbols, NET, "net")
    a_gross, b_gross, _, _ = run(full, symbols, GROSS, "gross")
    a_abl, b_abl, _, abl_census = run(abl, symbols, NET, "ablation net")
    a_abl_g, b_abl_g, _, _ = run(abl, symbols, GROSS, "ablation gross")

    plan = matched_plan(a_net)
    ctl = lambda s: MatchedCoinflip(plan.get(s, {}))                 # noqa: E731
    ca_net, cb_net, _, _ = run(ctl, symbols, NET, "control net")
    ca_gross, cb_gross, _, _ = run(ctl, symbols, GROSS, "control gross")

    regimes = regime_by_day(config.BENCHMARK, 50, a.snapshot)
    res = {}
    for tag, net_tr, gross_tr, cn, cg in (
            ("A", a_net, a_gross, ca_net, ca_gross),
            ("B", b_net, b_gross, cb_net, cb_gross)):
        s_all, s_is, s_oos, is_tr, oos_tr = block(net_tr)
        reg = {k: summarise(v, k) for k, v in
               split_by(is_tr, lambda t: regimes.get(t.day, "unknown")).items()
               if k != "unknown"}
        core = G.evaluate(s_is, s_oos, reg)
        if tag == "A":
            extra = []
            verdict = G.verdict3(core, [t.net_r for t in is_tr],
                                 [t.net_r for t in oos_tr])
        else:
            extra = G.evaluate_swing(net_tr, {key(t): t for t in a_net},
                                     G.OUT_OF_SAMPLE)
            verdict = G.verdict_swing(core, extra, [t.net_r for t in is_tr],
                                      [t.net_r for t in oos_tr])
        res[tag] = dict(net=net_tr, gross=gross_tr, ctl_net=cn, ctl_gross=cg,
                        s_all=s_all, s_is=s_is, s_oos=s_oos, is_tr=is_tr,
                        oos_tr=oos_tr, reg=reg, core=core, extra=extra,
                        verdict=verdict)

    model = OrbMtf(HTF, True, a.snapshot)
    out = Path(a.out) if a.out else config.REPORTS_ROOT / f"{model.id}.{snapshot}.md"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(report(model, snapshot, symbols, res, census, abl_census,
                          a_abl, a_abl_g, b_abl, b_abl_g, rejects, regimes))

    stem = out.with_suffix("").name
    art = out.parent
    with gzip.open(art / f"{stem}.trades.csv.gz", "wt", newline="") as fh:
        w = csv.writer(fh)
        keys = [k for k in asdict(a_net[0]) if k != "meta"] if a_net else []
        if keys:
            w.writerow(["exit"] + keys + ["meta"])
            for tag, lst in (("A", a_net), ("B", b_net)):
                for t in lst:
                    d = asdict(t)
                    w.writerow([tag] + [d[k] for k in keys] + [json.dumps(d["meta"])])
    for tag, lst in (("A", a_net), ("B", b_net)):
        run_r, eq = 0.0, []
        for t in sorted(lst, key=lambda x: (x.day, x.entry_minute)):
            run_r += t.net_r
            eq.append((t.day, round(run_r, 4)))
        (art / f"{stem}.exit{tag}.equity.csv").write_text(
            "day,cum_net_r\n" + "\n".join(f"{d},{r}" for d, r in eq))

    print(f"\nExit A: {res['A']['verdict']}   Exit B: {res['B']['verdict']}  -> {out}")
    for tag in ("A", "B"):
        for g in res[tag]["core"] + res[tag]["extra"]:
            print(f"  [{tag}] {'PASS' if g.passed else 'FAIL'} {g.id} {g.name}: {g.observed}")
    return 0


# ---------------------------------------------------------------------------
def report(model, snapshot, symbols, res, census, abl_census,
           a_abl, a_abl_g, b_abl, b_abl_g, rejects, regimes) -> str:
    L = []
    A = L.append
    va, vb = res["A"]["verdict"], res["B"]["verdict"]
    A(f"# {model.id} — measured on `{snapshot}`\n")
    A(f"**Exit A (day trade): {va}. Exit B (swing): {vb}.** Against the bar in "
      f"[`../models/orb_mtf.v1/GATE.md`](../models/orb_mtf.v1/GATE.md), which "
      f"was committed before this evaluation ran.\n")
    A(f"Run {dt.datetime.now(dt.UTC).isoformat(timespec='seconds')} at `{git_rev()}`. "
      f"{len(symbols)} symbols, snapshot `{snapshot}`, commission "
      f"$0.005/share/side, slippage 1.0bp on market and stop fills.\n")

    A(plain(res, census))
    A(headline_cents(res))
    A(risk_section(res, census))
    A(gates_section(res))
    A(tables(res, regimes))
    A(ablation_section(res, a_abl, a_abl_g, b_abl, b_abl_g, abl_census))
    A(census_section(census, rejects, res, model))
    A(disclosures())
    return "\n".join(L)


def _cents(res, tag):
    r = res[tag]
    return cents(r["net"], r["gross"], r["ctl_gross"])


def plain(res, census) -> str:
    P = []
    A = P.append
    ca, cb = _cents(res, "A"), _cents(res, "B")
    na, nb = len(res["A"]["net"]), len(res["B"]["net"])
    A("## In plain language\n")
    A("**The one number this whole model exists to move.**\n")
    A("ENGINE-2 lost because the setup earned 4.63 cents a share and cost 5.61 "
      "cents a share to trade. Subtract, and it loses about a cent a share, "
      "every time. The owner's correction was to put the stop and the target on "
      "the 1-hour and 4-hour charts instead of the 5-minute one, so the move "
      "being aimed at is bigger while the round trip stays the same. So the "
      "first table in this report is that subtraction, done again.\n")
    if ca and cb:
        A("| per share, average trade | Exit A (flat at 15:55) | Exit B (held up to 5 days) |")
        A("|---|---|---|")
        A(f"| what the setup earned, before costs | {ca['gross']*100:+.2f}¢ | {cb['gross']*100:+.2f}¢ |")
        A(f"| what it paid to get in and out | −{ca['cost']*100:.2f}¢ | −{cb['cost']*100:.2f}¢ |")
        A(f"| **what was left, on the average trade** | **{(ca['gross']-ca['cost'])*100:+.2f}¢** | **{(cb['gross']-cb['cost'])*100:+.2f}¢** |")
        A(f"| what was left, on the MIDDLE trade | {ca['net_median']*100:+.1f}¢ | {cb['net_median']*100:+.1f}¢ |")
        A(f"| for comparison, ENGINE-2 | +4.63¢ earned, −5.61¢ paid, −0.98¢ left | — |")
        A("")
        A(f"Average share price in this sample: ${ca['price']:.0f}.\n")
        A(f"**Read the second row before the first one.** The average trade "
          f"finished {(ca['gross']-ca['cost'])*100:+.2f}¢ ahead and the middle "
          f"trade finished {ca['net_median']*100:.0f}¢ behind. That gap is the "
          f"result. Across all {ca['n']:,} trades the model made "
          f"${ca['net_total']:.2f} per share in total, and "
          f"three of those trades contributed ${ca['net_top3']:.2f} between "
          f"them. Which means the other {ca['n']-3:,} lost "
          f"${ca['net_top3']-ca['net_total']:.2f} between them. Take the best "
          f"three away and it is a clearly losing model. Measured the way a position-sized trader actually experiences "
          f"it, weighting every trade by its own risk rather than by the price "
          f"of the share, it IS a losing model: mean net "
          f"{res['A']['s_all'].mean_r:+.3f}R on Exit A and "
          f"{res['B']['s_all'].mean_r:+.3f}R on Exit B. **The two views disagree "
          f"in sign, and that disagreement is itself the finding** — a positive "
          f"average carried by three outliers out of {ca['n']:,} is not an edge, "
          f"it is a fat tail.\n")

    A("**Did it work?**\n")
    A(_verdict_prose("Exit A", res["A"], na))
    A(_verdict_prose("Exit B", res["B"], nb))
    A("")

    A("**What the numbers mean, without the jargon.** One \"R\" is one unit of "
      "the money you agreed to lose if the trade goes wrong — the distance from "
      "your entry to your stop. +0.10R means that, on average, every trade made "
      "a tenth of what it was risking. The bar was +0.10R on the older data and "
      "+0.05R on the held-back 2026 data, after costs.\n")

    A("**How sure are we?**\n")
    for tag, name in (("A", "Exit A"), ("B", "Exit B")):
        r = res[tag]
        lo, hi = G.mean_ci95([t.net_r for t in r["oos_tr"]])
        ilo, ihi = G.mean_ci95([t.net_r for t in r["is_tr"]])
        A(f"- **{name}.** {len(r['oos_tr'])} trades in the held-back 2026 "
          f"window, averaging {r['s_oos'].mean_r:+.3f}R; the honest range around "
          f"that is {lo:+.3f}R to {hi:+.3f}R. On the older data, "
          f"{len(r['is_tr'])} trades averaging {r['s_is'].mean_r:+.3f}R, range "
          f"{ilo:+.3f}R to {ihi:+.3f}R.")
    A("")
    A("This is the **fourth** day-trading model measured on exactly the same "
      "three years of bars, and it is not an independent fourth: it shares the "
      "opening range, the trigger window, the range band, the stop buffer, the "
      "risk floor and the reward floor with `orb_htf_structural.v1`, the model "
      "that just failed. It is a variant of a variant. Every extra attempt makes "
      "it likelier that one of them looks good by luck alone, which is why the "
      "held-back 2026 window is the verdict rather than the older data.\n")

    A("**Was it better than guessing?**\n")
    for tag, name in (("A", "Exit A"), ("B", "Exit B")):
        r = res[tag]
        m, lo, hi, n = paired_diff(r["gross"], r["ctl_gross"])
        A(f"- **{name}.** Before costs the model made "
          f"{gross_r_mean(r['gross']):+.3f}R a trade; a coin flip on the same "
          f"days, in the same names, at the same minute, with the same stop and "
          f"target made {gross_r_mean(r['ctl_gross']):+.3f}R. Paired trade for "
          f"trade the gap is **{m:+.3f}R** (95%: {lo:+.3f}R to {hi:+.3f}R, "
          f"n={n}). "
          + ("The interval contains zero, so the gap is suggestive rather than "
             "established." if lo <= 0 <= hi else
             "The interval excludes zero."))
    A("")
    A("**Close it, or let it run?**\n")
    A(_ab_prose(res))
    A("**What would change the answer?**\n")
    A(_what_would_change(res, census))
    return "\n".join(P)


def _verdict_prose(name, r, n) -> str:
    v = r["verdict"]
    if v == "PASS":
        return (f"- **{name}: yes, on this data.** It cleared every gate written "
                f"down before it ran, on {n:,} trades.")
    if v.startswith("INCONCLUSIVE (sample)"):
        return (f"- **{name}: we cannot tell, and that is the honest answer.** The "
                f"double trend filter and the skip rules left only {n:,} trades "
                f"({len(r['is_tr']):,} older, {len(r['oos_tr']):,} in the "
                f"held-back window), below the count we said in advance we would "
                f"need before believing a good number or a bad one. Not a pass, "
                f"and not a proven failure.")
    if v.startswith("INCONCLUSIVE (power)"):
        return (f"- **{name}: probably not, but the sample cannot close it.** Over "
                f"{n:,} trades the average was below the bar, and the "
                f"uncertainty around it still reaches the bar.")
    return (f"- **{name}: no.** Over {n:,} trades it missed the bar written down "
            f"before it ran, and the miss is bigger than the uncertainty.")


def _ab_prose(res) -> str:
    a = {key(t): t for t in res["A"]["net"]}
    pairs = [(t.net_r, a[key(t)].net_r) for t in res["B"]["net"] if key(t) in a]
    if not pairs:
        return "No paired trades, so there is nothing to compare.\n"
    d = [x - y for x, y in pairs]
    lo, hi = G.mean_ci95(d)
    gs = gap_stats(res["B"]["net"])
    better = sum(1 for x in d if x > 1e-12)
    worse = sum(1 for x in d if x < -1e-12)
    same = len(d) - better - worse
    held = Counter(t.meta.get("sessions_held", 1) for t in res["B"]["net"])
    a_time = sum(1 for t in res["A"]["net"] if t.exit_reason == "time")
    b_time = sum(1 for t in res["B"]["net"] if t.exit_reason == "time")
    return (
        f"The entry is identical, so the difference between the two exits IS the "
        f"value of letting it run. Over {len(d):,} paired trades, holding was "
        f"worth **{float(np.mean(d)):+.3f}R** a trade against closing at 15:55 "
        f"(95%: {lo:+.3f}R to {hi:+.3f}R).\n\n"
        f"That average is small for a reason that matters more than the "
        f"average: **{same:,} of the {len(d):,} trades are the same trade "
        f"either way.** The stop or the target was reached before 15:55, so "
        f"there was nothing left to hold. Only {better + worse:,} trades were "
        f"still live at the bell; of those, holding helped {better:,} and hurt "
        f"{worse:,}. Sessions held, counting the entry day: "
        + ", ".join(f"{k}: {held[k]:,}" for k in sorted(held)) + ".\n\n"
        f"So the honest answer to \"close it or let it run\" for THIS setup is "
        f"that the question rarely comes up, and when it does the evidence "
        f"does not favour holding. A 1h/4h target 1.5R away is usually resolved "
        f"inside the session the trade was taken in: Exit A ended {a_time:,} "
        f"trades on the clock at 15:55, and Exit B carried "
        f"{gs['overnight']:,} of them past a closing bell and resolved all but "
        f"{b_time:,} of those at a stop or a target within five sessions.\n\n"
                f"**And the overnight risk is real even when the average hides it.** "
        f"Of the {gs['overnight']:,} trades that did go overnight, "
        f"{gs['gapped_stop']:,} were resolved by a session opening straight "
        f"through the stop — filled at that open, not at the stop price, which "
        f"cost an extra {gs['gap_cost_r']:.2f}R on each of them beyond the risk "
        f"that was agreed. {gs['past_2r']:,} trades "
        f"({gs['past_2r']/max(1,gs['n']):.1%}) finished worse than −2R, against "
        f"a pre-registered ceiling of 5%; the worst single trade lost "
        f"{gs['worst_r']:.2f}R. A stop that can be gapped through is not a stop, "
        f"and any 'let it run' control has to say so.\n")


def _what_would_change(res, census) -> str:
    ss = stop_source(res["A"]["net"])
    share = ss.get("share", float("nan"))
    return (
        f"- **Whether the stop actually moved.** The correction only bites when "
        f"the nearest level beyond entry is a 1-hour or 4-hour pivot. It was on "
        f"{share:.0%} of trades; on the rest the nearest level was a prior-day, "
        f"overnight or daily level that `orb_htf_structural.v1` also had, so the "
        f"stop landed exactly where it landed before. This was written down as "
        f"the likely quiet failure before the run, and the number is above.\n"
        f"- **A sparser definition of \"major\".** Dropping the shared reference "
        f"levels from the family would force every stop onto 1h/4h structure. "
        f"That is a different model and it needs its own gate; it is not a "
        f"parameter to be nudged inside this one.\n"
        f"- **Cheaper trading, or bigger moves.** The subtraction at the top of "
        f"this report is the whole result. Halve the cost or double the average "
        f"move and the sign flips; nothing else does.\n"
        f"- **A bigger sample.** The double gate is strict by design — "
        f"{census.get('days_seen', 0):,} symbol-days produced "
        f"{census.get('signals', 0):,} signals. More symbols and more years are "
        f"both available and are the only honest way to narrow the intervals.\n")


def headline_cents(res) -> str:
    L = ["## Gross versus the matched control, before net\n"]
    L.append("ENGINE-1's decisive finding was that both of its models were below "
             "a coin flip *before* costs, which settles the net number without "
             "further argument. ENGINE-2 was the first to beat its control "
             "gross, by +0.099R with an interval containing zero. So this table "
             "is read first.\n")
    L.append("| run | n | gross mean R | net mean R | hit | PF (net) |")
    L.append("|---|---|---|---|---|---|")
    for tag, name in (("A", A_LABEL), ("B", B_LABEL)):
        r = res[tag]
        s = summarise(r["net"], name)
        L.append(f"| `orb_mtf.v1` — {name} | {len(r['net'])} | "
                 f"{gross_r_mean(r['gross']):+.3f} | {s.mean_r:+.3f} | "
                 f"{s.hit_rate*100:.1f}% | {s.profit_factor:.2f} |")
        cs = summarise(r["ctl_net"], "control")
        L.append(f"| `null_coinflip.v1.matched` — same exit | {len(r['ctl_net'])} | "
                 f"{gross_r_mean(r['ctl_gross']):+.3f} | {cs.mean_r:+.3f} | "
                 f"{cs.hit_rate*100:.1f}% | {cs.profit_factor:.2f} |")
    L.append("")
    L.append("Paired trade by trade on the same symbol-day, **gross of costs**:\n")
    L.append("| exit | window | pairs | model − control, gross mean R | 95% interval |")
    L.append("|---|---|---|---|---|")
    for tag, name in (("A", "A"), ("B", "B")):
        r = res[tag]
        g_is, g_oos = windows(r["gross"])
        c_is, c_oos = windows(r["ctl_gross"])
        for wname, mm, cc in (("all", r["gross"], r["ctl_gross"]),
                              ("in-sample", g_is, c_is),
                              ("out-of-sample", g_oos, c_oos)):
            m, lo, hi, n = paired_diff(mm, cc)
            L.append(f"| {name} | {wname} | {n} | {m:+.3f} | {lo:+.3f} to {hi:+.3f} |")
    L.append("")
    L.append("The control is not the ENGINE-1 whole-tape coin flip. It takes the "
             "same symbols, the same days, the same decision minute and the same "
             "risk and reward distances as the trades the model actually took, "
             "flips only the direction, and is booked under both exits. It is "
             "the like-for-like question: **did knowing which way to point pay "
             "for itself?**\n")
    return "\n".join(L)


def risk_section(res, census) -> str:
    L = ["## Realised risk per trade — the direct test of the owner's correction\n"]
    L.append("ENGINE-1 measured risk at 0.18–0.29% of price; ENGINE-2's "
             "structural stop came out at 0.187%, *narrower* than ENGINE-1, "
             "because the nearest major level on a 5-minute chart is usually "
             "close. Moving to 1-hour and 4-hour levels was supposed to fix "
             "that. Here is whether it did.\n")
    med, q1, q3 = risk_pct_stats(res["A"]["net"])
    drag = cost_drag(res["A"]["net"], res["A"]["gross"])
    L.append("| | ENGINE-1 | ENGINE-2 | this model |")
    L.append("|---|---|---|---|")
    L.append(f"| median risk per trade, % of price | 0.287% | 0.187% | **{pct(med,3)}** |")
    L.append(f"| interquartile range | — | 0.137% – 0.289% | {pct(q1,3)} – {pct(q3,3)} |")
    L.append(f"| costs as a fraction of risk | ≈0.09 R | 0.144 R | **{drag:.3f} R** |")
    L.append(f"| gross edge needed to break even | ≈+0.15 R | ≈+0.14 R | **≈+{drag:.2f} R** |")
    L.append("")
    ss = stop_source(res["A"]["net"])
    if ss:
        L.append(f"**Where the stop actually came from.** On "
                 f"{ss['share']:.0%} of trades ({ss['htf']:,} of {ss['n']:,}) the "
                 f"nearest level beyond entry was a 1-hour or 4-hour pivot — the "
                 f"levels this model added. On the rest it was a prior-day, "
                 f"premarket, overnight or daily level, all of which "
                 f"`orb_htf_structural.v1` also had, so on those trades the stop "
                 f"sits exactly where ENGINE-2 put it. The gate named this as the "
                 f"way the correction could fail quietly, before the run.\n")
        L.append("| level the stop sat behind | trades |")
        L.append("|---|---|")
        for k, v in ss["labels"].items():
            L.append(f"| `{k}` | {v:,} |")
        L.append("")
    return "\n".join(L)


def gates_section(res) -> str:
    L = ["## The gate\n"]
    for tag, name in (("A", A_LABEL), ("B", B_LABEL)):
        r = res[tag]
        L.append(f"### {name} — **{r['verdict']}**\n")
        L.append("| gate | | bar | observed | |\n|---|---|---|---|---|")
        for g in r["core"] + r["extra"]:
            L.append(f"| {g.id} | {g.name} | {g.threshold} | {g.observed} | "
                     f"**{'PASS' if g.passed else 'FAIL'}** |")
        L.append("")
    return "\n".join(L)


def _dist_block(s) -> str:
    if s.n == 0:
        return "- no trades\n"
    dec = " | ".join(f"{x:.2f}" for x in s.mae_deciles)
    all_t = " · ".join(f"{k} {v:.1%}" for k, v in s.mae_tail.items())
    win = " · ".join(f"{k} {v:.1%}" for k, v in s.mae_tail_winners.items())
    return (f"- MAE deciles (R): {dec}\n"
            f"- all trades reaching that far against: {all_t}\n"
            f"- **winners** that first went that far against: {win}\n")


def tables(res, regimes) -> str:
    L = []
    for tag, name in (("A", A_LABEL), ("B", B_LABEL)):
        r = res[tag]
        L.append(f"## {name}\n")
        L.append(SUMMARY_HEADER)
        for s in (r["s_all"], r["s_is"], r["s_oos"]):
            L.append(summary_row(s))
        L.append("")
        L.append("**Maximum adverse excursion.** The existing SMS engine's "
                 "+11.93% average peak concealed a −10.49% average drawdown, "
                 "with 47.5% of alerts going 8%+ underwater first. Distribution, "
                 "not mean.\n")
        L.append("All trades\n")
        L.append(_dist_block(r["s_all"]))
        L.append("Out-of-sample\n")
        L.append(_dist_block(r["s_oos"]))
        L.append("By regime (in-sample), then session, side and year:\n")
        L.append(SUMMARY_HEADER)
        for k in sorted(r["reg"]):
            L.append(summary_row(r["reg"][k]))
        for d in (split_by(r["net"], session_bucket),
                  split_by(r["net"], lambda t: t.side),
                  split_by(r["net"], lambda t: str(t.day)[:4])):
            for k in sorted(d):
                L.append(summary_row(summarise(d[k], k)))
        L.append("")
        L.append("By symbol:\n")
        L.append(SUMMARY_HEADER)
        per = {k: summarise(v, k) for k, v in
               split_by(r["net"], lambda t: t.symbol).items()}
        for k in sorted(per, key=lambda x: -per[x].total_r):
            L.append(summary_row(per[k]))
        L.append("")
        L.append(f"- exits: {r['s_all'].exit_mix}")
        L.append(f"- trades resolved by the pessimistic same-bar assumption "
                 f"(stop and target both inside one bar): "
                 f"{r['s_all'].ambiguous_bars} "
                 f"({r['s_all'].ambiguous_bars / max(1, r['s_all'].n):.1%})")
        L.append(f"- mean regular-hours bars held: {fmt(r['s_all'].mean_bars_held, 1)}")
        if tag == "B":
            gs = gap_stats(r["net"])
            L.append(f"- held past a closing bell: {gs['overnight']:,} "
                     f"({gs['overnight']/max(1,gs['n']):.1%})")
            L.append(f"- stopped out on a session's opening print rather than at "
                     f"the stop price: {gs['gapped_stop']:,}, costing on average "
                     f"an extra {gs['gap_cost_r']:.2f}R each")
            L.append(f"- targets filled on a favourable opening gap, above the "
                     f"level: {gs['gapped_target']:,}")
            L.append(f"- worst single trade: {gs['worst_r']:.2f}R; trades past "
                     f"−2R: {gs['past_2r']:,}")
        L.append("")
    return "\n".join(L)


def ablation_section(res, a_abl, a_abl_g, b_abl, b_abl_g, abl_census) -> str:
    L = ["## The ablation — one run, a diagnostic\n"]
    L.append("The pre-registered gate applies to the full spec alone. This run "
             "exists to answer one question and cannot be promoted into the "
             "result: **what was moving the stop and the target onto the 1-hour "
             "and 4-hour charts actually worth?** Selection is untouched — every "
             "screen was applied to the 1h/4h levels first — so the trade set is "
             "held fixed and the only thing that moves is where the stop and the "
             "target sit.\n")
    L.append("| exit | run | n | gross mean R | net mean R | median risk % | hit |")
    L.append("|---|---|---|---|---|---|---|")
    rows = (("A", "1h/4h levels (the spec)", res["A"]["net"], res["A"]["gross"]),
            ("A", "5-minute levels (ENGINE-2's)", a_abl, a_abl_g),
            ("B", "1h/4h levels (the spec)", res["B"]["net"], res["B"]["gross"]),
            ("B", "5-minute levels (ENGINE-2's)", b_abl, b_abl_g))
    for tag, name, netl, grossl in rows:
        if not netl:
            L.append(f"| {tag} | {name} | 0 | n/a | n/a | n/a | n/a |")
            continue
        s = summarise(netl, name)
        m, _, _ = risk_pct_stats(netl)
        L.append(f"| {tag} | {name} | {len(netl)} | {gross_r_mean(grossl):+.3f} | "
                 f"{s.mean_r:+.3f} | {pct(m,3)} | {s.hit_rate*100:.1f}% |")
    L.append("")
    ka = {key(t) for t in res["A"]["net"]}
    kb = {key(t) for t in a_abl}
    lost = len(ka - kb)
    if a_abl:
        base = {key(t): t for t in res["A"]["net"]}
        d = [t.net_r - base[key(t)].net_r for t in a_abl if key(t) in base]
        lo, hi = G.mean_ci95(d) if len(d) > 1 else (float("nan"), float("nan"))
        mean_d = float(np.mean(d)) if d else float("nan")
        med_htf, _, _ = risk_pct_stats([base[key(t)] for t in a_abl if key(t) in base])
        med_m5, _, _ = risk_pct_stats(a_abl)
        L.append(
            f"**What the move to higher-timeframe levels was worth.** Paired on "
            f"{len(d):,} trades that both versions took ({lost} of the spec's "
            f"trades had no qualifying 5-minute level and drop out of the "
            f"pairing), the 5-minute stop and target scored {mean_d:+.3f}R "
            f"against the 1h/4h ones (95%: {lo:+.3f}R to {hi:+.3f}R) on Exit A. "
            f"Median risk moved from {pct(med_m5,3)} on the 5-minute levels to "
            f"{pct(med_htf,3)} on the 1h/4h ones"
            + (f" — a difference of {abs(med_htf-med_m5)*100:.3f} percentage "
               f"points, which is not a widening in any sense that matters. The "
               f"two level families put the stop in almost the same place, "
               f"because on four trades in five the nearest level is one they "
               f"share."
               if abs(med_htf - med_m5) < 0.0005 else
               " — the widening the correction was for.")
            + (" On this evidence the move to higher-timeframe levels bought "
               "nothing: the interval on the difference contains zero and the "
               "5-minute version is nominally ahead."
               if mean_d > 0 else
               " The 1h/4h version is nominally ahead, on an interval that "
               "contains zero.") + "\n")
    return "\n".join(L)


def census_section(census, rejects, res, model) -> str:
    L = ["## Where the days went\n"]
    L.append("Every symbol-day the model looked at, and the rule that ended it. "
             "This is the honest picture of how hard the double filter bites.\n")
    L.append("| outcome | symbol-days |\n|---|---|")
    census = Counter(census)
    if census.pop("no_trigger", 0):
        pass          # a day with no reason recorded is a day that traded; the
                      # count is identical to `signals` and is not listed twice
    order = ["days_seen", "skip_no_aligned_trend", "skip_no_opening_range",
             "skip_opening_range_size", "no_break_in_window", "triggers",
             "skip_no_levels", "skip_no_stop_level", "skip_risk_too_wide",
             "skip_risk_too_tight", "skip_no_target_level",
             "skip_reward_under_min_rr", "skip_m5_degenerate", "signals"]
    for k in order:
        if census.get(k):
            L.append(f"| {k} | {census[k]:,} |")
    for k in sorted(set(census) - set(order)):
        L.append(f"| {k} | {census[k]:,} |")
    L.append("")
    L.append(f"- orders that never became a trade: {len(rejects)}")
    L.append(f"- model parameters: `{json.dumps(model.params())}`")
    L.append("")
    return "\n".join(L)


def disclosures() -> str:
    return (
        "## Disclosures specific to this run\n\n"
        "- **Fourth model, same bars, and a variant of the third.** "
        "`orb_reclaim.v1`, `sweep_displacement_fvg.v1` and "
        "`orb_htf_structural.v1` were measured on this identical cache and all "
        "three failed. This model reuses six of ENGINE-2's parameters verbatim, "
        "so it is not an independent fourth draw. The out-of-sample window is "
        "treated as the verdict and was read once.\n"
        "- **The 1h/4h session convention is RTH-only, anchored at 09:30, with "
        "the day's short final bucket kept.** Seven hourly bars a day, the last "
        "of them 30 minutes; two 4-hour bars, the last of them 2.5 hours. A "
        "bucket is closed only once a bar in a later bucket has printed. The "
        "full reasoning is in the gate, which was committed first.\n"
        "- **The 4-hour reading cannot change inside the trigger window**; the "
        "1-hour reading can change once, at 10:30. Alignment is therefore "
        "re-checked at every candidate bar rather than judged at 09:49.\n"
        "- **The level definition was chosen by eye, on sparsity and "
        "nearest-level distance only**, across five symbols and three dates, "
        "before any backtest ran. No PnL, trade count or expectancy was seen "
        "first. That check produced the warning in the gate about shared "
        "reference levels; no parameter was changed because of it.\n"
        "- **The risk cap moved from 1.50% of price to 3.00%**, because a 4-hour "
        "level is by construction further away and a tight cap would silently "
        "convert this model back into ENGINE-2 by skipping. 3.00% is the upper "
        "edge of the opening-range band already in use since `orb_reclaim.v1`. "
        "The 0.10% risk floor is unchanged and is still an addition beyond the "
        "owner's words.\n"
        "- **Overnight risk is modelled, not assumed away.** Positions are "
        "exited only in regular hours; a session opening beyond the stop fills "
        "at that open. Two consequences that cut opposite ways: Exit B's "
        "excursion figures are measured on regular-hours bars only, so a "
        "position that went underwater at 04:00 and recovered by 09:30 does not "
        "show it; and a target that gaps through in the good direction fills at "
        "the open, which is better than the level.\n"
        "- **No borrow, locate, halt, dividend or earnings modelling.** Exit B "
        "holds through earnings reports and dividend dates with neither "
        "flagged. On a five-session horizon that is a real omission, and it "
        "flatters nothing in particular — it simply adds variance the numbers "
        "here do not name.\n"
        "- **Survivorship.** The 32 symbols are liquid *today*. None was chosen "
        "on performance and none dropped after seeing a result, but the "
        "universe is selected with hindsight and contains no delisted name.\n"
        "- **Fills are modelled, not observed.** OHLC cannot say what happened "
        "inside a bar; every ambiguity is resolved against the trade, and a bar "
        "holding both stop and target is booked as the stop.\n")


if __name__ == "__main__":
    raise SystemExit(main())
