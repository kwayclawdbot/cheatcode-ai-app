"""ENGINE-8 — `orb_sip.v3` and `orb_sip.v3_15m`: the daily trend must agree.

    .venv/bin/python run_engine8.py

There is no `--stage plan`. The selection is ENGINE-6's, read from
`data/polygon-sip-v1/selection.json.gz` exactly as it was written, so every
model in this programme's stocks-in-play family trades the same candidate
symbol-days and nothing about the universe, the pool, the relative-volume
ranking or the anti-lookahead treatment is recomputed or re-downloaded. The
daily bars the trend is read off come from the grouped files already in the
snapshot. Nothing is fetched.

There is also no parameter to vary, and that is the point of this file. The
window was fixed by the owner, the trend definition is ENGINE-2's and is reused
without a number changed, and the two models differ from each other in the
length of the opening range and in nothing else. A runner with a knob on it
would invite a second look at a held-back year that is already on its third.
There is no knob.
"""

from __future__ import annotations

import gzip
import json
import sys
from dataclasses import dataclass
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from engine import calendar_us  # noqa: E402
from engine.backtest.stats import (SUMMARY_HEADER, fmt, split_by,  # noqa: E402
                                   summarise, summary_row)
from engine.models import gates  # noqa: E402
from engine.models.orb_sip_v2 import (OrbStocksInPlayV2,  # noqa: E402
                                      OrbStocksInPlayV2Coinflip)
from engine.models.orb_sip_v3 import (OrbSipV2M5Opposite,  # noqa: E402
                                      OrbSipV2M15, OrbSipV2M15Coinflip,
                                      OrbSipV2M15Opposite, OrbStocksInPlayV3,
                                      OrbStocksInPlayV3M15)
from engine.run_engine6 import (ARM_SIP, ARM_UNFILTERED, CHEAP,  # noqa: E402
                                COSTS, FREE, SELECTION_PATH, _atr_map,
                                _paired_by_day, _paired_gross, _replay, _window)
from engine.sip import config as scfg  # noqa: E402
from engine.sip import daily as sipdaily  # noqa: E402
from engine.sip.portfolio import run_portfolio  # noqa: E402

REPORT = Path(__file__).resolve().parent / "reports" / f"orb_sip.v3.{scfg.SNAPSHOT}.md"
RISK_DOLLARS = 1_000.0     # the owner reads money; this is the gloss on every R


def _d(s: str) -> int:
    return int(s.replace("-", ""))


BUILD_LO, BUILD_HI = (_d(x) for x in gates.SIPV3_BUILD)
HB_LO, HB_HI = (_d(x) for x in gates.SIPV3_HELD_BACK)
WINDOW_LO, WINDOW_HI = BUILD_LO, HB_HI


# --- small statistics, all of them printed rather than hidden ---------------

def _gross(trades) -> tuple[float, float]:
    if not trades:
        return float("nan"), float("nan")
    g = np.array([t.gross_r for t in trades], dtype="float64")
    return float(np.mean(g)), float(np.median(g))


def _mean_net(trades) -> float:
    return float(np.mean([t.net_r for t in trades])) if trades else float("nan")


def _stopped_share(trades) -> float:
    if not trades:
        return float("nan")
    return sum(1 for t in trades if t.exit_reason == "stop") / len(trades)


def _hit(trades) -> float:
    if not trades:
        return float("nan")
    return sum(1 for t in trades if t.net_r > 0) / len(trades)


def _ci(values) -> tuple[float, float]:
    return gates.mean_ci95(list(values))


def _two_sample(a, b) -> tuple[float, float, float]:
    """mean(a) - mean(b) and its 95% interval. Unpaired, unequal variance."""
    if len(a) < 2 or len(b) < 2:
        return (float("nan"),) * 3
    x, y = np.array(a, dtype="float64"), np.array(b, dtype="float64")
    d = float(x.mean() - y.mean())
    se = float(np.sqrt(x.var(ddof=1) / len(x) + y.var(ddof=1) / len(y)))
    return d, d - 1.96 * se, d + 1.96 * se


def _money(r: float) -> str:
    return "n/a" if r != r else f"{r * RISK_DOLLARS:+,.0f}"


def _keys(trades) -> set[tuple[str, int]]:
    return {(t.symbol, t.day) for t in trades}


def _by_key(trades) -> dict[tuple[str, int], object]:
    return {(t.symbol, t.day): t for t in trades}


def _stop_geometry(trades, atr) -> dict:
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


# --- one variant of the model, with everything measured about it ------------

@dataclass
class Variant:
    key: str                 # "5m" | "15m"
    model_id: str
    prefix: str              # "T" | "U"
    range_label: str
    model: list              # the trend-gated model
    base: list               # the same model WITHOUT the trend gate
    flip: list               # the matched coin flip, ungated, same geometry
    opp: list                # diagnostic: the side the candle did not point at
    rnd: list                # the model's rules on twenty random eligible names
    free: list               # cost sensitivity: zero cost
    cheap: list              # cost sensitivity: quarter-bp slippage


def _hb(ts):
    return _window(ts, HB_LO, HB_HI)


def _bd(ts):
    return _window(ts, BUILD_LO, BUILD_HI)


def gate_rows_for(v: Variant, days_hb):
    m = _hb(v.model)
    s = summarise(m, v.model_id)
    g = _gross(m)
    paired_flip = _paired_gross(m, _hb(v.flip))
    paired_rnd = _paired_by_day(m, _hb(v.rnd))
    pf = run_portfolio(m, days_hb)
    rows = gates.evaluate_sip_v3(s, g[0], paired_flip, paired_rnd, pf, v.prefix)
    return rows, gates.verdict_sip_v3(rows), s, g, paired_flip, paired_rnd, pf


# --- the analysis the brief exists for --------------------------------------

def two_way_keys(base, opp) -> set[tuple[str, int]]:
    """The mornings on which BOTH ends of the opening range broke.

    A resting stop order at each extreme; both filled. ENGINE-7 could only see
    these indirectly — as the pairs where its coin flip happened to draw the
    other side — so it saw a random half of them. This sees all of them, from
    the tape, under the same fill model as the model itself.
    """
    return _keys(base) & _keys(opp)


