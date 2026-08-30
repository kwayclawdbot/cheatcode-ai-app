"""ENGINE-13 — the owner's 15-minute ORB on a five-minute close, and SPY confluence.

    .venv/bin/python run_engine13.py

There is no `--stage plan` and there is no parameter to vary. The selection is
ENGINE-6's `selection.json.gz`, reused byte for byte, so **nothing is
downloaded** — every one-minute bar this lane needs is already on disk, and the
SPY reference comes from `polygon-deep-v1`, which is also already on disk.

Three arms, one pass over the tape:

    baseline    `orb_sip.v2`, the incumbent, re-replayed here rather than read
                from ENGINE-7's dump, so all three arms go through identical
                code on identical bars.
    orb15c      the 15-minute range, entered on a five-minute CLOSE outside it.
    orb15c_spy  the same, taken only when SPY moved the same way over the same
                window.

The bar is `engine/models/orb_sip.v5_15c/GATE.md`, committed before this file
produced a number.
"""

from __future__ import annotations

import gzip
import json
import sys
import time
from collections import Counter
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from engine import config  # noqa: E402
from engine.backtest.engine import run_symbol  # noqa: E402
from engine.backtest.stats import (SUMMARY_HEADER, fmt, summarise,  # noqa: E402
                                   summary_row)
from engine.backtest.types import Costs  # noqa: E402
from engine.cache import load as cache_load  # noqa: E402
from engine.models import gates13 as G  # noqa: E402
from engine.models.orb_sip_15c import OrbSip15Close, OrbSip15CloseSpy  # noqa: E402
from engine.models.orb_sip_v2 import OrbStocksInPlayV2  # noqa: E402
from engine.models.spy_ref import SpyPanel  # noqa: E402
from engine.run_backtest import git_rev  # noqa: E402
from engine.run_engine6 import (ARM_SIP, ARM_UNFILTERED, COSTS,  # noqa: E402
                                FREE, _atr_map, _window)
from engine.sip import config as scfg  # noqa: E402

REPORT = (Path(__file__).resolve().parent / "reports"
          / f"orb_sip.v5_15c.{scfg.SNAPSHOT}.md")
TRADES_OUT = (Path(__file__).resolve().parent / "reports"
              / f"orb_sip.v5_15c.{scfg.SNAPSHOT}.trades.csv.gz")
SELECTION_PATH = scfg.DATA_ROOT / "selection.json.gz"
SPY_SNAPSHOT = config.SNAPSHOT_DEEP
RISK_DOLLARS = 1_000.0

ARM_LABEL = {G.BASELINE: "baseline (orb_sip.v2, the incumbent)",
             G.ORB15C: "orb15c (15-min range, 5-min close)",
             G.ORB15C_SPY: "orb15c_spy (the same, plus SPY confluence)"}


def _d(s: str) -> int:
    return int(s.replace("-", ""))


def _money(r: float) -> str:
    return f"{r * RISK_DOLLARS:+,.0f} dollars"


def _mean(xs) -> float:
    return float(np.mean(xs)) if len(xs) else float("nan")


def _days(trades) -> int:
    return len({int(t.day) for t in trades})


def _paired_by_day(a_trades, b_trades) -> list[float]:
    """Per-day mean net R of arm A minus arm B, on days both arms traded."""
    def by_day(ts):
        d: dict[int, list[float]] = {}
        for t in ts:
            d.setdefault(int(t.day), []).append(float(t.net_r))
        return {k: float(np.mean(v)) for k, v in d.items()}
    a, b = by_day(a_trades), by_day(b_trades)
    return [a[d] - b[d] for d in sorted(set(a) & set(b))]


def _gross_mean(trades) -> float:
    return _mean([t.gross_r for t in trades])


def _stop_out_share(trades) -> float:
    if not trades:
        return float("nan")
    return sum(1 for t in trades if t.exit_reason == "stop") / len(trades)


# ---------------------------------------------------------------------------
# the replay


def _load_selection() -> dict:
    with gzip.open(SELECTION_PATH, "rt") as f:
        return json.load(f)


