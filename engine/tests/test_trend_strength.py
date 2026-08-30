"""Trend strength, and the two ways it could be wrong.

A strength measure that can see the day it is ranking is not a measure, it is a
result. And a fast path that quietly disagrees with the definition it claims to
implement is the same bug wearing a performance excuse. Both are attacked here:

1. **Poisoned future** — every bar after the as-of bar is replaced with nonsense.
   The number must not move.
2. **Amputated future** — those bars do not exist at all. Same number, and it
   must equal the poisoned run.
3. **The fast path is the definition** — `strength_series` must agree with
   `strength_at` to 1e-12 at every index of a random tape.
4. **The detector works** — a deliberately cheating implementation is run through
   the same comparisons and must be caught. A test that cannot fail proves
   nothing.
"""

from __future__ import annotations

import numpy as np
import pytest

from engine.primitives.structure import atr as atr_view
from engine.primitives.trend import ema as ema_view
from engine.series import BarSeries
from engine.strength import measure as ms

SYM = "STR"
RNG = np.random.default_rng(20260829)


def _daily(n: int = 160, seed: int = 20260829, drift: float = 0.0015) -> BarSeries:
    """A synthetic daily tape long enough to arm every component.

    Moves are multiplicative so that a long downtrend stays a downtrend instead
    of flattening out against a price floor."""
    rng = np.random.default_rng(seed)
    px = 100.0
    o, h, l, c = [], [], [], []
    for _ in range(n):
        a = px
        b = a * (1.0 + rng.normal(drift, 0.012))
        o.append(a)
        c.append(b)
        h.append(max(a, b) * (1.0 + abs(rng.normal(0, 0.005))))
        l.append(min(a, b) * (1.0 - abs(rng.normal(0, 0.005))))
        px = b
    days = np.arange(20210104, 20210104 + n, dtype="int32")
    return BarSeries(SYM, "day", np.arange(1, n + 1, dtype="int64") * 86_400_000,
                     np.array(o), np.array(h), np.array(l), np.array(c),
                     np.full(n, 1e6), days, np.zeros(n, dtype="int32"))


def _poison(s: BarSeries, i: int) -> BarSeries:
    o, h, l, c, v = (np.array(x) for x in (s.open, s.high, s.low, s.close, s.volume))
    for a in (o, h, l, c):
        a[i + 1:] = a[i + 1:] * 1000.0 + 12345.0
    v[i + 1:] = v[i + 1:] * 1e6
    return BarSeries(s.symbol, s.timeframe, np.array(s.ts_ms), o, h, l, c, v,
                     np.array(s.day), np.array(s.minute))


def _sig(st: ms.Strength | None):
    if st is None:
        return None
    return (round(st.strength, 12), round(st.distance, 12),
            round(st.slope, 12), round(st.persistence, 12))


# ---------------------------------------------------------------------------
# the definition


def test_the_components_are_the_primitives_this_codebase_already_had():
    """Not a novel indicator. Each part is recomputed here from the primitive it
    claims to use, and the total must match."""
    s = _daily()
    k = 120
    v = s.view(k)
    a = atr_view(v, ms.ATR_PERIOD)
    e = ema_view(np.asarray(v.close), ms.EMA_PERIOD)
    e_prev = ema_view(np.asarray(v.close)[:-ms.SLOPE_DAYS], ms.EMA_PERIOD)
    d = max(-3.0, min(3.0, (float(v.close[-1]) - e) / a)) / 3.0
    sl = max(-3.0, min(3.0, (e - e_prev) / a)) / 3.0
    c = np.asarray(v.close)
    p = 2.0 * float(np.mean(c[-20:] > c[-21:-1])) - 1.0

    got = ms.strength_at(v)
    assert got is not None
    assert got.distance == pytest.approx(d, abs=1e-12)
    assert got.slope == pytest.approx(sl, abs=1e-12)
    assert got.persistence == pytest.approx(p, abs=1e-12)
    assert got.strength == pytest.approx((d + sl + p) / 3.0, abs=1e-12)


def test_the_number_is_bounded_and_signed():
    s = _daily(n=400)
    vals = [ms.strength_at(s.view(k)).strength
            for k in range(ms.MIN_INDEX, len(s))]
    assert all(-1.0 <= v <= 1.0 for v in vals)
    up = _daily(n=200, drift=0.012)
    down = _daily(n=200, drift=-0.012)
    assert ms.strength_at(up.view(199)).strength > 0.4
    assert ms.strength_at(down.view(199)).strength < -0.4