def two_way_block(A, v: Variant, window_label: str, ts_base, ts_opp, ts_model):
    """The subset ENGINE-7 diagnosed, before and after the filter."""
    both = two_way_keys(ts_base, ts_opp)
    base_by, opp_by = _by_key(ts_base), _by_key(ts_opp)
    model_keys = _keys(ts_model)

    tw_base = [base_by[k] for k in sorted(both)]
    tw_opp = [opp_by[k] for k in sorted(both)]
    one_way = [t for t in ts_base if (t.symbol, t.day) not in both]

    kept = [t for t in tw_base if (t.symbol, t.day) in model_keys]
    cut = [t for t in tw_base if (t.symbol, t.day) not in model_keys]

    A(f"**{window_label}.** Of {len(ts_base):,} mornings the ungated "
      f"{v.range_label} model traded, **{len(both):,} broke BOTH ends of the "
      f"opening range** ({100.0*len(both)/max(len(ts_base),1):.1f}%) and "
      f"{len(one_way):,} broke only one.")
    A("")
    A("| subset | n | mean gross R | mean net R | per $1,000 risked | median net R | hit | stopped |")
    A("|---|---|---|---|---|---|---|---|")
    for label, ts in (("both ends broke — the candle's side (this is v2)", tw_base),
                      ("both ends broke — the OTHER side", tw_opp),
                      ("both ends broke — kept by the trend filter", kept),
                      ("both ends broke — removed by the trend filter", cut),
                      ("only one end broke — the candle's side", one_way)):
        if not ts:
            A(f"| {label} | 0 | n/a | n/a | n/a | n/a | n/a | n/a |")
            continue
        ss = summarise(ts, label)
        A(f"| {label} | {ss.n:,} | {fmt(_gross(ts)[0],4)} | {fmt(ss.mean_r,4)} | "
          f"{_money(ss.mean_r)} | {fmt(ss.median_r,4)} | "
          f"{fmt(ss.hit_rate*100,1)}% | {fmt(_stopped_share(ts)*100,1)}% |")
    A("")

    if kept and cut:
        d, lo, hi = _two_sample([t.net_r for t in kept], [t.net_r for t in cut])
        A(f"On the two-way-break mornings the filter kept {len(kept):,} of "
          f"{len(tw_base):,} and removed {len(cut):,}. Kept minus removed is "
          f"**{d:+.4f}R** (95%: {lo:+.4f} to {hi:+.4f}), i.e. {_money(d)} "
          "dollars a trade on $1,000 of risk. "
          + ("The interval excludes zero: on the subset this filter was brought "
             "in to fix, it is separating the trades that worked from the ones "
             "that did not."
             if lo > 0 else
             "**The interval contains zero**, so on the subset this filter was "
             "brought in to fix, it is not measurably telling the two apart."
             if hi > 0 else
             "**The interval excludes zero in the WRONG direction**: on the "
             "subset this filter was brought in to fix, the trades it removed "
             "did better than the ones it kept."))
        A("")

    # Does the trend point at the side that actually paid? A diagnostic, and a
    # NEW model if anyone ever wanted to trade it, so it is fenced as one.
    agree = [t for t in tw_base if t.meta.get("daily_trend") == (
        "up" if t.side == "long" else "down")]
    oppose_keys = [(t.symbol, t.day) for t in tw_base
                   if t.meta.get("daily_trend") == (
                       "down" if t.side == "long" else "up")]
    took_other = [opp_by[k] for k in oppose_keys if k in opp_by]
    if agree and took_other:
        A("*Diagnostic, fenced: not a gate, and trading it would be a NEW model "
          "needing its own pre-registration.* On the two-way-break mornings the "
          "trend has three states. Where it agreed with the candle, the "
          f"candle's side returned {_mean_net(agree):+.4f}R net ({_money(_mean_net(agree))} "
          f"per $1,000, n={len(agree):,}). Where it OPPOSED the candle — the "
          "mornings v3 sits out — the side the trend pointed at instead "
          f"returned {_mean_net(took_other):+.4f}R ({_money(_mean_net(took_other))}, "
          f"n={len(took_other):,}). "
          + ("So the trend was pointing at the better end of a two-way break, "
             "and the model that acts on that is not this one — this one only "
             "declines to take the worse end."
             if _mean_net(took_other) > _mean_net(agree) else
             "So following the trend onto the other side would not have been "
             "better than what the model does, which is to sit out."))
        A("")
    return both


def removed_block(A, v: Variant, ts_base, ts_model, window_label: str,
                  exclude: set[tuple[str, int]] | None = None):
    """What the filter threw away, and whether it was worth keeping."""
    model_keys = _keys(ts_model)
    base = ts_base if exclude is None else [
        t for t in ts_base if (t.symbol, t.day) not in exclude]
    kept = [t for t in base if (t.symbol, t.day) in model_keys]
    cut = [t for t in base if (t.symbol, t.day) not in model_keys]
    if not (kept and cut):
        A(f"*{window_label}: not enough trades on both sides of the filter to "
          "compare.*")
        A("")
        return None
    d, lo, hi = _two_sample([t.net_r for t in kept], [t.net_r for t in cut])
    A(f"| {window_label} | n | mean net R | per $1,000 risked | median net R | hit | stopped |")
    A("|---|---|---|---|---|---|---|")
    for label, ts in (("kept by the filter (the model)", kept),
                      ("REMOVED by the filter", cut)):
        ss = summarise(ts, label)
        A(f"| {label} | {ss.n:,} | {fmt(ss.mean_r,4)} | {_money(ss.mean_r)} | "
          f"{fmt(ss.median_r,4)} | {fmt(ss.hit_rate*100,1)}% | "
          f"{fmt(_stopped_share(ts)*100,1)}% |")
    A("")
    A(f"The filter removed **{len(cut):,} of {len(base):,} trades** "
      f"({100.0*len(cut)/len(base):.0f}%). Kept minus removed is **{d:+.4f}R** "
      f"(95%: {lo:+.4f} to {hi:+.4f}) — {_money(d)} dollars a trade on $1,000 "
      "of risk.")
    A("")
    if _mean_net(cut) > _mean_net(kept):
        A("**The filter is discarding winners.** The trades it removed returned "
          f"{_mean_net(cut):+.4f}R and the ones it kept returned "
          f"{_mean_net(kept):+.4f}R. The gate required this sentence in these "
          "words if it happened, whatever the verdict says: a filter that skips "
          "trades which would have won is not helping, even if the average of "
          "what is left improves.")
        A("")
    return d, lo, hi