def _replay(days_by_symbol: dict[str, set[int]], atr: dict,
            spy: SpyPanel) -> tuple[dict, dict, int]:
    """One pass over the tape, six models on it (three arms x net and gross).

    Loading a symbol is the expensive part, so every arm and every cost model
    sees the same series in the same read. They are independent replays sharing
    a read, not a shared replay.
    """
    factories = [
        (G.BASELINE, "net", lambda: OrbStocksInPlayV2(atr), COSTS),
        (G.BASELINE, "gross", lambda: OrbStocksInPlayV2(atr), FREE),
        (G.ORB15C, "net", lambda: OrbSip15Close(atr), COSTS),
        (G.ORB15C, "gross", lambda: OrbSip15Close(atr), FREE),
        (G.ORB15C_SPY, "net", lambda: OrbSip15CloseSpy(atr, spy=spy), COSTS),
        (G.ORB15C_SPY, "gross", lambda: OrbSip15CloseSpy(atr, spy=spy), FREE),
    ]
    trades: dict[tuple[str, str], list] = {(a, c): [] for a, c, _, _ in factories}
    census: dict[str, Counter] = {a: Counter() for a in G.ARMS}
    missing = 0
    t0 = time.time()
    for i, (sym, days) in enumerate(sorted(days_by_symbol.items())):
        try:
            series = cache_load.load(sym, "1m", scfg.SNAPSHOT)
        except FileNotFoundError:
            missing += len(days)
            continue
        for arm, cost_label, make_model, costs in factories:
            model = make_model()
            t, _ = run_symbol(series, model, costs, warmup_days=0,
                              day_filter=lambda d, days=days: int(d) in days)
            model.finish()
            trades[(arm, cost_label)].extend(t)
            if cost_label == "net":
                census[arm].update(model.census)
        cache_load.load.cache_clear()
        if (i + 1) % 250 == 0:
            el = time.time() - t0
            print(f"  replayed {i+1:,}/{len(days_by_symbol):,} symbols, "
                  f"{len(trades[(G.ORB15C, 'net')]):,} orb15c trades, "
                  f"{el/60:.1f} min", flush=True)
    return trades, census, missing


def _replay_reference(days_by_symbol: dict[str, set[int]], atr: dict) -> list:
    """The incumbent's rules on ENGINE-6's random-20 selection.

    A reference point, not an arm: it makes a losing number readable and no
    gate in `gates13.py` reads it.
    """
    out: list = []
    for sym, days in sorted(days_by_symbol.items()):
        try:
            series = cache_load.load(sym, "1m", scfg.SNAPSHOT)
        except FileNotFoundError:
            continue
        model = OrbStocksInPlayV2(atr)
        t, _ = run_symbol(series, model, COSTS, warmup_days=0,
                          day_filter=lambda d, days=days: int(d) in days)
        model.finish()
        out.extend(t)
        cache_load.load.cache_clear()
    return out


# ---------------------------------------------------------------------------
# report helpers


def _arm_line(label: str, trades) -> str:
    if not trades:
        return f"- **{label}** — no trades.\n"
    s = summarise(trades, label)
    lo, hi = G.mean_ci95([t.net_r for t in trades])
    return (f"- **{label}** — {len(trades):,} trades over {_days(trades):,} "
            f"trading days. After commission and slippage the average trade "
            f"returned **{s.mean_r:+.4f}** times what was risked on it, i.e. "
            f"**{_money(s.mean_r)} a trade** for a trader risking $1,000. The "
            f"middle trade returned {s.median_r:+.4f} ({_money(s.median_r)}), "
            f"{s.hit_rate*100:.1f}% finished green and "
            f"{_stop_out_share(trades)*100:.1f}% were stopped out. The 95% range "
            f"around the average is {_money(lo)} to {_money(hi)}"
            f"{'**, which contains zero**' if lo <= 0 <= hi else '**, which excludes zero**'}"
            f".\n")


def _paired_line(name: str, d: list[float]) -> str:
    if not d:
        return f"- **{name}** — no overlapping days.\n"
    m = _mean(d)
    lo, hi = G.mean_ci95(d)
    blo, bhi = G.mean_ci(d, G.Z_BONFERRONI)
    verdict = ("**That range lies entirely below zero**"
               if hi < 0 else "**That range lies entirely above zero**"
               if lo > 0 else "That range contains zero, so no difference is established")
    return (f"- **{name}**, paired day by day: **{_money(m)}** a trade on $1,000 "
            f"of risk ({m:+.4f}R), with a 95% range of {_money(lo)} to "
            f"{_money(hi)}, over {len(d):,} days both arms traded. {verdict}. "
            f"Corrected for taking three shots: {_money(blo)} to {_money(bhi)}.\n")


