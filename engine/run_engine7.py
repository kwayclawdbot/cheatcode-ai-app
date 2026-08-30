"""ENGINE-7 — `orb_sip.v2`: the same ORB, the other published stop, judged out of sample.

    .venv/bin/python run_engine7.py

There is no `--stage plan`. The selection is ENGINE-6's, read from
`data/polygon-sip-v1/selection.json.gz` exactly as it was written, so the two
models trade the same symbol-days and nothing about the universe, the pool, the
relative-volume ranking or the anti-lookahead treatment is recomputed or
re-downloaded. The only thing that changed is where the stop sits.

There is also no parameter to vary. That is deliberate and it is the point of
this file: the stop width was chosen by reading a sweep of the 2016-2023 window
(see `models/orb_sip.v2/GATE.md`), so the in-sample window is contaminated and
the verdict comes from the held-back years. A runner with a knob on it would
invite a second look at the number that is already suspect. There is no knob.
"""

from __future__ import annotations

import gzip
import json
import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from engine import calendar_us  # noqa: E402
from engine.backtest.stats import (SUMMARY_HEADER, fmt, split_by,  # noqa: E402
                                   summarise, summary_row)
from engine.models import gates  # noqa: E402
from engine.models.orb_sip import OrbStocksInPlay  # noqa: E402
from engine.models.orb_sip_v2 import (OrbStocksInPlayV2,  # noqa: E402
                                      OrbStocksInPlayV2Coinflip)
from engine.run_engine6 import (ARM_SIP, ARM_UNFILTERED, CHEAP,  # noqa: E402
                                COSTS, FREE, SELECTION_PATH, _atr_map,
                                _paired_by_day, _paired_gross, _replay, _window)
from engine.sip import config as scfg  # noqa: E402
from engine.sip.portfolio import run_portfolio  # noqa: E402

REPORT = Path(__file__).resolve().parent / "reports" / f"orb_sip.v2.{scfg.SNAPSHOT}.md"
RISK_DOLLARS = 1_000.0     # 1% of a $100,000 account — the plain-money gloss


def _d(s: str) -> int:
    return int(s.replace("-", ""))


def _gross(trades) -> tuple[float, float]:
    """Mean/median GROSS R — reported before the net numbers, every time."""
    if not trades:
        return float("nan"), float("nan")
    g = np.array([t.gross_r for t in trades], dtype="float64")
    return float(np.mean(g)), float(np.median(g))


def _stopped_share(trades) -> float:
    if not trades:
        return float("nan")
    return sum(1 for t in trades if t.exit_reason == "stop") / len(trades)


def _ci(values) -> tuple[float, float]:
    return gates.mean_ci95(list(values))


def _stop_geometry(trades, atr) -> dict:
    """How wide the stop actually was, in the three units a reader may want."""
    if not trades:
        return {}
    risk = np.array([t.risk_per_share for t in trades], dtype="float64")
    px = np.array([t.fill_price for t in trades], dtype="float64")
    a = np.array([atr.get((t.symbol, t.day), np.nan) for t in trades], dtype="float64")
    ok = np.isfinite(a) & (a > 0)
    return {
        "cents": float(np.median(risk) * 100.0),
        "pct": float(np.median(risk / np.maximum(px, 1e-9)) * 100.0),
        "atr": float(np.median(risk[ok] / a[ok])) if ok.any() else float("nan"),
        "commission_r": float(np.median(2.0 * COSTS.commission_per_share
                                        / np.maximum(risk, 1e-9))),
    }


def _arm_block(A, sip, flip, unf, gross_sip, gross_flip, gross_unf) -> None:
    s, f_, u = (summarise(sip, "in play"), summarise(flip, "coin flip"),
                summarise(unf, "unfiltered"))
    A(f"| arm | n | mean gross R | median gross R | mean net R | median net R | hit | PF | stopped |")
    A("|---|---|---|---|---|---|---|---|---|")
    for name, ts, gm, ss in (("stocks in play", sip, gross_sip, s),
                             ("random 20 control", unf, gross_unf, u),
                             ("matched coin flip", flip, gross_flip, f_)):
        A(f"| {name} | {ss.n} | {fmt(gm[0],4)} | {fmt(gm[1],4)} | "
          f"{fmt(ss.mean_r,4)} | {fmt(ss.median_r,4)} | "
          f"{fmt(ss.hit_rate*100,1)}% | {fmt(ss.profit_factor,2)} | "
          f"{fmt(_stopped_share(ts)*100,1)}% |")


