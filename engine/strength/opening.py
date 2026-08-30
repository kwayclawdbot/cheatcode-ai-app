"""The 09:30-09:35 candle, for every pool name, without a single new download.

The `rank` arm has to know which way the range broke before it can prefer names
trending that way — and it has to know it for names the incumbent never picked,
so the one-minute cache is no help. It does not need to be: `sip/fetch_open5.py`
already wrote the 09:30-10:30 five-minute bars of every pool member for every
session, and Polygon's five-minute aggregates are aligned to midnight, so the
09:30 bar IS the opening range. Open and close of that one bar give the break
direction. Nothing after 09:35 is read, and nothing after 10:30 is on disk.

`sip/store.py` deliberately keeps only volume and close, because that is all
ENGINE-6's selector was allowed to want. This module reads the same tree for the
same single bar and keeps the open as well. It is a second reader, not a change
to the first: `sip/store.py` is untouched and ENGINE-6, -7, -8 and -9 read
exactly what they always read.

The direction is a 09:35 fact. The model recomputes the same candle from
one-minute bars when it trades, and the two can disagree on a name whose
one-minute prints and five-minute aggregate differ at the edges; the report
counts how often that happens rather than assuming it does not.
"""

from __future__ import annotations

import duckdb
import numpy as np

from engine.sip import config as scfg
from engine.sip.selection import OPEN_MINUTE, OpenStore


def load_open_panel(glob: str | None = None,
                    ) -> tuple[OpenStore, dict[tuple[str, int], str]]:
    """One scan of the `open5` tree; the store ENGINE-6 uses, and the direction.

    `{(symbol, day) -> "long"|"short"}`. A doji opening candle (close == open)
    has no direction and is absent from the map, which is the same thing the
    model does with it: `skip_doji_opening_candle`.
    """
    g = glob or str(scfg.OPEN5_DIR / "*" / "*.parquet")
    con = duckdb.connect()
    con.execute("SET TimeZone='UTC'")
    q = f"""
      SELECT regexp_extract(filename, '([^/]+)/[^/]+\\.parquet$', 1) AS symbol,
             day, max(volume) AS volume, max(close) AS close,
             max(open) AS open
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
    opn = t.column("open").to_numpy(zero_copy_only=False).astype("float64")

    days: dict[str, list] = {}
    vols: dict[str, list] = {}
    dollars: dict[str, list] = {}
    side: dict[tuple[str, int], str] = {}
    for s, d, v, c, o in zip(sym, day, vol, close, opn):
        s = str(s)
        days.setdefault(s, []).append(int(d))
        vols.setdefault(s, []).append(float(v))
        dollars.setdefault(s, []).append(float(v) * float(c))
        if c > o:
            side[(s, int(d))] = "long"
        elif c < o:
            side[(s, int(d))] = "short"
    store = OpenStore({k: np.array(v, dtype="int64") for k, v in days.items()},
                      {k: np.array(v, dtype="float64") for k, v in vols.items()},
                      {k: np.array(v, dtype="float64") for k, v in dollars.items()})
    return store, side
