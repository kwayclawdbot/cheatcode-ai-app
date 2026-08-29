"""Hand-checked sweeps and levels.

Sweep tape, level = 100.0, buyside:

idx :     0      1      2      3
high:  99.0  101.0  100.5   99.5
low :  98.0   99.8  100.0   99.0
close: 98.5  100.8  100.2   99.2

  bar 1 is the first high above 100        -> swept, extreme 101.0 at idx 1
  closes after that: 100.8, 100.2, 99.2    -> first close back below 100 is idx 3
                                           -> reclaimed at idx 3
"""

from engine.primitives.liquidity import (BUYSIDE, SELLSIDE, equal_levels,
                                         prior_day_levels, sweep_state)
from engine.tests.fixtures import make, make_multiday

SWEEP = make([
    (570, 98.2, 99.0, 98.0, 98.5, 100.0),
    (571, 98.5, 101.0, 99.8, 100.8, 100.0),
    (572, 100.8, 100.5, 100.0, 100.2, 100.0),
    (573, 100.2, 99.5, 99.0, 99.2, 100.0),
])


def test_no_sweep_before_the_level_trades():
    s = sweep_state(SWEEP.view(0), 100.0, BUYSIDE, lookback=10)
    assert s.swept is False


def test_sweep_without_reclaim():
    s = sweep_state(SWEEP.view(2), 100.0, BUYSIDE, lookback=10)
    assert s.swept is True
    assert s.extreme == 101.0 and s.extreme_idx == 1
    assert s.reclaimed is False and s.reclaim_idx == -1


def test_sweep_with_reclaim():
    s = sweep_state(SWEEP.view(3), 100.0, BUYSIDE, lookback=10)
    assert s.swept is True and s.reclaimed is True
    assert s.reclaim_idx == 3
    assert s.extreme == 101.0


def test_sellside_sweep_mirrors():
    s = sweep_state(SWEEP.view(3), 99.9, SELLSIDE, lookback=10)
    # bar 0 low 98.0 is the first below 99.9; the lowest low after it is 98.0
    assert s.swept is True and s.extreme == 98.0 and s.extreme_idx == 0
    # first close back above 99.9 is bar 1 (100.8)
    assert s.reclaimed is True and s.reclaim_idx == 1


def test_prior_day_high_low_uses_rth_only():
    """Day 1 premarket prints 120 but RTH tops at 110; PDH must be 110."""
    tape = make_multiday({
        20240102: [
            (500, 119.0, 120.0, 118.0, 119.5, 10.0),   # premarket spike
            (570, 100.0, 110.0, 99.0, 105.0, 10.0),    # RTH
            (960, 105.0, 106.0, 95.0, 96.0, 10.0),     # 16:00 -> post
        ],
        20240103: [(570, 100.0, 101.0, 99.5, 100.5, 10.0)],
    })
    levels = {lv.label: lv.price for lv in prior_day_levels(tape.view(3))}
    assert levels == {"PDH": 110.0, "PDL": 99.0}


def test_equal_highs_cluster_within_tolerance():
    """Two confirmed swing highs at 100.00 and 100.02 (2 bps apart) pool; the
    level returned is the higher of the two, which is the price stops need."""
    bars = [
        (570, 99.0, 99.5, 98.5, 99.2, 10.0),
        (571, 99.2, 100.00, 99.0, 99.4, 10.0),   # swing high 100.00
        (572, 99.4, 99.6, 99.0, 99.1, 10.0),
        (573, 99.1, 100.02, 99.0, 99.3, 10.0),   # swing high 100.02
        (574, 99.3, 99.5, 99.0, 99.2, 10.0),
    ]
    got = equal_levels(make(bars).view(4), tolerance_bps=5.0, lookback=50, left=1, right=1)
    eqh = [lv for lv in got if lv.label == "EQH"]
    assert len(eqh) == 1
    assert abs(eqh[0].price - 100.02) < 1e-9
