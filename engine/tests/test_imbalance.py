"""Hand-checked fair value gaps.

idx :     0      1      2      3      4
high:  10.0   12.0   13.0   12.5   11.0
low :   9.0   10.0   11.0   10.5    9.5

A bullish FVG at bar k needs low[k] > high[k-2].
  k=2: low 11.0 > high[0] 10.0  -> GAP top 11.0, bottom 10.0, size 1.0
  k=3: low 10.5 > high[1] 12.0? no.   bear: high 12.5 < low[1] 10.0? no.
  k=4: low  9.5 > high[2] 13.0? no.   bear: high 11.0 < low[2] 11.0? no (strict).

Fill state, evaluated only over bars AFTER the confirming bar:
  bar 3 low 10.5 -> inside (<= 11.0) but not through (> 10.0) -> touched
  bar 4 low  9.5 -> through 10.0                              -> filled at 4
"""

from engine.primitives.imbalance import fair_value_gaps, order_blocks
from engine.tests.fixtures import make

TAPE = make([
    (570, 9.5, 10.0, 9.0, 9.8, 100.0),
    (571, 9.8, 12.0, 10.0, 11.5, 100.0),
    (572, 11.5, 13.0, 11.0, 12.8, 100.0),
    (573, 12.8, 12.5, 10.5, 11.0, 100.0),
    (574, 11.0, 11.0, 9.5, 9.8, 100.0),
])


def test_gap_appears_only_on_its_third_bar():
    assert fair_value_gaps(TAPE.view(1), lookback=10) == []
    gaps = fair_value_gaps(TAPE.view(2), lookback=10)
    assert len(gaps) == 1
    g = gaps[0]
    assert (g.idx, g.top, g.bottom, g.direction) == (2, 11.0, 10.0, "bull")
    assert g.size == 1.0
    assert g.touched is False and g.filled is False


def test_touched_but_not_filled():
    g = fair_value_gaps(TAPE.view(3), lookback=10)[0]
    assert g.touched is True and g.filled is False and g.fill_idx == -1


def test_filled_gaps_drop_out_unless_asked_for():
    assert fair_value_gaps(TAPE.view(4), lookback=10) == []
    g = fair_value_gaps(TAPE.view(4), lookback=10, include_filled=True)[0]
    assert g.filled is True and g.fill_idx == 4


def test_min_size_filters():
    assert fair_value_gaps(TAPE.view(2), lookback=10, min_size=1.5) == []
    assert len(fair_value_gaps(TAPE.view(2), lookback=10, min_size=0.5)) == 1


def test_order_block_is_the_last_opposite_candle_before_displacement():
    """22 quiet bars of range 1.0, then a down candle, then a +6 body: the
    order block is the down candle at index 22."""
    bars = [(570 + k, 100.0, 100.5, 99.5, 100.0, 10.0) for k in range(22)]
    bars.append((592, 100.0, 100.2, 99.0, 99.2, 10.0))   # idx 22, down candle
    bars.append((593, 99.2, 106.0, 99.2, 105.5, 10.0))   # idx 23, displacement
    obs = order_blocks(make(bars).view(23), lookback=30, disp_mult=1.5, avg_window=20)
    assert len(obs) == 1
    ob = obs[0]
    assert (ob.idx, ob.direction) == (22, "bull")
    assert (ob.top, ob.bottom) == (100.2, 99.0)
    assert ob.mitigated is False and ob.broken is False