# --- the run ----------------------------------------------------------------

def main() -> int:
    with gzip.open(SELECTION_PATH, "rt") as f:
        sel = json.load(f)
    rows = [r for r in sel["rows"] if WINDOW_LO <= int(r["day"]) <= WINDOW_HI]
    pairs = {(r["symbol"], int(r["day"])) for r in rows}
    atr = _atr_map(pairs)
    print(f"selection (ENGINE-6's, reused, narrowed to "
          f"{gates.SIPV3_BUILD[0]}..{gates.SIPV3_HELD_BACK[1]}): "
          f"{len(rows):,} rows, {len(pairs):,} symbol-days, "
          f"{len(atr):,} with an ATR", flush=True)

    print("building the daily trend from the grouped bars already on disk "
          "(nothing is fetched)...", flush=True)
    trend, tcensus = sipdaily.load_or_build(pairs)
    print(f"  daily trend: {tcensus}", flush=True)

    arms: dict[str, dict[str, set[int]]] = {ARM_SIP: {}, ARM_UNFILTERED: {}}
    for r in rows:
        arms[r["arm"]].setdefault(r["symbol"], set()).add(int(r["day"]))

    def gated(cls):
        return lambda a: cls(a, trend)

    print("replaying the stocks-in-play arm — both variants, their ungated "
          "bases, their controls and the opposite side...", flush=True)
    a, ac, sip_missing = _replay(arms[ARM_SIP], atr, [
        ("v3", gated(OrbStocksInPlayV3), COSTS),
        ("base", OrbStocksInPlayV2, COSTS),
        ("flip", OrbStocksInPlayV2Coinflip, COSTS),
        ("opp", OrbSipV2M5Opposite, COSTS),
        ("v3_free", gated(OrbStocksInPlayV3), FREE),
        ("v3_cheap", gated(OrbStocksInPlayV3), CHEAP),
        ("v3_15", gated(OrbStocksInPlayV3M15), COSTS),
        ("base_15", lambda x: OrbSipV2M15(x, trend), COSTS),
        ("flip_15", lambda x: OrbSipV2M15Coinflip(x, trend), COSTS),
        ("opp_15", lambda x: OrbSipV2M15Opposite(x, trend), COSTS),
        ("v3_15_free", gated(OrbStocksInPlayV3M15), FREE),
        ("v3_15_cheap", gated(OrbStocksInPlayV3M15), CHEAP),
    ])
    print("replaying the random-20 control, both variants...", flush=True)
    b, bc, unf_missing = _replay(arms[ARM_UNFILTERED], atr, [
        ("rnd", gated(OrbStocksInPlayV3), COSTS),
        ("rnd_15", gated(OrbStocksInPlayV3M15), COSTS),
    ])
    print(f"trades: v3={len(a['v3']):,} base={len(a['base']):,} "
          f"v3_15={len(a['v3_15']):,} base15={len(a['base_15']):,} "
          f"rnd={len(b['rnd']):,} rnd15={len(b['rnd_15']):,}", flush=True)

    # An integrity check, not a result. The gated model can only ever be a
    # SUBSET of its ungated base — same range, same side, same levels, one
    # extra reason to skip. If it is not, the two are not comparable and
    # "what the filter removed" is not a meaningful quantity.
    for gid, bid in (("v3", "base"), ("v3_15", "base_15")):
        extra = _keys(a[gid]) - _keys(a[bid])
        assert not extra, f"{gid} traded {len(extra)} symbol-days {bid} did not"

    v5 = Variant("5m", "orb_sip.v3", "T", "5-minute", a["v3"], a["base"],
                 a["flip"], a["opp"], b["rnd"], a["v3_free"], a["v3_cheap"])
    v15 = Variant("15m", "orb_sip.v3_15m", "U", "15-minute", a["v3_15"],
                  a["base_15"], a["flip_15"], a["opp_15"], b["rnd_15"],
                  a["v3_15_free"], a["v3_15_cheap"])

    write_report(sel, [v5, v15], atr, trend, tcensus, ac, bc,
                 sip_missing, unf_missing)
    return 0


