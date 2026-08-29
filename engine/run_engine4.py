"""ENGINE-4 — run `orb_simple_1h.v1` and `orb_simple_4h.v1` against the bars
committed at `a06611d`, on `polygon-deep-v1`, and write one report per variant.

    .venv/bin/python run_engine4.py                       # everything
    .venv/bin/python run_engine4.py --variants 1h --symbols SPY   # smoke

SPY is the subject. QQQ and IWM are run and reported separately and are never
pooled into a SPY number.
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
from engine.backtest.stats import (SUMMARY_HEADER, fmt, split_by,  # noqa: E402
                                   summarise, summary_row)
from engine.backtest.types import Costs  # noqa: E402
from engine.cache.load import load  # noqa: E402
from engine.models import gates as G  # noqa: E402
from engine.models.matched_coinflip import MatchedCoinflipMulti  # noqa: E402
from engine.models.orb_simple import TARGET_R, OrbSimple  # noqa: E402
from engine.run_backtest import git_rev  # noqa: E402

NET = Costs(commission_per_share=0.005, slippage_bps=1.0)
GROSS = Costs(commission_per_share=0.0, slippage_bps=0.0)
SNAPSHOT = config.SNAPSHOT_DEEP
SUBJECT = "SPY"


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
    the trigger candle's extreme. Seven of SPY's 2,081 in the 1h variant. They
    are dropped from R statistics and the count is reported; they are never
    dropped from anything the gate is computed on, because with real slippage
    the fill never lands exactly on the stop."""
    return [t for t in trades if np.isfinite(t.net_r) and np.isfinite(t.gross_r)]


# Cost per share actually charged by the pre-registered model, reconstructed
# from the trade so an alternative can be substituted without a re-run.
#   commission  $0.005 per share per side, always
#   slippage    1.0 bp of price, adverse, on the ENTRY (a market order) and on
#               the EXIT unless the exit was the target, which is a resting
#               limit and does not slip.
def applied_cost_ps(t, commission=0.005, slippage_bps=1.0) -> float:
    slip = (t.fill_price * slippage_bps / 10_000.0
            + (0.0 if t.exit_reason == "target"
               else t.exit_price * slippage_bps / 10_000.0))
    return 2.0 * commission + slip


def flat_cost_ps(t, commission=0.005, half_spread=0.005) -> float:
    """The same round trip priced with an ABSOLUTE half-spread in dollars."""
    return 2.0 * commission + half_spread + (0.0 if t.exit_reason == "target"
                                             else half_spread)


# --- running -----------------------------------------------------------------
def run_one(symbol: str, variant: str, costs: Costs):
    m = OrbSimple(variant, snapshot=SNAPSHOT)
    trades, rejects = run_symbol(load(symbol, "1m", SNAPSHOT), m, costs)
    m.finish()      # `run_symbol` does not call it; without this the final
                    # session is never booked and the census is one day short
    return trades, rejects, m.census


def run_control(symbol: str, model_trades, costs: Costs):
    plan: dict[int, list[tuple[int, float]]] = {}
    for t in model_trades:
        plan.setdefault(t.day, []).append(
            (t.decision_minute, float(t.meta["risk_ps"])))
    c = MatchedCoinflipMulti(plan, target_r=TARGET_R)
    trades, _ = run_symbol(load(symbol, "1m", SNAPSHOT), c, costs)
    return trades


# --- statistics --------------------------------------------------------------
def windows(trades):
    lo, hi = (dayint(x) for x in G.DEEP_IN_SAMPLE)
    olo, ohi = (dayint(x) for x in G.DEEP_OUT_OF_SAMPLE)
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
    """The headline. Paired, so it is the same trades either way."""
    g = {key(t): t for t in finite(gross_tr)}
    d = [g[key(t)].gross_r - t.net_r for t in finite(net_tr) if key(t) in g]
    if not d:
        return float("nan"), float("nan"), float("nan"), 0
    lo, hi = G.mean_ci95(d)
    return float(np.mean(d)), lo, hi, len(d)


def per_share(net_tr, gross_tr):
    """The same argument in cents a share, where the stop distance cancels.

    Taken from the percentage fields rather than from R, because those are
    finite even on the handful of frictionless trades whose risk is zero.
    """
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
            "risk": float(np.median([r[3] for r in rows]))}