def test_directional_flips_with_the_side():
    st = ms.strength_at(_daily().view(120))
    assert st.directional("long") == pytest.approx(-st.directional("short"))
    assert st.directional("long") == pytest.approx(st.strength)


def test_too_little_history_is_none_not_a_zero():
    s = _daily(n=200)
    assert ms.strength_at(s.view(ms.MIN_INDEX - 1)) is None
    assert ms.strength_at(s.view(ms.MIN_INDEX)) is not None


def test_a_flat_tape_has_no_atr_and_therefore_no_strength():
    n = 60
    flat = np.full(n, 50.0)
    s = BarSeries(SYM, "day", np.arange(1, n + 1, dtype="int64") * 86_400_000,
                  flat.copy(), flat.copy(), flat.copy(), flat.copy(),
                  np.full(n, 1e6), np.arange(20210104, 20210104 + n, dtype="int32"),
                  np.zeros(n, dtype="int32"))
    assert ms.strength_at(s.view(n - 1)) is None


# ---------------------------------------------------------------------------
# the two attacks


@pytest.mark.parametrize("k", [40, 80, 120, 159])
def test_poisoning_the_future_cannot_change_the_number(k: int):
    s = _daily()
    before = _sig(ms.strength_at(s.view(k)))
    after = _sig(ms.strength_at(_poison(s, k).view(k)))
    assert before is not None and before == after


@pytest.mark.parametrize("k", [40, 80, 120, 159])
def test_amputating_the_future_cannot_change_the_number(k: int):
    s = _daily()
    full = _sig(ms.strength_at(s.view(k)))
    cut = _sig(ms.strength_at(s.subrange(0, k + 1).view(k)))
    assert full is not None and full == cut


def _cheat(view, series: BarSeries, k: int):
    """A deliberately cheating measure: it peeks one bar ahead."""
    if k + 1 >= len(series):
        return None
    nxt = float(series.close[k + 1]) - float(series.close[k])
    st = ms.strength_at(view)
    if st is None:
        return None
    return ms.Strength(st.strength + np.sign(nxt) * 0.5, st.distance, st.slope,
                       st.persistence, st.clipped)


def test_the_attack_catches_a_cheat():
    """The detector self-test. Without this the tests above prove nothing."""
    s = _daily()
    k = 120
    honest = _sig(_cheat(s.view(k), s, k))
    poisoned = _poison(s, k)
    cheating = _sig(_cheat(poisoned.view(k), poisoned, k))
    assert honest != cheating


# ---------------------------------------------------------------------------
# the fast path is not a second definition


def test_the_vectorised_pass_equals_the_definition_at_every_index():
    s = _daily(n=300)
    fast = ms.strength_series(s.high, s.low, s.close)
    for k in range(len(s)):
        ref = ms.strength_at(s.view(k))
        if ref is None:
            assert not np.isfinite(fast["strength"][k])
            continue
        assert fast["strength"][k] == pytest.approx(ref.strength, abs=1e-12)
        assert fast["distance"][k] == pytest.approx(ref.distance, abs=1e-12)
        assert fast["slope"][k] == pytest.approx(ref.slope, abs=1e-12)
        assert fast["persistence"][k] == pytest.approx(ref.persistence, abs=1e-12)
        assert bool(fast["clipped"][k]) == ref.clipped


def test_the_equality_test_would_catch_a_broken_fast_path():
    s = _daily(n=120)
    fast = ms.strength_series(s.high, s.low, s.close)
    broken = fast["strength"].copy()
    broken[ms.MIN_INDEX] += 1e-6
    ref = ms.strength_at(s.view(ms.MIN_INDEX))
    assert broken[ms.MIN_INDEX] != pytest.approx(ref.strength, abs=1e-12)


def test_the_running_ema_is_the_primitive_called_once_per_bar():
    v = np.asarray(_daily(n=120).close)
    running = ms.ema_series(v, ms.EMA_PERIOD)
    for k in range(ms.EMA_PERIOD - 1, len(v)):
        assert running[k] == pytest.approx(ema_view(v[:k + 1], ms.EMA_PERIOD),
                                           abs=1e-12)
    assert not np.isfinite(running[ms.EMA_PERIOD - 2])


def test_the_running_atr_is_the_primitive_called_once_per_bar():
    s = _daily(n=120)
    running = ms.atr_series(s.high, s.low, s.close, ms.ATR_PERIOD)
    for k in range(ms.ATR_PERIOD, len(s)):
        assert running[k] == pytest.approx(atr_view(s.view(k), ms.ATR_PERIOD),
                                           abs=1e-12)
