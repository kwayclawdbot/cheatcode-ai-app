"""Run one model over the cached universe and write its report.

Usage:
    .venv/bin/python run_backtest.py --model orb_reclaim
"""

from __future__ import annotations

import argparse
import csv
import datetime as dt
import gzip
import json
import subprocess
import sys
import time
from dataclasses import asdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from engine import config  # noqa: E402
from engine.backtest.engine import run_symbol  # noqa: E402
from engine.backtest.regime import regime_by_day  # noqa: E402
from engine.backtest.stats import (SUMMARY_HEADER, fmt, session_bucket,  # noqa: E402
                                   split_by, summarise, summary_row)
from engine.backtest.types import Costs  # noqa: E402
from engine.cache.load import load  # noqa: E402
from engine.models import gates as G  # noqa: E402
from engine.models.null_coinflip import NullCoinflip  # noqa: E402
from engine.models.orb_reclaim import OrbReclaim  # noqa: E402
from engine.models.sweep_displacement_fvg import SweepDisplacementFvg  # noqa: E402

MODELS = {"orb_reclaim": OrbReclaim,
          "sweep_displacement_fvg": SweepDisplacementFvg,
          "null_coinflip": NullCoinflip}


def dayint(s: str) -> int:
    return int(s.replace("-", ""))


def git_rev() -> str:
    try:
        return subprocess.run(["git", "rev-parse", "--short", "HEAD"],
                              capture_output=True, text=True,
                              cwd=config.REPO_ROOT).stdout.strip() or "unknown"
    except Exception:  # noqa: BLE001
        return "unknown"


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--model", required=True, choices=sorted(MODELS))
    ap.add_argument("--symbols", default=",".join(config.UNIVERSE))
    ap.add_argument("--snapshot", default=None)
    ap.add_argument("--commission", type=float, default=0.005)
    ap.add_argument("--slippage-bps", type=float, default=1.0)
    ap.add_argument("--tag", default="", help="suffix for the report filename; "
                    "diagnostic runs must not overwrite the pre-registered one")
    a = ap.parse_args()

    snapshot = a.snapshot or config.SNAPSHOT
    symbols = [s.strip().upper() for s in a.symbols.split(",") if s.strip()]
    costs = Costs(commission_per_share=a.commission, slippage_bps=a.slippage_bps)
    model_cls = MODELS[a.model]

    regimes = regime_by_day(config.BENCHMARK, 50, a.snapshot)
    is_lo, is_hi = (dayint(x) for x in G.IN_SAMPLE)
    oos_lo, oos_hi = (dayint(x) for x in G.OUT_OF_SAMPLE)

    all_trades, all_rejects = [], []
    t0 = time.time()
    for k, sym in enumerate(symbols, 1):
        model = model_cls()
        series = load(sym, "1m", a.snapshot)
        tr, rj = run_symbol(series, model, costs)
        all_trades.extend(tr)
        all_rejects.extend(rj)
        print(f"  [{k}/{len(symbols)}] {sym:<6} {len(tr):>5} trades  "
              f"{len(rj):>4} unfilled  ({time.time()-t0:.0f}s)", flush=True)

    is_tr = [t for t in all_trades if is_lo <= t.day <= is_hi]
    oos_tr = [t for t in all_trades if oos_lo <= t.day <= oos_hi]
    s_all = summarise(all_trades, "all")
    s_is = summarise(is_tr, f"in-sample {G.IN_SAMPLE[0]}..{G.IN_SAMPLE[1]}")
    s_oos = summarise(oos_tr, f"out-of-sample {G.OUT_OF_SAMPLE[0]}..{G.OUT_OF_SAMPLE[1]}")

    reg_is = {k: summarise(v, k) for k, v in
              split_by(is_tr, lambda t: regimes.get(t.day, "unknown")).items()
              if k != "unknown"}
    sess = {k: summarise(v, k) for k, v in split_by(all_trades, session_bucket).items()}
    side = {k: summarise(v, k) for k, v in split_by(all_trades, lambda t: t.side).items()}
    per_sym = {k: summarise(v, k) for k, v in split_by(all_trades, lambda t: t.symbol).items()}
    per_year = {k: summarise(v, k) for k, v in
                split_by(all_trades, lambda t: str(t.day)[:4]).items()}

    gate_rows = G.evaluate(s_is, s_oos, reg_is)
    verdict = G.verdict(gate_rows)

    model = model_cls()
    out_dir = config.REPORTS_ROOT
    out_dir.mkdir(parents=True, exist_ok=True)
    stem = f"{model.id}.{snapshot}" + (f".{a.tag}" if a.tag else "")

    with gzip.open(out_dir / f"{stem}.trades.csv.gz", "wt", newline="") as fh:
        w = csv.writer(fh)
        if all_trades:
            keys = [k for k in asdict(all_trades[0]) if k != "meta"]
            w.writerow(keys + ["meta"])
            for t in all_trades:
                d = asdict(t)
                w.writerow([d[k] for k in keys] + [json.dumps(d["meta"])])

    eq = []
    run_r = 0.0
    for t in sorted(all_trades, key=lambda x: (x.day, x.entry_minute)):
        run_r += t.net_r
        eq.append((t.day, round(run_r, 4)))
    (out_dir / f"{stem}.equity.csv").write_text(
        "day,cum_net_r\n" + "\n".join(f"{d},{r}" for d, r in eq))

    md = render(model, snapshot, symbols, costs, s_all, s_is, s_oos, reg_is, sess,
                side, per_sym, per_year, gate_rows, verdict, all_rejects, len(all_trades))
    (out_dir / f"{stem}.md").write_text(md)
    print(f"\n{verdict}  -> {out_dir / f'{stem}.md'}")
    for g in gate_rows:
        print(f"  {'PASS' if g.passed else 'FAIL'} {g.id} {g.name}: {g.observed} "
              f"(bar: {g.threshold})")
    return 0