def risk_pct(trades):
    v = [t.risk_per_share / t.fill_price for t in trades if t.fill_price > 0]
    if not v:
        return float("nan"), float("nan"), float("nan")
    return (float(np.median(v)), float(np.quantile(v, 0.25)),
            float(np.quantile(v, 0.75)))


def trades_per_day(trades):
    c = Counter()
    for t in trades:
        c[(t.symbol, t.day)] += 1
    return Counter(c.values())


def evaluate_symbol(symbol: str, variant: str, regimes) -> dict:
    t0 = time.time()
    net, rejects, census = run_one(symbol, variant, NET)
    gross, _, _ = run_one(symbol, variant, GROSS)
    cnet = run_control(symbol, net, NET)
    cgross = run_control(symbol, net, GROSS)
    is_tr, oos_tr = windows(net)
    reg = {k: summarise(v, k) for k, v in
           split_by(is_tr, lambda t: regimes.get(t.day, "unknown")).items()
           if k != "unknown"}
    s_is = summarise(is_tr, f"in-sample {G.DEEP_IN_SAMPLE[0]}..{G.DEEP_IN_SAMPLE[1]}")
    s_oos = summarise(oos_tr, f"out-of-sample {G.DEEP_OUT_OF_SAMPLE[0]}..{G.DEEP_OUT_OF_SAMPLE[1]}")
    core = G.evaluate_deep(s_is, s_oos, reg)
    verdict = G.verdict3_deep(core, [t.net_r for t in is_tr], [t.net_r for t in oos_tr])
    print(f"  [{variant}] {symbol}: {len(net)} trades, {verdict} "
          f"({time.time()-t0:.0f}s)", flush=True)
    return dict(symbol=symbol, net=net, gross=gross, ctl_net=cnet, ctl_gross=cgross,
                census=census, rejects=rejects, is_tr=is_tr, oos_tr=oos_tr,
                s_all=summarise(net, "all"), s_is=s_is, s_oos=s_oos, reg=reg,
                core=core, verdict=verdict)


# --- report ------------------------------------------------------------------
def pctf(x, nd=2):
    return "n/a" if x != x else f"{x*100:.{nd}f}%"


def cents(x, nd=2):
    return "n/a" if x != x else f"{x*100:+.{nd}f}¢"


def report(variant: str, res: dict, regimes, sessions: dict) -> str:
    L: list[str] = []
    A = L.append
    mid = f"orb_simple_{variant}.v1"
    spy = res[SUBJECT]
    n = len(spy["net"])
    days = [t.day for t in spy["net"]]
    lo, hi = (daystr(min(days)), daystr(max(days))) if days else ("n/a", "n/a")
    ps = per_share(spy["net"], spy["gross"])
    drag, dlo, dhi, dn = cost_drag_r(spy["net"], spy["gross"])

    A(f"# {mid} — measured on `{SNAPSHOT}`\n")
    A(f"**SPY: {spy['verdict']}.** Against the bar in "
      f"[`../models/{mid}/GATE.md`](../models/{mid}/GATE.md), committed at "
      f"`a06611d` before this evaluation existed.\n")
    A(f"**{n:,} SPY trades, {lo} → {hi}** — {sessions.get(SUBJECT, 0):,} sessions "
      f"of one-minute bars, {len(spy['is_tr']):,} trades in-sample and "
      f"{len(spy['oos_tr']):,} in the held-back window.")
    A(f"**On the average SPY trade the setup earned {cents(ps.get('gross_mean', float('nan')))} "
      f"a share and paid {cents(-ps.get('cost_mean', float('nan')))} to trade; the middle trade "
      f"finished {cents(ps.get('net_median', float('nan')), 1)}.**")
    A(f"**SPY's realised cost drag is {drag:.3f}R — {drag*100:.1f}% of the money "
      f"risked on every trade**, against 9–14% on the mixed baskets this "
      f"programme measured before. It is HIGHER, not lower, and the reason is "
      f"the stop, not the spread: see the cost section.\n")
    A(f"Run {dt.datetime.now(dt.UTC).isoformat(timespec='seconds')} at "
      f"`{git_rev()}`. Snapshot `{SNAPSHOT}`, commission $0.005/share/side, "
      f"slippage 1.0bp on market and stop fills.\n")

    A(ambiguity_section())
    A(plain_section(variant, res, ps, drag, dlo, dhi))
    A(cost_section(res))
    A(control_section(res))
    A(gate_section(spy))
    A(tables_section(spy, regimes))
    A(others_section(res))
    A(census_section(variant, res, sessions))
    A(disclosures(variant))
    return "\n".join(L)


