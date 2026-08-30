"""ENGINE-12 — `orb_spy.v1`: the current working spec on SPY alone, every day.

    .venv/bin/python run_engine12.py

There is no `--stage plan` and there is no parameter to vary. The model is
`orb_sip.v2` with the selection deleted (a subclass that overrides nothing but
its name), the snapshot is `polygon-deep-v1` exactly as it already sits on disk,
and nothing is downloaded. SPY is the subject; QQQ and IWM are run and reported
separately and are never pooled into a SPY number.

The bar is `engine/models/orb_spy.v1/GATE.md`, committed before this file
produced a number.
"""

from __future__ import annotations

import datetime as dt
import gzip
import json
import sys
import time
from pathlib import Path

import duckdb
import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from engine import config  # noqa: E402
from engine.backtest.engine import run_symbol  # noqa: E402
from engine.backtest.stats import (SUMMARY_HEADER, fmt, split_by,  # noqa: E402
                                   summarise, summary_row)
from engine.backtest.types import Costs  # noqa: E402
from engine.cache.load import load  # noqa: E402
from engine.models import gates as G  # noqa: E402
from engine.models.orb_spy_v1 import OrbSpyV1, OrbSpyV1Coinflip  # noqa: E402
from engine.run_backtest import git_rev  # noqa: E402
from engine.sip.portfolio import run_portfolio  # noqa: E402

SNAPSHOT = config.SNAPSHOT_DEEP
SUBJECT = "SPY"
SYMBOLS = ["SPY", "QQQ", "IWM"]

COSTS = Costs(commission_per_share=0.005, slippage_bps=1.0)
FREE = Costs(commission_per_share=0.0, slippage_bps=0.0)
CHEAP = Costs(commission_per_share=0.005, slippage_bps=0.25)

RISK_DOLLARS = 1_000.0          # 1% of a $100,000 account — the money gloss
ATR_DAYS = 14

REPORTS = Path(__file__).resolve().parent / "reports"
REPORT = REPORTS / f"orb_spy.v1.{SNAPSHOT}.md"

# The stocks-in-play readings this lane has to be put beside. Quoted, not
# recomputed — they are in the committed reports named alongside them.
SIP_V2_STOP = {"cents": 133.9, "pct": 2.840, "atr": 0.749, "stopped": 0.316,
               "where": "ENGINE-7 held-back window, 10,545 trades"}
SIP_BASELINE_STOP = {"cents": 164.2, "pct": 2.931, "atr": 0.719, "stopped": 0.313,
                     "where": "ENGINE-9/ENGINE-11 baseline, held-back year"}


def _d(s: str) -> int:
    return int(s.replace("-", ""))


WINDOWS = {
    "untouched": G.SPYV1_UNTOUCHED,
    "build": G.SPYV1_BUILD,
    "held_back": G.SPYV1_HELD_BACK,
    "full": G.SPYV1_FULL,
}


# --- data --------------------------------------------------------------------
def atr_map(symbol: str) -> dict[int, float]:
    """14-day ATR as of the PRIOR close, from the daily bars already cached.

    Same definition `sip/universe.py` uses on the stocks tape — a simple mean of
    the true range over the fourteen sessions BEFORE the day in question, so it
    is knowable at 09:30 and contains no part of the day being traded. It is
    used for REPORTING ONLY; the model never reads it.
    """
    path = config.DATA_ROOT / SNAPSHOT / "day" / symbol / "all.parquet"
    con = duckdb.connect()
    con.execute("SET TimeZone='UTC'")
    q = f"""
    WITH b AS (
      SELECT CAST(strftime((epoch_ms(ts_ms) AT TIME ZONE 'UTC'
                            AT TIME ZONE 'America/New_York'), '%Y%m%d')
                  AS INTEGER) AS day,
             high, low, close
      FROM read_parquet('{path}')
    ), p AS (
      SELECT *, lag(close) OVER (ORDER BY day) AS pc FROM b
    ), t AS (
      SELECT day,
             CASE WHEN pc IS NULL THEN high - low
                  ELSE greatest(high - low, abs(high - pc), abs(low - pc))
             END AS tr
      FROM p
    )
    SELECT day,
           avg(tr) OVER (ORDER BY day ROWS BETWEEN {ATR_DAYS} PRECEDING AND 1 PRECEDING) AS atr,
           count(*) OVER (ORDER BY day ROWS BETWEEN {ATR_DAYS} PRECEDING AND 1 PRECEDING) AS n
    FROM t
    ORDER BY day
    """
    rows = con.execute(q).fetchall()
    con.close()
    return {int(d): float(a) for d, a, n in rows if n == ATR_DAYS and a and a > 0}


# --- running -----------------------------------------------------------------
def replay(symbol: str, atr: dict[int, float]) -> dict:
    series = load(symbol, "1m", SNAPSHOT)
    keyed = {(symbol, d): v for d, v in atr.items()}
    out = {}
    for name, cls, costs in (("model", OrbSpyV1, COSTS),
                             ("model_gross", OrbSpyV1, FREE),
                             ("model_cheap", OrbSpyV1, CHEAP),
                             ("flip", OrbSpyV1Coinflip, COSTS),
                             ("flip_gross", OrbSpyV1Coinflip, FREE)):
        m = cls(keyed)
        trades, rejects = run_symbol(series, m, costs, warmup_days=0)
        m.finish()
        out[name] = trades
        out[f"{name}_census"] = dict(m.census)
        out[f"{name}_rejects"] = rejects
    out["sessions"] = sorted(series.day_bounds())
    return out


