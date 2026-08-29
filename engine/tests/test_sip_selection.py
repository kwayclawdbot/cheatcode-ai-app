"""The selection is the highest-risk code in ENGINE-6, so it is attacked here.

Three attacks, the same shape as `tests/test_no_lookahead.py`:

* **poisoned future** — every value the selector is not allowed to see is
  replaced with nonsense. The answer must not move.
* **amputated future** — those values do not exist at all. The answer must not
  move, and must equal the poisoned run.
* **the attack this lane needs** — the selection day's own session after 09:35
  is deleted from the parquet on disk, and `load_open_store` -> `select_day`
  must return a byte-identical selection.

Plus a deliberately cheating selector, run through the identical harness, which
every attack must catch. A test that cannot fail proves nothing.
"""

from __future__ import annotations

import numpy as np
import pyarrow as pa
import pyarrow.parquet as pq
import pytest

from engine.sip.selection import OPEN_MINUTE, OpenStore, select_day
from engine.sip.store import load_open_store

RNG = np.random.default_rng(20260829)
SYMS = [f"S{i:02d}" for i in range(40)]
DAYS = [20200101 + i for i in range(60)]      # synthetic, contiguity irrelevant


def _panel() -> dict[str, dict[str, np.ndarray]]:
    """A synthetic panel: every symbol trades every day, volumes vary wildly."""
    out = {}
    for k, s in enumerate(SYMS):
        base = 10_000.0 * (k + 1)
        v = base * (0.5 + RNG.random(len(DAYS)) * 3.0)
        v[k % len(DAYS)] *= 12.0                # a spike somewhere for each name
        out[s] = {"day": np.array(DAYS, dtype="int64"), "vol": v}
    return out


def _store(panel) -> OpenStore:
    return OpenStore({s: p["day"] for s, p in panel.items()},
                     {s: p["vol"] for s, p in panel.items()})


def _poison(panel, day: int):
    """Replace everything strictly after `day` with nonsense."""
    out = {}
    for s, p in panel.items():
        v = p["vol"].copy()
        v[p["day"] > day] = -1e18
        out[s] = {"day": p["day"], "vol": v}
    return out


def _amputate(panel, day: int):
    """`day` and everything before it, and nothing else, exists."""
    out = {}
    for s, p in panel.items():
        keep = p["day"] <= day
        out[s] = {"day": p["day"][keep], "vol": p["vol"][keep]}
    return out


def _names(picks):
    return [(p.symbol, round(p.rvol, 12)) for p in picks]


# --- the honest selector -----------------------------------------------------

def test_selection_is_deterministic_and_ranked():
    panel = _panel()
    store = _store(panel)
    day = DAYS[40]
    picks = select_day(day, SYMS, store)
    assert picks, "the synthetic panel must produce picks"
    assert len(picks) <= 20
    assert [p.rank for p in picks] == list(range(1, len(picks) + 1))
    assert all(picks[i].rvol >= picks[i + 1].rvol for i in range(len(picks) - 1))
    assert picks == select_day(day, SYMS, store)
    assert picks == select_day(day, list(reversed(SYMS)), store), \
        "selection must not depend on the order the pool is handed in"


def test_rvol_excludes_the_day_from_its_own_baseline():
    panel = _panel()
    store = _store(panel)
    day = DAYS[30]
    s = SYMS[3]
    j = int(np.flatnonzero(panel[s]["day"] == day)[0])
    expect = panel[s]["vol"][j] / panel[s]["vol"][j - 14:j].mean()
    assert store.rvol(s, day) == pytest.approx(expect)


@pytest.mark.parametrize("day", [DAYS[20], DAYS[35], DAYS[59]])
def test_selection_survives_a_poisoned_future(day):
    panel = _panel()
    clean = select_day(day, SYMS, _store(panel))
    poisoned = select_day(day, SYMS, _store(_poison(panel, day)))
    assert _names(clean) == _names(poisoned)