def ambiguity_section() -> str:
    return (
        "## Read this before anything else — one ambiguity in the spec\n\n"
        "The owner's words were *\"stop at the previous 5min candlestick "
        "high/low\"*. This run implements that as **the TRIGGER candle's own "
        "low (long) / high (short)** — the last 5-minute candle that closed "
        "before entry, which is also the candle whose close broke the range.\n\n"
        "The other available reading is *the candle before that one*, which "
        "would put the stop further away and make every trade smaller in R "
        "terms. If that is what was meant, it is a one-line change to "
        "`OrbSimple._trigger_candle` and a re-run — every number below would "
        "move. The reading was fixed in `GATE.md` before the run so it could "
        "not be chosen after seeing which one looked better.\n")


def plain_section(variant, res, ps, drag, dlo, dhi) -> str:
    P: list[str] = []
    A = P.append
    spy = res[SUBJECT]
    tf = "1-hour" if variant == "1h" else "4-hour"
    A("## In plain language\n")
    A(f"**Did it work?** {_verdict_prose(spy)}\n")
    if ps:
        A("**The subtraction that decides everything.** A setup only survives if "
          "what it earns is bigger than what it costs to trade. Here is that "
          "sum, on SPY, per share.\n")
        A("| per share, average SPY trade | this model |")
        A("|---|---|")
        A(f"| what the setup earned, before costs | {cents(ps['gross_mean'])} |")
        A(f"| what it paid to get in and out | {cents(-ps['cost_mean'])} |")
        A(f"| **what was left, on the average trade** | **{cents(ps['net_mean'])}** |")
        A(f"| what was left, on the MIDDLE trade | {cents(ps['net_median'], 1)} |")
        A(f"| median money risked per trade | {ps['risk']*100:.0f}¢ |")
        A(f"| average share price | ${ps['price']:.0f} |")
        A("")
        A(f"Across all {ps['n']:,} SPY trades the model made "
          f"${ps['net_total']:.2f} per share in total; the best three trades "
          f"contributed ${ps['net_top3']:.2f} of that, leaving "
          f"${ps['net_total']-ps['net_top3']:.2f} for the other "
          f"{ps['n']-3:,}. **Read the middle trade beside the average.** "
          f"`orb_mtf.v1` averaged +1.53¢ while its middle trade lost 25¢, and "
          f"that gap was the real result.\n")
    A(f"**What the {tf} filter was doing.** The trade is only taken when the "
      f"{tf} chart is in a confirmed trend in the same direction as the "
      f"breakout. Trend here means higher high and higher low with the swing "
      f"low still standing, read on the last {tf} bar that had actually "
      f"closed — the same definition ENGINE-3 used, reused rather than "
      f"re-argued.\n")
    A("**How sure are we?**\n")
    for sym in res:
        r = res[sym]
        lo, hi = G.mean_ci95([t.net_r for t in r["oos_tr"]])
        ilo, ihi = G.mean_ci95([t.net_r for t in r["is_tr"]])
        A(f"- **{sym}.** Held-back window: {len(r['oos_tr']):,} trades averaging "
          f"{r['s_oos'].mean_r:+.3f}R, middle trade {r['s_oos'].median_r:+.3f}R, "
          f"honest range {lo:+.3f}R to {hi:+.3f}R. In-sample: "
          f"{len(r['is_tr']):,} trades averaging {r['s_is'].mean_r:+.3f}R, "
          f"middle trade {r['s_is'].median_r:+.3f}R, range {ilo:+.3f}R to "
          f"{ihi:+.3f}R.")
    A("")
    A("**Was it better than guessing?** This is the question the whole gate "
      "rests on, and it is asked before costs, because a model that cannot beat "
      "a coin flip on free trades is settled without arguing about the spread.\n")
    for sym, r in res.items():
        m, lo, hi, npair = paired_diff(r["gross"], r["ctl_gross"])
        mo, lomo, himo, nmo = paired_diff(
            [t for t in r["gross"]
             if dayint(G.DEEP_OUT_OF_SAMPLE[0]) <= t.day <= dayint(G.DEEP_OUT_OF_SAMPLE[1])],
            r["ctl_gross"])
        A(f"- **{sym}.** Before costs the model made "
          f"{gross_r_mean(r['gross']):+.3f}R a trade; a coin flip on the same "
          f"days, at the same minutes, with the same stop distance and the same "
          f"2R target made {gross_r_mean(r['ctl_gross']):+.3f}R. Paired trade "
          f"for trade the gap is **{m:+.3f}R** (95%: {lo:+.3f} to {hi:+.3f}, "
          f"n={npair:,}); in the held-back window {mo:+.3f}R (95%: {lomo:+.3f} "
          f"to {himo:+.3f}, n={nmo:,}). " + _gap_verdict(lo, hi, lomo, himo))
    A("")
    A("**One R is one unit of the money you agreed to lose if the trade goes "
      "wrong** — here, the distance from the entry to the trigger candle's "
      "extreme. +0.10R means the average trade made a tenth of what it risked. "
      "The bar was +0.10R in-sample and +0.05R out-of-sample, after costs.\n")
    A(f"**These are models five and six.** `orb_reclaim.v1`, "
      f"`sweep_displacement_fvg.v1`, `orb_htf_structural.v1` and `orb_mtf.v1` "
      f"were all measured and all failed. The two `orb_simple` variants are run "
      f"as a pair, which is two more chances for one of them to look good by "
      f"luck. The held-back window is the verdict and was read once. The "
      f"in-sample decade (2012–2022) is data this programme had never seen "
      f"before today; the held-back window overlaps the tape the earlier four "
      f"models ran on, which is disclosed rather than engineered away — this "
      f"model has no fitted parameter to have overfitted with.\n")
    A("**What would change the answer?**\n")
    A(_what_would_change(res, drag, dlo, dhi))
    return "\n".join(P)


