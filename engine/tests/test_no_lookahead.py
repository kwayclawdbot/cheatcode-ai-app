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

from engine.primitives import htf as hf
from engine.primitives import imbalance as im
from engine.primitives import levels as lv
from engine.primitives import liquidity as lq
from engine.primitives import session as ses
from engine.primitives import structure as st
from engine.primitives import timeframe as tf
from engine.primitives import trend as tr
from engine.series import BarSeries
from engine.tests.fixtures import make, make_multiday

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


def _resample_signature(v):
    """resample returns a BarSeries; compare it field by field."""
    r = tf.resample(v, 5)
    return [list(map(float, r.open)), list(map(float, r.high)),
            list(map(float, r.low)), list(map(float, r.close)),
            list(map(float, r.volume)), list(map(int, r.day)),
            list(map(int, r.minute)), list(map(int, r.ts_ms))]


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
    # ENGINE-2. `levels.major_levels` is the highest-risk function in the repo
    # for accidental lookahead: "the recent major level" is trivially easy to
    # compute with bars that have not printed. It is attacked here on the
    # single-day tape and again below on a three-day one.
    ("timeframe.resample", _resample_signature),
    ("session.overnight_range", ses.overnight_range),
    ("htf.daily_structure", lambda v: hf.daily_structure(v, 2, 60)),
    ("levels.reference_levels", lv.reference_levels),
    ("levels.pivot_levels", lambda v: lv.pivot_levels(v, 3, 120, 10.0, 2)),
    ("levels.major_levels", lambda v: lv.major_levels(v, None, 5, 3, 120)),
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


# ---------------------------------------------------------------------------
# A level finder that only ever sees one day cannot demonstrate much. This tape
# is three sessions long, with premarket and post-market bars, so prior-day and
# overnight levels are live and there is a genuine future to poison.

def build_multiday_tape(seed: int = 5150) -> BarSeries:
    rng = np.random.default_rng(seed)
    days, out = [20240102, 20240103, 20240104], {}
    px = 100.0
    for d in days:
        bars = []
        for minute in list(range(240, 570, 3)) + list(range(570, 960, 2)) + list(range(960, 1200, 6)):
            o = px
            c = max(1.0, o + rng.normal(0, 0.12))
            bars.append((minute, o, max(o, c) + abs(rng.normal(0, 0.06)),
                         min(o, c) - abs(rng.normal(0, 0.06)), c,
                         float(rng.integers(500, 20_000))))
            px = c
        out[d] = bars
    return make_multiday(out)


MULTIDAY_PRIMITIVES = [
    ("levels.major_levels/multiday", lambda v: lv.major_levels(v, None, 5, 3, 300)),
    ("levels.reference_levels/multiday", lv.reference_levels),
    ("session.overnight_range/multiday", ses.overnight_range),
    ("session.premarket_range/multiday", ses.premarket_range),
    ("timeframe.resample/multiday", _resample_signature),
]


@pytest.mark.parametrize("name,fn", MULTIDAY_PRIMITIVES,
                         ids=[p[0] for p in MULTIDAY_PRIMITIVES])
@pytest.mark.parametrize("frac", [0.45, 0.72, 0.9])
def test_multiday_primitive_cannot_see_the_future(name, fn, frac):
    s = build_multiday_tape()
    i = int(len(s) * frac)
    baseline = _norm(fn(s.view(i)))
    assert baseline == _norm(fn(poison(s, i).view(i))), \
        f"{name} changed when only bars after {i} changed"
    assert baseline == _norm(fn(s.subrange(0, i + 1).view(i))), \
        f"{name} changed when bars after {i} did not exist"


def test_the_multiday_detector_also_detects():
    s = build_multiday_tape()
    i = int(len(s) * 0.72)
    assert _cheating_primitive(s, i) != _cheating_primitive(poison(s, i), i)


def test_major_levels_are_not_empty_on_the_multiday_tape():
    """A lookahead test on a function that returns nothing proves nothing."""
    s = build_multiday_tape()
    got = lv.major_levels(s.view(int(len(s) * 0.72)), None, 5, 3, 300)
    assert len(got) >= 5
    assert any(x.label in ("PDH", "PDL", "ONH", "ONL", "PMH", "PML") for x in got)
    assert any(x.label in ("PH", "PL") for x in got)
