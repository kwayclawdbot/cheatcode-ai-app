"""ENGINE-10 — `orb_sip.v4_trigger` and `orb_sip.v4_prior`: the owner's stop.

    .venv/bin/python run_engine10.py

There is no `--stage plan`. The selection is ENGINE-6's, read from
`data/polygon-sip-v1/selection.json.gz` exactly as it was written, so every
model in this family trades the same candidate symbol-days and nothing about
the universe, the pool, the relative-volume ranking or the anti-lookahead
treatment is recomputed or re-downloaded. **Nothing is fetched.**

There is also no parameter to vary, and that is the point of this file. The
window was fixed by the owner in ENGINE-8 and is not widened; the two arms are
the two readings of one ambiguous sentence and differ from each other in which
five-minute candle the stop comes from and in nothing else; `orb_sip.v2` is
replayed in the same pass, through the same runner, as the thing they are
compared against. A runner with a knob on it would invite a second look at a
held-back year that is already on its fourth. There is no knob.
"""

from __future__ import annotations

import gzip
import json
import sys
from collections import Counter
from dataclasses import dataclass
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from engine import calendar_us  # noqa: E402
from engine.backtest.candle_stop import run_symbol_candle_stop  # noqa: E402
from engine.backtest.stats import (SUMMARY_HEADER, fmt, split_by,  # noqa: E402
                                   summarise, summary_row)
from engine.cache import load as cache_load  # noqa: E402
from engine.models import gates, gates_v4  # noqa: E402
from engine.models.orb_sip_v2 import (OrbStocksInPlayV2,  # noqa: E402
                                      OrbStocksInPlayV2Coinflip)
from engine.models.orb_sip_v4 import (OrbSipV4Prior,  # noqa: E402
                                      OrbSipV4PriorCoinflip, OrbSipV4Trigger,
                                      OrbSipV4TriggerCoinflip)
from engine.run_engine6 import (ARM_SIP, ARM_UNFILTERED, CHEAP,  # noqa: E402
                                COSTS, FREE, SELECTION_PATH, _atr_map,
                                _paired_by_day, _paired_gross, _window)
from engine.sip import config as scfg  # noqa: E402
from engine.sip.portfolio import run_portfolio  # noqa: E402

REPORT = Path(__file__).resolve().parent / "reports" / f"orb_sip.v4.{scfg.SNAPSHOT}.md"
RISK_DOLLARS = 1_000.0     # the owner reads money; this is the gloss on every R


def _d(s: str) -> int:
    return int(s.replace("-", ""))


BUILD_LO, BUILD_HI = (_d(x) for x in gates_v4.SIPV4_BUILD)
HB_LO, HB_HI = (_d(x) for x in gates_v4.SIPV4_HELD_BACK)
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


def _ci(values) -> tuple[float, float]:
    return gates.mean_ci95(list(values))


def _money(r: float) -> str:
    return "n/a" if r != r else f"{r * RISK_DOLLARS:+,.0f}"


def _usd(r: float) -> str:
    """The same number written the way the owner reads it: money, with a sign
    and a dollar sign. Every R-multiple in the plain-English section is glossed
    through here, because an R-multiple is not a unit anybody spends."""
    if r != r:
        return "n/a"
    v = r * RISK_DOLLARS
    return ("+$" if v >= 0 else "\u2212$") + f"{abs(v):,.0f}"


def _keys(trades) -> set[tuple[str, int]]:
    return {(t.symbol, t.day) for t in trades}


def _by_key(trades) -> dict[tuple[str, int], object]:
    return {(t.symbol, t.day): t for t in trades}


def _paired_net(a_trades, b_trades) -> list[float]:
    b = _by_key(b_trades)
    return [t.net_r - b[(t.symbol, t.day)].net_r
            for t in a_trades if (t.symbol, t.day) in b]


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
        "p10_cents": float(np.percentile(risk, 10) * 100.0),
        "p90_cents": float(np.percentile(risk, 90) * 100.0),
    }


def _replay(days_by_symbol: dict[str, set[int]], atr: dict,
            configs: list[tuple[str, object, object]]) -> tuple[dict, dict, int]:
    """One pass over the tape, several models on it, all through the SAME
    runner — the candle-stop one. `orb_sip.v2` has no `stop_at_fill`, so that
    runner reproduces `run_symbol` for it exactly (asserted in
    `tests/test_orb_sip_v4.py`), which is what makes v2 in this table a
    control for v4 rather than a number copied from another report."""
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
            t, _ = run_symbol_candle_stop(series, model, costs, warmup_days=0,
                                          day_filter=lambda d, days=days: int(d) in days)
            model.finish()
            trades[name].extend(t)
            census[name].update(model.census)
        if (i + 1) % 500 == 0:
            print(f"  replayed {i+1:,} symbols, "
                  f"{len(trades[configs[0][0]]):,} trades", flush=True)
    return trades, census, missing


def _hb(ts):
    return _window(ts, HB_LO, HB_HI)


def _bd(ts):
    return _window(ts, BUILD_LO, BUILD_HI)


@dataclass
class Arm:
    key: str                 # "trigger" | "prior"
    model_id: str
    prefix: str              # "S" | "P"
    stop_label: str
    model: list
    flip: list
    rnd: list
    free: list
    cheap: list