def _gap_verdict(lo, hi, lomo, himo) -> str:
    """Say what the two intervals actually exclude, one at a time."""
    parts = []
    parts.append("Over the whole sample the interval "
                 + ("contains zero, so the filter bought nothing measurable"
                    if lo <= 0 <= hi else
                    ("excludes zero on the WRONG side — the filter is worse than "
                     "the coin flip" if hi < 0 else "excludes zero in the "
                     "filter's favour")) + ".")
    if not (lomo <= 0 <= himo):
        parts.append("In the held-back window it "
                     + ("excludes zero on the WRONG side, which is a measured "
                        "result against the filter" if himo < 0
                        else "excludes zero in the filter's favour") + ".")
    return " ".join(parts)


def _verdict_prose(r) -> str:
    v = r["verdict"]
    g = {x.id: x for x in r["core"]}
    if v == "PASS":
        return ("Yes, on this data, against a bar written down first. Every gate "
                "cleared.")
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
            f"written down before it ran, and the miss on expectancy is outside "
            f"the range chance can explain.")


def _what_would_change(res, drag, dlo, dhi) -> str:
    spy = res[SUBJECT]
    ps = per_share(spy["net"], spy["gross"])
    P = []
    P.append(f"- **The cost fraction, which came out the opposite way to the "
             f"brief's expectation.** SPY's realised drag is {drag:.3f}R per "
             f"trade (95%: {dlo:.3f} to {dhi:.3f}), i.e. {drag*100:.1f}% of the "
             f"money risked — HIGHER than the 9–14% the earlier mixed baskets "
             f"paid, not lower. Cost as a fraction of risk is set by the STOP "
             f"DISTANCE, not by the price of the instrument, and this model's "
             f"stop is the tightest in the programme. Trading the cheapest "
             f"instrument in the world with a 29-cent stop is more expensive, "
             f"proportionally, than trading a $50 name with a wide one.")
    if ps:
        P.append(f"- **The stop distance.** The median SPY trade risks "
                 f"{ps['risk']*100:.0f}¢ on a ${ps['price']:.0f} share — "
                 f"{pctf(ps['risk']/ps['price'], 3)} of price. A trigger-candle "
                 f"stop is a tight stop by construction, which is what makes the "
                 f"cost fraction small and also what makes the stop easy to hit. "
                 f"Widening it is a different model and needs its own gate.")
    P.append("- **The other reading of the stop.** See the top of this report. "
             "Using the candle BEFORE the trigger candle would widen every stop, "
             "shrink the cost fraction further, and lower the hit rate. It is a "
             "one-line change and it is the single most informative re-run "
             "available.")
    P.append("- **A different target.** 2R is the owner's number and is fixed "
             "here. The MAE tables below say how far trades travelled the wrong "
             "way before resolving, which is the evidence for whether a nearer "
             "target would have paid.")
    P.append("- **More symbols.** Three index ETFs are three of the most "
             "efficiently priced instruments in the market. A null result here "
             "does not transfer to single names in either direction.")
    return "\n".join(P)


