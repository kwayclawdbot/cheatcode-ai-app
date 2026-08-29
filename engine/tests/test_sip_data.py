"""The two data contracts ENGINE-6 rests on, asserted against the real cache.

1. **The 09:30 five-minute bar IS 09:30-09:35.** The whole selection stage is
   built on one request per symbol per half-year instead of one per symbol-day,
   and that only works because Polygon's multi-minute aggregates are aligned to
   midnight, so minute 570 divides by 5 exactly. If that were ever untrue the
   relative-volume numerator would silently be some other five minutes and
   every result in this lane would be wrong in a way no gate would catch.

2. **The eligible universe is computed as of the prior close.** Re-deriving one
   row of it by hand from the grouped daily bars must reproduce what the SQL
   window produced, and the day being selected for must not be inside its own
   average.
"""

from __future__ import annotations

import duckdb
import numpy as np
import pytest

from engine.cache.load import has_symbol, load
from engine.sip import config as scfg
from engine.sip import universe

SNAP = scfg.SNAPSHOT
PROBE = "AAPL"

needs_open5 = pytest.mark.skipif(
    not (scfg.OPEN5_DIR / PROBE).exists(),
    reason=f"{SNAP} open5 cache absent")
needs_1m = pytest.mark.skipif(
    not has_symbol(PROBE, "1m", SNAP), reason=f"{SNAP} 1m cache absent")
needs_eligible = pytest.mark.skipif(
    not (scfg.DATA_ROOT / "eligible.parquet").exists(),
    reason="eligible universe not built")


@needs_open5
@needs_1m
def test_the_0930_five_minute_bar_is_exactly_the_first_five_one_minute_bars():
    ser = load(PROBE, "1m", SNAP)
    days = sorted({int(d) for d in np.unique(ser.day)})
    con = duckdb.connect()
    checked = 0
    for day in days:
        y, h = day // 10000, 1 if (day // 100) % 100 <= 6 else 2
        p = scfg.OPEN5_DIR / PROBE / f"{y}H{h}.parquet"
        if not p.exists():
            continue
        got = con.execute(
            f"SELECT volume, open, high, low, close FROM read_parquet('{p}') "
            f"WHERE day = {day} AND minute = 570").fetchall()
        if not got:
            continue
        v5, o5, h5, l5, c5 = got[0]
        m = (ser.day == day) & (ser.minute >= 570) & (ser.minute < 575)
        if not m.any():
            continue
        assert ser.volume[m].sum() == pytest.approx(v5, rel=1e-9), day
        assert ser.open[m][0] == pytest.approx(o5), day
        assert ser.high[m].max() == pytest.approx(h5), day
        assert ser.low[m].min() == pytest.approx(l5), day
        assert ser.close[m][-1] == pytest.approx(c5), day
        checked += 1
    con.close()
    assert checked > 0, "no overlapping day between the 1m and open5 caches"


@needs_eligible
def test_eligibility_is_computed_as_of_the_prior_close():
    """Re-derive one row by hand from the grouped bars and compare."""
    tab = universe.eligible_table()
    days = sorted(tab)
    day = days[len(days) // 2]
    prior = days[days.index(day) - 1]
    sym = str(tab[day]["ticker"][0])
    con = duckdb.connect()
    rows = con.execute(f"""
        SELECT CAST(replace(regexp_extract(filename, '(\\d{{4}}-\\d{{2}}-\\d{{2}})', 1),
                            '-', '') AS INTEGER) AS day,
               close, volume
        FROM read_parquet('{universe.grouped_glob()}', filename=true)
        WHERE ticker = '{sym}' AND close > 0 AND volume > 0
        ORDER BY day""").fetchall()
    con.close()
    idx = {r[0]: i for i, r in enumerate(rows)}
    j = idx[day]
    window = rows[j - scfg.AVG_VOLUME_DAYS:j]
    assert len(window) == scfg.AVG_VOLUME_DAYS
    assert day not in {w[0] for w in window}, "today must not be in its own average"
    assert window[-1][0] == prior or window[-1][0] < day

    k = tab[day]["ticker"].tolist().index(sym)
    assert tab[day]["prior_close"][k] == pytest.approx(rows[j - 1][1])
    hand = float(np.mean([w[2] for w in window]))
    # the eligible table stores dollar volume; recompute shares the same way
    assert hand > scfg.MIN_AVG_VOLUME
    hand_dollar = float(np.mean([w[1] * w[2] for w in window]))
    assert tab[day]["dollar_vol"][k] == pytest.approx(hand_dollar, rel=1e-9)