def _stop_width_row(label: str, trades) -> str:
    if not trades:
        return f"| {label} | 0 | n/a | n/a | n/a | n/a | n/a |"
    risk = np.array([t.risk_per_share for t in trades])
    fill = np.array([t.fill_price for t in trades])
    atrs = np.array([float(t.meta.get("atr14", np.nan)) for t in trades])
    with np.errstate(invalid="ignore", divide="ignore"):
        pct = risk / fill * 100.0
        in_atr = risk / atrs
    comm = 2.0 * COSTS.commission_per_share / np.median(risk) * 100.0
    return (f"| {label} | {len(trades):,} | {np.median(risk)*100:.0f}¢ | "
            f"{np.median(pct):.2f}% | {np.nanmedian(in_atr):.2f} | "
            f"{comm:.1f}% | {_stop_out_share(trades)*100:.1f}% |")


def _era_means(trades) -> dict[str, float]:
    out = {}
    for label, lo, hi in G.ERAS:
        w = _window(trades, _d(lo), _d(hi))
        out[label] = _mean([t.net_r for t in w])
    return out


def _opposite_sides(a_trades, b_trades) -> tuple[int, int, float, float]:
    """(shared symbol-days, of which opposite side, A's mean net R there,
    B's mean net R there)."""
    a = {(t.symbol, int(t.day)): t for t in a_trades}
    b = {(t.symbol, int(t.day)): t for t in b_trades}
    shared = sorted(set(a) & set(b))
    opp = [k for k in shared if a[k].side != b[k].side]
    return (len(shared), len(opp),
            _mean([a[k].net_r for k in opp]), _mean([b[k].net_r for k in opp]))


def _write_trades(trades_by_arm: dict[str, list]) -> None:
    import csv
    with gzip.open(TRADES_OUT, "wt", newline="") as f:
        w = csv.writer(f)
        w.writerow(["arm", "model_id", "symbol", "day", "side",
                    "decision_minute", "entry_minute", "exit_minute",
                    "fill_price", "stop_price", "exit_price", "exit_reason",
                    "risk_per_share", "gross_r", "net_r", "mae_r", "mfe_r",
                    "or_high", "or_low", "atr14"])
        for arm in G.ARMS:
            for t in trades_by_arm[arm]:
                w.writerow([arm, t.model_id, t.symbol, t.day, t.side,
                            t.decision_minute, t.entry_minute, t.exit_minute,
                            f"{t.fill_price:.4f}", f"{t.stop_price:.4f}",
                            f"{t.exit_price:.4f}", t.exit_reason,
                            f"{t.risk_per_share:.4f}", f"{t.gross_r:.6f}",
                            f"{t.net_r:.6f}", f"{t.mae_r:.6f}", f"{t.mfe_r:.6f}",
                            f"{t.meta.get('or_high', float('nan')):.4f}",
                            f"{t.meta.get('or_low', float('nan')):.4f}",
                            f"{t.meta.get('atr14', float('nan'))}"])


# ---------------------------------------------------------------------------