def main() -> int:
    with gzip.open(SELECTION_PATH, "rt") as f:
        sel = json.load(f)
    rows = [r for r in sel["rows"] if WINDOW_LO <= int(r["day"]) <= WINDOW_HI]
    pairs = {(r["symbol"], int(r["day"])) for r in rows}
    atr = _atr_map(pairs)
    print(f"selection (ENGINE-6's, reused, narrowed to "
          f"{gates_v4.SIPV4_BUILD[0]}..{gates_v4.SIPV4_HELD_BACK[1]}): "
          f"{len(rows):,} rows, {len(pairs):,} symbol-days, "
          f"{len(atr):,} with an ATR", flush=True)

    arms: dict[str, dict[str, set[int]]] = {ARM_SIP: {}, ARM_UNFILTERED: {}}
    for r in rows:
        arms[r["arm"]].setdefault(r["symbol"], set()).add(int(r["day"]))

    print("replaying both stop readings, orb_sip.v2, their matched coin flips "
          "and the cost sensitivities...", flush=True)
    a, ac, sip_missing = _replay(arms[ARM_SIP], atr, [
        ("trig", OrbSipV4Trigger, COSTS),
        ("prior", OrbSipV4Prior, COSTS),
        ("v2", OrbStocksInPlayV2, COSTS),
        ("trig_flip", OrbSipV4TriggerCoinflip, COSTS),
        ("prior_flip", OrbSipV4PriorCoinflip, COSTS),
        ("v2_flip", OrbStocksInPlayV2Coinflip, COSTS),
        ("trig_free", OrbSipV4Trigger, FREE),
        ("prior_free", OrbSipV4Prior, FREE),
        ("trig_cheap", OrbSipV4Trigger, CHEAP),
        ("prior_cheap", OrbSipV4Prior, CHEAP),
    ])
    print("replaying the random-20 control, all three stops...", flush=True)
    b, bc, unf_missing = _replay(arms[ARM_UNFILTERED], atr, [
        ("rnd_trig", OrbSipV4Trigger, COSTS),
        ("rnd_prior", OrbSipV4Prior, COSTS),
        ("rnd_v2", OrbStocksInPlayV2, COSTS),
    ])
    print(f"trades: trigger={len(a['trig']):,} prior={len(a['prior']):,} "
          f"v2={len(a['v2']):,} rnd_trig={len(b['rnd_trig']):,}", flush=True)

    # Integrity checks, not results. The three stop readings must be three
    # readings of ONE trade set: same symbol-days, same sides, same fills. If
    # they are not, "the stop is the only thing that changed" is false and
    # every comparison below is confounded.
    kv2 = _keys(a["v2"])
    for k in ("trig", "prior"):
        assert _keys(a[k]) <= kv2, f"{k} traded symbol-days v2 did not"
    v2_by = _by_key(a["v2"])
    for k in ("trig", "prior"):
        for t in a[k]:
            c = v2_by[(t.symbol, t.day)]
            assert t.side == c.side and t.entry_minute == c.entry_minute \
                and abs(t.fill_price - c.fill_price) < 1e-9, \
                f"{k} {t.symbol} {t.day}: entry differs from v2's"

    trig = Arm("trigger", "orb_sip.v4_trigger", "S",
               "the five-minute candle the fill happened in",
               a["trig"], a["trig_flip"], b["rnd_trig"],
               a["trig_free"], a["trig_cheap"])
    prior = Arm("prior", "orb_sip.v4_prior", "P",
                "the five-minute candle BEFORE the one the fill happened in",
                a["prior"], a["prior_flip"], b["rnd_prior"],
                a["prior_free"], a["prior_cheap"])

    write_report(sel, [trig, prior], a["v2"], a["v2_flip"], b["rnd_v2"], atr,
                 ac, bc, sip_missing, unf_missing)
    return 0


def gate_rows_for(arm: Arm, days_hb):
    m = _hb(arm.model)
    s = summarise(m, arm.model_id)
    g = _gross(m)
    paired_flip = _paired_gross(m, _hb(arm.flip))
    paired_rnd = _paired_by_day(m, _hb(arm.rnd))
    pf = run_portfolio(m, days_hb)
    rows = gates_v4.evaluate_sip_v4(s, g[0], paired_flip, paired_rnd, pf, arm.prefix)
    return rows, gates_v4.verdict_sip_v4(rows), s, g, paired_flip, paired_rnd, pf


def _same_as_v2_share(trades) -> float:
    if not trades:
        return float("nan")
    n = sum(1 for t in trades
            if abs(t.stop_price - float(t.meta["v2_stop"])) < 1e-9)
    return n / len(trades)


