"""The test this whole phase is built around.

Three independent attacks on every primitive:

1. **Poisoned future.** Take a tape, compute the primitive as of bar i. Replace
   every bar after i with nonsense — prices x1000, volume x1e6 — and compute
   again. Any primitive whose answer moves has read a bar it was not allowed to
   see.

2. **Amputated future.** Build a genuinely separate series containing only bars
   0..i and compute as of its last bar. Same answer required. This catches
   reach-through that poisoning might survive (e.g. a primitive keyed on array
   length rather than value).

3. **Detector self-test.** A deliberately cheating function is run through the
   same comparison and MUST be caught. A test that cannot fail proves nothing.
"""

from __future__ import annotations

import numpy as np
import pytest

from engine.primitives import imbalance as im
from engine.primitives import liquidity as lq
from engine.primitives import session as ses
from engine.primitives import structure as st
from engine.primitives import trend as tr
from engine.series import BarSeries
from engine.tests.fixtures import make

def _random_day(day: int, n: int = 200, base: float = 100.0, seed: int = 20260829) -> list[tuple]:
    """A tape with enough movement to arm every primitive. Seeded, so a
    failure is reproducible."""
    rng = np.random.default_rng(seed)
    bars = []
    px = base
    for k in range(n):
        drift = rng.normal(0, 0.25)
        o = px
        c = max(1.0, o + drift)
        h = max(o, c) + abs(rng.normal(0, 0.12))
        l = min(o, c) - abs(rng.normal(0, 0.12))
        v = float(rng.integers(1_000, 50_000))
        bars.append((240 + k * 2, o, h, l, c, v))
        px = c
    return bars


def build_tape(n: int = 200, seed: int = 20260829) -> BarSeries:
    return make(_random_day(20240102, n, seed=seed), day=20240102)


def poison(s: BarSeries, i: int) -> BarSeries:
    """Same length, same history up to i, deranged future."""
    o, h, l, c, v = (np.array(x) for x in (s.open, s.high, s.low, s.close, s.volume))
    for a in (o, h, l, c):
        a[i + 1:] = a[i + 1:] * 1000.0 + 12345.0
    v[i + 1:] = v[i + 1:] * 1_000_000.0
    return BarSeries(s.symbol, s.timeframe, np.array(s.ts_ms), o, h, l, c, v,
                     np.array(s.day), np.array(s.minute))


# ---------------------------------------------------------------------------
# every primitive under test, as (name, callable taking a BarView)
PRIMITIVES = [
    ("session.current_session", ses.current_session),
    ("session.minutes_since_open", ses.minutes_since_open),
    ("session.premarket_range", ses.premarket_range),
    ("session.opening_range", lambda v: ses.opening_range(v, 15)),
    ("session.session_range", lambda v: ses.session_range(v, ses.PREMARKET)),
    ("structure.swing_points", lambda v: st.swing_points(v, 2, 2, 120)),
    ("structure.structure_state", lambda v: st.structure_state(v, 2, 2, 120)),
    ("structure.displacement", st.displacement),
    ("structure.atr", st.atr),
    ("liquidity.prior_day_levels", lq.prior_day_levels),
    ("liquidity.prior_week_levels", lq.prior_week_levels),
    ("liquidity.equal_levels", lambda v: lq.equal_levels(v, 5.0, 120)),
    ("liquidity.sweep_state", lambda v: lq.sweep_state(v, float(v.high[:v.n // 2].max()),
                                                       lq.BUYSIDE, 120)),
    ("imbalance.fair_value_gaps", lambda v: im.fair_value_gaps(v, 120)),
    ("imbalance.order_blocks", lambda v: im.order_blocks(v, 120)),
    ("imbalance.breaker_blocks", lambda v: im.breaker_blocks(v, lookback=120)),
    ("trend.trend_state", tr.trend_state),
    ("trend.volume_regime", tr.volume_regime),
    ("trend.pct_change", lambda v: tr.pct_change(v, 30)),
]

AS_OF = [60, 99, 140, 198]


def _norm(x):
    if isinstance(x, float):
        return "nan" if x != x else round(x, 10)
    if isinstance(x, (list, tuple)):
        return [_norm(y) for y in x]
    return x


@pytest.mark.parametrize("name,fn", PRIMITIVES, ids=[p[0] for p in PRIMITIVES])
@pytest.mark.parametrize("i", AS_OF)
def test_primitive_cannot_see_a_poisoned_future(name, fn, i):
    s = build_tape()
    baseline = _norm(fn(s.view(i)))
    poisoned = _norm(fn(poison(s, i).view(i)))
    assert baseline == poisoned, f"{name} changed when only bars after {i} changed"


@pytest.mark.parametrize("name,fn", PRIMITIVES, ids=[p[0] for p in PRIMITIVES])
@pytest.mark.parametrize("i", AS_OF)
def test_primitive_cannot_see_an_amputated_future(name, fn, i):
    s = build_tape()
    baseline = _norm(fn(s.view(i)))
    truncated = _norm(fn(s.subrange(0, i + 1).view(i)))
    assert baseline == truncated, f"{name} changed when bars after {i} did not exist"


# ---------------------------------------------------------------------------
def _cheating_primitive(series: BarSeries, i: int) -> float:
    """Reads bar i+1. This is exactly the bug the harness exists to catch."""
    return float(series.close[min(i + 1, len(series) - 1)])


def test_the_detector_actually_detects():
    """If this passes trivially, every test above is decoration."""
    s = build_tape()
    i = 99
    baseline = _cheating_primitive(s, i)
    poisoned = _cheating_primitive(poison(s, i), i)
    assert baseline != poisoned, "poisoning failed to move a function that reads ahead"

    amputated = _cheating_primitive(s.subrange(0, i + 1), i)
    assert baseline != amputated, "amputation failed to move a function that reads ahead"


def test_relative_strength_refuses_a_misaligned_benchmark():
    """A benchmark read one bar late is lookahead by proxy, so it raises rather
    than silently returning a number."""
    a = build_tape()
    b = build_tape(seed=7)
    with pytest.raises(ValueError):
        tr.relative_strength(a.view(100), b.view(101), 30)