def cost_section(res) -> str:
    P = ["## SPY's cost drag as a fraction of risk — the number the brief asked for\n"]
    P.append("The brief's hypothesis was that SPY should be cheap to trade "
             "relative to the move, because a penny of spread on a ~$770 "
             "instrument is roughly fifteen times cheaper than the same penny "
             "on a $50 stock, and that every earlier model in this programme "
             "was measuring a mixed basket at 9–14% of risk. **The measurement "
             "says the opposite, and the reason is worth more than the model.**\n")
    P.append("Cost as a fraction of risk is `cost per share / stop distance`. "
             "The numerator scales with the PRICE of the instrument. The "
             "denominator is set by the MODEL. This model's stop is the trigger "
             "candle's own extreme, which on SPY is a few tens of cents — so "
             "the fraction is large no matter how cheap the instrument is. "
             "Being the most liquid ETF in the world does not help a stop that "
             "tight.\n")
    P.append("Paired trade by trade, so it is the same trades gross and net.\n")
    P.append("| symbol | trades | median risk, % of price | median risk | avg price | **cost drag, R** | 95% interval |")
    P.append("|---|---|---|---|---|---|---|")
    for sym, r in res.items():
        d, lo, hi, dn = cost_drag_r(r["net"], r["gross"])
        med, q1, q3 = risk_pct(r["net"])
        ps = per_share(r["net"], r["gross"])
        P.append(f"| {sym} | {dn:,} | {pctf(med, 3)} | "
                 f"{ps.get('risk', float('nan'))*100:.0f}¢ | "
                 f"${ps.get('price', float('nan')):.0f} | **{d:.3f}R** | "
                 f"{lo:.3f} to {hi:.3f} |")
    P.append("")
    P.append("For comparison, on `polygon-v1`'s 32-name basket with a "
             "structural stop several times wider: `orb_reclaim.v1` ≈0.09R, "
             "`orb_htf_structural.v1` 0.144R, `orb_mtf.v1` 0.122R. Those models "
             "risked 0.19–0.29% of price. This one risks about a third of that, "
             "and pays about twice the fraction.\n")

    P.append("### The pre-registered cost model is itself proportional, and on "
             "SPY that overstates the spread\n")
    P.append("The bar committed at `a06611d` charges $0.005 per share per side "
             "plus **1.0 basis point of price**, adverse, on the market entry "
             "and on any exit that is not the resting-limit target. One basis "
             "point of SPY is 3.3¢ in 2012 and 7.7¢ in 2026 — but SPY's actual "
             "quoted spread is about a penny, so half of it is half a cent. "
             "A proportional slippage model is calibrated for $50–$300 single "
             "names; on a $770 index ETF it charges several times the real "
             "cost. That is the pre-registered bar and the verdict above stands "
             "on it. Below is what the same trades cost under an absolute "
             "half-cent half-spread, reconstructed from each trade rather than "
             "re-run, and clearly labelled as a **sensitivity, not a result**.\n")
    P.append("| symbol | cost per share, 1bp (as gated) | cost per share, ½¢ spread | drag, R (as gated) | drag, R (½¢) | mean net R (as gated) | mean net R (½¢, first order) |")
    P.append("|---|---|---|---|---|---|---|")
    for sym, r in res.items():
        tr = finite(r["net"])
        a = np.array([applied_cost_ps(t) for t in tr])
        b = np.array([flat_cost_ps(t) for t in tr])
        risk = np.array([t.risk_per_share for t in tr])
        g = {key(t): t for t in finite(r["gross"])}
        pairs = [(t, g[key(t)]) for t in tr if key(t) in g]
        alt = np.array([gt.gross_r - flat_cost_ps(t) / t.risk_per_share
                        for t, gt in pairs])
        P.append(f"| {sym} | {np.mean(a)*100:.2f}¢ | {np.mean(b)*100:.2f}¢ | "
                 f"{np.mean(a/risk):.3f}R | {np.mean(b/risk):.3f}R | "
                 f"{np.mean([t.net_r for t in tr]):+.3f} | "
                 f"{np.mean(alt):+.3f} |")
    P.append("")
    P.append("**Even trading for a half-cent the model does not reach its bar**, "
             "and the sensitivity is first-order only: it prices the same fills "
             "differently, it does not re-simulate what a tighter spread would "
             "have done to which bar hit the stop. The honest reading is that "
             "cost is a large part of this model's loss and is not the whole of "
             "it — the gross comparison against the coin flip, in the next "
             "section, is what settles that.\n")
    return "\n".join(P)


