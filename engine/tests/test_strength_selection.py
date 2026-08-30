"""ENGINE-11's selector, attacked the same way ENGINE-6's was.

The `rank` arm reads one thing ENGINE-6's selector did not: the OPEN of today's
09:30-09:35 bar, so that it knows which way the range broke. That is a 09:35
fact and it is allowed — but it is a new reach into the session being selected
for, so it gets the same three attacks:

* **poisoned future** — everything the selector may not see is nonsense;
* **amputated future** — those values do not exist at all;
* **the on-disk attack** — the session's own bars after 09:35 are deleted and
  the selection must be byte-identical.

Plus the two properties that make this arm what `GATE.md` says it is: it holds
the trade count, and it only ever reaches inside the day's `POND_K` busiest
names. And a deliberately cheating selector, which every attack must catch.
"""

from __future__ import annotations

import numpy as np
import pyarrow as pa
import pyarrow.parquet as pq
import pytest

from engine.sip.selection import OPEN_MINUTE
from engine.strength import config as tcfg
from engine.strength.opening import load_open_panel
from engine.strength.selection import select_day

RNG = np.random.default_rng(20260829)
SYMS = [f"S{i:02d}" for i in range(60)]
DAYS = [20200101 + i for i in range(60)]
DAY = DAYS[40]


def _panel():
    """Candidates for one session: a relative volume, a strength, a side."""
    rvol = 1.0 + RNG.random(len(SYMS)) * 9.0
    strength = RNG.normal(0.0, 0.4, len(SYMS)).clip(-1.0, 1.0)
    side = ["long" if RNG.random() < 0.5 else "short" for _ in SYMS]
    # two names that cannot be ranked, on purpose
    strength[3] = np.nan
    side[7] = "none"
    return list(SYMS), rvol, strength, side


def _names(picks):
    return [(p.symbol, p.rank) for p in picks]


def test_the_baseline_arm_is_engine_6s_selector():
    syms, rvol, st, side = _panel()
    picks = select_day(DAY, syms, rvol, st, side)[tcfg.ARM_BASELINE]
    order = sorted(range(len(syms)), key=lambda i: (-rvol[i], syms[i]))[:tcfg.TOP_K]
    assert [p.symbol for p in picks] == [syms[i] for i in order]


def test_the_rank_arm_holds_the_trade_count():
    syms, rvol, st, side = _panel()
    out = select_day(DAY, syms, rvol, st, side)
    assert len(out[tcfg.ARM_RANK]) == len(out[tcfg.ARM_BASELINE]) == tcfg.TOP_K


def test_the_rank_arm_never_leaves_the_pond():
    """It re-orders the day's busiest names. It does not reach down into quiet
    ones because their daily chart looks nice."""
    syms, rvol, st, side = _panel()
    out = select_day(DAY, syms, rvol, st, side)
    pond = {syms[i] for i in sorted(range(len(syms)),
                                    key=lambda i: (-rvol[i], syms[i]))[:tcfg.POND_K]}
    assert {p.symbol for p in out[tcfg.ARM_RANK]} <= pond


def test_the_rank_arm_orders_by_directional_strength():
    syms, rvol, st, side = _panel()
    picks = select_day(DAY, syms, rvol, st, side)[tcfg.ARM_RANK]
    d = [p.directional for p in picks if np.isfinite(p.directional)]
    assert d == sorted(d, reverse=True)
    assert d, "the fixture must produce rankable names"


def test_a_short_break_in_a_hard_downtrend_ranks_with_a_long_in_an_uptrend():
    """'In the direction of the orb' is the whole idea: sign the strength by the
    side, do not prefer uptrends."""
    syms = ["UP", "DOWN", "MID"]
    rvol = np.array([3.0, 2.0, 1.5])
    st = np.array([0.9, -0.9, 0.0])
    side = ["long", "short", "long"]
    picks = select_day(DAY, syms, rvol, st, side, k=2, pond_k=3)[tcfg.ARM_RANK]
    assert [p.symbol for p in picks] == ["UP", "DOWN"]
    assert picks[1].directional == pytest.approx(0.9)


def test_unrankable_names_fall_to_the_back_in_relative_volume_order():
    syms = ["A", "B", "C", "D"]
    rvol = np.array([9.0, 8.0, 7.0, 6.0])
    st = np.array([np.nan, 0.1, np.nan, 0.5])
    side = ["long", "long", "none", "long"]
    picks = select_day(DAY, syms, rvol, st, side, k=4, pond_k=4)[tcfg.ARM_RANK]
    assert [p.symbol for p in picks] == ["D", "B", "A", "C"]


def test_selection_does_not_depend_on_the_order_the_pool_is_handed_in():
    syms, rvol, st, side = _panel()
    a = select_day(DAY, syms, rvol, st, side)
    order = list(reversed(range(len(syms))))
    b = select_day(DAY, [syms[i] for i in order], rvol[order], st[order],
                   [side[i] for i in order])
    for arm in (tcfg.ARM_BASELINE, tcfg.ARM_RANK):
        assert _names(a[arm]) == _names(b[arm])


