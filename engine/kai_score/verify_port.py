"""Run the port and the copied production code side by side on REAL bars.

    .venv/bin/python kai_score/verify_port.py [--symbols N] [--per-symbol M]

`tests/test_kai_score.py` already asserts the two agree, but it does it on
synthetic random walks, because `engine/data/` is not in the repository and a
test that needs the cache is a test that does not run. Real tape has things a
random walk does not: halted sessions with high equal to low, one-cent ranges,
gaps through a whole week, names that IPO'd inside the window. This script is
the same comparison against those, and the number it prints goes in the report
rather than a sentence claiming the port is faithful.

It is a diagnostic. It decides nothing and no gate reads it.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from engine.kai_score import config as kcfg  # noqa: E402
from engine.kai_score import reference_cca as ref  # noqa: E402
from engine.kai_score import score as ks  # noqa: E402
from engine.kai_score.bars import DailyBook  # noqa: E402


def _iso(days: np.ndarray) -> np.ndarray:
    return np.array([f"{a//10000:04d}-{(a//100)%100:02d}-{a%100:02d}" for a in days],
                    dtype="datetime64[D]")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--symbols", type=int, default=60)
    ap.add_argument("--per-symbol", type=int, default=12)
    ap.add_argument("--seed", type=int, default=9)
    a = ap.parse_args()

    book = DailyBook()
    pool = {int(k): v for k, v in
            json.loads((kcfg.DATA_ROOT / "pool_by_day.json").read_text()).items()}
    days = sorted(pool)
    universe = sorted({s for d in days[::37] for s in pool[d][:200]})
    rng = np.random.default_rng(a.seed)
    chosen = list(rng.choice(universe, size=min(a.symbols, len(universe)),
                             replace=False))

    checked = candidates = mismatched = 0
    for sym in chosen:
        d = book.day.get(sym)
        if d is None or len(d) < 200:
            continue
        sess = np.array([x for x in days if x > d[150]], dtype="int64")[::29]
        sess = sess[:a.per_symbol]
        if not len(sess):
            continue
        got = ks.score_symbol(book, sym, sess)
        if got is None:
            continue
        iso = _iso(d)
        for i, s in enumerate(got["session"]):
            j = int(np.searchsorted(d, s, side="left")) - 1
            if j < 0:
                continue
            f = book.factor[sym][j]

            def frame(cal: int, j=j, f=f, sym=sym, iso=iso) -> pd.DataFrame:
                st = int(np.searchsorted(iso, iso[j] - np.timedelta64(cal, "D"),
                                         side="left"))
                return pd.DataFrame(
                    {"Open": book.open[sym][st:j + 1] * f,
                     "High": book.high[sym][st:j + 1] * f,
                     "Low": book.low[sym][st:j + 1] * f,
                     "Close": book.close[sym][st:j + 1] * f,
                     "Volume": book.volume[sym][st:j + 1] / f},
                    index=pd.to_datetime(iso[st:j + 1].astype(str)))

            pre = ref.prefilter_reference(frame(kcfg.PREFILTER_LOOKBACK_CALENDAR_DAYS))
            checked += 1
            if (pre is None) != (not bool(got["candidate"][i])):
                mismatched += 1
                print(f"  CANDIDACY {sym} {s}")
                continue
            if pre is None:
                continue
            candidates += 1
            want = ref.score_cheatcode_reference(
                frame(kcfg.SCORE_LOOKBACK_CALENDAR_DAYS), pre["signal_type"])
            if int(want["breakout_score"]) != int(got["score"][i]):
                mismatched += 1
                print(f"  SCORE {sym} {s}: reference {want['breakout_score']} "
                      f"vs port {got['score'][i]}")
                for c in ks.COMPONENTS:
                    if int(want["components"][c]) != int(got["components"][c][i]):
                        print(f"    {c}: {want['components'][c]} vs "
                              f"{got['components'][c][i]}")

    print(f"checked {checked:,} real ticker-days, {candidates:,} of them scored, "
          f"{mismatched:,} mismatches")
    return 1 if mismatched else 0


if __name__ == "__main__":
    raise SystemExit(main())