def write_report(sel, variants: list[Variant], atr, trend, tcensus,
                 sip_census, unf_census, sip_missing, unf_missing) -> None:
    days_hb = [_d(x) for x in calendar_us.trading_days(*gates.SIPV3_HELD_BACK)]
    days_bd = [_d(x) for x in calendar_us.trading_days(*gates.SIPV3_BUILD)]

    ev = {}
    for v in variants:
        ev[v.key] = gate_rows_for(v, days_hb)

    L: list[str] = []
    A = L.append
    A("# `orb_sip.v3` and `orb_sip.v3_15m` — the daily trend has to agree")
    A("")
    A("**Two models, one held-back year, and both verdicts are printed here "
      "before anything else.**")
    A("")
    A("| model | opening range | held-back trades | mean net R | per $1,000 risked | verdict |")
    A("|---|---|---|---|---|---|")
    for v in variants:
        rows, verdict, s, g, *_ = ev[v.key]
        A(f"| `{v.model_id}` | {v.range_label} | {s.n:,} | {fmt(s.mean_r,4)} | "
          f"{_money(s.mean_r)} | **{verdict}** |")
    A("")
    A(f"Decided on {gates.SIPV3_HELD_BACK[0]} → {gates.SIPV3_HELD_BACK[1]} and "
      "on nothing else. Snapshot "
      f"`{scfg.SNAPSHOT}`, unchanged and not re-downloaded; selection reused "
      "byte for byte from ENGINE-6; daily bars read from the grouped files "
      "already in it. Gates: "
      "[`../models/orb_sip.v3/GATE.md`](../models/orb_sip.v3/GATE.md) and "
      "[`../models/orb_sip.v3_15m/GATE.md`](../models/orb_sip.v3_15m/GATE.md), "
      "both committed before any number below existed.")
    A("")

    # --- plain English -----------------------------------------------------
    A("## In plain English")
    A("")
    A("**What this is.** ENGINE-7's model, plus one rule. Each morning, take "
      "the twenty US stocks whose first five minutes traded the most abnormal "
      "volume against their own recent mornings. Draw the opening range — the "
      "first five minutes for one model, the first fifteen for the other. Buy "
      "a break above its high if that candle closed up, sell short a break "
      "below its low if it closed down, hold to the bell, and stop out if "
      "price comes back through the other end of the range. **The new rule: "
      "only take the long if the stock's DAILY chart is already in a confirmed "
      "uptrend, and only take the short if it is in a confirmed downtrend. If "
      "the daily chart is sideways, or pointing the other way, do not trade — "
      "not a smaller trade, no trade.** The daily chart is read on the last "
      "fully closed daily bar, never on the day being traded.")
    A("")
    A("**Why it was worth trying.** ENGINE-7 made about $20 per $1,000 risked "
      "a trade and could not tell that apart from zero — but it found exactly "
      "where its losses lived. On the mornings when price broke BOTH ends of "
      "the opening range, the end the first candle pointed at was the losing "
      "end: -0.735R against the other side's -0.271R. The model had no rule "
      "for choosing between two breaks. A daily trend filter is precisely such "
      "a rule, so this lane asks one question above all the others: **does the "
      "daily trend pick the right side of a two-way break?**")
    A("")
    A("**Three things about the evidence, said before the numbers rather than "
      "after them.**")
    A("")
    A("1. **The held-back year is not virgin data.** ENGINE-7's diagnosis was "
      "measured on 2024-01-01 → 2026-08-28, and the verdict window here sits "
      "inside that span. No parameter was fitted on it and the trend "
      "definition is ENGINE-2's, reused without a number changed — but the "
      "decision to try a trend filter at all was taken after looking at data "
      "that includes this year. **Suggestive, not conclusive**, and nothing "
      "below may be read more strongly than that.")
    A("2. **Two models, one year.** With two 95% intervals the chance that at "
      "least one clears zero by luck is about 10%, not 5%. No correction is "
      "applied to the intervals; instead both outcomes are printed above, in "
      "the order they were specified, and neither is led with.")
    A("3. **Five years was the owner's choice and it is not widened.** "
      "Everything before 2021-08-29 stays in the cache and is not the subject. "
      "If a variant comes in thin, the answer is INCONCLUSIVE, never a wider "
      "window.")
    A("")

    for v in variants:
        rows, verdict, s, g, paired_flip, paired_rnd, pf = ev[v.key]
        m = _hb(v.model)
        base_hb = _hb(v.base)
        lo, hi = _ci([t.net_r for t in m])
        A(f"### `{v.model_id}` — the {v.range_label} range")
        A("")
        A(f"- **Trades**: **{len(m):,}** in the held-back year, "
          f"{len(_bd(v.model)):,} in the four-year build window. Its ungated "
          f"base took {len(base_hb):,} in the same held-back year, so the "
          f"filter removed **{len(base_hb) - len(m):,}** of them "
          f"({100.0*(len(base_hb)-len(m))/max(len(base_hb),1):.0f}%).")
        if len(m) < gates.SIPV3_MIN_TRADES:
            A(f"- **The sample is below the pre-registered floor of "
              f"{gates.SIPV3_MIN_TRADES}.** The gate says in that case the "
              "verdict is INCONCLUSIVE and nothing else is read. The numbers "
              "below are printed for completeness and are not a result.")
        A(f"- **Did it make money**: **{'yes' if s.mean_r > 0 else 'no'}**. "
          f"After commission and slippage the average trade returned "
          f"{s.mean_r:+.4f} times what was risked on it — **{_money(s.mean_r)} "
          f"dollars per $1,000 risked**, over {len(m):,} trades. The middle "
          f"trade returned {s.median_r:+.4f} ({_money(s.median_r)} dollars) and "
          f"{s.hit_rate:.1%} finished green.")
        A(f"- **How much of that is luck**: the 95% range around the average is "
          f"{lo:+.4f} to {hi:+.4f} times risk — {_money(lo)} to {_money(hi)} "
          "dollars a trade. "
          + ("**That range contains zero**, so the average trade is NOT "
             "distinguishable from breaking even at this sample size, whatever "
             "the sign of the middle number."
             if lo <= 0 <= hi else
             "That range does not contain zero, so the sign of the average is "
             "not an artefact of the sample size."))
        A(f"- **Stopped out**: {_stopped_share(m):.1%} of trades, against "
          f"{_stopped_share(base_hb):.1%} for the same model without the "
          "filter.")
        rnd_s = summarise(_hb(v.rnd), "random 20")
        A(f"- **Against twenty random eligible names** traded under identical "
          f"rules, trend gate included: {rnd_s.mean_r:+.4f}R "
          f"({_money(rnd_s.mean_r)} dollars) over {rnd_s.n:,} trades.")
        A(f"- **As a portfolio** — 1% of the account risked per position, "
          f"gross exposure capped at 4x, compounded daily from $100,000 — the "
          f"held-back year returned **{pf.total_return:+.1%}** "
          f"(${100_000*(1+pf.total_return):,.0f}) at a Sharpe of "
          f"{pf.sharpe:.2f} with a worst drawdown of {pf.max_drawdown:.1%}.")
        A(f"- **Verdict**: **{verdict}**. " + " ".join(
            f"{x.id} {'passed' if x.passed else 'FAILED'} ({x.name})."
            for x in rows))
        A("")

    # --- the question this lane exists for ---------------------------------
    A("## The two-way-break mornings — the thing the filter was brought in for")
    A("")
    A("ENGINE-7 located its whole deficit against a coin flip in the mornings "
      "on which price broke BOTH ends of the opening range, and could only see "
      "those mornings indirectly — as the pairs where its coin happened to draw "
      "the other side, which is a random half of them. This lane identifies "
      "them from the tape: a resting stop order is placed at each end of the "
      "range under the same fill model, and a morning on which both filled is a "
      "morning on which both ends broke. Every such morning is counted, not "
      "half of them.")
    A("")
    for v in variants:
        A(f"### `{v.model_id}`")
        A("")
        two_way_block(A, v, f"Held back, {gates.SIPV3_HELD_BACK[0]} → "
                      f"{gates.SIPV3_HELD_BACK[1]}",
                      _hb(v.base), _hb(v.opp), _hb(v.model))
        two_way_block(A, v, f"Build window, {gates.SIPV3_BUILD[0]} → "
                      f"{gates.SIPV3_BUILD[1]}",
                      _bd(v.base), _bd(v.opp), _bd(v.model))

    # --- what the filter removed -------------------------------------------
    A("## What the filter removed, and what those trades did")
    A("")
    A("A filter that discards winners is not helping even if the average of "
      "what is left improves. The gated model is a strict subset of its own "
      "ungated base — same range, same side, same levels, one extra reason to "
      "skip — and the runner asserts that before it writes anything, so every "
      "trade in the base is either kept or removed and there is no third "
      "category.")
    A("")
    for v in variants:
        A(f"### `{v.model_id}`")
        A("")
        removed_block(A, v, _hb(v.base), _hb(v.model),
                      f"held back, {v.range_label}")
        removed_block(A, v, _bd(v.base), _bd(v.model),
                      f"build window, {v.range_label}")

    # --- does anything survive without the two-way mornings ----------------
    A("## Does any benefit survive once the two-way-break mornings are removed?")
    A("")
    A("If the filter only sorts out which end of a whipsaw to take, it is a "
      "tie-breaker. If it also helps on the mornings where only one end broke "
      "and there was never a choice to make, it is a directional edge. These "
      "are the same kept-minus-removed comparisons as above, restricted to the "
      "mornings on which only ONE end of the range broke.")
    A("")
    for v in variants:
        A(f"### `{v.model_id}`")
        A("")
        for label, ts_base, ts_opp, ts_model in (
                (f"held back, one-way breaks only, {v.range_label}",
                 _hb(v.base), _hb(v.opp), _hb(v.model)),
                (f"build window, one-way breaks only, {v.range_label}",
                 _bd(v.base), _bd(v.opp), _bd(v.model))):
            removed_block(A, v, ts_base, ts_model, label,
                          exclude=two_way_keys(ts_base, ts_opp))

    # --- the prior that matters --------------------------------------------
    A("## The prior: ENGINE-3 and ENGINE-5 already tested trend filters, and found nothing")
    A("")
    A("This is not the first trend filter this programme has measured, and the "
      "earlier answer was a null.")
    A("")
    A("| lane | filter | measured | result |")
    A("|---|---|---|---|")
    A("| ENGINE-2 | confirmed DAILY structure, the same definition used here | "
      "1,140 trades, 32 names | removing it changed the gross mean by +0.019R, "
      "well inside the noise |")
    A("| ENGINE-3 | 1-hour AND 4-hour structure must both agree | 448 trades "
      "from 23,904 symbol-days | the second filter mostly removed trades; the "
      "edge over the control SHRANK from +0.099R to +0.052R |")
    A("| ENGINE-5 | 1-hour structure | 11,568 paired trades, 32 names | "
      "**-0.005R against the coin flip, 95%: -0.027 to +0.016** — the tightest "
      "null in the programme |")
    A("")
    A("**That null does not settle this and it is not irrelevant either, and "
      "both halves of that sentence are meant.** It does not settle it because "
      "all three ran on a fixed 32-name basket — chosen for today's liquidity, "
      "so carrying survivorship — with a stop ENGINE-6 later showed was wrong, "
      "and none of them had the stocks-in-play selection that is the only "
      "claim ENGINE-7 established. A filter measured on a broken base measures "
      "the base. It is not irrelevant because it is three independent looks at "
      "the same idea, at two other timeframes, and all three came back at or "
      "below zero. **The prior on trend filters in this programme is a null, "
      "and this lane's job is to say whether the fourth look changes it.**")
    A("")

    # --- the bar -----------------------------------------------------------
    A("## The bar, and what it observed")
    A("")
    A("All gates are read on the held-back window only. Every threshold is "
      "ENGINE-7's H1-H5 unchanged in kind and in number except the sample "
      f"floor, which moved from 5,000 to {gates.SIPV3_MIN_TRADES} — twenty "
      "picks a session over ~251 sessions is a ceiling of about 5,000 trades "
      "before any filter is applied, so carrying 5,000 across would have "
      "returned INCONCLUSIVE by arithmetic rather than by evidence. The new "
      "floor is set from power and is stated in the gate: at n=750 the 95% "
      "half-width is about ±0.086R, enough to separate an edge worth trading "
      "(≥0.10R, ≥$100 per $1,000 risked) from zero and deliberately not enough "
      "to resolve a v2-sized +0.02R.")
    A("")
    for v in variants:
        rows, verdict, s, g, paired_flip, paired_rnd, pf = ev[v.key]
        A(f"**`{v.model_id}` — {verdict}**")
        A("")
        A("| id | gate | threshold | observed | |")
        A("|---|---|---|---|---|")
        for x in rows:
            A(f"| **{x.id}** | {x.name} | {x.threshold} | {x.observed} | "
              f"{'PASS' if x.passed else 'FAIL'} |")
        A("")
        m = _hb(v.model)
        lo, hi = _ci([t.net_r for t in m])
        if m and lo <= 0 <= hi and s.mean_r > 0:
            A(f"{v.prefix}2 asks for a positive mean, not for a mean "
              f"distinguishable from zero. The 95% interval on the held-back "
              f"mean net R is {lo:+.4f} to {hi:+.4f} and it spans zero, so a "
              f"passed {v.prefix}2 is not evidence that the per-trade edge is "
              "real. The gate said this in advance.")
            A("")
        if verdict == gates.PARTIAL_OOS:
            A("**PARTIAL is not a pass.** " + " ".join(
                f"{x.id} failed, so this is NOT established: {x.name}."
                for x in rows if not x.passed))
            A("")
        elif verdict == gates.INCONCLUSIVE_SAMPLE:
            A(f"**INCONCLUSIVE, and that is the whole answer for this "
              f"variant.** {v.prefix}1 missed the pre-registered floor of "
              f"{gates.SIPV3_MIN_TRADES} trades, so nothing else is read. The "
              "window is not widened to escape it — the owner chose five years "
              "deliberately and the last of them is the test.")
            A("")
        elif verdict == gates.FAILED_OOS:
            A("**It did not make money out of sample.** That is the whole "
              "answer for this variant.")
            A("")

    # --- the arms, in full -------------------------------------------------
    for wl, sel_fn, days in ((f"held back, {gates.SIPV3_HELD_BACK[0]} → "
                              f"{gates.SIPV3_HELD_BACK[1]} — the verdict", _hb, days_hb),
                             (f"build window, {gates.SIPV3_BUILD[0]} → "
                              f"{gates.SIPV3_BUILD[1]} — nothing was decided here, "
                              "because nothing was tuned", _bd, days_bd)):
        A(f"## The arms, {wl}")
        A("")
        A("Gross before net, median beside mean.")
        A("")
        A("| model | arm | n | mean gross R | median gross R | mean net R | "
          "per $1,000 | median net R | hit | PF | stopped |")
        A("|---|---|---|---|---|---|---|---|---|---|---|")
        for v in variants:
            for name, ts in (("the model (trend gate on)", sel_fn(v.model)),
                             ("its ungated base", sel_fn(v.base)),
                             ("random 20, same rules", sel_fn(v.rnd)),
                             ("matched coin flip", sel_fn(v.flip))):
                if not ts:
                    A(f"| `{v.model_id}` | {name} | 0 | n/a | n/a | n/a | n/a | "
                      "n/a | n/a | n/a | n/a |")
                    continue
                ss = summarise(ts, name)
                gm = _gross(ts)
                A(f"| `{v.model_id}` | {name} | {ss.n:,} | {fmt(gm[0],4)} | "
                  f"{fmt(gm[1],4)} | {fmt(ss.mean_r,4)} | {_money(ss.mean_r)} | "
                  f"{fmt(ss.median_r,4)} | {fmt(ss.hit_rate*100,1)}% | "
                  f"{fmt(ss.profit_factor,2)} | {fmt(_stopped_share(ts)*100,1)}% |")
        A("")

    # --- the controls, paired ----------------------------------------------
    A("## The two controls, paired")
    A("")
    for v in variants:
        rows, verdict, s, g, paired_flip, paired_rnd, pf = ev[v.key]
        A(f"**`{v.model_id}`.**")
        if paired_flip:
            pm = float(np.mean(paired_flip))
            lo_f, hi_f = gates.mean_ci95(paired_flip)
            A(f"Against the matched coin flip, paired, gross: {pm:+.4f}R "
              f"(95%: {lo_f:+.4f} to {hi_f:+.4f}) over {len(paired_flip):,} "
              f"(symbol, day) pairs where both arms traded. This is "
              f"{v.prefix}3, the gate ENGINE-7 failed at -0.1317R. The coin "
              "flip only trades when the side it drew actually broke, so the "
              "pairs where the two arms disagree are, by construction, "
              "two-way-break mornings — which is why the section above "
              "measures those directly instead of through this number.")
        else:
            A("The matched coin flip produced no overlapping pairs.")
        A("")
        if paired_rnd:
            pu = float(np.mean(paired_rnd))
            lo_u, hi_u = gates.mean_ci95(paired_rnd)
            A(f"Against twenty random eligible names under identical rules, "
              f"paired by day, net: {pu:+.4f}R (95%: {lo_u:+.4f} to "
              f"{hi_u:+.4f}) over {len(paired_rnd):,} days both arms traded. "
              f"This is {v.prefix}4 — the paper's claim that abnormal opening "
              "volume does almost all the work, re-asked with the trend gate "
              "on both sides of the comparison.")
        A("")

    # --- portfolio ---------------------------------------------------------
    A("## The portfolio")
    A("")
    A("1% of equity risked a position, gross exposure capped at 4x, a day's "
      "positions scaled down together when the cap binds, compounded daily "
      "from $100,000. **The held-back column is the one that counts, and the "
      "leverage is to be read before the return.**")
    A("")
    A("| | " + " | ".join(f"`{v.model_id}` held back | `{v.model_id}` build"
                          for v in variants) + " |")
    A("|---|" + "---|" * (2 * len(variants)))
    pfs = {}
    for v in variants:
        pfs[v.key] = (run_portfolio(_hb(v.model), days_hb),
                      run_portfolio(_bd(v.model), days_bd))
    for label, attr, f in (("total return", "total_return", "{:+.1%}"),
                           ("CAGR", "cagr", "{:+.1%}"),
                           ("Sharpe", "sharpe", "{:.2f}"),
                           ("max drawdown", "max_drawdown", "{:.1%}")):
        A(f"| {label} | " + " | ".join(
            f.format(getattr(p, attr)) for v in variants for p in pfs[v.key]) + " |")
    A("| days the 4x cap bound | " + " | ".join(
        f"{p.capped_days}/{p.n_days}" for v in variants for p in pfs[v.key]) + " |")
    A("")
    A("A per-trade edge near zero, levered four times across twenty concurrent "
      "positions and compounded over a year of sessions, is what produces a "
      "large percentage — and the same arithmetic runs in reverse if the sign "
      "is wrong. The per-trade number is the one to read.")
    A("")

    # --- stop geometry and the trend input ---------------------------------
    A("## Stop geometry, and what the trend gate actually saw")
    A("")
    A("| | " + " | ".join(f"`{v.model_id}`" for v in variants) + " |")
    A("|---|" + "---|" * len(variants))
    geo = {v.key: _stop_geometry(_hb(v.model), atr) for v in variants}
    for label, k, nd, suffix in (("median stop distance", "cents", 1, " cents"),
                                 ("as % of price", "pct", 3, "%"),
                                 ("in 14-day ATRs", "atr", 3, ""),
                                 ("commission as a share of risk", "commission_r", 4, "R")):
        A(f"| {label} | " + " | ".join(
            fmt(geo[v.key].get(k, float("nan")), nd) + suffix for v in variants) + " |")
    A("| trades stopped out | " + " | ".join(
        fmt(_stopped_share(_hb(v.model)) * 100, 1) + "%" for v in variants) + " |")
    A("")
    A(f"`orb_sip.v2` on ENGINE-7's held-back window: 133.9 cents, 2.840% of "
      "price, 0.749 ATR, 31.6% stopped. If the 5-minute row above differs from "
      "that by much, the two are not the same trade set and the comparison in "
      "this report is not a comparison.")
    A("")
    A("### The daily trend, across every selected symbol-day in the window")
    A("")
    A("| state | symbol-days | share |")
    A("|---|---|---|")
    tot = sum(tcensus.get(k, 0) for k in ("up", "down", "none"))
    for k in ("up", "down", "none"):
        A(f"| {k} | {tcensus.get(k,0):,} | {100.0*tcensus.get(k,0)/max(tot,1):.1f}% |")
    A(f"| of which: no daily history at all | {tcensus.get('no_daily_series',0):,} | |")
    A(f"| of which: the symbol's first daily bar | {tcensus.get('no_prior_bar',0):,} | |")
    A("")
    A(f"**The unadjusted-price disclosure.** Every price in this snapshot is "
      "unadjusted, deliberately — a split-adjusted price would back-promote "
      "names into a 'price > $5' universe at prices they never traded at. The "
      "cost lands on this lane: a stock that split inside the 120-day lookback "
      "shows a step in its own history, and swing structure read across that "
      f"step is wrong until the step leaves the window. **{tcensus.get('split_suspect_window',0):,} "
      f"of {tot:,} selected symbol-days ({100.0*tcensus.get('split_suspect_window',0)/max(tot,1):.1f}%) "
      "sit downwind of a single session that moved 40% or more**, which is an "
      "UPPER bound on the exposure because a genuine 40% day is counted too. "
      "It is not corrected for. It is disclosed.")
    A("")

    # --- by year and side --------------------------------------------------
    for v in variants:
        A(f"### `{v.model_id}` by year, whole window")
        A("")
        A(SUMMARY_HEADER)
        for k, ts in sorted(split_by(v.model, lambda t: str(t.day)[:4]).items()):
            A(summary_row(summarise(ts, k)))
        A("")
        A(f"### `{v.model_id}` by side, held back")
        A("")
        A(SUMMARY_HEADER)
        for k, ts in sorted(split_by(_hb(v.model), lambda t: t.side).items()):
            A(summary_row(summarise(ts, k)))
        A("")

    # --- cost sensitivity --------------------------------------------------
    A("## Cost sensitivity — disclosed, and not a result")
    A("")
    A("The pre-registered cost model is $0.005/share/side plus 1.0 bp of "
      "adverse slippage, unchanged for the eighth time. These rows re-run the "
      "identical trades under two other cost models on the held-back window. "
      "**The gate is after the pre-registered costs and does not move.**")
    A("")
    A("| model | cost model | n | mean net R | per $1,000 | median net R | hit | PF |")
    A("|---|---|---|---|---|---|---|---|")
    for v in variants:
        for lbl, ts in (("pre-registered (the result)", _hb(v.model)),
                        ("quarter-bp slippage", _hb(v.cheap)),
                        ("zero cost (true gross)", _hb(v.free))):
            if not ts:
                continue
            ss = summarise(ts, lbl)
            A(f"| `{v.model_id}` | {lbl} | {ss.n:,} | {fmt(ss.mean_r,4)} | "
              f"{_money(ss.mean_r)} | {fmt(ss.median_r,4)} | "
              f"{fmt(ss.hit_rate*100,1)}% | {fmt(ss.profit_factor,2)} |")
    A("")

    # --- how sure are we ---------------------------------------------------
    A("## How sure we actually are, and what would change the answer")
    A("")
    for v in variants:
        rows, verdict, s, g, *_ = ev[v.key]
        m = _hb(v.model)
        lo, hi = _ci([t.net_r for t in m]) if m else (float("nan"),) * 2
        yrs = sorted(split_by(m, lambda t: str(t.day)[:4]).items())
        pos = sum(1 for _, ts in yrs if summarise(ts, "").mean_r > 0)
        A(f"- **`{v.model_id}`** rests on **{len(m):,} trades over "
          f"{len(days_hb):,} sessions** spanning {len(yrs)} calendar years, of "
          f"which {pos} of {len(yrs)} were positive on their own. The 95% "
          f"interval on the held-back mean net R is {lo:+.4f} to {hi:+.4f} "
          + ("— it CONTAINS zero." if lo <= 0 <= hi else "— it excludes zero.")
          + f" Verdict: **{verdict}**.")
    A("- **Twelve months is one regime.** Trades on the same day are not "
      "independent of each other, which is why the random-20 comparison is "
      "paired by day rather than by trade. A trade count in the thousands "
      "across 251 sessions is not the same evidence as a trade count in the "
      "thousands across 251 independent experiments.")
    A("- **This is the third look at data overlapping the ENGINE-6/7 held-back "
      "window**, and the filter's motivation came from a diagnosis measured "
      "partly on it. No correction is applied for either. Both are stated.")
    A("- **Two models on one year** carries about a 10% chance that one of "
      "them clears zero by luck. Read a single pass beside a single fail as "
      "weak evidence, not as a discovery.")
    A("- **What would change the answer, in order of how much it would move "
      "it:** (1) the fill model — every entry is a resting stop order filled "
      "at the worse of the level and the bar's open, which is optimistic for "
      "twenty simultaneous orders on the most volatile names of the morning; "
      "(2) short borrow, which this harness does not model at all and is not "
      "free on a stock that just gapped on news; (3) the 4x leverage cap; (4) "
      "the pool, which is the top 1,000 of the eligible universe by dollar "
      "volume rather than all of it; (5) the unadjusted daily bars the trend "
      "is read off, quantified above.")
    A("- **What this report does NOT establish**: that either model is worth "
      "trading. Nothing here has been run forward in real time, and no "
      "live-execution question — borrow, halts, locked markets, partial fills "
      "at the range close — has been touched.")
    A("")

    # --- census and mechanics ----------------------------------------------
    A("## Census")
    A("")
    shown = [("orb_sip.v3", sip_census["v3"]), ("its ungated base", sip_census["base"]),
             ("orb_sip.v3_15m", sip_census["v3_15"]),
             ("its ungated base", sip_census["base_15"]),
             ("random 20 (5m)", unf_census["rnd"]),
             ("random 20 (15m)", unf_census["rnd_15"])]
    A("| | " + " | ".join(n for n, _ in shown) + " |")
    A("|---|" + "---|" * len(shown))
    for k in sorted({k for _, c in shown for k in c}):
        A(f"| {k} | " + " | ".join(f"{c.get(k,0):,}" for _, c in shown) + " |")
    A("| symbol-days with no cached bars | "
      + " | ".join(f"{(sip_missing if i < 4 else unf_missing):,}"
                   for i in range(len(shown))) + " |")
    A("")
    A("## Selection, costs and fills")
    A("")
    A(f"- selection: ENGINE-6's, unchanged and not recomputed — pool of the top "
      f"{sel['pool_n']:,} eligible names by prior-close 20-day dollar volume, "
      f"then the top {sel['top_k']} by 09:30-09:35 volume over the mean of the "
      f"same five minutes across the previous {sel['baseline_days']} sessions, "
      f"floor {sel['min_rvol']:.1f}. **Used for the 15-minute variant too**, "
      "because the one-minute cache exists only for the symbol-days that "
      "selection named and re-selecting at 09:45 would need a download this "
      "lane is not permitted to make. It is not lookahead — 09:35 is strictly "
      "less information than 09:45 — and it makes the two variants a "
      "comparison of range length and nothing else. It is still a deviation.")
    A("- the daily trend: `primitives/htf.py`'s `daily_structure` at ENGINE-2's "
      f"numbers (pivot_n={sipdaily.DAILY_PIVOT_N}, "
      f"lookback={sipdaily.DAILY_LOOKBACK}), read on the last fully closed "
      "daily bar. `tests/test_sip_daily.py` poisons the day being traded and "
      "amputates everything after it, and requires the label not to move.")
    A(f"- ${COSTS.commission_per_share:.3f}/share/side commission, "
      f"{COSTS.slippage_bps:.1f} bp adverse slippage on market and stop fills")
    A("- entry is a resting stop order, filled at the worse of the level and "
      "the bar's open, plus slippage; the stop is a LEVEL, not a distance "
      "carried from the fill, so a gap through the entry costs the trader more "
      "risk and the R it is divided by is measured from the fill that actually "
      "happened")
    A("- the 15-minute stop is the opposite extreme of the WHOLE 09:30-09:45 "
      "range, not of the last five-minute candle inside it. That reading was "
      "chosen before the run and the reasoning is in "
      "[`../models/orb_sip.v3_15m/GATE.md`](../models/orb_sip.v3_15m/GATE.md); "
      "**the other reading is a different model and no number here speaks to "
      "it.**")
    A("")

    REPORT.parent.mkdir(parents=True, exist_ok=True)
    REPORT.write_text("\n".join(L) + "\n")
    print("\n".join(L[:40]))
    print(f"\nwrote {REPORT}")

    dump = REPORT.with_suffix(".trades.csv.gz")
    with gzip.open(dump, "wt") as f:
        f.write("arm,model_id,symbol,day,side,daily_trend,candle_side,"
                "entry_minute,exit_minute,fill_price,stop_price,exit_price,"
                "exit_reason,risk_per_share,gross_r,net_r,mae_r,mfe_r\n")
        for v in variants:
            for arm, ts in ((f"{v.key}.model", v.model), (f"{v.key}.base", v.base),
                            (f"{v.key}.coinflip", v.flip), (f"{v.key}.opposite", v.opp),
                            (f"{v.key}.random20", v.rnd)):
                for t in ts:
                    f.write(f"{arm},{t.model_id},{t.symbol},{t.day},{t.side},"
                            f"{t.meta.get('daily_trend','')},"
                            f"{t.meta.get('candle_side','')},"
                            f"{t.entry_minute},{t.exit_minute},{t.fill_price:.4f},"
                            f"{t.stop_price:.4f},{t.exit_price:.4f},{t.exit_reason},"
                            f"{t.risk_per_share:.4f},{t.gross_r:.5f},{t.net_r:.5f},"
                            f"{t.mae_r:.5f},{t.mfe_r:.5f}\n")
    eq = REPORT.with_suffix(".equity.csv")
    days_all = days_bd + days_hb
    p = run_portfolio(variants[0].model, days_all)
    eq.write_text("day,equity,daily_return,exposure_ratio\n" + "\n".join(
        f"{d},{e:.2f},{r:.6f},{x:.4f}"
        for d, e, r, x in zip(p.days, p.equity, p.daily_return,
                              p.exposure_ratio)) + "\n")
    print(f"wrote {dump} and {eq}")


if __name__ == "__main__":
    raise SystemExit(main())