def window(trades, w: tuple[str, str]):
    lo, hi = _d(w[0]), _d(w[1])
    return [t for t in trades if lo <= t.day <= hi]


def sessions_in(days: list[int], w: tuple[str, str]) -> list[int]:
    lo, hi = _d(w[0]), _d(w[1])
    return [d for d in days if lo <= d <= hi]


# --- statistics --------------------------------------------------------------
def gross(trades) -> tuple[float, float]:
    if not trades:
        return float("nan"), float("nan")
    g = np.array([t.gross_r for t in trades], dtype="float64")
    return float(np.mean(g)), float(np.median(g))


def stopped_share(trades) -> float:
    if not trades:
        return float("nan")
    return sum(1 for t in trades if t.exit_reason == "stop") / len(trades)


def ci(values) -> tuple[float, float]:
    return G.mean_ci95(list(values))


def paired_gross(a, b):
    """Per-(symbol, day) gross R difference on the sessions both arms traded."""
    ctl = {(t.symbol, t.day): t for t in b}
    return [t.gross_r - ctl[(t.symbol, t.day)].gross_r
            for t in a if (t.symbol, t.day) in ctl]


def reached_1r(trades) -> tuple[int, float, float]:
    """How many trades went 1R in their favour before resolving, and of those,
    how many finished green after costs. The most stable statistic in the
    programme so far — 78-81% in every version measured."""
    reach = [t for t in trades if np.isfinite(t.mfe_r) and t.mfe_r >= 1.0]
    if not trades:
        return 0, float("nan"), float("nan")
    won = sum(1 for t in reach if t.net_r > 0)
    return (len(reach), len(reach) / len(trades),
            (won / len(reach)) if reach else float("nan"))


def sip_v2_1r() -> list[tuple[str, int, float, float]]:
    """The same 1R statistic for `orb_sip.v2` on the stocks it actually picks,
    computed here from its committed trade dump rather than quoted, so the two
    sit on one definition. Nothing of ENGINE-7's is re-run."""
    path = REPORTS / "orb_sip.v2.polygon-sip-v1.trades.csv.gz"
    if not path.exists():
        return []
    import csv
    n = {"2016-2023": 0, "2024-2026": 0}
    reach = dict.fromkeys(n, 0)
    won = dict.fromkeys(n, 0)
    with gzip.open(path, "rt") as f:
        for row in csv.DictReader(f):
            if row["model_id"] != "orb_sip.v2" or row["arm"] != "sip":
                continue
            w = "2024-2026" if int(row["day"]) >= 20240101 else "2016-2023"
            n[w] += 1
            if float(row["mfe_r"]) >= 1.0:
                reach[w] += 1
                if float(row["net_r"]) > 0:
                    won[w] += 1
    return [(w, n[w], reach[w] / n[w] if n[w] else float("nan"),
             won[w] / reach[w] if reach[w] else float("nan"))
            for w in ("2016-2023", "2024-2026")]


def pair_split(a, b) -> dict:
    """The H3 diagnostic ENGINE-7 wrote down and this lane inherits.

    The coin flip only trades when the side it drew actually broke, so the
    paired set splits in two: pairs where it drew the SAME side are literally
    the same trade and contribute exactly zero, and the whole of the paired
    difference comes from the pairs where it drew the OTHER side — which are, by
    construction, the mornings on which BOTH ends of the opening range broke.
    """
    ctl = {(t.symbol, t.day): t for t in b}
    same, other_model, other_flip = 0, [], []
    for t in a:
        c = ctl.get((t.symbol, t.day))
        if c is None:
            continue
        if c.side == t.side:
            same += 1
        else:
            other_model.append(t.gross_r)
            other_flip.append(c.gross_r)
    return {"same": same, "other": len(other_model),
            "model": float(np.mean(other_model)) if other_model else float("nan"),
            "flip": float(np.mean(other_flip)) if other_flip else float("nan")}


def stop_geometry(trades, atr: dict[int, float]) -> dict:
    if not trades:
        return {}
    risk = np.array([t.risk_per_share for t in trades], dtype="float64")
    px = np.array([t.fill_price for t in trades], dtype="float64")
    a = np.array([atr.get(int(t.day), np.nan) for t in trades], dtype="float64")
    ok = np.isfinite(a) & (a > 0)
    return {
        "n": len(trades),
        "cents": float(np.median(risk) * 100.0),
        "pct": float(np.median(risk / np.maximum(px, 1e-9)) * 100.0),
        "atr": float(np.median(risk[ok] / a[ok])) if ok.any() else float("nan"),
        "atr_n": int(ok.sum()),
        "commission_r": float(np.median(2.0 * COSTS.commission_per_share
                                        / np.maximum(risk, 1e-9))),
        "price": float(np.median(px)),
    }


def engine4_stop(atr: dict[int, float]) -> dict:
    """ENGINE-4's realised SPY stop, recomputed in ATR units off the SAME daily
    bars, so the two lanes sit on one scale. Read from its committed trade dump;
    nothing is re-run and no ENGINE-4 number changes."""
    path = REPORTS / "orb_simple_1h.v1.polygon-deep-v1.trades.csv.gz"
    if not path.exists():
        return {}
    import csv
    risk, price, ratio = [], [], []
    with gzip.open(path, "rt") as f:
        for row in csv.DictReader(f):
            if row["symbol"] != SUBJECT:
                continue
            r = float(row["risk_per_share"])
            p = float(row["fill_price"])
            if r <= 0 or p <= 0:
                continue
            risk.append(r)
            price.append(p)
            a = atr.get(int(row["day"]))
            if a and a > 0:
                ratio.append(r / a)
    if not risk:
        return {}
    return {"n": len(risk), "cents": float(np.median(risk)) * 100.0,
            "pct": float(np.median(np.array(risk) / np.array(price))) * 100.0,
            "atr": float(np.median(ratio)) if ratio else float("nan"),
            "atr_n": len(ratio)}