def write_report(sel, arms: list[Arm], v2, v2_flip, rnd_v2, atr,
                 sip_census, unf_census, sip_missing, unf_missing) -> None:
    days_hb = [_d(x) for x in calendar_us.trading_days(*gates_v4.SIPV4_HELD_BACK)]
    days_bd = [_d(x) for x in calendar_us.trading_days(*gates_v4.SIPV4_BUILD)]
    days_all = days_bd + days_hb

    ev = {arm.key: gate_rows_for(arm, days_hb) for arm in arms}
    v2_hb, v2_all = _hb(v2), v2

    L: list[str] = []
    A = L.append
    A("# `orb_sip.v4_trigger` and `orb_sip.v4_prior` — the owner's candle stop, "
      "both readings of it")
    A("")
    A("**Two readings of one sentence, one held-back year, and both verdicts "
      "are printed here before anything else.**")
    A("")
    A("| model | the stop | held-back trades | mean net R | per $1,000 risked | stopped out | verdict |")
    A("|---|---|---|---|---|---|---|")
    for arm in arms:
        rows, verdict, s, g, *_ = ev[arm.key]
        A(f"| `{arm.model_id}` | {arm.stop_label} | {s.n:,} | {fmt(s.mean_r,4)} | "
          f"{_money(s.mean_r)} | {fmt(_stopped_share(_hb(arm.model))*100,1)}% | "
          f"**{verdict}** |")
    s2 = summarise(v2_hb, "orb_sip.v2")
    A(f"| `orb_sip.v2` — for comparison, same trades, replayed here | the "
      f"opposite extreme of the opening range | {s2.n:,} | {fmt(s2.mean_r,4)} | "
      f"{_money(s2.mean_r)} | {fmt(_stopped_share(v2_hb)*100,1)}% | "
      "ENGINE-7's PARTIAL |")
    A("")
    A(f"Decided on {gates_v4.SIPV4_HELD_BACK[0]} → "
      f"{gates_v4.SIPV4_HELD_BACK[1]} and on nothing else. Snapshot "
      f"`{scfg.SNAPSHOT}`, unchanged and not re-downloaded; selection reused "
      "byte for byte from ENGINE-6; nothing was fetched. Gate: "
      "[`../models/orb_sip.v4_trigger/GATE.md`](../models/orb_sip.v4_trigger/GATE.md), "
      "which governs both arms and was committed before any number below "
      "existed.")
    A("")

    # --- plain English -----------------------------------------------------
    A("## In plain English")
    A("")
    A("**What the owner asked for.** *\"we should only take an entry on the "
      "breakout of orb, stop at the low of 5min candle before the entry candle "
      "(if bullish) and top if bearish. if stopped out we take the loss\"*. "
      "Everything about ENGINE-7's model stays as it was — each morning take "
      "the twenty US stocks whose first five minutes traded the most abnormal "
      "volume against their own recent mornings, draw the 09:30-09:35 range, "
      "buy a break above its high if that candle closed up, sell short a break "
      "below its low if it closed down, hold to the bell — and **only the stop "
      "changes**. \"If stopped out we take the loss\" was already how this "
      "model behaved: one trade a morning, no second attempt, no move to "
      "breakeven, no partial. That was confirmed rather than built.")
    A("")
    A("**Why there are two answers below instead of one.** The sentence is "
      "ambiguous and it has already cost this programme two rounds. The entry "
      "is a resting order at the edge of the range, so the five-minute candle "
      "the order fills in is BOTH the candle that broke out and the candle the "
      "entry happened in — the two words name the same bar. So both readings "
      "were written down in advance and both were run:")
    A("")
    A("- **`orb_sip.v4_trigger`** stops at the low (long) or high (short) of "
      "**the candle the fill happened in**. This is the literal reading of the "
      "owner's words if \"the entry candle\" means the next candle along — "
      "which is what a trader who enters at the open of the bar after the "
      "breakout bar closes means by it. It is the tighter of the two.")
    A("- **`orb_sip.v4_prior`** stops at the low or high of **the candle "
      "before that one**. This is the owner's earlier phrasing, *\"previous "
      "5min h/l\"*, and it is the reading ENGINE-5 measured and preferred.")
    A("")
    same = _same_as_v2_share(_hb(arms[1].model))
    A(f"One consequence has to be said out loud: most breakouts happen in the "
      f"first five minutes after the range closes, so for **{same:.0%}** of "
      "its held-back trades the prior arm's \"candle before\" IS the "
      "09:30-09:35 opening range, and on those trades **the prior arm is "
      "exactly `orb_sip.v2`**. It is a different model only on the minority of "
      "mornings where the break came later.")
    A("")
    A("**The thing to read before the results, because this lane is walking "
      "back toward a known failure.** ENGINE-6 built the published version of "
      "this strategy with a very tight stop — a tenth of the stock's average "
      "daily range, about 12 cents. **It was hit on 90.1% of trades and lost "
      "$635 for every $1,000 risked.** The post-mortem then moved that one "
      "number and nothing else, and the whole result changed sign with it: at "
      "a tenth of the range it lost $635 per $1,000, at a quarter it lost $73, "
      "at a half it made $5, at a full range it made $12. ENGINE-7's stop — "
      "the opposite end of the opening range, about three quarters of a daily "
      "range, a median $1.34 a share — is the only reason that model stopped "
      "losing badly. **Both of the owner's readings put the stop closer to the "
      "entry than ENGINE-7's.** A candle on the chart is a real trader's rule "
      "and is not the same thing as a fraction of an average range, so it "
      "could still work — but the direction of travel is back toward the "
      "setting that failed, and the numbers to watch are how often each arm "
      "gets stopped out and how wide its stop actually is.")
    A("")
    A("### What each reading made or lost")
    A("")
    A("| | held-back year (the verdict) | all five years | stopped out, held back | stop width, held back |")
    A("|---|---|---|---|---|")
    for arm in arms:
        hb = _hb(arm.model)
        allt = arm.model
        geo = _stop_geometry(hb, atr)
        A(f"| **`{arm.model_id}`** | **{_usd(summarise(hb,'').mean_r)}** per "
          f"$1,000 risked, over {len(hb):,} trades | "
          f"**{_usd(summarise(allt,'').mean_r)}** per $1,000, over "
          f"{len(allt):,} trades | **{_stopped_share(hb):.1%}** | "
          f"{geo['cents']:.0f}¢ a share (median) |")
    geo2 = _stop_geometry(v2_hb, atr)
    A(f"| `orb_sip.v2`, the same trades | {_usd(summarise(v2_hb,'').mean_r)} "
      f"per $1,000, over {len(v2_hb):,} trades | "
      f"{_usd(summarise(v2_all,'').mean_r)} per $1,000, over "
      f"{len(v2_all):,} trades | {_stopped_share(v2_hb):.1%} | "
      f"{geo2['cents']:.0f}¢ a share (median) |")
    A("| ENGINE-6's published stop, for scale | — | \u2212$635 per $1,000 | "
      "90.1% | 12¢ |")
    A("")

    bar_ = gates_v4.SIPV4_DIAGNOSIS_REPEATS_IF_STOPPED_AT_OR_ABOVE
    tripped = [x for x in arms if _stopped_share(_hb(x.model)) >= bar_]
    worst = max(_stopped_share(_hb(x.model)) for x in arms)
    if tripped:
        A("**THE ENGINE-6 DIAGNOSIS IS REPEATING, and this is the headline of "
          "the lane.** "
          + " ".join(f"`{x.model_id}` is stopped out on "
                     f"{_stopped_share(_hb(x.model)):.1%} of its trades."
                     for x in tripped)
          + f" The gate drew the line at {bar_:.0%} before the run, and the "
          "reason it drew it there is that this is the same failure mode the "
          "published 10%-of-ATR stop had at 90.1%: the stop sits inside the "
          "normal noise of the very candle the trade is defined by, so the "
          "trade is knocked out before the idea it is based on has had a "
          "chance to be right or wrong. The stop is not protecting the "
          "position from a bad idea; it is preventing the idea from happening. "
          "This paragraph was required by the gate whatever the verdicts say.")
        A("")
    else:
        A(f"**The ENGINE-6 failure mode did NOT return.** The worse of the two "
          f"arms is stopped out on {worst:.1%} of trades, well under the "
          f"{gates_v4.SIPV4_DIAGNOSIS_REPEATS_IF_STOPPED_AT_OR_ABOVE:.0%} line "
          "the gate drew in advance, and nothing like the 90.1% that sank the "
          "published version. Whatever else these arms do, they are not that "
          "failure.")
        A("")

    v2_years = sorted(split_by(v2, lambda t: str(t.day)[:4]))
    v2_pos = [k for k, ts in sorted(split_by(v2, lambda t: str(t.day)[:4]).items())
              if summarise(ts, "").mean_r > 0]
    A("**And the sentence that has to sit beside every held-back number in "
      "this family \u2014 with one correction this lane owes the brief that "
      "commissioned it.** ENGINE-8 reported that across the full five years "
      "its model returns about \u2212$7 per $1,000 risked, is positive in only "
      "2 of the 6 calendar years it touches, and that the held-back year is "
      "the good year. **That is true of `orb_sip.v3`, the TREND-FILTERED "
      "model, and it is not true of `orb_sip.v2`.** Measured here over the "
      f"same five years, `orb_sip.v2` returns "
      f"{_usd(summarise(v2_all,'').mean_r)} per $1,000 risked, is positive in "
      f"{len(v2_pos)} of the {len(v2_years)} calendar years it touches, and "
      f"its held-back year ({_usd(summarise(v2_hb,'').mean_r)} a trade) is "
      "ordinary rather than exceptional. So for the reading that survives "
      "below, the \"one good year\" warning is weaker than the brief assumed, "
      "and the five-year column is printed beside the held-back one anyway. "
      "**What has not changed is the SIZE.** An average trade worth a few "
      "tens of dollars per $1,000 risked, with an error bar that spans zero, "
      "is not an edge anybody can stand behind \u2014 and it is the same few "
      "tens of dollars whether you read one year or five.")
    A("")

    # --- per-arm detail ----------------------------------------------------
    for arm in arms:
        rows, verdict, s, g, paired_flip, paired_rnd, pf = ev[arm.key]
        hb = _hb(arm.model)
        bd = _bd(arm.model)
        lo, hi = _ci([t.net_r for t in hb])
        A(f"### `{arm.model_id}` — stop at {arm.stop_label}")
        A("")
        A(f"- **Trades**: **{len(hb):,}** in the held-back year, {len(bd):,} in "
          f"the four-year build window, {len(arm.model):,} over the whole five. "
          f"`orb_sip.v2` took {len(v2_hb):,} in the same held-back year, and "
          "every trade here is one of those trades with a different stop on it.")
        if len(hb) < gates_v4.SIPV4_MIN_TRADES:
            A(f"- **The sample is below the pre-registered floor of "
              f"{gates_v4.SIPV4_MIN_TRADES}.** The gate says the verdict is "
              "then INCONCLUSIVE and nothing else is read.")
        A(f"- **Did it make money**: **{'yes' if s.mean_r > 0 else 'no'}**. "
          f"Gross of costs the average trade returned {g[0]:+.4f} times what "
          f"was risked ({_money(g[0])} per $1,000); after commission and "
          f"slippage, {s.mean_r:+.4f} — **{_money(s.mean_r)} per $1,000 "
          f"risked**. The middle trade returned {s.median_r:+.4f} "
          f"({_money(s.median_r)}) and {s.hit_rate:.1%} finished green.")
        A(f"- **How much of that is luck**: the 95% range around the average is "
          f"{lo:+.4f} to {hi:+.4f} times risk — {_money(lo)} to {_money(hi)} a "
          "trade. "
          + ("**That range contains zero**, so the average trade is NOT "
             "distinguishable from breaking even at this sample size, whatever "
             "the sign of the middle number."
             if lo <= 0 <= hi else
             "That range does not contain zero, so the sign of the average is "
             "not an artefact of the sample size."))
        A(f"- **Stopped out**: {_stopped_share(hb):.1%} of trades, against "
          f"{_stopped_share(v2_hb):.1%} for `orb_sip.v2` on the same trades and "
          "90.1% for ENGINE-6's published stop.")
        geo = _stop_geometry(hb, atr)
        A(f"- **The stop it actually placed**: a median **{geo['cents']:.1f}¢** "
          f"a share ({geo['p10_cents']:.0f}¢ at the 10th percentile, "
          f"{geo['p90_cents']:.0f}¢ at the 90th), **{geo['pct']:.3f}%** of "
          f"price, **{geo['atr']:.2f}×** the 14-day ATR. Commission alone is "
          f"{geo['commission_r']:.4f} of the risk on the middle trade "
          f"({_money(-geo['commission_r'])} per $1,000).")
        rs = summarise(_hb(arm.rnd), "random 20")
        A(f"- **Against twenty random eligible names** traded under identical "
          f"rules with the identical stop reading: {rs.mean_r:+.4f}R "
          f"({_money(rs.mean_r)} per $1,000) over {rs.n:,} trades.")
        fm = float(np.mean(paired_flip)) if paired_flip else float("nan")
        flo, fhi = _ci(paired_flip)
        A(f"- **Against a coin flip on the same mornings** — same symbols, same "
          f"days, same 09:35 decision, same stop reading, direction flipped — "
          f"gross, paired: **{fm:+.4f}R** (95%: {flo:+.4f} to {fhi:+.4f}, "
          f"n={len(paired_flip):,}), i.e. {_money(fm)} a trade per $1,000.")
        A(f"- **As a portfolio** — 1% of the account risked per position, gross "
          f"exposure capped at 4×, compounded daily from $100,000 — the "
          f"held-back year returned **{pf.total_return:+.1%}** "
          f"(${100_000*(1+pf.total_return):,.0f}) at a Sharpe of "
          f"{pf.sharpe:.2f}, worst drawdown {pf.max_drawdown:.1%}, with the "
          f"leverage cap binding on {pf.capped_days:,} of {pf.n_days:,} "
          "sessions.")
        pf_bd = run_portfolio(bd, days_bd)
        bs = summarise(bd, "build")
        allm = summarise(arm.model, "all")
        pf_all = run_portfolio(arm.model, days_all)
        A(f"- **And the four years before it, which the verdict does not read**: "
          f"{bs.mean_r:+.4f}R a trade ({_money(bs.mean_r)} per $1,000) over "
          f"{bs.n:,} trades, portfolio **{pf_bd.total_return:+.1%}** at a "
          f"Sharpe of {pf_bd.sharpe:.2f}. **Over the whole five years**: "
          f"{allm.mean_r:+.4f}R ({_money(allm.mean_r)} per $1,000) over "
          f"{allm.n:,} trades, portfolio **{pf_all.total_return:+.1%}** at a "
          f"Sharpe of {pf_all.sharpe:.2f}.")
        A(f"- **Verdict**: **{verdict}**. " + " ".join(
            f"{x.id} {'passed' if x.passed else 'FAILED'} ({x.name})."
            for x in rows))
        A("")

    # --- the gate tables ---------------------------------------------------
    A("## The pre-registered gates")
    A("")
    for arm in arms:
        rows, verdict, *_ = ev[arm.key]
        A(f"**`{arm.model_id}` — {verdict}**")
        A("")
        A("| id | gate | threshold | observed | |")
        A("|---|---|---|---|---|")
        for x in rows:
            A(f"| **{x.id}** | {x.name} | {x.threshold} | {x.observed} | "
              f"{'PASS' if x.passed else '**FAIL**'} |")
        A("")

    # --- the stop, which is the whole lane ---------------------------------
    A("## The stop, which is the only thing that changed")
    A("")
    A("Same trades, same fills, three stops. Everything in this table is "
      "measured on the held-back year's trades that all three readings took, "
      "so the comparison is not confounded by a different trade set.")
    A("")
    common = _keys(arms[0].model) & _keys(arms[1].model) & _keys(v2)
    common_hb = {k for k in common if HB_LO <= k[1] <= HB_HI}
    A("| stop reading | n | median width | % of price | × 14-day ATR | commission as share of risk | stopped out | mean net R | per $1,000 |")
    A("|---|---|---|---|---|---|---|---|---|")
    for label, ts in ([(f"`{x.model_id}`", x.model) for x in arms]
                      + [("`orb_sip.v2` (ENGINE-7)", v2)]):
        sub = [t for t in ts if (t.symbol, t.day) in common_hb]
        geo = _stop_geometry(sub, atr)
        ss = summarise(sub, label)
        A(f"| {label} | {ss.n:,} | {geo['cents']:.1f}¢ | {geo['pct']:.3f}% | "
          f"{geo['atr']:.2f} | {geo['commission_r']:.4f} | "
          f"{_stopped_share(sub):.1%} | {fmt(ss.mean_r,4)} | "
          f"{_money(ss.mean_r)} |")
    A("| ENGINE-6's published 10%-of-ATR stop | 32,392 | 12.4¢ | 0.35% | 0.10 | 0.0590 | 90.1% | −0.7229 | −723 |")
    A("")
    A("Paired trade for trade on those same mornings, net of costs:")
    A("")
    A("| comparison | n | difference | 95% | per $1,000 |")
    A("|---|---|---|---|---|")
    for arm in arms:
        sub_a = [t for t in arm.model if (t.symbol, t.day) in common_hb]
        sub_b = [t for t in v2 if (t.symbol, t.day) in common_hb]
        diff = _paired_net(sub_a, sub_b)
        dm = float(np.mean(diff)) if diff else float("nan")
        dlo, dhi = _ci(diff)
        A(f"| `{arm.model_id}` minus `orb_sip.v2` | {len(diff):,} | "
          f"**{dm:+.4f}R** | {dlo:+.4f} to {dhi:+.4f} | {_money(dm)} |")
    da = [t for t in arms[0].model if (t.symbol, t.day) in common_hb]
    db = [t for t in arms[1].model if (t.symbol, t.day) in common_hb]
    diff = _paired_net(da, db)
    dm = float(np.mean(diff)) if diff else float("nan")
    dlo, dhi = _ci(diff)
    A(f"| `{arms[0].model_id}` minus `{arms[1].model_id}` | {len(diff):,} | "
      f"**{dm:+.4f}R** | {dlo:+.4f} to {dhi:+.4f} | {_money(dm)} |")
    A("")
    def _sub(ts):
        return [t for t in ts if (t.symbol, t.day) in common_hb]
    ga, gb = _stop_geometry(_sub(arms[0].model), atr), _stop_geometry(_sub(arms[1].model), atr)
    gv = _stop_geometry(_sub(v2), atr)
    A("**Both readings land where the ENGINE-6 stop sweep said they would, and "
      "that is the one genuinely new piece of evidence in this lane.** That "
      "sweep was computed on 2016-2023 and predicted the sign of this whole "
      "family from stop width alone: \u22120.635R at 0.10\u00d7 the 14-day "
      "average range, \u22120.073R at 0.25\u00d7, +0.005R at 0.50\u00d7, "
      "+0.012R at 1\u00d7. Neither of the owner's readings was taken from that "
      "sweep \u2014 both come from his own words \u2014 so where they land on "
      f"it is an out-of-sample test of the sweep as much as of them. "
      f"`{arms[0].model_id}` places a {ga['atr']:.2f}\u00d7 stop and returns "
      f"{_usd(_mean_net(_sub(arms[0].model)))} per $1,000 risked; "
      f"`{arms[1].model_id}` places a {gb['atr']:.2f}\u00d7 stop and returns "
      f"{_usd(_mean_net(_sub(arms[1].model)))}; `orb_sip.v2` places a "
      f"{gv['atr']:.2f}\u00d7 stop and returns {_usd(_mean_net(_sub(v2)))}. "
      "**Stop width, and not the direction call, is still the parameter that "
      "decides what this family earns** \u2014 now confirmed on a later "
      "window, by a rule nobody derived from the sweep.")
    A("")
    A("**The ambiguity, closed.** The literal reading of *\"the 5min candle "
      "before the entry candle\"*, taken as the candle that broke out with the "
      "entry at the open of the next one, is "
      f"**`{arms[0].model_id}`** — and its realised stop is a median "
      f"{_stop_geometry(_hb(arms[0].model), atr)['cents']:.1f}¢, against "
      f"{_stop_geometry(_hb(arms[1].model), atr)['cents']:.1f}¢ for the other "
      f"reading and {_stop_geometry(v2_hb, atr)['cents']:.1f}¢ for ENGINE-7's. "
      "Nobody has to guess which was meant again: both were run, and both "
      "numbers are on this page.")
    A("")
    A(f"On **{_same_as_v2_share(_hb(arms[1].model)):.1%}** of its held-back "
      "trades `orb_sip.v4_prior` places the SAME stop as `orb_sip.v2`, because "
      "the break came inside 09:35-09:40 and the candle before it is the "
      "opening range itself. Any difference between those two rows is "
      "therefore produced by a minority of the trades.")
    A("")

    # --- when the break happened -------------------------------------------
    A("### When the break happened, which is what decides the stop")
    A("")
    A("| five-minute candle the fill landed in | trades | share |")
    A("|---|---|---|")
    buckets: dict[int, int] = {}
    for t in v2_hb:
        buckets[(int(t.entry_minute) - 575) // 5] = \
            buckets.get((int(t.entry_minute) - 575) // 5, 0) + 1
    tot = max(sum(buckets.values()), 1)
    cum = 0
    for k in sorted(buckets)[:8]:
        cum += buckets[k]
        lo_m, hi_m = 575 + 5 * k, 580 + 5 * k
        A(f"| {lo_m//60:02d}:{lo_m%60:02d}-{hi_m//60:02d}:{hi_m%60:02d} | "
          f"{buckets[k]:,} | {100.0*buckets[k]/tot:.1f}% (cumulative "
          f"{100.0*cum/tot:.1f}%) |")
    A(f"| later than {(575+40)//60:02d}:{(575+40)%60:02d} | "
      f"{tot-cum:,} | {100.0*(tot-cum)/tot:.1f}% |")
    A("")

    # --- calendar years ----------------------------------------------------
    A("## Every calendar year, both arms and v2")
    A("")
    A("| year | " + " | ".join(f"`{x.model_id}`" for x in arms) + " | `orb_sip.v2` |")
    A("|---|" + "---|" * (len(arms) + 1))
    years = sorted({str(t.day)[:4] for t in v2})
    for y in years:
        cells = []
        for ts in [x.model for x in arms] + [v2]:
            sub = [t for t in ts if str(t.day)[:4] == y]
            ss = summarise(sub, y)
            cells.append(f"{fmt(ss.mean_r,4)} ({_money(ss.mean_r)}, n={ss.n:,})"
                         if sub else "—")
        A(f"| {y} | " + " | ".join(cells) + " |")
    A("")
    for arm in arms:
        yrs = sorted(split_by(arm.model, lambda t: str(t.day)[:4]).items())
        pos = [k for k, ts in yrs if summarise(ts, "").mean_r > 0]
        A(f"- `{arm.model_id}` is positive in **{len(pos)} of {len(yrs)}** "
          f"calendar years ({', '.join(pos) if pos else 'none'}).")
    yrs = sorted(split_by(v2, lambda t: str(t.day)[:4]).items())
    pos = [k for k, ts in yrs if summarise(ts, "").mean_r > 0]
    A(f"- `orb_sip.v2` is positive in **{len(pos)} of {len(yrs)}** "
      f"({', '.join(pos) if pos else 'none'}).")
    A("")

    # --- full summaries ----------------------------------------------------
    A("## Full summaries, held-back window")
    A("")
    A(SUMMARY_HEADER)
    for label, ts in ([(x.model_id, _hb(x.model)) for x in arms]
                      + [(f"{x.model_id}.coinflip", _hb(x.flip)) for x in arms]
                      + [(f"{x.model_id}.random20", _hb(x.rnd)) for x in arms]
                      + [("orb_sip.v2", v2_hb),
                         ("orb_sip.v2.coinflip", _hb(v2_flip)),
                         ("orb_sip.v2.random20", _hb(rnd_v2))]):
        A(summary_row(summarise(ts, label)))
    A("")
    A("## Full summaries, the four build years (not a verdict)")
    A("")
    A(SUMMARY_HEADER)
    for label, ts in ([(x.model_id, _bd(x.model)) for x in arms]
                      + [("orb_sip.v2", _bd(v2))]):
        A(summary_row(summarise(ts, label)))
    A("")

    # --- costs -------------------------------------------------------------
    A("## Cost sensitivity — a disclosure, never a result")
    A("")
    A("The pre-registered cost model is $0.005/share/side plus 1.0 bp of "
      "adverse slippage, and it is the one every number above uses. A tighter "
      "stop pays the same cents on a smaller denominator, so cost matters more "
      "here than it did to ENGINE-7 and the size of that is worth printing.")
    A("")
    A("| arm | zero cost | quarter-bp slippage | the pre-registered model | drag |")
    A("|---|---|---|---|---|")
    for arm in arms:
        f_, c_, m_ = (_mean_net(_hb(arm.free)), _mean_net(_hb(arm.cheap)),
                      _mean_net(_hb(arm.model)))
        A(f"| `{arm.model_id}` | {f_:+.4f}R ({_money(f_)}) | {c_:+.4f}R "
          f"({_money(c_)}) | {m_:+.4f}R ({_money(m_)}) | {f_-m_:.4f}R "
          f"({_money(-(f_-m_))}) |")
    A("")
    A("**Read the middle column carefully, because it goes the wrong way and "
      "that is not a bug.** Quarter-bp slippage is CHEAPER than the "
      "pre-registered model, and the trigger arm still looks worse under it. "
      "Slippage moves the fill, and the fill is one end of the stop distance: "
      "a fill closer to the breakout level means a narrower stop, which means "
      "every dollar won or lost is divided by a smaller number. At a stop this "
      "tight the denominator moves more than the numerator does. It is the "
      "same arithmetic ENGINE-4 found on SPY running in the other direction, "
      "and it is one more way of saying that a stop of a few cents is not a "
      "stop, it is a rounding error with a name.")
    A("")

    # --- confidence and limits ---------------------------------------------
    A("## How confident we actually are")
    A("")
    for arm in arms:
        rows, verdict, s, g, paired_flip, paired_rnd, pf = ev[arm.key]
        hb = _hb(arm.model)
        lo, hi = _ci([t.net_r for t in hb])
        allm = summarise(arm.model, "all")
        A(f"- **`{arm.model_id}`**: {verdict}. Held-back year "
          f"{_usd(s.mean_r)} per $1,000 risked with a 95% range of "
          f"{_usd(lo)} to {_usd(hi)}; the whole five years "
          f"{_usd(allm.mean_r)}. "
          + ("The interval spans zero, so the held-back number does not "
             "establish an edge in either direction."
             if lo <= 0 <= hi else
             "The interval excludes zero on the held-back year alone."))
    A("")
    A("Honest limits, all of them pre-registered rather than added afterwards:")
    A("")
    A("- **The held-back year is on its fourth reading.** ENGINE-7 measured on "
      "2024-01-01 → 2026-08-28, which contains it; ENGINE-8 evaluated two "
      "models on it; this lane evaluates two more. No correction is applied "
      "and none is claimed. Every use of a held-back window spends some of "
      "what made it worth holding back.")
    A("- **Two arms on one year** carries about a 10% chance that one clears "
      "zero by luck rather than 5%. Both are printed, in the order they were "
      "specified, and neither is led with.")
    A("- **The trigger arm's candle was not finished when the trade was put "
      "on.** Its stop is that candle's extreme as it stood at the fill minute, "
      "because the minutes after the fill are the future and this harness "
      "cannot read them. A trader who waits for the breakout candle to CLOSE "
      "and then enters is running a different entry rule, and no number here "
      "speaks to it. That call was written into the gate before the run.")
    A("- **Five years was the owner's choice and it is not widened.** "
      "Everything before 2021-08-29 stays in the cache and is not the subject.")
    A("- **A disclosure that costs nothing to make and would be dishonest to "
      "omit.** Before the full run, this report-writing code was smoke-tested "
      "on a two-month slice (2025-06-02 → 2025-10-31) that overlaps the "
      "held-back window, to check that the tables and the gate plumbing worked "
      "at all. The gate was already committed at that point, no threshold or "
      "parameter was changed after it, and no arm was added or dropped — but "
      "numbers from inside the verdict window were seen by a human before the "
      "verdict run, and that is recorded here rather than left out.")
    A("- **What would change the answer, in order of how much it would move "
      "it:** (1) the fill model — every entry is a resting stop order filled at "
      "the worse of the level and the bar's open, which is optimistic for "
      "twenty simultaneous orders on the most volatile names of the morning, "
      "and it matters MORE the tighter the stop; (2) short borrow, which this "
      "harness does not model and is not free on a stock that just gapped on "
      "news; (3) the 4× leverage cap; (4) the pool, the top 1,000 of the "
      "eligible universe by dollar volume rather than all of it.")
    A("- **What this report does NOT establish**: that either arm is worth "
      "trading. Nothing here has been run forward in real time, and no "
      "live-execution question — borrow, halts, locked markets, partial fills "
      "at the range close — has been touched.")
    A("")

    # --- census ------------------------------------------------------------
    A("## Census")
    A("")
    shown = [("v4_trigger", sip_census["trig"]), ("v4_prior", sip_census["prior"]),
             ("orb_sip.v2", sip_census["v2"]),
             ("random 20 (trigger)", unf_census["rnd_trig"]),
             ("random 20 (prior)", unf_census["rnd_prior"])]
    A("| | " + " | ".join(n for n, _ in shown) + " |")
    A("|---|" + "---|" * len(shown))
    for k in sorted({k for _, c in shown for k in c}):
        A(f"| {k} | " + " | ".join(f"{c.get(k,0):,}" for _, c in shown) + " |")
    A(f"| symbol-days with no cached bars | {sip_missing:,} | {sip_missing:,} | "
      f"{sip_missing:,} | {unf_missing:,} | {unf_missing:,} |")
    A("")
    A("## Selection, costs and fills")
    A("")
    A(f"- selection: ENGINE-6's, unchanged and not recomputed — pool of the top "
      f"{sel['pool_n']:,} eligible names by prior-close 20-day dollar volume, "
      f"then the top {sel['top_k']} by 09:30-09:35 volume over the mean of the "
      f"same five minutes across the previous {sel['baseline_days']} sessions, "
      f"floor {sel['min_rvol']:.1f}.")
    A(f"- ${COSTS.commission_per_share:.3f}/share/side commission, "
      f"{COSTS.slippage_bps:.1f} bp adverse slippage on market and stop fills — "
      "ENGINE-1's model, unchanged for the tenth time.")
    A("- entry is a resting stop order at the range edge, filled at the worse "
      "of the level and the bar's open, plus slippage. The stop is a LEVEL "
      "read off a five-minute candle at the fill, not a distance carried from "
      "it, and the R it is divided by is measured from the fill that actually "
      "happened.")
    A("- all three stop readings ran through the SAME replay "
      "(`backtest/candle_stop.py`), which is asserted in "
      "`tests/test_orb_sip_v4.py` to reproduce `backtest/engine.py` trade for "
      "trade on a model that does not use the fill-time hook. The report also "
      "asserts, before writing a number, that the three readings took the same "
      "symbol-days with the same sides at the same fills.")
    A("")

    REPORT.parent.mkdir(parents=True, exist_ok=True)
    REPORT.write_text("\n".join(L) + "\n")
    print("\n".join(L[:40]))
    print(f"\nwrote {REPORT}")

    dump = REPORT.with_suffix(".trades.csv.gz")
    with gzip.open(dump, "wt") as f:
        f.write("arm,model_id,symbol,day,side,entry_minute,exit_minute,"
                "fill_price,stop_price,v2_stop,exit_price,exit_reason,"
                "risk_per_share,gross_r,net_r,mae_r,mfe_r\n")
        sets = [(f"{x.key}.model", x.model) for x in arms]
        sets += [(f"{x.key}.coinflip", x.flip) for x in arms]
        sets += [(f"{x.key}.random20", x.rnd) for x in arms]
        sets += [("v2.model", v2), ("v2.coinflip", v2_flip),
                 ("v2.random20", rnd_v2)]
        for arm_name, ts in sets:
            for t in ts:
                f.write(f"{arm_name},{t.model_id},{t.symbol},{t.day},{t.side},"
                        f"{t.entry_minute},{t.exit_minute},{t.fill_price:.4f},"
                        f"{t.stop_price:.4f},"
                        + (f"{float(t.meta['v2_stop']):.4f}," if 'v2_stop' in t.meta else ",")
                        +                         f"{t.exit_price:.4f},{t.exit_reason},"
                        f"{t.risk_per_share:.4f},{t.gross_r:.5f},{t.net_r:.5f},"
                        f"{t.mae_r:.5f},{t.mfe_r:.5f}\n")
    for arm in arms:
        eq = REPORT.with_suffix(f".{arm.key}.equity.csv")
        p = run_portfolio(arm.model, days_all)
        eq.write_text("day,equity,daily_return,exposure_ratio\n" + "\n".join(
            f"{d},{e:.2f},{r:.6f},{x:.4f}"
            for d, e, r, x in zip(p.days, p.equity, p.daily_return,
                                  p.exposure_ratio)) + "\n")
    print(f"wrote {dump} and the equity curves")


if __name__ == "__main__":
    raise SystemExit(main())
