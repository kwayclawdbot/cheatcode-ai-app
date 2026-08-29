"""The universe, the pool, and the one rule that keeps both honest.

Every number in this module is computed from data that had already printed at
the PRIOR close. Nothing here looks at the day it is selecting for. That is not
a convention to be careful about: the SQL window is
`ROWS BETWEEN 20 PRECEDING AND 1 PRECEDING`, which cannot include the current
row, and `prior_close` is `lag(close)`.

Two layers, and they are different things:

* **eligible(day)** — the paper's filter. Prior close > $5, 20-day average
  volume > 1M shares, 14-day ATR > $0.50. Computed over every ticker that
  traded, so it carries no survivorship bias: a name that delisted in 2019 is
  in the 2018 universe exactly as it was at the time.
* **pool(day)** — the top `POOL_N` of the eligible set by 20-day average DOLLAR
  volume. This is OURS, not the paper's. We cannot download intraday bars for
  every eligible name, so we take the most liquid slice. It is knowable at
  09:30, so it adds no lookahead — but it is a real weakening of the filter,
  because a mid-cap that doubles its volume on news is exactly the kind of name
  the paper's selection wants and the kind our pool is most likely to miss.
  Every report states the pool size next to the eligible count.
"""

from __future__ import annotations

import functools
from pathlib import Path

import duckdb
import numpy as np

from engine.sip import config as scfg

# Nasdaq fifth-letter suffixes for warrants, units, rights and preferreds, plus
# the NYSE dotted forms. These are not common stock and the paper does not trade
# them. Class shares (BRK.B, GOOG) are NOT excluded.
_SUFFIX_5 = ("W", "U", "R")
_DOTTED_BAD = (".W", ".U", ".R", ".P")


def is_common_like(ticker: str) -> bool:
    t = ticker.upper()
    if any(x in t for x in _DOTTED_BAD):
        return False
    if len(t) == 5 and t[-1] in _SUFFIX_5:
        return False
    return t.isalnum() or ("." in t and t.replace(".", "").isalnum())


def _con() -> duckdb.DuckDBPyConnection:
    con = duckdb.connect()
    con.execute("SET TimeZone='UTC'")
    return con


def grouped_glob() -> str:
    return str(scfg.GROUPED_DIR / "*.parquet")


STATS_SQL = """
WITH g AS (
  SELECT ticker, open, high, low, close, volume,
         CAST(replace(regexp_extract(filename, '(\\d{{4}}-\\d{{2}}-\\d{{2}})', 1), '-', '')
              AS INTEGER) AS day
  FROM read_parquet('{glob}', filename=true)
  WHERE close > 0 AND volume > 0 AND high >= low
),
b AS (
  SELECT *,
         lag(close) OVER (PARTITION BY ticker ORDER BY day) AS prev_close
  FROM g
),
tr AS (
  SELECT *,
         CASE WHEN prev_close IS NULL THEN high - low
              ELSE greatest(high - low, abs(high - prev_close), abs(low - prev_close))
         END AS true_range
  FROM b
),
s AS (
  SELECT ticker, day,
         lag(close) OVER w AS prior_close,
         avg(volume) OVER (PARTITION BY ticker ORDER BY day
                           ROWS BETWEEN {vd} PRECEDING AND 1 PRECEDING) AS avg_vol,
         avg(volume * close) OVER (PARTITION BY ticker ORDER BY day
                           ROWS BETWEEN {vd} PRECEDING AND 1 PRECEDING) AS avg_dollar_vol,
         avg(true_range) OVER (PARTITION BY ticker ORDER BY day
                           ROWS BETWEEN {ad} PRECEDING AND 1 PRECEDING) AS atr,
         count(*) OVER (PARTITION BY ticker ORDER BY day
                           ROWS BETWEEN {vd} PRECEDING AND 1 PRECEDING) AS n_prior
  FROM tr
  WINDOW w AS (PARTITION BY ticker ORDER BY day)
)
SELECT ticker, day, prior_close, avg_vol, avg_dollar_vol, atr
FROM s
WHERE n_prior = {vd}
  AND prior_close > {min_price}
  AND avg_vol > {min_vol}
  AND atr > {min_atr}
ORDER BY day, avg_dollar_vol DESC
"""


def build_eligible(out_path: Path | None = None) -> Path:
    """Materialise the eligible universe, one row per (day, ticker)."""
    out = out_path or (scfg.DATA_ROOT / "eligible.parquet")
    out.parent.mkdir(parents=True, exist_ok=True)
    sql = STATS_SQL.format(
        glob=grouped_glob(), vd=scfg.AVG_VOLUME_DAYS, ad=scfg.ATR_DAYS,
        min_price=scfg.MIN_PRICE, min_vol=scfg.MIN_AVG_VOLUME, min_atr=scfg.MIN_ATR)
    con = _con()
    con.execute(f"COPY ({sql}) TO '{out}' (FORMAT PARQUET, COMPRESSION ZSTD)")
    con.close()
    return out


@functools.lru_cache(maxsize=1)
def eligible_table(path: str | None = None):
    """{day: (tickers ndarray, avg_dollar_vol ndarray, prior_close, atr)} —
    already sorted by dollar volume descending, common-like tickers only."""
    p = Path(path) if path else (scfg.DATA_ROOT / "eligible.parquet")
    con = _con()
    t = con.execute(f"SELECT * FROM read_parquet('{p}') ORDER BY day, avg_dollar_vol DESC").arrow()
    con.close()
    if hasattr(t, "read_all"):
        t = t.read_all()
    days = t.column("day").to_numpy(zero_copy_only=False).astype("int32")
    tick = np.array(t.column("ticker").to_pylist(), dtype=object)
    dv = t.column("avg_dollar_vol").to_numpy(zero_copy_only=False)
    pc = t.column("prior_close").to_numpy(zero_copy_only=False)
    atr = t.column("atr").to_numpy(zero_copy_only=False)
    keep = np.array([is_common_like(str(x)) for x in tick], dtype=bool)
    days, tick, dv, pc, atr = days[keep], tick[keep], dv[keep], pc[keep], atr[keep]
    out: dict[int, dict] = {}
    edges = np.flatnonzero(np.diff(days)) + 1
    starts = np.concatenate(([0], edges))
    stops = np.concatenate((edges, [len(days)]))
    for a, b in zip(starts, stops):
        out[int(days[a])] = {
            "ticker": tick[a:b], "dollar_vol": dv[a:b],
            "prior_close": pc[a:b], "atr": atr[a:b],
        }
    return out


def pool_for_day(day: int, n: int | None = None, table=None) -> list[str]:
    """The top `n` eligible names by prior-close 20-day average dollar volume."""
    tab = table if table is not None else eligible_table()
    row = tab.get(int(day))
    if row is None:
        return []
    k = n or scfg.POOL_N
    return [str(x) for x in row["ticker"][:k]]


def atr_map(day: int, table=None) -> dict[str, float]:
    tab = table if table is not None else eligible_table()
    row = tab.get(int(day))
    if row is None:
        return {}
    return {str(t): float(a) for t, a in zip(row["ticker"], row["atr"])}
