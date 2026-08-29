"""Read the parquet bar cache into BarSeries, and audit what it actually holds.

DuckDB does the columnar scan; numpy holds the result. ET calendar day and
minute-of-day are derived here once, so no primitive ever has to reason about a
timezone.
"""

from __future__ import annotations

import functools
import sys
from pathlib import Path

import duckdb
import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from engine import config  # noqa: E402
from engine.series import BarSeries  # noqa: E402

_ET = "America/New_York"


def snapshot_dir(snapshot: str | None = None) -> Path:
    return config.DATA_ROOT / (snapshot or config.SNAPSHOT)


def _glob(snapshot: str | None, timeframe: str, symbol: str) -> str:
    return str(snapshot_dir(snapshot) / timeframe / symbol / "*.parquet")


def _connect() -> duckdb.DuckDBPyConnection:
    con = duckdb.connect()
    con.execute("SET TimeZone='UTC'")
    return con


def has_symbol(symbol: str, timeframe: str = "1m", snapshot: str | None = None) -> bool:
    d = snapshot_dir(snapshot) / timeframe / symbol
    return d.exists() and any(d.glob("*.parquet"))


@functools.lru_cache(maxsize=64)
def load(symbol: str, timeframe: str = "1m", snapshot: str | None = None,
         start_day: int | None = None, end_day: int | None = None) -> BarSeries:
    """Load one symbol. `start_day`/`end_day` are inclusive yyyymmdd ET bounds."""
    con = _connect()
    where = []
    if start_day is not None:
        where.append(f"day >= {int(start_day)}")
    if end_day is not None:
        where.append(f"day <= {int(end_day)}")
    clause = ("WHERE " + " AND ".join(where)) if where else ""
    q = f"""
      SELECT * FROM (
        SELECT ts_ms, open, high, low, close, volume,
               CAST(strftime(ts, '%Y%m%d') AS INTEGER) AS day,
               CAST(date_part('hour', ts) * 60 + date_part('minute', ts) AS INTEGER) AS minute
        FROM (
          SELECT *, (epoch_ms(ts_ms) AT TIME ZONE 'UTC' AT TIME ZONE '{_ET}') AS ts
          FROM read_parquet('{_glob(snapshot, timeframe, symbol)}')
        )
      )
      {clause}
      ORDER BY ts_ms
    """
    t = con.execute(q).arrow()
    if hasattr(t, 'read_all'):
        t = t.read_all()
    con.close()
    if t.num_rows == 0:
        raise FileNotFoundError(f"no cached {timeframe} bars for {symbol}")
    col = lambda name, dt: np.ascontiguousarray(t.column(name).to_numpy(zero_copy_only=False), dtype=dt)  # noqa: E731
    return BarSeries(
        symbol=symbol, timeframe=timeframe,
        ts_ms=col("ts_ms", "int64"),
        open=col("open", "float64"), high=col("high", "float64"),
        low=col("low", "float64"), close=col("close", "float64"),
        volume=col("volume", "float64"),
        day=col("day", "int32"), minute=col("minute", "int32"),
    )
