"""Load the `open5` tree into an `OpenStore`, and nothing more than that.

The parquet on disk already contains only 09:30-10:30. This reader narrows it
again to the single 09:30-09:35 bar, so the object the selector holds cannot
answer a question about 09:40 even if someone asked it one.
"""

from __future__ import annotations

import duckdb
import numpy as np

from engine.sip import config as scfg
from engine.sip.selection import OPEN_MINUTE, OpenStore


def load_open_store(glob: str | None = None) -> OpenStore:
    g = glob or str(scfg.OPEN5_DIR / "*" / "*.parquet")
    con = duckdb.connect()
    con.execute("SET TimeZone='UTC'")
    q = f"""
      SELECT regexp_extract(filename, '([^/]+)/[^/]+\\.parquet$', 1) AS symbol,
             day, max(volume) AS volume, max(close) AS close
      FROM read_parquet('{g}', filename=true)
      WHERE minute = {OPEN_MINUTE}
      GROUP BY 1, 2
      ORDER BY 1, 2
    """
    t = con.execute(q).arrow()
    con.close()
    if hasattr(t, "read_all"):
        t = t.read_all()
    sym = np.array(t.column("symbol").to_pylist(), dtype=object)
    day = t.column("day").to_numpy(zero_copy_only=False).astype("int64")
    vol = t.column("volume").to_numpy(zero_copy_only=False).astype("float64")
    close = t.column("close").to_numpy(zero_copy_only=False).astype("float64")
    days: dict[str, list] = {}
    vols: dict[str, list] = {}
    dollars: dict[str, list] = {}
    for s, d, v, c in zip(sym, day, vol, close):
        s = str(s)
        days.setdefault(s, []).append(int(d))
        vols.setdefault(s, []).append(float(v))
        dollars.setdefault(s, []).append(float(v) * float(c))
    return OpenStore({k: np.array(v, dtype="int64") for k, v in days.items()},
                     {k: np.array(v, dtype="float64") for k, v in vols.items()},
                     {k: np.array(v, dtype="float64") for k, v in dollars.items()})