@pytest.mark.parametrize("day", [DAYS[20], DAYS[35], DAYS[59]])
def test_selection_survives_an_amputated_future(day):
    panel = _panel()
    clean = select_day(day, SYMS, _store(panel))
    cut = select_day(day, SYMS, _store(_amputate(panel, day)))
    assert _names(clean) == _names(cut)


# --- the cheat, which every attack above must catch --------------------------

class _CheatingStore(OpenStore):
    """Ranks on TOMORROW's opening volume. Nothing else differs."""

    def rvol(self, symbol, day, n=14):
        d = self._days.get(symbol)
        if d is None:
            return None
        j = int(np.searchsorted(d, day, side="left"))
        if j >= len(d) or int(d[j]) != int(day) or j + 1 >= len(d) or j < n:
            return None
        b = float(np.mean(self._vol[symbol][j - n:j]))
        return float(self._vol[symbol][j + 1]) / b if b > 0 else None


def _cheat(panel) -> _CheatingStore:
    return _CheatingStore({s: p["day"] for s, p in panel.items()},
                          {s: p["vol"] for s, p in panel.items()})


def test_the_detector_catches_a_cheating_selector():
    panel = _panel()
    day = DAYS[35]
    clean = select_day(day, SYMS, _cheat(panel))
    poisoned = select_day(day, SYMS, _cheat(_poison(panel, day)))
    cut = select_day(day, SYMS, _cheat(_amputate(panel, day)))
    assert _names(clean) != _names(poisoned), "poisoned-future attack failed to bite"
    assert _names(clean) != _names(cut), "amputated-future attack failed to bite"


# --- the on-disk attack: delete the rest of the session -----------------------

SCHEMA = pa.schema([
    ("ts_ms", pa.int64()), ("day", pa.int32()), ("minute", pa.int16()),
    ("open", pa.float64()), ("high", pa.float64()), ("low", pa.float64()),
    ("close", pa.float64()), ("volume", pa.float64()),
])


def _write_tree(root, panel, minutes) -> None:
    """One parquet per symbol holding `minutes` of each session."""
    for k, (sym, p) in enumerate(panel.items()):
        rows = {c: [] for c in SCHEMA.names}
        for i, d in enumerate(p["day"]):
            for m in minutes:
                rows["ts_ms"].append(int(d) * 10_000 + m)
                rows["day"].append(int(d))
                rows["minute"].append(int(m))
                px = 10.0 + k
                rows["open"].append(px)
                rows["high"].append(px + 1.0)
                rows["low"].append(px - 1.0)
                rows["close"].append(px)
                # the 09:30 bar carries the real volume; later bars carry noise
                # that a correct selector must never touch
                rows["volume"].append(float(p["vol"][i]) if m == OPEN_MINUTE
                                      else float(p["vol"][i]) * 1000.0)
        d = root / sym
        d.mkdir(parents=True, exist_ok=True)
        table = pa.table({f.name: pa.array(rows[f.name], type=f.type) for f in SCHEMA},
                         schema=SCHEMA)
        pq.write_table(table, d / "all.parquet")


def test_selection_is_identical_when_the_rest_of_the_session_is_deleted(tmp_path):
    panel = {s: _panel()[s] for s in SYMS[:12]}
    full = tmp_path / "full"
    trimmed = tmp_path / "trimmed"
    _write_tree(full, panel, minutes=list(range(OPEN_MINUTE, OPEN_MINUTE + 60, 5)))
    _write_tree(trimmed, panel, minutes=[OPEN_MINUTE])

    a = load_open_store(str(full / "*" / "*.parquet"))
    b = load_open_store(str(trimmed / "*" / "*.parquet"))
    pool = list(panel)
    for day in (DAYS[20], DAYS[40], DAYS[59]):
        assert _names(select_day(day, pool, a)) == _names(select_day(day, pool, b))
        assert _names(select_day(day, pool, a)) != []
