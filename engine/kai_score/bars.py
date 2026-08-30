"""Daily bars for the names the pool ever contained, read from the grouped
snapshot that is already on disk.

Nothing is downloaded here. `engine/data/polygon-sip-v1/grouped/` holds one
parquet per session containing every US ticker that traded that day, 2015-10 to
2026-08; this module narrows it to the tickers and dates ENGINE-9 needs and
materialises one column-oriented file so the scorer does not re-scan a gigabyte
of parquet per ticker.

The snapshot itself is not written to. The output lives in `kai-sel-v1/`.
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

import duckdb
import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from engine.kai_score import config as kcfg  # noqa: E402
from engine.kai_score import splits as ksplits  # noqa: E402
from engine.sip import config as scfg  # noqa: E402


def build(tickers: list[str], start: str, end: str,
          out: Path | None = None) -> Path:
    dest = out or kcfg.DAILY_PATH
    dest.parent.mkdir(parents=True, exist_ok=True)
    glob = str(scfg.GROUPED_DIR / "*.parquet")
    lo = int(start.replace("-", ""))
    hi = int(end.replace("-", ""))
    con = duckdb.connect()
    con.execute("SET TimeZone='UTC'")
    con.execute("CREATE TEMP TABLE want(ticker VARCHAR)")
    con.executemany("INSERT INTO want VALUES (?)", [(t,) for t in sorted(set(tickers))])
    sql = f"""
      SELECT g.ticker, g.day, g.open, g.high, g.low, g.close, g.volume
      FROM (
        SELECT ticker, open, high, low, close, volume,
               CAST(replace(regexp_extract(filename, '(\\d{{4}}-\\d{{2}}-\\d{{2}})', 1),
                            '-', '') AS INTEGER) AS day
        FROM read_parquet('{glob}', filename=true)
        WHERE close > 0 AND volume > 0 AND high >= low
      ) g
      JOIN want w ON w.ticker = g.ticker
      WHERE g.day BETWEEN {lo} AND {hi}
      ORDER BY g.ticker, g.day
    """
    con.execute(f"COPY ({sql}) TO '{dest}' (FORMAT PARQUET, COMPRESSION ZSTD)")
    con.close()
    return dest


class DailyBook:
    """Per-ticker daily arrays, split-adjusted into the one universal series the
    score can be read off at any as-of date.

    `close`/`high`/`low`/`open` are `raw / C[t]`; `volume` is `rawvol * C[t]`.
    `factor` is `C[t]` itself, kept because the live prefilter's two absolute
    floors — $5 and 500,000 shares — have to be applied in as-of-date money.
    """

    __slots__ = ("day", "open", "high", "low", "close", "volume", "factor",
                 "raw_close", "index")

    def __init__(self, path: Path | None = None) -> None:
        p = path or kcfg.DAILY_PATH
        con = duckdb.connect()
        t = con.execute(f"SELECT * FROM read_parquet('{p}') ORDER BY ticker, day").arrow()
        con.close()
        if hasattr(t, "read_all"):
            t = t.read_all()
        tick = np.array(t.column("ticker").to_pylist(), dtype=object)
        day = t.column("day").to_numpy(zero_copy_only=False).astype("int64")
        cols = {k: t.column(k).to_numpy(zero_copy_only=False).astype("float64")
                for k in ("open", "high", "low", "close", "volume")}
        events = ksplits.load()

        self.day, self.open, self.high = {}, {}, {}
        self.low, self.close, self.volume = {}, {}, {}
        self.factor, self.raw_close, self.index = {}, {}, {}

        edges = np.flatnonzero(tick[1:] != tick[:-1]) + 1
        starts = np.concatenate(([0], edges))
        stops = np.concatenate((edges, [len(tick)]))
        for a, b in zip(starts, stops):
            sym = str(tick[a])
            d = day[a:b]
            c = ksplits.cumulative_factor(d, events.get(sym, []))
            self.day[sym] = d
            self.factor[sym] = c
            self.raw_close[sym] = cols["close"][a:b]
            for k in ("open", "high", "low", "close"):
                self.__getattribute__(k)[sym] = cols[k][a:b] / c
            self.volume[sym] = cols["volume"][a:b] * c

    def symbols(self) -> list[str]:
        return sorted(self.day)

    def asof_index(self, sym: str, session_day: int) -> int:
        """Index of the last daily bar that had CLOSED before `session_day`
        opened. -1 if there is none."""
        d = self.day.get(sym)
        if d is None:
            return -1
        return int(np.searchsorted(d, session_day, side="left")) - 1


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--start", default=kcfg.DAILY_WARMUP_START)
    ap.add_argument("--end", default=kcfg.HELD_END)
    ap.add_argument("--tickers", required=True, help="JSON list of tickers")
    a = ap.parse_args()
    import json
    tickers = json.loads(Path(a.tickers).read_text())
    p = build(tickers, a.start, a.end)
    print(f"wrote {p} ({p.stat().st_size/1e6:.1f} MB) for {len(tickers):,} tickers")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