def main() -> int:
    with gzip.open(SELECTION_PATH, "rt") as f:
        sel = json.load(f)
    rows = sel["rows"]
    pairs = {(r["symbol"], int(r["day"])) for r in rows}
    atr = _atr_map(pairs)
    print(f"selection (ENGINE-6's, reused): {len(rows):,} rows, "
          f"{len(pairs):,} symbol-days, {len(atr):,} with an ATR", flush=True)

    arms: dict[str, dict[str, set[int]]] = {ARM_SIP: {}, ARM_UNFILTERED: {}}
    for r in rows:
        arms[r["arm"]].setdefault(r["symbol"], set()).add(int(r["day"]))

    print("replaying orb_sip.v2, its matched control, and v1 on the same tape...",
          flush=True)
    a, ac, sip_missing = _replay(arms[ARM_SIP], atr, [
        ("sip", OrbStocksInPlayV2, COSTS),
        ("flip", OrbStocksInPlayV2Coinflip, COSTS),
        ("sip_nocost", OrbStocksInPlayV2, FREE),
        ("sip_cheap", OrbStocksInPlayV2, CHEAP),
        ("v1", OrbStocksInPlay, COSTS),
    ])
    print("replaying the random-20 control...", flush=True)
    b, bc, unf_missing = _replay(arms[ARM_UNFILTERED], atr, [
        ("unfiltered", OrbStocksInPlayV2, COSTS),
    ])
    print(f"trades: sip={len(a['sip']):,} flip={len(a['flip']):,} "
          f"unfiltered={len(b['unfiltered']):,} v1={len(a['v1']):,}", flush=True)

    write_report(sel, a, b, ac["sip"], bc["unfiltered"], sip_missing,
                 unf_missing, atr)
    return 0