# ---------------------------------------------------------------------------
# the on-disk attack, and the direction the selector is allowed to read

SCHEMA = pa.schema([
    ("ts_ms", pa.int64()), ("day", pa.int32()), ("minute", pa.int16()),
    ("open", pa.float64()), ("high", pa.float64()), ("low", pa.float64()),
    ("close", pa.float64()), ("volume", pa.float64()),
])


def _write_tree(root, minutes) -> None:
    """The 09:30 bar carries the real open/close/volume; every later bar carries
    values a correct selector must never touch — a reversed candle and a
    thousand times the volume."""
    for k, sym in enumerate(SYMS[:12]):
        rows = {c: [] for c in SCHEMA.names}
        for i, d in enumerate(DAYS):
            for m in minutes:
                first = m == OPEN_MINUTE
                px = 10.0 + k
                up = (k + i) % 2 == 0
                o = px if first else px + 5.0
                c = (px + 1.0 if up else px - 1.0) if first else px - 5.0
                rows["ts_ms"].append(int(d) * 10_000 + m)
                rows["day"].append(int(d))
                rows["minute"].append(int(m))
                rows["open"].append(o)
                rows["high"].append(max(o, c) + 1.0)
                rows["low"].append(min(o, c) - 1.0)
                rows["close"].append(c)
                v = 1_000.0 * (k + 1) * (1.0 + 0.5 * ((i * 7 + k) % 11))
                rows["volume"].append(v if first else v * 1000.0)
        d = root / sym
        d.mkdir(parents=True, exist_ok=True)
        pq.write_table(pa.table({f.name: pa.array(rows[f.name], type=f.type)
                                 for f in SCHEMA}, schema=SCHEMA),
                       d / "all.parquet")


def _run(store, side, day):
    pool = SYMS[:12]
    syms, rvol, st, sd = [], [], [], []
    for i, s in enumerate(pool):
        r = store.rvol(s, day)
        if r is None:
            continue
        syms.append(s)
        rvol.append(r)
        st.append(((i % 7) - 3) / 4.0)
        sd.append(side.get((s, day), "none"))
    return select_day(day, syms, np.array(rvol), np.array(st), sd,
                      k=4, pond_k=8)


def test_the_selection_is_identical_when_the_rest_of_the_session_is_deleted(tmp_path):
    full, trimmed = tmp_path / "full", tmp_path / "trimmed"
    _write_tree(full, minutes=list(range(OPEN_MINUTE, OPEN_MINUTE + 60, 5)))
    _write_tree(trimmed, minutes=[OPEN_MINUTE])
    sa, da = load_open_panel(str(full / "*" / "*.parquet"))
    sb, db = load_open_panel(str(trimmed / "*" / "*.parquet"))
    for day in (DAYS[20], DAYS[40], DAYS[59]):
        a, b = _run(sa, da, day), _run(sb, db, day)
        for arm in (tcfg.ARM_BASELINE, tcfg.ARM_RANK):
            assert _names(a[arm]) == _names(b[arm])
            assert _names(a[arm]) != []


def test_the_direction_comes_from_the_opening_bar_and_not_from_later_ones(tmp_path):
    """The later bars in the fixture are deliberately bearish for every name. If
    the direction were read off them every side would be 'short'."""
    full = tmp_path / "full"
    _write_tree(full, minutes=list(range(OPEN_MINUTE, OPEN_MINUTE + 60, 5)))
    _, side = load_open_panel(str(full / "*" / "*.parquet"))
    got = {side[(s, DAYS[20])] for s in SYMS[:12] if (s, DAYS[20]) in side}
    assert got == {"long", "short"}


# ---------------------------------------------------------------------------
# the cheat, which the attacks above must catch


def test_the_detector_catches_a_selector_that_ranks_on_the_afternoon(tmp_path):
    """A selector keyed on the LAST bar of the morning instead of the first sees
    a different tape once the session is trimmed, and the attack must bite."""
    full, trimmed = tmp_path / "full", tmp_path / "trimmed"
    _write_tree(full, minutes=list(range(OPEN_MINUTE, OPEN_MINUTE + 60, 5)))
    _write_tree(trimmed, minutes=[OPEN_MINUTE])

    def cheat(root):
        import duckdb
        con = duckdb.connect()
        t = con.execute(f"""
          SELECT regexp_extract(filename, '([^/]+)/[^/]+\\.parquet$', 1) AS symbol,
                 day, max(minute) AS m, sum(volume) AS v
          FROM read_parquet('{root}/*/*.parquet', filename=true)
          WHERE day = {DAYS[40]} GROUP BY 1, 2 ORDER BY v DESC
        """).arrow()
        con.close()
        if hasattr(t, "read_all"):
            t = t.read_all()
        return list(zip(t.column("symbol").to_pylist(),
                        t.column("v").to_pylist()))

    assert cheat(full) != cheat(trimmed), "the on-disk attack failed to bite"