def main() -> int:
    t_start = time.time()
    print("ENGINE-13 — 15-minute ORB on a 5-minute close, and SPY confluence",
          flush=True)
    print(f"  snapshot (traded): {scfg.SNAPSHOT}", flush=True)
    print(f"  snapshot (SPY reference): {SPY_SNAPSHOT}", flush=True)

    sel = _load_selection()
    # ENGINE-6 wrote TWO arms into this file: `sip`, the day's twenty stocks in
    # play, and `unfiltered`, its random-20 matched control. Only the first is
    # the incumbent's selection. Replaying both together silently blends the
    # strategy with its own coin toss, which is what the first run of this file
    # did — caught by the pre-registered requirement that the baseline arm
    # reproduce ENGINE-7's held-back figures, which it did not.
    rows = [r for r in sel["rows"] if r["arm"] == ARM_SIP]
    ctl_rows = [r for r in sel["rows"] if r["arm"] == ARM_UNFILTERED]
    pairs = {(r["symbol"], int(r["day"])) for r in rows}
    days_by_symbol: dict[str, set[int]] = {}
    for s, d in pairs:
        days_by_symbol.setdefault(s, set()).add(d)
    ctl_by_symbol: dict[str, set[int]] = {}
    for r in ctl_rows:
        ctl_by_symbol.setdefault(r["symbol"], set()).add(int(r["day"]))
    print(f"  selection: {len(pairs):,} stocks-in-play symbol-days, "
          f"{len(days_by_symbol):,} symbols (ENGINE-6's file, unchanged); "
          f"{len(ctl_rows):,} random-20 control rows held aside as the "
          f"reference", flush=True)

    atr = _atr_map(pairs | {(r["symbol"], int(r["day"])) for r in ctl_rows})
    print(f"  ATR (reporting only) for {len(atr):,} symbol-days", flush=True)

    spy_series = cache_load.load("SPY", "1m", SPY_SNAPSHOT)
    spy = SpyPanel(spy_series)
    print(f"  SPY reference: {len(spy_series):,} bars, "
          f"{len(spy._minute):,} sessions", flush=True)

    trades, census, missing = _replay(days_by_symbol, atr, spy)
    print(f"  replay done in {(time.time()-t_start)/60:.1f} min, "
          f"{missing:,} symbol-days had no cached bars", flush=True)

    net = {a: trades[(a, "net")] for a in G.ARMS}
    gross = {a: trades[(a, "gross")] for a in G.ARMS}

    # The random-20 reference, required by the GATE's report list. It is the
    # incumbent's rules on ENGINE-6's coin-toss selection, so a losing arm can
    # be read against something. It is NOT an arm and no gate reads it.
    print("  replaying the random-20 reference...", flush=True)
    ctl = _replay_reference(ctl_by_symbol, atr)
    print(f"  random-20 reference: {len(ctl):,} trades", flush=True)

    v_lo, v_hi = _d(G.VERDICT[0]), _d(G.VERDICT[1])
    d_lo, d_hi = _d(G.DISCLOSURE[0]), _d(G.DISCLOSURE[1])
    v_net = {a: _window(net[a], v_lo, v_hi) for a in G.ARMS}
    v_gross = {a: _window(gross[a], v_lo, v_hi) for a in G.ARMS}
    d_net = {a: _window(net[a], d_lo, d_hi) for a in G.ARMS}

    summaries = {a: summarise(v_net[a], a) for a in G.ARMS}
    # "Gross" means what it has meant since ENGINE-6: `gross_r` off the
    # cost-laden replay — commission excluded, slippage still inside the fills.
    # Keeping the definition identical is the only reason the number is
    # comparable with ENGINE-6 through -12. The separate zero-cost replay is
    # reported beside it as `true zero cost`, and is not what any gate reads.
    gross_means = {a: _gross_mean(v_net[a]) for a in G.ARMS}
    zero_cost = {a: _gross_mean(v_gross[a]) for a in G.ARMS}
    paired = {
        G.ORB15C: _paired_by_day(v_net[G.ORB15C], v_net[G.BASELINE]),
        G.ORB15C_SPY: _paired_by_day(v_net[G.ORB15C_SPY], v_net[G.BASELINE]),
        "spy_vs_a": _paired_by_day(v_net[G.ORB15C_SPY], v_net[G.ORB15C]),
    }
    eras = {a: _era_means(net[a]) for a in G.ARMS}

    rows_g = G.evaluate(summaries, gross_means, paired, eras)
    verdict = G.verdict(rows_g, summaries, paired, eras)
    print(f"\n  VERDICT: {verdict}\n", flush=True)
    for g in rows_g:
        print(f"   {g.id} {'PASS' if g.passed else 'FAIL'} — {g.name}: {g.observed}",
              flush=True)

    _write_trades(v_net)
    _write_report(sel, verdict, rows_g, summaries, gross_means, paired, eras,
                  v_net, v_gross, d_net, net, census, missing, spy,
                  _window(ctl, v_lo, v_hi), zero_cost, time.time() - t_start)
    print(f"\n  wrote {REPORT}", flush=True)
    print(f"  wrote {TRADES_OUT}", flush=True)
    return 0