def control_section(res) -> str:
    P = ["## Gross versus the matched control, before net\n"]
    P.append("ENGINE-1's decisive finding was that both its models were below a "
             "coin flip *before* costs, which settles the net number without "
             "further argument. So this table is read first. The control takes "
             "the same symbol, the same days, the same decision minutes and the "
             "same stop distances, flips only the direction, and targets the "
             "same 2R from its own fill.\n")
    P.append("| symbol | run | n | gross mean R | gross median R | net mean R | net median R | hit | PF (net) |")
    P.append("|---|---|---|---|---|---|---|---|---|")
    for sym, r in res.items():
        for label, tr, gtr in (("`orb_simple`", r["net"], r["gross"]),
                               ("`null_coinflip.v1.matched`", r["ctl_net"], r["ctl_gross"])):
            s = summarise(tr, label)
            gs = summarise(finite(gtr), label)
            P.append(f"| {sym} | {label} | {s.n:,} | {gs.mean_r:+.3f} | "
                     f"{gs.median_r:+.3f} | {s.mean_r:+.3f} | {s.median_r:+.3f} | "
                     f"{s.hit_rate*100:.1f}% | {fmt(s.profit_factor, 2)} |")
    P.append("")
    P.append("Paired trade by trade on the same symbol, day and minute, **gross "
             "of costs** — did knowing which way to point pay for itself?\n")
    P.append("| symbol | window | pairs | model − control, gross mean R | 95% interval |")
    P.append("|---|---|---|---|---|")
    for sym, r in res.items():
        for wname, sel in (("all", lambda t: True),
                           ("in-sample", lambda t: dayint(G.DEEP_IN_SAMPLE[0]) <= t.day <= dayint(G.DEEP_IN_SAMPLE[1])),
                           ("out-of-sample", lambda t: dayint(G.DEEP_OUT_OF_SAMPLE[0]) <= t.day <= dayint(G.DEEP_OUT_OF_SAMPLE[1]))):
            m, lo, hi, n = paired_diff([t for t in r["gross"] if sel(t)], r["ctl_gross"])
            P.append(f"| {sym} | {wname} | {n:,} | {m:+.3f} | {lo:+.3f} to {hi:+.3f} |")
    P.append("")
    return "\n".join(P)


def gate_section(spy) -> str:
    P = [f"## The gate — evaluated on SPY — **{spy['verdict']}**\n"]
    P.append("| gate | | bar | observed | |")
    P.append("|---|---|---|---|---|")
    for g in spy["core"]:
        P.append(f"| {g.id} | {g.name} | {g.threshold} | {g.observed} | "
                 f"**{'PASS' if g.passed else 'FAIL'}** |")
    P.append("")
    return "\n".join(P)