def write_report(sel, a, b, sip_census, unf_census, sip_missing,
                 unf_missing, atr) -> None:
    sip, flip, unf, v1 = a["sip"], a["flip"], b["unfiltered"], a["v1"]
    hb_lo, hb_hi = (_d(x) for x in gates.SIPV2_HELD_BACK)
    cn_lo, cn_hi = (_d(x) for x in gates.SIPV2_CONTAMINATED)

    # --- the held-back window: the verdict ---------------------------------
    h_sip, h_flip, h_unf = (_window(sip, hb_lo, hb_hi), _window(flip, hb_lo, hb_hi),
                            _window(unf, hb_lo, hb_hi))
    h_v1 = _window(v1, hb_lo, hb_hi)
    hs = summarise(h_sip, "in play, held back")
    hg = _gross(h_sip)
    h_paired_flip = _paired_gross(h_sip, h_flip)
    h_paired_unf = _paired_by_day(h_sip, h_unf)
    days_hb = [_d(x) for x in calendar_us.trading_days(*gates.SIPV2_HELD_BACK)]
    pf_hb = run_portfolio(h_sip, days_hb)
    gate_rows = gates.evaluate_sip_v2(hs, hg[0], h_paired_flip, h_paired_unf, pf_hb)
    verdict = gates.verdict_sip_v2(gate_rows)

    # --- the contaminated window: a disclosure, never a verdict -------------
    c_sip, c_flip, c_unf = (_window(sip, cn_lo, cn_hi), _window(flip, cn_lo, cn_hi),
                            _window(unf, cn_lo, cn_hi))
    c_v1 = _window(v1, cn_lo, cn_hi)
    cs = summarise(c_sip, "in play, contaminated window")
    cg = _gross(c_sip)
    days_cn = [_d(x) for x in calendar_us.trading_days(*gates.SIPV2_CONTAMINATED)]
    days_all = [_d(x) for x in calendar_us.trading_days(scfg.START, scfg.END)]
    pf_cn = run_portfolio(c_sip, days_cn)
    pf_all = run_portfolio(sip, days_all)
    pf_unf_hb = run_portfolio(h_unf, days_hb)

    geo_hb = _stop_geometry(h_sip, atr)
    stopped_hb = _stopped_share(h_sip)
    lo_hb, hi_hb = _ci([t.net_r for t in h_sip])

    L: list[str] = []
    A = L.append
    A("# `orb_sip.v2` — the same ORB, stopped at the other end of the opening candle")
    A("")
    A(f"**Verdict: {verdict}.** Decided on the held-back window "
      f"{gates.SIPV2_HELD_BACK[0]} → {gates.SIPV2_HELD_BACK[1]} and on nothing "
      "else.")
    A("")
    A(f"Snapshot `{scfg.SNAPSHOT}`, unchanged and not re-downloaded. Selection "
      "reused byte for byte from ENGINE-6. Gate: "
      "[`../models/orb_sip.v2/GATE.md`](../models/orb_sip.v2/GATE.md), "
      "committed before any number below existed.")
    A("")
    A("## In plain English")
    A("")
    A("**What this is.** One model, changed in one place from the model ENGINE-6 "
      "ran and lost with. Pick the twenty US stocks each morning whose first "
      "five minutes traded the most abnormal volume against their own recent "
      "mornings. Buy a break above the 09:30-09:35 high if that candle closed "
      "up, sell short a break below its low if it closed down. Then hold until "
      "the closing bell unless the price comes all the way back through the "
      "other end of that same five-minute candle, which is where the stop-loss "
      "sits. ENGINE-6 put the stop a tenth of an average day's range from the "
      "entry — about twelve cents — and got knocked out of nine trades in ten. "
      "This one puts it about six times further away.")
    A("")
    A("**⚠ The stop width was chosen after looking at the answer on 2016-2023, "
      "and that matters.** The ENGINE-6 post-mortem tried several stop widths "
      "on the 2016-2023 years and found the strategy stops losing somewhere "
      "between a quarter and a half of an average day's range. This model's "
      "stop lands on the winning side of that line. It is also, independently, "
      "the rule the companion published paper uses — but we cannot prove which "
      "of the two reasons actually drove the choice. **So the 2016-2023 result "
      "below is not evidence.** It is printed in full, because hiding it would "
      "be worse, but the only honest verdict is the held-back years, "
      f"{gates.SIPV2_HELD_BACK[0]} to {gates.SIPV2_HELD_BACK[1]}, which no "
      "sweep ever touched.")
    A("")
    A(f"- **Trade count**: **{len(h_sip):,}** trades in the held-back years "
      f"({gates.SIPV2_HELD_BACK[0]} → {gates.SIPV2_HELD_BACK[1]}), "
      f"{len(c_sip):,} in the contaminated 2016-2023 window, {len(sip):,} "
      "across the whole 2016-2026 tape.")
    A(f"- **Date range**: {scfg.START} → {scfg.END}, {len(days_all):,} sessions; "
      f"the verdict uses the last {len(days_hb):,} of them.")
    mean_dollars = hs.mean_r * RISK_DOLLARS
    A(f"- **Did it make money on the held-back years**: "
      f"**{'yes' if hs.mean_r > 0 else 'no'}**. After commission and slippage "
      f"the average trade returned **{hs.mean_r:+.4f}** times what was risked "
      f"on it — for a trader risking $1,000 a trade, that is "
      f"**{mean_dollars:+,.0f} dollars a trade** on average, over "
      f"{len(h_sip):,} trades. The middle trade returned "
      f"{hs.median_r:+.4f} ({hs.median_r * RISK_DOLLARS:+,.0f} dollars), and "
      f"{hs.hit_rate:.1%} of trades finished green.")
    straddles = lo_hb <= 0.0 <= hi_hb
    A(f"- **How much of that is luck**: the 95% range around the average is "
      f"{lo_hb:+.4f} to {hi_hb:+.4f} times risk, i.e. "
      f"{lo_hb*RISK_DOLLARS:+,.0f} to {hi_hb*RISK_DOLLARS:+,.0f} dollars a "
      "trade. "
      + ("**That range contains zero**, so the average trade is NOT "
         "distinguishable from breaking even at this sample size, whatever the "
         "sign of the middle number."
         if straddles else
         "That range does not contain zero, so the sign of the average is not "
         "an artefact of the sample size. It says nothing about whether the "
         "next three years look like these three."))
    unf_s = summarise(h_unf, "random 20")
    A(f"- **Against just picking twenty names at random** from the same "
      f"eligible universe and trading them identically: those returned "
      f"{unf_s.mean_r:+.4f} times risk a trade "
      f"({unf_s.mean_r*RISK_DOLLARS:+,.0f} dollars) over {unf_s.n:,} trades. "
      "The published claim is that the abnormal-opening-volume filter is where "
      "essentially all of the return comes from, so the gap between those two "
      "rows is the claim under test.")
    A(f"- **As a portfolio** — risking 1% of the account on each of the day's "
      f"twenty names, capped at 4x gross, compounded daily from $100,000 — the "
      f"held-back years returned **{pf_hb.total_return:+.1%}** "
      f"(${100_000*(1+pf_hb.total_return):,.0f} at the end), at a Sharpe of "
      f"{pf_hb.sharpe:.2f} with a worst drawdown of {pf_hb.max_drawdown:.1%}.")
    A(f"- **Stopped out**: {stopped_hb:.1%} of trades, against ENGINE-6's "
      "90.1%.")
    A(f"- **Verdict**: **{verdict}**.")
    A("")
    if stopped_hb >= gates.SIPV2_DIAGNOSIS_WRONG_IF_STOPPED_ABOVE:
        A(f"**The ENGINE-6 diagnosis was wrong.** The gate pre-registered this "
          f"sentence: if v2 is still stopped out on "
          f"{gates.SIPV2_DIAGNOSIS_WRONG_IF_STOPPED_ABOVE:.0%} or more of its "
          f"trades, the stop was not what was killing the model. It is "
          f"{stopped_hb:.1%}. Whatever the verdict line says, the mechanism "
          "offered by the post-mortem is not the mechanism, and the next "
          "question is not about the stop.")
        A("")
    else:
        A(f"The stop is doing what the post-mortem said it would: the knock-out "
          f"rate falls from 90.1% to {stopped_hb:.1%}, which is the change the "
          "widening was supposed to buy. That is a consistency check on the "
          "ENGINE-6 diagnosis, not evidence for this model.")
        A("")
    A("**Which gates carried the verdict, in words.** " + " ".join(
        f"{g.id} {'passed' if g.passed else 'FAILED'} ({g.name})."
        for g in gate_rows))
    A("")
    if verdict == gates.PARTIAL_OOS:
        failed = [g for g in gate_rows if not g.passed]
        A("**PARTIAL is not a pass.** " + " ".join(
            f"{g.id} failed, so this is NOT established: {g.name}." for g in failed)
          + " The gate said in advance that this outcome does not authorise "
          "shipping anything, and it does not.")
        A("")
    elif verdict == gates.FAILED_OOS:
        A("**It did not make money out of sample.** That is the whole answer. "
          "The stop was the live candidate the ENGINE-6 post-mortem named, it "
          "was changed once, on a pre-registered gate, and the held-back years "
          "said no. There is no v3 at a third stop width; the gate ruled that "
          "out before this run started.")
        A("")

    # --- the bar -----------------------------------------------------------
    A("## The bar, and what it observed")
    A("")
    A(f"All five gates are read on the held-back window only. Thresholds are "
      "ENGINE-6's R1-R5 carried over unchanged in kind and in number.")
    A("")
    A("| id | gate | threshold | observed | |")
    A("|---|---|---|---|---|")
    for g in gate_rows:
        A(f"| **{g.id}** | {g.name} | {g.threshold} | {g.observed} | "
          f"{'PASS' if g.passed else 'FAIL'} |")
    A("")

    # --- held back, in full ------------------------------------------------
    A(f"## The held-back window, {gates.SIPV2_HELD_BACK[0]} → "
      f"{gates.SIPV2_HELD_BACK[1]} — gross before net, median beside mean")
    A("")
    _arm_block(A, h_sip, h_flip, h_unf, hg,
               _gross(h_flip), _gross(h_unf))
    A("")
    A("All three arms use the same rules, the same costs and the same fills. "
      "The random-20 control differs from the stocks-in-play arm in the ranking "
      "key and in nothing else; the coin flip differs in the direction call and "
      "in nothing else.")
    A("")
    pm = float(np.mean(h_paired_flip)) if h_paired_flip else float("nan")
    lo_f, hi_f = gates.mean_ci95(h_paired_flip)
    A(f"**Against the coin flip, paired, gross:** {pm:+.4f}R "
      f"(95%: {lo_f:+.4f} to {hi_f:+.4f}) over {len(h_paired_flip):,} "
      "(symbol, day) pairs where both arms traded. This is H3 — whether knowing "
      "which way the first candle closed is worth anything once the day has "
      "already been chosen.")
    A("")
    pu = float(np.mean(h_paired_unf)) if h_paired_unf else float("nan")
    lo_u, hi_u = gates.mean_ci95(h_paired_unf)
    A(f"**Against the random-20 control, paired by day, net:** {pu:+.4f}R "
      f"(95%: {lo_u:+.4f} to {hi_u:+.4f}) over {len(h_paired_unf):,} days both "
      "arms traded. This is H4 — the paper's claim that abnormal opening volume "
      "does almost all the work.")
    A("")
    if h_sip and h_unf:
        x = np.array([t.net_r for t in h_sip], dtype="float64")
        y = np.array([t.net_r for t in h_unf], dtype="float64")
        d = float(x.mean() - y.mean())
        se = float(np.sqrt(x.var(ddof=1) / len(x) + y.var(ddof=1) / len(y)))
        A(f"*Diagnostic, not a gate:* the same comparison unpaired at trade "
          f"level is {d:+.4f}R (95%: {d-1.96*se:+.4f} to {d+1.96*se:+.4f}), "
          f"n={len(x):,} against {len(y):,}. The gate is the paired one, "
          "because that is what was written down.")
        A("")

    A("### Held back, by year")
    A("")
    A(SUMMARY_HEADER)
    for k, v in sorted(split_by(h_sip, lambda t: str(t.day)[:4]).items()):
        A(summary_row(summarise(v, k)))
    A("")
    A("A mean carried by one calendar year is a different object from a mean "
      "spread across three. This table is here so a reader can tell which it is "
      "without asking.")
    A("")
    A("### Held back, by side")
    A("")
    A(SUMMARY_HEADER)
    for k, v in sorted(split_by(h_sip, lambda t: t.side).items()):
        A(summary_row(summarise(v, k)))
    A("")

    # --- portfolio ---------------------------------------------------------
    A("## The portfolio")
    A("")
    A("1% of equity risked a position, gross exposure capped at 4x, all of a "
      "day's positions scaled down together when the cap binds, compounded "
      "daily from $100,000. **The held-back column is the one that counts.**")
    A("")
    A("| | held back (the verdict) | contaminated 2016-2023 | whole tape | "
      "random 20, held back |")
    A("|---|---|---|---|---|")
    A(f"| total return | {pf_hb.total_return:+.1%} | {pf_cn.total_return:+.1%} | "
      f"{pf_all.total_return:+.1%} | {pf_unf_hb.total_return:+.1%} |")
    A(f"| CAGR | {pf_hb.cagr:+.1%} | {pf_cn.cagr:+.1%} | {pf_all.cagr:+.1%} | "
      f"{pf_unf_hb.cagr:+.1%} |")
    A(f"| Sharpe | {pf_hb.sharpe:.2f} | {pf_cn.sharpe:.2f} | {pf_all.sharpe:.2f} | "
      f"{pf_unf_hb.sharpe:.2f} |")
    A(f"| max drawdown | {pf_hb.max_drawdown:.1%} | {pf_cn.max_drawdown:.1%} | "
      f"{pf_all.max_drawdown:.1%} | {pf_unf_hb.max_drawdown:.1%} |")
    A(f"| days the 4x cap bound | {pf_hb.capped_days}/{pf_hb.n_days} | "
      f"{pf_cn.capped_days}/{pf_cn.n_days} | {pf_all.capped_days}/{pf_all.n_days} | "
      f"{pf_unf_hb.capped_days}/{pf_unf_hb.n_days} |")
    A("")
    A("ENGINE-6's stop was so tight that the 4x cap bound on every single day; "
      "a six-times-wider stop buys six times fewer shares for the same 1% risk, "
      "so the row above is a different portfolio, not a rescaled one.")
    A("")

    # --- the contaminated window -------------------------------------------
    A(f"## The contaminated window, {gates.SIPV2_CONTAMINATED[0]} → "
      f"{gates.SIPV2_CONTAMINATED[1]} — a disclosure, not a verdict")
    A("")
    A("This is the window the stop-width sweep was run on. Nothing here can "
      "raise or lower the verdict, and it is printed only so that the reader "
      "can see the size of the gap between a number chosen on a window and a "
      "number measured off it.")
    A("")
    _arm_block(A, c_sip, c_flip, c_unf, cg,
               _gross(c_flip), _gross(c_unf))
    A("")
    A("### The whole tape, by year")
    A("")
    A(SUMMARY_HEADER)
    for k, v in sorted(split_by(sip, lambda t: str(t.day)[:4]).items()):
        A(summary_row(summarise(v, k)))
    A("")

    # --- v1 vs v2 ----------------------------------------------------------
    A("## What the stop alone did — `orb_sip.v1` and `orb_sip.v2` on the same tape")
    A("")
    A("Both models were replayed in the same pass over the same bars with the "
      "same selection, so this is a paired comparison of one rule change and "
      "nothing else. v1's numbers here are a re-run, and they should match "
      "[its report](orb_sip.v1.polygon-sip-v1.md); if they do not, one of the "
      "two runs is wrong and that is worth more than either result.")
    A("")
    A("| window | model | n | mean gross R | mean net R | median net R | hit | stopped |")
    A("|---|---|---|---|---|---|---|---|")
    for wl, v2t, v1t in (("held back", h_sip, h_v1),
                         ("contaminated 2016-2023", c_sip, c_v1)):
        for mn, ts in (("orb_sip.v1", v1t), ("orb_sip.v2", v2t)):
            ss = summarise(ts, mn)
            gm = _gross(ts)
            A(f"| {wl} | {mn} | {ss.n} | {fmt(gm[0],4)} | {fmt(ss.mean_r,4)} | "
              f"{fmt(ss.median_r,4)} | {fmt(ss.hit_rate*100,1)}% | "
              f"{fmt(_stopped_share(ts)*100,1)}% |")
    A("")
    pv = _paired_gross(h_sip, h_v1)
    if pv:
        lo_v, hi_v = gates.mean_ci95(pv)
        A(f"Paired on the held-back window, v2 minus v1, gross: "
          f"{float(np.mean(pv)):+.4f}R (95%: {lo_v:+.4f} to {hi_v:+.4f}) over "
          f"{len(pv):,} identical entries. **R is not the same unit in the two "
          "models** — v1 risks a tenth of an ATR and v2 risks a whole opening "
          "range, so v2's R is roughly six times more money. The paired number "
          "is a statement about which rule survived its own stop, not about "
          "which made more dollars; the portfolio table is where the dollars "
          "are.")
        A("")

    # --- stop geometry -----------------------------------------------------
    A("## Stop geometry, held-back window")
    A("")
    geo_v1 = _stop_geometry(h_v1, atr)
    A("| | `orb_sip.v1` (10% of ATR) | `orb_sip.v2` (opposite extreme) |")
    A("|---|---|---|")
    A(f"| median stop distance | {fmt(geo_v1.get('cents',float('nan')),1)} cents | "
      f"{fmt(geo_hb.get('cents',float('nan')),1)} cents |")
    A(f"| as % of price | {fmt(geo_v1.get('pct',float('nan')),3)}% | "
      f"{fmt(geo_hb.get('pct',float('nan')),3)}% |")
    A(f"| in 14-day ATRs | {fmt(geo_v1.get('atr',float('nan')),3)} | "
      f"{fmt(geo_hb.get('atr',float('nan')),3)} |")
    A(f"| commission as a share of risk | {fmt(geo_v1.get('commission_r',float('nan')),4)}R | "
      f"{fmt(geo_hb.get('commission_r',float('nan')),4)}R |")
    A(f"| trades stopped out | {fmt(_stopped_share(h_v1)*100,1)}% | "
      f"{fmt(stopped_hb*100,1)}% |")
    A("")
    A(f"- exits, held back: {dict(sorted(hs.exit_mix.items()))}")
    A(f"- trades resolved by the stop-before-target assumption: {hs.ambiguous_bars}")
    A("")
    A("The cost drag is the reason ENGINE-4 and ENGINE-5 kept measuring the same "
      "law: cost as a fraction of risk is `cost per share / stop distance`, so a "
      "six-times-wider stop pays a sixth of the commission per unit of risk.")
    A("")

    # --- rvol deciles ------------------------------------------------------
    A("### By relative-volume decile, held-back window")
    A("")
    rvol = {(r["symbol"], int(r["day"])): float(r["rvol"])
            for r in sel["rows"] if r["arm"] == ARM_SIP}
    vals = np.array([rvol.get((t.symbol, t.day), np.nan) for t in h_sip])
    ok = np.isfinite(vals)
    if ok.sum() > 10:
        qs = np.quantile(vals[ok], np.linspace(0, 1, 11))
        A(SUMMARY_HEADER)
        for i in range(10):
            lo_q, hi_q = qs[i], qs[i + 1]
            grp = [t for t, v in zip(h_sip, vals)
                   if np.isfinite(v) and lo_q <= v < (hi_q if i < 9 else np.inf)]
            if grp:
                A(summary_row(summarise(grp, f"rvol {lo_q:.1f}-{hi_q:.1f}")))
        A("")
        A("ENGINE-6 found this gradient monotone and pointing the WRONG way — "
          "the more abnormal the opening volume, the worse the trade. Whether "
          "it still points that way at this stop is the most informative single "
          "table in this report, because the paper's whole claim is that the "
          "gradient should point the other way.")
        A("")

    # --- cost sensitivity --------------------------------------------------
    A("## Cost sensitivity — disclosed, and not a result")
    A("")
    A("The pre-registered cost model is $0.005/share/side plus 1.0 bp of adverse "
      "slippage, unchanged for the seventh time. These rows re-run the identical "
      "selection under two other cost models on the held-back window. **The gate "
      "is after the pre-registered costs and does not move.**")
    A("")
    A("| cost model | n | mean R | median R | hit | PF |")
    A("|---|---|---|---|---|---|")
    for lbl, ts in (("pre-registered (the result)", h_sip),
                    ("quarter-bp slippage", _window(a["sip_cheap"], hb_lo, hb_hi)),
                    ("zero cost (true gross)", _window(a["sip_nocost"], hb_lo, hb_hi))):
        if not ts:
            continue
        ss = summarise(ts, lbl)
        A(f"| {lbl} | {ss.n} | {fmt(ss.mean_r,4)} | {fmt(ss.median_r,4)} | "
          f"{fmt(ss.hit_rate*100,1)}% | {fmt(ss.profit_factor,2)} |")
    A("")

    # --- how sure are we ---------------------------------------------------
    A("## How sure we actually are, and what would change the answer")
    A("")
    yrs = sorted(split_by(h_sip, lambda t: str(t.day)[:4]).items())
    pos = sum(1 for _, v in yrs if summarise(v, "").mean_r > 0)
    A(f"- The verdict rests on **{len(h_sip):,} trades over "
      f"{len(days_hb):,} sessions** and {len(yrs)} calendar years, of which "
      f"**{pos} of {len(yrs)}** were positive on their own. Three years is a "
      "small number of independent regimes, whatever the trade count says: "
      "trades on the same day are not independent of each other, which is why "
      "H4 is paired by day rather than by trade.")
    A(f"- The 95% interval on the held-back mean net R is {lo_hb:+.4f} to "
      f"{hi_hb:+.4f} "
      + ("— it excludes zero." if lo_hb > 0 or hi_hb < 0 else
         "— it CONTAINS zero, so the average trade is not distinguishable from "
         "zero at this sample size.") )
    A("- **This is the held-back window's second use.** `orb_sip.v1` spent one "
      "look on it. Every look costs some of what makes a held-back window worth "
      "holding back, and there is no correction applied for that here. There is "
      "no third look: the gate ruled out a third stop width before this run "
      "started.")
    A("- **What would change the answer, in order of how much it would move it:** "
      "(1) a different fill model — every entry here is a resting stop order "
      "filled at the worse of the level and the bar's open, and real fills on "
      "the most volatile names of the morning are worse than that; (2) "
      "borrow availability and cost on the short side, which this harness does "
      "not model at all and which is not free on a stock that just gapped on "
      "news; (3) the 4x leverage cap, which decides how much of the per-trade "
      "edge survives into the portfolio number; (4) the pool, which is the top "
      f"{sel['pool_n']:,} of the eligible universe by dollar volume rather than "
      "all of it.")
    A("- **What this report does NOT establish**: that the model is worth "
      "trading. A pre-registered gate cleared on a held-back window is the "
      "beginning of that conversation, not the end of it. Nothing here has been "
      "run forward on unseen data in real time, and no live-execution question "
      "— borrow, halts, locked markets, partial fills on twenty simultaneous "
      "orders at 09:35 — has been touched.")
    A("")

    # --- census, selection, data ------------------------------------------
    A("## Census")
    A("")
    A("| | stocks in play | random 20 |")
    A("|---|---|---|")
    for k in sorted(set(sip_census) | set(unf_census)):
        A(f"| {k} | {sip_census.get(k,0):,} | {unf_census.get(k,0):,} |")
    A(f"| symbol-days with no cached bars | {sip_missing:,} | {unf_missing:,} |")
    A("")
    A("## Selection, and the lookahead treatment")
    A("")
    A("Unchanged from ENGINE-6 and not recomputed — this run reads "
      "`selection.json.gz` as ENGINE-6 wrote it.")
    A("")
    A(f"- pool: top {sel['pool_n']:,} of the eligible set by 20-day average "
      "dollar volume as of the prior close")
    A(f"- selection: top {sel['top_k']} by 09:30-09:35 volume over the mean of "
      f"the same five minutes across the previous {sel['baseline_days']} "
      f"sessions, floor {sel['min_rvol']:.1f}")
    A("- the parquet on disk holds only 09:30-10:30 of each session, so the "
      "afternoon of the day being selected for was never written; "
      "`tests/test_sip_selection.py` runs the poisoned-future and "
      "amputated-future attacks against `select_day`, requires an identical "
      "selection when the rest of the session is deleted from disk, and catches "
      "a deliberately cheating selector with the same harness")
    A("")
    A("## Costs and fills")
    A("")
    A(f"- ${COSTS.commission_per_share:.3f}/share/side commission, "
      f"{COSTS.slippage_bps:.1f} bp adverse slippage on market and stop fills")
    A("- entry is a resting stop order, filled at the worse of the level and the "
      "bar's open, plus slippage")
    A("- the stop is a LEVEL, not a distance carried from the fill: a gap "
      "through the entry costs the trader more risk, and the R it is divided by "
      "is measured from the fill that actually happened")
    A("")
    REPORT.parent.mkdir(parents=True, exist_ok=True)
    REPORT.write_text("\n".join(L) + "\n")
    print("\n".join(L[:60]))
    print(f"\nwrote {REPORT}")

    dump = REPORT.with_suffix(".trades.csv.gz")
    with gzip.open(dump, "wt") as f:
        f.write("arm,model_id,symbol,day,side,entry_minute,exit_minute,fill_price,"
                "stop_price,exit_price,exit_reason,risk_per_share,gross_r,net_r,"
                "mae_r,mfe_r\n")
        for arm, ts in ((ARM_SIP, sip), ("coinflip", flip),
                        (ARM_UNFILTERED, unf), ("v1", v1)):
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


if __name__ == "__main__":
    raise SystemExit(main())