def _dist_block(s) -> str:
    dec = " | ".join(fmt(x, 2) for x in s.mae_deciles)
    tail = " · ".join(f"{k} {v:.1%}" for k, v in s.mae_tail.items())
    tailw = " · ".join(f"{k} {v:.1%}" if v == v else f"{k} n/a"
                       for k, v in s.mae_tail_winners.items())
    return (f"- MAE deciles (R): {dec}\n"
            f"- all trades reaching that far against: {tail}\n"
            f"- **winners** that first went that far against: {tailw}\n")


def render(model, snapshot, symbols, costs, s_all, s_is, s_oos, reg, sess, side,
           per_sym, per_year, gate_rows, verdict, rejects, n_trades) -> str:
    L = []
    A = L.append
    A(f"# {model.id} — measured on `{snapshot}`\n")
    A(f"**Verdict: {verdict}** against the bar pre-registered in "
      f"`engine/models/GATES.md`, which was committed before this evaluation ran.\n")
    A(f"Run {dt.datetime.now(dt.UTC).isoformat(timespec='seconds')} at `{git_rev()}`. "
      f"{len(symbols)} symbols, snapshot `{snapshot}`, "
      f"commission ${costs.commission_per_share}/share/side, "
      f"slippage {costs.slippage_bps}bp on market and stop fills.\n")

    A("## The gate\n")
    A("| gate | | bar | observed | |\n|---|---|---|---|---|")
    for g in gate_rows:
        A(f"| {g.id} | {g.name} | {g.threshold} | {g.observed} | "
          f"**{'PASS' if g.passed else 'FAIL'}** |")
    A("")

    A("## Headline\n")
    A(SUMMARY_HEADER)
    for s in (s_all, s_is, s_oos):
        A(summary_row(s))
    A("")

    A("## Maximum adverse excursion — the headline statistic\n")
    A("The existing SMS engine's +11.93% average peak concealed a −10.49% "
      "average drawdown, with 47.5% of alerts going 8%+ underwater first. "
      "Distribution, not mean.\n")
    A("**All trades**\n")
    A(_dist_block(s_all))
    A("**In-sample**\n")
    A(_dist_block(s_is))
    A("**Out-of-sample**\n")
    A(_dist_block(s_oos))

    A("## By regime (in-sample)\n")
    A(SUMMARY_HEADER)
    for k in sorted(reg):
        A(summary_row(reg[k]))
    A("")

    A("## By session, side, and year (all trades)\n")
    A(SUMMARY_HEADER)
    for d in (sess, side, per_year):
        for k in sorted(d):
            A(summary_row(d[k]))
    A("")

    A("## By symbol (all trades)\n")
    A(SUMMARY_HEADER)
    for k in sorted(per_sym, key=lambda x: -per_sym[x].total_r):
        A(summary_row(per_sym[k]))
    A("")

    A("## Mechanics\n")
    A(f"- exits: {s_all.exit_mix}")
    A(f"- trades resolved by the pessimistic same-bar assumption "
      f"(stop and target both inside one bar): {s_all.ambiguous_bars} "
      f"({s_all.ambiguous_bars / max(1, s_all.n):.1%})")
    A(f"- mean bars held: {fmt(s_all.mean_bars_held, 1)}")
    A(f"- orders that never filled and expired: {len(rejects)} "
      f"(fill rate {n_trades / max(1, n_trades + len(rejects)):.1%})")
    A(f"- model parameters: `{json.dumps(model.params())}`")
    A("")

    A("## Caveats\n")
    A("- **Survivorship.** The 32 symbols are liquid *today*. None was chosen "
      "on performance and none dropped after seeing a result, but the universe "
      "is selected with hindsight and contains no delisted or since-illiquid "
      "name. Expect the honest numbers to be modestly worse.\n"
      "- **Fills are modelled, not observed.** OHLC cannot say what happened "
      "inside a bar. Every ambiguity here is resolved against the trade.\n"
      "- **One position at a time per symbol per day.** A second signal while "
      "one is working is dropped, not stacked.\n"
      "- **No borrow, locate, or halt modelling.** Shorts assume a locate was "
      "available and no circuit breaker intervened.\n"
      "- **Adjusted prices.** Splits are adjusted; the tape a trader saw on the "
      "day was the unadjusted one.\n")
    return "\n".join(L)


if __name__ == "__main__":
    raise SystemExit(main())