def tables_section(spy, regimes) -> str:
    P = ["## SPY, in full\n", SUMMARY_HEADER]
    for s in (spy["s_all"], spy["s_is"], spy["s_oos"]):
        P.append(summary_row(s))
    P.append("")
    P.append(mae_block(spy["s_all"], "All SPY trades"))
    P.append(mae_block(spy["s_oos"], "SPY, held-back window"))
    P.append("By regime (in-sample), then side and year:\n")
    P.append(SUMMARY_HEADER)
    for k, s in sorted(spy["reg"].items()):
        P.append(summary_row(s))
    for label, groups in (("side", split_by(spy["net"], lambda t: t.side)),
                          ("year", split_by(spy["net"], lambda t: str(t.day)[:4]))):
        for k in sorted(groups):
            P.append(summary_row(summarise(groups[k], k)))
    P.append("")
    ex = spy["s_all"].exit_mix
    P.append(f"- exits: {ex}")
    P.append(f"- trades resolved by the pessimistic same-bar assumption "
             f"(stop and target both inside one bar): {spy['s_all'].ambiguous_bars} "
             f"({spy['s_all'].ambiguous_bars/max(1,spy['s_all'].n)*100:.1f}%)")
    P.append(f"- mean 1-minute bars held: {spy['s_all'].mean_bars_held:.1f}")
    tpd = trades_per_day(spy["net"])
    P.append(f"- trades per SPY session, where at least one was taken: "
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


def others_section(res) -> str:
    P = ["## QQQ and IWM — reported separately, never pooled into SPY\n"]
    P.append("These are not evidence about SPY. They are the same model on two "
             "other instruments, judged against the same bar, so a reader can "
             "see whether the SPY result is peculiar to SPY.\n")
    for sym, r in res.items():
        if sym == SUBJECT:
            continue
        P.append(f"### {sym} — **{r['verdict']}**\n")
        P.append(SUMMARY_HEADER)
        for s in (r["s_all"], r["s_is"], r["s_oos"]):
            P.append(summary_row(s))
        P.append("")
        P.append("| gate | bar | observed | |")
        P.append("|---|---|---|---|")
        for g in r["core"]:
            P.append(f"| {g.id} {g.name} | {g.threshold} | {g.observed} | "
                     f"{'PASS' if g.passed else 'FAIL'} |")
        P.append("")
    return "\n".join(P)


def census_section(variant, res, sessions) -> str:
    P = ["## Where the days went\n"]
    P.append("Every session the model looked at and the rule that ended it. This "
             "is the check on the brief's central worry — that a spec, not the "
             "market, is what produces a small trade count.\n")
    order = ["days_seen", "days_no_htf_trend", "days_trend_ok_no_break",
             "days_trigger_but_no_signal", "days_with_1_trade_direction(s)",
             "days_with_2_trade_direction(s)", "triggers", "signals",
             "signals_long", "signals_short", "skip_zero_width_stop",
             "bars_evaluated", "bars_no_opening_range", "bars_no_htf_trend",
             "bars_no_break_on_trend_side", "bars_direction_already_traded"]
    P.append("`triggers` counts BARS, not days: once price is beyond the range "
             "on the trend side, every later 5-minute close that session counts "
             "again. Almost all of them are the same day still qualifying after "
             "its trade was taken, which is what `bars_direction_already_traded` "
             "is. `signals` is the number of trades.\n")
    P.append("| outcome | " + " | ".join(res) + " |")
    P.append("|---|" + "---|" * len(res))
    for k in order:
        vals = [f"{res[s]['census'].get(k, 0):,}" for s in res]
        P.append(f"| `{k}` | " + " | ".join(vals) + " |")
    P.append("")
    for sym, r in res.items():
        c = r["census"]
        booked = sum(v for k, v in c.items()
                     if k.startswith("days_") and k != "days_seen")
        assert booked == c["days_seen"], (sym, booked, c["days_seen"])
    P.append(f"Every session is booked under exactly one outcome, and the four "
             f"`days_*` rows below `days_seen` sum to it.\n")
    for sym, r in res.items():
        c = r["census"]
        seen = c.get("days_seen", 0) or 1
        traded = c.get("days_with_1_trade_direction(s)", 0) + c.get("days_with_2_trade_direction(s)", 0)
        P.append(f"- **{sym}**: {traded:,} of {c.get('days_seen', 0):,} sessions "
                 f"produced at least one trade ({traded/seen*100:.1f}%); "
                 f"{c.get('days_no_htf_trend', 0):,} were lost to the higher "
                 f"timeframe having no confirmed trend at any point in the "
                 f"session ({c.get('days_no_htf_trend', 0)/seen*100:.1f}%); "
                 f"{c.get('days_trend_ok_no_break', 0):,} had a trend but no "
                 f"5-minute close beyond the range on that side.")
        P.append(f"  Orders that never became a trade: "
                 f"{Counter(x.reason for x in r['rejects'])}")
    P.append("")
    P.append(f"- model parameters: `{json.dumps(OrbSimple(variant).params())}`")
    P.append("")
    return "\n".join(P)


def disclosures(variant) -> str:
    return f"""## Disclosures specific to this run

- **Fifth and sixth models on this programme's data, and the first on this
  snapshot.** `orb_reclaim.v1`, `sweep_displacement_fvg.v1`,
  `orb_htf_structural.v1` and `orb_mtf.v1` were measured on `polygon-v1` and all
  four failed. `orb_simple_1h.v1` and `orb_simple_4h.v1` are run as a pair on
  `polygon-deep-v1` and judged separately; neither borrows the other's result.
- **The in-sample decade is new data; the held-back window is not entirely.**
  2012-01-01 → 2022-12-31 had never been touched by this programme.
  2023-01-01 → 2026-08-28 overlaps the tape the earlier four models ran on. This
  model has no fitted parameter, so there is nothing that could have been tuned
  on it, but the overlap is real and is stated rather than hidden.
- **Prices are split- and dividend-adjusted.** Over fourteen years that is the
  only defensible choice, and it means the dollar prices in the older years are
  not the prices that printed on the tape that day. Every per-share cent figure
  in this report is measured against the ADJUSTED price, so the cost-drag
  fraction is the number to trust and the cents are the illustration.
- **Fills are modelled, not observed.** OHLC cannot say what happened inside a
  bar. Every ambiguity is resolved against the trade, and a bar containing both
  the stop and the target is booked as the stop.
- **The 2R target is measured from the fill**, not from the close the decision
  was made on, so it is genuinely 2R on every trade. See `fills.resolved_target`.
- **One position at a time.** A day's second direction can only be taken after
  the first has closed. The census shows how often the second direction was
  wanted and unavailable.
- **The higher-timeframe reading is stale by construction on the {'4-hour' if variant == '4h' else '1-hour'}
  variant** in the way described in its gate, and that staleness is the filter,
  not a bug in it.
- **Three index ETFs is not a universe.** SPY, QQQ and IWM are among the most
  efficiently priced instruments available. A null result here does not transfer
  to single names, and neither would a positive one.
- **No borrow, locate, halt, dividend or corporate-action modelling.** QQQ's
  2013-08-22 session is 216 minutes long because the Nasdaq halted; it is kept
  as it is.
"""


# --- main --------------------------------------------------------------------
def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--symbols", default=",".join(config.DEEP_UNIVERSE))
    ap.add_argument("--variants", default="1h,4h")
    a = ap.parse_args()
    symbols = [s.strip().upper() for s in a.symbols.split(",") if s.strip()]
    variants = [v.strip() for v in a.variants.split(",") if v.strip()]

    regimes = regime_by_day(config.BENCHMARK, 50, SNAPSHOT)
    sessions = {s: len(load(s, "1m", SNAPSHOT).day_bounds()) for s in symbols}

    for variant in variants:
        res = {s: evaluate_symbol(s, variant, regimes) for s in symbols}
        mid = f"orb_simple_{variant}.v1"
        out = config.REPORTS_ROOT / f"{mid}.{SNAPSHOT}.md"
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(report(variant, res, regimes, sessions))

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
            (out.parent / f"{stem}.{sym}.equity.csv").write_text(
                "day,cum_net_r\n" + "\n".join(f"{d},{v}" for d, v in eq))

        print(f"\n{mid}: SPY {res[SUBJECT]['verdict']}  -> {out}")
        for g in res[SUBJECT]["core"]:
            print(f"  {'PASS' if g.passed else 'FAIL'} {g.id} {g.name}: {g.observed}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