def money(r: float) -> str:
    """Every R figure carries its dollar gloss. The gate says so."""
    if r is None or not np.isfinite(r):
        return "n/a"
    return f"{r * RISK_DOLLARS:+,.0f}"


# --- the gate ----------------------------------------------------------------
def judge(symbol: str, res: dict, atr: dict, w_name: str) -> dict:
    w = WINDOWS[w_name]
    tr = window(res["model"], w)
    gr = window(res["model_gross"], w)
    fl = window(res["flip_gross"], w)
    s = summarise(tr, w_name)
    pf = run_portfolio(tr, sessions_in(res["sessions"], w))
    prefix = "S" if w_name == "held_back" else "F"
    floor = (G.SPYV1_MIN_TRADES_HELD_BACK if w_name == "held_back"
             else G.SPYV1_MIN_TRADES_UNTOUCHED)
    gates = G.evaluate_spy_v1(s, gross(gr)[0], paired_gross(gr, fl),
                              [t.net_r for t in tr], pf, prefix, w, floor)
    return {"window": w, "name": w_name, "summary": s, "gross": gross(gr),
            "portfolio": pf, "gates": gates, "verdict": G.verdict_spy_v1(gates),
            "paired": paired_gross(gr, fl), "trades": tr,
            "stop": stop_geometry(tr, atr)}


def main() -> int:
    t0 = time.time()
    results = {}
    for sym in SYMBOLS:
        a = atr_map(sym)
        print(f"{sym}: {len(a):,} sessions with a 14-day ATR", flush=True)
        r = replay(sym, a)
        r["atr"] = a
        r["judge"] = {w: judge(sym, r, a, w) for w in ("held_back", "untouched")}
        results[sym] = r
        print(f"  {sym}: {len(r['model']):,} trades over {len(r['sessions']):,} "
              f"sessions ({time.time()-t0:.0f}s) — "
              f"verdict year {r['judge']['held_back']['verdict']}, "
              f"untouched span {r['judge']['untouched']['verdict']}", flush=True)
    write_report(results)
    dump_trades(results)
    print(f"wrote {REPORT} ({time.time()-t0:.0f}s)")
    return 0


# --- output ------------------------------------------------------------------
def dump_trades(results: dict) -> None:
    path = REPORTS / f"orb_spy.v1.{SNAPSHOT}.trades.csv.gz"
    with gzip.open(path, "wt") as f:
        f.write("model_id,symbol,day,side,entry_minute,exit_minute,fill_price,"
                "stop_price,exit_price,exit_reason,risk_per_share,gross_r,"
                "net_r,mae_r,mfe_r\n")
        for sym in SYMBOLS:
            for name in ("model", "flip"):
                for t in results[sym][name]:
                    f.write(f"{t.model_id},{t.symbol},{t.day},{t.side},"
                            f"{t.entry_minute},{t.exit_minute},{t.fill_price:.4f},"
                            f"{t.stop_price:.4f},{t.exit_price:.4f},"
                            f"{t.exit_reason},{t.risk_per_share:.4f},"
                            f"{t.gross_r:.5f},{t.net_r:.5f},{t.mae_r:.5f},"
                            f"{t.mfe_r:.5f}\n")
    for sym in SYMBOLS:
        eq = REPORTS / f"orb_spy.v1.{SNAPSHOT}.{sym}.equity.csv"
        pf = run_portfolio(results[sym]["model"], results[sym]["sessions"])
        with open(eq, "w") as f:
            f.write("day,equity,daily_return,exposure_ratio\n")
            for d, e, r, x in zip(pf.days, pf.equity, pf.daily_return,
                                  pf.exposure_ratio):
                f.write(f"{d},{e:.2f},{r:.6f},{x:.4f}\n")


def gate_table(gates) -> list[str]:
    out = ["| id | gate | threshold | observed | |", "|---|---|---|---|---|"]
    for g in gates:
        out.append(f"| **{g.id}** | {g.name} | {g.threshold} | {g.observed} | "
                   f"{'PASS' if g.passed else '**FAIL**'} |")
    return out


def arm_table(A, tr, gr, fl, fl_gross) -> None:
    A("| arm | n | mean gross R | median gross R | mean net R | median net R | "
      "per $1,000 risked | hit | PF | stopped |")
    A("|---|---|---|---|---|---|---|---|---|---|")
    for label, ts, gs in (("orb_spy.v1", tr, gr), ("matched coin flip", fl, fl_gross)):
        s = summarise(ts, label)
        gm, gmed = gross(gs)
        A(f"| {label} | {s.n} | {fmt(gm,4)} | {fmt(gmed,4)} | {fmt(s.mean_r,4)} | "
          f"{fmt(s.median_r,4)} | {money(s.mean_r)} | {fmt(s.hit_rate*100,1)}% | "
          f"{fmt(s.profit_factor,2)} | {fmt(stopped_share(ts)*100,1)}% |")