def _write_report(sel, verdict, rows_g, summaries, gross_means, paired, eras,
                  v_net, v_gross, d_net, all_net, census, missing, spy,
                  v_ctl, zero_cost, elapsed) -> None:
    L = []
    w = L.append

    w("# `orb_sip.v5_15c` — a 15-minute opening range, entered on a five-minute close")
    w("")
    w(f"**Verdict: {verdict}.** Decided on the window "
      f"{G.VERDICT[0]} → {G.VERDICT[1]} and on nothing else.")
    w("")
    w(f"Traded snapshot `{scfg.SNAPSHOT}`, unchanged. SPY reference from "
      f"`{SPY_SNAPSHOT}`, unchanged — no statistic mixes prices from the two, "
      f"the reference returns a sign and nothing else. Selection is ENGINE-6's "
      f"`selection.json.gz`, byte for byte. Gate: "
      f"[`../models/orb_sip.v5_15c/GATE.md`](../models/orb_sip.v5_15c/GATE.md), "
      f"committed before any number below existed. Git rev `{git_rev()}`. "
      f"Nothing was downloaded; the run took {elapsed/60:.1f} minutes.")
    w("")

    # -- plain English ------------------------------------------------------
    w("## In plain English")
    w("")
    w("**What was compared.** Every trading day, take the same twenty US stocks "
      "— the ones whose first five minutes traded the most abnormal volume, "
      "which is the only selector this programme has ever measured as doing "
      "work — and trade each of them three different ways.")
    w("")
    w("- **baseline** — the incumbent. The 09:30–09:35 candle is the range; a "
      "resting order sits at the edge the candle closed toward; the stop is the "
      "other end of that candle; hold to the closing bell.")
    w("- **orb15c** — the owner's change. The range is 09:30–**09:45**; nothing "
      "is taken until a **five-minute candle CLOSES** outside it; the side is "
      "whichever side it closed through; the stop is the other end of the "
      "fifteen-minute range; hold to the closing bell.")
    w("- **orb15c_spy** — the same as orb15c, but the trade is skipped unless "
      "SPY moved the same way over the same window (from 09:45 to the close of "
      "the confirming candle).")
    w("")
    w("**This is the sixth reading of this window.** ENGINE-6 read the whole "
      "2016–2026 tape, the ENGINE-6 stop sweep contaminated 2016–2023, and "
      "ENGINE-7, -8, -9, -10 and -11 all read windows inside 2024–2026. There "
      "is no un-looked-at data left in any snapshot on disk, and fetching some "
      "would mean paid Polygon calls, which this lane was forbidden. No "
      "correction is applied because none is available. **Everything below is "
      "suggestive, not conclusive**, and the era table is the substitute for a "
      "window nobody had seen.")
    w("")
    w("**The wider stop is not free, and part of it was chosen with hindsight.** "
      "The one thing every earlier lane taught this programme is that wider "
      "stops did better on this tape. A fifteen-minute range is wider than a "
      "five-minute one by construction, so **orb15c starts with an advantage "
      "borrowed from a window it is being judged on**. That is exactly why the "
      "comparison here is against the incumbent — which carries the same "
      "advantage — and never against zero.")
    w("")
    w("**Three comparisons on one window is three chances to look good by "
      "luck.** With three shots at a 5% test the chance that at least one "
      "clears by chance alone is nearer 14% than 5%. The gate stays the 95% "
      "interval, unchanged from ENGINE-6 onward; the stricter interval that "
      "corrects for three shots is printed beside every comparison.")
    w("")
    for a in G.ARMS:
        w(_arm_line(ARM_LABEL[a], v_net[a]))
    w("")
    w(_paired_line("orb15c minus the incumbent", paired[G.ORB15C]))
    w(_paired_line("orb15c_spy minus the incumbent", paired[G.ORB15C_SPY]))
    w(_paired_line("orb15c_spy minus orb15c (what the SPY filter alone did)",
                   paired["spy_vs_a"]))
    w("")
    w(f"- **Verdict**: **{verdict}**.")
    w("")
    passed = [g.id for g in rows_g if g.passed]
    failed = [g.id for g in rows_g if not g.passed]
    w("**Which gates carried the verdict, in words.** "
      + " ".join(f"{g.id} {'passed' if g.passed else 'FAILED'} ({g.name})."
                 for g in rows_g))
    w("")
    if verdict == G.INCUMBENT_HOLDS:
        w("**The incumbent held.** Neither change beat the five-minute range by "
          "a margin that clears its own error bar, so nothing is displaced. "
          "That is a useful result: the cheapest way to break a working system "
          "is to replace a measured component with an unmeasured one.")
        w("")
    w(f"Gates passed: {', '.join(passed) if passed else 'none'}. "
      f"Gates failed: {', '.join(failed) if failed else 'none'}.")
    w("")

    # -- the gate table -----------------------------------------------------
    w("## The pre-registered bar, and what it read")
    w("")
    w("| id | gate | threshold | observed | |")
    w("|---|---|---|---|---|")
    for g in rows_g:
        w(f"| **{g.id}** | {g.name} | {g.threshold} | {g.observed} | "
          f"{'PASS' if g.passed else '**FAIL**'} |")
    w("")

    # -- the numbers --------------------------------------------------------
    w(f"## The verdict window, {G.VERDICT[0]} → {G.VERDICT[1]}")
    w("")
    w("Gross before net; the median beside the mean; the day count beside the "
      "trade count, because trades on the same morning are not independent of "
      "each other and the day count is the honest sample size.")
    w("")
    w("| arm | trades | days | mean gross R | true zero cost | mean net R | "
      "median net R | money per $1,000 | 95% range | hit | stopped out |")
    w("|---|---|---|---|---|---|---|---|---|---|---|")
    for a in G.ARMS:
        s = summaries[a]
        lo, hi = G.mean_ci95([t.net_r for t in v_net[a]])
        w(f"| `{a}` | {s.n:,} | {_days(v_net[a]):,} | "
          f"{gross_means[a]:+.4f} | {zero_cost[a]:+.4f} | {s.mean_r:+.4f} | "
          f"{s.median_r:+.4f} | "
          f"{_money(s.mean_r)} | {_money(lo)} to {_money(hi)} | "
          f"{s.hit_rate*100:.1f}% | {_stop_out_share(v_net[a])*100:.1f}% |")
    w("")
    ctl_s = summarise(v_ctl, "random 20")
    ctl_lo, ctl_hi = G.mean_ci95([t.net_r for t in v_ctl]) if v_ctl else (float("nan"),) * 2
    w(f"| *random 20 (reference, not an arm)* | {ctl_s.n:,} | {_days(v_ctl):,} | "
      f"— | — | {ctl_s.mean_r:+.4f} | {ctl_s.median_r:+.4f} | {_money(ctl_s.mean_r)} | "
      f"{_money(ctl_lo)} to {_money(ctl_hi)} | {ctl_s.hit_rate*100:.1f}% | "
      f"{_stop_out_share(v_ctl)*100:.1f}% |")
    w("")
    w(SUMMARY_HEADER)
    for a in G.ARMS:
        w(summary_row(summarise(v_net[a], a)))
    w(summary_row(ctl_s))
    w("")

    # -- the reproduction check --------------------------------------------
    bs = summaries[G.BASELINE]
    w("### Proof that the baseline arm IS the incumbent")
    w("")
    w("ENGINE-7 decided its PARTIAL on this exact window. If the `baseline` arm "
      "here does not reproduce those figures, this lane's comparison is against "
      "something that is not the incumbent and no number below means anything. "
      "**The first run of this lane failed this check** — it replayed both arms "
      "of ENGINE-6's selection file, blending the stocks-in-play picks with the "
      "random-20 control, and returned a baseline of −0.0192R. That run was "
      "discarded, the selection filter was fixed, and this is the re-run.")
    w("")
    w("| | ENGINE-7 reported | this run | |")
    w("|---|---|---|---|")
    for name, want, got in (
            ("trades", "10,545", f"{bs.n:,}"),
            ("mean gross R", "+0.0324", f"{gross_means[G.BASELINE]:+.4f}"),
            ("mean net R", "+0.0199", f"{bs.mean_r:+.4f}"),
            ("median net R", "-0.1180", f"{bs.median_r:+.4f}"),
            ("hit rate", "45.0%", f"{bs.hit_rate*100:.1f}%"),
            ("stopped out", "31.6%", f"{_stop_out_share(v_net[G.BASELINE])*100:.1f}%")):
        ok = want.replace(",", "").lstrip("+") == got.replace(",", "").lstrip("+")
        w(f"| {name} | {want} | {got} | {'match' if ok else '**differs**'} |")
    w("")

    # -- stop geometry ------------------------------------------------------
    w("## Realised stop width — the parameter that has explained every result here")
    w("")
    w("| arm | trades | median stop | % of price | in 14-day ATRs | commission "
      "as share of risk | stopped out |")
    w("|---|---|---|---|---|---|---|")
    for a in G.ARMS:
        w(_stop_width_row(a, v_net[a]))
    w("")
    base_risk = np.median([t.risk_per_share for t in v_net[G.BASELINE]]) \
        if v_net[G.BASELINE] else float("nan")
    a_risk = np.median([t.risk_per_share for t in v_net[G.ORB15C]]) \
        if v_net[G.ORB15C] else float("nan")
    w(f"The fifteen-minute range plus the confirming close widened the median "
      f"stop from **{base_risk*100:.0f}¢ to {a_risk*100:.0f}¢**, a factor of "
      f"**{a_risk/base_risk:.2f}x**. R divides by that, so the same dollar move "
      f"reports as a smaller R in the orb15c arms. **The money-per-$1,000 "
      f"column is the one the gate is decided on, and it already accounts for "
      f"this.**")
    w("")

    # -- opposite sides -----------------------------------------------------
    shared, opp, a_opp, b_opp = _opposite_sides(v_net[G.ORB15C], v_net[G.BASELINE])
    w("## Taking direction from the break instead of the opening candle's sign")
    w("")
    w(f"orb15c and the incumbent both traded **{shared:,}** of the same "
      f"symbol-days in the verdict window. They took **opposite sides** on "
      f"**{opp:,}** of them ({opp / shared * 100 if shared else 0:.1f}%). On those "
      f"symbol-days orb15c returned {_money(a_opp)} a trade and the incumbent "
      f"{_money(b_opp)}.")
    w("")

    # -- what the confirmation skips ---------------------------------------
    a_keys = {(t.symbol, int(t.day)) for t in v_net[G.ORB15C]}
    base_only = [t for t in v_net[G.BASELINE]
                 if (t.symbol, int(t.day)) not in a_keys]
    w("## What the close-confirmation rule never opens, and what it cost")
    w("")
    w(f"The incumbent traded **{len(base_only):,}** symbol-days in the verdict "
      f"window on which orb15c never took a trade — the range never closed "
      f"through by 15:30, or the range itself was unusable. On exactly those "
      f"symbol-days the incumbent returned **{_money(_mean([t.net_r for t in base_only]))}** "
      f"a trade over {_days(base_only):,} days. "
      + ("**Those are trades the confirmation rule declined to take, and they "
         "made money, so the rule's selectivity cost something.**"
         if _mean([t.net_r for t in base_only]) > 0 else
         "**Those are trades the confirmation rule declined to take, and they "
         "lost money, so the rule's selectivity saved something.**"))
    w("")
    w("Census, orb15c (per symbol-day seen):")
    w("")
    w("| count | n |")
    w("|---|---|")
    for k, v in sorted(census[G.ORB15C].items()):
        w(f"| {k} | {v:,} |")
    w("")

    # -- what SPY removed ---------------------------------------------------
    spy_keys = {(t.symbol, int(t.day)) for t in v_net[G.ORB15C_SPY]}
    removed = [t for t in v_net[G.ORB15C] if (t.symbol, int(t.day)) not in spy_keys]
    kept = [t for t in v_net[G.ORB15C] if (t.symbol, int(t.day)) in spy_keys]
    r_mean, k_mean = _mean([t.net_r for t in removed]), _mean([t.net_r for t in kept])
    w("## What the SPY filter removed, and what those trades did")
    w("")
    w(f"The filter removed **{len(removed):,}** of orb15c's {len(v_net[G.ORB15C]):,} "
      f"verdict-window trades ({len(removed)/max(len(v_net[G.ORB15C]),1)*100:.1f}%). "
      f"The **removed** trades returned **{_money(r_mean)}** a trade; the "
      f"**kept** trades returned **{_money(k_mean)}**.")
    w("")
    if r_mean > k_mean:
        w("**The trades the filter removed did BETTER than the trades it kept.** "
          "That is ENGINE-8's failure mode, reproduced: the filter is not "
          "discriminating in the direction it was supposed to, and it is "
          "throwing away the better half.")
    else:
        w("The trades the filter removed did worse than the trades it kept, "
          "which is the direction the filter was aimed at. Whether the "
          "difference clears its own error bar is W4, above.")
    w("")
    w("Census, orb15c_spy:")
    w("")
    w("| count | n |")
    w("|---|---|")
    for k, v in sorted(census[G.ORB15C_SPY].items()):
        w(f"| {k} | {v:,} |")
    w("")

    # -- eras ---------------------------------------------------------------
    w("## The era table — the substitute for a window nobody had seen")
    w("")
    w("There is no un-looked-at span left on disk. The next best check available "
      "without paid downloads is whether a result keeps its sign across three "
      "eras that were never used to choose anything in this lane.")
    w("")
    w("| arm | " + " | ".join(lab for lab, _, _ in G.ERAS) + " |")
    w("|---|" + "---|" * len(G.ERAS))
    for a in G.ARMS:
        cells = []
        for lab, lo, hi in G.ERAS:
            wnd = _window(all_net[a], _d(lo), _d(hi))
            m = _mean([t.net_r for t in wnd])
            cells.append(f"{_money(m)} (n={len(wnd):,})")
        w(f"| `{a}` | " + " | ".join(cells) + " |")
    w("")

    # -- disclosure ---------------------------------------------------------
    w(f"## The contaminated window, {G.DISCLOSURE[0]} → {G.DISCLOSURE[1]} — "
      f"a disclosure, not a verdict")
    w("")
    w("This is the window the ENGINE-6 stop-width sweep was run on. Nothing "
      "here can raise or lower the verdict.")
    w("")
    w("| arm | trades | days | mean net R | money per $1,000 | hit | stopped out |")
    w("|---|---|---|---|---|---|---|")
    for a in G.ARMS:
        s = summarise(d_net[a], a)
        w(f"| `{a}` | {s.n:,} | {_days(d_net[a]):,} | {s.mean_r:+.4f} | "
          f"{_money(s.mean_r)} | {s.hit_rate*100:.1f}% | "
          f"{_stop_out_share(d_net[a])*100:.1f}% |")
    w("")

    # -- caveats ------------------------------------------------------------
    w("## Caveats, and what would change the answer")
    w("")
    w(f"- **The sixth reading.** Every session in this snapshot has been looked "
      f"at by an earlier lane. No correction is applied and none exists. The "
      f"only honest next step for any result here is forward, on sessions that "
      f"have not happened yet.")
    w(f"- **The wide stop was not chosen blind.** orb15c's stop is wider "
      f"because the range is wider, and 'wider is better' is knowledge taken "
      f"from this same tape. The incumbent comparison controls for it; a "
      f"comparison against zero would not.")
    w(f"- **The SPY confluence is one reading of many.** Sign of SPY's move from "
      f"09:45 to the confirming close. It could equally have been SPY's own "
      f"opening range, its candle sign, a VWAP, or a magnitude threshold. One "
      f"definition was written down and tested once. Trying a second after "
      f"seeing this number would make the result meaningless.")
    w(f"- **The selector is not this lane's variable.** The twenty names come "
      f"from a 09:30–09:35 relative-volume rule. A 15-minute selector would "
      f"name different symbol-days and would need paid downloads, so it is out "
      f"of scope and its absence is a declared limit.")
    w(f"- **{missing:,} symbol-days had no cached one-minute bars** and were "
      f"skipped by every arm equally.")
    w(f"- **SPY reference unavailable** on "
      f"{census[G.ORB15C_SPY].get('spy_reference_missing', 0):,} confirmed "
      f"breaks, which were declined rather than guessed.")
    w(f"- Fills are modelled from one-minute OHLC and cannot see inside a bar. "
      f"No live-execution question — borrow, halts, locked markets, partial "
      f"fills on twenty simultaneous orders — has been touched.")
    w(f"- **No leveraged portfolio figure appears anywhere in this report**, by "
      f"pre-registration. ENGINE-7's +223.9% came from four-times-levered "
      f"exposure on a near-zero per-trade edge and was misread as a result.")
    w("")

    REPORT.parent.mkdir(parents=True, exist_ok=True)
    REPORT.write_text("\n".join(L) + "\n")


if __name__ == "__main__":
    raise SystemExit(main())
