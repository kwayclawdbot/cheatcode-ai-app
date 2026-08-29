"""Hand-checked trend and participation."""

import math

from engine.primitives.trend import (ema, pct_change, relative_strength,
                                     trend_state, volume_regime)
from engine.tests.fixtures import make
import numpy as np


def test_ema_seeds_on_the_sma():
    """period 3 over [1,2,3,4]: seed = mean(1,2,3) = 2, k = 0.5,
    then e = 4*0.5 + 2*0.5 = 3.0"""
    assert ema(np.array([1.0, 2.0, 3.0, 4.0]), 3) == 3.0
    assert math.isnan(ema(np.array([1.0, 2.0]), 3))


def test_trend_state_up_down_range():
    up = make([(570 + k, 100 + k, 100 + k, 100 + k, 100.0 + k, 10.0) for k in range(120)])
    assert trend_state(up.view(119)) == "up"
    down = make([(570 + k, 300 - k, 300 - k, 300 - k, 300.0 - k, 10.0) for k in range(120)])
    assert trend_state(down.view(119)) == "down"
    flat = make([(570 + k, 100.0, 100.0, 100.0, 100.0, 10.0) for k in range(120)])
    assert trend_state(flat.view(119)) == "range"


def test_volume_regime():
    """Baseline median 100 over the lookback window, then five bars of 20
    (ratio 0.2 -> dryup) or 400 (ratio 4.0 -> expansion)."""
    def tape(tail_v):
        bars = [(570 + k, 100.0, 100.0, 100.0, 100.0, 100.0) for k in range(40)]
        bars += [(610 + k, 100.0, 100.0, 100.0, 100.0, tail_v) for k in range(5)]
        return make(bars).view(44)
    assert volume_regime(tape(20.0)) == "dryup"
    assert volume_regime(tape(400.0)) == "expansion"
    assert volume_regime(tape(110.0)) == "normal"


def test_pct_change_and_relative_strength():
    a = make([(570 + k, 100.0, 100.0, 100.0, 100.0 + k, 10.0) for k in range(20)])
    b = make([(570 + k, 100.0, 100.0, 100.0, 100.0 + k / 2, 10.0) for k in range(20)],
             symbol="BENCH")
    # a: 100 -> 119 over 19 bars = +19%;  b: 100 -> 109.5 = +9.5%
    assert abs(pct_change(a.view(19), 19) - 0.19) < 1e-12
    assert abs(relative_strength(a.view(19), b.view(19), 19) - 0.095) < 1e-12