def write_report(results: dict) -> None:
    L: list[str] = []
    A = L.append
    spy = results[SUBJECT]
    hb, un = spy["judge"]["held_back"], spy["judge"]["untouched"]
    e4 = engine4_stop(spy["atr"])
    full_tr = window(spy["model"], WINDOWS["full"])
    full_s = summarise(full_tr, "full")
    full_stop = stop_geometry(full_tr, spy["atr"])
    build_tr = window(spy["model"], WINDOWS["build"])
    build_s = summarise(build_tr, "build")

    narrow = (np.isfinite(full_stop.get("atr", float("nan")))
              and full_stop["atr"] < G.SPYV1_WIDE_STOP_FLOOR_ATR)
    hb_lo, hb_hi = ci([t.net_r for t in hb["trades"]])
    un_lo, un_hi = ci([t.net_r for t in un["trades"]])
    disagree = (hb["summary"].mean_r > 0) != (un["summary"].mean_r > 0)

    A(f"# `orb_spy.v1` — the working spec on SPY alone, every session, no selection")
    A("")
    A(f"**Verdict year 2025-08-29 → 2026-08-28: {hb['verdict']}.** "
      f"**Untouched span 2012-01-01 → 2021-08-28: {un['verdict']}.** "
      "Two windows, five pre-registered gates each, neither able to overwrite "
      "the other.")
    A("")
    A(f"Snapshot `{SNAPSHOT}`, already on disk and not re-downloaded. Gate: "
      "[`../models/orb_spy.v1/GATE.md`](../models/orb_spy.v1/GATE.md), "
      "committed before any number below existed. Run "
      f"{dt.datetime.now(dt.timezone.utc).isoformat(timespec='seconds')} at "
      f"`{git_rev()}`.")
    A("")

    # --- the stop, first, because the gate says so -------------------------
    A("## The stop width, before any performance number")
    A("")
    A("The gate required this paragraph first and required it in the summary "
      "rather than in a footnote, because stop width is the only parameter this "
      "programme has ever found that decides the sign of this family. "
      "ENGINE-6's sweep put the flip between 0.25x and 0.50x of the 14-day ATR.")
    A("")
    A("| | median stop | as % of price | in 14-day ATRs | stopped out |")
    A("|---|---|---|---|---|")
    A(f"| **`orb_spy.v1` on SPY** (this lane, {full_stop['n']:,} trades) | "
      f"{fmt(full_stop['cents'],1)} cents | {fmt(full_stop['pct'],3)}% | "
      f"**{fmt(full_stop['atr'],3)}** | "
      f"{fmt(stopped_share(full_tr)*100,1)}% |")
    if e4:
        A(f"| ENGINE-4 on SPY (trigger-candle stop, {e4['n']:,} trades) | "
          f"{fmt(e4['cents'],1)} cents | {fmt(e4['pct'],3)}% | "
          f"**{fmt(e4['atr'],3)}** | — |")
    A(f"| `orb_sip.v2` on stocks in play ({SIP_V2_STOP['where']}) | "
      f"{SIP_V2_STOP['cents']:.1f} cents | {SIP_V2_STOP['pct']:.3f}% | "
      f"**{SIP_V2_STOP['atr']:.3f}** | {SIP_V2_STOP['stopped']*100:.1f}% |")
    A(f"| the same model's baseline ({SIP_BASELINE_STOP['where']}) | "
      f"{SIP_BASELINE_STOP['cents']:.1f} cents | {SIP_BASELINE_STOP['pct']:.3f}% | "
      f"**{SIP_BASELINE_STOP['atr']:.3f}** | {SIP_BASELINE_STOP['stopped']*100:.1f}% |")
    A("")
    A("ENGINE-4's ATR figure is recomputed here from the same daily bars this "
      "lane uses, off its committed trade dump. Nothing of ENGINE-4's is re-run "
      "and none of its numbers change; only the unit is made common.")
    A("")
    if narrow:
        A(f"> **The disclosure trigger fired.** SPY's opening five-minute candle "
          f"is a median **{fmt(full_stop['atr'],3)} of a 14-day ATR** wide, "
          f"which is BELOW the {G.SPYV1_WIDE_STOP_FLOOR_ATR:.2f} floor written "
          "into the gate. **This lane did not put the wide stop on SPY.** It "
          "put a narrower one, inside the zone ENGINE-6's sweep measured as "
          "losing, and on the evidence of every previous lane that is likely "
          "the whole answer to the owner's question. The stocks the strategy "
          "actually selects are chosen for abnormal opening activity, and an "
          "abnormally active stock has a wide opening range; SPY, traded every "
          "day whatever it is doing, does not.")
    else:
        A(f"> SPY's opening candle is a median **{fmt(full_stop['atr'],3)} of a "
          f"14-day ATR** wide, at or above the "
          f"{G.SPYV1_WIDE_STOP_FLOOR_ATR:.2f} floor written into the gate. The "
          "wide stop this lane exists to test IS present on SPY, so whatever "
          "the performance numbers say, they are a statement about the model "
          "and not about a stop that quietly narrowed.")
    A("")

    # --- plain English -----------------------------------------------------
    A("## In plain English")
    A("")
    A("**What this is.** One model, on one instrument, with no picking. Every "
      "session, look at SPY's first five minutes. If that candle closed up, "
      "leave a buy order just above its high; if it closed down, leave a sell "
      "order just below its low. Whichever way it goes, the stop-loss sits at "
      "the OTHER end of that same five-minute candle. There is no profit "
      "target: whatever is left is sold at the closing bell.")
    A("")
    A("**Why it was worth asking.** The stocks-in-play version of this — the "
      "one ENGINE-7 measured — picks the twenty US stocks each morning whose "
      "first five minutes were most abnormally busy. It has **never once "
      "picked SPY**: 0 trades out of 42,937. So nothing measured so far says "
      "anything about the most widely traded instrument in the world, and the "
      "owner asked directly.")
    A("")
    A(f"- **Trades**: **{hb['summary'].n}** in the verdict year "
      f"(2025-08-29 → 2026-08-28), **{un['summary'].n:,}** in the untouched "
      f"span (2012-01-01 → 2021-08-28), {build_s.n:,} in the owner's build "
      f"years, **{full_s.n:,}** across the whole cache "
      f"({len(spy['sessions']):,} sessions, 2012-01-03 → 2026-08-28).")
    A(f"- **The verdict year**: the average trade returned "
      f"**{fmt(hb['summary'].mean_r,4)}** times what was risked on it after "
      f"costs — for a trader risking $1,000 a trade, "
      f"**{money(hb['summary'].mean_r)} dollars a trade**. The middle trade "
      f"returned {fmt(hb['summary'].median_r,4)} "
      f"({money(hb['summary'].median_r)} dollars) and "
      f"{fmt(hb['summary'].hit_rate*100,1)}% finished green. The 95% range "
      f"around that average is {money(hb_lo)} to {money(hb_hi)} dollars a "
      f"trade.")
    A(f"- **The untouched span** — the stronger evidence, because no lane has "
      f"ever read it for this spec: the average trade returned "
      f"**{fmt(un['summary'].mean_r,4)}** "
      f"(**{money(un['summary'].mean_r)} dollars** per $1,000 risked), middle "
      f"trade {fmt(un['summary'].median_r,4)} "
      f"({money(un['summary'].median_r)} dollars), "
      f"{fmt(un['summary'].hit_rate*100,1)}% green, 95% range "
      f"{money(un_lo)} to {money(un_hi)} dollars.")
    A(f"- **The whole cache, fifteen years**: {full_s.n:,} trades averaging "
      f"{fmt(full_s.mean_r,4)} ({money(full_s.mean_r)} dollars per $1,000 "
      f"risked), middle trade {fmt(full_s.median_r,4)}, "
      f"{fmt(full_s.hit_rate*100,1)}% green, profit factor "
      f"{fmt(full_s.profit_factor,2)}.")
    A(f"- **Against a coin flip on the same sessions with the same geometry**, "
      f"before costs: {fmt(np.mean(hb['paired']) if hb['paired'] else float('nan'),4)} "
      f"a trade in the verdict year and "
      f"{fmt(np.mean(un['paired']) if un['paired'] else float('nan'),4)} in the "
      f"untouched span. Full detail in the gate tables.")
    A(f"- **Stopped out**: {fmt(stopped_share(full_tr)*100,1)}% of trades "
      f"across the whole cache, against `orb_sip.v2`'s "
      f"{SIP_V2_STOP['stopped']*100:.1f}% on stocks.")
    A(f"- **Compared with the stocks-in-play version**: that model returned "
      f"+0.0199R (**+20 dollars** per $1,000 risked) over 10,545 held-back "
      f"trades with a 95% range of -2 to +42 dollars — an interval that also "
      f"contains zero. This lane's numbers are printed beside it below.")
    A(f"- **Compared with ENGINE-4**, which traded SPY every day on this same "
      f"cache with a 15-minute range, a trend filter, a 2R target and a much "
      f"tighter stop: it lost -0.359R in sample and -0.154R out of sample. This "
      f"lane, with the stop that rescued the stocks model, lost "
      f"{fmt(full_s.mean_r,3)}R. **Two different specs, the same sign, on the "
      f"same instrument, fifteen years apart in construction** — and both of "
      f"them carrying a stop far inside the losing zone of ENGINE-6's sweep.")
    A("")
    A("**The mechanism, in one sentence.** Entry sits at one end of the opening "
      "five-minute candle and the stop at the other, so a stop-out needs a move "
      f"of only one candle width — {fmt(full_stop['cents'],0)} cents, "
      f"{fmt(full_stop['pct'],3)}% of price, "
      f"{fmt(full_stop['atr'],2)} of a 14-day ATR — and SPY delivers that many "
      f"times an ordinary morning. It duly happens on "
      f"{fmt(stopped_share(full_tr)*100,1)}% of trades, against 31.6% on the "
      "stocks the strategy actually picks, whose opening candles are four and a "
      "half times wider in ATR terms.")
    A("")
    if disagree:
        A("> **The two windows disagree in sign, and the gate said in advance "
          "that the disagreement is the finding.** One window positive and the "
          "other negative is what a rule with no real edge behind it looks "
          "like, and the report does not resolve it by preferring one.")
        A("")
    for nm, lo, hi_, s in (("verdict year", hb_lo, hb_hi, hb["summary"]),
                           ("untouched span", un_lo, un_hi, un["summary"])):
        if lo <= 0 <= hi_:
            A(f"> **The {nm}'s 95% interval contains zero** "
              f"({money(lo)} to {money(hi_)} dollars per $1,000 risked). "
              f"Whatever the sign of the middle number, the average trade is "
              f"NOT distinguishable from breaking even at this sample size. "
              f"The gate required this sentence wherever it happens.")
            A("")

    # --- the gates ---------------------------------------------------------
    for j, title in ((hb, "The verdict year, 2025-08-29 → 2026-08-28"),
                     (un, "The untouched span, 2012-01-01 → 2021-08-28")):
        A(f"## {title} — **{j['verdict']}**")
        A("")
        L.extend(gate_table(j["gates"]))
        A("")
        failed = [g.name for g in j["gates"] if not g.passed]
        if failed:
            A(f"**Not established on this window**: {'; '.join(failed)}.")
            A("")
        arm_table(A, j["trades"], window(spy["model_gross"], j["window"]),
                  window(spy["flip"], j["window"]),
                  window(spy["flip_gross"], j["window"]))
        A("")
        ps = pair_split(window(spy["model_gross"], j["window"]),
                        window(spy["flip_gross"], j["window"]))
        A(f"*The pairing, unpacked — ENGINE-7's diagnostic, inherited.* Of the "
          f"{ps['same'] + ps['other']:,} paired sessions, **{ps['same']:,} agree** "
          f"— the flip drew the same side, the two arms are literally the same "
          f"trade, and they contribute exactly zero to the difference. The whole "
          f"of it comes from the **{ps['other']:,} that disagree**, which are by "
          f"construction the mornings on which BOTH ends of the opening range "
          f"broke: on those the model's side returned {fmt(ps['model'],4)} gross "
          f"and the opposite side {fmt(ps['flip'],4)}. That is why the unpaired "
          f"means in the table above and the paired number in the gate can point "
          f"different ways, and the gate is the paired one because that is what "
          f"was written down.")
        A("")

    # --- every window, side by side ----------------------------------------
    A("## Every window, side by side — gross before net, median beside mean")
    A("")
    A("| window | n | mean gross R | median gross R | mean net R | median net R "
      "| per $1,000 risked | hit | PF | stopped |")
    A("|---|---|---|---|---|---|---|---|---|---|")
    for name in ("untouched", "build", "held_back", "full"):
        w = WINDOWS[name]
        tr = window(spy["model"], w)
        gr = window(spy["model_gross"], w)
        s = summarise(tr, name)
        gm, gmed = gross(gr)
        A(f"| {name} {w[0]}..{w[1]} | {s.n} | {fmt(gm,4)} | {fmt(gmed,4)} | "
          f"{fmt(s.mean_r,4)} | {fmt(s.median_r,4)} | {money(s.mean_r)} | "
          f"{fmt(s.hit_rate*100,1)}% | {fmt(s.profit_factor,2)} | "
          f"{fmt(stopped_share(tr)*100,1)}% |")
    A("")
    A("The build window overlaps neither of the two gated windows and is "
      "printed because the owner's five years are build-plus-verdict; the full "
      "row is the untouched span, the build years and the verdict year "
      "together.")
    A("")

    # --- by year -----------------------------------------------------------
    A("### SPY by calendar year")
    A("")
    A(SUMMARY_HEADER)
    for yr, ts in sorted(split_by(spy["model"], lambda t: str(t.day)[:4]).items()):
        A(summary_row(summarise(ts, yr)))
    A("")
    yrs = {yr: summarise(ts, yr).mean_r
           for yr, ts in split_by(spy["model"], lambda t: str(t.day)[:4]).items()}
    pos = sum(1 for v in yrs.values() if v > 0)
    A(f"**{pos} of {len(yrs)} calendar years positive after costs.** A mean "
      "carried by a handful of years is a different object from one spread "
      "across fifteen, and this table is here so a reader can tell which it is "
      "without asking.")
    A("")

    # --- by side -----------------------------------------------------------
    A("### SPY by side, whole cache")
    A("")
    A(SUMMARY_HEADER)
    for side, ts in sorted(split_by(full_tr, lambda t: t.side).items()):
        A(summary_row(summarise(ts, side)))
    A("")

    # --- the 1R statistic --------------------------------------------------
    A("## The trades that got to 1R")
    A("")
    A("The gate asked for this whichever way it came out. **1R is one unit of "
      "the money risked** — here, the width of the opening five-minute candle. "
      "Across every earlier version of this family, roughly four trades in five "
      "that ever traded 1R in their favour went on to finish winners; it is the "
      "most stable statistic in the programme.")
    A("")
    A("| | window | trades | reached 1R in their favour | of those, finished green |")
    A("|---|---|---|---|---|")
    for name in ("untouched", "build", "held_back", "full"):
        tr = window(spy["model"], WINDOWS[name])
        n, share, won = reached_1r(tr)
        A(f"| `orb_spy.v1` on SPY | {name} | {len(tr):,} | {n:,} "
          f"({fmt(share*100,1)}%) | **{fmt(won*100,1)}%** |")
    for w, n, share, won in sip_v2_1r():
        A(f"| `orb_sip.v2` on stocks in play | {w} | {n:,} | {n * share:,.0f} "
          f"({fmt(share*100,1)}%) | **{fmt(won*100,1)}%** |")
    A("")
    A("The `orb_sip.v2` rows are computed here from its committed trade dump on "
      "the identical definition, not quoted; nothing of ENGINE-7's is re-run. "
      "**The statistic does not hold on SPY.** On the stocks the strategy picks, "
      "four trades in five that ever traded a full unit of risk in their favour "
      "went on to finish green. On SPY it is roughly one in two — a coin toss. "
      "A trade that gets 1R ahead on SPY and is then left to run to the bell "
      "gives it back about half the time, which is what a stop only 0.16 of an "
      "average day's range wide does to a position: the trade is never far "
      "enough ahead, in the money that matters, to survive the walk back.")
    A("")

    # --- cost drag ---------------------------------------------------------
    A("## What it cost to trade")
    A("")
    A("Cost as a fraction of risk is `cost per share / stop distance`. It is "
      "the subtraction ENGINE-2 found the whole family turns on, and it is set "
      "by the model's stop, not by the price of the instrument.")
    A("")
    A("| | median stop | commission as a share of risk | mean gross R | mean net R | cost drag |")
    A("|---|---|---|---|---|---|")
    for name in ("untouched", "held_back", "full"):
        tr = window(spy["model"], WINDOWS[name])
        gr = window(spy["model_gross"], WINDOWS[name])
        s = summarise(tr, name)
        gm, _ = gross(gr)
        st = stop_geometry(tr, spy["atr"])
        A(f"| {name} | {fmt(st.get('cents', float('nan')),1)} cents | "
          f"{fmt(st.get('commission_r', float('nan')),4)}R | {fmt(gm,4)} | "
          f"{fmt(s.mean_r,4)} | {fmt(gm - s.mean_r,4)}R |")
    A("")
    A("The stop looks nearly four times wider in the verdict year than in the "
      "untouched span, and it is not: SPY is about five times the price it was "
      "in 2012, so the same move costs more cents. In ATR units — the unit that "
      "decides anything — it is unchanged across every window, which is why the "
      "result is too.")
    A("")
    A("### Cost sensitivity — disclosed, and not a result")
    A("")
    A("The pre-registered cost model is $0.005/share/side plus 1.0 bp of "
      "adverse slippage, unchanged for the twelfth time. **The gate is after "
      "those costs and does not move.** One basis point of a $600 instrument is "
      "6 cents, and SPY's real half-spread is closer to half a cent, so the "
      "pre-registered model overcharges this instrument — ENGINE-4 said the "
      "same and it did not rescue ENGINE-4.")
    A("")
    A("| cost model | window | n | mean R | per $1,000 risked | median R | hit | PF |")
    A("|---|---|---|---|---|---|---|---|")
    for label, arm in (("pre-registered (the result)", "model"),
                       ("quarter-bp slippage", "model_cheap"),
                       ("zero cost (true gross)", "model_gross")):
        for name in ("held_back", "full"):
            s = summarise(window(spy[arm], WINDOWS[name]), name)
            A(f"| {label} | {name} | {s.n} | {fmt(s.mean_r,4)} | "
              f"{money(s.mean_r)} | {fmt(s.median_r,4)} | "
              f"{fmt(s.hit_rate*100,1)}% | {fmt(s.profit_factor,2)} |")
    A("")

    # --- portfolio ---------------------------------------------------------
    A("## The portfolio")
    A("")
    A("1% of equity risked on the one position, gross exposure capped at 4x, "
      "compounded daily from $100,000 — `orb_sip.v2`'s convention unchanged so "
      "the two are comparable. **On one instrument this is one position a day, "
      "so it is a far less levered book than the twenty-name version and the "
      "returns are not comparable to that model's headline.**")
    A("")
    A("| | verdict year | untouched span | build years | whole cache |")
    A("|---|---|---|---|---|")
    pfs = {n: run_portfolio(window(spy["model"], WINDOWS[n]),
                            sessions_in(spy["sessions"], WINDOWS[n]))
           for n in ("held_back", "untouched", "build", "full")}
    order = ("held_back", "untouched", "build", "full")
    A("| total return | " + " | ".join(f"{pfs[n].total_return:+.1%}" for n in order) + " |")
    A("| CAGR | " + " | ".join(f"{pfs[n].cagr:+.1%}" for n in order) + " |")
    A("| Sharpe | " + " | ".join(f"{pfs[n].sharpe:.2f}" for n in order) + " |")
    A("| max drawdown | " + " | ".join(f"{pfs[n].max_drawdown:.1%}" for n in order) + " |")
    A("| days the 4x cap bound | " + " | ".join(
        f"{pfs[n].capped_days}/{pfs[n].n_days}" for n in order) + " |")
    A("")

    # --- QQQ and IWM -------------------------------------------------------
    A("## QQQ and IWM — run separately, never pooled into SPY's numbers")
    A("")
    A("Two more instruments from the same cache, under identical rules. They "
      "are context. They cannot raise or lower the SPY verdict and they are not "
      "averaged with it.")
    A("")
    A("| symbol | window | n | mean gross R | mean net R | per $1,000 risked | "
      "median net R | hit | PF | stopped | median stop, ATRs |")
    A("|---|---|---|---|---|---|---|---|---|---|---|")
    for sym in SYMBOLS:
        r = results[sym]
        for name in ("held_back", "untouched", "full"):
            tr = window(r["model"], WINDOWS[name])
            gr = window(r["model_gross"], WINDOWS[name])
            s = summarise(tr, name)
            gm, _ = gross(gr)
            st = stop_geometry(tr, r["atr"])
            A(f"| {sym} | {name} | {s.n} | {fmt(gm,4)} | {fmt(s.mean_r,4)} | "
              f"{money(s.mean_r)} | {fmt(s.median_r,4)} | "
              f"{fmt(s.hit_rate*100,1)}% | {fmt(s.profit_factor,2)} | "
              f"{fmt(stopped_share(tr)*100,1)}% | "
              f"{fmt(st.get('atr', float('nan')),3)} |")
    A("")
    A("| symbol | window | verdict |")
    A("|---|---|---|")
    for sym in SYMBOLS:
        for name in ("held_back", "untouched"):
            A(f"| {sym} | {name} | {results[sym]['judge'][name]['verdict']} |")
    A("")
    A("**Read a PARTIAL here for exactly what it is.** It means the first two "
      "gates cleared on that window — the arm made money gross and net — and "
      "that at least one of the coin-flip, interval and portfolio gates did "
      "not. Every PARTIAL in the table above is a mean within a few tens of "
      "dollars of zero on $1,000 risked, with a 95% interval that spans it. "
      "None of them is a finding, none of them survives the other window, and "
      "the gate said in advance that PARTIAL is not a pass. The one thing worth "
      "keeping from this table is the last column: the opening candle is a "
      "narrow stop on all three index ETFs, and all three behave the same way "
      "because of it.")
    A("")

    # --- mechanics ---------------------------------------------------------
    A("## Mechanics, census and fills")
    A("")
    A("- one decision a session, taken at 09:35 on the close of the 09:34-09:35 "
      "one-minute bar; the order works to the close and is not re-placed")
    A("- entry is a resting stop order, filled at the worse of the level and the "
      "bar's open, plus slippage")
    A("- the stop is a LEVEL, not a distance carried from the fill: a gap "
      "through the entry costs the trader more risk, and the R it is divided by "
      "is measured from the fill that actually happened")
    A("- no target; flat at 15:59 ET or at the early close on a half day")
    A(f"- costs: ${COSTS.commission_per_share:.3f}/share/side commission, "
      f"{COSTS.slippage_bps:.1f} bp adverse slippage on market and stop fills")
    A("")
    A("| symbol | sessions | signals | long | short | doji opening candle "
      "skipped | zero-width range | breakout never filled |")
    A("|---|---|---|---|---|---|---|---|")
    for sym in SYMBOLS:
        c = results[sym]["model_census"]
        A(f"| {sym} | {c.get('days_seen',0):,} | {c.get('signals',0):,} | "
          f"{c.get('signals_long',0):,} | {c.get('signals_short',0):,} | "
          f"{c.get('skip_doji_opening_candle',0):,} | "
          f"{c.get('skip_zero_width_range',0):,} | "
          f"{len(results[sym]['model_rejects']):,} |")
    A("")
    A("| symbol | exits, whole cache |")
    A("|---|---|")
    for sym in SYMBOLS:
        A(f"| {sym} | {summarise(window(results[sym]['model'], WINDOWS['full']), 'x').exit_mix} |")
    A("")

    # --- confidence --------------------------------------------------------
    A("## How sure we actually are, and what would change the answer")
    A("")
    A(f"- **The verdict year is thin and it is not fresh.** {hb['summary'].n} "
      f"trades of one instrument gives a 95% half-width of about "
      f"{abs(hb_hi - hb_lo) / 2 * RISK_DOLLARS:,.0f} dollars per $1,000 "
      "risked. It can separate a large edge from nothing and can resolve "
      "nothing smaller. Those same calendar dates have now been read by "
      "ENGINE-8, ENGINE-9, ENGINE-10 and ENGINE-11 on other models, so a "
      "positive there is **suggestive, not evidence**.")
    A(f"- **The untouched span is the stronger evidence** — "
      f"{un['summary'].n:,} trades over nine and a half years that no lane has "
      "ever read for this spec, with a 95% half-width of about "
      f"{abs(un_hi - un_lo) / 2 * RISK_DOLLARS:,.0f} dollars. It was labelled "
      "as the stronger window in the gate, before any number existed.")
    A(f"- **Two windows means two 95% intervals**, so the chance at least one "
      "clears zero by luck is about 10% rather than 5%. No correction is "
      "applied to the intervals; this sentence is the correction.")
    A("- **Trades on one instrument are not independent of each other in the "
      "way twenty names a day across a thousand stocks are.** Fifteen years of "
      "SPY is one instrument's history, not fifteen independent years, and the "
      "intervals here do not model that.")
    A("- **What would change the answer, in order of how much it would move "
      "it:** (1) the stop width, which is not a free parameter here — it is "
      "whatever SPY's opening candle happened to be, and it is the first table "
      "in this report; (2) the fill model, which fills a resting stop at the "
      "worse of the level and the bar's open and cannot see inside a bar; "
      "(3) the cost model, which charges a proportional slippage calibrated for "
      "$50-$300 single names and therefore overcharges a $600 ETF — the "
      "sensitivity table prices that and it does not change the shape; (4) the "
      "instrument, since three index ETFs are three of the most efficiently "
      "priced things in the market and a result here does not transfer to "
      "single names in either direction.")
    A("- **What this report does NOT establish**: anything about the "
      "stocks-in-play model, whose selection step is the thing this lane "
      "deleted. ENGINE-7's H4 — that the selection is where the money comes "
      "from — is untouched by this run, and if anything a null on SPY is "
      "consistent with it.")
    A("")
    A("## Files")
    A("")
    A(f"- `orb_spy.v1.{SNAPSHOT}.md` — this report")
    A(f"- `orb_spy.v1.{SNAPSHOT}.trades.csv.gz` — every trade and every "
      "control trade, one row each, all three symbols")
    A(f"- `orb_spy.v1.{SNAPSHOT}.<symbol>.equity.csv` — the 1%-risk portfolio "
      "curve per symbol")
    A("")

    REPORT.write_text("\n".join(L) + "\n")


if __name__ == "__main__":
    raise SystemExit(main())
